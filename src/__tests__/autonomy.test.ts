import { describe, expect, test } from 'vitest';
import { normalizeAutonomyMode, shouldAutoApproveToolCall } from '../lib/autonomy';

describe('autonomy modes', () => {
  test('ask mode prompts for every local tool action', () => {
    expect(shouldAutoApproveToolCall('ask', 'READ')).toBe(false);
    expect(shouldAutoApproveToolCall('ask', 'WRITE')).toBe(false);
    expect(shouldAutoApproveToolCall('ask', 'EXECUTE')).toBe(false);
  });

  test('safe mode keeps local access but only auto-approves reads', () => {
    expect(shouldAutoApproveToolCall('safe', 'READ')).toBe(true);
    expect(shouldAutoApproveToolCall('safe', 'WRITE')).toBe(false);
    expect(shouldAutoApproveToolCall('safe', 'EXECUTE')).toBe(false);
  });

  test('auto-accept mode auto-approves file work but still asks for commands', () => {
    expect(shouldAutoApproveToolCall('auto-accept', 'READ')).toBe(true);
    expect(shouldAutoApproveToolCall('auto-accept', 'WRITE')).toBe(true);
    expect(shouldAutoApproveToolCall('auto-accept', 'EXECUTE')).toBe(false);
  });

  test('yolo mode auto-approves all local tool actions', () => {
    expect(shouldAutoApproveToolCall('yolo', 'READ')).toBe(true);
    expect(shouldAutoApproveToolCall('yolo', 'WRITE')).toBe(true);
    expect(shouldAutoApproveToolCall('yolo', 'EXECUTE')).toBe(true);
  });

  test('legacy mode ids migrate to the canonical operator-facing modes', () => {
    expect(normalizeAutonomyMode('locked')).toBe('ask');
    expect(normalizeAutonomyMode('scoped')).toBe('safe');
    expect(normalizeAutonomyMode('risk-based')).toBe('safe');
    expect(normalizeAutonomyMode('yolo')).toBe('yolo');
    expect(normalizeAutonomyMode('unknown')).toBe('yolo');
  });
});
