import { describe, expect, test } from 'vitest';
import { extractPickedFiles, importPickedDriveFiles } from '../lib/google-picker';
import { buildImportedWorkspaceContext } from '../lib/workspace-context';
import type { Artifact } from '../types';
import type { ImportResult } from '../lib/integrations';

// Mirrors Integrations.tsx persistAsArtifact: ImportResult -> Artifact.
function importResultToArtifact(result: ImportResult, fallback: string): Artifact {
  return {
    id: result.artifactId ?? `art-${result.sourceFileId ?? 'x'}`,
    title: result.title ?? fallback,
    content: result.content ?? '',
    type: 'text',
    createdAt: Date.now(),
    ...(result.mimeType ? { mimeType: result.mimeType } : {}),
    metadata: {
      ...(result.sourceFileId ? { sourceFileId: result.sourceFileId } : {}),
      ...(result.sourceType ? { sourceType: result.sourceType } : {}),
      ...(result.fetchedAt ? { fetchedAt: result.fetchedAt } : {}),
    },
  };
}

describe('Drive pick -> import -> model context (data contract)', () => {
  test('a picked Drive file becomes model-visible workspace context', async () => {
    // 1. In-app picker callback returns the selection.
    const picked = extractPickedFiles({
      action: 'picked',
      docs: [{ id: 'drive-file-1', name: 'Q2 Strategy' }],
    });
    expect(picked).toEqual([{ id: 'drive-file-1', name: 'Q2 Strategy' }]);

    // 2. Import the picked file (mock the Drive importFile call).
    const results = await importPickedDriveFiles({
      accessToken: 'token',
      fileIds: picked.map((file) => file.id),
      importFile: async (_token, fileId) => ({
        ok: true,
        title: 'Q2 Strategy',
        content: 'Revenue plan: grow 30% QoQ.',
        mimeType: 'text/plain',
        sourceFileId: fileId,
        sourceType: 'drive',
        fetchedAt: 10,
      }),
    });

    // 3. Persist as artifacts, then 4. feed the model-context bridge.
    const artifacts = results.map((result) => importResultToArtifact(result, 'Picked Drive file'));
    const context = buildImportedWorkspaceContext(artifacts);

    expect(context).toContain('IMPORTED WORKSPACE CONTENT');
    expect(context).toContain('[Google Drive] Q2 Strategy');
    expect(context).toContain('Revenue plan: grow 30% QoQ.');
  });
});
