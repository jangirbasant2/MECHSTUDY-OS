# MECHSTUDY OS 🎓⚙️

> **The Offline-First Academic Workspace & Local AI Brain for RTU Kota & GATE Mechanical Engineering**

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/jangirbasant2/MECHSTUDY-OS/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-0078D6.svg)]()
[![Electron](https://img.shields.io/badge/Electron-45.0.0-47848F.svg)]()
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)]()
[![SQLite](https://img.shields.io/badge/SQLite-FTS5-003B57.svg)]()
[![Offline First](https://img.shields.io/badge/offline-100%25-brightgreen.svg)]()

**MECHSTUDY OS** is a unified, high-performance desktop environment built specifically for Mechanical Engineering students preparing for **RTU Kota (B.Tech Mechanical, III Semester)** university examinations and the **GATE Mechanical Engineering** competitive exam.

It pairs an interactive PDF reader with real visual sticky notes, an offline SQLite database with full-text search, spaced-repetition revision, timed GATE-style mock tests, and an optional local AI tutor powered by Ollama.

---

## ⚡ Key Highlights

- **🔒 100% Offline & Private:** Zero cloud tracking, zero telemetry, zero accounts. All notes, highlights, and study data remain strictly on your machine.
- **📚 PDF-Aware Document Intelligence:** High-performance reader featuring real visual sticky notes, text highlighting, and margin notes stored independently in SQLite — **original PDFs are never modified**.
- **🤖 Local AI Study Brain (Zero API Costs):** Connects to your local [Ollama](https://ollama.com/) instance (`qwen3:4b`, `llama3.2-vision`, `phi4`, `deepseek-r1`) to draft study plans, summarize complex topics, and analyze diagrams via screenshot clipping.
- **⏱️ Timed Mock Test Engine:** Authentic GATE exam interface with MCQ, MSQ, and NAT questions, formula keypad, official marking schemes (+1/+2, negative marks, key range verification), and in-depth performance analytics.
- **🎯 Verified Curriculum Mapping:** Fully transcribed 2018–19 RTU Kota III-Semester Mechanical curriculum (10 subjects, 17 theory credits, 6 practical credits, 34 units, 248 topics) cross-mapped against the official GATE Mechanical Engineering syllabus.
- **🔄 Spaced Repetition & Mistake Book:** Automatic revision alerts based on forgetting curves and a dedicated mistake book for tracking conceptual slips, formula errors, and calculation slips.

---

## 📸 Overview & Interface

| Section | Capabilities |
| :--- | :--- |
| **Home Dashboard** | Daily study targets, streak tracker, Pomodoro/stopwatch timer, and spaced revision alerts. |
| **PDF Reader** | PDF.js v5 engine, visual yellow/cyan/pink sticky notes, text highlights, margin notes, and clean export. |
| **AI Study Tutor** | Contextual sidebar tutor, document picker for multi-session study planning, and screenshot visual analysis. |
| **Syllabus Explorer** | Interactive RTU & GATE syllabus trees with topic status, credit counts, and inferred overlap scores. |
| **Practice & Questions** | Searchable PYQ question bank, answer key verification, formula input support, and topic tagging. |
| **Timed Exam Mode** | Timed test simulation, question palette, mark for review, auto-submit on countdown expiry, and scoring. |
| **Analytics & History** | Weekly study hours, subject breakdown, mistake category charts, and session management. |

---

## 🚀 Installation

MECHSTUDY OS requires **no pre-installed programming languages or runtime tools** (no Node.js, Python, Git, or VS Code required).

### Option 1: One-Line PowerShell Installation (Recommended)

Open **PowerShell** (press `Win + X`, then choose **Terminal** or **PowerShell**) and paste:

```powershell
irm https://raw.githubusercontent.com/jangirbasant2/MECHSTUDY-OS/main/install.ps1 | iex
```

*This downloads the verified installer from the latest GitHub release, confirms file integrity, and launches setup with zero configuration.*

---

### Option 2: Direct Windows Installer

1. Go to the [**Latest GitHub Releases**](https://github.com/jangirbasant2/MECHSTUDY-OS/releases).
2. Download **`MECHSTUDY-OS-Setup-1.0.0.exe`**.
3. Double-click the downloaded executable and follow the setup wizard.
4. Launch **MECHSTUDY OS** from your Desktop or Start Menu.

*(A standalone portable version, `MECHSTUDY-OS-Portable-1.0.0.exe`, is also available for running directly from USB without installation).*

---

## 💻 System Requirements

| Specification | Minimum | Recommended |
| :--- | :--- | :--- |
| **Operating System** | Windows 10 (64-bit, build 19041+) | Windows 11 (64-bit, 22H2+) |
| **Processor** | Dual-core Intel / AMD 64-bit | Quad-core Intel Core i5 / AMD Ryzen 5 or higher |
| **RAM** | 4 GB | 8 GB (16 GB if running large local AI models) |
| **Disk Space** | 300 MB for application | 500 MB+ (plus space for your own PDF documents) |
| **Architecture** | x64 (64-bit) | x64 (64-bit) |

---

## 🤖 Optional: Setting up the Local AI Brain

MECHSTUDY OS works 100% offline without AI. To enable the local AI Tutor and document intelligence features at zero cost:

1. **Install Ollama:** Download and install [Ollama for Windows](https://ollama.com/download/windows).
2. **Download a Recommended Model:**
   Open PowerShell and pull one or both of our tuned study models:
   ```powershell
   # Ultra-fast, lightweight study tutor (3.5 GB):
   ollama pull qwen3:4b

   # Multimodal vision model for analyzing diagram screenshots (2.8 GB):
   ollama pull llama3.2-vision
   ```
3. **Launch MECHSTUDY OS:** The app automatically detects Ollama running on `http://127.0.0.1:11434`.

---

## 🛠️ Technology Stack

| Layer | Component | Description |
| :--- | :--- | :--- |
| **Desktop Shell** | Electron 45 (Node 24.22) | High-performance, memory-optimized desktop runtime with isolated IPC. |
| **Frontend Framework** | React 19 + TypeScript | Strict typing, reactive state, and atomic component architecture. |
| **Build & Tooling** | Vite 7 (`electron-vite` 4) | Instant Hot Module Replacement and production chunk splitting. |
| **Styling** | Tailwind CSS v4 | Dark/light theme engine, custom CSS variables, and layout recovery rails. |
| **Local Database** | `node:sqlite` (SQLite 3.53) | Built-in SQLite with **FTS5 full-text indexing**, WAL mode, and zero native recompilation. |
| **PDF Engine** | `pdfjs-dist` 5.4 & `pdf-lib` 1.17 | Text layer extraction, canvas rendering, and zero-loss annotated PDF export. |
| **Math Typography** | KaTeX 0.16 + `remark-math` | Hardware-accelerated rendering of engineering formulas and LaTeX equations. |
| **State Management** | Zustand 5 | Lightweight, persistent state with session layout restoration. |

---

## 🛡️ Data Safety & Storage Policy

- **Application Directory:** Installed to `%LOCALAPPDATA%\Programs\MECHSTUDY OS\`
- **User Database & Notes:** Stored safely in `%APPDATA%\MECHSTUDY OS\data\mechstudy.db`
- **Upgrade Protection:** Installing application updates or running installers **never deletes or overwrites** your personal study database, notes, or bookmarks.
- **Clean Library Separation:** When shared with others, the software contains the engineering curriculum and question engine, while personal study libraries and PDFs remain strictly private on the user's computer.

---

## ❓ Frequently Asked Questions (FAQ)

<details>
<summary><b>Does MECHSTUDY OS modify my existing PDF files?</b></summary>
<br>
<b>Never.</b> The application treats all user PDFs as strictly read-only. Highlights, bookmarks, sticky notes, and reading progress are stored in your local SQLite database. If you wish to save notes into a PDF, the Export feature generates a brand-new copy with embedded annotations.
</details>

<details>
<summary><b>Do I need an internet connection to use the app?</b></summary>
<br>
<b>No.</b> Everything—including the PDF reader, question bank, syllabus trees, exam simulations, notes, and local AI (via Ollama)—runs completely offline on your computer.
</details>

<details>
<summary><b>Can I import my own PDFs and GATE notes?</b></summary>
<br>
<b>Yes.</b> Navigate to <b>My Library</b> or <b>Import & Indexing</b> to select folders or individual PDF files from your machine. The app indexes text layers and organizes them by subject automatically.
</details>

<details>
<summary><b>Is Technical Communication included in the RTU syllabus?</b></summary>
<br>
<b>No.</b> Per curriculum rules, Technical Communication (3ME1-02/4ME1-02) is strictly excluded across all syllabus trees, study planners, practice modules, and exams.
</details>

---

## 🗑️ Uninstallation

- **Standard Method:** Open **Windows Settings** > **Apps** > **Installed apps** > Find **MECHSTUDY OS** > Click **Uninstall**.
- **PowerShell Script:** Run `.\uninstall.ps1` to cleanly remove the program files while keeping your study database safe.

---

## 📄 License & Credits

MECHSTUDY OS is open-source software licensed under the **[MIT License](LICENSE)**.  
Designed and engineered for Mechanical Engineering students by **Basant Jangir**.
