import { useState, useEffect, type ReactElement } from 'react';
import {
  X,
  HardDrive,
  FileText,
  Calendar,
  BookOpen,
  Mail,
  Plane,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  FolderOpen,
  ExternalLink,
} from 'lucide-react';
import {
  calendarEventsToMarkdown,
  integrations,
  type CalendarEventSummary,
  type DriveFileSummary,
  type GmailMessageSummary,
  type ImportResult,
} from '../lib/integrations';
import { oauthHandler, GOOGLE_WORKSPACE_SCOPES, type OAuthConfig } from '../lib/oauth-handler';
import { buildDrivePickerOAuthConfig, importPickedDriveFiles } from '../lib/google-picker';
import {
  buildNotebookLmSourcePack,
  NOTEBOOKLM_HANDOFF_URL,
  uploadNotebookLmSourcePack,
} from '../lib/notebooklm-handoff';
import { storage } from '../lib/storage';
import type { Artifact, Thread } from '../types';

interface IntegrationsProps {
  isOpen: boolean;
  onClose: () => void;
  gcpClientId?: string;
  notebookLmEnabled?: boolean;
  activeThread?: Thread | null;
}

type ServiceKey = 'drive' | 'docs' | 'calendar' | 'gmail';

interface ConnectionState {
  connected: boolean;
  connectedAt?: number;
}

interface BannerState {
  kind: 'success' | 'error';
  message: string;
}

const REDIRECT_URI = 'http://localhost:13000/oauth/callback';
const LS_CONNECTIONS_KEY = 'gemini-for-macos:integrations:connections';
function defaultConnections(): Record<ServiceKey, ConnectionState> {
  return {
    drive: { connected: false },
    docs: { connected: false },
    calendar: { connected: false },
    gmail: { connected: false },
  };
}

function loadConnectionsFromStorage(): Record<ServiceKey, ConnectionState> {
  const defaults = defaultConnections();
  try {
    const raw = localStorage.getItem(LS_CONNECTIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        return { ...defaults, ...(parsed as Partial<Record<ServiceKey, ConnectionState>>) };
      }
    }
  } catch (e) {
    console.warn('Failed to load connection state from localStorage:', e);
  }
  return defaults;
}

function saveConnectionsToStorage(connections: Record<ServiceKey, ConnectionState>): void {
  try {
    localStorage.setItem(LS_CONNECTIONS_KEY, JSON.stringify(connections));
  } catch (e) {
    console.warn('Failed to save connection state to localStorage:', e);
  }
}

function generateArtifactId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `art_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildOAuthConfig(clientId: string): OAuthConfig {
  return {
    clientId,
    redirectUri: REDIRECT_URI,
    scopes: [...GOOGLE_WORKSPACE_SCOPES],
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function artifactTypeForImport(result: ImportResult): Artifact['type'] {
  const mimeType = result.mimeType ?? '';
  const isText =
    mimeType.length === 0 ||
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml';
  return isText ? 'text' : 'research';
}

export function Integrations({
  isOpen,
  onClose,
  gcpClientId,
  notebookLmEnabled,
  activeThread,
}: IntegrationsProps): ReactElement | null {
  const [connections, setConnections] = useState<Record<ServiceKey, ConnectionState>>(loadConnectionsFromStorage());
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFileSummary[] | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventSummary[] | null>(null);
  const [gmailMessages, setGmailMessages] = useState<GmailMessageSummary[] | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [notebookLmDriveFileId, setNotebookLmDriveFileId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        if (!cancelled) setArtifacts(storage.getArtifacts());
      } catch {
        /* no artifacts */
      }
      if (!gcpClientId) return;
      try {
        const token = await oauthHandler.getAccessToken(buildOAuthConfig(gcpClientId));
        if (token && !cancelled) {
          setConnections({
            drive: { connected: true, connectedAt: Date.now() },
            docs: { connected: true, connectedAt: Date.now() },
            calendar: { connected: true, connectedAt: Date.now() },
            gmail: { connected: true, connectedAt: Date.now() },
          });
        }
      } catch {
        /* no valid token */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, gcpClientId]);

  useEffect(() => {
    saveConnectionsToStorage(connections);
  }, [connections]);

  if (!isOpen) return null;

  const showBanner = (state: BannerState): void => {
    setBanner(state);
    window.setTimeout(() => {
      setBanner((current) => (current === state ? null : current));
    }, 5000);
  };

  const requireClientId = (): string | null => {
    if (!gcpClientId) {
      showBanner({ kind: 'error', message: 'Configure a Google OAuth Client ID in Settings first.' });
      return null;
    }
    return gcpClientId;
  };

  const markAllConnected = (): void => {
    setConnections({
      drive: { connected: true, connectedAt: Date.now() },
      docs: { connected: true, connectedAt: Date.now() },
      calendar: { connected: true, connectedAt: Date.now() },
      gmail: { connected: true, connectedAt: Date.now() },
    });
  };

  const handleConnect = async (key: ServiceKey): Promise<void> => {
    const clientId = requireClientId();
    if (!clientId) return;
    setBusy(`connect:${key}`);
    try {
      await oauthHandler.initiateOAuth(buildOAuthConfig(clientId));
      markAllConnected();
      showBanner({ kind: 'success', message: 'Connected to Google Workspace.' });
    } catch (error) {
      showBanner({ kind: 'error', message: `Connect failed: ${errorMessage(error)}` });
    } finally {
      setBusy(null);
    }
  };

  const getToken = async (clientId: string): Promise<string | null> => {
    const token = await oauthHandler.getAccessToken(buildOAuthConfig(clientId));
    if (!token) {
      showBanner({ kind: 'error', message: 'No access token available. Connect first.' });
      return null;
    }
    return token;
  };

  const persistAsArtifact = async (result: ImportResult, fallbackName: string): Promise<Artifact | null> => {
    if (!result.content) return null;
    const artifact: Artifact = {
      id: result.artifactId ?? generateArtifactId(),
      title: result.title ?? fallbackName,
      content: result.content,
      type: artifactTypeForImport(result),
      createdAt: Date.now(),
      ...(result.mimeType ? { mimeType: result.mimeType } : {}),
      metadata: {
        ...(result.sourceFileId ? { sourceFileId: result.sourceFileId } : {}),
        ...(result.sourceType ? { sourceType: result.sourceType } : {}),
        ...(result.fetchedAt ? { fetchedAt: result.fetchedAt } : {}),
      },
    };
    await storage.saveArtifact(artifact);
    setArtifacts(storage.getArtifacts());
    return artifact;
  };

  const handleListDriveFiles = async (): Promise<void> => {
    const clientId = requireClientId();
    if (!clientId) return;
    setBusy('drive:list');
    try {
      const token = await getToken(clientId);
      if (!token) return;
      setDriveFiles(await integrations.googleWorkspace.listFiles(token));
    } catch (error) {
      showBanner({ kind: 'error', message: `List files failed: ${errorMessage(error)}` });
    } finally {
      setBusy(null);
    }
  };

  const handleImportDriveFile = async (fileId: string, fallbackName: string): Promise<void> => {
    const clientId = requireClientId();
    if (!clientId) return;
    setBusy(`drive:import:${fileId}`);
    try {
      const token = await getToken(clientId);
      if (!token) return;
      const result = await integrations.googleWorkspace.importFile(token, fileId);
      if (!result.ok || !result.content) {
        showBanner({ kind: 'error', message: result.error ?? 'Import failed' });
        return;
      }
      const artifact = await persistAsArtifact(result, fallbackName);
      if (artifact) showBanner({ kind: 'success', message: `Imported as artifact: ${artifact.title}` });
    } catch (error) {
      showBanner({ kind: 'error', message: `Import failed: ${errorMessage(error)}` });
    } finally {
      setBusy(null);
    }
  };

  const handlePickDriveFiles = async (): Promise<void> => {
    const clientId = requireClientId();
    if (!clientId) return;
    setBusy('drive:picker');
    try {
      const pickerConfig = buildDrivePickerOAuthConfig({
        clientId,
        redirectUri: REDIRECT_URI,
        allowMultiple: true,
      });
      const pickerTokens = await oauthHandler.initiateOAuth(pickerConfig);
      const pickedFileIds = pickerTokens.pickedFileIds ?? [];
      if (pickedFileIds.length === 0) {
        showBanner({ kind: 'error', message: 'Drive Picker returned no selected file IDs.' });
        return;
      }

      const results = await importPickedDriveFiles({
        accessToken: pickerTokens.accessToken,
        fileIds: pickedFileIds,
        importFile: integrations.googleWorkspace.importFile,
      });

      const maxPersistenceConcurrency = 3;
      let imported = 0;
      let nextPersistIndex = 0;
      const persistWorker = async () => {
        while (nextPersistIndex < results.length) {
          const resultIndex = nextPersistIndex++;
          const result = results[resultIndex];
          if (result.ok && result.content) {
            const artifact = await persistAsArtifact(result, result.title ?? 'Picked Drive file');
            if (artifact) imported += 1;
          }
        }
      };

      await Promise.all(Array.from({ length: Math.max(1, Math.min(maxPersistenceConcurrency, results.length)) }, () => persistWorker()));

      setConnections((prev) => ({ ...prev, drive: { connected: true, connectedAt: Date.now() } }));
      showBanner({ kind: imported > 0 ? 'success' : 'error', message: `Drive Picker imported ${imported}/${results.length} file(s).` });
    } catch (error) {
      showBanner({ kind: 'error', message: `Drive Picker failed: ${errorMessage(error)}` });
    } finally {
      setBusy(null);
    }
  };

  const handleImportDoc = async (): Promise<void> => {
    const clientId = requireClientId();
    if (!clientId) return;
    const documentId = window.prompt('Enter Google Doc ID:');
    if (!documentId) return;
    setBusy('docs:import');
    try {
      const token = await getToken(clientId);
      if (!token) return;
      const result = await integrations.googleWorkspace.readDocument(token, documentId.trim());
      if (!result.ok || !result.content) {
        showBanner({ kind: 'error', message: result.error ?? 'Read failed' });
        return;
      }
      const artifact = await persistAsArtifact(result, result.title ?? 'Untitled Document');
      if (artifact) showBanner({ kind: 'success', message: `Imported as artifact: ${artifact.title}` });
    } catch (error) {
      showBanner({ kind: 'error', message: `Doc import failed: ${errorMessage(error)}` });
    } finally {
      setBusy(null);
    }
  };

  const handleListEvents = async (): Promise<void> => {
    const clientId = requireClientId();
    if (!clientId) return;
    setBusy('calendar:list');
    try {
      const token = await getToken(clientId);
      if (!token) return;
      const events = await integrations.googleWorkspace.listUpcomingEvents(token, 10);
      setCalendarEvents(events);
      if (events.length > 0) {
        const artifact = await persistAsArtifact(
          {
            ok: true,
            title: `Upcoming events (${new Date().toLocaleDateString()})`,
            content: calendarEventsToMarkdown(events),
            mimeType: 'text/markdown',
            sourceType: 'calendar',
            fetchedAt: Date.now(),
          },
          'Upcoming Calendar Events'
        );
        if (artifact) showBanner({ kind: 'success', message: `Imported as artifact: ${artifact.title}` });
      } else {
        showBanner({ kind: 'success', message: 'No upcoming events found.' });
      }
    } catch (error) {
      showBanner({ kind: 'error', message: `Calendar list failed: ${errorMessage(error)}` });
    } finally {
      setBusy(null);
    }
  };

  const handleListGmailMessages = async (): Promise<void> => {
    const clientId = requireClientId();
    if (!clientId) return;
    setBusy('gmail:list');
    try {
      const token = await getToken(clientId);
      if (!token) return;
      const messages = await integrations.googleWorkspace.listGmailMessages(token, 10);
      setGmailMessages(messages);
      setConnections((prev) => ({ ...prev, gmail: { connected: true, connectedAt: Date.now() } }));
      if (messages.length === 0) showBanner({ kind: 'success', message: 'No recent Gmail messages found.' });
    } catch (error) {
      showBanner({ kind: 'error', message: `Gmail list failed: ${errorMessage(error)}` });
    } finally {
      setBusy(null);
    }
  };

  const handleImportGmailMessage = async (messageId: string, fallbackSubject: string): Promise<void> => {
    const clientId = requireClientId();
    if (!clientId) return;
    setBusy(`gmail:import:${messageId}`);
    try {
      const token = await getToken(clientId);
      if (!token) return;
      const result = await integrations.googleWorkspace.importGmailMessage(token, messageId);
      if (!result.ok || !result.content) {
        showBanner({ kind: 'error', message: result.error ?? 'Gmail import failed' });
        return;
      }
      const artifact = await persistAsArtifact(result, fallbackSubject || 'Gmail Message');
      if (artifact) showBanner({ kind: 'success', message: `Imported Gmail as artifact: ${artifact.title}` });
    } catch (error) {
      showBanner({ kind: 'error', message: `Gmail import failed: ${errorMessage(error)}` });
    } finally {
      setBusy(null);
    }
  };
  const uploadNotebookLmPack = async (packTitle: string, packArtifacts: Artifact[], thread?: Thread | null): Promise<void> => {
    const clientId = requireClientId();
    if (!clientId) return;
    setBusy('notebooklm:upload');
    try {
      const token = await getToken(clientId);
      if (!token) return;
      const pack = buildNotebookLmSourcePack({ title: packTitle, artifacts: packArtifacts, thread });
      const result = await uploadNotebookLmSourcePack({
        accessToken: token,
        pack,
        uploadFile: integrations.googleWorkspace.uploadFile,
      });
      if (!result.ok || !result.fileId) {
        showBanner({ kind: 'error', message: result.error ?? 'NotebookLM source-pack upload failed' });
        return;
      }
      setNotebookLmDriveFileId(result.fileId);
      showBanner({ kind: 'success', message: `Uploaded ${pack.fileName} to Drive. Opening NotebookLM…` });
      window.open(result.notebookLmUrl, '_blank');
    } catch (error) {
      showBanner({ kind: 'error', message: `NotebookLM handoff failed: ${errorMessage(error)}` });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#1e1f20] rounded-2xl w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Integrations</h2>
          <button
            onClick={onClose}
            aria-label="Close integrations"
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {banner ? (
          <div
            role="status"
            className={`mb-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
              banner.kind === 'success'
                ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                : 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200'
            }`}
          >
            {banner.kind === 'success' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
            <span>{banner.message}</span>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          {!gcpClientId ? (
            <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
              Configure a Google OAuth Client ID in Settings to enable Google connections.
            </div>
          ) : (
            <>
              <section className="rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                <header className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <HardDrive size={18} className="text-blue-600" />
                    <h3 className="font-semibold text-gray-900 dark:text-white">Google Drive</h3>
                  </div>
                  <span className="text-xs text-gray-500">{connections.drive.connected ? 'Connected' : 'Not connected'}</span>
                </header>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => handleConnect('drive')} disabled={busy !== null} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
                    {busy === 'connect:drive' ? <Loader2 className="animate-spin" size={14} /> : 'Connect'}
                  </button>
                  <button onClick={handlePickDriveFiles} disabled={busy !== null} className="rounded-lg bg-blue-50 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:bg-blue-900/30 dark:text-blue-200 dark:hover:bg-blue-900/50">
                    {busy === 'drive:picker' ? 'Opening Picker…' : <span className="inline-flex items-center gap-1"><FolderOpen size={14} /> Pick from Drive</span>}
                  </button>
                  <button onClick={handleListDriveFiles} disabled={busy !== null} className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
                    {busy === 'drive:list' ? 'Loading...' : 'List recent files'}
                  </button>
                </div>
                {driveFiles && driveFiles.length > 0 ? (
                  <ul className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                    {driveFiles.map((file) => (
                      <li key={file.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="truncate text-gray-800 dark:text-gray-100">{file.name}</span>
                        <button onClick={() => handleImportDriveFile(file.id, file.name)} disabled={busy !== null} className="shrink-0 rounded bg-gray-100 dark:bg-gray-800 px-2 py-1 text-xs hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50">
                          Import
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {driveFiles && driveFiles.length === 0 ? <p className="mt-3 text-xs text-gray-500">No files returned.</p> : null}
              </section>

              <section className="rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                <header className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText size={18} className="text-emerald-600" />
                    <h3 className="font-semibold text-gray-900 dark:text-white">Google Docs</h3>
                  </div>
                  <span className="text-xs text-gray-500">{connections.docs.connected ? 'Connected' : 'Not connected'}</span>
                </header>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => handleConnect('docs')} disabled={busy !== null} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">
                    {busy === 'connect:docs' ? <Loader2 className="animate-spin" size={14} /> : 'Connect'}
                  </button>
                  <button onClick={handleImportDoc} disabled={busy !== null} className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
                    {busy === 'docs:import' ? 'Importing...' : 'Import a document'}
                  </button>
                </div>
              </section>

              <section className="rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                <header className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Calendar size={18} className="text-purple-600" />
                    <h3 className="font-semibold text-gray-900 dark:text-white">Google Calendar</h3>
                  </div>
                  <span className="text-xs text-gray-500">{connections.calendar.connected ? 'Connected' : 'Not connected'}</span>
                </header>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => handleConnect('calendar')} disabled={busy !== null} className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700 disabled:opacity-50">
                    {busy === 'connect:calendar' ? <Loader2 className="animate-spin" size={14} /> : 'Connect'}
                  </button>
                  <button onClick={handleListEvents} disabled={busy !== null} className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
                    {busy === 'calendar:list' ? 'Loading...' : 'List upcoming events'}
                  </button>
                </div>
                {calendarEvents && calendarEvents.length > 0 ? (
                  <ul className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                    {calendarEvents.map((event) => (
                      <li key={event.id} className="px-3 py-2 text-sm">
                        <div className="text-gray-800 dark:text-gray-100">{event.summary}</div>
                        <div className="text-xs text-gray-500">{event.start}</div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>


              <section className="rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                <header className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Mail size={18} className="text-red-600" />
                    <h3 className="font-semibold text-gray-900 dark:text-white">Gmail</h3>
                  </div>
                  <span className="text-xs text-gray-500">{connections.gmail.connected ? 'Connected' : 'Not connected'}</span>
                </header>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => handleConnect('gmail')} disabled={busy !== null} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50">
                    {busy === 'connect:gmail' ? <Loader2 className="animate-spin" size={14} /> : 'Connect'}
                  </button>
                  <button onClick={handleListGmailMessages} disabled={busy !== null} className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
                    {busy === 'gmail:list' ? 'Loading...' : 'List recent mail'}
                  </button>
                </div>
                {gmailMessages && gmailMessages.length > 0 ? (
                  <ul className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                    {gmailMessages.map((message) => (
                      <li key={message.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <div className="truncate text-gray-900 dark:text-gray-100">{message.subject}</div>
                          <div className="truncate text-xs text-gray-500">{message.from ?? '(unknown sender)'}</div>
                          <div className="line-clamp-2 text-xs text-gray-500">{message.snippet}</div>
                        </div>
                        <button onClick={() => handleImportGmailMessage(message.id, message.subject)} disabled={busy !== null} className="shrink-0 rounded bg-gray-100 dark:bg-gray-800 px-2 py-1 text-xs hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50">
                          Import
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
              {notebookLmEnabled !== false && (
                <section className="rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                  <header className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <BookOpen size={18} className="text-amber-600" />
                      <h3 className="font-semibold text-gray-900 dark:text-white">NotebookLM</h3>
                    </div>
                    <span className="text-xs text-gray-500">{connections.drive.connected ? 'Via Google Drive' : 'Requires Drive connection'}</span>
                  </header>
                  <p className="mb-3 text-xs text-gray-500">Upload a Drive source pack, then add it manually as a source in NotebookLM.</p>
                  {notebookLmDriveFileId ? (
                    <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
                      Last source-pack Drive file ID: <code>{notebookLmDriveFileId}</code>
                    </p>
                  ) : null}
                  {!connections.drive.connected ? (
                    <p className="text-xs text-yellow-700 dark:text-yellow-300">Connect Google Drive first using the section above.</p>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => uploadNotebookLmPack('Current Thread Source Pack', [], activeThread)} disabled={busy !== null || !activeThread} className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-700 disabled:opacity-50">
                          {busy === 'notebooklm:upload' ? 'Uploading…' : 'Send thread to NotebookLM'}
                        </button>
                        <a href={NOTEBOOKLM_HANDOFF_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800">
                          <ExternalLink size={14} /> Open NotebookLM
                        </a>
                      </div>
                      {artifacts.length === 0 ? (
                        <p className="text-xs text-gray-500">No artifacts yet. Chat with Gemini to generate content, then send it here.</p>
                      ) : (
                        <ul className="max-h-48 overflow-y-auto rounded-lg border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                          {artifacts.map((art) => (
                            <li key={art.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                              <div className="flex-1 min-w-0">
                                <span className="truncate text-gray-800 dark:text-gray-100 block">{art.title}</span>
                                <span className="text-xs text-gray-500">{art.type} · {new Date(art.createdAt).toLocaleDateString()}</span>
                              </div>
                              <button onClick={() => uploadNotebookLmPack(`${art.title} Source Pack`, [art], null)} disabled={busy !== null} className="shrink-0 rounded-lg bg-amber-600 px-3 py-1 text-xs text-white hover:bg-amber-700 disabled:opacity-50">
                                {busy === 'notebooklm:upload' ? 'Uploading…' : 'Send to NotebookLM'}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </section>
              )}

              <section className="rounded-xl border border-dashed border-gray-200 dark:border-gray-800 p-4 opacity-70">
                <header className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Plane size={18} className="text-gray-500" />
                    <h3 className="font-semibold text-gray-700 dark:text-gray-300">Travel</h3>
                  </div>
                  <span className="text-xs text-gray-500">(Not implemented)</span>
                </header>
                <p className="mt-2 text-xs text-gray-500">Google Flights does not expose a public developer API.</p>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
