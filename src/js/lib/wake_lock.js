/* eslint-env browser */
/* global navigator */
// src/js/lib/wake_lock.js
// Screen Wake Lock manager with graceful fallback.
// Usage: WakeLock.enable(); WakeLock.disable(); WakeLock.isEnabled()

let wakeLock = null;
let wantEnabled = false;

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
 * Enable the wake lock (if visible).
 * @returns {Promise<boolean>} True if lock acquired, false otherwise.
 */
async function enable() {
  wantEnabled = true;
  if (document.visibilityState !== 'visible') return false;
  const ok = await acquire();
  return ok;
}

/**
 * Disable and release the wake lock.
 * @returns {void}
 */
function disable() {
  wantEnabled = false;
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

export const WakeLock = { enable, disable, isEnabled };
