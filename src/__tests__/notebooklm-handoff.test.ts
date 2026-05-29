import { describe, expect, test } from 'vitest';
import type { Artifact, Thread } from '../types';
import { integrations } from '../lib/integrations';
import { buildNotebookLmSourcePack, uploadNotebookLmSourcePack } from '../lib/notebooklm-handoff';

const artifact: Artifact = {
  id: 'art-1',
  title: 'Research Note',
  content: 'Important source text',
  type: 'research',
  createdAt: 1_700_000_000_000,
  mimeType: 'text/plain',
  driveFileId: 'drive-1',
};

const thread: Thread = {
  id: 'thread-1',
  title: 'Planning Thread',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_001,
  messages: [
    { id: 'm1', role: 'user', content: 'What changed?', timestamp: 1 },
    { id: 'm2', role: 'model', content: 'The source pack changed.', timestamp: 2 },
  ],
};

describe('NotebookLM Drive handoff', () => {
  test('source-pack builder produces deterministic markdown with headers', () => {
    const pack = buildNotebookLmSourcePack({
      title: 'Notebook Export',
      artifacts: [artifact],
      thread,
      createdAt: new Date('2026-05-27T12:00:00Z'),
    });

    expect(pack.fileName).toBe('notebook-export.md');
    expect(pack.folderPath).toBe('GEMINI/NotebookLM/2026-05-27');
    expect(pack.content).toContain('# Notebook Export');
    expect(pack.content).toContain('## Artifact: Research Note');
    expect(pack.content).toContain('Drive file ID: `drive-1`');
    expect(pack.content).toContain('## Thread: Planning Thread');
    expect(pack.content).toContain('### User');
    expect(pack.content).toContain('### Gemini');
  });

  test('handoff uploads source pack to dated NotebookLM Drive folder', async () => {
    const uploads: Array<{ name: string; mimeType: string; text: string; folderPath?: string }> = [];
    const result = await uploadNotebookLmSourcePack({
      accessToken: 'token',
      pack: buildNotebookLmSourcePack({ title: 'Notebook Export', artifacts: [artifact], createdAt: new Date('2026-05-27T12:00:00Z') }),
      uploadFile: async (_accessToken, name, mimeType, blob, folderPath) => {
        uploads.push({ name, mimeType, text: await blob.text(), folderPath });
        return { ok: true, fileId: 'drive-pack-1' };
      },
    });

    expect(result).toEqual({ ok: true, fileId: 'drive-pack-1', notebookLmUrl: 'https://notebooklm.google.com/' });
    expect(uploads).toHaveLength(1);
    expect(uploads[0].name).toBe('notebook-export.md');
    expect(uploads[0].mimeType).toBe('text/markdown');
    expect(uploads[0].folderPath).toBe('GEMINI/NotebookLM/2026-05-27');
    expect(uploads[0].text).toContain('Important source text');
  });

  test('direct NotebookLM API remains explicitly unavailable', async () => {
    const result = await integrations.notebookLm.importNotebook('token', 'notebook-1');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('does not currently expose a public REST API');
  });
});
