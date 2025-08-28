// src/js/main.js
import { cfg, on, setMode } from './state.js';
import { initThemes, applyTheme } from './themes.js';
import { registry } from './modes/index.js';
import { initUI } from './ui/ui.js';

const canvas = document.getElementById('canvas');
const g = canvas.getContext('2d', { alpha: false });

const ctx = {
  canvas, ctx2d: g, dpr: 1, w: 0, h: 0,
  now: 0, elapsed: 0,
  speed: cfg.speed,
  paused: cfg.paused,
  bus: { on },
};

let loopId = null;
let active = null;
let lastT = performance.now();

function fit(){
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  ctx.dpr = dpr;
  const rect = canvas.getBoundingClientRect();
  ctx.w = Math.floor(rect.width * dpr);
  ctx.h = Math.floor(rect.height * dpr);
  canvas.width = ctx.w;
  canvas.height = ctx.h;
  g.setTransform(dpr,0,0,dpr,0,0);
  active?.resize?.(ctx);
}

function run(t){
  ctx.now = t;
  ctx.elapsed = t - lastT;
  lastT = t;
  active?.frame?.(ctx);
  loopId = requestAnimationFrame(run);
}


function startMode(name){
  if (loopId) cancelAnimationFrame(loopId);
  active?.stop?.(ctx);
  active = registry[name] ?? registry.crypto;
  const modeEl = document.getElementById('modeName');
if (modeEl) modeEl.textContent = name;

  active.init?.(ctx);
  active.start?.(ctx);
  lastT = performance.now();
  loopId = requestAnimationFrame(run);
}

// Resize (throttled)
let resizeRaf = 0;
window.addEventListener('resize', () => {
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = 0;
    fit();
  });
}, { passive: true });

// Init
initThemes();
initUI();

on('theme', applyTheme);
on('mode', startMode);

// React to speed/pause/clear
on('speed', (s) => { ctx.speed = s; });
on('paused', (p) => { ctx.paused = p; });
on('clear', () => { active?.clear?.(ctx); });

fit();
startMode(cfg.persona);
