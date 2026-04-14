import { describe, test, expect } from 'vitest';

// Conceptual replica of the 30-second lock-file dedup logic implemented in
// scripts/run-scheduled-action.js. We extract the pure decision function here
// so it can be unit-tested without filesystem coupling. The invariant under
// test is: a fresh lock SHOULD be acquired, but a lock written within the
// dedup window MUST be refused.

const DEDUP_WINDOW_MS = 30_000;

interface DedupDecision {
  shouldRun: boolean;
  reason: string;
}

function shouldAcquireLock(
  existingLockTimestamp: number | null,
  now: number
): DedupDecision {
  if (existingLockTimestamp === null) {
    return { shouldRun: true, reason: 'no existing lock' };
  }
  const age = now - existingLockTimestamp;
  if (age < DEDUP_WINDOW_MS) {
    return {
      shouldRun: false,
      reason: `lock is ${age}ms old, within ${DEDUP_WINDOW_MS}ms dedup window`,
    };
  }
  return { shouldRun: true, reason: 'existing lock is stale' };
}

describe('lock-file dedup logic', () => {
  test('no existing lock allows the run', () => {
    const decision = shouldAcquireLock(null, Date.now());
    expect(decision.shouldRun).toBe(true);
  });

  test('lock written 1 second ago blocks the run', () => {
    const now = Date.now();
    const decision = shouldAcquireLock(now - 1_000, now);
    expect(decision.shouldRun).toBe(false);
    expect(decision.reason).toMatch(/dedup window/);
  });

  test('lock written 29.999s ago still blocks', () => {
    const now = Date.now();
    const decision = shouldAcquireLock(now - 29_999, now);
    expect(decision.shouldRun).toBe(false);
  });

  test('lock written 30 seconds ago is considered stale (allows run)', () => {
    const now = Date.now();
    const decision = shouldAcquireLock(now - 30_000, now);
    expect(decision.shouldRun).toBe(true);
  });

  test('lock written 5 minutes ago is stale and is replaced', () => {
    const now = Date.now();
    const decision = shouldAcquireLock(now - 5 * 60 * 1000, now);
    expect(decision.shouldRun).toBe(true);
    expect(decision.reason).toMatch(/stale/);
  });
});
