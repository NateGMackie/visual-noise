/* eslint-env browser */
// src/js/main.js

// Canvas + utils (centralized DPR, resize, clear, typography)
import {
  attachHiDPICanvas,
  resizeToDisplaySize,
  clearCanvas,
  modular,
  applyMono,
} from './lib/index.js';

// App container on window (match your existing pattern)
const app = window.app || { state: {}, ui: {}, events: window.events };
window.app = app;

// Keep a single render context object passed into modes.
// (Use generic types here to avoid jsdoc/no-undefined-types on DOM classes.)
/** @type {{canvas: any, ctx2d: any, dpr:number, w:number, h:number, now:number, elapsed:number, dt:number, speed:number, paused:boolean, needsFullClear:boolean}} */
const ctx = {
  canvas: null,
  ctx2d: null,

  dpr: 1,
  w: 0,
  h: 0,

  now: 0,
  elapsed: 0,
  dt: 0,

  speed: 1,
  paused: false,

  // request a full clear on next frame (e.g., after mode switch / orientation change)
  needsFullClear: false,
};

// Active mode orchestration
let activeModule = null;
let loopId = 0;
let lastT = performance.now();

// --- Canvas helpers wired to lib --- //

/**
 * Ensure backing store and transform match the element’s CSS size.
 * Updates ctx.dpr / ctx.w / ctx.h and reapplies DPR transform.
 */
function fit() {
  if (!ctx.canvas || !ctx.ctx2d) return;

  // If CSS size changed, lib will resize backing store and reapply DPR transform
  const resized = resizeToDisplaySize(ctx.canvas, ctx.ctx2d);

  // Read back the current DPR we apply (attach/resize ensure transform = (dpr, 0, 0, dpr, 0, 0))
  const dprGuess = window.devicePixelRatio || 1;

  ctx.dpr = Math.max(1, Math.min(dprGuess, 2));
  ctx.w = ctx.canvas.width; // device-pixel width
  ctx.h = ctx.canvas.height; // device-pixel height

  if (resized) {
    // Let the active mode react to size changes
    activeModule?.resize?.(ctx);
  }
}

/** Full-surface clear, transform-safe. */
function hardClear() {
  if (!ctx.canvas || !ctx.ctx2d) return;
  clearCanvas(ctx.canvas, ctx.ctx2d);
}

/** Make a resize/orientation feel like a mode switch: fresh size, fresh clear. */
function refreshLikeModeChange() {
  fit();
  ctx.needsFullClear = true;
}

// --- Main animation loop --- //
/**
 * Per-frame render loop.
 * @param {number} t - DOMHighResTimeStamp from window.requestAnimationFrame.
 */
function run(t) {
  const raw = t - lastT;
  lastT = t;

  // clamp/apply speed (keeping your previous guardrails)
  const s = Math.max(0.25, Math.min(4, ctx.speed || 1));
  ctx.elapsed = ctx.paused ? 0 : Math.min(raw * s, 100);
  ctx.dt = ctx.elapsed / 1000;
  ctx.now = t;

  // Defensive: enforce DPR transform each frame in case a mode changed it
  if (ctx.ctx2d) ctx.ctx2d.setTransform(ctx.dpr, 0, 0, ctx.dpr, 0, 0);

  if (ctx.needsFullClear) {
    hardClear();
    ctx.needsFullClear = false;
  }

  activeModule?.frame?.(ctx);
  loopId = window.requestAnimationFrame(run);
}

// --- Dynamic imports --- //
(async () => {
  const [stateMod, themesMod, modesMod, uiMod, gesturesMod, notifyMod] = await Promise.all([
    import('./state.js'),
    import('./themes.js'),
    import('./modes/index.js'),
    import('./ui/ui.js'),
    import('./ui/gestures.js'),
    import('./ui/notify.js'),
  ]);

  const { cfg, on, labelsForMode, labelsForGenreStyle } = stateMod;
  const { initThemes, applyTheme } = themesMod;
  const { registry: modeRegistry } = modesMod;
  const { initUI } = uiMod;
  const { initGestures } = gesturesMod;
  const { initNotify } = notifyMod;

  // ---------- One toast HUD instance ----------
  initNotify({ bus: { on }, labelsForMode });

  // ---------- Canvas / 2D context ----------
  const canvas = document.getElementById('canvas');
  if (!canvas) {
    console.error('[visual-noise] #canvas not found');
    return;
  }

  // Attach DPR-aware backing store & transform once at startup
  const { ctx: g, dpr } = attachHiDPICanvas(canvas);
  ctx.canvas = canvas;
  ctx.ctx2d = g;
  ctx.dpr = dpr;

  // Optional, unified text baseline for any modes that draw text without setting fonts
  applyMono(g, modular(0));

  // Initialize width/height from backing store
  ctx.w = canvas.width;
  ctx.h = canvas.height;

  // ---------- Active mode bootstrap ----------
  /**
   * Start a mode by registry name; falls back to crypto if missing.
   * @param {string} modeName - Registry key of the mode to start.
   */
  function startModeByName(modeName) {
    if (loopId) window.cancelAnimationFrame(loopId);
    activeModule?.stop?.(ctx);

    refreshLikeModeChange();
    activeModule = modeRegistry[modeName] ?? modeRegistry.crypto;

    // Footer labels — maintain both new (genre/style/vibe) and legacy (mode/type/theme) IDs
    let genreLabel, styleLabel;
    if (typeof labelsForGenreStyle === 'function') {
      const out = labelsForGenreStyle(modeName);
      genreLabel = out.genreLabel;
      styleLabel = out.styleLabel;
    } else {
      const { familyLabel, typeLabel } = labelsForMode(modeName);
      genreLabel = familyLabel;
      styleLabel = typeLabel;
    }

    const genreEl = document.getElementById('genreName') || document.getElementById('modeName');
    const styleEl = document.getElementById('styleName') || document.getElementById('typeName');
    if (genreEl) genreEl.textContent = genreLabel;
    if (styleEl) styleEl.textContent = styleLabel;

    activeModule?.init?.(ctx);
    activeModule?.start?.(ctx);

    lastT = performance.now();
    loopId = window.requestAnimationFrame(run);
  }

  // ---------- UI / gestures / themes ----------
  initThemes();
  // Apply initial vibe label (initThemes already applies CSS vars via events)
  const initialVibe = cfg?.vibe ?? cfg?.theme ?? 'classic';
  const vibeEl0 = document.getElementById('vibeName') || document.getElementById('themeName');
  if (vibeEl0) vibeEl0.textContent = initialVibe;

  initUI();
  // Fire up gestures; we don't use the disposer yet.
  initGestures?.();

  // ---------- Window & document events ----------
  // Throttled resize
  let resizeRaf = 0;
  window.addEventListener(
    'resize',
    () => {
      if (resizeRaf) return;
      resizeRaf = window.requestAnimationFrame(() => {
        resizeRaf = 0;
        refreshLikeModeChange();
      });
    },
    { passive: true }
  );

  // Orientation change
  window.addEventListener(
    'orientationchange',
    () => {
      window.setTimeout(refreshLikeModeChange, 150);
    },
    { passive: true }
  );

  // Fullscreen changes can alter viewport size
  document.addEventListener('fullscreenchange', () => {
    window.setTimeout(refreshLikeModeChange, 50);
  });

  // ---------- Bus wiring (new + legacy) ----------
  /**
   * Update the active mode's style (aka flavor), restarting if the mode lacks a setter.
   * @param {string} id - Style identifier to apply.
   */
  function handleStyleOrFlavor(id) {
    if (!activeModule) return;
    if (activeModule.setFlavor) {
      activeModule.setFlavor(ctx, id);
    } else {
      // Fallback: restart mode to reflect flavor change
      activeModule.stop?.(ctx);
      activeModule.init?.(ctx);
      activeModule.start?.(ctx);
    }
    const styleEl = document.getElementById('styleName') || document.getElementById('typeName');
    if (styleEl) styleEl.textContent = id;
  }

  /**
   * Apply a vibe (theme) and update the HUD label.
   * @param {string} v - Vibe key to apply (e.g., 'classic').
   */
  function handleVibe(v) {
    applyTheme(v);
    const vibeEl = document.getElementById('vibeName') || document.getElementById('themeName');
    if (vibeEl) vibeEl.textContent = v;
  }

  // Legacy names
  on('mode', (name) => {
    startModeByName(name);
  });
  on('flavor', (id) => {
    handleStyleOrFlavor(id);
  });
  on('theme', (v) => {
    handleVibe(v);
  });

  // New names
  on('genre', (name) => {
    startModeByName(name);
  });
  on('style', (id) => {
    handleStyleOrFlavor(id);
  });
  on('vibe', (v) => {
    handleVibe(v);
  });

  on('speed', (s) => {
    ctx.speed = s;
  });
  on('paused', (p) => {
    ctx.paused = p;
  });
  on('clear', () => {
    activeModule?.clear?.(ctx);
  });

  // ---------- Boot ----------
  // Seed speed/paused from cfg (match your prior behavior)
  ctx.speed = cfg.speed;
  ctx.paused = cfg.paused;

  window.requestAnimationFrame(() => {
    refreshLikeModeChange();
    startModeByName(cfg.persona);

    const vibeEl = document.getElementById('vibeName') || document.getElementById('themeName');
    if (vibeEl && (cfg.vibe || cfg.theme)) {
      vibeEl.textContent = cfg.vibe || cfg.theme;
    }
  });
})();
