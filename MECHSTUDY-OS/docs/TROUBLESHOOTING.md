# MECHSTUDY OS — Troubleshooting

Symptom → cause → fix. If a problem is not listed here, check
`%APPDATA%\MECHSTUDY OS\logs\main.log` first: the main process logs every startup,
database version, migration and OCR job there.

---

## The app will not start

**"This app can't run on your PC" / nothing happens after double-click**

The installer targets Windows 10/11 **x64**. On ARM Windows, x64 emulation usually
works, but the build is not native.

**Windows Smart App Control blocks the executable**

The build is unsigned. Smart App Control (Windows 11) blocks executables it has no
reputation for, sometimes only after a rebuild. Options:

1. Open **Windows Security → App & browser control → Smart App Control** and allow
   the app, or turn Smart App Control off.
2. Right-click the installer → **Properties** → **Unblock** if the file came from
   another machine.
3. Sign the build with a code-signing certificate before distributing it.

**The window opens blank**

Press `Ctrl+R`. If it stays blank, check the log for a renderer error and reinstall.

---

## "Cannot find module" or a blank page in a development run

```powershell
cd MECHSTUDY-OS
npm install
npm run dev
```

`predev` copies pdf.js runtime data from `node_modules` into
`src/renderer/public/pdfjs/`. If that folder is missing or stale:

```powershell
node tools/copy-pdfjs-assets.mjs
```

---

## Library

**"Verify files" reports missing documents**

The files were moved, renamed or deleted outside the app — the app never moves
them. Fix each one with **Relink**, or remove the row (the file is not touched).
If the whole folder moved, use **Import folder** on the new location.

**Import is slow**

The first import reads every PDF to count pages and compute a SHA-256 hash
(~970 MB here). Later imports only re-hash changed files.

**The same PDF appears twice**

Run **Duplicates** in the library. Duplicates are detected by content hash, not by
filename, so renamed copies are still found.

**A document shows the wrong subject**

The subject came from the filename (`subject_source = filename`) — it is a guess.
Reassign it in the library; the source becomes `manual`.

---

## Reader

**The sidebar or the toolbar disappeared**

Nothing is lost and you do not need to reopen the PDF. Every hidden panel has a
visible way back:

| Hidden | Bring it back with |
| --- | --- |
| Sidebar | the **Menu** rail on the left edge, or `Ctrl+B` |
| Top toolbar | the **Show toolbar** button at the top-right |
| Reader toolbar | the **Show toolbar** button at the top of the reader |
| Side panel | the **Panel** rail on the right edge |
| Focus mode (both bars) | the **Exit focus** bar, `Esc`, or **Restore layout** |

If the window looks wrong in any other way, press `Esc` first, then
**Restore layout**. Focus mode is not saved between launches, so restarting the
app always returns a normal layout.

**The page does not re-fit after showing or hiding the sidebar**

It should — the reader measures its scroll container with a `ResizeObserver`
that is re-attached when a document finishes loading. If a page still looks
wrong, press **Fit width**, or reload with `Ctrl+R`.

**"rendering…" never clears and Fit width / Zoom do nothing**

Almost always this means the app window is completely covered by another window
(or minimised). Chromium stops producing animation frames for a window that is
not being composited, and pdf.js finishes each page render on an animation frame,
so the render waits. Bring the window to the front — or minimise and restore it —
and the page finishes rendering and re-fits by itself; nothing is lost and you do
not need to reopen the PDF.

The main window sets `backgroundThrottling: false`, which keeps timers running
(so OCR and indexing progress continue in the background), but frames are still
paused while the window is occluded. This is normal Chromium behaviour, not a
reader deadlock.

**A zoomed page cannot be panned sideways**

That was a fixed bug (`overflow-x: hidden`). If you are on an older build, the
page is clipped instead of scrollable; update the app.

**A sticky note is in the wrong place, or its text is invisible**

Notes are stored page-relative (`x/y/w/h` in 0–1), so they follow zoom and
window size. A note created by a much older build had no width/height; migration
5 gives it a default rectangle and moves it fully inside the page. If a note
still looks wrong, double-click it, check the text, then drag it where you want
it — the new position is saved immediately.

**Clicking the page creates a new note instead of selecting the existing one**

The note tool stays active only until you save. After **Save** the reader returns
to the select tool, which is what you want for editing existing notes. If you
are still in the note tool, click the note-tool button again (or press `Esc`).

**Written text is missing from the exported PDF**

Export writes the text boxes and sticky notes it knows about. Text is drawn with
pdf-lib's standard fonts, which are WinAnsi-encoded, so characters outside that
set (`°`, `×`, `Δ`, `π`, `σ`, `θ`, curly quotes, en/em dashes) are transliterated
(`deg`, `x`, `Delta`, `pi`, …) instead of failing the export. If a whole export
fails, check `%APPDATA%\MECHSTUDY OS\logs\main.log` for the pdf-lib error.

**A page is blank / a scanned page never renders**

Some scans use JBIG2 or JPEG2000 compression, which pdf.js decodes with WebAssembly.
Those files live in `out/renderer/pdfjs/wasm/`. In a development run, re-run
`node tools/copy-pdfjs-assets.mjs` and restart.

**Text looks slightly wrong in a PDF that does not embed fonts**

pdf.js loads the 14 standard PDF fonts from `pdfjs/standard_fonts/`. If that folder
is missing you will see `Ensure that the 'standardFontDataUrl' API parameter is
provided` in the log. Re-run the asset copy.

**Highlights are offset after zooming**

Highlights are stored with normalized 0–1 coordinates, so they should stay put. If
one is offset, the PDF page geometry changed (a different file was relinked at the
same document row). Delete and re-create the highlight.

**"Export" produced a file but the original is unchanged**

That is the design: export writes an **annotated copy** and never opens the source
for writing. Confirm with any hash tool — the source SHA-256 stays identical.

---

## Search

**A document has no search hits**

Most of the library is handwritten scans with no text layer. Only documents with
extracted text (text layer or OCR) are searchable. See the counts in
**Import & Indexing**.

**Search finds a page but the snippet is gibberish**

That page's text came from OCR. OCR quality on handwriting is low (~39 % on the
test page); the snippet is a rough locator, not a transcript.

---

## OCR

**OCR is disabled and the app says Tesseract is not installed**

Install Tesseract 5 from <https://github.com/UB-Mannheim/tesseract/wiki>. The app
looks for it at:

```
C:\Program Files\Tesseract-OCR\tesseract.exe
C:\Program Files (x86)\Tesseract-OCR\tesseract.exe
%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe
```

Installing to a custom folder means the app will not find it; reinstall to one of
those paths.

**An OCR job stays "queued"**

Only one job runs at a time; check whether another job is running. If the app was
closed mid-job, the job is resumed or restarted from the last completed page when
you start it again.

**OCR output is poor**

Expected on handwriting. Try a smaller page range, or use the notes and highlights
instead of relying on OCR text.

---

## Study data

**Progress disappeared**

Check that the database file exists:
`%APPDATA%\MECHSTUDY OS\data\mechstudy.db`. If it was deleted, restore a backup
(**Settings → Restore**), which takes a safety backup of the current file first.

**"Restore" asks for a restart**

The database is swapped on disk, so the running process must exit and reopen it.
Restart the app.

**Integrity report lists issues**

Each issue names the document and the problem. Missing files can be relinked;
duplicate hashes are informational; a document with no indexed pages simply has
not been indexed (or OCR'd) yet.

---

## Packaging and building

**`npm run package` fails with `EBUSY: resource busy or locked ... MECHSTUDY OS.exe`**

OneDrive or an antivirus scanner grabbed the freshly written executable.
`npm run package` already retries up to three times with a clean `release/`.
If it still fails: close the app, pause OneDrive sync, delete `release/`, retry.

**`electron-builder` cannot download `nsis` / `winCodeSign`**

The first build downloads helper binaries. Run it once with network access; they
are cached in `%LOCALAPPDATA%\electron-builder\Cache`.

**Typecheck fails after pulling changes**

```powershell
npm install
npm run typecheck
```

---

## Tests

```powershell
npm test                 # 22 unit tests, no build step
npm run test:integration # compiles src/main + tests, then runs 41 tests
npm run tools:validate-index
```

Integration tests use a throwaway database in `%TEMP%` (via `MECHSTUDY_DB_PATH`)
and never touch your real data. `tests/integration/migrations.test.ts` builds a
v4 database by hand and runs the real migration runner over it, so an upgrade of
an existing database is tested — not just a fresh install.

**Your database was upgraded from v4 to v5**

Migration 5 adds `font_size` columns and gives legacy sticky notes a rectangle.
It is additive: no note text, colour or page association is changed, and no table
is dropped. A `pre-migration-v5-*.db` copy is written next to the database before
the migration runs, so you can roll back by restoring it.

**`tools/validate-index` fails on General Aptitude being VERIFIED**

Your database predates schema v4. Start the app once so migration 4 runs, then
rebuild the index:

```powershell
npm run tools:build-index
npm run tools:validate-index
```

---

## Resetting everything

To start over without touching any PDF:

1. Close the app.
2. Rename `%APPDATA%\MECHSTUDY OS\data\mechstudy.db` (keep it as a backup).
3. Start the app and import the library again.

This deletes your notes, highlights, progress and questions — only do it if you
have a backup you do not need.
