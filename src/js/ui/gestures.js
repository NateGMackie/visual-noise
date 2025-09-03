
// gestures.js
// Mobile swipe gestures mirroring your keyboard logic & clickable HUD.
//  - Swipe LEFT  -> cycle family backward (same as '[')
//  - Swipe RIGHT -> cycle family forward  (same as ']')
//  - Swipe UP    -> cycle flavor forward  (same as Shift+']')
//  - Swipe DOWN  -> cycle theme by clicking #themeName (keeps your 'tap bottom edge' for nav)
//
// Pull-to-refresh safe: We only block downward drags when not at the very top.
// Landscape-friendly thresholds. No imports. Auto-inits on DOMContentLoaded.

// Exported initializer so main.js can control setup/teardown
export function initGestures(root = document.body) {
  // keep using the same attach() you already defined below
  attach(root);
  // return a cleanup to remove listeners if needed
  return () => detach(root);
}
  let startX = 0, startY = 0, startT = 0;
  let movedX = 0, movedY = 0;
  let tracking = false;

  function thresholds() {
    const basis = Math.max(40, Math.floor(Math.min(window.innerWidth, window.innerHeight) * 0.08));
    return {
      MIN_DIST: basis,
      MAX_OFF_AXIS: Math.max(32, Math.floor(basis * 0.6)),
      MAX_TIME: 800
    };
  }
// Helper: open controls/nav the same way 'm' does in ui.js
function openControls() {
  // Primary path used by ui.js hotkey
  if (window.ControlsVisibility?.show) {
    try { window.ControlsVisibility.show(); return; } catch {}
  }
  // Fallback: broadcast a custom event some UI layer can listen for
  window.dispatchEvent(new CustomEvent('ui:controls:show'));
}

 function synthKey(key, opts = {}) {
   // Map physical key -> code
   const codeMap = {
     '[': 'BracketLeft',
     ']': 'BracketRight',
     ',': 'Comma',
     '.': 'Period',
     ';': 'Semicolon',
     "'": 'Quote',
   };
   // Map shifted character for realism (so e.key matches when Shift is held)
   const shiftMap = { '[': '{', ']': '}', ';': ':', "'": '"', ',': '<', '.': '>' };
   const useShift = !!opts.shiftKey;
   const code = codeMap[key];
   const outKey = useShift && shiftMap[key] ? shiftMap[key] : key;
   const evt = new KeyboardEvent('keydown', {
     key: outKey,
     code,                 // helps your handler: code === 'BracketRight'
     shiftKey: useShift,
     ctrlKey: !!opts.ctrlKey,
     altKey: !!opts.altKey,
     metaKey: !!opts.metaKey,
     bubbles: true,
     cancelable: true
   });
   window.dispatchEvent(evt);
 }

  function cycleTheme() {
    // Prefer your existing click handler on the HUD
    const el = document.getElementById('themeName');
    if (el) el.click();
    // And broadcast a custom event in case you want to hook other logic
    window.dispatchEvent(new CustomEvent('ui:cycleTheme', { detail: { dir: 1 }}));
  }

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

  function onMove(e) {
    if (!tracking) return;
    const t = e.touches ? e.touches[0] : e;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    movedX = dx;
    movedY = dy;

    const { MAX_OFF_AXIS } = thresholds();
    const absX = Math.abs(dx), absY = Math.abs(dy);

    // Avoid pull-to-refresh: don't block downward drags starting at the very top
    const atTop = (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0) <= 0;

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

function onEnd(e) {
  if (!tracking) return;
  tracking = false;

  const dt = Date.now() - startT;
  const { MIN_DIST, MAX_OFF_AXIS, MAX_TIME } = thresholds();
  const dx = movedX;
  const dy = movedY;
  const absX = Math.abs(dx), absY = Math.abs(dy);

  // --- NEW: bottom-edge tap opens controls/nav ---
  // Treat a quick, tiny movement as a tap; use the start point
  const TAP_TIME = 300, TAP_MOVE = 10, EDGE_PX = 24;
  const H = window.innerHeight || document.documentElement.clientHeight || 0;
  const isTap = (dt <= TAP_TIME && absX < TAP_MOVE && absY < TAP_MOVE);
  if (isTap && H && startY >= H - EDGE_PX) {
    // Mirror your 'm' hotkey path
    window.ControlsVisibility?.show?.() ||
    window.dispatchEvent(new CustomEvent('ui:controls:show'));
    return;
  }

  if (dt > MAX_TIME) return;
  if (absX < MIN_DIST && absY < MIN_DIST) return;

  if (absX >= absY && absY <= MAX_OFF_AXIS) {
    // Horizontal
    if (dx > 0) {
      // RIGHT: family backward ('[')
      synthKey('[');
    } else {
      // LEFT: family forward (']')
      synthKey(']');
    }
  } else if (absY > absX && absX <= MAX_OFF_AXIS) {
    // Vertical
    if (dy < 0) {
      // UP: vibe forward 
      synthKey('t');
    } else {
      // DOWN: cycle style (Shift+']')
      synthKey(']', { shiftKey: true });
    }
  }
}



  /*function onEnd() {
    if (!tracking) return;
    tracking = false;

    const dt = Date.now() - startT;
    const { MIN_DIST, MAX_OFF_AXIS, MAX_TIME } = thresholds();
    const dx = movedX;
    const dy = movedY;
    const absX = Math.abs(dx), absY = Math.abs(dy);

    if (dt > MAX_TIME) return;
    if (absX < MIN_DIST && absY < MIN_DIST) return;

    if (absX >= absY && absY <= MAX_OFF_AXIS) {
      // Horizontal
      if (dx > 0) {
        // RIGHT: family forward (']')
        synthKey(']');
      } else {
        // LEFT: family backward ('[')
        synthKey('[');
      }
    } else if (absY > absX && absX <= MAX_OFF_AXIS) {
      // Vertical
      if (dy < 0) {
        // UP: flavor forward (Shift+']')
        synthKey(']', { shiftKey: true });
      } else {
        // DOWN: theme cycle (keeps your tap-bottom-edge for nav)
        cycleTheme();
      }
    }
  }*/

  function onCancel() {
    tracking = false;
  }

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