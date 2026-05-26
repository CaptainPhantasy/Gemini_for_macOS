// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';
import {
  buildJulesSystemPrompt,
  createJulesDispatcher,
  extractAssistantText,
  type JulesDispatchRequest,
} from '../server/jules-agent';

describe('jules-agent', () => {
  test('system prompt requires Gemini ownership, metric triage, and verified work', () => {
    const prompt = buildJulesSystemPrompt();

    expect(prompt).toContain('Jules');
    expect(prompt).toContain('answer to Gemini');
    expect(prompt).toContain('Git Steward');
    expect(prompt).toContain('ask Gemini to ask Douglas');
    expect(prompt).toContain('one instance at a time');
    expect(prompt).toContain('Think before coding');
    expect(prompt).toContain('Simplicity first');
    expect(prompt).toContain('Surgical changes');
    expect(prompt).toContain('Goal-driven execution');
    expect(prompt).toContain('EXECUTION PLAN & ARCHITECTURE TRIAGE');
    expect(prompt).toContain('SURGICAL CODE DELIVERY');
    expect(prompt).toContain('COMPLETION & QUALITY MATRIX');
    expect(prompt).toContain('TOTAL SCORE');
    expect(prompt).toContain('request_code_review');
    expect(prompt).toContain('pre_commit_instructions');
    expect(prompt).not.toContain('sk-');
  });

  test('dispatcher rejects concurrent Jules instances', async () => {
    let release!: () => void;
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => {
      release = () => resolve(new Response(JSON.stringify({
        content: [{ type: 'text', text: 'review complete' }],
        usage: { input_tokens: 1, output_tokens: 2 },
      }), { status: 200, headers: { 'content-type': 'application/json' } }));
    }));

    const dispatcher = createJulesDispatcher({
      apiKey: 'test-key',
      baseUrl: 'https://api.minimax.io/anthropic',
      model: 'MiniMax-M2.7',
      fetchImpl,
    });

    const request: JulesDispatchRequest = {
      mode: 'code_review',
      task: 'Review the latest diff.',
      repositoryContext: 'No diff supplied.',
    };

    const first = dispatcher.dispatch(request);
    await Promise.resolve();
    await Promise.resolve();
    await expect(dispatcher.dispatch(request)).resolves.toMatchObject({
      status: 'busy',
      text: expect.stringContaining('already running'),
    });
    release();
    await expect(first).resolves.toMatchObject({ status: 'completed', text: 'review complete' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('dispatcher sends MiniMax Anthropic-compatible request without exposing key', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      content: [
        { type: 'thinking', thinking: 'private reasoning' },
        { type: 'text', text: 'Ship after tests pass.' },
      ],
      usage: { input_tokens: 10, output_tokens: 20 },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const dispatcher = createJulesDispatcher({
      apiKey: 'secret-test-key',
      baseUrl: 'https://api.minimax.io/anthropic',
      model: 'MiniMax-M2.7',
      fetchImpl,
    });

    const result = await dispatcher.dispatch({
      mode: 'git_steward',
      task: 'Review staged changes before commit.',
      repositoryContext: 'src/App.tsx changed.',
    });

    expect(result).toMatchObject({ status: 'completed', text: 'Ship after tests pass.' });
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const [url, init] = call;
    const headers = new Headers(init.headers);
    const body = String(init.body);
    expect(url).toBe('https://api.minimax.io/anthropic/v1/messages');
    expect(headers.get('x-api-key')).toBe('secret-test-key');
    expect(body).not.toContain('secret-test-key');
    expect(body).toContain('MiniMax-M2.7');
    expect(body).toContain('EXECUTION PLAN & ARCHITECTURE TRIAGE');
  });

  test('extractAssistantText ignores thinking blocks', () => {
    expect(extractAssistantText([
      { type: 'thinking', thinking: 'do not expose' },
      { type: 'text', text: 'visible' },
    ])).toBe('visible');
  });
});
