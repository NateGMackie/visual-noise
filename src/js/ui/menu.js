/* eslint-env browser */
// src/js/ui/menu.js

import {
  cfg,
  setMode,
  incSpeed,
  decSpeed,
  togglePause,
  clearAll,
  labelsForMode,
  emit,
} from '../state.js';
import { registry } from '../modes/index.js';
import { themeNames, setThemeByName, cycleTheme } from '../themes.js';
import { WakeLock } from '../lib/wake_lock.js';
import { toggleScanlines, toggleFlicker } from '../ui/effects.js';
import { notify, NOTIFY } from './notify.js';


/* ----------------------------------------
   Safe localStorage alias
---------------------------------------- */
const LS = (() => {
  try { return globalThis.localStorage || window.localStorage; }
  catch { return null; }
})();

/* ----------------------------------------
   Small helper: make any element clickable
---------------------------------------- */
/**
 * Make an element behave like a button and call a handler on activation.
 * Adds keyboard support (Enter/Space) and a pointer cursor.
 * @param {HTMLElement | null} el
 * @param {(e: Event) => void} onActivate
 * @returns {void}
 */
function makeClickable(el, onActivate) {
  if (!el) return;
  el.tabIndex = 0;
  el.classList?.add('clickable');
  el.addEventListener('click', (e) => {
    e.preventDefault();
    onActivate?.(e);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate?.(e);
    }
  });
}

/* ----------------------------------------
   Button sync helpers (fixed labels + aria)
---------------------------------------- */
export function syncAwakeButton() {
  const btn = document.getElementById('awakeBtn');
  if (!btn) return;
  const on = !!WakeLock.isEnabled();

  btn.textContent = 'Awake';
  btn.setAttribute('aria-pressed', String(on));
  btn.title = 'Toggle screen wake lock (A)';
  btn.classList.toggle('is-awake', on);
}

export function syncPauseButton() {
  const btn = document.getElementById('pauseBtn');
  if (!btn) return;
  const paused = !!cfg.paused;

  btn.textContent = 'Pause';
  btn.setAttribute('aria-pressed', String(paused));
  btn.title = 'Pause (P)';
  btn.classList.toggle('is-paused', paused);
}

export function syncScanlinesButton() {
  const btn = document.getElementById('scanBtn');
  if (!btn) return;
  const on = document.body.classList.contains('scanlines');

  btn.textContent = 'Scanlines';
  btn.setAttribute('aria-pressed', String(on));
  btn.title = 'Toggle CRT scanlines (S)';
  btn.classList.toggle('is-scanlines', on);
}

export function syncFlickerButton() {
  const btn = document.getElementById('flickerBtn');
  if (!btn) return;
  const on = document.body.classList.contains('flicker');

  btn.textContent = 'Flicker';
  btn.setAttribute('aria-pressed', String(on));
  btn.title = 'Toggle screen flicker (V)';
  btn.classList.toggle('is-flicker', on);
}

/* ----------------------------------------
   Init footer/menu wiring
---------------------------------------- */
/**
 * Initialize footer menu interactions (labels + buttons).
 * @returns {void}
 */
export function initMenu() {
  // Name elements
  const modeName  = document.getElementById('genreName') || document.getElementById('modeName');
  const typeName  = document.getElementById('styleName') || document.getElementById('typeName');
  const themeName = document.getElementById('vibeName')  || document.getElementById('themeName');

  // Clickable label containers
  const modeLabelEl  = modeName?.closest('label')  || modeName;
  const styleLabelEl = typeName?.closest('label')  || typeName;
  const themeLabelEl = themeName?.closest('label') || themeName;

  // Buttons
  const speedUpBtn   = document.getElementById('speedUp');
  const speedDownBtn = document.getElementById('speedDown');
  const pauseBtn     = document.getElementById('pauseBtn');
  const clearBtn     = document.getElementById('clearBtn');
  const awakeBtn     = document.getElementById('awakeBtn');
  const scanBtn      = document.getElementById('scanBtn');
  const flickerBtn   = document.getElementById('flickerBtn');

  const modes = Object.keys(registry);

  // Label updaters
  const setModeLabel = () => {
    const { familyLabel, typeLabel } = labelsForMode(cfg.persona);
    if (modeName) modeName.textContent = familyLabel;
    if (typeName) typeName.textContent = typeLabel;
  };
  const setThemeLabel = (name) => {
    if (themeName) themeName.textContent = name;
    if (themeName && typeof name === 'string') {
      themeName.dataset.vibe = name;
    }
  };

  // --- Clickable labels ---

  // Genre/Mode: cycle families (Shift+click = previous)
  makeClickable(modeLabelEl, (e) => {
    const meta = Object.fromEntries(modes.map((m) => [m, labelsForMode(m)]));
    const familyList = Array.from(new Set(modes.map((m) => meta[m]?.familyLabel || ''))).filter(Boolean);
    const byFamily = familyList.map((fam) => ({
      family: fam,
      modes: modes.filter((m) => (meta[m]?.familyLabel || '') === fam),
    }));

    const currentMode = cfg.persona;
    const curFam  = meta[currentMode]?.familyLabel || '';
    const curType = meta[currentMode]?.typeLabel  || '';
    const famIdx  = Math.max(0, familyList.indexOf(curFam));

    const dir = e?.shiftKey ? -1 : +1;
    const nextFamIdx = (famIdx + (dir > 0 ? 1 : familyList.length - 1)) % familyList.length;
    const nextFamily = byFamily[nextFamIdx];
    if (!nextFamily || !nextFamily.modes.length) return;

    // Prefer same type in next family; fallback to first
    const candidate = nextFamily.modes.find((m) => meta[m]?.typeLabel === curType) || nextFamily.modes[0];

    setMode(candidate);
    setModeLabel();
  });

  // Vibe/Theme: next theme (or cycleTheme fallback)
  makeClickable(themeLabelEl, () => {
    if (Array.isArray(themeNames) && themeNames.length && typeof setThemeByName === 'function') {
      const cur = (themeName?.dataset?.vibe || cfg.theme || '').trim();
      const idx = Math.max(0, themeNames.indexOf(cur));
      const next = themeNames[(idx + 1) % themeNames.length];
      setThemeByName(next);
      setThemeLabel(next);
    } else {
      cycleTheme();
    }
  });

  // Style: cycle within current family (Shift+click = previous)
  makeClickable(styleLabelEl, (e) => {
    const meta = Object.fromEntries(modes.map((m) => [m, labelsForMode(m)]));
    const familyList = Array.from(new Set(modes.map((m) => meta[m]?.familyLabel || ''))).filter(Boolean);
    const byFamily = familyList.map((fam) => ({
      family: fam,
      modes: modes.filter((m) => (meta[m]?.familyLabel || '') === fam),
    }));

    const currentMode = cfg.persona;
    const curFam  = meta[currentMode]?.familyLabel || '';
    const curType = meta[currentMode]?.typeLabel  || '';
    const famIdx  = Math.max(0, familyList.indexOf(curFam));

    const typesInFam = Array.from(
      new Set(byFamily[famIdx]?.modes.map((m) => meta[m]?.typeLabel || ''))
    ).filter(Boolean);
    if (!typesInFam.length) return;

    const dir = e?.shiftKey ? -1 : +1;
    const typeIdx = Math.max(0, typesInFam.indexOf(curType));
    const nextType = typesInFam[(typeIdx + (dir > 0 ? 1 : typesInFam.length - 1)) % typesInFam.length];

    const candidate =
      byFamily[famIdx].modes.find((m) => meta[m]?.typeLabel === nextType) ||
      byFamily[famIdx].modes[0];

    if (candidate) {
      setMode(candidate);
      setModeLabel();
    }
  });

  // --- Buttons ---
  if (speedUpBtn)   speedUpBtn.onclick   = () => incSpeed();
  if (speedDownBtn) speedDownBtn.onclick = () => decSpeed();

  if (pauseBtn) {
    syncPauseButton();
    pauseBtn.onclick = () => {
      togglePause();
      syncPauseButton();
    };
  }

  if (clearBtn) clearBtn.onclick = () => clearAll();

  // Keep Awake toggle centralization (click + hotkey share this)
  const toggleAwakeCentral = async () => {
    const currentlyOn = WakeLock.isEnabled();
    let next = false;
    if (currentlyOn) {
      WakeLock.disable();
      next = false;
    } else {
      next = (await WakeLock.enable()) === true;
      if (!next) {
        // If request failed (e.g., unsupported/denied), ensure it's off
        WakeLock.disable();
      }
    }
    LS?.setItem?.('vn.keepAwake', next ? '1' : '0');
    emit('power', next);
    syncAwakeButton();
  };

  if (awakeBtn) {
    // Initialize from persisted preference
    const stored = (LS?.getItem?.('vn.keepAwake') || '').trim();
    const wantOn = stored === '1' || stored.toLowerCase() === 'true';
    (async () => {
      let effective = false;
      if (wantOn) effective = (await WakeLock.enable()) === true;
      if (!wantOn) WakeLock.disable();
      LS?.setItem?.('vn.keepAwake', effective ? '1' : '0');
      emit('power', effective);
      syncAwakeButton();
    })();

    // Click/keyboard
    awakeBtn.onclick = toggleAwakeCentral;
    syncAwakeButton();

    // Resync when visibility/focus affects WakeLock
    const resync = () => syncAwakeButton();
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('focus', resync);
    window.addEventListener('blur', resync);
  }

// --- Scanlines / Flicker buttons ---
if (scanBtn) {
  syncScanlinesButton();
  scanBtn.onclick = () => {
    toggleScanlines();
    const on = document.body.classList.contains('scanlines');
    syncScanlinesButton();
    // toast
    notify(NOTIFY.state, `Scanlines: ${on ? 'ON' : 'OFF'}`, { coalesce: true });
  };
}

if (flickerBtn) {
  syncFlickerButton();
  flickerBtn.onclick = () => {
    toggleFlicker();
    const on = document.body.classList.contains('flicker');
    syncFlickerButton();
    // toast
    notify(NOTIFY.state, `Flicker: ${on ? 'ON' : 'OFF'}`, { coalesce: true });
  };
}

  // --- Optional: local hotkey for Awake ('a') if you want it here.
  // If your global hotkeys already handle this, you can delete this block.
  document.addEventListener('keydown', (e) => {
    const tag = (e.target && (e.target.tagName || '')).toLowerCase();
    const editable = tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable);
    if (editable) return;
    if (e.key && e.key.toLowerCase() === 'a' && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      toggleAwakeCentral();
    }
  });

  // Initial label paint
  setModeLabel();
  window.requestAnimationFrame(setModeLabel); // ensure after first layout
  syncPauseButton();
  syncAwakeButton();
  syncScanlinesButton();
  syncFlickerButton();
}
