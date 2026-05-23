interface MacroStep {
  type: string;
  [key: string]: unknown;
}

interface Macro {
  name: string;
  steps: MacroStep[];
  [key: string]: unknown;
}

interface MacroContext {
  [key: string]: unknown;
}

const KEY = 'gemini-macros';
export const macroManager = {
  get: (): Macro[] => JSON.parse(localStorage.getItem(KEY) || '[]'),
  save: (macro: Macro) => {
    const macros = macroManager.get();
    macros.push(macro);
    localStorage.setItem(KEY, JSON.stringify(macros));
  },
  execute: async (macro: Macro, context: MacroContext) => {
    for (const step of macro.steps) {
      console.log('Executing macro step: ' + step.type);
    }
  }
};