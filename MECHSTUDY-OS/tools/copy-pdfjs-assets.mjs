/**
 * Copies pdf.js runtime assets into the renderer's `public/pdfjs/` folder.
 *
 * pdf.js needs four data directories at runtime:
 *   - standard_fonts/  the 14 base PDF fonts, so PDFs that do not embed a font
 *                      still render with the correct glyph widths and shapes.
 *   - cmaps/           character maps for CJK and other non-Latin encodings.
 *   - wasm/            JBIG2 / OpenJPEG / qcms decoders used for scanned pages.
 *   - iccs/            ICC colour profiles for accurate image colour.
 *
 * Without them pdf.js logs "Ensure that the standardFontDataUrl API parameter
 * is provided" and silently substitutes fonts, which changes line breaks and
 * can drop symbols; missing wasm makes JBIG2/JPX scans fail to decode.
 *
 * The files are copied from node_modules on demand, so they are never committed
 * to git (see .gitignore) and never drift from the installed pdfjs-dist version.
 *
 * Usage: node tools/copy-pdfjs-assets.mjs
 */
import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = join(root, 'node_modules', 'pdfjs-dist');
const dest = join(root, 'src', 'renderer', 'public', 'pdfjs');

const DIRS = ['standard_fonts', 'cmaps', 'wasm', 'iccs'];

async function newestMtime(dir) {
  let newest = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const info = await stat(full);
    if (info.isDirectory()) newest = Math.max(newest, await newestMtime(full));
    else newest = Math.max(newest, info.mtimeMs);
  }
  return newest;
}

async function main() {
  if (!existsSync(src)) {
    console.error(`pdfjs-dist is not installed at ${src}`);
    process.exit(1);
  }

  await mkdir(dest, { recursive: true });

  for (const name of DIRS) {
    const from = join(src, name);
    const to = join(dest, name);
    if (!existsSync(from)) {
      console.error(`Missing ${from} — pdfjs-dist layout changed?`);
      process.exit(1);
    }

    // Skip the copy when the destination is already at least as new.
    if (existsSync(to)) {
      const [srcTime, destTime] = await Promise.all([newestMtime(from), newestMtime(to)]);
      if (destTime >= srcTime) {
        console.log(`pdfjs ${name}: up to date`);
        continue;
      }
    }

    await cp(from, to, { recursive: true });
    console.log(`pdfjs ${name}: copied -> ${to}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
