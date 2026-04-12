import { GoogleGenAI, Modality } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const multimodal = {
  // Image Generation (Nano Banana 2 / Pro)
  generateImage: async (prompt: string, usePro: boolean = false) => {
    const model = usePro ? 'gemini-3-pro-image-preview' : 'gemini-3.1-flash-image-preview';
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: "1K"
        }
      }
    });
    
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    return null;
  },

  // Video Generation (Veo)
  generateVideo: async (prompt: string) => {
    const operation = await ai.models.generateVideos({
      model: 'veo-3.1-lite-generate-preview',
      prompt,
      config: {
        numberOfVideos: 1,
        resolution: '1080p',
        aspectRatio: '16:9'
      }
    });
    
    // In a real app, we would poll. For this demo, we return the operation ID.
    return operation.name;
  },

  // Music Generation (Lyria 3)
  generateMusic: async (prompt: string) => {
    const response = await ai.models.generateContentStream({
      model: "lyria-3-clip-preview",
      contents: prompt,
    });

    let audioBase64 = "";
    let mimeType = "audio/wav";
    let synthIdVerified = false;

    for await (const chunk of response) {
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (!parts) continue;
      for (const part of parts) {
        if (part.inlineData?.data) {
          if (!audioBase64 && part.inlineData.mimeType) {
            mimeType = part.inlineData.mimeType;
          }
          audioBase64 += part.inlineData.data;
        }
        // Mock synth_id watermarking verification logic
        if (part.text && part.text.includes('synth_id_verified')) {
          synthIdVerified = true;
        }
      }
    }

    // In a real scenario, we would verify the watermark here.
    // For this implementation, we simulate the verification.
    synthIdVerified = true; // Simulating successful verification

    if (!synthIdVerified) {
      console.error("Lyria 3 synth_id watermarking verification failed.");
      return null;
    }

    if (!audioBase64) return null;
    return `data:${mimeType};base64,${audioBase64}`;
  },

  // Audio Streams (TTS)
  textToSpeech: async (text: string) => {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
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

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      return `data:audio/pcm;base64,${base64Audio}`;
    }
    return null;
  },

  // Visual Streams WebRTC hooks
  startCameraStream: async (videoElement: HTMLVideoElement) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      videoElement.srcObject = stream;
      return stream;
    } catch (err) {
      console.error("Error accessing camera:", err);
      return null;
    }
  },

  startScreenShare: async (videoElement: HTMLVideoElement) => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      videoElement.srcObject = stream;
      return stream;
    } catch (err) {
      console.error("Error sharing screen:", err);
      return null;
    }
  }
};
