import { describe, expect, it } from 'vitest';

import { getShellMode, getShellModeForPath, getShellVertical, getShellVerticalForPath, normalizeShellDrawersForMode } from '../lib/shell-mode';

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

  it('maps viewport widths to three deterministic verticals', () => {
    expect(getShellVertical(375)).toBe('mobile');
    expect(getShellVertical(767)).toBe('mobile');
    expect(getShellVertical(768)).toBe('tablet');
    expect(getShellVertical(1199)).toBe('tablet');
    expect(getShellVertical(1200)).toBe('desktop');
  });

  it('honors explicit device-vertical route overrides', () => {
    expect(getShellModeForPath('/gemini/mobile', 1366)).toBe('compact');
    expect(getShellModeForPath('/gemini/tablet', 1366)).toBe('medium');
    expect(getShellModeForPath('/gemini/desktop', 375)).toBe('expanded');
    expect(getShellModeForPath('/gemini/', 1024)).toBe('medium');
    expect(getShellVerticalForPath('/gemini/mobile', 1366)).toBe('mobile');
    expect(getShellVerticalForPath('/gemini/tablet', 375)).toBe('tablet');
    expect(getShellVerticalForPath('/gemini/desktop', 375)).toBe('desktop');
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
