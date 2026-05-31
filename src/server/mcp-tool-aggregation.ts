export interface ToolDefinitionLike {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ReadyToolClient<TTool extends ToolDefinitionLike> {
  isReady(): boolean;
  getTools(): TTool[];
}

export function appendReadyClientTools<TTool extends ToolDefinitionLike>(
  target: TTool[],
  clients: Iterable<ReadyToolClient<TTool>>,
): void {
  for (const client of clients) {
    if (!client.isReady()) continue;
    target.push(...client.getTools());
  }
}
