// src/js/themes.js
import { cfg } from './state.js';

// Canonical palette definitions (vibe → CSS vars)
const THEMES = {
  classic:     { '--bg': '#000',    '--fg': '#03ffaf', '--accent': '#0ff' },
  mainframe:   { '--bg': '#0a0700', '--fg': '#ffd18a', '--accent': '#ffae00' },
  msdos:       { '--bg': '#1F1F1F', '--fg': '#C0C0C0', '--accent': '#FFFFFF' },
  clu:         { '--bg': '#001318', '--fg': '#9de7ff', '--accent': '#2ad1ff' },
  skynet:      { '--bg': '#0a0000', '--fg': '#ff4d4d', '--accent': '#ff0000' },
  deepthought: { '--bg': '#0a0010', '--fg': '#e0b3ff', '--accent': '#aa33ff' }
};

const LABELS = {
  classic: 'classic',
  mainframe: 'mainframe',
  msdos: 'MS-DOS',
  clu: 'CLU',
  skynet: 'skynet',
  deepthought: 'deep thought'
};

/**
 * Normalize an arbitrary input into a known vibe key.
 * Accepts variants like "MS-DOS" / "ms dos" → "msdos", "deep thought" → "deepthought".
 * @param {string} name - Vibe name to normalize.
 * @returns {string} Canonical key present in {@link THEMES} (defaults to "classic").
 */
function normalizeVibe(name) {
  if (!name) return 'classic';
  const s = String(name).trim().toLowerCase();
  if (s === 'deep thought' || s === 'deep_thought') return 'deepthought';
  if (s === 'ms-dos' || s === 'ms dos') return 'msdos';
  if (THEMES[s]) return s;
  const collapsed = s.replace(/[\s_-]+/g, '');
  if (THEMES[collapsed]) return collapsed;
  return 'classic';
}

/**
 * Current vibe key from cfg (normalized), tolerating legacy cfg.theme.
 * @returns {string} Canonical current vibe key.
 */
function currentVibeKey() {
  return normalizeVibe(cfg?.vibe ?? cfg?.theme);
}

/**
 * Apply CSS variables for a vibe and update the HUD label text.
 * If no label element exists, only CSS variables are applied.
 * @param {string} vibe - Vibe key (e.g., "classic", "clu").
 * @returns {void}
 */
export function applyTheme(vibe) {
  const key = normalizeVibe(vibe);
  const vars = THEMES[key] || THEMES.classic;
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));

  const label =
    document.getElementById('vibeName') || // new
    document.getElementById('themeName');  // legacy

  if (label) {
    label.textContent = LABELS[key] || key;
    label.dataset.vibe = key;
  }
}

/**
 * Internal: set vibe in cfg and notify listeners via the event bus.
 * Falls back to directly applying the theme if no bus exists.
 * @param {string} next - Next vibe key to activate.
 * @returns {void}
 */
function setVibeInternal(next) {
  const key = normalizeVibe(next);
  if (cfg) cfg.vibe = key;

  const bus = (window.app && window.app.events) || window.events;
  if (bus && typeof bus.emit === 'function') {
    bus.emit('vibe', key);
  } else {
    applyTheme(key);
  }
}

/**
 * Cycle vibes forward/backward.
 * @param {number} [dir] - +1 for next, -1 for previous.
 * @returns {void}
 */
export function cycleVibe(dir = +1) {
  const keys = Object.keys(THEMES);
  const cur = currentVibeKey();
  const i = keys.indexOf(cur);
  const j = ((i < 0 ? 0 : i) + Math.sign(dir) + keys.length) % keys.length;
  const next = keys[j];
  setVibeInternal(next);
}

/**
 * Set vibe by name (normalized).
 * @param {string} name - Vibe name or alias.
 * @returns {void}
 */
export function setVibeByName(name) {
  setVibeInternal(name);
}

/** Exported list for UI menus, etc. */
export const themeNames = Object.keys(THEMES);

/**
 * Initialize the vibe at startup, tolerating legacy cfg.theme.
 * Applies via the event bus so listeners (and labels) update.
 * @returns {void}
 */
export function initThemes() {
  const initial =
    window.app?.state?.vibe ??
    window.app?.state?.theme ??   // legacy
    window.app?.cfg?.vibe ??
    window.app?.cfg?.theme ??     // legacy
    'classic';
  setVibeInternal(initial);
}

/* -------------------------------------------------------------------------- */
/* Back-compat exports to avoid breaking older callers                         */
/* -------------------------------------------------------------------------- */

/**
 * Legacy alias for cycling themes; calls {@link cycleVibe}.
 * @param {number} [dir] - +1 for next, -1 for previous.
 * @returns {void}
 */
export function cycleTheme(dir = +1) {
  cycleVibe(dir);
}

/**
 * Legacy alias for setting by name; calls {@link setVibeByName}.
 * @param {string} name - Theme (vibe) name or alias.
 * @returns {void}
 */
export function setThemeByName(name) {
  setVibeByName(name);
}
