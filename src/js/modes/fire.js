// src/js/modes/fire.js
import { clamp } from '../lib/index.js';
import { emit } from '../state.js';

/**
 * ASCII Fire with staged intensity controls.
 * Shift+↑/↓ : Height (staged boost index 1..10)
 * Shift+→/← : Fuel   (staged fraction index 1..10)
 *
 * Authoritative inputs:
 *   - emit('fire.height.idx', { index: 1..10 })
 *   - emit('fire.fuel.idx',   { index: 1..10 })
 *
 * HUD step toasts emitted by this module:
 *   - 'fire.height.step'  -> { index, total: 10 }
 *   - 'fire.fuel.step'    -> { index, total: 10 }
 */

export const fire = (() => {
  // ---------- render constants ----------
  const SCALE_X = 7;
  const SCALE_Y = 11;
  const PALETTE_SIZE = 64;
  const TARGET_FPS = 30;
  const MAX_GLOW = 6;
  const BG = '#000000';
  const SHADES = [' ', '.', ':', '-', '~', '*', '+', '=', '%', '#', '@'];

  // ---------- staged intensity (index 0 unused) ----------
  // Height boost range (1.0 .. 1.8) → 10 stages
  const HEIGHT_STAGES = [0,
    1.00, 1.09, 1.18, 1.27, 1.36, 1.45, 1.54, 1.63, 1.72, 1.80
  ];
  // Fuel fraction range (0.05 .. 0.25) → 10 stages
  const FUEL_STAGES = [0,
    0.05, 0.072, 0.094, 0.116, 0.138, 0.160, 0.182, 0.204, 0.226, 0.250
  ];

  const clampStep = (i) => Math.max(1, Math.min(10, Math.round(i)));

  // active stage indices + derived values
  let heightIndex = 5;                   // default ~1.36
  let HEIGHT_BOOST = HEIGHT_STAGES[heightIndex];

  let fuelIndex = 5;                     // default ~0.138 (13.8%)
  let FUEL_ROWS_FRAC = FUEL_STAGES[fuelIndex];

  // step toasts
  const emitHeightStep = () => emit('fire.height.step', { index: heightIndex, total: 10 });
  const emitFuelStep   = () => emit('fire.fuel.step',   { index: fuelIndex,   total: 10 });

  // ---------- palette ----------
  const PAL = new Array(PALETTE_SIZE);
  (function buildPalette() {
    for (let i = 0; i < PALETTE_SIZE; i++) {
      const t = i / (PALETTE_SIZE - 1);
      let r, g, b;
      if (t < 0.25) {
        const k = t / 0.25;
        r = 20 + 110 * k; g = 0 + 15 * k; b = 0;
      } else if (t < 0.5) {
        const k = (t - 0.25) / 0.25;
        r = 130 + 90 * k; g = 15 + 80 * k; b = 0;
      } else if (t < 0.8) {
        const k = (t - 0.5) / 0.3;
        r = 220 + 35 * k; g = 95 + 130 * k; b = 0;
      } else {
        const k = (t - 0.8) / 0.2;
        r = 255; g = 225 + 30 * k; b = 40 + 60 * k;
      }
      PAL[i] = `rgb(${r | 0},${g | 0},${b | 0})`;
    }
  })();

  // ---------- PRNG ----------
  let seed = 1337;
  const rand = () => (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;

  // ---------- state ----------
  let Wc = 0, Hc = 0;    // coarse grid size
  /** @type {Uint8Array|null} */ let heat = null;
  let running = false;
  let fuelRows = 1;

  // speed / stepping
  const dtTarget = 1000 / TARGET_FPS;
  let stepMs = dtTarget;
  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let lastT = 0, acc = 0;

  // one-time guards
  let wiredBus = false;
  let keysBound = false;

  // ---------- speed mapping ----------
  function applySpeed(ctx) {
    const mult = Math.max(0.4, Math.min(1.6, Number(ctx?.speed) || 1));
    const MIN_STEP = 1000 / 90; // max ~90 steps/sec
    stepMs = Math.max(MIN_STEP, Math.round(dtTarget / mult));
  }

  // ---------- geometry ----------
  function rebuild(ctx) {
    const cssW = ctx.w / ctx.dpr;
    const cssH = ctx.h / ctx.dpr;
    const W = Math.floor(cssW / SCALE_X);
    const H = Math.floor(cssH / SCALE_Y);
    Wc = Math.max(20, W);
    Hc = Math.max(12, H);
    heat = new Uint8Array(Wc * Hc);
    fuelRows = Math.max(1, Math.round(Hc * FUEL_ROWS_FRAC));
  }

  // ---------- lifecycle ----------
  function init(ctx) {
    const g = ctx.ctx2d;
    g.setTransform(ctx.dpr, 0, 0, ctx.dpr, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.shadowBlur = 0;
    g.shadowColor = 'rgba(0,0,0,0)';

    rebuild(ctx);
    lastT = nowMs();

    if (!wiredBus) {
      const bus = (window.app && window.app.events) || window.events;
      if (bus?.on) {
        // Authoritative index channels (no numeric cross-talk)
        bus.on('fire.height.idx', (payload) => {
          const idx = (payload && typeof payload === 'object') ? payload.index : payload;
          if (!Number.isFinite(idx)) return;
          heightIndex = clampStep(idx);
          HEIGHT_BOOST = HEIGHT_STAGES[heightIndex];
          emitHeightStep();
        });

        bus.on('fire.fuel.idx', (payload) => {
          const idx = (payload && typeof payload === 'object') ? payload.index : payload;
          if (!Number.isFinite(idx)) return;
          fuelIndex = clampStep(idx);
          FUEL_ROWS_FRAC = FUEL_STAGES[fuelIndex];
          fuelRows = Math.max(1, Math.round(Hc * FUEL_ROWS_FRAC));
          emitFuelStep();
        });
      }
      wiredBus = true;
    }

    // Ensure derived values coherent and show baseline toasts on entry
    HEIGHT_BOOST = HEIGHT_STAGES[heightIndex];
    FUEL_ROWS_FRAC = FUEL_STAGES[fuelIndex];
    fuelRows = Math.max(1, Math.round(Hc * FUEL_ROWS_FRAC));
    emitHeightStep();
    emitFuelStep();
  }

  function resize(ctx) { rebuild(ctx); }

  function start() {
    running = true;
    lastT = nowMs();
    if (!keysBound) {
      window.addEventListener('keydown', onKey, { passive: false });
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
    if (heat) heat.fill(0);
    const g = ctx.ctx2d;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, ctx.w, ctx.h);
    g.restore();
  }

  // ---------- hotkeys (Shift+Arrows) ----------
  function onKey(e) {
    if (!e.shiftKey) return;
    let handled = false;
    switch (e.key) {
      case 'ArrowUp': { // taller flames (next stage)
        if (heightIndex < 10) {
          heightIndex += 1;
          HEIGHT_BOOST = HEIGHT_STAGES[heightIndex];
          emitHeightStep();
        }
        handled = true;
        break;
      }
      case 'ArrowDown': { // shorter flames (prev stage)
        if (heightIndex > 1) {
          heightIndex -= 1;
          HEIGHT_BOOST = HEIGHT_STAGES[heightIndex];
          emitHeightStep();
        }
        handled = true;
        break;
      }
      case 'ArrowRight': { // more fuel (next stage)
        if (fuelIndex < 10) {
          fuelIndex += 1;
          FUEL_ROWS_FRAC = FUEL_STAGES[fuelIndex];
          fuelRows = Math.max(1, Math.round(Hc * FUEL_ROWS_FRAC));
          // Send authoritative stage index so any UI can sync, if desired
          emit('fire.fuel.idx', { index: fuelIndex });
          emitFuelStep();
        }
        handled = true;
        break;
      }
      case 'ArrowLeft': { // less fuel (prev stage)
        if (fuelIndex > 1) {
          fuelIndex -= 1;
          FUEL_ROWS_FRAC = FUEL_STAGES[fuelIndex];
          fuelRows = Math.max(1, Math.round(Hc * FUEL_ROWS_FRAC));
          emit('fire.fuel.idx', { index: fuelIndex });
          emitFuelStep();
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

  // ---------- simulation ----------
  function stepSim() {
    fuelRows = Math.max(1, Math.round(Hc * FUEL_ROWS_FRAC));

    // Fuel band at bottom
    for (let y = Hc - fuelRows; y < Hc; y++) {
      for (let x = 0; x < Wc; x++) {
        if (rand() > 0.6) heat[y * Wc + x] = PALETTE_SIZE - 1;
      }
    }

    // Upward advection + cooling
    for (let y = 0; y < Hc - 1; y++) {
      const grad = y / (Hc - 1);
      const coolFactor = 1 / HEIGHT_BOOST + grad * 0.4;
      for (let x = 0; x < Wc; x++) {
        const rx = (x + (((rand() * 3) | 0) - 1) + Wc) % Wc;
        const belowY = rand() > 0.85 && y + 2 < Hc ? y + 2 : y + 1;
        const below = heat[belowY * Wc + rx];
        const cool = (1 + ((rand() * 3) | 0)) * coolFactor;
        heat[y * Wc + x] = below > cool ? below - cool : 0;
      }
    }
  }

  // ---------- frame ----------
  function frame(ctx) {
    const g = ctx.ctx2d;
    const W = ctx.w / ctx.dpr;
    const H = ctx.h / ctx.dpr;

    // Background
    g.fillStyle = BG;
    g.fillRect(0, 0, W, H);

    // Apply speed multiplier
    applySpeed(ctx);

    // Fixed-step simulation
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    let dt = now - lastT;
    if (dt > 250) dt = 250;
    lastT = now;
    acc += dt;
    while (running && !ctx.paused && acc >= stepMs) {
      stepSim();
      acc -= stepMs;
    }

    // Draw heat as ASCII
    const cellW = Math.ceil(W / Wc);
    const cellH = Math.ceil(H / Hc);
    const fontPx = Math.max(10, cellH);
    g.font = `${fontPx}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    g.textBaseline = 'top';
    g.globalCompositeOperation = 'source-over';

    for (let y = 0; y < Hc; y++) {
      const yPix = y * cellH;
      let lastFill = -1;
      let glowing = false;

      for (let x = 0; x < Wc; x++) {
        const v = heat[y * Wc + x];
        if (!v) continue;

        const shade = SHADES[Math.min(SHADES.length - 1, ((v * SHADES.length) / PALETTE_SIZE) | 0)];
        if (v !== lastFill) {
          g.fillStyle = PAL[v];
          lastFill = v;
        }

        const needsGlow = v > PALETTE_SIZE * 0.8;
        if (needsGlow !== glowing) {
          if (needsGlow) {
            g.shadowColor = PAL[Math.min(PALETTE_SIZE - 1, v + 2)];
            g.shadowBlur = Math.min(MAX_GLOW, 2 + (((v / PALETTE_SIZE) * MAX_GLOW) | 0));
          } else {
            g.shadowBlur = 0;
            g.shadowColor = 'transparent';
          }
          glowing = needsGlow;
        }

        g.fillText(shade, x * cellW, yPix);
      }

      // reset per row
      g.shadowBlur = 0;
      g.shadowColor = 'transparent';
    }
  }

  return { init, resize, start, stop, frame, clear };
})();
[]