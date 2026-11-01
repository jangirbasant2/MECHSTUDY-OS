/**
 * Question-paper parsing for GATE Mechanical Engineering PDFs.
 *
 * This module is pure: it takes the *text layer* of a paper (one string per
 * page) and returns questions, and it takes the text layer of an answer-key
 * file and returns key rows. No filesystem, no database, no pdf.js — which is
 * what makes it testable against the real extracted text (see
 * tests/unit/pyq-parse.test.mjs).
 *
 * Deliberately conservative: anything the text layer cannot represent (a
 * figure, a glyph the font encoded as a private-use character, an option that
 * is only an image) is *flagged*, never silently dropped or invented.
 */

export type Section = 'GA' | 'ME';
export type KeyType = 'MCQ' | 'MSQ' | 'NAT';
export type QuestionKind = 'mcq' | 'msq' | 'numerical';

export interface KeyRow {
  qno: number;
  session: number;
  keyType: KeyType;
  section: Section;
  /** Raw key exactly as printed: "B", "A; C", "4780:4825", "0.59 to 0.63", "MTA". */
  key: string;
  marks: number;
}

export interface ParsedQuestion {
  qno: number;
  section: Section;
  type: QuestionKind;
  marks: number;
  text: string;
  options: string[];
  /** Raw official key text, or null when the key table has no row for this question. */
  key: string | null;
  flags: string[];
}

/* ------------------------------------------------------------------ */
/* page text                                                           */
/* ------------------------------------------------------------------ */

/** Split a dumped text file (`=== PAGE n ===` markers) back into pages. */
export function splitDumpText(raw: string): string[] {
  const parts = raw.split(/^\s*===\s*PAGE\s+\d+\s*===\s*$/m);
  // The first part is whatever came before page 1 (usually empty).
  return parts.length > 1 ? parts.slice(1) : parts;
}

/**
 * Running headers and footers. Each is removed with a bounded pattern so a
 * match can never eat the rest of a page (a previous prototype deleted the
 * whole page because `Organizing Institute:[^\n]*` ran to the end of the
 * single-line page).
 */
const PAGE_NOISE: RegExp[] = [
  /Organizing Institute:\s*[A-Za-z.]+(?:\s+[A-Za-z.]+)?/g,
  /Page\s+\d+\s+of\s+\d+/gi,
  /Mechanical Engineering\s*\(ME\)/gi,
  /General Aptitude\s*\(GA\)/gi,
  /General Aptitude/gi,
  /GATE\s+\d{4}\s*\(ME\s*Set\s*-\s*\d\)\s*Mechanical Engineering/gi,
  /\bGATE\s+\d{4}\b/gi,
  /\bME-\d+\b/g,
  /\bSESSION\s*-\s*\d+\b/gi,
];

/** Text of a whole paper: pages joined, headers stripped, whitespace normalised. */
export function cleanPaperText(pages: string[]): string {
  const body = pages
    .map(p => {
      let t = p;
      for (const re of PAGE_NOISE) t = t.replace(re, ' ');
      return t;
    })
    .join('\n');
  return body.replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ */
/* answer keys                                                         */
/* ------------------------------------------------------------------ */

const KEY_TABLE_HEADER = /Q\.\s*No\.\s*Session\s+(?:Question Type|Que\.\s*Type|Q\.\s*Type)/i;

/**
 * The column header, as printed once per page of the key table. The table
 * repeats it after every page break, right where the previous row's marks
 * would be, so it has to go before rows are matched.
 */
const KEY_TABLE_HEADER_FULL =
  /Q\.\s*No\.\s*Session\s+(?:Question Type|Que\.\s*Type|Q\.\s*Type)\s+[A-Za-z/. ]{0,40}?\b(?:Marks?|Mark)\b/gi;

/** Index of the answer-key table header in the raw text, or -1. */
export function keyTableStart(raw: string): number {
  const m = raw.match(KEY_TABLE_HEADER);
  return m && m.index !== undefined ? m.index : -1;
}

/** Running text that survives inside the key table across page breaks. */
const KEY_TEXT_NOISE: RegExp[] = [
  /^\s*===\s*PAGE\s+\d+\s*===\s*$/gm,
  /Page\s+\d+\s+of\s+\d+/gi,
  KEY_TABLE_HEADER_FULL,
  /GATE\s+\d{4}\s*\(ME\s*Set\s*-\s*\d\)\s*Mechanical Engineering/gi,
  /GATE\s+\d{4}\s*Mechanical Engineering\s*\(ME\)/gi,
  /Mechanical Engineering\s*\(ME\)/gi,
  /General Aptitude\s*\(GA\)/gi,
  /\bFinal Answer Key\b/gi,
  /\bME-\d+\b/g,
  /\bMTA\s*=\s*Marks?\s*to\s*All\b/gi,
];

/** Flatten a key document and remove everything that is not a table row. */
export function normaliseKeyText(raw: string): string {
  let text = raw;
  for (const re of KEY_TEXT_NOISE) text = text.replace(re, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Parse rows of `qno session (MCQ|MSQ|NAT) (GA|ME) key marks`.
 *
 * The document is cut into one chunk per table header (a combined PDF holds
 * one table per session, and a table that spans pages repeats its header).
 * Inside a chunk the table is split at each row start and each row's own
 * segment is parsed separately. That is what makes the awkward cases work:
 *  - the text layer glues the marks of one row to the question number of the
 *    next ("... A   1 2   3   MCQ ...");
 *  - a NAT key can itself end in the marks digit ("3 to 3 1" = key "3 to 3",
 *    marks 1), so the key is matched greedily and the marks must be 1 or 2.
 */
export function parseKeyRows(raw: string): KeyRow[] {
  const headers = [...raw.matchAll(new RegExp(KEY_TABLE_HEADER.source, 'gi'))];
  const chunks: string[] = [];
  if (!headers.length) {
    chunks.push(raw);
  } else {
    for (let i = 0; i < headers.length; i++) {
      const from = headers[i].index ?? 0;
      const to = i + 1 < headers.length ? (headers[i + 1].index ?? raw.length) : raw.length;
      chunks.push(raw.slice(from, to));
    }
  }
  return chunks.flatMap(chunk => parseKeyTable(normaliseKeyText(chunk)));
}

function parseKeyTable(rawTable: string): KeyRow[] {
  // A table can be followed by the next session's paper ("SESSION - 2") or by
  // a question section ("Q.1 ..."). Neither belongs to the table, and leaving
  // them in makes the last row's segment swallow them.
  let table = rawTable;
  const cut = Math.min(
    ...[
      table.search(/SESSION\s*-\s*\d/i),
      table.search(/Q\.\s*\d/),
    ].filter(i => i >= 0)
  );
  if (Number.isFinite(cut)) table = table.slice(0, cut);

  const starts = [...table.matchAll(/(\d{1,2})\s+(\d+)\s+(MCQ|MSQ|NAT)\s+(GA|ME)\s+/g)];
  const rows: KeyRow[] = [];
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i];
    const from = (s.index ?? 0) + s[0].length;
    const to = i + 1 < starts.length ? (starts[i + 1].index ?? table.length) : table.length;
    const segment = table.slice(from, to).trim();
    const m = segment.match(/^(.*)\s+([12])(?:\s|$)/);
    if (!m) continue;
    const key = m[1].trim().replace(/\s+/g, ' ');
    if (!key || key.length > 60) continue;
    if (/\d{1,2}\s+\d+\s+(?:MCQ|MSQ|NAT)\b/.test(key)) continue; // a row leaked into the key
    rows.push({
      qno: Number(s[1]),
      session: Number(s[2]),
      keyType: s[3] as KeyType,
      section: s[4] as Section,
      key,
      marks: Number(m[2]),
    });
  }
  return rows;
}

/** Keep only the rows that belong to one session (a combined PDF holds two). */
export function rowsForSession(rows: KeyRow[], session: number): KeyRow[] {
  return rows.filter(r => r.session === session);
}

/**
 * Sanity checks a key table must pass before anything is written to the
 * database. A table that fails is reported, never half-imported.
 */
export function validateKeyRows(rows: KeyRow[]): string[] {
  const problems: string[] = [];
  if (!rows.length) problems.push('no key rows found');
  const seen = new Set<number>();
  for (const r of rows) {
    if (r.qno < 1 || r.qno > 65) problems.push(`question number out of range: ${r.qno}`);
    if (seen.has(r.qno)) problems.push(`duplicate key row for Q${r.qno}`);
    seen.add(r.qno);
    if (r.marks !== 1 && r.marks !== 2) problems.push(`Q${r.qno} has unexpected marks ${r.marks}`);
  }
  return [...new Set(problems)];
}

/* ------------------------------------------------------------------ */
/* question segmentation                                               */
/* ------------------------------------------------------------------ */

interface Chunk { qno: number; chunk: string }

/**
 * Split a cleaned paper into per-question chunks.
 *
 * Section banners ("Q.1 - Q.5 Carry ONE mark each.", and the 2022 variant
 * "Q.11 - 35 Carry ONE mark each.") contain question numbers but are not
 * questions; both shapes are skipped.
 */
export function splitQuestionChunks(text: string): Chunk[] {
  const starts: { qno: number; index: number; contentStart: number }[] = [];
  const re = /Q\.\s*(\d{1,2})(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const after = text.slice(m.index, m.index + 80);
    if (/^Q\.\s*\d{1,2}\s*[-\u2013\u2014]\s*Q\.\s*\d{1,2}\s+Carry/i.test(after)) continue;
    if (/^Q\.\s*\d{1,2}\s*[-\u2013\u2014]\s*\d{1,2}\s+Carry/i.test(after)) continue;
    if (/^Q\.\s*\d{1,2}\s+Carry\b/i.test(after)) continue;
    starts.push({ qno: Number(m[1]), index: m.index, contentStart: m.index + m[0].length });
  }
  const out: Chunk[] = [];
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].index : text.length;
    out.push({ qno: starts[i].qno, chunk: text.slice(starts[i].contentStart, end).trim() });
  }
  return out;
}

/**
 * Split a chunk into stem + four options.
 *
 * Requires the four markers to be (A) (B) (C) (D) in that order. A question
 * whose options are pictures has the markers but no text between them; that is
 * returned as four empty strings so the caller can flag it instead of guessing.
 */
export function splitOptions(chunk: string): { stem: string; options: string[] } {
  const marks = [...chunk.matchAll(/\(([A-D])\)/g)];
  for (let i = 0; i + 3 < marks.length; i++) {
    const letters = marks.slice(i, i + 4).map(x => x[1]).join('');
    if (letters !== 'ABCD') continue;
    const stem = chunk.slice(0, marks[i].index).trim();
    const options: string[] = [];
    for (let j = 0; j < 4; j++) {
      const from = (marks[i + j].index ?? 0) + marks[i + j][0].length;
      const to = j < 3 ? (marks[i + j + 1].index ?? chunk.length) : chunk.length;
      options.push(chunk.slice(from, to).trim());
    }
    return { stem, options };
  }
  return { stem: chunk.trim(), options: [] };
}

/* ------------------------------------------------------------------ */
/* text fidelity                                                       */
/* ------------------------------------------------------------------ */

/**
 * Characters that mean the font did not map to Unicode: private-use area
 * glyphs (Symbol/Wingdings subsets) and scripts that cannot occur in an
 * English GATE paper (Tamil, Telugu, Kannada, Malayalam, Sinhala, Ethiopic).
 * They are extraction artefacts, not content.
 */
const ARTEFACT_CHARS = /[\uE000-\uF8FF\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0DFF\u0D80-\u0DFF\u1200-\u137F]/;

const FIGURE_WORDS = /\b(figures?|fig\.|shown below|shown in the|given figure|plots?|graphs?|diagrams?|sketch(?:es)?|charts?|circuit)\b/i;

export function hasEncodingArtefacts(s: string): boolean {
  return ARTEFACT_CHARS.test(s);
}

/** Flags for one parsed question, describing what the text layer cannot carry. */
export function questionFlags(q: { text: string; options: string[]; type: QuestionKind; key: string | null }): string[] {
  const flags: string[] = [];
  const all = [q.text, ...q.options].join(' ');
  if (hasEncodingArtefacts(all)) flags.push('encoding_artefacts');
  if (q.type !== 'numerical') {
    if (q.options.length !== 4) flags.push('options_incomplete');
    else if (q.options.some(o => !o)) flags.push('options_are_figures');
  }
  if (FIGURE_WORDS.test(q.text)) flags.push('figure_reference');
  if (!q.text || q.text.length < 15) flags.push('text_incomplete');
  if (q.key === null) flags.push('key_missing');
  return flags;
}

/* ------------------------------------------------------------------ */
/* whole paper                                                         */
/* ------------------------------------------------------------------ */

const KIND: Record<KeyType, QuestionKind> = { MCQ: 'mcq', MSQ: 'msq', NAT: 'numerical' };

/**
 * Turn the text layer of one paper into questions.
 *
 * `pages` is the text layer of the paper only (any embedded answer key must be
 * cut off first — see `paperBodyPages`), `keys` are the key rows for this
 * paper's session.
 */
export function parsePaper(pages: string[], keys: KeyRow[]): ParsedQuestion[] {
  const byQno = new Map(keys.map(k => [k.qno, k]));
  const body = cleanPaperText(pages);
  const chunks = splitQuestionChunks(body);

  const out: ParsedQuestion[] = [];
  const seen = new Set<number>();
  for (const { qno, chunk } of chunks) {
    if (seen.has(qno)) continue;
    seen.add(qno);
    const keyRow = byQno.get(qno);
    const { stem, options } = splitOptions(chunk);
    const section: Section = keyRow?.section ?? (qno <= 10 ? 'GA' : 'ME');
    const type: QuestionKind = keyRow ? KIND[keyRow.keyType] : (options.length === 4 ? 'mcq' : 'numerical');
    const marks = keyRow?.marks ?? (qno <= 5 ? 1 : qno <= 10 ? 2 : qno <= 35 ? 1 : 2);
    const text = stem.trim();
    out.push({
      qno, section, type, marks, text, options,
      key: keyRow ? keyRow.key : null,
      flags: questionFlags({ text, options, type, key: keyRow ? keyRow.key : null }),
    });
  }
  return out.sort((a, b) => a.qno - b.qno);
}

/**
 * Drop everything from the start of the embedded answer key onwards, so key
 * rows are never mistaken for question text.
 */
export function paperBodyPages(pages: string[]): string[] {
  const out: string[] = [];
  for (const page of pages) {
    if (KEY_TABLE_HEADER.test(page)) {
      const at = page.search(KEY_TABLE_HEADER);
      if (at > 0) out.push(page.slice(0, at));
      break;
    }
    out.push(page);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* answer keys: trust                                                  */
/* ------------------------------------------------------------------ */

/**
 * A key group (paper × section × question type) whose correct option is the
 * same letter for almost every question is not a key — it is a placeholder.
 * The real 2026 file is 35/35 "A" for ME MCQs, so this rule is what stops the
 * app from presenting that as an official answer.
 */
export function constantKeyGroup(keys: string[]): { constant: boolean; letter: string; share: number } {
  const letters = keys.map(k => k.trim().toUpperCase()).filter(k => /^[A-D]$/.test(k));
  if (letters.length < 10) return { constant: false, letter: '', share: 0 };
  const counts = new Map<string, number>();
  for (const l of letters) counts.set(l, (counts.get(l) ?? 0) + 1);
  const [letter, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const share = n / letters.length;
  return { constant: share >= 0.8, letter, share };
}

/* ------------------------------------------------------------------ */
/* numeric key ranges                                                  */
/* ------------------------------------------------------------------ */

export interface KeyValue {
  kind: 'single' | 'range' | 'alternatives' | 'letters' | 'mta' | 'empty';
  numbers: number[];
  text: string;
}

/** Every numeric interval an official NAT key allows ("a to b", "a:b", "x OR y"). */
export function keyRanges(text: string): [number, number][] {
  const out: [number, number][] = [];
  for (const part of text.split(/\s+OR\s+/i)) {
    const m = part.match(/^\s*(-?\d+(?:\.\d+)?)\s*(?:to|:)\s*(-?\d+(?:\.\d+)?)/i);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      out.push([Math.min(a, b), Math.max(a, b)]);
      continue;
    }
    const s = part.trim().match(/^-?\d+(?:\.\d+)?$/);
    if (s) out.push([Number(s[0]), Number(s[0])]);
  }
  return out;
}

/**
 * Read an official key. GATE has printed NAT keys as "0.59 to 0.63",
 * "4780:4825" and "-0.29 to -0.25 OR 0.25 to 0.29", and MSQ keys as
 * "A; B; D" / "A, B OR A, B".
 */
export function parseKeyValue(raw: string): KeyValue {
  const text = raw.trim();
  const upper = text.toUpperCase();
  if (!text) return { kind: 'empty', numbers: [], text };
  if (upper === 'MTA') return { kind: 'mta', numbers: [], text };

  if (/^[A-D](?:\s*[;,]\s*[A-D])*(?:\s+OR\s+[A-D](?:\s*[;,]\s*[A-D])*)?$/i.test(text)) {
    return { kind: 'letters', numbers: [], text };
  }

  const ranges = keyRanges(text);
  if (ranges.length === 1 && ranges[0][0] === ranges[0][1]) {
    return { kind: 'single', numbers: ranges[0], text };
  }
  if (ranges.length === 1) return { kind: 'range', numbers: ranges[0], text };
  if (ranges.length > 1) return { kind: 'alternatives', numbers: ranges.flat(), text };
  return { kind: 'empty', numbers: [], text };
}

/** Does a computed numeric answer fall inside the official key? */
export function valueMatchesKey(value: number, kv: KeyValue, tolerance = 0): boolean {
  for (const [lo, hi] of keyRanges(kv.text)) {
    if (value >= lo - tolerance && value <= hi + tolerance) return true;
  }
  return false;
}
