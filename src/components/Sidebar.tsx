import { useState } from 'react';
import { Plus, MessageSquare, Settings, Link as LinkIcon, Calendar, Diamond, Library, Video, Brain, Sparkles, Edit2, Trash2, Check, X } from 'lucide-react';
import { Thread } from '../types';
import { CostBadge } from './CostBadge';

interface SidebarProps {
  onOpenHelp?: () => void;
  onOpenShortcutEditor?: () => void;
  threads: Thread[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
  onOpenSettings: () => void;
  onOpenGems: () => void;
  onOpenSchedule: () => void;
  onOpenPI: () => void;
  onOpenArtifacts: () => void;
  onOpenLiveMode: () => void;
  onOpenIntegrations: () => void;
  onDeleteThread?: (id: string) => void;
  onRenameThread?: (id: string, title: string) => void;
}

export function Sidebar({ threads, activeThreadId, onSelectThread, onNewThread, onOpenSettings, onOpenGems, onOpenSchedule, onOpenPI, onOpenArtifacts, onOpenLiveMode, onOpenIntegrations, onDeleteThread, onRenameThread }: SidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const startEditing = (thread: Thread) => {
    setEditingId(thread.id);
    setEditTitle(thread.title);
  };

  const commitRename = () => {
    if (editingId && editTitle.trim() && onRenameThread) {
      onRenameThread(editingId, editTitle.trim());
    }
    setEditingId(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  return (
    <div className="w-[280px] bg-gray-50 dark:bg-[#1e1f20] border-r border-gray-200 dark:border-gray-800 flex flex-col h-full">
      <div className="p-6">
        <div className="flex items-center gap-2 mb-6 px-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white">
            <Sparkles size={18} />
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
            Gemini Studio
          </h1>
        </div>
        
        <button 
          onClick={onNewThread}
          className="w-full flex items-center gap-2 bg-white dark:bg-[#2a2b2c] hover:bg-gray-100 dark:hover:bg-[#333537] text-gray-900 dark:text-gray-100 px-4 py-3 rounded-full shadow-sm border border-gray-200 dark:border-gray-700 transition-colors"
        >
          <Plus size={20} />
          <span className="font-medium">New chat</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 px-2 uppercase tracking-wider">Recent</div>
        {threads.map(thread => (
          <div key={thread.id} className="group relative">
            {editingId === thread.id ? (
              <div className="flex items-center gap-1 px-3 py-2.5">
                <input
                  autoFocus
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') cancelEditing();
                  }}
                  className="flex-1 min-w-0 bg-white dark:bg-[#2a2b2c] border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500"
                />
                <button onClick={commitRename} className="p-1 text-green-600 hover:text-green-500" aria-label="Save">
                  <Check size={14} />
                </button>
                <button onClick={cancelEditing} className="p-1 text-gray-400 hover:text-gray-300" aria-label="Cancel">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => onSelectThread(thread.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                  activeThreadId === thread.id
                    ? 'bg-blue-100 dark:bg-[#004a77] text-blue-900 dark:text-blue-100 shadow-sm'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-[#2a2b2c]'
                }`}
              >
                <MessageSquare size={16} className={activeThreadId === thread.id ? "text-blue-600 dark:text-blue-300" : "text-gray-400"} />
                <span className="truncate font-medium flex-1 text-left">{thread.title}</span>
              </button>
            )}
            {editingId !== thread.id && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); startEditing(thread); }}
                  className="p-1 rounded hover:bg-gray-300/60 dark:hover:bg-gray-600/60 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  aria-label="Rename thread"
                >
                  <Edit2 size={13} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onDeleteThread && window.confirm('Delete this thread?')) {
                      onDeleteThread(thread.id);
                    }
                  }}
                  className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/40 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                  aria-label="Delete thread"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-1">
        <button onClick={onOpenLiveMode} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2a2b2c] transition-colors">
          <Video size={16} className="text-gray-400" />
          <span>Live Mode</span>
        </button>

        <button onClick={onOpenArtifacts} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2a2b2c] transition-colors">
          <Library size={16} className="text-gray-400" />
          <span>Artifact Library</span>
        </button>
        <button onClick={onOpenGems} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2a2b2c] transition-colors">
          <Diamond size={16} className="text-gray-400" />
          <span>Gems Registry</span>
        </button>
        <button onClick={onOpenSchedule} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2a2b2c] transition-colors">
          <Calendar size={16} className="text-gray-400" />
          <span>Scheduled Actions</span>
        </button>
        <button onClick={onOpenPI} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2a2b2c] transition-colors">
          <Brain size={16} className="text-gray-400" />
          <span>Personal Intelligence</span>
        </button>
        <button onClick={onOpenIntegrations} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2a2b2c] transition-colors">
          <LinkIcon size={16} className="text-gray-400" />
          <span>Integrations</span>
        </button>
        <div className="px-3 py-2">
          <CostBadge />
        </div>
        <button onClick={onOpenSettings} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2a2b2c] transition-colors">
          <Settings size={16} className="text-gray-400" />
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
}
