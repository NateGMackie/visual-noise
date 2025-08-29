// hotkeys.js
// Small, self-contained keyboard mapper with fallbacks and HUD updates.

export function installHotkeys({
  cycleFamily,     // (dir) => void    dir: -1 | +1
  cycleFlavor,     // (dir) => void
  selectModeNum,   // (n)  => void    n: 1..10  (0 maps to 10)
  cycleTheme,      // (dir) => void
  toggleControls,  // ()   => void
  setHudHelp,      // (html) => void  optional; updates help/hints if provided
}) {
  const helpHTML = `
    <div class="hud-help">
      <div><strong>Families:</strong> [ / ]  <span class="alt">or , / .</span></div>
      <div><strong>Flavors:</strong> Shift+[ / Shift+]  <span class="alt">or ; / '</span></div>
      <div><strong>Modes:</strong> 1–9, 0 = 10</div>
      <div><strong>Themes:</strong> t / Shift+T</div>
      <div><strong>Controls:</strong> m (toggle)</div>
    </div>
  `;
  try { setHudHelp?.(helpHTML); } catch {}

  const isInputLike = (el) => {
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    return tag === 'input' || tag === 'textarea' || el.isContentEditable;
  };

  window.addEventListener('keydown', (e) => {
    // Don’t hijack typing inside inputs/textareas/content-editable
    if (isInputLike(document.activeElement)) return;

    // Normalize
    const k = e.key;      // human-readable, respects OS layout (can be “Dead” on some layouts)
    const code = e.code;  // physical key identifier (e.g., "BracketLeft", "Comma")
    const s = e.shiftKey;

    // Helper to safely call and prevent defaults
    const doAct = (fn, ...args) => {
      try { fn?.(...args); } catch {}
      e.preventDefault();
      e.stopPropagation();
    };

    // --- Controls toggle ---
    if (!s && (k === 'm' || k === 'M')) return doAct(toggleControls);

    // --- Theme next/prev: t / Shift+T ---
    if ((k === 't' || k === 'T') && !e.altKey && !e.ctrlKey && !e.metaKey) {
      return doAct(cycleTheme, s ? -1 : +1);
    }

    // --- Families prev/next: [ / ]  (fallback , / .) ---
    // Left
    if (!s && (k === '[' || code === 'BracketLeft' || code === 'Comma' || k === ',')) {
      return doAct(cycleFamily, -1);
    }
    // Right
    if (!s && (k === ']' || code === 'BracketRight' || code === 'Period' || k === '.')) {
      return doAct(cycleFamily, +1);
    }

    // --- Flavors prev/next: Shift+[ / Shift+]  (fallback ; / ') ---
    // Prev flavor
    if (s && (k === '{' || code === 'BracketLeft' || code === 'Semicolon' || k === ';')) {
      return doAct(cycleFlavor, -1);
    }
    // Next flavor
    if (s && (k === '}' || code === 'BracketRight' || code === 'Quote' || k === '\'')) {
      return doAct(cycleFlavor, +1);
    }

    // --- Direct mode select: 1..9, 0=10 ---
    if (!e.altKey && !e.ctrlKey && !e.metaKey && /^[0-9]$/.test(k)) {
      const n = (k === '0') ? 10 : parseInt(k, 10);
      return doAct(selectModeNum, n);
    }
  }, { capture: true });
}
