import { BrowserWindow } from 'electron';
import { join } from 'node:path';

/**
 * Off-screen PDF page renderer used by the OCR pipeline.
 *
 * Rendering a PDF page to a bitmap requires a canvas, which the main process
 * does not have. Instead of a native canvas dependency we use a hidden
 * BrowserWindow that runs the same bundled pdf.js build as the reader.
 *
 * The page is fetched through the privileged `mechstudy://doc/<id>` protocol,
 * so no local file path is ever exposed to a web context.
 */

let win: BrowserWindow | null = null;
let ready: Promise<void> | null = null;

function rendererUrl(): { kind: 'url'; url: string } | { kind: 'file'; file: string } {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) return { kind: 'url', url: `${devUrl}/ocr.html` };
  return { kind: 'file', file: join(__dirname, '../renderer/ocr.html') };
}

async function ensureWindow(): Promise<BrowserWindow> {
  if (win && !win.isDestroyed()) return win;

  win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: {
      offscreen: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  const target = rendererUrl();
  ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('OCR renderer did not load within 30s')), 30000);
    win!.webContents.once('did-finish-load', () => { clearTimeout(timer); resolve(); });
    win!.webContents.once('did-fail-load', (_e, code, desc) => {
      clearTimeout(timer);
      reject(new Error(`OCR renderer failed to load (${code}): ${desc}`));
    });
  });

  if (target.kind === 'url') await win.loadURL(target.url);
  else await win.loadFile(target.file);

  await ready;
  return win;
}

export async function renderPageToPng(
  documentId: number,
  page: number,
  scale = 2.2
): Promise<string> {
  const w = await ensureWindow();
  const url = `mechstudy://doc/${documentId}`;

  const script = `window.__ocrRender(${JSON.stringify(url)}, ${page}, ${scale})`;
  const result = await Promise.race([
    w.webContents.executeJavaScript(script, true),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Page render timed out after 60s')), 60000)),
  ]);

  if (typeof result !== 'string' || !result.startsWith('data:image/png')) {
    throw new Error('OCR renderer returned no image data');
  }
  return result;
}

export function destroyOcrWindow(): void {
  try {
    if (win && !win.isDestroyed()) win.destroy();
  } catch { /* ignore */ }
  win = null;
  ready = null;
}
