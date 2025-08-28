
// src/js/modes/mining.js
// "Mining" mode: timestamped, uppercase tags, occasional typing effect, and dot progress bars.
export const mining = (() => {
  // ——— Internal state ———
  let fontSize = 16, lineH = 18, cols = 80, rows = 40;
  let buffer = [];             // recent lines
  let maxLines = 200;          // ring buffer cap
  let running = false;         // toggled by start/stop
  let emitAccumulator = 0;     // accumulates ctx.elapsed for cadence
  let emitIntervalMs = 120;    // base cadence between full lines (stream mode)
  let typeSpeedMs = 22;        // per-character typing speed when in typing mode
  let typingChance = 0.22;     // probability that a new line is typed character-by-character
  let partialLine = null;      // active typing line
  let partialIdx = 0;
  let typeAccumulator = 0;
  let cursorBlinkMs = 0;

  // ——— Helpers ———
  const readVar = (name, fallback) =>
    getComputedStyle(document.documentElement).getPropertyValue(name)?.trim() || fallback;

  function randHex(n){
    const bytes = new Uint8Array(n);
    globalThis.crypto.getRandomValues(bytes);
    return [...bytes].map(b => b.toString(16).padStart(2,'0')).join('');
  }
  const rBetween = (min,max)=> Math.random()*(max-min)+min;
  const rInt = (min,max)=> Math.floor(rBetween(min, max+1));
  const pick = (arr)=> arr[rInt(0, arr.length-1)];
  const timeStamp = ()=> new Date().toTimeString().slice(0,8);
  const shortHash = () => randHex(4) + '…' + randHex(2);

  function push(line){
    buffer.push(line);
    if (buffer.length > maxLines) buffer.splice(0, buffer.length - maxLines);
  }

  // ——— Content generators (derived from backup.html crypto persona) ———
  const barFill = '█', barEmpty = '·'; // dots only (per request)

  const cryptoCmds = ['HANDSHAKE','DERIVE-KEY','EXPAND-KEY','ENCRYPT','DECRYPT','ROTATE-KEYS','SEAL','UNSEAL','ATTEST','HKDF','PBKDF2','SCRYPT','ARGON2','SHA256','SHA512','BLAKE3','KECCAK','SIGN','VERIFY'];
  const pathbits = ['SRV','VAULT','NODE','SHARD','CLUSTER','CORE','IO','BUS','NET','GPU0','GPU1','CPU0','MEM','CACHE','DISK0'];
  const levels = ['INFO','WARN','TRACE','DEBUG'];
  let progress = 0;

  function makeProgBar(pct){
    const width = 20;
    const filled = Math.round(pct/100*width);
    return barFill.repeat(filled) + barEmpty.repeat(width-filled);
  }

  function makeLine(){
    const choice = Math.random();
    if(choice < 0.16){
      progress += rInt(1,7); if(progress > 100) progress = 0;
      const bar = makeProgBar(progress);
      return `[${timeStamp()}] PROG ${String(progress).padStart(3,' ')}%  [${bar}]`;
    } else if(choice < 0.32) {
      const bytes = Array.from({length: rInt(8,16)}, () => randHex(2)).join(' ');
      return `[${timeStamp()}] HEX   ${randHex(8)}: ${bytes}`;
    } else if(choice < 0.48) {
      const cmd = pick(cryptoCmds);
      const node = pick(pathbits)+'/'+pick(pathbits)+'/'+rInt(0,9);
      return `[${timeStamp()}] ${pick(levels)}   ${cmd} --SRC ${node} --KEY 0x${randHex(16)} --IV 0x${randHex(8)} ... OK`;
    } else if(choice < 0.64) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let s=''; const len=rInt(22,54); for(let i=0;i<len;i++) s += chars[rInt(0,chars.length-1)];
      return `[${timeStamp()}] BLOB  ${s}==`;
    } else if(choice < 0.80) {
      const words = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua".split(' ');
      const n = rInt(6,14);
      const msg = Array.from({length:n}, ()=> pick(words)).join(' ').toUpperCase();
      return `[${timeStamp()}] NOTE  ${msg}.`;
    } else {
      return `[${timeStamp()}] STAT  LAT=${rInt(2,80)}ms  SHARDS=${rInt(1,6)}  TEMP=${(rBetween(35,78)).toFixed(1)}°C  NONCE=0x${randHex(6)}`;
    }
  }

  // ——— Mode API ———
  function init(ctx){
    fontSize = Math.max(12, Math.floor(0.018 * Math.min(ctx.w, ctx.h)));
    lineH = Math.floor(fontSize * 1.15);
    rows = Math.floor((ctx.h/ctx.dpr) / lineH);
    cols = Math.floor((ctx.w/ctx.dpr) / (fontSize * 0.62));
    buffer = [];
    maxLines = rows * 5;
    emitAccumulator = 0;
    typeAccumulator = 0;
    partialLine = null;
    partialIdx = 0;
  }

  function resize(ctx){ init(ctx); }
  function start(){ running = true; }
  function stop(){ running = false; }
  function clear(ctx){
    buffer = [];
    ctx.ctx2d.clearRect(0, 0, ctx.w, ctx.h);
  }

  function frame(ctx){
    const g = ctx.ctx2d;
    const W = ctx.w / ctx.dpr, H = ctx.h / ctx.dpr;

    // soft fade to create trail
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(0, 0, W, H);

    // emission logic
    if (running && !ctx.paused){
      // if currently typing a line, advance characters based on elapsed
      if (partialLine){
        typeAccumulator += ctx.elapsed;
        while (typeAccumulator >= typeSpeedMs && partialLine){
          typeAccumulator -= typeSpeedMs;
          partialIdx++;
          if (partialIdx >= partialLine.length){
            // finalize the full line into buffer
            push(partialLine);
            partialLine = null;
            partialIdx = 0;
          }
        }
      } else {
        // chance to start a new typed line or emit a full line
        emitAccumulator += ctx.elapsed;
        while (emitAccumulator >= emitIntervalMs && !partialLine){
          emitAccumulator -= emitIntervalMs;
          if (Math.random() < typingChance){
            partialLine = makeLine();
            partialIdx = 0;
            typeAccumulator = 0;
          } else {
            push(makeLine());
          }
        }
      }
    }

    // compute visible lines (tail -n rows), also include a composed line with cursor if typing
    let lines = buffer.slice(Math.max(0, buffer.length - rows));
    let typingPreview = null;
    if (partialLine){
      typingPreview = partialLine.slice(0, Math.min(partialIdx, cols-1));
      // reserve last row for typing preview
      if (lines.length >= rows) lines = lines.slice(1);
    }

    // draw text
    g.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    g.textBaseline = 'top';
    const fg = readVar('--fg', '#9fffb3').trim();
    g.fillStyle = fg || '#9fffb3';

    let y = 4;
    const xPad = 8;
    for (let i = 0; i < lines.length; i++){
      const txt = lines[i];
      const out = txt.length > cols ? txt.slice(0, cols - 1) + '…' : txt;
      g.fillText(out, xPad, y);
      y += lineH;
    }

    // draw typing line with blinking cursor
    cursorBlinkMs = (cursorBlinkMs + ctx.elapsed) % 1000;
    if (typingPreview !== null){
      const withCursor = cursorBlinkMs < 520 ? typingPreview + ' ▋' : typingPreview;
      g.fillText(withCursor, xPad, y);
    } else {
      // idle cursor at the end
      if (cursorBlinkMs < 520){
        g.fillText('▍', xPad, y);
      }
    }
  }

  return { init, resize, start, stop, frame, clear };
})();
