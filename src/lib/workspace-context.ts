/**
 * Workspace context bridge.
 *
 * Integration imports (Google Drive / Docs / Calendar / Gmail) are persisted as
 * Artifacts via storage.saveArtifact(). Without this bridge those artifacts are
 * stranded — they show in the Artifact Library and Canvas but never reach the
 * model, so the assistant cannot reference content the user explicitly imported.
 *
 * buildImportedWorkspaceContext() turns the imported artifacts into a bounded
 * context block that handleSendMessage injects into the model's system
 * instruction, alongside the gem persona, tool prompt, and user preferences.
 *
 * Only artifacts carrying metadata.sourceType (set exclusively by the
 * integration import paths) are included; chat-generated artifacts are excluded.
 */

import type { Artifact } from '../types';

type WorkspaceSource = NonNullable<NonNullable<Artifact['metadata']>['sourceType']>;

const SOURCE_LABELS: Record<WorkspaceSource, string> = {
  drive: 'Google Drive',
  docs: 'Google Docs',
  calendar: 'Google Calendar',
  gmail: 'Gmail',
};

export interface ImportedWorkspaceContextOptions {
  /** Maximum number of imported artifacts to include. */
  maxArtifacts?: number;
  /** Maximum characters of content kept per artifact. */
  maxCharsPerArtifact?: number;
  /** Maximum total characters of artifact content across the whole block. */
  maxTotalChars?: number;
}

/** True when an artifact originated from a Google Workspace integration import. */
export function isImportedWorkspaceArtifact(artifact: Artifact): boolean {
  return Boolean(artifact.metadata?.sourceType);
}

function clip(text: string, max: number): string {
  if (max <= 0) return '';
  if (text.length <= max) return text;
  if (max === 1) return '…';
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Build a bounded system-context block describing the content the user imported
 * from Google Workspace integrations. Returns '' when nothing has been imported
 * (so callers can drop it with a simple `.filter(Boolean)`).
 */
export function buildImportedWorkspaceContext(
  artifacts: Artifact[],
  options: ImportedWorkspaceContextOptions = {},
): string {
  const maxArtifacts = options.maxArtifacts ?? 10;
  const maxCharsPerArtifact = options.maxCharsPerArtifact ?? 4000;
  const maxTotalChars = options.maxTotalChars ?? 12000;

  const imported = artifacts
    .filter(isImportedWorkspaceArtifact)
    .sort((a, b) => (b.metadata?.fetchedAt ?? b.createdAt ?? 0) - (a.metadata?.fetchedAt ?? a.createdAt ?? 0))
    .slice(0, maxArtifacts);

  if (imported.length === 0) return '';

  const sections: string[] = [];
  let used = 0;
  for (const artifact of imported) {
    if (used >= maxTotalChars) break;
    const source = artifact.metadata?.sourceType;
    const label = source ? SOURCE_LABELS[source] : 'Workspace';
    const budget = Math.min(maxCharsPerArtifact, maxTotalChars - used);
    const body = clip((artifact.content ?? '').trim(), budget);
    used += body.length;
    const title = artifact.title?.trim() || 'Untitled';
    sections.push(`### [${label}] ${title}\n${body}`);
  }

  return [
    'IMPORTED WORKSPACE CONTENT:',
    'The user imported the following items from connected Google Workspace',
    'integrations (Drive, Docs, Calendar, Gmail). Treat them as authoritative',
    'source material the user wants you to use, and reference them directly when',
    'relevant to the request.',
    '',
    sections.join('\n\n'),
  ].join('\n');
}
