/**
 * GEMINI for MacOS - Application Control API
 *
 * FLUM-compliant API endpoints for LLM-first operation of the Gemini application.
 * These endpoints allow an external LLM to control the application programmatically.
 *
 * The MCP server (port 13001) acts as the API gateway.
 * The React frontend exposes an internal API for storage operations.
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

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
  const startTime = options?.metadata?.startTime as number || Date.now();

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

// ── Application State Types ──────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  type?: 'text' | 'image' | 'video' | 'audio' | 'artifact' | 'live-session';
  artifactData?: string | unknown;
}

interface Thread {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  gemId?: string;
  pinned?: boolean;
}

interface Gem {
  id: string;
  name: string;
  systemInstruction: string;
  createdAt: number;
}

interface AppState {
  threads: Thread[];
  gems: Gem[];
  activeThreadId: string | null;
  settings: Record<string, unknown>;
  initialized: boolean;
}

// In-memory state that will be synced with frontend via WebSocket bridge
let appState: AppState = {
  threads: [],
  gems: [],
  activeThreadId: null,
  settings: {},
  initialized: false,
};

// WebSocket bridge to frontend for state synchronization
let frontendBridge: ((action: string, data: unknown) => Promise<unknown>) | null = null;

export function setFrontendBridge(bridge: (action: string, data: unknown) => Promise<unknown>) {
  frontendBridge = bridge;
}

export function updateAppState(state: Partial<AppState>) {
  appState = { ...appState, ...state };
}

// ── Thread Management Endpoints ──────────────────────────────────────────

/**
 * GET /app/threads - List all threads
 * FLUM Principle: Self-Documenting Responses
 */
router.get('/threads', async (req, res) => {
  const startTime = Date.now();

  const threads = appState.threads.map(t => ({
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
 * FLUM Principle: One Door In (action parameter not needed - endpoint IS the action)
 */
router.post('/threads', async (req, res) => {
  const startTime = Date.now();
  const { title, gemId } = req.query;

  const newThread: Thread = {
    id: uuidv4(),
    title: typeof title === 'string' ? title : 'New Chat',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    gemId: typeof gemId === 'string' ? gemId : undefined,
  };

  // Notify frontend to create the thread
  if (frontendBridge) {
    try {
      await frontendBridge('create_thread', newThread);
    } catch (e) {
      console.warn('[App API] Frontend bridge failed:', e);
    }
  }

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

  // Notify frontend
  if (frontendBridge) {
    try {
      await frontendBridge('delete_thread', { id });
    } catch (e) {
      console.warn('[App API] Frontend bridge failed:', e);
    }
  }

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
 * This is the main LLM interaction endpoint
 */
router.post('/threads/:id/messages', async (req, res) => {
  const startTime = Date.now();
  const { id } = req.params;
  const { content, type } = req.query;

  if (!content || typeof content !== 'string') {
    return res.json(flumResponse(
      'failure',
      'Missing required parameter: content',
      'Provide the message content to send to Gemini.',
      ['GET /app/threads/:id', 'POST /app/threads/:id/messages?content=...'],
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

  // Create user message
  const userMessage: Message = {
    id: uuidv4(),
    role: 'user',
    content,
    timestamp: Date.now(),
    type: typeof type === 'string' ? type as Message['type'] : 'text',
  };

  // Notify frontend to send the message and get response
  // The frontend will handle the actual Gemini API call
  if (frontendBridge) {
    try {
      const result = await frontendBridge('send_message', {
        threadId: id,
        message: userMessage,
      });

      // Result should contain the model's response
      const responseData = result as { modelMessage?: Message; error?: string };

      if (responseData.error) {
        return res.json(flumResponse(
          'failure',
          `Message failed: ${responseData.error}`,
          'Check your Gemini API key and try again.',
          ['GET /app/settings', 'POST /app/settings'],
          { tool: 'send_message', metadata: { startTime, threadId: id } }
        ));
      }

      return res.json(flumResponse(
        'success',
        responseData.modelMessage
          ? `Message sent. Response: ${responseData.modelMessage.content.substring(0, 100)}...`
          : 'Message sent, waiting for response.',
        responseData.modelMessage
          ? 'Message sent and response received. Use GET /app/threads/:id/messages to see full conversation.'
          : 'Check thread for response.',
        [
          `GET /app/threads/${id}/messages`,
          'GET /app/threads',
        ],
        {
          tool: 'send_message',
          metadata: {
            startTime,
            threadId: id,
            messageId: userMessage.id,
            responseId: responseData.modelMessage?.id,
          },
          advanced: {
            userMessage,
            modelMessage: responseData.modelMessage,
          },
          tip: 'Gemini will use Desktop Commander tools automatically when needed.',
        }
      ));
    } catch (e) {
      console.warn('[App API] Frontend bridge error:', e);
    }
  }

  // If no bridge, return pending status
  res.json(flumResponse(
    'pending',
    'Message queued, waiting for Gemini response.',
    'Check thread messages for response.',
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
    [`POST /app/threads?gemId=${id}`],
    {
      tool: 'get_gem',
      metadata: { startTime },
      advanced: { gem },
    }
  ));
});

/**
 * POST /app/gems - Create new gem
 */
router.post('/gems', async (req, res) => {
  const startTime = Date.now();
  const { name, systemInstruction } = req.query;

  if (!name || typeof name !== 'string') {
    return res.json(flumResponse(
      'failure',
      'Missing required parameter: name',
      'Provide a name for the new gem.',
      ['GET /app/gems'],
      { tool: 'create_gem', metadata: { startTime } }
    ));
  }

  const newGem: Gem = {
    id: uuidv4(),
    name,
    systemInstruction: typeof systemInstruction === 'string' ? systemInstruction : '',
    createdAt: Date.now(),
  };

  // Notify frontend
  if (frontendBridge) {
    try {
      await frontendBridge('create_gem', newGem);
    } catch (e) {
      console.warn('[App API] Frontend bridge failed:', e);
    }
  }

  res.json(flumResponse(
    'success',
    `Created gem: ${newGem.name}`,
    `Gem created with ID: ${newGem.id}. Use POST /app/threads?gemId=${newGem.id} to use this gem.`,
    [`POST /app/threads?gemId=${newGem.id}`, 'GET /app/gems'],
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
 */
router.post('/settings', async (req, res) => {
  const startTime = Date.now();
  const { key, value } = req.query;

  if (!key || typeof key !== 'string') {
    return res.json(flumResponse(
      'failure',
      'Missing required parameter: key',
      'Provide a setting key to update.',
      ['GET /app/settings'],
      { tool: 'update_settings', metadata: { startTime } }
    ));
  }

  // Notify frontend
  if (frontendBridge) {
    try {
      await frontendBridge('update_settings', { key, value });
    } catch (e) {
      console.warn('[App API] Frontend bridge failed:', e);
    }
  }

  res.json(flumResponse(
    'success',
    `Updated setting: ${key}`,
    'Setting updated successfully.',
    ['GET /app/settings'],
    {
      tool: 'update_settings',
      metadata: { startTime, key, value },
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
