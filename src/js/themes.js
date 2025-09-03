import { setTheme, cfg } from './state.js';

const THEMES = {
  classic:     { '--bg':'#000','--fg':'#03ffaf','--accent':'#0ff' },
  mainframe:   { '--bg':'#0a0700', '--fg':'#ffd18a', '--accent':'#ffae00' },
  msdos:       { '--bg':'#1F1F1F', '--fg':'#C0C0C0', '--accent':'#FFFFFF' },
  clu:         { '--bg':'#001318', '--fg':'#9de7ff', '--accent':'#2ad1ff' },
  skynet:      { '--bg':'#0a0000', '--fg':'#ff4d4d', '--accent':'#ff0000' },
  deepthought: { '--bg':'#0a0010', '--fg':'#e0b3ff', '--accent':'#aa33ff' },
};

const LABELS = {
  classic: 'classic',
  mainframe: 'mainframe',
  msdos: 'MS-DOS',
  clu: 'CLU',
  skynet: 'skynet',
  deepthought: 'deep thought',
};

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

function currentVibeKey() {
  return normalizeVibe(cfg.theme);
}

export function applyTheme(vibe) {
  const vars = THEMES[vibe] || THEMES.classic;
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));

  const label =
    document.getElementById('vibeName') ||   // new
    document.getElementById('themeName');    // legacy

  if (label) {
    label.textContent = vibe; // you can keep labels simple or prettify elsewhere
    label.dataset.vibe = vibe; // <-- add canonical key here
  }
}

export function cycleTheme(dir = +1) {
  const keys = Object.keys(THEMES);
  const cur  = currentVibeKey();
  const i    = keys.indexOf(cur);
  const j    = ((i < 0 ? 0 : i) + Math.sign(dir) + keys.length) % keys.length;
  const next = keys[j];
  setTheme(next); // emits 'theme' -> applyTheme will run via your bus wiring
}

export const themeNames = Object.keys(THEMES);
export function setThemeByName(name){ setTheme(normalizeVibe(name)); }

export function initThemes() {
  const initial =
    (window.app?.state?.vibe)  ?? (window.app?.state?.theme) ??
    (window.app?.cfg?.vibe)    ?? (window.app?.cfg?.theme)   ??
    'classic';
  applyTheme(initial);
}
