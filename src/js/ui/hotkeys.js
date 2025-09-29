/* eslint-env browser */
// src/js/ui/hotkeys.js
// Small, self-contained keyboard mapper with fallbacks and HUD updates.

/**
 * Install global keyboard shortcuts for navigation and UI toggles.
 * Notes:
 * - Clear remains bound to "c" elsewhere in your app; we don't touch it here.
 * - NEW: Scanlines = "s", Flicker = "v".
 *
 * @param {object} root0 - Handlers and hooks for hotkeys.
 * @param {(dir:number)=>void} root0.cycleFamily - Switch family: -1 (prev) or +1 (next).
 * @param {(dir:number)=>void} root0.cycleFlavor - Switch flavor within current family: -1 or +1.
 * @param {(n:number)=>void}   root0.selectModeNum - Select mode by number 1–10 (0 maps to 10).
 * @param {(dir:number)=>void} root0.cycleTheme - Cycle theme/vibe: -1 (prev) or +1 (next).
 * @param {()=>void}           root0.toggleControls - Toggle the controls HUD visibility.
 * @param {(html:string)=>void} [root0.setHudHelp] - Optional: render on-screen help HTML.
 * @param {()=>void}           [root0.toggleAwake] - Optional: toggle Keep Awake (WakeLock).
 * @param {()=>void}           [root0.toggleScanlines] - Optional: toggle CRT scanlines ("s").
 * @param {()=>void}           [root0.toggleFlicker] - Optional: toggle flicker ("v").
 * @returns {void}
 */
export function installHotkeys({
  cycleFamily,
  cycleFlavor,
  selectModeNum,
  cycleTheme,
  toggleControls,
  setHudHelp,
  toggleAwake,
  toggleScanlines,
  toggleFlicker,
}) {
  const helpHTML = `
    <div class="hud-help">
      <div><strong>Families:</strong> [ / ]  <span class="alt">or , / .</span></div>
      <div><strong>Flavors:</strong> Shift+[ / Shift+]  <span class="alt">or ; / '</span></div>
      <div><strong>Modes:</strong> 1–9, 0 = 10</div>
      <div><strong>Themes:</strong> t / Shift+T</div>
      <div><strong>Controls:</strong> m (toggle)</div>
      <div><strong>Keep&nbsp;Awake:</strong> a</div>
      <div><strong>Scanlines:</strong> s</div>
      <div><strong>Flicker:</strong> v</div>
      <div><strong>Clear:</strong> c</div>
    </div>
  `;
  try { setHudHelp?.(helpHTML); } catch { /* no-op */ }

  const isInputLike = (el) => {
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    return tag === 'input' || tag === 'textarea' || el.isContentEditable;
  };

  window.addEventListener('keydown', (e) => {
    // Don’t hijack typing inside inputs/textareas/content-editable
    if (isInputLike(document.activeElement)) return;

    const k = e.key;          // user-facing key (locale-aware)
    const code = e.code;      // physical key (e.g., "BracketLeft", "KeyA")
    const s = e.shiftKey;

    const doAct = (fn, ...args) => {
      try { fn?.(...args); } catch { /* ignore handler errors */ }
      e.preventDefault();
      e.stopPropagation();
    };

    // --- Controls toggle: m ---
    if (!s && (k === 'm' || k === 'M')) return doAct(toggleControls);

    // --- Theme next/prev: t / Shift+T ---
    if ((k === 't' || k === 'T') && !e.altKey && !e.ctrlKey && !e.metaKey) {
      return doAct(cycleTheme, s ? -1 : +1);
    }

    // --- Families prev/next: [ / ]  (fallback , / .) ---
    if (!s && (k === '[' || code === 'BracketLeft' || k === ',' || code === 'Comma')) {
      return doAct(cycleFamily, -1);
    }
    if (!s && (k === ']' || code === 'BracketRight' || k === '.' || code === 'Period')) {
      return doAct(cycleFamily, +1);
    }

    // --- Flavors prev/next: Shift+[ / Shift+]  (fallback ; / ') ---
    if (s && (k === '{' || code === 'BracketLeft' || k === ';' || code === 'Semicolon')) {
      return doAct(cycleFlavor, -1);
    }
    if (s && (k === '}' || code === 'BracketRight' || k === "'" || code === 'Quote')) {
      return doAct(cycleFlavor, +1);
    }

    // --- Direct mode select: 1..9, 0=10 ---
    if (!e.altKey && !e.ctrlKey && !e.metaKey && /^[0-9]$/.test(k)) {
      const n = k === '0' ? 10 : parseInt(k, 10);
      return doAct(selectModeNum, n);
    }

    // --- Keep Awake toggle: plain "a" only ---
    if (
      typeof toggleAwake === 'function' &&
      !s && !e.altKey && !e.ctrlKey && !e.metaKey &&
      (k === 'a' || k === 'A' || code === 'KeyA')
    ) {
      return doAct(toggleAwake);
    }

    // --- NEW: CRT overlays ---
    if (typeof toggleScanlines === 'function' && (k === 's' || k === 'S' || code === 'KeyS')) {
      return doAct(toggleScanlines);
    }
    if (typeof toggleFlicker === 'function' && (k === 'v' || k === 'V' || code === 'KeyV')) {
      return doAct(toggleFlicker);
    }

    // Note: "c" for Clear is handled elsewhere; we intentionally avoid binding it here.
  }, { capture: true });
}
