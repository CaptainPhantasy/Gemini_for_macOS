import { describe, expect, test, vi } from 'vitest';
import { isTransientError, generateWithFailoverStream } from '../lib/generation-wrapper';
import { extractResponseParts } from '../lib/agent-tools';

type Chunk = Record<string, unknown>;

function streamFromChunks(chunks: Chunk[]) {
  return (async function* () {
    for (const chunk of chunks) {
      yield chunk;
    }
  })();
}

describe('generation-wrapper', () => {
  describe('isTransientError', () => {
    test('classifies rate-limit errors as transient', () => {
      expect(isTransientError(new Error('429 Rate limit exceeded'))).toBe(true);
      expect(isTransientError(new Error('quota exceeded for model'))).toBe(true);
    });

    test('classifies network errors as transient', () => {
      expect(isTransientError(new Error('ECONNRESET'))).toBe(true);
      expect(isTransientError(new Error('ECONNREFUSED'))).toBe(true);
      expect(isTransientError(new Error('ETIMEDOUT'))).toBe(true);
      expect(isTransientError(new Error('network error'))).toBe(true);
      expect(isTransientError(new Error('fetch failed'))).toBe(true);
    });

    test('classifies server errors as transient', () => {
      expect(isTransientError(new Error('500 Internal Server Error'))).toBe(true);
      expect(isTransientError(new Error('502 Bad Gateway'))).toBe(true);
      expect(isTransientError(new Error('503 Service Unavailable'))).toBe(true);
    });

    test('classifies non-transient errors as permanent', () => {
      expect(isTransientError(new Error('Invalid API key'))).toBe(false);
      expect(isTransientError(new Error('Model not found'))).toBe(false);
      expect(isTransientError(new Error('Malformed request'))).toBe(false);
    });

    test('handles non-Error objects', () => {
      expect(isTransientError('string error')).toBe(false);
      expect(isTransientError(null)).toBe(false);
      expect(isTransientError(undefined)).toBe(false);
    });
  });

  describe('generateWithFailoverStream', () => {
    test('streams, merges chunks, and returns merged response', async () => {
      const ai: any = {
        models: {
          generateContentStream: vi.fn().mockResolvedValue(
            streamFromChunks([
              { candidates: [{ content: { parts: [{ text: 'Hello ' }] } }] },
              { candidates: [{ content: { parts: [{ text: 'world' }] } }] },
            ]),
          ),
        },
      };

      const chunkEvents: string[] = [];
      const result = await generateWithFailoverStream({
        ai,
        model: 'primary-model',
        contents: [{ role: 'user', parts: [{ text: 'Ping' }] }],
        config: {},
        onChunk: (chunk) => {
          chunkEvents.push(chunk.aggregatedText);
        },
      });

      expect(ai.models.generateContentStream).toHaveBeenCalledTimes(1);
      expect(ai.models.generateContentStream).toHaveBeenCalledWith({
        model: 'primary-model',
        contents: [{ role: 'user', parts: [{ text: 'Ping' }] }],
        config: {},
      });
      expect(chunkEvents).toEqual(['Hello ', 'Hello world']);
      expect(result.responseText).toBe('Hello world');
      expect(result.modelUsed).toBe('primary-model');
      expect(result.retries).toBe(0);
      expect(result.fellBack).toBe(false);
      expect(result.response?.candidates?.[0]?.content?.parts).toEqual([
        { text: 'Hello ' },
        { text: 'world' },
      ]);
      expect(result.responseParts).toEqual([
        { text: 'Hello ' },
        { text: 'world' },
      ]);
    });

    test('retries transient primary failures with exponential backoff', async () => {
      vi.useFakeTimers();
      try {
        const ai: any = {
          models: {
            generateContentStream: vi
              .fn()
              .mockRejectedValueOnce(new Error('503 Service Unavailable'))
              .mockResolvedValueOnce(
                streamFromChunks([
                  { candidates: [{ content: { parts: [{ text: 'Recovered' }] } }] },
                ]),
              ),
          },
        };

        const resultPromise = generateWithFailoverStream({
          ai,
          model: 'primary-model',
          contents: [{ role: 'user', parts: [{ text: 'Retry me' }] }],
          config: {},
          maxRetries: 3,
        });

        await vi.advanceTimersByTimeAsync(1_000);
        const result = await resultPromise;

        expect(result.retries).toBe(1);
        expect(result.modelUsed).toBe('primary-model');
        expect(ai.models.generateContentStream).toHaveBeenCalledTimes(2);
        expect(result.responseText).toBe('Recovered');
      } finally {
        vi.useRealTimers();
      }
    });

    test('falls back to secondary model after primary retries are exhausted', async () => {
      const ai: any = {
        models: {
          generateContentStream: vi
            .fn()
            .mockRejectedValueOnce(new Error('429 Too Many Requests'))
            .mockResolvedValueOnce(
              streamFromChunks([
                { candidates: [{ content: { parts: [{ text: 'Fallback response' }] } }] },
              ]),
            ),
        },
      };

      const result = await generateWithFailoverStream({
        ai,
        model: 'primary-model',
        fallbackModel: 'fallback-model',
        contents: [{ role: 'user', parts: [{ text: 'Fallback please' }] }],
        config: {},
        maxRetries: 1,
      });

      expect(result.modelUsed).toBe('fallback-model');
      expect(result.fellBack).toBe(true);
      expect(result.retries).toBe(1);
      expect(ai.models.generateContentStream).toHaveBeenCalledTimes(2);
      expect(result.responseText).toBe('Fallback response');
    });

    test('throws transient or permanent errors without fallback model', async () => {
      const ai: any = {
        models: {
          generateContentStream: vi.fn().mockRejectedValue(new Error('Invalid API key')),
        },
      };

      await expect(
        generateWithFailoverStream({
          ai,
          model: 'primary-model',
          contents: [{ role: 'user', parts: [{ text: 'No fallback' }] }],
          config: {},
        }),
      ).rejects.toThrow('Invalid API key');

      expect(ai.models.generateContentStream).toHaveBeenCalledTimes(1);
    });

    test('preserves function-call chunks in merged streaming response', async () => {
      const ai: any = {
        models: {
          generateContentStream: vi.fn().mockResolvedValue(
            streamFromChunks([
              {
                candidates: [
                  {
                    content: {
                      parts: [
                        { text: 'Checking...' },
                        { functionCall: { name: 'read_file', args: { path: '/tmp/demo.txt' }, id: 'fc-1' } },
                      ],
                    },
                  },
                ],
              },
              {
                candidates: [{ content: { parts: [{ text: ' done' }] } }],
              },
            ]),
          ),
        },
      };

      const result = await generateWithFailoverStream({
        ai,
        model: 'primary-model',
        contents: [{ role: 'user', parts: [{ text: 'Need tool call' }] }],
        config: {},
      });
      const parsed = extractResponseParts(result.response);

      expect(parsed.text).toBe('Checking...\n done');
      expect(parsed.functionCalls).toEqual([
        {
          name: 'read_file',
          args: { path: '/tmp/demo.txt' },
          id: 'fc-1',
        },
      ]);
      expect(result.response?.candidates?.[0]?.content?.parts?.[1]).toEqual({
        functionCall: { name: 'read_file', args: { path: '/tmp/demo.txt' }, id: 'fc-1' },
      });
    });
  });
});
