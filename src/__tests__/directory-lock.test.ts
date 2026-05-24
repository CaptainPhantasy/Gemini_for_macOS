import { describe, expect, it } from 'vitest';
import {
  buildDirectoryLockPrompt,
  getDirectoryLockViolation,
  isPathWithinDirectoryLock,
  normalizeLockPath,
} from '../lib/directory-lock';

describe('directory lock', () => {
  it('normalizes trailing slashes and backslashes', () => {
    expect(normalizeLockPath('/tmp/project///')).toBe('/tmp/project');
    expect(normalizeLockPath('C:\\Users\\Project\\')).toBe('C:/Users/Project');
  });

  it('allows the locked root and descendants', () => {
    expect(isPathWithinDirectoryLock('/Volumes/Work/App', '/Volumes/Work/App')).toBe(true);
    expect(isPathWithinDirectoryLock('/Volumes/Work/App/src/index.ts', '/Volumes/Work/App')).toBe(true);
  });

  it('blocks sibling paths that only share a prefix', () => {
    expect(isPathWithinDirectoryLock('/Volumes/Work/App2/file.ts', '/Volumes/Work/App')).toBe(false);
  });

  it('reports violations for path-like tool arguments outside the lock', () => {
    const violation = getDirectoryLockViolation(
      { path: '/Volumes/Other/file.txt' },
      { enabled: true, rootPath: '/Volumes/Work/App' },
    );
    expect(violation).toContain('Directory lock violation');
  });

  it('does not report violations when the lock is disabled', () => {
    expect(getDirectoryLockViolation(
      { path: '/Volumes/Other/file.txt' },
      { enabled: false, rootPath: '/Volumes/Work/App' },
    )).toBeNull();
  });

  it('adds explicit model instructions when enabled', () => {
    const prompt = buildDirectoryLockPrompt({ enabled: true, rootPath: '/Volumes/Work/App' });
    expect(prompt).toContain('DIRECTORY LOCK: ENABLED');
    expect(prompt).toContain('/Volumes/Work/App');
    expect(prompt).toContain('MUST NOT');
  });
});
