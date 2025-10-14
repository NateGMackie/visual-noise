/* eslint-env browser */
/* global CustomEvent, KeyboardEvent */
// src/js/ui/gestures.js
// Mobile swipe gestures mirroring your keyboard logic & clickable HUD.
//  - Swipe LEFT  -> cycle genre backward  (same as '[')
//  - Swipe RIGHT -> cycle genre forward   (same as ']')
//  - Swipe UP    -> trigger '.' (period)
//  - Swipe DOWN  -> trigger ';' (semicolon)
//
// Pull-to-refresh safe: We only block downward drags when not at the very top.
// Landscape-friendly thresholds. No imports. Auto-inits on DOMContentLoaded.

/**
 * Initialize touch/mouse gesture listeners on a root element.
 * @param {any} root - Element to attach listeners to (defaults to document.body).
 * @returns {()=>void} Cleanup function to remove all listeners.
 */
export function initGestures(root = document.body) {
  attach(root);
  return () => detach(root);
}

let startX = 0,
  startY = 0,
  startT = 0;
let movedX = 0,
  movedY = 0;
let tracking = false;

/**
 * Compute distance/time thresholds based on viewport size.
 * @returns {{MIN_DIST:number,MAX_OFF_AXIS:number,MAX_TIME:number}} Gesture thresholds.
 */
function thresholds() {
  const basis = Math.max(40, Math.floor(Math.min(window.innerWidth, window.innerHeight) * 0.08));
  return {
    MIN_DIST: basis,
    MAX_OFF_AXIS: Math.max(32, Math.floor(basis * 0.6)),
    MAX_TIME: 800,
  };
}

/**
 * Open the controls HUD (mirrors the 'm' hotkey path).
 * Falls back to a custom event if the shim isn’t present.
 * @returns {void}
 */
function openControls() {
  if (window.ControlsVisibility?.show) {
    try {
      window.ControlsVisibility.show();
      return;
    } catch (e) {
      void e; // non-fatal
    }
  }
  window.dispatchEvent(new CustomEvent('ui:controls:show'));
}

/**
 * Synthesize a keydown for the global hotkey handler.
 * @param {string} key - Visible key (e.g., '[', ']', ',', '.', ';', 't').
 * @param {{shiftKey?:boolean, ctrlKey?:boolean, altKey?:boolean, metaKey?:boolean}} [opts] - Modifier flags.
 * @returns {void}
 */
function synthKey(key, opts = {}) {
  const codeMap = {
    '[': 'BracketLeft',
    ']': 'BracketRight',
    ',': 'Comma',
    '.': 'Period',
    ';': 'Semicolon',
    "'": 'Quote',
    t: 'KeyT',
    T: 'KeyT',
  };
  const shiftMap = { '[': '{', ']': '}', ';': ':', "'": '"', ',': '<', '.': '>' };
  const useShift = !!opts.shiftKey;
  const code = codeMap[key] || '';
  const outKey = useShift && shiftMap[key] ? shiftMap[key] : key;

  const evt = new KeyboardEvent('keydown', {
    key: outKey,
    code,
    shiftKey: useShift,
    ctrlKey: !!opts.ctrlKey,
    altKey: !!opts.altKey,
    metaKey: !!opts.metaKey,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(evt);
}

/**
 * Start a gesture on pointer/touch down.
 * @param {any} e - PointerEvent | TouchEvent | MouseEvent.
 * @returns {void}
 */
function onStart(e) {
  if (e.touches && e.touches.length !== 1) return;
  const t = e.touches ? e.touches[0] : e;
  startX = t.clientX;
  startY = t.clientY;
  startT = Date.now();
  movedX = 0;
  movedY = 0;
  tracking = true;
}

/**
 * Update a gesture on pointer/touch move; applies passive-prevent heuristics.
 * @param {any} e - PointerEvent | TouchEvent | MouseEvent.
 * @returns {void}
 */
function onMove(e) {
  if (!tracking) return;
  const t = e.touches ? e.touches[0] : e;
  const dx = t.clientX - startX;
  const dy = t.clientY - startY;
  movedX = dx;
  movedY = dy;

  const { MAX_OFF_AXIS } = thresholds();
  const absX = Math.abs(dx),
    absY = Math.abs(dy);

  // Avoid pull-to-refresh: don't block downward drags starting at the very top
  const atTop =
    (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0) <= 0;

  // Horizontal swipe: stop scroll jitter early
  if (absX > 12 && absY < MAX_OFF_AXIS) {
    e.preventDefault();
  }
  // Vertical swipe
  if (absY > 12 && absX < MAX_OFF_AXIS) {
    if (dy < 0) {
      // Upward swipe never conflicts with P2R
      e.preventDefault();
    } else if (!atTop) {
      // Only prevent for downward swipes when we're not at the page top
      e.preventDefault();
    }
  }
}

/**
 * Complete a gesture on pointer/touch up; maps to hotkeys or controls.
 * @returns {void}
 */
function onEnd() {
  if (!tracking) return;
  tracking = false;

  const dt = Date.now() - startT;
  const { MIN_DIST, MAX_OFF_AXIS, MAX_TIME } = thresholds();
  const dx = movedX;
  const dy = movedY;
  const absX = Math.abs(dx),
    absY = Math.abs(dy);

  // Bottom-edge tap opens controls/HUD
  const TAP_TIME = 300,
    TAP_MOVE = 10,
    EDGE_PX = 24;
  const H = window.innerHeight || document.documentElement.clientHeight || 0;
  const isTap = dt <= TAP_TIME && absX < TAP_MOVE && absY < TAP_MOVE;
  if (isTap && H && startY >= H - EDGE_PX) {
    openControls();
    return;
  }

  if (dt > MAX_TIME) return;
  if (absX < MIN_DIST && absY < MIN_DIST) return;

  if (absX >= absY && absY <= MAX_OFF_AXIS) {
    // Horizontal → genre
    if (dx > 0) {
      // RIGHT: genre backward ('[')
      synthKey('[');
    } else {
      // LEFT: genre forward (']')
      synthKey(']');
    }
  } else if (absY > absX && absX <= MAX_OFF_AXIS) {
    // Vertical
    if (dy < 0) {
      // UP: trigger '.' (period)
      synthKey('.');
    } else {
      // DOWN: trigger ';' (semicolon)
      synthKey(';');
    }
  }
}

/**
 * Cancel a gesture (e.g., pointer leaves element).
 * @returns {void}
 */
function onCancel() {
  tracking = false;
}

/**
 * Attach all gesture listeners to an element.
 * @param {any} el - Root element to attach to.
 * @returns {void}
 */
function attach(el) {
  el.addEventListener('touchstart', onStart, { passive: true });
  el.addEventListener('touchmove', onMove, { passive: false });
  el.addEventListener('touchend', onEnd, { passive: true });
  el.addEventListener('touchcancel', onCancel, { passive: true });

  // Optional mouse support for quick desktop testing
  el.addEventListener('mousedown', onStart, { passive: true });
  el.addEventListener('mousemove', onMove, { passive: false });
  el.addEventListener('mouseup', onEnd, { passive: true });
  el.addEventListener('mouseleave', onCancel, { passive: true });
}

/**
 * Detach all gesture listeners from an element.
 * @param {any} el - Root element to remove listeners from.
 * @returns {void}
 */
function detach(el) {
  el.removeEventListener('touchstart', onStart);
  el.removeEventListener('touchmove', onMove);
  el.removeEventListener('touchend', onEnd);
  el.removeEventListener('touchcancel', onCancel);

  el.removeEventListener('mousedown', onStart);
  el.removeEventListener('mousemove', onMove);
  el.removeEventListener('mouseup', onEnd);
  el.removeEventListener('mouseleave', onCancel);
}
