// src/js/modes/drizzle.js
/* eslint-env browser */

/**
 * Program: Drizzle
 * Genre: Rain
 * Style: light ASCII drizzle
 * Purpose: Sparse falling glyphs with a soft trail fade.
 */
export const drizzle = (() => {
  const GLYPHS = ['|', '/', '\\', '-', '.', '`', '*', ':', ';'];
  const readVar = (name, fallback) =>
    window.getComputedStyle(document.documentElement).getPropertyValue(name)?.trim() || fallback;

  // Helps labelsForMode() if present
  const info = { family: 'rain', flavor: 'drizzle' };

  // state
  let cols = 0,
    rows = 0,
    fontSize = 16,
    lineH = 18;
  let drops = [],
    tickAcc = 0,
    tickMs = 80;
  let running = false;

  /**
   * Compute grid/metrics and seed drops.
   * @param {*} ctx - Render context with {w,h,dpr,ctx2d}.
   * @returns {void}
   */
  function compute(ctx) {
    fontSize = Math.max(12, Math.floor(0.018 * Math.min(ctx.w, ctx.h)));
    lineH = Math.round(fontSize * 1.2);
    cols = Math.max(8, Math.floor(ctx.w / ctx.dpr / fontSize));
    rows = Math.max(6, Math.floor(ctx.h / ctx.dpr / lineH));
    drops = new Array(cols).fill(0).map(() => Math.floor(-rows * Math.random()));
  }

  /**
   * Initialize DPR-safe canvas defaults and compute layout.
   * @param {*} ctx - Render context.
   * @returns {void}
   */
  function init(ctx) {
    const g = ctx.ctx2d;
    g.setTransform(ctx.dpr, 0, 0, ctx.dpr, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.shadowBlur = 0;
    g.shadowColor = 'rgba(0,0,0,0)';
    compute(ctx);
  }

  /**
   * Recompute on geometry/DPR change.
   * @param {*} ctx - Render context.
   * @returns {void}
   */
  function resize(ctx) {
    init(ctx);
  }

  /** Start animation. @returns {void} */
  function start() {
    running = true;
  }
  /** Stop animation.  @returns {void} */
  function stop() {
    running = false;
  }

  /**
   * Clear canvas & reset drops.
   * @param {*} ctx - Render context.
   * @returns {void}
   */
  function clear(ctx) {
    drops = [];
    ctx.ctx2d.clearRect(0, 0, ctx.w, ctx.h);
  }

  /**
   * Draw one frame; advance when running and not paused.
   * @param {*} ctx - {ctx2d,dpr,w,h,elapsed,paused,speed}
   * @returns {void}
   */
  function frame(ctx) {
    const g = ctx.ctx2d;
    tickAcc += ctx.elapsed;
    const W = ctx.w / ctx.dpr;
    const H = ctx.h / ctx.dpr;

    // trail fade
    g.fillStyle = 'rgba(0,0,0,0.10)';
    g.fillRect(0, 0, W, H);

    // draw
    g.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    g.textBaseline = 'top';
    g.fillStyle = readVar('--fg', '#03ffaf');

    const doAdvance = running && !ctx.paused && tickAcc >= tickMs;
    if (doAdvance) tickAcc -= tickMs;

    for (let c = 0; c < cols; c++) {
      const x = c * fontSize;
      const y = drops[c] * lineH;
      const ch = GLYPHS[(Math.random() * GLYPHS.length) | 0];
      g.fillText(ch, x, y);

      if (!doAdvance) continue;

      if (y > H && Math.random() > 0.98) {
        drops[c] = Math.floor(-rows * Math.random());
      } else {
        drops[c] += Math.max(0.25, ctx.speed || 1);
      }
    }
  }

  return { info, init, resize, start, stop, frame, clear };
})();
