/**
 * GEMINI for MacOS - Application Control API
 *
 * FLUM-compliant API endpoints for LLM-first operation of the Gemini application.
 * These endpoints allow an external LLM (and the mobile client) to control the
 * application programmatically.
 *
 * The MCP server (port 13001) acts as the API gateway and mounts this router at
 * `/app`. App state is owned server-side and persisted to disk
 * (`~/.gemini-for-macos/app-state.json`) so it survives restarts and can be
 * consumed by a second client (mobile) without the desktop renderer running.
 * When the desktop renderer is attached, a frontend bridge keeps its IndexedDB
 * cache in sync with mutations driven through this API.
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { AppState, Gem, Message, Thread } from '../types';

const router = express.Router();

// ── Server-Owned, Persisted App State ─────────────────────────────────────

type PersistedAppState = AppState & { version: number };

const APP_STATE_FILE = path.join(os.homedir(), '.gemini-for-macos', 'app-state.json');
const APP_STATE_VERSION = 1;
const APP_STATE_DEFAULTS: AppState = {
  threads: [],
  gems: [],
  activeThreadId: null,
  settings: {},
  initialized: false,
};

let appState: AppState = { ...APP_STATE_DEFAULTS };
let appStateInitialized = false;
let appStateLoadPromise: Promise<void> | null = null;

async function readPersistedAppState(): Promise<PersistedAppState> {
  try {
    const raw = await fs.readFile(APP_STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PersistedAppState>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...APP_STATE_DEFAULTS, version: APP_STATE_VERSION };
    }
    return {
      threads: Array.isArray(parsed.threads) ? parsed.threads : APP_STATE_DEFAULTS.threads,
      gems: Array.isArray(parsed.gems) ? parsed.gems : APP_STATE_DEFAULTS.gems,
      activeThreadId:
        typeof parsed.activeThreadId === 'string' ? parsed.activeThreadId : APP_STATE_DEFAULTS.activeThreadId,
      settings:
        parsed.settings && typeof parsed.settings === 'object' && !Array.isArray(parsed.settings)
          ? (parsed.settings as Record<string, unknown>)
          : APP_STATE_DEFAULTS.settings,
      initialized: typeof parsed.initialized === 'boolean' ? parsed.initialized : APP_STATE_DEFAULTS.initialized,
      version: typeof parsed.version === 'number' ? parsed.version : APP_STATE_VERSION,
    };
  } catch {
    return { ...APP_STATE_DEFAULTS, version: APP_STATE_VERSION };
  }
}

async function ensureAppStateLoaded(): Promise<void> {
  if (appStateInitialized) return;
  if (!appStateLoadPromise) {
    appStateLoadPromise = (async () => {
      const persisted = await readPersistedAppState();
      const { version: _version, ...state } = persisted;
      appState = { ...APP_STATE_DEFAULTS, ...state };
      appStateInitialized = true;
    })();
  }
  await appStateLoadPromise;
  appStateLoadPromise = null;
}

async function persistAppState(): Promise<void> {
  await fs.mkdir(path.dirname(APP_STATE_FILE), { recursive: true });
  const payload: PersistedAppState = { ...appState, version: APP_STATE_VERSION };
  await fs.writeFile(APP_STATE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
}

// Load (and keep loaded) before any handler reads/mutates state.
router.use((_req, _res, next) => {
  ensureAppStateLoaded().then(() => next()).catch(next);
});

/**
 * Replace/merge the canonical app state and persist it. Exposed so the desktop
 * renderer (or a future migration) can push its IndexedDB snapshot into the
 * server-owned store.
 */
export async function updateAppState(state: Partial<AppState>): Promise<void> {
  await ensureAppStateLoaded();
  appState = { ...appState, ...state };
  await persistAppState();
}

// ── Frontend Bridge ───────────────────────────────────────────────────────

let frontendBridge: ((action: string, data: unknown) => Promise<unknown>) | null = null;

export function setFrontendBridge(bridge: (action: string, data: unknown) => Promise<unknown>) {
  frontendBridge = bridge;
}

async function invokeFrontendBridge(action: string, data: unknown): Promise<unknown | null> {
  if (!frontendBridge) return null;
  try {
    return await frontendBridge(action, data);
  } catch (error) {
    console.warn('[App API] Frontend bridge failed:', error);
    return null;
  }
}

function normalizeMessageType(value: unknown): Message['type'] {
  if (
    value === 'image' ||
    value === 'video' ||
    value === 'audio' ||
    value === 'artifact' ||
    value === 'live-session' ||
    value === 'text'
  ) {
    return value;
  }
  return 'text';
}

// ── FLUM Response Builder ─────────────────────────────────────────────────

interface FLUMResponse {
  status: 'success' | 'failure' | 'pending';
  result: string;
  hint: string;
  actions_available: string[];
  tip?: string;
  metadata: {
    latency_ms: number;
    trace_id: string;
    tool?: string;
    [key: string]: unknown;
  };
  advanced: Record<string, unknown> | null;
}

function generateTraceId(): string {
  return `gemini_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function flumResponse(
  status: 'success' | 'failure' | 'pending',
  result: string,
  hint: string,
  actionsAvailable: string[],
  options?: {
    tool?: string;
    tip?: string;
    metadata?: Record<string, unknown>;
    advanced?: Record<string, unknown>;
  }
): FLUMResponse {
  const traceId = generateTraceId();
  const startTime = (options?.metadata?.startTime as number) || Date.now();

  return {
    status,
    result,
    hint,
    actions_available: actionsAvailable,
    ...(options?.tip ? { tip: options.tip } : {}),
    metadata: {
      latency_ms: Date.now() - startTime,
      trace_id: traceId,
      ...(options?.tool ? { tool: options.tool } : {}),
      ...(options?.metadata || {}),
    },
    advanced: options?.advanced || null,
  };
}

// ── Thread Management Endpoints ──────────────────────────────────────────

/**
 * GET /app/threads - List all threads
 * FLUM Principle: Self-Documenting Responses
 */
router.get('/threads', async (req, res) => {
  const startTime = Date.now();

  const threads = [...appState.threads]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(t => ({
      id: t.id,
      title: t.title,
      messageCount: t.messages.length,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      pinned: t.pinned || false,
      gemId: t.gemId || null,
    }));

  res.json(flumResponse(
    'success',
    `${threads.length} threads available.`,
    'Use GET /app/threads/:id to view a thread, or POST /app/threads to create a new thread.',
    ['GET /app/threads/:id', 'POST /app/threads', 'GET /app/gems'],
    {
      tool: 'list_threads',
      metadata: { startTime, count: threads.length },
      advanced: { threads },
      tip: 'Threads are sorted by most recently updated.',
    }
  ));
});

/**
 * GET /app/threads/:id - Get thread details
 */
router.get('/threads/:id', async (req, res) => {
  const startTime = Date.now();
  const { id } = req.params;

  const thread = appState.threads.find(t => t.id === id);
  if (!thread) {
    return res.json(flumResponse(
      'failure',
      `Thread not found: ${id}`,
      'Use GET /app/threads to see available threads.',
      ['GET /app/threads', 'POST /app/threads'],
      { tool: 'get_thread', metadata: { startTime } }
    ));
  }

  res.json(flumResponse(
    'success',
    `Thread: ${thread.title} (${thread.messages.length} messages)`,
    'Use POST /app/threads/:id/messages to add a message, or DELETE /app/threads/:id to delete.',
    [
      'POST /app/threads/:id/messages',
      'DELETE /app/threads/:id',
      'GET /app/threads/:id/messages',
    ],
    {
      tool: 'get_thread',
      metadata: { startTime, messageCount: thread.messages.length },
      advanced: { thread },
      tip: 'Use the gemId field to assign a persona to this thread.',
    }
  ));
});

/**
 * POST /app/threads - Create new thread
 * FLUM Principle: One Door In (endpoint IS the action)
 * Reads from req.body so mobile can send structured payloads (W3).
 */
router.post('/threads', async (req, res) => {
  const startTime = Date.now();
  const body = (req.body ?? {}) as { title?: unknown; gemId?: unknown };

  const newThread: Thread = {
    id: uuidv4(),
    title: typeof body.title === 'string' && body.title.trim() ? body.title : 'New Chat',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    gemId: typeof body.gemId === 'string' ? body.gemId : undefined,
  };

  appState = { ...appState, threads: [...appState.threads, newThread] };
  await persistAppState();
  await invokeFrontendBridge('create_thread', newThread);

  res.json(flumResponse(
    'success',
    `Created thread: ${newThread.title}`,
    `Thread created with ID: ${newThread.id}. Use POST /app/threads/${newThread.id}/messages to send a message.`,
    [`POST /app/threads/${newThread.id}/messages`, 'GET /app/threads'],
    {
      tool: 'create_thread',
      metadata: { startTime, threadId: newThread.id },
      advanced: { thread: newThread },
      tip: 'Assign a gemId to give this thread a specific persona.',
    }
  ));
});

/**
 * DELETE /app/threads/:id - Delete thread
 */
router.delete('/threads/:id', async (req, res) => {
  const startTime = Date.now();
  const { id } = req.params;

  const thread = appState.threads.find(t => t.id === id);
  if (!thread) {
    return res.json(flumResponse(
      'failure',
      `Thread not found: ${id}`,
      'Use GET /app/threads to see available threads.',
      ['GET /app/threads'],
      { tool: 'delete_thread', metadata: { startTime } }
    ));
  }

  appState = {
    ...appState,
    threads: appState.threads.filter(t => t.id !== id),
    activeThreadId: appState.activeThreadId === id ? null : appState.activeThreadId,
  };
  await persistAppState();
  await invokeFrontendBridge('delete_thread', { id });

  res.json(flumResponse(
    'success',
    `Deleted thread: ${thread.title}`,
    'Thread deleted. Use GET /app/threads to see remaining threads.',
    ['GET /app/threads', 'POST /app/threads'],
    {
      tool: 'delete_thread',
      metadata: { startTime, deletedId: id },
    }
  ));
});

/**
 * GET /app/threads/:id/messages - Get thread messages
 */
router.get('/threads/:id/messages', async (req, res) => {
  const startTime = Date.now();
  const { id } = req.params;

  const thread = appState.threads.find(t => t.id === id);
  if (!thread) {
    return res.json(flumResponse(
      'failure',
      `Thread not found: ${id}`,
      'Use GET /app/threads to see available threads.',
      ['GET /app/threads'],
      { tool: 'get_messages', metadata: { startTime } }
    ));
  }

  res.json(flumResponse(
    'success',
    `${thread.messages.length} messages in thread.`,
    'Use POST /app/threads/:id/messages to add a new message.',
    [`POST /app/threads/${id}/messages`],
    {
      tool: 'get_messages',
      metadata: { startTime, threadId: id, count: thread.messages.length },
      advanced: { messages: thread.messages },
    }
  ));
});

/**
 * POST /app/threads/:id/messages - Send message to Gemini
 * This is the main LLM interaction endpoint.
 * Reads content/type from req.body (W3) so non-trivial messages and
 * attachments are not truncated or mangled by query-string limits.
 */
router.post('/threads/:id/messages', async (req, res) => {
  const startTime = Date.now();
  const { id } = req.params;
  const body = (req.body ?? {}) as { content?: unknown; type?: unknown };
  const content = body.content;

  if (!content || typeof content !== 'string') {
    return res.json(flumResponse(
      'failure',
      'Missing required parameter: content',
      'Provide the message content in the JSON body to send to Gemini.',
      ['GET /app/threads/:id', 'POST /app/threads/:id/messages'],
      { tool: 'send_message', metadata: { startTime, threadId: id } }
    ));
  }

  const thread = appState.threads.find(t => t.id === id);
  if (!thread) {
    return res.json(flumResponse(
      'failure',
      `Thread not found: ${id}`,
      'Use GET /app/threads to see available threads.',
      ['GET /app/threads', 'POST /app/threads'],
      { tool: 'send_message', metadata: { startTime } }
    ));
  }

  const userMessage: Message = {
    id: uuidv4(),
    role: 'user',
    content,
    timestamp: Date.now(),
    type: normalizeMessageType(body.type),
  };

  // Record the user message in the canonical store immediately so the
  // conversation is consistent even if the model response arrives later.
  appState = {
    ...appState,
    threads: appState.threads.map(t =>
      t.id === id ? { ...t, messages: [...t.messages, userMessage], updatedAt: Date.now() } : t
    ),
  };
  await persistAppState();

  // Notify the frontend to perform the actual Gemini API call.
  const result = await invokeFrontendBridge('send_message', { threadId: id, message: userMessage });
  const responseData = (result ?? {}) as { modelMessage?: Message; error?: string };

  if (result && responseData.error) {
    return res.json(flumResponse(
      'failure',
      `Message failed: ${responseData.error}`,
      'Check your Gemini API key and try again.',
      ['GET /app/settings', 'POST /app/settings'],
      { tool: 'send_message', metadata: { startTime, threadId: id } }
    ));
  }

  if (result && responseData.modelMessage) {
    appState = {
      ...appState,
      threads: appState.threads.map(t =>
        t.id === id
          ? { ...t, messages: [...t.messages, responseData.modelMessage as Message], updatedAt: Date.now() }
          : t
      ),
    };
    await persistAppState();

    return res.json(flumResponse(
      'success',
      `Message sent. Response: ${responseData.modelMessage.content.substring(0, 100)}...`,
      'Message sent and response received. Use GET /app/threads/:id/messages to see the full conversation.',
      [`GET /app/threads/${id}/messages`, 'GET /app/threads'],
      {
        tool: 'send_message',
        metadata: {
          startTime,
          threadId: id,
          messageId: userMessage.id,
          responseId: responseData.modelMessage.id,
        },
        advanced: { userMessage, modelMessage: responseData.modelMessage },
        tip: 'Gemini will use Desktop Commander tools automatically when needed.',
      }
    ));
  }

  // No bridge attached (e.g. mobile-only) — message persisted, response pending.
  res.json(flumResponse(
    'pending',
    'Message queued, waiting for Gemini response.',
    'Check thread messages for the response once the desktop client processes it.',
    [`GET /app/threads/${id}/messages`],
    {
      tool: 'send_message',
      metadata: { startTime, threadId: id, messageId: userMessage.id },
    }
  ));
});

// ── Gem (Persona) Management Endpoints ───────────────────────────────────

/**
 * GET /app/gems - List all gems (personas)
 */
router.get('/gems', async (req, res) => {
  const startTime = Date.now();

  res.json(flumResponse(
    'success',
    `${appState.gems.length} gems available.`,
    'Use GET /app/gems/:id for details, or POST /app/gems to create a new gem.',
    ['GET /app/gems/:id', 'POST /app/gems'],
    {
      tool: 'list_gems',
      metadata: { startTime, count: appState.gems.length },
      advanced: { gems: appState.gems },
      tip: 'Gems provide system instructions to Gemini for specific personas.',
    }
  ));
});

/**
 * GET /app/gems/:id - Get gem details
 */
router.get('/gems/:id', async (req, res) => {
  const startTime = Date.now();
  const { id } = req.params;

  const gem = appState.gems.find(g => g.id === id);
  if (!gem) {
    return res.json(flumResponse(
      'failure',
      `Gem not found: ${id}`,
      'Use GET /app/gems to see available gems.',
      ['GET /app/gems', 'POST /app/gems'],
      { tool: 'get_gem', metadata: { startTime } }
    ));
  }

  res.json(flumResponse(
    'success',
    `Gem: ${gem.name}`,
    'Use this gem ID as gemId parameter when creating threads.',
    [`POST /app/threads (gemId=${id})`],
    {
      tool: 'get_gem',
      metadata: { startTime },
      advanced: { gem },
    }
  ));
});

/**
 * POST /app/gems - Create new gem
 * Reads from req.body (W3).
 */
router.post('/gems', async (req, res) => {
  const startTime = Date.now();
  const body = (req.body ?? {}) as { name?: unknown; systemInstruction?: unknown };

  if (!body.name || typeof body.name !== 'string') {
    return res.json(flumResponse(
      'failure',
      'Missing required parameter: name',
      'Provide a name for the new gem in the JSON body.',
      ['GET /app/gems'],
      { tool: 'create_gem', metadata: { startTime } }
    ));
  }

  const newGem: Gem = {
    id: uuidv4(),
    name: body.name,
    systemInstruction: typeof body.systemInstruction === 'string' ? body.systemInstruction : '',
    createdAt: Date.now(),
  };

  appState = { ...appState, gems: [...appState.gems, newGem] };
  await persistAppState();
  await invokeFrontendBridge('create_gem', newGem);

  res.json(flumResponse(
    'success',
    `Created gem: ${newGem.name}`,
    `Gem created with ID: ${newGem.id}. Pass gemId=${newGem.id} when creating a thread to use this gem.`,
    ['POST /app/threads', 'GET /app/gems'],
    {
      tool: 'create_gem',
      metadata: { startTime, gemId: newGem.id },
      advanced: { gem: newGem },
      tip: 'The systemInstruction field defines how Gemini will behave with this gem.',
    }
  ));
});

// ── Settings Endpoints ────────────────────────────────────────────────────

/**
 * GET /app/settings - Get application settings
 */
router.get('/settings', async (req, res) => {
  const startTime = Date.now();

  res.json(flumResponse(
    'success',
    'Application settings retrieved.',
    'Use POST /app/settings to update settings.',
    ['POST /app/settings'],
    {
      tool: 'get_settings',
      metadata: { startTime },
      advanced: { settings: appState.settings },
      tip: 'Settings include theme, autonomy mode, MCP servers, and Gemini API configuration.',
    }
  ));
});

/**
 * POST /app/settings - Update application settings
 * Reads from req.body (W3).
 */
router.post('/settings', async (req, res) => {
  const startTime = Date.now();
  const body = (req.body ?? {}) as { key?: unknown; value?: unknown };

  if (!body.key || typeof body.key !== 'string') {
    return res.json(flumResponse(
      'failure',
      'Missing required parameter: key',
      'Provide a setting key in the JSON body to update.',
      ['GET /app/settings'],
      { tool: 'update_settings', metadata: { startTime } }
    ));
  }

  const key = body.key;
  appState = { ...appState, settings: { ...appState.settings, [key]: body.value } };
  await persistAppState();
  await invokeFrontendBridge('update_settings', { key, value: body.value });

  res.json(flumResponse(
    'success',
    `Updated setting: ${key}`,
    'Setting updated successfully.',
    ['GET /app/settings'],
    {
      tool: 'update_settings',
      metadata: { startTime, key },
    }
  ));
});

// ── Application Status Endpoint ───────────────────────────────────────────

/**
 * GET /app/status - Get application status
 */
router.get('/status', async (req, res) => {
  const startTime = Date.now();

  const status = {
    initialized: appState.initialized,
    threads: appState.threads.length,
    gems: appState.gems.length,
    activeThread: appState.activeThreadId,
    uptime: process.uptime(),
  };

  res.json(flumResponse(
    appState.initialized ? 'success' : 'pending',
    appState.initialized
      ? `Application ready. ${status.threads} threads, ${status.gems} gems.`
      : 'Application initializing...',
    appState.initialized
      ? 'Ready for operations. Use /app/threads to start a conversation.'
      : 'Wait for initialization to complete.',
    ['GET /app/threads', 'GET /app/gems', 'POST /app/threads'],
    {
      tool: 'app_status',
      metadata: { startTime },
      advanced: status,
      tip: appState.initialized ? undefined : 'Restart the application if initialization hangs.',
    }
  ));
});

export default router;
