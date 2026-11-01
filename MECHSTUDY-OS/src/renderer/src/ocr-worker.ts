import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/**
 * Hidden-window renderer used exclusively by the OCR pipeline.
 * It renders one page to a PNG data URL on request from the main process.
 * Nothing here touches the filesystem — the document comes through
 * `mechstudy://doc/<id>`.
 */

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

declare global {
  interface Window {
    __ocrRender?: (url: string, page: number, scale: number) => Promise<string>;
    __ocrReady?: boolean;
  }
}

window.__ocrRender = async (url: string, pageNumber: number, scale: number) => {
  const assetBase = new URL('pdfjs/', document.baseURI).href;
  const task = pdfjsLib.getDocument({
    url,
    standardFontDataUrl: `${assetBase}standard_fonts/`,
    cMapUrl: `${assetBase}cmaps/`,
    cMapPacked: true,
    wasmUrl: `${assetBase}wasm/`,
    iccUrl: `${assetBase}iccs/`,
  });
  const doc = await task.promise;

  try {
    if (pageNumber < 1 || pageNumber > doc.numPages) {
      throw new Error(`Page ${pageNumber} is out of range (document has ${doc.numPages})`);
    }
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    return canvas.toDataURL('image/png');
  } finally {
    try { await doc.destroy(); } catch { /* ignore */ }
  }
};

window.__ocrReady = true;
document.body.setAttribute('data-ocr-ready', 'true');
