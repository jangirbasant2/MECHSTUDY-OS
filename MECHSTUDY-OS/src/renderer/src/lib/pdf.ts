import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/**
 * pdf.js is used for rendering only. Documents are fetched through the
 * privileged `mechstudy://doc/<id>` protocol so the renderer never needs
 * filesystem access.
 */

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjsLib };

export interface PdfDoc {
  numPages: number;
  getPage(page: number): Promise<any>;
  destroy(): Promise<void>;
  getMetadata(): Promise<any>;
  getOutline(): Promise<any[] | null>;
}

export function documentUrl(id: number): string {
  return `mechstudy://doc/${id}`;
}

/**
 * Base URL for pdf.js runtime data (standard fonts, CMaps).
 * Resolves correctly in dev (http://localhost:5173/pdfjs/) and in the packaged
 * build (file:///…/out/renderer/pdfjs/), because it is derived from the
 * document base URI rather than a hard-coded absolute path.
 */
export const pdfjsAssetBase = new URL('pdfjs/', document.baseURI).href;

export async function openDocument(id: number, signal?: AbortSignal): Promise<PdfDoc> {
  const task = pdfjsLib.getDocument({
    url: documentUrl(id),
    disableFontFace: false,
    // Rendering scanned pages is image-heavy; keep the worker off the UI thread.
    useWorkerFetch: true,
    standardFontDataUrl: `${pdfjsAssetBase}standard_fonts/`,
    cMapUrl: `${pdfjsAssetBase}cmaps/`,
    cMapPacked: true,
    // Needed to decode JBIG2 / JPEG2000 scans and apply ICC colour profiles.
    wasmUrl: `${pdfjsAssetBase}wasm/`,
    iccUrl: `${pdfjsAssetBase}iccs/`,
  });

  if (signal) {
    signal.addEventListener('abort', () => { void task.destroy(); }, { once: true });
  }

  return (await task.promise) as unknown as PdfDoc;
}

export function renderPage(
  page: any,
  canvas: HTMLCanvasElement,
  scale: number
): Promise<void> {
  const viewport = page.getViewport({ scale });
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  ctx.save();
  ctx.scale(ratio, ratio);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  return page.render({
    canvasContext: ctx,
    viewport,
    canvas,
  } as any).promise.then(() => { ctx.restore(); });
}

/** Render pdf.js text content into a selectable layer. */
export async function renderTextLayer(page: any, container: HTMLElement, scale: number): Promise<void> {
  container.innerHTML = '';
  const viewport = page.getViewport({ scale });
  container.style.width = `${Math.floor(viewport.width)}px`;
  container.style.height = `${Math.floor(viewport.height)}px`;

  try {
    const textContent = await page.getTextContent();
    if (!textContent.items.length) return;
    const layer = new (pdfjsLib as any).TextLayer({
      textContentSource: textContent,
      container,
      viewport,
    });
    await layer.render();
  } catch {
    // A missing text layer is normal for scanned notes — not an error.
  }
}

export function viewportSize(page: any, scale: number): { width: number; height: number } {
  const vp = page.getViewport({ scale });
  return { width: vp.width, height: vp.height };
}
