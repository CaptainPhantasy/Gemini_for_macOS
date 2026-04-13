/**
 * MCP Permission Request Modal Component
 */

import { ShieldAlert } from 'lucide-react';

interface MCPPermissionModalProps {
  action: string;
  path: string;
  onAllow: () => void;
  onDeny: () => void;
}

export function MCPPermissionModal({ action, path, onAllow, onDeny }: MCPPermissionModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
      <div className="bg-white dark:bg-[#1e1f20] rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col items-center text-center">
        <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
          <ShieldAlert className="text-red-600 dark:text-red-400" size={24} />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Security Alert</h2>
        <p className="text-gray-600 dark:text-gray-300 mb-6">
          The application is requesting permission to <strong>{action}</strong> the following path via Model Context Protocol:
          <br/><br/>
          <code className="bg-gray-100 dark:bg-[#131314] px-2 py-1 rounded text-sm break-all">
            {path}
          </code>
        </p>
        <div className="flex gap-3 w-full">
          <button 
            onClick={onDeny}
            className="flex-1 py-2 px-4 bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
          >
            Deny
          </button>
          <button 
            onClick={onAllow}
            className="flex-1 py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
