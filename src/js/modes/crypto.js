// src/js/modes/crypto.js
// Console-style crypto stream: mempool txs, headers, peers, sync, etc.
export const crypto = (() => {
  // ——— Internal state ———
  let fontSize = 16, lineH = 18, cols = 80, rows = 40;
  let buffer = [];             // recent lines
  let maxLines = 200;          // ring buffer cap
  let lastEmitMs = 0;          // last emitted real timestamp (ms)
  let emitIntervalMs = 90;     // nominal cadence between lines
  let cursorBlinkMs = 0;
  let running = false;         // toggled by start/stop
  let emitAccumulator = 0;     // accumulates ctx.elapsed for cadence

  const spinner = ['|','/','-','\\'];
  let spinIdx = 0;

  // ——— Helpers ———
  const readVar = (name, fallback) =>
    getComputedStyle(document.documentElement).getPropertyValue(name)?.trim() || fallback;

  function randHex(n){
    // IMPORTANT: explicitly use globalThis.crypto to avoid name shadowing
    const bytes = new Uint8Array(n);
    globalThis.crypto.getRandomValues(bytes);
    return [...bytes].map(b => b.toString(16).padStart(2,'0')).join('');
  }
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const shortHash = () => randHex(4) + '…' + randHex(2);
  const addr = () => 'bc1q' + randHex(10).slice(0, 10);

  function push(line){
    buffer.push(line);
    if (buffer.length > maxLines) buffer.splice(0, buffer.length - maxLines);
  }

  function sampleLines(){
    // mix of tx, net, and chain messages
    const roll = Math.random();

    if (roll < 0.40){
      const v = (Math.random()*1.2).toFixed(4);
      push(`mempool: tx=${shortHash()} from=${addr()} fee=${(randInt(2,95))} sat/vB v=${v} BTC`);
    } else if (roll < 0.60){
      push(`peer: ${randInt(12,223)}.${randInt(0,255)}.${randInt(0,255)}.${randInt(1,254)} ver=${randInt(70015, 70030)} inv=${randInt(2,18)} ping=${(Math.random()*120).toFixed(1)}ms`);
    } else if (roll < 0.75){
      push(`header: height=${randInt(845000, 855000)} diff=${(Math.random()*1.0+1).toFixed(3)} target=${shortHash()}… time=${new Date().toISOString()}`);
    } else if (roll < 0.90){
      spinIdx = (spinIdx + 1) % spinner.length;
      const pct = (Math.random()*100).toFixed(2);
      push(`sync ${spinner[spinIdx]} headers ${pct}%  tip=${shortHash()} peers=${randInt(6,15)}`);
    } else {
      push(`block: ${shortHash()} txs=${randInt(500,3000)} size=${(Math.random()*1.2+0.8).toFixed(2)}MB fees=${(Math.random()*1.8).toFixed(2)} BTC nonce=${randInt(1e6, 9e6)}`);
    }

    // occasional compact “trace”
    if (Math.random() < 0.12){
      push(`trace: verify sig=${shortHash()} ok • update utxo • write mempool journal`);
    }
  }

  // ——— Mode API ———
  function init(ctx){
    // choose a comfortable font size vs canvas size
    fontSize = Math.max(12, Math.floor(0.018 * Math.min(ctx.w, ctx.h)));
    lineH = Math.floor(fontSize * 1.15);
    rows = Math.floor((ctx.h/ctx.dpr) / lineH);
    cols = Math.floor((ctx.w/ctx.dpr) / (fontSize * 0.62));
    buffer = [];
    maxLines = rows * 5;
    emitAccumulator = 0;
    lastEmitMs = performance.now();
  }

  function resize(ctx){
    init(ctx);
  }

  function start(){ running = true; }
  function stop(){ running = false; }

  function clear(ctx){
    buffer = [];
    ctx.ctx2d.clearRect(0, 0, ctx.w, ctx.h);
  }

  function frame(ctx){
    const g = ctx.ctx2d;
    const W = ctx.w / ctx.dpr, H = ctx.h / ctx.dpr;

    // gentle fade over previous frame to get a trailing effect
    const bg = readVar('--bg', '#000');
    g.fillStyle = 'rgba(0,0,0,0.18)';
    // If bg isn't black, do a soft overlay toward bg (optional; keeping simple)
    g.fillRect(0, 0, W, H);

    // emit new lines on a cadence; respect pause/speed via ctx.elapsed
    if (running && !ctx.paused){
      emitAccumulator += ctx.elapsed;
      while (emitAccumulator >= emitIntervalMs){
        sampleLines();
        emitAccumulator -= emitIntervalMs;
      }
    }

    // draw lines from the end (tail -n rows)
    const startIdx = Math.max(0, buffer.length - rows);
    const lines = buffer.slice(startIdx);

    g.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    g.textBaseline = 'top';
    const fg = readVar('--fg', '#03ffaf');
    g.fillStyle = (fg || '#03ffaf').trim();

    let y = 4;
    const xPad = 8;
    for (let i = 0; i < lines.length; i++){
      const txt = lines[i];
      g.fillText(txt.length > cols ? txt.slice(0, cols - 1) + '…' : txt, xPad, y);
      y += lineH;
    }

    // blinking cursor in final line space
    cursorBlinkMs = (cursorBlinkMs + ctx.elapsed) % 1000;
    if (cursorBlinkMs < 520){
      g.fillText('▍', xPad, y);
    }
  }

  return { init, resize, start, stop, frame, clear };
})();
