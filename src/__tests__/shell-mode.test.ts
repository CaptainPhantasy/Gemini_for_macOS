import { describe, expect, it } from 'vitest';

import { getShellMode, normalizeShellDrawersForMode } from '../lib/shell-mode';

describe('shell mode contract', () => {
  it('maps viewport widths to deterministic shell modes at exact boundaries', () => {
    expect(getShellMode(0)).toBe('compact');
    expect(getShellMode(375)).toBe('compact');
    expect(getShellMode(767)).toBe('compact');

    expect(getShellMode(768)).toBe('medium');
    expect(getShellMode(1024)).toBe('medium');
    expect(getShellMode(1199)).toBe('medium');

    expect(getShellMode(1200)).toBe('expanded');
    expect(getShellMode(1366)).toBe('expanded');
  });

  it('treats invalid viewport widths as compact for a safe mobile-first fallback', () => {
    expect(getShellMode(Number.NaN)).toBe('compact');
    expect(getShellMode(Number.POSITIVE_INFINITY)).toBe('compact');
    expect(getShellMode(Number.NEGATIVE_INFINITY)).toBe('compact');
    expect(getShellMode(-1)).toBe('compact');
  });

  it('closes transient compact overlays when entering tablet mode without losing desktop drawer preferences', () => {
    const normalized = normalizeShellDrawersForMode('medium', {
      mobileSidebarOpen: true,
      navDrawerOpen: true,
      canvasDrawerOpen: true,
    });

    expect(normalized).toEqual({
      mobileSidebarOpen: false,
      navDrawerOpen: true,
      canvasDrawerOpen: true,
    });
  });

  it('closes transient compact overlays when entering expanded mode', () => {
    const normalized = normalizeShellDrawersForMode('expanded', {
      mobileSidebarOpen: true,
      navDrawerOpen: false,
      canvasDrawerOpen: false,
    });

    expect(normalized).toEqual({
      mobileSidebarOpen: false,
      navDrawerOpen: false,
      canvasDrawerOpen: false,
    });
  });
});
