/* eslint-env browser */
/**
 * Visual Noise — Toast Notifications (bottom-center, capsule, accents)
 * Keeps your existing API & bus wiring. Changes:
 *  - Default position: bottom-center (new)
 *  - Capsule shape, roomier padding, horizontal row layout
 *  - Per-channel color accents (genre/style/vibe/other)
 */

const NOTIFY = Object.freeze({
  genre: 'notify.genre',
  style: 'notify.style',
  vibe:  'notify.vibe',
  speed: 'notify.speed',
  state: 'notify.state',
  power: 'notify.power',
  fireHeight: 'notify.fire.height',
  fireFuel:   'notify.fire.fuel',
  // Legacy aliases
  system: 'notify.genre',
  program: 'notify.style',
});

// -------------------------
// Configuration
// -------------------------
const DEFAULTS = {
  durationMs: 2600,
  staggerMs: 220,
  coalesceWindowMs: 350,
  maxVisible: 3,
  // NEW: support 'bottom-center' (default)
  position: 'bottom-center', // 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'top-center'
  debug: false,
};

const CHANNEL_OPTIONS = {
  [NOTIFY.speed]:      { coalesce: true, durationMs: 900 },
  [NOTIFY.fireHeight]: { coalesce: true, durationMs: 900 },
  [NOTIFY.fireFuel]:   { coalesce: true, durationMs: 900 },
};

// -------------------------
// Internal state
// -------------------------
let _container;
const _toasts = new Map();
const _latestByChannel = new Map();
let _seq = 0;

let _wired = false;
let _busOn = null;
let _labelsForMode = null;
let _labelsForGenreStyle = null;
let _pending = [];

// -------------------------
// DOM bootstrapping
// -------------------------
function ensureContainer() {
  if (!_container) {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', () => {
        if (!_container) _container = createContainer();
        flushPending();
      }, { once: true });
      return null;
    }
    _container = createContainer();
    flushPending();
  }
  return _container;
}

function createContainer() {
  const wrap = document.createElement('div');
  wrap.id = 'vn-toasts';
  wrap.setAttribute('aria-live', 'polite');
  wrap.style.position = 'fixed';
  wrap.style.zIndex = 2147483646;
  wrap.style.pointerEvents = 'none'; // clicks pass through container

  // Flex stack orientation
  const pos = DEFAULTS.position;
  const verticalTop = pos.startsWith('top-');
  wrap.style.display = 'flex';
  wrap.style.flexDirection = verticalTop ? 'column' : 'column-reverse';
  wrap.style.gap = '8px';

  // Position presets
  const inset = '16px';
  if (pos === 'bottom-center' || pos === 'top-center') {
    wrap.style.left = '50%';
    wrap.style.transform = 'translateX(-50%)';
    if (verticalTop) wrap.style.top = inset; else wrap.style.bottom = inset;
  } else {
    const [v, h] = pos.split('-'); // e.g., bottom-right
    wrap.style[v === 'top' ? 'top' : 'bottom'] = inset;
    wrap.style[h === 'left' ? 'left' : 'right'] = inset;
  }

  document.body.appendChild(wrap);

  // Minimal CSS for capsule + row layout + accents
  const style = document.createElement('style');
  style.textContent = `
    /* Container provides stacking only; each toast handles its own pointer events */
    .vn-toast {
      pointer-events: auto;
      /* Capsule silhouette: long horizontal pill */
      border-radius: 9999px;
      /* Make text breathe + keep single-line layout comfy */
      padding: 10px 14px;
      /* Roomy width so content stays horizontal */
      min-width: 200px;
      max-width: 90vw;
      /* Aesthetic base */
      color: #fff;
      background: rgba(20,24,28,0.92);
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 8px 22px rgba(0,0,0,0.35);
      /* Enter/exit */
      opacity: 0;
      transform: translateY(10px);
      transition: transform 160ms ease, opacity 160ms ease;
      -webkit-font-smoothing: antialiased;
      user-select: none;
      font: 500 13px/1.25 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      backdrop-filter: saturate(120%) blur(6px);
    }
    .vn-toast.vn-in { transform: translateY(0); opacity: 1; }

    /* Horizontal content row */
    .vn-row {
      display: flex;
      align-items: baseline;
      gap: 10px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .vn-title {
      opacity: 0.8;
      font-weight: 600;
      letter-spacing: .3px;
      text-transform: uppercase;
      font-size: 11px;
      flex: 0 0 auto;
    }
    .vn-msg {
      font-weight: 700;
      min-width: 0; /* allow ellipsis */
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1 1 auto;
    }

    /* Subtle color accents by channel (genre/style/vibe vs other) */
    .vn-toast[data-channel="${NOTIFY.genre}"] { background: rgba(20, 60, 40, 0.92); }
    .vn-toast[data-channel="${NOTIFY.style}"] { background: rgba(60, 20, 40, 0.92); }
    .vn-toast[data-channel="${NOTIFY.vibe}"]  { background: rgba(40, 40, 40, 0.92); }

    /* Optional accents for others (tweak as desired) */
    .vn-toast[data-channel="${NOTIFY.speed}"]     { background: rgba(40, 40, 70, 0.92); }
    .vn-toast[data-channel="${NOTIFY.state}"]     { background: rgba(30, 30, 30, 0.92); }
    .vn-toast[data-channel="${NOTIFY.power}"]     { background: rgba(30, 50, 60, 0.92); }
    .vn-toast[data-channel="${NOTIFY.fireHeight}"]{ background: rgba(60, 30, 10, 0.92); }
    .vn-toast[data-channel="${NOTIFY.fireFuel}"]  { background: rgba(60, 30, 10, 0.92); }

    @media (prefers-reduced-motion: reduce) {
      .vn-toast { transition: none; transform: none; }
      .vn-toast.vn-in { transform: none; }
    }
  `;
  document.head.appendChild(style);
  return wrap;
}

function flushPending() {
  if (!_container || !_pending.length) return;
  for (const p of _pending) {
    _renderToast(p.channel, p.title, p.message, p.durationMs);
  }
  _pending.length = 0;
}

// -------------------------
// Helpers
// -------------------------
function getChannelOpts(channel) {
  return Object.assign({}, DEFAULTS, CHANNEL_OPTIONS[channel] || {});
}
function now() { return performance?.now?.() ?? Date.now(); }

function capVisible() {
  const toasts = Array.from(_toasts.values()).sort((a, b) => a.createdAt - b.createdAt);
  const excess = Math.max(0, toasts.length - DEFAULTS.maxVisible);
  for (let i = 0; i < excess; i++) hideToast(toasts[i]);
}

function hideToast(rec) {
  if (!rec || !rec.el) return;
  clearTimeout(rec.hideTimer);
  rec.el.classList.remove('vn-in');
  setTimeout(() => {
    if (rec.el && rec.el.parentNode) rec.el.parentNode.removeChild(rec.el);
  }, 180);
  _toasts.delete(rec.id);
  if (_latestByChannel.get(rec.channel) === rec.id) _latestByChannel.delete(rec.channel);
}

function scheduleHide(rec, durationMs) {
  clearTimeout(rec.hideTimer);
  rec.hideTimer = setTimeout(() => hideToast(rec), durationMs);
}

function _renderToast(channel, title, message, durationMs) {
  if (!ensureContainer()) {
    _pending.push({ channel, title, message, durationMs });
    return { id: null };
  }

  capVisible();

  const el = document.createElement('div');
  el.className = 'vn-toast';
  el.setAttribute('data-channel', channel);

  // Horizontal row
  const row = document.createElement('div');
  row.className = 'vn-row';

  const titleEl = document.createElement('div');
  titleEl.className = 'vn-title';
  titleEl.textContent = title;

  const msgEl = document.createElement('div');
  msgEl.className = 'vn-msg';
  msgEl.textContent = message;

  row.appendChild(titleEl);
  row.appendChild(msgEl);
  el.appendChild(row);

  _container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('vn-in'));

  const id = `t${++_seq}`;
  const rec = { id, el, channel, createdAt: now(), hideTimer: null };
  _toasts.set(id, rec);
  _latestByChannel.set(channel, id);
  scheduleHide(rec, durationMs);

  el.addEventListener('click', () => hideToast(rec));
  return rec;
}

function titleForChannel(channel) {
  switch (channel) {
    case NOTIFY.genre: return 'Genre';
    case NOTIFY.style: return 'Style';
    case NOTIFY.vibe:  return 'Vibe';
    case NOTIFY.speed: return 'Speed';
    case NOTIFY.state: return 'State';
    case NOTIFY.power: return 'Power';
    case NOTIFY.fireHeight: return 'Fire • Height';
    case NOTIFY.fireFuel:   return 'Fire • Fuel';
    default: return 'Notice';
  }
}

// -------------------------
// Public API
// -------------------------
function notify(channel, message, opts = {}) {
  const conf = Object.assign({}, getChannelOpts(channel), opts);
  const title = opts.title || titleForChannel(channel);

  if (conf.debug ?? DEFAULTS.debug) {
    console.info('[notify]', channel, message, conf);
  }

  if (conf.coalesce) {
    const existingId = _latestByChannel.get(channel);
    if (existingId) {
      const rec = _toasts.get(existingId);
      if (rec && rec.el) {
        const age = now() - rec.createdAt;
        if (age <= conf.coalesceWindowMs || true) {
          const msgEl = rec.el.querySelector('.vn-msg');
          const titleEl = rec.el.querySelector('.vn-title');
          if (titleEl) titleEl.textContent = title;
          if (msgEl) msgEl.textContent = message;
          scheduleHide(rec, conf.durationMs);
          return rec.id;
        }
      }
    }
  }

  const rec = _renderToast(channel, title, message, conf.durationMs);
  return rec.id;
}

function notifyGenreAndStyle(genreLabel, styleLabel, staggerMs = DEFAULTS.staggerMs) {
  notify(NOTIFY.genre, genreLabel);
  setTimeout(() => notify(NOTIFY.style, styleLabel), Math.max(120, Math.min(staggerMs, 400)));
}
const notifySystemAndProgram = notifyGenreAndStyle;

function setChannelOptions(channel, options) {
  CHANNEL_OPTIONS[channel] = Object.assign({}, CHANNEL_OPTIONS[channel] || {}, options);
}

function clearChannel(channel) {
  const id = _latestByChannel.get(channel);
  if (!id) return;
  const rec = _toasts.get(id);
  hideToast(rec);
}

function initNotify(options = {}) {
  Object.assign(DEFAULTS, pick(options, ['position', 'debug', 'staggerMs', 'durationMs', 'maxVisible']));

  _busOn = options?.bus?.on || null;
  _labelsForMode = typeof options?.labelsForMode === 'function' ? options.labelsForMode : null;
  _labelsForGenreStyle = typeof options?.labelsForGenreStyle === 'function' ? options.labelsForGenreStyle : null;

  if (_busOn && !_wired) {
    wireBus(_busOn);
    _wired = true;
  }
}

function wireBus(on) {
  // Mode/Genre → two toasts
  const startLabelsFor = (modeName) => {
    if (_labelsForGenreStyle) {
      const out = _labelsForGenreStyle(modeName);
      notifyGenreAndStyle(out.genreLabel, out.styleLabel);
    } else if (_labelsForMode) {
      const { familyLabel, typeLabel } = _labelsForMode(modeName);
      notifyGenreAndStyle(familyLabel, typeLabel);
    } else {
      notifyGenreAndStyle(String(modeName || 'Unknown'), 'Default');
    }
  };

  on('genre', startLabelsFor);
  on('mode',  startLabelsFor);

  on('style',  (id) => notify(NOTIFY.style, String(id)));
  on('flavor', (id) => notify(NOTIFY.style, String(id)));

  on('vibe',  (v) => notify(NOTIFY.vibe,  String(v)));
  on('theme', (v) => notify(NOTIFY.vibe,  String(v))); // legacy alias

  on('speed', (s) => {
    const val = typeof s === 'number' && s.toFixed ? s.toFixed(1) : String(s);
    notify(NOTIFY.speed, `Speed: ${val}×`, { coalesce: true });
  });

  on('paused', (p) => notify(NOTIFY.state, p ? 'Paused' : 'Resumed'));
  on('clear',  () => notify(NOTIFY.state, 'Cleared'));
  on('power',  (isOn) => notify(NOTIFY.power, `Screen awake: ${isOn ? 'ON' : 'OFF'}`));

  // Fire controls (numeric + step)
  on('fire.height', (h) => {
    // If you prefer only steps, comment this numeric line out.
    const val = typeof h === 'number' ? h.toFixed(2) : String(h);
    notify(NOTIFY.fireHeight, `Height: ${val}×`, { coalesce: true });
  });
  on('fire.height.step', (payload) => {
    let index, total;
    if (payload && typeof payload === 'object') ({ index, total } = payload);
    else { try { ({ index, total } = JSON.parse(payload)); } catch(_) {} }
    if (Number.isFinite(index) && Number.isFinite(total)) {
      notify(NOTIFY.fireHeight, `Height: ${index}/${total}`, { coalesce: true });
    }
  });

  // Keep one fuel numeric + one step handler (no duplicates)
  on('fire.fuel', (f) => {
    const val = (typeof f === 'number' && f.toFixed) ? f.toFixed(0) : String(f);
    notify(NOTIFY.fireFuel, `Fuel: ${val}%`, { coalesce: true });
  });
  on('fire.fuel.step', (payload) => {
    let index, total;
    if (payload && typeof payload === 'object') ({ index, total } = payload);
    else { try { ({ index, total } = JSON.parse(payload)); } catch(_) {} }
    if (Number.isFinite(index) && Number.isFinite(total)) {
      notify(NOTIFY.fireFuel, `Fuel: ${index}/${total}`, { coalesce: true });
    }
  });
}

function exposeToWindow() {
  if (typeof window !== 'undefined') {
    window.NOTIFY = NOTIFY;
    window.notify = notify;
    window.notifyGenreAndStyle = notifyGenreAndStyle;
    window.notifySystemAndProgram = notifySystemAndProgram;
    window.initNotify = initNotify;
  }
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}

export {
  NOTIFY,
  notify,
  notifyGenreAndStyle,
  notifySystemAndProgram,
  setChannelOptions,
  clearChannel,
  initNotify,
  exposeToWindow,
};
