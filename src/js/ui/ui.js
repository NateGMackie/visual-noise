// src/js/ui/ui.js
import { cfg, setMode, incSpeed, decSpeed, togglePause, clearAll } from '../state.js';
import { cycleTheme } from '../themes.js';
import { registry } from '../modes/index.js';

export function initUI(){
  // Optional buttons (ok if missing in HTML)
  const modeBtn = document.getElementById('modeBtn');
  const themeBtn = document.getElementById('themeBtn');
  const fullBtn = document.getElementById('fullBtn');
  const dockBtn = document.getElementById('dockBtn');

  // Optional extras if you re-add them
  const speedUpBtn = document.getElementById('speedUp');
  const speedDownBtn = document.getElementById('speedDown');
  const pauseBtn = document.getElementById('pauseBtn');
  const clearBtn = document.getElementById('clearBtn');

  const modes = Object.keys(registry);

  if (modeBtn) modeBtn.onclick = () => {
    const i = modes.indexOf(cfg.persona);
    const next = modes[(i+1) % modes.length];
    setMode(next);
  };
  if (themeBtn) themeBtn.onclick = () => cycleTheme();

  if (fullBtn) {
    fullBtn.onclick = () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    };
  }
  if (dockBtn) dockBtn.onclick = () => document.exitFullscreen?.();

  if (speedUpBtn) speedUpBtn.onclick = () => incSpeed();
  if (speedDownBtn) speedDownBtn.onclick = () => decSpeed();
  if (pauseBtn) pauseBtn.onclick = () => togglePause();
  if (clearBtn) clearBtn.onclick = () => clearAll();

  // --- Keyboard shortcuts ---
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;

    const k = e.key?.toLowerCase?.();
    if (k === 'm') {
      const i = modes.indexOf(cfg.persona);
      const next = modes[(i+1) % modes.length];
      setMode(next);
    } else if (k === 't') {
      cycleTheme();
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
}
