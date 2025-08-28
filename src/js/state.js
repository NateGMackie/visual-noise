// src/js/state.js
export const cfg = {
  persona: 'crypto',
  theme: 'classic',
  dock: 'bottom',
  speed: 1,        // 1x default render speed
  paused: false,   // running by default
};

const listeners = new Map(); // event -> Set<fn>
export function on(evt, fn){
  if(!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
}
export function off(evt, fn){ listeners.get(evt)?.delete(fn); }
export function emit(evt, data){ listeners.get(evt)?.forEach(fn => fn(data)); }

export function setMode(mode){ cfg.persona = mode; emit('mode', mode); }
export function setTheme(theme){ cfg.theme = theme; emit('theme', theme); }

// Speed / Pause / Clear API (needed by ui.js)
export function setSpeed(mult){
  cfg.speed = Math.max(0.25, Math.min(4, mult)); // clamp 0.25x..4x
  emit('speed', cfg.speed);
}
export function incSpeed(f = 1.2){ setSpeed(cfg.speed * f); }
export function decSpeed(f = 1/1.2){ setSpeed(cfg.speed * f); }
export function togglePause(){ cfg.paused = !cfg.paused; emit('paused', cfg.paused); }
export function clearAll(){ emit('clear'); }
