/* eslint-env browser */
// src/js/ui/ui.js

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

// --- ControlsVisibility shim ---
// Aligns with styles.css (#controls.is-visible + body.has-controls-visible)
// Adds auto-hide after inactivity.
(function ensureControlsVisibility() {
  if (!window.ControlsVisibility) {
    const body = document.body;
    const el = document.getElementById('controls'); // footer
    const BODY_ON = 'has-controls-visible';
    const EL_ON = 'is-visible';

    // --- configurable timeout (ms)
    const autoHideMs = 3000; // 3s; tweak to taste

    let hideTimer = null;
    let pausedByHover = false;

    const updateBodyPad = () => {
      if (!el) return;
      const h = el.offsetHeight || 64;
      body.style.setProperty('--controls-height', `${h}px`);
    };

    const clearTimer = () => {
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
      }
    };

    const scheduleHide = () => {
      clearTimer();
      if (pausedByHover) return; // don't count down while hovering the controls
      hideTimer = window.setTimeout(hide, autoHideMs);
    };

    const show = () => {
      if (el) {
        el.classList.add(EL_ON);
        el.removeAttribute('aria-hidden');
      }
      body.classList.add(BODY_ON);
      updateBodyPad();
      scheduleHide();
    };

    const hide = () => {
      clearTimer();
      if (el) {
        el.classList.remove(EL_ON);
        el.setAttribute('aria-hidden', 'true');
      }
      body.classList.remove(BODY_ON);
    };

    const toggle = () => {
      const isOpen = el?.classList.contains(EL_ON);
      return isOpen ? hide() : show();
    };

    // --- reset timer on activity anywhere
    const resetOnActivity = (e) => {
      // If controls aren’t open, no need to reset
      if (!el?.classList.contains(EL_ON)) return;
      // Ignore key repeats and interactions inside inputs
      if (e && e.type === 'keydown') {
        if (e.repeat) return;
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable)
          return;
      }
      scheduleHide();
    };

    // Pause/resume auto-hide when the user is over the controls
    if (el) {
      el.addEventListener('pointerenter', () => {
        pausedByHover = true;
        clearTimer();
      });
      el.addEventListener('pointerleave', () => {
        pausedByHover = false;
        scheduleHide();
      });
      // Interactions inside the controls should also keep them around briefly
      el.addEventListener('click', resetOnActivity, { capture: true });
      el.addEventListener('input', resetOnActivity, { capture: true });
    }

    // Global activity hooks
    window.addEventListener('pointerdown', resetOnActivity, { capture: true });
    window.addEventListener('pointermove', resetOnActivity, { passive: true });
    window.addEventListener('keydown', resetOnActivity, { capture: true });

    window.ControlsVisibility = { show, hide, toggle };

    // Fallback custom events (already emitted by other code)
    window.addEventListener('ui:controls:show', show, { capture: true });
    window.addEventListener('ui:controls:toggle', toggle, { capture: true });
  }
})();

// Helper: make any element act like a button without default button styles
/**
 * Wire an interactive element to call a handler on click/keyboard activation.
 * Adds proper accessibility key handling (Enter/Space) if needed.
 * @param {any} el - Element to bind (button/div with role="button", etc.).
 * @param {Function} onActivate - Handler to run on activation. Receives the event.
 * @returns {void}
 */
function makeClickable(el, onActivate) {
  if (!el) return;
  el.tabIndex = 0; // keyboard focusable
  el.classList?.add('clickable'); // let CSS set cursor:pointer; no borders
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

/**
 * Initialize UI controls, HUD labels, and wire basic interactions.
 * @returns {void}
 */
export function initUI() {
  // Footer controls (labels double as buttons now)
  const modeBtn = document.getElementById('modeBtn'); // optional legacy button
  const themeBtn = document.getElementById('themeBtn'); // optional legacy button

  // Prefer new IDs, fall back to legacy for one release
  const modeName = document.getElementById('genreName') || document.getElementById('modeName');
  const typeName = document.getElementById('styleName') || document.getElementById('typeName');
  const themeName = document.getElementById('vibeName') || document.getElementById('themeName');

  const fullBtn = document.getElementById('fullBtn');

  // Optional extras if you re-add them
  const speedUpBtn = document.getElementById('speedUp');
  const speedDownBtn = document.getElementById('speedDown');
  const pauseBtn = document.getElementById('pauseBtn');
  const clearBtn = document.getElementById('clearBtn');

  // Modes list from registry
  const modes = Object.keys(registry);

  // Helper label updaters (spans show only the value; the word "mode/theme" lives in the <label>)
  const setModeLabel = () => {
    const { familyLabel, typeLabel } = labelsForMode(cfg.persona);
    if (modeName) modeName.textContent = familyLabel; // "system", "rain", ...
    if (typeName) typeName.textContent = typeLabel; // "crypto", "matrix", ...
  };
  const setThemeLabel = (name) => {
    if (themeName) themeName.textContent = name;
  };

  // Click-to-cycle: keep existing small buttons working if present
  if (modeBtn)
    modeBtn.onclick = () => {
      setMode(modes[(modes.indexOf(cfg.persona) + 1) % modes.length]);
      setModeLabel();
    };
  if (themeBtn)
    themeBtn.onclick = () => {
      if (Array.isArray(themeNames) && themeNames.length && typeof setThemeByName === 'function') {
        const cur = (themeName?.dataset?.vibe || cfg.theme || '').trim();

        const idx = Math.max(0, themeNames.indexOf(cur));
        const next = themeNames[(idx + 1) % themeNames.length];
        setThemeByName(next);
        setThemeLabel(next);
      } else {
        cycleTheme();
      }
    };

  // Make the WHOLE label clickable (not just the inner span)
  const modeLabelEl = modeName?.closest('label') || modeName;
  const themeLabelEl = themeName?.closest('label') || themeName;
  makeClickable(modeLabelEl, () => {
    setMode(modes[(modes.indexOf(cfg.persona) + 1) % modes.length]);
    setModeLabel();
  });
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

  // --- Style click: cycle styles (a.k.a. flavors) within the current genre ---
  // --- Style click: make the WHOLE label clickable, like genre/vibe ---
const styleLabelEl = typeName?.closest('label') || typeName;
makeClickable(styleLabelEl, (e) => {
  // Rebuild the per-family style list (same approach as your keyboard handler)
  const modes = Object.keys(registry);
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

  // Click = next; Shift+click = previous (matches Shift+] / Shift+[)
  const dir = e?.shiftKey ? -1 : +1;
  const typeIdx  = Math.max(0, typesInFam.indexOf(curType));
  const nextType =
    typesInFam[(typeIdx + (dir > 0 ? 1 : typesInFam.length - 1)) % typesInFam.length];

  // Pick a mode in the same family having that next type, else first in family
  const candidate =
    byFamily[famIdx].modes.find((m) => meta[m]?.typeLabel === nextType) ||
    byFamily[famIdx].modes[0];

  if (candidate) {
    setMode(candidate); // emits + updates cfg.persona
    setModeLabel();     // refresh both genre & style text
  }
});




  // Fullscreen toggle
  if (fullBtn) {
    fullBtn.onclick = () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    };
  }

  // Optional extras
  if (speedUpBtn) speedUpBtn.onclick = () => incSpeed();
  if (speedDownBtn) speedDownBtn.onclick = () => decSpeed();
  if (pauseBtn) pauseBtn.onclick = () => togglePause();
  if (clearBtn) clearBtn.onclick = () => clearAll();

  // --- Keyboard shortcuts ---
  /**
   * Global keyboard handler for UI shortcuts.
   * @param {any} e - Key event from window or a focused element.
   * @returns {void}
   */
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) return;

    // Build lightweight taxonomy each time (fast enough, tiny list)
    const meta = Object.fromEntries(modes.map((m) => [m, labelsForMode(m)]));
    const familyList = Array.from(new Set(modes.map((m) => meta[m]?.familyLabel || '')));
    const byFamily = familyList.map((fam) => ({
      family: fam,
      modes: modes.filter((m) => (meta[m]?.familyLabel || '') === fam),
    }));
    const currentMode = cfg.persona;
    const curFam = meta[currentMode]?.familyLabel || '';
    const curType = meta[currentMode]?.typeLabel || '';
    const famIdx = Math.max(0, familyList.indexOf(curFam));
    const typesInFam = Array.from(
      new Set(byFamily[famIdx]?.modes.map((m) => meta[m]?.typeLabel || ''))
    );

    // Helpers (scoped here because only the keyboard flow needs them)
    const setModeByIndex = (idx) => {
      if (!modes.length) return;
      const i = Math.max(0, Math.min(idx, modes.length - 1));
      setMode(modes[i]);
      setModeLabel();
    };
    const setThemeByIndex = (idx) => {
      const total = Array.isArray(themeNames) ? themeNames.length : 0;
      if (total && typeof setThemeByName === 'function') {
        const i = Math.max(0, Math.min(idx, total - 1));
        const name = themeNames[i];
        setThemeByName(name);
        setThemeLabel(name);
      } else {
        console.info('[ui] Theme API unavailable for direct selection');
      }
    };
    const indexFromCode = (ev) => {
      // Use ev.code so Shift doesn't change the character (ev.key becomes !,@,#,...)
      const c = ev.code || '';
      let n = null;
      if (c.startsWith('Digit')) n = c.slice(5);
      else if (c.startsWith('Numpad')) n = c.slice(6);
      if (n === null) return null;
      if (!/^[0-9]$/.test(n)) return null;
      return n === '0' ? 9 : parseInt(n, 10) - 1; // 1..9,0 -> 0..8,9
    };

    // --- Numbers: modes (no Shift) / themes (Shift) ---
    const idx = indexFromCode(e);
    if (idx !== null) {
      e.preventDefault();
      if (e.shiftKey) setThemeByIndex(idx);
      else setModeByIndex(idx);
      return;
    }

    // Normalize keys/codes
    const k = e.key?.toLowerCase?.();
    const code = e.code;

    // --- m: show controls/nav (instead of cycling mode) ---
    if (k === 'm') {
      e.preventDefault();
      window.ControlsVisibility?.show?.();
      return;
    }

    // --- t / Shift+T: theme next/prev ---
    if (k === 't') {
      e.preventDefault();
      if (Array.isArray(themeNames) && themeNames.length && typeof setThemeByName === 'function') {
        const cur = (themeName?.dataset?.vibe || cfg.theme || '').trim();

        let i = Math.max(0, themeNames.indexOf(cur));
        i = e.shiftKey
          ? (i - 1 + themeNames.length) % themeNames.length
          : (i + 1) % themeNames.length;
        const next = themeNames[i];
        setThemeByName(next);
        setThemeLabel(next);
      } else {
        // Fallback: existing cycleTheme if available (only “next”)
        cycleTheme();
      }
      return;
    }

    // --- Families & Flavors ---
    // Families: [ (prev), ] (next). Fallback: , and .
    const isLeft =
      !e.shiftKey && (k === '[' || code === 'BracketLeft' || k === ',' || code === 'Comma');
    const isRight =
      !e.shiftKey && (k === ']' || code === 'BracketRight' || k === '.' || code === 'Period');

    // Flavors (mapped to typeLabel within the current family): Shift+[ (prev), Shift+] (next)
    // Fallback: ; and ' when Shift is held (covers some keyboard layouts)
    const isFlavorLeft =
      e.shiftKey && (k === '{' || code === 'BracketLeft' || k === ';' || code === 'Semicolon');
    const isFlavorRight =
      e.shiftKey && (k === '}' || code === 'BracketRight' || k === "'" || code === 'Quote');

    if (isLeft || isRight) {
      e.preventDefault();
      const dir = isRight ? +1 : -1;
      const nextFamIdx = (famIdx + (dir > 0 ? 1 : familyList.length - 1)) % familyList.length;
      const nextFamily = byFamily[nextFamIdx];

      // Prefer same type within next family if present; else first mode in that family
      const keepType = curType;
      const candidate =
        nextFamily.modes.find((m) => meta[m]?.typeLabel === keepType) || nextFamily.modes[0];
      if (candidate) {
        setMode(candidate);
        setModeLabel();
      }
      return;
    }

    if (isFlavorLeft || isFlavorRight) {
      e.preventDefault();
      const dir = isFlavorRight ? +1 : -1;
      if (!typesInFam.length) return;
      const typeIdx = Math.max(0, typesInFam.indexOf(curType));
      const nextType =
        typesInFam[(typeIdx + (dir > 0 ? 1 : typesInFam.length - 1)) % typesInFam.length];
      const candidate =
        byFamily[famIdx].modes.find((m) => meta[m]?.typeLabel === nextType) ||
        byFamily[famIdx].modes[0];
      if (candidate) {
        setMode(candidate);
        setModeLabel();
      }
      return;
    }

    // --- Other legacy keys you kept ---
    if (k === 'f') {
      e.preventDefault();
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    } else if (k === 'escape') {
      e.preventDefault();
      document.exitFullscreen?.();
    } else if (k === '+' || k === '=') {
      e.preventDefault();
      incSpeed();
    } else if (k === '-') {
      e.preventDefault();
      decSpeed();
    } else if (k === 'p') {
      e.preventDefault();
      togglePause();
    } else if (k === 'c') {
      e.preventDefault();
      clearAll();
    }
  });

  // Global "click anywhere" to open controls/nav
  document.addEventListener(
    'click',
    (ev) => {
      // Ignore clicks inside the menu itself if you tag it:
      if (ev.target?.closest?.('[data-ignore-global-open],#menu,.vn-menu,#controls,.controls'))
        return;
      window.ControlsVisibility?.show?.() ||
        window.dispatchEvent(new window.CustomEvent('ui:controls:show'));
    },
    { capture: true }
  );

  const edge = document.getElementById('revealEdge');
  if (edge) {
    edge.addEventListener(
      'pointerdown',
      (e) => {
        e.preventDefault();
        window.ControlsVisibility?.show?.();
      },
      { passive: false }
    );
  }

  // Final pass to correct any startup text set by other modules
  setModeLabel();
  window.requestAnimationFrame(setModeLabel);
}
