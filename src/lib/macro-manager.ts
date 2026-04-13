const KEY = 'gemini-macros';
export const macroManager = {
  get: () => JSON.parse(localStorage.getItem(KEY) || '[]'),
  save: (macro) => {
    const macros = macroManager.get();
    macros.push(macro);
    localStorage.setItem(KEY, JSON.stringify(macros));
  },
  execute: async (macro, context) => {
    for (const step of macro.steps) {
      console.log('Executing macro step: ' + step.type);
    }
  }
};
