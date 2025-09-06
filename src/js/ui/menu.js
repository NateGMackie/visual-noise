// src/js/ui/menu.js
// Bottom menu wiring for Ambient Visual Noise (footer #controls)

function el(root, sel) {
  const n = root.querySelector(sel);
  if (!n) console.warn(`[menu] Missing element: ${sel}`);
  return n;
}

/**
 * Init the Bottom Menu UI.
 * @param {HTMLElement} footerEl - The footer root element (#controls).
 * @param {Object} api - Handlers provided by main.js (App facade).
 * @param {Function} api.getState - () => { genre, style, speed, paused, vibe? }
 * @param {Function} api.setGenre - (name) => void
 * @param {Function} api.setStyle - (id) => void
 * @param {Function} [api.cycleStyle] - (dir) => void
 * @param {Function} api.nextGenre - () => string
 * @param {Function} api.nextStyle - () => string
 * @param {Function} api.setSpeed - (num) => void
 * @param {Function} api.pause - () => void
 * @param {Function} api.resume - () => void
 * @param {Function} api.clear - () => void
 * @param {Function} [api.setVibe] - (name) => void
 * @param {Function} [api.nextVibe] - () => string
 * @param {Function} [api.notify] - (msg) => void
 */
export function initMenu(footerEl, api) {
  if (!footerEl) {
    console.warn("[menu] No footerEl provided to initMenu");
    return { refresh: () => {} };
  }
  const {
    getState,
    setGenre, setStyle, cycleStyle,
    nextGenre, nextStyle,
    setSpeed, pause, resume, clear,
    setVibe, nextVibe,
    notify = () => {},
  } = api;

  const fireInteraction = () =>
    window.dispatchEvent(new CustomEvent("ui:interaction"));

  // Footer elements (IDs must exist in footer)
  const $genre = el(footerEl, "#genreName");
  const $style = el(footerEl, "#styleName");
  const $vibe  = el(footerEl, "#vibeName");

  const $speedMinus = el(footerEl, "#btn-speed-minus");
  const $speedPlus  = el(footerEl, "#btn-speed-plus");
  const $pause      = el(footerEl, "#btn-pause");
  const $clear      = el(footerEl, "#btn-clear");

  const updateLabels = () => {
    const s = getState();
    if ($genre) $genre.textContent = s.genre;
    if ($style) $style.textContent = s.style;
    if ($vibe  && s.vibe) $vibe.textContent = s.vibe;
    if ($pause) $pause.textContent = s.paused ? "Resume" : "Pause";
  };

  const clampSpeed = (v) => Math.max(0.1, Math.min(10, v));

  // Clickable labels — Genre: cycle
  if ($genre) {
    $genre.addEventListener("click", () => {
      fireInteraction();
      const next = nextGenre?.();
      if (next) {
        setGenre(next);
        notify?.(`Genre → ${next}`);
        updateLabels();
      }
    }, { passive: true });
  }

  // Style: prefer a true cycle call (works even without a list)
  if ($style) {
    $style.addEventListener("click", () => {
      fireInteraction();
      if (typeof cycleStyle === "function") {
        cycleStyle(+1);              // main.js will emit and update labels
      } else {
        const next = nextStyle?.();  // fallback if you still expose a list
        if (next) setStyle(next);
      }
      notify?.(`Style → ${getState().style}`);
      updateLabels();
    }, { passive: true });
  }

  // Vibe is optional
  if ($vibe) {
    if (nextVibe && setVibe) {
      $vibe.addEventListener("click", () => {
        fireInteraction();
        const v = nextVibe(+1);
        if (v) {
          setVibe(v);
          notify?.(`Vibe → ${v}`);
          updateLabels();
        }
      }, { passive: true });
    } else {
      $vibe.addEventListener("click", fireInteraction, { passive: true });
    }
  }

  // Speed
  if ($speedMinus) {
    $speedMinus.addEventListener("click", () => {
      fireInteraction();
      const s = getState();
      const next = clampSpeed(Number((s.speed - 0.1).toFixed(2)));
      setSpeed(next);
      notify?.(`Speed: ${next.toFixed(2)}`);
    });
  }
  if ($speedPlus) {
    $speedPlus.addEventListener("click", () => {
      fireInteraction();
      const s = getState();
      const next = clampSpeed(Number((s.speed + 0.1).toFixed(2)));
      setSpeed(next);
      notify?.(`Speed: ${next.toFixed(2)}`);
    });
  }

  // Pause/Resume
  if ($pause) {
    $pause.addEventListener("click", () => {
      fireInteraction();
      const s = getState();
      if (s.paused) { resume(); notify?.("Resumed"); }
      else { pause(); notify?.("Paused"); }
      updateLabels();
    });
  }

  // Clear
  if ($clear) {
    $clear.addEventListener("click", () => {
      fireInteraction();
      clear();
      notify?.("Cleared");
    });
  }

  // First paint
  updateLabels();

  return { refresh: updateLabels };
}
