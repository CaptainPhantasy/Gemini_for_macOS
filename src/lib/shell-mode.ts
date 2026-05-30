export type ShellMode = 'compact' | 'medium' | 'expanded';

export const SHELL_BREAKPOINTS = {
  medium: 768,
  expanded: 1200,
} as const;

export interface ShellDrawerState {
  mobileSidebarOpen: boolean;
  navDrawerOpen: boolean;
  canvasDrawerOpen: boolean;
}

export function getShellMode(width: number): ShellMode {
  if (!Number.isFinite(width) || width < 0) return 'compact';
  if (width < SHELL_BREAKPOINTS.medium) return 'compact';
  if (width < SHELL_BREAKPOINTS.expanded) return 'medium';
  return 'expanded';
}

export function normalizeShellDrawersForMode(
  _nextMode: ShellMode,
  state: ShellDrawerState,
): ShellDrawerState {
  return {
    ...state,
    mobileSidebarOpen: false,
  };
}
