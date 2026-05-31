interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number;
  method: string;
  params?: Record<string, unknown>;
}

const tools = [
  {
    name: 'echo',
    description: 'Return the provided message verbatim. Use as a low-risk MCP connectivity smoke test.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Text to echo back.' },
      },
      required: ['message'],
    },
  },
];

function writeResponse(id: number | undefined, result?: unknown, error?: { code: number; message: string }): void {
  if (id === undefined) return;
  process.stdout.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id,
    ...(error ? { error } : { result }),
  })}\n`);
}

function handleRequest(request: JsonRpcRequest): void {
  if (request.method === 'initialize') {
    writeResponse(request.id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'gemini-echo-mcp', version: '1.0.0' },
    });
    return;
  }

  if (request.method === 'notifications/initialized') return;

  if (request.method === 'tools/list') {
    writeResponse(request.id, { tools });
    return;
  }

  if (request.method === 'tools/call') {
    const params = request.params || {};
    if (params.name !== 'echo') {
      writeResponse(request.id, undefined, { code: -32602, message: `Unknown echo MCP tool: ${String(params.name)}` });
      return;
    }
    const args = params.arguments && typeof params.arguments === 'object'
      ? params.arguments as Record<string, unknown>
      : {};
    const message = typeof args.message === 'string' ? args.message : JSON.stringify(args);
    writeResponse(request.id, { content: [{ type: 'text', text: message }] });
    return;
  }

  writeResponse(request.id, undefined, { code: -32601, message: `Unknown method: ${request.method}` });
}

process.stdin.setEncoding('utf8');
let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      handleRequest(JSON.parse(line) as JsonRpcRequest);
    } catch (error) {
      writeResponse(0, undefined, { code: -32700, message: error instanceof Error ? error.message : String(error) });
    }
  }
});
