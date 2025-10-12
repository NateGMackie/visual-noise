// src/js/modes/sysadmin.js
/* eslint-env browser */

import { randInt } from '../lib/index.js';

/**
 * Sysadmin console: emits status lines (CPU/MEM/NET/DISK) with vibe-aware trail.
 * Exports standard mode API: init, resize, start, stop, frame, clear.
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
  let emitAccumulator = 0;
  let emitIntervalMs = 140;

  // ------- theming -------
  const readVar = (name, fallback) =>
    window.getComputedStyle(document.documentElement).getPropertyValue(name)?.trim() || fallback;
  const getBG = () => (readVar('--bg', '#000000') || '#000000').trim();
  const getFG = () => (readVar('--fg', '#03ffaf') || '#03ffaf').trim();

  // ------- line generators -------
  const barFill = '█';
  const barEmpty = '·';

  const makeBar = (pct, width = 20) => {
    const p = Math.max(0, Math.min(100, pct));
    const filled = Math.round((p / 100) * width);
    return barFill.repeat(filled) + barEmpty.repeat(width - filled);
  };

  const timeStamp = () => new Date().toTimeString().slice(0, 8);

  const push = (l) => {
    buffer.push(l);
    if (buffer.length > maxLines) buffer.splice(0, buffer.length - maxLines);
  };

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

  // ------- internal helpers -------
  function reset2D(g, dpr) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.shadowBlur = 0;
    g.shadowColor = 'rgba(0,0,0,0)';
  }

  function paintBG(ctx) {
    const g = ctx.ctx2d;
    const W = ctx.w / ctx.dpr;
    const H = ctx.h / ctx.dpr;
    g.save();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = getBG();
    g.fillRect(0, 0, W, H);
    g.restore();
  }

  // ------- lifecycle -------
  function init(ctx) {
    const g = ctx.ctx2d;
    reset2D(g, ctx.dpr);

    fontSize = Math.max(12, Math.floor(0.018 * Math.min(ctx.w, ctx.h)));
    lineH = Math.floor(fontSize * 1.15);
    rows = Math.floor(ctx.h / ctx.dpr / lineH);
    cols = Math.floor(ctx.w / ctx.dpr / (fontSize * 0.62));

    buffer = [];
    maxLines = rows * 5;
    emitAccumulator = 0;

    paintBG(ctx); // initial paint to vibe background
  }

  function resize(ctx) {
    init(ctx);
  }

  function start() {
    running = true;
  }

  function stop() {
    running = false;
  }

  function clear(ctx) {
    buffer = [];
    reset2D(ctx.ctx2d, ctx.dpr);
    paintBG(ctx); // repaint background so vibe change applies immediately
  }

  // ------- speed mapping -------
  function applySpeed(mult) {
    const m = Math.max(0.4, Math.min(1.6, Number(mult) || 1));
    const midEmit = 140;
    emitIntervalMs = Math.max(20, Math.round(midEmit / m));
  }

  // ------- frame -------
  function frame(ctx) {
    const g = ctx.ctx2d;
    const W = ctx.w / ctx.dpr;
    const H = ctx.h / ctx.dpr;

    reset2D(g, ctx.dpr);
    applySpeed(ctx.speed);

    // Trail fade toward current vibe background (instead of fixed black)
    const BASE_FADE = 0.18;
    const fadeAlpha = Math.max(0.05, Math.min(0.25, BASE_FADE));
    g.save();
    g.globalAlpha = fadeAlpha;
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

    // Draw buffer lines
    const lines = buffer.slice(Math.max(0, buffer.length - rows));
    const fg = getFG();
    g.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
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
