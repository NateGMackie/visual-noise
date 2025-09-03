// src/js/main.js

// 1) Load the terminology shim first (static import is fine)
import { installTerminologyAliases } from './compat/terminology_shim.js';

// 2) Create the app container and install the aliases BEFORE anything else touches state/events
const app = window.app || { state: {}, ui: {}, events: window.events };
window.app = app;   
installTerminologyAliases(app);


// 3) Dynamically import everything else AFTER the shim is installed
(async () => {
  const [
    stateMod,
    themesMod,
    modesMod,
    uiMod,
    gesturesMod,
    notifyMod
  ] = await Promise.all([
    import('./state.js'),
    import('./themes.js'),
    import('./modes/index.js'),
    import('./ui/ui.js'),
    import('./ui/gestures.js'),
    import('./ui/notify.js')
  ]);

  const { cfg, on, labelsForMode, labelsForGenreStyle } = stateMod;
  const { initThemes, applyTheme } = themesMod;
  const { registry: modeRegistry } = modesMod;
  const { initUI } = uiMod;
  const { initGestures } = gesturesMod;
  const { initNotify } = notifyMod;

  // ---------- One toast HUD instance ----------
  initNotify({ bus: { on }, labelsForMode });

  // ---------- Canvas / 2D context ----------
  const canvas = document.getElementById('canvas');
  const g = canvas.getContext('2d', { alpha: false });

  // ---------- Render context passed to modes ----------
  const ctx = {
    canvas,
    ctx2d: g,
    dpr: 1,
    w: 0, h: 0,
    now: 0, elapsed: 0, dt: 0,
    speed: cfg.speed,
    paused: cfg.paused,
    needsFullClear: false,
  };

  // Track last measured viewport/DPR
  let lastSize = { w: 0, h: 0, dpr: 0 };

  // ---------- Active mode orchestration ----------
  let activeModule = null;
  let loopId = 0;
  let lastT = performance.now();
  let stopGestures = null;

  // ---------- Utilities ----------
  function hardClear(ctx){
    // Clear the full device-pixel surface regardless of current transform
    g.save();
    g.setTransform(1,0,0,1,0,0);
    g.clearRect(0, 0, ctx.w, ctx.h);
    g.restore();
  }

  function refreshLikeModeChange(){
    // Make resizes/rotations visually identical to a mode switch
    fit({ force: true, fullClear: true });
    ctx.needsFullClear = true;
  }

  // Keep DPR scale active every frame (bulletproof against modes that only set it in init())
  function run(t){
    const raw = t - lastT;
    lastT = t;

    // clamp/apply speed
    const s = Math.max(0.25, Math.min(4, ctx.speed || 1));
    ctx.elapsed = ctx.paused ? 0 : Math.min(raw * s, 100);
    ctx.dt = ctx.elapsed / 1000;
    ctx.now = t;

    // Always render in CSS pixels → apply current DPR transform each frame
    g.setTransform(ctx.dpr, 0, 0, ctx.dpr, 0, 0);

    if (ctx.needsFullClear){
      hardClear(ctx);
      ctx.needsFullClear = false;
    }

    activeModule?.frame?.(ctx);
    loopId = requestAnimationFrame(run);
  }

  // Size canvas backing store to viewport; do NOT set transform here
  function fit({ force = false, fullClear = false } = {}){
    // Viewport CSS pixels
    const w = Math.max(1, Math.round(window.innerWidth  || 1));
    const h = Math.max(1, Math.round(window.innerHeight || 1));

    // Reasonable DPR cap
    const dpr = Math.min(Math.max(1, window.devicePixelRatio || 1), 2);

    if (!force && w === lastSize.w && h === lastSize.h && dpr === lastSize.dpr) return;
    lastSize = { w, h, dpr };

    // Device-pixel surface
    const devW = Math.max(1, Math.floor(w * dpr));
    const devH = Math.max(1, Math.floor(h * dpr));

    ctx.dpr = dpr;
    ctx.w = devW;
    ctx.h = devH;

    if (canvas.width !== devW)  canvas.width  = devW;
    if (canvas.height !== devH) canvas.height = devH;

    if (fullClear) hardClear(ctx);

    // Let mode react to size change
    activeModule?.resize?.(ctx);
  }

  // Mode bootstrapper
  function startModeByName(modeName){
    if (loopId) cancelAnimationFrame(loopId);
    activeModule?.stop?.(ctx);

    // Sizing + visual hygiene first
    refreshLikeModeChange();

    activeModule = modeRegistry[modeName] ?? modeRegistry.crypto;

    // Footer labels
// Footer labels
let genreLabel, styleLabel;
if (typeof labelsForGenreStyle === 'function') {
  const out = labelsForGenreStyle(modeName);
  genreLabel = out.genreLabel;
  styleLabel = out.styleLabel;
} else {
  const { familyLabel, typeLabel } = labelsForMode(modeName);
  genreLabel = familyLabel;
  styleLabel = typeLabel;
}

// Prefer new IDs; fall back to old ones for one release
const genreEl = document.getElementById('genreName') || document.getElementById('modeName');
const styleEl = document.getElementById('styleName') || document.getElementById('typeName');
if (genreEl) genreEl.textContent = genreLabel;
if (styleEl) styleEl.textContent = styleLabel;
// (Remove any line that sets vibeEl from an undefined vibeLabel)



    activeModule?.init?.(ctx);
    activeModule?.start?.(ctx);

    lastT = performance.now();
    loopId = requestAnimationFrame(run);
  }

  // ---------- Init UI / gestures / themes ----------
  initThemes();
  initUI();
  stopGestures = initGestures?.();

  // ---------- Window & document events ----------
  // Throttled resize
  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      refreshLikeModeChange();
    });
  }, { passive: true });

  // Orientation change
  window.addEventListener('orientationchange', () => {
    setTimeout(refreshLikeModeChange, 150);
  }, { passive: true });

  // Fullscreen changes can alter viewport size
  document.addEventListener('fullscreenchange', () => {
    setTimeout(refreshLikeModeChange, 50);
  });

  // ---------- Bus wiring ----------
// ---------- Bus wiring ----------
function handleStyleOrFlavor(id) {
  if (!activeModule) return;
  if (activeModule.setFlavor) {
    activeModule.setFlavor(ctx, id);
  } else {
    activeModule.stop?.(ctx);
    activeModule.init?.(ctx);
    activeModule.start?.(ctx);
  }
  const styleEl = document.getElementById('styleName') || document.getElementById('typeName');
  if (styleEl) styleEl.textContent = id;
}

function handleVibe(v) {
  applyTheme(v);
  const vibeEl = document.getElementById('vibeName') || document.getElementById('themeName');
  if (vibeEl) vibeEl.textContent = v;
}

// Legacy + new events (both supported during migration)
on('mode',   (name) => { startModeByName(name); });
on('flavor', (id)   => { handleStyleOrFlavor(id); });
on('theme',  (v)    => { handleVibe(v); });

on('genre',  (name) => { startModeByName(name); });
on('style',  (id)   => { handleStyleOrFlavor(id); });
on('vibe',   (v)    => { handleVibe(v); });

on('speed',  (s) => { ctx.speed  = s; });
on('paused', (p) => { ctx.paused = p; });
on('clear',  () => { activeModule?.clear?.(ctx); });

  // ---------- Boot ----------
  requestAnimationFrame(() => {
    refreshLikeModeChange();
    startModeByName(cfg.persona);

   const vibeEl = document.getElementById('vibeName') || document.getElementById('themeName');
   if (vibeEl && (cfg.vibe || cfg.theme)) vibeEl.textContent = (cfg.vibe || cfg.theme);
  });
})();
