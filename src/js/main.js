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

// --- full canvas state reset between modes ---
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

// Only size the BACKING STORE. CSS controls the visual size.
function fit() {
  // Prefer visualViewport (avoids toolbar/zoom rounding), fallback to rect
  const vvW = Math.round(window.visualViewport?.width  ?? 0);
  const vvH = Math.round(window.visualViewport?.height ?? 0);
  const rect = canvas.getBoundingClientRect();
  const cssW = vvW || Math.round(rect.width);
  const cssH = vvH || Math.round(rect.height);

  const dpr = Math.min(Math.max(1, window.devicePixelRatio || 1), 2);

  // Early-out if nothing changed
  if (cssW === ctx.w && cssH === ctx.h && dpr === ctx.dpr) return;

  ctx.w = cssW;
  ctx.h = cssH;
  ctx.dpr = dpr;

  // Backing store in device pixels (ceil avoids 1px under-allocation at 1.25x)
  const bw = Math.max(1, Math.ceil(cssW * dpr));
  const bh = Math.max(1, Math.ceil(cssH * dpr));
  if (canvas.width !== bw)  canvas.width  = bw;
  if (canvas.height !== bh) canvas.height = bh;

  // Reset transform then apply DPR so draw code stays in CSS pixels
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Clean slate next frame, and let the mode recompute its layout
  ctx.needsFullClear = true;
  activeModule?.resize?.(ctx);

  // Debug snapshot (console only)
  console.log('[fit]', {
    cssW, cssH, bw, bh, dpr: +dpr.toFixed(2),
    innerW: window.innerWidth, innerH: window.innerHeight
  });
}

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

// Init
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

fit();
startModeByName(cfg.persona);

// --- Nav auto-hide / reveal ---
(function setupNavAutohide() {
  const controls = document.getElementById('controls');
  const revealEdge = document.getElementById('revealEdge');
  if (!controls) return;

  const isDesktopLike =
    window.matchMedia('(hover: hover)').matches &&
    window.matchMedia('(pointer: fine)').matches;

  let hideTimer = null;
  const HIDE_DELAY = 2500;

  function updateControlsHeightVar() {
    const h = controls.offsetHeight || 64;
    document.documentElement.style.setProperty('--controls-height', `${h}px`);
  }

  function showControls() {
    if (!controls.classList.contains('is-visible')) {
      controls.classList.add('is-visible');
      document.body.classList.add('has-controls-visible');
      updateControlsHeightVar();
    }
    scheduleAutoHide();
  }

  function hideControls() {
    controls.classList.remove('is-visible');
    document.body.classList.remove('has-controls-visible');
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  function scheduleAutoHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { hideControls(); }, HIDE_DELAY);
  }

  hideControls();
  updateControlsHeightVar();
  window.addEventListener('resize', updateControlsHeightVar);

  if (isDesktopLike) {
    document.addEventListener('pointerdown', () => {
      if (!controls.classList.contains('is-visible')) showControls();
    });
    controls.addEventListener('pointerdown', scheduleAutoHide);
    controls.addEventListener('pointermove', scheduleAutoHide);
    controls.addEventListener('pointerup', scheduleAutoHide);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideControls(); });
    window.addEventListener('blur', () => scheduleAutoHide());
  }

  if (revealEdge) {
    const reveal = () => showControls();
    revealEdge.addEventListener('touchstart', reveal, { passive: true });
    revealEdge.addEventListener('pointerdown', reveal);
  }

  document.addEventListener('pointerdown', (e) => {
    if (!controls.classList.contains('is-visible')) return;
    if (!controls.contains(e.target)) scheduleAutoHide();
  });

  window.ControlsVisibility = { show: showControls, hide: hideControls, scheduleHide: scheduleAutoHide };
})();

// Service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/visual-noise/service-worker.js')
      .catch(err => console.error('SW registration failed:', err));
  });
}
