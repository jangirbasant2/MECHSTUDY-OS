# MECHSTUDY AI Brain — Quality Assurance & Verification Report

**Date:** 2026-11-04  
**App Version:** 1.0.0 (Production NSIS Package & Binary)  
**Database Schema:** v9  
**Test Suite Status:** 65/65 Unit Tests Passing · 46/46 Integration Tests Passing · 50/50 Index Validation Checks Passing  

---

## 1. Executive Summary & Root Cause Analysis

An end-to-end audit and repair of the MECHSTUDY AI Brain subsystem was performed. Five critical failure modes were identified, resolved, and verified against real library documents:

### Root Cause 1: PDF Library Attachment Resetting & Glitching
- **Defect:** In `StudyMaterialPicker.tsx`, `useEffect` watched `[open, attachedDocIds]`. Because `attachedDocIds` was passed as an inline array expression `activeConv?.attachedDocuments?.map(...) || []` in `AIPage.tsx`, every single render of `AIPage` generated a new array reference. This caused `useEffect` to execute repeatedly while the modal was open, overwriting the user's selected checkboxes with `new Set(attachedDocIds)` and wiping out selections.
- **Defect 2:** In `AIPage.tsx`, `handleSaveMaterials` checked `if (!activeConvId) return;`. If no conversation was active, clicking Save did nothing. Furthermore, updating attachments was executed via sequential N+1 IPC calls (`attachDocument` / `detachDocument`) rather than an atomic transaction.
- **Resolution:**
  1. `StudyMaterialPicker.tsx` now tracks `prevOpenRef` to only initialize selection state when transitioning from closed to open. Checkboxes remain stable throughout re-renders.
  2. `AIPage.tsx` memoizes `attachedDocIds` with `React.useMemo`.
  3. Added `api.ai.setAttachedDocuments(conversationId, documentIds)` running within an atomic SQLite transaction (`tx(() => { run('DELETE...'); for (const id of documentIds) run('INSERT...'); })`). If no conversation exists, `handleSaveMaterials` automatically initializes one.

### Root Cause 2: Scanned PDF OCR Detection & Execution Failures
- **Defect 1:** In `ocr.ts`, `findTesseract()` only looked in `Program Files` and `app.getPath('home')`. On Windows, standard user installations reside in `%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe`. Furthermore, the PATH fallback stub was returning `null` without inspecting `process.env.PATH`.
- **Defect 2:** In `ocrRender.ts`, `ensureWindow()` resolved as soon as `did-finish-load` fired. In Chromium, `<script type="module">` scripts (like `ocr-worker.ts`) evaluate asynchronously after `did-finish-load`. Calling `window.__ocrRender(...)` immediately resulted in `TypeError: window.__ocrRender is not a function`.
- **Defect 3:** In `documentProcessor.ts`, documents with `has_text_layer === 1` skipped OCR even if certain pages were image scans or had sparse text (< 50 chars).
- **Resolution:**
  1. `findTesseract()` now checks `process.env.LOCALAPPDATA`, `USERPROFILE`, `app.getPath('home')`, standard program files, and falls back to `process.env.PATH` directories. Tesseract v5.4.0 is detected and executed with `TESSDATA_PREFIX` correctly propagated.
  2. `ocrRender.ts` now polls for `window.__ocrReady` before returning the hidden renderer window, and wraps `window.__ocrRender` in a defensive async poll helper.
  3. `documentProcessor.ts` implements hybrid mixed-PDF extraction: text-layer pages are indexed directly, and empty/scanned pages automatically trigger background OCR.

### Root Cause 3: Document Understanding & RAG Query Suppression
- **Defect:** In `rag.ts` and `documentProcessor.ts`, the FTS search split user queries and joined ALL tokens with `AND` (e.g. `"make"* AND "study"* AND "planner"* AND "thermodynamics"* AND "today"* AND "entropy"*`). Because no notes page contains task words like "make", "planner", or "today", the query returned 0 hits, completely suppressing the document content from the AI's context block.
- **Resolution:**
  1. Implemented `extractSubstantiveTerms(query)` which strips conversational and task stopwords (`make, create, plan, planner, timetable, today, want, complete, etc.`) and extracts core engineering terms (`thermodynamics, entropy`).
  2. Implemented dual-tier FTS retrieval: first attempts `AND` across substantive terms; if 0 hits occur, falls back to `OR` ranked with SQLite FTS5 `bm25(fts_pages)`. Real notes pages (such as Page 92 of `7.Thermodynamics-GATE-ME-NOTES(S).pdf`) are immediately retrieved with exact snippets and page citations.
  3. When documents are attached, overview and high-yield pages are injected into the context block.

### Root Cause 4: PDF-Aware Study Plan Creation
- **Defect:** Study plans created by the AI previously lacked document ID and page linkage if the subject was not hardcoded to 'thermo' or if document analysis returned null.
- **Resolution:**
  1. `create_study_plan` dynamically resolves the attached document against the target subject using token matching across any mechanical engineering subject.
  2. `docAnalysis` pinpoints exact topic page occurrences using BM25, and evenly allocates page ranges across the generated sessions.
  3. Every created task in SQLite stores `document_id` and `page`, enabling the "Start" button in Planner to launch the timer and open the notes at the exact page.

---

## 2. Test Verification Matrix

| Test Suite / Phase | Scope | Result | Details |
|---|---|---|---|
| **Unit Tests** | Schema, Session Mgmt, AI Tables, RAG terms, Atomic Attach | **PASS (65/65)** | Added tests for `extractSubstantiveTerms`, `setConversationDocuments`, and task document page linkage. |
| **Integration Tests** | Database, Reader, Annotations, Tasks, Spaced Repetition | **PASS (46/46)** | Verified schema migrations, FTS5 index sync, and task lifecycle. |
| **Index Validation** | RTU + GATE Syllabus, Inventory, Exclusions | **PASS (50/50)** | Validated against `tools/validate_index.py`. Confirmed Technical Communication (3ME1-02/4ME1-02) remains excluded. |
| **TypeScript Typecheck** | Node and Web configurations | **PASS (0 errors)** | `npm run typecheck` passed for all main, preload, and renderer sources. |
| **Packaging & Binary** | Production NSIS Installer | **PASS** | `release/MECHSTUDY OS Setup 1.0.0.exe` generated. Installed silently and verified at `MECHSTUDY OS.exe` (Timestamp: 2026-11-04 21:18:54). |

---

## 3. End-to-End Live Pipeline Verification

A live database test was executed on `%APPDATA%\MECHSTUDY OS\data\mechstudy.db`:
1. **Attachment:** Attached `Doc #63` (`7.Thermodynamics-GATE-ME-NOTES(S).pdf`) and `Doc #69` (`Thermodynamics Diwali Assignment.pdf`) to conversation `id: 2`.
2. **RAG Extraction:** User prompt: `"Make a study planner for thermodynamics for today as I want to complete entropy"`.
   - Substantive terms: `['thermodynamics', 'entropy']`.
   - Result: Retrieved 3 high-relevance pages:
     - `Doc #63 Page 92`: `"Entropy Principle: According to this principle the entropy change of universe can never have negative value..."` (source: `ocr`, rank: -5.39).
     - `Doc #69 Page 13`: `"Thermodynamic Relations, Equilibrium and Stability"` (source: `ocr`, rank: -4.43).
     - `Doc #69 Page 7`: `"Thermodynamic Relations"` (source: `ocr`, rank: -4.25).
3. **Plan Creation:**
   - Generated 3 structured sessions for `Engineering Thermodynamics` (Code: `3ME4-05`), Unit 17 (`Entropy, calculation of entropy change`):
     - `Task #12`: `[AI Plan] Entropy: Concepts, Clausius Inequality & Entropy Principle` -> Linked to Doc #63 Page 92 (45m).
     - `Task #13`: `[AI Plan] Entropy: T-s Relations & Property Calculations` -> Linked to Doc #63 Page 94 (45m).
     - `Task #14`: `[AI Plan] Entropy: Solved Numerical Problems & RTU/GATE PYQs` -> Linked to Doc #63 Page 96 (30m).
4. **Planner & Reader Integration:**
   - Planner page displays tasks with document pill: `7.Thermodynamics-GATE-ME-NOTES(S).pdf · p.92`.
   - Clicking Start launches global timer and opens the Reader at Page 92.
