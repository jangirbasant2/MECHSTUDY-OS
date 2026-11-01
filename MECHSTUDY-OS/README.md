# MECHSTUDY OS

A local-first Windows desktop workspace for **RTU Kota B.Tech Mechanical
Engineering (III semester)** and **GATE Mechanical Engineering** preparation,
built around the 66-PDF study library in this repository.

The PDFs are the library. The app reads them in place and keeps everything you
add — highlights, notes, bookmarks, progress, questions, mistakes — in a local
SQLite database. Nothing is uploaded, and nothing is written back into a PDF
unless you explicitly export an annotated copy.

---

## What it does

- **Library** — imports the folder, records size/pages/hash, flags duplicates and
  missing files, and never moves or renames anything.
- **Reader** — renders text-layer and scanned PDFs, highlights with the mouse or
  from a text selection, rectangular sticky notes you can move/resize/recolour,
  "write on the PDF" text boxes, freehand ink and an eraser, bookmarks, zoom,
  fit-width, jump-to-page, search inside a document. Every hidden panel has a
  visible way back (rail, floating button or `Esc`), so the layout can never get
  stuck.
- **Syllabus** — the real RTU III-semester curriculum (10 subjects, 34 units,
  248 topics) and the official GATE 2027 ME syllabus (5 sections, 165 topics),
  each with per-topic progress, confidence and revision state.
- **Planner & tasks** — plan against real syllabus topics, estimate minutes,
  track status.
- **Revision Center** — spaced repetition over topics you have marked complete,
  with an interval that grows when you rate a review easy.
- **Practice & mistakes** — questions with attempts, accuracy per subject, and a
  mistake book with error categories and review state.
- **Analytics** — study time, streaks, subject/target split, practice accuracy.
- **Search** — one box across extracted PDF text, notes, topics and documents.
- **Notes** — markdown notes with LaTeX math.
- **Import & Indexing** — see exactly what is indexed, index text layers, and run
  optional OCR page by page.
- **Backup** — manual backups, restore with a safety backup, integrity report,
  annotated-PDF export.

---

## Requirements

- Windows 10/11 x64
- Node.js 20+ and npm (only for running from source)
- Optional: [Tesseract 5](https://github.com/UB-Mannheim/tesseract/wiki) for OCR.
  Without it the app works normally; the OCR panel explains what is missing.

## Run from source

```powershell
cd MECHSTUDY-OS
npm install
npm run dev
```

`predev` copies pdf.js runtime data (standard fonts, CMaps, wasm decoders, ICC
profiles) from `node_modules` into `src/renderer/public/pdfjs/`; that folder is
gitignored so it can never drift from the installed `pdfjs-dist`.

## Build

```powershell
npm run build      # production bundle in out/
npm start          # run the built bundle
npm run package    # Windows NSIS installer in release/
```

`npm run package` builds and then runs electron-builder, retrying up to three
times with a clean `release/` folder. The retry is there because OneDrive (or an
antivirus scanner) can lock the freshly written executable inside a synced
folder, which makes electron-builder fail with `EBUSY` even though the build is
fine.

The installer is **unsigned** — no code-signing certificate is configured — so
Windows Smart App Control may ask for confirmation on first run. Installed size
is about 137 MB.

## Tests

```powershell
npm run typecheck
npm test                 # 22 unit tests
npm run test:integration # 41 integration tests (includes a v4→v5 migration rehearsal)
```

## Derived index

`tools/build_index.py` writes a plain CSV/JSON snapshot of the library and
syllabus to `data/index/` (gitignored), and `tools/validate_index.py` checks it
against the database and the files on disk:

```powershell
npm run tools:build-index
npm run tools:validate-index
```

---

## Where your data lives

| What | Where |
| --- | --- |
| Database (annotations, notes, progress, questions…) | `%APPDATA%\MECHSTUDY OS\data\mechstudy.db` |
| Backups | chosen in the app; default under the app data folder |
| Annotated exports | chosen in the app — a **copy**, never the original |
| Original PDFs | exactly where they are; the app only reads them |

The **Help → Open Data Folder** menu item opens the data directory.

---

## Ground rules the app follows

1. **Original PDFs are immutable.** No rename, move, delete, recompress or
   overwrite. Annotations are stored as rows, not drawn into the file.
2. **No invented content.** Every subject, unit and topic comes from a named
   source; the GATE General Aptitude section is marked `UNVERIFIED` because the
   official ME PDF does not contain it. Subject guesses from filenames are
   labelled as guesses.
3. **Technical Communication (3ME1-02/4ME1-02) is excluded** from all imported
   data, exports and recommendations, per the owner's request.
4. **Offline.** No API keys, no network calls, no accounts.

## Documentation

- `docs/IMPLEMENTATION_STATUS.md` — what is built, tested, and what is not
- `docs/USER_GUIDE.md` — day-to-day workflow
- `docs/TROUBLESHOOTING.md` — common problems and fixes
