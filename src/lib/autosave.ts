import { storage } from './storage';
import type { Thread, Artifact } from '../types';

interface AppState {
  threads: Thread[];
  activeThreadId: string | null;
  activeArtifact: Artifact | null;
}

export function setupAutosave(getAppState: () => AppState) {
  let timer: ReturnType<typeof setInterval> | null = null;
  const autosave = async () => {
    const { threads, activeThreadId, activeArtifact } = getAppState();
    if (activeThreadId) {
      const activeThread = threads.find(t => t.id === activeThreadId);
      if (activeThread) {
        await storage.saveThread(activeThread);
      }
    }
    if (activeArtifact) {
      await storage.saveArtifact(activeArtifact);
    }
  };

  const start = () => {
    if (timer) return;
    timer = setInterval(autosave, 30000); // 30 seconds
  };

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  return { start, stop, forceSave: autosave };
}