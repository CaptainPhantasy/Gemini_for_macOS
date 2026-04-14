import { describe, test, expect, beforeEach, vi } from 'vitest';

// Reuse a Map-backed mock for `idb` so we can drive costLedger.record without
// a real IndexedDB. The cost-ledger module uses `IDBKeyRange` at module scope,
// so jsdom must provide it (or we stub it).
const ledgerStore = new Map<string, unknown>();

if (typeof (globalThis as { IDBKeyRange?: unknown }).IDBKeyRange === 'undefined') {
  (globalThis as { IDBKeyRange?: unknown }).IDBKeyRange = {
    bound: (lower: number, upper: number) => ({ lower, upper }),
  };
}

vi.mock('idb', () => {
  return {
    openDB: vi.fn(async (_name: string, _version: number, opts?: { upgrade?: (db: unknown) => void }) => {
      const fakeStore = {
        index: (_name: string) => ({
          async openCursor(range: { lower: number; upper: number }) {
            const matching = Array.from(ledgerStore.values()).filter((v) => {
              const ts = (v as { timestamp: number }).timestamp;
              return ts >= range.lower && ts <= range.upper;
            });
            let i = 0;
            const makeCursor = (): unknown => {
              if (i >= matching.length) return null;
              const value = matching[i];
              return {
                value,
                async continue() {
                  i += 1;
                  return makeCursor();
                },
              };
            };
            return makeCursor();
          },
        }),
        createIndex: () => undefined,
      };
      const db = {
        objectStoreNames: { contains: () => false },
        createObjectStore: () => fakeStore,
        async put(_store: string, value: { id: string }) {
          ledgerStore.set(value.id, value);
        },
        transaction: (_store: string, _mode: string) => ({
          store: fakeStore,
          done: Promise.resolve(),
        }),
      };
      if (opts?.upgrade) opts.upgrade(db);
      return db;
    }),
  };
});

import { costLedger, PRICING } from '../lib/cost-ledger';

beforeEach(() => {
  ledgerStore.clear();
});

describe('cost-ledger pricing math', () => {
  test('record() computes USD cost using PRICING for known model', async () => {
    const inputTokens = 1_000_000;
    const outputTokens = 500_000;
    const thinkingTokens = 0;
    const entry = await costLedger.record({
      model: 'gemini-3.1-pro-preview',
      capability: 'chat',
      inputTokens,
      outputTokens,
      thinkingTokens,
      timestamp: Date.now(),
    });

    const pricing = PRICING['gemini-3.1-pro-preview'];
    const expected =
      (inputTokens / 1_000_000) * pricing.inputPerMillion +
      (outputTokens / 1_000_000) * pricing.outputPerMillion;
    expect(entry.estimatedCostUsd).toBeCloseTo(expected, 6);
    expect(entry.estimatedCostUsd).toBeGreaterThan(0);
  });

  test('unknown model returns 0 cost (does not throw)', async () => {
    const entry = await costLedger.record({
      model: 'totally-not-a-real-model',
      capability: 'chat',
      inputTokens: 1000,
      outputTokens: 1000,
      thinkingTokens: 0,
      timestamp: Date.now(),
    });
    expect(entry.estimatedCostUsd).toBe(0);
  });

  test('todayUsd sums entries recorded today', async () => {
    await costLedger.record({
      model: 'gemini-3.1-flash-lite-preview',
      capability: 'chat',
      inputTokens: 2_000_000,
      outputTokens: 1_000_000,
      thinkingTokens: 0,
      timestamp: Date.now(),
    });
    await costLedger.record({
      model: 'gemini-3.1-flash-lite-preview',
      capability: 'chat',
      inputTokens: 1_000_000,
      outputTokens: 0,
      thinkingTokens: 0,
      timestamp: Date.now(),
    });
    const total = await costLedger.todayUsd();
    expect(total).toBeGreaterThan(0);
    // Two entries, both today: 2*0.075 + 1*0.3 + 1*0.075 = 0.525
    expect(total).toBeCloseTo(0.525, 6);
  });
});
