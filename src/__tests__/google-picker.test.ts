import { describe, expect, test } from 'vitest';
import { GOOGLE_DRIVE_FILE_SCOPE } from '../lib/oauth-handler';
import { buildDrivePickerOAuthConfig, importPickedDriveFiles } from '../lib/google-picker';

describe('Google Drive Picker flow', () => {
  test('builds a Picker-only OAuth config using drive.file', () => {
    const config = buildDrivePickerOAuthConfig({
      clientId: 'client-123',
      redirectUri: 'http://localhost:13000/oauth/callback',
      allowMultiple: true,
      mimeTypes: ['application/pdf', 'application/vnd.google-apps.document'],
    });

    expect(config.clientId).toBe('client-123');
    expect(config.redirectUri).toBe('http://localhost:13000/oauth/callback');
    expect(config.scopes).toEqual([GOOGLE_DRIVE_FILE_SCOPE]);
    expect(config.extraAuthorizeParams).toEqual({
      trigger_onepick: 'true',
      prompt: 'consent',
      include_granted_scopes: 'false',
      allow_multiple: 'true',
      mimetypes: 'application/pdf,application/vnd.google-apps.document',
    });
  });

  test('imports picked files exactly once in selected order', async () => {
    const calls: string[] = [];
    const results = await importPickedDriveFiles({
      accessToken: 'token',
      fileIds: ['a', 'b', 'a', 'c'],
      importFile: async (_token, fileId) => {
        calls.push(fileId);
        return { ok: true, artifactId: `art-${fileId}`, title: fileId, content: fileId, mimeType: 'text/plain' };
      },
    });

    expect(calls).toEqual(['a', 'b', 'c']);
    expect(results.map((r) => r.title)).toEqual(['a', 'b', 'c']);
  });
});
