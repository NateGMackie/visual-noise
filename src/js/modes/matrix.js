// src/js/modes/matrix.js
/* eslint-env browser */

import { emit } from '../state.js';

// Local aliases for DOM types so jsdoc/no-undefined-types passes even without DOM lib types.
/** @typedef {unknown} CanvasRenderingContext2D */
/** @typedef {unknown} KeyboardEvent */

/**
 * @typedef {object} RenderCtx
 * @property {CanvasRenderingContext2D} ctx2d - 2D drawing context (already DPR-scaled).
 * @property {number} w - Canvas width in device pixels.
 * @property {number} h - Canvas height in device pixels.
 * @property {number} dpr - Device pixel ratio used for scaling.
 * @property {number} [elapsed] - Time since last frame (ms).
 * @property {boolean} [paused] - Whether animation is paused.
 * @property {number} [speed] - Global speed multiplier (~0.4–1.6).
 */

/**
 * @typedef {object} GlyphOpts
 * @property {boolean} isHead - If true, draw glowing head; otherwise draw trail glyph.
 * @property {number} [alpha] - 0..1 opacity for trail glyphs (ignored for heads).
 */

export const matrix = (() => {
  // --- glyphs ---
  const KATAKANA =
    'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン';
  const ASCII = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const SYMBOLS = '!@#$%^&*<>+-/=';
  const pickCharset = () => (Math.random() < 0.7 ? KATAKANA + ASCII : ASCII + SYMBOLS);

  // --- visuals ---
  const TRAIL_COLOR = '#00d18f';
  const HEAD_COLOR = '#fff';
  const GLOW_COLOR = '#03FFAF';

  // -----------------------------
  // Intensity controls (STAGES)
  // -----------------------------
  // Tail multiplier stages 1..10 (index 0 unused)
  const TAIL_STAGES = [0, 0.01, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25];
  let tailIndex = 5; // default 1.00×
  let TAIL_MULT = TAIL_STAGES[tailIndex];

  // Spawn probability stages 1..10 (0..1)
  const SPAWN_STAGES = [0, 0.005, 0.01, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.225];
  let spawnIndex = 5; // default ~5%
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

  // HUD step toasts (X/N only — no % to avoid collisions)
  const emitTailStep = () => emit('rain.tail.step', { index: tailIndex, total: 10 });
  const emitSpawnStep = () => emit('rain.spawn.step', { index: spawnIndex, total: 10 });

  // -----------------------------
  // Guards & state
  // -----------------------------
  let wiredBus = false;
  let keysBound = false;

  let cols = 0,
    rows = 0;
  let cellW = 10,
    cellH = 16,
    fontSize = 14;
  /** @type {Array<{y:number,speed:number,trail:number,charset:string}>} */
  let columns = [];
  let running = false;

  // -----------------------------
  // Utils
  // -----------------------------
  /**
   * Convert a hex color like "#03FFAF" or "#fff" to "r, g, b".
   * @param {string} hex - Hex color string with or without leading '#'.
   * @returns {string} Comma-separated RGB triple (e.g., "3, 255, 175").
   */
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const v = parseInt(
      h.length === 3
        ? h
            .split('')
            .map((x) => x + x)
            .join('')
        : h,
      16
    );
    return `${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}`;
  }

  // -----------------------------
  // Layout / seed
  // -----------------------------
  /**
   * Compute font metrics, grid dimensions, and seed column state.
   * @param {RenderCtx} ctx - Render context with sizing and 2D canvas.
   * @returns {void}
   */
  function calc(ctx) {
  const g = ctx.ctx2d;
  const W = ctx.w / ctx.dpr;  // CSS px
  const H = ctx.h / ctx.dpr;  // CSS px

  // Scale type from CSS size (not device pixels)
  fontSize = Math.max(12, Math.floor(0.02 * Math.min(W, H)));
  g.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  g.textBaseline = 'top';

  // Cell metrics in CSS px
  cellW = Math.max(8, Math.ceil(g.measureText('M').width));
  cellH = Math.max(fontSize, 16);

  // Grid in CSS px
  cols = Math.ceil(W / cellW);
  rows = Math.ceil(H / cellH);

  // (Re)seed columns
  columns = Array.from({ length: cols }, () => ({
    y: Math.floor(-Math.random() * rows),
    speed: 0.5 + Math.random() * 0.5,
    trail: 6 + Math.floor(Math.random() * 13),
    charset: pickCharset(),
  }));
}

  // Seed a single column using current grid metrics
function seedColumn() {
  return {
    y: Math.floor(-Math.random() * rows),
    speed: 0.5 + Math.random() * 0.5,
    trail: 6 + Math.floor(Math.random() * 13),
    charset: pickCharset(),
  };
}

// Reset to identity, then apply DPR exactly once
function reset2D(g, dpr) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.shadowBlur = 0;
  g.shadowColor = 'rgba(0,0,0,0)';
}


  // -----------------------------
  // Lifecycle
  // -----------------------------
  /**
   * Initialize DPR transforms, reset canvas defaults, recompute layout,
   * and wire the event bus (once).
   * @param {RenderCtx} ctx - Render context with sizing and 2D canvas.
   * @returns {void}
   */
  function init(ctx) {
  const g = ctx.ctx2d;
  reset2D(g, ctx.dpr);

  // (Re)build layout/columns in CSS px
  calc(ctx);

  // Paint an opaque black base so Matrix doesn't pick up vibe background
  const W = ctx.w / ctx.dpr;
  const H = ctx.h / ctx.dpr;
  g.save();
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  g.restore();

  // Wire bus once
  if (!wiredBus) {
    const bus = (window.app && window.app.events) || window.events;
    if (bus?.on) {
      // Tail: raw multiplier (slider) OR {index}
      bus.on('rain.tail', (m) => {
        if (m && typeof m === 'object' && Number.isFinite(m.index)) {
          tailIndex = clampStep(m.index);
        } else {
          tailIndex = snapToTailIndex(Number(m));
        }
        TAIL_MULT = TAIL_STAGES[tailIndex];
        emitTailStep();
      });

      // Spawn: authoritative index-only input
      bus.on('rain.spawn.idx', (payload) => {
        const idx = payload && typeof payload === 'object' ? payload.index : payload;
        if (!Number.isFinite(idx)) return;
        spawnIndex = clampStep(idx);
        RESPAWN_P = SPAWN_STAGES[spawnIndex];
        emitSpawnStep();
      });

      // Vibe changes: don’t clear/reseed; just repaint opaque black with a clean transform
      bus.on('vibe', () => {
        reset2D(g, ctx.dpr);
        const W2 = ctx.w / ctx.dpr;
        const H2 = ctx.h / ctx.dpr;
        g.save();
        g.fillStyle = '#000';
        g.fillRect(0, 0, W2, H2);
        g.restore();
      });
    }
    wiredBus = true;
  }

  // Ensure staged values are coherent on init
  TAIL_MULT = TAIL_STAGES[tailIndex];
  RESPAWN_P = SPAWN_STAGES[spawnIndex];

  // HUD steps on entry
  emitSpawnStep();
  emitTailStep();
}

  /**
   * Handle DPR/viewport changes by re-running init (rebuilds layout/state).
   * @param {RenderCtx} ctx - Render context with sizing and 2D canvas.
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
   * Clear internal column state and the entire canvas.
   * @param {RenderCtx} ctx - Render context with sizing and 2D canvas.
   * @returns {void}
   */
  function clear(ctx) {
  const g = ctx.ctx2d;
  reset2D(g, ctx.dpr);
  const W = ctx.w / ctx.dpr;
  const H = ctx.h / ctx.dpr;
  g.save();
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  g.restore();
}


  // -----------------------------
  // Drawing
  // -----------------------------
  /**
   * Draw one glyph with head/trail styling.
   * @param {CanvasRenderingContext2D} g - 2D drawing context.
   * @param {string} ch - Single-character glyph to draw.
   * @param {number} x - X position in CSS pixels.
   * @param {number} y - Y position in CSS pixels.
   * @param {GlyphOpts} opts - Head/trail rendering options.
   * @returns {void}
   */
  function drawGlyph(g, ch, x, y, opts) {
    const { isHead } = opts;
    if (isHead) {
      const glow = hexToRgb(GLOW_COLOR);
      const head = hexToRgb(HEAD_COLOR);
      g.shadowColor = `rgba(${glow}, 0.9)`;
      g.shadowBlur = 16;
      g.fillStyle = `rgba(${head}, 1.0)`;
    } else {
      const trail = hexToRgb(TRAIL_COLOR);
      g.shadowBlur = 0;
      const a = opts.alpha > 0.95 ? 1 : 0.15 + opts.alpha * 0.85;
      g.fillStyle = `rgba(${trail}, ${a})`;
    }
    g.fillText(ch, x, y);
    if (isHead) g.shadowBlur = 0;
  }

  // Speed mapping (global speed multiplier)
  const MIN_MUL = 0.4,
    MAX_MUL = 1.6;
  const clampMul = (m) => Math.max(MIN_MUL, Math.min(MAX_MUL, Number(m) || 1));

  /**
   * Render one frame of Matrix rain and advance stream positions.
   * @param {RenderCtx} ctx - Render context including speed/paused flags.
   * @returns {void}
   */
  function frame(ctx) {
  const g = ctx.ctx2d;
  const W = ctx.w / ctx.dpr;  // CSS px
  const H = ctx.h / ctx.dpr;  // CSS px

  // Soft fade toward black (no transform changes here)
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, 0, W, H);

  g.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  g.textBaseline = 'top';

  // Ensure columns array matches current col count and has valid objects
  if (columns.length !== cols) {
    const next = new Array(cols);
    const n = Math.min(cols, columns.length);
    for (let i = 0; i < n; i++) {
      next[i] = columns[i] || seedColumn();
    }
    for (let i = n; i < cols; i++) next[i] = seedColumn();
    columns = next;
  } else {
    for (let i = 0; i < cols; i++) {
      if (!columns[i]) columns[i] = seedColumn();
    }
  }

  const mult = clampMul(ctx.speed);
  const base = 0.3;

  for (let i = 0; i < cols; i++) {
    let col = columns[i];
    if (!col) {
      col = columns[i] = seedColumn(); // final guard
    }

    const px = i * cellW;

    if (running && !ctx.paused) {
      col.y += col.speed * base * mult;
    }

    const headGridY = Math.floor(col.y);

    // head
    {
      const set = col.charset || pickCharset();
      const ch = set[(Math.random() * set.length) | 0];
      const y = headGridY * cellH;
      if (y > -cellH && y < H + cellH) {
        drawGlyph(g, ch, px, y, { isHead: true });
      }
    }

    // trail using staged multiplier
    const baseTrail = col.trail;
    const trailLen = Math.max(1, Math.min(40, Math.round(baseTrail * TAIL_MULT)));
    for (let t = 1; t <= trailLen; t++) {
      const gy = headGridY - t;
      const y = gy * cellH;
      if (y < -cellH) break;
      if (y > H) continue;
      const set = col.charset || pickCharset();
      const ch = set[(Math.random() * set.length) | 0];
      const alpha = 1 - t / (trailLen + 1);
      drawGlyph(g, ch, px, y, { isHead: false, alpha });
    }

    // recycle past bottom with staged probability
    if (running && !ctx.paused && headGridY * cellH > H && Math.random() < RESPAWN_P) {
      columns[i] = seedColumn();
    }
  }
}

  // -----------------------------
  // Hotkeys: Shift+Arrows (with stopPropagation)
  // -----------------------------
  /**
   * Handle Shift+Arrow intensity hotkeys for tails/spawn.
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
          emitTailStep();
        }
        handled = true;
        break;
      }
      case 'ArrowDown': {
        if (tailIndex > 1) {
          tailIndex -= 1;
          TAIL_MULT = TAIL_STAGES[tailIndex];
          emitTailStep();
        }
        handled = true;
        break;
      }
      case 'ArrowRight': {
        if (spawnIndex < 10) {
          spawnIndex += 1;
          RESPAWN_P = SPAWN_STAGES[spawnIndex];
          // send authoritative index to our private input channel
          emit('rain.spawn.idx', { index: spawnIndex });
          emitSpawnStep();
        }
        handled = true;
        break;
      }
      case 'ArrowLeft': {
        if (spawnIndex > 1) {
          spawnIndex -= 1;
          RESPAWN_P = SPAWN_STAGES[spawnIndex];
          emit('rain.spawn.idx', { index: spawnIndex });
          emitSpawnStep();
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

  return { init, resize, start, stop, frame, clear };
})();
