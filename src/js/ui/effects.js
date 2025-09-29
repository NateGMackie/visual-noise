/* eslint-env browser */
// src/js/ui/effects.js
// Minimal helpers to toggle CRT-like overlays globally.

/**
 * Shape of the overlay effects configuration.
 * @typedef {object} EffectsConfig
 * @property {boolean} [scanlines] - Whether the scanlines overlay should be enabled.
 * @property {boolean} [flicker] - Whether the global flicker effect should be enabled.
 */

/**
 * Apply both effects in one shot (e.g., on boot from saved config).
 * @param {EffectsConfig} fx - Effects configuration to apply; missing flags are treated as false.
 * @returns {void} - No return value.
 */
export function applyEffects(fx = {}) {
  setScanlines(!!fx.scanlines);
  setFlicker(!!fx.flicker);
}

/**
 * Enable or disable the scanlines overlay.
 * @param {boolean} on - True to enable scanlines; false to disable.
 * @returns {void} - No return value.
 */
export function setScanlines(on) {
  document.body.classList.toggle('scanlines', on);
}

/**
 * Enable or disable the global flicker effect.
 * @param {boolean} on - True to enable flicker; false to disable.
 * @returns {void} - No return value.
 */
export function setFlicker(on) {
  document.body.classList.toggle('flicker', on);
}

/**
 * Toggle the scanlines overlay based on current state.
 * @returns {void} - No return value.
 */
export function toggleScanlines() {
  document.body.classList.toggle('scanlines');
}

/**
 * Toggle the global flicker effect based on current state.
 * @returns {void} - No return value.
 */
export function toggleFlicker() {
  document.body.classList.toggle('flicker');
}
