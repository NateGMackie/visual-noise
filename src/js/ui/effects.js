/* eslint-env browser */
// src/js/ui/effects.js
// Minimal helpers to toggle CRT-like overlays globally.

/**
 * Apply both effects in one shot (e.g., on boot from saved config).
 * @param {{scanlines?: boolean, flicker?: boolean}} fx
 * @returns {void}
 */
export function applyEffects(fx = {}) {
  setScanlines(!!fx.scanlines);
  setFlicker(!!fx.flicker);
}

/**
 * Enable/disable scanlines overlay.
 * @param {boolean} on
 * @returns {void}
 */
export function setScanlines(on) {
  document.body.classList.toggle('scanlines', on);
}

/**
 * Enable/disable flicker effect.
 * @param {boolean} on
 * @returns {void}
 */
export function setFlicker(on) {
  document.body.classList.toggle('flicker', on);
}

/**
 * Simple toggles for hotkeys/menu bindings.
 */
export function toggleScanlines() {
  document.body.classList.toggle('scanlines');
}

export function toggleFlicker() {
  document.body.classList.toggle('flicker');
}
