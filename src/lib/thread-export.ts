import { format } from 'date-fns';
import type { Thread } from '../types';

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function download(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportThreadAsMarkdown(thread: Thread): void {
  const roleLabel = (role: string): string =>
    role === 'user' ? 'User' : 'Gemini';

  const header = `# ${thread.title}\n\n_Exported ${format(thread.createdAt, 'PPpp')}_\n\n---\n\n`;
  const body = thread.messages
    .map((m) => `## ${roleLabel(m.role)}\n\n${m.content}\n\n---`)
    .join('\n\n');

  download(header + body + '\n', `${slugify(thread.title)}.md`, 'text/markdown');
}

export function exportThreadAsJSON(thread: Thread): void {
  const json = JSON.stringify(thread, null, 2);
  download(json, `${slugify(thread.title)}.json`, 'application/json');
}
