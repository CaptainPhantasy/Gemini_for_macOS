import { Plus, MessageSquare, Settings, Link as LinkIcon, Calendar, Diamond, Library, Video, Brain, Sparkles } from 'lucide-react';
import { Thread } from '../types';
import { CostBadge } from './CostBadge';

interface SidebarProps {
  onOpenPlugins?: () => void;
  onOpenHelp?: () => void;
  onOpenShortcutEditor?: () => void;
  tabbedThreads?: string[];
  onAddTab?: (id: string) => void;
  onRemoveTab?: (id: string) => void;
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
}

export function Sidebar({ threads, activeThreadId, onSelectThread, onNewThread, onOpenSettings, onOpenGems, onOpenSchedule, onOpenPI, onOpenArtifacts, onOpenLiveMode, onOpenIntegrations }: SidebarProps) {
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
          <button
            key={thread.id}
            onClick={() => onSelectThread(thread.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
              activeThreadId === thread.id 
                ? 'bg-blue-100 dark:bg-[#004a77] text-blue-900 dark:text-blue-100 shadow-sm' 
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-[#2a2b2c]'
            }`}
          >
            <MessageSquare size={16} className={activeThreadId === thread.id ? "text-blue-600 dark:text-blue-300" : "text-gray-400"} />
            <span className="truncate font-medium">{thread.title}</span>
          </button>
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
