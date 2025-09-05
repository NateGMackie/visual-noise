/* eslint-env browser */
/* global clearTimeout, setTimeout, requestAnimationFrame */

/**
 * Visual Noise — Toast Notifications (bottom-center, capsule, accents)
 * - Position handled by CSS classes (see src/css/notify.css)
 * - Coalescing per-channel (CHANNEL_OPTIONS)
 * - Listens to app bus and renders toasts
 */

/**
 * Local alias for DOM element type so jsdoc/no-undefined-types stays happy in projects
 * that don't load the DOM lib types.
 * @typedef {unknown} DomElement
 */

/**
 * Notification channel constants.
 * @readonly
 * @enum {string}
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

/**
 * Default behavior for notifications.
 * @typedef {object} NotifyDefaults
 * @property {number} durationMs - How long each toast stays visible before auto-hiding.
 * @property {number} staggerMs - Delay between "genre" and "style" paired toasts.
 * @property {number} coalesceWindowMs - Max age (ms) of an existing toast to update instead of creating a new one.
 * @property {number} maxVisible - Maximum number of concurrent on-screen toasts (older ones are removed).
 * @property {'bottom-center'|'bottom-right'|'bottom-left'|'top-right'|'top-left'|'top-center'} position - Screen position preset for the toast stack.
 * @property {boolean} debug - If true, logs notify calls to the console.
 */

/** @type {NotifyDefaults} */
const DEFAULTS = {
  durationMs: 2600,
  staggerMs: 220,
  coalesceWindowMs: 350,
  maxVisible: 3,
  position: 'bottom-center',
  debug: false,
};

/**
 * Per-channel overrides.
 * Keys match NOTIFY.* values.
 * @type {Record<string, {coalesce?: boolean, durationMs?: number, coalesceWindowMs?: number}>}
 */
const CHANNEL_OPTIONS = {
  // Fast sliders: tight window
  [NOTIFY.speed]:      { coalesce: true, durationMs: 900,  coalesceWindowMs: 500 },

  // Fire sliders
  [NOTIFY.fireHeight]: { coalesce: true, durationMs: 900,  coalesceWindowMs: 500 },
  [NOTIFY.fireFuel]:   { coalesce: true, durationMs: 900,  coalesceWindowMs: 500 },

  // Mode changes
  [NOTIFY.genre]:      { coalesce: true, durationMs: 1400, coalesceWindowMs: 1200 },
  [NOTIFY.style]:      { coalesce: true, durationMs: 1400, coalesceWindowMs: 1200 },
  [NOTIFY.vibe]:       { coalesce: true, durationMs: 1400, coalesceWindowMs: 1200 },

  // State changes
  [NOTIFY.state]:      { coalesce: true, durationMs: 1200, coalesceWindowMs: 1200 },
};

// -------------------------
// Internal state
// -------------------------

/** @type {DomElement|null} */
let _container;
/** @type {Map<string, {id:string, el:DomElement, channel:string, createdAt:number, hideTimer?:number}>} */
const _toasts = new Map();
/** @type {Map<string, string>} */
const _latestByChannel = new Map();
let _seq = 0;

let _wired = false;
/** @type {((event:string, fn:Function)=>void)|null} */
let _busOn = null;
/** @type {((modeName:string)=>{familyLabel:string,typeLabel:string})|null} */
let _labelsForMode = null;
/** @type {((modeName:string)=>{genreLabel:string,styleLabel:string})|null} */
let _labelsForGenreStyle = null;
/** @type {Array<{channel:string,title:string,message:string,durationMs:number}>} */
let _pending = [];

// -------------------------
// DOM bootstrapping
// -------------------------

/**
 * Ensure toast container exists (or queue until DOM ready).
 * @returns {DomElement|null} The container element, or null if queuing until DOMContentLoaded.
 */
function ensureContainer() {
  if (!_container) {
    if (!document.body) {
      document.addEventListener(
        'DOMContentLoaded',
        () => {
          if (!_container) _container = createContainer();
          flushPending();
        },
        { once: true }
      );
      return null;
    }
    _container = createContainer();
    flushPending();
  }
  return _container;
}

/**
 * Create and append the toast container element with position class.
 * @returns {DomElement} The container element that holds all toasts.
 */
function createContainer() {
  const wrap = document.createElement('div');
  wrap.id = 'vn-toasts';
  wrap.setAttribute('aria-live', 'polite');
  wrap.className = 'vn-toasts';

  // Map DEFAULTS.position -> CSS class
  const posClass =
    {
      'top-left': 'pos-top-left',
      'top-right': 'pos-top-right',
      'top-center': 'pos-top-center',
      'bottom-left': 'pos-bottom-left',
      'bottom-right': 'pos-bottom-right',
      'bottom-center': 'pos-bottom-center',
    }[DEFAULTS.position] || 'pos-bottom-center';

  wrap.classList.add(posClass);
  document.body.appendChild(wrap);
  return wrap;
}

/**
 * Render any toasts queued before the container existed.
 * @returns {void} No return value.
 */
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

/**
 * Compute the effective options for a channel (defaults + per-channel overrides + call overrides).
 * @param {string} channel - Channel key (NOTIFY.*).
 * @returns {{coalesce?:boolean, durationMs:number, coalesceWindowMs:number}} Effective options for this channel.
 */
function getChannelOpts(channel) {
  return Object.assign({}, DEFAULTS, CHANNEL_OPTIONS[channel] || {});
}

/**
 * Get a high-resolution timestamp (ms).
 * @returns {number} Milliseconds since page load, or Date.now() fallback.
 */
function now() {
  return performance?.now?.() ?? Date.now();
}

/**
 * Enforce maxVisible by hiding the oldest toasts first.
 * @returns {void} No return value.
 */
function capVisible() {
  const toasts = Array.from(_toasts.values()).sort((a, b) => a.createdAt - b.createdAt);
  const excess = Math.max(0, toasts.length - DEFAULTS.maxVisible);
  for (let i = 0; i < excess; i++) hideToast(toasts[i]);
}

/**
 * Hide & remove a toast.
 * @param {{id:string, el:DomElement, channel:string, createdAt:number, hideTimer?:number}} rec - Toast record.
 * @returns {void} No return value.
 */
function hideToast(rec) {
  if (!rec || !rec.el) return;
  clearTimeout(rec.hideTimer);
  rec.el.classList.remove('vn-in');
  setTimeout(() => {
    // @ts-ignore - optional chaining on DOM parent
    if (rec.el && rec.el.parentNode) rec.el.parentNode.removeChild(rec.el);
  }, 180);
  _toasts.delete(rec.id);
  if (_latestByChannel.get(rec.channel) === rec.id) _latestByChannel.delete(rec.channel);
}

/**
 * Schedule auto-hide for a toast.
 * @param {{hideTimer?:number}} rec - Toast record to schedule.
 * @param {number} durationMs - Milliseconds until hide.
 * @returns {void} No return value.
 */
function scheduleHide(rec, durationMs) {
  clearTimeout(rec.hideTimer);
  rec.hideTimer = setTimeout(() => hideToast(rec), durationMs);
}

/**
 * Create and insert a toast element.
 * @param {string} channel - Channel key.
 * @param {string} title - Left title text.
 * @param {string} message - Right message text.
 * @param {number} durationMs - Lifespan in ms.
 * @returns {{id:string}} Minimal record for reference.
 */
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

  // @ts-ignore - container is created in ensureContainer
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

/**
 * Map a channel to a human label.
 * @param {string} channel - Channel key.
 * @returns {string} Display title string for the toast header.
 */
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

/**
 * Show or update a toast for the channel.
 * Coalesces if enabled in channel options or opts.
 * @param {string} channel - Channel key (NOTIFY.*).
 * @param {string} message - Body text to display.
 * @param {{title?:string, coalesce?:boolean, durationMs?:number, coalesceWindowMs?:number, debug?:boolean}} [opts] - Optional overrides for this call.
 * @returns {string} The toast id for reference.
 */
function notify(channel, message, opts = {}) {
  const conf = Object.assign({}, getChannelOpts(channel), opts);
  const title = opts.title || titleForChannel(channel);

  if ((conf.debug ?? DEFAULTS.debug) === true) {
     
    console.info('[notify]', channel, message, conf);
  }

  if (conf.coalesce) {
    const existingId = _latestByChannel.get(channel);
    if (existingId) {
      const rec = _toasts.get(existingId);
      if (rec && rec.el) {
        const age = now() - rec.createdAt;
        if (age <= conf.coalesceWindowMs) {
          // inside function notify(...)

const msgEl   = /** @type {DomElement|null} */ (rec.el.querySelector('.vn-msg'));
const titleEl = /** @type {DomElement|null} */ (rec.el.querySelector('.vn-title'));

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

/**
 * Show two toasts (Genre then Style), staggered.
 * @param {string} genreLabel - Display label for the current genre.
 * @param {string} styleLabel - Display label for the current style.
 * @param {number} [staggerMs] - Delay between the two calls.
 * @returns {void} No return value.
 */
function notifyGenreAndStyle(genreLabel, styleLabel, staggerMs = DEFAULTS.staggerMs) {
  notify(NOTIFY.genre, genreLabel, { coalesce: true });
  setTimeout(
    () => notify(NOTIFY.style, styleLabel, { coalesce: true }),
    Math.max(120, Math.min(staggerMs, 400))
  );
}

/** @type {(genreLabel:string,styleLabel:string,staggerMs?:number)=>void} */
const notifySystemAndProgram = notifyGenreAndStyle;

/**
 * Merge channel options.
 * @param {string} channel - Channel key to modify.
 * @param {object} options - Partial per-channel overrides to merge with existing.
 * @returns {void} No return value.
 */
function setChannelOptions(channel, options) {
  CHANNEL_OPTIONS[channel] = Object.assign({}, CHANNEL_OPTIONS[channel] || {}, options);
}

/**
 * Hide the latest toast for a channel, if any.
 * @param {string} channel - Channel key whose most recent toast should be cleared.
 * @returns {void} No return value.
 */
function clearChannel(channel) {
  const id = _latestByChannel.get(channel);
  if (!id) return;
  const rec = _toasts.get(id);
  hideToast(rec);
}

/**
 * Initialize the notifier and wire the event bus.
 * @param {{
 *   bus?: { on?: (event:string, fn:Function)=>void },
 *   labelsForMode?: (name:string)=>{familyLabel:string,typeLabel:string},
 *   labelsForGenreStyle?: (name:string)=>{genreLabel:string,styleLabel:string},
 *   position?: NotifyDefaults['position'],
 *   debug?: boolean,
 *   staggerMs?: number,
 *   durationMs?: number,
 *   maxVisible?: number
 * }} [options] - Optional configuration and bus/label helpers.
 * @returns {void} No return value.
 */
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

/**
 * Subscribe to app events and map them to toasts.
 * @param {(event:string, fn:Function)=>void} on - Event subscription function (bus.on).
 * @returns {void} No return value.
 */
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

  on('style',  (id) => notify(NOTIFY.style, String(id), { coalesce: true }));
  on('flavor', (id) => notify(NOTIFY.style, String(id), { coalesce: true }));

  on('vibe',  (v) => notify(NOTIFY.vibe,  String(v), { coalesce: true }));
  on('theme', (v) => notify(NOTIFY.vibe,  String(v), { coalesce: true })); // legacy alias

  on('speed', (s) => {
    const val = typeof s === 'number' && s.toFixed ? s.toFixed(1) : String(s);
    notify(NOTIFY.speed, `Speed: ${val}×`, { coalesce: true });
  });

  on('paused', (p) => notify(NOTIFY.state, p ? 'Paused' : 'Resumed', { coalesce: true }));
  on('clear',  () => notify(NOTIFY.state, 'Cleared', { coalesce: true }));
  on('power',  (isOn) => notify(NOTIFY.power, `Screen awake: ${isOn ? 'ON' : 'OFF'}`, { coalesce: true }));

  // Fire controls (numeric + step)
  on('fire.height', (h) => {
    // If you prefer only steps, comment this numeric line out.
    const val = typeof h === 'number' ? h.toFixed(2) : String(h);
    notify(NOTIFY.fireHeight, `Height: ${val}×`, { coalesce: true });
  });

  on('fire.height.step', (payload) => {
    let index, total;
    if (payload && typeof payload === 'object') ({ index, total } = payload);
    else {
      try { ({ index, total } = JSON.parse(payload)); }
      catch { /* ignore malformed JSON payloads */ }
    }
    if (Number.isFinite(index) && Number.isFinite(total)) {
      notify(NOTIFY.fireHeight, `Height: ${index}/${total}`, { coalesce: true });
    }
  });

  on('fire.fuel', (f) => {
    const val = (typeof f === 'number' && f.toFixed) ? f.toFixed(0) : String(f);
    notify(NOTIFY.fireFuel, `Fuel: ${val}%`, { coalesce: true });
  });

  on('fire.fuel.step', (payload) => {
    let index, total;
    if (payload && typeof payload === 'object') ({ index, total } = payload);
    else {
      try { ({ index, total } = JSON.parse(payload)); }
      catch { /* ignore malformed JSON payloads */ }
    }
    if (Number.isFinite(index) && Number.isFinite(total)) {
      notify(NOTIFY.fireFuel, `Fuel: ${index}/${total}`, { coalesce: true });
    }
  });
}

/**
 * Dev helper to expose API to window (optional).
 * @returns {void} No return value.
 */
function exposeToWindow() {
  if (typeof window !== 'undefined') {
    window.NOTIFY = NOTIFY;
    window.notify = notify;
    window.notifyGenreAndStyle = notifyGenreAndStyle;
    window.notifySystemAndProgram = notifySystemAndProgram;
    window.initNotify = initNotify;
  }
}

/**
 * Pick a subset of keys from an object.
 * @template T
 * @param {T} obj - Source object.
 * @param {Array<keyof T>} keys - Keys to extract from the source.
 * @returns {Partial<T>} New object with selected keys only.
 */
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
