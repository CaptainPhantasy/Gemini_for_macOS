/**
 * Agent Tool Integration for Gemini
 * Provides MCP tools as callable functions for the Gemini agent
 */

import { mcpClient, ToolDefinition, ToolResult } from './mcp';

export interface AgentToolSet {
  toolDefinitions: ToolDefinition[];
  executeTool: (toolName: string, args: Record<string, unknown>) => Promise<string>;
}

/**
 * Get the tool set for agent use
 * Automatically loads tools from MCP server
 */
export async function getAgentToolSet(): Promise<AgentToolSet> {
  const tools = mcpClient.getAvailableTools();

  const executeTool = async (toolName: string, args: Record<string, unknown>): Promise<string> => {
    try {
      const result = await mcpClient.executeTool(toolName, args);
      return formatToolResult(result);
    } catch (error) {
      return `Error executing ${toolName}: ${String(error)}`;
    }
  };

  return {
    toolDefinitions: tools,
    executeTool
  };
}

/**
 * Format tool result for agent consumption
 */
function formatToolResult(result: ToolResult | any): string {
  if (!result) return '';

  if ('content' in result && Array.isArray(result.content)) {
    return result.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');
  }

  if ('stdout' in result) {
    return result.stdout;
  }

  if ('entries' in result) {
    return (result.entries as any[])
      .map(e => `${e.type === 'directory' ? '[DIR]' : '[FILE]'} ${e.name}`)
      .join('\n');
  }

  if ('success' in result) {
    return `Operation completed: ${result.success}`;
  }

  return JSON.stringify(result, null, 2);
}

/**
 * Build system prompt for agent with tool instructions
 */
export function buildAgentSystemPrompt(tools: ToolDefinition[]): string {
  const toolDescriptions = tools
    .map(tool => `- ${tool.name}: ${tool.description}`)
    .join('\n');

  return `You are the GEMINI Agent, a powerful local-first AI assistant with real file system access through Desktop Commander MCP.

AVAILABLE TOOLS:
${toolDescriptions}

AGENT CAPABILITIES:
1. Read and write files on the local file system
2. Execute shell commands with user permission
3. Browse directories and list files
4. Create and delete files and directories
5. Get file information (size, modified time, etc.)

PERMISSION MODEL:
- READ operations are generally allowed
- WRITE operations (create, delete, modify) require explicit confirmation
- EXECUTE operations require explicit confirmation
- In 'YOLO' mode, all operations are auto-approved

USE TOOLS RESPONSIBLY:
- Always check file paths before writing
- Confirm destructive operations (delete)
- Use proper error handling
- Return clear results to the user

To use a tool, format your response with:
Tool: <tool_name>
Args: <json arguments>

The system will execute the tool and return the result.`;
}

/**
 * Parse agent tool request from text
 */
export interface ToolRequest {
  toolName: string;
  args: Record<string, unknown>;
}

export function parseToolRequest(text: string): ToolRequest | null {
  const toolMatch = text.match(/Tool:\s*(\w+)/i);
  const argsMatch = text.match(/Args:\s*({[\s\S]*?})/i);

  if (!toolMatch) return null;

  const toolName = toolMatch[1];
  const args = argsMatch ? JSON.parse(argsMatch[1]) : {};

  return { toolName, args };
}

/**
 * Default Desktop Commander MCP configuration
 */
export const DEFAULT_DESKTOP_COMMANDER_CONFIG = {
  id: 'desktop-commander-mcp',
  name: 'Desktop Commander',
  type: 'websocket' as const,
  url: 'ws://localhost:13001/mcp',
  enabled: true
};
