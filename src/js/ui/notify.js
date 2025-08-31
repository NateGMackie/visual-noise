// src/js/ui/notify.js
// One tiny toast/HUD with a tiny API.
// API: notify({kind, title, value, ttl=1200})
// Helpers: notifySpeed(v), notifyMode(v), notifyType(v), notifyTheme(v)
// Accessibility: aria-live="polite", role="status"

const DEFAULT_TTL = 1200;

export function initNotify({ bus, labelsForMode }) {
  const root = ensureRoot();
  const queue = new Set();

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

  function destroyToast(el) {
    queue.delete(el);
    if (!el) return;
    el.classList.add('hide');
    // Remove after transition
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }

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

  // Helpers (you can call these directly if you ever want to fire a toast manually)
  function notifySpeed(v) {
    notify({ kind: 'speed', title: 'Speed', value: String(v) });
  }
  function notifyMode(v /*modeKey*/) {
  // Format: "mode: [family] | type: [flavor]"
  // labelsForMode(modeKey) -> { familyLabel, typeLabel }
  const lbls = (typeof labelsForMode === 'function') ? labelsForMode(v) : null;
  const fam  = lbls?.familyLabel ?? v;
  const type = lbls?.typeLabel ?? '';
  const value = type ? `mode: ${fam} | type: ${type}` : `mode: ${fam}`;
  notify({ kind: 'mode', title: 'Mode', value });
  } // <-- close notifyMode BEFORE declaring notifyType

  function notifyType(modeKey, typeKey) {
  const lbls = (typeof labelsForMode === 'function') ? labelsForMode(modeKey) : null;
  const fam  = lbls?.familyLabel ?? modeKey;
  const flav = tryLabel(labelsForMode, modeKey, typeKey) ?? typeKey;
  notify({ kind: 'type', title: 'Type', value: `mode: ${fam} | type: ${flav}` });
  }
  function notifyTheme(v) {
    notify({ kind: 'theme', title: 'Theme', value: String(v) });
  }

  // Subscribe to your state bus to fire toasts automatically.
  // Adjust event names here if your bus uses different ones.
  const unsubs = wireBus(bus, {
    speed: (payload) => notifySpeed(payload?.value ?? payload),
    mode:  (payload) => notifyMode(payload?.value ?? payload),
  flavor: (payload) => {
    const modeKey = payload?.modeId;
    const flavKey = payload?.flavorId;
    const lbls    = (typeof labelsForMode === 'function') ? labelsForMode(modeKey) : null;
    const fam     = lbls?.familyLabel ?? modeKey;
    // Try to resolve a pretty label for the flavor; fall back to the key
    const flavLabel = tryLabel?.(labelsForMode, modeKey, flavKey) ?? flavKey;
    notify({ kind: 'type', title: 'Type', value: `mode: ${fam} | type: ${flavLabel}` });
  },
    notify: (payload) => {
      // Accept { kind, title, value, ttl } from any module
      if (payload && typeof payload === 'object') notify(payload);
    },
    theme: (payload) => notifyTheme(payload?.value ?? payload),
  });

  function dispose() {
    unsubs.forEach((u) => { try { u(); } catch {} });
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

function tryLabel(labelsForMode, modeKey, typeKey) {
  try {
    if (typeof labelsForMode === 'function') {
      const lbls = labelsForMode(modeKey);
      if (lbls?.type && typeKey in lbls.type) return lbls.type[typeKey];
      if (lbls?.mode) return lbls.mode; // fallback to mode label if present
    }
  } catch {}
  return null;
}

function escapeHTML(s) {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]
  ));
}