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

// --- Nav auto-hide / reveal ---
(function setupNavAutohide() {
  const controls = document.getElementById('controls');
  const revealEdge = document.getElementById('revealEdge');
  if (!controls) return;

  // Detect "desktop-like" pointing (fine pointer + hover)
  const isDesktopLike =
    window.matchMedia('(hover: hover)').matches &&
    window.matchMedia('(pointer: fine)').matches;

  // Timer needs to be declared BEFORE any function that touches it
  let hideTimer = null;
  const HIDE_DELAY = 2500; // ms after last interaction

  function updateControlsHeightVar() {
    const h = controls.offsetHeight || 64;
    document.documentElement.style.setProperty('--controls-height', `${h}px`);
  }

  function showControls(reason = 'manual') {
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
    hideTimer = setTimeout(() => {
      hideControls();
    }, HIDE_DELAY);
  }

  // Start hidden and set initial height var
  hideControls();
  updateControlsHeightVar();
  window.addEventListener('resize', updateControlsHeightVar);

  // --- Desktop: click anywhere to reveal ---
  if (isDesktopLike) {
    document.addEventListener('pointerdown', () => {
      if (!controls.classList.contains('is-visible')) {
        showControls('desktop-click-anywhere');
      }
    });

    controls.addEventListener('pointerdown', scheduleAutoHide);
    controls.addEventListener('pointermove', scheduleAutoHide);
    controls.addEventListener('pointerup', scheduleAutoHide);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideControls();
    });

    window.addEventListener('blur', () => scheduleAutoHide());
  }

  // --- Mobile: bottom-edge reveal zone ---
  if (revealEdge) {
    const reveal = () => showControls('mobile-edge');
    revealEdge.addEventListener('touchstart', reveal, { passive: true });
    revealEdge.addEventListener('pointerdown', reveal);
  }

  // Hide when clicking outside the bar (while visible)
  document.addEventListener('pointerdown', (e) => {
    if (!controls.classList.contains('is-visible')) return;
    if (!controls.contains(e.target)) scheduleAutoHide();
  });

  // Optional global access
  window.ControlsVisibility = {
    show: showControls,
    hide: hideControls,
    scheduleHide: scheduleAutoHide
  };
})();
