/**
 * What is in "Gate paper and answer key", as established by inspecting the
 * real files (SHA-256, page count, text-layer coverage and PDF metadata — see
 * tools/pyq/inventory.mjs and tools/pyq/dump-text.mjs).
 *
 * The folder is the user's, not the app's: nothing here is copied into the
 * database except the question text and the provenance of each answer. The
 * PDFs themselves are never modified.
 *
 * Every file is listed, including the ones that cannot be imported, with the
 * reason. The Import screen shows this list verbatim, so "6 papers imported,
 * 12 files skipped" can always be traced back to a specific file.
 */

export type PyqFileRole =
  | 'paper'            // imported: question text + embedded answer key
  | 'answer_key'       // used as an independent second copy of a key
  | 'duplicate'        // same content as a paper above, no key
  | 'no_text_layer'    // scanned images only: needs OCR, not imported
  | 'reference';       // book/reference, no per-question mapping, not imported

export interface PyqFileDef {
  filename: string;
  role: PyqFileRole;
  /** Shown in the UI. Written from what the file actually contains. */
  reason: string;
}

export interface PyqPaperDef {
  paperKey: string;
  label: string;
  year: number;
  session: number;
  /** Question paper filename inside "Gate paper and answer key". */
  sourceFile: string;
  /** Extra answer-key documents for the same session. */
  keyFiles: string[];
  /** The paper PDF prints its own key table at the end. */
  embeddedKey: boolean;
  /** Page marker that starts this paper inside a multi-session PDF. */
  startMarker?: string;
}

export const PYQ_FOLDER = 'Gate paper and answer key';

export const PYQ_PAPERS: PyqPaperDef[] = [
  {
    paperKey: 'GATE-ME-2022-S1',
    label: 'GATE ME 2022 · Session 1',
    year: 2022,
    session: 7,
    sourceFile: 'GATE-ME-2022-Question-Paper.pdf',
    keyFiles: ['me-merged_2022.pdf'],
    embeddedKey: true,
  },
  {
    paperKey: 'GATE-ME-2022-S2',
    label: 'GATE ME 2022 · Session 2',
    year: 2022,
    session: 8,
    sourceFile: 'me_2022.pdf',
    keyFiles: ['me-merged_2022.pdf'],
    embeddedKey: true,
    startMarker: 'SESSION - 2',
  },
  {
    paperKey: 'GATE-ME-2023',
    label: 'GATE ME 2023',
    year: 2023,
    session: 2,
    sourceFile: 'GATE-ME-2023-Question-Paper.pdf',
    keyFiles: ['ME_ANS_GATE2023.pdf'],
    embeddedKey: true,
  },
  {
    paperKey: 'GATE-ME-2024-S2',
    label: 'GATE ME 2024 · Session 2',
    year: 2024,
    session: 2,
    sourceFile: 'GATE-ME-2024-Question-Paper.pdf',
    keyFiles: ['MEFinalAnswerKey.pdf'],
    embeddedKey: true,
  },
  {
    paperKey: 'GATE-ME-2025',
    label: 'GATE ME 2025',
    year: 2025,
    session: 3,
    sourceFile: 'ME2025.pdf',
    keyFiles: ['ME_Keys (1).pdf'],
    embeddedKey: false,
  },
  {
    paperKey: 'GATE-ME-2026',
    label: 'GATE ME 2026',
    year: 2026,
    session: 6,
    sourceFile: 'ME.pdf',
    keyFiles: ['ME_Keys.pdf'],
    embeddedKey: false,
  },
];

export const PYQ_FILES: PyqFileDef[] = [
  { filename: 'GATE-ME-2022-Question-Paper.pdf', role: 'paper', reason: '2022 Session 1 paper, 48 pages, prints its own answer key (session 7).' },
  { filename: 'me_2022.pdf', role: 'paper', reason: 'Both 2022 sessions in one file (101 pages, session 7 and 8), each with its own key. Session 2 is imported from here.' },
  { filename: 'GATE-ME-2023-Question-Paper.pdf', role: 'paper', reason: '2023 paper, 58 pages, prints its own answer key (session 2).' },
  { filename: 'GATE-ME-2024-Question-Paper.pdf', role: 'paper', reason: '2024 Session 2 paper, 37 pages, prints its own answer key (session 2).' },
  { filename: 'ME2025.pdf', role: 'paper', reason: '2025 paper, 41 pages. No key inside; the key is a separate file.' },
  { filename: 'ME.pdf', role: 'paper', reason: '2026 paper, 44 pages. No key inside; the key is a separate file.' },

  { filename: 'me-merged_2022.pdf', role: 'answer_key', reason: 'Answer key only: both 2022 sessions, 65 rows each. Agrees with the keys printed inside the papers, so 2022 answers are confirmed by two documents.' },
  { filename: 'ME_ANS_GATE2023.pdf', role: 'answer_key', reason: '2023 answer key, 65 rows. Agrees with the key printed in the 2023 paper.' },
  { filename: 'MEFinalAnswerKey.pdf', role: 'answer_key', reason: '2024 Session 2 answer key, 65 rows (four MCQs marked MTA = marks to all). Agrees with the key printed in the paper.' },
  { filename: 'ME_Keys (1).pdf', role: 'answer_key', reason: '2025 answer key, 65 rows. The only key for 2025 in this folder.' },
  { filename: 'ME_Keys.pdf', role: 'answer_key', reason: '2026 answer key, 64 rows (Q65 missing) and all 35 ME MCQs are "A", which is a placeholder, not a key. Those answers are withheld; see answer_status = unresolved.' },

  { filename: 'me_2023.pdf', role: 'duplicate', reason: 'Identical question text to GATE-ME-2023-Question-Paper.pdf, without the answer key. Not imported twice.' },
  { filename: 'ME24S2.pdf', role: 'duplicate', reason: 'Identical question text to GATE-ME-2024-Question-Paper.pdf, without the answer key. Not imported twice.' },

  { filename: 'GATE-ME-2021-Question-Paper.pdf', role: 'no_text_layer', reason: 'Scanned images. The text layer holds 586 characters for the whole file, so no question can be read without OCR.' },
  { filename: 'me_2021.pdf', role: 'no_text_layer', reason: 'Scanned images (1,203 characters of text for the whole file). Needs OCR.' },
  { filename: 'me_merged_2021.pdf', role: 'no_text_layer', reason: 'Scanned images (96 characters of text). Needs OCR.' },
  { filename: 'GATE-ME-2020-Question-Paper.pdf', role: 'no_text_layer', reason: 'Questions are images; only "Q.No. N (A) (B) (C) (D)" placeholders are text. Needs OCR.' },

  { filename: 'po.pdf', role: 'reference', reason: 'GATEOverflow book (450 pages). Has question text and chapter-level answer keys, but no per-question key mapping, so it cannot verify an answer. Not imported.' },
];

export function paperByKey(key: string): PyqPaperDef | undefined {
  return PYQ_PAPERS.find(p => p.paperKey === key);
}

/** Every distinct file the importer may read. */
export function allSourceFiles(): string[] {
  const out = new Set<string>();
  for (const p of PYQ_PAPERS) {
    out.add(p.sourceFile);
    for (const k of p.keyFiles) out.add(k);
  }
  return [...out];
}
