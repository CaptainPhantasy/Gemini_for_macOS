import { Plus, MessageSquare, Settings, Link as LinkIcon, Calendar, Diamond, Library , Video } from 'lucide-react';
import { Thread } from '../types';

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
    <div className="w-[250px] bg-gray-50 dark:bg-[#1e1f20] border-r border-gray-200 dark:border-gray-800 flex flex-col h-full">
      <div className="p-4">
        <button 
          onClick={onNewThread}
          className="w-full flex items-center gap-2 bg-white dark:bg-[#2a2b2c] hover:bg-gray-100 dark:hover:bg-[#333537] text-gray-900 dark:text-gray-100 px-4 py-3 rounded-full shadow-sm transition-colors"
        >
          <Plus size={20} />
          <span className="font-medium">New chat</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 px-2 uppercase tracking-wider">Recent</div>
        {threads.map(thread => (
          <button
            key={thread.id}
            onClick={() => onSelectThread(thread.id)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              activeThreadId === thread.id 
                ? 'bg-blue-100 dark:bg-[#004a77] text-blue-900 dark:text-blue-100' 
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2a2b2c]'
            }`}
          >
            <MessageSquare size={16} />
            <span className="truncate">{thread.title}</span>
          </button>
        ))}
      </div>

      <div className="p-3 border-t border-gray-200 dark:border-gray-800 space-y-1">

        <button onClick={onOpenLiveMode} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2a2b2c] transition-colors">
          <Video size={16} />
          <span>Live Mode</span>
        </button>
        <button onClick={onOpenIntegrations} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2a2b2c] transition-colors">
          <LinkIcon size={16} />
          <span>Google Ecosystem</span>
        </button>

        <button onClick={onOpenArtifacts} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2a2b2c] transition-colors">
          <Library size={16} />
          <span>Artifact Library</span>
        </button>
        <button onClick={onOpenGems} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2a2b2c] transition-colors">
          <Diamond size={16} />
          <span>Gems Registry</span>
        </button>
        <button onClick={onOpenSchedule} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2a2b2c] transition-colors">
          <Calendar size={16} />
          <span>Scheduled Actions</span>
        </button>
        <button onClick={onOpenPI} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2a2b2c] transition-colors">
          <LinkIcon size={16} />
          <span>Personal Intelligence</span>
        </button>
        <button onClick={onOpenSettings} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2a2b2c] transition-colors">
          <Settings size={16} />
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
}
