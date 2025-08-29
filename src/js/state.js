// src/js/state.js

// -------------------------
// Legacy-compatible config
// -------------------------
export const cfg = {
  persona: 'crypto',   // legacy "current mode" name (still honored)
  theme: 'classic',
  dock: 'bottom',
  speed: 0.7,            // 1x default render speed
  paused: false,       // running by default
};

// Simple event bus (unchanged)
const listeners = new Map(); // event -> Set<fn>
export function on(evt, fn){
  if(!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
}
export function off(evt, fn){ listeners.get(evt)?.delete(fn); }
export function emit(evt, data){ listeners.get(evt)?.forEach(fn => fn(data)); }

// -------------------------
// NEW: Single Source of Truth
// family -> mode -> flavor
// -------------------------
export const registry = {
  order: ['system', 'developer', 'rain', 'fire'],
  families: {
    system: {
      name: 'system monitor',
      modesOrder: ['crypto', 'sysadmin'],
      modes: {
        crypto: {
          name: 'crypto',
          flavorsOrder: ['classic'],
          flavors: {
            classic: { name: 'classic', defaultSpeed: 5, minSpeed: 1, maxSpeed: 9, step: 1 }
          },
          impl: 'crypto',
        },
        sysadmin: {
          name: 'sysadmin',
          flavorsOrder: ['classic'],
          flavors: {
            classic: { name: 'classic', defaultSpeed: 5, minSpeed: 1, maxSpeed: 9, step: 1 }
          },
          impl: 'sysadmin',
        },
      },
    },

    developer: {
      name: 'developer',
      modesOrder: ['mining'],
      modes: {
        mining: {
          name: 'mining',
          flavorsOrder: ['classic'],
          flavors: {
            classic: { name: 'classic', defaultSpeed: 5, minSpeed: 1, maxSpeed: 9, step: 1 }
          },
          impl: 'mining',
        },
      },
    },

    rain: {
      name: 'rain',
      modesOrder: ['matrix', 'bsd', 'digitalrain'],
      modes: {
        matrix: {
          name: 'matrix',
          flavorsOrder: ['classic'],
          flavors: {
            classic: { name: 'classic', defaultSpeed: 6, minSpeed: 1, maxSpeed: 10, step: 1 }
          },
          impl: 'matrix',
        },
        bsd: {
          name: 'BSD',
          flavorsOrder: ['classic'],
          flavors: {
            classic: { name: 'classic', defaultSpeed: 5, minSpeed: 1, maxSpeed: 10, step: 1 }
          },
          impl: 'rain_bsd',
        },
        digitalrain: {
          name: 'digital rain',
          flavorsOrder: ['classic'],
          flavors: {
            classic: { name: 'classic', defaultSpeed: 6, minSpeed: 1, maxSpeed: 10, step: 1 }
          },
          impl: 'digitalrain',
        },
      },
    },

    fire: {
      name: 'fire',
      modesOrder: ['fire'],
      modes: {
        fire: {
          name: 'fire',
          flavorsOrder: ['glow', 'simple'],
          flavors: {
            glow:   { name: 'glow',   defaultSpeed: 5, minSpeed: 1, maxSpeed: 9, step: 1 },
            simple: { name: 'simple', defaultSpeed: 5, minSpeed: 1, maxSpeed: 9, step: 1 },
          },
          impl: 'fire',
        },
      },
    },
  },
};

// Active selection in the taxonomy
export const active = {
  familyId: 'system',
  modeId: 'crypto',
  flavorId: 'classic',
  themeId: cfg.theme,
  speed: null, // null means "use flavor's default on init"
};

// Helpers that consumers (UI/hotkeys) can use
export function fullId(a = active) { return `${a.familyId}.${a.modeId}.${a.flavorId}`; }

export function getNode(path = active) {
  const fam = registry.families[path.familyId];
  const mode = fam?.modes?.[path.modeId];
  const flav = mode?.flavors?.[path.flavorId];
  return { fam, mode, flav };
}

export function initDefaults() {
  const { flav } = getNode();
  if (active.speed == null && flav) active.speed = flav.defaultSpeed ?? 5;
}

// Move pointers while staying valid
export function setFamily(nextFamilyId) {
  const fam = registry.families[nextFamilyId]; if (!fam) return;
  active.familyId = nextFamilyId;
  active.modeId = fam.modesOrder[0];
  active.flavorId = fam.modes[active.modeId].flavorsOrder[0];
  initDefaults();
}
export function setModeInActiveFamily(nextModeId) {
  const fam = registry.families[active.familyId]; if (!fam?.modes[nextModeId]) return;
  active.modeId = nextModeId;
  active.flavorId = fam.modes[nextModeId].flavorsOrder[0];
  initDefaults();
}
export function setFlavor(nextFlavorId) {
  const { mode } = getNode(); if (!mode?.flavors[nextFlavorId]) return;
  active.flavorId = nextFlavorId;
  initDefaults();
}

export function stepMode(delta) {
  const fam = registry.families[active.familyId];
  const list = fam.modesOrder;
  const i = Math.max(0, list.indexOf(active.modeId));
  const j = (i + delta + list.length) % list.length;
  setModeInActiveFamily(list[j]);
}
export function stepFlavor(delta) {
  const { mode } = getNode();
  const list = mode.flavorsOrder;
  const i = Math.max(0, list.indexOf(active.flavorId));
  const j = (i + delta + list.length) % list.length;
  setFlavor(list[j]);
}

export function jumpModeByIndex(idx1based) {
  const fam = registry.families[active.familyId];
  const list = fam.modesOrder;
  const i = Math.min(Math.max(1, idx1based), list.length) - 1;
  setModeInActiveFamily(list[i]);
}
export function jumpFlavorByIndex(idx1based) {
  const { mode } = getNode();
  const list = mode.flavorsOrder;
  const i = Math.min(Math.max(1, idx1based), list.length) - 1;
  setFlavor(list[i]);
}

export function speedBounds() {
  const { flav } = getNode();
  return { min: flav?.minSpeed ?? 1, max: flav?.maxSpeed ?? 9, step: flav?.step ?? 1 };
}
export function setSpeed(next) {
  const { min, max } = speedBounds();
  active.speed = Math.max(min, Math.min(max, next));
  cfg.speed = active.speed; // keep legacy field coherent
  emit('speed', cfg.speed);
}
export function stepSpeed(delta) {
  const { step } = speedBounds();
  setSpeed((active.speed ?? 5) + Math.sign(delta) * step);
}

// For UI labels
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
export function setMode(modeName){
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

export function setTheme(theme){ 
  cfg.theme = theme; 
  active.themeId = theme;
  emit('theme', theme); 
}

// --- taxonomy: map mode keys -> { family, typeLabel } ---
export const taxonomy = {
  // system
  crypto:      { family: 'system',    typeLabel: 'crypto' },
  sysadmin:    { family: 'system',    typeLabel: 'sysadmin' },
  // developer
  mining:      { family: 'developer', typeLabel: 'mining' },
  // rain
  matrix:      { family: 'rain',      typeLabel: 'matrix' },
  rain_bsd:    { family: 'rain',      typeLabel: 'bsd' },
  digitalrain: { family: 'rain',      typeLabel: 'digital rain' },
  // fire
  fire:        { family: 'fire',      typeLabel: 'fire' },
};

export function labelsForMode(modeName){
  const t = taxonomy[modeName] || { family: 'unknown', typeLabel: modeName || '' };
  return { familyLabel: t.family, typeLabel: t.typeLabel };
}


// Speed / Pause / Clear (unchanged public surface)
export function incSpeed(f = 1.2){ setSpeed((active.speed ?? cfg.speed) * f); }
export function decSpeed(f = 1/1.2){ setSpeed((active.speed ?? cfg.speed) * f); }
export function togglePause(){ cfg.paused = !cfg.paused; emit('paused', cfg.paused); }
export function clearAll(){ emit('clear'); }
