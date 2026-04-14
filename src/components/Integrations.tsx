import { useState, type ReactElement } from 'react';
import {
  X,
  HardDrive,
  FileText,
  Calendar,
  BookOpen,
  Plane,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { integrations, type DriveFileSummary, type CalendarEventSummary } from '../lib/integrations';
import { oauthHandler, OAUTH_SCOPES, type OAuthConfig } from '../lib/oauth-handler';
import { storage } from '../lib/storage';
import type { Artifact } from '../types';

interface IntegrationsProps {
  isOpen: boolean;
  onClose: () => void;
  gcpClientId?: string;
}

type ServiceKey = 'drive' | 'docs' | 'calendar';

interface ConnectionState {
  connected: boolean;
  connectedAt?: number;
}

interface BannerState {
  kind: 'success' | 'error';
  message: string;
}

const REDIRECT_URI = 'http://localhost:13000/oauth/callback';

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
    scopes: [...OAUTH_SCOPES],
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function Integrations({ isOpen, onClose, gcpClientId }: IntegrationsProps): ReactElement | null {
  const [connections, setConnections] = useState<Record<ServiceKey, ConnectionState>>({
    drive: { connected: false },
    docs: { connected: false },
    calendar: { connected: false },
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFileSummary[] | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventSummary[] | null>(null);

  if (!isOpen) {
    return null;
  }

  const showBanner = (state: BannerState): void => {
    setBanner(state);
    window.setTimeout(() => {
      setBanner((current) => (current === state ? null : current));
    }, 5000);
  };

  const markConnected = (key: ServiceKey): void => {
    setConnections((prev) => ({
      ...prev,
      [key]: { connected: true, connectedAt: Date.now() },
    }));
  };

  const requireClientId = (): string | null => {
    if (!gcpClientId) {
      showBanner({
        kind: 'error',
        message: 'Configure a Google OAuth Client ID in Settings first.',
      });
      return null;
    }
    return gcpClientId;
  };

  const handleConnect = async (key: ServiceKey): Promise<void> => {
    const clientId = requireClientId();
    if (!clientId) return;
    setBusy(`connect:${key}`);
    try {
      await oauthHandler.initiateOAuth(buildOAuthConfig(clientId));
      markConnected(key);
      showBanner({ kind: 'success', message: 'Connected to Google.' });
    } catch (error) {
      showBanner({ kind: 'error', message: `Connect failed: ${errorMessage(error)}` });
    } finally {
      setBusy(null);
    }
  };

  const getToken = async (clientId: string): Promise<string | null> => {
    const token = await oauthHandler.getAccessToken(buildOAuthConfig(clientId));
    if (!token) {
      showBanner({
        kind: 'error',
        message: 'No access token available. Connect first.',
      });
      return null;
    }
    return token;
  };

  const persistAsArtifact = async (
    title: string,
    content: string,
    artifactType: Artifact['type'],
    mimeType?: string
  ): Promise<void> => {
    const artifact: Artifact = {
      id: generateArtifactId(),
      title,
      content,
      type: artifactType,
      createdAt: Date.now(),
      ...(mimeType ? { mimeType } : {}),
    };
    await storage.saveArtifact(artifact);
    showBanner({ kind: 'success', message: `Imported as artifact: ${title}` });
  };

  const handleListDriveFiles = async (): Promise<void> => {
    const clientId = requireClientId();
    if (!clientId) return;
    setBusy('drive:list');
    try {
      const token = await getToken(clientId);
      if (!token) return;
      const files = await integrations.googleWorkspace.listFiles(token);
      setDriveFiles(files);
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
      const isText =
        !result.mimeType ||
        result.mimeType.startsWith('text/') ||
        result.mimeType === 'application/json' ||
        result.mimeType === 'application/xml';
      const artifactType: Artifact['type'] = isText ? 'text' : 'research';
      await persistAsArtifact(
        result.title ?? fallbackName,
        result.content,
        artifactType,
        result.mimeType
      );
    } catch (error) {
      showBanner({ kind: 'error', message: `Import failed: ${errorMessage(error)}` });
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
      await persistAsArtifact(
        result.title ?? 'Untitled Document',
        result.content,
        'research',
        result.mimeType ?? 'text/plain'
      );
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
        const lines = events.map((e) => `- ${e.start} — ${e.summary}`).join('\n');
        await persistAsArtifact(
          `Upcoming events (${new Date().toLocaleDateString()})`,
          lines,
          'research',
          'text/plain'
        );
      } else {
        showBanner({ kind: 'success', message: 'No upcoming events found.' });
      }
    } catch (error) {
      showBanner({ kind: 'error', message: `Calendar list failed: ${errorMessage(error)}` });
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
            {banner.kind === 'success' ? (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            )}
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
              {/* Google Drive */}
              <section className="rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                <header className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <HardDrive size={18} className="text-blue-600" />
                    <h3 className="font-semibold text-gray-900 dark:text-white">Google Drive</h3>
                  </div>
                  <span className="text-xs text-gray-500">
                    {connections.drive.connected ? 'Connected' : 'Not connected'}
                  </span>
                </header>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleConnect('drive')}
                    disabled={busy !== null}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {busy === 'connect:drive' ? <Loader2 className="animate-spin" size={14} /> : 'Connect'}
                  </button>
                  <button
                    onClick={handleListDriveFiles}
                    disabled={busy !== null}
                    className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                  >
                    {busy === 'drive:list' ? 'Loading...' : 'List recent files'}
                  </button>
                </div>
                {driveFiles && driveFiles.length > 0 ? (
                  <ul className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                    {driveFiles.map((file) => (
                      <li
                        key={file.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                      >
                        <span className="truncate text-gray-800 dark:text-gray-100">{file.name}</span>
                        <button
                          onClick={() => handleImportDriveFile(file.id, file.name)}
                          disabled={busy !== null}
                          className="shrink-0 rounded bg-gray-100 dark:bg-gray-800 px-2 py-1 text-xs hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
                        >
                          Import
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {driveFiles && driveFiles.length === 0 ? (
                  <p className="mt-3 text-xs text-gray-500">No files returned.</p>
                ) : null}
              </section>

              {/* Google Docs */}
              <section className="rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                <header className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText size={18} className="text-emerald-600" />
                    <h3 className="font-semibold text-gray-900 dark:text-white">Google Docs</h3>
                  </div>
                  <span className="text-xs text-gray-500">
                    {connections.docs.connected ? 'Connected' : 'Not connected'}
                  </span>
                </header>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleConnect('docs')}
                    disabled={busy !== null}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busy === 'connect:docs' ? <Loader2 className="animate-spin" size={14} /> : 'Connect'}
                  </button>
                  <button
                    onClick={handleImportDoc}
                    disabled={busy !== null}
                    className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                  >
                    {busy === 'docs:import' ? 'Importing...' : 'Import a document'}
                  </button>
                </div>
              </section>

              {/* Google Calendar */}
              <section className="rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                <header className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Calendar size={18} className="text-purple-600" />
                    <h3 className="font-semibold text-gray-900 dark:text-white">Google Calendar</h3>
                  </div>
                  <span className="text-xs text-gray-500">
                    {connections.calendar.connected ? 'Connected' : 'Not connected'}
                  </span>
                </header>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleConnect('calendar')}
                    disabled={busy !== null}
                    className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700 disabled:opacity-50"
                  >
                    {busy === 'connect:calendar' ? <Loader2 className="animate-spin" size={14} /> : 'Connect'}
                  </button>
                  <button
                    onClick={handleListEvents}
                    disabled={busy !== null}
                    className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                  >
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

              {/* NotebookLM placeholder */}
              <section className="rounded-xl border border-dashed border-gray-200 dark:border-gray-800 p-4 opacity-70">
                <header className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen size={18} className="text-gray-500" />
                    <h3 className="font-semibold text-gray-700 dark:text-gray-300">NotebookLM</h3>
                  </div>
                  <span className="text-xs text-gray-500">(No public API yet)</span>
                </header>
                <p className="mt-2 text-xs text-gray-500">
                  Export from NotebookLM to Drive and import via the Drive section above.
                </p>
              </section>

              {/* Travel placeholder */}
              <section className="rounded-xl border border-dashed border-gray-200 dark:border-gray-800 p-4 opacity-70">
                <header className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Plane size={18} className="text-gray-500" />
                    <h3 className="font-semibold text-gray-700 dark:text-gray-300">Travel</h3>
                  </div>
                  <span className="text-xs text-gray-500">(Not implemented)</span>
                </header>
                <p className="mt-2 text-xs text-gray-500">
                  Google Flights does not expose a public developer API.
                </p>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
