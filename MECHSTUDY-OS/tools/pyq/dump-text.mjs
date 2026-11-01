// Dump the full text layer of every PDF in "Gate paper and answer key" plus its
// PDF metadata, so the parser can be written against real content.
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const SRC = join(ROOT, '..', 'Gate paper and answer key');
const OUT = join(process.env.TEMP || '/tmp', 'pyq-text');
const FONT_DIR = join(ROOT, 'out', 'renderer', 'pdfjs', 'standard_fonts').replace(/\\/g, '/') + '/';
const lib = await import('pdfjs-dist/legacy/build/pdf.mjs');

await mkdir(OUT, { recursive: true });
const files = (await readdir(SRC)).filter(f => f.toLowerCase().endsWith('.pdf')).sort();

for (const f of files) {
  const bytes = await readFile(join(SRC, f));
  const sha = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  let doc;
  try {
    doc = await lib.getDocument({
      data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false,
      disableFontFace: true, standardFontDataUrl: FONT_DIR,
    }).promise;
  } catch (e) {
    console.log(`${f}\tSHA ${sha}\tERROR ${e.message}`);
    continue;
  }
  const meta = await doc.getMetadata().catch(() => null);
  const info = meta?.info || {};
  let text = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const pageText = tc.items.map(i => ('str' in i ? i.str : '')).join(' ');
    text += `\n=== PAGE ${p} ===\n${pageText}`;
  }
  const out = join(OUT, f.replace(/\.pdf$/i, '.txt'));
  await writeFile(out, text, 'utf8');
  console.log(`${f}\tSHA ${sha}\t${doc.numPages}p\t${text.length} chars\tTitle="${info.Title || ''}"\tCreator="${info.Creator || ''}"\tCreated="${info.CreationDate || ''}"`);
  await doc.destroy();
}
console.log(`\nText dumped to ${OUT}`);
