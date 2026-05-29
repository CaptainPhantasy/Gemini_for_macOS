import { storage } from './storage';

export const backup = {
  createSnapshot: async () => {
    const snapshot = {
      version: 2,
      exportedAt: new Date().toISOString(),
      localStorage: {} as Record<string, string>,
      indexedDB: {
        threads: storage.getThreads(),
        gems: storage.getGems(),
        scheduledActions: storage.getScheduledActions(),
        artifacts: storage.getArtifacts(),
      },
      settings: storage.getSettings(),
      personalIntelligence: storage.getPersonalIntelligence(),
    };

    // Also capture raw localStorage for backwards compat
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) snapshot.localStorage[key] = localStorage.getItem(key) ?? '';
    }

    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gemini-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  restore: async (file: File) => {
    const text = await file.text();
    const data = JSON.parse(text);
    const runBatch = async <T>(items: T[] | undefined, saveItem: (item: T) => Promise<void>) => {
      const list = Array.isArray(items) ? items : [];
      const batchSize = 25;
      for (let i = 0; i < list.length; i += batchSize) {
        const chunk = list.slice(i, i + batchSize);
        await Promise.all(chunk.map((item) => saveItem(item)));
      }
    };

    if (data.version === 2 || data.indexedDB) {
      if (data.indexedDB?.threads) {
        await runBatch(data.indexedDB.threads, storage.saveThread);
      }
      if (data.indexedDB?.gems) {
        await runBatch(data.indexedDB.gems, storage.saveGem);
      }
      if (data.indexedDB?.scheduledActions) {
        await runBatch(data.indexedDB.scheduledActions, storage.saveScheduledAction);
      }
      if (data.indexedDB?.artifacts) {
        await runBatch(data.indexedDB.artifacts, storage.saveArtifact);
      }
      if (data.settings) {
        await storage.saveSettings(data.settings);
      }
      if (data.personalIntelligence) {
        await storage.savePersonalIntelligence(data.personalIntelligence);
      }
    } else {
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'string') {
          localStorage.setItem(key, value);
        }
      }
    }

    window.location.reload();
  }
};

