import { useState, useRef, useEffect } from 'react';
import { Message } from '../types';
import { SafeMarkdown } from './SafeMarkdown';
import { Send, Image as ImageIcon, Video, Play, Upload, X, Diamond } from 'lucide-react';

interface ChatProps {
  messages: Message[];
  onSendMessage: (content: string, type?: string, attachment?: { dataUri: string; mimeType: string; name: string }) => void;
  onOpenArtifact: (artifactData: any) => void;
  gems: Array<{ id: string; name: string }>;
  activeGemId?: string;
  onSetGem: (gemId: string | undefined) => void;
}

export function Chat({ messages, onSendMessage, onOpenArtifact, gems, activeGemId, onSetGem }: ChatProps) {
  const [input, setInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [attachment, setAttachment] = useState<{ dataUri: string; mimeType: string; name: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };

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
    }
  };


  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-[#131314]">
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
      <div className="flex-1 overflow-y-auto p-4 space-y-6" role="log" aria-live="polite">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-5 py-3 ${
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
                  onClick={() => onOpenArtifact(msg.artifactData)}
                  className="mb-2 px-4 py-2 bg-blue-50 dark:bg-[#004a77] text-blue-700 dark:text-blue-200 rounded-lg border border-blue-200 dark:border-blue-800 flex items-center gap-2"
                >
                  <Play size={16} /> Open Artifact
                </button>
              )}
              <div className="markdown-body prose dark:prose-invert max-w-none">
                <SafeMarkdown>{msg.content}</SafeMarkdown>
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 max-w-4xl mx-auto w-full">
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
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Gemini..."
            className="flex-1 bg-transparent border-none focus:outline-none px-4 py-2 text-gray-900 dark:text-gray-100"
          />
          <button type="submit" disabled={!input.trim() && !attachment} className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
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
