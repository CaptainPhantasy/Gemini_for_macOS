import { useState, useRef, useEffect } from 'react';
import { Message } from '../types';
import Markdown from 'react-markdown';
import { Send, Mic, Image as ImageIcon, Video, Play, Square, Upload } from 'lucide-react';
import { multimodal } from '../lib/multimodal';

interface ChatProps {
  messages: Message[];
  onSendMessage: (content: string, type?: string) => void;
  onOpenArtifact: (artifactData: any) => void;
}

export function Chat({ messages, onSendMessage, onOpenArtifact }: ChatProps) {
  const [input, setInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSendMessage(input);
      setInput('');
    }
  };

  const toggleLiveMode = async () => {
    if (isLiveMode) {
      // Stop live mode
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        setMediaStream(null);
      }
      setIsLiveMode(false);
    } else {
      // Start live mode
      setIsLiveMode(true);
      if (videoRef.current) {
        const stream = await multimodal.startCameraStream(videoRef.current);
        if (stream) {
          setMediaStream(stream);
        } else {
          setIsLiveMode(false);
        }
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-[#131314]">
      {isLiveMode && (
        <div className="h-48 bg-black flex items-center justify-center relative">
          <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover opacity-50" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-red-500 text-white px-4 py-2 rounded-full flex items-center gap-2 animate-pulse">
              <Mic size={16} /> Live Mode Active
            </div>
          </div>
        </div>
      )}

      {isDragging && (
        <div className="absolute inset-0 bg-blue-500/20 backdrop-blur-sm z-50 flex flex-col items-center justify-center border-4 border-dashed border-blue-500 rounded-2xl m-4 pointer-events-none">
          <Upload size={48} className="text-blue-500 mb-2 animate-bounce" />
          <p className="text-blue-700 dark:text-blue-300 font-bold text-xl">Drop files to upload</p>
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
                <Markdown>{msg.content}</Markdown>
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 max-w-4xl mx-auto w-full">
        <form onSubmit={handleSubmit} className="relative flex items-center bg-gray-100 dark:bg-[#2a2b2c] rounded-full px-4 py-2 shadow-sm focus-within:ring-2 focus-within:ring-blue-500">
          <button type="button" className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" title="Upload Image">
            <ImageIcon size={20} />
          </button>
          <button type="button" className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" title="Upload Video">
            <Video size={20} />
          </button>
          <button 
            type="button" 
            onClick={toggleLiveMode}
            className={`p-2 rounded-full ${isLiveMode ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`} 
            title="Live Mode"
          >
            {isLiveMode ? <Square size={20} /> : <Mic size={20} />}
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isLiveMode ? "Listening..." : "Ask Gemini..."}
            disabled={isLiveMode}
            className="flex-1 bg-transparent border-none focus:outline-none px-4 py-2 text-gray-900 dark:text-gray-100 disabled:opacity-50"
          />
          <button type="submit" disabled={!input.trim() || isLiveMode} className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
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
