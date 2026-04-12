import { useState } from 'react';
import { Artifact } from '../types';
import { X, Code, FileText, Search } from 'lucide-react';
import { mcpClient } from '../lib/mcp';

interface CanvasProps {
  artifact: Artifact | null;
  onClose: () => void;
}

export function Canvas({ artifact, onClose }: CanvasProps) {
  const [content, setContent] = useState(artifact?.content || '');

  if (!artifact) return null;

  const handleSave = async () => {
    // MCP client write with explicit user permission
    await mcpClient.writeFile(`/artifacts/${artifact.id}.txt`, content);
  };

  return (
    <div className="w-1/2 h-full bg-white dark:bg-[#1e1f20] border-l border-gray-200 dark:border-gray-800 flex flex-col shadow-xl z-10">
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2 text-gray-800 dark:text-gray-200">
          {artifact.type === 'code' && <Code size={20} />}
          {artifact.type === 'text' && <FileText size={20} />}
          {artifact.type === 'research' && <Search size={20} />}
          <h2 className="font-medium">{artifact.title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSave} className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">Save (MCP)</button>
          <button onClick={onClose} className="p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md">
            <X size={20} />
          </button>
        </div>
      </div>
      <div className="flex-1 p-4 overflow-y-auto">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full h-full p-4 bg-gray-50 dark:bg-[#131314] text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-800 rounded-lg font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}
