import { integrations } from './integrations';
import { oauthHandler, OAUTH_SCOPES } from './oauth-handler';
import { storage } from './storage';
import type { Artifact } from '../types';

const REDIRECT_URI = 'http://localhost:13000/oauth/callback';
const DRIVE_FOLDER = 'GEMINI/Artifacts';

function buildOAuthConfig(clientId: string) {
  return { clientId, redirectUri: REDIRECT_URI, scopes: [...OAUTH_SCOPES] };
}

export interface DriveUploadResult {
  ok: boolean;
  fileId?: string;
  error?: string;
}

export async function uploadArtifactToDrive(artifact: Artifact): Promise<DriveUploadResult> {
  const settings = storage.getSettings();
  const clientId = settings.gcpOAuthClientId;
  if (!clientId) return { ok: false, error: 'No OAuth Client ID configured' };

  try {
    const token = await oauthHandler.getAccessToken(buildOAuthConfig(clientId));
    if (!token) return { ok: false, error: 'Not authenticated — connect Google Drive first' };

    const blob = new Blob([artifact.content], { type: 'text/plain' });
    const ext = artifact.type === 'code' ? 'txt' : 'txt';
    const name = `${artifact.title}.${ext}`;

    const result = await integrations.googleWorkspace.uploadFile(
      token,
      name,
      'text/plain',
      blob,
      DRIVE_FOLDER
    );

    if (!result.ok || !result.fileId) {
      return { ok: false, error: result.error ?? 'Upload failed' };
    }

    const updated: Artifact = { ...artifact, driveFileId: result.fileId };
    await storage.saveArtifact(updated);

    return { ok: true, fileId: result.fileId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function autoSyncArtifact(artifact: Artifact): Promise<void> {
  const settings = storage.getSettings();
  if (!settings.googleDriveEnabled) return;
  if (!settings.autoSyncArtifacts) return;
  if (!settings.gcpOAuthClientId) return;
  if (artifact.driveFileId) return;

  try {
    await uploadArtifactToDrive(artifact);
  } catch {
    console.warn('[drive-sync] Auto-sync failed for artifact:', artifact.id);
  }
}
