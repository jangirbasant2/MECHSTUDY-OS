# MECHSTUDY AI — User Guide
## Personal Academic Brain for MECHSTUDY-OS

Welcome to **MECHSTUDY AI — Your Personal Academic Brain**, an intelligent, offline-capable academic assistant integrated directly into MECHSTUDY-OS.

---

## 1. Prerequisites & Quick Setup

MECHSTUDY AI uses **Ollama** as its local inference engine. It runs 100% locally on your machine with no required cloud subscriptions, API keys, or telemetry.

### Step 1: Ensure Ollama is Installed & Running
1. Open PowerShell or Command Prompt.
2. Verify Ollama is installed:
   ```powershell
   ollama --version
   ```
3. If not already running, start the Ollama server:
   ```powershell
   ollama serve
   ```
   *(Or launch the Ollama Windows tray application).*

### Step 2: Download Recommended Models
For your hardware (**Intel Core i7 12th Gen, NVIDIA RTX 3050 4GB VRAM, 16GB RAM**), 3B to 4B models fit primarily inside your 4GB VRAM for rapid token generation. 8B models can be used with partial layer offload to system RAM.

Recommended commands:
```powershell
# Primary 4B model (fast, accurate, fits in 4GB VRAM):
ollama pull qwen3:4b

# Alternative high-speed 3B model:
ollama pull llama3.2:3b

# Local embedding model for document retrieval:
ollama pull nomic-embed-text

# Optional 8B model (deeper reasoning, partially offloaded to system RAM):
ollama pull qwen3:8b
```

---

## 2. Navigating the AI Brain Interface

Open MECHSTUDY-OS and click **MECHSTUDY AI** in the left sidebar (under the AI Brain section).

The interface is divided into 5 specialized modes via the top tabs:

### 💬 1. Academic Chat
The core natural language conversational interface.
- **Conversations Sidebar:** Browse past conversations, start a new chat, search chat history, or pin key sessions.
- **Model Selector:** Check which model is currently running and switch models on the fly in Settings.
- **Rich Markdown & LaTeX:** Equations render in standard mathematical typography with KaTeX (e.g. $E = mc^2$, $\sigma = \frac{P}{A}$, $\oint \frac{\delta Q}{T} \le 0$).
- **Tool Calling Chips:** When the AI inspects your schedule, creates tasks, or searches your notes, it shows an expandable badge indicating the tool executed.
- **Verified Citations:** When the AI cites your study documents, it renders a citation badge with an **Open** button that opens that exact document and page in the PDF Reader!

### 🎓 2. AI Tutor
A dedicated tutoring experience designed specifically for mechanical engineering with 4 explanation levels:
1. **Beginner:** Focuses on real-world physical intuition, everyday analogies, and foundational principles.
2. **University Exam:** Focuses on RTU Kota syllabus requirements, textbook format derivations, and formal proofs.
3. **GATE ME:** Focuses on numerical tricks, formulaic shortcuts, boundary cases, and eliminating common exam traps.
4. **Advanced Engineering:** Rigorous continuum mechanics, governing differential equations, and deep thermodynamic state analysis.

### 📅 3. Study Planner
Manage your academic calendar using plain English:
- *"Schedule thermodynamics tomorrow from 6 PM to 8 PM."*
- *"Plan my next 7 days for GATE preparation."*
- *"I have completed Engineering Mathematics Unit 1. Schedule Unit 2."*
- *"Move today's study session to tomorrow."*
- *"Check if I have any schedule conflicts this weekend."*

**Automatic Academic Constraints:**
- The AI protects your **College Hours** (default `10:00 AM – 5:00 PM`).
- It alerts you if a proposed study schedule exceeds your **Max Daily Study Cap** (default `6 hours`).
- It avoids scheduling over existing exam sessions or study tasks.

### 🧠 4. Academic Memory
View and manage what the AI remembers about your academic journey across sessions.
- **Categories:** Academic Goals, Preferences, Weak Areas, Study Constraints, Facts.
- The AI automatically extracts key goals (e.g. "Targeting top 100 in GATE 2027") and remembers them in SQLite.
- You can manually add, edit, or delete any memory row.

### ⚙️ 5. AI Settings
Fine-tune your local inference engine:
- **Ollama Host URL:** Default `http://127.0.0.1:11434`.
- **Model Selection:** Pick any installed Ollama model.
- **Temperature:** Slide between 0.2 (strict factual/derivation) to 0.9 (creative explanations).
- **Context Length:** Configure context window (2048, 4096, 8192 tokens). Default 4096 is optimized for 4GB VRAM.
- **Auto-RAG:** Enable or disable automatic note search and retrieval.

---

## 3. Available Tools Reference

The AI orchestrator has access to 18 controlled, sandboxed tools:

| Category | Tool | Description |
|---|---|---|
| **Scheduling** | `get_today_schedule` | Reads today's planned tasks from SQLite |
| | `get_week_schedule` | Reads the 7-day study timetable |
| | `create_task` | Creates a new study task with date, duration, priority |
| | `update_task` | Marks tasks done or updates notes |
| | `delete_task` | Deletes a task (prompts confirmation) |
| | `reschedule_task` | Moves a task to a different calendar date |
| | `check_schedule_conflicts` | Detects time collisions with college hours or daily caps |
| **Progress** | `get_study_progress` | Summarizes RTU and GATE syllabus completion percentages |
| | `update_study_progress` | Marks syllabus topics completed or mastered |
| | `get_completed_topics` | Lists recently completed syllabus topics |
| | `get_pending_topics` | Lists topics remaining to be studied |
| | `get_weak_topics` | Analyzes mistake book and low-accuracy topics |
| | `get_subject_progress` | Detailed breakdown of a single subject |
| **Documents** | `search_notes` | FTS5 + semantic keyword search over notes and PDFs |
| | `retrieve_document_content` | Retrieves page text from `document_pages` |
| | `get_document_details` | Metadata about PDF in the library |
| **Practice & Exam**| `generate_quiz` | Fetches authentic practice questions from PYQ bank |
| | `create_study_session` | Logs completed study hours in SQLite |
| | `get_exam_history` | Lists past mock test scores |
| | `analyze_exam_performance` | Analyzes score trends and negative marks |

---

## 4. Hardware Optimization for RTX 3050 (4GB VRAM)

Your laptop is equipped with an **Intel Core i7 12th Gen**, **NVIDIA RTX 3050 (4GB VRAM)**, and **16GB RAM**.

- **Best Overall Balance:** Run `qwen3:4b` or `llama3.2:3b`. These models require approximately 2.2 GB – 2.6 GB VRAM, fitting comfortably into your GPU. Generation speed will be 35–55 tokens/second.
- **Context Length:** Keep the context length set to **4096** in AI Settings. 8192 tokens can consume an additional 1GB of KV-cache memory.
- **Large Models (8B):** If you run `qwen3:8b` or `llama3.1:8b`, Ollama will automatically allocate ~3GB to GPU VRAM and offload the remaining layers to your 16GB system RAM. Generation will be smooth at ~12–18 tokens/second.

---

## 5. Troubleshooting & FAQ

#### Q: The AI status bar shows "Ollama Offline".
**Fix:** Open PowerShell and run `ollama serve`. Click **Retry Connection** in MECHSTUDY-OS. If Ollama is installed on a custom port, update the server URL in **AI Settings**.

#### Q: How does the AI know what is in my handwritten notes?
**Fix:** MECHSTUDY-OS extracts the text layer from PDFs and allows optional OCR for scanned pages. The AI uses SQLite FTS5 index to search and retrieve page contents.

#### Q: Can the AI delete my notes or edit my original PDFs?
**Answer:** **Never.** Original PDFs in the library are strictly read-only and never modified. Deleting a task or schedule through the AI requires explicit user confirmation.

#### Q: Technical Communication (3ME1-02/4ME1-02) is missing from recommendations?
**Answer:** Per explicit curriculum requirements, Technical Communication is intentionally excluded from all syllabus mappings, study recommendations, and AI scheduling.


---

## 6. PDF-Aware Study Planning & Scanned PDF OCR

MECHSTUDY AI integrates directly with your local PDF library, extracting text from digital PDFs and scanned handwritten notes using local Tesseract 5 OCR.

### Step 1: Attach Study Materials to a Conversation
1. In the **AI Brain** page, locate the **Study Materials** toolbar right above the conversation area.
2. Click **"+ Add Study Materials"** (or **"Manage Materials"**).
3. In the picker dialog, search across your 69 library PDFs (e.g., search *"Thermodynamics"*, *"Entropy"*, or *"Nag"*).
4. Select one or multiple PDFs.
5. Click **"Attach Selected"**.

### Step 2: Automatic Scanned vs Digital Detection & OCR
- **Digital Text PDFs (e.g. PK Nag):** The system detects the embedded text layer and extracts it in seconds.
- **Scanned Handwritten Notes (e.g. GATE handwritten notes):** The system detects that the PDF contains scanned images instead of text.
  - Click **"Extract / OCR"** on any attached document chip or from inside the picker.
  - MECHSTUDY-OS uses your local **Tesseract 5 OCR** (`tesseract.exe`) to render pages off-screen, parse text and word confidence, and index the content into SQLite FTS5.
  - A real-time progress bar shows completed pages, confidence, and preview snippets.

### Step 3: Content-Aware Timetable Generation
Ask the AI:
> *"Create a study plan for today. I want to complete entropy using my selected thermodynamics notes."*

The AI will:
1. Locate the attached documents in SQLite.
2. Search through the extracted text/OCR for the exact page range where "Entropy" appears (e.g. pages 45–65).
3. Estimate content density (theory, derivations, numerical problems).
4. Divide the topic into structured sessions tied to **exact page numbers**.
5. Save the sessions directly into `study_tasks` in SQLite and notify the Planner.

### Step 4: One-Click Navigation & Study Timer
- Open the **Planner** page to see the AI Plan card and scheduled sessions with the `📄 [Notes.pdf] · p. [Page]` badge.
- Click **"Start"** on any study session:
  1. The global study timer starts automatically.
  2. The application opens your study PDF directly at that exact page in the Reader!
  3. The timer continues running across pages so you can study without interruption.
