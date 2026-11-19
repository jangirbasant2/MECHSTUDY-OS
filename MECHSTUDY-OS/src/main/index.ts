import { app, BrowserWindow, Menu, protocol, net, session, shell, dialog } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';

import { initDb, getDb, dbPath, getSetting, setSetting } from './db';
import { initLogging } from './logger';
import { seedSyllabus } from './services/seed';
import { buildMappings } from './services/mapping';
import { registerIpc, setMainWindow, defaultProjectRoot } from './ipc';
import { destroyOcrWindow } from './services/ocrRender';
import { cleanupExpiredScreenshots } from './services/ai/temporaryScreenshots';
import { startReminderScheduler, stopReminderScheduler } from './services/reminder';
import { indexAllTextLayers } from './services/indexer';

app.setName('MECHSTUDY OS');
app.setAppUserModelId('com.mechstudy.os');

// Development-only debugging hook. Set MECHSTUDY_DEBUG_PORT=9222 before
// `npm run dev` to attach Chrome DevTools / automation. Never enabled in a
// packaged build.
if (!app.isPackaged && process.env.MECHSTUDY_DEBUG_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.MECHSTUDY_DEBUG_PORT);
}

// The PDF protocol must be registered before the app is ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'mechstudy',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
]);

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const iconPath = existsSync(join(process.resourcesPath, 'icon.png'))
    ? join(process.resourcesPath, 'icon.png')
    : existsSync(join(__dirname, '../../resources/icon.png'))
      ? join(__dirname, '../../resources/icon.png')
      : undefined;

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#0b0f14',
    title: 'MECHSTUDY OS',
    icon: iconPath,
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      // Chromium marks an occluded window as hidden and stops calling
      // requestAnimationFrame. pdf.js finishes each page render on an animation
      // frame, so a render started while another window covers the app would
      // never settle: the page stays at its first size, "rendering…" never
      // clears and zoom/fit-width appear dead. Keeping the renderer unthrottled
      // also lets OCR progress and indexing continue in the background.
      backgroundThrottling: false,
    },
  });

  setMainWindow(mainWindow);

  // Keep the renderer informed about native window state so the UI can show
  // the difference between "window is full-screen" and "reader focus mode".
  const sendWindowState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('window:state', {
      fullScreen: mainWindow.isFullScreen(),
      maximized: mainWindow.isMaximized(),
    });
  };
  mainWindow.on('enter-full-screen', sendWindowState);
  mainWindow.on('leave-full-screen', sendWindowState);
  mainWindow.on('maximize', sendWindowState);
  mainWindow.on('unmaximize', sendWindowState);
  mainWindow.on('restore', sendWindowState);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Open external links in the default browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL;
    const isDev = !!devUrl && url.startsWith(devUrl);
    if (!isDev && !url.startsWith('file://')) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error(`[main] renderer process gone: ${details.reason}`);
  });

  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    console.error(`[main] did-fail-load: ${errorCode} ${errorDescription} (${validatedURL})`);
  });

  mainWindow.webContents.on('console-message', (event) => {
    const line = `${event.message} (${event.sourceId}:${event.lineNumber})`;
    if (event.level === 'error') console.error(`[renderer] ${line}`);
    else console.log(`[renderer:${event.level}] ${line}`);
  });

  mainWindow.on('close', () => {
    console.log('[main] mainWindow close event triggered');
  });

  mainWindow.on('closed', () => {
    console.log('[main] mainWindow closed');
    setMainWindow(null);
    mainWindow = null;
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Import Study Folder…',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:action', 'import-folder'),
        },
        {
          label: 'Create Backup',
          accelerator: 'CmdOrCtrl+Shift+B',
          click: () => mainWindow?.webContents.send('menu:action', 'backup'),
        },
        { type: 'separator' },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => mainWindow?.webContents.send('menu:action', 'settings') },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Command Palette',
          accelerator: 'CmdOrCtrl+K',
          click: () => mainWindow?.webContents.send('menu:action', 'palette'),
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Open Data Folder',
          click: () => {
            try { shell.openPath(app.getPath('userData')); } catch { /* ignore */ }
          },
        },
        {
          label: 'Database Location',
          click: () => {
            try { shell.showItemInFolder(dbPath()); } catch { /* ignore */ }
          },
        },
        { type: 'separator' },
        {
          label: 'About MECHSTUDY OS',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'About MECHSTUDY OS',
              message: 'MECHSTUDY OS',
              detail:
                `Version ${app.getVersion()}\n` +
                'One Workspace. Two Goals. RTU Excellence + GATE Mastery.\n\n' +
                `Electron ${process.versions.electron} · Node ${process.versions.node} · Chromium ${process.versions.chrome}\n` +
                `Database: ${dbPath()}`,
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * Content Security Policy for the built renderer.
 *
 * Everything the renderer loads is local: bundled JS/CSS, the
 * `mechstudy://doc/<id>` PDF protocol, blob/data URLs used for rendered pages,
 * OCR page images and the pdf.js worker. A strict policy therefore costs
 * nothing at runtime and removes the "insecure CSP" attack surface.
 *
 * Skipped in `npm run dev`: Vite serves the page over http://localhost:5173,
 * injects inline scripts and opens a websocket, so a strict policy would break
 * hot reload. Electron prints a dev-only warning about that; it disappears in
 * the packaged build, which is where the policy actually applies.
 */
function applyContentSecurityPolicy(): void {
  if (process.env.ELECTRON_RENDERER_URL) return;

  const policy = [
    "default-src 'self'",
    // 'wasm-unsafe-eval' is required by pdf.js v5 (JBIG2 / OpenJPEG / qcms).
    "script-src 'self' 'wasm-unsafe-eval' blob:",
    "worker-src 'self' blob:",
    // Inline styles are used for dynamic PDF geometry (zoom, annotation boxes).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' mechstudy: data: blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy],
      },
    });
  });
}

/** Serve PDFs to the renderer without exposing filesystem paths to web code. */
function registerPdfProtocol(): void {
  protocol.handle('mechstudy', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'doc') {
        return new Response('Not found', { status: 404 });
      }
      const id = Number(url.pathname.replace(/^\//, '').split('/')[0]);
      if (!Number.isFinite(id) || id <= 0) return new Response('Bad request', { status: 400 });

      const row = getDb().prepare('SELECT path FROM documents WHERE id = ?').get(id) as
        | { path: string }
        | undefined;
      if (!row) return new Response('Document not found', { status: 404 });
      if (!existsSync(row.path)) return new Response('File missing on disk', { status: 410 });

      // net.fetch handles Range requests and streams the file efficiently.
      return await net.fetch(pathToFileURL(row.path).toString());
    } catch (e) {
      console.error('[protocol] failed to serve PDF:', (e as Error).message);
      return new Response('Internal error', { status: 500 });
    }
  });
}

function bootstrapDatabase(): { version: number; seeded: boolean; mappings: number } {
  const info = initDb();

  // Default project root is captured once so it survives restarts.
  if (!getSetting('projectRoot', '')) {
    const root = defaultProjectRoot();
    if (root) setSetting('projectRoot', root);
  }

  const seed = seedSyllabus();
  const mapping = buildMappings();

  console.log(
    `[main] database v${info.version} at ${info.path}; ` +
    `syllabus seeded=${seed.created}; mappings inserted=${mapping.inserted}`
  );

  return { version: info.version, seeded: seed.created, mappings: mapping.inserted };
}

app.whenReady().then(() => {
  initLogging();
  console.log(`[main] MECHSTUDY OS ${app.getVersion()} starting`);

  try {
    applyContentSecurityPolicy();
    registerPdfProtocol();
    bootstrapDatabase();
    registerIpc();
    buildMenu();
    createWindow();
    cleanupExpiredScreenshots();
    startReminderScheduler(() => mainWindow);
    // Defer background extraction of selectable text so UI starts instantaneously
    setTimeout(() => {
      indexAllTextLayers().catch(err => console.warn('[main] Background text layer indexing error:', err));
    }, 4000);
  } catch (e) {
    const message = e instanceof Error ? (e.stack ?? e.message) : String(e);
    console.error('[main] fatal startup error:', message);
    dialog.showErrorBox(
      'MECHSTUDY OS could not start',
      `The application failed to initialise.\n\n${message}\n\n` +
      `Database: ${dbPath()}\nLogs: ${join(app.getPath('userData'), 'logs')}`
    );
    app.quit();
    return;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  console.log('[main] app window-all-closed fired');
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (e) => {
  console.log('[main] app before-quit fired');
  stopReminderScheduler();
  destroyOcrWindow();
});

app.on('will-quit', () => {
  console.log('[main] app will-quit fired');
});
