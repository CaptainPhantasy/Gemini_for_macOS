import { describe, it, expect } from 'vitest';
import { codeToKey, buildCombo } from '../lib/useKeyboardShortcuts';

/**
 * Tests for the robust keyboard shortcut logic.
 * Covers the webview shift-dropping bug: ensure cmd+shift+k never matches cmd+k.
 */

describe('useKeyboardShortcuts — core logic', () => {
  it('codeToKey extracts key from Key* codes', () => {
    expect(codeToKey('KeyA')).toBe('a');
    expect(codeToKey('KeyK')).toBe('k');
    expect(codeToKey('KeyZ')).toBe('z');
    expect(codeToKey('Digit1')).toBe('1');
    expect(codeToKey('Digit0')).toBe('0');
    expect(codeToKey('NumpadAdd')).toBe('add');
  });

  it('codeToKey returns null for unknown codes', () => {
    expect(codeToKey('')).toBeNull();
    expect(codeToKey('Unknown')).toBeNull();
  });

  it('buildCombo orders modifiers before key', () => {
    expect(buildCombo(true, true, true, 'k')).toBe('cmd+shift+alt+k');
    expect(buildCombo(true, false, true, 'k')).toBe('cmd+alt+k');
    expect(buildCombo(true, false, false, ',')).toBe('cmd+,');
    expect(buildCombo(false, false, false, 'f1')).toBe('f1');
  });

  it('cmd+shift+k must NEVER collide with cmd+k (the shift-dropping bug)', () => {
    const shortcuts: Record<string, string> = {
      'cmd+k': 'search',
      'cmd+shift+k': 'palette',
    };

    // Simulate Cmd+K: code=KeyK, shiftKey=false
    const cmdK = buildCombo(true, false, false, codeToKey('KeyK')!);
    expect(cmdK).toBe('cmd+k');
    expect(shortcuts[cmdK]).toBe('search');

    // Simulate Cmd+Shift+K: code=KeyK, shiftKey=true
    const cmdShiftK = buildCombo(true, true, false, codeToKey('KeyK')!);
    expect(cmdShiftK).toBe('cmd+shift+k');
    expect(shortcuts[cmdShiftK]).toBe('palette');

    // They must be distinct combos
    expect(cmdK).not.toBe(cmdShiftK);
    expect(shortcuts[cmdK]).not.toBe(shortcuts[cmdShiftK]);
  });

  it('e.code-based combos are stable regardless of e.key', () => {
    // e.code is ALWAYS KeyK for the physical K key
    const codeCombo = buildCombo(true, true, false, codeToKey('KeyK')!);
    expect(codeCombo).toBe('cmd+shift+k');

    // Even if e.key were wrong, code-based would still differ
    const withoutShift = buildCombo(true, false, false, codeToKey('KeyK')!);
    expect(withoutShift).toBe('cmd+k');
    expect(codeCombo).not.toBe(withoutShift);
  });

  it('all default shortcuts produce correct combos', () => {
    expect(buildCombo(true, false, false, codeToKey('KeyN')!)).toBe('cmd+n');
    expect(buildCombo(true, false, false, codeToKey('KeyK')!)).toBe('cmd+k');
    expect(buildCombo(true, false, false, ',')).toBe('cmd+,');
    expect(buildCombo(true, false, false, codeToKey('KeyT')!)).toBe('cmd+t');
    expect(buildCombo(true, false, false, codeToKey('KeyL')!)).toBe('cmd+l');
  });
});