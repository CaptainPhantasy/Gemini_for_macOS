import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', variant = 'default', onConfirm, onCancel }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  const danger = variant === 'danger';
  const iconBg = danger ? 'bg-red-100 dark:bg-red-900/30' : 'bg-blue-100 dark:bg-blue-900/30';
  const iconColor = danger ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400';
  const confirmBg = danger
    ? 'bg-red-600 hover:bg-red-700'
    : 'bg-blue-600 hover:bg-blue-700';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={onCancel}>
      <div className="bg-white dark:bg-[#1e1f20] rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex flex-col items-center text-center">
          <div className={`w-12 h-12 ${iconBg} rounded-full flex items-center justify-center mb-4`}>
            <AlertTriangle className={iconColor} size={24} />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{title}</h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6">{message}</p>
        </div>
        <div className="flex gap-3 w-full">
          <button ref={cancelRef} onClick={onCancel}
            className="flex-1 py-2 px-4 bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors">
            {cancelLabel}
          </button>
          <button onClick={onConfirm}
            className={`flex-1 py-2 px-4 ${confirmBg} text-white rounded-lg transition-colors`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
