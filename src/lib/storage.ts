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
  getThreads: (): Thread[] => memoryCache.threads,
  saveThread: async (thread: Thread) => {
    const index = memoryCache.threads.findIndex((t: Thread) => t.id === thread.id);
    if (index >= 0) memoryCache.threads[index] = thread;
    else memoryCache.threads.push(thread);
    await mcpClient.writeFile('/data/threads.json', JSON.stringify(memoryCache.threads));
  },
  
  getGems: (): Gem[] => memoryCache.gems,
  saveGem: async (gem: Gem) => {
    memoryCache.gems.push(gem);
    await mcpClient.writeFile('/data/gems.json', JSON.stringify(memoryCache.gems));
  },
  
  getScheduledActions: (): ScheduledAction[] => memoryCache.scheduledActions,
  saveScheduledAction: async (action: ScheduledAction) => {
    memoryCache.scheduledActions.push(action);
    await mcpClient.writeFile('/data/scheduledActions.json', JSON.stringify(memoryCache.scheduledActions));
  },

  getArtifacts: (): Artifact[] => memoryCache.artifacts,
  saveArtifact: async (artifact: Artifact) => {
    memoryCache.artifacts.push(artifact);
    await mcpClient.writeFile('/data/artifacts.json', JSON.stringify(memoryCache.artifacts));
  },

  getPersonalIntelligence: (): PersonalIntelligence => memoryCache.personalIntelligence,
  savePersonalIntelligence: async (pi: PersonalIntelligence) => {
    memoryCache.personalIntelligence = pi;
    await mcpClient.writeFile('/data/personalIntelligence.json', JSON.stringify(pi));
  }
};

