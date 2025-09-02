// src/js/modes/fire_ascii.js
// Flavor: "fire/ascii-simple" — coarse grid + ASCII ramp
// Publishes a speed model {min,max,step,default,map(idx)->{emberChance,coolBase}}

export const fireAscii = (() => {
  // Classic ASCII shade ramp
  const SHADES = [' ', '.', ':', '-', '~', '*', '+', '=', '%', '#', '@'];

  // --- Speed model ---
  // idx ∈ [1..12]; 6 is a nice default. Higher = hotter (more fuel, less cooling).
  const speedModel = {
    min: 1, max: 12, step: 1, default: 6,
    map(idx = 6) {
      idx = Math.max(this.min, Math.min(this.max, idx));
      // Hotter baseline so flames climb at low/med speeds
      const emberChance = 0.35 + (idx - 1) * (0.45 / (this.max - 1)); // ~0.35 → ~0.80
      const coolBase    = 3.4  - (idx - 1) * (1.2  / (this.max - 1)); // ~3.4  → ~2.2
      return { emberChance, coolBase };
    }
  };

  // CSS var helper
  const readVar = (name, fallback) =>
    getComputedStyle(document.documentElement).getPropertyValue(name)?.trim() || fallback;

  // Coarse field
  let Wc = 0, Hc = 0;
  let heat = null;             // Uint8Array size Wc*Hc
  let running = false;

  // Cache last-used params from speed
  let emberChance = 0.5;
  let coolBase = 3.0;

  // DPR-safe reset
  function resetCanvasState(ctx) {
    const g = ctx.ctx2d;
    g.setTransform(ctx.dpr, 0, 0, ctx.dpr, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.shadowBlur = 0;
    g.shadowColor = 'rgba(0,0,0,0)';
  }

  function init(ctx) { resetCanvasState(ctx); resize(ctx); }
  function start() { running = true; }
  function stop()  { running = false; }
  function clear(ctx){ if (heat) heat.fill(0); ctx.ctx2d.clearRect(0,0,ctx.w,ctx.h); }

  function resize(ctx){
  // Recompute coarse grid & ASCII ramp bounds from scratch.
  init(ctx);
}


  function applySpeed(ctx) {
    // Accept several shapes for ctx.speed:
    // - number (the index itself)
    // - { index } or { idx } or { value }
    let idx = 6;
    const s = ctx.speed;
    if (typeof s === 'number') idx = s;
    else if (s && typeof s === 'object') idx = s.index ?? s.idx ?? s.value ?? 6;

    const p = speedModel.map(idx);
    emberChance = p.emberChance;
    coolBase    = p.coolBase;
  }

  function frame(ctx){
    applySpeed(ctx);

    const g = ctx.ctx2d;
    const W = ctx.w / ctx.dpr;
    const H = ctx.h / ctx.dpr;

    // --- Simulation ---
    if (running && !ctx.paused){
      // 1) Seed bottom row with “fuel”
      for (let x = 0; x < Wc; x++){
        heat[(Hc - 1) * Wc + x] = Math.random() < emberChance ? 255 : 0;
      }

      // 2) Diffuse upward with slight lateral jitter + cooling + occasional 2-row hop
      for (let y = 0; y < Hc - 1; y++){
        // more lift near bottom; less near top
        const liftHere = 0.30 + 0.20 * (1 - (y / (Hc - 1))); // 0.50 → 0.30
        for (let x = 0; x < Wc; x++){
          const rx = (x + ((Math.random() * 3 | 0) - 1) + Wc) % Wc;
          const hop = (Math.random() < liftHere && y + 2 < Hc) ? 2 : 1; // occasional y+2
          const below = heat[(y + hop) * Wc + rx];

          // slightly reduced cooling + tiny randomness; taper ~5% up the column
          const coolJitter = (Math.random() * 2) | 0;                  // 0..1
          const coolTaper  = 0.95 - 0.05 * (y / (Hc - 1));             // 0.95 → 0.90
          const cool = Math.max(1, (coolBase - 0.4 + coolJitter) * coolTaper);

          const idx = y * Wc + x;
          heat[idx] = below > cool ? (below - cool) : 0;
        }
      }
    }

    // --- Render ---
    g.fillStyle = readVar('--bg', '#000');
    g.fillRect(0, 0, W, H);

    const cellW = Math.ceil(W / Wc);
    const cellH = Math.ceil(H / Hc);

    g.font = `${Math.max(10, cellH)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    g.textBaseline = 'top';
    g.fillStyle = readVar('--fg', '#ffa500');

    for (let y = 0; y < Hc; y++){
      const yPix = y * cellH;
      for (let x = 0; x < Wc; x++){
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
