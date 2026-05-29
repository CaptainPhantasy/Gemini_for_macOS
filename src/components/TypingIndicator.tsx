import { Sparkles } from 'lucide-react';
import { OFFICIAL_GEMINI_ASSETS } from '../lib/official-assets';

export function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-2xl px-5 py-3 bg-transparent text-gray-900 dark:text-gray-100" data-official-spinner={OFFICIAL_GEMINI_ASSETS.spinnerLottie}>
        <div className="flex items-center gap-3">
          <Sparkles size={14} className="text-purple-400 shrink-0" />
          <span className="flex items-center gap-1" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="block h-2 w-2 rounded-full bg-gray-400 dark:bg-gray-500"
                style={{
                  animation: 'typing-dot 1.2s ease-in-out infinite',
                  animationDelay: `${i * 150}ms`,
                }}
              />
            ))}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 select-none">
            Gemini is thinking&hellip;
          </span>
        </div>
        <style>{`
          @keyframes typing-dot {
            0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
            30% { opacity: 1; transform: translateY(-4px); }
          }
        `}</style>
      </div>
    </div>
  );
}
