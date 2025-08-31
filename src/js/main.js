// src/js/main.js
import { cfg, on, labelsForMode } from './state.js';
import { initThemes, applyTheme } from './themes.js';
import { registry as modeRegistry } from './modes/index.js';
import { initUI } from './ui/ui.js';
import { initGestures } from './ui/gestures.js';
import { initNotify } from './ui/notify.js';

const notifier = initNotify({ bus: { on }, labelsForMode });

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
let activeModule = null;
let lastT = performance.now();
let stopGestures = null;

/* ---------------------- helpers ---------------------- */
function hardClear(ctx) {
  const g = ctx.ctx2d, c = ctx.canvas;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.shadowBlur = 0;
  g.shadowColor = 'rgba(0,0,0,0)';
  g.clearRect(0, 0, c.width, c.height);
  g.restore();

  if (ctx.offscreenCtx) {
    const oc = ctx.offscreenCtx.canvas || ctx.offscreen;
    ctx.offscreenCtx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.offscreenCtx.clearRect(0, 0, oc.width, oc.height);
  }
}

// On-screen [fit] logger (useful on phones)
function renderFitDebug(data) {
  let el = document.getElementById('fitDebug');
  if (!el) {
    el = document.createElement('pre');
    el.id = 'fitDebug';
    el.style.position = 'fixed';
    el.style.bottom = '0';
    el.style.left = '0';
    el.style.maxWidth = '100%';
    el.style.maxHeight = '50dvh';
    el.style.overflow = 'auto';
    el.style.background = 'rgba(0,0,0,0.7)';
    el.style.color = '#0f0';
    el.style.font = '12px/1.2 monospace';
    el.style.padding = '6px';
    el.style.margin = '0';
    el.style.zIndex = '9999';
    el.style.pointerEvents = 'none';
    document.body.appendChild(el);
  }
  el.textContent = `[fit] ${JSON.stringify(data, null, 2)}`;
  clearTimeout(renderFitDebug._t);
  renderFitDebug._t = setTimeout(() => { if (el) el.remove(); }, 4000);
}

/* ---------------------- sizing ---------------------- */
// Only size the BACKING STORE. CSS controls the visual size.
function fit() {
  // Measure CSS pixel size the canvas actually occupies
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));

  // DPR can swing on rotate/zoom; cap slightly for perf
  const dpr = Math.min(Math.max(1, window.devicePixelRatio || 1), 2);

  // Early-out if nothing changed
  if (cssW === ctx.w && cssH === ctx.h && dpr === ctx.dpr) return;

  // Store CSS pixels for layout/draw math
  ctx.w = cssW;
  ctx.h = cssH;
  ctx.dpr = dpr;

  // Backing store in device pixels; ceil avoids 1px seams at fractional scale
  const bw = Math.max(1, Math.ceil(cssW * dpr));
  const bh = Math.max(1, Math.ceil(cssH * dpr));
  if (canvas.width  !== bw) canvas.width  = bw;
  if (canvas.height !== bh) canvas.height = bh;

  // Reset transform then apply DPR so draw code uses CSS pixels
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Clean slate on next frame and let the mode recompute its layout
  ctx.needsFullClear = true;
  activeModule?.resize?.(ctx);

  // Debug
  const snap = { cssW, cssH, bw, bh, dpr: +dpr.toFixed(2), innerW: window.innerWidth, innerH: window.innerHeight };
  console.log('[fit]', snap);
  renderFitDebug(snap);
}

/* ---------------------- loop ---------------------- */
function run(t) {
  const raw = t - lastT;
  lastT = t;

  ctx.now = t;

  const s = Math.max(0.25, Math.min(4, ctx.speed || 1));
  ctx.elapsed = Math.min(raw * s, 100);
  ctx.dt = ctx.elapsed / 1000;

  if (ctx.needsFullClear) {
    hardClear(ctx);
    ctx.needsFullClear = false;
  }

  activeModule?.frame?.(ctx);
  loopId = requestAnimationFrame(run);
}

/* ---------------------- modes ---------------------- */
function startModeByName(modeName) {
  if (loopId) cancelAnimationFrame(loopId);
  activeModule?.stop?.(ctx);

  hardClear(ctx);
  ctx.needsFullClear = true;

  activeModule = modeRegistry[modeName] ?? modeRegistry.crypto;

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

/* ---------------------- events ---------------------- */
// Resize (throttled)
let resizeRaf = 0;
window.addEventListener('resize', () => {
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = 0;
    fit();
  });
}, { passive: true });

// Orientation & viewport UI changes
window.addEventListener('orientationchange', () => setTimeout(fit, 120), { passive: true });
if (window.visualViewport) {
  const onVV = () => fit();
  visualViewport.addEventListener('resize', onVV, { passive: true });
  visualViewport.addEventListener('scroll', onVV, { passive: true });
}

/* ---------------------- init ---------------------- */
initThemes();
initUI();
stopGestures = initGestures(document.body);
window.addEventListener('beforeunload', () => { if (typeof stopGestures === 'function') stopGestures(); });

// Theme / Mode events
on('theme', applyTheme);
on('mode', startModeByName);
on('flavor', ({ flavorId }) => {
  hardClear(ctx);
  ctx.needsFullClear = true;
  if (activeModule?.setFlavor) {
    activeModule.setFlavor(ctx, flavorId);
  } else {
    activeModule?.stop?.(ctx);
    activeModule?.init?.(ctx);
    activeModule?.start?.(ctx);
  }
  const typeEl = document.getElementById('typeName');
  if (typeEl) typeEl.textContent = flavorId;
});

// Speed/Pause/Clear
on('speed', (s) => { ctx.speed = s; window.ControlsVisibility?.show?.(); });
on('paused', (p) => { ctx.paused = p; });
on('clear',  () => { activeModule?.clear?.(ctx); });

// 🔑 Single, ordered boot: measure → then start
requestAnimationFrame(() => {
  fit();
  startModeByName(cfg.persona);
});
