// src/js/ui/notify.js
/* eslint-env browser */
// One tiny toast/HUD with a tiny API.
// API: notify({kind, title, value, ttl=1200})
// Helpers: notifySpeed(v), notifyMode(v), notifyType(v), notifyTheme(v)
// Accessibility: aria-live="polite", role="status"

const DEFAULT_TTL = 1200;

/**
 * Initialize the toast HUD and wire it to an event bus.
 * @param {{bus:any, labelsForMode:(id:string)=>{familyLabel?:string,typeLabel?:string}}} root0 - Object containing the app bus and a label resolver.
 * @returns {{
 *   notify:(opts:{kind?:string,title?:string,value?:any,ttl?:number})=>void,
 *   notifySpeed:(v:any)=>void,
 *   notifyMode:(modeKey:string)=>void,
 *   notifyType:(modeKey:string,typeKey:string)=>void,
 *   notifyTheme:(v:any)=>void,
 *   dispose:()=>void
 * }} Notifier API with helpers and a dispose function.
 */
export function initNotify({ bus, labelsForMode }) {
  const root = ensureRoot();
  const queue = new Set();
  const _ignore = () => {}; // used to silence empty-catch without side effects

  /**
   * Ensure the HUD root exists in the DOM.
   * @returns {any} HUD container element.
   */
  function ensureRoot() {
    let el = document.getElementById('hud-toasts');
    if (!el) {
      el = document.createElement('div');
      el.id = 'hud-toasts';
      el.className = 'hud-toasts';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    return el;
  }

  /**
   * Remove a toast element with transition.
   * @param {any} el - Toast element to destroy.
   * @returns {void} Nothing.
   */
  function destroyToast(el) {
    queue.delete(el);
    if (!el) return;
    el.classList.add('hide');
    // Remove after transition
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }

  /**
   * Show a toast.
   * @param {{kind?:string,title?:string,value?:any,ttl?:number}} root0 - Options for the toast.
   * @param {string} [root0.kind] - Kind/tag for styling.
   * @param {string} [root0.title] - Short label shown on the left.
   * @param {any} [root0.value] - Optional value shown on the right.
   * @param {number} [root0.ttl] - Time to live in ms.
   * @returns {void} Nothing.
   */
  function notify({ kind, title, value, ttl = DEFAULT_TTL }) {
    const el = document.createElement('div');
    el.className = `toast ${kind || 'info'}`;
    el.innerHTML = `
      <div class="toast-row">
        <span class="toast-title">${escapeHTML(title || '')}</span>
        ${value != null ? `<span class="toast-value">${escapeHTML(String(value))}</span>` : ''}
      </div>
    `;
    root.appendChild(el);
    // Force layout for transition
    void el.offsetWidth;
    el.classList.add('show');

    queue.add(el);
    window.setTimeout(() => destroyToast(el), ttl);
  }

  // Helper notifiers
  /**
   * Notify current speed.
   * @param {any} v - Speed value to display.
   * @returns {void} Nothing.
   */
  function notifySpeed(v) {
    notify({ kind: 'speed', title: 'Speed', value: String(v) });
  }
  /**
   * Notify current mode (family | type).
   * @param {string} modeKey - Mode key to resolve into labels.
   * @returns {void} Nothing.
   */
  function notifyMode(modeKey) {
    // labelsForMode(modeKey) -> { familyLabel, typeLabel }
    const lbls = typeof labelsForMode === 'function' ? labelsForMode(modeKey) : null;
    const fam = lbls?.familyLabel ?? modeKey;
    const type = lbls?.typeLabel ?? '';
    const value = type ? `${fam} | type: ${type}` : `${fam}`;
    notify({ kind: 'mode', title: 'Mode', value });
  }

  /**
   * Notify current type/flavor for the mode.
   * @param {string} modeKey - Mode key that the flavor belongs to.
   * @param {string} typeKey - Flavor/type key to display.
   * @returns {void} Nothing.
   */
  function notifyType(modeKey, typeKey) {
    const lbls = typeof labelsForMode === 'function' ? labelsForMode(modeKey) : null;
    const fam = lbls?.familyLabel ?? modeKey;
    const flav = tryLabel(labelsForMode, modeKey, typeKey) ?? typeKey;
    notify({ kind: 'type', title: 'Type', value: `${fam} | type: ${flav}` });
  }
  /**
   * Notify current theme/vibe.
   * @param {any} v - Theme/vibe name.
   * @returns {void} Nothing.
   */
  function notifyTheme(v) {
    notify({ kind: 'theme', title: 'Theme', value: String(v) });
  }

  // Subscribe to your state bus to fire toasts automatically.
  // Adjust event names here if your bus uses different ones.
  const unsubs = wireBus(bus, {
    speed: (payload) => notifySpeed(payload?.value ?? payload),
    mode: (payload) => notifyMode(payload?.value ?? payload),
    flavor: (payload) => {
      const modeKey = payload?.modeId;
      const flavKey = payload?.flavorId;
      const lbls = typeof labelsForMode === 'function' ? labelsForMode(modeKey) : null;
      const fam = lbls?.familyLabel ?? modeKey;
      // Try to resolve a pretty label for the flavor; fall back to the key
      const flavLabel = tryLabel(labelsForMode, modeKey, flavKey) ?? flavKey;
      notify({ kind: 'type', title: 'Type', value: `${fam} | type: ${flavLabel}` });
    },
    notify: (payload) => {
      // Accept { kind, title, value, ttl } from any module
      if (payload && typeof payload === 'object') notify(payload);
    },
    theme: (payload) => notifyTheme(payload?.value ?? payload),
  });

  /**
   * Dispose HUD, unsubscribe bus listeners, and remove any remaining toasts.
   * @returns {void} Nothing.
   */
  function dispose() {
    unsubs.forEach((u) => {
      try {
        u();
      } catch (e) {
        _ignore(e);
      }
    });
    // remove all toasts
    [...queue].forEach(destroyToast);
  }

  return {
    notify,
    notifySpeed,
    notifyMode,
    notifyType,
    notifyTheme,
    dispose,
  };
}

/**
 * Wire multiple event handlers to a simple bus ({ on, off }).
 * @param {any} bus - An object with at least an `on(evt, fn)` method and optional `off(evt, fn)`.
 * @param {Record<string, Function>} handlers - Map of event name → handler.
 * @returns {Array<Function>} Array of unsubscribe functions.
 */
function wireBus(bus, handlers) {
  if (!bus || typeof bus.on !== 'function') return [];
  const unsubs = [];
  for (const [evt, fn] of Object.entries(handlers)) {
    if (!fn) continue;
    const off = bus.on(evt, fn);
    // Support both "return unsubscribe" and "off(evt,fn)" styles
    if (typeof off === 'function') {
      unsubs.push(off);
    } else if (typeof bus.off === 'function') {
      unsubs.push(() => bus.off(evt, fn));
    }
  }
  return unsubs;
}

/**
 * Best-effort pretty label lookup for a flavor/type within a mode.
 * @param {(id:string)=>{type?:Record<string,string>,mode?:string}} labelsForMode - Resolver that returns label info for a mode key.
 * @param {string} modeKey - Mode key to resolve.
 * @param {string} typeKey - Flavor/type key to look up within the mode.
 * @returns {string|null} A human-friendly label or null if unknown.
 */
function tryLabel(labelsForMode, modeKey, typeKey) {
  try {
    if (typeof labelsForMode === 'function') {
      const lbls = labelsForMode(modeKey);
      if (lbls?.type && typeKey in lbls.type) return lbls.type[typeKey];
      if (lbls?.mode) return lbls.mode; // fallback to mode label if present
    }
  } catch (e) {
    // swallow label errors (non-fatal)
    void e; // mark as used without side effects
  }
  return null;
}

/**
 * Escape HTML special characters.
 * @param {string} s - Raw text.
 * @returns {string} Escaped text safe for innerHTML.
 */
function escapeHTML(s) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]
  );
}
