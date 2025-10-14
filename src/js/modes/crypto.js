// src/js/modes/crypto.js
/* eslint-env browser */

import { randInt } from '../lib/index.js';

/**
 * Program: Crypto
 * Genre: Systems
 * Style: Console log stream (mempool, peers, headers)
 * Purpose: Emits timestamped crypto-ish log lines with a soft trailing effect.
 *
 * Exports:
 *   - init(ctx), resize(ctx), start(), stop(), clear(ctx), frame(ctx)
 */
export const crypto = (() => {
  // ——— Internal state ———
  let fontSize = 16,
    lineH = 18,
    cols = 80,
    rows = 40;
  let buffer = []; // recent lines
  let maxLines = 200; // ring buffer cap
  let emitIntervalMs = 150; // base cadence (scaled by main loop’s speed if desired)
  let cursorBlinkMs = 0;
  let running = false;
  let emitAccumulator = 0; // accumulates ctx.elapsed toward emitIntervalMs

  const spinner = ['|', '/', '-', '\\'];
  let spinIdx = 0;

  // CSS theme helpers
  const readVar = (name, fallback) =>
    window.getComputedStyle(document.documentElement).getPropertyValue(name)?.trim() || fallback;
  const getBG = () => (readVar('--bg', '#000000') || '#000000').trim();
  const getFG = () => (readVar('--fg', '#03ffaf') || '#03ffaf').trim();

  /**
   * Return a hex string of length 2*n.
   * @param {number} n - Number of random bytes to generate.
   * @returns {string} Hex string (lowercase), 2 characters per byte.
   */
  function randHex(n) {
    const bytes = new Uint8Array(n);
    globalThis.crypto.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  const shortHash = () => randHex(4) + '…' + randHex(2);
  const addr = () => 'bc1q' + randHex(10).slice(0, 10);

  /**
   * Push a line into the ring buffer.
   * @param {string} line - The log line to append.
   * @returns {void}
   */
  function push(line) {
    buffer.push(line);
    if (buffer.length > maxLines) buffer.splice(0, buffer.length - maxLines);
  }

  /**
   * Emit one or more sample lines (tx, net, chain, sync).
   * @returns {void}
   */
  function sampleLines() {
    const roll = Math.random();

    if (roll < 0.4) {
      const v = (Math.random() * 1.2).toFixed(4);
      push(`mempool: tx=${shortHash()} from=${addr()} fee=${randInt(2, 95)} sat/vB v=${v} BTC`);
    } else if (roll < 0.6) {
      push(
        `peer: ${randInt(12, 223)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)} ver=${randInt(70015, 70030)} inv=${randInt(2, 18)} ping=${(Math.random() * 120).toFixed(1)}ms`
      );
    } else if (roll < 0.75) {
      push(
        `header: height=${randInt(845000, 855000)} diff=${(Math.random() * 1.0 + 1).toFixed(3)} target=${shortHash()}… time=${new Date().toISOString()}`
      );
    } else if (roll < 0.9) {
      spinIdx = (spinIdx + 1) % spinner.length;
      const pct = (Math.random() * 100).toFixed(2);
      push(`sync ${spinner[spinIdx]} headers ${pct}%  tip=${shortHash()} peers=${randInt(6, 15)}`);
    } else {
      push(
        `block: ${shortHash()} txs=${randInt(500, 3000)} size=${(Math.random() * 1.2 + 0.8).toFixed(2)}MB fees=${(Math.random() * 1.8).toFixed(2)} BTC nonce=${randInt(1e6, 9e6)}`
      );
    }

    if (Math.random() < 0.12) {
      push(`trace: verify sig=${shortHash()} ok • update utxo • write mempool journal`);
    }
  }

  // ——— Mode API ———

  /**
   * Initialize DPR-safe canvas defaults and sizing.
   * @param {*} ctx - Render context ({canvas, ctx2d, dpr, w, h, ...}).
   * @returns {void}
   */
  function init(ctx) {
  const g = ctx.ctx2d;
  g.setTransform(1, 0, 0, 1, 0, 0);
g.setTransform(ctx.dpr, 0, 0, ctx.dpr, 0, 0);


  // Always reset, then apply DPR transform once
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.setTransform(ctx.dpr, 0, 0, ctx.dpr, 0, 0);

  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.shadowBlur = 0;
  g.shadowColor = 'rgba(0,0,0,0)';

  // Use CSS pixels for all layout math
  const W = ctx.w / ctx.dpr;
  const H = ctx.h / ctx.dpr;

  // Scale type from CSS size (not device pixels)
  fontSize = Math.max(12, Math.floor(0.018 * Math.min(W, H)));
  lineH = Math.floor(fontSize * 1.15);

  // Rows/cols computed in CSS pixels to match the scaled CTX
  rows = Math.floor(H / lineH);
  cols = Math.floor(W / (fontSize * 0.62));

  buffer = [];
  maxLines = rows * 5;
  emitAccumulator = 0;

  // Paint background (CSS pixels)
  g.save();
  g.fillStyle = getBG();
  g.fillRect(0, 0, W, H);
  g.restore();
}

  /**
   * Recompute metrics on geometry/DPR change.
   * @param {*} ctx - Render context ({canvas, ctx2d, dpr, w, h, ...}).
   * @returns {void}
   */
  function resize(ctx) {
    init(ctx);
  }

  /** Start emission. @returns {void} */
  function start() {
    running = true;
  }
  /** Stop emission.  @returns {void} */
  function stop() {
    running = false;
  }

  /**
   * Clear buffer and canvas to the current vibe background.
   * @param {*} ctx - Render context with {ctx2d, w, h}.
   * @returns {void}
   */
  function clear(ctx) {
  buffer = [];
  const g = ctx.ctx2d;

  // Defensive: reset and reapply DPR transform
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


  // --- speed mapping (Crypto) ---
  /**
   * Update the emission cadence from the global speed multiplier.
   * Keeps ~150ms between lines at 1.0×; higher multiplier emits faster.
   * @param {number} mult - Global speed multiplier (≈0.4–1.6).
   * @returns {void}
   */
  function applySpeed(mult) {
    const m = Math.max(0.4, Math.min(1.6, Number(mult) || 1));
    const midEmit = 150; // 150ms @ 1.0× feels right for crypto chatter
    emitIntervalMs = Math.max(20, Math.round(midEmit / m));
  }

  /**
   * Draw one frame and optionally emit new lines on cadence.
   * @param {*} ctx - {ctx2d,dpr,w,h,elapsed,paused,speed}
   * @returns {void}
   */
  function frame(ctx) {
    const g = ctx.ctx2d;
    const W = ctx.w / ctx.dpr;
    const H = ctx.h / ctx.dpr;

    // Apply global → per-mode speed mapping for cadence
    applySpeed(ctx.speed);

    // Soft trail fade, using the vibe background with a small global alpha.
    // Works for #RRGGBB and #RRGGBBAA colors without string hacking.
    g.save();
    g.globalAlpha = 0.18; // trail strength
    g.fillStyle = getBG();
    g.fillRect(0, 0, W, H);
    g.restore();

    // Emission timing (paused-aware)
    if (running && !ctx.paused) {
      emitAccumulator += ctx.elapsed;
      while (emitAccumulator >= emitIntervalMs) {
        sampleLines();
        emitAccumulator -= emitIntervalMs;
      }
    }

    // Visible window (tail)
    const lines = buffer.slice(Math.max(0, buffer.length - rows));

    g.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    g.textBaseline = 'top';
    g.fillStyle = getFG();

    let y = 4;
    const xPad = 8;
    for (let i = 0; i < lines.length; i++) {
      const txt = lines[i];
      g.fillText(txt.length > cols ? txt.slice(0, cols - 1) + '…' : txt, xPad, y);
      y += lineH;
    }

    // Blinking cursor
    cursorBlinkMs = (cursorBlinkMs + ctx.elapsed) % 1000;
    if (cursorBlinkMs < 520) g.fillText('▍', xPad, y);
  }

  return { init, resize, start, stop, frame, clear };
})();
