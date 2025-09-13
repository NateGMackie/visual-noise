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

  // ---------- vibe-aware palette (robust fallbacks) ----------
  /**
   * Read a CSS variable with a JS fallback.
   * @param {string} name - CSS variable name, e.g. "--output-fg".
   * @param {string} fallback - Fallback value if the variable is unset/empty.
   * @returns {string} Resolved CSS value.
   */
  function cssVar(name, fallback) {
    const v = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  /**
   * Read the current palette from the active vibe/theme.
   * @returns {Record<string,string>} A palette of named colors for this mode.
   */
  function readPalette() {
    // Try multiple vibe-driven vars before falling back to document colors.
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
      string: cssVar('--code-string', '#fff'),
      number: cssVar('--code-number', '#ffd18a'),
      comment: cssVar('--code-comment', '#03ffaf'),
      punct: cssVar('--code-punct', '#cfcfcf'),
      ident: cssVar('--code-ident', '#9de7ff'),
      // Layout + right side mono color (vibe-driven)
      divider: cssVar('--pane-divider', '#3a3a3a'),
      output: outputMono,
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

  /**
   * Tokenize a JS-ish line for lightweight syntax coloring.
   * @param {string} line - Single source line to tokenize.
   * @returns {{text:string,type:string}[]} Array of tokens with type tags.
   */
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

  /**
   * Draw a syntax-highlighted line at (x,y).
   * @param {CanvasRenderingContext2D} g - 2D context.
   * @param {string} line - Line to render.
   * @param {number} x - Left position in px.
   * @param {number} y - Top position in px.
   * @returns {void}
   */
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
  /**
   * Push with ring buffer cap.
   * @param {string[]} buf - Target buffer.
   * @param {string} line - Line to append.
   * @param {number} cap - Max size; trims from head when exceeded.
   * @returns {void}
   */
  function pushCapped(buf, line, cap) {
    buf.push(line);
    if (buf.length > cap) buf.shift();
  }

  /**
   * Pick a random element from an array.
   * @template T
   * @param {T[]} arr - Source array.
   * @returns {T} A randomly selected element from the array.
   */
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Draw right-pane log output using the vibe’s mono color.
   * @param {CanvasRenderingContext2D} g - 2D context.
   * @param {string[]} lines - Output buffer.
   * @param {number} x - Left position in px.
   * @param {number} y - Top position in px.
   * @param {number} maxVisible - Max lines to render.
   * @returns {void}
   */
  function drawRightMono(g, lines, x, y, maxVisible) {
    g.fillStyle = PALETTE.output;
    const tail = lines.slice(-maxVisible);
    for (let i = 0; i < tail.length; i++) g.fillText(tail[i], x, y + i * lineH);
  }

  /**
   * Map the global speed multiplier into per-loop intervals.
   * @param {number} mult - Global speed multiplier (≈0.4–1.6).
   * @returns {void}
   */
  function applySpeed(mult) {
    const m = Math.max(0.4, Math.min(1.6, Number(mult) || 1));
    codeIntervalMs = Math.max(60, Math.round(codeIntervalMsBase / m));
    outIntervalMs = Math.max(120, Math.round(outIntervalMsBase / m));
    typeSpeedMs = Math.max(12, Math.round(typeSpeedMsBase / m));
  }

  // ---------- sizing/typography (match mining.js behavior) ----------
  /**
   * Sync canvas transform and typography to CSS pixels & modular scale.
   * (Matches mining.js approach so fonts look uniform and stable on resize/rotate.)
   * @param {{ctx2d:CanvasRenderingContext2D,w:number,h:number,dpr?:number}} ctx - Render context providing the 2D canvas, size, and device-pixel ratio used to compute the DPR transform and font metrics.
   * @returns {void} Updates the canvas transform, font size, and line height so drawing occurs in CSS pixels.
   */
  function syncTypography(ctx) {
    const g = ctx.ctx2d;
    const dpr = ctx.dpr || window.devicePixelRatio || 1;

    // Draw in CSS pixels: scale device pixels down by DPR.
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Use modular(0) like mining; keep a sane floor for tiny screens.
    fontPx = Math.max(12, Math.round(modular(0)));
    g.font = `${fontPx}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    g.textBaseline = 'top';

    // Slightly tighter than 1.25 for coding; mining uses ~1.15
    lineH = Math.max(12, Math.round(fontPx * 1.15));
  }

  // ---------- lifecycle ----------
  /**
   * Initialize mode (fonts, palette, buffers, listeners).
   * @param {{ctx2d:CanvasRenderingContext2D,w:number,h:number,dpr?:number}} ctx - Render context used to configure drawing and metrics.
   * @returns {void} Prepares internal state, seeds the right pane, and attaches theme/vibe listeners.
   */
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

    // seed right pane so it isn’t blank
    for (let i = 0; i < 3; i++) pushCapped(outLines, pick(OUTPUT_SNIPPETS), MAX_OUT_LINES);

    // listen for vibe/theme changes and refresh palette live
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

    resize(ctx);
  }

  /**
   * Handle canvas resizes (mirror mining.js: recompute metrics in CSS px).
   * @param {{w:number,h:number,dpr?:number,ctx2d:CanvasRenderingContext2D}} ctx - Render context.
   * @returns {void}
   */
  function resize(ctx) {
    PALETTE = readPalette();
    syncTypography(ctx);

    const dpr = ctx.dpr || window.devicePixelRatio || 1;
    const W = Math.max(1, Math.round(ctx.w / dpr));
    const H = Math.max(1, Math.round(ctx.h / dpr));

    codeWidthPx = Math.floor(W * 0.7) | 0;
    codeLinesVisible = Math.max(4, Math.floor(H / lineH));
    outLinesVisible = codeLinesVisible;
  }

  /**
   * Clear canvas and internal buffers.
   * @param {{ctx2d:CanvasRenderingContext2D,w:number,h:number}} ctx - Render context.
   * @returns {void}
   */
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
  }

  /**
   * Start hook (no-op to mirror other modes).
   * @returns {void} No value; lifecycle stub for parity with other modes.
   */
  function start() {}

  /** @returns {void} */
  function stop() {
    // detach vibe/theme listeners we added in init()
    const bus = window.app && window.app.events;
    if (bus && typeof bus.off === 'function') {
      if (__onTheme) bus.off('theme', __onTheme);
      if (__onVibe) bus.off('vibe', __onVibe);
    }
    __onTheme = null;
    __onVibe = null;
  }

  /**
   * Per-frame update & draw.
   * @param {{ctx2d:CanvasRenderingContext2D,w:number,h:number,elapsed:number,dt:number,speed:number}} ctx - Render context.
   * @returns {void}
   */
  function frame(ctx) {
    const g = ctx.ctx2d;

    // Keep timing in sync with the global speed model
    applySpeed(ctx.speed);

    // IMPORTANT: do not fall back to non-zero when paused.
    // main.js sets these to 0 when ctx.paused === true.
    const dtMs = ctx.elapsed; // 0 while paused
    const dtS = ctx.dt; // 0 while paused

    // --- RIGHT PANE cadence ---
    accOutMs += dtMs;
    while (accOutMs >= outIntervalMs) {
      accOutMs -= outIntervalMs;
      pushCapped(outLines, pick(OUTPUT_SNIPPETS), MAX_OUT_LINES);
    }

    // --- LEFT PANE typing loop ---
    if (!partialLine) {
      accCodeMs += dtMs; // cooldown before starting a line
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
          // Line finished — commit to buffer and clear partial
          pushCapped(codeLines, partialLine, MAX_CODE_LINES);
          partialLine = null;
          partialIdx = 0;
          break;
        }
      }
    }

    // Caret blink (also halted while paused since dtS === 0)
    accCaretS += dtS;
    if (accCaretS >= CARET_PERIOD_S) {
      accCaretS -= CARET_PERIOD_S;
      caretOn = !caretOn;
    }

    // ---- DRAW (CSS pixels thanks to setTransform) ----
    g.clearRect(0, 0, ctx.w, ctx.h);

    // LEFT PANE: keep the last row free for the active typed line
    const fullTailAll = codeLines.slice(-codeLinesVisible);
    const mustReserveRowForPartial = !!partialLine && fullTailAll.length >= codeLinesVisible;
    const fullTail = mustReserveRowForPartial ? fullTailAll.slice(1) : fullTailAll;

    // draw full committed lines
    for (let i = 0; i < fullTail.length; i++) {
      drawHighlightedLine(g, fullTail[i], 8, 8 + i * lineH);
    }

    // caret metrics (bottom-aligned)
    const caretH = Math.max(2, Math.floor(lineH * 0.12));

    // draw the active partial line at the next row (reserved if needed)
    if (partialLine) {
      const row = Math.min(codeLinesVisible - 1, fullTail.length);
      const yTop = 8 + row * lineH; // textBaseline='top'
      const yBot = yTop + lineH - caretH; // caret sits at bottom of line box
      const typed = partialLine.slice(0, partialIdx);
      drawHighlightedLine(g, typed, 8, yTop);

      if (caretOn) {
        const caretX = 8 + g.measureText(typed).width;
        g.fillRect(caretX, yBot, 8, caretH);
      }
    } else if (caretOn) {
      // idle caret at the next new line after the fullTail block
      const row = Math.min(codeLinesVisible - 1, fullTail.length);
      const yTop = 8 + row * lineH;
      const yBot = yTop + lineH - caretH;
      g.fillRect(8, yBot, 8, caretH);
    }

    // Divider
    g.fillStyle = PALETTE.divider;
    g.fillRect(codeWidthPx, 0, 2, ctx.h);

    // Right pane — mono, vibe-colored
    drawRightMono(g, outLines, codeWidthPx + 12, 8, outLinesVisible);
  }

  const api = { init, resize, clear, start, stop, frame };
  api.info = { family: 'developer', flavor: 'coding' };
  return api;
})();
