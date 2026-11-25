import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { MIGRATIONS } from './schema';

let db: DatabaseSync | null = null;

/**
 * Electron's `app` is loaded lazily.
 *
 * The database layer is the only part of the main process that needs the app
 * object (for the userData path), and loading it lazily means the schema and
 * every service built on top of it can be exercised by `npm run
 * test:integration` in plain Node, without an Electron window.
 */
function electronApp(): typeof import('electron').app {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return (require('electron') as typeof import('electron')).app;
}

export function appDataDir(): string {
  const override = process.env.MECHSTUDY_DB_PATH;
  if (override) {
    const dir = dirname(override);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }
  const dir = join(electronApp().getPath('userData'), 'data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function dbPath(): string {
  // MECHSTUDY_DB_PATH is a testing / portable-mode hook: it lets the test
  // suite point the whole database layer at a throwaway file. Normal runs
  // always use %APPDATA%\MECHSTUDY OS\data\mechstudy.db.
  return process.env.MECHSTUDY_DB_PATH || join(appDataDir(), 'mechstudy.db');
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error('Database not initialised');
  return db;
}

export function initDb(): { path: string; version: number } {
  const file = dbPath();
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');

  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`);

  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map(r => r.version)
  );

  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    // Back up before a destructive migration (only when data already exists).
    if (applied.size > 0 && existsSync(file)) {
      const backup = join(appDataDir(), `pre-migration-v${m.version}-${Date.now()}.db`);
      try { copyFileSync(file, backup); } catch { /* non-fatal */ }
    }
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${m.version} failed: ${(e as Error).message}`);
    }
  }

  const version = (db.prepare('SELECT MAX(version) v FROM schema_migrations').get() as { v: number }).v ?? 0;

  // Self-heal deprecated models (e.g. discontinued gemini-2.0-flash / nonexistent 2.5) in SQLite
  try {
    db.exec(`
      UPDATE ai_conversations SET model = 'gemini-1.5-flash' WHERE model LIKE '%2.0%' OR model LIKE '%2.5%' OR model IS NULL OR model = '';
      UPDATE app_settings SET value = 'gemini-1.5-flash' WHERE key = 'ai.selectedModel' AND (value LIKE '%2.0%' OR value LIKE '%2.5%' OR value = '' OR value IS NULL);
    `);
  } catch {
    /* non-fatal */
  }

  return { path: file, version };
}

export function closeDb(): void {
  try { db?.close(); } catch { /* ignore */ }
  db = null;
}

/* ---------- query helpers ---------- */

export function all<T = any>(sql: string, ...params: unknown[]): T[] {
  return getDb().prepare(sql).all(...(params as any[])) as T[];
}

export function get<T = any>(sql: string, ...params: unknown[]): T | undefined {
  return getDb().prepare(sql).get(...(params as any[])) as T | undefined;
}

export function run(sql: string, ...params: unknown[]): { changes: number; lastInsertRowid: number } {
  const r = getDb().prepare(sql).run(...(params as any[]));
  return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
}

export function tx<T>(fn: () => T): T {
  const d = getDb();
  d.exec('BEGIN');
  try {
    const out = fn();
    d.exec('COMMIT');
    return out;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

/* ---------- settings ---------- */

export function getSetting(key: string, fallback: string): string {
  const row = get<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', key);
  return row?.value ?? fallback;
}

export function setSetting(key: string, value: string): void {
  run(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key, value
  );
}

export function getAllSettings(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of all<{ key: string; value: string }>('SELECT key, value FROM app_settings')) out[r.key] = r.value;
  return out;
}
