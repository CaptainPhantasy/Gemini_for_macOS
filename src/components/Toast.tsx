import { useState, createContext, useContext } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const addToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => { setToasts(prev => prev.filter(t => t.id !== id)); }, 5000);
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[200] space-y-2">
        {toasts.map(t => (
          <div key={t.id} className="p-4 rounded-xl shadow-2xl bg-white dark:bg-[#1e1f20] border border-gray-200 dark:border-gray-800 flex items-center gap-3 min-w-[300px]">
            <Info size={18} className="text-blue-500" />
            <span className="flex-1 font-medium text-sm text-gray-800 dark:text-gray-100">{t.message}</span>
            <button onClick={() => { setToasts(prev => prev.filter(toast => toast.id !== t.id)); }}><X size={16} className="text-gray-400" /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
