import { useState, useMemo } from 'react';
import { Terminal, X, Moon, Sun, Settings, Plus, Camera, Link, Library } from 'lucide-react';

export function CommandPalette({ onClose, actions }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    return actions.filter(a => a.label.toLowerCase().includes(query.toLowerCase()));
  }, [query, actions]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4">
      <div className="bg-white dark:bg-[#1e1f20] w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
          <Terminal className="text-blue-500" size={20} />
          <input autoFocus placeholder="Run a command..." className="flex-1 bg-transparent border-none outline-none text-lg text-gray-900 dark:text-white" value={query} onChange={e => setQuery(e.target.value)} />
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        <div className="max-h-[300px] overflow-y-auto p-2">
          {filtered.map((a, i) => (
            <button key={i} onClick={() => { a.action(); onClose(); }} className="w-full text-left p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-[#2a2b2c] flex items-center justify-between transition-colors">
              <div className="flex items-center gap-3 text-gray-800 dark:text-gray-100">
                {a.icon} <span className="font-medium">{a.label}</span>
              </div>
              <span className="text-xs text-gray-400 uppercase tracking-widest">{a.shortcut}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
