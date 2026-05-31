import { describe, expect, test } from 'vitest';
import { getDesktopCommanderLaunchCandidates } from '../server/desktop-commander-launch';

describe('desktop commander launch candidates', () => {
  test('prefers explicit GEMINI CLI command over bundled GUI app path', () => {
    const candidates = getDesktopCommanderLaunchCandidates({
      GEMINI_DESKTOP_COMMANDER_COMMAND: '/opt/homebrew/bin/node',
      GEMINI_DESKTOP_COMMANDER_ARGS_JSON: '["/Volumes/SanDisk1Tb/GEMINI for MacOS/mcp/desktop-commander.js"]',
    });

    expect(candidates[0]).toMatchObject({
      command: '/opt/homebrew/bin/node',
      args: ['/Volumes/SanDisk1Tb/GEMINI for MacOS/mcp/desktop-commander.js'],
      source: 'env:GEMINI_DESKTOP_COMMANDER_COMMAND',
    });
  });

  test('uses canonical CLI before the Desktop Commander GUI bundle fallback', () => {
    const candidates = getDesktopCommanderLaunchCandidates({});

    expect(candidates[0]).toMatchObject({
      command: 'npx',
      args: ['-y', '@wonderwhy-er/desktop-commander@latest'],
      source: 'cli:npx',
    });
    expect(candidates[1].source).toBe('dxt-app-bundle');
    expect(candidates[1].args[0]).toContain('/Applications/Desktop Commander.app/');
  });

  test('rejects non-array JSON args so startup fails loudly', () => {
    expect(() => getDesktopCommanderLaunchCandidates({
      GEMINI_DESKTOP_COMMANDER_COMMAND: 'node',
      GEMINI_DESKTOP_COMMANDER_ARGS_JSON: '{"bad":true}',
    })).toThrow('GEMINI_DESKTOP_COMMANDER_ARGS_JSON must be a JSON string array');
  });
});
