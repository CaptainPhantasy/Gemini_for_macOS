import { Thread, Artifact } from '../types';

export const sharing = {
  generateThreadLink: (thread: Thread): string => {
    // Mock public link generation
    const linkId = btoa(thread.id).slice(0, 10);
    return `${process.env.APP_URL || 'http://localhost:3000'}/share/thread/${linkId}`;
  },
  generateArtifactLink: (artifact: Artifact): string => {
    // Mock public link generation
    const linkId = btoa(artifact.id).slice(0, 10);
    return `${process.env.APP_URL || 'http://localhost:3000'}/share/artifact/${linkId}`;
  }
};
