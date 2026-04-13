import { Thread, Gem, ScheduledAction, Artifact, PersonalIntelligence, AppSettings } from '../types';
import { mcpClient } from './mcp';
import {
  parseThreadsJSON,
  parseGemsJSON,
  parseScheduledActionsJSON,
  parseArtifactsJSON,
  parsePersonalIntelligenceJSON,
  parseAppSettingsJSON
} from './json-validation';

// Local storage handler for chat history, Gems, Scheduled Actions, Artifacts using MCP
// For synchronous reads in UI we keep a memory cache, but writes go through MCP
interface MemoryCache {
  threads: Thread[];
  gems: Gem[];
  scheduledActions: ScheduledAction[];
  artifacts: Artifact[];
  personalIntelligence: PersonalIntelligence;
  settings: AppSettings;
}

const defaultSettings: AppSettings = {
  theme: 'system',
  autonomyMode: 'yolo',
  scopedPaths: ['/src', '/docs'],
  googleDriveEnabled: false,
  notebookLmEnabled: false,
  searchEnabled: true,
  mcpServers: [
    { id: 'default-ws', name: 'Default Local Server', type: 'websocket', url: 'ws://localhost:3001/mcp', enabled: true }
  ],
  geminiApiKey: ''
};

let memoryCache: MemoryCache = {
  threads: [],
  gems: [],
  scheduledActions: [],
  artifacts: [],
  personalIntelligence: { preferences: '', instructions: '' },
  settings: defaultSettings
};

export const storage = {
  init: async () => {
    try {
      const threadsData = await mcpClient.readFile('/data/threads.json');
      memoryCache.threads = parseThreadsJSON(threadsData);
    } catch (e) {
      console.warn('Failed to load threads data - using default empty array:', e instanceof Error ? e.message : String(e));
      memoryCache.threads = [];
    }
    
    try {
      const gemsData = await mcpClient.readFile('/data/gems.json');
      memoryCache.gems = parseGemsJSON(gemsData);
    } catch (e) {
      console.warn('Failed to load gems data - using default empty array:', e instanceof Error ? e.message : String(e));
      memoryCache.gems = [];
    }
    
    try {
      const scheduleData = await mcpClient.readFile('/data/scheduledActions.json');
      memoryCache.scheduledActions = parseScheduledActionsJSON(scheduleData);
    } catch (e) {
      console.warn('Failed to load scheduled actions - using default empty array:', e instanceof Error ? e.message : String(e));
      memoryCache.scheduledActions = [];
    }
    
    try {
      const artifactsData = await mcpClient.readFile('/data/artifacts.json');
      memoryCache.artifacts = parseArtifactsJSON(artifactsData);
    } catch (e) {
      console.warn('Failed to load artifacts data - using default empty array:', e instanceof Error ? e.message : String(e));
      memoryCache.artifacts = [];
    }
    
    try {
      const piData = await mcpClient.readFile('/data/personalIntelligence.json');
      memoryCache.personalIntelligence = parsePersonalIntelligenceJSON(piData);
    } catch (e) {
      console.warn('Failed to load personal intelligence data - using defaults:', e instanceof Error ? e.message : String(e));
      memoryCache.personalIntelligence = { preferences: '', instructions: '' };
    }

    try {
      const settingsData = await mcpClient.readFile('/data/settings.json');
      memoryCache.settings = parseAppSettingsJSON(settingsData);
    } catch (e) {
      console.warn('Failed to load settings data - using defaults:', e instanceof Error ? e.message : String(e));
      memoryCache.settings = defaultSettings;
    }
  },

  getThreads: (): Thread[] => memoryCache.threads,
  saveThread: async (thread: Thread) => {
    const index = memoryCache.threads.findIndex((t: Thread) => t.id === thread.id);
    if (index >= 0) {
      memoryCache.threads[index] = thread;
    } else {
      memoryCache.threads = [...memoryCache.threads, thread];
    }
    try {
      await mcpClient.writeFile('/data/threads.json', JSON.stringify(memoryCache.threads, null, 2));
    } catch (e) {
      console.warn('Failed to save to MCP, using memory cache only:', e);
    }
  },
  
  getGems: (): Gem[] => memoryCache.gems,
  saveGem: async (gem: Gem) => {
    memoryCache.gems = [...memoryCache.gems, gem];
    await mcpClient.writeFile('/data/gems.json', JSON.stringify(memoryCache.gems, null, 2));
  },
  
  getScheduledActions: (): ScheduledAction[] => memoryCache.scheduledActions,
  saveScheduledAction: async (action: ScheduledAction) => {
    memoryCache.scheduledActions = [...memoryCache.scheduledActions, action];
    await mcpClient.writeFile('/data/scheduledActions.json', JSON.stringify(memoryCache.scheduledActions, null, 2));
  },

  getArtifacts: (): Artifact[] => memoryCache.artifacts,
  saveArtifact: async (artifact: Artifact) => {
    const index = memoryCache.artifacts.findIndex((a: Artifact) => a.id === artifact.id);
    if (index >= 0) {
      memoryCache.artifacts[index] = artifact;
    } else {
      memoryCache.artifacts = [...memoryCache.artifacts, artifact];
    }
    await mcpClient.writeFile('/data/artifacts.json', JSON.stringify(memoryCache.artifacts, null, 2));
  },
  deleteArtifact: async (id: string) => {
    memoryCache.artifacts = memoryCache.artifacts.filter((a: Artifact) => a.id !== id);
    await mcpClient.writeFile('/data/artifacts.json', JSON.stringify(memoryCache.artifacts, null, 2));
  },

  getPersonalIntelligence: (): PersonalIntelligence => memoryCache.personalIntelligence,
  savePersonalIntelligence: async (pi: PersonalIntelligence) => {
    memoryCache.personalIntelligence = pi;
    await mcpClient.writeFile('/data/personalIntelligence.json', JSON.stringify(pi, null, 2));
  },

  getSettings: (): AppSettings => memoryCache.settings,
  saveSettings: async (settings: AppSettings) => {
    memoryCache.settings = settings;
    await mcpClient.writeFile('/data/settings.json', JSON.stringify(settings, null, 2));
  }
};

