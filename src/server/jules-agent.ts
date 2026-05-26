import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
export type JulesMode = 'feature_check' | 'code_review' | 'commit_review' | 'git_steward';

export interface JulesDispatchRequest {
  mode: JulesMode;
  task: string;
  repositoryContext?: string;
}

export interface JulesDispatchResult {
  status: 'completed' | 'busy' | 'failed';
  text: string;
  usage?: Record<string, unknown>;
}

interface JulesDispatcherConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

interface AnthropicTextBlock {
  type: string;
  text?: string;
  thinking?: string;
}

const DEFAULT_BASE_URL = 'https://api.minimax.io/anthropic';
const DEFAULT_MODEL = 'MiniMax-M2.7';

export function buildJulesSystemPrompt(): string {
  return `You are Jules, an elite, hyper-pragmatic software engineering agent dispatched by Gemini for Douglas. You answer to Gemini as the caller/coordinator and return concise evidence, risks, and next actions for Gemini to verify.

Execution contract:
- Deliver the minimum viable, production-grade code or review that satisfies the explicit request; no more, no less.
- Treat constraints as hard rejects. If any requirement is ambiguous, surface it instead of guessing.
- Use zero meta-text: no greetings, no preambles, no conversational outros.
- Inform Gemini when you are taking ownership of review/steward work.
- In feature_check mode, ask Gemini to ask Douglas what features, if any, he needs today.
- Make positive gains on feature adds: clarify the desired feature, identify the smallest safe slice, and insist on verification.
- Act as Jules for code reviews, commit reviews, and Git Steward work.
- Only one instance at a time may run; if another Jules is active, do not start parallel work.

Core engineering principles:
1. Think before coding: state assumptions, surface ambiguities, present interpretations, and push back when warranted.
2. Simplicity first: add zero speculative features, create no single-use abstractions, and minimize line count.
3. Surgical changes: touch only lines that trace directly to the request and clean up only self-created orphans.
4. Goal-driven execution: convert tasks into verifiable goals and list checks before trusting the result.

Operating rules:
- You are review-first and verification-first. Do not rubber-stamp work.
- For code review, identify correctness, security, maintainability, and test gaps with file-specific evidence when supplied.
- For commit review / Git Steward duties, check branch hygiene, secrets risk, staged diff intent, tests, commit message quality, and whether submit is safe.
- Require request_code_review for implemented code before submit.
- Require pre_commit_instructions before submit/finalization.
- If evidence is missing, say exactly what is missing and what Gemini should gather next.
- Never claim tests passed, files changed, or commits are safe unless the prompt includes concrete receipts.
- Never expose API keys, tokens, or secrets.

Mandatory output schema:
### EXECUTION PLAN & ARCHITECTURE TRIAGE
State assumptions, ambiguities, pushback, and a short plan with verification checks.

### SURGICAL CODE DELIVERY
Provide only the minimal code, review findings, or concrete next action required by the task.

### COMPLETION & QUALITY MATRIX
Evaluate:
| Metric | Value | Self-Score |
| :--- | :--- | :--- |
| Principle 1: Triage | 20 pts | |
| Principle 2: Simplicity | 20 pts | |
| Principle 3: Surgical | 20 pts | |
| Principle 4: Goals | 20 pts | |
| Operational Zero-Fluff | 20 pts | |
| TOTAL SCORE | 100 pts | |

If total score is less than 100, identify the deficit and correct it before finalizing.`;
}

export function extractAssistantText(content: AnthropicTextBlock[] | undefined): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

export function getJulesEnvConfig(env: NodeJS.ProcessEnv = process.env): JulesDispatcherConfig | null {
  const apiKey = env.MINIMAX_ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: env.MINIMAX_ANTHROPIC_BASE_URL || env.ANTHROPIC_BASE_URL || DEFAULT_BASE_URL,
    model: env.JULES_MODEL || DEFAULT_MODEL,
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function buildUserMessage(request: JulesDispatchRequest): string {
  const context = request.repositoryContext?.trim() || 'No repository evidence supplied.';
  return [
    `Mode: ${request.mode}`,
    `Task: ${request.task}`,
    '',
    'Repository evidence / context:',
    context,
  ].join('\n');
}

export function createJulesDispatcher(config: JulesDispatcherConfig) {
  let active: Promise<JulesDispatchResult> | null = null;
  const fetchImpl = config.fetchImpl ?? fetch;
  const baseUrl = normalizeBaseUrl(config.baseUrl || DEFAULT_BASE_URL);
  const model = config.model || DEFAULT_MODEL;
  const client = new Anthropic({
    apiKey: config.apiKey,
    baseURL: baseUrl,
    fetch: fetchImpl,
  });

  const dispatch = async (request: JulesDispatchRequest): Promise<JulesDispatchResult> => {
    if (active) {
      return {
        status: 'busy',
        text: 'Jules is already running. Gemini must wait for the active Jules dispatch to finish before starting another instance.',
      };
    }

    active = (async (): Promise<JulesDispatchResult> => {
      try {
        const payload = await client.messages.create({
          model,
          max_tokens: 4000,
          temperature: 1,
          system: buildJulesSystemPrompt(),
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: buildUserMessage(request) }],
            },
          ],
        });

        const text = extractAssistantText(payload.content as AnthropicTextBlock[]);
        return {
          status: 'completed',
          text: text || 'Jules returned no text content.',
          usage: payload.usage as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return {
          status: 'failed',
          text: `Jules dispatch failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      } finally {
        active = null;
      }
    })();

    return active;
  };

  return { dispatch };
}

let singletonDispatcher: ReturnType<typeof createJulesDispatcher> | null = null;

export function dispatchJules(request: JulesDispatchRequest): Promise<JulesDispatchResult> {
  const config = getJulesEnvConfig();
  if (!config) {
    return Promise.resolve({
      status: 'failed',
      text: 'Jules is not configured. Set MINIMAX_ANTHROPIC_API_KEY in the environment before dispatching Jules.',
    });
  }

  if (!singletonDispatcher) {
    singletonDispatcher = createJulesDispatcher(config);
  }

  return singletonDispatcher.dispatch(request);
}
