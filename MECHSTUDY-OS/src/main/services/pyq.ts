import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { all, get, run } from '../db';
import { inspectPdf, openPdf, closePdf, pageTextRaw } from './pdf';
import {
  PYQ_FILES, PYQ_PAPERS, paperByKey, type PyqPaperDef,
} from '../data/pyqPapers';
import {
  constantKeyGroup, parseKeyRows, parseKeyValue, parsePaper, paperBodyPages,
  rowsForSession, validateKeyRows, valueMatchesKey, type KeyRow, type ParsedQuestion,
} from './pyq/parse';
import { PYQ_SOLUTIONS } from '../data/pyqSolutions';
import type {
  PyqFileStatus, PyqImportResult, PyqScanResult, PyqSolutionOutcome,
} from '../../shared/types';

/**
 * Previous-year question import.
 *
 * Reads the PDFs in "Gate paper and answer key" in place (never copies or
 * modifies them), parses the questions and the official answer keys, and
 * writes only what it could actually read, with the provenance of every
 * answer. Nothing is guessed: a question whose key is missing, contradictory
 * or obviously a placeholder is stored with answer = NULL and an explicit
 * answer_status, and the UI says so.
 *
 * Import is batched and resumable: each committed batch advances
 * pyq_import_batches.cursor, and every question has a stable external_ref
 * (paper + question number), so re-running the import updates rows instead of
 * duplicating them.
 */

/* ------------------------------------------------------------------ */
/* scanning                                                            */
/* ------------------------------------------------------------------ */

export async function scanPyqFolder(folder: string): Promise<PyqScanResult> {
  const exists = !!folder && existsSync(folder);
  const present = new Set<string>();
  if (exists) {
    for (const name of readdirSync(folder)) {
      if (name.toLowerCase().endsWith('.pdf')) present.add(name);
    }
  }

  const files: PyqFileStatus[] = [];
  for (const f of PYQ_FILES) {
    const path = join(folder, f.filename);
    const isPresent = exists && present.has(f.filename);
    let sizeBytes = 0;
    let pageCount = 0;
    let hasTextLayer = false;
    let error: string | undefined;
    if (isPresent) {
      try { sizeBytes = statSync(path).size; } catch { /* ignore */ }
      try {
        const info = await inspectPdf(path);
        pageCount = info.pageCount;
        hasTextLayer = info.hasTextLayer;
        if (info.error) error = info.error;
      } catch (e) {
        error = (e as Error).message;
      }
    }
    files.push({
      filename: f.filename, role: f.role, reason: f.reason,
      present: isPresent, sizeBytes, pageCount, hasTextLayer, error,
    });
  }

  const batches = all<{ paper_key: string; status: string; questions_imported: number; questions_found: number }>(
    'SELECT paper_key, status, questions_imported, questions_found FROM pyq_import_batches'
  );
  const byKey = new Map(batches.map(b => [b.paper_key, b]));

  const papers = PYQ_PAPERS.map(p => {
    const b = byKey.get(p.paperKey);
    return {
      paperKey: p.paperKey, label: p.label, year: p.year, session: p.session,
      sourceFile: p.sourceFile,
      present: exists && present.has(p.sourceFile),
      status: b?.status ?? null,
      imported: b?.questions_imported ?? 0,
      found: b?.questions_found ?? 0,
    };
  });

  return { folder, exists, files, papers };
}

/* ------------------------------------------------------------------ */
/* reading                                                             */
/* ------------------------------------------------------------------ */

async function readPages(path: string): Promise<string[]> {
  const doc = await openPdf(path);
  try {
    const n: number = doc.numPages ?? 0;
    const pages: string[] = [];
    for (let i = 1; i <= n; i++) pages.push(await pageTextRaw(doc, i));
    return pages;
  } finally {
    await closePdf(doc);
  }
}

async function readKeyFile(path: string): Promise<KeyRow[]> {
  if (!existsSync(path)) return [];
  const raw = (await readPages(path)).join('\n');
  return parseKeyRows(raw);
}

/* ------------------------------------------------------------------ */
/* provenance                                                          */
/* ------------------------------------------------------------------ */

export interface AnswerDecision {
  answer: string | null;
  source: 'official_key' | 'derived' | 'none';
  status: 'official_verified' | 'official_single' | 'conflict' | 'unresolved';
  note: string;
}

const normaliseKey = (s: string) => s.replace(/\s+/g, ' ').trim().toUpperCase();

/**
 * Combine every official copy of one answer.
 *
 * Two documents that agree => official_verified. One document => official_single.
 * Documents that disagree => conflict, and the answer is withheld because the
 * app has no basis for choosing between two official sources.
 */
export function decideAnswer(
  qno: number,
  copies: { file: string; key: string }[]
): AnswerDecision {
  const usable = copies.filter(c => c.key && c.key.trim());
  if (!usable.length) {
    return {
      answer: null, source: 'none', status: 'unresolved',
      note: `No answer-key row for Q${qno} in any key document in this folder.`,
    };
  }
  const distinct = [...new Set(usable.map(c => normaliseKey(c.key)))];
  if (distinct.length === 1) {
    const verified = usable.length >= 2;
    return {
      answer: usable[0].key.trim(),
      source: 'official_key',
      status: verified ? 'official_verified' : 'official_single',
      note: verified
        ? `Official key, identical in ${usable.map(c => c.file).join(' and ')}.`
        : `Official key from ${usable[0].file} (the only key document for this paper in the folder).`,
    };
  }
  return {
    answer: null, source: 'none', status: 'conflict',
    note: `Key documents disagree: ${usable.map(c => `${c.file} says ${c.key}`).join('; ')}. Answer withheld.`,
  };
}

/** Groups of answers that are a placeholder rather than a key (all "A"). */
export function anomalousGroups(
  questions: ParsedQuestion[], copiesByQno: Map<number, { file: string; key: string }[]>
): Map<string, { letter: string; share: number; count: number }> {
  const groups = new Map<string, { qno: number; key: string }[]>();
  for (const q of questions) {
    const copies = copiesByQno.get(q.qno) ?? [];
    const key = copies[0]?.key ?? '';
    const id = `${q.section}/${q.type}`;
    const list = groups.get(id) ?? [];
    list.push({ qno: q.qno, key });
    groups.set(id, list);
  }
  const flagged = new Map<string, { letter: string; share: number; count: number }>();
  for (const [id, list] of groups) {
    const verdict = constantKeyGroup(list.map(x => x.key));
    if (verdict.constant) {
      flagged.set(id, { letter: verdict.letter, share: verdict.share, count: list.length });
    }
  }
  return flagged;
}

/* ------------------------------------------------------------------ */
/* import                                                              */
/* ------------------------------------------------------------------ */

function ensureBatch(def: PyqPaperDef, keyFileList: string[]): number {
  const existing = get<{ id: number; status: string; cursor: number }>(
    'SELECT id, status, cursor FROM pyq_import_batches WHERE paper_key = ?', def.paperKey
  );
  if (existing) {
    run(
      `UPDATE pyq_import_batches
       SET status = 'running', started_at = COALESCE(started_at, datetime('now')),
           updated_at = datetime('now'), error = NULL
       WHERE id = ?`, existing.id
    );
    return existing.id;
  }
  return run(
    `INSERT INTO pyq_import_batches
      (paper_key, paper_label, year, session, source_file, key_file, status, started_at)
     VALUES (?,?,?,?,?,?, 'running', datetime('now'))`,
    def.paperKey, def.label, def.year, def.session, def.sourceFile,
    keyFileList.join(', ') || null
  ).lastInsertRowid;
}

function batchRow(paperKey: string) {
  return get<any>('SELECT * FROM pyq_import_batches WHERE paper_key = ?', paperKey);
}

function gaSubjectId(): number | null {
  const row = get<{ id: number }>("SELECT id FROM subjects WHERE code = 'GATE-ME-GA'");
  return row?.id ?? null;
}

const FLAG_LABELS: Record<string, string> = {
  encoding_artefacts: 'some symbols were not extractable',
  options_incomplete: 'fewer than four options were readable',
  options_are_figures: 'options are pictures, not text',
  figure_reference: 'refers to a figure',
  text_incomplete: 'question text is incomplete',
  key_missing: 'no answer-key row',
};

/**
 * Import one paper, in batches.
 *
 * Resumable: the batch row remembers how many questions were committed, so a
 * crash or a pause never loses or duplicates work. `force` restarts from zero
 * and refreshes every row (used after changing the parsing rules).
 */
export async function importPaper(opts: {
  folder: string;
  paperKey: string;
  batchSize?: number;
  force?: boolean;
  onProgress?: (p: { paperKey: string; done: number; total: number; imported: number }) => void;
}): Promise<PyqImportResult> {
  const def = paperByKey(opts.paperKey);
  if (!def) throw new Error(`Unknown paper: ${opts.paperKey}`);

  const paperPath = join(opts.folder, def.sourceFile);
  if (!existsSync(paperPath)) throw new Error(`Not found: ${def.sourceFile}`);

  const batchSize = Math.max(1, Math.min(50, opts.batchSize ?? 20));
  const existing = batchRow(def.paperKey);

  // A finished batch is not redone: re-running the import is a no-op unless
  // the caller asks for a refresh (force), which updates every row in place.
  if (existing && existing.status === 'done' && !opts.force) {
    const counts = new Map<string, number>(
      all<{ answer_status: string; c: number }>(
        `SELECT answer_status, COUNT(*) c FROM questions WHERE paper = ? GROUP BY answer_status`,
        def.label
      ).map(r => [r.answer_status, Number(r.c)])
    );
    return {
      paperKey: def.paperKey, label: def.label, status: 'done',
      found: Number(existing.questions_found ?? 0),
      imported: 0, skipped: 0,
      verified: counts.get('official_verified') ?? 0,
      single: counts.get('official_single') ?? 0,
      conflicts: counts.get('conflict') ?? 0,
      unresolved: counts.get('unresolved') ?? 0,
      flags: {}, withheldGroups: [],
      alreadyImported: true,
    };
  }

  const batchId = ensureBatch(def, def.keyFiles);
  const cursor = opts.force || !existing ? 0 : Number(existing.cursor ?? 0);

  try {
    // ---- read the paper and every key document -------------------------
    let pages = await readPages(paperPath);
    if (def.startMarker) {
      const at = pages.findIndex(p => p.includes(def.startMarker!));
      if (at < 0) throw new Error(`Marker "${def.startMarker}" not found in ${def.sourceFile}`);
      pages = pages.slice(at);
    }

    const copiesByQno = new Map<number, { file: string; key: string }[]>();
    const addRows = (file: string, rows: KeyRow[]) => {
      for (const r of rows) {
        const list = copiesByQno.get(r.qno) ?? [];
        list.push({ file, key: r.key });
        copiesByQno.set(r.qno, list);
      }
    };

    let embeddedRows: KeyRow[] = [];
    if (def.embeddedKey) {
      embeddedRows = rowsForSession(parseKeyRows(pages.join('\n')), def.session);
      const problems = validateKeyRows(embeddedRows);
      if (problems.length) throw new Error(`Embedded key in ${def.sourceFile} failed checks: ${problems.join('; ')}`);
      addRows(def.sourceFile, embeddedRows);
    }

    const keyFileRows: KeyRow[] = [];
    for (const kf of def.keyFiles) {
      const rows = rowsForSession(await readKeyFile(join(opts.folder, kf)), def.session);
      if (!rows.length) continue; // a key file without this session is not an error
      keyFileRows.push(...rows);
      addRows(kf, rows);
    }

    // ---- questions -----------------------------------------------------
    // One merged key row per question decides section, marks and
    // MCQ/MSQ/NAT. The embedded table wins when both exist.
    const mergedRows: KeyRow[] = [];
    const seenQno = new Set<number>();
    for (const list of [embeddedRows, keyFileRows]) {
      for (const r of list) {
        if (seenQno.has(r.qno)) continue;
        seenQno.add(r.qno);
        mergedRows.push(r);
      }
    }
    mergedRows.sort((a, b) => a.qno - b.qno);

    const questions = parsePaper(paperBodyPages(pages), mergedRows);
    if (!questions.length) throw new Error(`No questions parsed from ${def.sourceFile}`);
    const missing = Array.from({ length: 65 }, (_, i) => i + 1).filter(n => !questions.some(q => q.qno === n));
    if (missing.length) throw new Error(`Question numbers not found in ${def.sourceFile}: ${missing.join(', ')}`);

    // ---- answer keys: trust -------------------------------------------
    const withheld = anomalousGroups(questions, copiesByQno);
    const ga = gaSubjectId();

    // ---- write, in batches --------------------------------------------
    const total = questions.length;
    let imported = 0;
    let skipped = 0;
    let verified = 0;
    let single = 0;
    let conflicts = 0;
    let unresolved = 0;
    const flagCounts: Record<string, number> = {};

    for (let i = cursor; i < total; i += batchSize) {
      const slice = questions.slice(i, Math.min(i + batchSize, total));
      run('BEGIN');
      try {
        for (const q of slice) {
          const copies = copiesByQno.get(q.qno) ?? [];
          const decision = decideAnswer(q.qno, copies);
          const groupId = `${q.section}/${q.type}`;
          const anomaly = withheld.get(groupId);

          let answer = decision.answer;
          let status = decision.status;
          let note = decision.note;
          if (anomaly && answer) {
            answer = null;
            status = 'unresolved';
            note = `Answer withheld: ${anomaly.count} of ${anomaly.count} ${q.section}/${q.type} answers in this key are "${anomaly.letter}", ` +
              `so the key is a placeholder, not a key. The printed key says "${q.key}".`;
          }
          if (status === 'official_verified') verified++;
          else if (status === 'official_single') single++;
          else if (status === 'conflict') conflicts++;
          else unresolved++;

          for (const f of q.flags) flagCounts[f] = (flagCounts[f] ?? 0) + 1;

          const externalRef = `${def.paperKey}-Q${q.qno}`;
          const subjectId = q.section === 'GA' ? ga : null;
          const optionsJson = q.options.length === 4 ? JSON.stringify(q.options) : null;

          const existingRow = get<{ id: number }>('SELECT id FROM questions WHERE external_ref = ?', externalRef);
          if (existingRow) {
            run(
              `UPDATE questions SET text = ?, type = ?, subject_id = ?, exam = ?, year = ?, marks = ?,
                 options_json = ?, answer = ?, source = ?, origin = 'imported', paper = ?, section = ?,
                 answer_source = ?, answer_status = ?, key_range = ?, source_file = ?, flags_json = ?,
                 answer_note = ?, difficulty = NULL
               WHERE id = ?`,
              q.text, q.type, subjectId, 'GATE', def.year, q.marks, optionsJson, answer,
              `${def.label} · Q${q.qno}`, def.label, q.section,
              decision.source === 'official_key' && status === 'unresolved' ? 'none' : decision.source,
              status, q.key, def.sourceFile, JSON.stringify(q.flags), note, existingRow.id
            );
            skipped++;
          } else {
            run(
              `INSERT INTO questions
                 (text, type, subject_id, topic_id, exam, year, marks, options_json, answer, solution,
                  source, difficulty, origin, external_ref, paper, section, answer_source, answer_status,
                  key_range, source_file, flags_json, answer_note)
               VALUES (?,?,?,NULL,?,?,?,?,?,NULL,?,NULL,'imported',?,?,?,?,?,?,?,?,?)`,
              q.text, q.type, subjectId, 'GATE', def.year, q.marks, optionsJson, answer,
              `${def.label} · Q${q.qno}`, externalRef, def.label, q.section,
              decision.source === 'official_key' && status === 'unresolved' ? 'none' : decision.source,
              status, q.key, def.sourceFile, JSON.stringify(q.flags), note
            );
            imported++;
          }
        }
        run(
          `UPDATE pyq_import_batches
             SET cursor = ?, questions_found = ?, questions_imported = ?, questions_skipped = ?,
                 answers_official = ?, answers_unresolved = ?, updated_at = datetime('now')
           WHERE id = ?`,
          Math.min(i + batchSize, total), total, imported, skipped, verified + single, unresolved + conflicts, batchId
        );
        run('COMMIT');
      } catch (e) {
        run('ROLLBACK');
        throw e;
      }
      opts.onProgress?.({ paperKey: def.paperKey, done: Math.min(i + batchSize, total), total, imported });
    }

    run(
      `UPDATE pyq_import_batches
         SET status = 'done', cursor = ?, finished_at = datetime('now'), updated_at = datetime('now'),
             questions_found = ?, questions_imported = ?, questions_skipped = ?,
             answers_official = ?, answers_unresolved = ?, notes = ?
       WHERE id = ?`,
      total, total, imported, skipped, verified + single, unresolved + conflicts,
      withheld.size ? `withheld groups: ${[...withheld.keys()].join(', ')}` : null, batchId
    );

    return {
      paperKey: def.paperKey, label: def.label, status: 'done',
      found: total, imported, skipped, verified, single, conflicts, unresolved,
      flags: flagCounts, withheldGroups: [...withheld.keys()],
    };
  } catch (e) {
    const message = (e as Error).message;
    run(
      `UPDATE pyq_import_batches SET status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ?`,
      message, batchId
    );
    return {
      paperKey: def.paperKey, label: def.label, status: 'failed',
      found: 0, imported: 0, skipped: 0, verified: 0, single: 0, conflicts: 0, unresolved: 0,
      flags: {}, withheldGroups: [], error: message,
    };
  }
}

export async function importAllPapers(opts: {
  folder: string;
  batchSize?: number;
  onProgress?: (p: { paperKey: string; done: number; total: number; imported: number }) => void;
}): Promise<PyqImportResult[]> {
  const out: PyqImportResult[] = [];
  for (const def of PYQ_PAPERS) {
    if (!existsSync(join(opts.folder, def.sourceFile))) {
      out.push({
        paperKey: def.paperKey, label: def.label, status: 'failed',
        found: 0, imported: 0, skipped: 0, verified: 0, single: 0, conflicts: 0, unresolved: 0,
        flags: {}, withheldGroups: [], error: `File not found: ${def.sourceFile}`,
      });
      continue;
    }
    out.push(await importPaper({ ...opts, paperKey: def.paperKey }));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* reporting                                                           */
/* ------------------------------------------------------------------ */

export function listBatches() {
  return all<any>(`SELECT * FROM pyq_import_batches ORDER BY year, session`);
}

export function pyqStats() {
  const byPaper = all<any>(`
    SELECT paper, COUNT(*) n,
      SUM(CASE WHEN answer_status = 'official_verified' THEN 1 ELSE 0 END) verified,
      SUM(CASE WHEN answer_status = 'official_single' THEN 1 ELSE 0 END) single,
      SUM(CASE WHEN answer_status = 'conflict' THEN 1 ELSE 0 END) conflicts,
      SUM(CASE WHEN answer_status = 'unresolved' THEN 1 ELSE 0 END) unresolved,
      SUM(CASE WHEN solution_source = 'ai_generated' THEN 1 ELSE 0 END) with_solution
    FROM questions WHERE external_ref IS NOT NULL GROUP BY paper ORDER BY paper`);

  const byStatus = all<any>(`
    SELECT COALESCE(answer_status, 'not_imported') status, COUNT(*) n
    FROM questions GROUP BY status ORDER BY n DESC`);

  const byType = all<any>(`
    SELECT type, COUNT(*) n FROM questions WHERE external_ref IS NOT NULL GROUP BY type ORDER BY n DESC`);

  const flags = new Map<string, number>();
  for (const row of all<{ flags_json: string | null }>(
    'SELECT flags_json FROM questions WHERE flags_json IS NOT NULL')) {
    try {
      for (const f of JSON.parse(row.flags_json ?? '[]') as string[]) flags.set(f, (flags.get(f) ?? 0) + 1);
    } catch { /* ignore malformed */ }
  }

  const totals = byPaper.reduce(
    (acc, r) => ({
      questions: acc.questions + Number(r.n),
      verified: acc.verified + Number(r.verified),
      single: acc.single + Number(r.single),
      conflicts: acc.conflicts + Number(r.conflicts),
      unresolved: acc.unresolved + Number(r.unresolved),
      withSolution: acc.withSolution + Number(r.with_solution),
    }),
    { questions: 0, verified: 0, single: 0, conflicts: 0, unresolved: 0, withSolution: 0 }
  );

  return {
    totals,
    byPaper,
    byStatus,
    byType,
    flags: [...flags.entries()].sort((a, b) => b[1] - a[1]).map(([flag, count]) => ({ flag, count })),
  };
}

/** Everything the UI needs to explain one imported question. */
export function questionProvenance(id: number) {
  const q = get<any>(`
    SELECT id, external_ref, paper, section, answer_status, answer_source, solution_source,
           solution_status, key_range, source_file, flags_json, answer_note, answer, solution
    FROM questions WHERE id = ?`, id);
  if (!q) return null;
  let flags: string[] = [];
  try { flags = q.flags_json ? JSON.parse(q.flags_json) : []; } catch { /* ignore */ }
  return {
    ...q,
    flags,
    flagLabels: flags.map(f => FLAG_LABELS[f] ?? f),
  };
}

export const PYQ_FLAG_LABELS = FLAG_LABELS;

/* ------------------------------------------------------------------ */
/* worked solutions (computed by the app, checked against the key)      */
/* ------------------------------------------------------------------ */

/**
 * Attach the worked solutions in data/pyqSolutions.ts.
 *
 * Every solution is the app's own work, so it is stored with
 * solution_source = 'ai_generated'. It is only written when the computed
 * answer can be checked against the official key: a solution whose result
 * disagrees with the key (or whose question has no trustworthy key) is
 * rejected and reported, never stored.
 */
export function applySolutions(): PyqSolutionOutcome {
  const rejected: { externalRef: string; reason: string }[] = [];
  let attached = 0;

  for (const s of PYQ_SOLUTIONS) {
    const q = get<any>(
      `SELECT id, type, answer_status, key_range, answer FROM questions WHERE external_ref = ?`,
      s.externalRef
    );
    if (!q) { rejected.push({ externalRef: s.externalRef, reason: 'question not imported' }); continue; }
    if (q.answer_status === 'unresolved' || q.answer_status === 'conflict') {
      rejected.push({ externalRef: s.externalRef, reason: `official answer is ${q.answer_status}; nothing to check against` });
      continue;
    }
    const official = String(q.key_range ?? '').trim();
    if (!official) { rejected.push({ externalRef: s.externalRef, reason: 'no official key text stored' }); continue; }

    let ok = false;
    let detail = '';
    if (typeof s.value === 'number') {
      const kv = parseKeyValue(official);
      ok = valueMatchesKey(s.value, kv, s.tolerance ?? 0);
      detail = `computed ${s.value}, official ${official}`;
    } else if (s.letters?.length) {
      const officialLetters = officialLettersOf(official);
      const mine = [...new Set(s.letters.map(l => l.toUpperCase()))].sort();
      ok = officialLetters.some(set => set.length === mine.length && set.every((l, i) => l === mine[i]));
      detail = `computed ${mine.join('')}, official ${official}`;
    } else {
      rejected.push({ externalRef: s.externalRef, reason: 'solution has neither a value nor letters' });
      continue;
    }

    if (!ok) { rejected.push({ externalRef: s.externalRef, reason: `does not match: ${detail}` }); continue; }

    run(
      `UPDATE questions SET solution = ?, solution_source = 'ai_generated',
         solution_status = 'checked_against_official_key'
       WHERE id = ?`,
      s.working.trim(), q.id
    );
    attached++;
  }

  return { attached, rejected };
}

/** Official MSQ/MCQ key text ("A; C" / "A, B OR A, B") as sets of letters. */
export function officialLettersOf(text: string): string[][] {
  return text
    .split(/\s+OR\s+/i)
    .map(part => [...new Set((part.toUpperCase().match(/[A-D]/g) ?? []))].sort())
    .filter(set => set.length > 0);
}
