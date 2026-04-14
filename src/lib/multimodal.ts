import { Modality } from '@google/genai';
import { getAI, getApiKey } from './api-config';
import { costLedger } from './cost-ledger';
import { DEFAULT_MODEL_IDS } from './model-catalog';
import { logger } from './logger';

export type MultimodalModelOverrides = {
  imagePro?: string;
  imageFlash?: string;
  video?: string;
  music?: string;
  tts?: string;
};

type UsageMetadataLike = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
};

async function recordCost(params: {
  model: string;
  capability: string;
  usageMetadata?: UsageMetadataLike;
}): Promise<void> {
  try {
    await costLedger.record({
      timestamp: Date.now(),
      model: params.model,
      capability: params.capability,
      inputTokens: params.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: params.usageMetadata?.candidatesTokenCount ?? 0,
      thinkingTokens: params.usageMetadata?.thoughtsTokenCount ?? 0,
    });
  } catch (err) {
    logger.warn('[multimodal] costLedger.record failed', err);
  }
}

export const multimodal = {
  // Image Generation (Nano Banana 2 / Pro)
  generateImage: async (
    prompt: string,
    usePro: boolean = false,
    models?: MultimodalModelOverrides
  ): Promise<string | null> => {
    const ai = await getAI();
    const model = usePro
      ? models?.imagePro ?? DEFAULT_MODEL_IDS.imagePro
      : models?.imageFlash ?? DEFAULT_MODEL_IDS.imageFlash;
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
        imageConfig: {
          aspectRatio: '1:1',
          imageSize: '1K',
        },
      },
    });

    await recordCost({
      model,
      capability: 'image',
      usageMetadata: (response as any).usageMetadata,
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    return null;
  },

  // Video Generation (Veo)
  generateVideo: async (
    prompt: string,
    models?: MultimodalModelOverrides
  ): Promise<string | null> => {
    const ai = await getAI();
    const model = models?.video ?? DEFAULT_MODEL_IDS.video;
    const operation = await ai.models.generateVideos({
      model,
      prompt,
      config: {
        numberOfVideos: 1,
        resolution: '1080p',
        aspectRatio: '16:9',
      },
    });

    // Real polling implementation
    let currentOperation = operation;
    while (!currentOperation.done) {
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Poll every 5 seconds
      currentOperation = await ai.operations.getVideosOperation({
        operation: currentOperation,
      });
    }

    if (currentOperation.error) {
      logger.error('Video generation failed:', currentOperation.error);
      return null;
    }

    await recordCost({
      model,
      capability: 'video',
      usageMetadata: (currentOperation.response as any)?.usageMetadata,
    });

    // Veo download links are authenticated Google endpoints — they require
    // x-goog-api-key on the GET. Without the header the browser gets a 401 and
    // the <video> element shows MEDIA_ERR_SRC_NOT_SUPPORTED. We add the header,
    // download the bytes, and return them as a base64 data URI so the Canvas
    // media-auto-save pipeline (Phase 5b) can persist them via media-store.
    const downloadLink =
      currentOperation.response?.generatedVideos?.[0]?.video?.uri;
    if (downloadLink) {
      try {
        const apiKey = getApiKey();
        const fetched = await fetch(downloadLink, {
          method: 'GET',
          headers: apiKey ? { 'x-goog-api-key': apiKey } : {},
        });
        if (fetched.ok) {
          const blob = await fetched.blob();
          const buf = new Uint8Array(await blob.arrayBuffer());
          let bin = '';
          const chunkSize = 0x8000;
          for (let i = 0; i < buf.length; i += chunkSize) {
            bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunkSize)));
          }
          const base64 = btoa(bin);
          const mime = blob.type || 'video/mp4';
          return `data:${mime};base64,${base64}`;
        }
        logger.error('Veo download fetch returned non-ok', fetched.status);
      } catch (e) {
        logger.error('Failed to fetch generated video', e);
      }
      // Last resort — return the raw URL so the player at least shows something
      // (will fail silently for the user but won't crash the app).
      return downloadLink;
    }

    return currentOperation.name ?? null;
  },

  // Music Generation (Lyria 3)
  // Lyria 3 outputs are inherently watermarked by the model; client-side verification is not implemented.
  generateMusic: async (
    prompt: string,
    models?: MultimodalModelOverrides
  ): Promise<string | null> => {
    const ai = await getAI();
    const model = models?.music ?? DEFAULT_MODEL_IDS.music;
    const response = await ai.models.generateContentStream({
      model,
      contents: prompt,
    });

    let audioBase64 = '';
    let mimeType = 'audio/wav';
    let lastUsageMetadata: UsageMetadataLike | undefined;

    for await (const chunk of response) {
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (parts) {
        for (const part of parts) {
          if (part.inlineData?.data) {
            if (!audioBase64 && part.inlineData.mimeType) {
              mimeType = part.inlineData.mimeType;
            }
            audioBase64 += part.inlineData.data;
          }
        }
      }
      const chunkUsage = (chunk as any).usageMetadata;
      if (chunkUsage) {
        lastUsageMetadata = chunkUsage;
      }
    }

    await recordCost({
      model,
      capability: 'music',
      usageMetadata: lastUsageMetadata,
    });

    if (!audioBase64) return null;
    return `data:${mimeType};base64,${audioBase64}`;
  },

  // Audio Streams (TTS)
  textToSpeech: async (
    text: string,
    models?: MultimodalModelOverrides
  ): Promise<string | null> => {
    const ai = await getAI();
    const model = models?.tts ?? DEFAULT_MODEL_IDS.tts;
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    await recordCost({
      model,
      capability: 'tts',
      usageMetadata: (response as any).usageMetadata,
    });

    const inlineData =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (inlineData?.data) {
      const responseMimeType = inlineData.mimeType || 'audio/wav';
      // Gemini TTS returns raw PCM L16 (e.g. `audio/l16;codec=pcm;rate=24000`)
      // which browsers cannot decode natively. Wrap in a WAV container.
      if (/audio\/l16|pcm/i.test(responseMimeType)) {
        const rateMatch = /rate=(\d+)/.exec(responseMimeType);
        const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
        const wavBase64 = pcmBase64ToWavBase64(inlineData.data, sampleRate, 1, 16);
        return `data:audio/wav;base64,${wavBase64}`;
      }
      return `data:${responseMimeType};base64,${inlineData.data}`;
    }
    return null;
  },
};

// Wrap a base64-encoded raw PCM L16 buffer into a base64-encoded WAV file.
function pcmBase64ToWavBase64(
  pcmBase64: string,
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number
): string {
  const binaryStr = atob(pcmBase64);
  const pcmLen = binaryStr.length;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const wavLen = 44 + pcmLen;
  const buf = new Uint8Array(wavLen);
  const dv = new DataView(buf.buffer);
  // RIFF header
  buf[0] = 0x52; buf[1] = 0x49; buf[2] = 0x46; buf[3] = 0x46; // "RIFF"
  dv.setUint32(4, 36 + pcmLen, true);
  buf[8] = 0x57; buf[9] = 0x41; buf[10] = 0x56; buf[11] = 0x45; // "WAVE"
  // fmt subchunk
  buf[12] = 0x66; buf[13] = 0x6d; buf[14] = 0x74; buf[15] = 0x20; // "fmt "
  dv.setUint32(16, 16, true);          // Subchunk1Size
  dv.setUint16(20, 1, true);           // AudioFormat = 1 (PCM)
  dv.setUint16(22, numChannels, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, byteRate, true);
  dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, bitsPerSample, true);
  // data subchunk
  buf[36] = 0x64; buf[37] = 0x61; buf[38] = 0x74; buf[39] = 0x61; // "data"
  dv.setUint32(40, pcmLen, true);
  for (let i = 0; i < pcmLen; i++) {
    buf[44 + i] = binaryStr.charCodeAt(i);
  }
  let out = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < buf.length; i += chunkSize) {
    out += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunkSize)));
  }
  return btoa(out);
}
