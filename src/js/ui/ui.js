// src/js/ui/ui.js
import { cfg, setMode, incSpeed, decSpeed, togglePause, clearAll, labelsForMode } from '../state.js';
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
  const typeName  = document.getElementById('typeName');    // span that holds the type label
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
  const setModeLabel  = () => {
  const { familyLabel, typeLabel } = labelsForMode(cfg.persona);
   if (modeName) modeName.textContent = familyLabel; // "system", "rain", ...
   if (typeName) typeName.textContent = typeLabel;   // "crypto", "matrix", ...
  };
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
    if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) return;

    // Build lightweight taxonomy each time (fast enough, tiny list)
    const meta = Object.fromEntries(modes.map(m => [m, labelsForMode(m)]));
    const familyList = Array.from(new Set(modes.map(m => meta[m]?.familyLabel || '')));
    const byFamily = familyList.map(fam => ({
      family: fam,
      modes: modes.filter(m => (meta[m]?.familyLabel || '') === fam)
    }));
    const currentMode = cfg.persona;
    const curFam = meta[currentMode]?.familyLabel || '';
    const curType = meta[currentMode]?.typeLabel || '';
    const famIdx = Math.max(0, familyList.indexOf(curFam));
    const typesInFam = Array.from(new Set(byFamily[famIdx]?.modes.map(m => meta[m]?.typeLabel || '')));

    // Helpers
    const setModeByIndex = (idx) => {
      if (!modes.length) return;
      const i = Math.max(0, Math.min(idx, modes.length - 1));
      setMode(modes[i]);
      setModeLabel();
    };
    const setThemeByIndex = (idx) => {
      const total = Array.isArray(themeNames) ? themeNames.length : 0;
      if (total && typeof setThemeByName === 'function'){
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
      return n === '0' ? 9 : (parseInt(n, 10) - 1); // 1..9,0 -> 0..8,9
    };

    // --- Numbers: modes (no Shift) / themes (Shift) ---
    const idx = indexFromCode(e);
    if (idx !== null){
      e.preventDefault();
      if (e.shiftKey) setThemeByIndex(idx); else setModeByIndex(idx);
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
      if (Array.isArray(themeNames) && themeNames.length && typeof setThemeByName === 'function'){
        const cur = (themeName?.textContent || '').trim();
        let i = Math.max(0, themeNames.indexOf(cur));
        i = e.shiftKey ? (i - 1 + themeNames.length) % themeNames.length
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
    const isLeft = (!e.shiftKey && (k === '[' || code === 'BracketLeft' || k === ',' || code === 'Comma'));
    const isRight = (!e.shiftKey && (k === ']' || code === 'BracketRight' || k === '.' || code === 'Period'));

    // Flavors (mapped to typeLabel within the current family): Shift+[ (prev), Shift+] (next)
    // Fallback: ; and ' when Shift is held (covers some keyboard layouts)
    const isFlavorLeft = (e.shiftKey && (k === '{' || code === 'BracketLeft' || k === ';' || code === 'Semicolon'));
    const isFlavorRight = (e.shiftKey && (k === '}' || code === 'BracketRight' || k === '\'' || code === 'Quote'));

    if (isLeft || isRight) {
      e.preventDefault();
      const dir = isRight ? +1 : -1;
      const nextFamIdx = (famIdx + (dir > 0 ? 1 : familyList.length - 1)) % familyList.length;
      const nextFamily = byFamily[nextFamIdx];

      // Prefer same type within next family if present; else first mode in that family
      const keepType = curType;
      const candidate = nextFamily.modes.find(m => meta[m]?.typeLabel === keepType) || nextFamily.modes[0];
      if (candidate) { setMode(candidate); setModeLabel(); }
      return;
    }

    if (isFlavorLeft || isFlavorRight) {
      e.preventDefault();
      const dir = isFlavorRight ? +1 : -1;
      if (!typesInFam.length) return;
      const typeIdx = Math.max(0, typesInFam.indexOf(curType));
      const nextType = typesInFam[(typeIdx + (dir > 0 ? 1 : typesInFam.length - 1)) % typesInFam.length];
      const candidate = byFamily[famIdx].modes.find(m => meta[m]?.typeLabel === nextType)
                      || byFamily[famIdx].modes[0];
      if (candidate) { setMode(candidate); setModeLabel(); }
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


  // Final pass to correct any startup text set by other modules
  setModeLabel();
  requestAnimationFrame(setModeLabel);
}

