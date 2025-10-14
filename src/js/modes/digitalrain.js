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

export const digitalrain = (() => {
  const GLYPHS = Array.from({ length: 96 }, (_, i) => String.fromCharCode(0x30a0 + (i % 96)));

  // ----- utils -----
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const readVar = (name, fallback) =>
    window.getComputedStyle(document.documentElement).getPropertyValue(name)?.trim() || fallback;
  const getBG = () => (readVar('--bg', '#000000') || '#000000').trim(); // supports #RRGGBB and #RRGGBBAA
  const getFG = () => (readVar('--fg', '#0f0') || '#0f0').trim();

  // ----- intensity STAGES (1..10; index 0 unused) -----
  const TAIL_STAGES = [0, 0.01, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25];
  let tailIndex = 5; // default 1.00×
  let TAIL_MULT = TAIL_STAGES[tailIndex];

  const SPAWN_STAGES = [0, 0.005, 0.01, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.225];
  let spawnIndex = 5; // default ≈5%
  let RESPAWN_P = SPAWN_STAGES[spawnIndex];

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

  // store last ctx so we can repaint on 'vibe'
  /** @type {RenderCtx|null} */
  let lastCtx = null;

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

  // helpers
  /**
   * Reset 2D defaults and apply the DPR transform.
   * @param {CanvasRenderingContext2D} g - 2D drawing context.
   * @param {number} dpr - Device pixel ratio for transforms.
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

  // ----- lifecycle -----
  /**
   * Initialize DPR transform, compute layout, paint background, wire bus once.
   * @param {RenderCtx} ctx - Render context with canvas and current size.
   * @returns {void}
   */
  function init(ctx) {
    lastCtx = ctx;
    const g = ctx.ctx2d;
    reset2D(g, ctx.dpr);
    calc(ctx);

    // paint full vibe background once
    paintBG(ctx);

    if (!wiredBus) {
      const bus = (window.app && window.app.events) || window.events;
      if (bus?.on) {
        // Tail control
        bus.on('rain.tail', (m) => {
          if (m && typeof m === 'object' && Number.isFinite(m.index))
            tailIndex = clampStep(m.index);
          else tailIndex = snapToTailIndex(Number(m));
          TAIL_MULT = TAIL_STAGES[tailIndex];
          emitTailStep();
        });

        // Spawn control
        bus.on('rain.spawn', (payload) => {
          if (!(payload && typeof payload === 'object' && Number.isFinite(payload.index))) return;
          spawnIndex = clampStep(payload.index);
          RESPAWN_P = SPAWN_STAGES[spawnIndex];
          emit('rain.spawn', Math.round(RESPAWN_P * 100));
          emitSpawnStep();
        });

        // On vibe change, repaint background immediately.
        bus.on('vibe', () => {
          if (lastCtx) paintBG(lastCtx);
        });
      }
      wiredBus = true;
    }

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
   * Clear internal drop state and repaint to current vibe background.
   * @param {RenderCtx} ctx - Render context for size and 2D context access.
   * @returns {void}
   */
  function clear(ctx) {
    drops = [];
    lastCtx = ctx;
    reset2D(ctx.ctx2d, ctx.dpr);
    paintBG(ctx);
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
      case 'ArrowUp':
        if (tailIndex < 10) {
          tailIndex += 1;
          TAIL_MULT = TAIL_STAGES[tailIndex];
          emit('rain.tail', Number(TAIL_MULT));
          emitTailStep();
        }
        handled = true;
        break;
      case 'ArrowDown':
        if (tailIndex > 1) {
          tailIndex -= 1;
          TAIL_MULT = TAIL_STAGES[tailIndex];
          emit('rain.tail', Number(TAIL_MULT));
          emitTailStep();
        }
        handled = true;
        break;
      case 'ArrowRight':
        if (spawnIndex < 10) {
          spawnIndex += 1;
          RESPAWN_P = SPAWN_STAGES[spawnIndex];
          emit('rain.spawn', { index: spawnIndex, total: 10 });
        }
        handled = true;
        break;
      case 'ArrowLeft':
        if (spawnIndex > 1) {
          spawnIndex -= 1;
          RESPAWN_P = SPAWN_STAGES[spawnIndex];
          emit('rain.spawn', { index: spawnIndex, total: 10 });
        }
        handled = true;
        break;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // ----- frame -----
  /**
   * Render one frame and advance drops on fixed ticks.
   * Fades toward the vibe background so trails inherit theme hue.
   * @param {RenderCtx} ctx - Render context (elapsed, speed, paused).
   * @returns {void}
   */
  function frame(ctx) {
    const g = ctx.ctx2d;
    tickAcc += ctx.elapsed;
    const W = ctx.w / ctx.dpr,
      H = ctx.h / ctx.dpr;

    // reset compositor every frame (avoids stale ops from other modes)
    reset2D(g, ctx.dpr);

    // Apply per-mode speed
    applySpeed(ctx.speed);

    // Trail fade toward the vibe background (not black)
    const BASE_FADE = 0.08;
    const MIN_FADE = 0.02,
      MAX_FADE = 0.2;
    const fadeAlpha = clamp(BASE_FADE / TAIL_MULT, MIN_FADE, MAX_FADE);

    g.save();
    g.globalAlpha = fadeAlpha;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = getBG();
    g.fillRect(0, 0, W, H);
    g.restore();

    // draw streams
    g.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    g.textBaseline = 'top';
    g.fillStyle = getFG();

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