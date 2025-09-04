// src/js/modes/digitalrain.js
/* eslint-env browser */

/**
 * Program: DigitalRain
 * Genre: Rain
 * Style: Katakana streams with soft trail
 * Purpose: Vertical glyph streams that advance on a fixed tick.
 */
export const digitalrain = (() => {
  const GLYPHS = Array.from({ length: 96 }, (_, i) => String.fromCharCode(0x30a0 + (i % 96)));

  // state
  let cols = 0,
    drops = [],
    fontSize = 16;
  let running = false,
    tickAcc = 0,
    tickMs = 75;

  const readVar = (name, fallback) =>
    window.getComputedStyle(document.documentElement).getPropertyValue(name)?.trim() || fallback;

  /**
   * Compute column count and seed drops.
   * @param {*} ctx - Render context with {w,h,dpr}.
   * @returns {void}
   */
  function calc(ctx) {
    fontSize = Math.max(12, Math.floor(0.02 * Math.min(ctx.w, ctx.h)));
    cols = Math.floor(ctx.w / ctx.dpr / fontSize);
    drops = new Array(cols).fill(0).map(() => Math.floor(Math.random() * -40));
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
    calc(ctx);
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
    g.fillStyle = 'rgba(0,0,0,0.08)';
    g.fillRect(0, 0, W, H);

    // draw streams
    g.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    g.textBaseline = 'top';
    g.fillStyle = readVar('--fg', '#0f0');

    const doAdvance = running && !ctx.paused && tickAcc >= tickMs;
    if (doAdvance) tickAcc -= tickMs;

    for (let i = 0; i < cols; i++) {
      const x = i * fontSize;
      const y = drops[i] * fontSize;
      const ch = GLYPHS[(Math.random() * GLYPHS.length) | 0];
      g.fillText(ch, x, y);

      if (!doAdvance) continue;

      if (y > H && Math.random() > 0.975) {
        drops[i] = Math.floor(-20 * Math.random());
      } else {
        drops[i] += Math.max(0.25, ctx.speed || 1);
      }
    }
  }

  return { init, resize, start, stop, frame, clear };
})();
