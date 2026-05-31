import { useState, useMemo, type PointerEvent } from 'react';
import {
  Plus,
  MessageSquare,
  Settings,
  Link as LinkIcon,
  Calendar,
  Diamond,
  Library,
  Video,
  Brain,
  Sparkles,
  Edit2,
  Trash2,
  Check,
  X,
  Pin,
  PinOff,
  Search,
  ChevronDown,
  FileText,
  Mic,
  MonitorUp,
} from 'lucide-react';
import { Thread, Artifact } from '../types';
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
  onPinThread?: (id: string) => void;
  onExportThread?: (id: string) => void;
  onOpenArtifact?: (artifact: Artifact, threadId: string) => void;
  drawerOpen: boolean;
  onDrawerOpenChange: (open: boolean) => void;
}

type ThreadArtifact = {
  artifact: Artifact;
  messageId: string;
};

function isArtifact(value: unknown): value is Artifact {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Artifact>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.content === 'string' &&
    typeof candidate.type === 'string'
  );
}

function getThreadArtifacts(thread: Thread): ThreadArtifact[] {
  const seen = new Set<string>();
  const artifacts: ThreadArtifact[] = [];

  for (const message of thread.messages) {
    if (!isArtifact(message.artifactData) || seen.has(message.artifactData.id)) {
      continue;
    }

    seen.add(message.artifactData.id);
    artifacts.push({
      artifact: message.artifactData,
      messageId: message.id,
    });
  }

  return artifacts;
}

export function Sidebar({
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
  onOpenSettings,
  onOpenGems,
  onOpenSchedule,
  onOpenPI,
  onOpenArtifacts,
  onOpenLiveMode,
  onOpenIntegrations,
  onDeleteThread,
  onRenameThread,
  onPinThread,
  onExportThread,
  onOpenArtifact,
  drawerOpen,
  onDrawerOpenChange,
}: SidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [filter, setFilter] = useState('');
  const [expandedThreadIds, setExpandedThreadIds] = useState<Record<string, boolean>>({});

  const activateOverlayButton = (handler: () => void) => (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    handler();
  };

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

  const toggleThreadArtifacts = (threadId: string) => {
    setExpandedThreadIds((prev) => ({
      ...prev,
      [threadId]: !(prev[threadId] ?? activeThreadId === threadId),
    }));
  };

  const openThreadArtifact = (threadId: string, artifact: Artifact) => {
    onSelectThread(threadId);
    onOpenArtifact?.(artifact, threadId);
  };

  // Feature 13: Filter threads by title
  // Feature 14: Sort pinned threads to top
  const filteredThreads = useMemo(() => {
    const needle = filter.toLowerCase();
    const filtered = needle
      ? threads.filter(t => t.title.toLowerCase().includes(needle))
      : threads;
    return [...filtered].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.updatedAt - a.updatedAt;
    });
  }, [threads, filter]);

  const artifactsByThread = useMemo(() => {
    const result = new Map<string, ThreadArtifact[]>();
    for (const thread of threads) {
      result.set(thread.id, getThreadArtifacts(thread));
    }
    return result;
  }, [threads]);

  const pinnedCount = filteredThreads.filter(t => t.pinned).length;

  return (
    <aside
      aria-label="Navigation and artifact session tree"
      className="h-dvh max-h-dvh min-h-0 w-full shrink-0 overflow-hidden border-r border-gray-200 bg-gray-50 transition-[width] duration-300 ease-in-out dark:border-gray-800 dark:bg-[#1e1f20]"
      style={{ width: '100%' }}
      onMouseEnter={() => onDrawerOpenChange(true)}
      onMouseLeave={() => onDrawerOpenChange(false)}
      onFocusCapture={() => onDrawerOpenChange(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onDrawerOpenChange(false);
        }
      }}
    >
      <div className="flex h-full max-h-dvh min-h-0 w-full flex-col">
        <div className="shrink-0 p-3">
          <div className={`mb-4 flex items-center gap-3 ${drawerOpen ? 'px-2' : 'justify-center'}`}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white">
              <Sparkles size={16} />
            </div>
            {drawerOpen && (
              <h1 className="truncate bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-lg font-bold text-transparent dark:from-white dark:to-gray-400">
                Gemini Studio
              </h1>
            )}
          </div>

          <button
            onClick={onNewThread}
            title="New chat"
            className={`flex w-full items-center gap-3 rounded-xl py-2.5 text-sm transition-all ${
              drawerOpen ? 'px-2 justify-start' : 'px-2 justify-center'
            } text-gray-700 hover:bg-gray-200/60 dark:text-gray-300 dark:hover:bg-[#2a2b2c]`}
          >
            <div className="flex w-6 items-center justify-center shrink-0">
              <Plus size={18} />
            </div>
            {drawerOpen && <span className="flex-1 text-left font-medium">New chat</span>}
          </button>

          {/* Feature 13: Thread filter */}
          {drawerOpen && (
            <div className="relative mt-2 px-2">
              <Search size={14} className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter chats..."
                className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-[#1e1f20] dark:text-gray-300"
              />
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {pinnedCount > 0 && (
            <div className="mb-2 flex items-center gap-1 px-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {drawerOpen && (
                <>
                  <Pin size={10} /> Pinned
                </>
              )}
            </div>
          )}
          {filteredThreads.map((thread, idx) => {
            const artifacts = artifactsByThread.get(thread.id) ?? [];
            const artifactsExpanded = expandedThreadIds[thread.id] ?? activeThreadId === thread.id;

            return (
              <div key={thread.id}>
                {/* Show "Recent" divider after pinned section */}
                {pinnedCount > 0 && idx === pinnedCount && (
                  <div className="mb-2 mt-3 px-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{drawerOpen && "Recent"}</div>
                )}
                {pinnedCount === 0 && idx === 0 && (
                  <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{drawerOpen && "Recent"}</div>
                )}
                <div className="group relative">
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
                        className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 outline-none focus:border-blue-500 dark:border-gray-600 dark:bg-[#2a2b2c] dark:text-gray-100"
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
                      title={thread.title}
                      className={`flex w-full items-center gap-3 rounded-xl py-2.5 text-sm transition-all ${
                        drawerOpen ? 'px-2 justify-start' : 'px-2 justify-center'
                      } ${
                        activeThreadId === thread.id
                          ? 'bg-blue-100 text-blue-900 shadow-sm dark:bg-[#004a77] dark:text-blue-100'
                          : 'text-gray-700 hover:bg-gray-200/60 dark:text-gray-300 dark:hover:bg-[#2a2b2c]'
                      }`}
                    >
                      <div className="flex w-6 items-center justify-center shrink-0">
                        <MessageSquare size={16} className={activeThreadId === thread.id ? 'text-blue-600 dark:text-blue-300' : 'text-gray-400'} />
                      </div>
                      {drawerOpen && <span className="flex-1 truncate text-left font-medium">{thread.title}</span>}
                      {drawerOpen && artifacts.length > 0 && (
                        <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                          {artifacts.length}
                        </span>
                      )}
                      {drawerOpen && thread.pinned && <Pin size={10} className="shrink-0 text-gray-400" />}
                    </button>
                  )}

                  {editingId !== thread.id && (
                    <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      {onPinThread && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onPinThread(thread.id); }}
                          className="rounded p-1 text-gray-500 hover:bg-gray-300/60 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-600/60 dark:hover:text-gray-200"
                          aria-label={thread.pinned ? 'Unpin thread' : 'Pin thread'}
                        >
                          {thread.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); startEditing(thread); }}
                        className="rounded p-1 text-gray-500 hover:bg-gray-300/60 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-600/60 dark:hover:text-gray-200"
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
                        className="rounded p-1 text-gray-500 hover:bg-red-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-900/40 dark:hover:text-red-400"
                        aria-label="Delete thread"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>

                {drawerOpen && artifacts.length > 0 && (
                  <div className="ml-7 mt-1 border-l border-gray-200 pl-2 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={() => toggleThreadArtifacts(thread.id)}
                      className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-xs font-medium text-gray-500 hover:bg-gray-200/60 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-[#2a2b2c] dark:hover:text-gray-200"
                    >
                      <ChevronDown size={12} className={`shrink-0 transition-transform ${artifactsExpanded ? '' : '-rotate-90'}`} />
                      <span className="truncate">Artifacts</span>
                    </button>
                    {artifactsExpanded && artifacts.map(({ artifact, messageId }) => (
                      <button
                        key={`${thread.id}-${messageId}-${artifact.id}`}
                        type="button"
                        onClick={() => openThreadArtifact(thread.id, artifact)}
                        title={artifact.title}
                        className="mt-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-gray-600 hover:bg-blue-50 hover:text-blue-700 dark:text-gray-300 dark:hover:bg-[#004a77] dark:hover:text-blue-100"
                      >
                        <FileText size={12} className="shrink-0" />
                        <span className="truncate">{artifact.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="shrink-0 space-y-1 border-t border-gray-200 p-3 dark:border-gray-800">
          {drawerOpen ? (
            <div className="flex w-full items-center gap-2 px-2 py-2 text-gray-700 dark:text-gray-300">
              <button onClick={onOpenLiveMode} className="flex-1 flex justify-center py-2 bg-gray-200 hover:bg-gray-300 dark:bg-[#2a2b2c] dark:hover:bg-[#333537] rounded-lg transition-colors" title="Voice">
                <Mic size={16} className="text-gray-600 dark:text-gray-300" />
              </button>
              <button onClick={onOpenLiveMode} className="flex-1 flex justify-center py-2 bg-gray-200 hover:bg-gray-300 dark:bg-[#2a2b2c] dark:hover:bg-[#333537] rounded-lg transition-colors" title="Camera">
                <Video size={16} className="text-gray-600 dark:text-gray-300" />
              </button>
              <button onClick={onOpenLiveMode} className="flex-1 flex justify-center py-2 bg-gray-200 hover:bg-gray-300 dark:bg-[#2a2b2c] dark:hover:bg-[#333537] rounded-lg transition-colors" title="Screen">
                <MonitorUp size={16} className="text-gray-600 dark:text-gray-300" />
              </button>
            </div>
          ) : (
            <div className="flex w-full flex-col items-center gap-2 py-2">
              <button onClick={onOpenLiveMode} className="p-2 text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-[#2a2b2c] rounded-lg transition-colors" title="Voice">
                <Mic size={16} />
              </button>
              <button onClick={onOpenLiveMode} className="p-2 text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-[#2a2b2c] rounded-lg transition-colors" title="Camera">
                <Video size={16} />
              </button>
              <button onClick={onOpenLiveMode} className="p-2 text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-[#2a2b2c] rounded-lg transition-colors" title="Screen">
                <MonitorUp size={16} />
              </button>
            </div>
          )}

          <button onPointerDown={activateOverlayButton(onOpenArtifacts)} onClick={onOpenArtifacts} title="Artifact Library" className={`flex w-full items-center gap-3 rounded-xl py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-[#2a2b2c] ${drawerOpen ? 'px-2 justify-start' : 'px-2 justify-center'}`}>
            <div className="flex w-6 items-center justify-center shrink-0">
              <Library size={16} className="text-gray-400" />
            </div>
            {drawerOpen && <span>Artifact Library</span>}
          </button>
          <button onPointerDown={activateOverlayButton(onOpenGems)} onClick={onOpenGems} title="Gems Registry" className={`flex w-full items-center gap-3 rounded-xl py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-[#2a2b2c] ${drawerOpen ? 'px-2 justify-start' : 'px-2 justify-center'}`}>
            <div className="flex w-6 items-center justify-center shrink-0">
              <Diamond size={16} className="text-gray-400" />
            </div>
            {drawerOpen && <span>Gems Registry</span>}
          </button>
          <button onPointerDown={activateOverlayButton(onOpenSchedule)} onClick={onOpenSchedule} title="Scheduled Actions" className={`flex w-full items-center gap-3 rounded-xl py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-[#2a2b2c] ${drawerOpen ? 'px-2 justify-start' : 'px-2 justify-center'}`}>
            <div className="flex w-6 items-center justify-center shrink-0">
              <Calendar size={16} className="text-gray-400" />
            </div>
            {drawerOpen && <span>Scheduled Actions</span>}
          </button>
          <button onPointerDown={activateOverlayButton(onOpenPI)} onClick={onOpenPI} title="Personal Intelligence" className={`flex w-full items-center gap-3 rounded-xl py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-[#2a2b2c] ${drawerOpen ? 'px-2 justify-start' : 'px-2 justify-center'}`}>
            <div className="flex w-6 items-center justify-center shrink-0">
              <Brain size={16} className="text-gray-400" />
            </div>
            {drawerOpen && <span>Personal Intelligence</span>}
          </button>
          <button onPointerDown={activateOverlayButton(onOpenIntegrations)} onClick={onOpenIntegrations} title="Integrations" className={`flex w-full items-center gap-3 rounded-xl py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-[#2a2b2c] ${drawerOpen ? 'px-2 justify-start' : 'px-2 justify-center'}`}>
            <div className="flex w-6 items-center justify-center shrink-0">
              <LinkIcon size={16} className="text-gray-400" />
            </div>
            {drawerOpen && <span>Integrations</span>}
          </button>
          <a href="#settings" onClick={() => { onOpenSettings(); window.dispatchEvent(new Event('gemini-open-settings')); }} title="Settings" className={`flex w-full items-center gap-3 rounded-xl py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-[#2a2b2c] ${drawerOpen ? 'px-2 justify-start' : 'px-2 justify-center'}`}>
            <div className="flex w-6 items-center justify-center shrink-0">
              <Settings size={16} className="text-gray-400" />
            </div>
            {drawerOpen && <span>Settings</span>}
          </a>
          {drawerOpen && (
            <div className="px-3 py-2">
              <CostBadge />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
