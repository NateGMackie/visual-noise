// src/js/modes/fire.js
export const fire = (() => {
  // Coarse heat diffusion + ASCII shade ramp
  const SHADES = [' ', '.', ':', '-', '~', '*', '+', '=', '%', '#', '@'];
  const readVar = (name, fallback) =>
    getComputedStyle(document.documentElement).getPropertyValue(name)?.trim() || fallback;

  let Wc = 0, Hc = 0;      // coarse grid size (columns, rows)
  let heat = null;         // Uint8Array or JS array of length Wc*Hc
  let running = false;

  function init(ctx){ resize(ctx); }
  function start(){ running = true; }
  function stop(){ running = false; }
  function clear(ctx){ if (heat) heat.fill(0); ctx.ctx2d.clearRect(0,0,ctx.w,ctx.h); }

  function resize(ctx){
    // Pick a coarse resolution that scales with canvas
    const W = Math.floor((ctx.w / ctx.dpr) / 6);
    const H = Math.floor((ctx.h / ctx.dpr) / 10);
    Wc = Math.max(20, W);
    Hc = Math.max(12, H);
    heat = new Uint8Array(Wc * Hc);
  }

  function frame(ctx){
    const g = ctx.ctx2d;
    const W = ctx.w / ctx.dpr;
    const H = ctx.h / ctx.dpr;

    // seed bottom row with random heat while running
    if (running && !ctx.paused){
      for (let x = 0; x < Wc; x++){
        // occasional embers
        heat[(Hc - 1) * Wc + x] = Math.random() > 0.7 ? 255 : 0;
      }
      // diffuse upward with a little lateral randomness
      for (let y = 0; y < Hc - 1; y++){
        for (let x = 0; x < Wc; x++){
          const rx = (x + ((Math.random() * 3 | 0) - 1) + Wc) % Wc;
          const below = heat[(y + 1) * Wc + rx];
          const cool = 2 + (Math.random() * 4 | 0);
          const idx = y * Wc + x;
          const v = below > cool ? (below - cool) : 0;
          heat[idx] = v;
        }
      }
    }

    // clear background
    g.fillStyle = readVar('--bg', '#000');
    g.fillRect(0, 0, W, H);

    // draw ASCII fire
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

  return { init, resize, start, stop, frame, clear };
})();
