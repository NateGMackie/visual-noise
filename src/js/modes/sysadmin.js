// Console-style sysadmin stream: services, ping, disk, kube, nginx, auth, cron.

export const sysadmin = (() => {
let fontSize = 16, lineH = 18, rows = 40, cols = 80;
let buffer = [];
let maxLines = 200;
let emitAcc = 0;
let emitEvery = 200; // slower baseline for readability
let running = false;
let cursorBlink = 0;

const spinner = ['⠁','⠃','⠇','⠧','⠷','⠿','⠟','⠻','⠹','⠸'];
let spinIdx = 0;

function push(l){
  buffer.push(l);
  if (buffer.length > maxLines) buffer.splice(0, buffer.length - maxLines);
}
function randInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
function ip(){ return `${randInt(10,223)}.${randInt(0,255)}.${randInt(0,255)}.${randInt(1,254)}`; }
function pod(){ return `web-${randInt(1,3)}-` + Math.random().toString(36).slice(2,7); }
function svc(){ return ['nginx','redis','postgres','queue','authd','filesync'][randInt(0,5)]; }

function sample(){
  const r = Math.random();

  if (r < 0.18){
    push(`systemd: ${svc()}.service active (running) pid=${randInt(200,9000)} mem=${(Math.random()*512).toFixed(1)}Mi`);
  } else if (r < 0.32){
    push(`nginx: 200 GET /healthz ${randInt(1,3)}ms • 200 GET / ${randInt(5,28)}ms • 404 /favicon.ico ${randInt(0,2)}ms`);
  } else if (r < 0.46){
    push(`sshd: accepted password for deploy from ${ip()} port ${randInt(20000,65000)} ssh2`);
  } else if (r < 0.60){
    spinIdx = (spinIdx+1) % spinner.length;
    push(`ping ${spinner[spinIdx]} ${ip()} time=${(Math.random()*40+2).toFixed(2)} ms`);
  } else if (r < 0.74){
    const used = randInt(32, 95);
    push(`disk: /dev/sda1 ${used}% used • /var ${randInt(18,88)}% • inode ${randInt(20,70)}%`);
  } else if (r < 0.86){
    push(`cron: (${['root','app','backup'][randInt(0,2)]}) CMD (${['logrotate','pg_dump','cache:warm'][randInt(0,2)]}) EXIT=0`);
  } else if (r < 0.94){
    push(`kube: pod ${pod()} Ready 1/1 • restart=${randInt(0,3)} • node=ip-${ip().replace(/\./g,'-')}`);
  } else {
    push(`audit: user=${['deploy','svc_web','svc_queue'][randInt(0,2)]} sudo=${['ALLOW','ALLOW','DENY'][randInt(0,2)]} cmd="${['systemctl status','journalctl -xe','kubectl logs'][randInt(0,2)]}"`);
  }

  if (Math.random() < 0.10){
    push(`journal: write=${(Math.random()*2.4).toFixed(2)}MB/s rotate=${randInt(5,24)}h max=1.0GB`);
  }
}

function init(ctx){
  fontSize = Math.max(12, Math.floor(0.018 * Math.min(ctx.w, ctx.h)));
  lineH = Math.floor(fontSize * 1.15);
  rows = Math.floor((ctx.h/ctx.dpr) / lineH);
  cols = Math.floor((ctx.w/ctx.dpr) / (fontSize*0.62));
  buffer = [];
  maxLines = rows * 5;
  lastEmit = 0;
}

function resize(ctx){
  init(ctx);
}

function start(){ running = true; }
function stop(){ running = false; }

function frame(ctx){
  const g = ctx.ctx2d;
  const W = ctx.w/ctx.dpr, H = ctx.h/ctx.dpr;

 if (running && !ctx.paused){
  emitAcc += ctx.elapsed;
  const step = emitEvery; // already scaled globally by main.js
  while (emitAcc >= step){
    sample();
    emitAcc -= step;
  }
 }

  // subtle persistence
  g.fillStyle = 'rgba(0,0,0,0.20)';
  g.fillRect(0,0,W,H);

 if (running && !ctx.paused){
   // accumulate elapsed that already includes global speed scaling
   lastEmit += ctx.elapsed;
   while (lastEmit >= emitEvery){
     sample();
     lastEmit -= emitEvery;
   }
 }

  const start = Math.max(0, buffer.length - rows);
  const lines = buffer.slice(start);

  g.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  g.textBaseline = 'top';
  const fg = getComputedStyle(document.documentElement).getPropertyValue('--fg') || '#03ffaf';
  g.fillStyle = fg.trim() || '#03ffaf';

  let y = 4;
  const xPad = 8;

  for (let i=0;i<lines.length;i++){
    const t = lines[i];
    g.fillText(t.length > cols ? t.slice(0, cols-1)+'…' : t, xPad, y);
    y += lineH;
  }

  cursorBlink = (cursorBlink + ctx.elapsed) % 1000;
  if (cursorBlink < 520){
    g.fillText('▍', xPad, y);
  }
}})();
