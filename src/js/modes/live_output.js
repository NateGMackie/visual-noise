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
  /** @type {string[]} */
  let lines = [];
  let lineH = 18;
  const fontPx = 14;
  const font = `${fontPx}px monospace`;
  let visible = 0;

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

  const MAX_LINES = 900;

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
   * Draw a single log line with severity coloring.
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
    g.fillStyle = (SEV && SEV[key]) || (SEV && SEV.INFO) || '#ffffff';
    g.fillText(`[${key}] ${txt}`, 8, y);
  }

  /**
   * Initialize mode state and seed a few lines.
   * @param {{ctx2d:CanvasRenderingContext2D,h:number}} ctx - Shared render context.
   * @returns {void} Prepares fonts, line height, buffers, and visible count.
   */
  function init(ctx) {
    readPalette();
    const g = ctx.ctx2d;
    g.font = font;
    g.textBaseline = 'top';
    lineH = Math.round(fontPx * 1.25) || 18;
    lines = [];
    accum = 0;

    // seed a few
    for (let i = 0; i < 8; i++) {
      const { s, t } = pick(POOL);
      push(lines, `[${s}] ${t}`);
    }
    resize(ctx);
  }

  /**
   * Handle canvas size changes.
   * @param {{h:number}} ctx - Shared render context (height used to compute rows).
   * @returns {void} Updates visible row count from height and line height.
   */
  function resize(ctx) {
    readPalette();
    visible = Math.max(5, Math.floor(ctx.h / lineH));
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
   * @param {{ctx2d:CanvasRenderingContext2D,w:number,h:number,dt:number}} ctx - Shared render context.
   * @returns {void} Advances the log cadence and draws the latest lines.
   */
  function frame(ctx) {
    const g = ctx.ctx2d;

    // cadence (dt already speed/paused aware from main.js run loop)
    accum += ctx.dt;
    while (accum >= BASE_INTERVAL) {
      accum -= BASE_INTERVAL;

      // One RNG sample keeps predictable proportions and avoids dupe-else-if lint
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

    // DRAW
    g.clearRect(0, 0, ctx.w, ctx.h);
    const tail = lines.slice(-visible);
    for (let i = 0; i < tail.length; i++) {
      const line = tail[i];
      const sev = (/\[(INFO|DEBUG|WARN|ERROR|PASS|FAIL)\]/.exec(line) || [])[1] || 'INFO';
      drawLine(g, 8 + i * lineH, sev, line.replace(/^\[[^\]]+\]\s*/, ''));
    }
  }

  const api = { init, resize, clear, start, stop, frame };
  api.info = { family: 'system', flavor: 'liveOutput' };
  return api;
})();
