/**
 * GEMINI for MacOS — Dual-Tier Cascading Failover Wrapper
 *
 * Wraps primary generation requests with automatic retry and model fallback.
 * Mirrors the exponential backoff pattern used for WebSocket reconnection
 * (RECONNECT_BACKOFF_MS). If the primary model (e.g. gemini-3.1-pro-preview)
 * fails with a transient error, the wrapper retries with exponential backoff
 * up to MAX_RETRIES. If all retries are exhausted, it falls back to the
 * configured textFallback model (e.g. gemini-3.1-flash-lite-preview).
 *
 * Architecture Roadmap §3b: Automated Dual-Tier Cascading Failover
 */

import type { GoogleGenAI } from '@google/genai';
import { logger } from './logger';

/** Maximum delay between retries (mirrors RECONNECT_BACKOFF_MS from mcp.ts). */
const MAX_BACKOFF_MS = 30_000;
/** Default maximum retry attempts before falling back. */
const DEFAULT_MAX_RETRIES = 3;
/** Initial backoff delay in milliseconds. */
const INITIAL_BACKOFF_MS = 1_000;

export interface GenerationOptions {
  /** The GoogleGenAI instance (from getAI()). */
  ai: GoogleGenAI;
  /** Primary model ID (e.g. 'gemini-3.1-pro-preview'). */
  model: string;
  /** Fallback model ID (e.g. 'gemini-3.1-flash-lite-preview'). */
  fallbackModel?: string;
  /** Conversation contents array. */
  contents: Array<Record<string, unknown>>;
  /** Generation config (systemInstruction, thinkingConfig, tools, etc.). */
  config: Record<string, unknown>;
  /** Maximum retry attempts before falling back. Defaults to 3. */
  maxRetries?: number;
}

export interface GenerationResult {
  /** The raw generation response. */
  response: any;
  /** The model ID that ultimately fulfilled the request. */
  modelUsed: string;
  /** Number of retries attempted on the primary model. */
  retries: number;
  /** Whether the fallback model was used. */
  fellBack: boolean;
}

/**
 * Classify an error as transient (retryable) or permanent.
 * Transient errors include rate limits, timeouts, and server errors.
 */
export function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  // Rate-limiting and quota errors
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('quota')) return true;
  // Network-level timeouts and resets
  if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('econnrefused') || msg.includes('etimedout')) return true;
  // Server errors (5xx)
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('service unavailable') || msg.includes('internal error')) return true;
  // Network errors
  if (msg.includes('network') || msg.includes('fetch')) return true;
  return false;
}

/**
 * Execute a generation request with automatic retry and fallback.
 *
 * 1. Try the primary model up to `maxRetries` times with exponential backoff.
 * 2. If all retries fail, attempt the fallback model once (if configured).
 * 3. If the fallback also fails, throw the last error.
 */
export async function generateWithFailover(options: GenerationOptions): Promise<GenerationResult> {
  const { ai, maxRetries = DEFAULT_MAX_RETRIES, fallbackModel } = options;
  const primaryModel = options.model;

  // Phase 1: Try primary model with exponential backoff
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: primaryModel,
        contents: options.contents as any,
        config: options.config as any,
      });
      return { response, modelUsed: primaryModel, retries: attempt, fellBack: false };
    } catch (err) {
      lastError = err as Error;
      if (!isTransientError(err)) {
        // Non-transient error — don't retry, fall through to fallback
        logger.error(`[failover] Non-transient error from ${primaryModel}: ${lastError.message}`);
        break;
      }
      const backoff = Math.min(INITIAL_BACKOFF_MS * Math.pow(2, attempt), MAX_BACKOFF_MS);
      logger.warn(`[failover] Attempt ${attempt + 1}/${maxRetries} failed for ${primaryModel}, retrying in ${backoff}ms: ${lastError.message}`);
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }

  // Phase 2: Fall back to cheaper model
  if (fallbackModel) {
    logger.warn(`[failover] Primary model ${primaryModel} exhausted retries, falling back to ${fallbackModel}`);
    try {
      const response = await ai.models.generateContent({
        model: fallbackModel,
        contents: options.contents as any,
        config: options.config as any,
      });
      return { response, modelUsed: fallbackModel, retries: maxRetries, fellBack: true };
    } catch (fallbackErr) {
      logger.error(`[failover] Fallback model ${fallbackModel} also failed: ${(fallbackErr as Error).message}`);
      throw fallbackErr;
    }
  }

  // No fallback configured — throw the last primary error
  throw lastError;
}