const KEY = 'gemini-window-state';
export const windowState = {
  save: (state) => localStorage.setItem(KEY, JSON.stringify(state)),
  load: () => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{}');
    } catch { return {}; }
  }
};
