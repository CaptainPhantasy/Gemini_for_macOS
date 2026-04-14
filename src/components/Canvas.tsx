import { useState, useEffect, useRef } from 'react';
import { useHistory } from '../lib/useHistory';
import { useKeyboardShortcuts } from '../lib/useKeyboardShortcuts';
import { exportArtifact } from '../lib/export';
import { clipboard } from '../lib/clipboard';
import { Artifact, AppSettings } from '../types';
import {
  X,
  Code,
  FileText,
  Search,
  Check,
  Wand2,
  Volume2,
  Music,
  Video,
  RefreshCw,
  AlignLeft,
  Terminal,
  Download,
  Copy,
  Undo,
  Redo,
  Image as ImageIcon,
} from 'lucide-react';
import { storage } from '../lib/storage';
import { multimodal } from '../lib/multimodal';
import { getAI } from '../lib/api-config';
import { costLedger } from '../lib/cost-ledger';
import { mediaStore, dataUriToBlob, blobToObjectUrl } from '../lib/media-store';

interface CanvasProps {
  artifact: Artifact | null;
  onClose: () => void;
  settings?: AppSettings;
}

type MediaArtifactType = 'audio' | 'video' | 'image';

const DEFAULT_TEXT_MODEL = 'gemini-3.1-pro-preview';

/**
 * Strip a model's prose preamble from a Rewrite/Code response by extracting the
 * contents of the first fenced code block, if any. Falls back to the raw text
 * when no fences are present.
 */
function stripFencedPreamble(raw: string): string {
  if (!raw) return raw;
  const match = raw.match(/```\w*\n([\s\S]*?)```/);
  if (match && match[1] != null) {
    return match[1].trim();
  }
  return raw;
}

export function Canvas({ artifact, onClose, settings }: CanvasProps) {
  const history = useHistory(artifact?.content || '');
  const content = history.value;
  const setContent = history.push;

  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAiMenu, setShowAiMenu] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<MediaArtifactType | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (artifact) {
      setContent(artifact.content);
      // Revoke any previously-rendered object URL when switching artifacts.
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setMediaUrl(null);
      setMediaType(null);
    }
  }, [artifact]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

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
    'cmd+s': handleSave,
  });

  /**
   * Persist a freshly-generated media payload (data URI) to the IndexedDB
   * blob store, create a backing Artifact record via storage.saveArtifact,
   * and render the result in the Canvas media panel via an object URL.
   */
  const persistMediaArtifact = async (params: {
    dataUri: string;
    type: MediaArtifactType;
    title: string;
    prompt: string;
    model: string;
  }): Promise<void> => {
    const blob = await dataUriToBlob(params.dataUri);
    const blobKey = await mediaStore.save(blob);

    const newArtifact: Artifact = {
      id: crypto.randomUUID(),
      title: params.title,
      content: `${params.type} generated from prompt: ${params.prompt.substring(0, 120)}`,
      type: params.type,
      mimeType: blob.type,
      blobKey,
      metadata: {
        model: params.model,
        prompt: params.prompt,
        sizeBytes: blob.size,
        estimatedCostUsd: 0,
        durationSec: undefined,
      },
      createdAt: Date.now(),
    };

    await storage.saveArtifact(newArtifact);

    // Render the media in the Canvas panel using a fresh object URL.
    const objectUrl = blobToObjectUrl(blob);
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    objectUrlRef.current = objectUrl;
    setMediaUrl(objectUrl);
    setMediaType(params.type);
  };

  const handleAiAction = async (action: string) => {
    setShowAiMenu(false);
    setIsProcessing(true);
    try {
      const models = settings?.models;

      if (action === 'tts') {
        const audio = await multimodal.textToSpeech(
          content.substring(0, 500),
          models
        );
        if (audio) {
          await persistMediaArtifact({
            dataUri: audio,
            type: 'audio',
            title: `${artifact.title} — Read Aloud`,
            prompt: content.substring(0, 500),
            model: models?.tts ?? 'tts',
          });
        }
      } else if (action === 'song') {
        const prompt = `Create a song about: ${content.substring(0, 200)}`;
        const song = await multimodal.generateMusic(prompt, models);
        if (song) {
          await persistMediaArtifact({
            dataUri: song,
            type: 'audio',
            title: `${artifact.title} — Song`,
            prompt,
            model: models?.music ?? 'music',
          });
        }
      } else if (action === 'video') {
        const prompt = `A visual representation of: ${content.substring(0, 100)}`;
        const video = await multimodal.generateVideo(prompt, models);
        if (video) {
          // Veo can return either a data URI, a blob: URL, or an https URL.
          // Only persist via the blob store when we have a data URI we can decode.
          if (video.startsWith('data:')) {
            await persistMediaArtifact({
              dataUri: video,
              type: 'video',
              title: `${artifact.title} — Trailer`,
              prompt,
              model: models?.video ?? 'video',
            });
          } else {
            // Fallback: render directly without persisting (URL is opaque).
            if (objectUrlRef.current) {
              URL.revokeObjectURL(objectUrlRef.current);
              objectUrlRef.current = null;
            }
            setMediaUrl(video);
            setMediaType('video');
          }
        }
      } else if (action === 'image') {
        const seed = content.trim().length > 0
          ? content.substring(0, 400)
          : artifact.title;
        const prompt = `Create a vivid, high-detail illustration that visually represents the following content. Generate an image, not a text description:\n\n${seed}`;
        const image = await multimodal.generateImage(prompt, false, models);
        if (image) {
          await persistMediaArtifact({
            dataUri: image,
            type: 'image',
            title: `${artifact.title} — Image`,
            prompt,
            model: models?.imageFlash ?? 'image',
          });
        }
      } else if (['rewrite', 'summarize', 'code'].includes(action)) {
        const ai = await getAI();
        const textModel = models?.text ?? DEFAULT_TEXT_MODEL;

        let prompt = '';
        if (action === 'rewrite') {
          prompt = `Rewrite the following text to be more engaging, professional, and clear. Improve the flow and vocabulary while maintaining the original meaning. Return ONLY the rewritten text, with no preamble or explanation. If the input is code, return the rewritten code wrapped in a single fenced code block:\n\n${content}`;
        } else if (action === 'summarize') {
          prompt = `Provide a concise and comprehensive summary of the following text, highlighting the key points and main takeaways:\n\n${content}`;
        } else if (action === 'code') {
          prompt = `Based on the following description or existing code, generate or improve the code. Ensure it follows best practices, is well-documented, and is production-ready. Return ONLY the code, without markdown formatting blocks if possible, or ensure it's clean:\n\n${content}`;
        }

        const response = await ai.models.generateContent({
          model: textModel,
          contents: prompt,
        });

        // Cost ledger: record token usage for every successful text action.
        try {
          const usage = (response as { usageMetadata?: {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
            thoughtsTokenCount?: number;
          } }).usageMetadata;
          await costLedger.record({
            timestamp: Date.now(),
            model: textModel,
            capability: `canvas:${action}`,
            inputTokens: usage?.promptTokenCount ?? 0,
            outputTokens: usage?.candidatesTokenCount ?? 0,
            thinkingTokens: usage?.thoughtsTokenCount ?? 0,
          });
        } catch (ledgerErr) {
          // Cost recording must never block the user-facing action.
          console.warn('[Canvas] costLedger.record failed', ledgerErr);
        }

        if (response.text) {
          let newContent = response.text;
          if (action === 'rewrite') {
            // Bug #7: strip prose preamble when the model wraps output in fences.
            newContent = stripFencedPreamble(newContent);
          } else if (action === 'code' && newContent.startsWith('```')) {
            newContent = newContent
              .replace(/```[a-z]*\n/, '')
              .replace(/\n```$/, '');
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
          {artifact.type === 'image' && <ImageIcon size={20} />}
          {artifact.type === 'audio' && <Volume2 size={20} />}
          {artifact.type === 'video' && <Video size={20} />}
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
                <button onClick={() => handleAiAction('image')} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2">
                  <ImageIcon size={14} /> Generate Image
                </button>
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
              {mediaType === 'audio' && 'Audio Playback'}
              {mediaType === 'video' && 'Video Playback'}
              {mediaType === 'image' && 'Generated Image'}
            </span>
            <button
              onClick={() => {
                if (objectUrlRef.current) {
                  URL.revokeObjectURL(objectUrlRef.current);
                  objectUrlRef.current = null;
                }
                setMediaUrl(null);
                setMediaType(null);
              }}
              className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 bg-white dark:bg-[#1e1f20] rounded-full shadow-sm"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex justify-center bg-black/5 dark:bg-black/20 rounded-lg p-2">
            {mediaType === 'audio' && (
              <audio ref={audioRef} src={mediaUrl} controls autoPlay className="w-full max-w-md h-12" />
            )}
            {mediaType === 'video' && (
              <video src={mediaUrl} controls autoPlay className="w-full max-w-md rounded-lg shadow-md" />
            )}
            {mediaType === 'image' && (
              <img src={mediaUrl} alt="Generated" className="w-full max-w-md rounded-lg shadow-md" />
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
