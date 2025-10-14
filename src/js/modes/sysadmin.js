/* eslint-env browser */

import { randInt } from '../lib/index.js';

/**
 * Treat the browser 2D context as an opaque type for JSDoc linting.
 * (Avoids jsdoc/no-undefined-types without changing runtime.)
 * @typedef {*} CanvasRenderingContext2D
 */

/**
 * Render context passed to mode functions each frame.
 * NOTE: The engine supplies `w`/`h` in **device pixels** and a `dpr` (device pixel ratio).
 * This mode converts to CSS px via `/ dpr` where needed and applies a DPR transform
 * to the 2D context once during init, mirroring the crypto mode.
 * @typedef {object} VNRenderContext
 * @property {CanvasRenderingContext2D} ctx2d - 2D drawing context (DPR transform is applied in `init`).
 * @property {number} w - Canvas width in device pixels.
 * @property {number} h - Canvas height in device pixels.
 * @property {number} dpr - Device pixel ratio used for transforms and CSS px normalization.
 * @property {number} elapsed - Time since the last frame in milliseconds.
 * @property {boolean} paused - Global paused flag; when true, emission is suspended.
 * @property {number} speed - Global speed multiplier (≈ 0.4–1.6) affecting line emission cadence.
 */

/**
 * Sysadmin console: emits status lines (CPU/MEM/NET/DISK) with vibe-aware trail.
 * Exports: init, resize, start, stop, frame, clear.
 */
export const sysadmin = (() => {
  // ------- internal state -------
  let fontSize = 16;
  let lineH = 18;
  let cols = 80;
  let rows = 40;

  /** Ring buffer of recent lines. */
  let buffer = [];
  let maxLines = 200;

  let running = false;
  let emitAccumulator = 0;
  let emitIntervalMs = 140;

  // ------- theming -------
  /**
   * Read a CSS custom property with a fallback.
   * @param {string} name - CSS variable name (e.g., "--bg").
   * @param {string} fallback - Fallback value if the variable is not set.
   * @returns {string} Resolved value (trimmed).
   */
  const readVar = (name, fallback) =>
    window.getComputedStyle(document.documentElement).getPropertyValue(name)?.trim() || fallback;

  /** @returns {string} Background color derived from the current vibe. */
  const getBG = () => (readVar('--bg', '#000000') || '#000000').trim();

  /** @returns {string} Foreground color derived from the current vibe. */
  const getFG = () => (readVar('--fg', '#03ffaf') || '#03ffaf').trim();

  // ------- line generators -------
  const barFill = '█';
  const barEmpty = '·';

  /**
   * Build a fixed-width bar using filled/empty glyphs.
   * @param {number} pct - Percentage 0–100 used for filled portion.
   * @param {number} [width] - Total bar width in glyphs.
   * @returns {string} A textual bar (e.g., "█████············").
   */
  const makeBar = (pct, width = 20) => {
    const p = Math.max(0, Math.min(100, pct));
    const filled = Math.round((p / 100) * width);
    return barFill.repeat(filled) + barEmpty.repeat(width - filled);
  };

  /** @returns {string} Current time HH:MM:SS. */
  const timeStamp = () => new Date().toTimeString().slice(0, 8);

  /**
   * Push a new line into the ring buffer.
   * @param {string} l - The line to append.
   * @returns {void}
   */
  const push = (l) => {
    buffer.push(l);
    if (buffer.length > maxLines) buffer.splice(0, buffer.length - maxLines);
  };

  /**
   * Create a new synthetic sysadmin status line.
   * @returns {string} A single log-like status line.
   */
  function makeLine() {
    const r = Math.random();
    if (r < 0.2) {
      const core = randInt(0, 7);
      const pct = randInt(1, 99);
      return `[${timeStamp()}] CPU${core}  ${String(pct).padStart(3, ' ')}%  [${makeBar(pct)}]`;
    }
    if (r < 0.4) {
      const pct = randInt(10, 97);
      return `[${timeStamp()}] MEM    ${String(pct).padStart(3, ' ')}%  [${makeBar(pct)}]`;
    }
    if (r < 0.6) {
      const d = ['sda', 'sdb', 'nvme0n1'][randInt(0, 2)];
      const pct = randInt(5, 98);
      return `[${timeStamp()}] DISK   ${d}  ${String(pct).padStart(3, ' ')}%  [${makeBar(pct)}]`;
    }
    if (r < 0.8) {
      const ifc = ['eth0', 'wlan0', 'lo'][randInt(0, 2)];
      const up = (randInt(1, 950) / 10).toFixed(1);
      const dn = (randInt(1, 950) / 10).toFixed(1);
      return `[${timeStamp()}] NET    ${ifc}  ↑${up}MB/s  ↓${dn}MB/s`;
    }
    const lvls = ['INFO', 'WARN', 'DEBUG', 'TRACE'];
    const msgs = [
      'healthcheck ok',
      'rotating logs',
      'sync shards',
      'gc complete',
      'balancer tick',
      'restart queued',
      'config reload',
      'no anomalies',
    ];
    const lvl = lvls[randInt(0, lvls.length - 1)];
    const msg = msgs[randInt(0, msgs.length - 1)];
    return `[${timeStamp()}] ${lvl.padEnd(5, ' ')} ${msg}`;
  }

  // ------- lifecycle -------
  /**
   * Initialize DPR-safe canvas defaults and sizing (mirrors crypto).
   * Applies the DPR transform once and computes a monospace grid from CSS px.
   * @param {VNRenderContext} ctx - Render context from the host engine.
   * @returns {void}
   */
  function init(ctx) {
    const g = ctx.ctx2d;

    // Reset to identity, then apply DPR exactly once (mirror crypto).
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.setTransform(ctx.dpr, 0, 0, ctx.dpr, 0, 0);

    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.shadowBlur = 0;
    g.shadowColor = 'rgba(0,0,0,0)';

    // Normalize to CSS pixels like crypto does
    const W = ctx.w / ctx.dpr;
    const H = ctx.h / ctx.dpr;

    // Typography & grid (identical scale rule as crypto)
    fontSize = Math.max(12, Math.floor(0.018 * Math.min(W, H)));
    lineH = Math.floor(fontSize * 1.15);
    rows = Math.floor(H / lineH);
    cols = Math.floor(W / (fontSize * 0.62));

    buffer = [];
    maxLines = rows * 5;
    emitAccumulator = 0;

    // Paint base background
    g.save();
    g.fillStyle = getBG();
    g.fillRect(0, 0, W, H);
    g.restore();
  }

  /**
   * Handle canvas resizes by re-running init with the new context.
   * @param {VNRenderContext} ctx - Render context with updated dimensions/DPR.
   * @returns {void}
   */
  function resize(ctx) {
    init(ctx);
  }

  /**
   * Begin emitting lines each frame.
   * @returns {void}
   */
  function start() {
    running = true;
  }

  /**
   * Stop emitting lines.
   * @returns {void}
   */
  function stop() {
    running = false;
  }

  /**
   * Clear the canvas and reset the line buffer.
   * @param {VNRenderContext} ctx - Render context used to clear with vibe background.
   * @returns {void}
   */
  function clear(ctx) {
    buffer = [];
    const g = ctx.ctx2d;

    // Reset + DPR (mirror crypto.clear)
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.setTransform(ctx.dpr, 0, 0, ctx.dpr, 0, 0);

    const W = ctx.w / ctx.dpr;
    const H = ctx.h / ctx.dpr;

    g.save();
    g.globalAlpha = 1;
    g.fillStyle = getBG();
    g.fillRect(0, 0, W, H);
    g.restore();
  }

  // ------- speed mapping -------
  /**
   * Apply a global speed multiplier, mapping to an emission cadence.
   * @param {number} mult - Speed multiplier (clamped ≈ 0.4–1.6). Higher is faster.
   * @returns {void}
   */
  function applySpeed(mult) {
    const m = Math.max(0.4, Math.min(1.6, Number(mult) || 1));
    const midEmit = 140; // sysadmin feels a tad quicker than crypto
    emitIntervalMs = Math.max(20, Math.round(midEmit / m));
  }

  // ------- frame -------
  /**
   * Per-frame render: fade trail to background, emit lines on cadence, draw buffer.
   * @param {VNRenderContext} ctx - Render context with timing and global flags.
   * @returns {void}
   */
  function frame(ctx) {
    const g = ctx.ctx2d;
    const W = ctx.w / ctx.dpr;
    const H = ctx.h / ctx.dpr;

    applySpeed(ctx.speed);

    // Trail fade toward vibe background (mirror crypto’s approach)
    g.save();
    g.globalAlpha = 0.18;
    g.fillStyle = getBG();
    g.fillRect(0, 0, W, H);
    g.restore();

    // Emit lines on cadence
    if (running && !ctx.paused) {
      emitAccumulator += ctx.elapsed;
      while (emitAccumulator >= emitIntervalMs) {
        emitAccumulator -= emitIntervalMs;
        push(makeLine());
      }
    }

    // Draw buffer
    const lines = buffer.slice(Math.max(0, buffer.length - rows));
    g.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    g.textBaseline = 'top';
    g.fillStyle = getFG();

    let y = 4;
    const xPad = 8;
    for (let i = 0; i < lines.length; i++) {
      const txt = lines[i];
      const out = txt.length > cols ? txt.slice(0, cols - 1) + '…' : txt;
      g.fillText(out, xPad, y);
      y += lineH;
    }
  }

  return { init, resize, start, stop, frame, clear };
})();
