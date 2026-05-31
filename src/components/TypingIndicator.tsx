import { OFFICIAL_GEMINI_ASSETS } from '../lib/official-assets';
import { OfficialGeminiLottie } from './OfficialGeminiLottie';

export function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="official-thinking max-w-[80%] rounded-2xl px-5 py-3 bg-transparent text-gray-900 dark:text-gray-100">
        <div className="flex items-center gap-3">
          <OfficialGeminiLottie
            src={OFFICIAL_GEMINI_ASSETS.spinnerLottie}
            className="official-thinking-spinner"
            ariaLabel="Gemini response in progress"
          />
          <OfficialGeminiLottie
            src={OFFICIAL_GEMINI_ASSETS.sparkLottie}
            className="official-thinking-spark"
          />
          <span className="text-xs text-gray-500 dark:text-gray-400 select-none">
            Gemini is thinking&hellip;
          </span>
        </div>
      </div>
    </div>
  );
}
