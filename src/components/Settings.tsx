import { useEffect, useState } from 'react';
import { X, Download, Shield, ShieldAlert, Zap, Lock, Globe, HardDrive, BookOpen, Radar } from 'lucide-react';
import { backup } from '../lib/backup';
import { AppSettings, AutonomyMode, ModelSettings, DEFAULT_MODEL_SETTINGS } from '../types';
import { MODEL_CATALOG, DEFAULT_MODEL_IDS } from '../lib/model-catalog';
import { costLedger, type LedgerEntry } from '../lib/cost-ledger';
import { fetchProjectBillingInfo } from '../lib/cloud-billing';

interface SettingsProps {
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
}

const MODEL_CAPABILITY_LABELS: Record<keyof ModelSettings, string> = {
  text: 'Text / Chat',
  textFallback: 'Text Fallback',
  imagePro: 'Image (Pro)',
  imageFlash: 'Image (Flash)',
  video: 'Video',
  music: 'Music',
  tts: 'Text-to-Speech',
  liveAudio: 'Live Audio',
};

const CUSTOM_MODEL_SENTINEL = '__custom__';

export function Settings({ onClose, settings, onUpdateSettings }: SettingsProps) {
  const [apiKeyDraft, setApiKeyDraft] = useState(settings.geminiApiKey || '');
  const [clientIdDraft, setClientIdDraft] = useState(settings.gcpOAuthClientId || '');
  const [apiSaved, setApiSaved] = useState(false);

  const handleSaveApiConfig = () => {
    onUpdateSettings({ ...settings, geminiApiKey: apiKeyDraft, gcpOAuthClientId: clientIdDraft });
    setApiSaved(true);
    setTimeout(() => setApiSaved(false), 2000);
  };

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    onUpdateSettings({ ...settings, [key]: value });
  };

  const currentModels: ModelSettings = { ...DEFAULT_MODEL_SETTINGS, ...(settings.models ?? {}) };

  const updateModel = (capability: keyof ModelSettings, modelId: string) => {
    onUpdateSettings({
      ...settings,
      models: { ...currentModels, [capability]: modelId },
    });
  };

  const updateThinkingBudget = (kind: 'text' | 'vision', value: number) => {
    const existing = settings.thinkingBudgets ?? { text: 8192, vision: 4096 };
    onUpdateSettings({
      ...settings,
      thinkingBudgets: { ...existing, [kind]: value },
    });
  };

  const updateCost = <K extends keyof NonNullable<AppSettings['cost']>>(
    key: K,
    value: NonNullable<AppSettings['cost']>[K]
  ) => {
    const existing = settings.cost ?? {
      gcpProjectId: '',
      billingAccountId: '',
      dailyThresholdUsd: 5,
      monthlyThresholdUsd: 100,
      showInSidebar: false,
    };
    onUpdateSettings({
      ...settings,
      cost: { ...existing, [key]: value },
    });
  };

  const updateLiveMode = (
    key: keyof NonNullable<AppSettings['liveMode']>,
    value: boolean
  ) => {
    const existing = settings.liveMode ?? {
      voiceTranscriptionEnabled: false,
      cameraTranscriptionEnabled: true,
      screenTranscriptionEnabled: true,
    };
    onUpdateSettings({
      ...settings,
      liveMode: { ...existing, [key]: value },
    });
  };

  // Cost & usage local state (loaded once on mount).
  const [todayUsd, setTodayUsd] = useState<number>(0);
  const [monthUsd, setMonthUsd] = useState<number>(0);
  const [breakdown, setBreakdown] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<LedgerEntry[]>([]);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [billingStatus, setBillingStatus] = useState<string | null>(null);

  // Detect local MCP servers
  interface DetectedServer {
    name: string;
    source: string;
    type: 'stdio' | 'websocket' | 'sse';
    command?: string;
    args?: string[];
    url?: string;
    enabled: boolean;
  }
  const [detectedServers, setDetectedServers] = useState<DetectedServer[]>([]);
  const [detecting, setDetecting] = useState(false);

  const handleDetectMcp = async () => {
    setDetecting(true);
    setDetectedServers([]);
    try {
      const resp = await fetch('http://localhost:13001/detect-mcp');
      const data = await resp.json();
      setDetectedServers(data.servers || []);
    } catch (err) {
      console.error('MCP detection failed:', err);
    } finally {
      setDetecting(false);
    }
  };

  const handleImportMcp = (server: DetectedServer) => {
    const existing = settings.mcpServers || [];
    const alreadyExists = existing.some(
      (s) => s.name === server.name || (s.command === server.command && s.url === server.url)
    );
    if (alreadyExists) return;
    const newServer = {
      id: Math.random().toString(36).substring(7),
      name: server.name,
      type: server.type,
      command: server.command,
      args: server.args,
      url: server.url,
      enabled: server.enabled,
    };
    updateSetting('mcpServers', [...existing, newServer]);
    setDetectedServers((prev) => prev.filter((s) => s.name !== server.name));
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [today, month, byCap, hist] = await Promise.all([
          costLedger.todayUsd(),
          costLedger.monthUsd(),
          costLedger.byCapability(),
          costLedger.history(30),
        ]);
        if (cancelled) return;
        setTodayUsd(today);
        setMonthUsd(month);
        setBreakdown(byCap);
        setHistory(hist);
      } catch {
        // Swallow — cost pane simply shows zeros if the ledger is unavailable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSyncCloudBilling = async () => {
    const projectId = settings.cost?.gcpProjectId;
    if (!projectId) {
      setSyncResult('Missing GCP project ID.');
      return;
    }
    // Real OAuth-token retrieval is not yet wired; placeholder until then.
    // Reference fetchProjectBillingInfo so it stays in scope and ready to use.
    void fetchProjectBillingInfo;
    setSyncResult(
      'Cloud Billing sync requires a Google OAuth connection. Use Integrations → Connect Google.'
    );
    setBillingStatus(null);
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
          {/* API Configuration */}
          <section>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">API Configuration</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">Gemini API Key</label>
                <input
                  type="password"
                  value={apiKeyDraft}
                  onChange={(e) => { setApiKeyDraft(e.target.value); setApiSaved(false); }}
                  placeholder="AIzaSy..."
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-[#131314] border border-gray-100 dark:border-gray-800 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">This is stored locally and securely used for API requests.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">Google OAuth Client ID</label>
                <input
                  type="text"
                  value={clientIdDraft}
                  onChange={(e) => { setClientIdDraft(e.target.value); setApiSaved(false); }}
                  placeholder="780337134686-xxxx.apps.googleusercontent.com"
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-[#131314] border border-gray-100 dark:border-gray-800 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Required for Google Drive integration. Create one at console.cloud.google.com/apis/credentials.</p>
              </div>
              <button
                onClick={handleSaveApiConfig}
                className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all ${
                  apiSaved
                    ? 'bg-green-600 text-white'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {apiSaved ? '✓ Saved' : 'Save API Configuration'}
              </button>
            </div>
          </section>

          {/* Theme Section */}
          <section>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">Appearance</h3>
            <div className="grid grid-cols-4 gap-3">
              {(['light', 'dark', 'system', 'gemini'] as const).map((t) => (
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

              {settings.googleDriveEnabled && (
                <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/30 ml-4">
                  <div>
                    <div className="font-medium text-sm text-gray-900 dark:text-white">Auto-sync artifacts to Drive</div>
                    <div className="text-xs text-gray-500">Automatically upload every new artifact to GEMINI/Artifacts in Drive</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={settings.autoSyncArtifacts} onChange={(e) => updateSetting('autoSyncArtifacts', e.target.checked)} className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              )}

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
                        placeholder="e.g. ws://localhost:13001/mcp"
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

              <button
                onClick={handleDetectMcp}
                disabled={detecting}
                className="w-full py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors text-sm font-medium flex items-center justify-center gap-2"
              >
                <Radar size={16} className={detecting ? 'animate-spin' : ''} />
                {detecting ? 'Scanning…' : 'Detect Local MCP Servers'}
              </button>

              {detectedServers.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-gray-500">Discovered {detectedServers.length} server{detectedServers.length > 1 ? 's' : ''}</div>
                  {detectedServers.map((server) => {
                    const alreadyImported = (settings.mcpServers || []).some(
                      (s) => s.name === server.name || (s.command === server.command && s.url === server.url)
                    );
                    return (
                      <div key={server.name} className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-gray-900 dark:text-white truncate">{server.name}</div>
                          <div className="text-xs text-gray-500 truncate">
                            {server.source} · {server.type}
                            {server.command ? ` · ${server.command}` : ''}
                          </div>
                        </div>
                        <button
                          onClick={() => handleImportMcp(server)}
                          disabled={alreadyImported}
                          className={`ml-3 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                            alreadyImported
                              ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                              : 'bg-purple-600 text-white hover:bg-purple-700'
                          }`}
                        >
                          {alreadyImported ? 'Imported' : 'Import'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Models Section */}
          <section>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">Models</h3>
            <div className="space-y-4">
              {(Object.keys(MODEL_CAPABILITY_LABELS) as (keyof ModelSettings)[]).map((capability) => {
                const catalogKey = capability === 'textFallback' ? 'text' : capability;
                const options = (MODEL_CATALOG as Record<string, readonly { id: string; label: string }[]>)[catalogKey] ?? [];
                const currentValue = currentModels[capability] ?? DEFAULT_MODEL_IDS[capability as keyof typeof DEFAULT_MODEL_IDS];
                const isCustom = !options.some((opt) => opt.id === currentValue);
                const selectValue = isCustom ? CUSTOM_MODEL_SENTINEL : currentValue;
                return (
                  <div key={capability}>
                    <label className="block text-xs font-medium text-gray-500 mb-2">
                      {MODEL_CAPABILITY_LABELS[capability]}
                    </label>
                    <select
                      value={selectValue}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (next === CUSTOM_MODEL_SENTINEL) {
                          updateModel(capability, '');
                        } else {
                          updateModel(capability, next);
                        }
                      }}
                      className="w-full px-4 py-2 bg-gray-50 dark:bg-[#131314] border border-gray-100 dark:border-gray-800 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {options.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                      <option value={CUSTOM_MODEL_SENTINEL}>Custom…</option>
                    </select>
                    {isCustom && (
                      <input
                        type="text"
                        value={currentValue}
                        onChange={(e) => updateModel(capability, e.target.value)}
                        placeholder="Enter custom model id"
                        className="mt-2 w-full px-4 py-2 bg-gray-50 dark:bg-[#131314] border border-gray-100 dark:border-gray-800 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                  </div>
                );
              })}

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">
                  Chat thinking budget ({settings.thinkingBudgets?.text ?? 8192} tokens)
                </label>
                <input
                  type="range"
                  min={0}
                  max={32768}
                  step={256}
                  value={settings.thinkingBudgets?.text ?? 8192}
                  onChange={(e) => updateThinkingBudget('text', Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">
                  Vision thinking budget ({settings.thinkingBudgets?.vision ?? 4096} tokens)
                </label>
                <input
                  type="range"
                  min={0}
                  max={32768}
                  step={256}
                  value={settings.thinkingBudgets?.vision ?? 4096}
                  onChange={(e) => updateThinkingBudget('vision', Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
          </section>

          {/* Cost & Usage Section */}
          <section>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">Cost &amp; Usage</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-gray-50 dark:bg-[#131314] rounded-xl border border-gray-100 dark:border-gray-800">
                  <div className="text-xs text-gray-500 mb-1">Today</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">${todayUsd.toFixed(2)}</div>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-[#131314] rounded-xl border border-gray-100 dark:border-gray-800">
                  <div className="text-xs text-gray-500 mb-1">This Month</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">${monthUsd.toFixed(2)}</div>
                </div>
              </div>

              {Object.keys(breakdown).length > 0 && (
                <div className="p-4 bg-gray-50 dark:bg-[#131314] rounded-xl border border-gray-100 dark:border-gray-800">
                  <div className="text-xs font-medium text-gray-500 mb-2">Today by capability</div>
                  <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                    {Object.entries(breakdown).map(([cap, usd]) => (
                      <li key={cap} className="flex justify-between">
                        <span className="capitalize">{cap}</span>
                        <span>${usd.toFixed(4)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2">Daily threshold (USD)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={settings.cost?.dailyThresholdUsd ?? 5}
                    onChange={(e) => updateCost('dailyThresholdUsd', Number(e.target.value))}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-[#131314] border border-gray-100 dark:border-gray-800 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2">Monthly threshold (USD)</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={settings.cost?.monthlyThresholdUsd ?? 100}
                    onChange={(e) => updateCost('monthlyThresholdUsd', Number(e.target.value))}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-[#131314] border border-gray-100 dark:border-gray-800 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">GCP Project ID</label>
                <input
                  type="text"
                  value={settings.cost?.gcpProjectId ?? ''}
                  onChange={(e) => updateCost('gcpProjectId', e.target.value)}
                  placeholder="my-gcp-project"
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-[#131314] border border-gray-100 dark:border-gray-800 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                onClick={handleSyncCloudBilling}
                className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                Sync with Cloud Billing
              </button>
              {syncResult && (
                <div className="text-xs text-gray-500 dark:text-gray-400">{syncResult}</div>
              )}
              {billingStatus && (
                <div className="text-xs text-gray-700 dark:text-gray-300">{billingStatus}</div>
              )}

              {history.length > 0 && (
                <div className="p-4 bg-gray-50 dark:bg-[#131314] rounded-xl border border-gray-100 dark:border-gray-800 max-h-48 overflow-y-auto">
                  <div className="text-xs font-medium text-gray-500 mb-2">Recent activity (30 days)</div>
                  <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                    {history.map((entry) => (
                      <li key={entry.id} className="flex justify-between gap-2">
                        <span>{new Date(entry.timestamp).toLocaleDateString()}</span>
                        <span className="truncate">{entry.capability}</span>
                        <span>${entry.estimatedCostUsd.toFixed(4)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          {/* Live Mode Section */}
          <section>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">Live Mode</h3>
            <div className="space-y-3">
              <label className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#131314] rounded-xl border border-gray-100 dark:border-gray-800 cursor-pointer">
                <span className="text-sm text-gray-900 dark:text-white">Voice transcription</span>
                <input
                  type="checkbox"
                  checked={settings.liveMode?.voiceTranscriptionEnabled ?? false}
                  onChange={(e) => updateLiveMode('voiceTranscriptionEnabled', e.target.checked)}
                  className="h-4 w-4"
                />
              </label>
              <label className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#131314] rounded-xl border border-gray-100 dark:border-gray-800 cursor-pointer">
                <span className="text-sm text-gray-900 dark:text-white">Camera transcription</span>
                <input
                  type="checkbox"
                  checked={settings.liveMode?.cameraTranscriptionEnabled ?? true}
                  onChange={(e) => updateLiveMode('cameraTranscriptionEnabled', e.target.checked)}
                  className="h-4 w-4"
                />
              </label>
              <label className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#131314] rounded-xl border border-gray-100 dark:border-gray-800 cursor-pointer">
                <span className="text-sm text-gray-900 dark:text-white">Screen transcription</span>
                <input
                  type="checkbox"
                  checked={settings.liveMode?.screenTranscriptionEnabled ?? true}
                  onChange={(e) => updateLiveMode('screenTranscriptionEnabled', e.target.checked)}
                  className="h-4 w-4"
                />
              </label>
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
              <label className="w-full py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl flex items-center justify-center gap-2 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors font-medium cursor-pointer">
                <Download size={18} className="rotate-180" /> Import Workspace Backup
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) backup.restore(file);
                  }}
                />
              </label>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
