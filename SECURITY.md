# Security Policy: MECHSTUDY OS

## Supported Versions

| Version | Supported          | Status |
| ------- | ------------------ | ------ |
| 1.0.x   | :white_check_mark: | Active production release |
| < 1.0   | :x:                | Deprecated / Development |

---

## Security Architecture

MECHSTUDY OS is designed with an **offline-first, zero-trust** security philosophy:

1. **Zero External Data Transmission:** MECHSTUDY OS does not send your notes, PDF documents, highlights, questions, annotations, or personal study analytics to any cloud server or telemetry endpoint.
2. **Strict Electron Sandboxing:**
   - `contextIsolation: true` is enforced across all browser windows.
   - `nodeIntegration: false` ensures web content cannot execute Node.js primitives directly.
   - Preload script exposes only strictly validated, typed IPC APIs via `contextBridge`.
   - Navigation protection blocks unauthorized external navigations; external web links are forced to open in the user's default system browser.
3. **Local AI Boundary:**
   - AI capabilities interface exclusively with local Ollama daemon on `127.0.0.1:11434`.
   - No prompts or document text leave your machine.
   - Temporary screenshot clippings captured for visual diagram analysis automatically expire and are purged after 5 messages.
4. **Data Isolation:**
   - Personal study databases (`mechstudy.db`) are stored in the user's secure application data directory (`%APPDATA%\MECHSTUDY OS\data\`).
   - Updating or uninstalling the software preserves user study history and databases by default.

---

## Reporting a Vulnerability

If you discover a security issue or vulnerability within MECHSTUDY OS, please report it responsibly:

- **Email:** `jangirbasant2@gmail.com`
- **GitHub:** Open a private Security Advisory on the GitHub repository.

Please do not open public GitHub issues for security vulnerabilities. We will review and patch verified security vulnerabilities within 48 hours.
