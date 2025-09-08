/* eslint-env browser */
// src/js/lib/speed.js
// Shared speed model helpers

/** @typedef {{ steps:number, defaultIndex:number, map:(idx:number)=>number }} SpeedModel */

/**
 * A sane default: 10 steps, midpoint default.
 * Map 0..9 to a multiplier ~ 0.4x .. 1.6x, centered at 1.0.
 * Tweak the range if you like (range=0.6 → 1.0±0.6).
 * @type {SpeedModel}
 */
export const DEFAULT_SPEED_MODEL = (() => {
  const steps = 10; // “/10” UI
  const defaultIndex = 5; // midpoint
  const minMult = 0.4;
  const maxMult = 1.6;
  const map = (idx) => {
    const clamped = Math.max(0, Math.min(steps - 1, idx));
    const t = clamped / (steps - 1); // 0..1
    return minMult + (maxMult - minMult) * t;
  };
  return { steps, defaultIndex, map };
})();

/**
 * Utility to coerce any program’s speedModel to a full model with defaults.
 * @param {Partial<SpeedModel>|undefined} m
 * @returns {SpeedModel}
 */
export function coerceSpeedModel(m) {
  if (!m) return DEFAULT_SPEED_MODEL;
  const steps = Number.isFinite(m.steps) ? m.steps : DEFAULT_SPEED_MODEL.steps;
  const defaultIndex = Number.isFinite(m.defaultIndex)
    ? m.defaultIndex
    : Math.min(Math.max(0, Math.floor(steps / 2)), steps - 1);
  const map =
    typeof m.map === 'function'
      ? (idx) => m.map(Math.max(0, Math.min(steps - 1, idx)))
      : (idx) =>
          DEFAULT_SPEED_MODEL.map(
            Math.round((idx / (steps - 1)) * (DEFAULT_SPEED_MODEL.steps - 1))
          );
  return { steps, defaultIndex, map };
}
