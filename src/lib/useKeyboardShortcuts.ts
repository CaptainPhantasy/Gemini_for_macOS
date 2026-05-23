import { useEffect } from 'react';

/**
 * Robust keyboard shortcut matching for macOS webviews.
 *
 * Uses `e.code` (physical key position) as the primary identifier, falling
 * back to `e.key` only when `e.code` is unavailable.  This makes shortcuts
 * immune to keyboard-layout and modifier-induced character changes.
 *
 * Registers in the **capture phase** so we intercept before any bubbling
 * handlers or native webview accelerators can swallow the event.
 */

// ── helpers ────────────────────────────────────────────────────────────

/** Extract the logical key from a `KeyboardEvent.code` value. */
function codeToKey(code: string): string | null {
  if (code.startsWith('Key'))   return code.slice(3).toLowerCase();   // KeyK → k
  if (code.startsWith('Digit')) return code.slice(5);                 // Digit1 → 1
  if (code.startsWith('Numpad')) return code.slice(6).toLowerCase();  // NumpadAdd → add
  // Single-char codes for punctuation, brackets, etc.
  if (/^[A-Z]$/.test(code))    return code.toLowerCase();
  return null;
}

/** Build a normalised combo string from modifier flags + a leaf key. */
function buildCombo(hasCmd: boolean, hasShift: boolean, hasAlt: boolean, key: string): string {
  const parts: string[] = [];
  if (hasCmd)   parts.push('cmd');
  if (hasShift) parts.push('shift');
  if (hasAlt)   parts.push('alt');
  parts.push(key);
  return parts.join('+');
}

/** Expected modifier count encoded in a combo string like "cmd+shift+k". */
function modifierCount(combo: string): number {
  let count = 0;
  if (combo.includes('cmd'))   count++;
  if (combo.includes('shift')) count++;
  if (combo.includes('alt'))   count++;
  return count;
}

// ── hook ───────────────────────────────────────────────────────────────

/**
 * Pre-compute a lookup that is sorted by specificity (more modifiers first)
 * so that `cmd+shift+k` is always checked before `cmd+k`.
 */
function buildLookup(shortcuts: Record<string, () => void>) {
  return Object.entries(shortcuts)
    .sort(([a], [b]) => modifierCount(b) - modifierCount(a))
    .map(([combo, action]) => ({ combo, action }));
}

export function useKeyboardShortcuts(shortcuts: Record<string, () => void>) {
  useEffect(() => {
    const lookup = buildLookup(shortcuts);

    const handleKeyDown = (e: KeyboardEvent) => {
      const hasCmd   = e.metaKey || e.ctrlKey;
      const hasShift = e.shiftKey;
      const hasAlt   = e.altKey;

      // Skip if no modifier at all (unless the combo is modifier-free, e.g. F1)
      if (!hasCmd && !hasShift && !hasAlt) {
        // allow pure-key combos through
      }

      // ── primary: e.code (layout-independent, reliable in webviews) ──
      const code = e.code || '';
      const codeKey = codeToKey(code);
      if (codeKey) {
        const combo = buildCombo(hasCmd, hasShift, hasAlt, codeKey);
        for (const entry of lookup) {
          if (entry.combo === combo) {
            e.preventDefault();
            e.stopPropagation();
            entry.action();
            return;
          }
        }
      }

      // ── fallback: e.key (for virtual / non-standard keyboards) ──────
      const rawKey = (e.key || '').toLowerCase();
      if (rawKey && !['meta', 'control', 'shift', 'alt'].includes(rawKey)) {
        const combo = buildCombo(hasCmd, hasShift, hasAlt, rawKey);
        for (const entry of lookup) {
          if (entry.combo === combo) {
            e.preventDefault();
            e.stopPropagation();
            entry.action();
            return;
          }
        }
      }
    };

    // Capture phase: intercept before native webview or other handlers.
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [shortcuts]);
}

// ── export helpers for ShortcutEditor (shared logic) ───────────────────

export { codeToKey, buildCombo };
