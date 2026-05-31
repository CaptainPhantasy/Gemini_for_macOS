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

interface ResponseParts {
  parts: Array<Record<string, unknown>>;
  text: string;
  functionCalls: Array<{ name: string; args: Record<string, unknown>; id?: string }>;
}

type StreamChunkCallback = (chunk: {
  chunkText: string;
  aggregatedText: string;
  parts: Array<Record<string, unknown>>;
  functionCalls: Array<{ name: string; args: Record<string, unknown>; id?: string }>;
}) => void | Promise<void>;

function extractResponseFragments(response: any): ResponseParts {
  const textParts: string[] = [];
  const parts: Array<Record<string, unknown>> = [];
  const functionCalls: Array<{ name: string; args: Record<string, unknown>; id?: string }> = [];

  const candidateParts = (response as any)?.candidates?.[0]?.content?.parts;
  if (Array.isArray(candidateParts)) {
    for (const part of candidateParts) {
      if (part && typeof part === 'object') {
        parts.push(part as Record<string, unknown>);
        if (typeof (part as any).text === 'string') {
          textParts.push((part as any).text);
        }
        const functionCall = (part as any).functionCall;
        if (functionCall) {
          functionCalls.push({
            name: functionCall.name || functionCall.functionName,
            args: functionCall.args || {},
            id: functionCall.id,
          });
        }
      }
    }
  }

  if (textParts.length > 0) {
    return { parts, text: textParts.join('\n'), functionCalls };
  }

  const rawText = (response as any)?.text;
  const text = typeof rawText === 'function' ? rawText() : rawText || '';
  return {
    parts: Array.isArray(parts) ? parts : [],
    text: typeof text === 'string' ? text : String(text ?? ''),
    functionCalls,
  };
}

function mergeStreamedResponse(chunks: any[]): { response: any; responseText: string; responseParts: Array<Record<string, unknown>> } {
  if (chunks.length === 0) {
    return { response: { text: '' }, responseText: '', responseParts: [] };
  }

  const allParts: Array<Record<string, unknown>> = [];
  let responseText = '';
  let usageMetadata: unknown = undefined;
  let lastChunk: any = chunks[chunks.length - 1];

  for (const chunk of chunks) {
    const parsed = extractResponseFragments(chunk);
    if (parsed.parts.length > 0) {
      allParts.push(...parsed.parts);
    }
    if (parsed.text) {
      responseText += parsed.text;
    }
    if ((chunk as any)?.usageMetadata) {
      usageMetadata = (chunk as any).usageMetadata;
    }
  }

  const candidates = Array.isArray(lastChunk?.candidates) ? [...lastChunk.candidates] : [];
  if (candidates.length > 0) {
    const lastCandidate = candidates[0];
    candidates[0] = {
      ...lastCandidate,
      content: {
        ...(lastCandidate?.content ?? {}),
        parts: allParts.length > 0 ? allParts : ((lastCandidate?.content?.parts ?? []) as Array<Record<string, unknown>>),
      },
    };
  } else if (allParts.length > 0) {
    candidates[0] = { role: 'model', parts: allParts };
  }

  return {
    response: {
      ...(lastChunk ?? {}),
      ...(candidates.length > 0 ? { candidates } : {}),
      ...(usageMetadata !== undefined ? { usageMetadata } : {}),
      ...(responseText ? { text: responseText } : {}),
    },
    responseText,
    responseParts: allParts,
  };
}

export interface GenerationStreamOptions extends GenerationOptions {
  onChunk?: StreamChunkCallback;
}

interface GenerationStreamState {
  responseText: string;
  responseParts: Array<Record<string, unknown>>;
}

/**
 * Execute a streaming generation request with the same retry + fallback contract
 * used by {@link generateWithFailover}.
 */
export async function generateWithFailoverStream(
  options: GenerationStreamOptions,
): Promise<GenerationResult & GenerationStreamState> {
  const { ai, maxRetries = DEFAULT_MAX_RETRIES, fallbackModel, onChunk } = options;
  const primaryModel = options.model;

  const runStream = async (model: string): Promise<GenerationResult & GenerationStreamState> => {
    const chunks: any[] = [];
    let responseText = '';
    let responseParts: Array<Record<string, unknown>> = [];
    const stream = await ai.models.generateContentStream({
      model,
      contents: options.contents as any,
      config: options.config as any,
    });

    for await (const chunk of stream) {
      chunks.push(chunk);
      const parsed = extractResponseFragments(chunk);
      responseText += parsed.text;
      if (parsed.parts.length > 0) {
        responseParts.push(...parsed.parts);
      }
      if (parsed.text.length > 0 || parsed.functionCalls.length > 0) {
        await onChunk?.({
          chunkText: parsed.text,
          aggregatedText: responseText,
          parts: responseParts,
          functionCalls: parsed.functionCalls,
        });
      }
    }

    const merged = mergeStreamedResponse(chunks);
    responseText = merged.responseText;
    responseParts = merged.responseParts;
    return {
      response: merged.response,
      responseText,
      responseParts,
      modelUsed: model,
      retries: 0,
      fellBack: model !== primaryModel,
    };
  };

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await runStream(primaryModel);
      return {
        ...result,
        retries: attempt,
        fellBack: false,
      };
    } catch (err) {
      lastError = err as Error;
      if (!isTransientError(err)) {
        logger.error(`[failover] Non-transient error from ${primaryModel}: ${lastError.message}`);
        break;
      }
      const backoff = Math.min(INITIAL_BACKOFF_MS * Math.pow(2, attempt), MAX_BACKOFF_MS);
      logger.warn(`[failover] Attempt ${attempt + 1}/${maxRetries} failed for ${primaryModel}, retrying in ${backoff}ms: ${lastError.message}`);
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }

  if (fallbackModel) {
    logger.warn(`[failover] Primary model ${primaryModel} exhausted retries, falling back to ${fallbackModel}`);
    try {
      const result = await runStream(fallbackModel);
      return {
        ...result,
        modelUsed: fallbackModel,
        retries: maxRetries,
        fellBack: true,
      };
    } catch (fallbackErr) {
      logger.error(`[failover] Fallback model ${fallbackModel} also failed: ${(fallbackErr as Error).message}`);
      throw fallbackErr;
    }
  }

  throw lastError;
}
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