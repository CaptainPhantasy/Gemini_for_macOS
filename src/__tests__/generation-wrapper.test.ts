import { describe, expect, test } from 'vitest';
import { isTransientError, generateWithFailover } from '../lib/generation-wrapper';
import type { GenerationOptions } from '../lib/generation-wrapper';

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
});