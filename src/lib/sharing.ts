import { Thread, Artifact } from '../types';
import { mcpClient } from './mcp';

export const sharing = {
  generateThreadLink: async (thread: Thread): Promise<string> => {
    try {
      // Real implementation: Write the thread data to a public shared directory via MCP
      const linkId = btoa(thread.id).slice(0, 10);
      const sharedPath = `/shared/threads/${linkId}.json`;
      await mcpClient.writeFile(sharedPath, JSON.stringify(thread, null, 2));
      return `${process.env.APP_URL || 'http://localhost:3000'}/share/thread/${linkId}`;
    } catch (error) {
      console.error('Failed to generate thread link:', error);
      throw new Error('Failed to generate sharing link. Please ensure MCP has write permissions.');
    }
  },
  generateArtifactLink: async (artifact: Artifact): Promise<string> => {
    try {
      // Real implementation: Write the artifact data to a public shared directory via MCP
      const linkId = btoa(artifact.id).slice(0, 10);
      const sharedPath = `/shared/artifacts/${linkId}.json`;
      await mcpClient.writeFile(sharedPath, JSON.stringify(artifact, null, 2));
      return `${process.env.APP_URL || 'http://localhost:3000'}/share/artifact/${linkId}`;
    } catch (error) {
      console.error('Failed to generate artifact link:', error);
      throw new Error('Failed to generate sharing link. Please ensure MCP has write permissions.');
    }
  }
};
