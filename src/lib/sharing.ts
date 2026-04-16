// DEPRECATED: Sharing links are disabled. See capability audit fix #4.
import { Thread, Artifact } from '../types';

export const sharing = {
  generateThreadLink: async (_thread: Thread): Promise<string> => {
    console.warn('sharing.generateThreadLink is deprecated and disabled.');
    return '';
  },
  generateArtifactLink: async (_artifact: Artifact): Promise<string> => {
    console.warn('sharing.generateArtifactLink is deprecated and disabled.');
    return '';
  }
};
