import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Where uploaded images live. By default this is `server/uploads`, but on hosts
 * that wipe the app folder on every redeploy (e.g. Hostinger clean checkout),
 * set UPLOADS_DIR to an ABSOLUTE path OUTSIDE the deploy tree so images persist
 *   UPLOADS_DIR=/home/<user>/domains/<domain>/uploads
 * Both the upload route and the /uploads static handler use this single value.
 */
export const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '../../uploads');

try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch { /* ignore */ }
