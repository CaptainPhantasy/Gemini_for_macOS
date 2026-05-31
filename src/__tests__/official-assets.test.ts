import { describe, expect, test } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { OFFICIAL_GEMINI_ASSETS, OFFICIAL_GEMINI_FONT_FACES, officialGeminiAssetPath } from '../lib/official-assets';

describe('official Gemini assets', () => {
  test('manifest exposes stable public URLs for copied assets', () => {
    expect(OFFICIAL_GEMINI_ASSETS.spinnerLottie).toBe('/gemini/vendor/official-gemini/GPI_Aurora_Spinner.json');
    expect(OFFICIAL_GEMINI_ASSETS.sparkLottie).toBe('/gemini/vendor/official-gemini/GPI_Aurora_Spark.json');
    expect(OFFICIAL_GEMINI_ASSETS.idleVideo).toBe('/gemini/vendor/official-gemini/GelIdle.mp4');
    expect(officialGeminiAssetPath('fonts/GoogleSans-Regular.nohints.ttf')).toBe('/gemini/vendor/official-gemini/fonts/GoogleSans-Regular.nohints.ttf');
  });

  test('every manifest asset exists under public directory', () => {
    const publicRoot = join(process.cwd(), 'public');
    const publicAssetPath = (url: string) => url.replace(/^\/gemini\//, '');

    for (const url of Object.values(OFFICIAL_GEMINI_ASSETS)) {
      expect(url.startsWith('/gemini/')).toBe(true);
      expect(existsSync(join(publicRoot, publicAssetPath(url)))).toBe(true);
    }
    for (const face of OFFICIAL_GEMINI_FONT_FACES) {
      expect(existsSync(join(publicRoot, publicAssetPath(face.url)))).toBe(true);
    }
  });
});
