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

  // Reset to identity, then apply DPR exactly once
  /**
   * Reset 2D canvas defaults and apply a DPR transform.
   * @param {CanvasRenderingContext2D} g - 2D drawing context to reset.
   * @param {number} dpr - Device pixel ratio to apply to the transform.
   * @returns {void}
   */
  function reset2D(g, dpr) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.shadowBlur = 0;
    g.shadowColor = 'rgba(0,0,0,0)';
  }

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

  // Defer background repaint to next frame (avoid mid-frame re-entrancy)
  let needsBGRepaint = false;

  // ----- layout / seed -----
  /**
   * Compute font size, column count, and seed starting rows for each drop.
   * Layout is based on CSS pixels (device px / dpr).
   * @param {RenderCtx} ctx - Render context with DPR and device-pixel sizes.
   * @returns {void}
   */
  function calc(ctx) {
    const W = ctx.w / ctx.dpr;
    const H = ctx.h / ctx.dpr;

    // Scale font from CSS size (not device pixels)
    fontSize = Math.max(12, Math.floor(0.02 * Math.min(W, H)));

    // Column count in CSS px
    cols = Math.max(1, Math.floor(W / fontSize));

    // Seed drops starting above the top
    drops = new Array(cols).fill(0).map(() => Math.floor(Math.random() * -40));
  }

  /**
   * Paint the full canvas to the current vibe background color.
   * @param {RenderCtx} ctx - Render context used to compute CSS-px dimensions.
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
   * Initialize DPR, compute layout, wire event bus once, and paint vibe background.
   * @param {RenderCtx} ctx - Render context with 2D canvas, sizes, and DPR.
   * @returns {void}
   */
  function init(ctx) {
    lastCtx = ctx;
    const g = ctx.ctx2d;

    // Apply DPR once and set defaults
    reset2D(g, ctx.dpr);

    // Compute layout in CSS px
    calc(ctx);

    // Paint full vibe background once
    paintBG(ctx);

    if (!wiredBus) {
      const bus = (window.app && window.app.events) || window.events;
      if (bus?.on) {
        // Tail control
        bus.on('rain.tail', (m) => {
          if (m && typeof m === 'object' && Number.isFinite(m.index)) {
            tailIndex = clampStep(m.index);
          } else {
            tailIndex = snapToTailIndex(Number(m));
          }
          TAIL_MULT = TAIL_STAGES[tailIndex];
          emitTailStep();
        });

        // Spawn control (authoritative index)
        bus.on('rain.spawn', (payload) => {
          if (!(payload && typeof payload === 'object' && Number.isFinite(payload.index))) return;
          spawnIndex = clampStep(payload.index);
          RESPAWN_P = SPAWN_STAGES[spawnIndex];
          emit('rain.spawn', Math.round(RESPAWN_P * 100));
          emitSpawnStep();
        });

        // Vibe change: request a repaint next frame
        bus.on('vibe', () => {
          needsBGRepaint = true;
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
   * @param {RenderCtx} ctx - Render context with updated sizes/DPR.
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
   * Clear and repaint vibe background; also remember ctx for future repaints.
   * @param {RenderCtx} ctx - Render context used to repaint background.
   * @returns {void}
   */
  function clear(ctx) {
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
   * Handle Shift+Arrow hotkeys to adjust tail and spawn stages.
   * @param {KeyboardEvent} e - Keyboard event from the window.
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
   * Render one frame and optionally advance column positions on tick.
   * Trail fade is toward the vibe background so hues follow the active theme.
   * @param {RenderCtx} ctx - Render context including timing, DPR, and flags.
   * @returns {void}
   */
  function frame(ctx) {
    const g = ctx.ctx2d;
    tickAcc += ctx.elapsed;
    const W = ctx.w / ctx.dpr,
      H = ctx.h / ctx.dpr;

    // If a vibe just happened, repaint once now
    if (needsBGRepaint && lastCtx) {
      paintBG(lastCtx);
      needsBGRepaint = false;
    }

    // Apply per-mode speed
    applySpeed(ctx.speed);

    // Ensure drops array is valid and matches column count
    if (drops.length !== cols) {
      const next = new Array(cols);
      const n = Math.min(cols, drops.length);
      for (let i = 0; i < n; i++)
        next[i] = Number.isFinite(drops[i]) ? drops[i] : Math.floor(Math.random() * -40);
      for (let i = n; i < cols; i++) next[i] = Math.floor(Math.random() * -40);
      drops = next;
    } else {
      for (let i = 0; i < cols; i++)
        if (!Number.isFinite(drops[i])) drops[i] = Math.floor(Math.random() * -40);
    }

    // Trail fade toward the vibe background (keeps theme tint)
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

    // Draw streams
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
