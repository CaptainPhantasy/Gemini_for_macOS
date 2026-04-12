import { useState, useEffect } from 'react';
import { ScheduledAction } from '../types';
import { storage } from '../lib/storage';
import { v4 as uuidv4 } from 'uuid';
import { X, Save } from 'lucide-react';

interface ScheduledActionsProps {
  onClose: () => void;
}

export function ScheduledActions({ onClose }: ScheduledActionsProps) {
  const [actions, setActions] = useState<ScheduledAction[]>([]);
  const [cron, setCron] = useState('');
  const [prompt, setPrompt] = useState('');

  useEffect(() => {
    setActions(storage.getScheduledActions());
  }, []);

  const handleSave = async () => {
    if (!cron.trim() || !prompt.trim()) return;
    
    const newAction: ScheduledAction = {
      id: uuidv4(),
      cron,
      prompt,
      enabled: true
    };
    
    await storage.saveScheduledAction(newAction);
    setActions([...storage.getScheduledActions()]);
    
    setCron('');
    setPrompt('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-[#1e1f20] rounded-2xl w-full max-w-2xl p-6 shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Scheduled Actions</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X size={24} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-4 mb-4">
          {actions.map(action => (
            <div key={action.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg flex justify-between items-center">
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white font-mono">{action.cron}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{action.prompt}</p>
              </div>
              <div className="text-sm font-medium text-blue-600 dark:text-blue-400">
                {action.enabled ? 'Active' : 'Paused'}
              </div>
            </div>
          ))}
          {actions.length === 0 && <p className="text-gray-500 text-sm">No scheduled actions.</p>}
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Create New Action</h3>
          <input
            type="text"
            placeholder="Cron Expression (e.g., 0 9 * * *)"
            value={cron}
            onChange={e => setCron(e.target.value)}
            className="w-full p-2 bg-gray-50 dark:bg-[#131314] border border-gray-200 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white font-mono"
          />
          <textarea
            placeholder="Prompt to execute"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            className="w-full h-24 p-2 bg-gray-50 dark:bg-[#131314] border border-gray-200 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white resize-none"
          />
          <button onClick={handleSave} className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex justify-center items-center gap-2">
            <Save size={18} /> Schedule Action
          </button>
        </div>
      </div>
    </div>
  );
}
