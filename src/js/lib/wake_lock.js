/* eslint-env browser */
/* global navigator, requestAnimationFrame, cancelAnimationFrame */

// src/js/lib/wake_lock.js
// Screen Wake Lock manager with graceful fallback + lightweight "keep active" heartbeat.
// Usage: WakeLock.enable(); WakeLock.disable(); WakeLock.isEnabled()
// NOTE: This does NOT simulate keyboard/mouse input. It simply prevents sleep
// (when supported) and runs a minimal rAF loop to keep the tab active.

let wakeLock = null;
let wantEnabled = false;
let rafId = 0;

/**
 * Tiny heartbeat so the tab stays active. No-op work per frame.
 */
function tick() {
  if (!wantEnabled) return;
  // Schedule the next frame; we intentionally do nothing else here.
  rafId = requestAnimationFrame(tick);
}

/**
 * Start the heartbeat loop if not already running.
 */
function startHeartbeat() {
  if (!rafId) {
    rafId = requestAnimationFrame(tick);
  }
}

/**
 * Stop the heartbeat loop if running.
 */
function stopHeartbeat() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

/**
 * Try to acquire a screen wake lock.
 * @returns {Promise<boolean>} True if acquired successfully, false otherwise.
 */
async function acquire() {
  if (!navigator?.wakeLock) return false; // unsupported
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener?.('release', () => {
      // If the page lost the lock (tab hidden, etc.) and user still wants it, try to reacquire
      if (wantEnabled && document.visibilityState === 'visible') {
        acquire().catch(() => {
          /* swallow reacquire errors */
        });
      }
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Enable the wake lock (if visible) and the keep-active heartbeat.
 * @returns {Promise<boolean>} True if lock acquired, false otherwise.
 */
async function enable() {
  wantEnabled = true;

  // Always run the heartbeat; helps keep the tab active even if Wake Lock is unsupported.
  startHeartbeat();

  if (document.visibilityState !== 'visible') return false;
  const ok = await acquire();
  return ok;
}

/**
 * Disable and release the wake lock and stop the heartbeat.
 * @returns {void}
 */
function disable() {
  wantEnabled = false;

  // Stop heartbeat first.
  stopHeartbeat();

  // Release wake lock if we have it.
  if (wakeLock) {
    try {
      wakeLock.release();
    } catch {
      /* ignore release errors */
    }
  }
  wakeLock = null;
}

/**
 * Check whether the user *wants* the wake lock (may not be active yet).
 * @returns {boolean}
 */
function isEnabled() {
  return wantEnabled;
}

// Reacquire when returning to the tab
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wantEnabled) {
    acquire().catch(() => {
      /* ignore reacquire errors */
    });
  }
});

// Some UAs may release the lock on blur; best-effort reacquire on focus.
window.addEventListener('focus', () => {
  if (wantEnabled) {
    acquire().catch(() => {
      /* ignore reacquire errors */
    });
  }
});

export const WakeLock = { enable, disable, isEnabled };
