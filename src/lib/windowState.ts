interface WindowState {
  [key: string]: unknown;
}

const KEY = 'gemini-window-state';
export const windowState = {
  save: (state: WindowState) => localStorage.setItem(KEY, JSON.stringify(state)),
  load: (): WindowState => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{}');
    } catch { return {}; }
  }
};