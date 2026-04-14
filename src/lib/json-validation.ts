/**
 * JSON Validation and Parsing Utilities
 * Safely parse JSON with validation
 */

import { Thread, Gem, ScheduledAction, Artifact, PersonalIntelligence, AppSettings } from '../types';

/**
 * Safely parse and validate application settings JSON
 */
export function parseAppSettingsJSON(data: unknown): AppSettings {
  const defaults: AppSettings = {
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

  if (!data || typeof data !== 'string') {
    return defaults;
  }

  try {
    const parsed = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null) return defaults;

    return {
      theme: (['light', 'dark', 'system', 'gemini'].includes(parsed.theme) ? parsed.theme : defaults.theme) as AppSettings['theme'],
      autonomyMode: (['locked', 'scoped', 'risk-based', 'yolo'].includes(parsed.autonomyMode) ? parsed.autonomyMode : defaults.autonomyMode) as AppSettings['autonomyMode'],
      scopedPaths: Array.isArray(parsed.scopedPaths) ? parsed.scopedPaths : defaults.scopedPaths,
      googleDriveEnabled: typeof parsed.googleDriveEnabled === 'boolean' ? parsed.googleDriveEnabled : defaults.googleDriveEnabled,
      notebookLmEnabled: typeof parsed.notebookLmEnabled === 'boolean' ? parsed.notebookLmEnabled : defaults.notebookLmEnabled,
      searchEnabled: typeof parsed.searchEnabled === 'boolean' ? parsed.searchEnabled : defaults.searchEnabled,
      mcpServers: Array.isArray(parsed.mcpServers) ? parsed.mcpServers : defaults.mcpServers,
      geminiApiKey: typeof parsed.geminiApiKey === 'string' ? parsed.geminiApiKey : defaults.geminiApiKey
    };
  } catch (error) {
    console.error('Failed to parse app settings JSON:', error);
    return defaults;
  }
}

/**
 * Safely parse and validate threads JSON
 */
export function parseThreadsJSON(data: unknown): Thread[] {
  if (!data || typeof data !== 'string') {
    console.warn('Invalid threads data: expected string');
    return [];
  }

  try {
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) {
      console.warn('Invalid threads data: expected array');
      return [];
    }
    
    // Validate each thread has required fields
    return parsed.filter((item): item is Thread => {
      return (
        typeof item === 'object' &&
        item !== null &&
        typeof item.id === 'string' &&
        typeof item.title === 'string' &&
        Array.isArray(item.messages) &&
        typeof item.createdAt === 'number' &&
        typeof item.updatedAt === 'number'
      );
    });
  } catch (error) {
    console.error('Failed to parse threads JSON:', error);
    return [];
  }
}

/**
 * Safely parse and validate gems JSON
 */
export function parseGemsJSON(data: unknown): Gem[] {
  if (!data || typeof data !== 'string') {
    console.warn('Invalid gems data: expected string');
    return [];
  }

  try {
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) {
      console.warn('Invalid gems data: expected array');
      return [];
    }
    
    return parsed.filter((item): item is Gem => {
      return (
        typeof item === 'object' &&
        item !== null &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.systemInstruction === 'string' &&
        typeof item.createdAt === 'number'
      );
    });
  } catch (error) {
    console.error('Failed to parse gems JSON:', error);
    return [];
  }
}

/**
 * Safely parse and validate scheduled actions JSON
 */
export function parseScheduledActionsJSON(data: unknown): ScheduledAction[] {
  if (!data || typeof data !== 'string') {
    console.warn('Invalid scheduled actions data: expected string');
    return [];
  }

  try {
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) {
      console.warn('Invalid scheduled actions data: expected array');
      return [];
    }
    
    return parsed.filter((item): item is ScheduledAction => {
      return (
        typeof item === 'object' &&
        item !== null &&
        typeof item.id === 'string' &&
        typeof item.cron === 'string' &&
        typeof item.prompt === 'string' &&
        typeof item.enabled === 'boolean'
      );
    });
  } catch (error) {
    console.error('Failed to parse scheduled actions JSON:', error);
    return [];
  }
}

/**
 * Safely parse and validate artifacts JSON
 */
export function parseArtifactsJSON(data: unknown): Artifact[] {
  if (!data || typeof data !== 'string') {
    console.warn('Invalid artifacts data: expected string');
    return [];
  }

  try {
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) {
      console.warn('Invalid artifacts data: expected array');
      return [];
    }
    
    return parsed.filter((item): item is Artifact => {
      return (
        typeof item === 'object' &&
        item !== null &&
        typeof item.id === 'string' &&
        typeof item.title === 'string' &&
        typeof item.content === 'string' &&
        ['code', 'text', 'research'].includes(item.type) &&
        typeof item.createdAt === 'number'
      );
    });
  } catch (error) {
    console.error('Failed to parse artifacts JSON:', error);
    return [];
  }
}

/**
 * Safely parse and validate personal intelligence JSON
 */
export function parsePersonalIntelligenceJSON(data: unknown): PersonalIntelligence {
  if (!data || typeof data !== 'string') {
    console.warn('Invalid personal intelligence data: expected string');
    return { preferences: '', instructions: '' };
  }

  try {
    const parsed = JSON.parse(data);
    
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.preferences === 'string' &&
      typeof parsed.instructions === 'string'
    ) {
      return parsed as PersonalIntelligence;
    }
    
    console.warn('Invalid personal intelligence data: missing required fields');
    return { preferences: '', instructions: '' };
  } catch (error) {
    console.error('Failed to parse personal intelligence JSON:', error);
    return { preferences: '', instructions: '' };
  }
}
