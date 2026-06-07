import { describe, expect, test } from 'vitest';
import {
  GOOGLE_DRIVE_FILE_SCOPE,
  GOOGLE_WORKSPACE_SCOPES,
  buildOAuthAuthorizeUrl,
  oauthStorageKeyForScopes,
  parseOAuthCallbackParams,
} from '../lib/oauth-handler';

describe('oauth-handler scope partitioning', () => {
  test('scope storage key is canonical and independent of order', () => {
    const first = oauthStorageKeyForScopes(['scope.b', 'scope.a', 'scope.a']);
    const second = oauthStorageKeyForScopes(['scope.a', 'scope.b']);
    expect(first).toBe(second);
    expect(first).not.toBe(oauthStorageKeyForScopes(['scope.a']));
  });

  test('workspace bundle preserves existing broad Google integration scopes', () => {
    expect(GOOGLE_WORKSPACE_SCOPES).toEqual([
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/presentations',
      'https://www.googleapis.com/auth/forms',
      'https://www.googleapis.com/auth/tasks.readonly',
      'https://www.googleapis.com/auth/tasks',
      'https://www.googleapis.com/auth/keep',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/cloud-billing.readonly',
    ]);
  });

  test('authorize URL includes PKCE, state, consent, and extra picker parameters', () => {
    const url = buildOAuthAuthorizeUrl({
      clientId: 'client-123',
      redirectUri: 'http://localhost:13000/oauth/callback',
      scopes: [GOOGLE_DRIVE_FILE_SCOPE],
      codeChallenge: 'challenge',
      state: 'state-abc',
      extraAuthorizeParams: { trigger_onepick: 'true', include_granted_scopes: 'false' },
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(parsed.searchParams.get('client_id')).toBe('client-123');
    expect(parsed.searchParams.get('redirect_uri')).toBe('http://localhost:13000/oauth/callback');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('scope')).toBe(GOOGLE_DRIVE_FILE_SCOPE);
    expect(parsed.searchParams.get('code_challenge')).toBe('challenge');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('state')).toBe('state-abc');
    expect(parsed.searchParams.get('prompt')).toBe('consent');
    expect(parsed.searchParams.get('trigger_onepick')).toBe('true');
    expect(parsed.searchParams.get('include_granted_scopes')).toBe('false');
  });

  test('callback parser extracts selected Drive file IDs', () => {
    const parsed = parseOAuthCallbackParams('https://app.example/oauth/callback?picked_file_ids=a,b%2Cc,,d&code=code-1&state=s');
    expect(parsed).toEqual({
      code: 'code-1',
      state: 's',
      error: undefined,
      pickedFileIds: ['a', 'b', 'c', 'd'],
    });
  });
});
