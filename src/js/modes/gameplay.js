/* eslint-env browser */

// src/js/modes/gameplay.js
// Program: Zorkish Autoplay (terminal only)
// Genre: Developer
// Style: game play
//
// Terminal-only autoplay: prompt → command → response (+ occasional death).
// Draws to canvas and follows vibe (--bg / --fg / --accent).

import { modular } from '../lib/typography.js';

/** @typedef {any} CanvasRenderingContext2D */

/**
 * Render context passed by the host each frame.
 * @typedef {object} RenderCtx
 * @property {CanvasRenderingContext2D} ctx2d - 2D drawing context (already DPR-scaled in our code).
 * @property {number} w - Canvas width in device pixels.
 * @property {number} h - Canvas height in device pixels.
 * @property {number} dpr - Device pixel ratio used by the canvas.
 * @property {number} [elapsed] - Time since last frame (ms).
 * @property {number} [dt] - Delta time in seconds (for blink/caret).
 * @property {boolean} [paused] - Whether animation is paused.
 * @property {number} [speed] - Global speed multiplier (~0.4–1.6).
 */

// ———————————————————————————————————————————————
// Helpers (random, palette, formatting)
// ———————————————————————————————————————————————

/**
 * Random integer in [0, n).
 * @param {number} n - Exclusive upper bound.
 * @returns {number} Random integer from 0 up to but not including n.
 */
function rand(n) {
  return (Math.random() * n) | 0;
}

/**
 * Pick a random element from an array.
 * @template T
 * @param {T[]} arr - Source array.
 * @returns {T} A randomly selected item from the array.
 */
function pick(arr) {
  return arr[rand(arr.length)];
}

/**
 * Bernoulli trial.
 * @param {number} p - Probability between 0 and 1.
 * @returns {boolean} True with probability p, otherwise false.
 */
function chance(p) {
  return Math.random() < p;
}

/**
 * Random integer in [min, max).
 * @param {number} min - Inclusive lower bound.
 * @param {number} max - Exclusive upper bound.
 * @returns {number} Random integer in the half-open range [min, max).
 */
function randInt(min, max) {
  return (min + Math.random() * (max - min)) | 0;
}

/**
 * Format an array as a bullet list (without trailing newline).
 * @param {string[]} arr - Items.
 * @param {string} [indent] - Left padding before the dash.
 * @returns {string[]} Array of list item strings with dashes.
 */
function listify(arr, indent = '  ') {
  return arr.map((x) => `${indent}- ${x}`);
}

/**
 * Replace {obj} tokens in a string.
 * @param {string} tpl - Template with {obj}.
 * @param {string} obj - Replacement.
 * @returns {string} Interpolated string with {obj} replaced.
 */
function format(tpl, obj) {
  return tpl.replaceAll('{obj}', obj);
}

/**
 * Read a CSS variable, fallback if missing.
 * @param {string} name - CSS var name (e.g., '--bg').
 * @param {string} fallback - Fallback color/string.
 * @returns {string} Resolved CSS variable value (or fallback).
 */
function cssVar(name, fallback) {
  const v = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/**
 * Current palette from vibe.
 * @returns {{bg:string, fg:string, accent:string}} Object containing background, foreground, and accent colors.
 */
function readPalette() {
  return {
    bg: cssVar('--bg', '#0b0c10'),
    fg: cssVar('--fg', '#c7f7c7'),
    accent: cssVar('--accent', '#e3ffe3'),
  };
}

// ———————————————————————————————————————————————
// Script data
// ———————————————————————————————————————————————
const DATA = {
  movement: ['go north', 'go south', 'go east', 'go west', 'up', 'down'],
  needsObject: ['read', 'examine', 'open', 'light', 'take', 'drop'],
  actions: {
    look: [
      'You take a careful look around.',
      'You scan the shadows.',
      'Nothing seems out of place.',
    ],
    read: [
      'You read the {obj}. The script is archaic and smudged.',
      'You puzzle out a line on the {obj}. It hints at a passage.',
      'The {obj} speaks of old oaths and older doors.',
    ],
    examine: [
      'You examine the {obj}. Time has not been kind.',
      'The {obj} shows scuffs and age—no obvious secrets.',
      'If the {obj} holds a secret, it is not eager to share.',
    ],
    open: [
      'You try the {obj}. It resists, then gives with a reluctant groan.',
      'You pry at the {obj}. It doesn’t budge.',
      'Somewhere, something clicks inside the {obj}.',
    ],
    light: [
      'You strike a spark. The {obj} flickers to life.',
      'The {obj} glows to a steady burn.',
      'A weak flame sputters on the {obj}, then steadies.',
    ],
    yell: [
      'Your voice ricochets through the halls.',
      "The echo returns a half-second late, like it's sneaking up on you.",
      "Somewhere distant, something answers. Or maybe it's only air.",
    ],
    jump: ['Look what you can do.'],
    xyzz: ['Fool!'],
    takeOne: ['Taken: {obj}.', 'You pocket the {obj}.', 'You secure the {obj}.'],
    takeAll: [
      'You gather what you can.',
      'You scoop up the obvious valuables.',
      'You make a quick sweep.',
    ],
    dropOne: ['Dropped: {obj}.', 'You set the {obj} down.', 'You discard the {obj}.'],
    wait: ['Time passes...'],
  },
  utilities: { inventory: 'You are carrying:', save: 'Game saved.' },
  rooms: [
    {
      title: 'West of a Small House',
      desc: 'You are standing in an open field west of a white house, with a boarded front door. The grass remembers footsteps.',
    },
    {
      title: 'Behind the House',
      desc: 'You are behind the white house. A path leads into the forest to the east. A small window is slightly ajar.',
    },
    {
      title: 'Kitchen',
      desc: 'You are in the kitchen of the white house. Dust motes drift in a shaft of light. A scuffed table, a cold stove.',
    },
    {
      title: 'Living Room',
      desc: 'You are in the living room. A threadbare rug anchors the room. A fogged display case waits.',
    },
    {
      title: 'Cellar',
      desc: 'You are in a dark damp cellar. Water ticks somewhere, counting down nothing in particular.',
    },
    {
      title: 'Twisty Passages',
      desc: 'Corridors knot and double back, swallowing your echo before it can find you again.',
    },
    { title: 'Riverside', desc: 'Black water slides south. A footbridge complains in the breeze.' },
    {
      title: 'Temple',
      desc: 'Faded prayers line the stone. Cold light filters down in pale columns.',
    },
    {
      title: 'Observation Deck',
      desc: 'Cracked viewport, stars beyond like frost on black glass. Systems hum, pretending all is well.',
    },
    {
      title: 'Maintenance Room',
      desc: 'Panels, labels, and a smear of grease on everything hint at consequences.',
    },
    {
      title: 'Round Room',
      desc: 'A circular chamber with too many choices. Several are blocked by collapses.',
    },
    {
      title: 'Torch Room',
      desc: 'A white pedestal holds a stubborn flame that never quite warms the air.',
    },
    {
      title: 'Cavern',
      desc: 'Stony teeth bristle overhead. Your light never reaches the far wall.',
    },
    {
      title: 'Bridge',
      desc: 'A rope span sways over a noisy darkness that refuses to be measured.',
    },
    {
      title: 'Attic',
      desc: 'Crates, dust, and the faint shape of a life packed away. A coil of rope remembers a useful past.',
    },
    {
      title: 'Dungeon Cell',
      desc: 'Rusted iron and the promise of regret. Chains move once, then pretend they didn’t.',
    },
    {
      title: 'Ancient Library',
      desc: 'Shelves sag under the weight of words. The air smells like slow thunder.',
    },
    {
      title: 'Hidden Laboratory',
      desc: 'Glass and wire. Something hums at a frequency you feel in your teeth.',
    },
    {
      title: 'Maze of Little Passages',
      desc: 'Passages huddle together, pretending to be different and failing.',
    },
    { title: 'Dam', desc: 'Water pours over the abandoned dam. The old sluice gates are closed.' },
  ],
  items: [
    'a lamp',
    'a key',
    'a coil of rope',
    'some flint',
    'a worn map',
    'a brown sack',
    'a small knife',
    'a bottle of water',
    'a wrench',
    'a screwdriver',
    'a box of matches',
    'a shiny bell',
    'an old book',
    'used candles',
    'a decorative bracelet',
    'an old skull',
    'a tiny figurine of a sailor',
    'a light coin pouch',
    'a beautiful bauble',
    'a small label',
    'a professionally printed leaflet',
    'a dusty coffin',
    'a plain looking case',
    'a murky window',
    'an ominous trap door',
    'ornate pedestal',
    'a sturdy railing',
    'ancient glyphs',
    'a metal panel with buttons, knobs and lights',
    'a torch',
  ],
  weights: { move: 0.5, action: 0.35, util: 0.15 },
};

const DEATH = {
  enabled: true,
  chancePerTurn: 0.05,
  messages: [
    'A lurking shadow springs! Everything goes dark.',
    'You slip on slick stone and vanish into the chasm.',
    'A cold wind snuffs your light. Something moves nearby...',
    'A rusty mechanism engages with a cheerful click. Floor removed.',
    'Alarms wail. The corridor seals. Your breath fogs, then stops.',
  ],
};

// ———————————————————————————————————————————————
// Internal state (render + game)
// ———————————————————————————————————————————————
let PALETTE = readPalette();
let lineH = 18;
let fontPx = 16;

const MAX_BUFFER_LINES = 600;
let buffer = /** @type {string[]} */ ([]); // committed lines
let caretBlink = 0;
let caretOn = true;

// In-progress input so it renders on one line with the prompt
/** @type {string|null} */
let activeInput = null;

// typing cadence (scaled by ctx.speed)
const TYPING = {
  charDelayMinMs: 45,
  charDelayMaxMs: 120,
  prePromptDelayMs: 120,
  jitterPauseChance: 0.18,
  jitterPauseMs: 120,
};
let speedScale = 1;
const queue = []; // { kind:'cmd'|'line'|'blank', text?, meta? }
/** @type {{text:string,i:number,preDelayUntil:number,nextCharAt:number,cmdType:'move'|'action'|'util'}|null} */
let typing = null;

let currentRoom = null;
let visibleItems = [];
let inventory = [];

// ———————————————————————————————————————————————
// Engine shims
// ———————————————————————————————————————————————

/**
 * Apply speed multiplier (clamped).
 * @param {number} mult - Suggested speed multiplier.
 * @returns {void} No return value.
 */
function applySpeed(mult) {
  const m = Math.max(0.4, Math.min(1.6, Number(mult) || 1));
  speedScale = m;
}

/**
 * Scale a millisecond delay by current speed.
 * @param {number} ms - Base milliseconds.
 * @returns {number} Milliseconds adjusted by current speed.
 */
function scaledDelay(ms) {
  return ms / Math.max(0.1, speedScale);
}

/**
 * Append a committed line to the buffer (with cap).
 * @param {string} s - Line content.
 * @returns {void} No return value.
 */
function pushLine(s) {
  buffer.push(s);
  if (buffer.length > MAX_BUFFER_LINES)
    buffer.splice(0, buffer.length - Math.floor(MAX_BUFFER_LINES * 0.8));
}

/**
 * Ensure N trailing blank lines exist.
 * @param {number} n - How many blanks to keep at the end.
 * @returns {void} No return value.
 */
function ensureTrailingBlankLines(n) {
  let have = 0;
  for (let i = buffer.length - 1; i >= 0 && buffer[i] === ''; i--) have++;
  while (have < n) {
    buffer.push('');
    have++;
  }
}

// ———————————————————————————————————————————————

/**
 * Show a prompt (single logical line). Resets active input.
 * @returns {void} No return value.
 */
function showPrompt() {
  ensureTrailingBlankLines(2);
  pushLine('>');
  activeInput = '';
}

/**
 * Choose a sensible object noun for a verb.
 * @param {string} verb - Action verb.
 * @returns {string|null} Chosen noun (or null if none).
 */
function chooseActionObject(verb) {
  const v = verb.toLowerCase();
  const preferVisible = (names) => names.find((n) => visibleItems.includes(n)) || null;

  if (v === 'light') {
    const c = ['the torch', 'the lamp', 'the candles', 'a match'];
    return preferVisible(c) || pick(c);
  }
  if (v === 'read') {
    const c = [
      'the old book',
      'the map',
      'the label',
      'the leaflet',
      'the inscription',
      'the panel',
    ];
    return preferVisible(c) || pick(c);
  }
  if (v === 'examine') {
    const c = [
      'the door',
      'the window',
      'the pedestal',
      'the railing',
      'the glyphs',
      'the case',
      'the coffin',
      'the rope',
      'the knife',
      'the map',
      'the key',
      'the skull',
      'the figurine',
    ];
    return preferVisible(c) || pick(c);
  }
  if (v === 'open') {
    const c = [
      'the door',
      'the window',
      'the trap door',
      'the case',
      'the mailbox',
      'the lid',
      'the coffin',
    ];
    return preferVisible(c) || pick(c);
  }
  if (v === 'take') {
    if (visibleItems.length > 1) return 'all';
    return visibleItems[0] || pick(DATA.items);
  }
  if (v === 'drop') {
    if (inventory.length) return pick(inventory);
    const c = ['the rope', 'the knife', 'the map', 'the bauble', 'the coin pouch'];
    return pick(c);
  }
  return null;
}

/**
 * Enter a new room and present its description.
 * @returns {void} No return value.
 */
function enterNewRoom() {
  currentRoom = pick(DATA.rooms);
  visibleItems = [];
  const k = randInt(0, 4);
  const pool = DATA.items.slice();
  for (let i = 0; i < k; i++) {
    if (!pool.length) break;
    const it = pool.splice(rand(pool.length), 1)[0];
    visibleItems.push(it);
  }
  pushLine(currentRoom.title);
  pushLine(currentRoom.desc);
  if (visibleItems.length) {
    pushLine('You notice:');
    listify(visibleItems).forEach((s) => pushLine(s));
  }
  showPrompt();
}

/**
 * Parse a command into {verb,obj}.
 * @param {string} cmd - Raw command text.
 * @returns {{verb:string,obj:string|null}} Object containing verb and optional object.
 */
function parseAction(cmd) {
  const parts = cmd.trim().split(/\s+/);
  const verb = (parts[0] || '').toLowerCase();
  const obj = parts.slice(1).join(' ').trim() || null;
  return { verb, obj };
}

/**
 * After printing a response, maybe kill/restart or show next prompt.
 * @returns {void} No return value.
 */
function finalizeAfterResponse() {
  if (DEATH.enabled && chance(DEATH.chancePerTurn)) {
    pushLine(pick(DEATH.messages));
    pushLine('You have died.');
    pushLine('Restarting...');
    inventory = [];
    enterNewRoom();
  } else {
    showPrompt();
  }
}

/**
 * Route a completed command to the appropriate response.
 * @param {string} cmd - Final command text (lower/upper preserved).
 * @param {'move'|'action'|'util'} cmdType - Scheduler category.
 * @returns {void} No return value.
 */
function handleResponse(cmd, cmdType) {
  const c = cmd.toLowerCase();

  if (cmdType === 'move') {
    enterNewRoom();
    return;
  }

  if (cmdType === 'action') {
    const { verb, obj } = parseAction(c);

    if (verb === 'look') {
      pushLine(currentRoom.title);
      pushLine(currentRoom.desc);
      if (visibleItems.length) {
        pushLine('You notice:');
        listify(visibleItems).forEach((s) => pushLine(s));
      } else {
        pushLine(pick(DATA.actions.look));
      }
      finalizeAfterResponse();
      return;
    }

    if (verb === 'take') {
      if (!obj || obj === 'all') {
        const shown = visibleItems.slice(0, Math.min(4, visibleItems.length));
        pushLine(pick(DATA.actions.takeAll));
        if (shown.length) {
          pushLine('Taken:');
          listify(shown).forEach((s) => pushLine(s));
        } else {
          pushLine('There isn’t much to take.');
        }
        finalizeAfterResponse();
        return;
      } else {
        const chosen = obj;
        inventory.push(chosen);
        const j = visibleItems.indexOf(chosen);
        if (j >= 0) visibleItems.splice(j, 1);
        pushLine(format(pick(DATA.actions.takeOne), chosen));
        finalizeAfterResponse();
        return;
      }
    }

    if (verb === 'drop') {
      const toDrop = obj || (inventory.length ? pick(inventory) : null);
      if (!toDrop) {
        pushLine('You fumble at empty pockets.');
      } else {
        const idx = inventory.indexOf(toDrop);
        if (idx >= 0) inventory.splice(idx, 1);
        visibleItems.push(toDrop);
        pushLine(format(pick(DATA.actions.dropOne), toDrop));
      }
      finalizeAfterResponse();
      return;
    }

    if (verb === 'read' || verb === 'examine' || verb === 'open' || verb === 'light') {
      const noun = obj || chooseActionObject(verb) || 'thing';
      pushLine(format(pick(DATA.actions[verb]), noun));
      finalizeAfterResponse();
      return;
    }

    if (verb === 'yell' || verb === 'wait') {
      const arr = DATA.actions[verb] || DATA.actions.wait;
      pushLine(pick(arr));
      finalizeAfterResponse();
      return;
    }

    if (DATA.actions[verb]) {
      const arr = DATA.actions[verb];
      const tpl = pick(arr);
      const needsObj = tpl.includes('{obj}') || (DATA.needsObject || []).includes(verb);
      if (needsObj) {
        const noun = obj || chooseActionObject(verb) || 'thing';
        pushLine(format(tpl, noun));
      } else {
        pushLine(tpl);
      }
      finalizeAfterResponse();
      return;
    }

    pushLine('Nothing happens.');
    finalizeAfterResponse();
    return;
  }

  if (cmdType === 'util') {
    if (c === 'inventory') {
      if (inventory.length) {
        pushLine(DATA.utilities.inventory);
        listify(inventory).forEach((s) => pushLine(s));
      } else {
        pushLine('You are carrying nothing.');
      }
      finalizeAfterResponse();
      return;
    }
    if (c === 'save') {
      pushLine(DATA.utilities.save);
      finalizeAfterResponse();
      return;
    }
    pushLine('Done.');
    finalizeAfterResponse();
  }
}

/**
 * Pick next scheduled command and enqueue it.
 * @returns {void} No return value.
 */
function scheduleTurn() {
  const r = Math.random();
  let cmdType = 'move';
  if (r < DATA.weights.move) cmdType = 'move';
  else if (r < DATA.weights.move + DATA.weights.action) cmdType = 'action';
  else cmdType = 'util';

  let cmdText;
  if (cmdType === 'move') {
    cmdText = pick(DATA.movement);
  } else if (cmdType === 'action') {
    const verbs = Object.keys(DATA.actions).filter(
      (v) => !['takeOne', 'takeAll', 'dropOne'].includes(v)
    );
    const verb = pick(verbs);
    if (DATA.needsObject.includes(verb)) {
      const obj = chooseActionObject(verb);
      cmdText = obj ? `${verb} ${obj}` : verb;
    } else {
      cmdText = verb;
    }
  } else {
    const utils = Object.keys(DATA.utilities);
    cmdText = pick(utils);
  }

  queue.push({ kind: 'cmd', text: cmdText, meta: { cmdType } });
}

// ———————————————————————————————————————————————
// Canvas + drawing
// ———————————————————————————————————————————————

/**
 * Sync font metrics and layout to canvas/device DPR.
 * @param {RenderCtx} ctx - Render context.
 * @returns {void} No return value.
 */
function syncTypography(ctx) {
  const g = ctx.ctx2d;
  const dpr = ctx.dpr || window.devicePixelRatio || 1;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  fontPx = Math.max(12, Math.round(modular(0)));
  g.font = `${fontPx}px ui-monospace, SFMono-Regular, Menlo, Consolas, "Cascadia Mono", monospace`;
  g.textBaseline = 'top';
  lineH = Math.max(12, Math.round(fontPx * 1.25));
}

/**
 * Paint background using current vibe palette.
 * @param {RenderCtx} ctx - Render context.
 * @returns {void} No return value.
 */
function paintBG(ctx) {
  const g = ctx.ctx2d;
  const dpr = ctx.dpr || window.devicePixelRatio || 1;
  const W = Math.max(1, Math.round(ctx.w / dpr));
  const H = Math.max(1, Math.round(ctx.h / dpr));
  g.save();
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.fillStyle = PALETTE.bg;
  g.fillRect(0, 0, W, H);
  g.restore();
}

/**
 * Draw visible buffer and inline prompt/input with caret.
 * @param {RenderCtx} ctx - Render context.
 * @returns {void} No return value.
 */
function drawBuffer(ctx) {
  const g = ctx.ctx2d;
  g.fillStyle = PALETTE.fg;

  const rows = Math.max(4, Math.floor(ctx.h / (ctx.dpr || 1) / lineH) - 1);
  const tail = buffer.slice(-rows);

  let y = 8;
  for (let i = 0; i < tail.length; i++) {
    const line = tail[i];

    // If this is the last line AND it's a prompt marker, draw inline input + caret
    const isLast = i === tail.length - 1;
    if (line === '>' && isLast) {
      const prompt = '> ';
      g.fillText(prompt + (activeInput ?? ''), 8, y);

      if (caretOn) {
        const x = 8 + g.measureText(prompt + (activeInput ?? '')).width;
        const h = Math.max(2, Math.floor(lineH * 0.6));
        g.fillStyle = PALETTE.accent;
        g.fillRect(x, y + Math.floor((lineH - h) / 2), Math.floor(fontPx * 0.6), h);
        g.fillStyle = PALETTE.fg;
      }
    } else {
      g.fillText(line, 8, y);
    }

    y += lineH;
  }
}

// ———————————————————————————————————————————————
// Lifecycle API (init/resize/clear/start/stop/frame)
// ———————————————————————————————————————————————
let __onTheme = null;
let __onVibe = null;

/**
 * Initialize mode.
 * @param {RenderCtx} ctx - Render context.
 * @returns {void} No return value.
 */
function init(ctx) {
  PALETTE = readPalette();
  syncTypography(ctx);
  buffer = [];
  caretBlink = 0;
  caretOn = true;
  activeInput = null;

  // banner, then room + prompt
  pushLine('Welcome to Zorkish.');
  pushLine('Release 1 / Serial number 2509 / Interpreter 1.0');
  pushLine('');
  enterNewRoom();

  const bus = window.app && window.app.events;
  if (bus && typeof bus.on === 'function') {
    __onTheme = () => {
      PALETTE = readPalette();
    };
    __onVibe = () => {
      PALETTE = readPalette();
    };
    bus.on('theme', __onTheme);
    bus.on('vibe', __onVibe);
  }

  paintBG(ctx);
}

/**
 * Handle canvas resize.
 * @param {RenderCtx} ctx - Render context.
 * @returns {void} No return value.
 */
function resize(ctx) {
  PALETTE = readPalette();
  syncTypography(ctx);
  paintBG(ctx);
}

/**
 * Clear state and canvas.
 * @param {RenderCtx} ctx - Render context.
 * @returns {void} No return value.
 */
function clear(ctx) {
  const g = ctx.ctx2d;
  g.clearRect(0, 0, ctx.w, ctx.h);
  buffer = [];
  caretBlink = 0;
  caretOn = true;
  activeInput = null;
  PALETTE = readPalette();
  paintBG(ctx);
}

/** @returns {void} No return value. */
function start() {}
/** @returns {void} No return value. */
function stop() {
  const bus = window.app && window.app.events;
  if (bus && typeof bus.off === 'function') {
    if (__onTheme) bus.off('theme', __onTheme);
    if (__onVibe) bus.off('vibe', __onVibe);
  }
  __onTheme = __onVibe = null;
}

/**
 * Per-frame tick.
 * @param {RenderCtx} ctx - Render context.
 * @returns {void} No return value.
 */
function frame(ctx) {
  PALETTE = readPalette();
  applySpeed(ctx.speed);

  // schedule a new turn every ~1.6–3.2s (speed-scaled)
  if (!frame._nextTurnAt) frame._nextTurnAt = performance.now() + randInt(900, 1300);
  if (performance.now() >= frame._nextTurnAt) {
    scheduleTurn();
    frame._nextTurnAt = performance.now() + scaledDelay(randInt(1600, 3200));
  }

  // dequeue → typing state setup
  if (!typing && queue.length) {
    const task = queue.shift();
    if (task.kind === 'cmd') {
      typing = {
        text: task.text,
        i: 0,
        preDelayUntil: performance.now() + TYPING.prePromptDelayMs,
        nextCharAt: 0,
        cmdType: task.meta.cmdType,
      };
      if (activeInput == null) {
        showPrompt();
      }
    } else if (task.kind === 'line') {
      pushLine(task.text);
    } else if (task.kind === 'blank') {
      pushLine('');
    }
  }

  // typing loop (updates ONLY activeInput; commits once on completion)
  if (typing) {
    if (performance.now() < typing.preDelayUntil) {
      // waiting before typing
    } else if (performance.now() >= typing.nextCharAt) {
      const ch = typing.text.charAt(typing.i);
      activeInput = (activeInput ?? '') + ch;
      typing.i += 1;

      let delay = randInt(TYPING.charDelayMinMs, TYPING.charDelayMaxMs);
      if (chance(TYPING.jitterPauseChance)) delay += TYPING.jitterPauseMs;
      typing.nextCharAt = performance.now() + scaledDelay(delay);

      if (typing.i >= typing.text.length) {
        // Commit the full command ONCE, on one line
        if (buffer.length && buffer[buffer.length - 1] === '>') {
          buffer[buffer.length - 1] = '> ' + typing.text;
        } else {
          pushLine('> ' + typing.text);
        }
        activeInput = null;

        // spacer + response
        pushLine('');
        handleResponse(typing.text, typing.cmdType);
        typing = null;
      }
    }
  }

  // caret blink while input is active
  if (activeInput !== null) {
    caretBlink += ctx.dt || 0;
    if (caretBlink >= 0.5) {
      caretBlink = 0;
      caretOn = !caretOn;
    }
  } else {
    caretOn = true;
  }

  paintBG(ctx);
  drawBuffer(ctx);
}

// public API
export const gameplay = (() => {
  const api = { init, resize, clear, start, stop, frame };
  api.info = { family: 'developer', flavor: 'game play' };
  return api;
})();
