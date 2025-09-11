/* eslint-env browser */
/** @typedef {unknown} CanvasRenderingContext2D */
/** @typedef {unknown} KeyboardEvent */
/**
 * @typedef {object} RenderCtx
 * @property {CanvasRenderingContext2D} ctx2d - 2D drawing context (DPR-scaled)
 * @property {number} w - Canvas width in device pixels
 * @property {number} h - Canvas height in device pixels
 * @property {number} dpr - Device pixel ratio
 * @property {number} [elapsed] - Time since last frame (ms)
 * @property {boolean} [paused] - Whether animation is paused
 * @property {number} [speed] - Global speed multiplier (~0.4–1.6)
 */

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

  // ---------- Height Intensity (staged 1..10) ----------
  // 1/10 ≈ 10% screen, 5/10 ≈ ~50% screen, 10/10 ≈ full screen feel.
  // We apply a cooling band near a per-column, wavy cutoff for natural tips.
  const HEIGHT_FRAC = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.65, 0.8, 0.9, 0.95, 1.0]; // index 0 unused
  const HEIGHT_STEPS_TOTAL = 10;
  let heightIndex = 5; // default ~half screen
  const clampStep = (i) => Math.max(1, Math.min(10, Math.round(i)));
  const emitHeightStep = () => {
    const bus = (window.app && window.app.events) || window.events;
    bus?.emit?.('fire.height.step', { index: heightIndex, total: HEIGHT_STEPS_TOTAL });
  };

  // --- coarse grid state ---
  let Wc = 0,
    Hc = 0; // coarse grid width/height (in cells)
  /** @type {Uint8Array|null} */
  let heat = null; // heat per cell 0..255
  let running = false;

  // cached params (from speed model / global speed)
  let emberChance = 0.5;
  let coolBase = 3.0;

  // Per-column phase for a wavy top edge (updated each frame)
  /** @type {Float32Array|null} */
  let ceilPhase = null;

  // one-time guards
  let wiredBus = false;
  let keysBound = false;

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

    // init per-column wave phases
    ceilPhase = new Float32Array(Wc);
    for (let x = 0; x < Wc; x++) ceilPhase[x] = Math.random() * Math.PI * 2;
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

    // Single authoritative bus wiring (optional external control)
    if (!wiredBus) {
      const bus = (window.app && window.app.events) || window.events;
      if (bus?.on) {
        // Accept {index} to set the height stage directly
        bus.on('fire.height.idx', (payload) => {
          const idx = payload && typeof payload === 'object' ? payload.index : payload;
          if (!Number.isFinite(idx)) return;
          heightIndex = clampStep(idx);
          emitHeightStep();
        });
      }
      wiredBus = true;
    }

    // Show baseline step on entry
    emitHeightStep();
  }

  /**
   * Handle DPR/viewport changes (rebuild grid).
   * @param {RenderCtx} ctx - Render context with current size and DPR.
   * @returns {void}
   */
  function resize(ctx) {
    rebuild(ctx);
  }

  /** Start simulation. @returns {void} */
  function start() {
    running = true;
    if (!keysBound) {
      window.addEventListener('keydown', onKey, { passive: false });
      keysBound = true;
    }
  }
  /** Stop simulation.  @returns {void} */
  function stop() {
    running = false;
    if (keysBound) {
      window.removeEventListener('keydown', onKey);
      keysBound = false;
    }
  }

  /**
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

  /**
   * Update ember/cooling from the global speed multiplier (≈0.4–1.6).
   * Height is applied later via HEIGHT_FRAC (staged).
   * @param {RenderCtx} ctx - Render context containing the current speed multiplier.
   * @returns {void}
   */
  function applySpeed(ctx) {
    const m = Math.max(0.4, Math.min(1.6, Number(ctx?.speed) || 1));
    const t = (m - 0.4) / (1.6 - 0.4); // 0..1

    // Base ranges (feel similar to your previous mapping)
    const emberMin = 0.25,
      emberMax = 0.6;
    const coolMin = 0.7,
      coolMax = 1.2;

    emberChance = emberMin + t * (emberMax - emberMin);
    coolBase = coolMin + t * (coolMax - coolMin);
  }

  /**
   * Shift+Up/Down → heightIndex (1..10). Emits fire.height.step for HUD.
   * @param {KeyboardEvent} e - Keyboard event from window; only handles Shift+Arrow keys.
   * @returns {void}
   */
  function onKey(e) {
    if (!e.shiftKey) return;
    let handled = false;
    switch (e.key) {
      case 'ArrowUp': {
        if (heightIndex < 10) {
          heightIndex += 1;
          emitHeightStep();
        }
        handled = true;
        break;
      }
      case 'ArrowDown': {
        if (heightIndex > 1) {
          heightIndex -= 1;
          emitHeightStep();
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

  /**
   * Draw one frame and advance simulation when running.
   * @param {*} ctx - Render context {ctx2d,dpr,w,h,elapsed,paused,speed}.
   * @returns {void}
   */
  function frame(ctx) {
    // Ensure grid exists even if init/resize didn’t run yet.
    if (!Wc || !Hc || !heat) rebuild(ctx);
    applySpeed(ctx);

    // --- Height shaping (natural tips) ---
    // heightFrac in [0.10..1.00]; higher → taller flames.
    const heightFrac = HEIGHT_FRAC[heightIndex];

    // Global cutoff row and smoothing band
    const cutoffRow = Math.floor((1 - heightFrac) * (Hc - 1));
    const bandRows = Math.max(2, Math.floor(0.12 * Hc)); // smoothing band thickness
    const bandStrength = (1 - heightFrac) * 10; // extra cooling strength

    // Drift the per-column phase so the top wiggles
    if (ceilPhase && ceilPhase.length === Wc) {
      for (let x = 0; x < Wc; x++) {
        ceilPhase[x] += 0.03 + 0.02 * Math.random(); // tiny, jittery
      }
    }

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
        const baseLift = 0.3 + 0.2 * (1 - y / (Hc - 1)); // 0.50 → 0.30
        const hopBoost = 0.06 * (heightFrac - 0.5); // subtle extra lift at high stages
        const liftHere = Math.max(0.2, Math.min(0.7, baseLift + hopBoost));

        for (let x = 0; x < Wc; x++) {
          const rx = (x + (((Math.random() * 3) | 0) - 1) + Wc) % Wc;
          const hop = Math.random() < liftHere && y + 2 < Hc ? 2 : 1;
          const below = heat[(y + hop) * Wc + rx];

          const coolJitter = (Math.random() * 2) | 0; // 0..1
          const coolTaper = 0.95 - 0.05 * (y / (Hc - 1)); // 0.95 → 0.90

          // Per-column local cutoff: gently undulate the top band
          const localCutoff = Math.max(
            0,
            Math.min(
              Hc - 1,
              cutoffRow + Math.floor(bandRows * 0.6 * Math.sin(ceilPhase ? ceilPhase[x] : 0))
            )
          );

          // Smooth 0→1 ramp ABOVE the local cutoff (toward the top)
          const tLocal = (localCutoff - y) / bandRows;
          const rampLocal = tLocal <= 0 ? 0 : tLocal >= 1 ? 1 : tLocal;

          // base cooling + local extra band cooling
          const coolEff = Math.max(
            1,
            (coolBase - 0.4 + coolJitter) * coolTaper + bandStrength * rampLocal
          );

          const i = y * Wc + x;
          let h = below > coolEff ? below - coolEff : 0;

          // Soft fade near/above the band (no “flat wall”)
          h = (h * (1 - 0.65 * rampLocal)) | 0;

          heat[i] = h;
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
