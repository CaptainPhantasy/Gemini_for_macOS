import { describe, it, expect } from 'vitest';
import { sanitizeText, getSafeErrorMessage } from '../lib/security';
import {
  parseThreadsJSON,
  parseGemsJSON,
  parseScheduledActionsJSON,
  parseArtifactsJSON,
  parsePersonalIntelligenceJSON
} from '../lib/json-validation';

describe('Security Utilities', () => {
  describe('sanitizeText', () => {
    it('should remove script tags', () => {
      const dirty = '<script>alert("xss")</script>Hello';
      const clean = sanitizeText(dirty);
      expect(clean).not.toContain('<script>');
      expect(clean).toContain('Hello');
    });

    it('should remove event handlers', () => {
      const dirty = '<img onload="alert()" src="x">';
      const clean = sanitizeText(dirty);
      expect(clean).not.toContain('onload');
    });

    it('should limit text length', () => {
      const longText = 'a'.repeat(1000);
      const clean = sanitizeText(longText);
      expect(clean.length).toBeLessThanOrEqual(500);
    });

    it('should handle non-string input', () => {
      expect(sanitizeText(null as any)).toBe('');
      expect(sanitizeText(undefined as any)).toBe('');
    });
  });

  describe('getSafeErrorMessage', () => {
    it('should handle string errors', () => {
      const msg = getSafeErrorMessage('Something went wrong');
      expect(msg).toContain('Something went wrong');
    });

    it('should handle Error objects', () => {
      const error = new Error('Network error');
      const msg = getSafeErrorMessage(error);
      expect(msg).toContain('Network error');
    });

    it('should handle unknown types', () => {
      const msg = getSafeErrorMessage({ random: 'object' });
      expect(msg).toBe('An error occurred');
    });
  });
});

describe('JSON Validation', () => {
  describe('parseThreadsJSON', () => {
    it('should parse valid threads JSON', () => {
      const data = JSON.stringify([
        {
          id: '1',
          title: 'Test',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ]);
      const result = parseThreadsJSON(data);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should return empty array for invalid data', () => {
      expect(parseThreadsJSON('invalid json')).toEqual([]);
      expect(parseThreadsJSON(null)).toEqual([]);
      expect(parseThreadsJSON('not an array')).toEqual([]);
    });

    it('should filter out invalid threads', () => {
      const data = JSON.stringify([
        { id: '1', title: 'Valid', messages: [], createdAt: 1, updatedAt: 1 },
        { id: '2', title: 'Missing fields' }
      ]);
      const result = parseThreadsJSON(data);
      expect(result).toHaveLength(1);
    });
  });

  describe('parseGemsJSON', () => {
    it('should parse valid gems JSON', () => {
      const data = JSON.stringify([
        {
          id: '1',
          name: 'Test Gem',
          systemInstruction: 'Be helpful',
          createdAt: Date.now()
        }
      ]);
      const result = parseGemsJSON(data);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test Gem');
    });

    it('should return empty array for invalid data', () => {
      expect(parseGemsJSON('invalid')).toEqual([]);
      expect(parseGemsJSON(null)).toEqual([]);
    });
  });

  describe('parseScheduledActionsJSON', () => {
    it('should parse valid scheduled actions', () => {
      const data = JSON.stringify([
        {
          id: '1',
          cron: '0 0 * * *',
          prompt: 'Daily task',
          enabled: true
        }
      ]);
      const result = parseScheduledActionsJSON(data);
      expect(result).toHaveLength(1);
      expect(result[0].cron).toBe('0 0 * * *');
    });

    it('should return empty array for invalid data', () => {
      expect(parseScheduledActionsJSON('invalid')).toEqual([]);
    });
  });

  describe('parseArtifactsJSON', () => {
    it('should parse valid artifacts', () => {
      const data = JSON.stringify([
        {
          id: '1',
          title: 'Code',
          content: 'const x = 1;',
          type: 'code',
          createdAt: Date.now()
        }
      ]);
      const result = parseArtifactsJSON(data);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('code');
    });

    it('should return empty array for invalid data', () => {
      expect(parseArtifactsJSON('invalid')).toEqual([]);
    });

    it('should validate artifact type', () => {
      const data = JSON.stringify([
        {
          id: '1',
          title: 'Invalid',
          content: 'test',
          type: 'invalid-type',
          createdAt: Date.now()
        }
      ]);
      const result = parseArtifactsJSON(data);
      expect(result).toHaveLength(0);
    });
  });

  describe('parsePersonalIntelligenceJSON', () => {
    it('should parse valid PI data', () => {
      const data = JSON.stringify({
        preferences: 'Be concise',
        instructions: 'Answer in English'
      });
      const result = parsePersonalIntelligenceJSON(data);
      expect(result.preferences).toBe('Be concise');
      expect(result.instructions).toBe('Answer in English');
    });

    it('should return defaults for invalid data', () => {
      expect(parsePersonalIntelligenceJSON('invalid')).toEqual({
        preferences: '',
        instructions: ''
      });
    });
  });
});
