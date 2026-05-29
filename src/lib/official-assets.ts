const OFFICIAL_GEMINI_BASE_PATH = '/vendor/official-gemini';

export function officialGeminiAssetPath(relativePath: string): string {
  const normalized = relativePath.replace(/^\/+/, '');
  return `${OFFICIAL_GEMINI_BASE_PATH}/${normalized}`;
}

export const OFFICIAL_GEMINI_ASSETS = {
  spinnerLottie: officialGeminiAssetPath('GPI_Aurora_Spinner.json'),
  sparkLottie: officialGeminiAssetPath('GPI_Aurora_Spark.json'),
  idleVideo: officialGeminiAssetPath('GelIdle.mp4'),
} as const;

export const OFFICIAL_GEMINI_FONT_FACES = [
  { family: 'GoogleSans', weight: 400, url: officialGeminiAssetPath('fonts/GoogleSans-Regular.nohints.ttf') },
  { family: 'GoogleSans', weight: 500, url: officialGeminiAssetPath('fonts/GoogleSans-Medium.nohints.ttf') },
  { family: 'GoogleSans', weight: 700, url: officialGeminiAssetPath('fonts/GoogleSans-Bold.nohints.ttf') },
  { family: 'GoogleSansText', weight: 400, url: officialGeminiAssetPath('fonts/GoogleSansText-Regular.ttf') },
  { family: 'GoogleSansText', weight: 500, url: officialGeminiAssetPath('fonts/GoogleSansText-Medium.ttf') },
  { family: 'GoogleSansText', weight: 700, url: officialGeminiAssetPath('fonts/GoogleSansText-Bold.ttf') },
] as const;
