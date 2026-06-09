/**
 * GEMINI for MacOS — Intent-Driven Multi-Model Orchestration Engine
 *
 * Evaluates the active message content and available tools before
 * dispatching API requests, routing high-impact actions (WRITE, EXECUTE)
 * to the pro model with thinking budgets, and read-only operations (READ)
 * to the faster flash model.
 *
 * Architecture Roadmap §3c: Intent-Driven Multi-Model Orchestration
 */

import type { ToolDefinition } from '../mcp';
import { DEFAULT_MODEL_IDS } from '../model/model-catalog';
import { logger } from '../logger';

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

/** Patterns that indicate a read-only intent in the message. */
const READ_ONLY_PATTERNS = /^(list|read|show|get|check|what|who|where|how|when|is|are|can|does|do|tell|explain|describe|summarize|search|find|cat|head|ls|pwd|echo|which|type)\b/i;

/** Tool name patterns that indicate WRITE/EXECUTE actions. */
const WRITE_TOOL_PATTERNS = /write|delete|create|execute|command|move|rename|chmod|chown/i;

/** Tool name patterns that indicate READ actions. */
const READ_TOOL_PATTERNS = /read|list|get|search|info|head|cat|find/i;

/**
 * Select the optimal model for a generation request based on
 * message intent and available tool capabilities.
 *
 * Routing logic:
 * - WRITE/EXECUTE intent or tools → pro model with thinking budget
 * - READ-only intent with no WRITE tools → flash model (fast, cheap)
 * - Ambiguous or no tool use → pro model (safe default)
 */
export function selectModel(
  messageContent: string,
  tools: ToolDefinition[],
  settings: { models?: { text?: string; textFallback?: string }; thinkingBudgets?: { text?: number } }
): ModelSelection {
  const textModel = settings.models?.text ?? DEFAULT_MODEL_IDS.text;
  const flashModel = settings.models?.textFallback ?? DEFAULT_MODEL_IDS.textFallback;

  // Analyze message intent
  const hasWriteIntent = HIGH_IMPACT_PATTERNS.test(messageContent);
  const hasReadIntent = READ_ONLY_PATTERNS.test(messageContent.trim());

  // Analyze tool capabilities
  const hasWriteTools = tools.some(t => WRITE_TOOL_PATTERNS.test(t.name));
  const hasReadTools = tools.some(t => READ_TOOL_PATTERNS.test(t.name));

  // Route high-impact actions to pro model with thinking budget
  if (hasWriteIntent || hasWriteTools) {
    return {
      model: textModel,
      thinkingBudget: settings.thinkingBudgets?.text,
      reason: 'High-impact action detected — routing to pro model with thinking budget',
    };
  }

  // Route read-only queries to flash model for speed and cost efficiency
  if (hasReadIntent && !hasWriteIntent && !hasWriteTools) {
    logger.info('[orchestrator] Read-only query detected — routing to flash model');
    return {
      model: flashModel,
      reason: 'Read-only query — routing to flash model for speed and cost efficiency',
    };
  }

  // Default: pro model for complex or ambiguous queries
  return {
    model: textModel,
    thinkingBudget: settings.thinkingBudgets?.text,
    reason: 'Default — routing to pro model for complex or ambiguous queries',
  };
}