import { describe, expect, test } from 'vitest';
import { extractPickedFiles, importPickedDriveFiles } from '../lib/integration/google-picker';

describe('Google Drive Picker flow', () => {
  test('extractPickedFiles maps picker docs to id+name and skips blank ids', () => {
    const files = extractPickedFiles({
      action: 'picked',
      docs: [
        { id: 'file-1', name: 'Q2 Plan' },
        { id: '  ', name: 'blank id' },
        { id: 'file-2' },
      ],
    });
    expect(files).toEqual([
      { id: 'file-1', name: 'Q2 Plan' },
      { id: 'file-2', name: 'file-2' },
    ]);
  });

  test('extractPickedFiles returns [] for cancel / empty payloads', () => {
    expect(extractPickedFiles({ action: 'cancel' })).toEqual([]);
    expect(extractPickedFiles(null)).toEqual([]);
    expect(extractPickedFiles(undefined)).toEqual([]);
    expect(extractPickedFiles({})).toEqual([]);
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
