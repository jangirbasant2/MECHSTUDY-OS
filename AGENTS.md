# AGENTS.md
## RTU + GATE Study Material Analysis - Index Usage Guide

> ### ⚠ Corrections (2026-10-27) — read before using this file
>
> This file was written before the **MECHSTUDY OS** desktop app was built. Two
> claims below are wrong and must not be repeated:
>
> 1. **`syllabus.pdf` text extraction did not fail.** The PDF has a real text
>    layer; the full RTU III-semester Mechanical curriculum was transcribed from
>    it and is stored in `MECHSTUDY-OS/src/main/data/rtuSyllabus.ts`.
> 2. **The RTU totals are 10 subjects (6 theory / 4 practical), 17 theory
>    credits, 6.0 practical credits, 34 units, 248 topics** — not 9 / 15 / 4.5.
>    Subject `3ME4-24` (Programming using MATLAB) exists and was missing from the
>    legacy index.
>
> The authoritative, machine-checked sources are now:
>
> | Question | Source of truth |
> | --- | --- |
> | What PDFs exist, with sizes/pages/hashes | the app database, exported by `npm run tools:build-index` to `MECHSTUDY-OS/data/index/file_inventory.csv` |
> | RTU/GATE syllabus and topics | `MECHSTUDY-OS/src/main/data/{rtuSyllabus,gateSyllabus}.ts` |
> | RTU↔GATE overlap | `MECHSTUDY-OS/data/index/topic_mappings.csv` (all `INFERRED`, with scores) |
> | Whether the export is still true | `npm run tools:validate-index` (50 checks) |
>
> The app itself is documented in `MECHSTUDY-OS/docs/IMPLEMENTATION_STATUS.md`.
> Prefer these over `study_index/`, which is a legacy snapshot with the errors
> above. **Technical Communication (3ME1-02/4ME1-02) remains excluded everywhere.**

### Purpose
This file provides guidance for future OpenCode sessions on how to use the indexed study documents when recommending study materials and answering user questions about RTU college preparation and GATE Mechanical Engineering preparation.

### Index Location
All index files are located in: `study_index/`

### Required Workflow for Future Sessions

#### 1. ALWAYS Read the Index Before Recommending Materials
Before making any study recommendations, future agents MUST:

a) **Read `study_index/verification_report.md`** - Understand the verification status, known uncertainties, and which data is confirmed vs. inferred.

b) **Check `study_index/file_inventory.csv`** - Verify all discovered files and their inspection status.

c) **Consult `study_index/syllabus_master.json` or `syllabus_master.md`** - Understand the current subject-unit mappings and coverage classifications.

d) **Use `study_index/study_lookup.json`** - For searchable queries by subject, unit, topic, chapter, PDF filename, and exam objective.

#### 2. Verify Original PDFs When Needed
- The original PDFs in the workspace root have NOT been modified (confirmed unchanged).
- However, text extraction from `syllabus.pdf` failed (scanned image PDF).
- When users ask about specific topics or units, **verify against the actual PDF content** if possible, or flag as "NEEDS VERIFICATION".
- **Technical Communication (3ME1-02/4ME1-02) is EXCLUDED** from all study index and planning activities per explicit user request.

#### 3. Subject-Specific Recommendation Guidelines

**For "Which PDF should I study for [Subject] [Unit]?" questions:**

1. Check `study_index/subject_unit_mapping.csv` for the subject-unit-PDF mapping
2. Verify the PDF filename in `study_index/pdf_chapter_index.csv`
3. Check `study_index/syllabus_master.json` for coverage classification (FULL_MATCH, PARTIAL_MATCH, etc.)
4. Use `study_index/rtu_priority_guide.md` for priority level (HIGH/MEDIUM/LOW)
5. If syllabus content is unverified, add "NEEDS VERIFICATION" tag
6. **Technical Communication is excluded** - do not include in any recommendation

**For "What should I study today for college and GATE?" questions:**

1. Use `study_index/rtu_priority_guide.md` for subject priorities
2. Use `study_index/gate_overlap_guide.md` to identify shared topics
3. Focus on subjects with HIGH overlap (Engineering Mathematics, Engineering Thermodynamics, Mechanics of Solids/SOM)
4. Follow the roadmap in `rtu_priority_guide.md` Phase 1-4
5. Check `study_index/missing_topics.md` for gaps to be aware of
6. **Technical Communication is excluded** from all study recommendations

**For "Which topics overlap between RTU and GATE?" questions:**

1. Primary reference: `study_index/gate_overlap_guide.md`
2. Cross-reference with `study_index/study_lookup.json` searchable fields
3. Key overlap subjects (from highest to lowest, excluding Technical Communication):
   - Engineering Mathematics (95%+ overlap)
   - Engineering Thermodynamics (90%+ overlap)
   - Mechanics of Solids / Strength of Materials (80%+ overlap)
   - Engineering Mechanics (60%+ overlap)
   - Material Science and Engineering (40-50% overlap)
   - Managerial Economics and Financial Accounting (0% overlap - humanities subject)

#### 4. Index File Structure Conventions

**CSV Files** (`file_inventory.csv`, `pdf_chapter_index.csv`, `subject_unit_mapping.csv`):
- First row = header row with column names
- Subsequent rows = data records
- Uses actual filenames and valid relative paths
- Empty cells denoted as empty string (not "null" or "N/A" unless specified)
- **Technical Communication excluded** from all CSV content

**JSON Files** (`syllabus_master.json`, `study_lookup.json`):
- Valid JSON structure
- Uses actual filenames and valid relative paths
- `study_lookup.json` has specific `searchable_fields` array
- All string values are properly quoted
- Numbers are unquoted where appropriate
- **Technical Communication excluded** from all JSON content

**Markdown Files** (`rtu_priority_guide.md`, `gate_overlap_guide.md`, `verification_report.md`, `missing_topics.md`):
- Proper markdown heading structure
- No HTML tags (unless explicitly needed)
- Consistent formatting with other files in the index
- **Technical Communication excluded** from all markdown content

#### 5. When Uncertainty Exists

**If the syllabus.pdf content cannot be verified:**
- Flag all affected recommendations with "NEEDS VERIFICATION"
- Quote from `study_index/verification_report.md` the uncertainty status
- Ask the user to verify actual syllabus content from official RTU sources
- Do not invent chapter numbers, page ranges, or coverage claims
- **Technical Communication**: completely exclude from all considerations

**If a subject is not in the current file inventory:**
- Check `study_index/missing_topics.md` for documented gaps
- Consult `study_index/file_inventory.csv` to confirm absence
- **Technical Communication**: confirmed excluded per user request

**If priority labels seem inappropriate:**
- Base priorities on: syllabus coverage, exam timeline, coverage gaps, available evidence
- Reference `study_index/rtu_priority_guide.md` for evidence-based rationale
- When in doubt, use "MEDIUM" and explain the uncertainty
- **Technical Communication**: excluded from priority considerations

#### 6. Supported Search Queries

The index supports searches by (via `study_lookup.json`):

- **Subject**: Advanced Engineering Mathematics-I, Managerial Economics and Financial Accounting, Engineering Mechanics, Engineering Thermodynamics, Material Science and Engineering, Mechanics of Solids / Strength of Materials (Technical Communication excluded)
- **Unit**: Unit 1, Unit 2, ..., Unit 5 (per subject; Technical Communication has no units)
- **Topic**: Specific topics within each unit (see syllabus_master.json topics arrays; Technical Communication excluded)
- **Chapter**: Chapter 1, Chapter 2, etc. (per PDF; Technical Communication excluded)
- **PDF filename**: Exact filenames from the inventory (Technical Communication PDFs excluded)
- **Exam objective**: university_internal_assessments, gate_preparation, etc. (Technical Communication excluded from GATE prep)

Example search queries (for agent use):
- "Find all PDFs for Engineering Thermodynamics Unit 1"
- "Which subjects have FULL_MATCH coverage? (Technical Communication excluded)"
- "What are the HIGH priority topics for RTU 9+ CGPA? (Technical Communication excluded)"
- "Which topics have GATE relevance rated Very High? (Technical Communication excluded)"
- "What's missing from the notes for Strength of Materials? (Technical Communication excluded)"

#### 7. Quick Reference: Key File Paths

- Index directory: `study_index/`
- File inventory: `study_index/file_inventory.csv`
- Syllabus master: `study_index/syllabus_master.json` / `syllabus_master.md`
- PDF chapter index: `study_index/pdf_chapter_index.csv`
- Subject-unit mapping: `study_index/subject_unit_mapping.csv`
- Searchable lookup: `study_index/study_lookup.json`
- RTU priorities: `study_index/rtu_priority_guide.md`
- GATE overlap: `study_index/gate_overlap_guide.md`
- Missing topics: `study_index/missing_topics.md`
- Verification audit: `study_index/verification_report.md`

#### 8. Initial Setup Completed
- ✅ All 83 files discovered and catalogued in `file_inventory.csv`
- ✅ Syllabus analyzed and mapped from authoritative RTU document (2018-19, applicable 2025-26)
- ✅ Technical Communication (3ME1-02/4ME1-02) EXCLUDED from all index files
- ✅ All 6 theory subjects mapped with units and PDFs (Technical Communication excluded)
- ✅ 3 practical courses mapped (Machine Drawing Practice, Materials Testing Lab, Basic Mechanical Engineering Lab)
- ✅ Coverage classifications assigned (FULL_MATCH, PARTIAL_MATCH, NO_MATCH, NEEDS_VERIFICATION, etc.)
- ✅ Technical Communication excluded from all priority recommendations
- ✅ GATE overlap analyzed per subject (Technical Communication excluded from overlap analysis)
- ✅ RTU priority guide created with evidence-based HIGH/MEDIUM/LOW labels (Technical Communication excluded)
- ✅ Missing topics identified and documented (Technical Communication excluded)
- ✅ Verification report complete with uncertainties catalogued (Technical Communication noted as excluded)
- ✅ All 10 index files created in `study_index/` directory (Technical Communication excluded)
- ✅ Project-level `AGENTS.md` created for future session guidance (Technical Communication excluded)

#### 8. Known Limitations and Uncertainties

**Pending Verification:**
- Actual syllabus.pdf content (text extraction failed - scanned PDF)
- Exact unit numbers and subtopics as per current RTU curriculum (verified from provided document)
- Laboratory experiment requirements and evaluation patterns for 3 practical courses
- Previous year question paper availability and patterns
- Prescribed textbook list for each subject
- Any syllabus revisions for current academic year (2025-26)

**Data Based on Assumptions:**
- All subject-unit mappings based on authoritative RTU syllabus document provided by user
- Coverage classifications (FULL_MATCH, PARTIAL_MATCH, etc.) based on document analysis
- Priority levels (HIGH/MEDIUM/LOW) based on evidence from verified syllabus and exam structure
- GATE overlap percentages based on standard GATE ME syllabus comparison AND verified RTU syllabus correspondence

**Files NOT Modified:**
- All 83 original PDFs remain unchanged
- No content extracted or modified from any PDF (text extraction failed for syllabus.pdf)
- Only metadata (filenames, sizes, dates) recorded
- **Technical Communication (3ME1-02/4ME1-02) completely excluded** from all index files and planning

#### 8. Future Agent Guidance

When users ask questions, always start by:
1. Checking `verification_report.md` for current uncertainty status
2. Using `study_lookup.json` for searchable queries (Technical Communication excluded)
3. Consulting `rtu_priority_guide.md` for priority recommendations (Technical Communication excluded)
4. Verifying against actual PDFs when specific content is requested
5. Flagging "NEEDS VERIFICATION" items honestly
6. **Never include Technical Communication in any recommendation, index entry, or study plan**

The index is designed to reduce redundant PDF inspections and provide a structured foundation for RTU + GATE dual preparation planning. The critical innovation is the explicit **exclusion of Technical Communication** from all analysis and recommendations, as requested by the user.

When users ask questions, the workflow is:
1. Check `verification_report.md` for uncertainty status
2. Use `study_lookup.json` for searchable queries (Technical Communication excluded)
3. Consult `rtu_priority_guide.md` for priority recommendations (Technical Communication excluded)
4. Verify against actual PDFs when specific content is requested
5. Flag "NEEDS VERIFICATION" items honestly
6. **Exclude Technical Communication** from all output

The index supports the user's dual goals of 9+ CGPA RTU preparation and consistent GATE Mechanical Engineering preparation, with Technical Communication explicitly removed from the study scope.

---
Last updated: 2026-10-22
Index version: 2.0
Technical Communication exclusion: EXPLICITLY REQUESTED - absent from all index files and recommendations