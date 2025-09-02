// src/js/modes/rain_bsd.js
// BSD Rain (curses-style) — splash rings like the classic
// Stages per splash:
// 0: '.'    1: 'o'    2: 'O'    3: mini-cross    4: big ring

export const rain_bsd = (() => {
  // --- helpers --------------------------------------------------------------
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const readVar = (name, fallback) =>
    getComputedStyle(document.documentElement).getPropertyValue(name)?.trim() || fallback;

  function rndInt(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }

  function metrics(g, desiredPx) {
    const px = Math.max(10, Math.floor(desiredPx || 18));
    g.font = `${px}px ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`;
    g.textBaseline = 'top';
    // Keep char width generous enough that multi-char glyphs align
    const w = Math.ceil(g.measureText('M').width);
    const h = Math.ceil(px * 1.25);
    return { charW: Math.max(6, w), charH: Math.max(px, h) };
  }

  function drawChar(g, ch, x, y, cw, chH) { g.fillText(ch, x * cw, y * chH); }
  function drawStr(g, str, x, y, cw, chH) {
    for (let i = 0; i < str.length; i++) g.fillText(str[i], (x + i) * cw, y * chH);
  }

  // --- state ---------------------------------------------------------------
  let g, canvas;
  let dpr = 1;
  let cols = 80, rows = 24;
  let charW = 10, charH = 18;
  let fg = '#2aa3ff', bg = 'black';

  // Splash entries act like the original's xpos/ypos arrays (max ~5 at once)
  /** @type {{x:number,y:number,stage:number}[]} */
  let entries = [];

  // Timing
  let tickAccMs = 0;
  const stepBaseMs = 90; // ~curses tick
  let running = false;

  // --- lifecycle -----------------------------------------------------------
  function init(ctx) {
    canvas = ctx.canvas;
    g = ctx.ctx2d;

    // Maintain your DPR scale (same pattern as your current mode)
    dpr = ctx.dpr || 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.shadowBlur = 0;
    g.shadowColor = 'rgba(0,0,0,0)';

    // Metrics from font
    const m = metrics(g, ctx.fontSize || 18);
    charW = m.charW; charH = m.charH;

    // Grid from canvas (device px, but we draw in CSS px after setTransform)
    const W = (ctx.w || canvas.width) / dpr;
    const H = (ctx.h || canvas.height) / dpr;
    cols = Math.max(8, Math.floor(W / charW));
    rows = Math.max(6, Math.floor(H / charH));

    // Theme
    fg = readVar('--accent', readVar('--fg', '#2aa3ff'));
    bg = readVar('--bg', '#000');

    // Seed a handful like the original
    entries.length = 0;
    for (let j = 0; j < 5; j++) {
      const { x, y } = randomInnerCell();
      entries.push({ x, y, stage: rndInt(Math.random, 0, 4) });
    }
    tickAccMs = 0;
  }

  function resize(ctx) {
    if (!g) return;
    // Re-apply DPR and recompute cell/grid
    dpr = ctx.dpr || 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const m = metrics(g, ctx.fontSize || 18);
    charW = m.charW; charH = m.charH;

    const W = (ctx.w || canvas.width) / dpr;
    const H = (ctx.h || canvas.height) / dpr;
    cols = Math.max(8, Math.floor(W / charW));
    rows = Math.max(6, Math.floor(H / charH));
  }

  function start() { running = true; }
  function stop() { running = false; }

  function clear(ctx) {
    entries.length = 0;
    if (ctx && ctx.ctx2d) ctx.ctx2d.clearRect(0, 0, ctx.w, ctx.h);
  }

  function frame(ctx) {
    if (!g) return;

    // Advance time → discrete splash step(s)
    const speed = clamp(Number.isFinite(ctx.speed) ? ctx.speed : 1, 0.25, 4);
    const stepMs = stepBaseMs / speed;

    let dt = (typeof ctx.elapsed === 'number' ? ctx.elapsed : 16.7);
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
  function randomInnerCell() {
    // Leave a 2-char margin so the big ring never clips
    const left = 2, right = cols - 3;
    const top = 2, bottom = rows - 3;
    return {
      x: rndInt(Math.random, left, Math.max(left, right)),
      y: rndInt(Math.random, top, Math.max(top, bottom)),
    };
  }

  function inBounds(x, y) { return x >= 0 && x < cols && y >= 0 && y < rows; }

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
      case 3:
        // mini cross
        put(x, y - 1, '-');
        put(x - 1, y, '|.|');
        put(x,   y + 1, '-');
        break;
      case 4:
        // big ring (exact layout)
        put(x,     y - 2, '-');
        put(x - 1, y - 1, '/ \\');
        put(x - 2, y,     '| O |');
        put(x - 1, y + 1, '\\ /');
        put(x,     y + 2, '-');
        break;
    }
  }

  function tickOnce() {
    // Age existing
    for (const e of entries) e.stage += 1;
    entries = entries.filter(e => e.stage <= 4);

    // New dot at random interior position
    const { x, y } = randomInnerCell();
    entries.push({ x, y, stage: 0 });

    // Cap at ~5 concurrent like original
    if (entries.length > 5) entries.splice(0, entries.length - 5);
  }

  return { init, resize, start, stop, frame, clear };
})();
