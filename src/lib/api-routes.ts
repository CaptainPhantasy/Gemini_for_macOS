/**
 * GEMINI for MacOS - LLM-First API Endpoints
 *
 * FLUM (Floyd's Labs Unified Methodology) compliant REST API.
 * Extracted from mcp-server.ts to isolate client-facing routing
 * from the MCP WebSocket proxy layer. This keeps the local process
 * management space (mcp-server.ts) dedicated to a single job:
 * handling local file and command orchestration over the WebSocket
 * proxy link (ws://localhost:13001/mcp).
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// ── FLUM Response Builder ─────────────────────────────────────────────────

interface FLUMResponse {
  status: 'success' | 'failure' | 'pending';
  result: string;
  hint: string;
  actions_available: string[];
  tip?: string;
  metadata: {
    latency_ms: number;
    trace_id: string;
    tool?: string;
    [key: string]: unknown;
  };
  advanced: Record<string, unknown> | null;
}

function generateTraceId(): string {
  return `flum_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function flumResponse(
  status: 'success' | 'failure' | 'pending',
  result: string,
  hint: string,
  actionsAvailable: string[],
  options?: {
    tool?: string;
    tip?: string;
    metadata?: Record<string, unknown>;
    advanced?: Record<string, unknown>;
  }
): FLUMResponse {
  const traceId = generateTraceId();
  const startTime = options?.metadata?.startTime as number || Date.now();

  return {
    status,
    result,
    hint,
    actions_available: actionsAvailable,
    ...(options?.tip ? { tip: options.tip } : {}),
    metadata: {
      latency_ms: Date.now() - startTime,
      trace_id: traceId,
      ...(options?.tool ? { tool: options.tool } : {}),
      ...(options?.metadata || {}),
    },
    advanced: options?.advanced || null,
  };
}

// ── Route Registration ──────────────────────────────────────────────────────
// Accepts a context object so the router can access MCP server state
// without importing the MCPServer class directly (avoids circular deps).

export interface McpContext {
  isDesktopCommanderReady: () => boolean;
  getDesktopCommanderToolCount: () => number;
  getDesktopCommanderTools: () => Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
  getSseClients: () => Array<{ isReady: () => boolean; getTools: () => Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> }>;
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  detectLocalMcpServers: () => Promise<Array<{
    name: string;
    source: string;
    type: 'stdio' | 'websocket' | 'sse';
    command?: string;
    args?: string[];
    url?: string;
    enabled: boolean;
  }>>;
  addSSEServer: (name: string, url: string) => Promise<{ tools: number; connected: boolean }>;
}

let mcpContext: McpContext | null = null;

export function setMcpContext(ctx: McpContext): void {
  mcpContext = ctx;
}

function requireContext(): McpContext {
  if (!mcpContext) throw new Error('MCP context not initialized');
  return mcpContext;
}

// ── Health Check ────────────────────────────────────────────────────────────

router.get('/health', async (_req, res) => {
  const ctx = requireContext();
  res.json(flumResponse(
    'success',
    'API router healthy',
    'Use /api/execute for operations',
    ['GET /api/tools', 'GET /api/diagnostic'],
    { tool: 'health', metadata: { startTime: Date.now() } }
  ));
});

// ── MCP Detection ──────────────────────────────────────────────────────────

router.get('/detect-mcp', async (_req, res) => {
  const ctx = requireContext();
  try {
    const servers = await ctx.detectLocalMcpServers();
    res.json({ servers });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ── Diagnostic ──────────────────────────────────────────────────────────────

router.get('/api/diagnostic', async (req, res) => {
  const ctx = requireContext();
  const startTime = Date.now();
  const includeAdvanced = req.query.include_advanced === 'true';

  const diagnostic = {
    mcp_server: {
      status: ctx.isDesktopCommanderReady() ? 'connected' : 'disconnected',
      url: 'ws://localhost:13001/mcp',
      tools_available: ctx.getDesktopCommanderToolCount(),
    },
    environment: {
      platform: process.platform,
      node_version: process.version,
      uptime_seconds: process.uptime(),
    },
    timestamp: new Date().toISOString(),
  };

  res.json(flumResponse(
    'success',
    `System diagnostic complete. MCP ${ctx.isDesktopCommanderReady() ? 'connected' : 'disconnected'} with ${ctx.getDesktopCommanderToolCount()} tools.`,
    'Use /api/tools to list operations, or /api/execute to perform an action.',
    ['GET /api/tools', 'GET /api/execute'],
    {
      tool: 'diagnostic',
      metadata: { startTime },
      advanced: includeAdvanced ? diagnostic : undefined,
      tip: ctx.isDesktopCommanderReady() ? undefined : 'MCP disconnected. Restart application.',
    }
  ));
});

// ── Tools List ─────────────────────────────────────────────────────────────

router.get('/api/tools', async (_req, res) => {
  const ctx = requireContext();
  const startTime = Date.now();

  // Merge tools from Desktop Commander + SSE clients.
  const allTools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> = [];
  if (ctx.isDesktopCommanderReady()) {
    allTools.push(...ctx.getDesktopCommanderTools());
  }
  for (const client of ctx.getSseClients()) {
    if (client.isReady()) {
      allTools.push(...client.getTools());
    }
  }

  const flumTools = allTools.map(tool => ({
    name: tool.name,
    description: tool.description?.split('\n')[0] || tool.name,
    parameters: Object.keys(tool.inputSchema?.properties || {}),
    required: tool.inputSchema?.required || [],
  }));

  res.json(flumResponse(
    'success',
    `${allTools.length} tools available for file system, process, and web operations.`,
    `Choose a tool and call POST /api/execute with action={tool_name}`,
    allTools.map(t => `POST /api/execute?action=${t.name}`),
    {
      tool: 'list_tools',
      metadata: { startTime, tool_count: allTools.length },
      advanced: { tools: flumTools },
      tip: 'For file operations: read_file, write_file, list_directory. For processes: start_process, list_processes. For web: tavily_search, tavily_extract.',
    }
  ));
});

// ── Desktop Commander Privileges ───────────────────────────────────────────

function extractTextFromMcpResult(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object' && 'content' in result) {
    const content = (result as { content?: Array<{ text?: string }> }).content || [];
    return content.map(item => item.text || '').join('\n');
  }
  return JSON.stringify(result);
}

function parseDesktopCommanderConfig(result: unknown): Record<string, unknown> {
  const text = extractTextFromMcpResult(result);
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    throw new Error('Desktop Commander config response did not include JSON');
  }
  return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
}

router.get('/api/desktop-commander/config', async (_req, res) => {
  const ctx = requireContext();
  const startTime = Date.now();

  try {
    const config = parseDesktopCommanderConfig(await ctx.callTool('get_config', {}));
    res.json(flumResponse(
      'success',
      'Desktop Commander configuration loaded.',
      'Use PATCH /api/desktop-commander/config with {key,value} to change privileges.',
      ['PATCH /api/desktop-commander/config', 'POST /api/execute?action=set_config_value'],
      { tool: 'get_config', metadata: { startTime }, advanced: { config } }
    ));
  } catch (error) {
    res.status(500).json(flumResponse(
      'failure',
      `Could not load Desktop Commander configuration: ${String(error)}`,
      'Ensure the GEMINI MCP server is running and Desktop Commander is connected.',
      ['GET /api/diagnostic'],
      { tool: 'get_config', metadata: { startTime } }
    ));
  }
});

router.patch('/api/desktop-commander/config', async (req, res) => {
  const ctx = requireContext();
  const startTime = Date.now();
  const { key, value } = req.body || {};

  const allowedKeys = new Set([
    'allowedDirectories',
    'blockedCommands',
    'defaultShell',
    'fileReadLineLimit',
    'fileWriteLineLimit',
    'telemetryEnabled',
  ]);

  if (typeof key !== 'string' || !allowedKeys.has(key)) {
    return res.status(400).json(flumResponse(
      'failure',
      'Invalid Desktop Commander config key.',
      `Allowed keys: ${Array.from(allowedKeys).join(', ')}`,
      ['GET /api/desktop-commander/config'],
      { tool: 'set_config_value', metadata: { startTime } }
    ));
  }

  try {
    await ctx.callTool('set_config_value', { key, value, origin: 'ui' });
    const config = parseDesktopCommanderConfig(await ctx.callTool('get_config', {}));
    res.json(flumResponse(
      'success',
      `Desktop Commander ${key} updated.`,
      'Configuration was written through Desktop Commander using origin=ui.',
      ['GET /api/desktop-commander/config'],
      { tool: 'set_config_value', metadata: { startTime }, advanced: { config } }
    ));
  } catch (error) {
    res.status(500).json(flumResponse(
      'failure',
      `Could not update Desktop Commander ${key}: ${String(error)}`,
      'Check the value shape and Desktop Commander connectivity.',
      ['GET /api/desktop-commander/config'],
      { tool: 'set_config_value', metadata: { startTime } }
    ));
  }
});

// ── Execute (One Door In — FLUM Principle 1) ────────────────────────────────

router.post('/api/execute', async (req, res) => {
  const ctx = requireContext();
  const startTime = Date.now();
  const { action, path, content, command, sessionId, pid, destination, input } = req.query;

  if (!action) {
    return res.json(flumResponse(
      'failure',
      'Missing required parameter: action',
      'Specify the action to perform (e.g., read_file, write_file, list_directory)',
      ['GET /api/tools', 'GET /api/diagnostic'],
      { tool: 'execute', metadata: { startTime } }
    ));
  }

  const actionStr = String(action).toLowerCase().trim();

  // Build arguments
  const args: Record<string, unknown> = {};
  if (path) args.path = String(path);
  if (content) args.content = String(content);
  if (command) args.command = String(command);
  if (sessionId) args.sessionId = String(sessionId);
  if (pid) args.pid = parseInt(String(pid), 10);
  if (destination) args.destination = String(destination);
  if (input) args.input = String(input);

  try {
    const result = await ctx.callTool(actionStr, args);

    // Format result
    let resultText = '';
    if (typeof result === 'string') {
      resultText = result;
    } else if (result && typeof result === 'object' && 'content' in result) {
      const r = result as { content?: Array<{ text?: string }> };
      resultText = r.content?.map(c => c.text || '').join('\n') || '';
    } else if (result && typeof result === 'object' && 'entries' in result) {
      const r = result as { entries?: unknown[] };
      resultText = `${(r.entries || []).length} entries found`;
    } else if (result && typeof result === 'object' && 'success' in result) {
      resultText = (result as { success: boolean }).success ? 'Operation completed' : 'Operation failed';
    } else {
      resultText = JSON.stringify(result);
    }

    const hints: Record<string, string> = {
      read_file: 'Read the content above. Use write_file to modify.',
      write_file: 'File written. Use read_file to verify.',
      list_directory: 'Directory listed. Use read_file on specific files.',
      create_directory: 'Directory created. Use list_directory to verify.',
      delete_file: 'File deleted. Cannot be undone.',
      file_info: 'Metadata retrieved. Use read_file for content.',
      execute_command: 'Command executed. Check result above.',
      start_process: 'Process started. Use read_process_output.',
      list_sessions: 'Active sessions listed. Use force_terminate to end.',
      list_processes: 'Running processes listed. Use kill_process to terminate.',
    };

    res.json(flumResponse(
      'success',
      resultText.substring(0, 500),
      hints[actionStr] || 'Action completed. Check result above.',
      ['GET /api/tools', 'GET /api/diagnostic', `POST /api/execute?action=${actionStr}`],
      { tool: actionStr, metadata: { startTime } }
    ));
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    res.json(flumResponse(
      'failure',
      `${actionStr} failed: ${errorMsg}`,
      errorMsg.includes('ENOENT') ? 'Path does not exist. Check path.' :
      errorMsg.includes('denied') ? 'Permission denied. Check autonomy settings.' :
      `For ${actionStr}, ensure path exists and permissions are correct.`,
      ['GET /api/tools', 'GET /api/diagnostic'],
      { tool: actionStr, metadata: { startTime, error: errorMsg } }
    ));
  }
});

// ── Health (System) ────────────────────────────────────────────────────────

router.get('/api/health', async (_req, res) => {
  const ctx = requireContext();
  const startTime = Date.now();
  const isReady = ctx.isDesktopCommanderReady();
  const toolCount = ctx.getDesktopCommanderToolCount();
  const sseToolCount = ctx.getSseClients().reduce((sum, c) => sum + c.getTools().length, 0);

  res.json(flumResponse(
    isReady ? 'success' : 'pending',
    `System ${isReady ? 'healthy' : 'degraded'}. ${toolCount + sseToolCount} tools available.`,
    isReady ? 'Ready for operations.' : 'MCP disconnected. Some features unavailable.',
    ['GET /api/tools', 'GET /api/diagnostic'],
    {
      tool: 'health',
      metadata: { startTime },
      advanced: { status: isReady ? 'healthy' : 'degraded', tools: toolCount + sseToolCount, sse_servers: ctx.getSseClients().map(c => c.isReady()) },
      tip: isReady ? undefined : 'Restart application to reconnect MCP.',
    }
  ));
});

// ── SSE Server Management ──────────────────────────────────────────────────

router.post('/api/sse-server', async (req, res) => {
  const ctx = requireContext();
  const { name, url } = req.body;
  if (!name || !url) {
    return res.json(flumResponse(
      'failure',
      'Missing required parameters: name and url',
      'Provide name and url for the SSE MCP server',
      ['GET /api/tools', 'GET /api/diagnostic'],
      { tool: 'sse_server', metadata: { startTime: Date.now() } }
    ));
  }

  try {
    const result = await ctx.addSSEServer(name, url);
    res.json(flumResponse(
      'success',
      `SSE server '${name}' ${result.connected ? 'connected' : 'failed to connect'} with ${result.tools} tools.`,
      'Use GET /api/tools to see all available tools.',
      ['GET /api/tools', 'GET /api/diagnostic'],
      { tool: 'sse_server', metadata: { startTime: Date.now() }, advanced: result }
    ));
  } catch (error) {
    res.json(flumResponse(
      'failure',
      `Failed to add SSE server: ${error}`,
      'Check the URL and try again.',
      ['GET /api/tools', 'GET /api/diagnostic'],
      { tool: 'sse_server', metadata: { startTime: Date.now() } }
    ));
  }
});

export default router;