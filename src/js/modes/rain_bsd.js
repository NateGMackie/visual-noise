// src/js/modes/rain_bsd.js
export const rain_bsd = (() => {
  let cols = 0, rows = 0, grid = [], fontSize = 16;
  let running = false;

  const readVar = (name, fallback) =>
    getComputedStyle(document.documentElement).getPropertyValue(name)?.trim() || fallback;

  function init(ctx){ compute(ctx); }
  function resize(ctx){ compute(ctx); }
  function start(){ running = true; }
  function stop(){ running = false; }
  function clear(ctx){ grid = []; ctx.ctx2d.clearRect(0, 0, ctx.w, ctx.h); }

  function compute(ctx){
    fontSize = Math.max(12, Math.floor(0.018 * Math.min(ctx.w, ctx.h)));
    cols = Math.floor((ctx.w / ctx.dpr) / fontSize);
    rows = Math.floor((ctx.h / ctx.dpr) / Math.round(fontSize * 1.2));
    grid = new Array(cols).fill(0).map(() => Math.floor(Math.random() * -rows));
  }

  function frame(ctx){
    const g = ctx.ctx2d;
    const W = ctx.w / ctx.dpr;
    const H = ctx.h / ctx.dpr;

    g.fillStyle = 'rgba(0,0,0,0.10)';
    g.fillRect(0, 0, W, H);

    g.font = `${fontSize}px ui-monospace, monospace`;
    g.textBaseline = 'top';
    g.fillStyle = readVar('--fg', '#03ffaf');

    const glyphs = ['|','/','\\','-','.','`','*'];
    const lh = Math.round(fontSize * 1.2);

    for (let c = 0; c < cols; c++){
      const x = c * fontSize;
      const y = grid[c] * lh;
      const ch = glyphs[(Math.random() * glyphs.length) | 0];
      g.fillText(ch, x, y);

      if (!running || ctx.paused) continue;

      if (y > H && Math.random() > 0.98) grid[c] = Math.floor(-rows * Math.random());
      else grid[c] += 1;
    }
  }

  return { init, resize, start, stop, frame, clear };
})();
