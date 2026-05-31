/**
 * OAuth 2.0 PKCE Handler for Google APIs
 *
 * Implements the PKCE (Proof Key for Code Exchange) flow directly against
 * Google's OAuth 2.0 endpoints — no backend proxy required.
 *
 * Flow:
 *   1. initiateOAuth() generates a PKCE verifier + challenge, opens a popup
 *      to Google's authorize URL, and listens on a BroadcastChannel for the
 *      auth code from the callback page.
 *   2. handleCallback() exchanges the code for a token set by POSTing to
 *      https://oauth2.googleapis.com/token (no client secret).
 *   3. Token set is encrypted with an AES-GCM 256 key (Web Crypto API) and
 *      persisted in IndexedDB via `idb`.
 *   4. getAccessToken() transparently refreshes tokens that are within 5
 *      minutes of expiry using grant_type=refresh_token.
 *
 * SECURITY TRADEOFF (acknowledged):
 *   The AES-GCM key is generated on first use and stored as a raw exported
 *   key in localStorage under `gemini-for-macos:oauth-key`. Any script with
 *   DOM access on this origin could read both the key and the ciphertext,
 *   so this is NOT production-grade secret protection — it mainly guards
 *   against casual inspection of IndexedDB and resists naive token theft.
 *   This is acceptable for a single-user desktop tool. A hardened deployment
 *   would use an OS keychain or a backend-held token.
 */

import { openDB, type IDBPDatabase } from 'idb';

// ---------------------------------------------------------------------------
// Public types and constants
// ---------------------------------------------------------------------------

export const GOOGLE_DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_DRIVE_READ_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
export const GOOGLE_DOCS_SCOPE = 'https://www.googleapis.com/auth/documents';
export const GOOGLE_CALENDAR_READ_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
export const GOOGLE_GMAIL_READ_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const GOOGLE_BILLING_READ_SCOPE = 'https://www.googleapis.com/auth/cloud-billing.readonly';

export const GOOGLE_WORKSPACE_SCOPES = [
  GOOGLE_DRIVE_FILE_SCOPE,
  GOOGLE_DRIVE_READ_SCOPE,
  GOOGLE_DOCS_SCOPE,
  GOOGLE_CALENDAR_READ_SCOPE,
  GOOGLE_GMAIL_READ_SCOPE,
  GOOGLE_BILLING_READ_SCOPE,
] as const;

export const GOOGLE_WORKSPACE_MCP_SCOPES = [
  GOOGLE_DRIVE_READ_SCOPE,
  GOOGLE_DOCS_SCOPE,
  GOOGLE_CALENDAR_READ_SCOPE,
] as const;

/** Backward-compatible broad Google Workspace bundle. Prefer named bundles for new flows. */
export const OAUTH_SCOPES = GOOGLE_WORKSPACE_SCOPES;

export interface OAuthConfig {
  /** Google OAuth 2.0 Client ID (public). Never hardcoded — supplied by caller. */
  clientId: string;
  /** Redirect URI registered in the Google Cloud console, e.g. http://localhost:13000/oauth/callback */
  redirectUri: string;
  /** Scope bundle to request. Picker flows must pass only GOOGLE_DRIVE_FILE_SCOPE. */
  scopes: string[];
  /** Extra OAuth authorization URL params, e.g. trigger_onepick=true for Drive Picker. */
  extraAuthorizeParams?: Record<string, string>;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds at which the access token expires. */
  expiresAt: number;
  /** Space-delimited scopes the token was actually granted. */
  scope: string;
  /** Drive Picker file IDs returned by Google Picker desktop flow, if any. */
  pickedFileIds?: string[];
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const DB_NAME = 'gemini-for-macos-oauth';
const DB_VERSION = 1;
const STORE_NAME = 'tokens';
const LEGACY_TOKEN_KEY = 'current';
const TOKEN_KEY_PREFIX = 'scope:';

const LS_KEY_CRYPTO = 'gemini-for-macos:oauth-key';
const LS_KEY_PLAINTEXT_FALLBACK = 'gemini-for-macos:oauth-token';

const REFRESH_LEEWAY_MS = 5 * 60 * 1000; // refresh when < 5 minutes remain
const BROADCAST_CHANNEL_NAME = 'gemini-oauth';
const POPUP_NAME = 'oauth';
const POPUP_FEATURES = 'width=500,height=600';

const OAUTH_CODE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes for the user to complete the flow

export interface OAuthCallbackParams {
  code?: string;
  state?: string;
  error?: string;
  pickedFileIds: string[];
}

export function normalizeOAuthScopes(scopes: readonly string[]): string[] {
  return Array.from(new Set(scopes.map((scope) => scope.trim()).filter(Boolean))).sort();
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function oauthStorageKeyForScopes(scopes: readonly string[]): string {
  const normalized = normalizeOAuthScopes(scopes);
  if (normalized.length === 0) return LEGACY_TOKEN_KEY;
  return `${TOKEN_KEY_PREFIX}${fnv1a32(normalized.join('\n'))}`;
}

function plaintextFallbackKeyForScopes(scopes: readonly string[]): string {
  return `${LS_KEY_PLAINTEXT_FALLBACK}:${oauthStorageKeyForScopes(scopes)}`;
}

export function parseOAuthCallbackParams(url: string): OAuthCallbackParams {
  const parsed = new URL(url, typeof window !== 'undefined' ? window.location.href : 'http://localhost');
  const pickedRaw = parsed.searchParams.get('picked_file_ids') ?? '';
  const pickedFileIds = pickedRaw
    .split(',')
    .flatMap((part) => part.split(','))
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    code: parsed.searchParams.get('code') ?? undefined,
    state: parsed.searchParams.get('state') ?? undefined,
    error: parsed.searchParams.get('error') ?? undefined,
    pickedFileIds,
  };
}

export function describeOAuthError(error: string): string {
  switch (error) {
    case 'redirect_uri_mismatch':
      return 'redirect_uri_mismatch — the OAuth Client ID is not configured for this redirect URI.';
    case 'admin_policy_enforced':
      return 'admin_policy_enforced — a Google Workspace administrator blocked this OAuth scope.';
    case 'invalid_grant':
      return 'invalid_grant — the authorization code expired, was already used, or the refresh token was revoked.';
    case 'access_denied':
      return 'access_denied — Google authorization was cancelled or denied.';
    default:
      return error;
  }
}

export function buildOAuthAuthorizeUrl(options: OAuthConfig & { codeChallenge: string; state: string }): string {
  const authorizeUrl = new URL(GOOGLE_AUTH_URL);
  authorizeUrl.searchParams.set('client_id', options.clientId);
  authorizeUrl.searchParams.set('redirect_uri', options.redirectUri);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', normalizeOAuthScopes(options.scopes).join(' '));
  authorizeUrl.searchParams.set('code_challenge', options.codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('state', options.state);
  authorizeUrl.searchParams.set('access_type', 'offline');
  authorizeUrl.searchParams.set('prompt', 'consent');
  authorizeUrl.searchParams.set('include_granted_scopes', 'true');

  for (const [key, value] of Object.entries(options.extraAuthorizeParams ?? {})) {
    if (value.length > 0) authorizeUrl.searchParams.set(key, value);
  }

  return authorizeUrl.toString();
}

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateCodeVerifier(): string {
  // 32 random bytes -> ~43 base64url chars, within PKCE spec (43..128).
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

function generateState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

// ---------------------------------------------------------------------------
// Crypto helpers (AES-GCM wrapping for the stored TokenSet)
// ---------------------------------------------------------------------------

function hasWebCrypto(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
}

async function getOrCreateEncryptionKey(): Promise<CryptoKey | null> {
  if (!hasWebCrypto()) {
    return null;
  }

  try {
    const existing = localStorage.getItem(LS_KEY_CRYPTO);
    if (existing) {
      const raw = Uint8Array.from(atob(existing), (c) => c.charCodeAt(0));
      return await crypto.subtle.importKey(
        'raw',
        raw,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      );
    }

    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
    const rawBuffer = await crypto.subtle.exportKey('raw', key);
    const rawBytes = new Uint8Array(rawBuffer);
    let binary = '';
    for (let i = 0; i < rawBytes.length; i++) {
      binary += String.fromCharCode(rawBytes[i]);
    }
    localStorage.setItem(LS_KEY_CRYPTO, btoa(binary));
    return key;
  } catch (error) {
    console.warn('OAuth: unable to initialise Web Crypto key, falling back to plaintext storage', error);
    return null;
  }
}

interface EncryptedBlob {
  iv: string; // base64url
  ct: string; // base64url
}

async function encryptTokenSet(key: CryptoKey, tokens: TokenSet): Promise<EncryptedBlob> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const plaintext = new TextEncoder().encode(JSON.stringify(tokens));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    iv: base64UrlEncode(iv),
    ct: base64UrlEncode(new Uint8Array(ciphertext)),
  };
}

function base64UrlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function decryptTokenSet(key: CryptoKey, blob: EncryptedBlob): Promise<TokenSet> {
  const iv = base64UrlDecode(blob.iv);
  const ct = base64UrlDecode(blob.ct);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(plaintext)) as TokenSet;
}

// ---------------------------------------------------------------------------
// IndexedDB layer
// ---------------------------------------------------------------------------

let dbPromise: Promise<IDBPDatabase> | null = null;

// Timeout constant for IndexedDB operations (5 seconds)
const IDB_TIMEOUT_MS = 5000;

// Utility to wrap a promise with a timeout
function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string
): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(message)), timeoutMs)
        ),
    ]);
}

function getDb(): Promise<IDBPDatabase> {
    if (!dbPromise) {
        dbPromise = withTimeout(
            openDB(DB_NAME, DB_VERSION, {
                upgrade(db) {
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME);
                    }
                },
            }),
            IDB_TIMEOUT_MS,
            `IndexedDB did not respond within ${IDB_TIMEOUT_MS}ms; IndexedDB may be blocked by browser policy`
        );
    }
    return dbPromise;
}

async function persistTokenSet(tokens: TokenSet, scopes: readonly string[]): Promise<void> {
  const tokenKey = oauthStorageKeyForScopes(scopes);
  const plaintextKey = plaintextFallbackKeyForScopes(scopes);
  const key = await getOrCreateEncryptionKey();
  if (key) {
    try {
      const blob = await encryptTokenSet(key, tokens);
      const db = await getDb();
      await db.put(STORE_NAME, blob, tokenKey);
      try {
        localStorage.removeItem(plaintextKey);
        localStorage.removeItem(LS_KEY_PLAINTEXT_FALLBACK);
      } catch {
        /* ignore */
      }
      return;
    } catch (error) {
      console.warn('[OAuth] IndexedDB write failed, falling back to plaintext storage', error);
    }
  }

  console.warn('[OAuth] storing tokens as plaintext (Web Crypto unavailable or IndexedDB blocked)');
  try {
    localStorage.setItem(plaintextKey, JSON.stringify(tokens));
  } catch (error) {
    console.error('[OAuth] localStorage token write failed', error);
    throw new Error(`OAuth token persistence failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
async function loadTokenSet(scopes: readonly string[]): Promise<TokenSet | null> {
  const tokenKey = oauthStorageKeyForScopes(scopes);
  const plaintextKey = plaintextFallbackKeyForScopes(scopes);
  try {
    const db = await getDb();
    const stored = (await db.get(STORE_NAME, tokenKey)) as EncryptedBlob | TokenSet | undefined;
    if (stored && typeof stored === 'object' && 'ct' in stored && 'iv' in stored) {
      const key = await getOrCreateEncryptionKey();
      if (!key) {
        console.warn('OAuth: encrypted blob present but no key available');
        return null;
      }
      return await decryptTokenSet(key, stored);
    }
    if (stored && typeof stored === 'object' && 'accessToken' in stored) {
      return stored as TokenSet;
    }
    const legacy = (await db.get(STORE_NAME, LEGACY_TOKEN_KEY)) as EncryptedBlob | TokenSet | undefined;
    if (legacy && typeof legacy === 'object' && 'ct' in legacy && 'iv' in legacy) {
      const key = await getOrCreateEncryptionKey();
      if (key) {
        const migrated = await decryptTokenSet(key, legacy);
        await persistTokenSet(migrated, scopes);
        await db.delete(STORE_NAME, LEGACY_TOKEN_KEY);
        return migrated;
      }
    }
    if (legacy && typeof legacy === 'object' && 'accessToken' in legacy) {
      const migrated = legacy as TokenSet;
      await persistTokenSet(migrated, scopes);
      await db.delete(STORE_NAME, LEGACY_TOKEN_KEY);
      return migrated;
    }
  } catch (error) {
    console.warn('OAuth: failed to read encrypted token from IndexedDB', error);
  }

  try {
    const raw = localStorage.getItem(plaintextKey) ?? localStorage.getItem(LS_KEY_PLAINTEXT_FALLBACK);
    if (raw) {
      return JSON.parse(raw) as TokenSet;
    }
  } catch (error) {
    console.warn('OAuth: failed to read plaintext fallback token', error);
  }

  return null;
}

async function clearTokenSet(scopes?: readonly string[]): Promise<void> {
  try {
    const db = await getDb();
    if (scopes && scopes.length > 0) {
      await db.delete(STORE_NAME, oauthStorageKeyForScopes(scopes));
    }
    await db.delete(STORE_NAME, LEGACY_TOKEN_KEY);
  } catch (error) {
    console.warn('OAuth: failed to clear IndexedDB token', error);
  }
  try {
    if (scopes && scopes.length > 0) {
      localStorage.removeItem(plaintextFallbackKeyForScopes(scopes));
    }
    localStorage.removeItem(LS_KEY_PLAINTEXT_FALLBACK);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Token exchange / refresh
// ---------------------------------------------------------------------------

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
}

async function postTokenEndpoint(body: URLSearchParams): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let message = text;
    try {
      const parsed = JSON.parse(text) as { error?: string; error_description?: string };
      message = parsed.error ? describeOAuthError(parsed.error) : text;
      if (parsed.error_description) message += ` — ${parsed.error_description}`;
    } catch {
      /* keep raw text */
    }
    throw new Error(`OAuth token endpoint returned ${response.status}: ${message}`);
  }

  return (await response.json()) as GoogleTokenResponse;
}

function tokenResponseToSet(
  response: GoogleTokenResponse,
  previousRefreshToken?: string,
): TokenSet {
  if (!response.access_token) {
    throw new Error('Google OAuth failed: no access token in response');
  }
  const refreshToken = response.refresh_token ?? previousRefreshToken ?? '';
  return {
    accessToken: response.access_token,
    refreshToken,
    expiresAt: Date.now() + response.expires_in * 1000,
    scope: response.scope,
  };
}

async function exchangeCodeForTokens(
  code: string,
  verifier: string,
  config: OAuthConfig,
): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
  });
  const response = await postTokenEndpoint(body);
  return tokenResponseToSet(response);
}

async function refreshAccessToken(tokens: TokenSet, config: OAuthConfig): Promise<TokenSet> {
  if (!tokens.refreshToken) {
    throw new Error('OAuth: cannot refresh — no refresh token stored');
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken,
    client_id: config.clientId,
  });
  const response = await postTokenEndpoint(body);
  return tokenResponseToSet(response, tokens.refreshToken);
}

// ---------------------------------------------------------------------------
// In-flight PKCE state (verifier + state lookup for the BroadcastChannel)
// ---------------------------------------------------------------------------

interface PendingFlow {
  verifier: string;
  state: string;
  config: OAuthConfig;
}

let pendingFlow: PendingFlow | null = null;

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

async function initiateOAuth(config: OAuthConfig): Promise<TokenSet> {
  if (!config.clientId) {
    throw new Error('OAuth: clientId is required. Configure it in Settings before connecting.');
  }
  if (!config.redirectUri) {
    throw new Error('OAuth: redirectUri is required.');
  }
  if (!config.scopes || config.scopes.length === 0) {
    throw new Error('OAuth: at least one scope is required.');
  }
  if (typeof window === 'undefined') {
    throw new Error('OAuth: initiateOAuth must be called from a browser environment.');
  }

  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = generateState();

  pendingFlow = { verifier, state, config };

  const authorizeUrl = buildOAuthAuthorizeUrl({
    ...config,
    codeChallenge: challenge,
    state,
  });

  const popup = window.open(authorizeUrl, POPUP_NAME, POPUP_FEATURES);
  if (!popup) {
    pendingFlow = null;
    throw new Error('OAuth: unable to open popup — it may have been blocked by the browser.');
  }

  return await new Promise<TokenSet>((resolve, reject) => {
    const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    let settled = false;

    const cleanup = () => {
      settled = true;
      channel.close();
      clearTimeout(timeoutHandle);
      clearInterval(popupWatcher);
      pendingFlow = null;
    };

    const timeoutHandle = setTimeout(() => {
      if (settled) return;
      cleanup();
      reject(new Error('OAuth: timed out waiting for authorization code.'));
    }, OAUTH_CODE_TIMEOUT_MS);

    const popupWatcher = setInterval(() => {
      if (settled) return;
      if (popup.closed) {
        cleanup();
        reject(new Error('OAuth: popup was closed before authorization completed.'));
      }
    }, 500);

    channel.onmessage = async (event: MessageEvent) => {
      if (settled) return;
      const data = event.data as { code?: string; state?: string; error?: string; pickedFileIds?: string[]; picked_file_ids?: string } | undefined;
      if (!data) return;

      if (data.error) {
        cleanup();
        reject(new Error(`OAuth: authorization failed — ${describeOAuthError(data.error)}`));
        return;
      }

      if (!data.code) return;

      // Validate state if provided, but do not reject silent mismatches that
      // predate state support in the callback page.
      if (data.state && data.state !== state) {
        cleanup();
        reject(new Error('OAuth: state mismatch — possible CSRF.'));
        return;
      }

    try {
      const tokens = await exchangeCodeForTokens(data.code, verifier, config);
      const pickedFileIds = Array.isArray(data.pickedFileIds)
        ? data.pickedFileIds
        : typeof data.picked_file_ids === 'string'
          ? data.picked_file_ids.split(',').map((id) => id.trim()).filter(Boolean)
          : [];
      if (pickedFileIds.length > 0) tokens.pickedFileIds = pickedFileIds;

      await persistTokenSet(tokens, config.scopes);
      cleanup();
      try {
        popup.close();
      } catch {
        // ignore cross-origin close failures
      }
      resolve(tokens);
    } catch (error) {
      console.error('[OAuth] Flow failed with error:', error);
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
    };
  });
}

async function handleCallback(code: string, config: OAuthConfig): Promise<TokenSet> {
  if (!code) {
    throw new Error('OAuth: handleCallback called without an authorization code.');
  }
  if (!config.clientId || !config.redirectUri) {
    throw new Error('OAuth: handleCallback requires clientId and redirectUri.');
  }

  // Prefer the in-flight verifier if this tab is the one that initiated the flow.
  // Otherwise, the callback page is expected to have relayed the code via the
  // BroadcastChannel to the tab that holds the verifier, and this direct path
  // should only be used in same-tab redirect flows.
  const verifier = pendingFlow?.verifier;
  if (!verifier) {
    throw new Error(
      'OAuth: no PKCE verifier available in this tab. Use the BroadcastChannel flow instead.',
    );
  }

  const tokens = await exchangeCodeForTokens(code, verifier, config);
  await persistTokenSet(tokens, config.scopes);
  pendingFlow = null;
  return tokens;
}

async function getAccessToken(config: OAuthConfig): Promise<string | null> {
  const tokens = await loadTokenSet(config.scopes);
  if (!tokens) {
    return null;
  }

  const now = Date.now();
  if (tokens.expiresAt - now > REFRESH_LEEWAY_MS) {
    return tokens.accessToken;
  }

  if (!config.clientId) {
    console.warn('OAuth: access token expired and no clientId configured for refresh');
    return null;
  }

  try {
    const refreshed = await refreshAccessToken(tokens, config);
    await persistTokenSet(refreshed, config.scopes);
    return refreshed.accessToken;
  } catch (error) {
    console.warn('OAuth: token refresh failed', error);
    return null;
  }
}

async function signOut(config?: OAuthConfig): Promise<void> {
  await clearTokenSet(config?.scopes);
  pendingFlow = null;
}

async function isConnected(config?: OAuthConfig): Promise<boolean> {
  const tokens = await loadTokenSet(config?.scopes ?? OAUTH_SCOPES);
  if (!tokens) return false;
  // Consider connected if we have a refresh token, even if the access token is expired.
  return Boolean(tokens.refreshToken || tokens.expiresAt > Date.now());
}

export const oauthHandler = {
  initiateOAuth,
  handleCallback,
  getAccessToken,
  signOut,
  isConnected,
};
