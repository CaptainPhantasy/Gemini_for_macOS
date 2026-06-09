import { describe, expect, it, vi } from 'vitest';
import type { ModelSettings } from '../types';
import {
  buildAvailableModelCatalog,
  fetchAvailableGeminiModels,
  getModelOptionsForCapability,
  getRecommendedModelChanges,
} from '../lib/model/model-refresh';

const fetchedAt = '2026-05-24T12:00:00.000Z';

describe('Gemini model refresh helpers', () => {
  it('builds a timestamped available-model catalog from Gemini API models', () => {
    const catalog = buildAvailableModelCatalog([
      {
        name: 'models/gemini-2.5-pro',
        displayName: 'Gemini 2.5 Pro',
        description: 'High quality text model',
        supportedGenerationMethods: ['generateContent'],
      },
      {
        name: 'models/gemini-2.5-flash-image-preview',
        displayName: 'Gemini 2.5 Flash Image Preview',
        supportedGenerationMethods: ['generateContent'],
      },
      {
        name: 'models/gemini-2.5-flash-live-preview',
        displayName: 'Gemini 2.5 Flash Live Preview',
        supportedGenerationMethods: ['bidiGenerateContent'],
      },
      {
        name: 'models/veo-3.1-generate-preview',
        displayName: 'Veo 3.1',
        supportedGenerationMethods: ['predictLongRunning'],
      },
    ], fetchedAt);

    expect(catalog.fetchedAt).toBe(fetchedAt);
    expect(catalog.rawCount).toBe(4);
    expect(catalog.models.map(model => model.id)).toContain('gemini-2.5-pro');
    expect(catalog.byCapability.text).toContain('gemini-2.5-pro');
    expect(catalog.byCapability.imageFlash).toContain('gemini-2.5-flash-image-preview');
    expect(catalog.byCapability.liveAudio).toContain('gemini-2.5-flash-live-preview');
    expect(catalog.byCapability.video).toContain('veo-3.1-generate-preview');
  });

  it('fetches available models using the configured API key without leaking it in errors', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain('key=test-api-key');
      return new Response(JSON.stringify({
        models: [
          {
            name: 'models/gemini-2.5-flash',
            displayName: 'Gemini 2.5 Flash',
            supportedGenerationMethods: ['generateContent'],
          },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const catalog = await fetchAvailableGeminiModels('test-api-key', fetchMock, () => fetchedAt);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(catalog.fetchedAt).toBe(fetchedAt);
    expect(catalog.models[0].id).toBe('gemini-2.5-flash');
  });

  it('redacts the configured API key from refresh failure messages', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: { message: 'permission denied for test-api-key' },
    }), { status: 403, headers: { 'Content-Type': 'application/json' } }));

    await expect(fetchAvailableGeminiModels('test-api-key', fetchMock, () => fetchedAt))
      .rejects.toThrow('permission denied for [redacted-api-key]');
  });

  it('preserves stale current selections while putting fetched models before fallback options', () => {
    const catalog = buildAvailableModelCatalog([
      {
        name: 'models/gemini-2.5-pro',
        displayName: 'Gemini 2.5 Pro',
        supportedGenerationMethods: ['generateContent'],
      },
    ], fetchedAt);

    const options = getModelOptionsForCapability('text', 'gemini-custom-still-selected', catalog);

    expect(options[0]).toMatchObject({ id: 'gemini-2.5-pro', source: 'live' });
    expect(options.some(option => option.id === 'gemini-3.1-pro-preview' && option.source === 'fallback')).toBe(true);
    expect(options.some(option => option.id === 'gemini-custom-still-selected' && option.source === 'current')).toBe(true);
  });

  it('calculates recommended default changes without mutating current selections', () => {
    const current: ModelSettings = {
      text: 'custom-text',
      textFallback: 'custom-fallback',
      imagePro: 'custom-image-pro',
      imageFlash: 'custom-image-flash',
      video: 'custom-video',
      music: 'custom-music',
      tts: 'custom-tts',
      liveAudio: 'custom-live',
    };
    const catalog = buildAvailableModelCatalog([
      { name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-2.5-flash-image-preview', displayName: 'Gemini 2.5 Flash Image', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-2.5-flash-live-preview', displayName: 'Gemini 2.5 Flash Live', supportedGenerationMethods: ['bidiGenerateContent'] },
      { name: 'models/veo-3.1-generate-preview', displayName: 'Veo 3.1', supportedGenerationMethods: ['predictLongRunning'] },
    ], fetchedAt);

    const changes = getRecommendedModelChanges(current, catalog);

    expect(current.text).toBe('custom-text');
    expect(changes.find(change => change.capability === 'text')).toMatchObject({ from: 'custom-text', to: 'gemini-2.5-pro' });
    expect(changes.find(change => change.capability === 'textFallback')).toMatchObject({ from: 'custom-fallback', to: 'gemini-2.5-flash' });
    expect(changes.find(change => change.capability === 'imageFlash')).toMatchObject({ from: 'custom-image-flash', to: 'gemini-2.5-flash-image-preview' });
  });
});
