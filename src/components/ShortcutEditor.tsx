import { X, Command } from 'lucide-react';

export function ShortcutEditor({ onClose, shortcuts }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4">
      <div className="bg-white dark:bg-[#1e1f20] w-full max-w-lg rounded-2xl shadow-2xl p-6 border border-gray-200 dark:border-gray-800">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Command /> Shortcut Editor</h2>
          <button onClick={onClose}><X size={24} className="text-gray-400 hover:text-gray-600" /></button>
        </div>
        <div className="space-y-4">
          {Object.entries(shortcuts).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span className="font-medium text-gray-700 dark:text-gray-300">{k}</span>
              <span className="text-xs text-blue-600 font-mono">{(v as any).name || 'Action'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
