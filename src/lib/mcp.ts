import { McpServerConfig } from '../types';

export class MCPClient {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private pendingRequests = new Map<number, { resolve: (value: unknown) => void, reject: (reason?: unknown) => void }>();
  private permissionHandler: ((action: string, path: string) => Promise<boolean>) | null = null;
  private serverConfigs: McpServerConfig[] = [];
  private isConnected = false;

  constructor(private serverUrl: string = 'ws://localhost:3001/mcp') {}

  setPermissionHandler(handler: (action: string, path: string) => Promise<boolean>) {
    this.permissionHandler = handler;
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

  private async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.serverUrl);
        
        this.ws.onopen = () => {
          this.isConnected = true;
          if (this.serverConfigs.length > 0) {
            this.sendRequest('mcp/configure_servers', { servers: this.serverConfigs }).catch(console.warn);
          }
          resolve();
        };
        
        this.ws.onerror = (error) => {
          console.error('MCP WebSocket Error:', error);
          this.isConnected = false;
          // Resolve anyway to prevent unhandled rejections, but operations will fail gracefully
          resolve();
        };

        this.ws.onclose = () => {
          this.isConnected = false;
        };

        this.ws.onmessage = (event) => {
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
            console.error('Failed to parse MCP response:', err);
          }
        };
      } catch (err) {
        console.error('Failed to create WebSocket:', err);
        resolve(); // Resolve to prevent unhandled rejections
      }
    });
  }

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
        params
      }));
      
      // Add timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('MCP Request timeout'));
        }
      }, 5000);
    });
  }

  private async requestPermission(action: string, path: string): Promise<boolean> {
    if (this.permissionHandler) {
      return await this.permissionHandler(action, path);
    }
    // Fallback if no handler is set, automatically deny to be safe in iframe
    console.warn(`MCP Permission requested for ${action} on ${path}, but no handler is set. Denying by default.`);
    return false;
  }

  async readFile(path: string): Promise<string> {
    try {
      const result = await this.sendRequest('tools/call', {
        name: 'read_file',
        arguments: { path }
      });
      
      // Add bounds checking and validation
      if (typeof result !== 'object' || result === null || !('content' in result)) {
        throw new Error(`Invalid response from MCP: missing content property`);
      }
      
      const resultObj = result as Record<string, unknown>;
      if (!Array.isArray(resultObj.content) || resultObj.content.length === 0) {
        throw new Error(`Invalid response from MCP: missing or empty content array`);
      }
      
      const content = resultObj.content[0] as Record<string, unknown>;
      if (!content || typeof content.text !== 'string') {
        throw new Error(`Invalid response from MCP: content[0].text is not a string`);
      }
      
      return content.text;
    } catch (error) {
      console.error(`Failed to read file ${path}:`, error);
      throw error;
    }
  }

  async writeFile(path: string, content: string): Promise<boolean> {
    try {
      const allowed = await this.requestPermission('WRITE', path);
      if (!allowed) {
        console.warn('Write operation denied by user.');
        return false;
      }
      
      await this.sendRequest('tools/call', {
        name: 'write_file',
        arguments: { path, content }
      });
      return true;
    } catch (error) {
      console.error(`Failed to write file ${path}:`, error);
      return false; // Return false instead of throwing to prevent crashing the app
    }
  }

  async execute(command: string): Promise<boolean> {
    const allowed = await this.requestPermission('EXECUTE', command);
    if (!allowed) {
      throw new Error('Execute operation denied by user.');
    }
    
    try {
      await this.sendRequest('tools/call', {
        name: 'execute_command',
        arguments: { command }
      });
      return true;
    } catch (error) {
      console.error(`Failed to execute command ${command}:`, error);
      throw error;
    }
  }
}

export const mcpClient = new MCPClient();
