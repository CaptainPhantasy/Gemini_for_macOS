import { X, HelpCircle, Book, Code, Command } from 'lucide-react';

export function Help({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4">
      <div className="bg-white dark:bg-[#1e1f20] w-full max-w-2xl rounded-2xl shadow-2xl p-6 border border-gray-200 dark:border-gray-800">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><HelpCircle /> GEMINI Help</h2>
          <button onClick={onClose}><X size={24} className="text-gray-400 hover:text-gray-600" /></button>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <section className="space-y-3">
            <h3 className="font-bold flex items-center gap-2 text-blue-600"><Command size={18} /> Shortcuts</h3>
            <ul className="text-sm space-y-2 text-gray-700 dark:text-gray-300">
              <li><kbd className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700">Cmd + K</kbd> Search</li>
              <li><kbd className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700">Cmd + Shift + P</kbd> Commands</li>
              <li><kbd className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700">Cmd + L</kbd> Live Mode</li>
            </ul>
          </section>
          <section className="space-y-3">
            <h3 className="font-bold flex items-center gap-2 text-purple-600"><Book size={18} /> Features</h3>
            <ul className="text-sm space-y-2 text-gray-700 dark:text-gray-300">
              <li><strong>Canvas:</strong> Edit code and text side-by-side.</li>
              <li><strong>Gems:</strong> Load custom system configurations.</li>
              <li><strong>MCP:</strong> Secure local file access.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
