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

export const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/cloud-billing.readonly',
] as const;

export interface OAuthConfig {
  /** Google OAuth 2.0 Client ID (public). Never hardcoded — supplied by caller. */
  clientId: string;
  /** Redirect URI registered in the Google Cloud console, e.g. http://localhost:13000/oauth/callback */
  redirectUri: string;
  /** Subset of OAUTH_SCOPES to request. */
  scopes: string[];
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds at which the access token expires. */
  expiresAt: number;
  /** Space-delimited scopes the token was actually granted. */
  scope: string;
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const DB_NAME = 'gemini-for-macos-oauth';
const DB_VERSION = 1;
const STORE_NAME = 'tokens';
const TOKEN_KEY = 'current';

const LS_KEY_CRYPTO = 'gemini-for-macos:oauth-key';
const LS_KEY_PLAINTEXT_FALLBACK = 'gemini-for-macos:oauth-token';

const REFRESH_LEEWAY_MS = 5 * 60 * 1000; // refresh when < 5 minutes remain
const BROADCAST_CHANNEL_NAME = 'gemini-oauth';
const POPUP_NAME = 'oauth';
const POPUP_FEATURES = 'width=500,height=600';

const OAUTH_CODE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes for the user to complete the flow

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

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return dbPromise;
}

async function persistTokenSet(tokens: TokenSet): Promise<void> {
  const key = await getOrCreateEncryptionKey();
  if (key) {
    const blob = await encryptTokenSet(key, tokens);
    const db = await getDb();
    await db.put(STORE_NAME, blob, TOKEN_KEY);
    // Clean up any stale plaintext fallback.
    try {
      localStorage.removeItem(LS_KEY_PLAINTEXT_FALLBACK);
    } catch {
      /* ignore */
    }
    return;
  }

  // TODO: encrypt — Web Crypto unavailable, falling back to plaintext storage.
  console.warn('OAuth: storing tokens as plaintext because Web Crypto is unavailable');
  localStorage.setItem(LS_KEY_PLAINTEXT_FALLBACK, JSON.stringify(tokens));
}

async function loadTokenSet(): Promise<TokenSet | null> {
  try {
    const db = await getDb();
    const stored = (await db.get(STORE_NAME, TOKEN_KEY)) as EncryptedBlob | TokenSet | undefined;
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
  } catch (error) {
    console.warn('OAuth: failed to read encrypted token from IndexedDB', error);
  }

  try {
    const raw = localStorage.getItem(LS_KEY_PLAINTEXT_FALLBACK);
    if (raw) {
      return JSON.parse(raw) as TokenSet;
    }
  } catch (error) {
    console.warn('OAuth: failed to read plaintext fallback token', error);
  }

  return null;
}

async function clearTokenSet(): Promise<void> {
  try {
    const db = await getDb();
    await db.delete(STORE_NAME, TOKEN_KEY);
  } catch (error) {
    console.warn('OAuth: failed to clear IndexedDB token', error);
  }
  try {
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
    throw new Error(`OAuth token endpoint returned ${response.status}: ${text}`);
  }

  return (await response.json()) as GoogleTokenResponse;
}

function tokenResponseToSet(
  response: GoogleTokenResponse,
  previousRefreshToken?: string,
): TokenSet {
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

  const authorizeUrl = new URL(GOOGLE_AUTH_URL);
  authorizeUrl.searchParams.set('client_id', config.clientId);
  authorizeUrl.searchParams.set('redirect_uri', config.redirectUri);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', config.scopes.join(' '));
  authorizeUrl.searchParams.set('code_challenge', challenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('access_type', 'offline');
  authorizeUrl.searchParams.set('prompt', 'consent');
  authorizeUrl.searchParams.set('include_granted_scopes', 'true');

  const popup = window.open(authorizeUrl.toString(), POPUP_NAME, POPUP_FEATURES);
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
      const data = event.data as { code?: string; state?: string; error?: string } | undefined;
      if (!data) return;

      if (data.error) {
        cleanup();
        reject(new Error(`OAuth: authorization failed — ${data.error}`));
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
        await persistTokenSet(tokens);
        cleanup();
        try {
          popup.close();
        } catch {
          /* ignore cross-origin close failures */
        }
        resolve(tokens);
      } catch (error) {
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
  await persistTokenSet(tokens);
  pendingFlow = null;
  return tokens;
}

async function getAccessToken(config: OAuthConfig): Promise<string | null> {
  const tokens = await loadTokenSet();
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
    await persistTokenSet(refreshed);
    return refreshed.accessToken;
  } catch (error) {
    console.warn('OAuth: token refresh failed', error);
    return null;
  }
}

async function signOut(): Promise<void> {
  await clearTokenSet();
  pendingFlow = null;
}

async function isConnected(): Promise<boolean> {
  const tokens = await loadTokenSet();
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
