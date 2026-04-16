/**
 * LiveSessionPanel — runtime panel for an active Gemini Live session.
 *
 * Wave 2 LiveMode rewrite. Owns:
 *   - a `LiveSession` instance (constructed with the callbacks-object form)
 *   - a `useMediaStream` hook tied to the session ref
 *   - a small AnalyserNode visualizer wired off the outgoing mic stream
 *   - a captions overlay fed by `onMessage`
 *   - mode-aware layout (voice / camera / screen)
 *
 * The video element is ALWAYS rendered when a video mode is active so that
 * `useMediaStream` can attach `srcObject` synchronously after `setupAudio()`
 * resolves. This kills the previous chicken-and-egg bug where the videoRef
 * was null at the moment `multimodal.startCameraStream(videoRef.current)`
 * was called.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, Captions, CaptionsOff, X, RefreshCw } from 'lucide-react';

import {
  LiveSession,
  DEFAULT_LIVE_MODEL,
  type LiveSessionState,
  type LiveSessionError,
} from '../lib/live-session';
import { useMediaStream } from '../hooks/useMediaStream';

import type { LiveModeKind } from './LiveChooser';

export interface LiveSessionPanelProps {
  mode: LiveModeKind;
  onClose: () => void;
  modelId?: string;
  systemInstruction?: string;
  captionsDefault?: boolean;
  voiceName?: string;
  enableVideo?: boolean;
  /**
   * Optional sink for transcript persistence. Passed straight through to
   * `LiveSession.onSessionEnd`.
   */
  onSessionEnd?: (transcript: string, metadata: Record<string, unknown>) => void;
}

interface ModeLayout {
  width: number;
  height: number;
  showVideo: boolean;
  defaultCaptions: boolean;
  title: string;
}

const LAYOUTS: Record<LiveModeKind, ModeLayout> = {
  voice: { width: 400, height: 500, showVideo: false, defaultCaptions: false, title: 'Voice' },
  camera: { width: 720, height: 640, showVideo: true, defaultCaptions: true, title: 'Camera' },
  screen: { width: 720, height: 640, showVideo: true, defaultCaptions: true, title: 'Screen' },
};

function statusLabel(state: LiveSessionState): string {
  switch (state) {
    case 'idle':
      return 'Idle';
    case 'connecting':
      return 'Connecting...';
    case 'connected':
      return 'Live';
    case 'reconnecting':
      return 'Reconnecting...';
    case 'disconnecting':
      return 'Ending...';
    default:
      return state;
  }
}

export function LiveSessionPanel({
  mode,
  onClose,
  modelId,
  systemInstruction,
  captionsDefault,
  voiceName,
  enableVideo = true,
  onSessionEnd,
}: LiveSessionPanelProps) {
  const layout = LAYOUTS[mode];
  const sessionRef = useRef<LiveSession | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const visualizerRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const [status, setStatus] = useState<LiveSessionState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [muted, setMuted] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(captionsDefault ?? layout.defaultCaptions);
  const videoEnabled = layout.showVideo && enableVideo;

  const media = useMediaStream(sessionRef, videoRef);
  const { setupAudio, startVideoSource, stopVideoSource, toggleCamera, streamRef, analyser } =
    media;

  // --- Construct the LiveSession instance once -----------------------------
  useEffect(() => {
    const session = new LiveSession({
      onMessage: (text) => {
        setTranscript((prev) => [...prev, text]);
      },
      onAudioData: () => {
        // Output audio is played by LiveSession internally; nothing to do here.
      },
      onError: (err: LiveSessionError) => {
        if (err.type === 'permission_denied') {
          setErrorMsg(`Permission denied for ${err.device}.`);
        } else if (err.type === 'network_error') {
          setErrorMsg(err.message ?? 'Network error.');
        } else if (err.type === 'audio_context_error') {
          setErrorMsg(`Audio error: ${err.message}`);
        } else {
          setErrorMsg(err.message);
        }
      },
      onStatusChange: (next) => {
        setStatus(next);
      },
      onSessionEnd,
    });
    sessionRef.current = session;

    return () => {
      try {
        session.disconnect();
      } catch {
        /* swallow */
      }
      sessionRef.current = null;
    };
    // We intentionally only construct the session once per mount; mode changes
    // unmount/remount the panel from the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Connect & start media ------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      const session = sessionRef.current;
      if (!session) return;

      const audioReady = await setupAudio();
      if (!audioReady) {
        setErrorMsg('Microphone permission denied.');
        return;
      }
      if (cancelled) return;

      try {
        await session.connect({
          externalStream: streamRef.current ?? undefined,
          systemInstruction,
          model: modelId ?? DEFAULT_LIVE_MODEL,
          voiceName,
        });
      } catch {
        // onError already sets the message
        return;
      }
      if (cancelled) return;

      if (mode === 'camera' || mode === 'screen') {
        const result = await startVideoSource(mode);
        if (!result.success && result.error) {
          setErrorMsg(result.error);
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
    };
    // setupAudio/startVideoSource are stable callbacks; depending on `mode` is
    // sufficient because the panel is remounted when mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // --- Audio visualizer (compositor-friendly canvas loop) -------------------
  useEffect(() => {
    const canvas = visualizerRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const buf = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      analyser.getByteFrequencyData(buf);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const bars = 32;
      const step = Math.floor(buf.length / bars);
      const barWidth = w / bars;
      for (let i = 0; i < bars; i++) {
        const v = buf[i * step] / 255;
        const barHeight = Math.max(2, v * h * 0.9);
        const x = i * barWidth;
        const y = (h - barHeight) / 2;
        ctx.fillStyle = `rgba(96,165,250,${0.4 + v * 0.6})`;
        ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [analyser]);

  // --- Mic mute toggle ------------------------------------------------------
  const handleToggleMute = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    setMuted(next);
  }, [muted, streamRef]);

  // --- End session ----------------------------------------------------------
  const handleEnd = useCallback(() => {
    try {
      stopVideoSource();
    } catch {
      /* swallow */
    }
    try {
      sessionRef.current?.disconnect();
    } catch {
      /* swallow */
    }
    onClose();
  }, [onClose, stopVideoSource]);

  const handleFlipCamera = useCallback(async () => {
    const result = await toggleCamera();
    if (!result.success && result.error) {
      setErrorMsg(result.error);
    }
  }, [toggleCamera]);

  const captionLines = useMemo(() => transcript.slice(-4), [transcript]);

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="live-panel-heading"
    >
      <div
        className="bg-[#1e1f20] rounded-2xl shadow-2xl border border-gray-800 flex flex-col overflow-hidden"
        style={{ width: layout.width, maxWidth: '95vw', height: layout.height, maxHeight: '90vh' }}
      >
        <header className="flex justify-between items-center p-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div
              className={`w-3 h-3 rounded-full ${
                status === 'connected'
                  ? 'bg-red-500 animate-pulse'
                  : status === 'reconnecting'
                    ? 'bg-amber-500 animate-pulse'
                    : 'bg-gray-500'
              }`}
              aria-hidden="true"
            />
            <h2 id="live-panel-heading" className="text-base font-semibold text-white">
              {layout.title} Live
            </h2>
            <span className="text-xs text-gray-400">{statusLabel(status)}</span>
          </div>
          <button
            type="button"
            onClick={handleEnd}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="End session"
          >
            <X size={20} />
          </button>
        </header>

        <div className="flex-1 bg-black relative flex items-center justify-center overflow-hidden">
          {/* ALWAYS render the video element when in a video mode so the
              ref is attached BEFORE useMediaStream tries to set srcObject. */}
          {videoEnabled && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain"
            />
          )}

          {!videoEnabled && (
            <div className="text-gray-500 flex flex-col items-center gap-2">
              <Mic size={48} />
              <p className="text-sm">Listening...</p>
            </div>
          )}

          {captionsOn && captionLines.length > 0 && (
            <div className="absolute bottom-20 left-4 right-4 bg-black/70 rounded-lg p-3 text-white text-sm space-y-1 max-h-32 overflow-y-auto">
              {captionLines.map((line, i) => (
                <p key={i} className="leading-snug">
                  {line}
                </p>
              ))}
            </div>
          )}

          {errorMsg && (
            <div className="absolute top-4 left-4 right-4 bg-red-900/80 border border-red-700 text-red-100 rounded-lg p-3 text-xs">
              {errorMsg}
            </div>
          )}
        </div>

        <div className="px-4 pt-2">
          <canvas ref={visualizerRef} width={400} height={48} className="w-full h-12" />
        </div>

        <footer className="p-4 border-t border-gray-800 flex justify-center gap-3">
          <button
            type="button"
            onClick={handleToggleMute}
            className={`p-3 rounded-full transition-colors ${
              muted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
            }`}
            aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
            aria-pressed={muted}
          >
            {muted ? (
              <MicOff size={20} className="text-white" />
            ) : (
              <Mic size={20} className="text-white" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setCaptionsOn((v) => !v)}
            className={`p-3 rounded-full transition-colors ${
              captionsOn ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-700 hover:bg-gray-600'
            }`}
            aria-label={captionsOn ? 'Hide captions' : 'Show captions'}
            aria-pressed={captionsOn}
          >
            {captionsOn ? (
              <Captions size={20} className="text-white" />
            ) : (
              <CaptionsOff size={20} className="text-white" />
            )}
          </button>

          {mode === 'camera' && (
            <button
              type="button"
              onClick={() => {
                void handleFlipCamera();
              }}
              className="p-3 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"
              aria-label="Flip camera"
            >
              <RefreshCw size={20} className="text-white" />
            </button>
          )}

          <button
            type="button"
            onClick={handleEnd}
            className="px-5 py-3 rounded-full bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
          >
            End
          </button>
        </footer>
      </div>
    </div>
  );
}

export default LiveSessionPanel;
