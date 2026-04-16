import { useEffect } from 'react';
export function useKeyboardShortcuts(shortcuts: Record<string, () => void>) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const parts: string[] = [];
      if (e.metaKey || e.ctrlKey) parts.push('cmd');
      if (e.shiftKey) parts.push('shift');
      if (e.altKey) parts.push('alt');
      const key = (e.key || '').toLowerCase();
      if (!['meta', 'control', 'shift', 'alt'].includes(key)) {
        parts.push(key);
      }
      const combo = parts.join('+');
      if (shortcuts[combo]) {
        e.preventDefault();
        shortcuts[combo]();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}
