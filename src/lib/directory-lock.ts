export interface DirectoryLockSettings {
  enabled: boolean;
  rootPath: string;
}

const PATH_LIKE_KEYS = ['path', 'newPath', 'destination', 'targetPath', 'filePath', 'folderPath'];

export function normalizeLockPath(rawPath: string): string {
  const trimmed = rawPath.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  return trimmed === '' ? '' : trimmed;
}

export function isPathWithinDirectoryLock(candidatePath: string, lockRoot: string): boolean {
  const candidate = normalizeLockPath(candidatePath);
  const root = normalizeLockPath(lockRoot);
  if (!root || !candidate) return true;
  return candidate === root || candidate.startsWith(`${root}/`);
}

export function getDirectoryLockViolation(args: Record<string, unknown>, lock: DirectoryLockSettings): string | null {
  if (!lock.enabled || !lock.rootPath.trim()) return null;

  const lockedRoot = normalizeLockPath(lock.rootPath);
  for (const key of PATH_LIKE_KEYS) {
    const value = args[key];
    if (typeof value === 'string' && value.startsWith('/') && !isPathWithinDirectoryLock(value, lockedRoot)) {
      return `Directory lock violation: ${key} "${value}" is outside locked root "${lockedRoot}".`;
    }
  }

  return null;
}

export function buildDirectoryLockPrompt(lock: DirectoryLockSettings | undefined): string {
  if (!lock?.enabled || !lock.rootPath.trim()) {
    return 'DIRECTORY LOCK: disabled. User has not restricted file operations to a single root.';
  }

  return [
    'DIRECTORY LOCK: ENABLED.',
    `Locked root: ${normalizeLockPath(lock.rootPath)}.`,
    'You MUST NOT read, write, list, move, delete, or inspect filesystem paths outside the locked root.',
    'If a requested action needs a path outside the locked root, ask the user to unlock or change the locked directory instead of attempting the action.',
    'Shell/process execution is blocked while the directory lock is enabled because commands can escape filesystem boundaries.',
  ].join('\n');
}
