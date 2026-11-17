# Contributing to MECHSTUDY OS

Thank you for your interest in contributing to **MECHSTUDY OS**! We welcome bug reports, feature requests, documentation improvements, and pull requests from students and developers.

---

## Code of Conduct

Please be respectful, constructive, and helpful to fellow students and contributors.

---

## Development Setup

### Prerequisites
- **Operating System:** Windows 10/11 (64-bit recommended)
- **Node.js:** v22 or v24
- **Python:** 3.10+ (for indexing & icon tooling)
- **Git**

### Installation Steps
1. Clone the repository:
   ```bash
   git clone https://github.com/jangirbasant2/MECHSTUDY-OS.git
   cd MECHSTUDY-OS/MECHSTUDY-OS
   ```
2. Install npm dependencies:
   ```bash
   npm install
   ```
3. Start the application in development mode with HMR:
   ```bash
   npm run dev
   ```

---

## Running Quality & Test Suites

Before submitting a Pull Request, ensure that all verification checks pass:

```bash
# 1. Type checking (Main, Preload & Renderer)
npm run typecheck

# 2. Fast unit tests
npm test

# 3. Full integration tests
npm run test:integration

# 4. Production build verification
npm run build
```

---

## Guidelines for Contributions

1. **Content Exclusion:** Never commit copyrighted textbooks, proprietary notes, or full PDF collections into the source code or pull requests. Test fixtures must remain synthetic or public domain.
2. **Offline-First:** All features must operate completely offline. Do not introduce mandatory third-party cloud APIs, analytics tracking, or account requirements.
3. **Electron Security:** Maintain `contextIsolation: true` and `nodeIntegration: false`. All communication between renderer and main processes must be strictly typed through IPC.
4. **Clean Commits:** Write clear commit messages describing what was changed and why.
