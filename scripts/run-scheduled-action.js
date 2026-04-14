#!/usr/bin/env node
// Standalone Node runner invoked by cron/launchd for scheduled GEMINI actions.
// Usage: node run-scheduled-action.js <actionId>
//
// Responsibilities:
//   1. Load the scheduled action definition from ~/Library/Application Support/gemini-for-macos/data/scheduledActions.json
//   2. Load the Gemini API key from settings.json in the same directory
//   3. Deduplicate via /tmp lock file (30s window)
//   4. Call Gemini via @google/genai
//   5. Append the result as a message in threads.json under a 'scheduled-runs' thread

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const LOCK_WINDOW_MS = 30 * 1000;
const DEFAULT_MODEL = 'gemini-3.1-flash-lite-preview';
const DATA_DIR = join(
  homedir(),
  'Library',
  'Application Support',
  'gemini-for-macos',
  'data'
);
const SCHEDULED_ACTIONS_PATH = join(DATA_DIR, 'scheduledActions.json');
const SETTINGS_PATH = join(DATA_DIR, 'settings.json');
const THREADS_PATH = join(DATA_DIR, 'threads.json');
const SCHEDULED_THREAD_ID = 'scheduled-runs';

function logError(message, err) {
  const detail = err instanceof Error ? err.stack || err.message : String(err ?? '');
  process.stderr.write(`[run-scheduled-action] ${message}${detail ? ': ' + detail : ''}\n`);
}

function logInfo(message) {
  process.stderr.write(`[run-scheduled-action] ${message}\n`);
}

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function readJsonIfExists(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    const raw = await readFile(path, 'utf-8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    logError(`Failed to parse ${path}`, err);
    return fallback;
  }
}

async function loadScheduledAction(actionId) {
  const data = await readJsonIfExists(SCHEDULED_ACTIONS_PATH, []);
  const list = Array.isArray(data) ? data : [];
  return list.find((a) => a && a.id === actionId) || null;
}

async function loadApiKey() {
  const settings = await readJsonIfExists(SETTINGS_PATH, {});
  const key = settings && typeof settings.geminiApiKey === 'string' ? settings.geminiApiKey : '';
  if (!key) throw new Error('geminiApiKey not set in settings.json');
  return key;
}

async function checkAndWriteLock(actionId) {
  const lockPath = `/tmp/gemini-for-macos-schedule-${actionId}.lock`;
  try {
    const st = await stat(lockPath);
    const age = Date.now() - st.mtimeMs;
    if (age < LOCK_WINDOW_MS) {
      return { duplicate: true, lockPath };
    }
  } catch {
    // No lock yet — proceed
  }
  await writeFile(lockPath, String(Date.now()), 'utf-8');
  return { duplicate: false, lockPath };
}

async function callGemini(apiKey, prompt) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: DEFAULT_MODEL,
    contents: prompt,
  });
  const text =
    (response && typeof response.text === 'string' && response.text) ||
    (response && response.candidates && response.candidates[0]?.content?.parts?.[0]?.text) ||
    '';
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}

async function appendToScheduledThread(actionId, responseText) {
  const data = await readJsonIfExists(THREADS_PATH, []);
  const threads = Array.isArray(data) ? data : [];
  let thread = threads.find((t) => t && t.id === SCHEDULED_THREAD_ID);
  const now = Date.now();
  if (!thread) {
    thread = {
      id: SCHEDULED_THREAD_ID,
      title: 'Scheduled Runs',
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    threads.push(thread);
  }
  const message = {
    id: randomUUID(),
    role: 'model',
    content: responseText,
    timestamp: now,
    type: 'text',
    scheduled: { actionId, timestamp: now },
  };
  thread.messages = Array.isArray(thread.messages) ? thread.messages : [];
  thread.messages.push(message);
  thread.updatedAt = now;
  await ensureDir(dirname(THREADS_PATH));
  await writeFile(THREADS_PATH, JSON.stringify(threads, null, 2), 'utf-8');
}

async function main() {
  const actionId = process.argv[2];
  if (!actionId) {
    logError('Missing required argument: actionId');
    process.exit(2);
  }

  await ensureDir(DATA_DIR);

  const lock = await checkAndWriteLock(actionId);
  if (lock.duplicate) {
    logInfo(`Deduplication: recent lock for ${actionId} within ${LOCK_WINDOW_MS}ms — exiting 0`);
    process.exit(0);
  }

  const action = await loadScheduledAction(actionId);
  if (!action) {
    logError(`No scheduled action with id '${actionId}' found in ${SCHEDULED_ACTIONS_PATH}`);
    process.exit(3);
  }
  if (action.enabled === false) {
    logInfo(`Action ${actionId} is disabled — exiting 0`);
    process.exit(0);
  }
  if (!action.prompt || typeof action.prompt !== 'string') {
    logError(`Action ${actionId} has no prompt string`);
    process.exit(4);
  }

  const apiKey = await loadApiKey();
  logInfo(`Calling Gemini for action ${actionId} (model=${DEFAULT_MODEL})`);
  const responseText = await callGemini(apiKey, action.prompt);
  await appendToScheduledThread(actionId, responseText);
  logInfo(`Action ${actionId} complete — response appended to thread '${SCHEDULED_THREAD_ID}'`);
  process.exit(0);
}

main().catch((err) => {
  logError('Fatal error', err);
  process.exit(1);
});
