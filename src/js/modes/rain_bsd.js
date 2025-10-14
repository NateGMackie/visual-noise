/* eslint-env browser */

/**
 * Program: Rain_BSD
 * Genre: Rain
 * Style: BSD (curses-style)
 * Vibe: Uses CSS variables (--bg, --fg, --accent)
 *
 * Purpose:
 *   Classic BSD 'rain' feel with staged splash rings drawn in a terminal-style grid.
 *
 * Exports:
 *   - init(ctx), resize(ctx), start(), stop(), frame(ctx), clear(ctx)
 */

export const rain_bsd = (() => {
  // --- helpers --------------------------------------------------------------
  const readVar = (name, fallback) =>
    window.getComputedStyle(document.documentElement).getPropertyValue(name)?.trim() || fallback;

  /**
   * Inclusive random integer using an injected RNG.
   * @param {()=>number} rng - Function returning a float in [0,1).
   * @param {number} lo - Lower bound (inclusive).
   * @param {number} hi - Upper bound (inclusive).
   * @returns {number} Random integer in [lo, hi].
   */
  function rndInt(rng, lo, hi) {
    return lo + Math.floor(rng() * (hi - lo + 1));
  }

  /**
   * Reset to identity, then apply DPR exactly once. Also restores sane defaults.
   * @param {CanvasRenderingContext2D} g
   * @param {number} dpr
   */
  function reset2D(g, dpr) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.shadowBlur = 0;
    g.shadowColor = 'rgba(0,0,0,0)';
  }

  /**
   * Compute fixed-width character metrics for the grid.
   * @param {CanvasRenderingContext2D} g
   * @param {number} desiredPx - Desired font pixel size.
   * @returns {{charW:number,charH:number,fontPx:number}}
   */
  function metrics(g, desiredPx) {
    const fontPx = Math.max(10, Math.floor(desiredPx || 18));
    g.font = `${fontPx}px ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`;
    g.textBaseline = 'top';
    const w = Math.ceil(g.measureText('M').width);
    const h = Math.ceil(fontPx * 1.25);
    return {
      charW: Math.max(6, w),
      charH: Math.max(fontPx, h),
      fontPx,
    };
  }

  /** Draw a single character at grid coordinates. */
  function drawChar(g, ch, x, y, cw, chH) {
    g.fillText(ch, x * cw, y * chH);
  }
  /** Draw a short string at grid coordinates. */
  function drawStr(g, str, x, y, cw, chH) {
    for (let i = 0; i < str.length; i++) g.fillText(str[i], (x + i) * cw, y * chH);
  }

  // --- state ---------------------------------------------------------------
  /** @type {CanvasRenderingContext2D|null} */
  let g = null;
  /** @type {HTMLCanvasElement|null} */
  let canvas = null;

  let dpr = 1;
  let cols = 80, rows = 24;
  let charW = 10, charH = 18, fontPx = 18;

  // palette (reads from CSS variables)
  let fg = '#2aa3ff', bg = '#000000';

  // Splash entries act like the original's xpos/ypos arrays (max ~5 at once)
  /** @type {{x:number,y:number,stage:number}[]} */
  let entries = [];

  // Timing
  let tickAccMs = 0;
  const stepBaseMs = 90; // ~curses tick
  let running = false;

  // --- palette refresh (fix for vibe changes) ------------------------------
  function updatePaletteFromCss() {
    const newFg = readVar('--fg', readVar('--accent', '#2aa3ff'));
    const newBg = readVar('--bg', '#000');
    if (newFg) fg = newFg;
    if (newBg) bg = newBg;
  }

  // --- lifecycle -----------------------------------------------------------
  /**
   * Initialize canvas metrics, palette, and seed a few splashes.
   * @param {*} ctx - Render context ({ canvas, ctx2d, dpr, w, h, fontSize }).
   */
  function init(ctx) {
    canvas = ctx.canvas || canvas;
    g = ctx.ctx2d;

    // Maintain DPR scale (once here)
    dpr = ctx.dpr || window.devicePixelRatio || 1;
    reset2D(g, dpr);

    // Metrics from font, based on CSS px (W/H = device px / DPR)
    const W = (ctx.w || canvas?.width || 0) / dpr;
    const H = (ctx.h || canvas?.height || 0) / dpr;

    const m = metrics(g, ctx.fontSize || 18);
    charW = m.charW;
    charH = m.charH;
    fontPx = m.fontPx;

    cols = Math.max(8, Math.floor(W / charW));
    rows = Math.max(6, Math.floor(H / charH));

    // Initial palette
    updatePaletteFromCss();

    // Seed a handful like the original
    entries.length = 0;
    for (let j = 0; j < 5; j++) {
      const { x, y } = randomInnerCell();
      entries.push({ x, y, stage: rndInt(Math.random, 0, 4) });
    }
    tickAccMs = 0;

    // Paint background once
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
  }

  /**
   * Handle canvas resize/orientation changes.
   * @param {*} ctx - Render context ({ dpr, w, h, fontSize }).
   */
  function resize(ctx) {
    if (!g) return;

    dpr = ctx.dpr || window.devicePixelRatio || 1;
    reset2D(g, dpr);

    const W = (ctx.w || canvas?.width || 0) / dpr;
    const H = (ctx.h || canvas?.height || 0) / dpr;

    const m = metrics(g, ctx.fontSize || 18);
    charW = m.charW;
    charH = m.charH;
    fontPx = m.fontPx;

    cols = Math.max(8, Math.floor(W / charW));
    rows = Math.max(6, Math.floor(H / charH));

    // Repaint background after resize to avoid stale pixels at edges
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
  }

  function start() { running = true; }
  function stop()  { running = false; }

  /**
   * Clear all splashes and the canvas.
   * @param {*} ctx - Render context.
   */
  function clear(ctx) {
    entries.length = 0;
    if (!ctx || !ctx.ctx2d) return;
    // Ensure DPR + paint to bg instead of clearRect (respects vibe)
    reset2D(ctx.ctx2d, ctx.dpr || window.devicePixelRatio || 1);
    const W = (ctx.w || ctx.canvas?.width || 0) / (ctx.dpr || 1);
    const H = (ctx.h || ctx.canvas?.height || 0) / (ctx.dpr || 1);
    updatePaletteFromCss();
    ctx.ctx2d.fillStyle = bg;
    ctx.ctx2d.fillRect(0, 0, W, H);
  }

  /**
   * Render one frame: advance splash stages on a fixed cadence and draw the grid.
   * Speed is applied as a global multiplier (≈0.4–1.6) to the step interval.
   * @param {*} ctx - Render context ({ ctx2d, w, h, dpr, elapsed, paused, speed }).
   */
  function frame(ctx) {
    if (!g) return;

    // pick up vibe changes live
    updatePaletteFromCss();

    // GLOBAL range 0.4..1.6; align with other modes
    const m = Math.max(0.4, Math.min(1.6, Number(ctx.speed) || 1));
    const stepMs = stepBaseMs / m;

    let dt = typeof ctx.elapsed === 'number' ? ctx.elapsed : 16.7;
    tickAccMs += dt;

    const shouldAdvance = running && !ctx.paused;
    if (shouldAdvance) {
      while (tickAccMs >= stepMs) {
        tickAccMs -= stepMs;
        tickOnce();
      }
    }

    // draw (CSS px dimensions)
    const W = (ctx.w || canvas?.width || 0) / dpr;
    const H = (ctx.h || canvas?.height || 0) / dpr;

    // Background
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    // Font (explicit each frame to avoid cross-mode contamination)
    g.font = `${fontPx}px ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`;
    g.textBaseline = 'top';

    drawAllEntries();
  }

  // --- internals -----------------------------------------------------------
  /** Pick a random interior grid cell (margin avoids ring clipping). */
  function randomInnerCell() {
    // Leave a 2-char margin so the big ring never clips
    const left = 2, right = cols - 3;
    const top = 2, bottom = rows - 3;
    return {
      x: rndInt(Math.random, left, Math.max(left, right)),
      y: rndInt(Math.random, top, Math.max(top, bottom)),
    };
  }

  /** True if (x,y) lies inside the grid. */
  function inBounds(x, y) {
    return x >= 0 && x < cols && y >= 0 && y < rows;
  }

  /** Draw a ring stage at (x,y). */
  function drawStage(x, y, stage) {
    const put = (cx, cy, s) => {
      if (!inBounds(cx, cy)) return;
      if (s.length === 1) drawChar(g, s, cx, cy, charW, charH);
      else drawStr(g, s, cx, cy, charW, charH);
    };

    switch (stage) {
      case 0: put(x, y, '.'); break;
      case 1: put(x, y, 'o'); break;
      case 2: put(x, y, 'O'); break;
      case 3: // mini cross
        put(x, y - 1, '-');
        put(x - 1, y, '|.|');
        put(x, y + 1, '-');
        break;
      case 4: // big ring (exact layout)
        put(x, y - 2, '-');
        put(x - 1, y - 1, '/ \\');
        put(x - 2, y, '| O |');
        put(x - 1, y + 1, '\\ /');
        put(x, y + 2, '-');
        break;
    }
  }

  /** Draw all active splash entries using the current foreground color. */
  function drawAllEntries() {
    g.fillStyle = fg;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      drawStage(e.x, e.y, e.stage);
    }
  }

  /** Age existing entries, spawn a new dot, and cap concurrency. */
  function tickOnce() {
    // Age existing
    for (const e of entries) e.stage += 1;
    entries = entries.filter((e) => e.stage <= 4);

    // New dot at random interior position
    const { x, y } = randomInnerCell();
    entries.push({ x, y, stage: 0 });

    // Cap at ~5 concurrent like original
    if (entries.length > 5) entries.splice(0, entries.length - 5);
  }

  return { init, resize, start, stop, frame, clear };
})();
