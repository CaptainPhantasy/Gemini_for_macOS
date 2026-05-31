import { describe, test, expect, beforeEach, vi } from 'vitest';

// In-memory mock for the `idb` module. Each mock store is a Map keyed by the
// record's `keyPath` field. This lets us exercise storage.ts without pulling
// in fake-indexeddb (Wave 0 is closed for new dependencies).
const stores: Record<string, Map<string, unknown>> = {
  threads: new Map(),
  gems: new Map(),
  scheduledActions: new Map(),
  artifacts: new Map(),
};

vi.mock('idb', () => {
  return {
    openDB: vi.fn(async (_name: string, _version: number, opts?: { upgrade?: (db: unknown) => void }) => {
      const db = {
        objectStoreNames: {
          contains: (name: string) => name in stores,
        },
        createObjectStore: (name: string) => {
          if (!(name in stores)) stores[name] = new Map();
          return {};
        },
        async getAll(storeName: string) {
          const map = stores[storeName];
          return map ? Array.from(map.values()) : [];
        },
        async put(storeName: string, value: { id: string }) {
          if (!stores[storeName]) stores[storeName] = new Map();
          stores[storeName].set(value.id, value);
        },
        async get(storeName: string, key: string) {
          return stores[storeName]?.get(key);
        },
        async delete(storeName: string, key: string) {
          stores[storeName]?.delete(key);
        },
      };
      // Run the upgrade callback once so createObjectStore is exercised.
      if (opts?.upgrade) opts.upgrade(db);
      return db;
    }),
  };
});

// Provide a Map-backed localStorage stub. jsdom in this project ships with a
// file-backed Storage that may be misconfigured (see vitest --localstorage-file
// warning) and lacks a working `.clear()` here, so we replace it wholesale for
// test isolation.
const lsBacking = new Map<string, string>();
const fakeLocalStorage = {
  getItem: (key: string) => (lsBacking.has(key) ? lsBacking.get(key)! : null),
  setItem: (key: string, value: string) => {
    lsBacking.set(key, String(value));
  },
  removeItem: (key: string) => {
    lsBacking.delete(key);
  },
  clear: () => {
    lsBacking.clear();
  },
  key: (i: number) => Array.from(lsBacking.keys())[i] ?? null,
  get length() {
    return lsBacking.size;
  },
};
Object.defineProperty(globalThis, 'localStorage', {
  value: fakeLocalStorage,
  writable: true,
  configurable: true,
});

import { storage } from '../lib/storage';
import type { Thread, AppSettings, PersonalIntelligence } from '../types';

beforeEach(async () => {
  for (const k of Object.keys(stores)) stores[k] = new Map();
  lsBacking.clear();
  await storage.init();
});

describe('storage round-trip', () => {
  test('saveThread → getThreads returns the saved thread', async () => {
    const thread: Thread = {
      id: 'thread-1',
      title: 'Hello',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as Thread;
    await storage.saveThread(thread);
    const threads = storage.getThreads();
    expect(threads.length).toBe(1);
    expect(threads[0].id).toBe('thread-1');
  });

  test('saveSettings → getSettings round-trips canonical autonomy mode via localStorage', async () => {
    const settings: AppSettings = {
      ...storage.getSettings(),
      theme: 'dark',
      autonomyMode: 'auto-accept',
    };
    await storage.saveSettings(settings);
    const reloaded = storage.getSettings();
    expect(reloaded.theme).toBe('dark');
    expect(reloaded.autonomyMode).toBe('auto-accept');
  });

  test('init migrates legacy stored autonomy modes', async () => {
    localStorage.setItem(
      'gemini-for-macos:settings',
      JSON.stringify({ ...storage.getSettings(), autonomyMode: 'risk-based', scopedPaths: ['/tmp'] })
    );

    await storage.init();

    const reloaded = storage.getSettings();
    expect(reloaded.autonomyMode).toBe('safe');
    expect('scopedPaths' in reloaded).toBe(false);
  });

  test('init sanitizes persisted MCP servers before reconnecting backend tools', async () => {
    localStorage.setItem(
      'gemini-for-macos:settings',
      JSON.stringify({
        ...storage.getSettings(),
        mcpServers: [
          { id: 'blank', name: 'New Server', type: 'stdio', command: '', args: [], enabled: true },
          { id: 'floyd', name: 'floyd-labs', type: 'stdio', command: 'npx', args: ['-y', '@anthropics/mcp-proxy'], enabled: true },
          { id: 'omega', name: 'omega-v2', type: 'stdio', command: 'node', args: ['/tmp/omega.js'], enabled: true },
        ],
      })
    );

    await storage.init();

    const servers = storage.getSettings().mcpServers;
    expect(servers.some(server => server.name === 'New Server')).toBe(false);
    expect(servers.find(server => server.name === 'floyd-labs')).toMatchObject({
      type: 'sse',
      url: 'https://floydslabs.com/api/mcp',
    });
    expect(servers.find(server => server.name === 'omega-v2')).toMatchObject({
      type: 'stdio',
      command: 'node',
    });
    const persisted = JSON.parse(localStorage.getItem('gemini-for-macos:settings') || '{}') as AppSettings;
    expect(persisted.mcpServers.some(server => server.name === 'New Server')).toBe(false);
    expect(persisted.mcpServers.find(server => server.name === 'floyd-labs')).toMatchObject({
      type: 'sse',
      url: 'https://floydslabs.com/api/mcp',
    });
  });

  test('init bootstraps defaults from backend config on the Gemini app route', async () => {
    const originalFetch = globalThis.fetch;
    const originalUrl = window.location.href;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: 'success',
      advanced: {
        settings: {
          theme: 'gemini',
          autonomyMode: 'ask',
          directoryLock: { enabled: false, rootPath: '' },
          googleDriveEnabled: true,
          notebookLmEnabled: true,
          searchEnabled: true,
          mcpServers: [
            { id: 'desktop-commander', name: 'Desktop Commander MCP', type: 'websocket', url: 'ws://localhost:13001/mcp', enabled: true },
            { id: 'echo-mcp', name: 'Echo MCP', type: 'stdio', command: '/opt/homebrew/bin/node', args: ['--import', 'tsx', '/Volumes/SanDisk1Tb/GEMINI for MacOS/src/server/echo-mcp-server.ts'], enabled: true },
          ],
          geminiApiKey: 'test-key',
          gcpOAuthClientId: 'oauth-client',
          autoSyncArtifacts: true,
        },
        personalIntelligence: { preferences: 'direct', instructions: 'Use tools.' },
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    globalThis.fetch = fetchMock as typeof fetch;
    window.history.pushState({}, '', '/gemini/');
    lsBacking.clear();

    try {
      await storage.init();
    } finally {
      globalThis.fetch = originalFetch;
      window.history.pushState({}, '', originalUrl);
    }

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:13001/api/default-config', expect.any(Object));
    expect(storage.getSettings().theme).toBe('gemini');
    expect(storage.getSettings().mcpServers.map(server => server.name)).toEqual(['Desktop Commander MCP', 'Echo MCP']);
    expect(storage.getPersonalIntelligence().instructions).toBe('Use tools.');
    expect(JSON.parse(localStorage.getItem('gemini-for-macos:settings') || '{}').theme).toBe('gemini');
  });

  test('savePersonalIntelligence round-trip', async () => {
    const pi: PersonalIntelligence = {
      preferences: 'concise',
      instructions: 'never apologize',
    };
    await storage.savePersonalIntelligence(pi);
    const reloaded = storage.getPersonalIntelligence();
    expect(reloaded.preferences).toBe('concise');
    expect(reloaded.instructions).toBe('never apologize');
  });
});
