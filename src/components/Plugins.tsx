import { X, Puzzle } from 'lucide-react';
export function Plugins({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4">
      <div className="bg-white dark:bg-[#1e1f20] w-full max-w-lg rounded-2xl shadow-2xl p-6 border border-gray-200 dark:border-gray-800">
        <div className="flex justify-between items-center mb-6 text-gray-900 dark:text-white">
          <h2 className="text-2xl font-bold flex items-center gap-2"><Puzzle /> Plugins</h2>
          <button onClick={onClose}><X size={24} /></button>
        </div>
        <p className="text-gray-500 text-center p-8">No plugins installed. Plugins allow you to extend GEMINI with custom tools.</p>
      </div>
    </div>
  );
}
