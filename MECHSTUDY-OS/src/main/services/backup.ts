import { app } from 'electron';
import { existsSync, mkdirSync, copyFileSync, statSync, readdirSync, rmSync } from 'node:fs';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
