import { all, get, run } from '../db';

/* ---------------- annotations (non-destructive) ---------------- */

export function listAnnotations(documentId: number, page?: number) {
  return page
    ? all('SELECT * FROM annotations WHERE document_id = ? AND page = ? ORDER BY id', documentId, page)
    : all('SELECT * FROM annotations WHERE document_id = ? ORDER BY page, id', documentId);
}

export function createAnnotation(a: {
  documentId: number; page: number; type: string; color: string;
  x?: number; y?: number; w?: number; h?: number;
  dataJson?: string; text?: string; comment?: string; fontSize?: number;
}) {
  return run(
    `INSERT INTO annotations (document_id, page, type, color, x, y, w, h, data_json, text, comment, font_size)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    a.documentId, a.page, a.type, a.color, a.x ?? null, a.y ?? null,
    a.w ?? null, a.h ?? null, a.dataJson ?? null, a.text ?? null, a.comment ?? null,
    a.fontSize ?? null
  ).lastInsertRowid;
}

const ANNOTATION_COLUMNS: Record<string, string> = {
  type: 'type',
  color: 'color',
  x: 'x',
  y: 'y',
  w: 'w',
  h: 'h',
  text: 'text',
  comment: 'comment',
  dataJson: 'data_json',
  fontSize: 'font_size',
};

export function updateAnnotation(id: number, patch: Record<string, unknown>) {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, column] of Object.entries(ANNOTATION_COLUMNS)) {
    if (!(key in patch) || patch[key] === undefined) continue;
    sets.push(`${column} = ?`);
    params.push(patch[key] as any);
  }
  if (!sets.length) return;
  sets.push("updated_at = datetime('now')");
  run(`UPDATE annotations SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
}

export function deleteAnnotation(id: number) { run('DELETE FROM annotations WHERE id = ?', id); }

/* ---------------- sticky notes ---------------- */

export function listStickyNotes(filter?: { documentId?: number; subjectId?: number; q?: string }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter?.documentId) { where.push('n.document_id = ?'); params.push(filter.documentId); }
  if (filter?.subjectId) { where.push('n.subject_id = ?'); params.push(filter.subjectId); }
  if (filter?.q) { where.push('(n.body LIKE ? OR n.title LIKE ?)'); params.push(`%${filter.q}%`, `%${filter.q}%`); }
  return all(`
    SELECT n.*, d.filename, s.name AS subject_name
    FROM sticky_notes n
    LEFT JOIN documents d ON d.id = n.document_id
    LEFT JOIN subjects s ON s.id = n.subject_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY n.updated_at DESC`, ...params);
}

function reindexNote(id: number) {
  const n = get<{ title: string | null; body: string }>('SELECT title, body FROM sticky_notes WHERE id = ?', id);
  run("DELETE FROM fts_notes WHERE kind='sticky' AND ref_id=?", id);
  if (n) run("INSERT INTO fts_notes (title, body, kind, ref_id) VALUES (?,?,?,?)", n.title ?? '', n.body, 'sticky', id);
}

export function createStickyNote(n: {
  documentId?: number; page?: number; x?: number; y?: number; w?: number; h?: number;
  color?: string; title?: string; body?: string; subjectId?: number; topicId?: number;
  fontSize?: number; isMinimized?: boolean | number;
}) {
  const isMin = n.isMinimized ? 1 : 0;
  const id = run(
    `INSERT INTO sticky_notes (document_id, page, x, y, w, h, color, title, body, subject_id, topic_id, font_size, is_minimized)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    n.documentId ?? null, n.page ?? null, n.x ?? null, n.y ?? null, n.w ?? null, n.h ?? null,
    n.color ?? 'yellow', n.title ?? null, n.body ?? '', n.subjectId ?? null, n.topicId ?? null,
    n.fontSize ?? null, isMin
  ).lastInsertRowid;
  reindexNote(id);
  return id;
}

export function updateStickyNote(id: number, patch: Record<string, unknown>) {
  const allowed = ['body', 'title', 'color', 'x', 'y', 'w', 'h', 'resolved', 'topic_id', 'subject_id', 'is_minimized', 'font_size'];
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    const col = k.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
    if (!allowed.includes(col)) continue;
    sets.push(`${col} = ?`);
    if (col === 'is_minimized') {
      params.push(v ? 1 : 0);
    } else {
      params.push(v as any);
    }
  }
  if (!sets.length) return;
  sets.push("updated_at = datetime('now')");
  run(`UPDATE sticky_notes SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
  reindexNote(id);
}

export function deleteStickyNote(id: number) {
  run("DELETE FROM fts_notes WHERE kind='sticky' AND ref_id=?", id);
  run('DELETE FROM sticky_notes WHERE id = ?', id);
}

/* ---------------- bookmarks ---------------- */

export function listBookmarks(documentId?: number) {
  return documentId
    ? all('SELECT * FROM bookmarks WHERE document_id = ? ORDER BY page', documentId)
    : all(`SELECT b.*, d.filename FROM bookmarks b JOIN documents d ON d.id=b.document_id ORDER BY b.created_at DESC`);
}

export function createBookmark(b: { documentId: number; page: number; title: string; description?: string; color?: string; tags?: string }) {
  return run(
    `INSERT INTO bookmarks (document_id, page, title, description, color, tags) VALUES (?,?,?,?,?,?)`,
    b.documentId, b.page, b.title, b.description ?? null, b.color ?? 'amber', b.tags ?? null
  ).lastInsertRowid;
}

export function deleteBookmark(id: number) { run('DELETE FROM bookmarks WHERE id = ?', id); }

/* ---------------- notebook ---------------- */

export function listNotebook(scopeType?: string, scopeId?: number) {
  if (scopeType) {
    return all('SELECT * FROM notebook_entries WHERE scope_type = ? AND (scope_id IS ? OR scope_id = ?) ORDER BY updated_at DESC',
      scopeType, scopeId ?? null, scopeId ?? null);
  }
  return all('SELECT * FROM notebook_entries ORDER BY updated_at DESC');
}

function reindexNotebook(id: number) {
  const n = get<{ title: string; body_md: string }>('SELECT title, body_md FROM notebook_entries WHERE id = ?', id);
  run("DELETE FROM fts_notes WHERE kind='notebook' AND ref_id=?", id);
  if (n) run("INSERT INTO fts_notes (title, body, kind, ref_id) VALUES (?,?,?,?)", n.title, n.body_md, 'notebook', id);
}

export function createNotebookEntry(e: { scopeType: string; scopeId?: number; title: string; bodyMd?: string }) {
  const id = run(
    'INSERT INTO notebook_entries (scope_type, scope_id, title, body_md) VALUES (?,?,?,?)',
    e.scopeType, e.scopeId ?? null, e.title, e.bodyMd ?? ''
  ).lastInsertRowid;
  reindexNotebook(id);
  return id;
}

export function updateNotebookEntry(id: number, patch: { title?: string; bodyMd?: string }) {
  if (patch.title !== undefined) run("UPDATE notebook_entries SET title=?, updated_at=datetime('now') WHERE id=?", patch.title, id);
  if (patch.bodyMd !== undefined) run("UPDATE notebook_entries SET body_md=?, updated_at=datetime('now') WHERE id=?", patch.bodyMd, id);
  reindexNotebook(id);
}

export function deleteNotebookEntry(id: number) {
  run("DELETE FROM fts_notes WHERE kind='notebook' AND ref_id=?", id);
  run('DELETE FROM notebook_entries WHERE id = ?', id);
}
