// src/js/modes/fire.js
import { clamp } from '../lib/index.js';
import { emit } from '../state.js';

/**
 * Program: <ProgramName>
 * Genre: <Systems | Rain | Fire | ...>
 * Style: <Sysadmin | Crypto | Matrix | DigitalRain | Rain_BSD | Fire | FireAscii | ...>
 * Vibe: <Optional theme descriptor if applicable>
 *
 * Purpose:
 *   Short 1–3 line summary of what this program draws and its key parameters.
 *
 * Inputs:
 *   - ctx {CanvasRenderingContext2D} drawing context (DPR-scaled)
 *   - canvas {HTMLCanvasElement} the canvas element
 *   - state {object} reactive/immutable state for this program (speed, theme, etc.)
 *
 * Exports:
 *   - init(canvas, state): void      // one-time setup (fonts, buffers)
 *   - frame(canvas, state): void     // draw one frame; called by the main loop
 *   - teardown?(): void              // optional cleanup
 *
 * Notes:
 *   Keep logic pure w.r.t. state; no global singletons. Use lib/* helpers.
 */

// ASCII Fire with live tuning hotkeys:
//   Shift+↑ / Shift+↓  -> HEIGHT_BOOST (taller/shorter flames)
//   Shift+→ / Shift+←  -> FUEL_ROWS_FRAC (fuel band thickness)

export const fire = (() => {
  // Base tunables
  const SCALE_X = 7;
  const SCALE_Y = 11;
  const PALETTE_SIZE = 64;
  const TARGET_FPS = 30;
  const MAX_GLOW = 6;

  // Live-tuned
  let FUEL_ROWS_FRAC = 0.12;
  let HEIGHT_BOOST = 1.25;

  const MIN_FUEL = 0.05,
    MAX_FUEL = 0.25;
  const MIN_BOOST = 1.0,
    MAX_BOOST = 1.8;

  const SHADES = [' ', '.', ':', '-', '~', '*', '+', '=', '%', '#', '@'];
  const BG = '#000000';

  // Build compact bright palette
  const PAL = new Array(PALETTE_SIZE);
  (function buildPalette() {
    for (let i = 0; i < PALETTE_SIZE; i++) {
      const t = i / (PALETTE_SIZE - 1);
      let r, g, b;
      if (t < 0.25) {
        const k = t / 0.25;
        r = 20 + 110 * k;
        g = 0 + 15 * k;
        b = 0;
      } else if (t < 0.5) {
        const k = (t - 0.25) / 0.25;
        r = 130 + 90 * k;
        g = 15 + 80 * k;
        b = 0;
      } else if (t < 0.8) {
        const k = (t - 0.5) / 0.3;
        r = 220 + 35 * k;
        g = 95 + 130 * k;
        b = 0;
      } else {
        const k = (t - 0.8) / 0.2;
        r = 255;
        g = 225 + 30 * k;
        b = 40 + 60 * k;
      }
      PAL[i] = `rgb(${r | 0},${g | 0},${b | 0})`;
    }
  })();

  // PRNG
  let seed = 1337;
  const rand = () => (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;

  // State
  let Wc = 0,
    Hc = 0; // coarse grid width/height (cells)
  let heat = null; // Uint8Array of heat indices
  let running = false;
  let fuelRows = 1;
  let lastT = 0,
    acc = 0;

  // HUD
  let hudText = '';
  let hudUntil = 0;

  const dtTarget = 1000 / TARGET_FPS;
  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // Utils

  /**
   *
   */
  function showHUD() {
    hudText = `height:${HEIGHT_BOOST.toFixed(2)}  fuel:${(FUEL_ROWS_FRAC * 100).toFixed(0)}%`;
    hudUntil = nowMs() + 1500;
  }

  // Hotkeys (hold Shift)
  /**
   * Handle Shift+Arrow hotkeys to tweak flame height and fuel band.
   * @param {*} e - KeyboardEvent from window.
   * @returns {void}
   */
  function onKey(e) {
    if (!e.shiftKey) return;
    switch (e.key) {
      case 'ArrowUp':
        HEIGHT_BOOST = clamp(HEIGHT_BOOST + 0.05, MIN_BOOST, MAX_BOOST);
        emit('notify', {
          kind: 'type',
          title: 'Fire',
          value: `height: ${HEIGHT_BOOST.toFixed(2)}`,
          ttl: 1200,
        });
        showHUD();
        break;
      case 'ArrowDown':
        HEIGHT_BOOST = clamp(HEIGHT_BOOST - 0.05, MIN_BOOST, MAX_BOOST);
        emit('notify', {
          kind: 'type',
          title: 'Fire',
          value: `height: ${HEIGHT_BOOST.toFixed(2)}`,
          ttl: 1200,
        });
        showHUD();
        break;
      case 'ArrowRight':
        FUEL_ROWS_FRAC = clamp(FUEL_ROWS_FRAC + 0.01, MIN_FUEL, MAX_FUEL);
        emit('notify', {
          kind: 'type',
          title: 'Fire',
          value: `fuel: ${(FUEL_ROWS_FRAC * 100).toFixed(0)}%`,
          ttl: 1200,
        });
        showHUD();
        break;
      case 'ArrowLeft':
        FUEL_ROWS_FRAC = clamp(FUEL_ROWS_FRAC - 0.01, MIN_FUEL, MAX_FUEL);
        emit('notify', {
          kind: 'type',
          title: 'Fire',
          value: `fuel: ${(FUEL_ROWS_FRAC * 100).toFixed(0)}%`,
          ttl: 1200,
        });
        showHUD();
        break;
    }
  }

  // ----- Geometry/state rebuild (no drawing) -----
  /**
   * Rebuild coarse grid & buffers based on canvas size/DPR.
   * @param {*} ctx - Render context with {w,h,dpr,ctx2d}.
   * @returns {void}
   */
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

  // ----- API -----
  /**
   * Initialize canvas defaults and geometry.
   * @param {*} ctx - Render context.
   * @returns {void}
   */
  function init(ctx) {
    // Always render in CSS px at current DPR
    const g = ctx.ctx2d;
    g.setTransform(ctx.dpr, 0, 0, ctx.dpr, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.shadowBlur = 0;
    g.shadowColor = 'rgba(0,0,0,0)';

    rebuild(ctx);
    lastT = nowMs();
  }

  /**
   * Handle DPR/viewport changes (rebuild geometry/buffers).
   * @param {*} ctx - Render context.
   * @returns {void}
   */
  function resize(ctx) {
    // Rebuild geometry/buffers on any size/DPR change (no recursion)
    rebuild(ctx);
  }

  /**
   *
   */
  function start() {
    running = true;
    lastT = nowMs();
    window.addEventListener('keydown', onKey, { passive: true });
  }

  /**
   *
   */
  function stop() {
    running = false;
    window.removeEventListener('keydown', onKey);
  }

  /**
   * Clear heat field and canvas.
   * @param {*} ctx - Render context.
   * @returns {void}
   */
  function clear(ctx) {
    if (heat) heat.fill(0);
    const g = ctx.ctx2d;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, ctx.w, ctx.h);
    g.restore();
  }

  // ----- Simulation -----
  /**
   *
   */
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

  // ----- Frame -----
  /**
   * Draw one frame and advance simulation on fixed timestep.
   * @param {*} ctx - Render context with {ctx2d,dpr,w,h,elapsed,paused}.
   * @returns {void}
   */
  function frame(ctx) {
    const g = ctx.ctx2d;
    const W = ctx.w / ctx.dpr;
    const H = ctx.h / ctx.dpr;

    // Background
    g.fillStyle = BG;
    g.fillRect(0, 0, W, H);

    // Fixed-step sim
    const now = nowMs();
    let dt = now - lastT;
    if (dt > 250) dt = 250; // cap to avoid large jumps
    lastT = now;
    acc += dt;
    while (running && !ctx.paused && acc >= dtTarget) {
      stepSim();
      acc -= dtTarget;
    }

    // Draw cells as ASCII
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

    // HUD overlay
    if (now < hudUntil) {
      g.globalAlpha = 0.9;
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.font = `12px ui-monospace, SFMono-Regular, Menlo, monospace`;
      const pad = 6,
        text = hudText,
        tw = g.measureText(text).width;
      g.fillRect(8, 8, tw + pad * 2, 20);
      g.globalAlpha = 1;
      g.fillStyle = '#fff';
      g.fillText(text, 8 + pad, 10);
    }
  }

  return { init, resize, start, stop, frame, clear };
})();
