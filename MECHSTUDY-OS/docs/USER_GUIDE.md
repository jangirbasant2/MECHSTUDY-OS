# MECHSTUDY OS — User Guide

A practical walkthrough for RTU III-semester Mechanical Engineering and GATE ME
preparation. Every number below comes from the real library and syllabus in this
repository.

---

## 1. First run

1. Start the app (`npm run dev` from source, or the installer once built).
2. Open **Import & Indexing** and press **Scan folder** on the repository root,
   then **Import**. The scan skips `node_modules`, hidden folders and the app
   itself.
3. The library reports **66 documents · 4,871 pages · 970.8 MB**.
4. Press **Index text layers** once. Only `syllabus.pdf` has a real text layer,
   so this indexes 15 pages. The other 65 files are handwritten scans — index
   them with OCR only if you want searchable text (see §6).

The syllabus is seeded automatically on first launch: 10 RTU subjects and 5 GATE
sections. Nothing else is created for you.

---

## 2. The pages

| Page | What it is for |
| --- | --- |
| **Home** | Today's plan, study time, streak, due reviews, continue-reading. |
| **My Library** | Every document with size, pages, subject, material type. Open, star, reassign subject, verify files, remove. |
| **PDF Reader** | Read, highlight, annotate, bookmark, search inside the document. |
| **Notes & Annotations** | All sticky notes in one place, searchable. |
| **RTU Syllabus** | 10 subjects → 34 units → 248 topics, with progress and confidence. |
| **GATE Mechanical** | 5 sections → 165 topics. General Aptitude is labelled UNVERIFIED. |
| **Practice & Questions** | Question bank, attempts, accuracy; mistake book. |
| **Study Planner** | Tasks by date, priority and subject. |
| **Revision Center** | Spaced repetition queue and grading. |
| **Analytics** | Time, streaks, subject split, practice accuracy. |
| **Search** | One search across page text, notes, topics and documents. |
| **Import & Indexing** | Scan/import, text-layer indexing, OCR jobs. |
| **Settings** | Project root, OCR engine status, backup/restore, integrity, exports. |

`Ctrl+K` opens the command palette from anywhere.

---

## 3. Reading and annotating

1. **My Library** → find a document → **Open**.
2. Use **Fit width** or the zoom controls; page navigation is at the top.
3. **Sticky notes** — press the note tool (or `N`) and click the page. A note
   appears where you clicked; type, then **Save** (or `Ctrl+Enter`). The note is
   a real rectangle: drag its header to move it, drag the bottom-right corner to
   resize it, click it to change its colour, double-click it to edit the text.
   It shows its text immediately — you never have to click to read it.
4. **Write on the PDF** — press the text tool (or `T`), click the page, type, and
   pick a font size (11–32) and a colour. Text boxes move and resize the same
   way, and double-click edits them.
5. **Highlights and underlines** — select text with the mouse and use the
   floating **Highlight / Underline / Strike** toolbar, or drag a rectangle with
   the highlight tool (`H`). Everything is stored with normalized coordinates,
   so it stays in place when you zoom or resize.
6. **Pen and eraser** — the pen draws freehand; the eraser (`E`) removes a
   highlight, an ink stroke or a text box when you click it.
7. **Bookmark** marks a page for later.
8. **Export** writes an *annotated copy* to the location you choose. Sticky
   notes and written text are drawn into that copy. The original file is never
   opened for writing — the app verifies this (the SHA-256 of the source is
   unchanged after an export).

If a page has no text layer (a scan), highlights, notes and text boxes still
work; only text selection is unavailable.

### Getting the layout back

The reader can hide parts of the interface, and every one of those actions has a
visible way back — you should never have to close and reopen a PDF:

| What you hid | How to get it back |
| --- | --- |
| Sidebar | Left-edge **Menu** rail, `Ctrl+B`, or the sidebar button in the reader toolbar |
| Top toolbar | **Show toolbar** button, top-right |
| Reader toolbar | **Show toolbar** button at the top of the reader |
| Side panel | **Panel** rail on the right edge |
| Focus mode (sidebar + topbar) | **Exit focus** bar (`Esc`) or **Restore layout** |

`Esc` always leaves reader focus mode. **Restore layout** (in the focus bar and
in the reader toolbar's collapsed state) brings back the sidebar, the top
toolbar and the reader toolbar in one click. Focus mode is deliberately *not*
remembered across restarts: if it were ever left on, the app would start with no
navigation, so it is reset on every launch. The boot code also re-shows the
sidebar and topbar if both were somehow saved as hidden.

Full-screen (the window itself) is a separate button from focus mode (hiding app
chrome). Entering full-screen never hides the sidebar or the toolbar.

---

## 4. Studying a syllabus topic

1. Open **RTU Syllabus** or **GATE Mechanical**.
2. Expand a subject → unit → topic.
3. Set the topic status: *not started → learning → completed*, plus a confidence
   rating 1–5.
4. Marking a topic **completed** schedules its first revision for tomorrow.
5. Attach a note or a document to the topic so the material is one click away.

Progress rolls up: a unit only counts as complete when all of its topics are.

---

## 5. Planning, revision, practice

- **Planner** — create a task with a subject, topic, date, priority and estimated
  minutes. Completing it records when it was finished.
- **Revision Center** — shows topics due today (local date, so nothing is
  "overdue" by a timezone offset). Grade each review:
  - *Easy* → longer interval and higher confidence
  - *Moderate* → normal interval
  - *Difficult* → shorter interval
  - *Forgot* → back tomorrow, confidence reset
- **Practice** — add a question (MCQ or numerical) with options, answer and
  solution; record attempts. Accuracy is shown per subject. Until you attempt
  something it reads `—`, not `0 %`.
- **Mistake book** — record what went wrong (conceptual, formula, calculation,
  unit conversion, misread question, time management) and mark it mastered once
  you have fixed it.

---

## 6. OCR (optional)

OCR needs the Tesseract 5 command-line tool. The app looks for it at:

```
C:\Program Files\Tesseract-OCR\tesseract.exe
C:\Program Files (x86)\Tesseract-OCR\tesseract.exe
%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe
```

If none exists, **Settings → OCR** shows the install hint and OCR buttons stay
disabled. Nothing else is affected.

To OCR: **Import & Indexing** → pick a document → choose page range → **Start**.
Jobs run in the background, report progress, can be cancelled, and resume from
the last completed page. OCR text is stored per page and added to search with its
confidence value, so you can tell it apart from a real text layer.

**Be realistic about quality.** The notes are handwritten scans; the test page
OCR'd at ~39 % confidence. Treat OCR text as a rough search aid, not as a
transcript.

---

## 7. Backup, restore, integrity

- **Settings → Backup** creates a timestamped copy of the database.
- **Restore** takes a safety backup of the current database first, then swaps in
  the chosen one and asks you to restart.
- **Integrity report** lists missing files, documents with no pages indexed,
  duplicate hashes and other inconsistencies.
- **Export notes** writes your notes to a Markdown file.

---

## 8. Reading the data honestly

- A document's subject may come from its **filename** (`subject_source =
  filename`). That is a guess. Correct it in the library; the source then becomes
  `manual`.
- A document is only linked to a syllabus topic when **you** link it. The app
  does not claim that a PDF covers a topic on its own.
- **RTU ↔ GATE mappings** are lexical similarities between the two official
  syllabi. Every mapping is marked `INFERRED` and states its score plus "No PDF
  page-level evidence was used." Use them as a hint, not a citation.
- **GATE General Aptitude** is `UNVERIFIED`: the official ME syllabus PDF does
  not include it.
- **Technical Communication (3ME1-02/4ME1-02)** is not part of this workspace at
  all.

---

## 9. Keyboard and navigation

Global:

| Action | Shortcut |
| --- | --- |
| Command palette | `Ctrl+K` |
| Quick note | `Ctrl+Shift+N` |
| Show / hide sidebar | `Ctrl+B` |
| Settings | `Ctrl+,` |
| Reload | `Ctrl+R` |
| Zoom in / out / reset | `Ctrl+=` / `Ctrl+-` / `Ctrl+0` |
| Full-screen window | `F11` |
| DevTools (development builds only) | `Ctrl+Shift+I` |

Inside the PDF reader:

| Action | Shortcut |
| --- | --- |
| Next / previous page | `→` / `←` (also `PageDown` / `PageUp`) |
| Zoom in / out | `+` / `-` |
| Highlight tool | `H` |
| Sticky note tool | `N` |
| Write-on-PDF tool | `T` |
| Eraser | `E` |
| Reader focus mode | `Ctrl+Shift+F` |
| Back to select / cancel the current tool | `Esc` |
| Save the note or text box being written | `Ctrl+Enter` |

`Esc` also leaves focus mode, so it is always the safe key to press when the
interface looks wrong.
