/**
 * GEMINI MCP Backend Server
 * Provides WebSocket interface to MCP tools including Desktop Commander
 * Runs on port 13001, interfaces with Gemini agent
 *
 * Architecture: This module is now purely responsible for MCP WebSocket
 * proxy handling. All client-facing REST routes have been extracted into
 * src/lib/api-routes.ts to isolate concerns and reduce single-point-of-failure
 * risk. If the MCP proxy loop locks up, the REST API remains responsive.
 */

import 'dotenv/config';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import { promises as fs } from 'fs';
import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import apiRoutes, { setMcpContext, type McpContext } from '../lib/api-routes';
import { dispatchJules } from './jules-agent';

const execAsync = promisify(exec);

// ── Desktop Commander MCP Integration ──────────────────────────────────

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface DCRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface DCResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

class DesktopCommanderSubprocess {
  private proc: ChildProcess | null = null;
  private messageId = 0;
  private pendingRequests = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private initialized = false;
  private toolCache: ToolDefinition[] = [];
  private initPromise: Promise<void> | null = null;

  async start(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._doStart();
    return this.initPromise;
  }

  private async _doStart(): Promise<void> {
    const dcPath = '/Applications/Desktop Commander.app/Contents/Resources/bundled-mcpb/dist/index.js';

    try {
      // Verify Desktop Commander exists
      await fs.access(dcPath);

      this.proc = spawn('node', [dcPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, MCP_DXT: 'true', NODE_ENV: 'production' },
      });

      this.proc.stdout?.setEncoding('utf8');
      this.proc.stderr?.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.log('[Desktop Commander]', msg);
      });

      this.proc.on('error', (err) => {
        console.error('[Desktop Commander] Process error:', err);
      });

      this.proc.on('exit', (code) => {
        console.log(`[Desktop Commander] Process exited with code ${code}`);
        this.proc = null;
        this.initialized = false;
      });

      // Handle responses - accumulate data until we have complete lines
      let buffer = '';
      this.proc.stdout?.on('data', (data: string) => {
        buffer += data;
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const resp = JSON.parse(line) as DCResponse;
            console.log('[Desktop Commander] Response:', JSON.stringify(resp).slice(0, 100));
            if (resp.id && this.pendingRequests.has(resp.id)) {
              const { resolve, reject } = this.pendingRequests.get(resp.id)!;
              this.pendingRequests.delete(resp.id);
              if (resp.error) {
                console.error('[Desktop Commander] Error response:', resp.error);
                reject(new Error(resp.error.message));
              } else {
                resolve(resp.result);
              }
            }
          } catch (e) {
            console.warn('[Desktop Commander] Parse error for line:', line.slice(0, 100));
          }
        }
      });

      // Give Desktop Commander time to start
      await new Promise(resolve => setTimeout(resolve, 500));

      // Initialize Desktop Commander
      console.log('[Desktop Commander] Sending initialize...');
      try {
        const initResult = await this.sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {}, resources: {}, prompts: {} },
          clientInfo: { name: 'GEMINI-for-MacOS', version: '1.0.0' },
        });
        console.log('[Desktop Commander] Initialize result:', JSON.stringify(initResult).slice(0, 200));
      } catch (e) {
        console.error('[Desktop Commander] Initialize failed:', e);
        // Continue anyway - Desktop Commander might work without full init
      }

      // Try to get tool list
      try {
        const toolResult = (await this.sendRequest('tools/list', {})) as { tools: ToolDefinition[] };
        this.toolCache = toolResult.tools || [];
        this.initialized = true;
        console.log(`[Desktop Commander] Connected with ${this.toolCache.length} tools`);
      } catch (e) {
        console.error('[Desktop Commander] tools/list failed:', e);
        // Continue with empty tools - fallback will be used
      }
    } catch (error) {
      console.error('[Desktop Commander] Failed to start:', error);
      // Don't throw - allow MCP server to run with fallback tools
    }
  }

  private sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.proc || !this.proc.stdin) {
        reject(new Error('Desktop Commander not running'));
        return;
      }

      const id = ++this.messageId;
      this.pendingRequests.set(id, { resolve, reject });

      const req: DCRequest = { jsonrpc: '2.0', id, method, params };
      this.proc.stdin.write(JSON.stringify(req) + '\n');

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  getTools(): ToolDefinition[] {
    return this.toolCache;
  }

  isReady(): boolean {
    return this.initialized && this.proc !== null;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.isReady()) {
      throw new Error('Desktop Commander not connected');
    }

    const result = await this.sendRequest('tools/call', { name, arguments: args });

    // Normalize response to MCP format
    if (result && typeof result === 'object' && 'content' in result) {
      return result;
    }
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
}

// ── Generic stdio MCP Client ───────────────────────────────────────────

class StdioMcpClient {
  private proc: ChildProcess | null = null;
  private messageId = 0;
  private pendingRequests = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private initialized = false;
  private toolCache: ToolDefinition[] = [];
  private initPromise: Promise<void> | null = null;

  constructor(
    private name: string,
    private command: string,
    private args: string[] = [],
    private env: Record<string, string> = {},
  ) {}

  async start(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._doStart();
    return this.initPromise;
  }

  private async _doStart(): Promise<void> {
    try {
      this.proc = spawn(this.command, this.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...this.env },
      });

      this.proc.stdout?.setEncoding('utf8');
      this.proc.stderr?.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.log(`[MCP:${this.name}]`, msg);
      });

      this.proc.on('error', (err) => {
        console.error(`[MCP:${this.name}] Process error:`, err);
      });

      this.proc.on('exit', (code) => {
        console.log(`[MCP:${this.name}] Process exited with code ${code}`);
        this.proc = null;
        this.initialized = false;
      });

      let buffer = '';
      this.proc.stdout?.on('data', (data: string) => {
        buffer += data;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const resp = JSON.parse(line) as DCResponse;
            if (resp.id && this.pendingRequests.has(resp.id)) {
              const { resolve, reject } = this.pendingRequests.get(resp.id)!;
              this.pendingRequests.delete(resp.id);
              if (resp.error) reject(new Error(resp.error.message));
              else resolve(resp.result);
            }
          } catch {
            console.warn(`[MCP:${this.name}] Ignoring non-JSON stdout:`, line.slice(0, 100));
          }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 250));

      try {
        await this.sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {}, resources: {}, prompts: {} },
          clientInfo: { name: 'GEMINI-for-MacOS', version: '1.0.0' },
        });
        this.sendNotification('notifications/initialized', {});
      } catch (e) {
        console.error(`[MCP:${this.name}] initialize failed:`, e);
      }

      const toolResult = (await this.sendRequest('tools/list', {})) as { tools: ToolDefinition[] };
      this.toolCache = toolResult.tools || [];
      this.initialized = true;
      console.log(`[MCP:${this.name}] Connected with ${this.toolCache.length} tools`);
    } catch (error) {
      console.error(`[MCP:${this.name}] Failed to start:`, error);
    }
  }

  private sendNotification(method: string, params?: Record<string, unknown>): void {
    if (!this.proc?.stdin) return;
    this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  private sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.proc || !this.proc.stdin) {
        reject(new Error(`${this.name} not running`));
        return;
      }

      const id = ++this.messageId;
      this.pendingRequests.set(id, { resolve, reject });
      this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`${this.name} request timeout`));
        }
      }, 30000);
    });
  }

  getName(): string {
    return this.name;
  }

  getTools(): ToolDefinition[] {
    return this.toolCache;
  }

  isReady(): boolean {
    return this.initialized && this.proc !== null;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.isReady()) throw new Error(`${this.name} not connected`);
    const result = await this.sendRequest('tools/call', { name, arguments: args });
    if (result && typeof result === 'object' && 'content' in result) return result;
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
}

// ── Streamable HTTP MCP Client ─────────────────────────────────────────
// Connects to remote MCP servers using the Streamable HTTP transport
// (POST-based with SSE responses). This is the transport used by
// Tavily and other hosted MCP services.
//
// Protocol: POST JSON-RPC requests to the server URL with
// Accept: application/json, text/event-stream. Server responds with
// SSE events containing JSON-RPC responses.

class SSEMcpClient {
  private messageId = 0;
  private initialized = false;
  private toolCache: ToolDefinition[] = [];
  private initPromise: Promise<void> | null = null;
  private sessionUrl = '';

  constructor(
    private name: string,
    private serverUrl: string,
  ) {}

  async start(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._doStart();
    return this.initPromise;
  }

  private async _doStart(): Promise<void> {
    try {
      // Initialize the MCP session
      this.sessionUrl = this.serverUrl;
      try {
        const initResult = await this.sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {}, resources: {}, prompts: {} },
          clientInfo: { name: 'GEMINI-for-MacOS', version: '1.0.0' },
        });
        console.log(`[SSE:${this.name}] Initialized:`, JSON.stringify(initResult).slice(0, 150));
      } catch (e) {
        console.warn(`[SSE:${this.name}] Initialize failed:`, e);
        return;
      }

      // Load tool list
      try {
        const toolResult = (await this.sendRequest('tools/list', {})) as { tools: ToolDefinition[] };
        this.toolCache = toolResult.tools || [];
        this.initialized = true;
        console.log(`[SSE:${this.name}] Connected with ${this.toolCache.length} tools`);
      } catch (e) {
        console.error(`[SSE:${this.name}] tools/list failed:`, e);
      }
    } catch (error) {
      console.error(`[SSE:${this.name}] Failed to start:`, error);
    }
  }

  private async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = ++this.messageId;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params: params || {},
    };

    const response = await fetch(this.sessionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`SSE POST failed: ${response.status} - ${text.slice(0, 200)}`);
    }

    const contentType = response.headers.get('content-type') || '';

    // Handle SSE response (text/event-stream)
    if (contentType.includes('text/event-stream')) {
      return this.parseSSEResponse(response, id);
    }

    // Handle direct JSON response
    if (contentType.includes('application/json')) {
      const data = await response.json() as { id?: number; result?: unknown; error?: { message: string } };
      if (data.error) {
        throw new Error(data.error.message || 'SSE MCP Error');
      }
      return data.result;
    }

    // Fallback: try to parse as text/event-stream regardless of content-type
    return this.parseSSEResponse(response, id);
  }

  private async parseSSEResponse(response: Response, expectedId: number): Promise<unknown> {
    const text = await response.text();
    const lines = text.split('\n');

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data) continue;

      try {
        const parsed = JSON.parse(data) as { id?: number; result?: unknown; error?: { message: string } };
        if (parsed.id === expectedId) {
          if (parsed.error) {
            throw new Error(parsed.error.message || 'SSE MCP Error');
          }
          return parsed.result;
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes('SSE MCP Error')) throw e;
        // Ignore non-JSON data lines
      }
    }

    throw new Error(`[SSE:${this.name}] No response found for request ${expectedId}`);
  }

  getName(): string {
    return this.name;
  }

  getTools(): ToolDefinition[] {
    return this.toolCache;
  }

  isReady(): boolean {
    return this.initialized;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.isReady()) {
      throw new Error(`SSE:${this.name} not connected`);
    }
    const result = await this.sendRequest('tools/call', { name, arguments: args });
    // Normalize response to MCP format
    if (result && typeof result === 'object' && 'content' in (result as object)) {
      return result;
    }
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }

  stop(): void {
    this.initialized = false;
  }
}

// ── MCP Server ─────────────────────────────────────────────────────────

interface MCPRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

class MCPServer {
  private app = express();
  private wss: WebSocketServer | null = null;
  private port = 13001;
  private desktopCommander = new DesktopCommanderSubprocess();
  private stdioClients: StdioMcpClient[] = [];
  private sseClients: SSEMcpClient[] = [];
  private stdioRegistry = new Map<string, { command: string; args: string[]; env: Record<string, string> }>();

  constructor() {
    this.setupExpress();
    // Start Desktop Commander subprocess
    this.desktopCommander.start().catch((err) => {
      console.error('[MCP] Desktop Commander startup failed:', err);
    });
    // Load project-local MCP registry without starting those servers.
    // Servers are spawned lazily only when list_mcp_server_tools/call_mcp_tool
    // targets a specific server.
    this.loadProjectMcpRegistry().catch((err) => {
      console.error('[MCP] Project MCP registry load failed:', err);
    });
    // Auto-start SSE MCP servers from environment config
    this.startSSEServers();

    // Wire the extracted API routes into this server
    setMcpContext({
      isDesktopCommanderReady: () => this.desktopCommander.isReady(),
      getDesktopCommanderToolCount: () => this.desktopCommander.getTools().length,
      getDesktopCommanderTools: () => this.desktopCommander.getTools(),
      getGatewayTools: () => this.getGatewayTools(),
      getSseClients: () => [...this.stdioClients, ...this.sseClients],
      callTool: (name, args) => this.callTool(name, args),
      detectLocalMcpServers: () => this.detectLocalMcpServers(),
      addSSEServer: (name, url) => this.addSSEServer(name, url),
    });
  }

  private async loadProjectMcpRegistry(): Promise<void> {
    const configPath = path.join(process.cwd(), '.mcp.json');

    try {
      const raw = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(raw) as {
        mcpServers?: Record<string, {
          command?: string;
          args?: string[];
          env?: Record<string, string>;
          enabled?: boolean;
          type?: string;
          url?: string;
        }>;
      };

      const servers = config.mcpServers || {};
      for (const [name, cfg] of Object.entries(servers)) {
        if (cfg.enabled === false || typeof cfg.command !== 'string') continue;
        this.stdioRegistry.set(name, {
          command: cfg.command,
          args: cfg.args || [],
          env: cfg.env || {},
        });
      }

      console.log(`[MCP] Project .mcp.json registry loaded: ${this.stdioRegistry.size} lazy stdio servers`);
    } catch (error) {
      console.warn(`[MCP] No project .mcp.json registry loaded: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async ensureStdioClient(name: string): Promise<StdioMcpClient> {
    const existing = this.stdioClients.find(client => client.getName() === name);
    if (existing) return existing;

    const cfg = this.stdioRegistry.get(name);
    if (!cfg) throw new Error(`Unknown MCP server '${name}'. Use list_mcp_servers first.`);

    const client = new StdioMcpClient(name, cfg.command, cfg.args, cfg.env);
    this.stdioClients.push(client);
    await client.start();
    return client;
  }

  private async startSSEServers(): Promise<void> {
    // Check for SSE servers in environment variable
    const sseConfig = process.env.MCP_SSE_SERVERS;
    if (sseConfig) {
      try {
        const servers = JSON.parse(sseConfig) as Array<{ name: string; url: string }>;
        for (const server of servers) {
          await this.addSSEServer(server.name, server.url);
        }
      } catch (e) {
        console.error('[MCP] Failed to parse MCP_SSE_SERVERS env:', e);
      }
    }

    // Also check settings in the app's config
    try {
      const settingsPath = path.join(os.homedir(), '.gemini-for-macos', 'mcp-sse-servers.json');
      const raw = await fs.readFile(settingsPath, 'utf-8');
      const servers = JSON.parse(raw) as Array<{ name: string; url: string; enabled?: boolean }>;
      for (const server of servers) {
        if (server.enabled !== false) {
          await this.addSSEServer(server.name, server.url);
        }
      }
    } catch {
      // No config file, that's fine
    }
  }

  async addSSEServer(name: string, url: string): Promise<{ tools: number; connected: boolean }> {
    const existing = this.sseClients.find(client => client.getName() === name);
    if (existing) {
      return { tools: existing.getTools().length, connected: existing.isReady() };
    }

    const client = new SSEMcpClient(name, url);
    this.sseClients.push(client);
    await client.start();

    const toolCount = client.getTools().length;
    console.log(`[MCP] SSE server '${name}': ${client.isReady() ? 'connected' : 'failed'} with ${toolCount} tools`);
    return { tools: toolCount, connected: client.isReady() };
  }

  private async configureServers(servers?: Array<{
    name?: string;
    id?: string;
    type?: 'stdio' | 'websocket' | 'sse';
    command?: string;
    args?: string[];
    url?: string;
    enabled?: boolean;
  }>): Promise<{ status: string; started: number }> {
    if (!Array.isArray(servers)) return { status: 'ignored', started: 0 };

    let started = 0;
    for (const server of servers) {
      if (server.enabled === false) continue;
      const name = server.name || server.id;
      if (!name) continue;

      if (server.type === 'sse' && server.url) {
        await this.addSSEServer(name, server.url);
        started += 1;
      } else if (server.type === 'stdio' && server.command) {
        this.stdioRegistry.set(name, { command: server.command, args: server.args || [], env: {} });
        started += 1;
      }
    }

    return { status: 'configured', started };
  }

  private setupExpress() {
    this.app.use(express.json());
    this.app.use(express.text({ limit: '100mb' }));

    // CORS for frontend requests. This must be registered before routes so
    // GEMINI can auto-detect and configure MCP from the browser UI.
    this.app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1):13000$/.test(origin)) {
        res.header('Access-Control-Allow-Origin', origin || 'http://localhost:13000');
      }
      res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
      }
      next();
    });

    // ── Mount extracted API routes ──────────────────────────────────────
    // All client-facing FLUM endpoints are now in src/lib/api-routes.ts,
    // keeping this module focused on MCP WebSocket proxy handling.
    this.app.use('/', apiRoutes);

    // MCP WebSocket upgrade (stays here — this is the core MCP concern)
    this.app.get('/mcp', (req, res) => {
      res.status(400).send('Use WebSocket');
    });

  }

  private async detectLocalMcpServers(): Promise<Array<{
    name: string;
    source: string;
    type: 'stdio' | 'websocket' | 'sse';
    command?: string;
    args?: string[];
    url?: string;
    enabled: boolean;
  }>> {
    const home = os.homedir();
    const discovered: Array<{
      name: string;
      source: string;
      type: 'stdio' | 'websocket' | 'sse';
      command?: string;
      args?: string[];
      url?: string;
      enabled: boolean;
    }> = [];

    const configPaths = [
      { file: path.join(process.cwd(), '.mcp.json'), source: 'GEMINI Harness (project)' },
      { file: path.join(home, '.gemini', 'settings.json'), source: 'Gemini CLI' },
      { file: path.join(home, '.claude', 'settings.json'), source: 'Claude Code (global)' },
      { file: path.join(home, '.claude', 'settings.local.json'), source: 'Claude Code (local)' },
    ];

    // Load enablement overrides from Gemini CLI
    let enablement: Record<string, { enabled: boolean }> = {};
    try {
      const raw = await fs.readFile(path.join(home, '.gemini', 'mcp-server-enablement.json'), 'utf-8');
      enablement = JSON.parse(raw);
    } catch { /* no enablement file */ }

    for (const { file, source } of configPaths) {
      try {
        const raw = await fs.readFile(file, 'utf-8');
        const config = JSON.parse(raw);
        const servers = config.mcpServers || {};

        if (typeof servers !== 'object') continue;

        for (const [name, cfg] of Object.entries(servers)) {
          const c = cfg as Record<string, unknown>;
          const type = c.command ? 'stdio' : (c.url ? 'websocket' : 'sse');
          const enableKey = name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
          const enabledOverride = enablement[enableKey] ?? enablement[name];
          const enabled = enabledOverride !== undefined ? enabledOverride.enabled : true;

          discovered.push({
            name,
            source,
            type: type as 'stdio' | 'websocket' | 'sse',
            command: c.command as string | undefined,
            args: c.args as string[] | undefined,
            url: c.url as string | undefined,
            enabled,
          });
        }
      } catch { /* file not found or invalid JSON */ }
    }

    return discovered;
  }

  public start(): void {
    const server = this.app.listen(this.port, '127.0.0.1', () => {
      console.log(`✓ GEMINI MCP Server running on port ${this.port}`);
    });

    this.wss = new WebSocketServer({ server });

    // Prevent unhandled error from crashing the process
    this.wss.on('error', (error: Error) => {
      console.error('[MCP] WebSocketServer error (non-fatal):', error.message);
    });

    server.on('error', (error: Error) => {
      console.error('[MCP] HTTP server error (non-fatal):', error.message);
    });

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('✓ MCP Client connected');

      ws.on('message', async (data: WebSocket.Data) => {
        try {
          const request = JSON.parse(data.toString()) as MCPRequest;
          const response = await this.handleRequest(request);
          ws.send(JSON.stringify(response));
        } catch (error) {
          console.error('MCP Error:', error);
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            id: 0,
            error: {
              code: -32603,
              message: String(error)
            }
          }));
        }
      });

      ws.on('close', () => {
        console.log('✓ MCP Client disconnected');
      });

      ws.on('error', (error: Error) => {
        console.error('WebSocket error:', error);
      });
    });
  }

  private async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    const { method, params, id } = request;

    try {
      let result: unknown;

      if (method === 'tools/call') {
        const toolName = params.name as string;
        const args = params.arguments as Record<string, unknown>;

        result = await this.callTool(toolName, args);
      } else if (method === 'mcp/configure_servers') {
        result = await this.configureServers(params.servers as Array<{
          name?: string;
          id?: string;
          type?: 'stdio' | 'websocket' | 'sse';
          command?: string;
          args?: string[];
          url?: string;
          enabled?: boolean;
        }> | undefined);
      } else if (method === 'tools/list') {
        result = this.listTools();
      } else {
        throw new Error(`Unknown method: ${method}`);
      }

      return {
        jsonrpc: '2.0',
        id,
        result
      };
    } catch (error) {
      console.error(`Tool error: ${error}`);
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: String(error)
        }
      };
    }
  }

  private getGatewayTools(): ToolDefinition[] {
    return [
      {
        name: 'list_mcp_servers',
        description: 'List project-local MCP servers available for lazy loading. Does not start any server.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'list_mcp_server_tools',
        description: 'Lazy-load one named MCP server and return its tool schemas. Use before call_mcp_tool when you need a server-specific tool.',
        inputSchema: {
          type: 'object',
          properties: { server: { type: 'string', description: 'MCP server name from list_mcp_servers' } },
          required: ['server'],
        },
      },
      {
        name: 'call_mcp_tool',
        description: 'Call a tool on one lazy-loaded project MCP server. The server starts on demand and remains cached for the session.',
        inputSchema: {
          type: 'object',
          properties: {
            server: { type: 'string', description: 'MCP server name from list_mcp_servers' },
            tool: { type: 'string', description: 'Tool name exposed by that server' },
            arguments: { type: 'object', description: 'Tool arguments object' },
          },
          required: ['server', 'tool'],
        },
      },
    ];
  }

  private listTools() {
    // Keep native Gemini tool declarations small. The project MCP fleet is
    // exposed through three gateway tools; individual MCP servers and their
    // 147+ schemas are loaded only when requested.
    const allTools: ToolDefinition[] = [...this.getGatewayTools()];

    // Desktop Commander tools (preferred)
    const dcTools = this.desktopCommander.getTools();
    if (dcTools.length > 0) {
      console.log(`[MCP] Using ${dcTools.length} Desktop Commander tools`);
      allTools.push(...dcTools);
    }

    // SSE MCP client tools
    for (const client of this.sseClients) {
      if (client.isReady()) {
        const tools = client.getTools();
        console.log(`[MCP] Using ${tools.length} tools from SSE:${client.getTools().length > 0 ? 'connected' : 'pending'}`);
        allTools.push(...tools);
      }
    }
    allTools.push({
      name: 'dispatch_jules',
      description: 'Dispatch Jules, a single-instance MiniMax software-engineering assistant for feature checks, code reviews, commit reviews, and Git Steward verification. Use when Douglas asks for Jules, when reviewing code/commits, or when checking what features Douglas needs today.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['feature_check', 'code_review', 'commit_review', 'git_steward'],
            description: 'Jules operating mode for this dispatch.',
          },
          task: {
            type: 'string',
            description: 'Specific task Jules should perform.',
          },
          repositoryContext: {
            type: 'string',
            description: 'Concrete repo evidence, diff summary, test output, or user context Jules should review.',
          },
        },
        required: ['mode', 'task'],
      },
    });


    if (this.desktopCommander.getTools().length === 0) {
      // Fallback while Desktop Commander initializes. The lazy MCP gateway
      // tools are already present, so the model can still inspect/load the
      // project MCP fleet without receiving every server schema by default.
      allTools.push(
        { name: 'read_file', description: 'Read a file from the local file system', inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'File path to read' } }, required: ['path'] } },
        { name: 'write_file', description: 'Write content to a file on the local file system', inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'File path to write' }, content: { type: 'string', description: 'Content to write' } }, required: ['path', 'content'] } },
        { name: 'list_directory', description: 'List files and directories in a path', inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Directory path to list' } }, required: ['path'] } },
        { name: 'execute_command', description: 'Execute a shell command (with permission)', inputSchema: { type: 'object', properties: { command: { type: 'string', description: 'Command to execute' } }, required: ['command'] } },
        { name: 'delete_file', description: 'Delete a file from the file system', inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'File path to delete' } }, required: ['path'] } },
        { name: 'create_directory', description: 'Create a directory', inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Directory path to create' } }, required: ['path'] } },
        { name: 'file_info', description: 'Get file information (size, modified time, etc.)', inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'File path to get info for' } }, required: ['path'] } },
        { name: 'start_process', description: 'Start an interactive terminal process', inputSchema: { type: 'object', properties: { command: { type: 'string', description: 'Command to execute' } }, required: ['command'] } },
        { name: 'interact_with_process', description: 'Send input to a running process and get response', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, input: { type: 'string' } }, required: ['sessionId', 'input'] } },
        { name: 'read_process_output', description: 'Read output from a running process', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
        { name: 'force_terminate', description: 'Force terminate a running session', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
        { name: 'list_sessions', description: 'List all active terminal sessions', inputSchema: { type: 'object', properties: {} } },
        { name: 'list_processes', description: 'List all running system processes', inputSchema: { type: 'object', properties: {} } },
        { name: 'kill_process', description: 'Terminate a process by PID', inputSchema: { type: 'object', properties: { pid: { type: 'number', description: 'Process ID to terminate' } }, required: ['pid'] } },
        { name: 'move_file', description: 'Move or rename files and directories', inputSchema: { type: 'object', properties: { source: { type: 'string' }, destination: { type: 'string' } }, required: ['source', 'destination'] } },
        { name: 'get_config', description: 'Get Desktop Commander configuration settings', inputSchema: { type: 'object', properties: {} } }
      );
    }

    return { tools: allTools };
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    // Lazy MCP gateway tools. These keep the model's default tool context small
    // and only load one project MCP server when explicitly requested.
    if (name === 'list_mcp_servers') {
      const servers = Array.from(this.stdioRegistry.keys()).map(server => {
        const client = this.stdioClients.find(c => c.getName() === server);
        return {
          name: server,
          loaded: !!client,
          connected: client?.isReady() ?? false,
          cachedToolCount: client?.getTools().length ?? 0,
        };
      });
      return { content: [{ type: 'text', text: JSON.stringify({ servers }, null, 2) }] };
    }

    if (name === 'list_mcp_server_tools') {
      const server = String(args.server || '');
      const client = await this.ensureStdioClient(server);
      return { content: [{ type: 'text', text: JSON.stringify({ server, tools: client.getTools() }, null, 2) }] };
    }

    if (name === 'call_mcp_tool') {
      const server = String(args.server || '');
      const tool = String(args.tool || '');
      const toolArgs = (args.arguments && typeof args.arguments === 'object')
        ? args.arguments as Record<string, unknown>
        : {};
      const client = await this.ensureStdioClient(server);
      return client.callTool(tool, toolArgs);
    }

    if (name === 'dispatch_jules') {
      const mode = String(args.mode || 'code_review');
      if (!['feature_check', 'code_review', 'commit_review', 'git_steward'].includes(mode)) {
        throw new Error(`Invalid Jules mode: ${mode}`);
      }

      const result = await dispatchJules({
        mode: mode as 'feature_check' | 'code_review' | 'commit_review' | 'git_steward',
        task: String(args.task || ''),
        repositoryContext: typeof args.repositoryContext === 'string' ? args.repositoryContext : undefined,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    // Try Desktop Commander first if connected
    if (this.desktopCommander.isReady()) {
      const dcToolNames = this.desktopCommander.getTools().map(t => t.name);
      if (dcToolNames.includes(name)) {
        try {
          const result = await this.desktopCommander.callTool(name, args);
          console.log(`[MCP] Desktop Commander executed: ${name}`);
          return result;
        } catch (err) {
          console.warn(`[MCP] Desktop Commander tool '${name}' failed, using fallback:`, err);
        }
      }
    }

    // Try project-local stdio MCP clients
    for (const client of this.stdioClients) {
      if (client.isReady()) {
        const toolNames = client.getTools().map(t => t.name);
        if (toolNames.includes(name)) {
          try {
            const result = await client.callTool(name, args);
            console.log(`[MCP] stdio client '${client.getName()}' executed: ${name}`);
            return result;
          } catch (err) {
            console.warn(`[MCP] stdio client '${client.getName()}' tool '${name}' failed:`, err);
            throw err;
          }
        }
      }
    }

    // Try SSE MCP clients
    for (const client of this.sseClients) {
      if (client.isReady()) {
        const toolNames = client.getTools().map(t => t.name);
        if (toolNames.includes(name)) {
          try {
            const result = await client.callTool(name, args);
            console.log(`[MCP] SSE client executed: ${name}`);
            return result;
          } catch (err) {
            console.warn(`[MCP] SSE client tool '${name}' failed:`, err);
            throw err;
          }
        }
      }
    }

    // Built-in tool fallback
    switch (name) {
      case 'read_file':
        return this.readFile(args.path as string);

      case 'write_file':
        return this.writeFile(args.path as string, args.content as string);

      case 'list_directory':
        return this.listDirectory(args.path as string);

      case 'execute_command':
        return this.executeCommand(args.command as string);

      case 'delete_file':
        return this.deleteFile(args.path as string);

      case 'create_directory':
        return this.createDirectory(args.path as string);

      case 'file_info':
        return this.getFileInfo(args.path as string);

      // Forward terminal session management to Desktop Commander if available
      case 'start_process':
      case 'interact_with_process':
      case 'read_process_output':
      case 'force_terminate':
      case 'list_sessions':
      case 'list_processes':
      case 'kill_process':
      case 'move_file':
      case 'get_config':
        if (!this.desktopCommander.isReady()) {
          throw new Error(`Tool '${name}' requires Desktop Commander MCP. Please wait for it to initialize.`);
        }
        return await this.desktopCommander.callTool(name, args);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async readFile(filePath: string): Promise<{ content: Array<{ type: string; text: string }> }> {
    const content = await fs.readFile(filePath, 'utf-8');
    return {
      content: [
        {
          type: 'text',
          text: content
        }
      ]
    };
  }

  private async writeFile(filePath: string, content: string): Promise<{ success: boolean }> {
    // Create directory if it doesn't exist
    const dir = path.dirname(filePath);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory may already exist
    }

    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true };
  }

  private async listDirectory(dirPath: string): Promise<{ entries: Array<{ name: string; type: string }> }> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return {
      entries: entries.map(entry => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file'
      }))
    };
  }

  private async executeCommand(command: string): Promise<{ stdout: string; stderr: string }> {
    const { stdout, stderr } = await execAsync(command, {
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 10
    });
    return { stdout, stderr };
  }

  private async deleteFile(filePath: string): Promise<{ success: boolean }> {
    await fs.unlink(filePath);
    return { success: true };
  }

  private async createDirectory(dirPath: string): Promise<{ success: boolean }> {
    await fs.mkdir(dirPath, { recursive: true });
    return { success: true };
  }

  private async getFileInfo(filePath: string): Promise<{
    size: number;
    modified: string;
    isDirectory: boolean;
  }> {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      modified: stats.mtime.toISOString(),
      isDirectory: stats.isDirectory()
    };
  }
}

// Start server if running directly
const server = new MCPServer();
server.start();

export { MCPServer };
