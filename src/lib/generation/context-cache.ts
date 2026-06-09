/**
 * Gemini context caching helper.
 *
 * Official Gemini docs (checked 2026-05-24) say:
 * - Gemini 2.5+ models have implicit caching enabled by default.
 * - Cache hit likelihood improves when stable, shared content is at the
 *   beginning of the prompt.
 * - Explicit caches are created with `ai.caches.create(...)` and reused by
 *   passing `config.cachedContent` to `models.generateContent`.
 * - Minimum cacheable input is model-dependent: Flash-class models are ~1024
 *   tokens; Pro-class/Gemini 3 Pro models are ~4096 tokens.
 *
 * This helper only uses explicit caching when the stable config is large enough
 * to clear the model's threshold. Otherwise it leaves config unchanged and
 * relies on Gemini's implicit caching.
 */

import type { GoogleGenAI } from '@google/genai';

const CACHE_TTL_SECONDS = 3600;
const cacheNames = new Map<string, string>();

function estimatedTokens(value: unknown): number {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return Math.ceil(text.length / 4);
}

function minCacheTokensForModel(model: string): number {
  const m = model.toLowerCase();
  if (m.includes('pro')) return 4096;
  if (m.includes('flash')) return 1024;
  return 4096;
}

async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Move large stable generation config into a Gemini explicit context cache.
 * Returns the original config on any failure so generation is never blocked by
 * cache creation.
 */
export async function withGeminiContextCache(
  ai: GoogleGenAI,
  model: string,
  config: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const systemInstruction = config.systemInstruction;
  const tools = config.tools;
  const stablePayload = { systemInstruction, tools };
  const tokenEstimate = estimatedTokens(stablePayload);

  if (!systemInstruction && !tools) return config;
  if (tokenEstimate < minCacheTokensForModel(model)) return config;
  if (!('caches' in ai) || !(ai as any).caches?.create) return config;

  try {
    const key = `${model}:${await sha256(JSON.stringify(stablePayload))}`;
    let cachedContent = cacheNames.get(key);

    if (!cachedContent) {
      const created = await (ai as any).caches.create({
        model,
        config: {
          displayName: `gemini-harness-${key.slice(0, 16)}`,
          ttl: `${CACHE_TTL_SECONDS}s`,
          systemInstruction: systemInstruction as any,
          tools: tools as any,
        },
      });
      cachedContent = created?.name;
      if (!cachedContent) return config;
      cacheNames.set(key, cachedContent);
    }

    const { systemInstruction: _systemInstruction, tools: _tools, ...rest } = config;
    return { ...rest, cachedContent };
  } catch (error) {
    console.warn('[Gemini cache] Explicit context cache unavailable; using uncached config.', error);
    return config;
  }
}
