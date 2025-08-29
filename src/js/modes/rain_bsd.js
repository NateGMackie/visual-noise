// src/js/modes/rain_bsd.js
export const rain_bsd = (() => {
  // Minimal BSD/Unix-y “rain” using ASCII glyphs
  const GLYPHS = ['|','/','\\','-','.','`','*',':',';'];
  const readVar = (name, fallback) =>
    getComputedStyle(document.documentElement).getPropertyValue(name)?.trim() || fallback;

  // state
  let cols = 0, rows = 0, fontSize = 16, lineH = 18;
  let drops = [];
  let running = false;

  function compute(ctx){
    fontSize = Math.max(12, Math.floor(0.018 * Math.min(ctx.w, ctx.h)));
    lineH = Math.round(fontSize * 1.2);
    cols = Math.max(8, Math.floor((ctx.w / ctx.dpr) / fontSize));
    rows = Math.max(6, Math.floor((ctx.h / ctx.dpr) / lineH));
    drops = new Array(cols).fill(0).map(() => Math.floor(-rows * Math.random()));
  }

  function init(ctx){ compute(ctx); }
  function resize(ctx){ compute(ctx); }
  function start(){ running = true; }
  function stop(){ running = false; }
  function clear(ctx){ drops = []; ctx.ctx2d.clearRect(0,0,ctx.w,ctx.h); }

  function frame(ctx){
    const g = ctx.ctx2d;
    const W = ctx.w / ctx.dpr;
    const H = ctx.h / ctx.dpr;

    // trail fade
    g.fillStyle = 'rgba(0,0,0,0.10)';
    g.fillRect(0, 0, W, H);

    // draw
    g.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    g.textBaseline = 'top';
    g.fillStyle = readVar('--fg', '#03ffaf');

    for (let c = 0; c < cols; c++){
      const x = c * fontSize;
      const y = drops[c] * lineH;
      const ch = GLYPHS[(Math.random() * GLYPHS.length) | 0];
      g.fillText(ch, x, y);

      if (!running || ctx.paused) continue;

      if (y > H && Math.random() > 0.98) {
        drops[c] = Math.floor(-rows * Math.random());
      } else {
        drops[c] += Math.max(0.25, ctx.speed);
      }
    }
  }

  return { init, resize, start, stop, frame, clear };
})();
