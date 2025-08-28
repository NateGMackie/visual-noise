// src/js/themes.js
import { setTheme, cfg } from './state.js';

const THEMES = {
  classic: { '--bg':'#000','--fg':'#03ffaf','--accent':'#0ff' },
  // clu:     { '--bg':'#000','--fg':'#aaffff','--accent':'#00ffff' }, // Tron Legacy vibe
  // console: { '--bg':'#0b0c10', '--fg':'#a9ffb6', '--accent':'#00d18f' },
  mainframe:  { '--bg':'#0a0700', '--fg':'#ffd18a', '--accent':'#ffae00' },
  msdos:   { '--bg':'#1F1F1F', '--fg':'#C0C0C0', '--accent':'#FFFFFF' },
  clu:   { '--bg':'#001318', '--fg':'#9de7ff', '--accent':'#2ad1ff' },
  // skynet:  { '--bg':'#100','--fg':'#f44','--accent':'#faa' },       // red menace
  skynet:   { '--bg':'#0a0000', '--fg':'#ff4d4d', '--accent':'#ff0000' },
  deepthought:   { '--bg':'#0a0010', '--fg':'#e0b3ff', '--accent':'#aa33ff' },
    
};

export function applyTheme(name){
  const vars = THEMES[name] ?? THEMES.classic;
  for (const k in vars) document.documentElement.style.setProperty(k, vars[k]);
  document.getElementById('themeName').textContent = name;
}

export function cycleTheme(){
  const keys = Object.keys(THEMES);
  const i = keys.indexOf(cfg.theme);
  const next = keys[(i+1)%keys.length];
  setTheme(next);
}

export function initThemes(){
  applyTheme(cfg.theme);
}
