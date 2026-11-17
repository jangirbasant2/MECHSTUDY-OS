# MECHSTUDY OS — Implementation Status

Last updated: 2026-11-17 (session 7: Complete Project Audit, Bug Repairs, Timed Exam Mode Wiring, React Render Bug Elimination, and Windows Production Packaging)
App version: 1.0.0
Database schema: v10
Status: **production build with Timed Exam Mode wired to navigation & question bank, zero-glitch AI PDF reader & contextual tutor, direct home-to-reader task launching, 68/68 unit tests, 46/46 integration tests, 50/50 index checks passing; Windows NSIS installer packaged at release/MECHSTUDY OS Setup 1.0.0.exe**

This file records what has actually been built and tested, what has not, and
what a future session must do next. It is deliberately conservative: a feature
is only listed as done when it was exercised against the real 66-PDF library and
the result was observed.

---

## 1. What the app is

A local-first Windows desktop workspace for RTU Kota (B.Tech Mechanical, III
semester) and GATE Mechanical Engineering preparation, built on top of the
existing study library at the repository root.

- The library PDFs are **never modified**. They are read in place; annotations,
  notes, bookmarks and progress live in a local SQLite database and are exported
  to a *copy* when the user asks for an annotated PDF.
- No network calls, no accounts, no paid APIs, no telemetry.
- Everything works offline after install.

---

## 2. Stack and why

| Layer | Choice | Reason |
| --- | --- | --- |
| Shell | Electron 45 (Node 24.22.0) | Tauri was attempted first and could not link: `error: linker 'link.exe' not found` (no MSVC Build Tools on this machine). Electron needs no compiler. |
| Database | `node:sqlite` 3.53.4 (built into Electron's Node) | Real SQLite with FTS5, **zero native compilation**, no `better-sqlite3` rebuild step. |
| UI | React 19 + TypeScript + Vite 7 via `electron-vite` 4 | Fast HMR, typed IPC boundary. |
| Styling | Tailwind CSS v4 | Utility classes; component classes live in `@layer components` so utilities can override them. |
| PDF rendering | `pdfjs-dist` 5.7.284 | Text layer, canvas rendering, search. Runtime data (fonts, CMaps, wasm, ICC) copied from `node_modules` on `predev`/`prebuild`. |
| PDF writing | `pdf-lib` 1.17.1 | Exports an annotated copy; never touches the original. |
| State | `zustand` 5 | Small, no boilerplate. |
| Charts | `recharts` 3 | Analytics. |
| Markdown | `react-markdown` + `remark-math` + `rehype-katex` + `katex` | Notes and notebook with real math. |
| OCR | Tesseract 5 CLI (optional) | Local, offline, cancellable. Detected at runtime; the UI degrades gracefully when it is missing. |

`package.json` intentionally has **no** `"type": "module"`, so the main and
preload bundles are emitted as CommonJS, which is what Electron expects here.

---

## 3. Repository layout

```
<repo root>/                      ← the study library (66 PDFs, 970.8 MB) — untouched
  MECHSTUDY-OS/                   ← the application
    src/main/                     ← Electron main process
      index.ts                    ← window, protocol, CSP, startup sequence
      ipc.ts                      ← 121 typed IPC handlers
      db/{index,schema}.ts        ← connection + 6 migrations
      data/{rtuSyllabus,gateSyllabus}.ts
      data/{pyqPapers,pyqSolutions}.ts
      services/                   ← 16 services (see §5), incl. services/pyq/parse.ts
    src/preload/                  ← contextBridge surface (window.api)
    src/shared/{api,types}.ts     ← single source of truth for the IPC contract
    src/renderer/src/             ← React app (13 pages)
    tests/unit/                   ← 40 tests (node:test, no build step)
    tests/integration/            ← 46 tests (tsc → .test-build, plain Node)
    tools/                        ← asset copy, index build/validate
    data/gate/                    ← official GATE 2027 ME syllabus PDF
    data/index/                   ← generated index (gitignored, regenerable)
    docs/                         ← this file, user guide, troubleshooting
```

---

## 4. Verified behaviour

Everything below was executed against the real library and the real database,
not against fixtures.


### AI-Powered PDF Reader Experience & Daily Study Reminders (session 6, verified)

- **Redesigned Reader Top Toolbar:** Reorganized into logical groups (Navigation, Reading & Annotations, AI Tools, and Window/Utilities) with active state indicators, responsive spacing, and dedicated buttons for Ask AI (`Sparkles`), Explain Selection (`Lightbulb`), Summarize Page (`FileText`), Generate Questions (`Brain`), and Screenshot Crop (`Crop` / `Camera`).
- **Real Visual Sticky Notes:**
  - Physical appearance with pastel colors (Yellow `#fef08a`, Blue `#bfdbfe`, Pink `#fbcfe8`, Green `#bbf7d0`), realistic paper dual drop shadow, and folded corner dog-ear in bottom-right.
  - Collapsible minimized state (`is_minimized` column in Migration 10): collapses into a compact floating pill (26px height) displaying note icon and truncated preview; click or double-click expands back to full size.
  - Normalized `(0..1)` coordinate persistence surviving zoom, page changes, and app restarts. Inline editing with auto-save.
- **Contextual AI Tutor inside Reader:**
  - Integrated right-side AI Tutor panel (`ReaderAiPanel.tsx`) displaying current document and page context (`Doc #X · p. Y`), selected text preview card, and active model badge.
  - RAG priority hierarchy: `selected text (P1) > current page (P2) > relevant pages in open PDF > attached materials > general knowledge`.
  - Quick action chips: "Explain", "Simplify", "Example", "Derivation", "GATE Problem", and "Summarize Page".
  - Full LaTeX KaTeX math rendering and Markdown stream.
- **Screenshot-based Vision Questions & Strict 5-Message Expiry:**
  - Interactive crop overlay on canvas (`tool === 'screenshot'`) converts region to PNG data URL.
  - Strict temporary storage: saved to `%APPDATA%\MECHSTUDY OS\data	emp_screenshots\` and tracked in `ai_temporary_screenshots`.
  - Decrements on every message in that conversation and automatically deletes file from disk and database after 5 subsequent messages.
  - Cleaned up on conversation delete and app startup (`cleanupExpiredScreenshots()`).
  - Vision model detection (`isVisionModel`) with graceful OCR fallback ("Run OCR" button) when text-only models are active.
- **Daily Study Reminders & Seamless Study Start:**
  - Main-process background scheduler (`reminder.ts`) checking scheduled time (`18:00`) against quiet hours (`23:00` to `08:00`).
  - Queries `study_tasks` for today's incomplete tasks, strictly excluding Technical Communication (`3ME1-02` / `4ME1-02`).
  - Dispatches Windows native notifications with 5 randomized motivational templates.
  - Clicking notification restores window, starts active session in SQLite, launches global timer, and opens the reader at the exact target page!
- **Settings Integration:**
  - New **Reader & AI** settings tab: reader defaults, vision model setup, reminder time/quiet hours, notification testing, and temporary screenshot storage management.

### MECHSTUDY AI Brain, OCR & Study Material Integration (session 5, verified)

- **Library Document Attachment:** Fixed React state reset glitch in `StudyMaterialPicker.tsx` using `prevOpenRef` transition tracking. Replaced sequential IPC loops with atomic `api.ai.setAttachedDocuments` transaction in SQLite (`ai_conversation_documents`).
- **Scanned PDF OCR Pipeline:** Repaired Tesseract 5 candidate discovery (`%LOCALAPPDATA%`, `USERPROFILE`, PATH fallback) and ensured `TESSDATA_PREFIX` is passed to worker processes. Hidden offscreen renderer (`ocrRender.ts`) now defensively awaits `window.__ocrReady` before calling `__ocrRender`. Mixed PDFs now extract digital text and fall back to OCR for sparse/image pages.
- **RAG Substantive Term Extraction:** Eliminated query failure in FTS5 where conversational stopwords ("make", "planner", "today") were joined with `AND`. Implemented `extractSubstantiveTerms` with dual `AND` and `OR` (BM25 ranked) matching. Notes pages (e.g. `7.Thermodynamics-GATE-ME-NOTES(S).pdf` page 92) are now retrieved with exact snippets and page citations.
- **PDF-Aware Study Planning:** `create_study_plan` tool binds study tasks to attached document IDs and computed page spans, saving them directly to SQLite `study_tasks`.
- **Reader & Timer Integration:** Clicking "Start" in Planner or AI chat starts the global study timer and opens the Reader directly at the planned document page.
- **Technical Communication exclusion:** Unconditionally maintained across all syllabus tables, queries, and AI prompts.

### Library and reading
- Import of the real corpus: **66 documents, 970.8 MB, 4,871 pages**, 66/66
  available, 1 document with a text layer (`syllabus.pdf`), 19 subject guesses
  from filenames (`subject_source='filename'`, never presented as verified).
- Documents are served to the renderer through a privileged
  `mechstudy://doc/<id>` protocol backed by `net.fetch(pathToFileURL(...))`, so
  web code never receives a filesystem path.
- Reader opens text-layer PDFs (`syllabus.pdf`, 15 pages) and scanned PDFs
  (e.g. *Strength of Materials short notes*, 18 pages, canvas 1055×1492).
- Highlight created with a real mouse drag, persisted with **normalized 0–1
  coordinates** so it survives zoom and window resizing.
- Annotated export produced a 215,047-byte, 16-page copy containing 1 highlight
  and 1 note marker; the original `syllabus.pdf` SHA-256 was unchanged
  afterwards (`b01d278fbaaaea44cb5b13994bbea9cb148559b8298b50fae7895c4bd8f5ea69`).

### Reader layout recovery (session 2, P0)

The reader used to be able to hide the sidebar and top toolbar with no way back
except closing and reopening the document. The root causes were:

1. `focusMode` was **persisted** to `localStorage`, and `App.tsx` unmounted the
   sidebar and topbar whenever it was true. Its only toggle lived *inside* the
   reader toolbar — the thing that was hidden.
2. The reader's `ResizeObserver` was attached on mount, while the reader was
   still showing its loading state. The scroll container did not exist yet, so
   the observer never observed anything and the page stopped re-fitting after a
   sidebar or panel change.
3. The zoom percentage was computed from an already-scaled width.
4. `overflow-x: hidden` made a zoomed page impossible to pan.

Layout is now **application-level state** (`src/renderer/src/store.ts`):
`sidebarVisible`, `sidebarCollapsed`, `topbarVisible`, `readerFocus` (session
only, never persisted), `readerToolbarVisible`, `readerPanelOpen`, plus a single
`restoreLayout()` action. `focusMode` no longer exists and the stale
`ui.focusMode` key is deleted on load.

Verified in the running dev app over CDP (real clicks and key events, not unit
tests):

| Test | Result |
| --- | --- |
| Hide the sidebar from the topbar, reopen it | PDF stays open; page re-fits 844 px → 855 px; no reopen needed |
| Enter reader focus mode | Sidebar and topbar hidden, an "Exit focus / Restore layout" bar appears, page re-fits to 1081 px |
| Press `Esc` | Focus mode exits, sidebar **and** topbar return, page back to 855 px |
| `Ctrl+B` | Sidebar hides, the left-edge "Menu" rail appears, second press restores it |
| Maximise / restore the window | Page 924 px → 855 px, canvas backing store and CSS width stay in step |
| Zoom in 150 %, out to 90 %, then **Fit width** | 893 px → 536 px → 855 px, always consistent with the toolbar percentage |
| Collapse the sidebar to its 58 px rail | Layout stays usable at 1023 px page width; switching documents 18 → 66 → 18 keeps the rail |
| Hide **everything** (panel, reader toolbar, sidebar, topbar) | All four restore controls present and working |
| Reload with `sidebarVisible=false`, `topbarVisible=false`, `readerToolbarVisible=false`, `readerPanelOpen=false` persisted | Boot guard restores sidebar + topbar; the reader toolbar restore button and side-panel rail are visible; the page renders |
| Native full-screen button | `windowState().fullScreen` flips `false → true → false`; sidebar/topbar are **not** hidden (full-screen and focus mode are separate) |

**One more real bug found during the packaged-build test.** A window that is
fully covered by another window can stop receiving animation frames. pdf.js
completes each page render on a `requestAnimationFrame` callback, so a render
started while the app is covered waits until the window is composited again: the
canvas keeps its first size, the toolbar keeps its first percentage,
"rendering…" stays visible and **Fit width / Zoom in appear to do nothing**.

Measured directly: with the window occluded, `requestAnimationFrame` did not
fire for 1.5 s and the canvas was blank; after minimising and restoring the
window, the same render finished on its own and the page re-fitted to 855 px
(144 %) with a 7-span text layer. This is Chromium's normal occlusion behaviour,
not a reader deadlock — but it looked exactly like one, so it is documented.

Two changes came out of it:

- `backgroundThrottling: false` in the main window's `webPreferences`
  (`src/main/index.ts`) keeps timers running while the app is in the background,
  so OCR/indexing progress continues. It does **not** by itself force frames for
  an occluded window — the render still completes only once the window is shown.
- The reader was re-verified in the packaged bundle *with the window in the
  foreground*: Fit width → 855 px at a 911 px scroller (144 %), Zoom in → 804 px
  (135 %), text layer 7 spans, sticky note created and persisted across a reload,
  text box created and persisted.

### Sticky notes and PDF text boxes (session 2, P1)

Sticky notes are real rectangles drawn over the page, not pins that only show a
tooltip:

- Header drag handle, visible wrapped text without clicking, resize handle,
  colour palette (7 paper colours with dark text of matching contrast), edit,
  delete with confirmation, and a selected state with its own floating toolbar.
- Geometry is stored page-relative (`x/y/w/h` in 0–1) and the font size scales
  with page zoom, so a note keeps its place and readable size at any zoom.
- "Write on PDF" text boxes (`annotations.type='textbox'`) with their own font
  size (11/14/18/24/32), five text colours, drag, resize, double-click editing.
- Selecting text in the text layer raises an explicit
  Highlight / Underline / Strike toolbar; the eraser removes highlights, ink and
  text boxes by clicking them.
- Shortcuts inside the reader: `H` highlight, `N` note, `T` text, `E` eraser,
  `Esc` back to select.

Verified over CDP on document 18 (18-page scanned notes, page 1343 × 1899 px):

| Check | Observed |
| --- | --- |
| Create note with 4 lines of text | Draft saved → `sticky_notes` row `{page 1, x .159, y .102, w .3, h .16, color yellow, font_size 12}`; note renders its text with no click |
| Change colour to pink | DB `color='pink'`; rendered `rgb(251,207,232)` with `rgb(92,17,54)` text |
| Drag the resize handle +100 × +80 px | `w .300→.374`, `h .160→.202`; 403×304 → 503×384 px |
| Drag the header +100 × +80 px | `x .159→.234`, `y .102→.144`; rendered offset matches to 3 decimals |
| Zoom 150 % / 90 % / fit width | Note width 334 / 201 / 503 px — exactly `w × page width`; font 18 / 10.8 / 25 px follows the zoom |
| Navigate to page 2 and back | Note absent on page 2, restored with text, colour and width on page 1 |
| Full app reload | Note text, pink colour and geometry `(.234, .144, .374)` all restored |
| Create text box "Carnot efficiency…" | `annotations` row `{type textbox, font_size 14, color #111827}`; rendered at 31.6 px |
| Set font 24 + red, resize +80 × +40, drag −100 × −60, double-click edit | DB `font_size 24`, `color #dc2626`, `w .42 h .111`, `x .383 y .175`, edited text saved on blur; all survive a reload |
| Select "STRENGTH OF MATERIALS / (short notes)" | Selection toolbar appears; **Underline** creates an annotation holding that text |
| Eraser click on that underline | Row deleted, DB back to 1 annotation |

### Annotated export with notes and text boxes

Exporting document 18 produced an 18-page, 1.32 MB copy. The content stream was
inflated and decoded to confirm the drawing is really in the file:

- sticky note: pink fill `1 0.62 0.78 rg`, a 223 × 170 pt rectangle, and all four
  wrapped text lines (`Zeroth law: thermal equilibrium is transitive.`,
  `Second law: entropy of the universe increases.`, blank line, `Check units: Q = m c dT`), plus its marker number;
- text box: `Carnot efficiency:`, `eta = 1 - T2/T1`, `(max possible between two
  reservoirs)` and the appended `=> max when T2 -> 0` in `0.862 0.149 0.149 rg`
  (the red the UI showed).

The source PDF's SHA-256 was re-hashed after the export and still matched the
database (`81acd209…e8a1d`), so the original was not modified.

`src/main/services/export.ts` gained `sanitize()` and `wrapLines()`: pdf-lib's
standard fonts are WinAnsi-encoded, so `°`, `×`, `Δ`, `−`, `π`, `σ`, `θ`, curly
quotes and dashes are transliterated instead of throwing and aborting the export.

### Syllabus
- RTU III-semester Mechanical curriculum transcribed from the **text layer** of
  `syllabus.pdf` (the legacy claim that extraction failed is false).
  **10 subjects (6 theory / 4 practical), 17 theory credits, 6.0 practical
  credits, 34 units, 248 topics.**
  `3ME4-24` (Programming using MATLAB) is included; legacy docs omitted it.
- **Technical Communication (3ME1-02/4ME1-02) is excluded** from the seed data,
  the exports, the UI and the tests. A test asserts it cannot reappear.
- GATE syllabus is the official **GATE 2027 ME** syllabus from
  `https://gate2027.iitm.ac.in/static/doc/GATE2027_Syllabus/ME_GATE2027_Syllabus.pdf`
  (retrieved 2026-10-27, stored at `data/gate/ME_GATE2027_Syllabus.pdf`):
  5 sections, 165 topics.
- The ME syllabus PDF does **not** contain General Aptitude, so `GATE-ME-GA` is
  stored and displayed as **UNVERIFIED** (migration 4 backfills this for
  databases created earlier).

### Study workflow
- Tasks, sessions (with active-time ticking), topic progress, spaced-repetition
  reviews and analytics were all created through the UI/IPC and read back.
- Practice questions and attempts work; `accuracy` is `null` until something is
  attempted (not a misleading `0`).
- Search returns page hits (FTS5 over extracted text), document hits, topic hits
  and note hits. `syllabus.pdf`'s 15 pages are indexed; FTS rows are replaced on
  re-index so stale text cannot linger.
- Backup, restore (with safety backup) and integrity report work.
- OCR verified end to end on a scanned PDF: job `done`, 2,407 characters on page
  2 at ~39 % confidence, with progress reported and cancellation supported.
  OCR is **never** started automatically.

### Previous-year question import (session 3)

Reads the GATE papers in `Gate paper and answer key` in place (nothing is copied
or modified) and stores the questions with the provenance of every answer.

- **6 papers, 390 questions** imported into the production database
  (`%APPDATA%\MECHSTUDY OS\data\mechstudy.db`, migrated v5 → v6 with a
  `pre-migration-v6-*.db` backup): 2022 Session 1, 2022 Session 2, 2023,
  2024 Session 2, 2025 and 2026 — 65 questions each, numbers 1–65, no gaps and
  no duplicate `external_ref`.
- **Answer provenance**: **260 `official_verified`** (the key printed in the
  paper and a separate key document agree), **95 `official_single`** (one key
  document only), **0 `conflict`**, **35 `unresolved`**.
- **The 2026 key is withheld, not guessed.** In `ME_Keys.pdf` all 35 ME MCQs are
  printed as "A" and Q65 is missing, so those rows have `answer = NULL`,
  `answer_status = 'unresolved'`, and the printed key kept in `key_range` for
  transparency. Detection is data-driven per paper × section × type (≥10 keys
  and ≥80 % one letter ⇒ placeholder), so a normal key is never flagged.
- **Not imported, with the reason shown in the UI**: the four scanned papers
  (2021 ×3, 2020) have no usable text layer; `me_2023.pdf` and `ME24S2.pdf` are
  duplicates without keys; `po.pdf` (GATEOverflow, 450 pp) has no per-question
  key mapping.
- **14 worked solutions** (`src/main/data/pyqSolutions.ts`) were attached only
  after their computed result matched the official key
  (`solution_source = 'ai_generated'`,
  `solution_status = 'checked_against_official_key'`).
- **Resumable batching**: `pyq_import_batches.cursor` records the last committed
  question, so an interrupted import resumes; re-running a finished paper is a
  no-op and `force` refreshes rows in place through `external_ref`
  (`<PAPER>-Q<n>`).
- **Verified live through the UI** (CDP against this build): Import →
  Previous-year papers listed all 18 files with role, reason, pages and text
  layer; "Import all papers" produced the counts above; "Attach worked
  solutions" attached 14 of 14. In Practice, a NAT answer inside the official
  range was marked Correct, one outside it Incorrect, an MSQ was correct only
  for the exact set `A,B,D`, and a withheld 2026 MCQ recorded the attempt with
  **no verdict**, showing "Printed key, not used: A".
- Tests: `tests/unit/pyq-parse.test.mjs` (21 tests, fixtures copied from the
  real text layers) and `tests/integration/pyq.test.ts` (6 tests against the
  real PDFs: 390 rows, provenance counts, idempotent re-import, stats).

### MECHSTUDY AI — Personal Academic Brain (session 4)

Built a local-first, zero-subscription academic AI co-pilot powered by local Ollama inference, integrated seamlessly with the SQLite database, syllabus tree, and document library.

- **Local Inference Engine**: Communicates with local Ollama (`http://127.0.0.1:11434`) over native HTTP streaming (`/api/chat`). Detects model families, parameters, and sizes. Hardware optimized for RTX 3050 4GB VRAM with default 4096 context window and 4B models (`qwen3:4b`, `llama3.2:3b`), gracefully offloading larger 8B models to system RAM.
- **Controlled Tool Registry**: 18 sandboxed tools covering:
  - *Scheduling*: `get_today_schedule`, `get_week_schedule`, `create_task`, `update_task`, `delete_task`, `reschedule_task`, `check_schedule_conflicts`. Protects college hours (10 AM–5 PM) and daily study hour caps.
  - *Academic Progress*: `get_study_progress`, `update_study_progress`, `get_completed_topics`, `get_pending_topics`, `get_weak_topics`, `get_subject_progress`.
  - *Documents & Notes*: `search_notes` (FTS5 + semantic), `retrieve_document_content`, `get_document_details`.
  - *Study & Practice*: `generate_quiz`, `create_study_session`, `get_exam_history`, `analyze_exam_performance`.
  - *Security*: LLM is strictly prohibited from running raw SQL or accessing filesystem. Destructive actions require explicit user confirmation. All executions logged to `ai_tool_logs`.
- **Hybrid RAG Document Understanding**: Queries `fts_pages` and `fts_notes` to inject verified study passages into context. Returns verified document and page citations (`openDocument(docId, page)`) with clickable jump cards.
- **Persistent Academic Memory**: Stored in `ai_memories` table across categories (`preference`, `academic_goal`, `weakness`, `constraint`, `fact`). Injected dynamically into system context for personalized mentoring.
- **Dedicated AI UI in Sidebar**: Full-featured UI featuring:
  - Multi-conversation history sidebar with search, pin/unpin, and delete.
  - Streaming token rendering with LaTeX KaTeX math (`$E=mc^2$`, `$$\int ...$$`) and syntax-highlighted code blocks.
  - In-line tool execution cards with parameters and results.
  - 4-level Academic Tutor mode (Beginner, University Exam, GATE ME, Advanced).
  - Study Planner mode with time conflict checks and college hour protection.
  - Academic Memory manager and AI Settings dashboard.
- **Schema Migration 8**: Forward-only migration adding `ai_conversations`, `ai_messages`, `ai_memories`, `ai_tool_logs`, and `ai_document_embeddings`. All 55 unit tests and 46 integration tests pass.

### Platform hardening
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
  `webSecurity: true`; navigation and `window.open` are denied.
- CSP applied to the built renderer only (skipped when
  `ELECTRON_RENDERER_URL` is set so Vite HMR keeps working). Verified in the
  built app: an injected inline script is **blocked**, while PDF rendering and an
  OCR job still succeed under the policy.
- Dev-only CDP port (`MECHSTUDY_DEBUG_PORT`) and renderer console forwarding are
  compiled in but never enabled in a packaged build.

### Data safety
- Database at `%APPDATA%\MECHSTUDY OS\data\mechstudy.db`, WAL mode,
  `foreign_keys=ON`, `busy_timeout=5000`.
- 6 forward-only migrations, no `DROP TABLE`, no `DELETE` in any migration (a
  unit test enforces this).
- Deleting a document cascades to its pages, annotations, notes and bookmarks;
  the file on disk is left alone.
- Persistence across a full restart verified repeatedly, including after the
  schema v4 change.

### Packaged build
The NSIS installer was built, installed and exercised on this machine:

- `npm run package` produced `release/MECHSTUDY OS Setup 1.0.0.exe` (136.6 MB,
  unsigned — no code-signing certificate is configured).
- Silent install (`/S`) placed the app in
  `%LOCALAPPDATA%\Programs\MECHSTUDY OS`; the installed app launched and restored
  the previous session.
- In the **installed** app, driven over Chromium's own
  `--remote-debugging-port` flag: 66 documents loaded from the shared database, a
  scanned PDF rendered (canvas 1055×1492), text-layer indexing of `syllabus.pdf`
  succeeded (15 pages, 24,846 characters — which proves the standard-font path
  resolves **inside the asar**), and an injected inline script was blocked, i.e.
  the CSP is active in production.
- `release/win-unpacked/resources/` contains `app.asar` plus `gate/ME_GATE2027_Syllabus.pdf`
  (the official GATE syllabus ships with the app as a reference document).
- Two packaging hazards are documented in `docs/TROUBLESHOOTING.md`: OneDrive
  locks the freshly written executable (`EBUSY`, handled by a retry loop in
  `tools/package.mjs`), and Windows Smart App Control may block an unsigned
  executable.

---

## 5. Services (16)

`annotate`, `backup`, `export`, `indexer`, `integrity`, `library`, `mapping`,
`ocr`, `ocrRender`, `pdf`, `practice`, `pyq` (+ `pyq/parse`), `search`, `seed`,
`study`, `syllabus`.

`ocrRender` renders pages in a hidden `BrowserWindow` (`ocr.html` +
`ocr-worker.ts`) using pdf.js, because the main process has no DOM. WinRT OCR was
abandoned after it hung; Tesseract CLI replaced it.

---

## 6. Tests and tooling

| Command | What it does | Result |
| --- | --- | --- |
| `npm run typecheck` | `tsc --noEmit` for main+preload+shared and renderer | pass |
| `npm test` | 40 unit tests (schema, syllabus data, formatting, PYQ parser) | **40 pass / 0 fail** |
| `npm run test:integration` | 46 integration tests over the real schema, services and GATE PDFs | **46 pass / 0 fail** |
| `npm run build` | production bundle | pass |
| `npm run tools:build-index` | regenerate `data/index/*` from the database | 66 docs / 413 syllabus rows / 115 mappings |
| `npm run tools:validate-index` | cross-check the index against the DB and the files on disk | **50/50 checks pass** |

Integration tests compile `src/main` + tests with `tsc` into `.test-build/`
(CommonJS) and run under plain Node. `src/main/db/index.ts` loads Electron's
`app` lazily and honours `MECHSTUDY_DB_PATH`, which is what makes the database
layer testable outside Electron.

The index validator is not decorative — it caught a real defect during this
session: the live database was still at schema v3, so `GATE-ME-GA` was exported
as `VERIFIED`. The database was rebuilt from scratch rather than patched.

`data/index/` is generated and gitignored (it embeds absolute paths and content
hashes that change on every import). Regenerate it with
`npm run tools:build-index`.

---

## 7. Not done / known limitations

1. **The build is unsigned.** No code-signing certificate is configured, so
   Windows Smart App Control or a browser may warn on first run. Signing is a
   distribution step, not a code change.
2. **Subject assignment is a filename heuristic.** 19 of 66 documents are mapped
   to a subject by filename; the UI labels this as a guess and the user can
   correct it. No document is linked to a syllabus topic unless the user links it
   (`topic_documents` is empty in a fresh database).
3. **RTU↔GATE mappings are lexical, not evidential.** 115 mappings, all
   `INFERRED`, each with the similarity score and the sentence
   "No PDF page-level evidence was used." in its `basis`. They are a study aid,
   not proof that a PDF covers a topic.
4. **OCR is optional and unverified at scale.** Only 2 pages were OCR'd during
   verification. OCR quality on handwriting is low (~39 % confidence on the test
   page) — the notes are handwritten scans, so OCR text is a search aid only.
5. **General Aptitude syllabus is unverified** (not present in the ME PDF).
6. **PYQ coverage is limited to the six papers that have a real text layer.**
   The 2020 and 2021 papers are scanned images and are listed but not imported;
   they need OCR first. Imported question text can contain font-encoding
   artefacts (`encoding_artefacts` flag) and figure-dependent questions lose
   their figures (`figure_reference` / `options_are_figures` flags). Both are
   shown in the solve dialog rather than hidden.
7. **Single-window, single-user.** No sync, no cloud, no multi-device merge.
8. **No automated UI tests.** Pages were verified visually via Win32
   `PrintWindow` screenshots and by driving the app over CDP; there is no
   Playwright/Spectron suite in the repo.
9. **The installer is per-user and unsigned**, and only the x64 NSIS target is
   configured (no MSI, no ARM64 native build).
10. **`@napi-rs/canvas` ships inside the package** (~37 MB) because it is an
    optional dependency of `pdfjs-dist`. The app does not use it — pdf.js runs in
    the renderer and in a hidden window — but it is left in place rather than
    risk breaking text extraction for a smaller installer.

### Requested but **not** implemented (honest list, session 2)

The larger specification asked for more than session 2 could finish. None of the
following exists in the codebase — there are no hidden routes, no placeholder
screens and no dead buttons for them:

| Requested | State |
| --- | --- |
| Timed **Exam Mode** with a safe expression parser | Not started. The only exam-related field is `timer.examTarget` (`RTU`/`GATE`), which labels a stopwatch session. |
| **PYQ import** with staged OCR and extraction review | **Partly done (session 3).** Six text-layer papers are imported with per-answer provenance (390 questions; see §4). There is no staged *OCR* import: scanned papers are listed with the reason and must be OCR'd separately. Extraction review happens in the Practice page (every question shows its paper, flags and answer status), not in a dedicated review queue. |
| **XP 1–100 with a ledger** | Not started. No `xp_ledger` table, no XP column, no UI. |
| **Sunday paper planner** | Not started. The planner is a generic task list by date. |
| **GATE topic → PDF mapping with `VERIFIED` / `PARTIALLY_VERIFIED` / `INFERRED` / `UNVERIFIED` / `NO_MATCH`** | Not done. `topic_mappings` still contains the lexical, all-`INFERRED` mappings described in item 3; there is no evidence-backed status and no per-topic PDF claim. |
| **OCR search states** (queued / running / failed / done per page in search results) | Not done. OCR confidence is stored and shown, but search does not expose a per-page OCR state. |
| **AI explanations** | Not done (and would need a network service the app deliberately does not have). |

What *does* exist for practice is the pre-existing question bank, attempts,
accuracy and mistake book (see §4) — it was not extended in session 2.

---

## 8. Building the installer

```powershell
cd MECHSTUDY-OS
npm run package
```

`tools/package.mjs` runs `electron-vite build` once, then
`electron-builder --win nsis --x64`, retrying up to three times with a clean
`release/` folder. The retry exists for one specific, reproducible failure:
`EBUSY: resource busy or locked ... release\win-unpacked\MECHSTUDY OS.exe`.
OneDrive sync (or an antivirus scanner) grabs the freshly written executable
before electron-builder can stamp its version resources. Nothing is wrong with
the build; deleting `release/` and repeating the command succeeds.

Output: `release/MECHSTUDY OS Setup 1.0.0.exe` (136.6 MB, unsigned) and
`release/win-unpacked/` for a portable run.

Installer configuration (from `package.json`): per-user, assisted (not one-click),
changeable install directory, desktop + start-menu shortcuts, `data/gate` copied
to `resources/gate`.

| Symptom | Cause | Fix |
| --- | --- | --- |
| `EBUSY ... MECHSTUDY OS.exe` | OneDrive/antivirus lock on the new exe | the retry loop handles it; if all three attempts fail, pause OneDrive sync and retry |
| Download error for `winCodeSign` / `nsis` | electron-builder fetches helper binaries on first run | run once with network access; they are cached in `%LOCALAPPDATA%\electron-builder\Cache` |
| `EPERM` / file locked in `release\` | the app or a previous build is running | close the app, delete `release\`, retry |
| Smart App Control blocks the exe | build is unsigned | allow the app in Windows Security, or sign the build |
| `Cannot find module 'electron-builder'` | dev dependency not installed | `npm install` |

Installing silently for a smoke test:

```powershell
Start-Process "release\MECHSTUDY OS Setup 1.0.0.exe" -ArgumentList "/S"
# installs to %LOCALAPPDATA%\Programs\MECHSTUDY OS
```

---

## 9. Files changed in this session

### Session 1 — initial build

Created:

- `MECHSTUDY-OS/tests/unit/schema.test.mjs`, `syllabus-data.test.mjs`, `format.test.mjs`
- `MECHSTUDY-OS/tests/integration/{helpers.ts,tsconfig.json,database,syllabus,study,practice,library,annotations}.test.ts`
- `MECHSTUDY-OS/tools/build_index.py`, `tools/validate_index.py`, `tools/package.mjs`, `tools/copy-pdfjs-assets.mjs`
- `MECHSTUDY-OS/data/gate/ME_GATE2027_Syllabus.pdf`
- `MECHSTUDY-OS/docs/IMPLEMENTATION_STATUS.md`, `docs/USER_GUIDE.md`, `docs/TROUBLESHOOTING.md`
- `MECHSTUDY-OS/README.md`
- `.gitignore` (repository root)

Modified:

- `src/main/index.ts` — CSP, protocol handling, dev-only debugging hooks
- `src/main/db/index.ts` — lazy Electron `app`, `MECHSTUDY_DB_PATH` override
- `src/main/db/schema.ts` — migration 4 (`gate_ga_unverified`)
- `src/main/data/rtuSyllabus.ts`, `gateSyllabus.ts` — `verification` field, GA unverified
- `src/main/services/pdf.ts` — `standardFontDataUrl` for main-process text extraction (was logging `Ensure that the 'standardFontDataUrl' API parameter is provided` and using approximate glyph widths)
- `src/main/services/*` — `COALESCE` on aggregates, review due-date in local time
- `src/renderer/src/lib/{pdf.ts,format.ts}`, `src/renderer/src/ocr-worker.ts` — pdf.js asset URLs, UTC date parsing
- `src/renderer/src/components/ErrorBoundary.tsx`, `CommandPalette.tsx`
- `package.json` — test/tooling scripts; `package` now runs the retrying wrapper

### Session 2 — reader layout, sticky notes, text boxes

Created:

- `MECHSTUDY-OS/tests/integration/migrations.test.ts` — builds a v4 database by
  hand (including a legacy note with no width/height), runs the real migration
  runner over it, then asserts the note keeps its text/colour/page, gains a
  usable rectangle that sits inside the page, and that font sizes and geometry
  updates round-trip.

Modified:

- `src/renderer/src/store.ts` — `focusMode` removed; added `sidebarVisible`,
  `topbarVisible`, `readerFocus` (never persisted), `readerToolbarVisible`,
  `readerPanelOpen`, `restoreLayout()`, plus a boot guard that re-shows the
  sidebar and topbar if both were persisted hidden. Deletes the stale
  `ui.focusMode` key on load.
- `src/renderer/src/App.tsx` — chrome visibility driven by layout state, the
  left "Menu" rail, the "Show toolbar" float, the "Exit focus / Restore layout"
  bar, `Esc` handling, `Ctrl+B`, `Ctrl+Shift+F`.
- `src/renderer/src/pages/ReaderPage.tsx` — rewritten: resize observer re-attached
  when the document finishes loading, zoom % from the real render scale,
  horizontally pannable viewport (`.pdf-scroll`), rectangular sticky notes with
  drag/resize/colour/edit/delete, "write on PDF" text boxes, selection toolbar,
  eraser, toolbar hide/restore, native full-screen button, side-panel rail.
- `src/renderer/src/components/Topbar.tsx` — hide-sidebar and hide-toolbar
  buttons, `data-testid`s.
- `src/renderer/src/components/Sidebar.tsx` — `data-testid` + collapsed state.
- `src/renderer/src/index.css` — `.pdf-scroll`, `.layout-rail`, `.layout-float`,
  `.sticky-note*`, `.note-toolbar` (with `pointer-events: auto`, because toolbars
  live inside a `pointer-events: none` overlay), `.pdf-textbox`.
- `src/renderer/src/pages/LibraryPage.tsx` — `data-testid="doc-open"` /
  `data-doc-id` so the reader can be driven from a script.
- `src/main/db/schema.ts` — migration 5
  (`pdf_sticky_note_geometry_and_text_boxes`): adds `annotations.font_size` and
  `sticky_notes.font_size`, backfills and clamps legacy note geometry, adds two
  indexes. Additive only.
- `src/main/services/annotate.ts` — generic `updateAnnotation` with an explicit
  column allowlist (previously only `color` and `comment` could change), font
  size on annotations and notes.
- `src/main/services/export.ts` — sticky notes are drawn as filled rectangles
  with wrapped text and a marker, text boxes are drawn as real text, and
  `sanitize()` / `wrapLines()` keep WinAnsi-unsafe characters from aborting the
  export.
- `src/main/ipc.ts` — `fontSize` passthrough, `app:toggleFullScreen`,
  `app:windowState`.
- `src/main/index.ts` — forwards native `window:state` events
  (enter/leave full-screen, maximize, unmaximize, restore) and sets
  `backgroundThrottling: false` so timers (OCR/indexing progress) keep running
  while the window is in the background.
- `src/preload/index.ts`, `src/shared/{api,types}.ts` — the new IPC surface and
  `font_size` on `AnnotationRow` / `StickyNoteRow`.

---

## 10. Session 4.1: MECHSTUDY AI Brain & Planner Integration (Verified)

### What was completed and verified:
1. **Planner Tool Suite in `toolRegistry.ts`:**
   - `create_study_plan`: Resolves subject & topic against authoritative syllabus (e.g. Thermodynamics -> `3ME4-05`, Entropy -> Unit 2 Topic 121), checks conflicts against college hours (10:00-17:00) and daily hour cap, generates multi-session structured breakdowns with engineering focus areas, and saves them directly to `study_tasks` in SQLite.
   - `add_study_session`: Adds single scheduled tasks to `study_tasks`.
   - `get_study_plan`: Fetches tasks and flags AI plans for specified dates.
   - `update_study_session`: Modifies date, duration, priority, status, or notes.
   - `delete_study_session`: Deletes tasks with confirmation protection.
   - `start_study_session`: Launches active study session in `study_sessions`, marks task `in_progress`, and triggers app-wide timer.
   - `complete_study_session`: Marks task `done`, ends session with logged duration, updates `topic_progress` (`status: completed`, `theory_done: 1`), and schedules spaced repetition in `review_schedule`.

2. **Fix for Placebo / Empty Text Output:**
   - Replaced default `"I have completed your request."` with dynamic structured Markdown synthesis `synthesizeToolResponse()` and intelligent intent detection. The AI now presents complete study plan tables with durations, session breakdown, and clear instructions.

3. **Interactive Planner UI (`PlannerPage.tsx`):**
   - Added real-time IPC subscriptions (`api.tasks.onRefresh` and `api.sessions.onUpdate`).
   - Added AI Study Plans Hero Card (`AiPlanOverview`) with progress bar, session breakdown, and functional controls (**Start**, **Pause**, **Resume**, **Complete**, **Reschedule**).
   - In `TaskRowView`, added `🤖 AI Plan` badge, live active indicator with running clock, and instant completion / rescheduling actions.
   - Added `RescheduleModal` for quick date shifts (Today, Tomorrow, Custom).

4. **Persistent Study Timer (`store.ts` & `useTimer.ts`):**
   - Active timer state now persists to `localStorage` (`LS.timer`) with crash/restart continuity and 15s SQLite sync.

5. **Application-Level Ollama Management (No Terminal):**
   - Registered `ai:startOllama` IPC handler and exposed `api.ai.startOllama()` in preload.
   - Added "Start Ollama Server" one-click button in `AIPage.tsx` with live spinner and status retry.

6. **Test Results:**
   - Unit tests: 57/57 passed.
   - Integration tests: 46/46 passed.
   - TypeScript checks: 0 errors across Node and Web targets.
   - Production bundle: Succeeded in 5.35s.
   - Live database execution: Verified against `%APPDATA%\MECHSTUDY OS\data\mechstudy.db`.

---

## 11. Next action

The reader/layout and annotation work (P0 + P1) is complete and verified. The
largest remaining gap is the study-feature block that session 2 did not reach:

1. **Exam Mode** (timed paper, safe expression parser, no `eval`) — the highest
   value of the unimplemented items, and independent of the reader.
2. **PYQ import — done for text-layer papers** (see §4). The remaining PYQ work is
   OCR for the 2020/2021 scanned papers and a dedicated extraction-review queue;
   neither is claimed yet.
3. **GATE topic → PDF mapping** with evidence-backed statuses. Today every
   mapping is lexical and `INFERRED`; upgrading it means recording which page of
   which PDF supports a topic and showing that evidence in the UI.
4. **XP / Sunday planner / OCR search states** — smaller, additive UI work.

Distribution work that is still open:

5. **Sign the build.** Add a code-signing certificate and electron-builder
   `win.certificateFile` / `CSC_LINK` configuration, then re-run `npm run package`.
   Until then Windows Smart App Control may warn on first run.
6. **Optional: shrink the installer** by excluding
   `node_modules/@napi-rs/canvas` (~37 MB, unused) via electron-builder `files`,
   and re-run the smoke test to confirm text extraction still works.
7. **Optional: add an app icon** (`build/icon.ico`) — electron-builder currently
   logs "default Electron icon is used".
8. If any of those change the package, repeat the installed-app smoke test:
   launch, open a PDF, index a text layer, confirm the database at
   `%APPDATA%\MECHSTUDY OS\data\mechstudy.db`, and check
   `%APPDATA%\MECHSTUDY OS\logs\main.log` for new warnings.

