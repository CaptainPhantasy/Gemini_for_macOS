import { describe, test, expect, beforeEach, vi } from 'vitest';

const mediaStoreMap = new Map<string, unknown>();

vi.mock('idb', () => {
  return {
    openDB: vi.fn(async (_name: string, _version: number, opts?: { upgrade?: (db: unknown) => void }) => {
      const db = {
        objectStoreNames: { contains: () => false },
        createObjectStore: () => ({}),
        async put(_store: string, value: { blobKey: string }) {
          mediaStoreMap.set(value.blobKey, value);
        },
        async get(_store: string, key: string) {
          return mediaStoreMap.get(key);
        },
        async delete(_store: string, key: string) {
          mediaStoreMap.delete(key);
        },
        async getAll(_store: string) {
          return Array.from(mediaStoreMap.values());
        },
      };
      if (opts?.upgrade) opts.upgrade(db);
      return db;
    }),
  };
});

import { dataUriToBlob, mediaStore } from '../lib/media-store';

beforeEach(() => {
  mediaStoreMap.clear();
});

describe('dataUriToBlob', () => {
  test('decodes a base64 audio data URI to a Blob with correct mime + size', async () => {
    const message = 'hello';
    const base64 = btoa(message);
    const uri = `data:audio/wav;base64,${base64}`;
    const blob = await dataUriToBlob(uri);
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(message.length);
  });

  test('handles a URL-encoded (non-base64) data URI', async () => {
    const blob = await dataUriToBlob('data:text/plain,hello%20world');
    expect(blob.type).toBe('text/plain');
    // "hello world" has 11 characters
    expect(blob.size).toBe(11);
  });

  test('throws on non-data URIs', async () => {
    await expect(dataUriToBlob('https://example.com/file.png')).rejects.toThrow(
      /not a data URI/
    );
  });

  test('defaults mime type when missing', async () => {
    const blob = await dataUriToBlob('data:,plaintext');
    expect(blob.type).toBe('application/octet-stream');
  });
});

describe('mediaStore save/load pipeline', () => {
  test('save returns a key, load retrieves the same blob bytes', async () => {
    const original = new Blob([new Uint8Array([1, 2, 3, 4, 5])], {
      type: 'application/octet-stream',
    });
    const key = await mediaStore.save(original);
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);

    const loaded = await mediaStore.load(key);
    expect(loaded).not.toBeNull();
    if (loaded) {
      expect(loaded.size).toBe(5);
    }
  });

  test('load returns null for an unknown key', async () => {
    const result = await mediaStore.load('does-not-exist');
    expect(result).toBeNull();
  });
});
