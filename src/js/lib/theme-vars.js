// Read a CSS variable from :root with a fallback.
export function cssVar(name, fallback = '') {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name);
  return (v && v.trim()) || fallback;
}

// Current palette pulled from CSS vars set by themes.js
export function getPalette() {
  return {
    bg: cssVar('--bg', '#000000'),
    fg: cssVar('--fg', '#03ffaf'),
    accent: cssVar('--accent', '#0ff'),
    scanDark: cssVar('--scanline-dark', '#001003'),
    scanLight: cssVar('--scanline-light', '#002016'),
  };
}

// Subscribe to vibe changes via the app/event bus.
// Calls cb(palette, vibeKey) immediately and on each change.
// Returns an unsubscribe function.
export function onVibeChange(cb, callNow = true) {
  const bus = (window.app && window.app.events) || window.events;
  const handler = (vibeKey) => cb(getPalette(), vibeKey);

  if (bus && typeof bus.on === 'function') {
    bus.on('vibe', handler);
    if (callNow) handler(((window.app && window.app.cfg && window.app.cfg.vibe) || 'classic'));
    return () => bus.off && bus.off('vibe', handler);
  } else {
    if (callNow) cb(getPalette(), 'classic');
    return () => {};
  }
}
