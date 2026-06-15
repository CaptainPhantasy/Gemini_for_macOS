/**
 * GEMINI for MacOS — Model Selection
 *
 * The user's selected model (from Settings) is the sole determinant of which
 * model handles a request. Thinking budgets are still applied to WRITE/EXECUTE
 * intent for deeper reasoning. textFallback is reserved for the generation
 * wrapper's failover path — it is never used for primary routing.
 *
 * Architecture Roadmap §3c: Intent-Driven Multi-Model Orchestration
 */

import type { ToolDefinition } from '../mcp';
import { DEFAULT_MODEL_IDS } from '../model/model-catalog';

export interface ModelSelection {
  /** The model ID to use for this request. */
  model: string;
  /** Thinking budget to apply (undefined = no thinking config). */
  thinkingBudget?: number;
  /** Human-readable reason for the selection. */
  reason: string;
}

/** Patterns that indicate a high-impact (WRITE/EXECUTE) intent in the message. */
const HIGH_IMPACT_PATTERNS = /\b(write|create|delete|modify|execute|run|install|remove|edit|update|move|rename|chmod|chown)\b/i;

/** Tool name patterns that indicate WRITE/EXECUTE actions. */
const WRITE_TOOL_PATTERNS = /write|delete|create|execute|command|move|rename|chmod|chown/i;

/**
 * Select the model for a generation request.
 *
 * The user's configured `text` model is always used. High-impact actions
 * (WRITE/EXECUTE) get the thinking budget applied for deeper reasoning.
 * The model selector is the determining factor — no automatic routing
 * to a different model.
 */
export function selectModel(
  messageContent: string,
  tools: ToolDefinition[],
  settings: { models?: { text?: string; textFallback?: string }; thinkingBudgets?: { text?: number } }
): ModelSelection {
  const textModel = settings.models?.text ?? DEFAULT_MODEL_IDS.text;

  // Check for high-impact intent to apply thinking budget
  const hasWriteIntent = HIGH_IMPACT_PATTERNS.test(messageContent);
  const hasWriteTools = tools.some(t => WRITE_TOOL_PATTERNS.test(t.name));

  if (hasWriteIntent || hasWriteTools) {
    return {
      model: textModel,
      thinkingBudget: settings.thinkingBudgets?.text,
      reason: 'High-impact action — using selected model with thinking budget',
    };
  }

  // All other queries — use the user's selected model directly
  return {
    model: textModel,
    reason: 'Using user-selected model',
  };
}
