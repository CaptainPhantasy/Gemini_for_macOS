// Dev-gated logger. In production builds, debug/info are no-ops so we don't
// leak internal state to the console. Warn/error always fire so real failures
// remain visible.
const isDev =
  typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV;

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDev) console.log(...args);
  },
  info: (...args: unknown[]) => {
    if (isDev) console.info(...args);
  },
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};
