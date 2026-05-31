import { describe, expect, test } from 'vitest';
import { appendReadyClientTools } from '../server/mcp-tool-aggregation';

const gatewayTool = { name: 'list_mcp_servers', description: 'gateway', inputSchema: {} };
const echoTool = { name: 'echo', description: 'echo', inputSchema: {} };
const disconnectedTool = { name: 'disconnected', description: 'not ready', inputSchema: {} };

describe('MCP tool aggregation', () => {
  test('adds tools from ready project stdio clients without adding disconnected client tools', () => {
    const tools = [gatewayTool];
    const readyClient = { isReady: () => true, getTools: () => [echoTool] };
    const disconnectedClient = { isReady: () => false, getTools: () => [disconnectedTool] };

    appendReadyClientTools(tools, [readyClient, disconnectedClient]);

    expect(tools.map(tool => tool.name)).toEqual(['list_mcp_servers', 'echo']);
  });
});
