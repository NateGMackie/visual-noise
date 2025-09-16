# Visual Noise

Ambient, glanceable visuals for your spare display: simulated console activity, digital rain, and cozy fire. It’s meant to live in your periphery — motion that makes the screen feel “alive,” without demanding attention.

- **Families / Programs**  
  - **Systems**: *Crypto*, *Sysadmin* (console-style log simulations)  
  - **Rain**: *Matrix*, *Digital Rain*, *Rain_BSD*  
  - **Fire**: *Fire*, *FireAscii*

- **Why?**  
  For background ambiance — a sense of activity. No real commands are run, nothing is mined, and nothing is sent over the network.

---

## Quick start

**Option A – just open it**
1. Clone the repo.
2. Open `index.html` in a modern browser.

**Option B – serve locally (recommended)**
```bash
# any static server works
npx http-server .
# or
python -m http.server 8080
```
The app is a static site (HTML/CSS/JS) and ships with a web app manifest + service worker for PWA behavior.

---

## Features
- Taxonomy
- Genres group related programs: Systems, Rain, Fire. Each program has its own look and controls.
- Hotkeys for fast switching (see below).
- Speed controls for everything; Fire adds fuel and height.
- Vibes (where applicable).
- Wake Lock toggle to keep the screen on during display sessions.
- Unified toasts/HUD to surface changes without breaking the vibe.
- PWA ready (installable).

---

## Keyboard & Controls

### Global
- `[` / `]` — Cycle **genre** (prev/next)  
- `,` / `.` — Cycle **style** within the family (prev/next)  
- `1–0` — Jump to style number (0 maps to 10)  
- `-` / `=` — Decrease / increase **speed**  
- `Space` — Pause / resume  
- `T` / `shift+t` — Cycle **vibe**  
- `W` — Toggle **Keep screen awake** (Wake Lock), when supported  

### Rain (Matrix / Digital Rain / Rain_BSD)
- Hold **Shift** + `↑/↓` — Tail length  
- Hold **Shift** + `→/←` — Spawn/respawn behavior  

### Fire / FireAscii
- Hold **Shift** + `↑/↓` — Adjust **Height**
- Hold **Shift** + `→/←` — Adjust **Fuel** 

> **Tip:** Each change pops a small toast note; they coalesce when possible on desktop.  
> On some mobile browsers, short, rapid interactions may surface multiple toasts (minor UX quirk on certain WebView timers).

---

## UI: Menu bar

Most things you can do via hotkeys are also in the **menu bar**: pick genre/styel, tweak speed, set vibe, toggle Wake Lock, clear, and pause.  
Toasts reposition when the menu is open so they don’t cover it (desktop + mobile).

---

## 🔒 Security & Network Posture

**Visual Noise** is a purely client-side web app. It generates visuals only.

- **No external connections** — runs entirely in the browser; no APIs, servers, or peers.  
- **No mining / no real commands** — console and “crypto” text is simulated; nothing executes.  
- **Lightweight & safe** — static HTML/JS/CSS; no background services.  
- **Enterprise categorization** — As of **September 2025**, Symantec/Broadcom (Bluecoat) classifies the hosted site as **Technology/Internet**.  
  *(This neutral, business-friendly category helps with corporate firewalls.)*  

**Reviewer blurb (copy/paste):**  
> This is a lightweight web application that generates ambient visual effects (e.g., rain, fire, or simulated console activity). It is purely visual and runs entirely in the browser with no external connections, no mining, and no execution of real commands. The purpose is to provide moving background visuals for atmosphere, not functionality.

---

## Performance notes

- Prefers a GPU-accelerated browser; canvas work scales with resolution and speed.  
- On laptops, enabling **Wake Lock** will keep the display on; consider lowering speed when you’re away.

---

## Install as a PWA

Most Chromium-based browsers (and mobile Safari) will offer **Install** from the URL bar menu. The repo includes:

- `manifest.webmanifest` (app name, icons, display mode)  
- `service-worker.js` (basic offline caching)

---

## Development
Folder layout
```
.
├─ index.html
├─ src/
│  ├─ js/
│  │  ├─ modes/        # families/programs (systems, rain, fire)
│  │  ├─ ui/           # menu, hotkeys, notifications (HUD/toasts)
│  │  └─ lib/          # helpers (e.g., Wake Lock)
├─ manifest.webmanifest
├─ service-worker.js
└─ icons/              # PWA icon set
```
**Scripts**
These are the ones we’ve been using during cleanup (names may vary in package.json):
- `npm run lint` — check code quality
- `npm run lint:fix` — auto-fix what can be fixed
- `npm run fmt` — apply formatting
Any static server works for local dev; see Quick start above.

**Code style**
- Consistent JSDoc on exported functions.
- Top-of-file module headers (purpose, inputs, outputs).
- Normalized DPR caps, font sizing, and canvas transforms.
- Terminology: use genre (former “family”) and style (former “flavor/type”); menu bar (not “nav bar”).

---

## Browser support
Modern Chromium, Firefox, and Safari. Wake Lock gracefully no-ops where unsupported.

---

## Roadmap (short list)
- Additional programs (e.g., starfield, snowfall)
- More theme packs
- Optional low-power mode for laptops
- Mobile toast coalescing improvements

---

## Credits & License

Built by Nate Mackie.
License: (TBD)

---

## FAQ

*Does it mine crypto or run commands?*

No. It only draws simulated text and visuals.

*Why does my company block the site?*

Some networks block uncategorized sites by default. Our public host is now categorized as Technology/Internet by Bluecoat; other vendors may take time to update. Submit the reviewer blurb above if needed.

*Can I keep the screen on?*

Yes — toggle Wake Lock from the menu or press W (when supported).
