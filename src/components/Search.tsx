import { useState, useMemo } from 'react';
import { Search as SearchIcon, X, MessageSquare, FileText } from 'lucide-react';
import { storage } from '../lib/storage';

export function Search({ onClose, onOpenThread, onOpenArtifact }) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    if (query.length < 2) return [];
    const threads = storage.getThreads().filter(t => t.title.toLowerCase().includes(query.toLowerCase()));
    const artifacts = storage.getArtifacts().filter(a => (a.title || '').toLowerCase().includes(query.toLowerCase()) || (a.content || '').toLowerCase().includes(query.toLowerCase()));
    const threadResults = (threads || []).map(t => ({...t, type: 'thread'}));
    const artifactResults = (artifacts || []).map(a => ({...a, type: 'artifact'}));
    return [...threadResults, ...artifactResults];
  }, [query]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white dark:bg-[#1e1f20] w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
          <SearchIcon className="text-gray-400" size={20} />
          <input autoFocus placeholder="Search chats and artifacts..." aria-label="Search" className="flex-1 bg-transparent border-none outline-none text-lg text-gray-900 dark:text-white" value={query} onChange={e => setQuery(e.target.value)} />
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        <div className="max-h-[400px] overflow-y-auto p-2">
          {results.map((r, i) => (
            <button key={i} onClick={() => { if (r.type === 'thread') onOpenThread(r.id); else onOpenArtifact(r); onClose(); }} className="w-full text-left p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-[#2a2b2c] flex items-center gap-3 transition-colors text-gray-800 dark:text-gray-100">
              {r.type === 'thread' ? <MessageSquare size={16} /> : <FileText size={16} />}
              <span className="font-medium">{r.title}</span>
            </button>
          ))}
          {query.length > 1 && results.length === 0 && <p className="text-center p-8 text-gray-500">No results found.</p>}
        </div>
      </div>
    </div>
  );
}
