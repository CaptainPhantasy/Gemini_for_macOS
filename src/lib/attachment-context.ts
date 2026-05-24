export interface FolderContextBundle {
  name: string;
  text: string;
  fileCount: number;
}

const TEXT_FILE_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'jsonl', 'csv', 'tsv', 'yaml', 'yml', 'xml', 'html', 'css', 'scss',
  'js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'cpp', 'h', 'hpp',
  'sh', 'bash', 'zsh', 'fish', 'sql', 'toml', 'ini', 'env', 'log', 'dockerfile', 'gitignore'
]);

export const COMMON_FILE_ACCEPT = [
  'text/*', 'image/*', 'video/*', 'audio/*', 'application/pdf',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.tsv', '.json', '.jsonl', '.xml',
  '.md', '.txt', '.yaml', '.yml', '.toml', '.ini', '.html', '.css', '.js', '.jsx', '.ts', '.tsx',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift', '.c', '.cpp', '.h', '.hpp', '.sh', '.sql'
].join(',');

export function getRelativeFilePath(file: File): string {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
}

export function isTextLikeFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  return file.type.startsWith('text/') || TEXT_FILE_EXTENSIONS.has(ext) || file.name.toLowerCase() === 'dockerfile';
}

export function readFileAsText(file: File, maxChars = 20_000): Promise<string> {
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').slice(0, maxChars));
    reader.onerror = () => resolve(`[Unreadable file: ${file.name}]`);
    reader.readAsText(file);
  });
}

export async function buildFolderContextBundle(files: File[]): Promise<FolderContextBundle | null> {
  if (files.length === 0) return null;

  const selected = files.slice(0, 80);
  const manifest = selected.map(file => {
    const relPath = getRelativeFilePath(file);
    return `- ${relPath} (${file.type || 'unknown'}, ${file.size} bytes)`;
  });

  const textFiles = selected.filter(isTextLikeFile).slice(0, 24);
  const sections: string[] = [];
  let totalChars = 0;
  for (const file of textFiles) {
    if (totalChars > 120_000) break;
    const relPath = getRelativeFilePath(file);
    const text = await readFileAsText(file);
    totalChars += text.length;
    sections.push(`\n--- FILE: ${relPath} ---\n${text}`);
  }

  return {
    name: `Folder context (${files.length} files)`,
    fileCount: files.length,
    text: [
      'FOLDER CONTEXT PROVIDED BY USER:',
      `Total files selected: ${files.length}`,
      'Manifest:',
      manifest.join('\n'),
      sections.length > 0 ? '\nText previews:' : '\nNo text-like files were previewed. Binary/common office files are listed in the manifest only.',
      sections.join('\n'),
    ].join('\n'),
  };
}
