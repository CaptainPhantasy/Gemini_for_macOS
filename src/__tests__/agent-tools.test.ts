import { describe, expect, test } from 'vitest';
import {
  extractResponseParts,
  hasLocalEvidenceTools,
  parseToolRequest,
  parseToolRequestDetailed,
  requiresLocalToolEvidence,
} from '../lib/agent-tools';
import type { ToolDefinition } from '../lib/mcp';

const makeTool = (name: string): ToolDefinition => ({
  name,
  description: '',
  inputSchema: { type: 'object', properties: {} },
});

describe('agent-tools', () => {
  test('extracts function calls even when Gemini includes text preamble parts', () => {
    const response = {
      candidates: [
        {
          content: {
            parts: [
              { text: 'I will inspect the file first.' },
              { functionCall: { name: 'read_file', args: { path: 'package.json' }, id: 'call-1' } },
            ],
          },
        },
      ],
    };

    const parts = extractResponseParts(response);

    expect(parts.text).toBe('I will inspect the file first.');
    expect(parts.functionCalls).toEqual([
      { name: 'read_file', args: { path: 'package.json' }, id: 'call-1' },
    ]);
  });

  test('reports malformed legacy tool requests without throwing', () => {
    const text = 'Tool: read_file\nArgs: {"path": "package.json"';

    expect(() => parseToolRequest(text)).not.toThrow();
    expect(parseToolRequest(text)).toBeNull();
    expect(parseToolRequestDetailed(text)).toMatchObject({
      status: 'error',
      toolName: 'read_file',
    });
  });

  test('parses legacy tool JSON object before trailing prose', () => {
    const parsed = parseToolRequestDetailed(
      'Tool: call_mcp_tool\nArgs: {"server":"filesystem","tool":"read","arguments":{"path":"package.json"}}\nI will use this next.'
    );

    expect(parsed).toEqual({
      status: 'ok',
      request: {
        toolName: 'call_mcp_tool',
        args: {
          server: 'filesystem',
          tool: 'read',
          arguments: { path: 'package.json' },
        },
      },
    });
  });

  test('detects local evidence requests that must not be answered without tools', () => {
    expect(requiresLocalToolEvidence('Read package.json and summarize it')).toBe(true);
    expect(requiresLocalToolEvidence('Run npm test and report the output')).toBe(true);
    expect(requiresLocalToolEvidence('Explain why consensus algorithms matter')).toBe(false);
  });

  test('distinguishes local evidence tools from remote-only tools', () => {
    expect(hasLocalEvidenceTools([makeTool('tavily_search'), makeTool('call_mcp_tool')])).toBe(false);
    expect(hasLocalEvidenceTools([makeTool('read_file')])).toBe(true);
    expect(hasLocalEvidenceTools([makeTool('execute_command')])).toBe(true);
  });
});
