export type Message = {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  type?: 'text' | 'image' | 'video' | 'audio' | 'artifact';
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
  type: 'code' | 'text' | 'research';
  createdAt: number;
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

export type AppSettings = {
  theme: 'light' | 'dark' | 'system' | 'gemini';
  autonomyMode: AutonomyMode;
  scopedPaths: string[];
  googleDriveEnabled: boolean;
  notebookLmEnabled: boolean;
  searchEnabled: boolean;
  mcpServers: McpServerConfig[];
  geminiApiKey: string;
};
