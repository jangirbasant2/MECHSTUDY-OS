# Changelog: MECHSTUDY OS

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-11-17

### Added
- **Interactive PDF Reader:**
  - High-performance PDF viewing using PDF.js v5 with smooth zoom, fit-to-width, fit-to-page, and dual-page modes.
  - Realistic visual sticky notes with dog-ear corners, color customization, text editing, and minimization toggles.
  - Geometry-normalized text highlighting and margin annotations saved to local SQLite database without altering the original PDF files.
  - Clean PDF export: Generates new PDF with embedded annotations via `pdf-lib` without modifying source documents.
  - Screenshot clipping tool with automatic 5-message countdown and expiry to protect disk space.
- **Academic AI Brain & Contextual Tutor:**
  - Seamless local AI integration with Ollama (`127.0.0.1:11434`).
  - Supports multiple local models: `qwen3:4b`, `llama3.2-vision`, `phi4`, and `deepseek-r1`.
  - Document-aware study planning: Select PDFs from library to construct structured, multi-session study schedules.
  - Contextual sidebar tutor: Explain text selections, generate practice questions, and analyze mechanical diagrams directly from the PDF reader.
- **Curriculum Architecture:**
  - Official RTU Kota B.Tech Mechanical (Semester III) curriculum: 10 subjects (6 theory / 4 practical), 17 theory credits, 6.0 practical credits, 34 units, 248 topics.
  - Official GATE Mechanical Engineering syllabus mapping with inferred topic overlap analysis and confidence scoring.
  - Strict exclusion of Technical Communication (`3ME1-02` / `4ME1-02`) per user request.
- **Timed Exam & Question Bank:**
  - Timed mock test engine with official GATE marking schemes (+1 / +2 marks, negative marking for MCQs, NAT range checking).
  - Built-in mathematical expression evaluator supporting trigonometric functions, logs, roots, and percentages.
  - Interactive question palette, flag for review, and detailed post-exam performance breakdowns by subject and question type.
  - Spaced-repetition revision center and Mistake Book to track and review conceptual slips.
- **Study Planner & Analytics:**
  - Daily study dashboard with streak tracking, task timers (Stopwatch / Pomodoro), and desktop study reminders.
  - Comprehensive study history management with session editing, deletion, and real-time duration recalculation.
- **Packaging & Deployment:**
  - Production Windows NSIS Installer (`MECHSTUDY-OS-Setup-1.0.0.exe`) with desktop/start-menu shortcuts and safe uninstallation.
  - Standalone Portable Windows executable (`MECHSTUDY-OS-Portable-1.0.0.exe`).
  - One-line PowerShell installation script (`install.ps1`) for non-technical users.
  - Fully automated GitHub Actions CI/CD release workflow (`.github/workflows/build-windows.yml`).
