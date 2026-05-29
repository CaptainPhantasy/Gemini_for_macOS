/**
 * Google Integrations
 *
 * Direct Google API calls from the client using bearer tokens obtained
 * via the OAuth handler. No backend proxy.
 *
 * The caller is responsible for obtaining a fresh access token from
 * `oauthHandler.getAccessToken` and passing it into every method below.
 */

export interface ImportResult {
  ok: boolean;
  artifactId?: string;
  title?: string;
  content?: string; // text content OR data URI for binary
  mimeType?: string;
  sourceFileId?: string;
  sourceType?: 'drive' | 'docs' | 'calendar';
  fetchedAt?: number;
  error?: string;
}

export interface DriveFileSummary {
  id: string;
  name: string;
  mimeType: string;
}

export interface UploadResult {
  ok: boolean;
  fileId?: string;
  error?: string;
}

export interface CalendarEventSummary {
  id: string;
  summary: string;
  start: string;
  location?: string;
  description?: string;
  htmlLink?: string;
}

const GOOGLE_API_TIMEOUT_MS = 15_000;
const GOOGLE_API_MAX_RETRIES = 2;
const GOOGLE_API_RETRY_DELAY_MS = 250;
const GOOGLE_API_RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const DOCS_API = 'https://docs.googleapis.com/v1';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

interface GoogleApiFetchOptions extends Omit<RequestInit, 'signal'> {
  timeoutMs?: number;
  maxRetries?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return GOOGLE_API_RETRY_STATUSES.has(status);
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return message.includes('fetch') || message.includes('network') || message.includes('timeout') || message.includes('econn');
}

async function fetchWithRetry(url: string, options: GoogleApiFetchOptions = {}): Promise<Response> {
  const { timeoutMs = GOOGLE_API_TIMEOUT_MS, maxRetries = GOOGLE_API_MAX_RETRIES, ...fetchOptions } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      if (response.ok || !isRetryableStatus(response.status) || attempt === maxRetries) {
        clearTimeout(timer);
        return response;
      }

      clearTimeout(timer);
      lastError = new Error(`Request failed with status ${response.status}`);
      await response.arrayBuffer().catch(() => undefined);
      const delayMs = GOOGLE_API_RETRY_DELAY_MS * 2 ** attempt;
      if (attempt < maxRetries) await sleep(delayMs);
      continue;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        return Promise.reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }
      if (attempt === maxRetries || !isRetryableError(error)) {
        throw error;
      }
      const delayMs = GOOGLE_API_RETRY_DELAY_MS * 2 ** attempt;
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Request failed after retries');
}

function authHeaders(accessToken: string, extra?: Record<string, string>): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    ...(extra ?? {}),
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `art_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function blobToDataUri(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('FileReader returned non-string result'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

interface DriveFolderSearchResponse {
  files?: Array<{ id: string; name: string }>;
}

interface DriveFolderCreateResponse {
  id: string;
  name: string;
}

async function findOrCreateFolder(
  accessToken: string,
  name: string,
  parentId: string | null
): Promise<string> {
  const escapedName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const parentClause = parentId ? ` and '${parentId}' in parents` : " and 'root' in parents";
  const q = `mimeType = 'application/vnd.google-apps.folder' and name = '${escapedName}' and trashed = false${parentClause}`;

  const searchUrl = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent('files(id,name)')}&spaces=drive`;
  const searchResponse = await fetchWithRetry(searchUrl, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  if (!searchResponse.ok) {
    const body = await searchResponse.text();
    throw new Error(`Drive folder search failed: ${searchResponse.status} ${body}`);
  }

  const searchData = (await searchResponse.json()) as DriveFolderSearchResponse;
  if (searchData.files && searchData.files.length > 0 && searchData.files[0]?.id) {
    return searchData.files[0].id;
  }

  const metadata: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    metadata.parents = [parentId];
  }

  const createResponse = await fetchWithRetry(`${DRIVE_API}/files?fields=id,name`, {
    method: 'POST',
    headers: authHeaders(accessToken, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(metadata),
  });

  if (!createResponse.ok) {
    const body = await createResponse.text();
    throw new Error(`Drive folder create failed: ${createResponse.status} ${body}`);
  }

  const createData = (await createResponse.json()) as DriveFolderCreateResponse;
  return createData.id;
}

async function resolveFolderPath(accessToken: string, folderPath: string): Promise<string | null> {
  const parts = folderPath
    .split('/')
    .map((part) => part.trim())
    .filter((p) => p.length > 0);

  if (parts.length === 0) return null;

  let parentId: string | null = null;
  for (const part of parts) {
    parentId = await findOrCreateFolder(accessToken, part, parentId);
  }
  return parentId;
}

interface DriveFileGetResponse {
  id: string;
  name: string;
  mimeType: string;
}

interface DriveListResponse {
  files?: Array<{ id?: string; name?: string; mimeType?: string }>;
}

interface DocsBody {
  content?: Array<{
    paragraph?: {
      elements?: Array<{
        textRun?: {
          content?: string;
        };
      }>;
    };
  }>;
}

export interface DocsDocumentResponse {
  title?: string;
  body?: DocsBody;
  tabs?: Array<{ documentTab?: { body?: DocsBody } }>;
}

interface CalendarListResponse {
  items?: Array<{
    id?: string;
    summary?: string;
    start?: { dateTime?: string; date?: string };
    location?: string;
    description?: string;
    htmlLink?: string;
  }>;
}

function extractBodyText(body: DocsBody | undefined): string {
  const blocks = body?.content ?? [];
  const lines: string[] = [];

  for (const block of blocks) {
    const elements = block.paragraph?.elements;
    if (!elements) continue;
    const line = elements.map((el) => el.textRun?.content ?? '').join('');
    if (line.length > 0) lines.push(line);
  }

  return lines.join('').replace(/\n{3,}/g, '\n\n').trim();
}

export function extractGoogleDocText(document: DocsDocumentResponse): string {
  const sections: string[] = [];
  const bodyText = extractBodyText(document.body);
  if (bodyText) sections.push(bodyText);

  for (const tab of document.tabs ?? []) {
    const tabText = extractBodyText(tab.documentTab?.body);
    if (tabText) sections.push(tabText);
  }

  return sections.join('\n\n').trim();
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?.*?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

export function calendarEventsToMarkdown(events: CalendarEventSummary[], maxEvents = 10): string {
  const lines = ['# Upcoming Calendar Events'];
  for (const event of events.slice(0, Math.max(0, maxEvents))) {
    lines.push('', `## ${event.summary || '(no title)'}`, '', `- Start: ${event.start || '(unknown)'}`);
    if (event.location) lines.push(`- Location: ${event.location}`);
    if (event.htmlLink) lines.push(`- Link: ${event.htmlLink}`);
    if (event.description) lines.push('', stripHtml(event.description));
  }
  return `${lines.join('\n').replace(/\n{4,}/g, '\n\n\n')}\n`;
}

export const integrations = {
  notebookLm: {
    async importNotebook(accessToken: string, notebookId: string): Promise<ImportResult> {
      void accessToken;
      void notebookId;
      return {
        ok: false,
        error:
          'NotebookLM does not currently expose a public REST API. Export the notebook to Google Drive and import it from there instead.',
      };
    },
  },

  googleWorkspace: {
    async listFiles(accessToken: string, query?: string): Promise<DriveFileSummary[]> {
      try {
        const params = new URLSearchParams();
        if (query && query.trim().length > 0) {
          params.set('q', query);
        }
        params.set('fields', 'files(id,name,mimeType)');
        params.set('pageSize', '50');

        const response = await fetchWithRetry(`${DRIVE_API}/files?${params.toString()}`, {
          method: 'GET',
          headers: authHeaders(accessToken),
        });

        if (!response.ok) {
          const body = await response.text();
          console.error('[integrations] Drive listFiles failed:', response.status, body);
          return [];
        }

        const data = (await response.json()) as DriveListResponse;
        const files = data.files ?? [];
        const result: DriveFileSummary[] = [];
        for (const f of files) {
          if (f.id && f.name && f.mimeType) {
            result.push({ id: f.id, name: f.name, mimeType: f.mimeType });
          }
        }
        return result;
      } catch (error) {
        console.error('[integrations] Drive listFiles error:', errorMessage(error));
        return [];
      }
    },

    async importFile(accessToken: string, fileId: string): Promise<ImportResult> {
      try {
        const metaUrl = `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent('id,name,mimeType')}`;
        const metaResponse = await fetchWithRetry(metaUrl, {
          method: 'GET',
          headers: authHeaders(accessToken),
        });

        if (!metaResponse.ok) {
          const body = await metaResponse.text();
          return { ok: false, error: `Drive metadata fetch failed: ${metaResponse.status} ${body}` };
        }

        const meta = (await metaResponse.json()) as DriveFileGetResponse;

        let downloadUrl: string;
        let effectiveMime = meta.mimeType;

        if (meta.mimeType === 'application/vnd.google-apps.document') {
          downloadUrl = `${DRIVE_API}/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`;
          effectiveMime = 'text/plain';
        } else if (meta.mimeType === 'application/vnd.google-apps.spreadsheet') {
          downloadUrl = `${DRIVE_API}/files/${encodeURIComponent(fileId)}/export?mimeType=text/csv`;
          effectiveMime = 'text/csv';
        } else if (meta.mimeType === 'application/vnd.google-apps.presentation') {
          downloadUrl = `${DRIVE_API}/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`;
          effectiveMime = 'text/plain';
        } else {
          downloadUrl = `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`;
        }

        const downloadResponse = await fetchWithRetry(downloadUrl, {
          method: 'GET',
          headers: authHeaders(accessToken),
        });

        if (!downloadResponse.ok) {
          const body = await downloadResponse.text();
          return { ok: false, error: `Drive download failed: ${downloadResponse.status} ${body}` };
        }

        const isTextLike =
          effectiveMime.startsWith('text/') || effectiveMime === 'application/json' || effectiveMime === 'application/xml';

        let content: string;
        if (isTextLike) {
          content = await downloadResponse.text();
        } else {
          const blob = await downloadResponse.blob();
          content = await blobToDataUri(blob);
        }

        return {
          ok: true,
          artifactId: generateId(),
          title: meta.name,
          content,
          mimeType: effectiveMime,
          sourceFileId: meta.id,
          sourceType: 'drive',
          fetchedAt: Date.now(),
        };
      } catch (error) {
        return { ok: false, error: errorMessage(error) };
      }
    },

    async uploadFile(
      accessToken: string,
      name: string,
      mimeType: string,
      blob: Blob,
      folderPath?: string
    ): Promise<UploadResult> {
      try {
        let parentId: string | null = null;
        if (folderPath && folderPath.trim().length > 0) {
          parentId = await resolveFolderPath(accessToken, folderPath);
        }

        const metadata: Record<string, unknown> = { name, mimeType };
        if (parentId) {
          metadata.parents = [parentId];
        }

        const boundary = `-------gemini-upload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        const delimiter = `--${boundary}`;
        const closeDelimiter = `--${boundary}--`;
        const metadataPart = `${delimiter}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
        const mediaHeader = `${delimiter}\r\nContent-Type: ${mimeType}\r\n\r\n`;
        const body = new Blob([metadataPart, mediaHeader, blob, `\r\n${closeDelimiter}`], {
          type: `multipart/related; boundary=${boundary}`,
        });

        const response = await fetchWithRetry(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`, {
          method: 'POST',
          headers: authHeaders(accessToken, {
            'Content-Type': `multipart/related; boundary=${boundary}`,
          }),
          body,
        });

        if (!response.ok) {
          const errBody = await response.text();
          return { ok: false, error: `Drive upload failed: ${response.status} ${errBody}` };
        }

        const data = (await response.json()) as { id?: string };
        if (!data.id) {
          return { ok: false, error: 'Drive upload returned no file id' };
        }

        return { ok: true, fileId: data.id };
      } catch (error) {
        return { ok: false, error: errorMessage(error) };
      }
    },

    async readDocument(accessToken: string, documentId: string): Promise<ImportResult> {
      try {
        const url = `${DOCS_API}/documents/${encodeURIComponent(documentId)}?includeTabsContent=true`;
        const response = await fetchWithRetry(url, {
          method: 'GET',
          headers: authHeaders(accessToken),
        });

        if (!response.ok) {
          const body = await response.text();
          return { ok: false, error: `Docs read failed: ${response.status} ${body}` };
        }

        const data = (await response.json()) as DocsDocumentResponse;
        const content = extractGoogleDocText(data);

        return {
          ok: true,
          artifactId: generateId(),
          title: data.title ?? 'Untitled Document',
          content,
          mimeType: 'text/plain',
          sourceFileId: documentId,
          sourceType: 'docs',
          fetchedAt: Date.now(),
        };
      } catch (error) {
        return { ok: false, error: errorMessage(error) };
      }
    },

    async listUpcomingEvents(
      accessToken: string,
      maxResults: number
    ): Promise<CalendarEventSummary[]> {
      try {
        const params = new URLSearchParams();
        params.set('timeMin', new Date().toISOString());
        params.set('maxResults', String(Math.max(1, Math.min(maxResults, 250))));
        params.set('singleEvents', 'true');
        params.set('orderBy', 'startTime');

        const response = await fetchWithRetry(`${CALENDAR_API}/calendars/primary/events?${params.toString()}`, {
          method: 'GET',
          headers: authHeaders(accessToken),
        });

        if (!response.ok) {
          const body = await response.text();
          console.error('[integrations] Calendar list failed:', response.status, body);
          return [];
        }

        const data = (await response.json()) as CalendarListResponse;
        const items = data.items ?? [];
        const result: CalendarEventSummary[] = [];
        for (const item of items) {
          if (!item.id) continue;
          const start = item.start?.dateTime ?? item.start?.date ?? '';
          result.push({
            id: item.id,
            summary: item.summary ?? '(no title)',
            start,
            ...(item.location ? { location: item.location } : {}),
            ...(item.description ? { description: stripHtml(item.description) } : {}),
            ...(item.htmlLink ? { htmlLink: item.htmlLink } : {}),
          });
        }
        return result;
      } catch (error) {
        console.error('[integrations] Calendar list error:', errorMessage(error));
        return [];
      }
    },
  },

  travel: {
    async searchFlights(
      accessToken: string,
      origin: string,
      dest: string,
      date: string
    ): Promise<{ ok: false; error: string }> {
      void accessToken;
      void origin;
      void dest;
      void date;
      return {
        ok: false,
        error: 'Flight search is not implemented. Google does not expose a public Flights API.',
      };
    },
  },
};
