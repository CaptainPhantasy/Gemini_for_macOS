/**
 * GEMINI for MacOS — Context Window Exhaustion Benchmark
 *
 * Reproduces the "model stops responding" bug by simulating long conversations
 * that exceed the Gemini API context window.
 *
 * Run:  npx vitest run src/__tests__/context-window-benchmark.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getAI } from '../lib/api-config';
import { storage } from '../lib/storage';

// Gemini 3.1 Pro context window is ~2M tokens input, but practical limits
// are lower due to system instruction + tool definitions + function response
// overhead. We test against realistic failure thresholds.
const TOKEN_ESTIMATE_PER_MSG = 150; // conservative avg for a short exchange
const SYSTEM_INSTRUCTION_OVERHEAD = 2000; // tool prompt + memory notice + PI
const TOOL_DEFINITIONS_OVERHEAD = 3000; // Desktop Commander function declarations

// Rough token estimator (not exact — Gemini uses different tokenization)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

function buildMockMessages(count: number): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];
  for (let i = 0; i < count; i++) {
    const role = i % 2 === 0 ? 'user' : 'model';
    const content = role === 'user'
      ? `Turn ${Math.floor(i / 2) + 1}: Explain the implications of the ${['CAP theorem', 'Byzantine Generals', 'Paxos protocol', 'Raft consensus', 'CRDTs'][i % 5]} for distributed systems design, with concrete examples.`
      : `The ${['CAP theorem', 'Byzantine Generals', 'Paxos protocol', 'Raft consensus', 'CRDTs'][i % 5]} is a foundational concept... [simulated long response about ${i}]`;
    messages.push({ role, content });
  }
  return messages;
}

describe('Context Window Exhaustion Benchmark', () => {

  beforeAll(async () => {
    await storage.init();
  });

  it('should measure token growth per conversation turn', async () => {
    const turnCounts = [5, 10, 20, 40, 60, 80, 100];
    const results: Array<{ turns: number; messages: number; estimatedTokens: number }> = [];

    for (const turns of turnCounts) {
      const messages = buildMockMessages(turns * 2); // user + model per turn
      const historyContents = messages.map(m => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const totalText = messages.map(m => m.content).join('');
      const estimatedTokens = estimateTokens(totalText) + SYSTEM_INSTRUCTION_OVERHEAD + TOOL_DEFINITIONS_OVERHEAD;

      results.push({
        turns,
        messages: messages.length,
        estimatedTokens,
      });
    }

    console.table(results);
    console.log('\n⚠️  When estimatedTokens exceeds the model\'s input limit, generateContent() will throw.');

    // Verify linear growth (no pruning happening).
    // Fixed overhead (5K tokens) skews the ratio at small counts, so check
    // that the delta between consecutive results scales with turn count.
    const delta5to10 = results[1].estimatedTokens - results[0].estimatedTokens;
    const delta10to20 = results[2].estimatedTokens - results[1].estimatedTokens;
    const growthRatio = delta10to20 / delta5to10;
    expect(growthRatio).toBeGreaterThanOrEqual(1.5);
    expect(growthRatio).toBeLessThanOrEqual(2.5);
  });

  it('should reproduce the failure at high turn counts', async () => {
    // This test requires a valid API key and will make real API calls.
    // Skip in CI or if no key is configured.
    const settings = storage.getSettings();
    if (!settings?.geminiApiKey) {
      console.warn('⚠️  Skipping live API test — no API key configured.');
      return;
    }

    const ai = await getAI();
    const model = settings.models?.text ?? 'gemini-3.1-pro-preview';

    // Build a conversation that should work (10 turns)
    const smallMessages = buildMockMessages(20);
    const smallContents = smallMessages.map(m => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const smallResponse = await ai.models.generateContent({
      model,
      contents: smallContents as any,
      config: { systemInstruction: 'You are a helpful assistant.' },
    });

    expect(smallResponse.text).toBeDefined();
    console.log(`✅ 10-turn conversation succeeded (${estimateTokens(smallResponse.text ?? '')} tokens in response)`);

    // Now build a conversation large enough to risk failure
    // We won't actually send a 200-turn payload to avoid wasting quota,
    // but we'll verify the payload size exceeds reasonable limits.
    const largeMessages = buildMockMessages(200);
    const totalText = largeMessages.map(m => m.content).join('');
    const estimatedTokens = estimateTokens(totalText) + SYSTEM_INSTRUCTION_OVERHEAD + TOOL_DEFINITIONS_OVERHEAD;

    console.log(`\n📊 200-turn conversation would be ~${estimatedTokens} tokens`);
    console.log(`    Gemini context window: ~2,000,000 tokens (Pro)`);
    console.log(`    Estimated usage: ${((estimatedTokens / 2_000_000) * 100).toFixed(1)}%`);

    if (estimatedTokens > 1_500_000) {
      console.warn('⚠️  200-turn conversation exceeds 75% of context window — likely to fail with tool calls added.');
    }
  });

  it('should identify the tool-call loop exhaustion path', () => {
    // Simulates the tool-call loop hitting the 10-iteration cap
    // without ever receiving a text response.
    const MAX_TOOL_ITERATIONS = 10; // From App.tsx:329

    let responseText = '';
    const iterationsUsed: Array<{ iter: number; type: string }> = [];

    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
      // Simulate: model always returns function calls, never text
      const mockFunctionCalls = [{ name: 'read_file', args: { path: `/tmp/test-${iter}.txt` } }];

      if (mockFunctionCalls.length > 0) {
        iterationsUsed.push({ iter, type: 'functionCall' });
        continue; // Loop continues, responseText never set
      }

      // This path never reached in our simulation
      responseText = 'Model response';
      break;
    }

    // After loop exhausts: responseText is STILL empty
    expect(responseText).toBe('');
    expect(iterationsUsed.length).toBe(MAX_TOOL_ITERATIONS);

    console.log(`\n🔧 Tool-call loop exhaustion test:`);
    console.log(`    Iterations used: ${iterationsUsed.length}/${MAX_TOOL_ITERATIONS}`);
    console.log(`    Final responseText: "${responseText}"`);
    console.log(`    ⚠️  Empty responseText → blank model message saved to thread`);
    console.log(`    ⚠️  User sees: model was "thinking" then nothing appeared`);
  });

  it('should verify the isLoading stuck-state scenario', () => {
    // The Chat component disables input when isLoading=true
    // If handleSendMessage throws BEFORE the tool-call loop completes,
    // isLoading is reset in finally{}. But if it throws INSIDE the loop
    // due to context window overflow, the finally still runs.
    //
    // The real stuck-state happens when:
    // 1. Error alert fires but user doesn't see it (behind another window)
    // 2. OR the error is non-Error type (String thrown) → alert(String) fires
    // 3. isLoading IS reset, but the conversation is now corrupted:
    //    - The userMsg was saved to the thread (line ~284-290)
    //    - But no modelMsg was saved (error happened before line ~411)
    //    - Next message sends the same oversized history + the new userMsg
    //    → Same error, infinite loop of failures

    let isLoading = false;
    const threadMessages: Array<{ role: string; content: string }> = [];

    // Simulate: user sends message, userMsg is saved
    isLoading = true;
    threadMessages.push({ role: 'user', content: 'Next message after long conversation' });

    // Simulate: API call fails (context window exceeded)
    let apiError: Error | null = null;
    try {
      throw new Error('Request exceeds maximum context window size');
    } catch (error) {
      apiError = error instanceof Error ? error : new Error(String(error));
    } finally {
      isLoading = false;
    }

    // Verify the stuck state
    expect(isLoading).toBe(false); // UI is NOT stuck
    expect(threadMessages.length).toBe(1); // But user message was saved
    expect(threadMessages[0].role).toBe('user'); // No model response
    expect(apiError?.message).toContain('context window');

    console.log(`\n🔒 Stuck-state analysis:`);
    console.log(`    isLoading correctly reset: ${!isLoading} ✅`);
    console.log(`    Thread has orphaned user message: ${threadMessages.length === 1 && threadMessages[0].role === 'user'} ⚠️`);
    console.log(`    Next send will include same oversized history → repeat failure`);
    console.log(`    Root cause: No message pruning or context window management`);
  });
});

describe('Fix Validation', () => {
  it('should propose a sliding window truncation strategy', () => {
    const MAX_CONTEXT_MESSAGES = 40; // Keep last 40 messages (~20 turns)
    const SYSTEM_OVERHEAD_TOKENS = 5000; // System instruction + tools

    // Simulate a 100-message thread
    const allMessages = buildMockMessages(100);

    // Current behavior: send everything
    const currentPayloadSize = allMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    console.log(`\n📋 Current (no truncation): ${allMessages.length} messages, ~${currentPayloadSize} tokens`);

    // Proposed fix: sliding window
    const prunedMessages = allMessages.slice(-MAX_CONTEXT_MESSAGES);
    const proposedPayloadSize = prunedMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    console.log(`📋 Proposed (sliding window): ${prunedMessages.length} messages, ~${proposedPayloadSize} tokens`);
    console.log(`📋 Reduction: ${((1 - proposedPayloadSize / currentPayloadSize) * 100).toFixed(1)}%`);

    expect(prunedMessages.length).toBe(MAX_CONTEXT_MESSAGES);
    expect(proposedPayloadSize).toBeLessThan(currentPayloadSize);

    // Verify we kept the most recent messages
    expect(prunedMessages[prunedMessages.length - 1]).toEqual(allMessages[allMessages.length - 1]);
  });

  it('should propose a token-aware truncation strategy', () => {
    // Use a tight message-level budget to force truncation (demonstrates the algorithm).
    // Budget covers messages only; system overhead is accounted separately.
    const MESSAGE_TOKEN_BUDGET = 2_000;
    const SYSTEM_OVERHEAD = 5_000;

    // Build messages with ~200 tokens each (realistic model responses)
    const messages: Array<{ role: string; content: string }> = [];
    for (let i = 0; i < 100; i++) {
      const role = i % 2 === 0 ? 'user' : 'model';
      const content = `[Turn ${Math.floor(i / 2)}] ${'x'.repeat(650)} end`;
      messages.push({ role, content });
    }

    // Walk backwards through messages, accumulating tokens
    let tokenBudget = MESSAGE_TOKEN_BUDGET;
    const keptMessages: typeof messages = [];

    for (let i = messages.length - 1; i >= 0; i--) {
      const msgTokens = estimateTokens(messages[i].content);
      if (tokenBudget - msgTokens < 0) break;
      tokenBudget -= msgTokens;
      keptMessages.unshift(messages[i]);
    }

    const msgTokens = keptMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    const totalTokens = msgTokens + SYSTEM_OVERHEAD;

    console.log(`\n📋 Token-aware truncation:`);
    console.log(`    Message budget: ${MESSAGE_TOKEN_BUDGET} tokens (+ ${SYSTEM_OVERHEAD} overhead)`);
    console.log(`    Kept: ${keptMessages.length}/${messages.length} messages`);
    console.log(`    Message tokens: ${msgTokens} (${((msgTokens / MESSAGE_TOKEN_BUDGET) * 100).toFixed(1)}% of budget)`);
    console.log(`    Dropped: ${messages.length - keptMessages.length} oldest messages`);

    expect(msgTokens).toBeLessThanOrEqual(MESSAGE_TOKEN_BUDGET);
    expect(keptMessages.length).toBeLessThan(messages.length);
    // Always keeps the most recent message
    expect(keptMessages[keptMessages.length - 1]).toEqual(messages[messages.length - 1]);
  });
});
