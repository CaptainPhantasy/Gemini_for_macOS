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
};

export type Gem = {
  id: string;
  name: string;
  systemInstruction: string;
  createdAt: number;
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
  type: 'code' | 'text' | 'research' | 'audio' | 'video' | 'image';
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
  };
};

export type PersonalIntelligence = {
  preferences: string;
  instructions: string;
};

export type AutonomyMode = 'locked' | 'scoped' | 'risk-based' | 'yolo';

export type McpServerConfig = {
  id: string;
  name: string;
  type: 'stdio' | 'websocket' | 'sse';
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

export type AppSettings = {
  theme: 'light' | 'dark' | 'system' | 'gemini';
  autonomyMode: AutonomyMode;
  scopedPaths: string[];
  googleDriveEnabled: boolean;
  notebookLmEnabled: boolean;
  searchEnabled: boolean;
  mcpServers: McpServerConfig[];
  geminiApiKey: string;
  models?: ModelSettings;
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
};
