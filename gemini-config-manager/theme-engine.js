/* ==========================================================================
   GEMINI Theme Engine — drop-in theme switcher (no-dependency plain script)
   ==========================================================================
   Usage: <script src="theme-engine.js"></script>
          const engine = new ThemeEngine();
          engine.setTheme('dracula');
          engine.apply();
   ========================================================================== */

var STORAGE_KEY = 'gemini-theme-engine:v1';


const THEMES = [
  { id: 'absolute-void', name: 'Absolute Void', description: 'True-black glass with cyan accents' },
  { id: 'dracula',       name: 'Dracula',       description: 'Purple-forward dark terminal classic' },
  { id: 'tokyo-night',   name: 'Tokyo Night',   description: 'Blue-black editor palette' },
  { id: 'gruvbox',       name: 'Gruvbox',       description: 'Warm retro earth tones' },
  { id: 'nord',          name: 'Nord',          description: 'Icy blue-grey serenity' },
  { id: 'matrix',        name: 'Matrix',        description: 'Phosphor green on true black' },
  { id: 'catppuccin',    name: 'Catppuccin',    description: 'Pastel mocha' },
];

const DENSITIES = ['comfortable', 'compact', 'spacious'];

class ThemeEngine {
  constructor() {
    this._state = this._load();
  }

  /* ---- public API ------------------------------------------------- */

  /** Apply the saved state to the document element. Call once on init. */
  apply() {
    const root = document.documentElement;
    root.setAttribute('data-theme', this._state.theme);
    root.setAttribute('data-density', this._state.density);
    root.setAttribute('data-effects', this._state.effects ? 'on' : 'off');
  }

  /** Switch to a theme by id. Persists to localStorage. */
  setTheme(id) {
    const match = THEMES.find(t => t.id === id);
    if (!match) throw new Error(`Unknown theme: ${id}. Valid: ${THEMES.map(t => t.id).join(', ')}`);
    this._state.theme = id;
    this._persist();
    this.apply();
  }

  /** Get the current theme id. */
  getTheme() { return this._state.theme; }

  /** Set interface density. */
  setDensity(density) {
    if (!DENSITIES.includes(density)) throw new Error(`Unknown density: ${density}`);
    this._state.density = density;
    this._persist();
    this.apply();
  }

  /** Cycle through densities. */
  cycleDensity() {
    const idx = DENSITIES.indexOf(this._state.density);
    this.setDensity(DENSITIES[(idx + 1) % DENSITIES.length]);
  }

  getDensity() { return this._state.density; }

  /** Enable/disable grain overlay. */
  setEffects(on) {
    this._state.effects = !!on;
    this._persist();
    this.apply();
  }

  getEffects() { return this._state.effects; }

  /** Get all available themes as { id, name, description }[]. */
  listThemes() { return THEMES.map(t => ({ ...t })); }

  /** Get available densities. */
  listDensities() { return [...DENSITIES]; }

  /** Reset to defaults. */
  reset() {
    this._state = { theme: 'absolute-void', density: 'comfortable', effects: false };
    this._persist();
    this.apply();
  }

  /* ---- internal --------------------------------------------------- */

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          theme: THEMES.some(t => t.id === parsed.theme) ? parsed.theme : 'absolute-void',
          density: DENSITIES.includes(parsed.density) ? parsed.density : 'comfortable',
          effects: typeof parsed.effects === 'boolean' ? parsed.effects : false,
        };
      }
    } catch { /* ignore corrupt storage */ }
    return { theme: 'absolute-void', density: 'comfortable', effects: false };
  }

  _persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._state)); } catch {}
  }
}

/** Optional: attach a theme picker UI to a <select> element. */
function bindThemePicker(selectElement, engine) {
  selectElement.innerHTML = '';
  for (const t of engine.listThemes()) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    selectElement.appendChild(opt);
  }
  selectElement.value = engine.getTheme();
  selectElement.addEventListener('change', () => engine.setTheme(selectElement.value));
}

/** Optional: bind density cycle to a button. */
function bindDensityToggle(buttonElement, engine) {
  buttonElement.addEventListener('click', () => {
    engine.cycleDensity();
    buttonElement.textContent = engine.getDensity();
  });
  buttonElement.textContent = engine.getDensity();
}
