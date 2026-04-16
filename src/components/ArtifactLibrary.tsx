import { useState, useEffect } from 'react';
import { Artifact } from '../types';
import { storage } from '../lib/storage';
import { X, Code, FileText, Search, Trash2, Edit2, Check, Upload, HardDrive } from 'lucide-react';
import { uploadArtifactToDrive } from '../lib/drive-sync';

interface ArtifactLibraryProps {
  onClose: () => void;
  onOpenArtifact: (artifact: Artifact) => void;
}

export function ArtifactLibrary({ onClose, onOpenArtifact }: ArtifactLibraryProps) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  useEffect(() => {
    setArtifacts(storage.getArtifacts());
  }, []);

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this artifact?')) {
      await storage.deleteArtifact(id);
      setArtifacts(storage.getArtifacts());
    }
  };

  const startEditing = (artifact: Artifact) => {
    setEditingId(artifact.id);
    setEditTitle(artifact.title);
  };

  const saveEdit = async (artifact: Artifact) => {
    if (editTitle.trim() && editTitle !== artifact.title) {
      const updated = { ...artifact, title: editTitle.trim() };
      await storage.saveArtifact(updated);
      setArtifacts(storage.getArtifacts());
    }
    setEditingId(null);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const codeExts = ['js','jsx','ts','tsx','py','rs','go','html','css','sh','yaml','yml','toml','xml','sql','json'];
    const artifact: Artifact = {
      id: crypto.randomUUID(),
      title: file.name,
      content,
      type: codeExts.includes(ext) ? 'code' : 'text',
      createdAt: Date.now(),
      mimeType: file.type || 'text/plain',
    };
    await storage.saveArtifact(artifact);
    setArtifacts(storage.getArtifacts());
  };

  const filteredArtifacts = artifacts.filter(a =>
    a.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    a.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-[#1e1f20] rounded-2xl w-full max-w-3xl p-6 shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Artifact Library</h2>
            <label className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors cursor-pointer">
              <Upload size={14} /> Import File
              <input
                type="file"
                accept=".txt,.md,.json,.csv,.js,.jsx,.ts,.tsx,.py,.rs,.go,.html,.css,.sh,.yaml,.yml,.toml,.xml,.sql"
                className="hidden"
                onChange={handleImportFile}
              />
            </label>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X size={24} />
          </button>
        </div>
        
        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Search artifacts..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-[#131314] border border-gray-200 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-4">
          {filteredArtifacts.map(artifact => (
            <div key={artifact.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg flex justify-between items-center hover:bg-gray-50 dark:hover:bg-[#2a2b2c] transition-colors">
              <div className="flex items-center gap-3 flex-1">
                <div className="cursor-pointer" onClick={() => onOpenArtifact(artifact)}>
                  {artifact.type === 'code' && <Code size={20} className="text-blue-500" />}
                  {artifact.type === 'text' && <FileText size={20} className="text-green-500" />}
                  {artifact.type === 'research' && <Search size={20} className="text-purple-500" />}
                </div>
                <div className="flex-1">
                  {editingId === artifact.id ? (
                    <div className="flex items-center gap-2">
                      <input 
                        type="text" 
                        value={editTitle} 
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="px-2 py-1 bg-white dark:bg-[#131314] border border-blue-500 rounded text-sm text-gray-900 dark:text-white"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit(artifact)}
                      />
                      <button onClick={() => saveEdit(artifact)} className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded">
                        <Check size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900 dark:text-white cursor-pointer hover:underline" onClick={() => onOpenArtifact(artifact)}>{artifact.title}</h3>
                      <button onClick={() => startEditing(artifact)} className="p-1 text-gray-400 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Edit2 size={14} />
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-1">{new Date(artifact.createdAt).toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={async () => {
                    const result = await uploadArtifactToDrive(artifact);
                    if (result.ok) {
                      setArtifacts(storage.getArtifacts());
                    } else {
                      alert(`Drive upload failed: ${result.error}`);
                    }
                  }}
                  className={`p-2 ${artifact.driveFileId ? 'text-green-500' : 'text-gray-500 hover:text-blue-600 dark:hover:text-blue-400'}`}
                  title={artifact.driveFileId ? 'On Drive ✓' : 'Upload to Drive'}
                >
                  <HardDrive size={18} />
                </button>
                <button onClick={() => handleDelete(artifact.id)} className="p-2 text-gray-500 hover:text-red-600 dark:hover:text-red-400" title="Delete Artifact">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
          {artifacts.length > 0 && filteredArtifacts.length === 0 && <p className="text-gray-500 text-sm">No artifacts match your search.</p>}
          {artifacts.length === 0 && <p className="text-gray-500 text-sm">No artifacts created yet.</p>}
        </div>
      </div>
    </div>
  );
}
