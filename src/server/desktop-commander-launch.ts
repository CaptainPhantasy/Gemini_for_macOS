export interface DesktopCommanderLaunchCandidate {
  command: string;
  args: string[];
  source: string;
}

type DesktopCommanderLaunchEnv = Partial<Record<
  'GEMINI_DESKTOP_COMMANDER_COMMAND' | 'GEMINI_DESKTOP_COMMANDER_ARGS_JSON',
  string | undefined
>>;

function parseArgsJson(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw new Error('GEMINI_DESKTOP_COMMANDER_ARGS_JSON must be a JSON string array');
  }
  return parsed;
}

export function getDesktopCommanderLaunchCandidates(
  env: DesktopCommanderLaunchEnv = process.env,
): DesktopCommanderLaunchCandidate[] {
  const candidates: DesktopCommanderLaunchCandidate[] = [];
  const explicitCommand = env.GEMINI_DESKTOP_COMMANDER_COMMAND?.trim();
  if (explicitCommand) {
    candidates.push({
      command: explicitCommand,
      args: parseArgsJson(env.GEMINI_DESKTOP_COMMANDER_ARGS_JSON),
      source: 'env:GEMINI_DESKTOP_COMMANDER_COMMAND',
    });
  }

  candidates.push({
    command: 'npx',
    args: ['-y', '@wonderwhy-er/desktop-commander@latest'],
    source: 'cli:npx',
  });

  candidates.push({
    command: 'node',
    args: ['/Applications/Desktop Commander.app/Contents/Resources/bundled-mcpb/dist/index.js'],
    source: 'dxt-app-bundle',
  });

  return candidates;
}
