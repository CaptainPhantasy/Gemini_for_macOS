import { describe, expect, test } from 'vitest';
import {
  getAutoloadProjectServerNames,
  getDefaultConfigCandidatePaths,
  normalizeGeminiDefaultConfig,
  parseGeminiDefaultConfigText,
} from '../server/default-config';

const baseSettings = {
  theme: 'gemini',
  autonomyMode: 'ask',
  directoryLock: { enabled: false, rootPath: '' },
  googleDriveEnabled: true,
  notebookLmEnabled: true,
  searchEnabled: true,
  mcpServers: [
    { id: 'blank', name: 'New Server', type: 'stdio', command: '', args: [], enabled: true },
    { id: 'omega', name: 'omega-v2', type: 'stdio', command: 'node', args: ['/Volumes/Storage/MCP/omega-v2/dist/index.js'], enabled: true },
    { id: 'hive', name: 'hivemind-v2', type: 'stdio', command: '/opt/homebrew/bin/node', args: ['/Volumes/Storage/MCP/hivemind-v2/dist/index.js'], enabled: true },
  ],
  geminiApiKey: 'test-key',
  gcpOAuthClientId: 'oauth-client',
  autoSyncArtifacts: true,
};

describe('default Gemini config normalization', () => {
  test('uses the explicit env path before user-level and backup paths', () => {
    expect(getDefaultConfigCandidatePaths({ GEMINI_DEFAULT_CONFIG_PATH: '/tmp/default.json' }, '/Users/example')).toEqual([
      '/tmp/default.json',
      '/Users/example/.gemini-for-macos/default-config.json',
      '/Users/example/Downloads/gemini-backup-2026-05-30.json',
    ]);
  });

  test('drops blank MCP placeholders and injects Desktop Commander plus Echo defaults', () => {
    const normalized = normalizeGeminiDefaultConfig({
      version: 2,
      settings: baseSettings,
      personalIntelligence: { preferences: '', instructions: 'Use real tools.' },
    });

    expect(normalized.settings.theme).toBe('gemini');
    expect(normalized.personalIntelligence.instructions).toBe('Use real tools.');
    expect(normalized.settings.mcpServers.map(server => server.name)).toEqual([
      'Desktop Commander MCP',
      'Echo MCP',
      'omega-v2',
      'hivemind-v2',
    ]);
    expect(normalized.settings.mcpServers.some(server => server.name === 'New Server')).toBe(false);
  });

  test('autoloads only project stdio servers from normalized defaults', () => {
    const normalized = normalizeGeminiDefaultConfig({ settings: baseSettings });

    expect(getAutoloadProjectServerNames(normalized.settings.mcpServers)).toEqual([
      'echo-mcp',
      'omega-v2',
      'hivemind-v2',
    ]);
  });

  test('normalizes the Floyd Labs backup entry to the remote SSE endpoint', () => {
    const normalized = normalizeGeminiDefaultConfig({
      settings: {
        ...baseSettings,
        mcpServers: [
          ...baseSettings.mcpServers,
          { id: 'floyd', name: 'floyd-labs', type: 'stdio', command: 'npx', args: ['-y', '@anthropics/mcp-proxy'], enabled: true },
        ],
      },
    });

    const floyd = normalized.settings.mcpServers.find(server => server.name === 'floyd-labs');
    expect(floyd).toMatchObject({ type: 'sse', url: 'https://floydslabs.com/api/mcp' });
    expect(getAutoloadProjectServerNames(normalized.settings.mcpServers)).not.toContain('floyd-labs');
  });

  test('installs Zapier MCP from environment without committing its secret URL', () => {
    const normalized = normalizeGeminiDefaultConfig(
      { settings: baseSettings },
      null,
      { ZAPIER_MCP_URL: 'https://zapier-mcp.example.invalid/server/test-placeholder' }
    );

    expect(normalized.settings.mcpServers.find(server => server.id === 'zapier-mcp')).toMatchObject({
      name: 'Zapier MCP',
      type: 'http',
      url: 'https://zapier-mcp.example.invalid/server/test-placeholder',
      enabled: true,
    });
    expect(getAutoloadProjectServerNames(normalized.settings.mcpServers)).not.toContain('Zapier MCP');
  });

  test('salvages settings and personal intelligence from a malformed backup export', () => {
    const parsed = parseGeminiDefaultConfigText(`{
      \"version\": 2,
      \"localStorage\": { \"broken\": \"value\" },
        ]
      },
      \"settings\": ${JSON.stringify(baseSettings)},
      \"personalIntelligence\": { \"preferences\": \"direct\", \"instructions\": \"Use real tools.\" }
    }`);
    const normalized = normalizeGeminiDefaultConfig(parsed);

    expect(normalized.settings.theme).toBe('gemini');
    expect(normalized.settings.mcpServers.map(server => server.name)).toContain('omega-v2');
    expect(normalized.personalIntelligence.preferences).toBe('direct');
  });
});
