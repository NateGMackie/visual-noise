/* eslint-env browser */
// src/js/modes/live_output.js
// Program: LiveOutput
// Genre: Developer
// Style: Full-screen logs/tests/mini-UI events stream

export const liveOutput = (() => {
  /** @type {string[]} */ let lines = [];
  let lineH = 18;
  const fontPx = 14;
  const font = `${fontPx}px monospace`;
  let visible = 0;

  // --- cadence (seconds) driven by ctx.dt (already speed/paused aware via main.js) ---
  // Roughly add a line ~6–8x per second at speed=1, slower/faster with speed changes.
  const BASE_INTERVAL = 0.16; // seconds per potential line
  let accum = 0;

  // Palette from vibe (with fallbacks)
  let SEV = null;
  /**
   *
   * @param name
   * @param fallback
   */
  function readVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  /**
   *
   */
  function readPalette() {
    SEV = {
      INFO:  readVar('--log-info',  '#a9d1ff'),
      DEBUG: readVar('--log-debug', '#cfcfcf'),
      WARN:  readVar('--log-warn',  '#ffd37a'),
      ERROR: readVar('--log-error', '#ff9e9e'),
      PASS:  readVar('--log-pass',  '#b8ffb8'),
      FAIL:  readVar('--log-fail',  '#ffb0b0'),
    };
  }

  const MAX_LINES = 900;

  const POOL = [
    { s: 'INFO',  t: 'dev-server listening on http://localhost:5173' },
    { s: 'DEBUG', t: 'HMR update handled: src/views/Home.jsx' },
    { s: 'INFO',  t: 'route change: /dashboard' },
    { s: 'PASS',  t: 'tests/auth.test.ts (5/5)' },
    { s: 'WARN',  t: 'Slow import detected: three@0.160 (~450ms)' },
    { s: 'DEBUG', t: 'render cycle complete (delta=16ms)' },
    { s: 'INFO',  t: 'user: guest clicked <Button id=save>' },
    { s: 'ERROR', t: 'Unhandled rejection in fetchProfile: NetworkError' },
    { s: 'INFO',  t: 'retrying… ok' },
    { s: 'PASS',  t: 'tests/profile.test.ts (7/7)' },
    { s: 'DEBUG', t: 'state diff: +count' },
    { s: 'INFO',  t: 'build completed in 382ms' },
    { s: 'FAIL',  t: 'tests/payments.test.ts (1 failed, 12 passed)' },
  ];

  /**
   *
   * @param arr
   */
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  /**
   *
   * @param buf
   * @param line
   */
  function push(buf, line) { buf.push(line); if (buf.length > MAX_LINES) buf.shift(); }

  /**
   *
   * @param g
   * @param y
   * @param sevRaw
   * @param txt
   */
  function drawLine(g, y, sevRaw, txt) {
    if (!SEV) readPalette();
    const key = String(sevRaw || 'INFO').toUpperCase().trim();
    g.fillStyle = SEV[key] ?? SEV.INFO ?? '#ffffff';
    g.fillText(`[${key}] ${txt}`, 8, y);
  }

  /** @param {{ctx2d:any}} ctx */
  function init(ctx) {
    readPalette();
    const g = ctx.ctx2d;
    g.font = font;
    g.textBaseline = 'top';
    lineH = Math.round(fontPx * 1.25) || 18;
    lines = [];
    accum = 0;

    // seed a few
    for (let i = 0; i < 8; i++) { const { s, t } = pick(POOL); push(lines, `[${s}] ${t}`); }
    resize(ctx);
  }

  /** @param {{h:number}} ctx */
  function resize(ctx) {
    readPalette();
    visible = Math.max(5, Math.floor(ctx.h / lineH));
  }

  /** @param {{ctx2d:any,w:number,h:number}} ctx */
  function clear(ctx) {
    const g = ctx.ctx2d;
    g.clearRect(0, 0, ctx.w, ctx.h);
    // also clear internal buffers so UI 'Clear' truly wipes
    lines = [];
    accum = 0;
  }

  /**
   *
   */
  function start() {}
  /**
   *
   */
  function stop() {}

  /** @param {{ctx2d:any,w:number,h:number,dt:number}} ctx */
  function frame(ctx) {
    const g = ctx.ctx2d;

    // time-based cadence (dt already includes speed + pause from main.js)
    accum += ctx.dt;
    while (accum >= BASE_INTERVAL) {
      accum -= BASE_INTERVAL;

      // 10%: test summary, 10%: mini-UI click, else random pool
      if (Math.random() < 0.10) {
        const passed = 10 + Math.floor(Math.random() * 20);
        const failed = Math.random() < 0.12 ? 1 : 0;
        const sev = failed ? 'FAIL' : 'PASS';
        push(lines, `[${sev}] tests: ${passed} passed, ${failed} failed`);
      } else if (Math.random() < 0.10) {
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
