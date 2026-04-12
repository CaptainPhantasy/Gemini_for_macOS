import { Thread, Gem, ScheduledAction, Artifact, PersonalIntelligence } from '../types';
import { mcpClient } from './mcp';

// Local storage handler for chat history, Gems, Scheduled Actions, Artifacts using MCP
// For synchronous reads in UI we keep a memory cache, but writes go through MCP
let memoryCache: any = {
  threads: [],
  gems: [],
  scheduledActions: [],
  artifacts: [],
  personalIntelligence: { preferences: '', instructions: '' }
};

export const storage = {
  init: async () => {
    try {
      const threadsData = await mcpClient.readFile('/data/threads.json');
      if (threadsData) memoryCache.threads = JSON.parse(threadsData);
    } catch (e) { /* silently ignore missing file */ }
    
    try {
      const gemsData = await mcpClient.readFile('/data/gems.json');
      if (gemsData) memoryCache.gems = JSON.parse(gemsData);
    } catch (e) { /* silently ignore missing file */ }
    
    try {
      const scheduleData = await mcpClient.readFile('/data/scheduledActions.json');
      if (scheduleData) memoryCache.scheduledActions = JSON.parse(scheduleData);
    } catch (e) { /* silently ignore missing file */ }
    
    try {
      const artifactsData = await mcpClient.readFile('/data/artifacts.json');
      if (artifactsData) memoryCache.artifacts = JSON.parse(artifactsData);
    } catch (e) { /* silently ignore missing file */ }
    
    try {
      const piData = await mcpClient.readFile('/data/personalIntelligence.json');
      if (piData) memoryCache.personalIntelligence = JSON.parse(piData);
    } catch (e) { /* silently ignore missing file */ }
  },

  getThreads: (): Thread[] => memoryCache.threads,
  saveThread: async (thread: Thread) => {
    const index = memoryCache.threads.findIndex((t: Thread) => t.id === thread.id);
    if (index >= 0) memoryCache.threads[index] = thread;
    else memoryCache.threads.push(thread);
    await mcpClient.writeFile('/data/threads.json', JSON.stringify(memoryCache.threads, null, 2));
  },
  
  getGems: (): Gem[] => memoryCache.gems,
  saveGem: async (gem: Gem) => {
    memoryCache.gems.push(gem);
    await mcpClient.writeFile('/data/gems.json', JSON.stringify(memoryCache.gems, null, 2));
  },
  
  getScheduledActions: (): ScheduledAction[] => memoryCache.scheduledActions,
  saveScheduledAction: async (action: ScheduledAction) => {
    memoryCache.scheduledActions.push(action);
    await mcpClient.writeFile('/data/scheduledActions.json', JSON.stringify(memoryCache.scheduledActions, null, 2));
  },

  getArtifacts: (): Artifact[] => memoryCache.artifacts,
  saveArtifact: async (artifact: Artifact) => {
    const index = memoryCache.artifacts.findIndex((a: Artifact) => a.id === artifact.id);
    if (index >= 0) memoryCache.artifacts[index] = artifact;
    else memoryCache.artifacts.push(artifact);
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
  }
};

