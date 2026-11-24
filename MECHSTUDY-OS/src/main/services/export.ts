import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, basename, join, extname } from 'node:path';
import { all, get } from '../db';

/**
 * Annotated PDF export.
 *
 * The original file is NEVER modified. Every export writes a NEW file to the
 * path chosen by the user, and refuses to run if that path is the source file.
 */

export interface ExportOptions {
  documentId: number;
  outPath: string;
  includeHighlights: boolean;
  includeInk: boolean;
  includeNoteMarkers: boolean;
  includeNoteSummary: boolean;
  pages?: number[] | 'all';
}

const COLOR_MAP: Record<string, [number, number, number]> = {
  yellow: [1, 0.92, 0.23],
  green: [0.55, 0.94, 0.45],
  blue: [0.45, 0.72, 1],
  pink: [1, 0.62, 0.78],
  red: [1, 0.4, 0.4],
  amber: [1, 0.75, 0.25],
  purple: [0.7, 0.55, 1],
};

function toRgb(hex: string): [number, number, number] {
  const named = COLOR_MAP[hex.toLowerCase()];
  if (named) return named;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [1, 0.92, 0.23];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

interface StrokePoint { x: number; y: number }
interface Stroke { points: StrokePoint[]; color: string; width: number; opacity?: number }

/**
 * pdf-lib's standard fonts are WinAnsi-encoded. Notes written by a mechanical
 * engineering student frequently contain °, ×, Δ, −, curly quotes, so map the
 * common ones instead of letting drawText throw and abort the whole export.
 */
function sanitize(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00B0/g, ' deg ')
    .replace(/\u00D7/g, 'x')
    .replace(/\u0394/g, 'Delta')
    .replace(/\u03C0/g, 'pi')
    .replace(/\u03C3/g, 'sigma')
    .replace(/\u03B8/g, 'theta')
    .replace(/\u2212/g, '-')
    .replace(/[^\x00-\xFF]/g, '?');
}

function wrapLines(
  text: string, font: { widthOfTextAtSize(t: string, s: number): number }, size: number, maxWidth: number
): string[] {
  const out: string[] = [];
  for (const paragraph of sanitize(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
        line = candidate;
      } else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

export async function exportAnnotatedPdf(opts: ExportOptions): Promise<{
  outPath: string; pages: number; highlights: number; inkStrokes: number; noteMarkers: number;
}> {
  const doc = get<{ id: number; path: string; filename: string; page_count: number }>(
    'SELECT id, path, filename, page_count FROM documents WHERE id = ?', opts.documentId
  );
  if (!doc) throw new Error('Document not found');
  if (!existsSync(doc.path)) throw new Error(`Source PDF is missing: ${doc.path}`);
  if (existsSync(opts.outPath) && opts.outPath === doc.path) {
    throw new Error('Refusing to overwrite the original PDF. Choose a different output file.');
  }
  if (extname(opts.outPath).toLowerCase() !== '.pdf') {
    throw new Error('Output file must have a .pdf extension');
  }

  const bytes = await readFile(doc.path);
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = pdf.getPageCount();

  const wanted = opts.pages === 'all' || !opts.pages ? null : new Set(opts.pages);

  const anns = all<any>(
    'SELECT * FROM annotations WHERE document_id = ? ORDER BY page, id', doc.id
  );
  const notes = all<any>(
    'SELECT * FROM sticky_notes WHERE document_id = ? ORDER BY page, id', doc.id
  );

  let highlights = 0;
  let inkStrokes = 0;
  let noteMarkers = 0;

  const bodyFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

  for (const a of anns) {
    if (wanted && !wanted.has(a.page)) continue;
    if (a.page < 1 || a.page > total) continue;
    const page = pdf.getPage(a.page - 1);
    const { width, height } = page.getSize();
    const [r, g, b] = toRgb(a.color || 'yellow');

    if (a.type === 'ink') {
      if (!opts.includeInk || !a.data_json) continue;
      let parsed: { strokes?: Stroke[] } = {};
      try { parsed = JSON.parse(a.data_json); } catch { continue; }
      for (const s of parsed.strokes ?? []) {
        if (!s.points || s.points.length < 2) continue;
        const [sr, sg, sb] = toRgb(s.color || a.color || 'red');
        const w = Math.max(0.5, (s.width || 2) * (width / 1000));
        for (let i = 1; i < s.points.length; i++) {
          const p0 = s.points[i - 1];
          const p1 = s.points[i];
          page.drawLine({
            start: { x: p0.x * width, y: height - p0.y * height },
            end: { x: p1.x * width, y: height - p1.y * height },
            thickness: w,
            color: rgb(sr, sg, sb),
            opacity: s.opacity ?? 0.95,
          });
        }
        inkStrokes++;
      }
      continue;
    }

    // Text written directly on the page ("Write on PDF").
    if (a.type === 'textbox') {
      if (!opts.includeHighlights || !a.text) continue;
      if (a.x === null || a.y === null) continue;
      const size = Math.max(6, (a.font_size || 14) * (width / 595.28));
      const boxW = Math.max(20, (a.w ?? 0.3) * width);
      const [tr, tg, tb] = toRgb(a.color || '#111827');
      let ly = height - a.y * height - size;
      for (const line of wrapLines(a.text, bodyFont, size, boxW)) {
        if (ly < 2) break;
        page.drawText(line, {
          x: a.x * width, y: ly, size, font: bodyFont, color: rgb(tr, tg, tb),
        });
        ly -= size * 1.25;
      }
      highlights++;
      continue;
    }

    // Rectangular annotations: highlight / underline / strikethrough
    if (!opts.includeHighlights) continue;
    if (a.x === null || a.y === null || a.w === null || a.h === null) continue;

    const x = a.x * width;
    const w = a.w * width;
    const h = a.h * height;
    const topY = height - a.y * height;

    if (a.type === 'underline') {
      page.drawRectangle({
        x, y: topY - 1.2, width: w, height: 1.2,
        color: rgb(r, g, b), opacity: 0.9,
      });
    } else if (a.type === 'strikethrough') {
      page.drawRectangle({
        x, y: topY - h / 2, width: w, height: 1.2,
        color: rgb(r, g, b), opacity: 0.9,
      });
    } else {
      // Highlight: translucent fill so handwriting stays readable underneath.
      page.drawRectangle({
        x, y: topY - h, width: w, height: h,
        color: rgb(r, g, b), opacity: 0.32,
      });
    }
    highlights++;
  }

  if (opts.includeNoteMarkers) {
    let n = 0;
    for (const note of notes) {
      n++;
      if (!note.page || note.page < 1 || note.page > total) continue;
      if (wanted && !wanted.has(note.page)) continue;
      const page = pdf.getPage(note.page - 1);
      const { width, height } = page.getSize();

      const bx = clamp01(note.x ?? 0.04) * width;
      const by = clamp01(note.y ?? 0.04) * height;
      const bw = Math.max(24, clamp01(note.w ?? 0.3) * width);
      const bh = Math.max(20, clamp01(note.h ?? 0.16) * height);
      const top = height - by;
      const [r, g, b] = toRgb(note.color || 'yellow');

      // Draw the note itself (rectangular, coloured) so the exported copy
      // matches what is visible in the reader.
      page.drawRectangle({
        x: bx, y: top - bh, width: bw, height: bh,
        color: rgb(r, g, b), opacity: 0.92,
        borderColor: rgb(0.25, 0.25, 0.25), borderWidth: 0.7,
      });

      const size = Math.max(5.5, Math.min(10, bh / 11));
      const lines = wrapLines(note.body ?? '', bodyFont, size, Math.max(12, bw - 10));
      let ly = top - size - 3;
      for (const line of lines) {
        if (ly < top - bh + 3) break;
        page.drawText(line, { x: bx + 4, y: ly, size, font: bodyFont, color: rgb(0.1, 0.1, 0.1) });
        ly -= size * 1.3;
      }

      page.drawText(String(n), {
        x: bx + bw - size - 3, y: top - size - 1,
        size: Math.max(6.5, size), font: boldFont, color: rgb(0.2, 0.2, 0.2),
      });
      noteMarkers++;
    }
  }

  if (opts.includeNoteSummary && notes.length) {
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const pageW = 595.28, pageH = 841.89, margin = 48;
    let page = pdf.addPage([pageW, pageH]);
    let y = pageH - margin;

    const write = (text: string, size: number, useBold = false) => {
      const f = useBold ? bold : font;
      const maxChars = Math.floor((pageW - margin * 2) / (size * 0.5));
      const lines: string[] = [];
      for (const raw of sanitize(text).split('\n')) {
        let line = raw;
        while (line.length > maxChars) {
          let cut = line.lastIndexOf(' ', maxChars);
          if (cut <= 0) cut = maxChars;
          lines.push(line.slice(0, cut));
          line = line.slice(cut).trimStart();
        }
        lines.push(line);
      }
      for (const line of lines) {
        if (y < margin + size) { page = pdf.addPage([pageW, pageH]); y = pageH - margin; }
        page.drawText(line || ' ', { x: margin, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
        y -= size * 1.4;
      }
    };

    write(`Notes — ${doc.filename}`, 15, true);
    y -= 6;
    notes.forEach((note, i) => {
      write(
        `[${i + 1}] Page ${note.page ?? '—'}${note.title ? ' · ' + note.title : ''}`,
        10, true
      );
      write(note.body || '(empty)', 10);
      y -= 4;
    });
  }

  await mkdir(dirname(opts.outPath), { recursive: true });
  const out = await pdf.save();
  await writeFile(opts.outPath, out);

  return { outPath: opts.outPath, pages: pdf.getPageCount(), highlights, inkStrokes, noteMarkers };
}

/* ---------------- notes export ---------------- */

export async function exportNotesMarkdown(outPath: string): Promise<{ outPath: string; notes: number }> {
  const notes = all<any>(`
    SELECT n.*, d.filename FROM sticky_notes n
    LEFT JOIN documents d ON d.id = n.document_id
    ORDER BY n.updated_at DESC`);
  const notebook = all<any>('SELECT * FROM notebook_entries ORDER BY updated_at DESC');

  const lines: string[] = ['# MECHSTUDY OS — Personal Notes', '', `Exported: ${new Date().toISOString()}`, ''];

  lines.push('## Sticky notes', '');
  if (!notes.length) lines.push('_No sticky notes._', '');
  notes.forEach((n, i) => {
    lines.push(`### ${i + 1}. ${n.title || 'Untitled note'}`);
    lines.push('');
    if (n.filename) lines.push(`- Source: \`${n.filename}\`${n.page ? `, page ${n.page}` : ''}`);
    if (n.subject_name) lines.push(`- Subject: ${n.subject_name}`);
    lines.push(`- Created: ${n.created_at}`);
    lines.push('');
    lines.push(n.body || '_(empty)_');
    lines.push('');
  });

  lines.push('## Notebook', '');
  if (!notebook.length) lines.push('_No notebook entries._', '');
  notebook.forEach(e => {
    lines.push(`### ${e.title}`);
    lines.push('');
    lines.push(`- Scope: ${e.scope_type}${e.scope_id ? ` #${e.scope_id}` : ''}`);
    lines.push(`- Updated: ${e.updated_at}`);
    lines.push('');
    lines.push(e.body_md || '_(empty)_');
    lines.push('');
  });

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, lines.join('\n'), 'utf8');
  return { outPath, notes: notes.length + notebook.length };
}

/* ---------------- page-level PDF operations ---------------- */

export interface PageOpOptions {
  documentId: number;
  outPath: string;
  rotate?: { pages: number[]; degrees: 90 | 180 | 270 };
  deletePages?: number[];
  extractPages?: number[];
}

/**
 * Page-level operations (rotate / delete / extract) always produce a NEW file.
 * These are deliberately limited to what can be done losslessly with pdf-lib:
 * scanned handwriting is never re-flowed or "edited" as text.
 */
export async function pageOperations(opts: PageOpOptions): Promise<{ outPath: string; pages: number }> {
  const doc = get<{ path: string }>('SELECT path FROM documents WHERE id = ?', opts.documentId);
  if (!doc) throw new Error('Document not found');
  if (!existsSync(doc.path)) throw new Error(`Source PDF is missing: ${doc.path}`);
  if (opts.outPath === doc.path) throw new Error('Refusing to overwrite the original PDF.');
  if (extname(opts.outPath).toLowerCase() !== '.pdf') throw new Error('Output file must end with .pdf');

  const src = await PDFDocument.load(await readFile(doc.path), { ignoreEncryption: true });
  let out: PDFDocument;

  if (opts.extractPages?.length) {
    out = await PDFDocument.create();
    const idx = opts.extractPages
      .filter(p => p >= 1 && p <= src.getPageCount())
      .map(p => p - 1);
    const copied = await out.copyPages(src, idx);
    copied.forEach(p => out.addPage(p));
  } else {
    out = src;
    if (opts.rotate) {
      for (const p of opts.rotate.pages) {
        if (p < 1 || p > out.getPageCount()) continue;
        const page = out.getPage(p - 1);
        page.setRotation(degrees((page.getRotation().angle + opts.rotate.degrees) % 360));
      }
    }
    if (opts.deletePages?.length) {
      const doomed = new Set(opts.deletePages);
      if (doomed.size >= out.getPageCount()) throw new Error('Cannot delete every page of the document.');
      for (let i = out.getPageCount(); i >= 1; i--) {
        if (doomed.has(i)) out.removePage(i - 1);
      }
    }
  }

  await mkdir(dirname(opts.outPath), { recursive: true });
  await writeFile(opts.outPath, await out.save());
  return { outPath: opts.outPath, pages: out.getPageCount() };
}

export function defaultExportPath(sourcePath: string, suffix = 'annotated'): string {
  const base = basename(sourcePath, extname(sourcePath));
  return join(dirname(sourcePath), `${base}.${suffix}.pdf`);
}

/**
 * Export generated RTU Question Paper as an authentic, clean university exam PDF.
 */
export async function exportRtuPaperToPdf(paperData: any, savePath: string): Promise<string> {
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const title = paperData.title || 'RTU Examination Paper';
  const totalMarks = paperData.totalMarks || 100;
  const duration = paperData.durationMinutes || 180;
  const hours = Math.round(duration / 60 * 10) / 10;
  const sections = paperData.sections || [];

  let page = doc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const margin = 48;
  const contentWidth = width - margin * 2;
  let y = height - 50;

  const ensureSpace = (needed: number) => {
    if (y - needed < 50) {
      page = doc.addPage([595.28, 841.89]);
      y = height - 50;
    }
  };

  // Header
  page.drawText('RAJASTHAN TECHNICAL UNIVERSITY, KOTA', {
    x: margin + (contentWidth - fontBold.widthOfTextAtSize('RAJASTHAN TECHNICAL UNIVERSITY, KOTA', 13)) / 2,
    y,
    size: 13,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  y -= 18;

  page.drawText(sanitize(title), {
    x: margin + (contentWidth - fontBold.widthOfTextAtSize(sanitize(title), 11)) / 2,
    y,
    size: 11,
    font: fontBold,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 16;

  // Time & Marks line
  const timeText = `Time: ${hours} Hours`;
  const marksText = `Maximum Marks: ${totalMarks}`;
  page.drawText(timeText, { x: margin, y, size: 9.5, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
  page.drawText(marksText, {
    x: width - margin - fontRegular.widthOfTextAtSize(marksText, 9.5),
    y,
    size: 9.5,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 10;

  // Divider line
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: rgb(0.3, 0.3, 0.3),
  });
  y -= 14;

  // University instructions
  const instructions = [
    'Instructions to Candidates:',
    '1. Attempt all questions from Part A. In Part B, attempt any 4 questions out of 6. In Part C, attempt any 2 questions out of 3.',
    '2. Assume missing data suitably, if any, and state the same clearly.',
    '3. Draw neat sketches and free-body diagrams wherever applicable.',
  ];

  for (const line of instructions) {
    const wrapped = wrapLines(sanitize(line), fontRegular, 8.5, contentWidth);
    for (const w of wrapped) {
      page.drawText(w, { x: margin, y, size: 8.5, font: fontRegular, color: rgb(0.35, 0.35, 0.35) });
      y -= 11;
    }
  }
  y -= 6;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });
  y -= 16;

  // Sections
  for (const sec of sections) {
    ensureSpace(35);
    const secTitle = `${sec.name || 'Section'} — ${sec.description || ''}`;
    page.drawText(sanitize(secTitle), {
      x: margin,
      y,
      size: 10.5,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 14;

    const questions = sec.questions || [];
    for (const q of questions) {
      ensureSpace(40);
      const qNum = `${q.number || ''}. `;
      const qMarks = `[${q.marks || 2} Marks]`;
      const numWidth = fontBold.widthOfTextAtSize(qNum, 9.5);
      const marksWidth = fontRegular.widthOfTextAtSize(qMarks, 9);
      const textWidth = contentWidth - numWidth - marksWidth - 10;

      page.drawText(qNum, { x: margin, y, size: 9.5, font: fontBold, color: rgb(0.15, 0.15, 0.15) });
      page.drawText(qMarks, {
        x: width - margin - marksWidth,
        y,
        size: 9,
        font: fontRegular,
        color: rgb(0.3, 0.3, 0.3),
      });

      const qText = sanitize(q.text || '');
      const wrapped = wrapLines(qText, fontRegular, 9.5, textWidth);

      for (let i = 0; i < wrapped.length; i++) {
        if (i > 0) ensureSpace(14);
        page.drawText(wrapped[i], {
          x: margin + numWidth,
          y,
          size: 9.5,
          font: fontRegular,
          color: rgb(0.2, 0.2, 0.2),
        });
        y -= 13;
      }
      y -= 6;
    }
    y -= 10;
  }

  // Draw page numbering on all pages
  const totalPages = doc.getPageCount();
  for (let i = 0; i < totalPages; i++) {
    const p = doc.getPage(i);
    const footerText = `Page ${i + 1} of ${totalPages} · Generated by MECHSTUDY OS`;
    p.drawText(footerText, {
      x: margin + (contentWidth - fontRegular.widthOfTextAtSize(footerText, 8)) / 2,
      y: 25,
      size: 8,
      font: fontRegular,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  await mkdir(dirname(savePath), { recursive: true });
  await writeFile(savePath, await doc.save());
  return savePath;
}

/**
 * 1-Click "Exam-Eve Formula & Mistake Cheat-Sheet" PDF Generator.
 * Combines high-yield formulas, recent mistake pitfalls, and high-weightage topics.
 */
export async function compileCheatSheetPdf(opts: {
  title?: string;
  examTrack: 'RTU' | 'GATE';
  formulas?: Array<{ title: string; topic: string; latex: string; conditions?: string }>;
  outPath: string;
}): Promise<{ outPath: string; pages: number; formulaCount: number; mistakeCount: number }> {
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  let page = doc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const margin = 36;
  const contentWidth = width - margin * 2;
  let y = height - margin;

  const ensureSpace = (needed: number) => {
    if (y - needed < margin + 30) {
      page = doc.addPage([595.28, 841.89]);
      y = height - margin;
    }
  };

  // Header Banner
  page.drawRectangle({
    x: margin,
    y: y - 48,
    width: contentWidth,
    height: 48,
    color: rgb(0.08, 0.12, 0.22),
  });

  const headerTitle = opts.title || (opts.examTrack === 'GATE' ? 'GATE Mechanical Exam-Eve Rapid Revision' : 'RTU Kota B.Tech Exam-Eve Rapid Revision');
  page.drawText(sanitize(headerTitle), {
    x: margin + 14,
    y: y - 22,
    size: 13,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  const subtitle = `Generated on ${new Date().toLocaleDateString()} · Formula Vault + Mistake Traps + High-Yield Concepts · MECHSTUDY OS`;
  page.drawText(sanitize(subtitle), {
    x: margin + 14,
    y: y - 38,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.7, 0.8, 1),
  });

  y -= 62;

  // 1. High-Yield Formulas Section
  const formulas = opts.formulas || [];
  let formulaCount = 0;
  if (formulas.length > 0) {
    page.drawText('PART I: HIGH-YIELD FORMULAS & GOVERNING EQUATIONS', {
      x: margin,
      y,
      size: 10,
      font: fontBold,
      color: rgb(0.12, 0.35, 0.75),
    });
    y -= 14;

    for (const f of formulas) {
      ensureSpace(42);
      formulaCount++;

      page.drawRectangle({
        x: margin,
        y: y - 32,
        width: contentWidth,
        height: 32,
        color: rgb(0.96, 0.97, 0.99),
        borderColor: rgb(0.85, 0.88, 0.94),
        borderWidth: 0.5,
      });

      page.drawText(sanitize(`${f.title} (${f.topic})`), {
        x: margin + 8,
        y: y - 11,
        size: 8.5,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1),
      });

      page.drawText(sanitize(`Equation: ${f.latex}`), {
        x: margin + 8,
        y: y - 24,
        size: 8,
        font: fontOblique,
        color: rgb(0.15, 0.45, 0.2),
      });

      if (f.conditions) {
        const condText = sanitize(`Notes: ${f.conditions}`);
        const cWidth = fontRegular.widthOfTextAtSize(condText, 7);
        if (cWidth < contentWidth - 16) {
          page.drawText(condText, {
            x: width - margin - cWidth - 8,
            y: y - 24,
            size: 7,
            font: fontRegular,
            color: rgb(0.45, 0.45, 0.45),
          });
        }
      }

      y -= 38;
    }
    y -= 10;
  }

  // 2. Mistake Notebook Section
  let mistakeCount = 0;
  const mistakes = all<any>(
    `SELECT * FROM gate_mistakes ORDER BY id DESC LIMIT 12`
  );

  if (mistakes.length > 0) {
    ensureSpace(35);
    page.drawText('PART II: NEGATIVE-MARK TRAPS & COMMON MISTAKES NOTEBOOK', {
      x: margin,
      y,
      size: 10,
      font: fontBold,
      color: rgb(0.8, 0.2, 0.2),
    });
    y -= 14;

    for (const m of mistakes) {
      ensureSpace(50);
      mistakeCount++;

      const qHeader = sanitize(`[${m.subject_name || 'GATE'}] Question Pitfall #${m.id}`);
      page.drawText(qHeader, {
        x: margin,
        y,
        size: 8.5,
        font: fontBold,
        color: rgb(0.75, 0.15, 0.15),
      });
      y -= 11;

      const qSnippet = sanitize(`Problem: ${m.question_text.slice(0, 180)}...`);
      const wrappedQ = wrapLines(qSnippet, fontRegular, 7.5, contentWidth);
      for (const line of wrappedQ.slice(0, 2)) {
        page.drawText(line, { x: margin + 8, y, size: 7.5, font: fontRegular, color: rgb(0.25, 0.25, 0.25) });
        y -= 10;
      }

      if (m.solution_text) {
        const solSnippet = sanitize(`Trap / Correct Method: ${m.solution_text.slice(0, 150)}...`);
        const wrappedSol = wrapLines(solSnippet, fontBold, 7.5, contentWidth);
        for (const line of wrappedSol.slice(0, 2)) {
          page.drawText(line, { x: margin + 8, y, size: 7.5, font: fontBold, color: rgb(0.1, 0.45, 0.2) });
          y -= 10;
        }
      }

      y -= 6;
    }
  }

  // Draw Page Footers
  const totalPages = doc.getPageCount();
  for (let i = 0; i < totalPages; i++) {
    const p = doc.getPage(i);
    const footer = `Page ${i + 1} of ${totalPages} · MECHSTUDY OS — Last-Day Rapid Revision Companion`;
    p.drawText(footer, {
      x: margin + (contentWidth - fontRegular.widthOfTextAtSize(footer, 7.5)) / 2,
      y: 20,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  await mkdir(dirname(opts.outPath), { recursive: true });
  await writeFile(opts.outPath, await doc.save());
  return { outPath: opts.outPath, pages: totalPages, formulaCount, mistakeCount };
}

/**
 * 2-Column A4 Print-Ready Pocket Revision Booklet Generator.
 * Compiles syllabus topics, high-yield formulas, and error pitfalls into an A4 printable leaflet.
 */
export async function compilePocketBookletPdf(opts: {
  title?: string;
  examTrack: 'RTU' | 'GATE';
  semester?: number;
  subjectName?: string;
  outPath: string;
}): Promise<{ outPath: string; pages: number; itemsCount: number }> {
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([595.28, 841.89]); // A4 Portrait
  const { width, height } = page.getSize();
  const margin = 28;
  const colGap = 16;
  const colWidth = (width - margin * 2 - colGap) / 2;
  let colIndex = 0; // 0: left column, 1: right column
  let y = height - margin - 40;

  // Header banner on first page
  const title = opts.title || `${opts.examTrack === 'RTU' ? 'RTU Kota B.Tech' : 'GATE Mechanical'} Pocket Revision Booklet`;
  page.drawRectangle({
    x: margin,
    y: height - margin - 32,
    width: width - margin * 2,
    height: 32,
    color: rgb(0.08, 0.12, 0.22),
  });
  page.drawText(sanitize(title), {
    x: margin + 10,
    y: height - margin - 18,
    size: 11,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText(sanitize('A4 Print-Ready Foldable Booklet · 2-Column Ink-Saving Layout · MECHSTUDY OS'), {
    x: margin + 10,
    y: height - margin - 28,
    size: 6.5,
    font: fontRegular,
    color: rgb(0.7, 0.8, 1),
  });

  const nextColumn = () => {
    if (colIndex === 0) {
      colIndex = 1;
      y = height - margin - (doc.getPageCount() === 1 ? 40 : 10);
    } else {
      page = doc.addPage([595.28, 841.89]);
      colIndex = 0;
      y = height - margin - 10;
    }
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < margin + 20) {
      nextColumn();
    }
  };

  // Fetch topics from database
  let sql = `
    SELECT t.title as topic_title, u.title as unit_title, u.number as unit_number, s.name as subject_name
    FROM topics t
    JOIN units u ON u.id = t.unit_id
    JOIN subjects s ON s.id = u.subject_id
    JOIN syllabus_versions sv ON sv.id = s.syllabus_version_id
    WHERE sv.exam_type = ?
      AND s.name NOT LIKE '%Technical Communication%'
  `;
  const params: any[] = [opts.examTrack];
  if (opts.semester && opts.semester > 0) {
    sql += ' AND s.semester = ?';
    params.push(opts.semester);
  }
  if (opts.subjectName && opts.subjectName !== 'All Subjects') {
    sql += ' AND s.name = ?';
    params.push(opts.subjectName);
  }
  sql += ' ORDER BY s.semester ASC, u.number ASC, t.sort_order ASC LIMIT 120';

  const topics = all<any>(sql, ...params);
  let itemsCount = 0;

  let lastSubject = '';
  let lastUnit = -1;

  for (const t of topics) {
    if (t.subject_name !== lastSubject) {
      lastSubject = t.subject_name;
      lastUnit = -1;
      ensureSpace(28);
      const colX = margin + colIndex * (colWidth + colGap);
      page.drawRectangle({
        x: colX,
        y: y - 16,
        width: colWidth,
        height: 16,
        color: rgb(0.2, 0.35, 0.6),
      });
      page.drawText(sanitize(t.subject_name.toUpperCase()), {
        x: colX + 6,
        y: y - 12,
        size: 7.5,
        font: fontBold,
        color: rgb(1, 1, 1),
      });
      y -= 22;
    }

    if (t.unit_number !== lastUnit) {
      lastUnit = t.unit_number;
      ensureSpace(18);
      const colX = margin + colIndex * (colWidth + colGap);
      page.drawText(sanitize(`UNIT ${t.unit_number}: ${t.unit_title}`), {
        x: colX,
        y: y - 10,
        size: 7,
        font: fontBold,
        color: rgb(0.1, 0.45, 0.2),
      });
      y -= 14;
    }

    ensureSpace(18);
    const colX = margin + colIndex * (colWidth + colGap);
    itemsCount++;

    // Draw check box
    page.drawRectangle({
      x: colX,
      y: y - 8,
      width: 6,
      height: 6,
      borderColor: rgb(0.5, 0.5, 0.5),
      borderWidth: 0.5,
    });

    const topicLines = wrapLines(sanitize(t.topic_title), fontRegular, 6.5, colWidth - 12);
    let lineY = y - 8;
    for (const l of topicLines.slice(0, 2)) {
      page.drawText(l, {
        x: colX + 10,
        y: lineY,
        size: 6.5,
        font: fontRegular,
        color: rgb(0.15, 0.15, 0.15),
      });
      lineY -= 8;
    }
    y -= topicLines.slice(0, 2).length * 8 + 3;
  }

  // Draw Page Footers & Center Fold Guide
  const totalPages = doc.getPageCount();
  for (let i = 0; i < totalPages; i++) {
    const p = doc.getPage(i);
    // Draw subtle vertical folding line guide in the middle
    p.drawLine({
      start: { x: width / 2, y: margin },
      end: { x: width / 2, y: height - margin },
      color: rgb(0.85, 0.85, 0.85),
      dashArray: [3, 4],
      thickness: 0.5,
    });

    const footer = `Page ${i + 1} of ${totalPages} · Fold along center dashed line for pocket booklet · MECHSTUDY OS`;
    p.drawText(footer, {
      x: margin + (width - margin * 2 - fontRegular.widthOfTextAtSize(footer, 6.5)) / 2,
      y: 12,
      size: 6.5,
      font: fontRegular,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  await mkdir(dirname(opts.outPath), { recursive: true });
  await writeFile(opts.outPath, await doc.save());
  return { outPath: opts.outPath, pages: totalPages, itemsCount };
}


