import { useState, useRef, useEffect, useCallback } from 'react';
import { Message, Artifact } from '../types';
import { SafeMarkdown } from './SafeMarkdown';
import { TypingIndicator } from './TypingIndicator';
import { Send, Image as ImageIcon, Video, Play, Upload, X, Diamond, Copy, Check, RefreshCw, Pencil, ChevronDown } from 'lucide-react';

interface ChatProps {
  messages: Message[];
  onSendMessage: (content: string, type?: string, attachment?: { dataUri: string; mimeType: string; name: string }) => void;
  onOpenArtifact: (artifactData: Artifact | string) => void;
  gems: Array<{ id: string; name: string }>;
  activeGemId?: string;
  onSetGem: (gemId: string | undefined) => void;
  isLoading?: boolean;
  onRegenerate?: () => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
}

export function Chat({ messages, onSendMessage, onOpenArtifact, gems, activeGemId, onSetGem, isLoading, onRegenerate, onEditMessage }: ChatProps) {
  const [input, setInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [attachment, setAttachment] = useState<{ dataUri: string; mimeType: string; name: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isNearBottom, setIsNearBottom] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Feature 19: Smart auto-scroll — only scroll to bottom when user is already near bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (isNearBottom) {
      scrollToBottom();
    }
  }, [messages, isLoading, isNearBottom, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const threshold = 120;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsNearBottom(distanceFromBottom < threshold);
  }, []);

  // Feature 20: Auto-focus input after thread switch or modal close
  useEffect(() => {
    inputRef.current?.focus();
  }, [messages.length === 0]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };

  // Feature 9: Fix drag-and-drop — process dropped files
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setAttachment({
        dataUri: reader.result as string,
        mimeType: file.type,
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setAttachment({
        dataUri: reader.result as string,
        mimeType: file.type,
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() || attachment) {
      onSendMessage(input, undefined, attachment ?? undefined);
      setInput('');
      setAttachment(null);
      // Feature 20: refocus after send
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  // Feature 6: Copy message to clipboard
  const handleCopy = async (msg: Message) => {
    await navigator.clipboard.writeText(msg.content);
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Feature 15: Edit message
  const startEdit = (msg: Message) => {
    setEditingId(msg.id);
    setEditContent(msg.content);
  };

  const submitEdit = () => {
    if (editingId && editContent.trim() && onEditMessage) {
      onEditMessage(editingId, editContent.trim());
    }
    setEditingId(null);
    setEditContent('');
  };

  // Feature 17: Word count helper
  const wordCount = (text: string) => {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return words;
  };

  // Find last model message for regenerate button
  const lastModelMsgIndex = messages.length > 0
    ? messages.reduce((last, msg, i) => msg.role === 'model' ? i : last, -1)
    : -1;

  return (
    <div
      className="min-h-0 min-w-0 flex-1 flex flex-col h-full bg-white dark:bg-[#131314]"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 bg-blue-500/20 backdrop-blur-sm z-50 flex flex-col items-center justify-center border-4 border-dashed border-blue-500 rounded-2xl m-4 pointer-events-none">
          <Upload size={48} className="text-blue-500 mb-2 animate-bounce" />
          <p className="text-blue-700 dark:text-blue-300 font-bold text-xl">Drop files to upload</p>
        </div>
      )}
      {gems.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
          <Diamond size={14} className="text-purple-500" />
          <select
            value={activeGemId || ''}
            onChange={(e) => onSetGem(e.target.value || undefined)}
            className="text-xs bg-transparent border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            <option value="">No Gem (default)</option>
            {gems.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      )}

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 space-y-6 relative"
        role="log"
        aria-live="polite"
      >
        {messages.map((msg, msgIndex) => (
          <div key={msg.id} className={`group flex min-w-0 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`relative min-w-0 max-w-[80%] overflow-hidden rounded-2xl px-5 py-3 ${
              msg.role === 'user'
                ? 'bg-gray-100 dark:bg-[#2a2b2c] text-gray-900 dark:text-gray-100'
                : 'bg-transparent text-gray-900 dark:text-gray-100'
            }`}>
              {msg.type === 'image' && msg.artifactData && (
                <img src={msg.artifactData as string} alt="Generated" className="max-w-sm rounded-lg mb-2" />
              )}
              {msg.type === 'audio' && msg.artifactData && (
                <audio controls src={msg.artifactData as string} className="mb-2" />
              )}
              {msg.type === 'artifact' && (
                <button
                  onClick={() => { if (msg.artifactData) onOpenArtifact(msg.artifactData); }}
                  className="mb-2 px-4 py-2 bg-blue-50 dark:bg-[#004a77] text-blue-700 dark:text-blue-200 rounded-lg border border-blue-200 dark:border-blue-800 flex items-center gap-2"
                >
                  <Play size={16} /> Open Artifact
                </button>
              )}

              {/* Feature 15: Inline edit mode for user messages */}
              {editingId === msg.id ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    autoFocus
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit(); }
                      if (e.key === 'Escape') { setEditingId(null); }
                    }}
                    className="w-full bg-white dark:bg-[#1e1f20] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none"
                    rows={3}
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditingId(null)} className="px-3 py-1 text-xs rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">Cancel</button>
                    <button onClick={submitEdit} className="px-3 py-1 text-xs rounded-lg bg-blue-600 text-white">Save & Resubmit</button>
                  </div>
                </div>
              ) : (
                <div className="markdown-body prose dark:prose-invert max-w-none break-words [overflow-wrap:anywhere]">
                  <SafeMarkdown>{msg.content}</SafeMarkdown>
                </div>
              )}

              {/* Feature 17: Word count for model responses */}
              {msg.role === 'model' && editingId !== msg.id && (
                <div className="mt-2 text-[10px] text-gray-400 dark:text-gray-600 select-none">
                  {wordCount(msg.content)} words
                </div>
              )}

              {/* Feature 6: Copy + Feature 10: Regenerate + Feature 15: Edit buttons */}
              {editingId !== msg.id && (
                <div className="absolute -bottom-5 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleCopy(msg)}
                    className="p-1 rounded-md bg-gray-200/80 dark:bg-gray-700/80 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 backdrop-blur-sm"
                    title="Copy message"
                  >
                    {copiedId === msg.id ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                  </button>
                  {msg.role === 'user' && onEditMessage && (
                    <button
                      onClick={() => startEdit(msg)}
                      className="p-1 rounded-md bg-gray-200/80 dark:bg-gray-700/80 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 backdrop-blur-sm"
                      title="Edit message"
                    >
                      <Pencil size={12} />
                    </button>
                  )}
                  {msg.role === 'model' && msgIndex === lastModelMsgIndex && onRegenerate && !isLoading && (
                    <button
                      onClick={onRegenerate}
                      className="p-1 rounded-md bg-gray-200/80 dark:bg-gray-700/80 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 backdrop-blur-sm"
                      title="Regenerate response"
                    >
                      <RefreshCw size={12} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Feature 1: Typing indicator while loading */}
        {isLoading && <TypingIndicator />}

        <div ref={messagesEndRef} />
      </div>

      {/* Feature 5: Scroll-to-bottom button */}
      {!isNearBottom && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-28 right-8 z-30 p-2 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 shadow-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-all"
          aria-label="Scroll to bottom"
        >
          <ChevronDown size={20} />
        </button>
      )}

      <div className="w-full max-w-4xl mx-auto p-4 min-w-0 shrink-0">
        {attachment && (
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-t-xl text-sm text-gray-700 dark:text-gray-300">
            <span className="truncate">{attachment.name}</span>
            <button type="button" onClick={() => setAttachment(null)} className="text-gray-400 hover:text-red-500">
              <X size={14} />
            </button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="relative flex items-center bg-gray-100 dark:bg-[#2a2b2c] rounded-full px-4 py-2 shadow-sm focus-within:ring-2 focus-within:ring-blue-500">
          <button type="button" onClick={() => imageInputRef.current?.click()} className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" title="Upload Image">
            <ImageIcon size={20} />
          </button>
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelect(e)} />
          <button type="button" onClick={() => videoInputRef.current?.click()} className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" title="Upload Video">
            <Video size={20} />
          </button>
          <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => handleFileSelect(e)} />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isLoading ? "Gemini is thinking..." : "Ask Gemini..."}
            disabled={isLoading}
            className="flex-1 bg-transparent border-none focus:outline-none px-4 py-2 text-gray-900 dark:text-gray-100 disabled:opacity-50"
          />
          <button type="submit" disabled={(!input.trim() && !attachment) || isLoading} className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            <Send size={18} />
          </button>
        </form>
        <div className="text-center text-xs text-gray-500 mt-2">
          Gemini may display inaccurate info, including about people, so double-check its responses.
        </div>
      </div>
    </div>
  );
}
