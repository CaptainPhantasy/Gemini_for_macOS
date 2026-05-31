import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import type { AppSettings, McpServerConfig, PersonalIntelligence } from '../types';
import { DEFAULT_MODEL_SETTINGS } from '../types';
import { normalizeAutonomyMode } from '../lib/autonomy';
import { DEFAULT_DESKTOP_COMMANDER_MCP, DEFAULT_ECHO_MCP, normalizeMcpServers } from '../lib/mcp-server-config';
export interface GeminiDefaultConfig {
  settings: AppSettings;
  personalIntelligence: PersonalIntelligence;
  sourcePath: string | null;
}

type DefaultConfigEnv = Partial<Record<'GEMINI_DEFAULT_CONFIG_PATH' | 'ZAPIER_MCP_URL', string | undefined>>;

type UnknownObject = Record<string, unknown>;


const FALLBACK_SETTINGS: AppSettings = {
  theme: 'gemini',
  autonomyMode: 'ask',
  directoryLock: { enabled: false, rootPath: '' },
  googleDriveEnabled: true,
  notebookLmEnabled: true,
  searchEnabled: true,
  mcpServers: [DEFAULT_DESKTOP_COMMANDER_MCP, DEFAULT_ECHO_MCP],
  geminiApiKey: '',
  gcpOAuthClientId: '',
  autoSyncArtifacts: true,
  models: DEFAULT_MODEL_SETTINGS,
  thinkingBudgets: { text: 22784, vision: 22528 },
};

const FALLBACK_PERSONAL_INTELLIGENCE: PersonalIntelligence = {
  preferences: '',
  instructions: '',
};

function isObject(value: unknown): value is UnknownObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}


function extractJsonObjectProperty(raw: string, property: string): UnknownObject | null {
  const propertyIndex = raw.indexOf(`\"${property}\"`);
  if (propertyIndex < 0) return null;
  const colonIndex = raw.indexOf(':', propertyIndex);
  if (colonIndex < 0) return null;
  const start = raw.indexOf('{', colonIndex);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i += 1) {
    const char = raw[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\\\') {
        escaped = true;
      } else if (char === '\"') {
        inString = false;
      }
      continue;
    }

    if (char === '\"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(raw.slice(start, i + 1));
          return isObject(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function parseGeminiDefaultConfigText(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const settings = extractJsonObjectProperty(raw, 'settings');
    const personalIntelligence = extractJsonObjectProperty(raw, 'personalIntelligence');
    if (!settings && !personalIntelligence) throw new Error('Default config text does not contain parseable settings or personalIntelligence objects');
    return {
      ...(settings ? { settings } : {}),
      ...(personalIntelligence ? { personalIntelligence } : {}),
    };
  }
}

async function readTextFileWithTimeout(filePath: string, timeoutMs = 1000): Promise<string> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fs.readFile(filePath, 'utf-8'),
      new Promise<string>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out reading ${filePath}`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}




function parseLocalStorageObject(snapshot: UnknownObject, key: string): UnknownObject | null {
  const localStorage = snapshot.localStorage;
  if (!isObject(localStorage)) return null;
  const raw = localStorage[key];
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function rawSettingsFromSnapshot(snapshot: unknown): UnknownObject {
  if (!isObject(snapshot)) return {};
  if (isObject(snapshot.settings)) return snapshot.settings;
  return parseLocalStorageObject(snapshot, 'gemini-for-macos:settings') ?? {};
}

function rawPersonalIntelligenceFromSnapshot(snapshot: unknown): UnknownObject {
  if (!isObject(snapshot)) return {};
  if (isObject(snapshot.personalIntelligence)) return snapshot.personalIntelligence;
  return parseLocalStorageObject(snapshot, 'gemini-for-macos:personalIntelligence') ?? {};
}

function normalizeTheme(value: unknown): AppSettings['theme'] {
  return value === 'light' || value === 'dark' || value === 'system' || value === 'gemini'
    ? value
    : FALLBACK_SETTINGS.theme;
}

function normalizeDirectoryLock(value: unknown): NonNullable<AppSettings['directoryLock']> {
  if (!isObject(value)) return FALLBACK_SETTINGS.directoryLock!;
  return {
    enabled: booleanValue(value.enabled, FALLBACK_SETTINGS.directoryLock!.enabled),
    rootPath: stringValue(value.rootPath, FALLBACK_SETTINGS.directoryLock!.rootPath),
  };
}

function appendZapierMcpFromEnv(settings: AppSettings, env: DefaultConfigEnv): AppSettings {
  const url = stringValue(env.ZAPIER_MCP_URL).trim();
  if (!url) return settings;
  return {
    ...settings,
    mcpServers: normalizeMcpServers([
      ...settings.mcpServers,
      {
        id: 'zapier-mcp',
        name: 'Zapier MCP',
        type: 'http',
        url,
        enabled: true,
      },
    ]),
  };
}


export function normalizeGeminiDefaultConfig(snapshot: unknown, sourcePath: string | null = null, env: DefaultConfigEnv = process.env): GeminiDefaultConfig {
  const rawSettings = rawSettingsFromSnapshot(snapshot);
  const rawPi = rawPersonalIntelligenceFromSnapshot(snapshot);

  const settings: AppSettings = {
    ...FALLBACK_SETTINGS,
    ...rawSettings,
    theme: normalizeTheme(rawSettings.theme),
    autonomyMode: normalizeAutonomyMode(rawSettings.autonomyMode),
    directoryLock: normalizeDirectoryLock(rawSettings.directoryLock),
    googleDriveEnabled: booleanValue(rawSettings.googleDriveEnabled, FALLBACK_SETTINGS.googleDriveEnabled),
    notebookLmEnabled: booleanValue(rawSettings.notebookLmEnabled, FALLBACK_SETTINGS.notebookLmEnabled),
    searchEnabled: booleanValue(rawSettings.searchEnabled, FALLBACK_SETTINGS.searchEnabled),
    mcpServers: normalizeMcpServers(rawSettings.mcpServers),
    geminiApiKey: stringValue(rawSettings.geminiApiKey, FALLBACK_SETTINGS.geminiApiKey),
    gcpOAuthClientId: stringValue(rawSettings.gcpOAuthClientId, FALLBACK_SETTINGS.gcpOAuthClientId),
    autoSyncArtifacts: booleanValue(rawSettings.autoSyncArtifacts, FALLBACK_SETTINGS.autoSyncArtifacts),
  } as AppSettings;

  const personalIntelligence: PersonalIntelligence = {
    preferences: stringValue(rawPi.preferences, FALLBACK_PERSONAL_INTELLIGENCE.preferences),
    instructions: stringValue(rawPi.instructions, FALLBACK_PERSONAL_INTELLIGENCE.instructions),
  };

  return { settings: appendZapierMcpFromEnv(settings, env), personalIntelligence, sourcePath };
}

export function getDefaultConfigCandidatePaths(
  env: DefaultConfigEnv = process.env,
  homeDir = os.homedir(),
): string[] {
  return [
    env.GEMINI_DEFAULT_CONFIG_PATH,
    path.join(homeDir, '.gemini-for-macos', 'default-config.json'),
    path.join(homeDir, 'Downloads', 'gemini-backup-2026-05-30.json'),
  ].filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export async function readGeminiDefaultConfig(
  env: DefaultConfigEnv = process.env,
  homeDir = os.homedir(),
): Promise<GeminiDefaultConfig> {
  for (const candidate of getDefaultConfigCandidatePaths(env, homeDir)) {
    try {
      const raw = await readTextFileWithTimeout(candidate);
      return normalizeGeminiDefaultConfig(parseGeminiDefaultConfigText(raw), candidate, env);
    } catch (error) {
      console.warn(`[default-config] skipped ${candidate}: ${error instanceof Error ? error.message : String(error)}`);
      // Try the next candidate. A missing or malformed local default must not
      // prevent the app from starting; the fallback still includes core MCPs.
    }
  }
  return normalizeGeminiDefaultConfig({}, null, env);
}

export function getAutoloadProjectServerNames(servers: McpServerConfig[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const server of servers) {
    if (server.enabled === false || server.type !== 'stdio' || !server.command) continue;
    const name = server.id === 'echo-mcp' ? server.id : server.name || server.id;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}
