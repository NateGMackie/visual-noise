// src/js/lib/utils.js
// Tiny cross-program helpers; keep this boring and universal.

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
export const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Seeded PRNG (Mulberry32) for deterministic effects.
 * @param {number} [seed] - 32-bit unsigned integer seed (will be coerced).
 * @returns {() => number} RNG function that returns a float in [0, 1).
 */
export function makeRng(seed = Date.now()) {
  let s = seed >>> 0 || 0;
  return function rng() {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
