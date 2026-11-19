import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

let pdfjsPromise: Promise<any> | null = null;
function pdfjs(): Promise<any> {
  if (!pdfjsPromise) pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
}

/**
 * Standard font data for text extraction.
 *
 * PDFs that do not embed their fonts (the RTU syllabus PDF is one of them) make
 * pdf.js load the 14 base fonts to measure glyph widths. Without this parameter
 * it logs `Ensure that the 'standardFontDataUrl' API parameter is provided` on
 * every such font and falls back to approximate widths, which merges or splits
 * words in the extracted text.
 *
 * tools/copy-pdfjs-assets.mjs puts the files in out/renderer/pdfjs/, which is
 * next to out/main both in development and inside the packaged asar, so this one
 * relative path is correct in both. pdf.js's Node factory reads it with
 * fs.readFile, which Electron resolves inside asar transparently.
 *
 * pdf.js validates the value with `endsWith("/")`, so the separator must be a
 * forward slash even on Windows; fs.readFile accepts forward slashes there.
 */
const STANDARD_FONT_DATA_URL =
  join(__dirname, '..', 'renderer', 'pdfjs', 'standard_fonts').replace(/\\/g, '/') + '/';

const WATERMARK = /(gat\s*e?\s*notes|www\.|gatenotes|for more visit|made\s*easy)/i;

export function stripNoise(text: string): string {
  return text
    .split('\n')
    .map(l => {
      let line = l.trim();
      line = line.replace(/(?:https?:\/\/|www\.)\S+/gi, '');
      line = line.replace(/\b(?:gate\s*notes|gatenotes|for more visit|made\s*easy(?:\s*handwritten\s*class\s*notes)?)\b/gi, '');
      return line.trim();
    })
    .filter(l => l.length > 0 && !/^[\s.WW0-9-]+$/.test(l))
    .join('\n')
    .trim();
}

async function openDoc(path: string) {
  const buf = await readFile(path);
  const lib = await pdfjs();
  const doc = await lib.getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: false,
    isEvalSupported: false,
    disableFontFace: true,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
  }).promise;
  return doc;
}

/**
 * Raw text of one page (1-based), exactly as the text layer stores it.
 *
 * `stripNoise` drops whole lines that look like watermarks, which is right for
 * search indexing but wrong for question papers: a page of a real GATE paper
 * can legitimately contain "www." or a study-site watermark, and dropping the
 * page would silently lose questions. The PYQ importer uses this and does its
 * own, much narrower, header/footer removal.
 */
export async function pageTextRaw(doc: any, page: number): Promise<string> {
  const p = await doc.getPage(page);
  const tc = await p.getTextContent();
  return tc.items.map((i: any) => ('str' in i ? i.str : '')).join(' ');
}

/** Extract text of one page (1-based), with watermark noise removed and line layout preserved. */
export async function pageText(doc: any, page: number): Promise<string> {
  const p = await doc.getPage(page);
  const tc = await p.getTextContent();
  let lastY: number | null = null;
  let text = '';
  for (const item of tc.items) {
    if (!('str' in item)) continue;
    const y = item.transform ? item.transform[5] : null;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 3) {
      text += '\n';
    } else if (text.length > 0 && !text.endsWith('\n') && !text.endsWith(' ')) {
      text += ' ';
    }
    text += item.str;
    if (item.hasEOL) text += '\n';
    lastY = y;
  }
  return stripNoise(text);
}

/** Open a PDF with the same pdf.js settings the rest of the app uses. */
export async function openPdf(path: string): Promise<any> {
  return openDoc(path);
}

export async function closePdf(doc: any): Promise<void> {
  try { await doc?.destroy(); } catch { /* ignore */ }
}

/** Number of pages in an already-open document. */
export function pageCount(doc: any): number {
  return doc?.numPages ?? 0;
}

/**
 * Inspect a PDF: page count + whether it has selectable text.
 */
export async function inspectPdf(path: string): Promise<{
  pageCount: number; hasTextLayer: boolean; textChars: number; error?: string;
}> {
  if (!existsSync(path)) return { pageCount: 0, hasTextLayer: false, textChars: 0, error: 'File not found' };
  try {
    const doc = await openDoc(path);
    const n = doc.numPages;
    const sample = new Set<number>();
    if (n <= 6) { for (let i = 1; i <= n; i++) sample.add(i); }
    else { for (const i of [1, 2, Math.ceil(n / 2), Math.max(1, n - 1), n]) sample.add(i); }

    let total = 0;
    for (const p of sample) total += (await pageText(doc, p)).length;
    const avg = total / Math.max(1, sample.size);

    const hasTextLayer = total > 0;
    return { pageCount: n, hasTextLayer, textChars: Math.round(avg * n) };
  } catch (e) {
    return { pageCount: 0, hasTextLayer: false, textChars: 0, error: (e as Error).message };
  }
}

/** Extract text for a set of pages (or all). Returns page -> text. */
export async function extractPages(
  path: string,
  pages: number[] | 'all',
  onProgress?: (done: number, total: number) => void
): Promise<{ page: number; text: string }[]> {
  const doc = await openDoc(path);
  const list = pages === 'all' ? Array.from({ length: doc.numPages }, (_, i) => i + 1) : pages;
  const out: { page: number; text: string }[] = [];
  for (let i = 0; i < list.length; i++) {
    out.push({ page: list[i], text: await pageText(doc, list[i]) });
    onProgress?.(i + 1, list.length);
  }
  return out;
}
