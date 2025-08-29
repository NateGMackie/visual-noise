// src/js/main.js
import { cfg, on, labelsForMode } from './state.js';
import { initThemes, applyTheme } from './themes.js';
import { registry as modeRegistry } from './modes/index.js';
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
let activeModule = null;
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
  activeModule?.resize?.(ctx);
}

function run(t){
  const raw = t - lastT;
  lastT = t;

  ctx.now = t;

  // Global speed scaling: <1 slows, >1 speeds. Clamp for safety.
  const s = Math.max(0.25, Math.min(4, ctx.speed || 1));

  // Cap elapsed so backgrounded tabs don't fast-forward too much.
  ctx.elapsed = Math.min(raw * s, 100); // ms
  ctx.dt = ctx.elapsed / 1000;          // seconds (optional convenience)

  activeModule?.frame?.(ctx);
  loopId = requestAnimationFrame(run);
}



// Keep accepting a plain mode name for now (crypto/sysadmin/mining/etc.)
function startModeByName(modeName){
  if (loopId) cancelAnimationFrame(loopId);
  activeModule?.stop?.(ctx);

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

// Init
initThemes();
initUI();

// Theme / Mode events
on('theme', applyTheme);
on('mode', startModeByName);

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

  // Format like “speed ×1.25”
  const txt = Number.isFinite(multiplier) ? `speed ×${multiplier.toFixed(2)}` : 'speed';
  el.textContent = txt;

  // Animate in + auto hide
  el.style.opacity = '1';
  el.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(showSpeedToast._t);
  showSpeedToast._t = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(8px)';
  }, 900);

  // Also briefly show the controls so it’s noticeable when they’re hidden
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
