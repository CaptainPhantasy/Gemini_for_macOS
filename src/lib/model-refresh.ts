import type { AvailableModelCatalog, GeminiAvailableModel, GeminiModelApiModel, ModelSettings } from '../types';
import { DEFAULT_MODEL_IDS, MODEL_CATALOG, type ModelOption } from './model-catalog';

export type ModelOptionSource = 'live' | 'fallback' | 'current';

export type SelectableModelOption = ModelOption & {
  source: ModelOptionSource;
};

export type RecommendedModelChange = {
  capability: keyof ModelSettings;
  from: string;
  to: string;
};

const GEMINI_MODELS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

function normalizeModelId(name: string): string {
  return name.replace(/^models\//, '').trim();
}

function redactApiKey(message: string, apiKey: string): string {
  return apiKey ? message.split(apiKey).join('[redacted-api-key]') : message;
}

function uniq<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function supports(model: GeminiModelApiModel, method: string): boolean {
  return model.supportedGenerationMethods?.includes(method) ?? false;
}

function classifyModel(model: GeminiModelApiModel): (keyof ModelSettings)[] {
  const id = normalizeModelId(model.name).toLowerCase();
  const displayName = model.displayName?.toLowerCase() ?? '';
  const description = model.description?.toLowerCase() ?? '';
  const searchable = `${id} ${displayName} ${description}`;
  const capabilities = new Set<keyof ModelSettings>();

  if (id.startsWith('veo-') || searchable.includes('video')) {
    capabilities.add('video');
  }

  if (id.startsWith('lyria-') || searchable.includes('music')) {
    capabilities.add('music');
  }

  if (searchable.includes('tts') || searchable.includes('text-to-speech')) {
    capabilities.add('tts');
  }

  if (searchable.includes('live') || searchable.includes('native-audio') || supports(model, 'bidiGenerateContent')) {
    capabilities.add('liveAudio');
  }

  if (searchable.includes('image')) {
    if (searchable.includes('pro')) capabilities.add('imagePro');
    if (searchable.includes('flash') || !searchable.includes('pro')) capabilities.add('imageFlash');
  }

  const isTextGenerationModel =
    id.startsWith('gemini-') &&
    !searchable.includes('image') &&
    !searchable.includes('tts') &&
    !searchable.includes('live') &&
    !searchable.includes('native-audio') &&
    (supports(model, 'generateContent') || supports(model, 'streamGenerateContent') || !model.supportedGenerationMethods?.length);

  if (isTextGenerationModel) {
    capabilities.add('text');
    if (searchable.includes('flash') || searchable.includes('lite')) {
      capabilities.add('textFallback');
    }
  }

  return Array.from(capabilities);
}

function toAvailableModel(model: GeminiModelApiModel): GeminiAvailableModel {
  return {
    id: normalizeModelId(model.name),
    name: model.name,
    displayName: model.displayName || normalizeModelId(model.name),
    description: model.description,
    version: model.version,
    supportedGenerationMethods: model.supportedGenerationMethods ?? [],
    inputTokenLimit: model.inputTokenLimit,
    outputTokenLimit: model.outputTokenLimit,
  };
}

function modelLabel(model: GeminiAvailableModel): string {
  return model.displayName && model.displayName !== model.id ? `${model.displayName} (${model.id})` : model.id;
}

function labelWithSource(option: SelectableModelOption): string {
  if (option.source === 'live') return `${option.label} · live`;
  if (option.source === 'fallback') return `${option.label} · curated fallback`;
  return `${option.label} · current selection`;
}

export function buildAvailableModelCatalog(models: GeminiModelApiModel[], fetchedAt: string): AvailableModelCatalog {
  const normalizedModels = models.map(toAvailableModel).filter(model => model.id.length > 0);
  const byCapability: AvailableModelCatalog['byCapability'] = {
    text: [],
    textFallback: [],
    imagePro: [],
    imageFlash: [],
    video: [],
    music: [],
    tts: [],
    liveAudio: [],
  };

  models.forEach((model) => {
    const id = normalizeModelId(model.name);
    for (const capability of classifyModel(model)) {
      byCapability[capability].push(id);
    }
  });

  for (const capability of Object.keys(byCapability) as (keyof ModelSettings)[]) {
    byCapability[capability] = uniq(byCapability[capability]).filter(id => normalizedModels.some(model => model.id === id));
  }

  return {
    fetchedAt,
    source: 'gemini-api',
    endpoint: GEMINI_MODELS_ENDPOINT,
    rawCount: models.length,
    models: normalizedModels,
    byCapability,
  };
}

export async function fetchAvailableGeminiModels(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  now: () => string = () => new Date().toISOString(),
): Promise<AvailableModelCatalog> {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    throw new Error('Gemini API key is required to refresh available models.');
  }

  const url = new URL(GEMINI_MODELS_ENDPOINT);
  url.searchParams.set('key', trimmedKey);
  const response = await fetchImpl(url.toString());
  const bodyText = await response.text();

  let payload: unknown = null;
  try {
    payload = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload && 'error' in payload &&
      typeof (payload as { error?: { message?: unknown } }).error?.message === 'string'
        ? (payload as { error: { message: string } }).error.message
        : bodyText || response.statusText;
    throw new Error(`Gemini model refresh failed with HTTP ${response.status}: ${redactApiKey(message, trimmedKey)}`);
  }

  const models =
    typeof payload === 'object' && payload && Array.isArray((payload as { models?: unknown }).models)
      ? (payload as { models: GeminiModelApiModel[] }).models
      : [];

  return buildAvailableModelCatalog(models, now());
}

export function getModelOptionsForCapability(
  capability: keyof ModelSettings,
  currentValue: string,
  catalog?: AvailableModelCatalog,
): SelectableModelOption[] {
  const catalogKey = capability === 'textFallback' ? 'text' : capability;
  const liveIds = catalog?.byCapability[capability] ?? [];
  const liveOptions: SelectableModelOption[] = liveIds
    .map(id => catalog?.models.find(model => model.id === id))
    .filter((model): model is GeminiAvailableModel => Boolean(model))
    .map(model => ({
      id: model.id,
      label: modelLabel(model),
      description: model.description,
      source: 'live',
    }));

  const fallbackOptions: SelectableModelOption[] =
    ((MODEL_CATALOG as Record<string, readonly ModelOption[]>)[catalogKey] ?? []).map(option => ({
      ...option,
      source: 'fallback' as const,
    }));

  const deduped: SelectableModelOption[] = [];
  for (const option of [...liveOptions, ...fallbackOptions]) {
    if (!deduped.some(existing => existing.id === option.id)) {
      deduped.push({ ...option, label: labelWithSource(option) });
    }
  }

  const trimmedCurrent = currentValue.trim();
  if (trimmedCurrent && !deduped.some(option => option.id === trimmedCurrent)) {
    deduped.push({
      id: trimmedCurrent,
      label: `${trimmedCurrent} · current selection`,
      description: 'Current selection is not in the latest fetched catalog or curated fallback list.',
      source: 'current',
    });
  }

  return deduped;
}

function firstMatching(ids: string[], matcher: (id: string) => boolean): string | undefined {
  return ids.find(id => matcher(id.toLowerCase()));
}

export function getRecommendedModelId(capability: keyof ModelSettings, catalog?: AvailableModelCatalog): string {
  const liveIds = catalog?.byCapability[capability] ?? [];
  const fallback = DEFAULT_MODEL_IDS[capability];

  if (capability === 'text') {
    return firstMatching(liveIds, id => id.includes('pro')) ?? liveIds[0] ?? fallback;
  }
  if (capability === 'textFallback') {
    return firstMatching(liveIds, id => id.includes('flash') && id.includes('lite')) ??
      firstMatching(liveIds, id => id.includes('flash')) ??
      liveIds[0] ??
      fallback;
  }
  if (capability === 'imagePro') {
    return firstMatching(liveIds, id => id.includes('pro')) ?? liveIds[0] ?? fallback;
  }
  if (capability === 'imageFlash') {
    return firstMatching(liveIds, id => id.includes('flash')) ?? liveIds[0] ?? fallback;
  }

  return liveIds[0] ?? fallback;
}

export function getRecommendedModelChanges(
  currentModels: ModelSettings,
  catalog?: AvailableModelCatalog,
): RecommendedModelChange[] {
  return (Object.keys(currentModels) as (keyof ModelSettings)[])
    .map(capability => ({
      capability,
      from: currentModels[capability],
      to: getRecommendedModelId(capability, catalog),
    }))
    .filter(change => change.from !== change.to);
}
