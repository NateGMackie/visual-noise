// src/js/lib/typography.js
// Purpose: Unify font sizing for all programs (one modular scale).

/**
 * Modular scale helper. Example ratios: 1.20 (minor third), 1.25 (major third).
 * @param {number} step 0 = base, 1 = one step up, -1 = one step down
 * @param {number} [base] base font in px
 * @param {number} [ratio]
 * @returns {number} px value (float; consumer can Math.round)
 */
export function modular(step, base = 14, ratio = 1.2) {
  return base * Math.pow(ratio, step);
}

/**
 * Monospace grid helper for canvas text.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} px
 * @param {string} [family]
 */
export function applyMono(
  ctx,
  px,
  family = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'
) {
  ctx.font = `${Math.round(px)}px ${family}`;
}
