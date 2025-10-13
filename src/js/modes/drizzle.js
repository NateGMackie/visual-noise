// src/js/modes/drizzle.js
/* eslint-env browser */

import { emit } from '../state.js';

/** @typedef {unknown} CanvasRenderingContext2D */
/** @typedef {unknown} KeyboardEvent */
/**
 * Render context passed by the host engine.
 * @typedef {object} RenderCtx
 * @property {CanvasRenderingContext2D} ctx2d - 2D drawing context (already DPR-scaled)
 * @property {number} w - Canvas width in device pixels
 * @property {number} h - Canvas height in device pixels
 * @property {number} dpr - Device pixel ratio
 * @property {number} [elapsed] - Time since last frame (ms)
 * @property {boolean} [paused] - Whether animation is paused
 * @property {number} [speed] - Global speed multiplier (~0.4–1.6)
 */

/**
 * Program: Drizzle
 * Genre: Rain
 * Style: light ASCII drizzle
 * Purpose: Sparse falling glyphs with a soft trail fade.
 *
 * Intensity hotkeys (hold Shift):
 *   ↑ / ↓  -> tail length (staged multiplier)
 *   → / ←  -> respawn probability (staged via index)
 */
export const drizzle = (() => {
  // ---------- visuals / glyphs ----------
  const GLYPHS = ['|', '/', '\\', '-', '.', '`', '*', ':', ';'];

  // Theme helpers (read live so vibe swaps apply instantly)
  const readVar = (name, fallback) =>
    window.getComputedStyle(document.documentElement).getPropertyValue(name)?.trim() || fallback;
  const getBG = () => (readVar('--bg', '#000000') || '#000000').trim(); // supports #RRGGBB / #RRGGBBAA
  const getFG = () => (readVar('--fg', '#03ffaf') || '#03ffaf').trim();

  const info = { family: 'rain', flavor: 'drizzle' };

  // ---------- intensity STAGES (1..10; index 0 unused) ----------
  const TAIL_STAGES = [0, 0.01, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25];
  let tailIndex = 5;
  let TAIL_MULT = TAIL_STAGES[tailIndex];

  const SPAWN_STAGES = [0, 0.005, 0.01, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.225];
  let spawnIndex = 5;
  let RESPAWN_P = SPAWN_STAGES[spawnIndex];

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const clampStep = (i) => Math.max(1, Math.min(10, Math.round(i)));

  const snapToTailIndex = (mult) => {
    if (!Number.isFinite(mult)) return tailIndex;
    let bestIdx = 1,
      best = Infinity;
    for (let i = 1; i <= 10; i++) {
      const d = Math.abs(TAIL_STAGES[i] - mult);
      if (d < best) {
        best = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  };

  const emitTailStep = () => emit('rain.tail.step', { index: tailIndex, total: 10 });
  const emitSpawnStep = () => emit('rain.spawn.step', { index: spawnIndex, total: 10 });

  // ---------- state ----------
  let cols = 0,
    rows = 0,
    fontSize = 16,
    lineH = 18;
  /** @type {number[]} */ let drops = [];
  let tickAcc = 0,
    tickMs = 80;
  let running = false;

  // one-time guards
  let wiredBus = false;
  let keysBound = false;

  // ---------- layout / seeding ----------
  /**
   * Compute font metrics, grid dimensions, and seed initial drop positions.
   * @param {RenderCtx} ctx - Render context with canvas size and DPR.
   * @returns {void}
   */
  function compute(ctx) {
    fontSize = Math.max(12, Math.floor(0.018 * Math.min(ctx.w, ctx.h)));
    lineH = Math.round(fontSize * 1.2);
    cols = Math.max(8, Math.floor(ctx.w / ctx.dpr / fontSize));
    rows = Math.max(6, Math.floor(ctx.h / ctx.dpr / lineH));
    drops = new Array(cols).fill(0).map(() => Math.floor(-rows * Math.random()));
  }

  // small helpers
  /**
   * Reset 2D canvas defaults and apply the DPR transform.
   * @param {CanvasRenderingContext2D} g - 2D drawing context.
   * @param {number} dpr - Device pixel ratio used for transforms.
   * @returns {void}
   */
  function reset2D(g, dpr) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.shadowBlur = 0;
    g.shadowColor = 'rgba(0,0,0,0)';
  }

  /**
   * Paint the full canvas to the current vibe background color.
   * @param {RenderCtx} ctx - Render context providing size and 2D context.
   * @returns {void}
   */
  function paintBG(ctx) {
    const g = ctx.ctx2d;
    const W = ctx.w / ctx.dpr,
      H = ctx.h / ctx.dpr;
    g.save();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = getBG();
    g.fillRect(0, 0, W, H);
    g.restore();
  }

  // ---------- lifecycle ----------
  /**
   * Initialize DPR, compute layout, wire bus once, and paint vibe background.
   * @param {RenderCtx} ctx - Render context with canvas, dpr, and dimensions.
   * @returns {void}
   */
  function init(ctx) {
    const g = ctx.ctx2d;
    reset2D(g, ctx.dpr);
    compute(ctx); // seed columns
    paintBG(ctx); // lay vibe background

    if (!wiredBus) {
      const bus = (window.app && window.app.events) || window.events;

      if (bus?.on) {
        // Tail: accept raw multiplier or {index}
        bus.on('rain.tail', (m) => {
          if (m && typeof m === 'object' && Number.isFinite(m.index)) {
            tailIndex = clampStep(m.index);
          } else {
            tailIndex = snapToTailIndex(Number(m));
          }
          TAIL_MULT = TAIL_STAGES[tailIndex];
          emitTailStep();
        });

        // Spawn: accept { index, total } OBJECT ONLY
        bus.on('rain.spawn', (payload) => {
          if (!(payload && typeof payload === 'object' && Number.isFinite(payload.index))) return;
          spawnIndex = clampStep(payload.index);
          RESPAWN_P = SPAWN_STAGES[spawnIndex];
          emit('rain.spawn', Math.round(RESPAWN_P * 100)); // numeric %
          emitSpawnStep(); // X/N
        });
      }

      wiredBus = true;
    }

    // Baseline HUD toasts
    TAIL_MULT = TAIL_STAGES[tailIndex];
    RESPAWN_P = SPAWN_STAGES[spawnIndex];
    emitTailStep();
    emitSpawnStep();
  }

  /**
   * Handle DPR/viewport changes by re-running init (rebuilds layout/state).
   * @param {RenderCtx} ctx - Updated render context with new size/DPR.
   * @returns {void}
   */
  function resize(ctx) {
    init(ctx);
  }

  /**
   * Begin animation and bind hotkeys (once).
   * @returns {void}
   */
  function start() {
    running = true;
    if (!keysBound) {
      window.addEventListener('keydown', onKey, { passive: true });
      keysBound = true;
    }
  }

  /**
   * Stop animation and unbind hotkeys.
   * @returns {void}
   */
  function stop() {
    running = false;
    if (keysBound) {
      window.removeEventListener('keydown', onKey);
      keysBound = false;
    }
  }

  // IMPORTANT: on a clear (e.g., vibe change), we must RESEED and repaint BG
  /**
   * Reseed columns, reset compositor, and repaint to the vibe background.
   * @param {RenderCtx} ctx - Render context used to reseed and repaint.
   * @returns {void}
   */
  function clear(ctx) {
    compute(ctx); // <-- reseed columns so drops exist immediately
    reset2D(ctx.ctx2d, ctx.dpr);
    paintBG(ctx); // paint to vibe bg (don’t clear to transparent)
    tickAcc = 0; // reset tick accumulator to avoid long first delay
  }

  // ---------- speed mapping (per global speed) ----------
  /**
   * Apply global speed multiplier to tick interval (lower tickMs = faster).
   * @param {number} mult - Global speed multiplier (~0.4–1.6).
   * @returns {void}
   */
  function applySpeed(mult) {
    const m = Math.max(0.4, Math.min(1.6, Number(mult) || 1));
    tickMs = Math.max(16, Math.round(80 / m));
  }

  // ---------- hotkeys: Shift+Arrows ----------
  /**
   * Handle Shift+Arrow hotkeys to adjust tail and spawn stages.
   * @param {KeyboardEvent} e - Keyboard event from window.
   * @returns {void}
   */
  function onKey(e) {
    if (!e.shiftKey) return;
    switch (e.key) {
      case 'ArrowUp':
        if (tailIndex < 10) {
          tailIndex += 1;
          TAIL_MULT = TAIL_STAGES[tailIndex];
          emit('rain.tail', Number(TAIL_MULT));
          emitTailStep();
        }
        break;
      case 'ArrowDown':
        if (tailIndex > 1) {
          tailIndex -= 1;
          TAIL_MULT = TAIL_STAGES[tailIndex];
          emit('rain.tail', Number(TAIL_MULT));
          emitTailStep();
        }
        break;
      case 'ArrowRight':
        if (spawnIndex < 10) {
          spawnIndex += 1;
          RESPAWN_P = SPAWN_STAGES[spawnIndex];
          emit('rain.spawn', { index: spawnIndex, total: 10 });
        }
        break;
      case 'ArrowLeft':
        if (spawnIndex > 1) {
          spawnIndex -= 1;
          RESPAWN_P = SPAWN_STAGES[spawnIndex];
          emit('rain.spawn', { index: spawnIndex, total: 10 });
        }
        break;
    }
  }

  // ---------- frame ----------
  /**
   * Render one frame and optionally advance column positions on tick.
   * Fades toward the vibe background so hues follow the active theme.
   * @param {RenderCtx} ctx - Render context including elapsed/speed/paused flags.
   * @returns {void}
   */
  function frame(ctx) {
    const g = ctx.ctx2d;
    tickAcc += ctx.elapsed;
    const W = ctx.w / ctx.dpr;
    const H = ctx.h / ctx.dpr;

    // Reset compositor each frame (avoid stale ops from other modes)
    reset2D(g, ctx.dpr);

    // Apply per-mode speed
    applySpeed(ctx.speed);

    // Trail fade: fade toward vibe background (NOT black)
    const BASE_FADE = 0.1;
    const MIN_FADE = 0.02,
      MAX_FADE = 0.25;
    const fadeAlpha = clamp(BASE_FADE / TAIL_MULT, MIN_FADE, MAX_FADE);

    g.save();
    g.globalAlpha = fadeAlpha;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = getBG();
    g.fillRect(0, 0, W, H);
    g.restore();

    // draw
    g.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    g.textBaseline = 'top';
    g.fillStyle = getFG();

    const doAdvance = running && !ctx.paused && tickAcc >= tickMs;
    if (doAdvance) tickAcc -= tickMs;

    for (let c = 0; c < cols; c++) {
      const x = c * fontSize;
      const y = drops[c] * lineH;
      const ch = GLYPHS[(Math.random() * GLYPHS.length) | 0];
      g.fillText(ch, x, y);

      if (!doAdvance) continue;

      if (y > H && Math.random() < RESPAWN_P) {
        drops[c] = Math.floor(-rows * Math.random()); // restart above the top
      } else {
        drops[c] += 1; // one row per tick; timing via tickMs
      }
    }
  }

  return { info, init, resize, start, stop, frame, clear };
})();
