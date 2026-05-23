import type { AutonomyMode } from '../types';

export type ToolAction = 'READ' | 'WRITE' | 'EXECUTE';

type LegacyAutonomyMode = 'locked' | 'scoped' | 'risk-based';

const CANONICAL_MODES: readonly AutonomyMode[] = ['safe', 'ask', 'auto-accept', 'yolo'];

const LEGACY_MODE_MAP: Record<LegacyAutonomyMode, AutonomyMode> = {
  locked: 'ask',
  scoped: 'safe',
  'risk-based': 'safe',
};

export function normalizeAutonomyMode(value: unknown): AutonomyMode {
  if (typeof value !== 'string') return 'yolo';
  if (CANONICAL_MODES.includes(value as AutonomyMode)) return value as AutonomyMode;
  return LEGACY_MODE_MAP[value as LegacyAutonomyMode] ?? 'yolo';
}

export function shouldAutoApproveToolCall(mode: AutonomyMode, action: ToolAction): boolean {
  switch (mode) {
    case 'ask':
      return false;
    case 'safe':
      return action === 'READ';
    case 'auto-accept':
      return action === 'READ' || action === 'WRITE';
    case 'yolo':
      return true;
  }
}
