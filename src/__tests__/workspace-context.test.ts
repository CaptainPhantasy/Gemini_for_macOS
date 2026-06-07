import { describe, expect, test } from 'vitest';
import { buildImportedWorkspaceContext, isImportedWorkspaceArtifact } from '../lib/workspace-context';
import type { Artifact } from '../types';

function artifact(partial: Partial<Artifact>): Artifact {
  return {
    id: partial.id ?? 'a',
    title: partial.title ?? 'T',
    content: partial.content ?? '',
    type: partial.type ?? 'text',
    createdAt: partial.createdAt ?? 0,
    ...(partial.metadata ? { metadata: partial.metadata } : {}),
  };
}

describe('buildImportedWorkspaceContext', () => {
  test('returns empty string when there are no imported artifacts', () => {
    expect(buildImportedWorkspaceContext([])).toBe('');
    // chat-generated artifacts (no sourceType) are not imported workspace content
    expect(buildImportedWorkspaceContext([artifact({ content: 'chat output' })])).toBe('');
  });

  test('includes imported Drive content and labels the source', () => {
    const out = buildImportedWorkspaceContext([
      artifact({
        title: 'Q2 Plan',
        content: 'Revenue targets for Q2',
        metadata: { sourceType: 'drive', sourceFileId: 'f1' },
      }),
    ]);
    expect(out).toContain('IMPORTED WORKSPACE CONTENT');
    expect(out).toContain('[Google Drive] Q2 Plan');
    expect(out).toContain('Revenue targets for Q2');
  });

  test('excludes chat-generated artifacts but keeps imported ones', () => {
    const out = buildImportedWorkspaceContext([
      artifact({ title: 'Imported', content: 'keep me', metadata: { sourceType: 'docs' } }),
      artifact({ title: 'Generated', content: 'drop me' }),
    ]);
    expect(out).toContain('keep me');
    expect(out).not.toContain('drop me');
  });

  test('orders the most recently imported artifact first', () => {
    const out = buildImportedWorkspaceContext([
      artifact({ title: 'Older', content: 'old', createdAt: 1, metadata: { sourceType: 'gmail', fetchedAt: 1 } }),
      artifact({ title: 'Newer', content: 'new', createdAt: 2, metadata: { sourceType: 'gmail', fetchedAt: 2 } }),
    ]);
    expect(out.indexOf('Newer')).toBeLessThan(out.indexOf('Older'));
  });

  test('caps total artifact content to the configured budget', () => {
    const big = 'x'.repeat(5000);
    const out = buildImportedWorkspaceContext(
      [
        artifact({ id: '1', title: 'A', content: big, metadata: { sourceType: 'drive' } }),
        artifact({ id: '2', title: 'B', content: big, metadata: { sourceType: 'drive' } }),
        artifact({ id: '3', title: 'C', content: big, metadata: { sourceType: 'drive' } }),
        artifact({ id: '4', title: 'D', content: big, metadata: { sourceType: 'drive' } }),
      ],
      { maxTotalChars: 6000, maxCharsPerArtifact: 4000 },
    );
    const xCount = (out.match(/x/g) ?? []).length;
    expect(xCount).toBeLessThanOrEqual(6000);
    expect(xCount).toBeGreaterThan(0);
  });

  test('labels every Google Workspace source', () => {
    const out = buildImportedWorkspaceContext([
      artifact({ id: 'd', title: 'Doc', content: 'docs body', metadata: { sourceType: 'docs', fetchedAt: 4 } }),
      artifact({ id: 'c', title: 'Cal', content: 'cal body', metadata: { sourceType: 'calendar', fetchedAt: 3 } }),
      artifact({ id: 'm', title: 'Mail', content: 'mail body', metadata: { sourceType: 'gmail', fetchedAt: 2 } }),
      artifact({ id: 'v', title: 'Drv', content: 'drive body', metadata: { sourceType: 'drive', fetchedAt: 1 } }),
    ]);
    expect(out).toContain('[Google Docs] Doc');
    expect(out).toContain('[Google Calendar] Cal');
    expect(out).toContain('[Gmail] Mail');
    expect(out).toContain('[Google Drive] Drv');
  });

  test('isImportedWorkspaceArtifact reflects sourceType presence', () => {
    expect(isImportedWorkspaceArtifact(artifact({ metadata: { sourceType: 'calendar' } }))).toBe(true);
    expect(isImportedWorkspaceArtifact(artifact({}))).toBe(false);
  });
});
