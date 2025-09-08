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
// NOTE: also import syncAwakeButton so we can refresh the Awake label after hotkey toggle
import { initMenu, syncPauseButton, syncAwakeButton } from './menu.js';

// --- ControlsVisibility shim ---
// Aligns with styles.css (#controls.is-visible + body.has-controls-visible)
// Adds auto-hide after inactivity and avoids hiding a focused subtree.
(function ensureControlsVisibility() {
  if (window.ControlsVisibility) return;

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

  // --- a11y helpers ---
  const moveFocusOutOf = (container) => {
    if (!container) return;
    const active = document.activeElement;
    if (active && container.contains(active)) {
      // Move focus to a safe, temporary target (stage or body)
      const fallback = document.getElementById('stage') || document.body;
      const hadTabIndex = fallback.hasAttribute('tabindex');
      if (!hadTabIndex) fallback.setAttribute('tabindex', '-1');
      fallback.focus({ preventScroll: true });
      if (!hadTabIndex) fallback.removeAttribute('tabindex');
    }
  };

  const setInert = (container, on) => {
    if (!container) return;
    if (on) {
      container.setAttribute('inert', '');
      container.setAttribute('aria-hidden', 'true');
    } else {
      container.removeAttribute('inert');
      container.removeAttribute('aria-hidden');
    }
  };

  const show = () => {
    if (el) {
      setInert(el, false); // re-enable interaction first
      el.classList.add(EL_ON);
      // aria-hidden already cleared above; keep explicit for clarity
      el.removeAttribute('aria-hidden');
    }
    body.classList.add(BODY_ON);
    updateBodyPad();
    scheduleHide();
  };

  const hide = () => {
    clearTimer();
    if (el) {
      moveFocusOutOf(el); // IMPORTANT: move focus before hiding
      el.classList.remove(EL_ON);
      setInert(el, true); // disables focus + interaction while hidden
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
})();

/**
 * Initialize UI controls, HUD labels, and wire basic interactions.
 * @returns {void}
 */
export function initUI() {
  // Optional legacy buttons (still supported)
  const modeBtn = document.getElementById('modeBtn');
  const themeBtn = document.getElementById('themeBtn');

  // Prefer new IDs, fall back to legacy for one release
  const modeName = document.getElementById('genreName') || document.getElementById('modeName');
  const typeName = document.getElementById('styleName') || document.getElementById('typeName');
  const themeName = document.getElementById('vibeName') || document.getElementById('themeName');

  const fullBtn = document.getElementById('fullBtn');

  // Modes list from registry
  const modes = Object.keys(registry);

  // Label updaters (used by keyboard handler too)
  const setModeLabel = () => {
    const { familyLabel, typeLabel } = labelsForMode(cfg.persona);
    if (modeName) modeName.textContent = familyLabel;
    if (typeName) typeName.textContent = typeLabel;
  };
  const setThemeLabel = (name) => {
    if (themeName) themeName.textContent = name;
  };

  // Keep legacy small buttons working if present
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

  // Initialize the bottom menu (labels + buttons)
  initMenu();

  // Fullscreen toggle
  if (fullBtn) {
    fullBtn.onclick = () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    };
  }

  // --- Keyboard shortcuts ---
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) return;

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
      const c = ev.code || '';
      let n = null;
      if (c.startsWith('Digit')) n = c.slice(5);
      else if (c.startsWith('Numpad')) n = c.slice(6);
      if (n === null) return null;
      if (!/^[0-9]$/.test(n)) return null;
      return n === '0' ? 9 : parseInt(n, 10) - 1;
    };

    const idx = indexFromCode(e);
    if (idx !== null) {
      e.preventDefault();
      if (e.shiftKey) setThemeByIndex(idx);
      else setModeByIndex(idx);
      return;
    }

    const k = e.key?.toLowerCase?.();
    const code = e.code;

    if (k === 'm') {
      e.preventDefault();
      window.ControlsVisibility?.show?.();
      return;
    }

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
        cycleTheme();
      }
      return;
    }

    const isLeft =
      !e.shiftKey && (k === '[' || code === 'BracketLeft' || k === ',' || code === 'Comma');
    const isRight =
      !e.shiftKey && (k === ']' || code === 'BracketRight' || k === '.' || code === 'Period');

    const isFlavorLeft =
      e.shiftKey && (k === '{' || code === 'BracketLeft' || k === ';' || code === 'Semicolon');
    const isFlavorRight =
      e.shiftKey && (k === '}' || code === 'BracketRight' || k === "'" || code === 'Quote');

    if (isLeft || isRight) {
      e.preventDefault();
      const dir = isRight ? +1 : -1;
      const nextFamIdx = (famIdx + (dir > 0 ? 1 : familyList.length - 1)) % familyList.length;
      const nextFamily = byFamily[nextFamIdx];
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
      syncPauseButton(); // keep Pause/Resume label in sync
    } else if (k === 'c') {
      e.preventDefault();
      clearAll();
    } else if (k === 'a') {
      // NEW: Keep Awake toggle via hotkey (delegates to the menu's button)
      e.preventDefault();
      const btn = document.getElementById('awakeBtn');
      if (btn) {
        btn.click(); // menu handles async enable/disable + notifications + persistence
        // Immediately refresh the label so it feels instant
        try {
          syncAwakeButton?.();
        } catch (err) {
          void err;
        }
      }
    }
  });

  // Global "click anywhere" to open controls/nav
  document.addEventListener(
    'click',
    (ev) => {
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

  // Initial paints
  syncPauseButton();
  setModeLabel();
  window.requestAnimationFrame(setModeLabel);
}
