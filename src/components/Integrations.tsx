import { useState } from 'react';
import { X, Cloud, Lock, CheckCircle } from 'lucide-react';

export function Integrations({ onClose }) {
  const [status, setStatus] = useState({ drive: 'disconnected', docs: 'disconnected', notebook: 'disconnected' });
  const handleConnect = (service) => {
    const newStatus = {...status};
    newStatus[service] = 'connected';
    setStatus(newStatus);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-[#1e1f20] rounded-2xl w-full max-w-md p-6 shadow-2xl border border-gray-200 dark:border-gray-800">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Cloud className="text-blue-500" /> Google Ecosystem
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X size={24} />
          </button>
        </div>
        <div className="space-y-4">
          {['Drive', 'Docs', 'NotebookLM'].map((service) => {
            const id = service.toLowerCase().replace('lm', '');
            return (
              <div key={service} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#2a2b2c] rounded-xl border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                    <Lock size={20} />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">{service}</h3>
                  </div>
                </div>
                <button onClick={() => handleConnect(id)} className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                  {status[id] === 'connected' ? 'Active' : 'Connect'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
