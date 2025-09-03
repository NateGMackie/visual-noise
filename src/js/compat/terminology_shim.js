// src/compat/terminology_shim.js
// One-release compatibility layer for terminology migration.
//
// Canonicals (NOW):
//   - "genre"  (was family/mode, previously "system")
//   - "style"  (was flavor/type, previously "program")
//   - "vibe"   (was "theme")
//
// UI: "menu bar" (formerly "nav bar"/"navbar" and previously also "menuBar" handle)
//
// This shim:
//  - Ensures app.state.<legacy> <-> app.state.<canonical> stay in sync (r/w aliases)
//  - Mirrors events between legacy and canonical names
//  - Adds CSS class aliasing (.navbar -> .menu-bar) for one release
//  - Logs once-per-alias deprecation warnings to help you find remaining references

export function installTerminologyAliases(app = {}) {
  const warned = new Set();
  const once = (key, msg) => {
    if (!warned.has(key)) { warned.add(key); console.warn(msg); }
  };

  // Bridge events: if your bus has on/emit, we mirror both ways.
  function bridgeEvents(bus, pairs) {
    if (!bus || typeof bus.on !== 'function' || typeof bus.emit !== 'function') return;
    pairs.forEach(([a, b]) => {
      bus.on(a, (...args) => bus.emit(b, ...args));
      bus.on(b, (...args) => bus.emit(a, ...args));
    });
  }

  // Define a read/write alias between legacyKey and modernKey on obj
  function aliasProp(obj, legacyKey, modernKey, msg) {
    if (!obj) return;
    // Seed
    if (legacyKey in obj && !(modernKey in obj)) obj[modernKey] = obj[legacyKey];
    if (modernKey in obj && !(legacyKey in obj)) obj[legacyKey] = obj[modernKey];
    if (!(legacyKey in obj) && !(modernKey in obj)) {
      obj[legacyKey] = undefined;
      obj[modernKey] = undefined;
    }
    Object.defineProperty(obj, legacyKey, {
      get()  { once(`get:${legacyKey}`, msg); return obj[modernKey]; },
      set(v) { once(`set:${legacyKey}`, msg); obj[modernKey] = v;    },
      enumerable: true,
      configurable: true,
    });
  }

  const state = app.state || (app.state = {});
  const ui    = app.ui    || (app.ui    = {});
  const bus   = app.events || app.bus || app.emitter;

  // ---- Canonical seeds -----------------------------------------------------
  // Canonicals now: genre/style/vibe
  if (!('genre'  in state)) state.genre  = state.system ?? state.family ?? state.mode    ?? undefined;
  if (!('style'  in state)) state.style  = state.program?? state.flavor ?? state.type    ?? undefined;
  if (!('vibe'   in state)) state.vibe   = state.theme  ?? undefined;

  // ---- Aliases: legacy -> canonical ---------------------------------------
  // Old-old -> canonical
  aliasProp(state, 'family', 'genre',  '[DEPRECATED] "family" → "genre".');
  aliasProp(state, 'mode',   'genre',  '[DEPRECATED] "mode" (group) → "genre".');
  aliasProp(state, 'flavor', 'style',  '[DEPRECATED] "flavor" → "style".');
  aliasProp(state, 'type',   'style',  '[DEPRECATED] "type" → "style".');
  aliasProp(state, 'theme',  'vibe',   '[DEPRECATED] "theme" → "vibe".');

  // Recent (previous canonical) -> new canonical
  aliasProp(state, 'system',  'genre',  '[DEPRECATED] "system" → "genre".');
  aliasProp(state, 'program', 'style',  '[DEPRECATED] "program" → "style".');

  // Registries / lookups
  // families/modes -> genres; flavors/types -> styles; themes -> vibes; systems/programs (prev) -> genres/styles
  const registryPairs = [
    ['families', 'genres'],
    ['modes',    'genres'],
    ['systems',  'genres'], // previous canonical
    ['flavors',  'styles'],
    ['types',    'styles'],
    ['programs', 'styles'], // previous canonical
    ['themes',   'vibes'],
  ];
  registryPairs.forEach(([legacy, modern]) => {
    if (state[legacy] && !state[modern]) state[modern] = state[legacy];
    if (state[modern] && !state[legacy]) {
      Object.defineProperty(state, legacy, {
        get() { once(`get:${legacy}`, `[DEPRECATED] "${legacy}" → "${modern}".`); return state[modern]; },
        set(v){ once(`set:${legacy}`, `[DEPRECATED] "${legacy}" → "${modern}".`); state[modern] = v; },
        enumerable: true,
        configurable: true,
      });
    }
  });

  // ---- Event mirroring -----------------------------------------------------
  bridgeEvents(bus, [
    // selection changes
    ['family:changed',   'genre:changed'],
    ['mode:changed',     'genre:changed'],
    ['system:changed',   'genre:changed'],  // previous canonical
    ['flavor:changed',   'style:changed'],
    ['type:changed',     'style:changed'],
    ['program:changed',  'style:changed'],  // previous canonical
    // theme/vibe
    ['theme',            'vibe'],
    ['theme:changed',    'vibe:changed'],
    // UI menu terminology
    ['navbar:toggled',   'menubar:toggled'],
    ['nav:show',         'menu:show'],
    ['nav:hide',         'menu:hide'],
  ]);

  // ---- UI handle aliases ---------------------------------------------------
  aliasProp(ui, 'navBar',  'menuBar', '[DEPRECATED] "navBar" → "menuBar".');
  aliasProp(ui, 'navbar',  'menuBar', '[DEPRECATED] "navbar" → "menuBar".');

  // ---- CSS class aliasing (.navbar -> .menu-bar) ---------------------------
  try {
    const ensureClass = (from, to) => {
      document.querySelectorAll(`.${from}`).forEach(el => {
        if (!el.classList.contains(to)) el.classList.add(to);
      });
    };
    ensureClass('navbar', 'menu-bar');
  } catch (_) {
    // non-DOM envs
  }

  // ---- String/label helpers (optional convenience) ------------------------
  app.terms = Object.assign({}, app.terms, {
    toLabel(key) {
      switch (key) {
        case 'genre':  return 'Genre';
        case 'style':  return 'Style';
        case 'vibe':   return 'Vibe';
        case 'menuBar':return 'Menu';
        default:        return key;
      }
    },
    legacyToModern(key) {
      switch (key) {
        // groups
        case 'family': case 'mode': case 'system': return 'genre';
        // items
        case 'flavor': case 'type': case 'program': return 'style';
        // theme
        case 'theme': return 'vibe';
        // menu
        case 'nav bar': case 'navbar': case 'nav': return 'menu bar';
        default: return key;
      }
    }
  });

  return app;
}
