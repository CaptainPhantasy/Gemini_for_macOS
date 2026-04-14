import { openDB, IDBPDatabase } from 'idb';
import { Thread, Gem, ScheduledAction, Artifact, PersonalIntelligence, AppSettings } from '../types';

// Browser-native persistence:
//   - localStorage for small hot data (settings, personalIntelligence)
//   - IndexedDB (via idb) for bulk data (threads, gems, scheduledActions, artifacts)
//
// Synchronous getters return an in-memory cache populated by storage.init().
// Async setters write through to the appropriate backend.

interface MemoryCache {
  threads: Thread[];
  gems: Gem[];
  scheduledActions: ScheduledAction[];
  artifacts: Artifact[];
  personalIntelligence: PersonalIntelligence;
  settings: AppSettings;
}

const DB_NAME = 'gemini-for-macos';
const DB_VERSION = 1;

const STORE_THREADS = 'threads';
const STORE_GEMS = 'gems';
const STORE_SCHEDULED = 'scheduledActions';
const STORE_ARTIFACTS = 'artifacts';

const LS_SETTINGS_KEY = 'gemini-for-macos:settings';
const LS_PI_KEY = 'gemini-for-macos:personalIntelligence';

const defaultSettings: AppSettings = {
  theme: 'system',
  autonomyMode: 'yolo',
  scopedPaths: ['/src', '/docs'],
  googleDriveEnabled: false,
  notebookLmEnabled: false,
  searchEnabled: true,
  mcpServers: [
    { id: 'default-ws', name: 'Default Local Server', type: 'websocket', url: 'ws://localhost:13001/mcp', enabled: true }
  ],
  geminiApiKey: ''
};

const defaultPersonalIntelligence: PersonalIntelligence = {
  preferences: '',
  instructions: ''
};

let memoryCache: MemoryCache = {
  threads: [],
  gems: [],
  scheduledActions: [],
  artifacts: [],
  personalIntelligence: defaultPersonalIntelligence,
  settings: defaultSettings
};

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_THREADS)) {
          db.createObjectStore(STORE_THREADS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_GEMS)) {
          db.createObjectStore(STORE_GEMS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_SCHEDULED)) {
          db.createObjectStore(STORE_SCHEDULED, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_ARTIFACTS)) {
          db.createObjectStore(STORE_ARTIFACTS, { keyPath: 'id' });
        }
      }
    });
  }
  return dbPromise;
}

function readLocalStorageJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return fallback;
    return parsed as T;
  } catch (e) {
    console.warn(`Failed to read localStorage key ${key} - using defaults:`, e instanceof Error ? e.message : String(e));
    return fallback;
  }
}

function writeLocalStorageJSON(key: string, value: unknown): void {
  const serialized = JSON.stringify(value);
  localStorage.setItem(key, serialized);
}

async function safeGetAll<T>(storeName: string): Promise<T[]> {
  try {
    const db = await getDB();
    if (!db.objectStoreNames.contains(storeName)) {
      return [];
    }
    const all = await db.getAll(storeName);
    return all as T[];
  } catch (e) {
    console.warn(`Failed to read object store ${storeName} - using empty array:`, e instanceof Error ? e.message : String(e));
    return [];
  }
}

function mergeSettings(partial: Partial<AppSettings> | null | undefined): AppSettings {
  if (!partial || typeof partial !== 'object') return defaultSettings;
  return { ...defaultSettings, ...partial };
}

function mergePersonalIntelligence(partial: Partial<PersonalIntelligence> | null | undefined): PersonalIntelligence {
  if (!partial || typeof partial !== 'object') return defaultPersonalIntelligence;
  return {
    preferences: typeof partial.preferences === 'string' ? partial.preferences : defaultPersonalIntelligence.preferences,
    instructions: typeof partial.instructions === 'string' ? partial.instructions : defaultPersonalIntelligence.instructions
  };
}

export const storage = {
  init: async (): Promise<void> => {
    // Load small hot data from localStorage
    const settingsRaw = readLocalStorageJSON<Partial<AppSettings> | null>(LS_SETTINGS_KEY, null);
    memoryCache.settings = mergeSettings(settingsRaw);

    const piRaw = readLocalStorageJSON<Partial<PersonalIntelligence> | null>(LS_PI_KEY, null);
    memoryCache.personalIntelligence = mergePersonalIntelligence(piRaw);

    // Load bulk data from IndexedDB
    memoryCache.threads = await safeGetAll<Thread>(STORE_THREADS);
    memoryCache.gems = await safeGetAll<Gem>(STORE_GEMS);
    memoryCache.scheduledActions = await safeGetAll<ScheduledAction>(STORE_SCHEDULED);
    memoryCache.artifacts = await safeGetAll<Artifact>(STORE_ARTIFACTS);
  },

  getThreads: (): Thread[] => memoryCache.threads,
  saveThread: async (thread: Thread): Promise<void> => {
    const index = memoryCache.threads.findIndex((t: Thread) => t.id === thread.id);
    if (index >= 0) {
      memoryCache.threads = [
        ...memoryCache.threads.slice(0, index),
        thread,
        ...memoryCache.threads.slice(index + 1)
      ];
    } else {
      memoryCache.threads = [...memoryCache.threads, thread];
    }
    const db = await getDB();
    await db.put(STORE_THREADS, thread);
  },

  getGems: (): Gem[] => memoryCache.gems,
  saveGem: async (gem: Gem): Promise<void> => {
    const index = memoryCache.gems.findIndex((g: Gem) => g.id === gem.id);
    if (index >= 0) {
      memoryCache.gems = [
        ...memoryCache.gems.slice(0, index),
        gem,
        ...memoryCache.gems.slice(index + 1)
      ];
    } else {
      memoryCache.gems = [...memoryCache.gems, gem];
    }
    const db = await getDB();
    await db.put(STORE_GEMS, gem);
  },

  getScheduledActions: (): ScheduledAction[] => memoryCache.scheduledActions,
  saveScheduledAction: async (action: ScheduledAction): Promise<void> => {
    const index = memoryCache.scheduledActions.findIndex((a: ScheduledAction) => a.id === action.id);
    if (index >= 0) {
      memoryCache.scheduledActions = [
        ...memoryCache.scheduledActions.slice(0, index),
        action,
        ...memoryCache.scheduledActions.slice(index + 1)
      ];
    } else {
      memoryCache.scheduledActions = [...memoryCache.scheduledActions, action];
    }
    const db = await getDB();
    await db.put(STORE_SCHEDULED, action);
  },

  getArtifacts: (): Artifact[] => memoryCache.artifacts,
  saveArtifact: async (artifact: Artifact): Promise<void> => {
    const index = memoryCache.artifacts.findIndex((a: Artifact) => a.id === artifact.id);
    if (index >= 0) {
      memoryCache.artifacts = [
        ...memoryCache.artifacts.slice(0, index),
        artifact,
        ...memoryCache.artifacts.slice(index + 1)
      ];
    } else {
      memoryCache.artifacts = [...memoryCache.artifacts, artifact];
    }
    const db = await getDB();
    await db.put(STORE_ARTIFACTS, artifact);
  },
  deleteArtifact: async (id: string): Promise<void> => {
    memoryCache.artifacts = memoryCache.artifacts.filter((a: Artifact) => a.id !== id);
    const db = await getDB();
    await db.delete(STORE_ARTIFACTS, id);
  },

  getPersonalIntelligence: (): PersonalIntelligence => memoryCache.personalIntelligence,
  savePersonalIntelligence: async (pi: PersonalIntelligence): Promise<void> => {
    memoryCache.personalIntelligence = pi;
    writeLocalStorageJSON(LS_PI_KEY, pi);
  },

  getSettings: (): AppSettings => memoryCache.settings,
  saveSettings: async (settings: AppSettings): Promise<void> => {
    memoryCache.settings = settings;
    writeLocalStorageJSON(LS_SETTINGS_KEY, settings);
  }
};
