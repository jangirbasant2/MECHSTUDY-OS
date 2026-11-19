# MECHSTUDY OS 🎓⚙️

> **The Offline-First Academic Workspace & AI Study Brain for GATE Mechanical & IIT JEE Advanced**

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/jangirbasant2/MECHSTUDY-OS/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-0078D6.svg)]()
[![Electron](https://img.shields.io/badge/Electron-45.0.0-47848F.svg)]()
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)]()
[![SQLite](https://img.shields.io/badge/SQLite-FTS5-003B57.svg)]()
[![Offline First](https://img.shields.io/badge/offline-100%25-brightgreen.svg)]()

**MECHSTUDY OS** is a unified, high-performance desktop environment built for engineering students and aspirants preparing for **GATE Mechanical Engineering** and **IIT JEE Advanced (Physics, Chemistry, Mathematics)**, alongside **RTU Kota (B.Tech Mechanical)**.

It pairs an interactive PDF reader with real visual sticky notes, an offline SQLite database with **FTS5 full-text search**, scanned handwritten PDF OCR via Google AI Studio, spaced-repetition revision, authentic exam simulators (GATE 65 Qs / 180 min and IIT multi-type marking), and an AI study tutor powered by Google Gemini (`@google/genai`).

---

## ⚡ Key Highlights

- **🔄 Instant Global GATE ⟷ IIT Mode Switch:** A persistent top-center header switch that dynamically swaps theme accents, active syllabus trees (GATE Mechanical vs. IIT JEE PCM), formula vaults, PYQ questions, and exam simulator presets.
- **🔒 100% Offline Core & Private:** All notes, highlights, bookmarks, exams, and study data are stored strictly on your machine in local SQLite with FTS5 search. Original PDFs are never modified.
- **📚 Scanned Handwritten PDF OCR & FTS5 Search:** Built-in background engine detects scanned image pages, extracts text and LaTeX formulas using the Google AI Studio API, and indexes them into SQLite FTS5 for instant search across handwritten notes.
- **🤖 Next-Gen Google AI Studio Brain (`@google/genai`):** Contextual AI study tutor powered by Gemini (`gemini-4-hydrogen`, `gemini-3.5-flash-lite`, `gemini-4-carbon`). No complex local GPU or Ollama configuration needed—simply input your free API key in the top header.
- **⏱️ Dual Exam Simulation Engine:** 
  - **GATE ME Mode:** 65 Qs / 180 min / 100 marks, MCQ (-1/3, -2/3), MSQ & NAT (0 negative), with built-in official Virtual Scientific Calculator.
  - **IIT Mode:** Authentic IIT JEE Advanced marking schemes (Single Correct, Multi-Correct with partial marking, Integer/Numerical, Matrix Match) with virtual calculator strictly prohibited.
- **🎯 Verified Curriculum Mapping:** Complete RTU Kota III-Semester Mechanical curriculum and IIT JEE Advanced syllabus cross-mapped with topic coverage tracking.
- **🔁 Spaced Repetition & Mistake Book:** Automatic revision alerts based on forgetting curves and a dedicated mistake book for tracking conceptual slips, formula errors, and calculation slips.

---

## 📸 Overview & Interface

| Section | Capabilities |
| :--- | :--- |
| **Global Exam Switch** | Top-center toggle dynamically switches between **GATE Mechanical** and **IIT JEE Advanced** presets. |
| **AI Studio Menu** | Top header dropdown (300px) with secure API key storage, live connection indicator, model selector, and auto-OCR toggle. |
| **PDF Reader** | PDF.js v5 engine, visual sticky notes, text highlights, margin notes, and in-document FTS5 search. |
| **AI Study Tutor** | Contextual sidebar tutor, diagram screenshot analysis, formula derivations, and step-by-step problem solver. |
| **Syllabus Explorer** | Interactive RTU, GATE ME, and IIT JEE Advanced syllabus trees with topic status and progress tracking. |
| **Formula Vault** | Comprehensive formula handbook for GATE Mechanical and IIT JEE Physics, Chemistry, and Mathematics. |
| **Exam Simulator** | Authentic GATE & IIT exam interface with question palette, answer submission, timer, and detailed scoring analytics. |
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
| **RAM** | 4 GB | 8 GB |
| **Disk Space** | 300 MB for application | 500 MB+ (plus space for your own PDF documents) |
| **Architecture** | x64 (64-bit) | x64 (64-bit) |

---

## 🤖 Optional: Setting up the Google AI Studio Brain

MECHSTUDY OS works 100% offline for reading, formulas, syllabus tracking, and exam practice. To enable the AI Study Tutor and Scanned PDF OCR:

1. **Get an API Key:** Create a free API key at [Google AI Studio](https://aistudio.google.com/).
2. **Open the AI Menu:** Click the **Google AI Studio** button in the top-right header of MECHSTUDY OS.
3. **Paste & Connect:** Paste your API key and click **Save & Connect**.
4. **Choose Model:** Select from `gemini-4-hydrogen`, `gemini-3.5-flash-lite`, or `gemini-4-carbon`.
5. **Auto-OCR:** Enable the *Auto-OCR on PDF Import* switch if you want scanned handwritten notes indexed automatically.

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
| **AI Integration** | `@google/genai` (Gemini SDK) | Multimodal streaming, diagram visual inspection, and OCR extraction. |
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
<b>No for core features.</b> Everything—including the PDF reader, PYQ question bank, syllabus trees, exam simulations, notes, and formula vaults—runs completely offline on your computer. An internet connection is only needed when communicating with Google AI Studio (Gemini) for AI tutor questions or scanned handwritten PDF OCR.
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
