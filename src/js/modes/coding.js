/* eslint-env browser */
// src/js/modes/coding.js
// Program: Coding
// Genre: Developer
// Style: Split screen ~70/30 (code editor + live output)

/**
 * Local typedef to satisfy jsdoc/no-undefined-types in environments
 * where DOM lib typings aren't available to the linter.
 * @typedef {any} CanvasRenderingContext2D
 */

import { modular } from '../lib/typography.js';

// --- vibe/theme event hooks (cleanly attached/detached) ---
let __onTheme = null;
let __onVibe = null;

export const coding = (() => {
  /** @type {string[]} */ let codeLines = [];
  /** @type {string[]} */ let outLines = [];

  // Layout / typography
  let codeWidthPx = 0;
  let codeLinesVisible = 0;
  let outLinesVisible = 0;
  let lineH = 18;
  let fontPx = 14;

  // Cadence baselines (ms)
  let codeIntervalMsBase = 450; // delay before starting a new code line (mid speed)
  let outIntervalMsBase = 1050; // right-pane cadence (mid speed)
  let typeSpeedMsBase = 70; // per-character typing (mid speed)

  // Effective (after speed mapping)
  let codeIntervalMs = codeIntervalMsBase;
  let outIntervalMs = outIntervalMsBase;
  let typeSpeedMs = typeSpeedMsBase;

  // Accumulators (ms)
  let accCodeMs = 0; // cooldown before new code line
  let accOutMs = 0; // right-pane cadence
  let accTypeMs = 0; // per-char typing

  // Caret blink (seconds)
  const CARET_PERIOD_S = 0.5;
  let accCaretS = 0;
  let caretOn = true;

  // Typing state (left)
  /** @type {string|null} */ let partialLine = null;
  let partialIdx = 0;

  // Buffers
  const MAX_CODE_LINES = 600;
  const MAX_OUT_LINES = 300;

  // Fixed left-pane background
  const LEFT_BG = '#000000';

  // ---------- vibe-aware palette (robust fallbacks) ----------
  function cssVar(name, fallback) {
    const v = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  function readPalette() {
    const bodyColor = (window.getComputedStyle(document.body).color || '').trim() || '#ffffff';
    const doc = window.getComputedStyle(document.documentElement);
    const varOr = (...names) => {
      for (const n of names) {
        const val = (doc.getPropertyValue(n) || '').trim();
        if (val) return val;
      }
      return '';
    };
    const outputMono =
      cssVar('--output-fg', varOr('--fg', '--accent', '--primary')) || bodyColor || '#ffffff';

    return {
      // Left syntax colors
      keyword: cssVar('--code-keyword', '#e0b3ff'),
      string: cssVar('--code-string', '#ffffff'),
      number: cssVar('--code-number', '#ffd18a'),
      comment: cssVar('--code-comment', '#03ffaf'),
      punct: cssVar('--code-punct', '#cfcfcf'),
      ident: cssVar('--code-ident', '#9de7ff'),
      // Layout + right side mono color (vibe-driven)
      divider: cssVar('--pane-divider', '#3a3a3a'),
      output: outputMono,
      rightBg: cssVar('--bg', '#000000'), // right pane follows vibe
    };
  }
  let PALETTE = null;

  // ---------- tiny tokenizer (JS-ish) ----------
  const reToken = new RegExp(
    [
      String.raw`(\/\/.*$)`,
      String.raw`(\"(?:\\.|[^"\\])*\"|'(?:\\.|[^'\\])*')`,
      String.raw`\b(function|return|const|let|var|if|else|for|while|break|continue|switch|case|default|try|catch|finally|throw|new|class|extends|super|import|from|export|async|await)\b`,
      String.raw`\b(\d+(?:\.\d+)?)\b`,
      String.raw`([A-Za-z_]\w*)(?=\s*\()`,
      String.raw`([{}()[\].,;:+\-*/%<>=!&|^~?])`,
      String.raw`([A-Za-z_]\w*)`,
      String.raw`(\s+)`,
    ].join('|'),
    'gm'
  );

  function tokenize(line) {
    const out = [];
    let last = 0;
    reToken.lastIndex = 0;
    let m;
    while ((m = reToken.exec(line))) {
      if (m.index > last) out.push({ text: line.slice(last, m.index), type: 'ident' });
      const [full, cmt, str, kw, num, fn, punc, ident, ws] = m;
      let type = 'ident';
      if (cmt) type = 'comment';
      else if (str) type = 'string';
      else if (kw) type = 'keyword';
      else if (num) type = 'number';
      else if (fn) type = 'func';
      else if (punc) type = 'punct';
      else if (ident) type = 'ident';
      else if (ws) type = 'ws';
      out.push({ text: full, type });
      last = m.index + full.length;
    }
    if (last < line.length) out.push({ text: line.slice(last), type: 'ident' });
    return out;
  }

  function drawHighlightedLine(g, line, x, y) {
    let dx = x;
    const toks = tokenize(line);
    for (const t of toks) {
      if (t.type === 'ws') {
        dx += g.measureText(t.text).width;
        continue;
      }
      g.fillStyle =
        t.type === 'keyword'
          ? PALETTE.keyword
          : t.type === 'string'
          ? PALETTE.string
          : t.type === 'number'
          ? PALETTE.number
          : t.type === 'comment'
          ? PALETTE.comment
          : t.type === 'func'
          ? PALETTE.ident
          : t.type === 'punct'
          ? PALETTE.punct
          : PALETTE.ident;
      g.fillText(t.text, dx, y);
      dx += g.measureText(t.text).width;
    }
  }

  // ---------- content ----------
  const JS_SNIPPETS = [
    `// app/bootstrap`,
    `import { createApp } from './app.js'`,
    `const app = createApp()`,
    `app.use(router)`,
    `app.mount('#root')`,
    ``,
    `// utilities`,
    `export function clamp(v, a, b){ return Math.max(a, Math.min(b, v)) }`,
    `const delay = (ms)=>new Promise(r=>setTimeout(r,ms))`,
    ``,
    `// components`,
    `function Button({ label, onClick }){`,
    `  return <button onClick={onClick}>{label}</button>`,
    `}`,
    ``,
    `// state`,
    `const state = { count: 0 }`,
    `function inc(){ state.count++; render() }`,
    ``,
    `// render`,
    `function render(){`,
    `  const root = document.getElementById('root')`,
    `  root.textContent = 'Count: ' + state.count`,
    `}`,
    ``,
    `console.log('App started')`,
  ];

  const OUTPUT_SNIPPETS = [
    `[INFO] dev-server listening on http://localhost:5173`,
    `[DEBUG] HMR update: src/components/Counter.jsx`,
    `[PASS] tests/counter.test.js (3/3)`,
    `[WARN] Deprecated API call: fetchData(v1)`,
    `[INFO] build: completed in 421 ms`,
    `[DEBUG] render -> count=1`,
    `[INFO] route change: /settings`,
    `[ERROR] TypeError: cannot read properties of undefined`,
    `[RETRY] reconnecting… ok`,
    `[TEST] 12 passed, 1 skipped, 0 failed`,
  ];

  // ---------- helpers ----------
  function pushCapped(buf, line, cap) {
    buf.push(line);
    if (buf.length > cap) buf.shift();
  }
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function drawRightMono(g, lines, x, y, maxVisible) {
    g.fillStyle = PALETTE.output; // vibe-driven mono
    const tail = lines.slice(-maxVisible);
    for (let i = 0; i < tail.length; i++) g.fillText(tail[i], x, y + i * lineH);
  }

  function applySpeed(mult) {
    const m = Math.max(0.4, Math.min(1.6, Number(mult) || 1));
    codeIntervalMs = Math.max(60, Math.round(codeIntervalMsBase / m));
    outIntervalMs = Math.max(120, Math.round(outIntervalMsBase / m));
    typeSpeedMs = Math.max(12, Math.round(typeSpeedMsBase / m));
  }

  // ---------- sizing/typography ----------
  function syncTypography(ctx) {
    const g = ctx.ctx2d;
    const dpr = ctx.dpr || window.devicePixelRatio || 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    fontPx = Math.max(12, Math.round(modular(0)));
    g.font = `${fontPx}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    g.textBaseline = 'top';
    lineH = Math.max(12, Math.round(fontPx * 1.15));
  }

  // paint backgrounds:
  // - fill entire canvas LEFT_BG (solid black)
  // - then paint RIGHT PANE with the vibe bg color
  function paintBG(ctx) {
    const g = ctx.ctx2d;
    const dpr = ctx.dpr || window.devicePixelRatio || 1;
    const W = Math.max(1, Math.round(ctx.w / dpr));
    const H = Math.max(1, Math.round(ctx.h / dpr));
    const rightX = codeWidthPx; // divider drawn after

    g.save();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';

    // Left (and default) = black
    g.fillStyle = LEFT_BG;
    g.fillRect(0, 0, W, H);

    // Right pane follows vibe
    g.fillStyle = PALETTE.rightBg;
    g.fillRect(rightX, 0, W - rightX, H);

    g.restore();
  }

  // ---------- lifecycle ----------
  function init(ctx) {
    PALETTE = readPalette();
    syncTypography(ctx);

    codeLines = [];
    outLines = [];
    partialLine = null;
    partialIdx = 0;
    accCodeMs = 0;
    accOutMs = 0;
    accTypeMs = 0;
    accCaretS = 0;
    caretOn = true;

    // seed right pane
    for (let i = 0; i < 3; i++) pushCapped(outLines, pick(OUTPUT_SNIPPETS), MAX_OUT_LINES);

    // listen for vibe/theme changes → refresh palette
    const bus = window.app && window.app.events;
    if (bus && typeof bus.on === 'function') {
      __onTheme = () => {
        PALETTE = readPalette();
      };
      __onVibe = () => {
        PALETTE = readPalette();
      };
      bus.on('theme', __onTheme);
      bus.on('vibe', __onVibe);
    }

    // compute layout before first background paint
    resize(ctx);
    paintBG(ctx);
  }

  function resize(ctx) {
    PALETTE = readPalette();
    syncTypography(ctx);

    const dpr = ctx.dpr || window.devicePixelRatio || 1;
    const W = Math.max(1, Math.round(ctx.w / dpr));
    const H = Math.max(1, Math.round(ctx.h / dpr));

    codeWidthPx = Math.floor(W * 0.7) | 0; // 70% code, 30% output
    codeLinesVisible = Math.max(4, Math.floor(H / lineH));
    outLinesVisible = codeLinesVisible;
  }

  function clear(ctx) {
    const g = ctx.ctx2d;
    g.clearRect(0, 0, ctx.w, ctx.h);
    codeLines = [];
    outLines = [];
    partialLine = null;
    partialIdx = 0;
    accCodeMs = accOutMs = accTypeMs = 0;
    accCaretS = 0;
    caretOn = true;

    PALETTE = readPalette();
    paintBG(ctx);
  }

  function start() {}

  function stop() {
    const bus = window.app && window.app.events;
    if (bus && typeof bus.off === 'function') {
      if (__onTheme) bus.off('theme', __onTheme);
      if (__onVibe) bus.off('vibe', __onVibe);
    }
    __onTheme = null;
    __onVibe = null;
  }

  function frame(ctx) {
    const g = ctx.ctx2d;

    // Always read the latest palette (ensures live vibe swap)
    PALETTE = readPalette();

    // Keep timing in sync with the global speed model
    applySpeed(ctx.speed);

    const dtMs = ctx.elapsed; // 0 while paused
    const dtS = ctx.dt;       // 0 while paused

    // --- RIGHT PANE cadence ---
    accOutMs += dtMs;
    while (accOutMs >= outIntervalMs) {
      accOutMs -= outIntervalMs;
      pushCapped(outLines, pick(OUTPUT_SNIPPETS), MAX_OUT_LINES);
    }

    // --- LEFT PANE typing loop ---
    if (!partialLine) {
      accCodeMs += dtMs;
      if (accCodeMs >= codeIntervalMs) {
        accCodeMs = 0;
        partialLine =
          Math.random() < 0.12 ? `console.log('tick', ${Date.now() % 1000})` : pick(JS_SNIPPETS);
        partialIdx = 0;
      }
    } else {
      accTypeMs += dtMs;
      while (accTypeMs >= typeSpeedMs && partialLine) {
        accTypeMs -= typeSpeedMs;
        partialIdx++;
        if (partialIdx >= partialLine.length) {
          pushCapped(codeLines, partialLine, MAX_CODE_LINES);
          partialLine = null;
          partialIdx = 0;
          break;
        }
      }
    }

    // Caret blink
    accCaretS += dtS;
    if (accCaretS >= CARET_PERIOD_S) {
      accCaretS -= CARET_PERIOD_S;
      caretOn = !caretOn;
    }

    // ---- DRAW ----
    // 1) two-tone background (left black, right vibe)
    paintBG(ctx);

    // 2) Left pane code
    const fullTailAll = codeLines.slice(-codeLinesVisible);
    const mustReserveRowForPartial = !!partialLine && fullTailAll.length >= codeLinesVisible;
    const fullTail = mustReserveRowForPartial ? fullTailAll.slice(1) : fullTailAll;

    for (let i = 0; i < fullTail.length; i++) {
      drawHighlightedLine(g, fullTail[i], 8, 8 + i * lineH);
    }

    // caret metrics
    const caretH = Math.max(2, Math.floor(lineH * 0.12));

    if (partialLine) {
      const row = Math.min(codeLinesVisible - 1, fullTail.length);
      const yTop = 8 + row * lineH;
      const yBot = yTop + lineH - caretH;
      const typed = partialLine.slice(0, partialIdx);
      drawHighlightedLine(g, typed, 8, yTop);

      if (caretOn) {
        const caretX = 8 + g.measureText(typed).width;
        g.fillStyle = PALETTE.ident;
        g.fillRect(caretX, yBot, 8, caretH);
      }
    } else if (caretOn) {
      const row = Math.min(codeLinesVisible - 1, fullTail.length);
      const yTop = 8 + row * lineH;
      const yBot = yTop + lineH - caretH;
      g.fillStyle = PALETTE.ident;
      g.fillRect(8, yBot, 8, caretH);
    }

    // 3) Divider
    g.fillStyle = PALETTE.divider;
    g.fillRect(codeWidthPx, 0, 2, ctx.h);

    // 4) Right pane — mono, vibe-colored
    drawRightMono(g, outLines, codeWidthPx + 12, 8, outLinesVisible);
  }

  const api = { init, resize, clear, start, stop, frame };
  api.info = { family: 'developer', flavor: 'coding' };
  return api;
})();
