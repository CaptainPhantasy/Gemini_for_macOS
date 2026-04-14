import { useState, useEffect } from 'react';
import { ScheduledAction } from '../types';
import { storage } from '../lib/storage';
import { scheduler, type InstallPlan, type UninstallPlan } from '../lib/scheduler-installer';
import { v4 as uuidv4 } from 'uuid';
import { X, Save, Play, Trash2, Copy, Info } from 'lucide-react';

interface ScheduledActionsProps {
  onClose: () => void;
}

// TODO: Make this a user setting for portability. Hardcoded for now since this
// is a personal tool tied to Douglas's machine layout.
const SCRIPT_PATH = '/Volumes/SanDisk1Tb/GEMINI for MacOS/scripts/run-scheduled-action.js';

type PlanEntry =
  | { kind: 'install'; plan: InstallPlan }
  | { kind: 'uninstall'; plan: UninstallPlan };

export function ScheduledActions({ onClose }: ScheduledActionsProps) {
  const [actions, setActions] = useState<ScheduledAction[]>([]);
  const [cron, setCron] = useState('');
  const [prompt, setPrompt] = useState('');
  const [plans, setPlans] = useState<Record<string, PlanEntry>>({});
  const [runNowMessage, setRunNowMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    setActions(storage.getScheduledActions());
  }, []);

  const handleSave = async () => {
    if (!cron.trim() || !prompt.trim()) return;

    const newAction: ScheduledAction = {
      id: uuidv4(),
      cron,
      prompt,
      enabled: true
    };

    await storage.saveScheduledAction(newAction);
    setActions([...storage.getScheduledActions()]);

    const plan = scheduler.buildInstallPlan(newAction, SCRIPT_PATH);
    setPlans(prev => ({ ...prev, [newAction.id]: { kind: 'install', plan } }));

    setCron('');
    setPrompt('');
  };

  const handleShowInstall = (action: ScheduledAction) => {
    const plan = scheduler.buildInstallPlan(action, SCRIPT_PATH);
    setPlans(prev => ({ ...prev, [action.id]: { kind: 'install', plan } }));
  };

  const handleDelete = (action: ScheduledAction) => {
    const plan = scheduler.buildUninstallPlan(action.id);
    setPlans(prev => ({ ...prev, [action.id]: { kind: 'uninstall', plan } }));
  };

  const handleRunNow = () => {
    setRunNowMessage('Run Now requires the scheduler script installed. See Install Commands below.');
    window.setTimeout(() => setRunNowMessage(null), 5000);
  };

  const handleCopy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(curr => (curr === key ? null : curr)), 1500);
    } catch {
      // Clipboard may be unavailable; fail silently — user can select manually.
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-[#1e1f20] rounded-2xl w-full max-w-2xl p-6 shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Scheduled Actions</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X size={24} />
          </button>
        </div>

        {runNowMessage && (
          <div className="mb-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-200 flex items-start gap-2">
            <Info size={16} className="mt-0.5 flex-shrink-0" />
            <span>{runNowMessage}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-4 mb-4">
          {actions.map(action => {
            const entry = plans[action.id];
            return (
              <div key={action.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-gray-900 dark:text-white font-mono">{action.cron}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 break-words">{action.prompt}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                      {action.enabled ? 'Active' : 'Paused'}
                    </span>
                    <button
                      onClick={handleRunNow}
                      title="Run Now"
                      className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      <Play size={16} />
                    </button>
                    <button
                      onClick={() => handleShowInstall(action)}
                      className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                      Install Commands
                    </button>
                    <button
                      onClick={() => handleDelete(action)}
                      title="Delete"
                      className="p-1.5 rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {entry?.kind === 'install' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        Install Commands (paste into Terminal)
                      </span>
                      <button
                        onClick={() => handleCopy(`install-${action.id}`, entry.plan.installCommand)}
                        className="text-xs flex items-center gap-1 px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                      >
                        <Copy size={12} />
                        {copiedKey === `install-${action.id}` ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <pre className="text-xs p-3 bg-gray-50 dark:bg-[#131314] border border-gray-200 dark:border-gray-800 rounded-lg overflow-x-auto whitespace-pre-wrap break-all text-gray-800 dark:text-gray-200">
{entry.plan.installCommand}
                    </pre>
                  </div>
                )}

                {entry?.kind === 'uninstall' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        Uninstall Commands (paste into Terminal)
                      </span>
                      <button
                        onClick={() => handleCopy(`uninstall-${action.id}`, entry.plan.uninstallCommand)}
                        className="text-xs flex items-center gap-1 px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                      >
                        <Copy size={12} />
                        {copiedKey === `uninstall-${action.id}` ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <pre className="text-xs p-3 bg-gray-50 dark:bg-[#131314] border border-gray-200 dark:border-gray-800 rounded-lg overflow-x-auto whitespace-pre-wrap break-all text-gray-800 dark:text-gray-200">
{entry.plan.uninstallCommand}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
          {actions.length === 0 && <p className="text-gray-500 text-sm">No scheduled actions.</p>}
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Create New Action</h3>
          <input
            type="text"
            placeholder="Cron Expression (e.g., 0 9 * * *)"
            value={cron}
            onChange={e => setCron(e.target.value)}
            className="w-full p-2 bg-gray-50 dark:bg-[#131314] border border-gray-200 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white font-mono"
          />
          <textarea
            placeholder="Prompt to execute"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            className="w-full h-24 p-2 bg-gray-50 dark:bg-[#131314] border border-gray-200 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white resize-none"
          />
          <button onClick={handleSave} className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex justify-center items-center gap-2">
            <Save size={18} /> Schedule Action
          </button>
        </div>
      </div>
    </div>
  );
}
