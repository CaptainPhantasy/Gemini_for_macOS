import { describe, expect, it } from 'vitest';
import { buildFolderContextBundle, COMMON_FILE_ACCEPT, isTextLikeFile } from '../lib/attachment-context';

function fileWithRelativePath(content: string, name: string, type: string, relativePath: string): File {
  const file = new File([content], name, { type });
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
  return file;
}

describe('attachment context helpers', () => {
  it('accepts common document, data, source, media, and office file types', () => {
    expect(COMMON_FILE_ACCEPT).toContain('application/pdf');
    expect(COMMON_FILE_ACCEPT).toContain('.docx');
    expect(COMMON_FILE_ACCEPT).toContain('.xlsx');
    expect(COMMON_FILE_ACCEPT).toContain('.pptx');
    expect(COMMON_FILE_ACCEPT).toContain('.json');
    expect(COMMON_FILE_ACCEPT).toContain('.ts');
    expect(COMMON_FILE_ACCEPT).toContain('audio/*');
    expect(COMMON_FILE_ACCEPT).toContain('video/*');
  });

  it('detects source and markdown files as text-like', () => {
    expect(isTextLikeFile(new File(['# ok'], 'README.md', { type: '' }))).toBe(true);
    expect(isTextLikeFile(new File(['console.log(1)'], 'index.ts', { type: '' }))).toBe(true);
    expect(isTextLikeFile(new File(['binary'], 'report.pdf', { type: 'application/pdf' }))).toBe(false);
  });

  it('builds folder manifests and text previews with relative paths', async () => {
    const bundle = await buildFolderContextBundle([
      fileWithRelativePath('# Folder\nFOLDER_FILE_ONE_OK', 'README.md', 'text/markdown', 'sample/README.md'),
      fileWithRelativePath('{"ok":true}', 'data.json', 'application/json', 'sample/data.json'),
    ]);

    expect(bundle?.name).toBe('Folder context (2 files)');
    expect(bundle?.fileCount).toBe(2);
    expect(bundle?.text).toContain('FOLDER CONTEXT PROVIDED BY USER:');
    expect(bundle?.text).toContain('- sample/README.md');
    expect(bundle?.text).toContain('--- FILE: sample/README.md ---');
    expect(bundle?.text).toContain('FOLDER_FILE_ONE_OK');
    expect(bundle?.text).toContain('--- FILE: sample/data.json ---');
  });
});
