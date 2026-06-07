import { afterEach, describe, expect, test } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';

const children: ChildProcessWithoutNullStreams[] = [];

afterEach(() => {
  for (const child of children.splice(0)) {
    if (!child.killed) child.kill();
  }
});

function startEchoServer(): ChildProcessWithoutNullStreams {
  const child = spawn(process.execPath, [
    '--import',
    'tsx',
    path.join(process.cwd(), 'src/server/echo-mcp-server.ts'),
  ], { stdio: ['pipe', 'pipe', 'pipe'] });
  children.push(child);
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (data) => {
    const text = String(data);
    // Ignore benign Node runtime notices (e.g. tsx's module.register() DeprecationWarning,
    // ExperimentalWarning) written to stderr; they are not echo-server errors.
    if (/\(node:\d+\)/.test(text) || /(Deprecation|Experimental)Warning/.test(text)) return;
    throw new Error(`echo server stderr: ${text}`);
  });
  return child;
}

function request(child: ChildProcessWithoutNullStreams, method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1_000_000_000);
    const timeout = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 5_000);
    const onData = (data: Buffer) => {
      for (const line of data.toString('utf8').split('\n')) {
        if (!line.trim()) continue;
        const response = JSON.parse(line) as Record<string, unknown>;
        if (response.id === id) {
          clearTimeout(timeout);
          child.stdout.off('data', onData);
          resolve(response);
        }
      }
    };
    child.stdout.on('data', onData);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

describe('echo MCP server', () => {
  test('speaks the project line-delimited MCP protocol', async () => {
    const child = startEchoServer();

    const init = await request(child, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'test', version: '1' },
    });
    const tools = await request(child, 'tools/list');
    const called = await request(child, 'tools/call', { name: 'echo', arguments: { message: 'hello' } });

    expect(init.result).toMatchObject({ serverInfo: { name: 'gemini-echo-mcp' } });
    expect(tools.result).toMatchObject({ tools: [{ name: 'echo' }] });
    expect(called.result).toMatchObject({ content: [{ type: 'text', text: 'hello' }] });
  });
});
