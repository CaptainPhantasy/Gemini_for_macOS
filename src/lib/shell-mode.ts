export type ShellMode = 'compact' | 'medium' | 'expanded';
export type ShellVertical = 'mobile' | 'tablet' | 'desktop';

export const SHELL_BREAKPOINTS = {
  tablet: 768,
  desktop: 1200,
} as const;

const SHELL_VERTICAL_TO_MODE: Record<ShellVertical, ShellMode> = {
  mobile: 'compact',
  tablet: 'medium',
  desktop: 'expanded',
};

export interface ShellDrawerState {
  mobileSidebarOpen: boolean;
  navDrawerOpen: boolean;
  canvasDrawerOpen: boolean;
}

export function getShellVertical(width: number): ShellVertical {
  if (!Number.isFinite(width) || width < 0) return 'mobile';
  if (width < SHELL_BREAKPOINTS.tablet) return 'mobile';
  if (width < SHELL_BREAKPOINTS.desktop) return 'tablet';
  return 'desktop';
}

export function getShellMode(width: number): ShellMode {
  return SHELL_VERTICAL_TO_MODE[getShellVertical(width)];
}

export function getShellVerticalForPath(pathname: string, width: number): ShellVertical {
  const normalizedPath = pathname.toLowerCase();
  const vertical = (Object.keys(SHELL_VERTICAL_TO_MODE) as ShellVertical[])
    .find((candidate) => normalizedPath === `/gemini/${candidate}` || normalizedPath.startsWith(`/gemini/${candidate}/`));

  return vertical ?? getShellVertical(width);
}

export function getShellModeForPath(pathname: string, width: number): ShellMode {
  return SHELL_VERTICAL_TO_MODE[getShellVerticalForPath(pathname, width)];
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
