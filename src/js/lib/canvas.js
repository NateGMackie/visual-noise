// src/js/lib/canvas.js
// Purpose: Centralize canvas/DPR helpers so programs use one consistent path.
// Exports: getDPR, clampDPR, attachHiDPICanvas, resizeToDisplaySize, clearCanvas, withResize

/**
 * Get the current device pixel ratio with a sane default.
 * @returns {number}
 */
export function getDPR() {
  return Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
}

/**
 * Clamp an arbitrary DPR to a safe range (e.g., to reduce GPU load).
 * @param {number} dpr
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clampDPR(dpr, min = 1, max = 2) {
  return Math.max(min, Math.min(max, dpr));
}

/**
 * Attach a hi-DPI backing store to an existing <canvas>.
 * Keeps CSS size in CSS pixels but scales the backing store by DPR.
 * @param {HTMLCanvasElement} canvas
 * @param {number} [targetDpr]  If omitted, uses getDPR().
 * @returns {{ctx: CanvasRenderingContext2D, dpr: number}}
 */
export function attachHiDPICanvas(canvas, targetDpr) {
  const dpr = clampDPR(targetDpr ?? getDPR());
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, dpr };
}

/**
 * If the canvas’ CSS size changed, resize its backing store & keep transform.
 * Returns true if a resize occurred.
 * @param {HTMLCanvasElement} canvas
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} [targetDpr]
 */
export function resizeToDisplaySize(canvas, ctx, targetDpr) {
  const dpr = clampDPR(targetDpr ?? getDPR());
  const { width: cssW, height: cssH } = canvas.getBoundingClientRect();
  const bsW = Math.floor(cssW * dpr);
  const bsH = Math.floor(cssH * dpr);
  if (canvas.width !== bsW || canvas.height !== bsH) {
    canvas.width = bsW;
    canvas.height = bsH;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }
  return false;
}

/**
 * Clear the current canvas taking DPR scaling into account.
 * @param {HTMLCanvasElement} canvas
 * @param {CanvasRenderingContext2D} ctx
 */
export function clearCanvas(canvas, ctx) {
  // Because transform is dpr-scaled, clear using CSS-pixel space:
  const { width, height } = canvas.getBoundingClientRect();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  // Optional: also clear in CSS units (redundant but explicit)
  ctx.clearRect(0, 0, width, height);
}

/**
 * Utility: observe resize and call a handler with {ctx, dpr}.
 * @param {HTMLCanvasElement} canvas
 * @param {(ctx:CanvasRenderingContext2D, dpr:number)=>void} onResize
 * @param {number} [targetDpr]
 * @returns {()=>void} cleanup
 */
export function withResize(canvas, onResize, targetDpr) {
  const ro = new ResizeObserver(() => {
    const { ctx, dpr } = attachHiDPICanvas(canvas, targetDpr);
    onResize(ctx, dpr);
  });
  ro.observe(canvas);
  // Initial attach:
  const { ctx, dpr } = attachHiDPICanvas(canvas, targetDpr);
  onResize(ctx, dpr);
  return () => ro.disconnect();
}
