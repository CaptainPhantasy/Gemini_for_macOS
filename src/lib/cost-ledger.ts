// Gemini API cost ledger backed by IndexedDB.
//
// Records per-call token usage and estimated USD cost so the UI can surface
// "today" / "this month" spend and per-capability breakdowns. Pricing values
// below are placeholder estimates; they MUST be reconciled against the
// authoritative Cloud Billing API before being shown to end users as
// billing-grade numbers. Until then, treat these values as directional only.
import { openDB, type IDBPDatabase } from 'idb';
import { logger } from './logger';

export type ModelPricing = {
  inputPerMillion: number; // USD per 1M input tokens
  outputPerMillion: number; // USD per 1M output tokens
  thinkingPerMillion?: number; // USD per 1M thinking tokens (if priced separately)
};

/**
 * Estimated Gemini / Veo / Lyria pricing per 1M tokens (USD).
 *
 * NOTE: These are ROUGH PLACEHOLDERS to unblock UI and ledger work. They are
 * not authoritative. The canonical source of truth is the Google Cloud
 * Billing API, and entries here should be reconciled against it before any
 * invoice-sensitive reporting ships.
 */
export const PRICING: Record<string, ModelPricing> = {
  'gemini-3.1-pro-preview': {
    inputPerMillion: 1.25,
    outputPerMillion: 5.0,
    thinkingPerMillion: 5.0,
  },
  'gemini-3.1-flash-lite-preview': {
    inputPerMillion: 0.075,
    outputPerMillion: 0.3,
  },
  'gemini-3-pro-image-preview': {
    inputPerMillion: 1.25,
    outputPerMillion: 10.0,
  },
  'gemini-3.1-flash-image-preview': {
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
  },
  'veo-3.1-lite-generate-preview': {
    // Video gen is typically priced per-second; values here approximate a
    // per-token equivalent for ledger accounting only.
    inputPerMillion: 0.5,
    outputPerMillion: 20.0,
  },
  'lyria-3-clip-preview': {
    inputPerMillion: 0.3,
    outputPerMillion: 8.0,
  },
  'gemini-2.5-flash-preview-tts': {
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
  },
  'gemini-3.1-flash-live-preview': {
    inputPerMillion: 0.5,
    outputPerMillion: 2.0,
  },
};

export type LedgerEntry = {
  id: string;
  timestamp: number;
  model: string;
  capability: string; // 'chat' | 'image' | 'video' | 'music' | 'tts' | 'live' | 'magic-wand'
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  estimatedCostUsd: number;
};

const DB_NAME = 'gemini-for-macos-cost';
const DB_VERSION = 1;
const STORE = 'ledger';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp');
        }
      },
    });
  }
  return dbPromise;
}

function newId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof (crypto as any).randomUUID === 'function'
  ) {
    return (crypto as any).randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function computeCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  thinkingTokens: number
): number {
  const pricing = PRICING[model];
  if (!pricing) {
    logger.warn(
      `[cost-ledger] No pricing entry for model "${model}"; recording 0 cost.`
    );
    return 0;
  }
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
  const thinkingCost =
    (thinkingTokens / 1_000_000) *
    (pricing.thinkingPerMillion ?? pricing.outputPerMillion);
  return inputCost + outputCost + thinkingCost;
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfMonth(): number {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

async function entriesInRange(from: number, to: number): Promise<LedgerEntry[]> {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readonly');
  const index = tx.store.index('timestamp');
  const range = IDBKeyRange.bound(from, to);
  const results: LedgerEntry[] = [];
  let cursor = await index.openCursor(range);
  while (cursor) {
    results.push(cursor.value as LedgerEntry);
    cursor = await cursor.continue();
  }
  await tx.done;
  return results;
}

export const costLedger = {
  async record(
    entry: Omit<LedgerEntry, 'id' | 'estimatedCostUsd'>
  ): Promise<LedgerEntry> {
    const full: LedgerEntry = {
      id: newId(),
      estimatedCostUsd: computeCost(
        entry.model,
        entry.inputTokens,
        entry.outputTokens,
        entry.thinkingTokens
      ),
      ...entry,
    };
    const db = await getDb();
    await db.put(STORE, full);
    return full;
  },

  async todayUsd(): Promise<number> {
    const entries = await entriesInRange(startOfToday(), Date.now());
    return entries.reduce((sum, e) => sum + e.estimatedCostUsd, 0);
  },

  async monthUsd(): Promise<number> {
    const entries = await entriesInRange(startOfMonth(), Date.now());
    return entries.reduce((sum, e) => sum + e.estimatedCostUsd, 0);
  },

  async byCapability(): Promise<Record<string, number>> {
    const entries = await entriesInRange(startOfToday(), Date.now());
    const out: Record<string, number> = {};
    for (const e of entries) {
      out[e.capability] = (out[e.capability] ?? 0) + e.estimatedCostUsd;
    }
    return out;
  },

  async history(days: number): Promise<LedgerEntry[]> {
    const from = Date.now() - days * 24 * 60 * 60 * 1000;
    const entries = await entriesInRange(from, Date.now());
    return entries.sort((a, b) => b.timestamp - a.timestamp);
  },
};
