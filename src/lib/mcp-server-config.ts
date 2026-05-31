import type { McpServerConfig } from '../types';

const FLOYD_LABS_MCP_URL = 'https://floydslabs.com/api/mcp';

export const DEFAULT_DESKTOP_COMMANDER_MCP: McpServerConfig = {
  id: 'desktop-commander',
  name: 'Desktop Commander MCP',
  type: 'websocket',
  url: 'ws://localhost:13001/mcp',
  enabled: true,
};

export const DEFAULT_ECHO_MCP: McpServerConfig = {
  id: 'echo-mcp',
  name: 'Echo MCP',
  type: 'stdio',
  command: '/opt/homebrew/bin/node',
  args: ['--import', 'tsx', '/Volumes/SanDisk1Tb/GEMINI for MacOS/src/server/echo-mcp-server.ts'],
  enabled: true,
};

type UnknownObject = Record<string, unknown>;

function isObject(value: unknown): value is UnknownObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeServer(value: unknown): McpServerConfig | null {
  if (!isObject(value)) return null;

  const id = stringValue(value.id, stringValue(value.name)).trim();
  const name = stringValue(value.name, id).trim();
  if (!id || !name) return null;

  if (name === 'floyd-labs') {
    return {
      id,
      name,
      type: 'sse',
      url: FLOYD_LABS_MCP_URL,
      enabled: value.enabled !== false,
    };
  }

  const command = stringValue(value.command).trim();
  const url = stringValue(value.url).trim();
  const rawType = stringValue(value.type);
  const type: McpServerConfig['type'] = rawType === 'websocket' || rawType === 'sse' || rawType === 'http' || rawType === 'stdio'
    ? rawType
    : command
      ? 'stdio'
      : url
        ? 'websocket'
        : 'stdio';

  if (type === 'stdio' && !command) return null;
  if ((type === 'websocket' || type === 'sse' || type === 'http') && !url) return null;

  const normalized: McpServerConfig = {
    id,
    name,
    type,
    enabled: value.enabled !== false,
  };
  if (command) normalized.command = command;
  if (url) normalized.url = url;
  const args = stringArray(value.args);
  if (args.length > 0) normalized.args = args;
  return normalized;
}

function serverKey(server: McpServerConfig): string {
  return (server.id || server.name).toLowerCase();
}

export function normalizeMcpServers(rawServers: unknown): McpServerConfig[] {
  const normalized: McpServerConfig[] = [DEFAULT_DESKTOP_COMMANDER_MCP, DEFAULT_ECHO_MCP];
  const seen = new Set(normalized.map(serverKey));
  for (const rawServer of Array.isArray(rawServers) ? rawServers : []) {
    const server = normalizeServer(rawServer);
    if (!server) continue;
    const key = serverKey(server);
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(server);
  }
  return normalized;
}
