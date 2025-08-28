// src/js/modes/fire.js
export const fire = (() => {
  let Wc = 0, Hc = 0, buf = null, running = false;

  const readVar = (name, fallback) =>
    getComputedStyle(document.documentElement).getPropertyValue(name)?.trim() || fallback;

  function init(ctx){
    resize(ctx);
  }
  function resize(ctx){
    const W = Math.floor((ctx.w / ctx.dpr) / 6); // coarse grid
    const H = Math.floor((ctx.h / ctx.dpr) / 10);
    Wc = Math.max(20, W);
    Hc = Math.max(12, H);
    buf = new Array(Wc * Hc).fill(0);
  }
  function start(){ running = true; }
  function stop(){ running = false; }
  function clear(ctx){ buf?.fill(0); ctx.ctx2d.clearRect(0, 0, ctx.w, ctx.h); }

  function frame(ctx){
    const g = ctx.ctx2d;
    const W = ctx.w / ctx.dpr;
    const H = ctx.h / ctx.dpr;

    // seed bottom row with random heat
    if (running && !ctx.paused){
      for (let x = 0; x < Wc; x++){
        buf[(Hc - 1) * Wc + x] = Math.random() > 0.7 ? 255 : 0;
      }
      // diffuse upward
      for (let y = 0; y < Hc - 1; y++){
        for (let x = 0; x < Wc; x++){
          const below = buf[(y + 1) * Wc + (x + ((Math.random() * 3 | 0) - 1 + Wc) % Wc)];
          buf[y * Wc + x] = Math.max(0, below - (2 + (Math.random() * 4 | 0)));
        }
      }
    }

    // draw ASCII fire
    const shades = [' ', '.', ':', '-', '~', '*', '+', '=', '%', '#', '@'];
    const cellW = Math.ceil(W / Wc);
    const cellH = Math.ceil(H / Hc);

    g.fillStyle = readVar('--bg', '#000');
    g.fillRect(0, 0, W, H);
    g.font = `${Math.max(10, cellH)}px ui-monospace, monospace`;
    g.textBaseline = 'top';

    const fg = readVar('--fg', '#ffa500');
    g.fillStyle = fg;

    for (let y = 0; y < Hc; y++){
      for (let x = 0; x < Wc; x++){
        const v = buf[y * Wc + x] | 0;
        if (!v) continue;
        const ch = shades[Math.min(shades.length - 1, (v / 24) | 0)];
        g.fillText(ch, x * cellW, y * cellH);
      }
    }
  }

  return { init, resize, start, stop, frame, clear };
})();
