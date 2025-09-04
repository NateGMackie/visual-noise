// src/js/modes/rain_bsd.js
/* eslint-env browser */

import { clamp } from '../lib/index.js';

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

// BSD Rain (curses-style) — splash rings like the classic
// Stages per splash:
// 0: '.'    1: 'o'    2: 'O'    3: mini-cross    4: big ring

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
   * Compute fixed-width character metrics for the grid.
   * @param {*} g - 2D drawing context.
   * @param {number} desiredPx - Desired font pixel size.
   * @returns {{charW:number,charH:number}} Character width/height in CSS pixels.
   */
  function metrics(g, desiredPx) {
    const px = Math.max(10, Math.floor(desiredPx || 18));
    g.font = `${px}px ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`;
    g.textBaseline = 'top';
    // Keep char width generous enough that multi-char glyphs align
    const w = Math.ceil(g.measureText('M').width);
    const h = Math.ceil(px * 1.25);
    return { charW: Math.max(6, w), charH: Math.max(px, h) };
  }

  /**
   * Draw a single character at grid coordinates.
   * @param {*} g - 2D drawing context.
   * @param {string} ch - Single character to draw.
   * @param {number} x - Column index.
   * @param {number} y - Row index.
   * @param {number} cw - Character width (CSS px).
   * @param {number} chH - Character height (CSS px).
   * @returns {void}
   */
  function drawChar(g, ch, x, y, cw, chH) {
    g.fillText(ch, x * cw, y * chH);
  }
  /**
   * Draw a short string at grid coordinates.
   * @param {*} g - 2D drawing context.
   * @param {string} str - String to draw (few chars).
   * @param {number} x - Column index.
   * @param {number} y - Row index.
   * @param {number} cw - Character width (CSS px).
   * @param {number} chH - Character height (CSS px).
   * @returns {void}
   */
  function drawStr(g, str, x, y, cw, chH) {
    for (let i = 0; i < str.length; i++) g.fillText(str[i], (x + i) * cw, y * chH);
  }

  // --- state ---------------------------------------------------------------
  let g, canvas;
  let dpr = 1;
  let cols = 80,
    rows = 24;
  let charW = 10,
    charH = 18;

  // palette (reads from CSS variables)
  let fg = '#2aa3ff',
    bg = 'black';

  // Splash entries act like the original's xpos/ypos arrays (max ~5 at once)
  /** @type {{x:number,y:number,stage:number}[]} */
  let entries = [];

  // Timing
  let tickAccMs = 0;
  const stepBaseMs = 90; // ~curses tick
  let running = false;

  // --- palette refresh (fix for vibe changes) ------------------------------
  /**
   * Refresh palette from CSS vars; called at init() and each frame().
   * @returns {void}
   */
  function updatePaletteFromCss() {
    const newFg = readVar('--fg', readVar('--accent', '#2aa3ff'));
    const newBg = readVar('--bg', '#000');

    if (newFg !== fg || newBg !== bg) {
      fg = newFg;
      bg = newBg;
    }
  }

  // --- lifecycle -----------------------------------------------------------
  /**
   * Initialize canvas metrics, palette, and seed a few splashes.
   * @param {*} ctx - Render context ({ canvas, ctx2d, dpr, w, h, fontSize }).
   * @returns {void}
   */
  function init(ctx) {
    canvas = ctx.canvas;
    g = ctx.ctx2d;

    // Maintain DPR scale
    dpr = ctx.dpr || 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.shadowBlur = 0;
    g.shadowColor = 'rgba(0,0,0,0)';

    // Metrics from font
    const m = metrics(g, ctx.fontSize || 18);
    charW = m.charW;
    charH = m.charH;

    // Grid from canvas (device px, but we draw in CSS px after setTransform)
    const W = (ctx.w || canvas.width) / dpr;
    const H = (ctx.h || canvas.height) / dpr;
    cols = Math.max(8, Math.floor(W / charW));
    rows = Math.max(6, Math.floor(H / charH));

    // Initial palette read
    updatePaletteFromCss();

    // Seed a handful like the original
    entries.length = 0;
    for (let j = 0; j < 5; j++) {
      const { x, y } = randomInnerCell();
      entries.push({ x, y, stage: rndInt(Math.random, 0, 4) });
    }
    tickAccMs = 0;
  }

  /**
   * Handle canvas resize/orientation changes.
   * @param {*} ctx - Render context ({ dpr, w, h, fontSize }).
   * @returns {void}
   */
  function resize(ctx) {
    if (!g) return;
    // Re-apply DPR and recompute cell/grid
    dpr = ctx.dpr || 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const m = metrics(g, ctx.fontSize || 18);
    charW = m.charW;
    charH = m.charH;

    const W = (ctx.w || canvas.width) / dpr;
    const H = (ctx.h || canvas.height) / dpr;
    cols = Math.max(8, Math.floor(W / charW));
    rows = Math.max(6, Math.floor(H / charH));
  }

  /**
   * Begin advancing animation.
   * @returns {void}
   */
  function start() {
    running = true;
  }
  /**
   * Pause animation.
   * @returns {void}
   */
  function stop() {
    running = false;
  }

  /**
   * Clear all splashes and the canvas.
   * @param {*} ctx - Render context.
   * @returns {void}
   */
  function clear(ctx) {
    entries.length = 0;
    if (ctx && ctx.ctx2d) ctx.ctx2d.clearRect(0, 0, ctx.w, ctx.h);
  }

  /**
   * Draw one frame and step the simulation when running.
   * @param {*} ctx - Render context ({ w, h, dpr, elapsed, paused, speed }).
   * @returns {void}
   */
  function frame(ctx) {
    if (!g) return;

    // 🔄 pick up vibe changes live
    updatePaletteFromCss();

    // Advance time → discrete splash step(s)
    const speed = clamp(Number.isFinite(ctx.speed) ? ctx.speed : 1, 0.25, 4);
    const stepMs = stepBaseMs / speed;

    let dt = typeof ctx.elapsed === 'number' ? ctx.elapsed : 16.7;
    tickAccMs += dt;

    // Only advance animation if running & not paused
    const shouldAdvance = running && !ctx.paused;
    if (shouldAdvance) {
      while (tickAccMs >= stepMs) {
        tickAccMs -= stepMs;
        tickOnce();
      }
    }

    // Draw full frame (classic BSD rain doesn't use trails)
    const W = (ctx.w || canvas.width) / dpr;
    const H = (ctx.h || canvas.height) / dpr;

    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    g.fillStyle = fg;
    // font & baseline were set in metrics(); ensure still correct
    g.font = `${Math.round(charH / 1.25)}px ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`;
    g.textBaseline = 'top';

    for (const e of entries) drawStage(e.x, e.y, e.stage);
  }

  // --- internals -----------------------------------------------------------
  /**
   * Pick a random interior grid cell (margin avoids ring clipping).
   * @returns {{x:number,y:number}} Cell coordinates inside safe bounds.
   */
  function randomInnerCell() {
    // Leave a 2-char margin so the big ring never clips
    const left = 2,
      right = cols - 3;
    const top = 2,
      bottom = rows - 3;
    return {
      x: rndInt(Math.random, left, Math.max(left, right)),
      y: rndInt(Math.random, top, Math.max(top, bottom)),
    };
  }

  /**
   * Check if (x,y) lies inside the grid.
   * @param {number} x - Column index.
   * @param {number} y - Row index.
   * @returns {boolean} True if within bounds.
   */
  function inBounds(x, y) {
    return x >= 0 && x < cols && y >= 0 && y < rows;
  }

  /**
   * Draw a ring stage at (x,y).
   * @param {number} x - Column index.
   * @param {number} y - Row index.
   * @param {number} stage - 0..4 ring stage identifier.
   * @returns {void}
   */
  function drawStage(x, y, stage) {
    const put = (cx, cy, s) => {
      if (!inBounds(cx, cy)) return;
      if (s.length === 1) drawChar(g, s, cx, cy, charW, charH);
      else drawStr(g, s, cx, cy, charW, charH);
    };

    switch (stage) {
      case 0:
        put(x, y, '.');
        break;
      case 1:
        put(x, y, 'o');
        break;
      case 2:
        put(x, y, 'O');
        break;
      case 3:
        // mini cross
        put(x, y - 1, '-');
        put(x - 1, y, '|.|');
        put(x, y + 1, '-');
        break;
      case 4:
        // big ring (exact layout)
        put(x, y - 2, '-');
        put(x - 1, y - 1, '/ \\');
        put(x - 2, y, '| O |');
        put(x - 1, y + 1, '\\ /');
        put(x, y + 2, '-');
        break;
    }
  }

  /**
   * Age existing entries, spawn a new dot, and cap concurrency.
   * @returns {void}
   */
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
