// src/js/modes/index.js

// Import the named exports (the actual mode objects)
import { crypto } from './crypto.js';
import { sysadmin } from './sysadmin.js';
// If/when these files exist, import their named exports too:
import { matrix } from './matrix.js';
import { rain_bsd } from './rain_bsd.js';
import { fire } from './fire.js';

// Map keys directly to the mode objects
export const registry = {
  crypto,
  sysadmin,
  matrix,
  rain_bsd,
  fire,
};
