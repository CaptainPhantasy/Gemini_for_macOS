/**
 * LiveChooser — modal that picks a Live Mode flavor (voice / camera / screen).
 *
 * Part of the Wave 2 LiveMode rewrite. Replaces the chicken-and-egg videoRef
 * facade that used to live inside `LiveMode.tsx`. The chooser is intentionally
 * dumb: it owns no streams, no sessions, no media. It only emits an
 * `onSelect(mode)` and lets the parent mount a `LiveSessionPanel`.
 */
import { X, Mic, Camera, Monitor } from 'lucide-react';

export type LiveModeKind = 'voice' | 'camera' | 'screen';

export interface LiveChooserProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (mode: LiveModeKind) => void;
}

interface ChoiceConfig {
  mode: LiveModeKind;
  label: string;
  description: string;
  Icon: typeof Mic;
  accent: string;
}

const CHOICES: ChoiceConfig[] = [
  {
    mode: 'voice',
    label: 'Voice',
    description: 'Hands-free voice conversation',
    Icon: Mic,
    accent: 'from-blue-500/20 to-blue-500/0 hover:from-blue-500/30',
  },
  {
    mode: 'camera',
    label: 'Camera',
    description: 'Show Gemini what you see',
    Icon: Camera,
    accent: 'from-purple-500/20 to-purple-500/0 hover:from-purple-500/30',
  },
  {
    mode: 'screen',
    label: 'Screen',
    description: 'Share a window or tab',
    Icon: Monitor,
    accent: 'from-emerald-500/20 to-emerald-500/0 hover:from-emerald-500/30',
  },
];

export function LiveChooser({ isOpen, onClose, onSelect }: LiveChooserProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="live-chooser-heading"
    >
      <div
        className="bg-[#1e1f20] rounded-2xl w-full max-w-2xl shadow-2xl relative overflow-hidden border border-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" aria-hidden="true" />
            <h2 id="live-chooser-heading" className="text-xl font-semibold text-white">
              Start Live Session
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={24} />
          </button>
        </header>

        <div className="p-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {CHOICES.map(({ mode, label, description, Icon, accent }) => (
            <button
              key={mode}
              type="button"
              onClick={() => onSelect(mode)}
              className={`group relative rounded-xl border border-gray-800 bg-gradient-to-b ${accent} p-6 flex flex-col items-center gap-3 text-center transition-all hover:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500`}
            >
              <div className="rounded-full bg-white/5 p-4 group-hover:bg-white/10 transition-colors">
                <Icon size={32} className="text-white" />
              </div>
              <div className="text-white font-semibold">{label}</div>
              <div className="text-xs text-gray-400">{description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default LiveChooser;
