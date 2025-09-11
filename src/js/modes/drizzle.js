// src/js/modes/drizzle.js
/* eslint-env browser */

import { emit } from '../state.js';

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
  const readVar = (name, fallback) =>
    window.getComputedStyle(document.documentElement).getPropertyValue(name)?.trim() || fallback;

  const info = { family: 'rain', flavor: 'drizzle' };

  // ---------- intensity STAGES (1..10; index 0 unused) ----------
  // Tail multiplier stages (bigger = longer trail; we fade less)
  const TAIL_STAGES = [0, 0.01, 0.25, 0.50, 0.75, 1.00, 1.25, 1.50, 1.75, 2.00, 2.25];
  let tailIndex = 5;
  let TAIL_MULT = TAIL_STAGES[tailIndex];

  // Spawn probability stages (probabilities 0..1)
  const SPAWN_STAGES = [0, 0.005, 0.010, 0.020, 0.030, 0.050, 0.075, 0.100, 0.150, 0.200, 0.225];
  let spawnIndex = 5;
  let RESPAWN_P = SPAWN_STAGES[spawnIndex];

  const clampStep = (i) => Math.max(1, Math.min(10, Math.round(i)));

  // Snap any numeric multiplier to nearest tail stage
  const snapToTailIndex = (mult) => {
    if (!Number.isFinite(mult)) return tailIndex;
    let bestIdx = 1, best = Infinity;
    for (let i = 1; i <= 10; i++) {
      const d = Math.abs(TAIL_STAGES[i] - mult);
      if (d < best) { best = d; bestIdx = i; }
    }
    return bestIdx;
  };

  // HUD step toasts
  const emitTailStep  = () => emit('rain.tail.step',  { index: tailIndex,  total: 10 });
  const emitSpawnStep = () => emit('rain.spawn.step', { index: spawnIndex, total: 10 });

  // ---------- state ----------
  let cols = 0, rows = 0, fontSize = 16, lineH = 18;
  /** @type {number[]} */ let drops = [];
  let tickAcc = 0, tickMs = 80;
  let running = false;

  // one-time guards
  let wiredBus = false;
  let keysBound = false;

  // ---------- layout / seeding ----------
  function compute(ctx) {
    fontSize = Math.max(12, Math.floor(0.018 * Math.min(ctx.w, ctx.h)));
    lineH = Math.round(fontSize * 1.2);
    cols = Math.max(8, Math.floor(ctx.w / ctx.dpr / fontSize));
    rows = Math.max(6, Math.floor(ctx.h / ctx.dpr / lineH));
    drops = new Array(cols).fill(0).map(() => Math.floor(-rows * Math.random()));
  }

  function init(ctx) {
    const g = ctx.ctx2d;
    g.setTransform(ctx.dpr, 0, 0, ctx.dpr, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.shadowBlur = 0;
    g.shadowColor = 'rgba(0,0,0,0)';
    compute(ctx);

    // Single authoritative bus wiring
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

        // Spawn: accept { index, total } OBJECT ONLY as the control signal.
        // We translate it to probability and then emit HUD toasts ourselves.
        bus.on('rain.spawn', (payload) => {
          if (!(payload && typeof payload === 'object' && Number.isFinite(payload.index))) return;
          spawnIndex = clampStep(payload.index);
          RESPAWN_P = SPAWN_STAGES[spawnIndex];

          // HUD (notify.js shows numeric when the payload is a number; X/N via .step)
          emit('rain.spawn', Math.round(RESPAWN_P * 100)); // "Spawn: N%"
          emitSpawnStep();                                 // "Spawn: X/10"
        });
      }

      wiredBus = true;
    }

    // Ensure derived values coherent and show a baseline step toast on entry
    TAIL_MULT = TAIL_STAGES[tailIndex];
    RESPAWN_P = SPAWN_STAGES[spawnIndex];
    emitTailStep();
    emitSpawnStep();
  }

  function resize(ctx) { init(ctx); }

  function start() {
    running = true;
    if (!keysBound) {
      window.addEventListener('keydown', onKey, { passive: true });
      keysBound = true;
    }
  }

  function stop() {
    running = false;
    if (keysBound) {
      window.removeEventListener('keydown', onKey);
      keysBound = false;
    }
  }

  function clear(ctx) {
    drops = [];
    ctx.ctx2d.clearRect(0, 0, ctx.w, ctx.h);
  }

  // ---------- speed mapping (per global speed) ----------
  function applySpeed(mult) {
    const m = Math.max(0.4, Math.min(1.6, Number(mult) || 1));
    tickMs = Math.max(16, Math.round(80 / m));
  }

  // ---------- hotkeys: Shift+Arrows ----------
  function onKey(e) {
    if (!e.shiftKey) return;
    switch (e.key) {
      case 'ArrowUp': {        // longer tails (next stage)
        if (tailIndex < 10) {
          tailIndex += 1;
          TAIL_MULT = TAIL_STAGES[tailIndex];
          emit('rain.tail', Number(TAIL_MULT));
          emitTailStep();
        }
        break;
      }
      case 'ArrowDown': {      // shorter tails (prev stage)
        if (tailIndex > 1) {
          tailIndex -= 1;
          TAIL_MULT = TAIL_STAGES[tailIndex];
          emit('rain.tail', Number(TAIL_MULT));
          emitTailStep();
        }
        break;
      }
      case 'ArrowRight': {     // more spawns (next stage)
        if (spawnIndex < 10) {
          spawnIndex += 1;
          RESPAWN_P = SPAWN_STAGES[spawnIndex];
          // authoritative index signal
          emit('rain.spawn', { index: spawnIndex, total: 10 });
          // (HUD toasts are emitted in the bus handler)
        }
        break;
      }
      case 'ArrowLeft': {      // fewer spawns (prev stage)
        if (spawnIndex > 1) {
          spawnIndex -= 1;
          RESPAWN_P = SPAWN_STAGES[spawnIndex];
          emit('rain.spawn', { index: spawnIndex, total: 10 });
        }
        break;
      }
    }
  }

  // ---------- frame ----------
  function frame(ctx) {
    const g = ctx.ctx2d;
    tickAcc += ctx.elapsed;
    const W = ctx.w / ctx.dpr;
    const H = ctx.h / ctx.dpr;

    // Apply per-mode speed from global multiplier
    applySpeed(ctx.speed);

    // Trail fade: bigger tailIndex => bigger TAIL_MULT => weaker fade (longer trail)
    const BASE_FADE = 0.10;
    const MIN_FADE = 0.02, MAX_FADE = 0.25;
    const fadeAlpha = Math.max(MIN_FADE, Math.min(MAX_FADE, BASE_FADE / TAIL_MULT));
    g.fillStyle = `rgba(0,0,0,${fadeAlpha})`;
    g.fillRect(0, 0, W, H);

    // draw
    g.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    g.textBaseline = 'top';
    g.fillStyle = readVar('--fg', '#03ffaf');

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
