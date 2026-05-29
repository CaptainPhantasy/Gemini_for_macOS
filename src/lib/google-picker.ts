import { GOOGLE_DRIVE_FILE_SCOPE, type OAuthConfig } from './oauth-handler';
import type { ImportResult } from './integrations';

export interface DrivePickerOptions {
  clientId: string;
  redirectUri: string;
  allowMultiple?: boolean;
  mimeTypes?: string[];
  fileIds?: string[];
  allowFolderSelection?: boolean;
}

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

function cleanCsv(values: string[] | undefined): string | undefined {
  if (!values) return undefined;
  const cleaned = values.map((value) => value.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(',') : undefined;
}

export function buildDrivePickerOAuthConfig(options: DrivePickerOptions): OAuthConfig {
  const extraAuthorizeParams: Record<string, string> = {
    trigger_onepick: 'true',
    prompt: 'consent',
    include_granted_scopes: 'false',
  };

  if (options.allowMultiple) extraAuthorizeParams.allow_multiple = 'true';
  if (options.allowFolderSelection) extraAuthorizeParams.allow_folder_selection = 'true';

  const mimeTypes = cleanCsv(options.mimeTypes);
  if (mimeTypes) extraAuthorizeParams.mimetypes = mimeTypes;

  const fileIds = cleanCsv(options.fileIds);
  if (fileIds) extraAuthorizeParams.file_ids = fileIds;

  return {
    clientId: options.clientId,
    redirectUri: options.redirectUri,
    scopes: [GOOGLE_DRIVE_FILE_SCOPE],
    extraAuthorizeParams,
  };
}

