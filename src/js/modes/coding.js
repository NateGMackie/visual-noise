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

// --- vibe/theme event hooks (cleanly attached/detached) ---
let __onTheme = null;
let __onVibe = null;

export const coding = (() => {
  /** @type {string[]} */ let codeLines = [];
  /** @type {string[]} */ let outLines = [];

  // Layout
  let codeWidthPx = 0;
  let codeLinesVisible = 0;
  let outLinesVisible = 0;
  let lineH = 18;

  // Typography
  const fontPx = 14;
  const font = `${fontPx}px monospace`;

  // ---- cadence baselines (ms) ----
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
   * @returns {void} Draws text into the 2D context.
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
   * @returns {void} Updates the buffer in-place.
   */
  function pushCapped(buf, line, cap) {
    buf.push(line);
    if (buf.length > cap) buf.shift();
  }

  /**
   * Pick a random element from an array.
   * @template T
   * @param {T[]} arr - Source array.
   * @returns {T} A randomly selected element.
   */
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // Right pane: vibe-colored mono
  /**
   * Draw right-pane log output using the vibe’s mono color.
   * @param {CanvasRenderingContext2D} g - 2D context.
   * @param {string[]} lines - Output buffer.
   * @param {number} x - Left position in px.
   * @param {number} y - Top position in px.
   * @param {number} maxVisible - Max lines to render.
   * @returns {void} Draws text into the 2D context.
   */
  function drawRightMono(g, lines, x, y, maxVisible) {
    g.fillStyle = PALETTE.output;
    const tail = lines.slice(-maxVisible);
    for (let i = 0; i < tail.length; i++) g.fillText(tail[i], x, y + i * lineH);
  }

  /**
   * Map the global speed multiplier into per-loop intervals.
   * @param {number} mult - Global speed multiplier (≈0.4–1.6).
   * @returns {void} Updates internal cadence variables.
   */
  function applySpeed(mult) {
    const m = Math.max(0.4, Math.min(1.6, Number(mult) || 1));
    codeIntervalMs = Math.max(60, Math.round(codeIntervalMsBase / m));
    outIntervalMs = Math.max(120, Math.round(outIntervalMsBase / m));
    typeSpeedMs = Math.max(12, Math.round(typeSpeedMsBase / m));
  }

  // ---------- lifecycle ----------
  /**
   * Initialize mode (fonts, palette, buffers, listeners).
   * @param {{ctx2d:CanvasRenderingContext2D,w:number,h:number}} ctx - Render context.
   * @returns {void} Prepares internal state for rendering.
   */
  function init(ctx) {
    const g = ctx.ctx2d;
    PALETTE = readPalette();

    g.font = font;
    g.textBaseline = 'top';
    lineH = Math.round(fontPx * 1.25) || 18;

    codeLines = [];
    outLines = [];
    partialLine = null;
    partialIdx = 0;
    accCodeMs = 0;
    accOutMs = 0;
    accTypeMs = 0;
    accCaretS = 0;
    caretOn = true;

    // seed right pane a bit so it isn’t blank
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
      bus.on('theme', __onTheme); // themes applied via main.js handler
      bus.on('vibe', __onVibe); // alias for style systems
    }

    resize(ctx);
  }

  /**
   * Handle canvas resizes.
   * @param {{w:number,h:number}} ctx - Render context.
   * @returns {void} Recomputes layout metrics.
   */
  // Replace your current resize() with this:
function resize(ctx) {
  // pick up vibe changes on resize/theme swap
  PALETTE = readPalette();

  // Use logical (CSS px) size, not device px.
  const dpr = ctx.dpr || 1;
  const W = Math.max(1, Math.round(ctx.w / dpr));
  const H = Math.max(1, Math.round(ctx.h / dpr));

  codeWidthPx = Math.floor(W * 0.70) | 0;
  lineH = Math.round(fontPx * 1.25) || 18;

  // Lines visible should also be based on CSS px height.
  codeLinesVisible = Math.max(4, Math.floor(H / lineH));
  outLinesVisible = codeLinesVisible;
}


  /**
   * Clear canvas and internal buffers.
   * @param {{ctx2d:CanvasRenderingContext2D,w:number,h:number}} ctx - Render context.
   * @returns {void} Resets internal buffers and clears the surface.
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

  /** @returns {void} No-op lifecycle hook. */
  function start() {}

  /** @returns {void} Detaches vibe/theme listeners. */
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
   * @returns {void} Advances timers and renders both panes.
   */
  function frame(ctx) {
    const g = ctx.ctx2d;

    // Mining-style: map speed each frame; driven from shared render loop.
    applySpeed(ctx.speed);

    const dtMs = ctx.elapsed || 16;
    const dtS = ctx.dt || dtMs / 1000;

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

    // Caret blink
    accCaretS += dtS;
    if (accCaretS >= CARET_PERIOD_S) {
      accCaretS -= CARET_PERIOD_S;
      caretOn = !caretOn;
    }

    // ---- DRAW ----
    g.clearRect(0, 0, ctx.w, ctx.h);

    // ----- LEFT PANE: keep the last row free for the active typed line -----
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
