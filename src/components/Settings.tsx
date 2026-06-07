import { useEffect, useState } from 'react';
import { X, Download, Shield, ShieldAlert, Zap, Lock, Globe, HardDrive, BookOpen, Radar, RefreshCw, FolderOpen, Plus } from 'lucide-react';
import { backup } from '../lib/backup';
import { AppSettings, AutonomyMode, ModelSettings, DEFAULT_MODEL_SETTINGS } from '../types';
import { DEFAULT_MODEL_IDS } from '../lib/model-catalog';
import { fetchAvailableGeminiModels, getModelOptionsForCapability, getRecommendedModelChanges } from '../lib/model-refresh';
import { costLedger, type LedgerEntry } from '../lib/cost-ledger';
import { fetchProjectBillingInfo } from '../lib/cloud-billing';
import { resolveMcpHttpBase } from '../lib/mcp';

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

interface DirectoryEntry {
  name: string;
  path: string;
}

export function parseDirectoryEntries(result: string, currentPath: string): DirectoryEntry[] {
  const base = currentPath.replace(/\/+$/, '') || '/';
  return result
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('[DIR] '))
    .map((line) => line.slice(6).trim())
    .filter((name) => name.length > 0 && name !== '.' && name !== '..')
    .map((name) => ({
      name,
      path: base === '/' ? `/${name}` : `${base}/${name}`,
    }));
}

function parentDirectory(path: string): string {
  const trimmed = path.trim().replace(/\/+$/, '');
  if (!trimmed || trimmed === '/') return '/';
  const parent = trimmed.slice(0, trimmed.lastIndexOf('/'));
  return parent || '/';
}

export function Settings({ onClose, settings, onUpdateSettings }: SettingsProps) {
  const [apiKeyDraft, setApiKeyDraft] = useState(settings.geminiApiKey || '');
  const [clientIdDraft, setClientIdDraft] = useState(settings.gcpOAuthClientId || '');
  const [clientSecretDraft, setClientSecretDraft] = useState(settings.gcpOAuthClientSecret || '');
  const [apiSaved, setApiSaved] = useState(false);
  const [modelRefreshing, setModelRefreshing] = useState(false);
  const [modelRefreshStatus, setModelRefreshStatus] = useState<string | null>(null);
  const [modelRefreshError, setModelRefreshError] = useState<string | null>(null);
  const [showRecommendedPreview, setShowRecommendedPreview] = useState(false);
  const [modelApplyStatus, setModelApplyStatus] = useState<string | null>(null);

  const handleSaveApiConfig = () => {
    onUpdateSettings({ ...settings, geminiApiKey: apiKeyDraft, gcpOAuthClientId: clientIdDraft, gcpOAuthClientSecret: clientSecretDraft });
    setApiSaved(true);
    setTimeout(() => setApiSaved(false), 2000);
  };

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    onUpdateSettings({ ...settings, [key]: value });
  };

  const currentModels: ModelSettings = { ...DEFAULT_MODEL_SETTINGS, ...(settings.models ?? {}) };
  const recommendedModelChanges = getRecommendedModelChanges(currentModels, settings.availableModelCatalog);

  const updateModel = (capability: keyof ModelSettings, modelId: string) => {
    setShowRecommendedPreview(false);
    onUpdateSettings({
      ...settings,
      models: { ...currentModels, [capability]: modelId },
    });
  };

  const handleRefreshGeminiModels = async () => {
    setModelRefreshing(true);
    setModelRefreshError(null);
    setModelRefreshStatus(null);
    setModelApplyStatus(null);
    setShowRecommendedPreview(false);
    try {
      const catalog = await fetchAvailableGeminiModels(settings.geminiApiKey);
      onUpdateSettings({ ...settings, availableModelCatalog: catalog });
      setModelRefreshStatus(`Fetched ${catalog.models.length} available model records from Google.`);
    } catch (err) {
      setModelRefreshError(err instanceof Error ? err.message : String(err));
    } finally {
      setModelRefreshing(false);
    }
  };

  const handleApplyRecommendedModels = () => {
    if (recommendedModelChanges.length === 0) {
      setModelApplyStatus('Current selections already match the recommended defaults.');
      setShowRecommendedPreview(false);
      return;
    }
    const nextModels = { ...currentModels };
    for (const change of recommendedModelChanges) {
      nextModels[change.capability] = change.to;
    }
    onUpdateSettings({ ...settings, models: nextModels });
    setModelApplyStatus(`Applied ${recommendedModelChanges.length} recommended model default${recommendedModelChanges.length === 1 ? '' : 's'}.`);
    setShowRecommendedPreview(false);
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
  const [mcpStatus, setMcpStatus] = useState<{ connected: boolean; toolCount: number; url: string } | null>(null);
  const [mcpStatusError, setMcpStatusError] = useState<string | null>(null);
  const [desktopCommanderConfig, setDesktopCommanderConfig] = useState<Record<string, any> | null>(null);
  const [allowedDirectoriesDraft, setAllowedDirectoriesDraft] = useState('');
  const [directoryExplorerPath, setDirectoryExplorerPath] = useState('/Applications');
  const [directoryExplorerEntries, setDirectoryExplorerEntries] = useState<DirectoryEntry[]>([]);
  const [directoryExplorerLoading, setDirectoryExplorerLoading] = useState(false);
  const [directoryExplorerError, setDirectoryExplorerError] = useState<string | null>(null);
  const MCP_API_BASE = resolveMcpHttpBase();

  const refreshMcpStatus = async () => {
    setMcpStatusError(null);
    try {
      const [diagnosticResp, configResp] = await Promise.all([
        fetch(`${MCP_API_BASE}/api/diagnostic?include_advanced=true`),
        fetch(`${MCP_API_BASE}/api/desktop-commander/config`),
      ]);
      const diagnostic = await diagnosticResp.json();
      const configPayload = await configResp.json();
      const mcp = diagnostic.advanced?.mcp_server;
      const config = configPayload.advanced?.config ?? null;
      setMcpStatus({
        connected: mcp?.status === 'connected',
        toolCount: Number(mcp?.tools_available ?? 0),
        url: mcp?.url ?? 'ws://127.0.0.1:13001/mcp',
      });
      setDesktopCommanderConfig(config);
      setAllowedDirectoriesDraft(Array.isArray(config?.allowedDirectories) ? config.allowedDirectories.join('\n') : '');
    } catch (err) {
      setMcpStatus(null);
      setDesktopCommanderConfig(null);
      setMcpStatusError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveAllowedDirectories = async () => {
    const value = allowedDirectoriesDraft
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    const resp = await fetch(`${MCP_API_BASE}/api/desktop-commander/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'allowedDirectories', value }),
    });
    if (!resp.ok) throw new Error(`Failed to update allowedDirectories: HTTP ${resp.status}`);
    await refreshMcpStatus();
  };

  const handleBrowseDirectory = async (path = directoryExplorerPath) => {
    const nextPath = path.trim() || '/';
    setDirectoryExplorerLoading(true);
    setDirectoryExplorerError(null);
    try {
      const resp = await fetch(`${MCP_API_BASE}/api/execute?action=list_directory&path=${encodeURIComponent(nextPath)}`, {
        method: 'POST',
      });
      const payload = await resp.json();
      const result = String(payload.result ?? '');
      if (!resp.ok || payload.status === 'failure' || result.startsWith('Error:')) {
        throw new Error(result || `Failed to list directory: HTTP ${resp.status}`);
      }
      setDirectoryExplorerPath(nextPath);
      setDirectoryExplorerEntries(parseDirectoryEntries(result, nextPath));
    } catch (err) {
      setDirectoryExplorerEntries([]);
      setDirectoryExplorerError(err instanceof Error ? err.message : String(err));
    } finally {
      setDirectoryExplorerLoading(false);
    }
  };

  const handleAddAllowedDirectory = (path: string) => {
    const normalized = path.trim().replace(/\/+$/, '') || '/';
    const existing = allowedDirectoriesDraft
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    if (existing.includes(normalized)) return;
    setAllowedDirectoriesDraft([...existing, normalized].join('\n'));
  };

  useEffect(() => {
    refreshMcpStatus().catch(console.error);
  }, []);

  const handleDetectMcp = async () => {
    setDetecting(true);
    setDetectedServers([]);
    try {
      const resp = await fetch(`${MCP_API_BASE}/detect-mcp`);
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
    { mode: 'safe', label: 'Safe Mode', icon: <Shield size={16} />, desc: 'Auto-approve reads; ask before file changes or commands.' },
    { mode: 'ask', label: 'Ask Mode', icon: <Lock size={16} />, desc: 'Ask before every local tool action.' },
    { mode: 'auto-accept', label: 'Auto Accept', icon: <ShieldAlert size={16} />, desc: 'Auto-approve file work; ask before shell commands.' },
    { mode: 'yolo', label: 'YOLO Mode', icon: <Zap size={16} />, desc: 'Never ask. Full local autonomous execution.' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#1e1f20] rounded-2xl w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">System Settings</h2>
          <button onClick={onClose} aria-label="Close settings" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
            <X size={24} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-8 pr-2">
          {/* API Configuration */}
          <section>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">API Configuration</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="settings-gemini-api-key" className="block text-xs font-medium text-gray-500 mb-2">Gemini API Key</label>
                <input
                  id="settings-gemini-api-key"
                  type="password"
                  value={apiKeyDraft}
                  onChange={(e) => { setApiKeyDraft(e.target.value); setApiSaved(false); }}
                  placeholder="AIzaSy..."
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-[#131314] border border-gray-100 dark:border-gray-800 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">This is stored locally and securely used for API requests.</p>
              </div>
              <div>
                <label htmlFor="settings-google-oauth-client-id" className="block text-xs font-medium text-gray-500 mb-2">Google OAuth Client ID</label>
                <input
                  id="settings-google-oauth-client-id"
                  type="text"
                  value={clientIdDraft}
                  onChange={(e) => { setClientIdDraft(e.target.value); setApiSaved(false); }}
                  placeholder="780337134686-xxxx.apps.googleusercontent.com"
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-[#131314] border border-gray-100 dark:border-gray-800 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Required for Google Drive integration. Create one at console.cloud.google.com/apis/credentials.</p>
              </div>
              <div>
                <label htmlFor="settings-google-oauth-client-secret" className="block text-xs font-medium text-gray-500 mb-2">Google OAuth Client Secret</label>
                <input
                  id="settings-google-oauth-client-secret"
                  type="password"
                  value={clientSecretDraft}
                  onChange={(e) => { setClientSecretDraft(e.target.value); setApiSaved(false); }}
                  placeholder="GOCSPX-..."
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-[#131314] border border-gray-100 dark:border-gray-800 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Required for "Web application" OAuth clients — Google needs it for the token exchange. Find it on the client in console.cloud.google.com/apis/credentials. Leave blank if you use a Desktop-app client (PKCE, no secret).</p>
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

          {/* Directory Lock Section */}
          <section>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">Directory Lock</h3>
            <div className="space-y-3 p-4 bg-gray-50 dark:bg-[#131314] rounded-xl border border-gray-100 dark:border-gray-800">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">Force Gemini to stay inside one folder</div>
                  <div className="text-xs text-gray-500 mt-1">
                    When enabled, local MCP file operations outside this root are blocked before they reach Desktop Commander. Shell/process execution is also blocked while locked.
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    aria-label="Enable directory lock"
                    checked={!!settings.directoryLock?.enabled}
                    onChange={(e) => updateSetting('directoryLock', { enabled: e.target.checked, rootPath: settings.directoryLock?.rootPath || '' })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                </label>
              </div>
              <div>
                <label htmlFor="settings-locked-root-path" className="block text-xs text-gray-500 mb-1">Locked root path</label>
                <input
                  id="settings-locked-root-path"
                  type="text"
                  value={settings.directoryLock?.rootPath || ''}
                  onChange={(e) => updateSetting('directoryLock', { enabled: !!settings.directoryLock?.enabled, rootPath: e.target.value })}
                  placeholder="/Volumes/SanDisk1Tb/Your Project"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-[#2a2b2c] border border-gray-200 dark:border-gray-700 rounded-lg"
                />
              </div>
              {settings.directoryLock?.enabled && !settings.directoryLock.rootPath.trim() && (
                <div className="text-xs text-amber-600 dark:text-amber-400">Directory lock is enabled but no root path is set.</div>
              )}
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
                  <input type="checkbox" aria-label="Enable Google Drive sync" checked={settings.googleDriveEnabled} onChange={(e) => updateSetting('googleDriveEnabled', e.target.checked)} className="sr-only peer" />
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
                    <input type="checkbox" aria-label="Auto-sync artifacts to Drive" checked={settings.autoSyncArtifacts} onChange={(e) => updateSetting('autoSyncArtifacts', e.target.checked)} className="sr-only peer" />
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
                  <input type="checkbox" aria-label="Enable NotebookLM" checked={settings.notebookLmEnabled} onChange={(e) => updateSetting('notebookLmEnabled', e.target.checked)} className="sr-only peer" />
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
                  <input type="checkbox" aria-label="Enable Google Search grounding" checked={settings.searchEnabled} onChange={(e) => updateSetting('searchEnabled', e.target.checked)} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </section>

          {/* MCP Servers Section */}
          <section>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">MCP Servers</h3>
            <div className="mb-4 p-4 bg-gray-50 dark:bg-[#131314] rounded-xl border border-gray-100 dark:border-gray-800 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">Desktop Commander Status</div>
                  <div className="text-xs text-gray-500">
                    {mcpStatus
                      ? `${mcpStatus.connected ? 'Connected' : 'Disconnected'} · ${mcpStatus.toolCount} tools · ${mcpStatus.url}`
                      : mcpStatusError ? `Detection failed: ${mcpStatusError}` : 'Not checked yet'}
                  </div>
                </div>
                <button
                  onClick={() => refreshMcpStatus().catch(console.error)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                >
                  Refresh
                </button>
              </div>
              <div>
                <label htmlFor="settings-dc-allowed-directories" className="block text-xs text-gray-500 mb-1">Desktop Commander allowed directories</label>
                <textarea
                  id="settings-dc-allowed-directories"
                  value={allowedDirectoriesDraft}
                  onChange={(e) => setAllowedDirectoriesDraft(e.target.value)}
                  placeholder="One absolute path per line. Empty means full filesystem access in Desktop Commander."
                  rows={4}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-[#2a2b2c] border border-gray-200 dark:border-gray-700 rounded-lg font-mono"
                />
                <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-[#1e1f20]">
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300">
                    <FolderOpen size={14} />
                    File explorer
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      aria-label="Directory explorer path"
                      value={directoryExplorerPath}
                      onChange={(e) => setDirectoryExplorerPath(e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-700 dark:bg-[#131314] dark:text-white"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleBrowseDirectory(parentDirectory(directoryExplorerPath))}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBrowseDirectory()}
                        disabled={directoryExplorerLoading}
                        className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
                      >
                        {directoryExplorerLoading ? 'Browsing…' : 'Browse'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddAllowedDirectory(directoryExplorerPath)}
                        className="inline-flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-2 text-xs font-medium text-white hover:bg-purple-700"
                      >
                        <Plus size={13} />
                        Add
                      </button>
                    </div>
                  </div>
                  {directoryExplorerError ? (
                    <div className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-200">
                      {directoryExplorerError}
                    </div>
                  ) : null}
                  {directoryExplorerEntries.length > 0 ? (
                    <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-gray-100 dark:border-gray-800">
                      {directoryExplorerEntries.map((entry) => (
                        <div key={entry.path} className="flex items-center justify-between gap-2 border-b border-gray-100 px-2 py-1.5 last:border-b-0 dark:border-gray-800">
                          <button
                            type="button"
                            onClick={() => handleBrowseDirectory(entry.path)}
                            className="min-w-0 flex-1 truncate text-left text-xs font-mono text-gray-700 hover:text-purple-700 dark:text-gray-200 dark:hover:text-purple-300"
                            title={entry.path}
                          >
                            {entry.name}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAddAllowedDirectory(entry.path)}
                            className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-purple-700 hover:bg-purple-50 dark:text-purple-200 dark:hover:bg-purple-900/30"
                          >
                            Add
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-gray-500">
                      Browse a folder, then add the current path or one of its child folders to the allowlist.
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between mt-2 gap-3">
                  <div className="text-xs text-gray-500">
                    You decide Desktop Commander privileges. The directory lock above is an additional GEMINI-side guardrail.
                  </div>
                  <button
                    onClick={() => handleSaveAllowedDirectories().catch((err) => setMcpStatusError(err instanceof Error ? err.message : String(err)))}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700"
                  >
                    Save Privileges
                  </button>
                </div>
                {desktopCommanderConfig && (
                  <div className="mt-2 text-[11px] text-gray-500">
                    Read limit: {String(desktopCommanderConfig.fileReadLineLimit ?? 'default')} · Write limit: {String(desktopCommanderConfig.fileWriteLineLimit ?? 'default')} · Telemetry: {String(desktopCommanderConfig.telemetryEnabled ?? 'unknown')}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-4">
              {settings.mcpServers?.map((server, index) => (
                <div key={server.id} className="p-4 bg-gray-50 dark:bg-[#131314] rounded-xl border border-gray-100 dark:border-gray-800">
                  <div className="flex justify-between items-center mb-2">
                    <input
                      type="text"
                      aria-label="MCP server name"
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
                        aria-label="MCP server type"
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
                        <option value="http">http</option>
                      </select>
                      <label className="relative inline-flex items-center cursor-pointer ml-2">
                        <input
                          type="checkbox"
                          aria-label="Toggle MCP server enabled"
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
                        aria-label="Delete MCP server"
                        className="text-red-500 hover:text-red-700 ml-2"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  {server.type === 'stdio' ? (
                    <div className="space-y-2 mt-3">
                      <div>
                        <label htmlFor={`mcp-command-${index}`} className="block text-xs text-gray-500 mb-1">Command</label>
                        <input 
                          type="text" 
                          id={`mcp-command-${index}`}
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
                        <label htmlFor={`mcp-args-${index}`} className="block text-xs text-gray-500 mb-1">Args (comma separated)</label>
                        <input 
                          type="text" 
                          id={`mcp-args-${index}`}
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
                      <label htmlFor={`mcp-url-${index}`} className="block text-xs text-gray-500 mb-1">URL</label>
                      <input 
                        type="text" 
                        id={`mcp-url-${index}`}
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
              <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/30 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">Available Gemini model catalog</div>
                    <p className="text-xs text-gray-500 mt-1">
                      Manual refresh sends a model-list request to Google using the saved Gemini API key. It stores a timestamped catalog and updates dropdown choices without changing your current model selections.
                    </p>
                    {settings.availableModelCatalog ? (
                      <p className="text-xs text-gray-500 mt-2">
                        Last refreshed {new Date(settings.availableModelCatalog.fetchedAt).toLocaleString()} · {settings.availableModelCatalog.models.length} usable records from {settings.availableModelCatalog.rawCount} returned models.
                      </p>
                    ) : (
                      <p className="text-xs text-gray-500 mt-2">No fetched catalog yet. Curated fallback defaults are still available.</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleRefreshGeminiModels().catch(console.error)}
                    disabled={modelRefreshing || !settings.geminiApiKey.trim()}
                    className="shrink-0 px-3 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    title={!settings.geminiApiKey.trim() ? 'Save a Gemini API key first.' : undefined}
                  >
                    <RefreshCw size={14} className={modelRefreshing ? 'animate-spin' : ''} />
                    {modelRefreshing ? 'Refreshing…' : 'Refresh available models'}
                  </button>
                </div>
                {!settings.geminiApiKey.trim() && (
                  <div className="text-xs text-amber-700 dark:text-amber-300">Save a Gemini API key before refreshing the live model catalog.</div>
                )}
                {modelRefreshStatus && <div className="text-xs text-green-700 dark:text-green-300">{modelRefreshStatus}</div>}
                {modelRefreshError && <div className="text-xs text-red-700 dark:text-red-300">{modelRefreshError}</div>}
                {modelApplyStatus && <div className="text-xs text-green-700 dark:text-green-300">{modelApplyStatus}</div>}
                <div className="border-t border-blue-100 dark:border-blue-900/40 pt-3">
                  <button
                    onClick={() => {
                      setModelApplyStatus(null);
                      setShowRecommendedPreview(true);
                    }}
                    disabled={recommendedModelChanges.length === 0}
                    className="px-3 py-2 text-xs font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Apply recommended defaults…
                  </button>
                  <p className="text-xs text-gray-500 mt-2">
                    This is separate from refresh. It previews exact model changes before modifying selections.
                  </p>
                  {showRecommendedPreview && (
                    <div className="mt-3 p-3 bg-white dark:bg-[#1e1f20] rounded-lg border border-blue-100 dark:border-blue-900/40 space-y-3">
                      <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">Recommended model changes</div>
                      {recommendedModelChanges.length > 0 ? (
                        <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
                          {recommendedModelChanges.map(change => (
                            <li key={change.capability}>
                              <span className="font-medium">{MODEL_CAPABILITY_LABELS[change.capability]}:</span> {change.from || '(empty)'} → {change.to}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-xs text-gray-500">Current selections already match the recommended defaults.</div>
                      )}
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setShowRecommendedPreview(false)}
                          className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleApplyRecommendedModels}
                          disabled={recommendedModelChanges.length === 0}
                          className="px-3 py-1.5 text-xs rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                        >
                          Confirm apply recommended defaults
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {(Object.keys(MODEL_CAPABILITY_LABELS) as (keyof ModelSettings)[]).map((capability) => {
                const currentValue = currentModels[capability] ?? DEFAULT_MODEL_IDS[capability as keyof typeof DEFAULT_MODEL_IDS];
                const options = getModelOptionsForCapability(capability, currentValue, settings.availableModelCatalog);
                const isCustom = !currentValue || !options.some((opt) => opt.id === currentValue);
                const selectValue = isCustom ? CUSTOM_MODEL_SENTINEL : currentValue;
                return (
                  <div key={capability}>
                    <label htmlFor={`model-${capability}`} className="block text-xs font-medium text-gray-500 mb-2">
                      {MODEL_CAPABILITY_LABELS[capability]}
                    </label>
                    <select
                      id={`model-${capability}`}
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
                        <option key={`${capability}-${opt.id}-${opt.source}`} value={opt.id}>
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
                        aria-label={`Custom model id for ${MODEL_CAPABILITY_LABELS[capability]}`}
                        placeholder="Enter custom model id"
                        className="mt-2 w-full px-4 py-2 bg-gray-50 dark:bg-[#131314] border border-gray-100 dark:border-gray-800 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                  </div>
                );
              })}

              <div>
                <label htmlFor="settings-thinking-budget-text" className="block text-xs font-medium text-gray-500 mb-2">
                  Chat thinking budget ({settings.thinkingBudgets?.text ?? 8192} tokens)
                </label>
                <input
                  id="settings-thinking-budget-text"
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
                <label htmlFor="settings-thinking-budget-vision" className="block text-xs font-medium text-gray-500 mb-2">
                  Vision thinking budget ({settings.thinkingBudgets?.vision ?? 4096} tokens)
                </label>
                <input
                  id="settings-thinking-budget-vision"
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
                  <label htmlFor="settings-cost-daily-threshold" className="block text-xs font-medium text-gray-500 mb-2">Daily threshold (USD)</label>
                  <input
                    id="settings-cost-daily-threshold"
                    type="number"
                    min={0}
                    step={0.5}
                    value={settings.cost?.dailyThresholdUsd ?? 5}
                    onChange={(e) => updateCost('dailyThresholdUsd', Number(e.target.value))}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-[#131314] border border-gray-100 dark:border-gray-800 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="settings-cost-monthly-threshold" className="block text-xs font-medium text-gray-500 mb-2">Monthly threshold (USD)</label>
                  <input
                    id="settings-cost-monthly-threshold"
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
                <label htmlFor="settings-cost-gcp-project-id" className="block text-xs font-medium text-gray-500 mb-2">GCP Project ID</label>
                <input
                  id="settings-cost-gcp-project-id"
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
