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
} from '../state.js';
import { registry } from '../modes/index.js';
import { themeNames, setThemeByName, cycleTheme } from '../themes.js';

// Small helper (duplicated here so this file is self-contained)
/**
 * Make an element behave like a button and call a handler on activation.
 * Adds keyboard support (Enter/Space) and a pointer cursor.
 * @param {globalThis.HTMLElement | null} el - The element to make clickable (label/div/span/etc.).
 * @param {(e: globalThis.Event) => void} onActivate - Handler invoked on click or keyboard activation.
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


// Exposed so keyboard handler can keep the label in sync.
/**
 * Sync the Pause/Resume button text and aria state with cfg.paused.
 * @returns {void}
 */
export function syncPauseButton() {
  const btn = document.getElementById('pauseBtn');
  if (!btn) return;
  const paused = !!cfg.paused;
  btn.textContent = paused ? 'Resume' : 'Pause';
  btn.setAttribute('aria-pressed', String(paused));
  btn.title = paused ? 'Resume (P)' : 'Pause (P)';
}

/**
 * Initialize footer menu interactions (labels + buttons).
 * @returns {void}
 */
export function initMenu() {
  // Elements
  const modeName  = document.getElementById('genreName') || document.getElementById('modeName');
  const typeName  = document.getElementById('styleName') || document.getElementById('typeName');
  const themeName = document.getElementById('vibeName')  || document.getElementById('themeName');

  const modeLabelEl  = modeName?.closest('label')  || modeName;
  const styleLabelEl = typeName?.closest('label')  || typeName;
  const themeLabelEl = themeName?.closest('label') || themeName;

  const speedUpBtn   = document.getElementById('speedUp');
  const speedDownBtn = document.getElementById('speedDown');
  const pauseBtn     = document.getElementById('pauseBtn');
  const clearBtn     = document.getElementById('clearBtn');

  const modes = Object.keys(registry);

  // Label updaters (local copies; UI also has its own for keyboard)
  const setModeLabel = () => {
    const { familyLabel, typeLabel } = labelsForMode(cfg.persona);
    if (modeName) modeName.textContent = familyLabel;
    if (typeName) typeName.textContent = typeLabel;
  };
  const setThemeLabel = (name) => {
    if (themeName) themeName.textContent = name;
  };

  // --- Clickable labels ---

  // Genre/Mode: cycle families (Shift+click = previous)
  makeClickable(modeLabelEl, (e) => {
    const meta = Object.fromEntries(modes.map((m) => [m, labelsForMode(m)]));
    const familyList = Array.from(new Set(modes.map((m) => meta[m]?.familyLabel || '')));
    const byFamily = familyList.map((fam) => ({
      family: fam,
      modes: modes.filter((m) => (meta[m]?.familyLabel || '') === fam),
    }));

    const currentMode = cfg.persona;
    const curFam  = meta[currentMode]?.familyLabel || '';
    const curType = meta[currentMode]?.typeLabel   || '';
    const famIdx = Math.max(0, familyList.indexOf(curFam));

    const dir = e?.shiftKey ? -1 : +1;
    const nextFamIdx = (famIdx + (dir > 0 ? 1 : familyList.length - 1)) % familyList.length;
    const nextFamily = byFamily[nextFamIdx];
    if (!nextFamily || !nextFamily.modes.length) return;

    // Prefer to keep the same type in the next family; fallback to first mode
    const candidate =
      nextFamily.modes.find((m) => meta[m]?.typeLabel === curType) ||
      nextFamily.modes[0];

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
    const familyList = Array.from(new Set(modes.map((m) => meta[m]?.familyLabel || '')));
    const byFamily = familyList.map((fam) => ({
      family: fam,
      modes: modes.filter((m) => (meta[m]?.familyLabel || '') === fam),
    }));

    const currentMode = cfg.persona;
    const curFam  = meta[currentMode]?.familyLabel || '';
    const curType = meta[currentMode]?.typeLabel   || '';
    const famIdx = Math.max(0, familyList.indexOf(curFam));
    const typesInFam = Array.from(
      new Set(byFamily[famIdx]?.modes.map((m) => meta[m]?.typeLabel || ''))
    );
    if (!typesInFam.length) return;

    const dir = e?.shiftKey ? -1 : +1;
    const typeIdx  = Math.max(0, typesInFam.indexOf(curType));
    const nextType =
      typesInFam[(typeIdx + (dir > 0 ? 1 : typesInFam.length - 1)) % typesInFam.length];

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
    syncPauseButton(); // init label
    pauseBtn.onclick = () => {
      togglePause();
      syncPauseButton();
    };
  }
  if (clearBtn) clearBtn.onclick = () => clearAll();

  // Initial label paint
  setModeLabel();
  // Use rAF to ensure layout is ready; avoids eslint no-undef on setTimeout in some configs
  window.requestAnimationFrame(setModeLabel);
  syncPauseButton();
}
