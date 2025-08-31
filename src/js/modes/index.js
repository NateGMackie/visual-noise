// src/js/modes/index.js

// Import the named exports (the actual mode objects)
import { crypto } from './crypto.js';
import { sysadmin } from './sysadmin.js';
import { mining } from './mining.js';
import { matrix } from './matrix.js';  
import { digitalrain } from './digitalrain.js';
import { rain_bsd } from './rain_bsd.js';
import { fire } from './fire.js';
import { fireAscii } from './fire_ascii.js';


// Map keys directly to the mode objects
export const registry = {
  crypto,
  sysadmin,
  mining,
  matrix,
  digitalrain,
  rain_bsd,
  fire,
  fire_ascii: fireAscii,
};

export const variantsByFamily = (family) =>
  Object.entries(registry).filter(([, mod]) => mod?.info?.family === family);
