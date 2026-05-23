import { Sparkles, Lightbulb, Code, Map, FileText } from 'lucide-react';

interface WelcomeScreenProps {
  onSuggestionClick: (text: string) => void;
}

const suggestions = [
  { text: 'Explain quantum computing simply', icon: Lightbulb },
  { text: 'Write a Python script to analyze CSV data', icon: Code },
  { text: 'Help me plan a weekend trip', icon: Map },
  { text: 'Summarize this research paper', icon: FileText },
] as const;

export function WelcomeScreen({ onSuggestionClick }: WelcomeScreenProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-white dark:bg-[#131314]">
      <div className="flex flex-col items-center gap-6 max-w-2xl w-full">
        {/* Branding */}
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-500/30 via-purple-500/30 to-pink-500/30 blur-2xl scale-150" />
          <div className="relative rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 p-4">
            <Sparkles size={32} className="text-white" strokeWidth={1.8} />
          </div>
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            Welcome to Gemini Studio
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto leading-relaxed">
            Your AI-powered workspace for creation, analysis, and exploration
          </p>
        </div>

        {/* Suggestion chips */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full mt-4">
          {suggestions.map(({ text, icon: Icon }) => (
            <button
              key={text}
              type="button"
              onClick={() => onSuggestionClick(text)}
              className="group flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-800
                bg-gray-50/60 dark:bg-white/[0.03] px-4 py-3.5 text-left
                transition-all duration-200 ease-out
                hover:border-purple-400/50 hover:bg-purple-50/40 dark:hover:bg-purple-500/[0.06]
                hover:shadow-sm active:scale-[0.98]"
            >
              <Icon
                size={18}
                className="mt-0.5 shrink-0 text-gray-400 dark:text-gray-500
                  group-hover:text-purple-500 dark:group-hover:text-purple-400 transition-colors"
                strokeWidth={1.8}
              />
              <span className="text-sm text-gray-700 dark:text-gray-300 leading-snug">
                {text}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
