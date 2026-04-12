import { useState, useEffect } from 'react';
import { Artifact } from '../types';
import { storage } from '../lib/storage';
import { sharing } from '../lib/sharing';
import { X, Code, FileText, Search, Link as LinkIcon } from 'lucide-react';

interface ArtifactLibraryProps {
  onClose: () => void;
  onOpenArtifact: (artifact: Artifact) => void;
}

export function ArtifactLibrary({ onClose, onOpenArtifact }: ArtifactLibraryProps) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);

  useEffect(() => {
    setArtifacts(storage.getArtifacts());
  }, []);

  const handleShare = (artifact: Artifact) => {
    const url = sharing.generateArtifactLink(artifact);
    alert(`Public Link Generated:\n${url}`);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-[#1e1f20] rounded-2xl w-full max-w-3xl p-6 shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Artifact Library</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X size={24} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-4">
          {artifacts.map(artifact => (
            <div key={artifact.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg flex justify-between items-center hover:bg-gray-50 dark:hover:bg-[#2a2b2c] transition-colors">
              <div className="flex items-center gap-3 cursor-pointer" onClick={() => onOpenArtifact(artifact)}>
                {artifact.type === 'code' && <Code size={20} className="text-blue-500" />}
                {artifact.type === 'text' && <FileText size={20} className="text-green-500" />}
                {artifact.type === 'research' && <Search size={20} className="text-purple-500" />}
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">{artifact.title}</h3>
                  <p className="text-xs text-gray-500 mt-1">{new Date(artifact.createdAt).toLocaleString()}</p>
                </div>
              </div>
              <button onClick={() => handleShare(artifact)} className="p-2 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400" title="Share Artifact">
                <LinkIcon size={18} />
              </button>
            </div>
          ))}
          {artifacts.length === 0 && <p className="text-gray-500 text-sm">No artifacts created yet.</p>}
        </div>
      </div>
    </div>
  );
}
