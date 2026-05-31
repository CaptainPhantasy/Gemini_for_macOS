import express from 'express';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import apiRoutes, { setMcpContext, type McpContext } from '../lib/api-routes';

const servers: Array<{ close: () => Promise<void> }> = [];
const originalDefaultConfigPath = process.env.GEMINI_DEFAULT_CONFIG_PATH;


function makeContext(overrides: Partial<McpContext> = {}): McpContext {
  return {
    isDesktopCommanderReady: () => false,
    getDesktopCommanderToolCount: () => 0,
    getDesktopCommanderTools: () => [],
    getGatewayTools: () => [],
    getSseClients: () => [],
    callTool: async () => ({ content: [{ type: 'text', text: '{}' }] }),
    detectLocalMcpServers: async () => [],
    addSSEServer: async () => ({ tools: 0, connected: false }),
    ...overrides,
  };
}

async function startRouter(): Promise<string> {
  const app = express();
  app.use(express.json());
  app.use('/', apiRoutes);

  const server = await new Promise<import('node:http').Server>((resolve) => {
    const started = app.listen(0, '127.0.0.1', () => resolve(started));
  });
  servers.push({
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not bind test server');
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  while (servers.length > 0) {
    await servers.pop()!.close();
  }
  if (originalDefaultConfigPath === undefined) {
    delete process.env.GEMINI_DEFAULT_CONFIG_PATH;
  } else {
    process.env.GEMINI_DEFAULT_CONFIG_PATH = originalDefaultConfigPath;
  }
});

describe('api-routes', () => {
  test('desktop commander config returns pending instead of HTTP 500 while commander is disconnected', async () => {
    setMcpContext(makeContext({
      callTool: async () => {
        throw new Error("Tool 'get_config' requires Desktop Commander MCP. Please wait for it to initialize.");
      },
    }));
    const baseUrl = await startRouter();

    const response = await fetch(`${baseUrl}/api/desktop-commander/config`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe('pending');
    expect(payload.result).toContain('Desktop Commander configuration unavailable');
    expect(payload.metadata.error).toContain('requires Desktop Commander MCP');
  });

  test('default config endpoint returns normalized backup settings', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-default-config-'));
    const configPath = path.join(tmp, 'backup.json');
    await fs.writeFile(configPath, JSON.stringify({
      version: 2,
      settings: {
        theme: 'gemini',
        autonomyMode: 'ask',
        directoryLock: { enabled: false, rootPath: '' },
        googleDriveEnabled: true,
        notebookLmEnabled: true,
        searchEnabled: true,
        mcpServers: [
          { id: 'blank', name: 'New Server', type: 'stdio', command: '', args: [], enabled: true },
          { id: 'omega', name: 'omega-v2', type: 'stdio', command: 'node', args: ['/tmp/omega.js'], enabled: true },
        ],
        geminiApiKey: 'test-key',
        gcpOAuthClientId: 'oauth-client',
        autoSyncArtifacts: true,
      },
      personalIntelligence: { preferences: 'direct', instructions: 'Use real tools.' },
    }), 'utf-8');
    process.env.GEMINI_DEFAULT_CONFIG_PATH = configPath;
    setMcpContext(makeContext());
    const baseUrl = await startRouter();

    const response = await fetch(`${baseUrl}/api/default-config`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe('success');
    expect(payload.advanced.settings.theme).toBe('gemini');
    expect(payload.advanced.personalIntelligence.instructions).toBe('Use real tools.');
    expect(payload.advanced.settings.mcpServers.map((server: { name: string }) => server.name)).toEqual([
      'Desktop Commander MCP',
      'Echo MCP',
      'omega-v2',
    ]);
    expect(payload.advanced.settings.geminiApiKey).toBe('');
    expect(payload.advanced.settings.gcpOAuthClientId).toBe('');
  });
});
