/**
 * LiveSession — Gemini Live API session manager for GEMINI for macOS.
 *
 * Ported from RAGBOT3000 (services/liveService.ts) per Plan v3 Phase 7.
 * Four adaptations applied vs. the RAGBOT3000 source:
 *
 *   1. API key source — RAGBOT3000 reads `process.env.API_KEY` at module load.
 *      Here we use a lazy `getLiveAI()` helper that imports `getAI` from
 *      `./api-config`. No top-level GoogleGenAI instance is constructed.
 *
 *   2. Model ID — RAGBOT3000 hardcodes
 *      `gemini-2.5-flash-native-audio-preview-09-2025`. Here the model is
 *      an optional parameter on `connect()` defaulting to
 *      `'gemini-3.1-flash-live-preview'`. Call sites pass
 *      `settings.models.liveAudio`.
 *
 *   3. System instruction — RAGBOT3000 hardcodes a "Legacy" persona and pulls
 *      memory from `memoryManager`. Here we expose a pure
 *      `buildSystemInstruction(...)` function that assembles instruction text
 *      from `gemInstruction`, `personalIntelligence`, and `contextLine`.
 *      Call sites (Wave 2/3) provide the pieces.
 *
 *   4. Memory hook — RAGBOT3000 calls `memoryManager.upsertSession` inside
 *      the class. Here we expose an `onSessionEnd` callback that the caller
 *      provides; the caller (a component in Wave 2) persists the transcript
 *      as a `type: 'live-session'` Message on the active thread.
 *
 * See: Documents/09_IMPLEMENTATION_PLAN_V3_2026-04-13.md §Phase 7.
 */

import { GoogleGenAI, type LiveServerMessage, Modality } from '@google/genai';
import { getAI } from './api-config';

// --- Adaptation #1: lazy AI client ------------------------------------------
let _liveAIPromise: Promise<GoogleGenAI> | null = null;
async function getLiveAI(): Promise<GoogleGenAI> {
  if (!_liveAIPromise) {
    _liveAIPromise = getAI();
  }
  return _liveAIPromise;
}

// --- Adaptation #2: default model id ----------------------------------------
// Use the proven RAGBOT3000 model. `gemini-3.1-flash-live-preview` was tried
// first and the server accepted the WebSocket upgrade then immediately closed
// (likely a model-id mismatch). The 2.5 native-audio model is the one the
// RAGBOT3000 source ships with and is verified working.
export const DEFAULT_LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-09-2025';

// --- Adaptation #3: system instruction builder ------------------------------
export interface PersonalIntelligence {
  preferences: string;
  instructions: string;
}

export interface BuildSystemInstructionInput {
  gemInstruction?: string;
  personalIntelligence?: PersonalIntelligence;
  contextLine?: string;
}

/**
 * Assemble a Live session system instruction from the caller-supplied
 * pieces. Any missing field is silently omitted; an empty input returns a
 * minimal helpful-assistant baseline so the Live API always has something.
 */
export function buildSystemInstruction(input: BuildSystemInstructionInput = {}): string {
  const sections: string[] = [];

  if (input.gemInstruction && input.gemInstruction.trim().length > 0) {
    sections.push(input.gemInstruction.trim());
  }

  if (input.personalIntelligence) {
    const { preferences, instructions } = input.personalIntelligence;
    const pieces: string[] = [];
    if (preferences && preferences.trim().length > 0) {
      pieces.push(`## User Preferences\n${preferences.trim()}`);
    }
    if (instructions && instructions.trim().length > 0) {
      pieces.push(`## Standing Instructions\n${instructions.trim()}`);
    }
    if (pieces.length > 0) {
      sections.push(pieces.join('\n\n'));
    }
  }

  if (input.contextLine && input.contextLine.trim().length > 0) {
    sections.push(`## Context\n${input.contextLine.trim()}`);
  }

  if (sections.length === 0) {
    return 'You are a helpful live voice assistant. Keep answers concise and helpful.';
  }

  return sections.join('\n\n');
}

// --- Supporting types -------------------------------------------------------
type RealtimeInput = {
  media: {
    mimeType: string;
    data: string;
  };
};

type GeminiLiveSession = {
  sendRealtimeInput: (input: RealtimeInput) => void;
  close?: () => void;
  interrupt?: () => void;
};

// State machine for session lifecycle
export type LiveSessionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnecting';

// Typed error system
export type LiveSessionError =
  | { type: 'permission_denied'; device: 'microphone' | 'camera' | 'screen' }
  | { type: 'network_error'; retrying: boolean; attempt: number; message?: string }
  | { type: 'api_error'; message: string }
  | { type: 'audio_context_error'; message: string };

export interface LiveSessionConnectParams {
  /** Optional pre-acquired microphone stream. */
  externalStream?: MediaStream;
  /** Optional pre-built system instruction (see {@link buildSystemInstruction}). */
  systemInstruction?: string;
  /** Model id override; defaults to {@link DEFAULT_LIVE_MODEL}. */
  model?: string;
  /** Voice name (pre-built Gemini voice) for speech output. */
  voiceName?: string;
}

export interface LiveSessionCallbacks {
  onMessage: (text: string) => void;
  onAudioData: (base64: string) => void;
  onError?: (error: LiveSessionError) => void;
  onStatusChange?: (status: LiveSessionState) => void;
  /**
   * Adaptation #4 — invoked once per session end with the assembled
   * transcript and optional metadata. Callers typically append a Message
   * with `type: 'live-session'` to the active thread.
   */
  onSessionEnd?: (transcript: string, metadata: Record<string, unknown>) => void;
}

export class LiveSession {
  // State management
  private state: LiveSessionState = 'idle';

  // Audio contexts and nodes
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private outputNode: GainNode | null = null;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private suppressOutputUntilMs = 0;
  private lastOutputAtMs = 0;

  // Session management
  private activeSession: Promise<GeminiLiveSession> | null = null;
  private stream: MediaStream | null = null;
  private abortController: AbortController | null = null;

  // Reconnection management
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start at 1s, max 30s
  private isIntentionalDisconnect = false;
  private reconnectTimeout: number | null = null;
  // True once we've received at least one server message in the current
  // session. Used to distinguish a real working connection from an
  // accept-then-immediately-close handshake (which would otherwise loop forever
  // because onopen would keep resetting reconnectAttempts to 0).
  private hasReceivedFirstMessage = false;

  // Video
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private videoInterval: number | null = null;
  private videoStream: MediaStream | null = null;

  // Transcript (for the onSessionEnd hook)
  private transcriptBuffer: string[] = [];
  private sessionStartedAt: number | null = null;

  // Last-used connect params (so reconnect can reuse model + instruction)
  private lastConnectParams: LiveSessionConnectParams = {};

  constructor(private callbacks: LiveSessionCallbacks) {}

  /** Get current connection state */
  getState(): LiveSessionState {
    return this.state;
  }

  /** Check if session is currently connected */
  isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Whether the agent currently has audio playing/queued locally.
   * Used for barge-in interruption.
   */
  isSpeaking(): boolean {
    return this.sources.size > 0;
  }

  /**
   * Consider the agent "speaking" for a short grace window after the most
   * recent output chunk. Avoids missing barge-in during chunk gaps.
   */
  isSpeakingOrRecently(graceMs: number = 1200): boolean {
    if (this.isSpeaking()) return true;
    return Date.now() - this.lastOutputAtMs < graceMs;
  }

  /**
   * Interrupt agent speech (barge-in): stop local playback immediately and
   * suppress new audio chunks for a short window.
   */
  interrupt(options?: { suppressMs?: number }) {
    const suppressMs = options?.suppressMs ?? 1200;
    this.suppressOutputUntilMs = Date.now() + suppressMs;

    // Stop all currently scheduled/playing audio immediately.
    this.sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* swallow */
      }
    });
    this.sources.clear();

    // Reset scheduling so we don't "resume" old queued audio.
    this.nextStartTime = 0;

    // Best-effort: if the underlying session supports an interrupt API, call it.
    this.activeSession
      ?.then((session) => {
        try {
          session.interrupt?.();
        } catch {
          /* swallow */
        }
      })
      .catch(() => {
        /* swallow */
      });
  }

  /**
   * Connect to Gemini Live API with robustness features.
   *
   * Adaptations applied here:
   *   #1 uses `getLiveAI()` (not a module-level `genAI` constant)
   *   #2 model id is `params.model ?? DEFAULT_LIVE_MODEL`
   *   #3 system instruction is pre-built by the caller
   */
  async connect(params: LiveSessionConnectParams = {}) {
    // State machine guard
    if (this.state !== 'idle' && this.state !== 'reconnecting') {
      console.warn(`Cannot connect: state is ${this.state}`);
      return;
    }

    // Remember params for reconnect
    this.lastConnectParams = params;

    // Abort any pending operations
    this.abortController?.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Update state
    const wasReconnecting = this.state === 'reconnecting';
    this.state = wasReconnecting ? 'reconnecting' : 'connecting';
    this.callbacks.onStatusChange?.(this.state);

    if (this.sessionStartedAt === null) {
      this.sessionStartedAt = Date.now();
    }

    try {
      // Check abort before async operations
      if (signal.aborted) return;

      // Use external stream or create new one
      this.stream =
        params.externalStream || (await navigator.mediaDevices.getUserMedia({ audio: true }));

      if (signal.aborted) {
        this.stream.getTracks().forEach((t) => {
          t.stop();
        });
        return;
      }

      // Input context for sending audio to Gemini (16kHz)
      const WebkitAudioContext = (
        window as unknown as { webkitAudioContext?: typeof AudioContext }
      ).webkitAudioContext;
      const AudioContextCtor = window.AudioContext ?? WebkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error('AudioContext is not available in this browser.');
      }
      this.inputAudioContext = new AudioContextCtor({ sampleRate: 16000 });

      // Output context for playing Gemini's response (24kHz)
      this.outputAudioContext = new AudioContextCtor({ sampleRate: 24000 });
      this.outputNode = this.outputAudioContext.createGain();
      this.outputNode.connect(this.outputAudioContext.destination);
      this.nextStartTime = 0;

      if (signal.aborted) return;

      // Adaptation #3: system instruction is provided by the caller.
      const finalInstruction =
        params.systemInstruction && params.systemInstruction.trim().length > 0
          ? params.systemInstruction
          : buildSystemInstruction();

      // Adaptation #1: lazy AI client
      const genAI = await getLiveAI();

      // Adaptation #2: parameterized model id
      const model = params.model ?? DEFAULT_LIVE_MODEL;

      const speechConfig = params.voiceName
        ? { voiceConfig: { prebuiltVoiceConfig: { voiceName: params.voiceName } } }
        : undefined;

      // Connect to Gemini Live
      const sessionPromise = genAI.live.connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          ...(speechConfig ? { speechConfig } : {}),
          systemInstruction: finalInstruction,
        },
        callbacks: {
          onopen: () => {
            if (signal.aborted) return;

            console.log('Live session connected');
            this.state = 'connected';
            // Do NOT reset reconnectAttempts here — the server may accept the
            // WebSocket upgrade then immediately close (e.g. bad model id).
            // We reset the counter only after the first real server message
            // arrives in onmessage, which proves the session is alive.
            this.hasReceivedFirstMessage = false;
            this.callbacks.onStatusChange?.(this.state);

            // Initialize audio input (with fallback)
            const stream = this.stream;
            if (!stream) return;
            this.initAudioInput(stream, sessionPromise as Promise<GeminiLiveSession>).catch(
              (err: unknown) => {
                const msg = err instanceof Error ? err.message : String(err);
                console.error('Audio input initialization failed:', err);
                this.callbacks.onError?.({ type: 'audio_context_error', message: msg });
              },
            );
          },
          onmessage: async (message: LiveServerMessage) => {
            if (signal.aborted || this.state !== 'connected') return;
            if (!this.hasReceivedFirstMessage) {
              this.hasReceivedFirstMessage = true;
              this.reconnectAttempts = 0; // Real session — reset retry counter
            }

            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              // If we've recently interrupted, drop output chunks for a short window.
              if (Date.now() < this.suppressOutputUntilMs) return;
              this.playAudioChunk(base64Audio);
              this.callbacks.onAudioData(base64Audio);
            }

            // Handle Text/Transcript Output (if available)
            const modelText = message.serverContent?.modelTurn?.parts?.[0]?.text;
            if (modelText) {
              this.callbacks.onMessage(modelText);
              this.transcriptBuffer.push(`Assistant: ${modelText}`);
            }
          },
          onclose: () => {
            console.log('Live session closed');

            // Only attempt reconnect if not intentional and not already disconnecting/idle
            if (
              !this.isIntentionalDisconnect &&
              this.state !== 'disconnecting' &&
              this.state !== 'idle' &&
              this.state === 'connected'
            ) {
              this.attemptReconnect();
            } else {
              // Intentional disconnect or already disconnecting - just update state
              if (this.state !== 'idle') {
                this.state = 'idle';
                this.callbacks.onStatusChange?.(this.state);
              }
            }
          },
          onerror: (err) => {
            console.error('Live session error', err);

            // Don't show errors or reconnect if this is an intentional disconnect
            if (this.isIntentionalDisconnect || this.state === 'disconnecting') {
              this.state = 'idle';
              this.callbacks.onStatusChange?.(this.state);
              return;
            }

            const errorMessage = err instanceof Error ? err.message : String(err);
            this.callbacks.onError?.({
              type: 'api_error',
              message: errorMessage,
            });

            // Attempt reconnect on error if not intentional and still connected
            if (this.state === 'connected') {
              this.attemptReconnect();
            } else {
              this.state = 'idle';
              this.callbacks.onStatusChange?.(this.state);
            }
          },
        },
      });

      this.activeSession = sessionPromise as Promise<GeminiLiveSession>;
      return sessionPromise as Promise<GeminiLiveSession>;
    } catch (err: unknown) {
      // Handle permission errors
      if (
        err instanceof Error &&
        (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
      ) {
        this.callbacks.onError?.({ type: 'permission_denied', device: 'microphone' });
      } else {
        this.callbacks.onError?.({
          type: 'api_error',
          message: err instanceof Error ? err.message : 'Connection failed',
        });
      }

      this.state = 'idle';
      this.callbacks.onStatusChange?.(this.state);
      throw err;
    }
  }

  /**
   * Attempt reconnection with exponential backoff (1s * 2^n, 30s cap, 5 attempts).
   */
  private async attemptReconnect() {
    // Don't reconnect if intentionally disconnected or already disconnecting
    if (
      this.isIntentionalDisconnect ||
      this.state === 'disconnecting' ||
      this.state === 'idle'
    ) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.callbacks.onError?.({
        type: 'network_error',
        retrying: false,
        attempt: this.reconnectAttempts,
        message: 'Connection lost. Please try again.',
      });
      this.state = 'idle';
      this.callbacks.onStatusChange?.(this.state);
      return;
    }

    this.state = 'reconnecting';
    this.callbacks.onStatusChange?.(this.state);

    const delay = Math.min(
      this.reconnectDelay * 2 ** this.reconnectAttempts,
      30000, // Max 30 seconds
    );
    this.reconnectAttempts++;

    this.callbacks.onError?.({
      type: 'network_error',
      retrying: true,
      attempt: this.reconnectAttempts,
      message: `Reconnecting (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`,
    });

    this.reconnectTimeout = window.setTimeout(async () => {
      // Double-check before attempting reconnect (user might have disconnected)
      if (
        this.isIntentionalDisconnect ||
        this.state === 'disconnecting' ||
        this.state === 'idle'
      ) {
        return;
      }

      try {
        await this.connect({
          ...this.lastConnectParams,
          externalStream: this.stream || undefined,
        });
      } catch (err) {
        // Will trigger another reconnect attempt via onerror handler (if not intentional)
        if (!this.isIntentionalDisconnect) {
          console.error('Reconnection attempt failed:', err);
        }
      }
    }, delay);
  }

  /**
   * Initialize audio input with AudioWorklet (modern) or fallback to ScriptProcessor.
   */
  private async initAudioInput(stream: MediaStream, sessionPromise: Promise<GeminiLiveSession>) {
    if (!this.inputAudioContext) return;

    // Try AudioWorklet first (modern approach)
    if (this.inputAudioContext.audioWorklet) {
      try {
        await this.startAudioInputModern(stream, sessionPromise);
        return;
      } catch (err) {
        console.warn('AudioWorklet failed, falling back to ScriptProcessor:', err);
        // Fall through to legacy method
      }
    }

    // Fallback to ScriptProcessor (legacy, deprecated but widely supported)
    this.startAudioInputLegacy(stream, sessionPromise);
  }

  /** Modern AudioWorklet-based audio input processing */
  private async startAudioInputModern(
    stream: MediaStream,
    sessionPromise: Promise<GeminiLiveSession>,
  ) {
    const inputCtx = this.inputAudioContext;
    if (!inputCtx) return;

    // Load the worklet module
    await inputCtx.audioWorklet.addModule('/audio/pcm-processor.worklet.js');

    // Create source and worklet node
    this.inputSource = inputCtx.createMediaStreamSource(stream);
    this.workletNode = new AudioWorkletNode(inputCtx, 'pcm-processor');

    // Handle messages from worklet
    this.workletNode.port.onmessage = (e) => {
      if (this.state !== 'connected' || this.abortController?.signal.aborted) return;

      const pcmData = e.data.pcmData as Int16Array;
      const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));

      sessionPromise
        .then((session) => {
          if (this.state === 'connected' && session) {
            try {
              session.sendRealtimeInput({
                media: {
                  mimeType: 'audio/pcm;rate=16000',
                  data: base64Data,
                },
              });
            } catch (err) {
              // Silently handle send errors (connection may be closing)
              if (this.state === 'connected') {
                console.warn('Failed to send audio chunk:', err);
              }
            }
          }
        })
        .catch(() => {
          /* swallow */
        });
    };

    // Connect the audio graph
    this.inputSource.connect(this.workletNode);
  }

  /** Legacy ScriptProcessor-based audio input processing (fallback) */
  private startAudioInputLegacy(
    stream: MediaStream,
    sessionPromise: Promise<GeminiLiveSession>,
  ) {
    if (!this.inputAudioContext) return;

    this.inputSource = this.inputAudioContext.createMediaStreamSource(stream);
    this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      if (this.state !== 'connected' || this.abortController?.signal.aborted) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const pcmData = this.float32ToInt16(inputData);
      const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));

      sessionPromise
        .then((session) => {
          if (this.state === 'connected' && session) {
            try {
              session.sendRealtimeInput({
                media: {
                  mimeType: 'audio/pcm;rate=16000',
                  data: base64Data,
                },
              });
            } catch (err) {
              if (this.state === 'connected') {
                console.warn('Failed to send audio chunk:', err);
              }
            }
          }
        })
        .catch(() => {
          /* swallow */
        });
    };

    this.inputSource.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  private async playAudioChunk(base64: string) {
    if (!this.outputAudioContext || !this.outputNode || this.state !== 'connected') return;
    if (Date.now() < this.suppressOutputUntilMs) return;

    try {
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const audioBuffer = await this.decodePCM(bytes, this.outputAudioContext);

      // Ensure proper timing - don't let chunks overlap
      const currentTime = this.outputAudioContext.currentTime;
      if (this.nextStartTime < currentTime) {
        this.nextStartTime = currentTime;
      }

      const source = this.outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputNode);
      source.start(this.nextStartTime);

      // Track output activity for barge-in gating (covers chunk gaps).
      this.lastOutputAtMs = Date.now();

      this.nextStartTime += audioBuffer.duration;

      source.onended = () => this.sources.delete(source);
      this.sources.add(source);
    } catch (err) {
      console.error('Error playing audio chunk:', err);
    }
  }

  private async decodePCM(data: Uint8Array, ctx: AudioContext): Promise<AudioBuffer> {
    const int16Data = new Int16Array(data.buffer);
    const float32Data = new Float32Array(int16Data.length);
    for (let i = 0; i < int16Data.length; i++) {
      float32Data[i] = int16Data[i] / 32768.0;
    }

    const buffer = ctx.createBuffer(1, float32Data.length, 24000);
    buffer.getChannelData(0).set(float32Data);
    return buffer;
  }

  private float32ToInt16(float32: Float32Array): Int16Array {
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16;
  }

  // --- Video Streaming ------------------------------------------------------
  public startVideoStream(stream: MediaStream) {
    if (this.state !== 'connected' || !this.activeSession) return;
    this.videoStream = stream;

    this.videoElement = document.createElement('video');
    this.videoElement.srcObject = stream;
    this.videoElement.autoplay = true;
    this.videoElement.play();
    this.videoElement.muted = true; // prevent feedback loop if audio is included

    this.canvasElement = document.createElement('canvas');
    const ctx = this.canvasElement.getContext('2d');
    if (!ctx) return;

    // Send a frame every 500ms (2 FPS)
    this.videoInterval = window.setInterval(async () => {
      if (!this.videoElement || !this.canvasElement || !ctx || this.state !== 'connected') return;

      if (this.videoElement.readyState === this.videoElement.HAVE_ENOUGH_DATA) {
        this.canvasElement.width = this.videoElement.videoWidth;
        this.canvasElement.height = this.videoElement.videoHeight;
        ctx.drawImage(this.videoElement, 0, 0);

        const base64Data = this.canvasElement.toDataURL('image/jpeg', 0.7).split(',')[1];

        this.activeSession
          ?.then((session) => {
            if (this.state === 'connected' && session) {
              try {
                session.sendRealtimeInput({
                  media: {
                    mimeType: 'image/jpeg',
                    data: base64Data,
                  },
                });
              } catch (err) {
                if (this.state === 'connected') {
                  console.warn('Failed to send video frame:', err);
                }
              }
            }
          })
          .catch(() => {
            /* swallow */
          });
      }
    }, 500);
  }

  public stopVideoStream() {
    if (this.videoInterval) {
      clearInterval(this.videoInterval);
      this.videoInterval = null;
    }
    if (this.videoStream) {
      this.videoStream.getTracks().forEach((track) => {
        track.stop();
      });
      this.videoStream = null;
    }
    this.videoElement = null;
    this.canvasElement = null;
  }

  /**
   * Disconnect from session with proper cleanup.
   *
   * Adaptation #4: fires `onSessionEnd(transcript, metadata)` so the caller
   * can persist the transcript as a live-session message on the active thread.
   */
  disconnect() {
    // Mark as intentional FIRST to prevent any reconnection attempts
    this.isIntentionalDisconnect = true;

    // Cancel any pending reconnection immediately
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Reset reconnect attempts to prevent any messages
    this.reconnectAttempts = 0;

    // Abort any pending operations
    this.abortController?.abort();

    // Update state
    if (this.state !== 'idle' && this.state !== 'disconnecting') {
      this.state = 'disconnecting';
      this.callbacks.onStatusChange?.(this.state);
    }

    // Stop video stream if active
    this.stopVideoStream();

    // Stop all playing audio immediately
    this.sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* swallow */
      }
    });
    this.sources.clear();

    // Clean up audio processing nodes
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.inputSource) {
      this.inputSource.disconnect();
      this.inputSource = null;
    }

    // Close audio contexts
    if (this.inputAudioContext) {
      this.inputAudioContext.close().catch(() => {
        /* swallow */
      });
      this.inputAudioContext = null;
    }
    if (this.outputAudioContext) {
      this.outputAudioContext.close().catch(() => {
        /* swallow */
      });
      this.outputAudioContext = null;
    }

    // Close Gemini session
    if (this.activeSession) {
      this.activeSession
        .then((s) => {
          try {
            s.close?.();
          } catch {
            /* swallow */
          }
        })
        .catch(() => {
          /* swallow */
        });
      this.activeSession = null;
    }

    // Adaptation #4: emit the transcript before clearing state.
    try {
      const transcript = this.transcriptBuffer.join('\n');
      if (transcript.length > 0 && this.callbacks.onSessionEnd) {
        const startedAt = this.sessionStartedAt ?? Date.now();
        const endedAt = Date.now();
        this.callbacks.onSessionEnd(transcript, {
          startedAt,
          endedAt,
          durationMs: endedAt - startedAt,
          turns: this.transcriptBuffer.length,
          model: this.lastConnectParams.model ?? DEFAULT_LIVE_MODEL,
        });
      }
    } catch (err) {
      console.error('onSessionEnd callback failed:', err);
    }
    this.transcriptBuffer = [];
    this.sessionStartedAt = null;

    // Reset state
    this.state = 'idle';
    this.isIntentionalDisconnect = false;
    this.reconnectAttempts = 0;
    this.callbacks.onStatusChange?.(this.state);
  }
}
