// src/js/modes/matrix.js
/* eslint-env browser */

/**
 * Program: Matrix
 * Genre: Rain
 * Style: Matrix
 * Vibe: Neon green with glow
 *
 * Purpose:
 *   Katakana/ASCII streams with glowing heads and fading trails.
 *
 * Exports:
 *   - init(ctx), resize(ctx), start(), stop(), frame(ctx), clear(ctx)
 */

export const matrix = (() => {
  // Mixed charset (Matrix-y): katakana + A–Z + digits + a few symbols
  const KATAKANA =
    'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン';
  const ASCII = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const SYMBOLS = '!@#$%^&*<>+-/=';
  const pickCharset = () => (Math.random() < 0.7 ? KATAKANA + ASCII : ASCII + SYMBOLS);

  // Visuals (fixed — no toggles)
  const TRAIL_COLOR = '#00d18f';
  const HEAD_COLOR = '#B1FFE0';
  const GLOW_COLOR = '#03FFAF';

  // State
  let cols = 0,
    rows = 0;
  let cellW = 10,
    cellH = 16,
    fontSize = 14;
  /** @type {Array<{y:number,speed:number,trail:number,charset:string}>} */
  let columns = []; // per-column stream state
  let running = false;

  /**
   * Convert hex color to "r, g, b" string (no alpha).
   * @param {string} hex - Hex color (#rgb or #rrggbb).
   * @returns {string} - "r, g, b".
   */
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const v = parseInt(
      h.length === 3
        ? h
            .split('')
            .map((x) => x + x)
            .join('')
        : h,
      16
    );
    return `${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}`;
  }

  /**
   * Compute grid/cell metrics and (re)seed column streams.
   * @param {*} ctx - Render context with {ctx2d,dpr,w,h}.
   * @returns {void}
   */
  function calc(ctx) {
    // scale font to viewport a bit (keeps density feeling right)
    fontSize = Math.max(12, Math.floor(0.02 * Math.min(ctx.w, ctx.h)));
    const g = ctx.ctx2d;

    // configure font & measure
    g.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    g.textBaseline = 'top';
    cellW = Math.max(8, Math.ceil(g.measureText('M').width));
    cellH = Math.max(fontSize, 16);

    const W = Math.floor(ctx.w / ctx.dpr);
    const H = Math.floor(ctx.h / ctx.dpr);
    cols = Math.ceil(W / cellW);
    rows = Math.ceil(H / cellH);

    // initialize / reinitialize columns
    columns = Array.from({ length: cols }, () => ({
      y: Math.floor(-Math.random() * rows), // start above the top
      speed: 0.5 + Math.random() * 0.5, // 0.5–1.0 cells/frame @ base speed
      trail: 6 + Math.floor(Math.random() * 13), // 6–18
      charset: pickCharset(),
    }));
  }

  /**
   * Initialize drawing defaults and compute initial layout.
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
   * Recompute metrics on DPR/viewport change.
   * @param {*} ctx - Render context.
   * @returns {void}
   */
  function resize(ctx) {
    init(ctx);
  }

  /** Start the animation. @returns {void} */
  function start() {
    running = true;
  }
  /** Stop the animation. @returns {void} */
  function stop() {
    running = false;
  }

  /**
   * Clear canvas and reset column state.
   * @param {*} ctx - Render context.
   * @returns {void}
   */
  function clear(ctx) {
    columns = [];
    ctx.ctx2d.clearRect(0, 0, ctx.w, ctx.h);
  }

  /**
   * Draw a single glyph with head/trail styling.
   * @param {*} g - 2D context.
   * @param {string} ch - Character to draw.
   * @param {number} x - X in pixels.
   * @param {number} y - Y in pixels.
   * @param {{isHead:boolean, alpha?:number}} opts - Head/trail options.
   * @returns {void}
   */
  function drawGlyph(g, ch, x, y, opts) {
    const { isHead } = opts;

    if (isHead) {
      const glow = hexToRgb(GLOW_COLOR);
      const head = hexToRgb(HEAD_COLOR);
      g.shadowColor = `rgba(${glow}, 0.9)`;
      g.shadowBlur = 16;
      g.fillStyle = `rgba(${head}, 1.0)`;
    } else {
      const trail = hexToRgb(TRAIL_COLOR);
      g.shadowBlur = 0;
      // slightly nonlinear fade so mid-trail is visible
      const a = opts.alpha > 0.95 ? 1 : 0.15 + opts.alpha * 0.85;
      g.fillStyle = `rgba(${trail}, ${a})`;
    }

    g.fillText(ch, x, y);
    if (isHead) g.shadowBlur = 0;
  }

  // --- speed mapping (Matrix) ---
  const MIN_MUL = 0.4,
    MAX_MUL = 1.6;
  const clampMul = (m) => Math.max(MIN_MUL, Math.min(MAX_MUL, Number(m) || 1));

  /**
   * Render one frame of Matrix rain: fade the background, advance column heads
   * according to the global speed multiplier, and draw head/trail glyphs.
   * @param {*} ctx - Render context ({ ctx2d, w, h, dpr, elapsed, paused, speed }).
   * @returns {void}
   */
  /**
   * Render one frame of Matrix rain: fade the background, advance column heads
   * according to the global speed multiplier, and draw head/trail glyphs.
   * @param {*} ctx - Render context ({ ctx2d, w, h, dpr, elapsed, paused, speed }).
   * @returns {void}
   */
  function frame(ctx) {
    const g = ctx.ctx2d;
    const W = Math.floor(ctx.w / ctx.dpr);
    const H = Math.floor(ctx.h / ctx.dpr);

    // soft fade for trails
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(0, 0, W, H);

    // ensure font each frame
    g.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    g.textBaseline = 'top';

    // NEW: tuned base at midpoint; clamp global multiplier
    const mult = clampMul(ctx.speed);
    const base = 0.3; // 0.3 cells/frame @ speed=1.0 → matches your current feel

    for (let i = 0; i < cols; i++) {
      const col = columns[i];
      const px = i * cellW;

      if (running && !ctx.paused) {
        col.y += col.speed * base * mult;
      }

      const headGridY = Math.floor(col.y);

      // head
      {
        const set = col.charset || pickCharset();
        const ch = set[(Math.random() * set.length) | 0];
        const y = headGridY * cellH;
        if (y > -cellH && y < H + cellH) {
          drawGlyph(g, ch, px, y, { isHead: true });
        }
      }

      // trail
      const trailLen = col.trail;
      for (let t = 1; t <= trailLen; t++) {
        const gy = headGridY - t;
        const y = gy * cellH;
        if (y < -cellH) break;
        if (y > H) continue;
        const set = col.charset || pickCharset();
        const ch = set[(Math.random() * set.length) | 0];
        const alpha = 1 - t / (trailLen + 1);
        drawGlyph(g, ch, px, y, { isHead: false, alpha });
      }

      // recycle
      if (running && !ctx.paused && headGridY * cellH > H && Math.random() > 0.975) {
        col.y = Math.floor(-Math.random() * rows * 0.5);
        col.speed = 0.5 + Math.random() * 0.5;
        col.trail = 6 + Math.floor(Math.random() * 13);
        col.charset = pickCharset();
      }
    }
  }

  return { init, resize, start, stop, frame, clear };
})();
