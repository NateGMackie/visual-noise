/* eslint-env browser */
// src/js/lib/log.js

export const notify = (msg) => (window?.notify ? window.notify(msg) : console.info('[note]', msg));
