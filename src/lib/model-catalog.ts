// Curated catalog of Gemini model IDs grouped by capability.
//
// Source: Documents/06_SDK_GROUNDING_REPORT_2026-04-13.md
// These IDs are the currently LIVE preview endpoints as of 2026-04-13. Google
// rotates preview aliases aggressively — when a model is deprecated or a new
// preview is announced in the Gemini API changelog
// (https://ai.google.dev/gemini-api/docs/changelog), update the entries below
// and re-run the Settings dropdown smoke tests.
//
// This module is intentionally self-contained (no imports from src/types.ts)
// so the Settings UI and any ambient helpers can consume it without pulling in
// the rest of the type graph.

export type ModelOption = {
  id: string;
  label: string;
  description?: string;
};

export const MODEL_CATALOG = {
  text: [
    {
      id: 'gemini-3.1-pro-preview',
      label: 'Gemini 3.1 Pro',
      description: 'Highest quality chat / reasoning',
    },
    {
      id: 'gemini-3.1-flash-preview',
      label: 'Gemini 3.1 Flash',
      description: 'Fast default',
    },
    {
      id: 'gemini-3.1-flash-lite-preview',
      label: 'Gemini 3.1 Flash Lite',
      description: 'Cheapest fallback',
    },
  ],
  imagePro: [
    {
      id: 'gemini-3-pro-image-preview',
      label: 'Gemini 3 Pro Image',
      description: 'Nano Banana Pro — highest fidelity image generation',
    },
  ],
  imageFlash: [
    {
      id: 'gemini-3.1-flash-image-preview',
      label: 'Gemini 3.1 Flash Image',
      description: 'Nano Banana 2 — fast image generation',
    },
  ],
  video: [
    {
      id: 'veo-3.1-lite-generate-preview',
      label: 'Veo 3.1 Lite',
      description: 'Fast, lower-cost video generation',
    },
    {
      id: 'veo-3.1-generate-preview',
      label: 'Veo 3.1',
      description: 'Higher quality video generation',
    },
  ],
  music: [
    {
      id: 'lyria-3-clip-preview',
      label: 'Lyria 3 Clip',
      description: 'Short-form music clip generation',
    },
  ],
  tts: [
    {
      id: 'gemini-2.5-flash-preview-tts',
      label: 'Gemini 2.5 Flash TTS',
      description: 'Text-to-speech synthesis',
    },
  ],
  liveAudio: [
    {
      id: 'gemini-3.1-flash-live-preview',
      label: 'Gemini 3.1 Flash Live',
      description: 'Audio-to-audio live conversation',
    },
    {
      id: 'gemini-2.5-flash-native-audio-preview-09-2025',
      label: 'Gemini 2.5 Flash Native Audio',
      description: 'Native audio input/output (legacy preview)',
    },
  ],
} as const satisfies Record<string, readonly ModelOption[]>;

export const DEFAULT_MODEL_IDS = {
  text: 'gemini-3.1-pro-preview',
  textFallback: 'gemini-3.1-flash-lite-preview',
  imagePro: 'gemini-3-pro-image-preview',
  imageFlash: 'gemini-3.1-flash-image-preview',
  video: 'veo-3.1-lite-generate-preview',
  music: 'lyria-3-clip-preview',
  tts: 'gemini-2.5-flash-preview-tts',
  liveAudio: 'gemini-2.5-flash-native-audio-preview-09-2025',
} as const;
