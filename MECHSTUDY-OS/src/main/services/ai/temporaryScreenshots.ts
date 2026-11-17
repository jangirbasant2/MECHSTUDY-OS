import { existsSync, mkdirSync, writeFileSync, unlinkSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { appDataDir, all, get, run } from '../../db';

export interface TemporaryScreenshotRecord {
  id: number;
  conversationId: number;
  messageId: number | null;
  filePath: string;
  filename: string;
  width: number | null;
  height: number | null;
  messagesRemaining: number;
  dataUrl?: string;
  createdAt: string;
}

export function tempScreenshotsDir(): string {
  const dir = join(appDataDir(), 'temp_screenshots');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function saveTemporaryScreenshot(params: {
  conversationId: number;
  dataUrl: string;
  width?: number;
  height?: number;
}): TemporaryScreenshotRecord {
  const dir = tempScreenshotsDir();
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const filename = `snap_${timestamp}_${randomSuffix}.png`;
  const filePath = join(dir, filename);

  // Decode base64 data URL
  const match = params.dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  const base64Data = match ? match[2] : params.dataUrl.replace(/^data:.*,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  writeFileSync(filePath, buffer);

  const id = run(
    `INSERT INTO ai_temporary_screenshots (conversation_id, file_path, filename, width, height, messages_remaining)
     VALUES (?, ?, ?, ?, ?, 5)`,
    params.conversationId,
    filePath,
    filename,
    params.width ?? null,
    params.height ?? null
  ).lastInsertRowid;

  return {
    id,
    conversationId: params.conversationId,
    messageId: null,
    filePath,
    filename,
    width: params.width ?? null,
    height: params.height ?? null,
    messagesRemaining: 5,
    dataUrl: params.dataUrl,
    createdAt: new Date().toISOString(),
  };
}

export function decrementTemporaryScreenshots(conversationId: number): { decremented: number; deleted: number } {
  // Decrement messages_remaining for all active temporary screenshots in this conversation
  run(
    'UPDATE ai_temporary_screenshots SET messages_remaining = messages_remaining - 1 WHERE conversation_id = ?',
    conversationId
  );

  // Query expired screenshots
  const expired = all<{ id: number; file_path: string }>(
    'SELECT id, file_path FROM ai_temporary_screenshots WHERE conversation_id = ? AND messages_remaining <= 0',
    conversationId
  );

  let deleted = 0;
  for (const row of expired) {
    try {
      if (existsSync(row.file_path)) {
        unlinkSync(row.file_path);
      }
    } catch {
      // Non-fatal
    }
    run('DELETE FROM ai_temporary_screenshots WHERE id = ?', row.id);
    deleted++;
  }

  return { decremented: expired.length, deleted };
}

export function getTemporaryScreenshots(conversationId: number): TemporaryScreenshotRecord[] {
  const rows = all<any>(
    'SELECT * FROM ai_temporary_screenshots WHERE conversation_id = ? ORDER BY id DESC',
    conversationId
  );

  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    messageId: r.message_id,
    filePath: r.file_path,
    filename: r.filename,
    width: r.width,
    height: r.height,
    messagesRemaining: r.messages_remaining,
    createdAt: r.created_at,
  }));
}

export function deleteTemporaryScreenshot(id: number): boolean {
  const row = get<{ id: number; file_path: string }>(
    'SELECT id, file_path FROM ai_temporary_screenshots WHERE id = ?',
    id
  );
  if (!row) return false;

  try {
    if (existsSync(row.file_path)) {
      unlinkSync(row.file_path);
    }
  } catch {
    // Non-fatal
  }

  run('DELETE FROM ai_temporary_screenshots WHERE id = ?', id);
  return true;
}

export function cleanupConversationScreenshots(conversationId: number): void {
  const rows = all<{ id: number; file_path: string }>(
    'SELECT id, file_path FROM ai_temporary_screenshots WHERE conversation_id = ?',
    conversationId
  );
  for (const r of rows) {
    try {
      if (existsSync(r.file_path)) {
        unlinkSync(r.file_path);
      }
    } catch {
      // Non-fatal
    }
  }
  run('DELETE FROM ai_temporary_screenshots WHERE conversation_id = ?', conversationId);
}

export function cleanupExpiredScreenshots(): { cleanedFiles: number; cleanedRows: number } {
  let cleanedFiles = 0;
  let cleanedRows = 0;

  // 1. Remove expired DB rows and their files
  const expired = all<{ id: number; file_path: string }>(
    'SELECT id, file_path FROM ai_temporary_screenshots WHERE messages_remaining <= 0'
  );
  for (const r of expired) {
    try {
      if (existsSync(r.file_path)) {
        unlinkSync(r.file_path);
        cleanedFiles++;
      }
    } catch {
      // Non-fatal
    }
    run('DELETE FROM ai_temporary_screenshots WHERE id = ?', r.id);
    cleanedRows++;
  }

  // 2. Scan directory for orphaned screenshot files older than 24h
  try {
    const dir = tempScreenshotsDir();
    const files = readdirSync(dir);
    const activeFiles = new Set(
      all<{ file_path: string }>('SELECT file_path FROM ai_temporary_screenshots').map((r) => r.file_path)
    );

    const now = Date.now();
    for (const f of files) {
      if (!f.startsWith('snap_')) continue;
      const full = join(dir, f);
      if (!activeFiles.has(full)) {
        try {
          const st = statSync(full);
          // Delete unreferenced files older than 2 hours
          if (now - st.mtimeMs > 2 * 3600 * 1000) {
            unlinkSync(full);
            cleanedFiles++;
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // Non-fatal
  }

  return { cleanedFiles, cleanedRows };
}

export function countTemporaryScreenshots(): { count: number; dirPath: string } {
  const row = get<{ c: number }>('SELECT COUNT(*) c FROM ai_temporary_screenshots');
  return {
    count: row?.c ?? 0,
    dirPath: tempScreenshotsDir(),
  };
}
