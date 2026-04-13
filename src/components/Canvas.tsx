import { useState, useEffect, useRef } from 'react';
import { useHistory } from '../lib/useHistory';
import { useKeyboardShortcuts } from '../lib/useKeyboardShortcuts';
import { exportArtifact } from '../lib/export';
import { clipboard } from '../lib/clipboard';
import { Artifact } from '../types';
import { X, Code, FileText, Search, Check, Wand2, Volume2, Music, Video, RefreshCw, AlignLeft, Terminal, Download, Copy, Undo, Redo } from 'lucide-react';
import { storage } from '../lib/storage';
import { multimodal } from '../lib/multimodal';
import { GoogleGenAI } from '@google/genai';

interface CanvasProps {
  artifact: Artifact | null;
  onClose: () => void;
}

export function Canvas({ artifact, onClose }: CanvasProps) {
  const history = useHistory(artifact?.content || '');
  const content = history.value;
  const setContent = history.push;
  
  
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAiMenu, setShowAiMenu] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'audio' | 'video' | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (artifact) {
      setContent(artifact.content);
      setMediaUrl(null);
      setMediaType(null);
    }
  }, [artifact]);

  if (!artifact) return null;

  const handleSave = async () => {
    setIsSaving(true);
    const updatedArtifact = { ...artifact, content };
    await storage.saveArtifact(updatedArtifact);
    setIsSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  useKeyboardShortcuts({
    'cmd+z': history.undo,
    'cmd+shift+z': history.redo,
    'cmd+s': handleSave
  });

  const handleAiAction = async (action: string) => {
    setShowAiMenu(false);
    setIsProcessing(true);
    try {
      if (action === 'tts') {
        const audio = await multimodal.textToSpeech(content.substring(0, 500)); // Limit for TTS
        if (audio) {
          setMediaUrl(audio);
          setMediaType('audio');
        }
      } else if (action === 'song') {
        const song = await multimodal.generateMusic(`Create a song about: ${content.substring(0, 200)}`);
        if (song) {
          setMediaUrl(song);
          setMediaType('audio');
        }
      } else if (action === 'video') {
        const video = await multimodal.generateVideo(`A visual representation of: ${content.substring(0, 100)}`);
        if (video) {
          setMediaUrl(video);
          setMediaType('video');
        }
      } else if (['rewrite', 'summarize', 'code'].includes(action)) {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
        let prompt = '';
        if (action === 'rewrite') {
          prompt = `Rewrite the following text to be more engaging, professional, and clear. Improve the flow and vocabulary while maintaining the original meaning:\n\n${content}`;
        } else if (action === 'summarize') {
          prompt = `Provide a concise and comprehensive summary of the following text, highlighting the key points and main takeaways:\n\n${content}`;
        } else if (action === 'code') {
          prompt = `Based on the following description or existing code, generate or improve the code. Ensure it follows best practices, is well-documented, and is production-ready. Return ONLY the code, without markdown formatting blocks if possible, or ensure it's clean:\n\n${content}`;
        }
          
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-pro-preview',
          contents: prompt
        });
        
        if (response.text) {
          let newContent = response.text;
          if (action === 'code' && newContent.startsWith('```')) {
            newContent = newContent.replace(/```[a-z]*\n/, '').replace(/\n```$/, '');
          }
          setContent(newContent);
        }
      }
    } catch (e) {
      console.error(`AI Action ${action} failed:`, e);
      alert(`Failed to perform AI action: ${e}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-1/2 h-full bg-white dark:bg-[#1e1f20] border-l border-gray-200 dark:border-gray-800 flex flex-col shadow-xl z-10">
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2 text-gray-800 dark:text-gray-200">
          {artifact.type === 'code' && <Code size={20} />}
          {artifact.type === 'text' && <FileText size={20} />}
          {artifact.type === 'research' && <Search size={20} />}
          <h2 className="font-medium truncate max-w-[200px]">{artifact.title}</h2>
        </div>
        <div className="flex items-center gap-2 relative">
          
          <div className="flex items-center gap-1 mr-2 border-r border-gray-200 dark:border-gray-700 pr-2">
            <button onClick={history.undo} disabled={!history.canUndo} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md disabled:opacity-30" title="Undo (Cmd+Z)"><Undo size={16} /></button>
            <button onClick={history.redo} disabled={!history.canRedo} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md disabled:opacity-30" title="Redo (Cmd+Shift+Z)"><Redo size={16} /></button>
            <button onClick={() => exportArtifact(artifact, 'txt')} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md" title="Export"><Download size={16} /></button>
            <button onClick={() => clipboard.copyAsMarkdown(content, artifact?.title || 'artifact')} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md" title="Copy"><Copy size={16} /></button>
          </div>
          <div className="relative">
            <button 
              onClick={() => setShowAiMenu(!showAiMenu)}
              disabled={isProcessing}
              className="p-1.5 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-md transition-colors flex items-center gap-1"
              title="AI Actions"
            >
              <Wand2 size={18} className={isProcessing ? "animate-pulse" : ""} />
            </button>
            
            {showAiMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-[#2a2b2c] border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-20">
                <button onClick={() => handleAiAction('rewrite')} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2">
                  <RefreshCw size={14} /> Rewrite
                </button>
                <button onClick={() => handleAiAction('summarize')} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2">
                  <AlignLeft size={14} /> Summarize
                </button>
                <button onClick={() => handleAiAction('code')} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2">
                  <Terminal size={14} /> Generate Code
                </button>
                <div className="h-px bg-gray-200 dark:bg-gray-700 my-1"></div>
                <button onClick={() => handleAiAction('tts')} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2">
                  <Volume2 size={14} /> Read Aloud
                </button>
                <button onClick={() => handleAiAction('song')} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2">
                  <Music size={14} /> Turn into Song
                </button>
                <button onClick={() => handleAiAction('video')} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2">
                  <Video size={14} /> Generate Trailer
                </button>
              </div>
            )}
          </div>
          
          <button 
            onClick={handleSave} 
            disabled={isSaving || isProcessing}
            className={`px-3 py-1.5 text-sm text-white rounded-md flex items-center gap-1 transition-colors ${saved ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {saved ? <><Check size={16} /> Saved</> : (isSaving ? 'Saving...' : 'Save')}
          </button>
          <button onClick={onClose} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md">
            <X size={20} />
          </button>
        </div>
      </div>
      
      {mediaUrl && (
        <div className="p-4 bg-gray-100 dark:bg-[#2a2b2c] border-b border-gray-200 dark:border-gray-800 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {mediaType === 'audio' ? 'Audio Playback' : 'Video Playback'}
            </span>
            <button onClick={() => { setMediaUrl(null); setMediaType(null); }} className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 bg-white dark:bg-[#1e1f20] rounded-full shadow-sm">
              <X size={16} />
            </button>
          </div>
          <div className="flex justify-center bg-black/5 dark:bg-black/20 rounded-lg p-2">
            {mediaType === 'audio' ? (
              <audio ref={audioRef} src={mediaUrl} controls autoPlay className="w-full max-w-md h-12" />
            ) : (
              <video src={mediaUrl} controls autoPlay className="w-full max-w-md rounded-lg shadow-md" />
            )}
          </div>
        </div>
      )}

      <div className="flex-1 p-4 overflow-y-auto relative">
        {isProcessing && (
          <div className="absolute inset-0 bg-white/50 dark:bg-black/50 flex items-center justify-center z-10">
            <div className="bg-white dark:bg-[#2a2b2c] p-4 rounded-lg shadow-lg flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">AI is processing...</span>
            </div>
          </div>
        )}
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full h-full p-4 bg-gray-50 dark:bg-[#131314] text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-800 rounded-lg font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}
