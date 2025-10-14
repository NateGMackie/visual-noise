// src/js/state.js

import { registry as modeRegistry } from './modes/index.js';
import { DEFAULT_SPEED_MODEL } from './lib/speed.js';
import { applyEffects } from './ui/effects.js';

/**
 * -------------------------
 * Legacy-compatible config
 * ------------------------
 */
export const cfg = {
  persona: 'liveOutput', // legacy "current mode" name (still honored)
  theme: 'classic',
  dock: 'bottom',
  speed: 0.7, // legacy multiplier; will stay coherent with speed index
  paused: false, // running by default
  fx: {
    // DEFAULTS ON
    scanlines: true,
    flicker: true,
  },
};

// Apply global CRT overlays once on boot
applyEffects(cfg.fx);

// Simple event bus (unchanged)
const listeners = new Map(); // event -> Set<fn>

/**
 * Subscribe a handler to an event name.
 * @param {string} evt - Event name (e.g., "mode", "flavor", "theme", "speed").
 * @param {(data:any)=>void} fn - Handler invoked with event payload.
 * @returns {void}
 */
export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
}

/**
 * Unsubscribe a handler from an event name.
 * @param {string} evt - Event name previously used with {@link on}.
 * @param {(data:any)=>void} fn - Handler to remove.
 * @returns {void}
 */
export function off(evt, fn) {
  listeners.get(evt)?.delete(fn);
}

/**
 * Emit an event to all subscribers.
 * @param {string} evt - Event name to emit.
 * @param {any} [data] - Optional payload for subscribers.
 * @returns {void}
 */
export function emit(evt, data) {
  listeners.get(evt)?.forEach((fn) => fn(data));
}

// -------------------------
// NEW: Single Source of Truth
// genre -> style -> vibe
// -------------------------
export const registry = {
  order: ['system', 'developer', 'rain', 'fire'],
  families: {
    system: {
      name: 'system',
      modesOrder: ['liveOutput', 'crypto', 'sysadmin'],
      modes: {
        liveOutput: {
          name: 'liveOutput',
          flavorsOrder: ['classic'],
          flavors: {
            classic: { name: 'classic', defaultSpeed: 5, minSpeed: 1, maxSpeed: 10, step: 1 },
          },
          impl: 'liveOutput',
        },
        crypto: {
          name: 'crypto',
          flavorsOrder: ['classic'],
          flavors: {
            classic: { name: 'classic', defaultSpeed: 5, minSpeed: 1, maxSpeed: 10, step: 1 },
          },
          impl: 'crypto',
        },
        sysadmin: {
          name: 'sysadmin',
          flavorsOrder: ['classic'],
          flavors: {
            classic: { name: 'classic', defaultSpeed: 5, minSpeed: 1, maxSpeed: 10, step: 1 },
          },
          impl: 'sysadmin',
        },
      },
    },

    developer: {
      name: 'developer',
      modesOrder: ['coding', 'mining'],
      modes: {
        coding: {
          name: 'coding',
          flavorsOrder: ['classic'],
          flavors: {
            classic: { name: 'classic', defaultSpeed: 5, minSpeed: 1, maxSpeed: 10, step: 1 },
          },
          impl: 'coding',
        },
        mining: {
          name: 'mining',
          flavorsOrder: ['classic'],
          flavors: {
            classic: { name: 'classic', defaultSpeed: 5, minSpeed: 1, maxSpeed: 10, step: 1 },
          },
          impl: 'mining',
        },
      },
    },

    rain: {
      name: 'rain',
      modesOrder: ['matrix', 'bsd', 'digitalrain', 'drizzle'],
      modes: {
        matrix: {
          name: 'matrix',
          flavorsOrder: ['classic'],
          flavors: {
            classic: { name: 'classic', defaultSpeed: 6, minSpeed: 1, maxSpeed: 10, step: 1 },
          },
          impl: 'matrix',
        },
        bsd: {
          name: 'BSD',
          flavorsOrder: ['classic'],
          flavors: {
            classic: { name: 'classic', defaultSpeed: 5, minSpeed: 1, maxSpeed: 10, step: 1 },
          },
          impl: 'rain_bsd',
        },
        digitalrain: {
          name: 'digital rain',
          flavorsOrder: ['classic'],
          flavors: {
            classic: { name: 'classic', defaultSpeed: 6, minSpeed: 1, maxSpeed: 10, step: 1 },
          },
          impl: 'digitalrain',
        },
        drizzle: {
          name: 'drizzle',
          flavorsOrder: ['classic'],
          flavors: {
            classic: { name: 'classic', defaultSpeed: 6, minSpeed: 1, maxSpeed: 10, step: 1 },
          },
          impl: 'drizzle',
        },
      },
    },

    fire: {
      name: 'fire',
      modesOrder: ['fire', 'fireAscii'],
      modes: {
        fire: {
          name: 'fire',
          flavorsOrder: ['classic'],
          flavors: {
            classic: { name: 'classic', defaultSpeed: 6, minSpeed: 1, maxSpeed: 10, step: 1 },
          },
          impl: 'fire',
        },
        fireAscii: {
          name: 'fireAscii',
          flavorsOrder: ['classic'],
          flavors: {
            classic: { name: 'classic', defaultSpeed: 6, minSpeed: 1, maxSpeed: 10, step: 1 },
          },
          impl: 'fireAscii',
        },
      },
    },
  },
};

// Active selection in the taxonomy
export const active = {
  familyId: 'system',
  modeId: 'liveOutput',
  flavorId: 'classic',
  themeId: cfg.theme,
  // IMPORTANT: we keep this as an INDEX on a 1..steps scale (human-friendly).
  // cfg.speed remains the derived multiplier for legacy code.
  speed: null, // null means "use flavor's default on init"
};

// Helpers that consumers (UI/hotkeys) can use

/**
 * Return a stable path string for the active selection.
 * @param {{familyId:string,modeId:string,flavorId:string}} [a] - Selection to stringify.
 * @returns {string} Dotted triple, e.g. "system.crypto.classic".
 */
export function fullId(a = active) {
  return `${a.familyId}.${a.modeId}.${a.flavorId}`;
}

/**
 * Resolve the registry nodes for a given selection path.
 * @param {{familyId:string,modeId:string,flavorId:string}} [path] - Selection path to resolve.
 * @returns {{ fam?:any, mode?:any, flav?:any }} Family, mode, and flavor objects if found.
 */
export function getNode(path = active) {
  const fam = registry.families[path.familyId];
  const mode = fam?.modes?.[path.modeId];
  const flav = mode?.flavors?.[path.flavorId];
  return { fam, mode, flav };
}

/**
 * Compute the speed multiplier from the current index using the shared DEFAULT_SPEED_MODEL.
 * We normalize the index 1..steps to the default model's 0..(steps-1) curve.
 * @param {number} idx1based - Index in [min..max] (usually 1..10).
 * @param {number} steps - Total number of steps for this flavor.
 * @returns {number} multiplier suitable for animation timing.
 */
function indexToMultiplier(idx1based, steps) {
  const zeroBased = Math.max(1, Math.min(steps, Math.round(idx1based))) - 1; // 0..steps-1
  // Remap zeroBased 0..(steps-1) onto DEFAULT_SPEED_MODEL domain (0..9)
  const t = steps > 1 ? zeroBased / (steps - 1) : 0;
  const defSteps = DEFAULT_SPEED_MODEL.steps; // 10
  const approxDefIdx = Math.round(t * (defSteps - 1));
  return DEFAULT_SPEED_MODEL.map(approxDefIdx);
}

/**
 * Initialize missing values (e.g., speed from flavor defaults).
 * Also keeps cfg.speed (multiplier) coherent with the chosen index.
 * @returns {void}
 */
export function initDefaults() {
  const { flav } = getNode();
  if (flav) {
    if (active.speed == null) active.speed = flav.defaultSpeed ?? 5;
    const steps = Math.max(1, Number(flav?.maxSpeed ?? 10));
    cfg.speed = indexToMultiplier(active.speed, steps);
  }
}

// Move pointers while staying valid

/**
 * Select a family and reset mode/flavor to that family's defaults.
 * @param {string} nextFamilyId - Family key present in {@link registry.families}.
 * @returns {void}
 */
export function setFamily(nextFamilyId) {
  const fam = registry.families[nextFamilyId];
  if (!fam) return;
  active.familyId = nextFamilyId;
  active.modeId = fam.modesOrder[0];
  active.flavorId = fam.modes[active.modeId].flavorsOrder[0];
  initDefaults();
}

/**
 * Select a mode within the current family and reset its flavor default.
 * @param {string} nextModeId - Mode key present in the current family's modes.
 * @returns {void}
 */
export function setModeInActiveFamily(nextModeId) {
  const fam = registry.families[active.familyId];
  if (!fam?.modes[nextModeId]) return;
  active.modeId = nextModeId;
  active.flavorId = fam.modes[nextModeId].flavorsOrder[0];
  initDefaults();
}

/**
 * Select a flavor (style) for the current mode.
 * Emits "flavor" after updating.
 * @param {string} nextFlavorId - Flavor key present in the current mode.
 * @returns {void}
 */
export function setFlavor(nextFlavorId) {
  const { mode } = getNode();
  if (!mode?.flavors[nextFlavorId]) return;
  active.flavorId = nextFlavorId;
  initDefaults();
  emit('flavor', { modeId: active.modeId, flavorId: active.flavorId });
}

/**
 * Step to the next/previous mode in the current family.
 * @param {number} delta - Positive to go forward, negative to go backward.
 * @returns {void}
 */
export function stepMode(delta) {
  const fam = registry.families[active.familyId];
  const list = fam.modesOrder;
  const i = Math.max(0, list.indexOf(active.modeId));
  const j = (i + delta + list.length) % list.length;
  setModeInActiveFamily(list[j]);
}

/**
 * Step to the next/previous flavor in the current mode.
 * @param {number} delta - Positive to go forward, negative to go backward.
 * @returns {void}
 */
export function stepFlavor(delta) {
  const { mode } = getNode();
  const list = mode.flavorsOrder;
  const i = Math.max(0, list.indexOf(active.flavorId));
  const j = (i + delta + list.length) % list.length;
  setFlavor(list[j]);
}

/**
 * Jump to a specific mode by 1-based index within the current family.
 * @param {number} idx1based - 1-based index into the family's modesOrder.
 * @returns {void}
 */
export function jumpModeByIndex(idx1based) {
  const fam = registry.families[active.familyId];
  const list = fam.modesOrder;
  const i = Math.min(Math.max(1, idx1based), list.length) - 1;
  setModeInActiveFamily(list[i]);
}

/**
 * Jump to a specific flavor by 1-based index within the current mode.
 * @param {number} idx1based - 1-based index into the mode's flavorsOrder.
 * @returns {void}
 */
export function jumpFlavorByIndex(idx1based) {
  const { mode } = getNode();
  const list = mode.flavorsOrder;
  const i = Math.min(Math.max(1, idx1based), list.length) - 1;
  setFlavor(list[i]);
}

/**
 * Return the current speed bounds for the active flavor.
 * (Still provided for callers that want min/max/step; this is the index scale.)
 * @returns {{min:number,max:number,step:number}} Bounds and step size.
 */
export function speedBounds() {
  const { flav } = getNode();
  return { min: flav?.minSpeed ?? 1, max: flav?.maxSpeed ?? 10, step: flav?.step ?? 1 };
}

/**
 * Set the current speed by INDEX (human 1..steps), clamped to bounds.
 * Mirrors the computed multiplier to legacy {@link cfg.speed} and emits "speed".
 * @param {number} next - Target speed index (e.g., 6 for “6/10”).
 * @returns {void}
 */
export function setSpeed(next) {
  const { min, max } = speedBounds();
  const clampedIndex = Math.max(min, Math.min(max, Math.round(Number(next))));
  active.speed = clampedIndex;

  // Keep legacy multiplier coherent
  const steps = Math.max(1, Number(max));
  cfg.speed = indexToMultiplier(clampedIndex, steps);
  // Also emit an index-style event for X/N UI toasts
  emit('speed.step', { index: active.speed, total: speedBounds().max });

  // Emit the multiplier (legacy behavior), but callers can read the label via getSpeedLabel()
  emit('speed', cfg.speed);
}

/**
 * Increment/decrement speed by one index step (ignores multiplier semantics).
 * @param {number} delta - Positive to increase, negative to decrease.
 * @returns {void}
 */
export function stepSpeed(delta) {
  const { step } = speedBounds();
  setSpeed((active.speed ?? 5) + Math.sign(delta) * step);
}

/**
 * Human-friendly "X/N" label for the active speed index.
 * @returns {string} A display label like "6/10" reflecting the current index and total steps.
 */
export function getSpeedLabel() {
  const { max } = speedBounds();
  const idx = Math.min(Math.max(1, active.speed ?? 5), max);
  return `${idx}/${max}`;
}

/**
 * Read the current speed multiplier (what render loops should use).
 * @returns {number} The global speed multiplier derived from the index (≈0.4–1.6).
 */
export function getSpeedMultiplier() {
  return cfg.speed;
}

/**
 * Multiply current speed by a factor (legacy shape).
 * NOW reinterpreted as “step by 1” to line up with hotkeys/UI.
 * @param {number} [_f] - Ignored; kept for signature compatibility.
 * @returns {void}
 */
export function incSpeed(_f = 1.2) {
  stepSpeed(1);
}

/**
 * Divide current speed by a factor (legacy shape).
 * NOW reinterpreted as “step by -1” to line up with hotkeys/UI.
 * @param {number} [_f] - Ignored; kept for signature compatibility.
 * @returns {void}
 */
export function decSpeed(_f = 1 / 1.2) {
  stepSpeed(-1);
}

/**
 * Clamp & emit fire height (0..100).
 * Accepts number-like input and coerces with Number().
 * @param {number|string} next - Target height value; will be clamped between 0 and 100.
 * @returns {void}
 */
export function setFireHeight(next) {
  const h = Math.max(0, Math.min(100, Number(next)));
  emit('fire.height', h);
}

/**
 * Clamp & emit fire fuel (0..100).
 * Accepts number-like input and coerces with Number().
 * @param {number|string} next - Target fuel value; will be clamped between 0 and 100.
 * @returns {void}
 */
export function setFireFuel(next) {
  const f = Math.max(0, Math.min(100, Number(next)));
  emit('fire.fuel', f);
}

// For UI labels

/**
 * Human-friendly labels for the active selection.
 * @returns {{family:string,mode:string,flavor:string}} Labels suitable for UI.
 */
export function labels() {
  const { fam, mode, flav } = getNode();
  return {
    family: fam?.name ?? active.familyId,
    mode: mode?.name ?? active.modeId,
    flavor: flav?.name ?? active.flavorId,
  };
}

// -------------------------
// Legacy API kept intact
// -------------------------

/**
 * Set the active mode by legacy "persona" name and emit "mode".
 * Also updates the structured selection pointers.
 * @param {string} modeName - Mode key (e.g., "crypto", "sysadmin").
 * @returns {void}
 */
export function setMode(modeName) {
  // Update legacy field and emit as before
  cfg.persona = modeName;

  // Also map it into the registry selection so the rest of the app
  // can use family->mode->flavor now.
  // Find which family contains this mode name:
  for (const [famId, fam] of Object.entries(registry.families)) {
    if (fam.modes[modeName]) {
      active.familyId = famId;
      active.modeId = modeName;
      active.flavorId = fam.modes[modeName].flavorsOrder[0];
      initDefaults();
      break;
    }
  }

  emit('mode', modeName);
}

/**
 * Set the current theme (vibe) by name and emit "theme".
 * @param {string} theme - Theme key (e.g., "classic", "clu").
 * @returns {void}
 */
export function setTheme(theme) {
  cfg.theme = theme;
  active.themeId = theme;
  emit('theme', theme);
}

// --- taxonomy: map mode keys -> { family, typeLabel } ---
export const taxonomy = {
  // system
  liveOutput: { family: 'system', typeLabel: 'liveOutput' },
  crypto: { family: 'system', typeLabel: 'crypto' },
  sysadmin: { family: 'system', typeLabel: 'sysadmin' },
  // developer
  coding: { family: 'developer', typeLabel: 'coding' },
  mining: { family: 'developer', typeLabel: 'mining' },
  // rain
  matrix: { family: 'rain', typeLabel: 'matrix' },
  bsd: { family: 'rain', typeLabel: 'bsd' },
  rain_bsd: { family: 'rain', typeLabel: 'bsd' },
  digitalrain: { family: 'rain', typeLabel: 'digital rain' },
  drizzle: { family: 'rain', typeLabel: 'drizzle' },
  // fire
  fire: { family: 'fire', typeLabel: 'fire' },
  fireAscii: { family: 'fire', typeLabel: 'fireAscii' },
};

/**
 * Compute labels for a given mode id (fallbacks to static taxonomy).
 * @param {string} id - Mode key to label.
 * @returns {{familyLabel:string,typeLabel:string}} UI labels.
 */
export function labelsForMode(id) {
  const mod = modeRegistry?.[id];
  if (mod && mod.info) {
    const familyLabel = mod.info.family || id;
    const typeLabel = mod.info.flavor || mod.info.type || mod.info.variant || id;
    return { familyLabel, typeLabel };
  }
  // fallback to static table for older modes
  const t = taxonomy[id] || { family: 'unknown', typeLabel: id || '' };
  return { familyLabel: t.family, typeLabel: t.typeLabel };
}

/**
 * Genre/style labels wrapper for newer terminology.
 * @param {string} name - Mode key to label.
 * @returns {{genreLabel:string,styleLabel:string}} Genre and style labels.
 */
export function labelsForGenreStyle(name) {
  const { familyLabel, typeLabel } = labelsForMode(name);
  return { genreLabel: familyLabel, styleLabel: typeLabel };
}

/**
 * Toggle the paused state and emit "paused".
 * @returns {void}
 */
export function togglePause() {
  cfg.paused = !cfg.paused;
  emit('paused', cfg.paused);
}

/**
 * Emit a "clear" event for consumers to wipe their state/canvas.
 * @returns {void}
 */
export function clearAll() {
  emit('clear');
}
