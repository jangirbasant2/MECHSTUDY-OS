import { app } from 'electron';
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Minimal file logger. Deliberately never logs document text — only channel
 * names, error messages and paths the user already knows about.
 */

let logFile: string | null = null;
const MAX_BYTES = 5 * 1024 * 1024;

function ensureFile(): string | null {
  if (logFile) return logFile;
  try {
    const dir = join(app.getPath('userData'), 'logs');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    logFile = join(dir, 'main.log');
    if (existsSync(logFile) && statSync(logFile).size > MAX_BYTES) {
      try { renameSync(logFile, join(dir, `main.${Date.now()}.log`)); } catch { /* ignore */ }
    }
    return logFile;
  } catch { return null; }
}

function write(level: string, args: unknown[]) {
  const file = ensureFile();
  if (!file) return;
  const text = args
    .map(a => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'string' ? a : safeJson(a)))
    .join(' ');
  try {
    appendFileSync(file, `${new Date().toISOString()} [${level}] ${text}\n`, 'utf8');
  } catch { /* ignore */ }
}

function safeJson(v: unknown): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}

export function initLogging(): void {
  const originalLog = console.log.bind(console);
  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);

  console.log = (...args: unknown[]) => { write('info', args); originalLog(...args); };
  console.error = (...args: unknown[]) => { write('error', args); originalError(...args); };
  console.warn = (...args: unknown[]) => { write('warn', args); originalWarn(...args); };

  process.on('uncaughtException', (e) => {
    write('fatal', [e instanceof Error ? `${e.stack ?? e.message}` : String(e)]);
  });
  process.on('unhandledRejection', (e) => {
    write('fatal', [e instanceof Error ? `${e.stack ?? e.message}` : String(e)]);
  });
}

export function logPath(): string {
  return logFile ?? join(app.getPath('userData'), 'logs', 'main.log');
}
