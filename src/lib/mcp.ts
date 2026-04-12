export class MCPClient {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private pendingRequests = new Map<number, { resolve: (value: any) => void, reject: (reason?: any) => void }>();

  constructor(private serverUrl: string = 'ws://localhost:3001/mcp') {}

  private async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.serverUrl);
      
      this.ws.onopen = () => resolve();
      
      this.ws.onerror = (error) => {
        console.error('MCP WebSocket Error:', error);
        reject(error);
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
    });
  }

  private async sendRequest(method: string, params: any): Promise<any> {
    await this.connect();
    
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      this.pendingRequests.set(id, { resolve, reject });
      
      this.ws!.send(JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params
      }));
    });
  }

  private requestPermission(action: string, path: string): Promise<boolean> {
    return new Promise((resolve) => {
      // UI-level explicit user confirmation prompt
      const confirmed = window.confirm(`MCP Security Alert: Allow ${action} operation on ${path}?`);
      resolve(confirmed);
    });
  }

  async readFile(path: string): Promise<string> {
    const result = await this.sendRequest('tools/call', {
      name: 'read_file',
      arguments: { path }
    });
    return result.content[0].text;
  }

  async writeFile(path: string, content: string): Promise<boolean> {
    const allowed = await this.requestPermission('WRITE', path);
    if (!allowed) {
      throw new Error('Write operation denied by user.');
    }
    
    await this.sendRequest('tools/call', {
      name: 'write_file',
      arguments: { path, content }
    });
    return true;
  }

  async execute(command: string): Promise<boolean> {
    const allowed = await this.requestPermission('EXECUTE', command);
    if (!allowed) {
      throw new Error('Execute operation denied by user.');
    }
    
    await this.sendRequest('tools/call', {
      name: 'execute_command',
      arguments: { command }
    });
    return true;
  }
}

export const mcpClient = new MCPClient();
