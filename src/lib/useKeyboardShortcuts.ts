import { useEffect } from 'react';
export function useKeyboardShortcuts(shortcuts) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isCmd = e.metaKey || e.ctrlKey;
      let k = (e.key || '').toLowerCase();
      let combo = isCmd ? 'cmd+' + k : k;
      if (shortcuts[combo]) {
        e.preventDefault();
        shortcuts[combo]();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}
