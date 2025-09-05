/* eslint-env browser */
/**
 * Visual Noise — Toast Notifications (UI Wire-up + Coalescing)
 * ------------------------------------------------------------
 * Channels:
 *  - 'notify.genre'
 *  - 'notify.style'
 *  - 'notify.vibe'
 *  - 'notify.speed'  (coalesced)
 *  - 'notify.state'  (pause/clear)
 *  - 'notify.power'  (screen awake)
 *
 * Legacy aliases:
 *  - NOTIFY.system  -> 'notify.genre'
 *  - NOTIFY.program -> 'notify.style'
 */

const NOTIFY = Object.freeze({
  // Canonical
  genre: 'notify.genre',
  style: 'notify.style',
  vibe:  'notify.vibe',
  speed: 'notify.speed',
  state: 'notify.state',
  power: 'notify.power',
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
  position: 'bottom-right', // 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  debug: false,
};

// Per-channel overrides (optional)
const CHANNEL_OPTIONS = {
  [NOTIFY.speed]: { coalesce: true, durationMs: 1200 },
  // Example: [NOTIFY.vibe]: { durationMs: 1800 },
};

// -------------------------
// Internal state
// -------------------------
let _container;
const _toasts = new Map();          // id -> record
const _latestByChannel = new Map(); // channel -> id
let _seq = 0;

let _wired = false;                 // bus wire-up guard
let _busOn = null;                  // function
let _labelsForMode = null;          // function (legacy)
let _labelsForGenreStyle = null;    // function (new)
let _pending = [];                  // queued toasts before body exists

// -------------------------
// DOM bootstrapping
// -------------------------
function ensureContainer() {
  // If body isn't ready yet, defer and return null.
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
  wrap.setAttribute('id', 'vn-toasts');
  wrap.setAttribute('aria-live', 'polite');
  wrap.style.position = 'fixed';
  const [v, h] = DEFAULTS.position.split('-');
  wrap.style[v === 'top' ? 'top' : 'bottom'] = '12px';
  wrap.style[h === 'left' ? 'left' : 'right'] = '12px';
  wrap.style.display = 'flex';
  wrap.style.flexDirection = v === 'top' ? 'column' : 'column-reverse';
  wrap.style.gap = '8px';
  wrap.style.zIndex = 2147483646;
  document.body.appendChild(wrap);

  const style = document.createElement('style');
  style.textContent = `
    .vn-toast {
      font: 500 13px/1.2 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      color: #fff;
      background: rgba(20,24,28,0.92);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      padding: 10px 12px;
      box-shadow: 0 6px 18px rgba(0,0,0,0.35);
      max-width: 72vw;
      transform: translateY(8px);
      opacity: 0;
      transition: transform 150ms ease, opacity 150ms ease;
      pointer-events: auto;
      backdrop-filter: saturate(120%) blur(6px);
      -webkit-font-smoothing: antialiased;
      user-select: none;
    }
    .vn-toast.vn-in { transform: translateY(0); opacity: 1; }
    .vn-toast__title { opacity: 0.75; margin: 0 0 2px; font-weight: 600; font-size: 11px; letter-spacing: .3px; text-transform: uppercase; }
    .vn-toast__msg { margin: 0; word-wrap: break-word; }
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

function now() {
  return performance?.now?.() ?? Date.now();
}

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
  }, 160);
  _toasts.delete(rec.id);
  if (_latestByChannel.get(rec.channel) === rec.id) _latestByChannel.delete(rec.channel);
}

function scheduleHide(rec, durationMs) {
  clearTimeout(rec.hideTimer);
  rec.hideTimer = setTimeout(() => hideToast(rec), durationMs);
}

function _renderToast(channel, title, message, durationMs) {
  // If container still not ready, buffer.
  if (!ensureContainer()) {
    _pending.push({ channel, title, message, durationMs });
    return { id: null };
  }

  capVisible();

  const el = document.createElement('div');
  el.className = 'vn-toast';
  el.setAttribute('data-channel', channel);

  const titleEl = document.createElement('div');
  titleEl.className = 'vn-toast__title';
  titleEl.textContent = title;

  const msgEl = document.createElement('div');
  msgEl.className = 'vn-toast__msg';
  msgEl.textContent = message;

  el.appendChild(titleEl);
  el.appendChild(msgEl);
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

  // Coalesce updates
  if (conf.coalesce) {
    const existingId = _latestByChannel.get(channel);
    if (existingId) {
      const rec = _toasts.get(existingId);
      if (rec && rec.el) {
        const age = now() - rec.createdAt;
        if (age <= conf.coalesceWindowMs || true) {
          const msgEl = rec.el.querySelector('.vn-toast__msg');
          const titleEl = rec.el.querySelector('.vn-toast__title');
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

/**
 * Initializes notifications. Safe to call before <body> exists.
 * Options:
 *  - bus.on: function(eventName, handler)
 *  - labelsForMode(name) OR labelsForGenreStyle(name)
 *  - position, debug, staggerMs, durationMs, maxVisible
 */
function initNotify(options = {}) {
  Object.assign(DEFAULTS, pick(options, ['position', 'debug', 'staggerMs', 'durationMs', 'maxVisible']));

  // Grab bus + label helpers if provided
  _busOn = options?.bus?.on || null;
  _labelsForMode = typeof options?.labelsForMode === 'function' ? options.labelsForMode : null;
  _labelsForGenreStyle = typeof options?.labelsForGenreStyle === 'function' ? options.labelsForGenreStyle : null;

  // Do NOT force container creation; we’ll defer until first toast.

  if (_busOn && !_wired) {
    wireBus(_busOn);
    _wired = true;
  }
}

function wireBus(on) {
  // Mode/Genre change => show two toasts (genre+style)
  const startLabelsFor = (modeName) => {
    if (_labelsForGenreStyle) {
      const out = _labelsForGenreStyle(modeName);
      notifyGenreAndStyle(out.genreLabel, out.styleLabel);
    } else if (_labelsForMode) {
      const { familyLabel, typeLabel } = _labelsForMode(modeName);
      notifyGenreAndStyle(familyLabel, typeLabel);
    } else {
      // Fallback: just echo the key
      notifyGenreAndStyle(String(modeName || 'Unknown'), 'Default');
    }
  };

  // New + legacy (mode/genre)
  on('genre', startLabelsFor);
  on('mode', startLabelsFor);

  // Style/Flavor
  on('style',  (id) => notify(NOTIFY.style, String(id)));
  on('flavor', (id) => notify(NOTIFY.style, String(id)));

  // Vibe/Theme
  on('vibe',  (v) => notify(NOTIFY.vibe,  String(v)));
  on('theme', (v) => notify(NOTIFY.vibe,  String(v))); // legacy alias

  // Speed (coalesced)
  on('speed', (s) => {
    const val = typeof s === 'number' && s.toFixed ? s.toFixed(1) : String(s);
    notify(NOTIFY.speed, `Speed: ${val}×`, { coalesce: true });
  });

  // Paused/Resumed
  on('paused', (p) => notify(NOTIFY.state, p ? 'Paused' : 'Resumed'));

  // Clear
  on('clear', () => notify(NOTIFY.state, 'Cleared'));

  // Power (screen awake)
  on('power', (isOn) => notify(NOTIFY.power, `Screen awake: ${isOn ? 'ON' : 'OFF'}`));
}

// Dev helper: attach to window for quick manual tests.
function exposeToWindow() {
  if (typeof window !== 'undefined') {
    window.NOTIFY = NOTIFY;
    window.notify = notify;
    window.notifyGenreAndStyle = notifyGenreAndStyle;
    window.notifySystemAndProgram = notifySystemAndProgram;
    window.initNotify = initNotify;
  }
}

// Small util
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
