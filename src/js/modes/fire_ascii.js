// src/js/modes/fire_ascii.js
/* eslint-env browser */

/**
 * Program: FireAscii
 * Genre: Fire
 * Style: ASCII flame
 * Purpose: Coarse grid heat simulation rendered with ASCII ramp characters.
 *
 * Exports:
 *   - init(ctx), resize(ctx), start(), stop(), clear(ctx), frame(ctx)
 *   - info (for HUD), speedModel (for UI ranges/mapping)
 */
export const fireAscii = (() => {
  // Classic ASCII shade ramp (cool → hot)
  const SHADES = [' ', '.', ':', '-', '~', '*', '+', '=', '%', '#', '@'];

  // Coarse cell targets (CSS px per cell)
  const SCALE_X = 7; // ~chars per 7px horizontally
  const SCALE_Y = 11; // ~chars per 11px vertically

  // --- Speed model (idx ∈ [1..12]; higher = hotter) ---
  const speedModel = {
    min: 1,
    max: 12,
    step: 1,
    default: 6,
    /**
     * Map UI speed index (1–12) to simulation parameters.
     * @param {number} [idx] - Speed index; higher = hotter.
     * @returns {{emberChance:number, coolBase:number}} - New-ember probability and base cooling per step.
     */
    map(idx = 6) {
      idx = Math.max(this.min, Math.min(this.max, idx));
      const emberChance = 0.35 + (idx - 1) * (0.45 / (this.max - 1)); // ~0.35 → ~0.80
      const coolBase = 3.4 - (idx - 1) * (1.2 / (this.max - 1)); // ~3.4  → ~2.2
      return { emberChance, coolBase };
    },
  };

  // CSS var helper
  const readVar = (name, fallback) =>
    window.getComputedStyle(document.documentElement).getPropertyValue(name)?.trim() || fallback;

  // --- coarse grid state ---
  let Wc = 0,
    Hc = 0; // coarse grid width/height (in cells)
  /** @type {Uint8Array|null} */
  let heat = null; // heat per cell 0..255
  let running = false;

  // cached params (from speed model)
  let emberChance = 0.5;
  let coolBase = 3.0;

  /**
   * Rebuild coarse grid & buffers based on canvas size.
   * @param {*} ctx - render context with {w,h,dpr}.
   * @returns {void}
   */
  function rebuild(ctx) {
    const cssW = Math.max(1, ctx.w / ctx.dpr);
    const cssH = Math.max(1, ctx.h / ctx.dpr);
    Wc = Math.max(20, Math.floor(cssW / SCALE_X));
    Hc = Math.max(12, Math.floor(cssH / SCALE_Y));
    heat = new Uint8Array(Wc * Hc);
  }

  /**
   * Reset DPR-safe canvas defaults (no drawing).
   * @param {*} ctx - Render context with {ctx2d,dpr}.
   * @returns {void}
   */
  function resetCanvasState(ctx) {
    const g = ctx.ctx2d;
    g.setTransform(ctx.dpr, 0, 0, ctx.dpr, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.shadowBlur = 0;
    g.shadowColor = 'rgba(0,0,0,0)';
  }

  /**
   * Initialize simulation and canvas defaults.
   * @param {*} ctx - Render context with {ctx2d,dpr,w,h}.
   * @returns {void}
   */
  function init(ctx) {
    resetCanvasState(ctx);
    rebuild(ctx);
  }

  /**
   * Handle DPR/viewport changes (rebuild grid).
   * Handle DPR/viewport changes (rebuild grid).
   * @param {*} ctx - Render context with {ctx2d,dpr,w,h}.
   * @returns {void}
   */
  function resize(ctx) {
    rebuild(ctx);
  }

  /** Start simulation. @returns {void} */
  function start() {
    running = true;
  }
  /** Stop simulation.  @returns {void} */
  function stop() {
    running = false;
  }

  /**
   * Clear heat field and canvas.
   * Clear heat field and canvas.
   * @param {*} ctx - Render context with {ctx2d,dpr,w,h}.
   * @returns {void}
   */
  function clear(ctx) {
    if (heat) heat.fill(0);
    const g = ctx.ctx2d;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, ctx.w, ctx.h); // device pixels
    g.restore();
  }

  function applySpeed(ctx) {
  // Global multiplier 0.4..1.6; normalize to 0..1
  const m = Math.max(0.4, Math.min(1.6, Number(ctx?.speed) || 1));
  const t = (m - 0.4) / (1.6 - 0.4); // 0..1

  // Rebuild emberChance/cooling from multiplier so 1.0× is your "just right"
  // These ranges match the feel of your old index mapping:
  // emberChance: 0.25 → 0.60 across the range
  // coolBase   : 0.70 → 1.20 across the range
  const emberMin = 0.25, emberMax = 0.60;
  const coolMin  = 0.70, coolMax  = 1.20;

  emberChance = emberMin + t * (emberMax - emberMin);
  coolBase    = coolMin  + t * (coolMax  - coolMin);
}


  /**
   * Draw one frame and advance simulation when running.
   * @param {*} ctx - Render context {ctx2d,dpr,w,h,elapsed,paused,speed}.
   * @returns {void}
   */
  function frame(ctx) {
    // Ensure grid exists even if init/resize didn’t run yet.
    if (!Wc || !Hc || !heat) rebuild(ctx);
    applySpeed(ctx);

    const g = ctx.ctx2d;
    const W = ctx.w / ctx.dpr;
    const H = ctx.h / ctx.dpr;

    // --- Simulation ---
    if (running && !ctx.paused) {
      // 1) Seed bottom row with “fuel”
      for (let x = 0; x < Wc; x++) {
        heat[(Hc - 1) * Wc + x] = Math.random() < emberChance ? 255 : 0;
      }

      // 2) Diffuse upward with lateral jitter, cooling, and occasional 2-row hop
      for (let y = 0; y < Hc - 1; y++) {
        const liftHere = 0.3 + 0.2 * (1 - y / (Hc - 1)); // 0.50 → 0.30
        for (let x = 0; x < Wc; x++) {
          const rx = (x + (((Math.random() * 3) | 0) - 1) + Wc) % Wc;
          const hop = Math.random() < liftHere && y + 2 < Hc ? 2 : 1;
          const below = heat[(y + hop) * Wc + rx];

          const coolJitter = (Math.random() * 2) | 0; // 0..1
          const coolTaper = 0.95 - 0.05 * (y / (Hc - 1)); // 0.95 → 0.90
          const cool = Math.max(1, (coolBase - 0.4 + coolJitter) * coolTaper);

          const i = y * Wc + x;
          heat[i] = below > cool ? below - cool : 0;
        }
      }
    }

    // --- Render ---
    g.fillStyle = readVar('--bg', '#000');
    g.fillRect(0, 0, W, H);

    const cellW = Math.max(1, Math.ceil(W / Wc));
    const cellH = Math.max(1, Math.ceil(H / Hc));

    g.font = `${Math.max(10, cellH)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    g.textBaseline = 'top';
    g.fillStyle = readVar('--fg', '#ffa500');

    for (let y = 0; y < Hc; y++) {
      const yPix = y * cellH;
      for (let x = 0; x < Wc; x++) {
        const v = heat[y * Wc + x];
        if (!v) continue;
        const ch = SHADES[Math.min(SHADES.length - 1, (v / 24) | 0)];
        g.fillText(ch, x * cellW, yPix);
      }
    }
  }

  // metadata for HUD/flavor cycling
  const info = { family: 'fire', flavor: 'ASCII' };

  return { init, resize, start, stop, clear, frame, info, speedModel };
})();
