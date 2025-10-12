// src/js/modes/mining.js
/* eslint-env browser */

import { randInt, choice } from '../lib/index.js';

/**
 * Program: Mining
 * Genre: Developer
 * Style: Mining (operator prompt + stream)
 * Vibe: Terminal Mono
 *
 * Purpose:
 *   Simulate an operator typing mining/crypto commands with a blinking cursor
 *   and receiving a short burst of results/log lines, plus ongoing background logs.
 *
 * Exports:
 *   - init(ctx), resize(ctx), start(), stop(), frame(ctx), clear(ctx)
 */

export const mining = (() => {
  // ——— Internal state ———
  let fontSize = 16, lineH = 18, cols = 80, rows = 40;
  let buffer = []; // ring buffer of recent lines
  let maxLines = 200;
  let running = false;

  // cadence (affected by speed)
  let emitAccumulator = 0; // for full-line emission cadence
  let emitIntervalMs = 150; // ~150ms/line @ 1.0×
  let typeSpeedMs = 26;     // ~26ms/char @ 1.0×

  // typing a background "generated" line
  let typingChance = 0.16; // sometimes background lines are typed
  let partialLine = null;
  let partialIdx = 0;
  let typeAccumulator = 0;

  // ——— Operator prompt (user command) ———
  const PROMPT_PREFIX = '$ ';
  let promptActive = false; // currently typing a command
  let promptLine = '';      // full command to type
  let promptIdx = 0;        // typed chars of promptLine so far
  let promptAccumulator = 0;// ms since last typed char for prompt
  let cursorBlinkMs = 0;    // for blinking cursor on the prompt
  const CURSOR_PERIOD = 1000; // ms; ~520ms on, rest off looks nice

  // After a command finishes, emit a short response burst
  let burstLeft = 0; // how many response lines to push after command

  // Prompt scheduling (how often we start a new command)
  let promptCooldownMs = 600; // min gap after finishing a command
  let promptCooldownAcc = 0;
  const promptChancePerEmit = 0.38; // chance to start a prompt at an emit tick

  // ——— Theme helpers (live reads so vibe swaps apply instantly) ———
  const readVar = (name, fallback) =>
    window.getComputedStyle(document.documentElement).getPropertyValue(name)?.trim() || fallback;
  const getBG = () => (readVar('--bg', '#000000') || '#000000').trim();   // supports #RRGGBB / #RRGGBBAA
  const getFG = () => (readVar('--fg', '#03ffaf') || '#03ffaf').trim();

  // ——— Helpers ———
  const randFloat = (min, max) => min + Math.random() * (max - min);

  function randHex(n) {
    const bytes = new Uint8Array(n);
    globalThis.crypto.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  const timeStamp = () => new Date().toTimeString().slice(0, 8);

  function push(line) {
    buffer.push(line);
    if (buffer.length > maxLines) buffer.splice(0, buffer.length - maxLines);
  }

  // ——— Content generators (background) ———
  const barFill = '█';
  const barEmpty = '·';

  function makeProgBar(pct) {
    const width = 20;
    const p = Math.max(0, Math.min(100, pct));
    const filled = Math.round((p / 100) * width);
    return barFill.repeat(filled) + barEmpty.repeat(width - filled);
  }

  const cryptoCmds = [
    'HANDSHAKE','DERIVE-KEY','EXPAND-KEY','ENCRYPT','DECRYPT','ROTATE-KEYS','SEAL','UNSEAL',
    'ATTEST','HKDF','PBKDF2','SCRYPT','ARGON2','SHA256','SHA512','BLAKE3','KECCAK','SIGN','VERIFY',
  ];
  const pathbits = ['SRV','VAULT','NODE','SHARD','CLUSTER','CORE','IO','BUS','NET','GPU0','GPU1','CPU0','MEM','CACHE','DISK0'];
  const levels = ['INFO', 'WARN', 'TRACE', 'DEBUG'];
  let progress = 0;

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
      return `[${timeStamp()}] ${choice(levels)}   ${cmd} --SRC ${node} --KEY 0x${randHex(16)} --IV 0x${randHex(8)} ... OK`;
    } else if (roll < 0.64) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let s = '';
      const len = randInt(22, 54);
      for (let i = 0; i < len; i++) s += chars[randInt(0, chars.length - 1)];
      return `[${timeStamp()}] BLOB  ${s}==`;
    } else if (roll < 0.8) {
      const words =
        'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua'.split(' ');
      const n = randInt(6, 14);
      const msg = Array.from({ length: n }, () => choice(words)).join(' ').toUpperCase();
      return `[${timeStamp()}] NOTE  ${msg}.`;
    } else {
      return `[${timeStamp()}] STAT  LAT=${randInt(2, 80)}ms  SHARDS=${randInt(1, 6)}  TEMP=${randFloat(35, 78).toFixed(1)}°C  NONCE=0x${randHex(6)}`;
    }
  }

  // ——— Mode API ———

  function reset2D(g, dpr) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.shadowBlur = 0;
    g.shadowColor = 'rgba(0,0,0,0)';
  }

  function paintBG(ctx) {
    const g = ctx.ctx2d;
    const W = ctx.w / ctx.dpr, H = ctx.h / ctx.dpr;
    g.save();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = getBG();
    g.fillRect(0, 0, W, H);
    g.restore();
  }

  /**
   * Initialize metrics, buffers, and baseline drawing state.
   * @param {*} ctx - Render context ({ canvas, ctx2d, dpr, w, h }).
   * @returns {void}
   */
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
    typeAccumulator = 0;
    partialLine = null;
    partialIdx = 0;

    // prompt state
    promptActive = false;
    promptLine = '';
    promptIdx = 0;
    promptAccumulator = 0;
    cursorBlinkMs = 0;
    promptCooldownAcc = promptCooldownMs; // allow prompt immediately
    burstLeft = 0;

    // paint to current vibe background on init
    paintBG(ctx);
  }

  /**
   * Recompute metrics on resize/orientation.
   * @param {*} ctx - Render context to reinitialize with current dimensions.
   * @returns {void}
   */
  function resize(ctx) {
    init(ctx);
  }

  /**
   * Clear the canvas and the ring buffer.
   * @param {*} ctx - Render context that owns the canvas to clear.
   * @returns {void}
   */
  function clear(ctx) {
    buffer = [];
    reset2D(ctx.ctx2d, ctx.dpr);
    paintBG(ctx); // repaint vibe BG so a vibe change applies immediately
  }

  /**
   * Start emitting lines / prompt activity.
   * @returns {void}
   */
  function start() {
    running = true;
  }

  /**
   * Stop emitting lines / prompt activity.
   * @returns {void}
   */
  function stop() {
    running = false;
  }

  // --- speed mapping (Mining) ---
  function applySpeed(mult) {
    const m = Math.max(0.4, Math.min(1.6, Number(mult) || 1));
    emitIntervalMs = Math.max(30, Math.round(150 / m));
    typeSpeedMs = Math.max(8, Math.round(26 / m));
  }

  // --- prompt helpers ---
  function beginPrompt() {
    promptActive = true;
    promptLine = makeCommand();
    promptIdx = 0;
    promptAccumulator = 0;
    cursorBlinkMs = 0;
  }

  const pools = ['us-east','us-west','eu-central','ap-sg','local'];
  const algos = ['sha256','blake3','argon2','scrypt','keccak'];
  const files = ['dataset.bin','block.dat','header.hex','payload.raw','blob.b64','wallet.db'];
  const addrs = () => '0x' + randHex(10);

  function makeCommand() {
    const t = Math.random();
    if (t < 0.2) {
      return `mine --pool ${choice(pools)} --threads ${randInt(2, 16)} --intensity ${randInt(1, 5)}`;
    } else if (t < 0.4) {
      return `hash --algo ${choice(algos)} --file ${choice(files)}`;
    } else if (t < 0.6) {
      return `submit --nonce 0x${randHex(6)} --job ${randInt(1000, 9999)}`;
    } else if (t < 0.8) {
      return `wallet send --to ${addrs()} --amt ${randInt(1, 5)}.${randInt(0, 99).toString().padStart(2, '0')}`;
    } else {
      return `status --verbose`;
    }
  }

  function stepPrompt(dt) {
    promptAccumulator += dt;
    while (promptAccumulator >= typeSpeedMs && promptActive) {
      promptAccumulator -= typeSpeedMs;
      promptIdx++;
      if (promptIdx >= promptLine.length) {
        // enter: emit the full command line, then schedule a small response burst
        push(`${PROMPT_PREFIX}${promptLine}`);
        promptActive = false;
        promptLine = '';
        promptIdx = 0;
        promptCooldownAcc = 0;
        burstLeft = randInt(2, 4); // 2–4 response lines feels good
        break;
      }
    }
    // blink regardless of progress
    cursorBlinkMs = (cursorBlinkMs + dt) % CURSOR_PERIOD;
  }

  // --- frame/draw ---
  function frame(ctx) {
    const g = ctx.ctx2d;
    const W = ctx.w / ctx.dpr;
    const H = ctx.h / ctx.dpr;

    // defensive: reset compositor every frame to avoid stale ops from other modes
    reset2D(g, ctx.dpr);

    // per-mode speed mapping
    applySpeed(ctx.speed);

    // soft trail fade TOWARD the vibe background (not black)
    const BASE_FADE = 0.18;
    const MIN_FADE = 0.05, MAX_FADE = 0.28;
    const fadeAlpha = Math.max(MIN_FADE, Math.min(MAX_FADE, BASE_FADE));
    g.save();
    g.globalAlpha = fadeAlpha;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = getBG();
    g.fillRect(0, 0, W, H);
    g.restore();

    const dt = ctx.elapsed || 16;

    if (running && !ctx.paused) {
      // operator prompt typing takes priority (so it isn't scrolled away mid-typing)
      if (promptActive) {
        stepPrompt(dt);
      } else {
        if (partialLine) {
          typeAccumulator += dt;
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
          emitAccumulator += dt;
          promptCooldownAcc += dt;

          while (emitAccumulator >= emitIntervalMs && !partialLine) {
            emitAccumulator -= emitIntervalMs;

            // 1) if a post-command burst is pending, emit those first
            if (burstLeft > 0) {
              push(makeLine());
              burstLeft--;
              continue;
            }

            // 2) maybe start a new operator prompt (not too frequently)
            if (promptCooldownAcc >= promptCooldownMs && Math.random() < promptChancePerEmit) {
              beginPrompt();
              break; // switch to prompt typing loop next frame
            }

            // 3) else: background line (sometimes typed)
            if (Math.random() < typingChance) {
              partialLine = makeLine();
              partialIdx = 0;
            } else {
              push(makeLine());
            }
          }
        }
      }
    } else {
      // paused: keep cursor blinking if a prompt is active
      if (promptActive) cursorBlinkMs = (cursorBlinkMs + dt) % CURSOR_PERIOD;
    }

    // draw buffer
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

    // draw prompt on its own line at bottom of the buffer view
    const cursorOn = cursorBlinkMs < 520;
    if (promptActive) {
      const typed = promptLine.slice(0, promptIdx);
      const promptText = `${PROMPT_PREFIX}${typed}${cursorOn ? '▍' : ' '}`;
      g.fillText(promptText, xPad, y);
    } else {
      const idleText = `${PROMPT_PREFIX}${cursorOn ? '▍' : ' '}`;
      g.fillText(idleText, xPad, y);
    }
  }

  return { init, resize, start, stop, frame, clear };
})();
