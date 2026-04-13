import { X, Download, Shield, ShieldAlert, Zap, Lock, Globe, HardDrive, BookOpen } from 'lucide-react';
import { backup } from '../lib/backup';
import { AppSettings, AutonomyMode } from '../types';

interface SettingsProps {
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
}

export function Settings({ onClose, settings, onUpdateSettings }: SettingsProps) {
  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    onUpdateSettings({ ...settings, [key]: value });
  };

  const autonomyOptions: { mode: AutonomyMode; label: string; icon: any; desc: string }[] = [
    { mode: 'locked', label: 'Locked', icon: <Lock size={16} />, desc: 'Always ask for permission before any action.' },
    { mode: 'scoped', label: 'Scoped', icon: <Shield size={16} />, desc: 'Auto-approve actions in safe directories (src, docs).' },
    { mode: 'risk-based', label: 'Risk-Based', icon: <ShieldAlert size={16} />, desc: 'Auto-approve Reads, ask for Writes/Executes.' },
    { mode: 'yolo', label: 'YOLO', icon: <Zap size={16} />, desc: 'Never ask. Full autonomous execution mode.' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#1e1f20] rounded-2xl w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">System Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
            <X size={24} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-8 pr-2">
          {/* Theme Section */}
          <section>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">Appearance</h3>
            <div className="grid grid-cols-3 gap-3">
              {(['light', 'dark', 'system'] as const).map((t) => (
                <button 
                  key={t}
                  onClick={() => updateSetting('theme', t)}
                  className={`py-2 px-4 rounded-xl border-2 transition-all capitalize font-medium ${
                    settings.theme === t 
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' 
                      : 'border-gray-100 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-200 dark:hover:border-gray-700'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </section>

          {/* Autonomy Section */}
          <section>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">Agent Autonomy (CLI Modes)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {autonomyOptions.map((opt) => (
                <button
                  key={opt.mode}
                  onClick={() => updateSetting('autonomyMode', opt.mode)}
                  className={`flex flex-col p-4 rounded-xl border-2 transition-all text-left ${
                    settings.autonomyMode === opt.mode
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700'
                  }`}
                >
                  <div className={`flex items-center gap-2 mb-2 font-semibold ${
                    settings.autonomyMode === opt.mode ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'
                  }`}>
                    {opt.icon}
                    {opt.label}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    {opt.desc}
                  </p>
                </button>
              ))}
            </div>
          </section>

          {/* Integrations Section */}
          <section>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">Google Ecosystem (Live)</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#131314] rounded-xl border border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                    <HardDrive size={20} />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">Google Drive</div>
                    <div className="text-xs text-gray-500">Sync artifacts and chat history</div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={settings.googleDriveEnabled} onChange={(e) => updateSetting('googleDriveEnabled', e.target.checked)} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#131314] rounded-xl border border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg">
                    <BookOpen size={20} />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">NotebookLM</div>
                    <div className="text-xs text-gray-500">Enhanced reasoning with source grounding</div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={settings.notebookLmEnabled} onChange={(e) => updateSetting('notebookLmEnabled', e.target.checked)} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#131314] rounded-xl border border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-lg">
                    <Globe size={20} />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">Google Search</div>
                    <div className="text-xs text-gray-500">Live web grounding for responses</div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={settings.searchEnabled} onChange={(e) => updateSetting('searchEnabled', e.target.checked)} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </section>

          {/* MCP Servers Section */}
          <section>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">MCP Servers</h3>
            <div className="space-y-4">
              {settings.mcpServers?.map((server, index) => (
                <div key={server.id} className="p-4 bg-gray-50 dark:bg-[#131314] rounded-xl border border-gray-100 dark:border-gray-800">
                  <div className="flex justify-between items-center mb-2">
                    <input 
                      type="text" 
                      value={server.name}
                      onChange={(e) => {
                        const newServers = [...settings.mcpServers];
                        newServers[index] = { ...server, name: e.target.value };
                        updateSetting('mcpServers', newServers);
                      }}
                      className="font-medium bg-transparent border-b border-dashed border-gray-300 dark:border-gray-700 focus:outline-none focus:border-blue-500 text-gray-900 dark:text-white"
                      placeholder="Server Name"
                    />
                    <div className="flex items-center gap-2">
                      <select 
                        value={server.type}
                        onChange={(e) => {
                          const newServers = [...settings.mcpServers];
                          newServers[index] = { ...server, type: e.target.value as any };
                          updateSetting('mcpServers', newServers);
                        }}
                        className="text-xs bg-white dark:bg-[#2a2b2c] border border-gray-200 dark:border-gray-700 rounded px-2 py-1"
                      >
                        <option value="stdio">stdio</option>
                        <option value="websocket">websocket</option>
                        <option value="sse">sse</option>
                      </select>
                      <label className="relative inline-flex items-center cursor-pointer ml-2">
                        <input 
                          type="checkbox" 
                          checked={server.enabled} 
                          onChange={(e) => {
                            const newServers = [...settings.mcpServers];
                            newServers[index] = { ...server, enabled: e.target.checked };
                            updateSetting('mcpServers', newServers);
                          }}
                          className="sr-only peer" 
                        />
                        <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                      </label>
                      <button 
                        onClick={() => {
                          const newServers = settings.mcpServers.filter((_, i) => i !== index);
                          updateSetting('mcpServers', newServers);
                        }}
                        className="text-red-500 hover:text-red-700 ml-2"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  {server.type === 'stdio' ? (
                    <div className="space-y-2 mt-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Command</label>
                        <input 
                          type="text" 
                          value={server.command || ''}
                          onChange={(e) => {
                            const newServers = [...settings.mcpServers];
                            newServers[index] = { ...server, command: e.target.value };
                            updateSetting('mcpServers', newServers);
                          }}
                          placeholder="e.g. npx, python, docker"
                          className="w-full px-3 py-1.5 text-sm bg-white dark:bg-[#2a2b2c] border border-gray-200 dark:border-gray-700 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Args (comma separated)</label>
                        <input 
                          type="text" 
                          value={(server.args || []).join(', ')}
                          onChange={(e) => {
                            const newServers = [...settings.mcpServers];
                            newServers[index] = { ...server, args: e.target.value.split(',').map(s => s.trim()).filter(Boolean) };
                            updateSetting('mcpServers', newServers);
                          }}
                          placeholder="e.g. -y, @modelcontextprotocol/server-everything"
                          className="w-full px-3 py-1.5 text-sm bg-white dark:bg-[#2a2b2c] border border-gray-200 dark:border-gray-700 rounded"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3">
                      <label className="block text-xs text-gray-500 mb-1">URL</label>
                      <input 
                        type="text" 
                        value={server.url || ''}
                        onChange={(e) => {
                          const newServers = [...settings.mcpServers];
                          newServers[index] = { ...server, url: e.target.value };
                          updateSetting('mcpServers', newServers);
                        }}
                        placeholder="e.g. ws://localhost:3001/mcp"
                        className="w-full px-3 py-1.5 text-sm bg-white dark:bg-[#2a2b2c] border border-gray-200 dark:border-gray-700 rounded"
                      />
                    </div>
                  )}
                </div>
              ))}
              
              <button 
                onClick={() => {
                  const newServers = [...(settings.mcpServers || []), {
                    id: Math.random().toString(36).substring(7),
                    name: 'New Server',
                    type: 'stdio' as const,
                    command: '',
                    args: [],
                    enabled: true
                  }];
                  updateSetting('mcpServers', newServers);
                }}
                className="w-full py-2 border-2 border-dashed border-gray-300 dark:border-gray-700 text-gray-500 hover:border-blue-500 hover:text-blue-500 rounded-xl transition-colors text-sm font-medium"
              >
                + Add MCP Server
              </button>
            </div>
          </section>

          {/* Data Section */}
          <section>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">Advanced</h3>
            <div className="space-y-4">
              <button 
                onClick={() => backup.createSnapshot()} 
                className="w-full py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl flex items-center justify-center gap-2 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors font-medium"
              >
                <Download size={18} /> Export Workspace Backup
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
