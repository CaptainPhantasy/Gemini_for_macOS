import { useState, useEffect } from 'react';
import { Gem } from '../types';
import { storage } from '../lib/storage';
import { v4 as uuidv4 } from 'uuid';
import { X, Save } from 'lucide-react';

interface GemsRegistryProps {
  onClose: () => void;
}

export function GemsRegistry({ onClose }: GemsRegistryProps) {
  const [gems, setGems] = useState<Gem[]>([]);
  const [newGemName, setNewGemName] = useState('');
  const [newGemInstruction, setNewGemInstruction] = useState('');

  useEffect(() => {
    setGems(storage.getGems());
  }, []);

  const handleSave = async () => {
    if (!newGemName.trim() || !newGemInstruction.trim()) return;
    
    const newGem: Gem = {
      id: uuidv4(),
      name: newGemName,
      systemInstruction: newGemInstruction,
      createdAt: Date.now()
    };
    
    await storage.saveGem(newGem);
    setGems([...storage.getGems()]);
    
    setNewGemName('');
    setNewGemInstruction('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-[#1e1f20] rounded-2xl w-full max-w-2xl p-6 shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Gems Registry</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X size={24} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-4 mb-4">
          {gems.map(gem => (
            <div key={gem.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
              <h3 className="font-medium text-gray-900 dark:text-white">{gem.name}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{gem.systemInstruction}</p>
            </div>
          ))}
          {gems.length === 0 && <p className="text-gray-500 text-sm">No gems found.</p>}
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Create New Gem</h3>
          <input
            type="text"
            placeholder="Gem Name"
            value={newGemName}
            onChange={e => setNewGemName(e.target.value)}
            className="w-full p-2 bg-gray-50 dark:bg-[#131314] border border-gray-200 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white"
          />
          <textarea
            placeholder="System Instructions"
            value={newGemInstruction}
            onChange={e => setNewGemInstruction(e.target.value)}
            className="w-full h-24 p-2 bg-gray-50 dark:bg-[#131314] border border-gray-200 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white resize-none"
          />
          <button onClick={handleSave} className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex justify-center items-center gap-2">
            <Save size={18} /> Save Gem
          </button>
        </div>
      </div>
    </div>
  );
}
