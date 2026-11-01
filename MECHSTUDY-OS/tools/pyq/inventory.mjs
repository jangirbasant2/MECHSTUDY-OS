// Inventory every PDF in "Gate paper and answer key": page count, text-layer
// coverage and the first lines of page 1, so the importer can be planned from
// real data instead of assumptions.
import { readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const SRC = join(ROOT, '..', 'Gate paper and answer key');
const FONT_DIR = join(ROOT, 'out', 'renderer', 'pdfjs', 'standard_fonts').replace(/\\/g, '/') + '/';

const lib = await import('pdfjs-dist/legacy/build/pdf.mjs');

const files = (await readdir(SRC)).filter(f => f.toLowerCase().endsWith('.pdf')).sort();

for (const f of files) {
  const path = join(SRC, f);
  const size = (await stat(path)).size;
  let doc;
  try {
    doc = await lib.getDocument({
      data: new Uint8Array(await (await import('node:fs/promises')).readFile(path)),
      useSystemFonts: false,
      isEvalSupported: false,
      disableFontFace: true,
      standardFontDataUrl: FONT_DIR,
    }).promise;
  } catch (e) {
    console.log(JSON.stringify({ file: f, mb: +(size / 1048576).toFixed(2), error: String(e.message || e) }));
    continue;
  }
  const n = doc.numPages;
  const sample = n <= 4 ? [...Array(n)].map((_, i) => i + 1) : [1, 2, Math.ceil(n / 2), n];
  let chars = 0;
  let head = '';
  for (const p of sample) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const text = tc.items.map(i => ('str' in i ? i.str : '')).join(' ');
    chars += text.trim().length;
    if (!head) head = text.replace(/\s+/g, ' ').trim().slice(0, 150);
  }
  console.log(JSON.stringify({
    file: f,
    mb: +(size / 1048576).toFixed(2),
    pages: n,
    avgCharsPerPage: Math.round(chars / sample.length),
    head,
  }));
  await doc.destroy();
}
