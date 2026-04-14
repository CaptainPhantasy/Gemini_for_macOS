/**
 * media-store.ts — IndexedDB blob storage for paid media outputs.
 *
 * Stores large binary artifacts (Lyria songs, Veo videos, TTS audio,
 * generated images) outside of the primary JSON settings store so the
 * main persistence layer stays lean. Records are keyed by an opaque
 * `blobKey` returned from `save()`.
 */

import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'gemini-for-macos-media';
const DB_VERSION = 1;
const STORE_NAME = 'blobs';

interface MediaRecord {
  blobKey: string;
  blob: Blob;
  mimeType: string;
  sizeBytes: number;
  createdAt: number;
}

export interface MediaMetadata {
  blobKey: string;
  sizeBytes: number;
  mimeType: string;
  createdAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'blobKey' });
        }
      },
    });
  }
  return dbPromise;
}

function generateKey(): string {
  const cryptoRef: Crypto | undefined =
    typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  // Fallback: timestamp + random suffix
  const rand = Math.random().toString(36).slice(2, 10);
  const rand2 = Math.random().toString(36).slice(2, 10);
  return `media-${Date.now().toString(36)}-${rand}${rand2}`;
}

export const mediaStore = {
  async save(blob: Blob): Promise<string> {
    const db = await getDb();
    const blobKey = generateKey();
    const record: MediaRecord = {
      blobKey,
      blob,
      mimeType: blob.type || 'application/octet-stream',
      sizeBytes: blob.size,
      createdAt: Date.now(),
    };
    await db.put(STORE_NAME, record);
    return blobKey;
  },

  async load(blobKey: string): Promise<Blob | null> {
    const db = await getDb();
    const record = (await db.get(STORE_NAME, blobKey)) as
      | MediaRecord
      | undefined;
    return record ? record.blob : null;
  },

  async delete(blobKey: string): Promise<void> {
    const db = await getDb();
    await db.delete(STORE_NAME, blobKey);
  },

  async size(): Promise<number> {
    const db = await getDb();
    const records = (await db.getAll(STORE_NAME)) as MediaRecord[];
    return records.reduce((total, rec) => total + (rec.sizeBytes || 0), 0);
  },

  async list(): Promise<MediaMetadata[]> {
    const db = await getDb();
    const records = (await db.getAll(STORE_NAME)) as MediaRecord[];
    return records.map((rec) => ({
      blobKey: rec.blobKey,
      sizeBytes: rec.sizeBytes,
      mimeType: rec.mimeType,
      createdAt: rec.createdAt,
    }));
  },
};

/**
 * Parse a `data:<mime>;base64,<b64>` URI into a Blob.
 * Defaults to `application/octet-stream` when the mime type is missing.
 */
export async function dataUriToBlob(dataUri: string): Promise<Blob> {
  if (typeof dataUri !== 'string' || !dataUri.startsWith('data:')) {
    throw new Error('dataUriToBlob: input is not a data URI');
  }

  const commaIdx = dataUri.indexOf(',');
  if (commaIdx === -1) {
    throw new Error('dataUriToBlob: malformed data URI (no comma)');
  }

  const header = dataUri.slice(5, commaIdx); // strip "data:" prefix
  const payload = dataUri.slice(commaIdx + 1);

  const isBase64 = header.endsWith(';base64');
  const mimeType =
    (isBase64 ? header.slice(0, -';base64'.length) : header) ||
    'application/octet-stream';

  let bytes: Uint8Array;
  if (isBase64) {
    const binary = atob(payload);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
  } else {
    // URL-encoded payload
    const decoded = decodeURIComponent(payload);
    bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
      bytes[i] = decoded.charCodeAt(i);
    }
  }

  return new Blob([bytes], { type: mimeType });
}

/**
 * Thin wrapper around `URL.createObjectURL` for symmetry with the rest
 * of the module. Callers MUST remember to revoke the returned URL via
 * `URL.revokeObjectURL` once they no longer need it.
 */
export function blobToObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}
