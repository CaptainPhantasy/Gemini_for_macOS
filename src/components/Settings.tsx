import { X } from 'lucide-react';

interface SettingsProps {
  onClose: () => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
}

export function Settings({ onClose, theme, setTheme }: SettingsProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-[#1e1f20] rounded-2xl w-full max-w-sm p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X size={24} />
          </button>
        </div>
        
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Theme</h3>
            <div className="flex gap-3">
              <button 
                onClick={() => setTheme('light')}
                className={`flex-1 py-2 rounded-lg border ${theme === 'light' ? 'border-blue-500 bg-blue-50 dark:bg-[#004a77] text-blue-700 dark:text-blue-100' : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}
              >
                Light
              </button>
              <button 
                onClick={() => setTheme('dark')}
                className={`flex-1 py-2 rounded-lg border ${theme === 'dark' ? 'border-blue-500 bg-blue-50 dark:bg-[#004a77] text-blue-700 dark:text-blue-100' : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}
              >
                Dark
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
