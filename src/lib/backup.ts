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

    if (data.version === 2 || data.indexedDB) {
      // V2 format: restore IndexedDB tables
      if (data.indexedDB?.threads) {
        for (const thread of data.indexedDB.threads) {
          await storage.saveThread(thread);
        }
      }
      if (data.indexedDB?.gems) {
        for (const gem of data.indexedDB.gems) {
          await storage.saveGem(gem);
        }
      }
      if (data.indexedDB?.scheduledActions) {
        for (const action of data.indexedDB.scheduledActions) {
          await storage.saveScheduledAction(action);
        }
      }
      if (data.indexedDB?.artifacts) {
        for (const artifact of data.indexedDB.artifacts) {
          await storage.saveArtifact(artifact);
        }
      }
      if (data.settings) {
        await storage.saveSettings(data.settings);
      }
      if (data.personalIntelligence) {
        await storage.savePersonalIntelligence(data.personalIntelligence);
      }
    } else {
      // V1 format (legacy): restore raw localStorage only
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'string') {
          localStorage.setItem(key, value);
        }
      }
    }

    window.location.reload();
  }
};
