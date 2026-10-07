/**
 * Database backup & restore (admin role only — staff permissions don't apply).
 *
 *   GET  /api/backup/download         streams a mysqldump of the app DB as a .sql file
 *   POST /api/backup/restore          multipart `file` (.sql) + `confirm=RESTORE`
 *
 * Both shell out to the MySQL client tools (mysqldump / mysql, or MariaDB's
 * mariadb-dump / mariadb), which must be installed on the server. A restore first dumps the current DB to
 * server/backups/pre-restore-<timestamp>.sql, so a bad restore can be undone
 * by restoring that file.
 */
import { Router } from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { protect } from '../middleware/auth.js';
import { logActivity } from '../models/index.js';

const router = Router();

const backupsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../backups');
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 1024 * 1024 * 1024 },   // 1 GB
});

const adminOnly = (req, res, next) => (req.user?.role === 'admin'
  ? next()
  : res.status(403).json({ message: 'Only an admin can back up or restore the database' }));

// Connection args shared by mysql and mysqldump. The password goes in the
// environment, not argv, so it doesn't show up in `ps`.
const connArgs = () => [
  `--host=${process.env.DB_HOST || '127.0.0.1'}`,
  `--port=${process.env.DB_PORT || 3306}`,
  `--user=${process.env.DB_USER}`,
  '--default-character-set=utf8mb4',
];
const connEnv = () => ({ ...process.env, MYSQL_PWD: process.env.DB_PASSWORD || '' });

// With GTIDs on, MySQL's mysqldump writes `SET @@GLOBAL.GTID_PURGED=…`,
// which fails when the dump is loaded back into the same server (error
// 3546). MariaDB's mysqldump has no such option and rejects the flag, so
// only pass it when this mysqldump lists it.
let gtidFlag;
const gtidArgs = () => {
  gtidFlag ??= new Promise((resolve) => {
    let help = '';
    const child = spawn(DUMP, ['--help']);
    child.stdout.on('data', (d) => { help += d; });
    child.on('error', () => resolve([]));
    child.on('close', () => resolve(help.includes('set-gtid-purged') ? ['--set-gtid-purged=OFF'] : []));
  });
  return gtidFlag;
};
const dumpArgs = async () => [
  ...connArgs(), '--single-transaction', '--routines', '--triggers', '--no-tablespaces',
  ...(await gtidArgs()),
  process.env.DB_NAME,
];

// MariaDB 11+ can ship only mariadb-dump / mariadb, without the mysql* aliases.
const onPath = (name) => (process.env.PATH || '').split(path.delimiter)
  .some((dir) => dir && fs.existsSync(path.join(dir, name)));
const DUMP = onPath('mysqldump') || !onPath('mariadb-dump') ? 'mysqldump' : 'mariadb-dump';
const CLIENT = onPath('mysql') || !onPath('mariadb') ? 'mysql' : 'mariadb';

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// Run a MySQL tool with `input` piped to stdin and stdout to `output`.
function run(cmd, args, { input, output } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: connEnv() });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => reject(err.code === 'ENOENT'
      ? new Error(`${cmd} is not installed on the server`)
      : err));
    child.on('close', (code) => (code === 0
      ? resolve()
      : reject(new Error(stderr.replace(/^.*Using a password.*$/m, '').trim() || `${cmd} exited with code ${code}`))));
    if (input) input.pipe(child.stdin);
    if (output) child.stdout.pipe(output);
  });
}

let busy = false;

router.get('/download', protect, adminOnly, async (req, res) => {
  const child = spawn(DUMP, await dumpArgs(), { env: connEnv() });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('error', (err) => {
    if (!res.headersSent) {
      res.status(500).json({ message: err.code === 'ENOENT' ? `${DUMP} is not installed on the server` : err.message });
    }
  });
  child.stdout.once('data', () => {
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="${process.env.DB_NAME}-${stamp()}.sql"`);
  });
  child.stdout.pipe(res);
  child.on('close', (code) => {
    if (code === 0) return;
    console.error('[backup/download]', stderr);
    // Mid-stream failure: drop the connection so the browser marks the
    // download failed instead of saving a truncated file as if it were whole.
    if (res.headersSent) res.destroy();
    else res.status(500).json({ message: 'Backup failed' });
  });
});

router.post('/restore', protect, adminOnly, upload.single('file'), async (req, res) => {
  const file = req.file;
  const cleanup = () => file && fs.promises.unlink(file.path).catch(() => {});
  if (!file || !/\.sql$/i.test(file.originalname)) {
    cleanup();
    return res.status(400).json({ message: 'Choose a .sql backup file' });
  }
  if (req.body.confirm !== 'RESTORE') {
    cleanup();
    return res.status(400).json({ message: 'Type RESTORE to confirm' });
  }
  if (busy) {
    cleanup();
    return res.status(409).json({ message: 'A backup or restore is already running' });
  }
  busy = true;
  // Restoring a large dump can take minutes; don't let Node cut it off.
  req.setTimeout(0);
  res.setTimeout(0);
  try {
    // 1. Snapshot the current DB so this restore can be undone.
    await fs.promises.mkdir(backupsDir, { recursive: true });
    const snapshot = path.join(backupsDir, `pre-restore-${stamp()}.sql`);
    try {
      await run(DUMP, await dumpArgs(), { output: fs.createWriteStream(snapshot) });
    } catch (err) {
      await fs.promises.unlink(snapshot).catch(() => {});
      throw new Error(`Couldn't back up the current database first, so nothing was restored: ${err.message}`);
    }

    // 2. Load the uploaded dump.
    try {
      await run(CLIENT, [...connArgs(), process.env.DB_NAME], { input: fs.createReadStream(file.path) });
    } catch (err) {
      throw new Error(`Restore failed: ${err.message}. The database before the restore was saved to backups/${path.basename(snapshot)}.`);
    }

    // Logged after the restore, so it lands in the restored ActivityLogs table.
    await logActivity({
      userId: req.user.id,
      action: 'db_restore',
      details: { file: file.originalname, size: file.size, snapshot: path.basename(snapshot) },
      ip: req.ip,
    });
    res.json({ message: 'Database restored', snapshot: path.basename(snapshot) });
  } catch (err) {
    console.error('[backup/restore]', err.message);
    // Sent raw: sanitizeErrors would swap the mysql error (line number,
    // "SQL syntax"…) and the snapshot name for a generic message, and only
    // an admin can reach this.
    res.status(422).type('json').send(JSON.stringify({ message: err.message }));
  } finally {
    busy = false;
    cleanup();
  }
});

export default router;
