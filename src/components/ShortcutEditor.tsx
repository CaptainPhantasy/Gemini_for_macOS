import { useState, useEffect } from 'react';
import { X, Command, RotateCcw } from 'lucide-react';

interface ShortcutEditorProps {
  onClose: () => void;
  shortcuts: Record<string, () => void>;
  overrides: Record<string, string>;
  onUpdateOverrides: (overrides: Record<string, string>) => void;
}

const ACTION_LABELS: Record<string, string> = {
  'cmd+n': 'New Chat',
  'cmd+k': 'Search',
  'cmd+shift+k': 'Command Palette',
  'cmd+,': 'Settings',
  'cmd+t': 'Toggle Theme',
  'cmd+l': 'Live Mode',
  'f1': 'Help',
};

/** All known default combos — these are the rows we always show. */
const DEFAULT_COMBOS = Object.keys(ACTION_LABELS);

function formatCombo(combo: string): string {
  return combo
    .split('+')
    .map((p) => {
      if (p === 'cmd') return '\u2318';
      if (p === 'shift') return '\u21E7';
      if (p === 'alt') return '\u2325';
      return p.toUpperCase();
    })
    .join(' ');
}

export function ShortcutEditor({ onClose, shortcuts, overrides, onUpdateOverrides }: ShortcutEditorProps) {
  const [capturingAction, setCapturingAction] = useState<string | null>(null);

  useEffect(() => {
    if (!capturingAction) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const parts: string[] = [];
      if (e.metaKey || e.ctrlKey) parts.push('cmd');
      if (e.shiftKey) parts.push('shift');
      if (e.altKey) parts.push('alt');

      const key = e.key.toLowerCase();
      if (!['meta', 'control', 'shift', 'alt'].includes(key)) {
        parts.push(key);
      }

      // Only accept the combo once a non-modifier key has been pressed.
      if (parts.length > 0 && !['meta', 'control', 'shift', 'alt'].includes(parts[parts.length - 1])) {
        const combo = parts.join('+');
        onUpdateOverrides({ ...overrides, [capturingAction]: combo });
        setCapturingAction(null);
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [capturingAction, overrides, onUpdateOverrides]);

  const handleResetOne = (defaultCombo: string) => {
    const next = { ...overrides };
    delete next[defaultCombo];
    onUpdateOverrides(next);
  };

  const handleResetAll = () => {
    onUpdateOverrides({});
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4">
      <div className="bg-white dark:bg-[#1e1f20] w-full max-w-lg rounded-2xl shadow-2xl p-6 border border-gray-200 dark:border-gray-800">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Command /> Shortcut Editor
          </h2>
          <button onClick={onClose} aria-label="Close">
            <X size={24} className="text-gray-400 hover:text-gray-600" />
          </button>
        </div>

        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {DEFAULT_COMBOS.map((defaultCombo) => {
            const currentCombo = overrides[defaultCombo] ?? defaultCombo;
            const isOverridden = overrides[defaultCombo] !== undefined;
            const isCapturing = capturingAction === defaultCombo;

            return (
              <div
                key={defaultCombo}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                <span className="font-medium text-gray-700 dark:text-gray-300 min-w-[140px]">
                  {ACTION_LABELS[defaultCombo]}
                </span>

                <div className="flex items-center gap-2">
                  {isCapturing ? (
                    <span className="text-sm text-amber-500 dark:text-amber-400 font-mono animate-pulse">
                      Press new shortcut...
                    </span>
                  ) : (
                    <span
                      className={`text-sm font-mono px-2 py-0.5 rounded ${
                        isOverridden
                          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {formatCombo(currentCombo)}
                    </span>
                  )}

                  <button
                    onClick={() => setCapturingAction(isCapturing ? null : defaultCombo)}
                    className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                  >
                    {isCapturing ? 'Cancel' : 'Rebind'}
                  </button>

                  {isOverridden && !isCapturing && (
                    <button
                      onClick={() => handleResetOne(defaultCombo)}
                      className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
                      title="Reset to Default"
                    >
                      <RotateCcw size={12} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleResetAll}
            className="text-sm px-3 py-1.5 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
          >
            Reset All to Defaults
          </button>
        </div>
      </div>
    </div>
  );
}
