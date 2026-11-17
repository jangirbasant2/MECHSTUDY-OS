# MECHSTUDY AI — Personal Academic Brain
## Implementation Plan & System Architecture

**Document Version:** 1.0.0  
**Target Application:** MECHSTUDY-OS (v1.0.0)  
**Host Target:** Windows 11 x64, Intel Core i7 12th Gen, NVIDIA RTX 3050 (4GB VRAM), 16GB System RAM  
**Default LLM Provider:** Local Ollama (`http://127.0.0.1:11434`)  
**Recommended Local Models:** `qwen3:4b`, `llama3.2:3b`, `qwen3:8b`, with `nomic-embed-text` for local embeddings  

---

## 1. Executive Summary & Vision

**MECHSTUDY AI — Your Personal Academic Brain** is a local, privacy-first, zero-subscription academic co-pilot built directly into MECHSTUDY-OS. Rather than acting as an isolated chatbot, MECHSTUDY AI functions as an intelligent academic operating system assistant capable of:

1. **Reasoning over the student's actual syllabus and library:** Understanding the RTU B.Tech Mechanical III-semester curriculum (10 subjects, 34 units, 248 topics) and GATE 2027 ME syllabus (5 sections, 165 topics).
2. **Retrieving real handwritten study notes and official texts (RAG):** Searching the 66-PDF corpus and extracted text layers/OCR with verifiable page citations.
3. **Controlling and automating application operations via a sandboxed Tool Registry:** Creating, rescheduling, and analyzing tasks, sessions, reviews, and questions without ever executing arbitrary SQL or raw filesystem calls.
4. **Maintaining persistent Academic Memory:** Tracking completed topics, weak areas, revision schedules, exam performance, and daily study habits in SQLite.
5. **Operating entirely offline on consumer hardware:** Optimized for 4GB VRAM (RTX 3050) using streaming inference, lightweight quantized models (Qwen 3 4B / Llama 3.2 3B), and local embedding vectors.

---

## 2. System Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            MECHSTUDY-OS RENDERER                             │
│                                                                              │
│  ┌───────────────────────┐  ┌──────────────────────────────────────────────┐ │
│  │   Sidebar Navigation  │  │               AI Brain Pages                 │ │
│  │  ┌─────────────────┐  │  │  ┌───────────┐ ┌───────────┐ ┌─────────────┐ │ │
│  │  │ 🧠 AI Brain     │  │  │  │  AI Chat  │ │ AI Tutor  │ │ AI Planner  │ │ │
│  │  └─────────────────┘  │  │  └───────────┘ └───────────┘ └─────────────┘ │ │
│  └───────────────────────┘  │  ┌───────────┐ ┌───────────┐ ┌─────────────┐ │ │
│                             │  │ AI Daily  │ │ AI Memory │ │ AI Settings │ │ │
│                             │  └───────────┘ └───────────┘ └─────────────┘ │ │
│                             └──────────────────────────────────────────────┘ │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ Typed IPC Bridge (window.api.ai.*)
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                        ELECTRON MAIN PROCESS (Node 24)                       │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                            AI Orchestrator                             │  │
│  │  - Context Manager (Conversation history + Academic Memory + Rules)    │  │
│  │  - Tool Call Dispatcher & Loop Manager                                 │  │
│  │  - Token Streaming & Event Emitter to Renderer                         │  │
│  └─────────┬──────────────────────┬───────────────────────┬───────────────┘  │
│            │                      │                       │                  │
│            ▼                      ▼                       ▼                  │
│  ┌─────────────────┐    ┌──────────────────┐    ┌────────────────────┐       │
│  │  Ollama Engine  │    │  Tool Registry   │    │  RAG Engine        │       │
│  │  - Health check │    │  - Scheduling    │    │  - FTS5 Keyword    │       │
│  │  - Model list   │    │  - Academic Prog │    │  - Local Embeddings│       │
│  │  - Streaming    │    │  - Notes & Docs  │    │  - Passage Ranking │       │
│  │  - Fallback     │    │  - Exams & Timer │    │  - Citation Verify │       │
│  └────────┬────────┘    └─────────┬────────┘    └─────────┬──────────┘       │
│           │                       │                       │                  │
│           ▼                       ▼                       ▼                  │
│     Ollama Server         Existing App Services      SQLite DB (WAL)         │
│     127.0.0.1:11434       (study, library, etc.)    (schema migrations)      │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema Extensions (Migration 8)

The existing SQLite database (`node:sqlite` in WAL mode) is extended with forward-only Migration 8. No existing tables are modified or dropped.

### Migration 8: `ai_assistant`

```sql
-- Conversations Table
CREATE TABLE IF NOT EXISTS ai_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  model TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'chat', -- 'chat' | 'tutor' | 'planner'
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated ON ai_conversations(updated_at DESC);

-- Messages Table
CREATE TABLE IF NOT EXISTS ai_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- 'user' | 'assistant' | 'system' | 'tool'
  content TEXT NOT NULL,
  tool_calls_json TEXT,    -- Array<{ id: string, name: string, arguments: any }>
  tool_results_json TEXT,  -- Array<{ tool_call_id: string, name: string, result: any }>
  citations_json TEXT,     -- Array<{ documentId: number, filename: string, page: number, snippet: string }>
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conv ON ai_messages(conversation_id, id ASC);

-- Persistent Academic Memory Table
CREATE TABLE IF NOT EXISTS ai_memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL, -- 'preference' | 'academic_goal' | 'weakness' | 'constraint' | 'fact'
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'user', -- 'user' | 'inferred' | 'exam_performance'
  confidence REAL NOT NULL DEFAULT 1.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_memories_cat ON ai_memories(category);

-- Tool Execution Audit Log Table
CREATE TABLE IF NOT EXISTS ai_tool_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER REFERENCES ai_conversations(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  arguments_json TEXT,
  result_json TEXT,
  status TEXT NOT NULL, -- 'success' | 'failed' | 'denied'
  execution_time_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_tool_logs_time ON ai_tool_logs(created_at DESC);

-- Semantic Embedding Cache Table (for RAG Chunks)
CREATE TABLE IF NOT EXISTS ai_document_embeddings (
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL,
  embedding_json TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (document_id, page, chunk_index)
);
```

---

## 4. Backend Service Modules (`src/main/services/ai/`)

| Service | Purpose |
|---|---|
| `ollama.ts` | Ollama client: health detection, version check, model enumeration, streaming chat completion, embedding generation. |
| `orchestrator.ts` | Main AI loop: assembles system prompt, historical context, RAG passages, invokes Ollama, handles tool calls recursively (up to 5 steps), streams tokens to renderer. |
| `toolRegistry.ts` | Strictly validated tool definitions, JSON schemas, argument sanitation, execution dispatch to existing services, security enforcement. |
| `memory.ts` | Academic memory CRUD, extraction of facts from conversations, retrieval of active memory for prompt injection. |
| `rag.ts` | Hybrid retrieval (FTS5 + semantic embeddings with `nomic-embed-text`), chunk ranking, context window budget management, citation verification. |
| `planner.ts` | Natural language schedule parsing, conflict detection against existing tasks/commitments, slot suggestion, weekly study roadmap generator. |
| `tutor.ts` | Academic prompt engineering for 4 levels (Beginner, RTU University Exam, GATE ME, Advanced), numerical problem solver, step-by-step math formatter. |
| `settings.ts` | AI settings getter/setter backed by SQLite `settings` table with sensible hardware-aware defaults. |

---

## 5. IPC Contract Extensions (`src/shared/api.ts` & `src/shared/types.ts`)

Channels exposed under `window.api.ai`:
- `status(): Promise<AiEngineStatus>` (Ollama running, version, active model, memory stats)
- `listModels(): Promise<AiModelInfo[]>` (available Ollama models with sizes and parameter counts)
- `conversations(mode?: string): Promise<AiConversationSummary[]>`
- `createConversation(title?: string, model?: string, mode?: string): Promise<AiConversationSummary>`
- `getConversation(id: number): Promise<AiConversationDetail | null>`
- `deleteConversation(id: number): Promise<boolean>`
- `clearConversation(id: number): Promise<boolean>`
- `sendMessage(req: SendMessageRequest): Promise<{ messageId: number }>`
- `stopGeneration(): Promise<void>`
- `onStream(cb: (chunk: AiStreamChunk) => void): Unsubscribe`
- `getMemories(category?: string): Promise<AiMemory[]>`
- `saveMemory(key: string, content: string, category: string): Promise<void>`
- `deleteMemory(id: number): Promise<boolean>`
- `executeToolDirect(name: string, args: any): Promise<any>` (for UI debugging & manual confirmation)
- `settings(): Promise<AiSettings>`
- `updateSettings(patch: Partial<AiSettings>): Promise<void>`

---

## 6. Security & Guardrails

1. **Zero SQL Injection:** The LLM is never given raw SQL access or database write capabilities. All database interactions route through typed functions in `src/main/services/study.ts`, `library.ts`, and `practice.ts`.
2. **Filesystem Isolation:** The LLM cannot read or write arbitrary files on disk. Document reading is restricted to documents registered in the `documents` table via `mechstudy://doc/<id>` or `document_pages`.
3. **Destructive Operation Confirmations:** Deleting tasks, deleting exam sessions, or clearing schedules require explicit user confirmation or non-destructive defaults.
4. **Validation of Parameters:** Every date, duration, topic ID, and subject code is validated before calling backend services.
5. **Audit Logging:** Every tool invocation is recorded in `ai_tool_logs` with timestamps and execution status.

---

## 7. Phased Implementation Roadmap

- **Phase 1: Local LLM Engine & Streaming Chat**
  - Ollama client detection, model discovery, and error handling.
  - Streaming IPC via Electron `webContents.send` and preload subscriber.
  - SQLite Migration 8.
  - AI Brain Chat page with conversation history, markdown + KaTeX rendering, model selector, suggested prompt chips.
  - Unit and integration tests for Ollama service and conversation storage.

- **Phase 2: Intelligent Tool Registry & Planner Integration (Completed)**
  - Comprehensive tool registry (`create_study_plan`, `add_study_session`, `get_study_plan`, `update_study_session`, `delete_study_session`, `start_study_session`, `complete_study_session`, `get_today_schedule`, `get_study_progress`).
  - Dynamic subject and topic syllabus resolution (e.g. Thermodynamics -> `3ME4-05`, Entropy -> Unit 2 Topic 121).
  - Conflict checking against college hours (`10:00-17:00`) and daily study hour caps.
  - Multi-session structured study plan generation with automatic insertion into `study_tasks` in SQLite.
  - Real-time `planner:refresh` and `session:update` IPC notification bus between Main and Renderer.
  - Planner UI Hero Card (`AiPlanOverview`) showing progress bar, planned duration, and interactive session controls (**Start**, **Pause**, **Resume**, **Complete**, **Reschedule**).
  - Global study timer persistence across navigation and application restart via `localStorage` and 15s SQLite sync.
  - Automatic spaced repetition scheduling upon session completion.
  - Application-level Ollama daemon management (`api.ai.startOllama`) without terminal or PowerShell commands.

- **Phase 3: RAG Document Understanding & Academic Tutor (Completed)**
  - Document retrieval engine combining SQLite FTS5 and `nomic-embed-text` embeddings.
  - Verifiable document and page citations with direct jump to PDF Reader.
  - AI Tutor mode with 4 explanation levels (Beginner, RTU Exam, GATE, Advanced).
  - Step-by-step numerical solver and practice question generator.

- **Phase 4: Academic Memory & Daily Planning Experience (Completed)**
  - Memory extraction and retrieval engine.
  - Daily Morning Briefing & Evening Review workflows.
  - Automatic progress sync with `topic_progress`, `study_sessions`, and `reviews`.

- **Phase 5: AI Insights, Settings & Voice Preparation (Completed)**
  - AI Settings page (model selection, temperature, context length, Ollama host, academic parameters).
  - Performance telemetry (token latency, VRAM/RAM awareness).
  - Audio/Voice interface abstraction interfaces ready for Whisper / Piper TTS.

---

## 8. Verification Strategy

1. Typecheck: `npm run typecheck` passes with zero errors on Node and Web targets.
2. Unit Tests: Test Ollama health checks, streaming parser, schema migrations, tool validation.
3. Integration Tests: Test tool registry execution, conversation persistence, memory storage, RAG retrieval.
4. UI Verification: Verify responsive layout, dark/light themes, streaming smooth rendering, KaTeX math formulas.
