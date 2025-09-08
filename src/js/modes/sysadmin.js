// src/js/modes/sysadmin.js
/* eslint-env browser */

import { randInt } from '../lib/index.js';

/**
 * Treat the browser 2D context as an opaque type for JSDoc linting.
 * (Avoids jsdoc/no-undefined-types without changing runtime.)
 * @typedef {*} CanvasRenderingContext2D
 */
/**
 * Render context passed to mode functions each frame.
 * @typedef {object} VNRenderContext
 * @property {CanvasRenderingContext2D} ctx2d - 2D drawing context (DPR-normalized).
 * @property {number} w - Canvas width in CSS pixels.
 * @property {number} h - Canvas height in CSS pixels.
 * @property {number} dpr - Device pixel ratio.
 * @property {number} elapsed - Milliseconds since the last frame.
 * @property {boolean} paused - Whether the animation is paused.
 * @property {number} speed - Global speed multiplier (≈0.4–1.6).
 */

/**
 * Sysadmin console: emits status lines (CPU/MEM/NET/DISK) with light trail.
 * Exports the standard mode API: init, resize, start, stop, frame, clear.
 */
export const sysadmin = (() => {
  // ------- internal state -------
  let fontSize = 16;
  let lineH = 18;
  let cols = 80;
  let rows = 40;

  /** @type {string[]} ring buffer of recent lines */
  let buffer = [];
  let maxLines = 200;

  let running = false;
  let emitAccumulator = 0; // ms since last line emission
  let emitIntervalMs = 140; // cadence in stream mode

  // palette (reads from CSS variables)
  const readVar = (name, fallback) =>
    window.getComputedStyle(document.documentElement).getPropertyValue(name)?.trim() || fallback;

  // ------- line generators -------
  const barFill = '█';
  const barEmpty = '·';

  /**
   * Make a fixed-width bar for percentages.
   * @param {number} pct - 0..100
   * @param {number} [width] - bar character width
   * @returns {string} ASCII bar visualization for the given percentage.
   */
  function makeBar(pct, width = 20) {
    const p = Math.max(0, Math.min(100, pct));
    const filled = Math.round((p / 100) * width);
    return barFill.repeat(filled) + barEmpty.repeat(width - filled);
  }

  const timeStamp = () => new Date().toTimeString().slice(0, 8);

  /**
   * Push a line into the ring buffer.
   * @param {string} l - line to add
   * @returns {void}
   */
  function push(l) {
    buffer.push(l);
    if (buffer.length > maxLines) buffer.splice(0, buffer.length - maxLines);
  }

  /**
   * Compose one sysadmin-flavored line.
   * @returns {string} A formatted log/status line (CPU/MEM/DISK/NET or INFO/WARN/etc.).
   */
  function makeLine() {
    const r = Math.random();
    if (r < 0.2) {
      // CPU
      const core = randInt(0, 7);
      const pct = randInt(1, 99);
      return `[${timeStamp()}] CPU${core}  ${String(pct).padStart(3, ' ')}%  [${makeBar(pct)}]`;
    }
    if (r < 0.4) {
      // MEM
      const pct = randInt(10, 97);
      return `[${timeStamp()}] MEM    ${String(pct).padStart(3, ' ')}%  [${makeBar(pct)}]`;
    }
    if (r < 0.6) {
      // DISK
      const d = ['sda', 'sdb', 'nvme0n1'][randInt(0, 2)];
      const pct = randInt(5, 98);
      return `[${timeStamp()}] DISK   ${d}  ${String(pct).padStart(3, ' ')}%  [${makeBar(pct)}]`;
    }
    if (r < 0.8) {
      // NET
      const ifc = ['eth0', 'wlan0', 'lo'][randInt(0, 2)];
      const up = (randInt(1, 950) / 10).toFixed(1);
      const dn = (randInt(1, 950) / 10).toFixed(1);
      return `[${timeStamp()}] NET    ${ifc}  ↑${up}MB/s  ↓${dn}MB/s`;
    }
    // LOG
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

  // ------- API: lifecycle & drawing -------

  /**
   * Initialize measurements, buffers, and baseline drawing state.
   * @param {any} ctx - Render context ({ canvas, ctx2d, dpr, w, h, ... }).
   * @returns {void}
   */
  function init(ctx) {
    const g = ctx.ctx2d;

    // Reset 2D defaults and DPR
    g.setTransform(ctx.dpr, 0, 0, ctx.dpr, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.shadowBlur = 0;
    g.shadowColor = 'rgba(0,0,0,0)';

    // Metrics from viewport
    fontSize = Math.max(12, Math.floor(0.018 * Math.min(ctx.w, ctx.h)));
    lineH = Math.floor(fontSize * 1.15);
    rows = Math.floor(ctx.h / ctx.dpr / lineH);
    cols = Math.floor(ctx.w / ctx.dpr / (fontSize * 0.62));

    // Buffers
    buffer = [];
    maxLines = rows * 5;

    // Timers
    emitAccumulator = 0;
  }

  /**
   * Recompute metrics on resize/orientation changes.
   * @param {any} ctx - Render context.
   * @returns {void}
   */
  function resize(ctx) {
    init(ctx);
  }

  /**
   * Start emitting lines.
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
   * Clear the canvas and line buffer.
   * @param {any} ctx - Render context.
   * @returns {void}
   */
  function clear(ctx) {
    buffer = [];
    ctx.ctx2d.clearRect(0, 0, ctx.w, ctx.h);
  }

  /**
   * Update the line-emission cadence based on the global speed multiplier.
   * Keeps 1.0× at ~140ms between lines; higher multipliers emit faster.
   * @param {number} mult - Global speed multiplier (≈ 0.4–1.6).
   * @returns {void} No return value.
   */
  function applySpeed(mult) {
    const m = Math.max(0.4, Math.min(1.6, Number(mult) || 1));
    const midEmit = 140; // 140ms between lines @ 1.0×
    emitIntervalMs = Math.max(20, Math.round(midEmit / m));
  }

  /**
   * Render one frame and, if running, emit new lines based on cadence.
   * Applies per-mode speed mapping using the local helper applySpeed().
   * @param {VNRenderContext} ctx - Render context for this frame.
   * @returns {void}
   */
  function frame(ctx) {
    const g = ctx.ctx2d;
    const W = ctx.w / ctx.dpr;
    const H = ctx.h / ctx.dpr;

    // per-mode speed mapping
    applySpeed(ctx.speed);

    // background trail
    const bg = readVar('--bg', '#000') || '#000';
    g.fillStyle = 'rgba(0,0,0,0.16)';
    if (bg !== '#000') g.fillStyle = 'rgba(0,0,0,0.16)';
    g.fillRect(0, 0, W, H);

    // emission timing
    if (running && !ctx.paused) {
      emitAccumulator += ctx.elapsed;
      while (emitAccumulator >= emitIntervalMs) {
        emitAccumulator -= emitIntervalMs;
        push(makeLine());
      }
    }

    // visible slice & draw
    const lines = buffer.slice(Math.max(0, buffer.length - rows));
    const fg = readVar('--fg', '#9fffb3').trim() || '#9fffb3';
    g.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`;
    g.textBaseline = 'top';
    g.fillStyle = fg;

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
