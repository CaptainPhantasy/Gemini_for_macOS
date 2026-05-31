/**
 * GEMINI for MacOS — Pre-Flight Validation Middleware
 *
 * Validates tool arguments before they reach the MCP proxy server.
 * Enforces folder-boundary constraints and filters command injection
 * patterns to maintain safety when operating in permissive autonomy
 * modes (auto-accept, yolo).
 *
 * Architecture Roadmap §3d: Pre-Flight Static Analysis Middleware
 */

/**
 * Desktop Commander treats an empty allowedDirectories list as full filesystem
 * access. GEMINI must not add a second, hidden allow-list here; the optional
 * directory lock below is the single source of truth for path scoping.
 */

/** Shell metacharacter patterns that indicate command injection attempts. */
const COMMAND_INJECTION_PATTERNS = [
  /;\s*(rm|del|format|mkfs|dd|shutdown|reboot|halt)/i,          // destructive after semicolon
  /&&\s*(rm|del|format|mkfs|dd|shutdown|reboot|halt)/i,          // destructive after AND
  /\|\s*(rm|del|format|mkfs|dd|shutdown|reboot|halt)/i,          // destructive after pipe
  /\$\([^)]*\)/,                                                   // command substitution
  /`[^`]*`/,                                                       // backtick command substitution
  />\s*\/(dev|etc|proc|sys)\//i,                                   // redirect to system dirs
  /\b(curl|wget)\b.*\|\s*(sh|bash|zsh|fish)/i,                    // remote pipe to shell
  /\b(rm\s+-rf\s+\/|rm\s+-rf\s+~)/i,                             // recursive root/home delete
];

/**
 * Validate path syntax before requests reach the MCP proxy.
 *
 * This intentionally does NOT enforce filesystem roots. Desktop Commander's
 * own `allowedDirectories` setting controls broad filesystem access, and its
 * UI documents that an empty list means full access. GEMINI's optional
 * directory lock is enforced separately in executeTool().
 */
export function validatePath(path: string): string | null {
  if (!path || typeof path !== 'string') return null;

  const resolved = path.startsWith('~') ? path.replace('~', process.env.HOME ?? '/Users') : path;

  // Block path traversal sequences
  if (resolved.includes('..')) {
    // Allow .. only if the resolved path stays within allowed roots
    // (path.resolve would be ideal but we avoid fs sync here)
    const segments = resolved.split('/');
    let depth = 0;
    for (const seg of segments) {
      if (seg === '..') depth--;
      else if (seg && seg !== '.') depth++;
      if (depth < 0) {
        return `Path traversal detected: "${resolved}" escapes above the workspace root.`;
      }
    }
  }

  return null;
}

/**
 * Validate that a shell command does not contain injection patterns.
 * Returns an error message if dangerous patterns are detected, or null if safe.
 */
export function validateCommand(command: string): string | null {
  if (!command || typeof command !== 'string') return null;

  for (const pattern of COMMAND_INJECTION_PATTERNS) {
    if (pattern.test(command)) {
      return `Command injection pattern detected in: "${command.slice(0, 80)}". Blocked for safety.`;
    }
  }

  return null;
}

import { DirectoryLockSettings, McpServerConfig } from '../types';
import { getDirectoryLockViolation } from './directory-lock';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolResult {
  content: Array<{
    type: string;
    text: string;
  }>;
}

/** Maximum delay between reconnection attempts (exponential backoff cap). */
const RECONNECT_BACKOFF_MS = 30_000;
/** Number of reconnection attempts before the backoff is capped. */
const RECONNECT_ATTEMPTS_CAP = 5;

function browserLocation(): Location | null {
  return typeof window === 'undefined' ? null : window.location;
}

function isLocalBrowserHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
}

export function resolveMcpHttpBase(): string {
  const location = browserLocation();
  if (!location || isLocalBrowserHost(location.hostname)) return 'http://127.0.0.1:13001';
  return location.origin;
}

export function resolveMcpWebSocketUrl(): string {
  const location = browserLocation();
  if (!location || isLocalBrowserHost(location.hostname)) return 'ws://localhost:13001/mcp';
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/mcp`;
}

export class MCPClient {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>();
  private permissionHandler: ((action: string, path: string) => Promise<boolean>) | null = null;
  private directoryLock: DirectoryLockSettings = { enabled: false, rootPath: '' };
  private serverConfigs: McpServerConfig[] = [];
  private isConnected = false;
  private tools: ToolDefinition[] = [];
  /** Guard against concurrent connect() calls. */
  private connectPromise: Promise<void> | null = null;
  /** Reconnection state. */
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** True after the very first successful connection. */
  private hasConnectedOnce = false;

  /** Promise that resolves when tools have been loaded (or first attempt fails). */
  private toolsReady: Promise<void> | null = null;

  constructor(private serverUrl: string = resolveMcpWebSocketUrl()) {}

  /**
   * Eagerly connect to the MCP server and load tool definitions.
   * Call this on app startup so tools are available for the first message.
   * Errors are swallowed — the client will retry via reconnection logic.
   */
  async init(): Promise<void> {
    this.toolsReady = this.connect();
    await this.toolsReady;
  }

  setPermissionHandler(handler: (action: string, path: string) => Promise<boolean>) {
    this.permissionHandler = handler;
  }

  setDirectoryLock(lock: DirectoryLockSettings | undefined) {
    this.directoryLock = lock ?? { enabled: false, rootPath: '' };
  }

  async updateServers(configs: McpServerConfig[]): Promise<void> {
    this.serverConfigs = configs;
    if (this.isConnected) {
      try {
        await this.sendRequest('mcp/configure_servers', { servers: configs });
      } catch (e) {
        console.warn('Backend proxy might not support dynamic server configuration yet:', e);
      }
    }
  }

  // ── connection lifecycle ─────────────────────────────────────────────

  /**
   * Establish (or return the in-flight) WebSocket connection.
   *
   * On failure the promise **resolves** so callers don't hang, but
   * `this.isConnected` stays `false`.  Individual operations that need
   * the socket will throw a clear "not connected" error.
   */
  private async connect(): Promise<void> {
    // Fast path — already open.
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    // Coalesce concurrent calls into a single connection attempt.
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this._doConnect().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  private _doConnect(): Promise<void> {
    return new Promise((resolve) => {
      try {
        const socket = new WebSocket(this.serverUrl);
        this.ws = socket;

        socket.onopen = async () => {
          this.isConnected = true;
          this.hasConnectedOnce = true;
          this.reconnectAttempts = 0;

          if (this.serverConfigs.length > 0) {
            this.sendRequest('mcp/configure_servers', { servers: this.serverConfigs }).catch(console.warn);
          }
          try {
            await this.loadTools();
          } catch (e) {
            console.warn('[MCP] Failed to load tools after reconnect:', e);
          }
          resolve();
        };

        socket.onerror = () => {
          // onerror fires alongside onclose; the close handler manages state.
        };

        socket.onclose = () => {
          this.isConnected = false;
          // Reject all pending requests so callers don't hang forever.
          for (const [id, pending] of this.pendingRequests) {
            pending.reject(new Error('MCP connection closed'));
            this.pendingRequests.delete(id);
          }
          resolve(); // unblock connect() callers
          this.scheduleReconnect();
        };

        socket.onmessage = (event) => {
          try {
            const response = JSON.parse(event.data);
            if (response.id && this.pendingRequests.has(response.id)) {
              const { resolve, reject } = this.pendingRequests.get(response.id)!;
              this.pendingRequests.delete(response.id);
              if (response.error) {
                reject(new Error(response.error.message || 'MCP Error'));
              } else {
                resolve(response.result);
              }
            }
          } catch (err) {
            console.error('[MCP] Failed to parse response:', err);
          }
        };
      } catch (err) {
        console.error('[MCP] Failed to create WebSocket:', err);
        resolve();
        this.scheduleReconnect();
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return; // already scheduled

    // Only auto-reconnect after the first successful connection (avoid
    // hammering the server when it was never up to begin with).
    if (!this.hasConnectedOnce) return;

    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      RECONNECT_BACKOFF_MS,
    );
    this.reconnectAttempts++;

    console.warn(`[MCP] Disconnected — reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (!this.isConnected) {
        try {
          await this.connect();
        } catch {
          // connect() never throws, but guard anyway
        }
      }
    }, delay);
  }

  /** Public method so the UI or tests can force a reconnect. */
  async reconnect(): Promise<void> {
    this.teardown();
    this.reconnectAttempts = 0;
    await this.connect();
  }

  private teardown(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      // Remove listeners so onclose doesn't schedule another reconnect.
      this.ws.onopen = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.onmessage = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.isConnected = false;
  }

  // ── requests ─────────────────────────────────────────────────────────

  private async sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    await this.connect();

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('MCP Server not connected');
    }

    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      this.pendingRequests.set(id, { resolve, reject });

      this.ws!.send(JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
      }));

      // Timeout individual requests.
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('MCP Request timeout (5s)'));
        }
      }, 5000);
    });
  }

  // ── tools ────────────────────────────────────────────────────────────

  private async loadTools(): Promise<void> {
    try {
      const result = await this.sendRequest('tools/list', {});
      if (result && typeof result === 'object' && 'tools' in result) {
        const toolsResult = result as { tools: ToolDefinition[] };
        this.tools = toolsResult.tools;
        console.log(`[MCP] Loaded ${this.tools.length} tools`);
      }
    } catch (error) {
      console.warn('[MCP] Failed to load tools:', error);
    }
  }

  /**
   * Ensure connection and return the cached tool list.
   * If not yet connected, kicks off a connection attempt.
   * Returns whatever tools have been loaded so far (may be empty
   * during initial connection).
   */
  getAvailableTools(): ToolDefinition[] {
    // Fire-and-forget: ensure we're connecting if not already.
    if (!this.isConnected) {
      this.connect().catch(() => {});
    }
    return this.tools;
  }

  /**
   * Wait until the initial tool-loading attempt completes.
   * Use this before sending the first message to guarantee tools
   * are available (or that we've tried and failed).
   */
  async awaitTools(): Promise<ToolDefinition[]> {
    if (!this.isConnected || this.tools.length === 0) {
      this.toolsReady = this.connect();
    }
    if (this.toolsReady) await this.toolsReady;
    return this.tools;
  }

  /** Returns true if the WebSocket is currently open. */
  get connected(): boolean {
    return this.isConnected;
  }

  // ── permissioned execution ───────────────────────────────────────────

  private async requestPermission(action: string, toolPath: string): Promise<boolean> {
    if (this.permissionHandler) {
      return await this.permissionHandler(action, toolPath);
    }
    // Deny by default — safer in iframe / untrusted contexts.
    console.warn(`[MCP] Permission requested for ${action} on ${toolPath}, but no handler set. Denying.`);
    return false;
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    let action = 'READ';
    if (toolName.includes('write') || toolName.includes('delete') || toolName.includes('create')) {
      action = 'WRITE';
    } else if (toolName.includes('execute')) {
      action = 'EXECUTE';
    }

    const toolPath = (args.path || args.command || toolName) as string;

    // ── Pre-flight static analysis middleware ──────────────────────────────
    // Validate paths stay within workspace boundaries and commands don't
    // contain injection patterns. This runs BEFORE the request reaches the
    // local proxy, ensuring safety even in auto-accept/yolo autonomy modes.
    if (action === 'WRITE' || action === 'READ') {
      const pathArg = (args.path || args.newPath) as string | undefined;
      if (pathArg) {
        const pathError = validatePath(pathArg);
        if (pathError) {
          throw new Error(`[preflight] ${pathError}`);
        }
      }
    }
    const lockViolation = getDirectoryLockViolation(args, this.directoryLock);
    if (lockViolation) {
      throw new Error(`[directory-lock] ${lockViolation}`);
    }

    if (action === 'EXECUTE') {
      if (this.directoryLock.enabled && this.directoryLock.rootPath.trim()) {
        throw new Error(`[directory-lock] Shell/process execution is disabled while locked to "${this.directoryLock.rootPath}".`);
      }
      const commandArg = args.command as string | undefined;
      if (commandArg) {
        const cmdError = validateCommand(commandArg);
        if (cmdError) {
          throw new Error(`[preflight] ${cmdError}`);
        }
      }
    }

    const allowed = await this.requestPermission(action, toolPath);
    if (!allowed) {
      throw new Error(`Tool execution denied: ${toolName}`);
    }

    return await this.sendRequest('tools/call', { name: toolName, arguments: args });
  }

  // ── convenience wrappers ─────────────────────────────────────────────

  async readFile(filePath: string): Promise<string> {
    const result = await this.executeTool('read_file', { path: filePath });

    if (typeof result !== 'object' || result === null || !('content' in result)) {
      throw new Error('Invalid MCP response: missing content');
    }
    const obj = result as Record<string, unknown>;
    if (!Array.isArray(obj.content) || obj.content.length === 0) {
      throw new Error('Invalid MCP response: empty content');
    }
    const part = obj.content[0] as Record<string, unknown>;
    if (typeof part?.text !== 'string') {
      throw new Error('Invalid MCP response: content[0].text not a string');
    }
    return part.text;
  }

  async writeFile(filePath: string, content: string): Promise<boolean> {
    try {
      await this.executeTool('write_file', { path: filePath, content });
      return true;
    } catch (error) {
      console.error(`[MCP] writeFile ${filePath}:`, error);
      return false;
    }
  }

  async execute(command: string): Promise<boolean> {
    await this.executeTool('execute_command', { command });
    return true;
  }

  async listDirectory(dirPath: string): Promise<Array<{ name: string; type: string }>> {
    const result = (await this.executeTool('list_directory', { path: dirPath })) as any;
    if (result.entries) return result.entries;
    throw new Error('Invalid directory listing response');
  }

  async deleteFile(filePath: string): Promise<boolean> {
    try {
      await this.executeTool('delete_file', { path: filePath });
      return true;
    } catch (error) {
      console.error(`[MCP] deleteFile ${filePath}:`, error);
      return false;
    }
  }

  async createDirectory(dirPath: string): Promise<boolean> {
    await this.executeTool('create_directory', { path: dirPath });
    return true;
  }

  async getFileInfo(filePath: string): Promise<any> {
    return await this.executeTool('file_info', { path: filePath });
  }
}

export const mcpClient = new MCPClient();
