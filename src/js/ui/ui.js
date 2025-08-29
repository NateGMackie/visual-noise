// src/js/ui/ui.js
import { cfg, setMode, incSpeed, decSpeed, togglePause, clearAll } from '../state.js';
import { cycleTheme, themeNames, setThemeByName } from '../themes.js';
import { registry } from '../modes/index.js';

// Helper: make any element act like a button without default button styles
function makeClickable(el, onActivate){
  if (!el) return;
  el.tabIndex = 0; // keyboard focusable
  el.classList?.add('clickable'); // let CSS set cursor:pointer; no borders
  el.addEventListener('click', (e) => { e.preventDefault(); onActivate?.(e); });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate?.(e); }
  });
}

export function initUI(){
  // Footer controls (labels double as buttons now)
  const modeBtn   = document.getElementById('modeBtn');     // optional legacy button
  const themeBtn  = document.getElementById('themeBtn');    // optional legacy button
  const modeName  = document.getElementById('modeName');    // span that holds just the mode name
  const themeName = document.getElementById('themeName');   // span that holds just the theme name
  const fullBtn   = document.getElementById('fullBtn');
  // Removed: dock button (no-op in current layout)

  // Optional extras if you re-add them
  const speedUpBtn   = document.getElementById('speedUp');
  const speedDownBtn = document.getElementById('speedDown');
  const pauseBtn     = document.getElementById('pauseBtn');
  const clearBtn     = document.getElementById('clearBtn');

  // Modes list from registry
  const modes = Object.keys(registry);

  // Helper label updaters (spans show only the value; the word "mode/theme" lives in the <label>)
  const setModeLabel  = () => { if (modeName)  modeName.textContent  = cfg.persona; };
  const setThemeLabel = (name) => { if (themeName) themeName.textContent = name; };

  // Click-to-cycle: keep existing small buttons working if present
  if (modeBtn)  modeBtn.onclick  = () => { setMode(modes[(modes.indexOf(cfg.persona)+1) % modes.length]); setModeLabel(); };
  if (themeBtn) themeBtn.onclick = () => {
    if (Array.isArray(themeNames) && themeNames.length && typeof setThemeByName === 'function'){
      const cur = (themeName?.textContent || '').trim();
      const idx = Math.max(0, themeNames.indexOf(cur));
      const next = themeNames[(idx + 1) % themeNames.length];
      setThemeByName(next);
      setThemeLabel(next);
    } else {
      cycleTheme();
    }
  };

  // Make the WHOLE label clickable (not just the inner span)
  const modeLabelEl  = modeName?.closest('label')  || modeName;
  const themeLabelEl = themeName?.closest('label') || themeName;
  makeClickable(modeLabelEl,  () => { setMode(modes[(modes.indexOf(cfg.persona)+1) % modes.length]); setModeLabel(); });
  makeClickable(themeLabelEl, () => {
    if (Array.isArray(themeNames) && themeNames.length && typeof setThemeByName === 'function'){
      const cur = (themeName?.textContent || '').trim();
      const idx = Math.max(0, themeNames.indexOf(cur));
      const next = themeNames[(idx + 1) % themeNames.length];
      setThemeByName(next);
      setThemeLabel(next);
    } else {
      cycleTheme();
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
  if (speedUpBtn)   speedUpBtn.onclick   = () => incSpeed();
  if (speedDownBtn) speedDownBtn.onclick = () => decSpeed();
  if (pauseBtn)     pauseBtn.onclick     = () => togglePause();
  if (clearBtn)     clearBtn.onclick     = () => clearAll();

  // --- Helpers for direct selection ---
  function setModeByIndex(idx){
    if (!modes.length) return;
    const i = Math.max(0, Math.min(idx, modes.length - 1));
    setMode(modes[i]);
    setModeLabel();
  }
  function setThemeByIndex(idx){
    const total = Array.isArray(themeNames) ? themeNames.length : 0;
    if (total && typeof setThemeByName === 'function'){
      const i = Math.max(0, Math.min(idx, total - 1));
      const name = themeNames[i];
      setThemeByName(name);
      setThemeLabel(name);
    } else {
      console.info('[ui] Theme API unavailable for direct selection');
    }
  }
  function indexFromCode(e){
    // Use e.code so Shift doesn't change the character (e.key becomes !,@,#,...)
    const c = e.code || '';
    let n = null;
    if (c.startsWith('Digit')) n = c.slice(5);      // 'Digit1' -> '1'
    else if (c.startsWith('Numpad')) n = c.slice(6); // 'Numpad1' -> '1'
    if (n === null) return null;
    if (!/^[0-9]$/.test(n)) return null;
    return n === '0' ? 9 : (parseInt(n, 10) - 1); // map 1..9,0 -> 0..8,9
  }

  // --- Keyboard shortcuts ---
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;

    // Number row / numpad: modes vs themes
    const idx = indexFromCode(e);
    if (idx !== null){
      e.preventDefault();
      if (e.shiftKey) setThemeByIndex(idx); else setModeByIndex(idx);
      return;
    }

    // Legacy single-key shortcuts still work
    const k = e.key?.toLowerCase?.();
    if (k === 'm') {
      setMode(modes[(modes.indexOf(cfg.persona)+1) % modes.length]);
      setModeLabel();
    } else if (k === 't') {
      if (Array.isArray(themeNames) && themeNames.length && typeof setThemeByName === 'function'){
        const cur = (themeName?.textContent || '').trim();
        const idx = Math.max(0, themeNames.indexOf(cur));
        const next = themeNames[(idx + 1) % themeNames.length];
        setThemeByName(next);
        setThemeLabel(next);
      } else {
        cycleTheme();
      }
    } else if (k === 'f') {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    } else if (k === 'escape') {
      document.exitFullscreen?.();
    } else if (k === '+' || k === '=') {
      incSpeed();
    } else if (k === '-') {
      decSpeed();
    } else if (k === 'p') {
      togglePause();
    } else if (k === 'c') {
      clearAll();
    }
  });

  // Final pass to correct any startup text set by other modules
  setModeLabel();
  requestAnimationFrame(setModeLabel);
}

