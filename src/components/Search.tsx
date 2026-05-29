import { useEffect, useMemo, useState } from 'react';
import { Search as SearchIcon, X, MessageSquare, FileText } from 'lucide-react';
import { storage } from '../lib/storage';
import type { Artifact } from '../types';

const SEARCH_DEBOUNCE_MS = 150;
const SEARCH_MIN_QUERY_LENGTH = 2;

interface SearchProps {
  onClose: () => void;
  onOpenThread: (id: string) => void;
  onOpenArtifact: (artifact: Artifact) => void;
}

type ThreadSearchResult = { kind: 'thread'; id: string; title: string };
type ArtifactSearchResult = { kind: 'artifact'; artifact: Artifact; title: string };

export function Search({ onClose, onOpenThread, onOpenArtifact }: SearchProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const searchableThreads = useMemo(
    () =>
      storage.getThreads().map((thread) => ({
        ...thread,
        searchableTitle: thread.title.toLowerCase(),
      })),
    []
  );

  const searchableArtifacts = useMemo(
    () =>
      storage.getArtifacts().map((artifact) => ({
        ...artifact,
        searchableTitle: (artifact.title || '').toLowerCase(),
        searchableContent: (artifact.content || '').toLowerCase(),
      })),
    []
  );

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQuery(query.trim().toLowerCase());
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  const results = useMemo(() => {
    if (debouncedQuery.length < SEARCH_MIN_QUERY_LENGTH) return [];
    const threads = searchableThreads.filter((t) => t.searchableTitle.includes(debouncedQuery));
    const artifacts = searchableArtifacts.filter(
      (a) => a.searchableTitle.includes(debouncedQuery) || a.searchableContent.includes(debouncedQuery)
    );
    const threadResults: ThreadSearchResult[] = threads.map((t) => ({ kind: 'thread' as const, id: t.id, title: t.title }));
    const artifactResults: ArtifactSearchResult[] = artifacts.map((a) => ({ kind: 'artifact' as const, artifact: a, title: a.title }));
    return [...threadResults, ...artifactResults];
  }, [debouncedQuery, searchableThreads, searchableArtifacts]);

  const noResults = debouncedQuery.length >= SEARCH_MIN_QUERY_LENGTH && results.length === 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white dark:bg-[#1e1f20] w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
          <SearchIcon className="text-gray-400" size={20} />
          <input
            autoFocus
            placeholder="Search chats and artifacts..."
            aria-label="Search"
            className="flex-1 bg-transparent border-none outline-none text-lg text-gray-900 dark:text-white"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        <div className="max-h-[400px] overflow-y-auto p-2">
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => {
                if (r.kind === 'thread') onOpenThread(r.id); else onOpenArtifact(r.artifact); onClose();
              }}
              className="w-full text-left p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-[#2a2b2c] flex items-center gap-3 transition-colors text-gray-800 dark:text-gray-100"
            >
              {r.kind === 'thread' ? <MessageSquare size={16} /> : <FileText size={16} />}
              <span className="font-medium">{r.title}</span>
            </button>
          ))}
          {noResults && <p className="text-center p-8 text-gray-500">No results found.</p>}
        </div>
      </div>
    </div>
  );
}