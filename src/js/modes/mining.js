// src/js/modes/mining.js
/* eslint-env browser */

import { randInt, choice } from '../lib/index.js';

/**
 * Program: Mining
 * Genre: Systems
 * Style: Mining
 * Vibe: Terminal Mono
 *
 * Purpose:
 *   Display timestamped, uppercase tags with occasional typing effect and dot progress bars,
 *   evoking a mining/build/log stream.
 *
 * Inputs:
 *   - ctx {object} render context with {canvas, ctx2d, dpr, w, h, elapsed, speed, paused}
 *
 * Exports:
 *   - init(ctx), resize(ctx), start(), stop(), frame(ctx), clear(ctx)
 */

// "Mining" mode: timestamped, uppercase tags, occasional typing effect, and dot progress bars.
export const mining = (() => {
  // ——— Internal state ———
  let fontSize = 16,
    lineH = 18,
    cols = 80,
    rows = 40;
  let buffer = []; // recent lines
  let maxLines = 200; // ring buffer cap
  let running = false; // toggled by start/stop
  let emitAccumulator = 0; // accumulates ctx.elapsed for cadence
  let emitIntervalMs = 150; // base cadence between full lines (stream mode)
  let typeSpeedMs = 26; // per-character typing speed when in typing mode
  let typingChance = 0.22; // probability that a new line is typed character-by-character
  let partialLine = null; // active typing line
  let partialIdx = 0;
  let typeAccumulator = 0;
  let cursorBlinkMs = 0;

  // ——— Helpers ———
  const readVar = (name, fallback) =>
    window.getComputedStyle(document.documentElement).getPropertyValue(name)?.trim() || fallback;

  /**
   * Random float in [min, max).
   * @param {number} min - Lower bound (inclusive).
   * @param {number} max - Upper bound (exclusive).
   * @returns {number} Random float.
   */
  const randFloat = (min, max) => min + Math.random() * (max - min);

  /**
   * Random hex string of length 2*n (n bytes).
   * @param {number} n - Number of bytes to generate.
   * @returns {string} Lowercase hex string.
   */
  function randHex(n) {
    const bytes = new Uint8Array(n);
    globalThis.crypto.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  const timeStamp = () => new Date().toTimeString().slice(0, 8);

  /**
   * Push a line into the ring buffer, trimming when over capacity.
   * @param {string} line - Line to append.
   * @returns {void}
   */
  function push(line) {
    buffer.push(line);
    if (buffer.length > maxLines) buffer.splice(0, buffer.length - maxLines);
  }

  // ——— Content generators (derived from backup.html crypto persona) ———
  const barFill = '█';
  const barEmpty = '·'; // dots only (per request)

  const cryptoCmds = [
    'HANDSHAKE',
    'DERIVE-KEY',
    'EXPAND-KEY',
    'ENCRYPT',
    'DECRYPT',
    'ROTATE-KEYS',
    'SEAL',
    'UNSEAL',
    'ATTEST',
    'HKDF',
    'PBKDF2',
    'SCRYPT',
    'ARGON2',
    'SHA256',
    'SHA512',
    'BLAKE3',
    'KECCAK',
    'SIGN',
    'VERIFY',
  ];
  const pathbits = [
    'SRV',
    'VAULT',
    'NODE',
    'SHARD',
    'CLUSTER',
    'CORE',
    'IO',
    'BUS',
    'NET',
    'GPU0',
    'GPU1',
    'CPU0',
    'MEM',
    'CACHE',
    'DISK0',
  ];
  const levels = ['INFO', 'WARN', 'TRACE', 'DEBUG'];
  let progress = 0;

  /**
   * Make a fixed-width progress bar using block/dot characters.
   * @param {number} pct - Percentage 0..100.
   * @returns {string} ASCII/UTF-8 progress bar.
   */
  function makeProgBar(pct) {
    const width = 20;
    const filled = Math.round((pct / 100) * width);
    return barFill.repeat(filled) + barEmpty.repeat(width - filled);
  }

  /**
   * Compose one mining/log-flavored line.
   * @returns {string} A single line to append to the buffer.
   */
  function makeLine() {
    const roll = Math.random();
    if (roll < 0.16) {
      progress += randInt(1, 7);
      if (progress > 100) progress = 0;
      const bar = makeProgBar(progress);
      return `[${timeStamp()}] PROG ${String(progress).padStart(3, ' ')}%  [${bar}]`;
    } else if (roll < 0.32) {
      const bytes = Array.from({ length: randInt(8, 16) }, () => randHex(2)).join(' ');
      return `[${timeStamp()}] HEX   ${randHex(8)}: ${bytes}`;
    } else if (roll < 0.48) {
      const cmd = choice(cryptoCmds);
      const node = choice(pathbits) + '/' + choice(pathbits) + '/' + randInt(0, 9);
      return `[${timeStamp()}] ${choice(levels)}   ${cmd} --SRC ${node} --KEY 0x${randHex(
        16
      )} --IV 0x${randHex(8)} ... OK`;
    } else if (roll < 0.64) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let s = '';
      const len = randInt(22, 54);
      for (let i = 0; i < len; i++) s += chars[randInt(0, chars.length - 1)];
      return `[${timeStamp()}] BLOB  ${s}==`;
    } else if (roll < 0.8) {
      const words =
        'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua'.split(
          ' '
        );
      const n = randInt(6, 14);
      const msg = Array.from({ length: n }, () => choice(words))
        .join(' ')
        .toUpperCase();
      return `[${timeStamp()}] NOTE  ${msg}.`;
    } else {
      return `[${timeStamp()}] STAT  LAT=${randInt(2, 80)}ms  SHARDS=${randInt(
        1,
        6
      )}  TEMP=${randFloat(35, 78).toFixed(1)}°C  NONCE=0x${randHex(6)}`;
    }
  }

  // ——— Mode API ———

  /**
   * Initialize metrics, buffers, and baseline drawing state.
   * @param {*} ctx - Render context ({ canvas, ctx2d, dpr, w, h }).
   * @returns {void}
   */
  function init(ctx) {
    const g = ctx.ctx2d;
    g.setTransform(ctx.dpr, 0, 0, ctx.dpr, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.shadowBlur = 0;
    g.shadowColor = 'rgba(0,0,0,0)';

    fontSize = Math.max(12, Math.floor(0.018 * Math.min(ctx.w, ctx.h)));
    lineH = Math.floor(fontSize * 1.15);
    rows = Math.floor(ctx.h / ctx.dpr / lineH);
    cols = Math.floor(ctx.w / ctx.dpr / (fontSize * 0.62));
    buffer = [];
    maxLines = rows * 5;
    emitAccumulator = 0;
    typeAccumulator = 0;
    partialLine = null;
    partialIdx = 0;
  }

  /**
   * Recompute metrics on resize/orientation.
   * @param {*} ctx - Render context.
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
   * Clear the canvas and the ring buffer.
   * @param {*} ctx - Render context.
   * @returns {void}
   */
  function clear(ctx) {
    buffer = [];
    ctx.ctx2d.clearRect(0, 0, ctx.w, ctx.h);
  }

  // --- speed mapping (Mining) ---
function applySpeed(mult) {
  const m = Math.max(0.4, Math.min(1.6, Number(mult) || 1));
  // 150ms between lines @ 1.0×; 26ms per typed char @ 1.0×
  emitIntervalMs = Math.max(30, Math.round(150 / m));
  typeSpeedMs   = Math.max(8,  Math.round(26  / m));
}


  function frame(ctx) {
  const g = ctx.ctx2d;
  const W = ctx.w / ctx.dpr;
  const H = ctx.h / ctx.dpr;

  // NEW: per-mode speed mapping
  applySpeed(ctx.speed);

  // soft fade
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, 0, W, H);

  if (running && !ctx.paused) {
    if (partialLine) {
      typeAccumulator += ctx.elapsed;
      while (typeAccumulator >= typeSpeedMs && partialLine) {
        typeAccumulator -= typeSpeedMs;
        partialIdx++;
        if (partialIdx >= partialLine.length) {
          push(partialLine);
          partialLine = null;
          partialIdx = 0;
        }
      }
    } else {
      emitAccumulator += ctx.elapsed;
      while (emitAccumulator >= emitIntervalMs && !partialLine) {
        emitAccumulator -= emitIntervalMs;
        if (Math.random() < typingChance) {
          partialLine = makeLine();
          partialIdx = 0;
        } else {
          push(makeLine());
        }
      }
    }
  }

  // draw buffer (unchanged)
  const lines = buffer.slice(Math.max(0, buffer.length - rows));
  const fg = readVar('--fg', '#03ffaf');
  g.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  g.textBaseline = 'top';
  g.fillStyle = (fg || '#03ffaf').trim();

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
