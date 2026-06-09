import type { ImportResult } from './integrations';

export interface ImportPickedDriveFilesOptions {
  accessToken: string;
  fileIds: string[];
  importFile: (accessToken: string, fileId: string) => Promise<ImportResult>;
  maxConcurrentImports?: number;
}

export async function importPickedDriveFiles(options: ImportPickedDriveFilesOptions): Promise<ImportResult[]> {
  const uniqueFileIds: string[] = [];
  const seen = new Set<string>();
  for (const id of options.fileIds) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    uniqueFileIds.push(trimmed);
  }

  const results: Array<ImportResult | undefined> = new Array(uniqueFileIds.length);
  let nextIndex = 0;
  const maxConcurrent = Math.max(1, Math.min(options.maxConcurrentImports ?? 4, uniqueFileIds.length));

  const importWorker = async () => {
    while (nextIndex < uniqueFileIds.length) {
      const index = nextIndex++;
      const fileId = uniqueFileIds[index];
      const result = await options.importFile(options.accessToken, fileId);
      results[index] = result;
    }
  };

  await Promise.all(Array.from({ length: maxConcurrent }, () => importWorker()));

  return results as ImportResult[];
}

// ---------------------------------------------------------------------------
// Google Picker API (in-app picker)
//
// Replaces the legacy `trigger_onepick` OAuth-redirect flow, which is NOT a real
// Google mechanism: Google never appends picked_file_ids to the OAuth redirect,
// so the selection was stranded in the auth window and never reached the app.
// The supported approach is google.picker.PickerBuilder().setOAuthToken(token),
// which renders the picker in-app and returns the selection via a JS callback.
// ---------------------------------------------------------------------------

export interface PickedDriveFile {
  id: string;
  name: string;
}

/** Subset of the google.picker callback payload we read. */
export interface PickerCallbackData {
  action?: string;
  docs?: Array<{ id?: string; name?: string }>;
}

/** Extract picked file descriptors from a Google Picker callback payload. */
export function extractPickedFiles(data: PickerCallbackData | null | undefined): PickedDriveFile[] {
  const docs = data?.docs;
  if (!Array.isArray(docs)) return [];
  const files: PickedDriveFile[] = [];
  for (const doc of docs) {
    const id = (doc?.id ?? '').trim();
    if (!id) continue;
    files.push({ id, name: (doc?.name ?? '').trim() || id });
  }
  return files;
}

export interface ShowDrivePickerOptions {
  /** OAuth access token with a Drive scope (drive.file is sufficient for picked files). */
  accessToken: string;
  /** Google Cloud API key (developer key). Recommended by Google; passed when available. */
  developerKey?: string;
  /** App (project) number, used so the app can access drive.file-picked files. */
  appId?: string;
  allowMultiple?: boolean;
  mimeTypes?: string[];
}

// Minimal shapes for the parts of the gapi/google.picker globals we touch.
interface GapiGlobal {
  load(name: string, callback: () => void): void;
}
interface PickerBuilderLike {
  setOAuthToken(token: string): PickerBuilderLike;
  addView(view: unknown): PickerBuilderLike;
  setCallback(callback: (data: PickerCallbackData) => void): PickerBuilderLike;
  enableFeature(feature: unknown): PickerBuilderLike;
  setDeveloperKey(key: string): PickerBuilderLike;
  setAppId(appId: string): PickerBuilderLike;
  build(): { setVisible(visible: boolean): void };
}
interface PickerGlobal {
  picker: {
    DocsView: new (viewId?: unknown) => { setMimeTypes(mimeTypes: string): void };
    ViewId: { DOCS: unknown };
    Action: { PICKED: string; CANCEL: string };
    Feature: { MULTISELECT_ENABLED: unknown };
    PickerBuilder: new () => PickerBuilderLike;
  };
}

const GAPI_SCRIPT_URL = 'https://apis.google.com/js/api.js';
let pickerModuleLoad: Promise<void> | null = null;

/** Load gapi (once) and its `picker` module. Cached across calls. */
function loadPickerModule(): Promise<void> {
  if (pickerModuleLoad) return pickerModuleLoad;
  pickerModuleLoad = new Promise<void>((resolve, reject) => {
    const existing = (window as unknown as { gapi?: GapiGlobal }).gapi;
    if (existing) {
      existing.load('picker', () => resolve());
      return;
    }
    const script = document.createElement('script');
    script.src = GAPI_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const gapi = (window as unknown as { gapi?: GapiGlobal }).gapi;
      if (!gapi) {
        pickerModuleLoad = null;
        reject(new Error('Google API script loaded but gapi is unavailable.'));
        return;
      }
      gapi.load('picker', () => resolve());
    };
    script.onerror = () => {
      pickerModuleLoad = null;
      reject(new Error(`Failed to load ${GAPI_SCRIPT_URL}.`));
    };
    document.head.appendChild(script);
  });
  return pickerModuleLoad;
}

/**
 * Show the in-app Google Picker and resolve with the files the user selects.
 * Resolves with [] when the user cancels. The selection returns directly to the
 * app, so picked Drive files can be imported instead of being stranded in the
 * auth window.
 */
export async function showGoogleDrivePicker(options: ShowDrivePickerOptions): Promise<PickedDriveFile[]> {
  if (!options.accessToken) throw new Error('Google Picker requires an OAuth access token.');
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Google Picker can only run in a browser environment.');
  }
  await loadPickerModule();
  const picker = (window as unknown as { google?: PickerGlobal }).google?.picker;
  if (!picker) throw new Error('Google Picker API failed to initialize.');

  return await new Promise<PickedDriveFile[]>((resolve) => {
    const view = new picker.DocsView(picker.ViewId.DOCS);
    if (options.mimeTypes && options.mimeTypes.length > 0) {
      view.setMimeTypes(options.mimeTypes.join(','));
    }
    let builder = new picker.PickerBuilder()
      .setOAuthToken(options.accessToken)
      .addView(view)
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) resolve(extractPickedFiles(data));
        else if (data.action === picker.Action.CANCEL) resolve([]);
      });
    if (options.allowMultiple) builder = builder.enableFeature(picker.Feature.MULTISELECT_ENABLED);
    if (options.developerKey) builder = builder.setDeveloperKey(options.developerKey);
    if (options.appId) builder = builder.setAppId(options.appId);
    builder.build().setVisible(true);
  });
}
