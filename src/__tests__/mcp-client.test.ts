import { afterEach, describe, expect, test, vi } from 'vitest';
import { MCPClient } from '../lib/mcp';

class FakeWebSocket {
  static readonly OPEN = 1;
  static readonly CONNECTING = 0;
  static failNext = false;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      if (FakeWebSocket.failNext) {
        FakeWebSocket.failNext = false;
        this.readyState = 3;
        this.onerror?.();
        this.onclose?.();
        return;
      }
      this.readyState = FakeWebSocket.OPEN;
      this.onopen?.();
    });
  }

  send(data: string): void {
    const request = JSON.parse(data) as { id: number; method: string };
    if (request.method !== 'tools/list') return;
    queueMicrotask(() => {
      this.onmessage?.({
        data: JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          result: { tools: [{ name: 'read_file', description: 'Read file', inputSchema: {} }] },
        }),
      });
    });
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

describe('MCPClient', () => {
  const originalWebSocket = globalThis.WebSocket;

  afterEach(() => {
    vi.restoreAllMocks();
    FakeWebSocket.failNext = false;
    FakeWebSocket.instances = [];
    globalThis.WebSocket = originalWebSocket;
  });

  test('awaitTools reconnects when initial startup happened before the MCP server was available', async () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    FakeWebSocket.failNext = true;
    const client = new MCPClient('ws://localhost:13001/mcp');

    await client.init();
    expect(client.connected).toBe(false);
    expect(client.getAvailableTools()).toEqual([]);

    const tools = await client.awaitTools();

    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(client.connected).toBe(true);
    expect(tools.map((tool) => tool.name)).toEqual(['read_file']);
  });
});
