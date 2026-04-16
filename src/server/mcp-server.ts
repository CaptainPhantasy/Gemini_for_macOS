/**
 * GEMINI MCP Backend Server
 * Provides WebSocket interface to MCP tools including Desktop Commander
 * Runs on port 13001, interfaces with Gemini agent
 */

import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

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

  constructor() {
    this.setupExpress();
  }

  private setupExpress() {
    this.app.use(express.json());
    this.app.use(express.text({ limit: '100mb' }));

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', service: 'GEMINI MCP Server' });
    });

    // MCP WebSocket upgrade
    this.app.get('/mcp', (req, res) => {
      res.status(400).send('Use WebSocket');
    });

    // CORS for frontend requests
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', 'http://localhost:13000');
      res.header('Access-Control-Allow-Methods', 'GET');
      next();
    });

    // Detect locally-configured MCP servers from Gemini CLI and Claude Code configs
    this.app.get('/detect-mcp', async (_req, res) => {
      try {
        const servers = await this.detectLocalMcpServers();
        res.json({ servers });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
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
    const server = this.app.listen(this.port, '0.0.0.0', () => {
      console.log(`✓ GEMINI MCP Server running on port ${this.port}`);
    });

    this.wss = new WebSocketServer({ server });

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

      ws.on('error', (error) => {
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
        // Accept server configuration (for future extensions)
        result = { status: 'configured' };
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

  private listTools() {
    return {
      tools: [
        {
          name: 'read_file',
          description: 'Read a file from the local file system',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path to read' }
            },
            required: ['path']
          }
        },
        {
          name: 'write_file',
          description: 'Write content to a file on the local file system',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path to write' },
              content: { type: 'string', description: 'Content to write' }
            },
            required: ['path', 'content']
          }
        },
        {
          name: 'list_directory',
          description: 'List files and directories in a path',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Directory path to list' }
            },
            required: ['path']
          }
        },
        {
          name: 'execute_command',
          description: 'Execute a shell command (with permission)',
          inputSchema: {
            type: 'object',
            properties: {
              command: { type: 'string', description: 'Command to execute' }
            },
            required: ['command']
          }
        },
        {
          name: 'delete_file',
          description: 'Delete a file from the file system',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path to delete' }
            },
            required: ['path']
          }
        },
        {
          name: 'create_directory',
          description: 'Create a directory',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Directory path to create' }
            },
            required: ['path']
          }
        },
        {
          name: 'file_info',
          description: 'Get file information (size, modified time, etc.)',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path to get info for' }
            },
            required: ['path']
          }
        }
      ]
    };
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
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
