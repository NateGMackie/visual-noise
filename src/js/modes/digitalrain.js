// src/js/modes/digitalrain.js
/* eslint-env browser */

import { emit } from '../state.js';

/**
 * Local typedefs so jsdoc/no-undefined-types doesn't complain in projects
 * that don't load DOM lib types.
 * @typedef {unknown} CanvasRenderingContext2D
 * @typedef {unknown} KeyboardEvent
 * @typedef {object} RenderCtx
 * @property {CanvasRenderingContext2D} ctx2d - 2D drawing context (already DPR-scaled).
 * @property {number} w - Canvas width in device pixels.
 * @property {number} h - Canvas height in device pixels.
 * @property {number} dpr - Device pixel ratio used for transforms.
 * @property {number} [elapsed] - Time since last frame (ms).
 * @property {boolean} [paused] - Whether animation is paused.
 * @property {number} [speed] - Global speed multiplier (~0.4–1.6).
 */

/**
 * Program: DigitalRain
 * Genre: Rain
 * Style: Katakana streams with soft trail
 * Purpose: Vertical glyph streams that advance on a fixed tick.
 *
 * Intensity hotkeys (hold Shift):
 *   ↑ / ↓  -> tail length (staged multiplier)
 *   → / ←  -> respawn probability (staged via index)
 */
export const digitalrain = (() => {
  const GLYPHS = Array.from({ length: 96 }, (_, i) => String.fromCharCode(0x30a0 + (i % 96)));

  // ----- utils -----
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const readVar = (name, fallback) =>
    window.getComputedStyle(document.documentElement).getPropertyValue(name)?.trim() || fallback;

  // ----- intensity STAGES (1..10; index 0 unused) -----
  // Tail multiplier stages (bigger = longer trail; fade less)
  const TAIL_STAGES = [0, 0.01, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25];
  let tailIndex = 5; // default 1.00×
  let TAIL_MULT = TAIL_STAGES[tailIndex];

  // Spawn probability stages (probabilities 0..1)
  const SPAWN_STAGES = [0, 0.005, 0.01, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.225];
  let spawnIndex = 5; // default ≈5%
  let RESPAWN_P = SPAWN_STAGES[spawnIndex];

  const clampStep = (i) => Math.max(1, Math.min(10, Math.round(i)));

  // Snap any numeric multiplier to nearest tail stage
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

  // HUD step toasts
  const emitTailStep = () => emit('rain.tail.step', { index: tailIndex, total: 10 });
  const emitSpawnStep = () => emit('rain.spawn.step', { index: spawnIndex, total: 10 });

  // ----- state -----
  let cols = 0,
    fontSize = 16;
  /** @type {number[]} */ let drops = [];
  let running = false,
    tickAcc = 0,
    tickMs = 75;

  // one-time guards
  let wiredBus = false;
  let keysBound = false;

  // ----- layout / seed -----
  /**
   * Compute font size, column count, and seed starting rows for each drop.
   * @param {RenderCtx} ctx - Render context with canvas size/DPR.
   * @returns {void}
   */
  function calc(ctx) {
    fontSize = Math.max(12, Math.floor(0.02 * Math.min(ctx.w, ctx.h)));
    cols = Math.floor(ctx.w / ctx.dpr / fontSize);
    drops = new Array(cols).fill(0).map(() => Math.floor(Math.random() * -40));
  }

  // ----- lifecycle -----
  /**
   * Initialize DPR transform, reset canvas defaults, compute layout,
   * and wire the event bus (once).
   * @param {RenderCtx} ctx - Render context with canvas and current size.
   * @returns {void}
   */
  function init(ctx) {
    const g = ctx.ctx2d;
    g.setTransform(ctx.dpr, 0, 0, ctx.dpr, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.shadowBlur = 0;
    g.shadowColor = 'rgba(0,0,0,0)';
    calc(ctx);

    // Single authoritative bus wiring
    if (!wiredBus) {
      const bus = (window.app && window.app.events) || window.events;
      if (bus?.on) {
        // Tail: accept raw multiplier or { index }
        bus.on('rain.tail', (m) => {
          if (m && typeof m === 'object' && Number.isFinite(m.index)) {
            tailIndex = clampStep(m.index);
          } else {
            tailIndex = snapToTailIndex(Number(m));
          }
          TAIL_MULT = TAIL_STAGES[tailIndex];
          emitTailStep();
        });

        // Spawn: accept OBJECT { index } as the control signal (ignore numeric %)
        bus.on('rain.spawn', (payload) => {
          if (!(payload && typeof payload === 'object' && Number.isFinite(payload.index))) return;
          spawnIndex = clampStep(payload.index);
          RESPAWN_P = SPAWN_STAGES[spawnIndex];

          // Drive HUD toasts ourselves
          emit('rain.spawn', Math.round(RESPAWN_P * 100)); // numeric % toast
          emitSpawnStep(); // X/N toast
        });
      }
      wiredBus = true;
    }

    // Ensure derived values and show baseline toasts once
    TAIL_MULT = TAIL_STAGES[tailIndex];
    RESPAWN_P = SPAWN_STAGES[spawnIndex];
    emitTailStep();
    emitSpawnStep();
  }

  /**
   * Handle DPR/viewport changes by re-running init (rebuilds layout/state).
   * @param {RenderCtx} ctx - Updated render context (new size/DPR).
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
      window.addEventListener('keydown', onKey, { passive: false });
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

  /**
   * Clear internal drop state and the entire canvas.
   * @param {RenderCtx} ctx - Render context for size and 2D context access.
   * @returns {void}
   */
  function clear(ctx) {
    drops = [];
    ctx.ctx2d.clearRect(0, 0, ctx.w, ctx.h);
  }

  // ----- speed mapping -----
  /**
   * Apply global speed multiplier to tick interval (lower tickMs = faster).
   * @param {number} mult - Global speed multiplier (~0.4–1.6).
   * @returns {void}
   */
  function applySpeed(mult) {
    const m = clamp(Number(mult) || 1, 0.4, 1.6);
    tickMs = Math.max(16, Math.round(75 / m));
  }

  // ----- hotkeys: Shift+Arrows -----
  /**
   * Handle Shift+Arrow hotkeys to change tail (↑/↓) and spawn (→/←) stages.
   * @param {KeyboardEvent} e - Keyboard event from window.
   * @returns {void}
   */
  function onKey(e) {
    if (!e.shiftKey) return;
    let handled = false;
    switch (e.key) {
      case 'ArrowUp': {
        if (tailIndex < 10) {
          tailIndex += 1;
          TAIL_MULT = TAIL_STAGES[tailIndex];
          emit('rain.tail', Number(TAIL_MULT)); // numeric HUD toast
          emitTailStep(); // X/N HUD toast
        }
        handled = true;
        break;
      }
      case 'ArrowDown': {
        if (tailIndex > 1) {
          tailIndex -= 1;
          TAIL_MULT = TAIL_STAGES[tailIndex];
          emit('rain.tail', Number(TAIL_MULT));
          emitTailStep();
        }
        handled = true;
        break;
      }
      case 'ArrowRight': {
        if (spawnIndex < 10) {
          spawnIndex += 1;
          RESPAWN_P = SPAWN_STAGES[spawnIndex];
          // authoritative index signal; HUD toasts emitted in bus handler
          emit('rain.spawn', { index: spawnIndex, total: 10 });
        }
        handled = true;
        break;
      }
      case 'ArrowLeft': {
        if (spawnIndex > 1) {
          spawnIndex -= 1;
          RESPAWN_P = SPAWN_STAGES[spawnIndex];
          emit('rain.spawn', { index: spawnIndex, total: 10 });
        }
        handled = true;
        break;
      }
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // ----- frame -----
  /**
   * Render one frame and advance drops on fixed ticks.
   * @param {RenderCtx} ctx - Render context (elapsed, speed, paused).
   * @returns {void}
   */
  function frame(ctx) {
    const g = ctx.ctx2d;
    tickAcc += ctx.elapsed;
    const W = ctx.w / ctx.dpr;
    const H = ctx.h / ctx.dpr;

    // Apply per-mode speed
    applySpeed(ctx.speed);

    // Trail fade: divide base alpha by TAIL_MULT (bigger tail => weaker fade)
    const BASE_FADE = 0.08;
    const MIN_FADE = 0.02,
      MAX_FADE = 0.2;
    const fadeAlpha = clamp(BASE_FADE / TAIL_MULT, MIN_FADE, MAX_FADE);
    g.fillStyle = `rgba(0,0,0,${fadeAlpha})`;
    g.fillRect(0, 0, W, H);

    // draw streams
    g.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    g.textBaseline = 'top';
    g.fillStyle = readVar('--fg', '#0f0');

    const doAdvance = running && !ctx.paused && tickAcc >= tickMs;
    if (doAdvance) tickAcc -= tickMs;

    for (let i = 0; i < cols; i++) {
      const x = i * fontSize;
      const y = drops[i] * fontSize;
      const ch = GLYPHS[(Math.random() * GLYPHS.length) | 0];
      g.fillText(ch, x, y);

      if (!doAdvance) continue;

      if (y > H && Math.random() < RESPAWN_P) {
        drops[i] = Math.floor(-20 * Math.random()); // restart above top
      } else {
        drops[i] += 1; // one row per tick; speed via tickMs
      }
    }
  }

  return { init, resize, start, stop, frame, clear };
})();
