import { useState, useEffect } from 'react';
import { PersonalIntelligence } from '../types';
import { storage } from '../lib/storage';
import { X } from 'lucide-react';

interface PIProps {
  onClose: () => void;
}

export function PersonalIntelligencePopup({ onClose }: PIProps) {
  const [pi, setPi] = useState<PersonalIntelligence>({ preferences: '', instructions: '' });

  useEffect(() => {
    setPi(storage.getPersonalIntelligence());
  }, []);

  const handleSave = () => {
    storage.savePersonalIntelligence(pi);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-[#1e1f20] rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Personal Intelligence</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X size={24} />
          </button>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              About You (Preferences)
            </label>
            <textarea
              value={pi.preferences}
              onChange={(e) => setPi({ ...pi, preferences: e.target.value })}
              placeholder="What would you like Gemini to know about you to provide better responses?"
              className="w-full h-24 p-3 bg-gray-50 dark:bg-[#131314] border border-gray-200 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              How would you like Gemini to respond?
            </label>
            <textarea
              value={pi.instructions}
              onChange={(e) => setPi({ ...pi, instructions: e.target.value })}
              placeholder="E.g., Always use Python for code, keep answers concise..."
              className="w-full h-24 p-3 bg-gray-50 dark:bg-[#131314] border border-gray-200 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            Cancel
          </button>
          <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
