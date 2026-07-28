/**
 * CommonJS startup shim for Phusion Passenger / LiteSpeed (Hostinger Business).
 *
 * Why this exists: the real server (`src/index.js`) is an ES module, but
 * Passenger expects a CommonJS startup file. Point the Node app's
 * "Application startup file" at THIS file (`app.cjs`).
 *
 * It also writes any boot crash to `startup-error.log` and stderr, because
 * Passenger frequently hides the error and you just get a 503 with empty logs.
 */
const fs = require('node:fs');
const path = require('node:path');

const LOG = path.join(__dirname, 'startup-error.log');
function record(label, err) {
  const line = `[${new Date().toISOString()}] ${label}: ${err && err.stack ? err.stack : err}\n`;
  try { fs.appendFileSync(LOG, line); } catch { /* ignore */ }
  try { process.stderr.write(line); } catch { /* ignore */ }
}

process.on('uncaughtException', (err) => record('uncaughtException', err));
process.on('unhandledRejection', (err) => record('unhandledRejection', err));

// Boot the ESM server. Any import/boot failure is logged to the file above.
import('./src/index.js').catch((err) => record('failed to load src/index.js', err));
