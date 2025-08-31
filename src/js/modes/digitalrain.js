// src/js/modes/digitalrain.js
export const digitalrain = (() => {
  const GLYPHS = Array.from({ length: 96 }, (_, i) => String.fromCharCode(0x30A0 + (i % 96)));

  // state
  let cols = 0, drops = [], fontSize = 16;
  let running = false, tickAcc = 0, tickMs = 75;

  const readVar = (name, fallback) =>
    getComputedStyle(document.documentElement).getPropertyValue(name)?.trim() || fallback;

  function calc(ctx){
    fontSize = Math.max(12, Math.floor(0.02 * Math.min(ctx.w, ctx.h)));
    cols = Math.floor((ctx.w / ctx.dpr) / fontSize);
    drops = new Array(cols).fill(0).map(() => Math.floor(Math.random() * -40));
  }

  function init(ctx){ 
    // At the very top of each mode's init(ctx)
const g = ctx.ctx2d;
g.setTransform(ctx.dpr, 0, 0, ctx.dpr, 0, 0); // keep your DPR scale
g.globalAlpha = 1;
g.globalCompositeOperation = 'source-over';
g.shadowBlur = 0;
g.shadowColor = 'rgba(0,0,0,0)';

    calc(ctx); }
  function resize(ctx){ calc(ctx); }
  function start(){ running = true; }
  function stop(){ running = false; }
  function clear(ctx){
    drops = [];
    ctx.ctx2d.clearRect(0, 0, ctx.w, ctx.h);
  }

  function frame(ctx){
    const g = ctx.ctx2d;
    tickAcc += ctx.elapsed;
    const W = ctx.w / ctx.dpr;
    const H = ctx.h / ctx.dpr;

    // trail fade
    g.fillStyle = 'rgba(0,0,0,0.08)';
    g.fillRect(0, 0, W, H);

    // draw rain
    g.font = `${fontSize}px ui-monospace, monospace`;
    g.textBaseline = 'top';
    g.fillStyle = readVar('--fg', '#0f0');

    // only advance when running (honors pause)
    const doAdvance = running && !ctx.paused && tickAcc >= tickMs;
     if (doAdvance) tickAcc -= tickMs;
     for (let i = 0; i < cols; i++){
      const x = i * fontSize;
      const y = drops[i] * fontSize;
      const ch = GLYPHS[(Math.random() * GLYPHS.length) | 0];
      g.fillText(ch, x, y);

      if (!doAdvance) continue;

      // reset with random drip length
      if (y > H && Math.random() > 0.975) {
        drops[i] = Math.floor(-20 * Math.random());
      } else {
        drops[i] += Math.max(0.25, ctx.speed); 
      }
    }
  }

  return { init, resize, start, stop, frame, clear };
})();
