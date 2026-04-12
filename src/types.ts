export type Message = {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  type?: 'text' | 'image' | 'video' | 'audio' | 'artifact';
  artifactData?: any;
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
