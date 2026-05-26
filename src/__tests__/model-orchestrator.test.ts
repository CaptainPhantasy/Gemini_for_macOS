import { describe, expect, test } from 'vitest';
import { selectModel } from '../lib/model-orchestrator';
import type { ToolDefinition } from '../lib/mcp';
import { DEFAULT_MODEL_IDS } from '../lib/model-catalog';

const makeTool = (name: string, description: string = ''): ToolDefinition => ({
  name,
  description,
  inputSchema: { type: 'object', properties: {} },
});

describe('model-orchestrator', () => {
  const defaultSettings = {
    models: { text: 'gemini-3.1-pro-preview', textFallback: 'gemini-3.1-flash-lite-preview' },
    thinkingBudgets: { text: 8192 },
  };

  test('routes write-intent messages to the pro model with thinking budget', () => {
    const result = selectModel('Please write a new file for me', [], defaultSettings);
    expect(result.model).toBe('gemini-3.1-pro-preview');
    expect(result.thinkingBudget).toBe(8192);
    expect(result.reason).toContain('High-impact');
  });

  test('routes execute-intent messages to the pro model', () => {
    const result = selectModel('Run this command: ls -la', [], defaultSettings);
    expect(result.model).toBe('gemini-3.1-pro-preview');
    expect(result.reason).toContain('High-impact');
  });

  test('routes read-only queries to the flash model', () => {
    const result = selectModel('What is the current date?', [], defaultSettings);
    expect(result.model).toBe('gemini-3.1-flash-lite-preview');
    expect(result.thinkingBudget).toBeUndefined();
    expect(result.reason).toContain('Read-only');
  });

  test('routes to pro model when write tools are available', () => {
    const tools = [makeTool('write_file'), makeTool('read_file')];
    const result = selectModel('Check this file', tools, defaultSettings);
    expect(result.model).toBe('gemini-3.1-pro-preview');
  });

  test('routes to flash model when only read tools are available and read intent', () => {
    const tools = [makeTool('read_file'), makeTool('list_directory')];
    const result = selectModel('Show me the contents of this file', tools, defaultSettings);
    expect(result.model).toBe('gemini-3.1-flash-lite-preview');
  });

  test('defaults to pro model for ambiguous queries', () => {
    const result = selectModel('Analyze the implications of quantum computing for cryptography', [], defaultSettings);
    expect(result.model).toBe('gemini-3.1-pro-preview');
    expect(result.reason).toContain('Default');
  });

  test('uses custom model settings', () => {
    const customSettings = {
      models: { text: 'custom-pro-model', textFallback: 'custom-flash-model' },
      thinkingBudgets: { text: 4096 },
    };
    const result = selectModel('Write a new file', [], customSettings);
    expect(result.model).toBe('custom-pro-model');
    expect(result.thinkingBudget).toBe(4096);
  });

  test('uses default model IDs when settings are missing', () => {
    const minimalSettings = {};
    const result = selectModel('Read this file', [], minimalSettings);
    expect(result.model).toBe(DEFAULT_MODEL_IDS.textFallback);
    expect(result.reason).toContain('Read-only');
  });
});