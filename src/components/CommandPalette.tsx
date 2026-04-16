import { useState, useMemo, useCallback } from 'react';
import { Command, X } from 'lucide-react';

interface PaletteAction {
  label: string;
  icon: React.ReactNode;
  shortcut: string;
  action: () => void;
}

interface CommandPaletteProps {
  onClose: () => void;
  actions: PaletteAction[];
}

export function CommandPalette({ onClose, actions }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);

  const filtered = useMemo(() => {
    const result = actions.filter(a => a.label.toLowerCase().includes(query.toLowerCase()));
    return result;
  }, [query, actions]);

  const runSelected = useCallback(() => {
    const item = filtered[selected];
    if (item) {
      item.action();
      onClose();
    }
  }, [filtered, selected, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelected((prev) => (prev + 1) % filtered.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelected((prev) => (prev - 1 + filtered.length) % filtered.length);
        break;
      case 'Enter':
        e.preventDefault();
        runSelected();
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4" onClick={onClose}>
      <div className="bg-white dark:bg-[#1e1f20] w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
          <Command className="text-blue-500" size={20} />
          <input
            autoFocus
            placeholder="Search actions..."
            className="flex-1 bg-transparent border-none outline-none text-lg text-gray-900 dark:text-white"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
            onKeyDown={handleKeyDown}
          />
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        <div className="max-h-[300px] overflow-y-auto p-2" role="listbox">
          {filtered.map((a, i) => (
            <button
              key={i}
              role="option"
              aria-selected={i === selected}
              onClick={() => { a.action(); onClose(); }}
              onMouseEnter={() => setSelected(i)}
              className={`w-full text-left p-3 rounded-xl flex items-center justify-between transition-colors ${
                i === selected
                  ? 'bg-blue-50 dark:bg-blue-900/30'
                  : 'hover:bg-gray-100 dark:hover:bg-[#2a2b2c]'
              }`}
            >
              <div className="flex items-center gap-3 text-gray-800 dark:text-gray-100">
                {a.icon} <span className="font-medium">{a.label}</span>
              </div>
              <span className="text-xs text-gray-400 uppercase tracking-widest">{a.shortcut}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="p-3 text-sm text-gray-500 text-center">No matching actions</p>
          )}
        </div>
      </div>
    </div>
  );
}
