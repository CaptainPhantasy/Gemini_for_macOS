export type Message = {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  type?: 'text' | 'image' | 'video' | 'audio' | 'artifact' | 'live-session';
  artifactData?: string | Artifact; // String for media URLs, Artifact for artifact type
};

export type Thread = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  gemId?: string;
  pinned?: boolean;
};

export type Gem = {
  id: string;
  name: string;
  systemInstruction: string;
  createdAt: number;
};

export type AppState = {
  threads: Thread[];
  gems: Gem[];
  activeThreadId: string | null;
  settings: Record<string, unknown>;
  initialized: boolean;
};

export type ScheduledAction = {
  id: string;
  cron: string;
  prompt: string;
  enabled: boolean;
};

export type Artifact = {
  id: string;
  title: string;
  content: string;
  type: 'code' | 'text' | 'research' | 'audio' | 'video' | 'image' | 'html';
  createdAt: number;
  mimeType?: string;
  blobKey?: string;
  driveFileId?: string;
  metadata?: {
    model?: string;
    prompt?: string;
    durationSec?: number;
    sizeBytes?: number;
    estimatedCostUsd?: number;
    sourceFileId?: string;
    sourceType?: 'drive' | 'docs' | 'calendar' | 'gmail';
    fetchedAt?: number;
  };
};

export type PersonalIntelligence = {
  preferences: string;
  instructions: string;
};

export type AutonomyMode = 'safe' | 'ask' | 'auto-accept' | 'yolo';

export type McpServerConfig = {
  id: string;
  name: string;
  type: 'stdio' | 'websocket' | 'sse' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  enabled: boolean;
};

export type ModelSettings = {
  text: string;
  textFallback: string;
  imagePro: string;
  imageFlash: string;
  video: string;
  music: string;
  tts: string;
  liveAudio: string;
};

export type GeminiModelApiModel = {
  name: string;
  displayName?: string;
  description?: string;
  version?: string;
  supportedGenerationMethods?: string[];
  inputTokenLimit?: number;
  outputTokenLimit?: number;
};

export type GeminiAvailableModel = {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  version?: string;
  supportedGenerationMethods: string[];
  inputTokenLimit?: number;
  outputTokenLimit?: number;
};

export type AvailableModelCatalog = {
  fetchedAt: string;
  source: 'gemini-api';
  endpoint: string;
  rawCount: number;
  models: GeminiAvailableModel[];
  byCapability: Record<keyof ModelSettings, string[]>;
};

export type CostSettings = {
  gcpProjectId: string;
  billingAccountId: string;
  dailyThresholdUsd: number;
  monthlyThresholdUsd: number;
  showInSidebar: boolean;
};

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  text: 'gemini-3.1-pro-preview',
  textFallback: 'gemini-3.1-flash-lite-preview',
  imagePro: 'gemini-3-pro-image-preview',
  imageFlash: 'gemini-3.1-flash-image-preview',
  video: 'veo-3.1-lite-generate-preview',
  music: 'lyria-3-clip-preview',
  tts: 'gemini-2.5-flash-preview-tts',
  liveAudio: 'gemini-3.1-flash-live-preview',
};

export type DirectoryLockSettings = {
  enabled: boolean;
  rootPath: string;
};

export type AppSettings = {
  theme: 'light' | 'dark' | 'system' | 'gemini';
  autonomyMode: AutonomyMode;
  directoryLock?: DirectoryLockSettings;
  googleDriveEnabled: boolean;
  notebookLmEnabled: boolean;
  searchEnabled: boolean;
  mcpServers: McpServerConfig[];
  geminiApiKey: string;
  gcpOAuthClientId: string;
  gcpOAuthClientSecret?: string;
  autoSyncArtifacts: boolean;
  models?: ModelSettings;
  availableModelCatalog?: AvailableModelCatalog;
  cost?: CostSettings;
  thinkingBudgets?: {
    text: number;
    vision: number;
  };
  schemaVersion?: number;
  liveMode?: {
    voiceTranscriptionEnabled: boolean;
    cameraTranscriptionEnabled: boolean;
    screenTranscriptionEnabled: boolean;
  };
  shortcutOverrides?: Record<string, string>;
};
// ── Progressive Multi-Modal Lifecycle Callbacks ──────────────────────────────

/** Emitted during streaming generation (music, TTS) as chunks arrive. */
export type StreamChunkEvent = {
  /** Base64-encoded data fragment received so far. */
  data: string;
  /** MIME type of the payload (e.g. 'audio/wav'). */
  mimeType: string;
  /** Cumulative bytes received (decoded from base64). */
  bytesReceived: number;
};

/** Emitted during long-running operations (video generation) as status changes. */
export type GenerationProgressEvent = {
  /** Human-readable status string (e.g. 'processing', 'downloading'). */
  status: string;
  /** 0–100 completion percentage, or -1 if unknown. */
  percent: number;
};

/** Budget thresholds for in-flight token/cost interception. */
export type BudgetConfig = {
  /** Max thinking tokens per request (0 = unlimited). */
  maxThinkingTokens: number;
  /** Max output tokens per request (0 = unlimited). */
  maxOutputTokens: number;
  /** Max estimated USD cost per request (0 = unlimited). */
  maxCostUsdPerRequest: number;
  /** Max estimated USD cost per day (0 = unlimited). */
  dailyThresholdUsd: number;
};

export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  maxThinkingTokens: 0,
  maxOutputTokens: 0,
  maxCostUsdPerRequest: 0,
  dailyThresholdUsd: 0,
};
