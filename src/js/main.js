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
  const g = ctx.ctx2d;
  const c = ctx.canvas;

  // Do not disturb devicePixelRatio scaling: save → set 1:1 → clear → restore
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

// Only size the BACKING STORE. Let CSS control the visual size.
function fit() {
  // Measure the actual layout box the canvas is occupying
  const rect = canvas.getBoundingClientRect();

  // CSS pixel size that your draw/layout code should use
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));

  // DPR can swing on rotate; cap slightly for perf
  const dpr = Math.min(Math.max(1, window.devicePixelRatio || 1), 2);

  // If nothing changed, bail early
  if (cssW === ctx.w && cssH === ctx.h && dpr === ctx.dpr) return;

  ctx.w = cssW;
  ctx.h = cssH;
  ctx.dpr = dpr;

  // Backing store in device pixels
  const bw = Math.max(1, Math.floor(cssW * dpr));
  const bh = Math.max(1, Math.floor(cssH * dpr));
  if (canvas.width !== bw) canvas.width = bw;
  if (canvas.height !== bh) canvas.height = bh;

  // Reset transform then apply DPR so draw code can stay in CSS pixels
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Full clear next frame, and let the mode recompute its layout
  ctx.needsFullClear = true;
  activeModule?.resize?.(ctx);
}

function run(t) {
  const raw = t - lastT;
  lastT = t;

  ctx.now = t;

  // Global speed scaling: <1 slows, >1 speeds. Clamp for safety.
  const s = Math.max(0.25, Math.min(4, ctx.speed || 1));

  // Cap elapsed so backgrounded tabs don't fast-forward too much.
  ctx.elapsed = Math.min(raw * s, 100); // ms
  ctx.dt = ctx.elapsed / 1000;          // seconds (optional convenience)

  // If a mode change requested a full clear, do it at the start of the next frame.
  if (ctx.needsFullClear) {
    hardClear(ctx);
    ctx.needsFullClear = false;
  }

  activeModule?.frame?.(ctx);
  loopId = requestAnimationFrame(run);
}

// Keep accepting a plain mode name for now (crypto/sysadmin/mining/etc.)
function startModeByName(modeName) {
  if (loopId) cancelAnimationFrame(loopId);
  activeModule?.stop?.(ctx);

  // Hard reset the bitmap so no trails/ghosts carry over
  hardClear(ctx);
  // Also set a one-frame belt-and-suspenders clear (handles timing races)
  ctx.needsFullClear = true;

  // modes/index.js provides the actual implementations by key
  activeModule = modeRegistry[modeName] ?? modeRegistry.crypto;

  // Footer: set family (mode) and type labels
  const modeEl = document.getElementById('modeName'); // shows family
  const typeEl = document.getElementById('typeName'); // shows type (make sure it exists in HTML)
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

// Handle orientation flips (DPR & viewport settle a beat later)
window.addEventListener('orientationchange', () => {
  setTimeout(fit, 120);
}, { passive: true });

// Track visualViewport changes (iOS Safari, Chrome toolbars)
if (window.visualViewport) {
  const onVV = () => fit();
  visualViewport.addEventListener('resize', onVV, { passive: true });
  visualViewport.addEventListener('scroll', onVV, { passive: true });
}

// Init
initThemes();
initUI();
stopGestures = initGestures(document.body);

window.addEventListener('beforeunload', () => {
  if (typeof stopGestures === 'function') stopGestures();
});

// Theme / Mode events
on('theme', applyTheme);
on('mode', startModeByName);
on('flavor', ({ modeId, flavorId }) => {
  // If the current module knows how to switch flavors, do it on a clean slate
  hardClear(ctx);
  ctx.needsFullClear = true;

  if (activeModule?.setFlavor) {
    activeModule.setFlavor(ctx, flavorId);
  } else {
    // Fallback: re-init the same mode to pick up the new flavor
    activeModule?.stop?.(ctx);
    activeModule?.init?.(ctx);
    activeModule?.start?.(ctx);
  }

  // Refresh the footer label if you're showing the type there
  const typeEl = document.getElementById('typeName');
  if (typeEl) typeEl.textContent = flavorId;
});

// --- HUD: tiny bottom-center toast used for speed feedback ---
function showSpeedToast(multiplier) {
  // Create once
  let el = document.getElementById('hudSpeedToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'hudSpeedToast';
    el.style.position = 'fixed';
    el.style.left = '50%';
    el.style.bottom = '72px';
    el.style.transform = 'translateX(-50%) translateY(8px)';
    el.style.padding = '6px 10px';
    el.style.borderRadius = '10px';
    el.style.background = 'rgba(0,0,0,0.7)';
    el.style.color = '#fff';
    el.style.font = '12px/1.2 system-ui, sans-serif';
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    el.style.transition = 'transform .15s ease, opacity .15s ease';
    document.body.appendChild(el);
  }

  const txt = Number.isFinite(multiplier) ? `speed ×${multiplier.toFixed(2)}` : 'speed';
  el.textContent = txt;

  el.style.opacity = '1';
  el.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(showSpeedToast._t);
  showSpeedToast._t = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(8px)';
  }, 900);

  window.ControlsVisibility?.show?.();
}

// React to speed/pause/clear
on('speed', (s) => {
  ctx.speed = s;
  showSpeedToast(s);
});
on('paused', (p) => { ctx.paused = p; });
on('clear', () => { activeModule?.clear?.(ctx); });

fit();
// Boot with whatever cfg.persona is set to
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

// Register the service worker for offline + installability
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/visual-noise/service-worker.js')
      .catch(err => console.error('SW registration failed:', err));
  });
}
