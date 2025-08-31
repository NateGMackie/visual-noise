// src/js/main.js
import { cfg, on, labelsForMode } from './state.js';
import { initThemes, applyTheme } from './themes.js';
import { registry as modeRegistry } from './modes/index.js';
import { initUI } from './ui/ui.js';
import { initGestures } from './ui/gestures.js';
import { initNotify } from './ui/notify.js';

initNotify({ bus: { on }, labelsForMode });

const canvas = document.getElementById('canvas');
const g = canvas.getContext('2d', { alpha: false });

const ctx = {
  canvas, ctx2d: g, dpr: 1, w: 0, h: 0,
  now: 0, elapsed: 0, dt: 0,
  speed: cfg.speed,
  paused: cfg.paused,
  bus: { on },
};

let loopId = null;
let activeModule = null;
let lastT = performance.now();
let stopGestures = null;

/* ---------- helpers ---------- */
function hardClear(c) {
  const g = c.ctx2d, cv = c.canvas;
  g.save();
  g.setTransform(1,0,0,1,0,0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.shadowBlur = 0;
  g.shadowColor = 'rgba(0,0,0,0)';
  g.clearRect(0, 0, cv.width, cv.height);
  g.restore();
}

/* ---------- sizing (brute-force fill) ---------- */
function fit() {
  // Viewport in CSS pixels
  const cssW = Math.max(1, Math.round(window.innerWidth));
  const cssH = Math.max(1, Math.round(window.innerHeight));

  // Device pixel ratio (cap a bit for perf)
  const dpr = Math.min(Math.max(1, window.devicePixelRatio || 1), 2);

  // Early out
  if (cssW === ctx.w && cssH === ctx.h && dpr === ctx.dpr) return;

  ctx.w = cssW;
  ctx.h = cssH;
  ctx.dpr = dpr;

  // Backing store in device pixels; +2 overscan avoids seams at fractional DPI
  const bw = Math.max(1, Math.round(cssW * dpr) + 2);
  const bh = Math.max(1, Math.round(cssH * dpr) + 2);
  if (canvas.width  !== bw) canvas.width  = bw;
  if (canvas.height !== bh) canvas.height = bh;

  // Draw in CSS px
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Tell the mode
  ctx.needsFullClear = true;
  activeModule?.resize?.(ctx);
}

/* ---------- loop ---------- */
function run(t) {
  const raw = t - lastT;
  lastT = t;

  const s = Math.max(0.25, Math.min(4, ctx.speed || 1));
  ctx.elapsed = Math.min(raw * s, 100);
  ctx.dt = ctx.elapsed / 1000;
  ctx.now = t;

  if (ctx.needsFullClear) {
    hardClear(ctx);
    ctx.needsFullClear = false;
  }

  activeModule?.frame?.(ctx);
  loopId = requestAnimationFrame(run);
}

/* ---------- modes ---------- */
function startModeByName(modeName) {
  if (loopId) cancelAnimationFrame(loopId);
  activeModule?.stop?.(ctx);

  hardClear(ctx);
  ctx.needsFullClear = true;

  activeModule = modeRegistry[modeName] ?? modeRegistry.crypto;

  // Footer labels
  const modeEl = document.getElementById('modeName');
  const typeEl = document.getElementById('typeName');
  const { familyLabel, typeLabel } = labelsForMode(modeName);
  if (modeEl) modeEl.textContent = familyLabel;
  if (typeEl) typeEl.textContent = typeLabel;

  activeModule?.init?.(ctx);
  activeModule?.start?.(ctx);
  lastT = performance.now();
  loopId = requestAnimationFrame(run);
}

/* ---------- events ---------- */
// Throttled resize
let resizeRaf = 0;
window.addEventListener('resize', () => {
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; fit(); });
}, { passive: true });

// Orientation flips: give mobile a beat to settle then fit
window.addEventListener('orientationchange', () => setTimeout(fit, 150), { passive: true });

/* ---------- init ---------- */
initThemes();
initUI();
stopGestures = initGestures(document.body);
window.addEventListener('beforeunload', () => { if (typeof stopGestures === 'function') stopGestures(); });

on('theme', applyTheme);
on('mode', startModeByName);
on('flavor', ({ flavorId }) => {
  hardClear(ctx);
  ctx.needsFullClear = true;
  if (activeModule?.setFlavor) activeModule.setFlavor(ctx, flavorId);
  else { activeModule?.stop?.(ctx); activeModule?.init?.(ctx); activeModule?.start?.(ctx); }
  const typeEl = document.getElementById('typeName'); if (typeEl) typeEl.textContent = flavorId;
});

on('speed', (s) => { ctx.speed = s; });
on('paused', (p) => { ctx.paused = p; });
on('clear',  () => { activeModule?.clear?.(ctx); });

// Single, ordered boot
requestAnimationFrame(() => {
  fit();
  startModeByName(cfg.persona);
});
