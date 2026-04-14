import { describe, test, expect } from 'vitest';
import { cronToLaunchd } from '../lib/cron-to-launchd';

describe('cronToLaunchd', () => {
  test('every minute (all wildcards) emits 60 intervals', () => {
    const result = cronToLaunchd('* * * * *');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intervals.length).toBe(60);
      expect(result.intervals[0]).toEqual({ Minute: 0 });
      expect(result.intervals[59]).toEqual({ Minute: 59 });
    }
  });

  test('"0 9 * * *" maps to one interval at 09:00', () => {
    const result = cronToLaunchd('0 9 * * *');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intervals).toEqual([{ Minute: 0, Hour: 9 }]);
    }
  });

  test('list expansion: "0,15,30,45 * * * *" produces 4 intervals', () => {
    const result = cronToLaunchd('0,15,30,45 * * * *');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intervals.length).toBe(4);
      expect(result.intervals.map((i) => i.Minute).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([
        0, 15, 30, 45,
      ]);
    }
  });

  test('step expression "*/15 * * * *" produces 4 intervals (0, 15, 30, 45)', () => {
    const result = cronToLaunchd('*/15 * * * *');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intervals.length).toBe(4);
      const minutes = result.intervals.map((i) => i.Minute).sort((a, b) => (a ?? 0) - (b ?? 0));
      expect(minutes).toEqual([0, 15, 30, 45]);
    }
  });

  test('cron nicknames like "@reboot" are rejected', () => {
    const result = cronToLaunchd('@reboot') as { ok: false; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/nicknames/i);
  });

  test('combined day-of-month and weekday is rejected (semantic mismatch)', () => {
    const result = cronToLaunchd('0 9 15 * 1') as { ok: false; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/day-of-month and day-of-week/);
  });

  test('empty input rejected', () => {
    const result = cronToLaunchd('   ');
    expect(result.ok).toBe(false);
  });

  test('wrong field count rejected', () => {
    const result = cronToLaunchd('0 9 *') as { ok: false; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/5 cron fields/);
  });
});
