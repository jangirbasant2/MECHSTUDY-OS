import { app } from 'electron';
import { existsSync, mkdirSync, copyFileSync, statSync, readdirSync, rmSync } from 'node:fs';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { all, get, run, getDb, dbPath, appDataDir, closeDb, initDb } from '../db';

/**
 * Backup / restore.
 *
 * A backup contains the SQLite database (annotations, notes, progress,
 * sessions, settings, ...) plus a JSON manifest. It does NOT contain the
 * original PDFs — those stay where they are on disk. This is stated explicitly
 * in the manifest and in the UI.
 */

export interface BackupManifest {
  app: string;
  appVersion: string;
  createdAt: string;
  dbBytes: number;
  includesPdfs: false;
  schemaVersion: number;
  counts: Record<string, number>;
}

export function backupRoot(): string {
  const dir = join(app.getPath('userData'), 'backups');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function countRows(): Record<string, number> {
  const tables = [
    'documents', 'annotations', 'sticky_notes', 'bookmarks', 'notebook_entries',
    'study_tasks', 'study_sessions', 'topic_progress', 'review_schedule',
    'subjects', 'units', 'topics', 'topic_mappings', 'questions', 'mistakes',
  ];
  const out: Record<string, number> = {};
  for (const t of tables) {
    try {
      out[t] = (get<{ c: number }>(`SELECT COUNT(*) c FROM ${t}`) as { c: number }).c;
    } catch { out[t] = -1; }
  }
  return out;
}

export async function createBackup(label?: string): Promise<{
  id: number; path: string; sizeBytes: number; manifest: BackupManifest;
}> {
  // Flush WAL so the copied .db file is complete and self-consistent.
  try { getDb().exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch { /* ignore */ }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(backupRoot(), `backup-${stamp}`);
  mkdirSync(dir, { recursive: true });

  const src = dbPath();
  const dest = join(dir, 'mechstudy.db');
  copyFileSync(src, dest);

  const version = (get<{ v: number }>('SELECT MAX(version) v FROM schema_migrations')?.v) ?? 0;
  const manifest: BackupManifest = {
    app: 'MECHSTUDY OS',
    appVersion: app.getVersion(),
    createdAt: new Date().toISOString(),
    dbBytes: statSync(dest).size,
    includesPdfs: false,
    schemaVersion: version,
    counts: countRows(),
  };
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  const id = run(
    'INSERT INTO backups (path, size_bytes, includes_pdfs, notes) VALUES (?,?,?,?)',
    dir, manifest.dbBytes, 0, label ?? null
  ).lastInsertRowid;

  return { id, path: dir, sizeBytes: manifest.dbBytes, manifest };
}

export function listBackups() {
  return all<any>('SELECT * FROM backups ORDER BY created_at DESC');
}

export interface RestoreResult { restored: boolean; requiresRestart: boolean; safetyBackup: string | null }

/**
 * Restore a backup over the live database. A safety backup of the CURRENT
 * database is taken first so a bad restore is recoverable.
 * The app must be restarted afterwards (the UI prompts for this).
 */
export async function restoreBackup(id: number): Promise<RestoreResult> {
  const row = get<{ id: number; path: string }>('SELECT id, path FROM backups WHERE id = ?', id);
  if (!row) throw new Error('Backup not found in the database');
  const sourceDb = join(row.path, 'mechstudy.db');
  if (!existsSync(sourceDb)) throw new Error(`Backup file is missing: ${sourceDb}`);

  // Validate the backup before destroying anything.
  const head = await readFile(sourceDb);
  const magic = head.subarray(0, 16).toString('latin1');
  if (!magic.startsWith('SQLite format 3')) {
    throw new Error('Backup database is not a valid SQLite file — restore aborted.');
  }

  const safety = await createBackup('pre-restore safety copy');

  closeDb();
  copyFileSync(sourceDb, dbPath());
  // Remove stale WAL/SHM so SQLite does not merge an old journal into the restore.
  for (const suffix of ['-wal', '-shm']) {
    const f = dbPath() + suffix;
    if (existsSync(f)) { try { rmSync(f); } catch { /* ignore */ } }
  }
  initDb();

  return { restored: true, requiresRestart: true, safetyBackup: safety.path };
}

export function deleteBackup(id: number): { deleted: boolean } {
  const row = get<{ path: string }>('SELECT path FROM backups WHERE id = ?', id);
  if (!row) return { deleted: false };
  try { rmSync(row.path, { recursive: true, force: true }); } catch { /* ignore */ }
  run('DELETE FROM backups WHERE id = ?', id);
  return { deleted: true };
}

/** Discover backup folders on disk that are not yet registered in the DB. */
export function scanBackupFolder(): { found: number; registered: number } {
  let found = 0, registered = 0;
  const root = backupRoot();
  for (const name of readdirSync(root)) {
    const dir = join(root, name);
    try {
      if (!statSync(dir).isDirectory()) continue;
      if (!existsSync(join(dir, 'mechstudy.db'))) continue;
      found++;
      const existing = get<{ id: number }>('SELECT id FROM backups WHERE path = ?', dir);
      if (existing) { registered++; continue; }
      const size = statSync(join(dir, 'mechstudy.db')).size;
      run('INSERT INTO backups (path, size_bytes, includes_pdfs, notes) VALUES (?,?,?,?)',
        dir, size, 0, 'Discovered on disk');
      registered++;
    } catch { /* skip */ }
  }
  return { found, registered };
}

/** Absolute path of the live database, for display in Settings. */
export function databaseInfo() {
  const p = dbPath();
  let size = 0;
  try { size = statSync(p).size; } catch { /* ignore */ }
  return { path: p, sizeBytes: size, dataDir: appDataDir(), backupDir: backupRoot() };
}

const BACKUP_MAGIC = Buffer.from('MECHBACKUP_V1\0\0\0'); // 16 bytes
const DEFAULT_KEY_SALT = 'mechstudy-os-aes256-salt';

/**
 * 1-Click Encrypted Workspace Backup (.mechbackup).
 * Compresses and securely archives mechstudy.db and table counts into a single portable file.
 */
export async function exportEncryptedBackup(savePath: string, userPassword?: string): Promise<{
  outPath: string;
  sizeBytes: number;
  manifest: BackupManifest;
}> {
  try { getDb().exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch { /* ignore */ }

  const srcDbBuffer = await readFile(dbPath());
  const compressedDb = gzipSync(srcDbBuffer);

  const salt = randomBytes(32);
  const iv = randomBytes(16);
  const password = userPassword && userPassword.trim() ? userPassword.trim() : DEFAULT_KEY_SALT;
  const key = scryptSync(password, salt, 32);

  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const encryptedDb = Buffer.concat([cipher.update(compressedDb), cipher.final()]);

  const version = (get<{ v: number }>('SELECT MAX(version) v FROM schema_migrations')?.v) ?? 0;
  const manifest: BackupManifest = {
    app: 'MECHSTUDY OS',
    appVersion: app.getVersion(),
    createdAt: new Date().toISOString(),
    dbBytes: srcDbBuffer.length,
    includesPdfs: false,
    schemaVersion: version,
    counts: countRows(),
  };

  const manifestBuf = Buffer.from(JSON.stringify(manifest), 'utf8');
  const manifestLenBuf = Buffer.alloc(4);
  manifestLenBuf.writeUInt32BE(manifestBuf.length, 0);

  // File structure:
  // [16 bytes Magic] [32 bytes Salt] [16 bytes IV] [4 bytes ManifestLen] [ManifestBuf] [EncryptedDb]
  const finalArchive = Buffer.concat([
    BACKUP_MAGIC,
    salt,
    iv,
    manifestLenBuf,
    manifestBuf,
    encryptedDb,
  ]);

  await mkdir(dirname(savePath), { recursive: true });
  await writeFile(savePath, finalArchive);

  return {
    outPath: savePath,
    sizeBytes: finalArchive.length,
    manifest,
  };
}

/**
 * Restore an encrypted workspace backup (.mechbackup) over the live database.
 */
export async function importEncryptedBackup(filePath: string, userPassword?: string): Promise<{
  restored: boolean;
  requiresRestart: boolean;
  manifest: BackupManifest;
  safetyBackup: string | null;
}> {
  if (!existsSync(filePath)) throw new Error(`Backup archive not found: ${filePath}`);

  const fileBuf = await readFile(filePath);
  if (fileBuf.length < 68) throw new Error('Invalid .mechbackup file: archive is corrupted or too small.');

  const magic = fileBuf.subarray(0, 16);
  if (!magic.equals(BACKUP_MAGIC)) {
    throw new Error('Not a valid MECHSTUDY OS backup archive (.mechbackup signature missing).');
  }

  const salt = fileBuf.subarray(16, 48);
  const iv = fileBuf.subarray(48, 64);
  const manifestLen = fileBuf.readUInt32BE(64);

  if (fileBuf.length < 68 + manifestLen) {
    throw new Error('Corrupted .mechbackup header structure.');
  }

  const manifestBuf = fileBuf.subarray(68, 68 + manifestLen);
  const manifest: BackupManifest = JSON.parse(manifestBuf.toString('utf8'));
  const encryptedDb = fileBuf.subarray(68 + manifestLen);

  const password = userPassword && userPassword.trim() ? userPassword.trim() : DEFAULT_KEY_SALT;
  const key = scryptSync(password, salt, 32);

  let decryptedCompressed: Buffer;
  try {
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    decryptedCompressed = Buffer.concat([decipher.update(encryptedDb), decipher.final()]);
  } catch (err) {
    throw new Error('Failed to decrypt .mechbackup archive. Incorrect password or damaged archive.');
  }

  const rawDb = gunzipSync(decryptedCompressed);
  const dbMagic = rawDb.subarray(0, 16).toString('latin1');
  if (!dbMagic.startsWith('SQLite format 3')) {
    throw new Error('Decompressed payload is not a valid SQLite database.');
  }

  // Create safety backup of existing state
  const safety = await createBackup('pre-import safety copy');

  closeDb();
  await writeFile(dbPath(), rawDb);

  // Clean stale WAL and SHM
  for (const suffix of ['-wal', '-shm']) {
    const f = dbPath() + suffix;
    if (existsSync(f)) { try { rmSync(f); } catch { /* ignore */ } }
  }

  initDb();

  return {
    restored: true,
    requiresRestart: true,
    manifest,
    safetyBackup: safety.path,
  };
}

