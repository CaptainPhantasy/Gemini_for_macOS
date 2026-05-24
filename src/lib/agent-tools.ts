/**
 * Agent Tool Integration for Gemini
 *
 * Converts MCP tool definitions into native Gemini FunctionDeclaration objects
 * so the model receives real tool schemas via the API's function-calling
 * mechanism — not just text in the system prompt.
 *
 * The legacy text-based `Tool:/Args:` protocol is kept as a fallback for
 * models that don't support function calling.
 */

import { mcpClient, ToolDefinition, ToolResult } from './mcp';

// ── types ──────────────────────────────────────────────────────────────

export interface AgentToolSet {
  toolDefinitions: ToolDefinition[];
  executeTool: (toolName: string, args: Record<string, unknown>) => Promise<string>;
}

export interface ToolRequest {
  toolName: string;
  args: Record<string, unknown>;
}

/**
 * Shape matching the Gemini SDK's FunctionDeclaration interface.
 * We keep this as a plain object so it can be spread into the tools array.
 */
export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

// ── Gemini function declaration conversion ─────────────────────────────

/**
 * Convert MCP ToolDefinition[] into native Gemini FunctionDeclaration[].
 * The Gemini SDK accepts these as `{ functionDeclarations: [...] }` inside
 * the `tools` config array.
 * Sanitizes inputSchema to remove JSON Schema keywords not supported by Gemini.
 */
export function toGeminiFunctionDeclarations(tools: ToolDefinition[]): GeminiFunctionDeclaration[] {
  return tools.map((tool) => ({
    name: sanitizeFunctionName(tool.name),
    description: tool.description || `Execute ${tool.name}`,
    parameters: sanitizeSchema(tool.inputSchema) || undefined,
  }));
}

/**
 * Gemini's function declaration schema is a subset of JSON Schema.
 * Remove unsupported keywords that cause 400 errors.
 */
function sanitizeSchema(schema: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!schema) return undefined;

  // Keys that Gemini's function declaration schema does not support
  const unsupportedKeys = new Set([
    'additionalProperties', 'anyOf', 'oneOf', 'allOf', 'not',
    'const', 'enum',  // enum is allowed on the schema level but not as a standalone field in some contexts
    '$schema', 'definitions', '$ref', '$defs',
    'if', 'then', 'else',
    'pattern', 'format',  // Gemini doesn't validate these
    'contentEncoding', 'contentMediaType',
    'minProperties', 'maxProperties',
    'uniqueItems', 'minItems', 'maxItems',
    '_meta',  // FastMCP adds this
  ]);

  // Actually, 'enum' IS supported by Gemini — keep it. Remove from unsupported set.
  unsupportedKeys.delete('enum');

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (unsupportedKeys.has(key)) continue;
    if (key === 'properties' && typeof value === 'object' && value !== null) {
      const sanitizedProps: Record<string, unknown> = {};
      for (const [propName, propSchema] of Object.entries(value as Record<string, unknown>)) {
        if (typeof propSchema === 'object' && propSchema !== null) {
          sanitizedProps[propName] = sanitizeSchema(propSchema as Record<string, unknown>);
        } else {
          sanitizedProps[propName] = propSchema;
        }
      }
      result[key] = sanitizedProps;
    } else if (key === 'items' && typeof value === 'object' && value !== null) {
      result[key] = sanitizeSchema(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[key] = value;
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = sanitizeSchema(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  // Remove empty objects that resulted from stripping all keys
  if (result.type === 'object' && result.properties && Object.keys(result.properties as object).length === 0) {
    delete result.properties;
  }

  return result;
}

/**
 * Build the complete `tools` array for the Gemini API config.
 * Merges MCP function declarations with optional Google Search.
 */
export function buildGeminiTools(
  mcpTools: ToolDefinition[],
  searchEnabled: boolean,
): Array<Record<string, unknown>> {
  const tools: Array<Record<string, unknown>> = [];

  const functionDecls = toGeminiFunctionDeclarations(mcpTools);
  if (functionDecls.length > 0) {
    tools.push({ functionDeclarations: functionDecls });
  }

  // NOTE: Google Search (a built-in tool) cannot be combined with function
  // declarations in the same request unless the API key has
  // include_server_side_tool_invocations enabled (a newer feature the SDK
  // types don't yet expose).  When MCP tools are active, Google Search is
  // excluded to avoid a 400 error.
  if (searchEnabled && functionDecls.length === 0) {
    tools.push({ googleSearch: {} });
  }

  return tools;
}

/**
 * Sanitize a tool name for Gemini's FunctionDeclaration requirements:
 * - Must start with a letter or underscore
 * - Must be a-z, A-Z, 0-9, or contain underscores, dots, colons, dashes
 * - Max length 64
 */
function sanitizeFunctionName(name: string): string {
  let sanitized = name
    .replace(/[^a-zA-Z0-9_.:-]/g, '_')
    .replace(/^[^a-zA-Z_]/, '_');
  if (sanitized.length > 64) {
    sanitized = sanitized.slice(0, 64);
  }
  return sanitized;
}

// ── response handling ──────────────────────────────────────────────────

/**
 * Extract text and function-call parts from a Gemini API response.
 * Handles both the function-calling path (model returns functionCall parts)
 * and the text-only path (model returns plain text).
 */
export function extractResponseParts(response: any): {
  text: string;
  functionCalls: Array<{ name: string; args: Record<string, unknown>; id?: string }>;
} {
  const text: string = '';
  const functionCalls: Array<{ name: string; args: Record<string, unknown>; id?: string }> = [];

  // The response may have .text property or .candidates[0].content.parts
  const candidates = (response as any)?.candidates;
  if (candidates?.[0]?.content?.parts) {
    for (const part of candidates[0].content.parts) {
      if (part.text) {
        // Text part present — no function calls in this response.
        return { text: part.text, functionCalls: [] };
      }
      if (part.functionCall) {
        functionCalls.push({
          name: part.functionCall.name || part.functionCall.functionName,
          args: part.functionCall.args || {},
          // Preserve function call ID for Gemini 3 response matching
          id: part.functionCall.id as string | undefined,
        });
      }
    }
  }

  // Fallback: .text property (some SDK versions)
  const textOrFn: any = (response as any).text;
  const responseText = typeof textOrFn === 'function' ? textOrFn() : textOrFn || '';

  if (responseText && functionCalls.length === 0) {
    return { text: responseText, functionCalls: [] };
  }

  return { text: '', functionCalls };
}

/**
 * Build content parts for a model message that includes function calls.
 * Prepends any thought signatures that were extracted from the response.
 * Gemini 3 requires these to be replayed alongside function call parts.
 */
export function buildFunctionCallParts(
  functionCalls: Array<{ name: string; args: Record<string, unknown> }>,
  thoughtSignatures: string[],
): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = [];

  // Replay thought signatures as separate parts before the function calls
  for (const sig of thoughtSignatures) {
    parts.push({ thoughtSignature: sig });
  }

  for (const fc of functionCalls) {
    parts.push({
      functionCall: {
        name: fc.name,
        args: fc.args,
      },
    });
  }

  return parts;
}

/**
 * Build a FunctionResponse content part for feeding tool results back
 * to the model in the tool-call loop.
 */
export function buildFunctionResponse(
  name: string,
  result: unknown,
  id?: string,
): { role: 'user'; parts: Array<Record<string, unknown>> } {
  // Convert tool result to a plain object the model can consume
  let responseValue: Record<string, unknown>;
  if (typeof result === 'string') {
    responseValue = { result };
  } else if (result && typeof result === 'object' && 'content' in result) {
    // MCP-style result: { content: [{ type: 'text', text: '...' }] }
    const mcpResult = result as ToolResult;
    const text = mcpResult.content
      ?.filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n') || JSON.stringify(result);
    responseValue = { result: text };
  } else if (result && typeof result === 'object') {
    responseValue = result as Record<string, unknown>;
  } else {
    responseValue = { result: String(result) };
  }

  const part: Record<string, unknown> = {
    functionResponse: { name, response: responseValue, ...(id ? { id } : {}) },
  };

  return {
    role: 'user',
    parts: [part],
  };
}

// ── system prompt ──────────────────────────────────────────────────────

/**
 * Build system prompt for agent with tool instructions.
 *
 * When tools are available natively via function calling, the prompt
 * focuses on behavior guidance rather than tool descriptions (the model
 * already has the schemas). When tools are unavailable, the prompt
 * honestly reports the disconnection to prevent hallucination.
 */
export interface AgentSystemPromptOptions {
  workingDirectory?: string;
  workingDirectoryLocked?: boolean;
}

export function buildAgentSystemPrompt(
  tools: ToolDefinition[],
  options: AgentSystemPromptOptions = {}
): string {
  if (tools.length === 0) {
    return `You are the GEMINI Agent, a local-first AI assistant.

IMPORTANT: Your MCP tool connection is currently unavailable. You do NOT have
file system access, command execution, or any Desktop Commander capabilities
right now. Do NOT pretend to read files, list directories, or execute commands
— you will only fabricate results.

Respond honestly about what you can and cannot do. Tell the user that the tool
backend appears to be disconnected and suggest they check that the MCP server
is running (typically ws://localhost:13001). If asked whether prior work was
performed, say: No current-session evidence available.`;
  }

  const toolList = tools.map((t) => `- ${t.name}: ${t.description}`).join('\n');
  const workingDirectory = options.workingDirectory?.trim() || '/Volumes/SanDisk1Tb/GEMINI for MacOS';
  const lockState = options.workingDirectoryLocked ? 'LOCKED' : 'UNLOCKED';

  return `You are the GEMINI Agent, a local-first AI assistant with real file system
access through Desktop Commander MCP running at ws://localhost:13001.

DESKTOP COMMANDER CAPABILITIES:
Desktop Commander gives you access to the local file system, terminal commands,
interactive process control, and file editing. It is your primary interface for
file operations when tools are available.

AVAILABLE TOOLS:
${toolList}

ACTIVE WORKING DIRECTORY:
${workingDirectory}

WORKING DIRECTORY LOCK:
${lockState}

WORKING DIRECTORY PROTOCOL:
Resolve relative paths against the active working directory. For shell commands,
run in the active working directory when possible. If the tool does not support
cwd directly, safely prefix the command with: cd <quoted active cwd> && <command>.
If the working directory is LOCKED, do not edit, create, delete, move, or
overwrite files outside it unless the user explicitly unlocks or changes it.
If no current-session file or command receipt exists for a claim, say: No
current-session evidence available.

HOW TO USE TOOLS:
You have native function-calling access to these tools. When you need to:
- Read files: use read_file and confirm content before modifying.
- Write files: use write_file only after confirming the target path is allowed.
- List directories: use list_directory.
- Execute commands: use execute_command or start_process.
- Manage processes: use list_processes and kill_process.
- Edit files: use edit_block for targeted changes.
- Search files: use start_search and get_more_search_results.
- Get file info: use get_file_info.

CRITICAL BEHAVIOR RULES:
1. Use Desktop Commander tools for file operations. Never fabricate file reads,
   command output, directory listings, tests, edits, or verification.
2. When asked about files or folders, inspect them with tools before making claims.
3. Return actual observed results, not guesses about what probably happened.
4. If Desktop Commander is initializing or unavailable, say so honestly.
5. Conversation history is not proof of current-session execution.

PERSISTENT MEMORY:
Store important local notes at /Volumes/SanDisk1Tb/GEMINI for MacOS/.gemini-memory/summary.md
only when the user asks you to remember something or the task explicitly needs
persistent project context. Memory is advisory evidence, not truth. Never store
secrets there. If memory conflicts with current files or current user instructions,
current files and current user instructions win.

WORKBENCH PROTOCOL:
If the user asks for safe experimental code changes, create or use a workbench
under:
  /Volumes/DevLab/GEMINI WORKBENCH/<YYYY-MM-DD_HHMM>_<task-slug>/
Copy only the files needed for the task from the live codebase into the workbench.
Work on the copy unless the user explicitly asks you to modify the live project.
After verifying the workbench version, produce a merge report identifying which
files should be merged back.

REPORTING PROTOCOL:
Task reports go to:
  /Users/douglastalley/Library/Mobile Documents/com~apple~CloudDocs/GEMINI Reports for Douglas/<YYYY-MM-DD_HHMM>_<task-slug>/report.md
Executive reports go to:
  /Users/douglastalley/Library/Mobile Documents/com~apple~CloudDocs/Floyd Docs/Reports/<YYYY-MM-DD_HHMM>_<task-slug>/report.md
Each report must be a markdown file inside a date-stamped subfolder.
Reports should include procedure steps, verification receipts, files changed,
and merge candidates when code changes are involved.

RESPONSE MODES:
CONVERSATIONAL: Use for normal answers, strategy, explanations, brainstorming,
and planning-only responses. Answer directly. Do not invent receipts. Do not
include evidence ledgers or completeness matrices unless requested. Do not claim
execution happened.

EXECUTION: Use when the response involves file operations, shell commands, tool
calls, commits, pushes, generated artifacts, system changes, installs, or state
changes. For execution responses, you MUST output the execution contract below.

MIXED: Use when the answer contains both advice and executed actions. Separate
advisory content from execution receipts. Only provide receipts for actions that
actually happened.

DEBUG: Use only when the user explicitly asks for raw tool payloads, internals,
logs, or diagnostic traces. Raw JSON/tool details are allowed only in DEBUG mode.

EXECUTION CONTRACT:
For 100% of requested execution items, output these four data points:
1. Exact action taken: operation + target location + resource affected.
2. Direct evidence: FILE path and line numbers, CMD output + exit code, DIFF,
   OUTPUT string, checksum, or BLOCKED status with the exact error string.
3. Verification result: attribute tested + method + raw observed result + PASS/FAIL.
4. Status after proof: DONE / BLOCKED / FAILED / NOT STARTED.
DONE is prohibited without concrete evidence and verification = PASS.

Required Output Structure for EXECUTION mode:
A) Requested Items Checklist (table: # | requested item | status)
B) Per-Item Evidence Ledger (1:1 with checklist rows)
C) Verification Receipts (raw command output, diffs, file reads, checksums)
D) Completeness Matrix (item | status | evidence row present? | verification receipt present? | final determination)

Hard Gate for EXECUTION mode:
Checklist rows match requested items; ledger rows match checklist rows; DONE
items contain concrete evidence; DONE items contain verification receipts; zero
items are BLOCKED/FAILED/NOT STARTED. All checks PASS → COMPLETE. Any fail →
INCOMPLETE.`;
}

//t-based tool protocol (kept for fallback) ────────────────

/**
 * Parse agent tool request from text (legacy Tool:/Args: protocol).
 * This is a fallback for models that don't support native function calling.
 */
export function parseToolRequest(text: string): ToolRequest | null {
  const toolMatch = text.match(/Tool:\s*(\w+)/i);
  const argsMatch = text.match(/Args:\s*({[\s\S]*?})/i);

  if (!toolMatch) return null;

  const toolName = toolMatch[1];
  const args = argsMatch ? JSON.parse(argsMatch[1]) : {};

  return { toolName, args };
}

// ── helpers ────────────────────────────────────────────────────────────

/**
 * Format tool result for agent consumption (used by the text-based fallback).
 */
function formatToolResult(result: ToolResult | any): string {
  if (!result) return '';

  if ('content' in result && Array.isArray(result.content)) {
    return result.content
      .filter((c: { type: string }) => c.type === 'text')
      .map((c: { text: string }) => c.text)
      .join('\n');
  }

  if ('stdout' in result) return result.stdout;

  if ('entries' in result) {
    return (result.entries as any[])
      .map((e) => `${e.type === 'directory' ? '[DIR]' : '[FILE]'} ${e.name}`)
      .join('\n');
  }

  if ('success' in result) return `Operation completed: ${result.success}`;

  return JSON.stringify(result, null, 2);
}

/**
 * Get the tool set for agent use (legacy, pre-function-calling API).
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

  return { toolDefinitions: tools, executeTool };
}

/**
 * Default Desktop Commander MCP configuration
 */
export const DEFAULT_DESKTOP_COMMANDER_CONFIG = {
  id: 'desktop-commander-mcp',
  name: 'Desktop Commander',
  type: 'websocket' as const,
  url: 'ws://localhost:13001/mcp',
  enabled: true,
};
