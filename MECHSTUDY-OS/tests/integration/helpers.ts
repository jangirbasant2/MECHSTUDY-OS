import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { run } from '../../src/main/db';

/**
 * Points the database layer at a throwaway file and returns its folder.
 *
 * `dbPath()` reads `MECHSTUDY_DB_PATH` lazily, so this must be called before
 * `initDb()`. Every test file runs in its own process (node --test), so each
 * file gets an isolated database and they can run in parallel.
 */
export function useTempDatabase(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `mechstudy-${label}-`));
  process.env.MECHSTUDY_DB_PATH = join(dir, 'mechstudy.db');
  return dir;
}

export function dropTempDatabase(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/** Insert a document row directly, so service tests do not need real PDFs. */
export function seedDocument(filename: string, extra: Record<string, unknown> = {}): number {
  const values: Record<string, unknown> = {
    path: `C:/study/${filename}`,
    rel_path: filename,
    filename,
    size_bytes: 1024,
    page_count: 10,
    has_text_layer: 0,
    material_type: 'notes',
    ...extra,
  };
  const cols = Object.keys(values);
  return run(
    `INSERT INTO documents (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    ...cols.map(c => values[c])
  ).lastInsertRowid;
}
