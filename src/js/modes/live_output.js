/* eslint-env browser */
// src/js/modes/live_output.js
// Program: LiveOutput
// Genre: System (full-screen logs/tests/mini-UI events stream)

/**
 * Local typedef to keep JSDoc happy in plain JS builds where DOM lib
 * types aren't surfaced to the linter.
 * @typedef {any} CanvasRenderingContext2D
 */

export const liveOutput = (() => {
  // ——— Internal state ———
  /** @type {string[]} */ let lines = [];
  let lineH = 18;
  const fontPx = 14;
  const font = `${fontPx}px monospace`;

  // Logical (CSS px) geometry, derived from ctx.w/ctx.h & DPR
  let rows = 0;
  let cols = 0;
  const xPad = 8;

  // cadence (seconds) — dt already includes speed & pause from main loop
  const BASE_INTERVAL = 0.16;
  let accum = 0;

  // Palette from vibe (with fallbacks)
  /** @type {Record<string,string>|null} */
  let SEV = null;

  /**
   * Read a CSS variable from :root with a JS fallback.
   * @param {string} name - CSS variable name (e.g., '--log-info').
   * @param {string} fallback - Color to use if the variable is unset/empty.
   * @returns {string} The resolved color value.
   */
  function readVar(name, fallback) {
    const v = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  /**
   * Populate the severity palette from the current vibe/theme.
   * @returns {void} Initializes/updates the global SEV map.
   */
  function readPalette() {
    SEV = {
      INFO: readVar('--log-info', '#a9d1ff'),
      DEBUG: readVar('--log-debug', '#cfcfcf'),
      WARN: readVar('--log-warn', '#ffd37a'),
      ERROR: readVar('--log-error', '#ff9e9e'),
      PASS: readVar('--log-pass', '#b8ffb8'),
      FAIL: readVar('--log-fail', '#ffb0b0'),
    };
  }

  // Cap scales with rows so the scrollback feels similar across sizes
  let MAX_LINES = 900;

  /** @type {{s:'INFO'|'DEBUG'|'WARN'|'ERROR'|'PASS'|'FAIL', t:string}[]} */
  const POOL = [
    { s: 'INFO', t: 'dev-server listening on http://localhost:5173' },
    { s: 'DEBUG', t: 'HMR update handled: src/views/Home.jsx' },
    { s: 'INFO', t: 'route change: /dashboard' },
    { s: 'PASS', t: 'tests/auth.test.ts (5/5)' },
    { s: 'WARN', t: 'Slow import detected: three@0.160 (~450ms)' },
    { s: 'DEBUG', t: 'render cycle complete (delta=16ms)' },
    { s: 'INFO', t: 'user: guest clicked <Button id=save>' },
    { s: 'ERROR', t: 'Unhandled rejection in fetchProfile: NetworkError' },
    { s: 'INFO', t: 'retrying… ok' },
    { s: 'PASS', t: 'tests/profile.test.ts (7/7)' },
    { s: 'DEBUG', t: 'state diff: +count' },
    { s: 'INFO', t: 'build completed in 382ms' },
    { s: 'FAIL', t: 'tests/payments.test.ts (1 failed, 12 passed)' },
  ];

  /**
   * Pick a random element from an array.
   * @template T
   * @param {T[]} arr - Source array.
   * @returns {T} A random element.
   */
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Push a line, trimming from the head if past the cap.
   * @param {string[]} buf - Lines buffer to mutate.
   * @param {string} line - New line to append.
   * @returns {void} Mutates the provided buffer in place.
   */
  function push(buf, line) {
    buf.push(line);
    if (buf.length > MAX_LINES) buf.shift();
  }

  /**
   * Draw a single log line with severity coloring, truncated to column width.
   * @param {CanvasRenderingContext2D} g - 2D drawing context.
   * @param {number} y - Y coordinate (top baseline).
   * @param {'INFO'|'DEBUG'|'WARN'|'ERROR'|'PASS'|'FAIL'|string} sevRaw - Severity tag.
   * @param {string} txt - Line text (without the [SEV] tag).
   * @returns {void} Renders one colored line at the provided Y.
   */
  function drawLine(g, y, sevRaw, txt) {
    if (!SEV) readPalette();
    const key = String(sevRaw || 'INFO')
      .toUpperCase()
      .trim();
    const payload = `[${key}] ${txt}`;
    const clipped = payload.length > cols ? payload.slice(0, Math.max(0, cols - 1)) + '…' : payload;
    g.fillStyle = (SEV && SEV[key]) || (SEV && SEV.INFO) || '#ffffff';
    g.fillText(clipped, xPad, y);
  }

  /**
   * Initialize / recompute all metrics from geometry & DPR.
   * @param {{ctx2d:CanvasRenderingContext2D,w:number,h:number,dpr?:number}} ctx - Shared render context.
   * @returns {void}
   */
  function init(ctx) {
    readPalette();

    const g = ctx.ctx2d;
    g.font = font;
    g.textBaseline = 'top';

    // Logical (CSS px) width/height
    const dpr = ctx.dpr || 1;
    const W = Math.max(1, Math.round(ctx.w / dpr));
    const H = Math.max(1, Math.round(ctx.h / dpr));

    lineH = Math.round(fontPx * 1.25) || 18;

    // Rows & columns from CSS px for consistent feel across DPRs
    rows = Math.max(5, Math.floor(H / lineH));
    // Rough monospace width: measure 'M' once in CSS px
    const monoW = Math.max(5, g.measureText('M').width || fontPx * 0.6);
    cols = Math.max(20, Math.floor((W - xPad * 2) / monoW));

    // Scrollback size scales with visible rows (≈ 4–6 screens)
    MAX_LINES = Math.max(200, rows * 5);

    // first-time init seeds
    if (!lines.length) {
      lines = [];
      accum = 0;
      for (let i = 0; i < Math.min(8, rows); i++) {
        const { s, t } = pick(POOL);
        push(lines, `[${s}] ${t}`);
      }
    }
  }

  /**
   * Handle canvas resizes (mirror mining/crypto: recompute metrics in CSS px).
   * @param {{w:number,h:number,dpr?:number,ctx2d:CanvasRenderingContext2D}} ctx - Shared render
   * context; `w`/`h` are the current canvas dimensions in device pixels, `dpr` is the device
   * pixel ratio being applied, and `ctx2d` is the 2D drawing context.
   * @returns {void} Recomputes pane widths and the visible row count.
   */
  function resize(ctx) {
    init(ctx);
  }

  /**
   * Clear canvas and internal buffers.
   * @param {{ctx2d:CanvasRenderingContext2D,w:number,h:number}} ctx - Shared render context.
   * @returns {void} Wipes the surface and internal line state.
   */
  function clear(ctx) {
    const g = ctx.ctx2d;
    g.clearRect(0, 0, ctx.w, ctx.h);
    lines = [];
    accum = 0;
  }

  /** @returns {void} Start hook (no-op). */
  function start() {}
  /** @returns {void} Stop hook (no-op). */
  function stop() {}

  /**
   * Per-frame update & draw.
   * @param {{ctx2d:CanvasRenderingContext2D,w:number,h:number,elapsed:number,dt:number,speed:number}} ctx - Shared
   * render context providing timing deltas (`elapsed`/`dt`), the current speed multiplier (`speed`),
   * the canvas size (`w`/`h`), and the 2D drawing context (`ctx2d`).
   * @returns {void} Advances cadence and renders the latest lines.
   */
  function frame(ctx) {
    const g = ctx.ctx2d;

    // cadence (dt already speed/paused aware from main.js run loop)
    accum += ctx.dt;
    while (accum >= BASE_INTERVAL) {
      accum -= BASE_INTERVAL;

      // One RNG sample keeps predictable proportions
      const r = Math.random();
      if (r < 0.1) {
        const passed = 10 + Math.floor(Math.random() * 20);
        const failed = Math.random() < 0.12 ? 1 : 0;
        const sev = failed ? 'FAIL' : 'PASS';
        push(lines, `[${sev}] tests: ${passed} passed, ${failed} failed`);
      } else if (r < 0.2) {
        push(lines, `[INFO] click <a id="nav-settings">Settings</a>`);
      } else {
        const { s, t } = pick(POOL);
        push(lines, `[${s}] ${t}`);
      }
    }

    // DRAW (coords are in CSS px because main loop applies DPR transform)
    g.clearRect(0, 0, ctx.w, ctx.h);
    const tail = lines.slice(-rows);
    let y = 8;
    for (let i = 0; i < tail.length; i++) {
      const line = tail[i];
      const sev = (/\[(INFO|DEBUG|WARN|ERROR|PASS|FAIL)\]/.exec(line) || [])[1] || 'INFO';
      drawLine(g, y, sev, line.replace(/^\[[^\]]+\]\s*/, ''));
      y += lineH;
      if (y > ctx.h) break; // guard if something got out of sync
    }
  }

  const api = { init, resize, clear, start, stop, frame };
  api.info = { family: 'system', flavor: 'liveOutput' };
  return api;
})();
