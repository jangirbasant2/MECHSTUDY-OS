import React from 'react';
import {
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Minimize2, Highlighter,
  Underline, Strikethrough, PenTool, StickyNote, Bookmark, Search, FileText, X,
  Download, MousePointer2, Trash2, PanelRightClose, PanelRightOpen,
  ArrowLeft, AlertTriangle, Check, Type, Eraser, PanelLeft, PanelLeftOpen,
  PanelTopClose, GripHorizontal, PenLine, Scaling, Save,
  Crop, Hand, Minus, Lightbulb, Camera, Sparkles, Brain, Cpu, Loader2, Layers,
  Columns2,
} from 'lucide-react';
import { ReaderAiPanel } from './reader/ReaderAiPanel';
import { SplitSecondaryPane } from '../components/SplitSecondaryPane';
import { api } from '../lib/api';
import { useApp } from '../store';
import { openDocument, renderPage, renderTextLayer, type PdfDoc } from '../lib/pdf';
import { ConfirmDialog, EmptyState, ErrorState, Loading, Modal, Spinner, Tabs } from '../components/ui';
import { bytes, dateLabel, truncate } from '../lib/format';
import type {
  AnnotationRow, BookmarkRow, DocumentRow, ExportResult, StickyNoteRow,
} from '../../../shared/types';

type Tool =
  | 'select' | 'highlight' | 'underline' | 'strikethrough'
  | 'pen' | 'eraser' | 'note' | 'text' | 'screenshot' | 'pan';
type Panel = 'notes' | 'bookmarks' | 'search' | 'info' | 'ai';

/** Colours used for highlight / underline / strike / ink. */
const COLORS: { name: string; hex: string }[] = [
  { name: 'yellow', hex: '#f5c542' },
  { name: 'green', hex: '#5ecf6a' },
  { name: 'blue', hex: '#5b9cf8' },
  { name: 'pink', hex: '#f07ba8' },
  { name: 'purple', hex: '#a78bfa' },
  { name: 'red', hex: '#ef4444' },
];

const HEX: Record<string, string> = Object.fromEntries(COLORS.map(c => [c.name, c.hex]));

/** Sticky-note paper colours with readable text contrast. */
const NOTE_COLORS: { name: string; bg: string; fg: string; border: string }[] = [
  { name: 'yellow', bg: '#fde68a', fg: '#3f2d00', border: '#eab308' },
  { name: 'blue', bg: '#bfdbfe', fg: '#12305c', border: '#60a5fa' },
  { name: 'pink', bg: '#fbcfe8', fg: '#5c1136', border: '#f472b6' },
  { name: 'green', bg: '#bbf7d0', fg: '#0c3d1e', border: '#4ade80' },
  { name: 'purple', bg: '#ddd6fe', fg: '#322060', border: '#a78bfa' },
  { name: 'orange', bg: '#fed7aa', fg: '#5a2b00', border: '#fb923c' },
  { name: 'red', bg: '#fecaca', fg: '#5f1010', border: '#f87171' },
];
const NOTE_BY_NAME: Record<string, typeof NOTE_COLORS[number]> =
  Object.fromEntries(NOTE_COLORS.map(c => [c.name, c]));

const TEXT_COLORS = ['#111827', '#dc2626', '#1d4ed8', '#15803d', '#7c3aed'];
const TEXT_SIZES = [11, 14, 18, 24, 32];

const MIN_NOTE_W_PX = 120;
const MIN_NOTE_H_PX = 64;
const MIN_TEXT_W_PX = 90;
const MIN_TEXT_H_PX = 26;
const DEFAULT_NOTE_W = 0.3;
const DEFAULT_NOTE_H = 0.16;
const DEFAULT_TEXT_W = 0.36;
const DEFAULT_TEXT_H = 0.09;

function clamp01(n: number) { return Math.max(0, Math.min(1, n)); }
function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
function annColor(c: string | null | undefined): string {
  if (!c) return '#f5c542';
  return c.startsWith('#') ? c : (HEX[c] ?? '#f5c542');
}
function noteTheme(name: string | null | undefined) {
  return NOTE_BY_NAME[name ?? 'yellow'] ?? NOTE_BY_NAME.yellow;
}
function noteFontPx(stored: number | null | undefined, scale: number): number {
  const base = stored && stored > 0 ? stored : 12;
  return clamp(base * scale, 8, 40);
}

interface Rect { x0: number; y0: number; x1: number; y1: number }
interface Box { x: number; y: number; w: number; h: number }

interface BoxInteraction {
  kind: 'note' | 'ann';
  mode: 'move' | 'resize';
  id: number;
  pageW: number;
  pageH: number;
  startX: number;
  startY: number;
  orig: Box;
}

export function ReaderPage() {
  const docId = useApp(s => s.readerDocId);
  const initialPage = useApp(s => s.readerPage);
  const setAppPage = useApp(s => s.setPage);
  const openQuickNote = useApp(s => s.openQuickNote);
  const toast = useApp(s => s.toast);

  /* Layout is application-level state — see store.ts and App.tsx. */
  const readerFocus = useApp(s => s.readerFocus);
  const setReaderFocus = useApp(s => s.setReaderFocus);
  const toolbarVisible = useApp(s => s.readerToolbarVisible);
  const setToolbarVisible = useApp(s => s.setReaderToolbarVisible);
  const panelOpen = useApp(s => s.readerPanelOpen);
  const setPanelOpen = useApp(s => s.setReaderPanelOpen);
  const sidebarVisible = useApp(s => s.sidebarVisible);
  const setSidebarVisible = useApp(s => s.setSidebarVisible);
  const restoreLayout = useApp(s => s.restoreLayout);
  const splitViewOpen = useApp(s => s.splitViewOpen);
  const splitDocId = useApp(s => s.splitDocId);
  const splitPage = useApp(s => s.splitPage);
  const toggleSplitView = useApp(s => s.toggleSplitView);
  const setSplitView = useApp(s => s.setSplitView);

  const [penThickness, setPenThickness] = React.useState<number>(2.6);

  const [doc, setDoc] = React.useState<DocumentRow | null>(null);
  const [pdf, setPdf] = React.useState<PdfDoc | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [pageNum, setPageNum] = React.useState(1);
  const [numPages, setNumPages] = React.useState(0);
  const [zoom, setZoom] = React.useState(1.2);
  const [fitWidth, setFitWidth] = React.useState(true);
  const [paperTheme, setPaperTheme] = React.useState<'normal' | 'sepia' | 'inverted'>(() => {
    try {
      const saved = localStorage.getItem('ui.readerPaperTheme');
      if (saved === 'sepia' || saved === 'inverted') return saved;
    } catch {}
    return 'normal';
  });
  const [containerW, setContainerW] = React.useState(900);
  const [pageDims, setPageDims] = React.useState({ w: 0, h: 0 });
  const [baseDims, setBaseDims] = React.useState({ w: 0, h: 0 });
  const [renderScale, setRenderScale] = React.useState(1);
  const [rendering, setRendering] = React.useState(false);
  const [renderError, setRenderError] = React.useState<string | null>(null);
  const [fullScreen, setFullScreen] = React.useState(false);

  const [anns, setAnns] = React.useState<AnnotationRow[]>([]);
  const [notes, setNotes] = React.useState<StickyNoteRow[]>([]);
  const [bookmarks, setBookmarks] = React.useState<BookmarkRow[]>([]);

  const [tool, setTool] = React.useState<Tool>('select');
  const [color, setColor] = React.useState('yellow');
  const [drag, setDrag] = React.useState<Rect | null>(null);
  const [penPoints, setPenPoints] = React.useState<{ x: number; y: number }[] | null>(null);
  const [interaction, setInteraction] = React.useState<BoxInteraction | null>(null);

  const [panel, setPanel] = React.useState<Panel>('notes');
  const [findQ, setFindQ] = React.useState('');
  const [findResults, setFindResults] = React.useState<{ page: number; text: string }[] | null>(null);
  const [finding, setFinding] = React.useState(false);

  /* sticky notes */
  const [noteDraft, setNoteDraft] = React.useState<(Box & { color: string; body: string }) | null>(null);
  const [selectedNote, setSelectedNote] = React.useState<number | null>(null);
  const [editingNote, setEditingNote] = React.useState<number | null>(null);
  const [editBody, setEditBody] = React.useState('');
  const [deleteNoteTarget, setDeleteNoteTarget] = React.useState<StickyNoteRow | null>(null);

  /* PDF text boxes ("write on PDF") */
  const [textDraft, setTextDraft] = React.useState<
    (Box & { text: string; color: string; fontSize: number }) | null
  >(null);
  const [selectedAnn, setSelectedAnn] = React.useState<number | null>(null);
  const [editingAnn, setEditingAnn] = React.useState<number | null>(null);
  const [editAnnText, setEditAnnText] = React.useState('');

  /* text selection → explicit annotation toolbar */
  const [selection, setSelection] = React.useState<(Box & { text: string }) | null>(null);

  const [bookmarkDraft, setBookmarkDraft] = React.useState<{ title: string; description: string } | null>(null);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [pendingScreenshot, setPendingScreenshot] = React.useState<string | null>(null);
  const [aiPanelWidth, setAiPanelWidth] = React.useState(360);
  const [exporting, setExporting] = React.useState(false);
  const [exportResult, setExportResult] = React.useState<ExportResult | null>(null);
  const [deleteAnn, setDeleteAnn] = React.useState<AnnotationRow | null>(null);
  const [isOcrRunning, setIsOcrRunning] = React.useState(false);
  const [ocrProgress, setOcrProgress] = React.useState<{ page: number; total: number } | null>(null);

  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const textRef = React.useRef<HTMLDivElement>(null);
  const pageRef = React.useRef<HTMLDivElement>(null);
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const renderChain = React.useRef<Promise<void>>(Promise.resolve());
  const pdfRef = React.useRef<PdfDoc | null>(null);
  const draftTextRef = React.useRef<HTMLTextAreaElement>(null);
  const draftNoteRef = React.useRef<HTMLTextAreaElement>(null);

  /* The click that places a note/text box ends on the page container, which
     takes focus back from React's `autoFocus`. Re-focus once the draft is in
     the DOM so typing works immediately without a second click. */
  React.useEffect(() => {
    if (!textDraft) return;
    const id = window.setTimeout(() => draftTextRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [textDraft]);

  React.useEffect(() => {
    if (!noteDraft) return;
    const id = window.setTimeout(() => draftNoteRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [noteDraft]);

  const notesRef = React.useRef(notes);
  const annsRef = React.useRef(anns);
  React.useEffect(() => { notesRef.current = notes; }, [notes]);
  React.useEffect(() => { annsRef.current = anns; }, [anns]);

  /* ---------------- load reader preferences ---------------- */
  React.useEffect(() => {
    let alive = true;
    api.reader.getSettings().then(st => {
      if (!alive) return;
      if (st.defaultTool) setTool(st.defaultTool);
      if (st.defaultNoteColor) setColor(st.defaultNoteColor);
      if (st.aiPanelWidth) setAiPanelWidth(st.aiPanelWidth);
    }).catch(() => { /* ignore */ });
    return () => { alive = false; };
  }, []);

  /* ---------------- native full-screen state ---------------- */
  React.useEffect(() => {
    let alive = true;
    void api.app.windowState().then(s => { if (alive) setFullScreen(s.fullScreen); }).catch(() => { /* ignore */ });
    const unsub = api.app.onWindowState(s => setFullScreen(s.fullScreen));
    return () => { alive = false; unsub(); };
  }, []);

  /* ---------------- load document ---------------- */
  React.useEffect(() => {
    if (!docId) { setLoading(false); setDoc(null); return; }
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setRenderError(null);
      try {
        const d = await api.library.get(docId);
        if (!d) throw new Error('This document is not in the library.');
        if (!d.available) throw new Error(`The PDF is missing on disk:\n${d.path}`);
        if (cancelled) return;
        setDoc(d);

        const loaded = await openDocument(docId);
        if (cancelled) { void loaded.destroy(); return; }
        pdfRef.current = loaded;
        setPdf(loaded);
        setNumPages(loaded.numPages);

        const start = initialPage && initialPage >= 1 && initialPage <= loaded.numPages
          ? initialPage
          : Math.min(Math.max(1, d.last_page || 1), loaded.numPages || 1);
        setPageNum(start);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      const p = pdfRef.current;
      pdfRef.current = null;
      setPdf(null);
      if (p) void p.destroy().catch(() => { /* ignore */ });
    };
  }, [docId, initialPage]);

  /* ---------------- container width ---------------- */
  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    // The scroller only exists once the document has loaded, so this effect
    // must re-run when `loading`/`doc` changes. Attaching it once on mount (as
    // the first implementation did) left the observer pointing at nothing and
    // the page never re-fitted after the sidebar or side panel changed width.
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setContainerW(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [loading, doc]);

  /* ---------------- render page ---------------- */
  React.useEffect(() => {
    if (!pdf) return;
    let cancelled = false;

    renderChain.current = renderChain.current.then(async () => {
      if (cancelled) return;
      setRendering(true);
      setRenderError(null);
      try {
        const page = await pdf.getPage(pageNum);
        if (cancelled) return;

        const base = page.getViewport({ scale: 1 });
        const available = Math.max(120, containerW - 56);
        const scale = fitWidth
          ? Math.max(0.2, Math.min(4, available / base.width))
          : zoom;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas) return;
        await renderPage(page, canvas, scale);
        if (cancelled) return;

        setBaseDims({ w: base.width, h: base.height });
        setPageDims({ w: viewport.width, h: viewport.height });
        setRenderScale(scale);

        if (textRef.current) {
          await renderTextLayer(page, textRef.current, scale);
        }
      } catch (e) {
        if (!cancelled) setRenderError((e as Error).message);
      } finally {
        if (!cancelled) setRendering(false);
      }
    }).catch(() => { /* keep chain alive */ });

    return () => { cancelled = true; };
  }, [pdf, pageNum, zoom, fitWidth, containerW]);

  /* ---------------- per-page data ---------------- */
  const loadPageData = React.useCallback(async () => {
    if (!docId) return;
    try {
      const [a, n, b] = await Promise.all([
        api.annotations.list(docId, pageNum),
        api.notes.list({ documentId: docId }),
        api.bookmarks.list(docId),
      ]);
      setAnns(a);
      setNotes(n.filter(x => x.page === pageNum));
      setBookmarks(b);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }, [docId, pageNum, toast]);

  React.useEffect(() => { void loadPageData(); }, [loadPageData]);

  /* Clear transient selections when the page or document changes. */
  React.useEffect(() => {
    setSelection(null);
    setSelectedNote(null);
    setSelectedAnn(null);
    setEditingNote(null);
    setEditingAnn(null);
    setNoteDraft(null);
    setTextDraft(null);
    setInteraction(null);
  }, [docId, pageNum]);

  /* ---------------- persist reading position ---------------- */
  React.useEffect(() => {
    if (!docId) return;
    const id = window.setTimeout(() => {
      void api.library.savePosition(docId, pageNum).catch(() => { /* non-fatal */ });
    }, 600);
    return () => window.clearTimeout(id);
  }, [docId, pageNum]);

  /* ---------------- drag / resize of notes and text boxes ---------------- */
  React.useEffect(() => {
    if (!interaction) return;

    const onMove = (e: PointerEvent) => {
      const dx = (e.clientX - interaction.startX) / interaction.pageW;
      const dy = (e.clientY - interaction.startY) / interaction.pageH;
      const { orig } = interaction;
      let next: Box;
      if (interaction.mode === 'move') {
        next = {
          ...orig,
          x: clamp(orig.x + dx, 0, Math.max(0, 1 - orig.w)),
          y: clamp(orig.y + dy, 0, Math.max(0, 1 - orig.h)),
        };
      } else {
        const minW = (interaction.kind === 'note' ? MIN_NOTE_W_PX : MIN_TEXT_W_PX) / interaction.pageW;
        const minH = (interaction.kind === 'note' ? MIN_NOTE_H_PX : MIN_TEXT_H_PX) / interaction.pageH;
        next = {
          ...orig,
          w: clamp(orig.w + dx, Math.min(minW, 1 - orig.x), 1 - orig.x),
          h: clamp(orig.h + dy, Math.min(minH, 1 - orig.y), 1 - orig.y),
        };
      }

      if (interaction.kind === 'note') {
        setNotes(ns => ns.map(n => (n.id === interaction.id ? { ...n, ...next } : n)));
      } else {
        setAnns(as => as.map(a => (a.id === interaction.id ? { ...a, ...next } : a)));
      }
    };

    const onUp = () => {
      const it = interaction;
      setInteraction(null);
      const box = it.kind === 'note'
        ? notesRef.current.find(n => n.id === it.id)
        : annsRef.current.find(a => a.id === it.id);
      if (!box) return;
      const patch = { x: box.x, y: box.y, w: box.w, h: box.h };
      const request = it.kind === 'note'
        ? api.notes.update(it.id, patch)
        : api.annotations.update(it.id, patch);
      void request.catch(e => toast((e as Error).message, 'error'));
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [interaction, toast]);

  const startBoxDrag = (
    kind: 'note' | 'ann', mode: 'move' | 'resize', id: number, box: Box
  ) => (e: React.PointerEvent) => {
    if (tool !== 'select') return;
    e.preventDefault();
    e.stopPropagation();
    const r = pageRef.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return;
    if (kind === 'note') { setSelectedNote(id); setSelectedAnn(null); }
    else { setSelectedAnn(id); setSelectedNote(null); }
    setInteraction({
      kind, mode, id,
      pageW: r.width, pageH: r.height,
      startX: e.clientX, startY: e.clientY,
      orig: box,
    });
  };

  /* ---------------- keyboard ---------------- */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        setPageNum(p => Math.min(numPages, p + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        setPageNum(p => Math.max(1, p - 1));
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setFitWidth(false);
        setZoom(z => Math.min(4, z + 0.15));
      } else if (e.key === '-') {
        e.preventDefault();
        setFitWidth(false);
        setZoom(z => Math.max(0.25, z - 0.15));
      } else if (e.key === 'h') {
        setTool('highlight');
      } else if (e.key === 'n') {
        setTool('note');
      } else if (e.key === 't') {
        setTool('text');
      } else if (e.key === 'e') {
        setTool('eraser');
      } else if (e.key === 's') {
        setTool('screenshot');
      } else if (e.key === 'Escape') {
        // Escape is also handled at app level to leave focus mode.
        setTool('select');
        setDrag(null);
        setPenPoints(null);
        setSelection(null);
        setNoteDraft(null);
        setTextDraft(null);
        setEditingNote(null);
        setEditingAnn(null);
        setSelectedNote(null);
        setSelectedAnn(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [numPages]);

  /* ---------------- pointer helpers ---------------- */
  const pointFromEvent = (e: React.PointerEvent): { x: number; y: number } | null => {
    const el = pageRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (tool === 'select' || tool === 'eraser' || !docId) return;
    const pt = pointFromEvent(e);
    if (!pt) return;

    if (tool === 'screenshot') {
      e.preventDefault();
      setDrag({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y });
      return;
    }

    if (tool === 'note') {
      setNoteDraft({
        x: Math.min(pt.x, 1 - DEFAULT_NOTE_W),
        y: Math.min(pt.y, 1 - DEFAULT_NOTE_H),
        w: DEFAULT_NOTE_W,
        h: DEFAULT_NOTE_H,
        color,
        body: '',
      });
      setSelectedNote(null);
      setSelectedAnn(null);
      return;
    }

    if (tool === 'text') {
      setTextDraft({
        x: Math.min(pt.x, 1 - DEFAULT_TEXT_W),
        y: Math.min(pt.y, 1 - DEFAULT_TEXT_H),
        w: DEFAULT_TEXT_W,
        h: DEFAULT_TEXT_H,
        text: '',
        color: TEXT_COLORS[0],
        fontSize: 14,
      });
      setSelectedNote(null);
      setSelectedAnn(null);
      return;
    }

    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    if (tool === 'pen') {
      setPenPoints([pt]);
      return;
    }
    setDrag({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (tool === 'select' || tool === 'eraser') return;
    const pt = pointFromEvent(e);
    if (!pt) return;
    if (penPoints) {
      setPenPoints(prev => (prev ? [...prev, pt] : [pt]));
      return;
    }
    setDrag(d => (d ? { ...d, x1: pt.x, y1: pt.y } : d));
  };

  const finishStroke = async () => {
    if (!docId) return;

    if (penPoints && penPoints.length > 1) {
      const points = penPoints;
      setPenPoints(null);
      try {
        await api.annotations.create({
          documentId: docId,
          page: pageNum,
          type: 'ink',
          color: 'red',
          dataJson: JSON.stringify({
            strokes: [{ points, color: HEX[color] ?? '#ef4444', width: penThickness, opacity: 0.95 }],
          }),
        });
        await loadPageData();
      } catch (e) {
        toast((e as Error).message, 'error');
      }
      return;
    }
    setPenPoints(null);

    if (tool === 'screenshot' && drag) {
      const r = drag;
      setDrag(null);
      const x = Math.min(r.x0, r.x1);
      const y = Math.min(r.y0, r.y1);
      const w = Math.abs(r.x1 - r.x0);
      const h = Math.abs(r.y1 - r.y0);
      if (w > 0.01 && h > 0.01 && canvasRef.current) {
        const pageCanvas = canvasRef.current;
        const cropX = Math.round(x * pageCanvas.width);
        const cropY = Math.round(y * pageCanvas.height);
        const cropW = Math.round(w * pageCanvas.width);
        const cropH = Math.round(h * pageCanvas.height);
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cropW;
        cropCanvas.height = cropH;
        const ctx = cropCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(pageCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
          const dataUrl = cropCanvas.toDataURL('image/png');
          setPendingScreenshot(dataUrl);
          setPanel('ai');
          setPanelOpen(true);
          setTool('select');
          toast('Screenshot captured! Ready to ask AI Tutor.', 'success');
        }
      }
      return;
    }

    if (!drag) return;
    const r = drag;
    setDrag(null);

    const x = Math.min(r.x0, r.x1);
    const y = Math.min(r.y0, r.y1);
    const w = Math.abs(r.x1 - r.x0);
    const h = Math.abs(r.y1 - r.y0);
    if (w < 0.004 || h < 0.004) return;

    const type = tool === 'highlight' || tool === 'underline' || tool === 'strikethrough' ? tool : 'highlight';
    try {
      await api.annotations.create({ documentId: docId, page: pageNum, type, color, x, y, w, h });
      await loadPageData();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  /* ---------------- text selection → annotation toolbar ---------------- */
  const captureSelection = () => {
    if (tool !== 'select' || !docId || !pageRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (!text) return;

    const range = sel.getRangeAt(0);
    if (!pageRef.current.contains(range.commonAncestorContainer)) return;

    const rects = Array.from(range.getClientRects());
    const pageRect = pageRef.current.getBoundingClientRect();
    if (!rects.length) return;

    const top = Math.min(...rects.map(r => r.top));
    const bottom = Math.max(...rects.map(r => r.bottom));
    const left = Math.min(...rects.map(r => r.left));
    const right = Math.max(...rects.map(r => r.right));

    const x = clamp01((left - pageRect.left) / pageRect.width);
    const y = clamp01((top - pageRect.top) / pageRect.height);
    const w = clamp01((right - left) / pageRect.width);
    const h = clamp01((bottom - top) / pageRect.height);
    if (w < 0.002 || h < 0.002) return;

    setSelection({ x, y, w, h, text: text.slice(0, 2000) });
  };

  const annotateSelection = async (type: 'highlight' | 'underline' | 'strikethrough') => {
    if (!docId || !selection) return;
    try {
      await api.annotations.create({
        documentId: docId, page: pageNum, type, color,
        x: selection.x, y: selection.y, w: selection.w, h: selection.h,
        text: selection.text,
      });
      window.getSelection()?.removeAllRanges();
      setSelection(null);
      await loadPageData();
      toast(`${type === 'strikethrough' ? 'Strikethrough' : type} added`, 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  /* ---------------- sticky note actions ---------------- */
  const saveNoteDraft = async () => {
    if (!docId || !noteDraft) return;
    if (!noteDraft.body.trim()) { toast('Write something in the note first', 'error'); return; }
    try {
      await api.notes.create({
        documentId: docId, page: pageNum,
        x: noteDraft.x, y: noteDraft.y, w: noteDraft.w, h: noteDraft.h,
        color: noteDraft.color, body: noteDraft.body.trim(), fontSize: 12,
      });
      setNoteDraft(null);
      // Return to the select tool: otherwise the next click on the page would
      // silently create another empty note instead of selecting the one just
      // saved.
      setTool('select');
      await loadPageData();
      toast('Sticky note added', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const startEditNote = (n: StickyNoteRow) => {
    setEditingNote(n.id);
    setEditBody(n.body);
    setSelectedNote(n.id);
  };

  const saveNoteBody = async (id: number) => {
    try {
      await api.notes.update(id, { body: editBody });
      setNotes(ns => ns.map(n => (n.id === id ? { ...n, body: editBody } : n)));
      setEditingNote(null);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const setNoteColor = async (id: number, name: string) => {
    try {
      await api.notes.update(id, { color: name });
      setNotes(ns => ns.map(n => (n.id === id ? { ...n, color: name } : n)));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const removeNote = async () => {
    if (!deleteNoteTarget) return;
    try {
      await api.notes.remove(deleteNoteTarget.id);
      setDeleteNoteTarget(null);
      setSelectedNote(null);
      setEditingNote(null);
      await loadPageData();
      toast('Sticky note deleted', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const toggleMinimizeNote = async (n: StickyNoteRow) => {
    const nextMin = n.is_minimized ? 0 : 1;
    try {
      await api.notes.update(n.id, { is_minimized: nextMin });
      setNotes(ns => ns.map(x => (x.id === n.id ? { ...x, is_minimized: nextMin } : x)));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  /* ---------------- PDF text box actions ---------------- */
  const saveTextDraft = async () => {
    if (!docId || !textDraft) return;
    if (!textDraft.text.trim()) { toast('Type the text first', 'error'); return; }
    try {
      await api.annotations.create({
        documentId: docId, page: pageNum, type: 'textbox',
        color: textDraft.color,
        x: textDraft.x, y: textDraft.y, w: textDraft.w, h: textDraft.h,
        text: textDraft.text, fontSize: textDraft.fontSize,
      });
      setTextDraft(null);
      setTool('select');
      await loadPageData();
      toast('Text added to the page', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const startEditAnn = (a: AnnotationRow) => {
    setEditingAnn(a.id);
    setEditAnnText(a.text ?? '');
    setSelectedAnn(a.id);
  };

  const saveAnnText = async (id: number) => {
    try {
      await api.annotations.update(id, { text: editAnnText });
      setAnns(as => as.map(a => (a.id === id ? { ...a, text: editAnnText } : a)));
      setEditingAnn(null);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const styleAnn = async (id: number, patch: { color?: string; fontSize?: number }) => {
    try {
      await api.annotations.update(id, patch);
      setAnns(as => as.map(a => (
        a.id === id
          ? { ...a, ...(patch.color ? { color: patch.color } : {}), ...(patch.fontSize ? { font_size: patch.fontSize } : {}) }
          : a
      )));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const eraseAnnotation = async (a: AnnotationRow) => {
    try {
      await api.annotations.remove(a.id);
      setAnns(as => as.filter(x => x.id !== a.id));
      setSelectedAnn(null);
      toast('Annotation erased', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const clearCurrentPageInk = async () => {
    const pageInks = anns.filter(a => a.type === 'ink');
    if (pageInks.length === 0) {
      toast('No ink strokes on this page to clear', 'info');
      return;
    }
    try {
      for (const ink of pageInks) {
        await api.annotations.remove(ink.id);
      }
      setAnns(as => as.filter(a => a.type !== 'ink'));
      toast(`Cleared ${pageInks.length} ink strokes on page ${pageNum}`, 'success');
    } catch (e: any) {
      toast(`Failed to clear ink: ${e?.message}`, 'error');
    }
  };

  /* ---------------- bookmarks / find / export ---------------- */
  const saveBookmark = async () => {
    if (!docId || !bookmarkDraft) return;
    if (!bookmarkDraft.title.trim()) { toast('Give the bookmark a title', 'error'); return; }
    try {
      await api.bookmarks.create({
        documentId: docId, page: pageNum,
        title: bookmarkDraft.title.trim(),
        description: bookmarkDraft.description.trim() || undefined,
        color: 'amber',
      });
      setBookmarkDraft(null);
      await loadPageData();
      toast('Bookmark added', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const runFind = async () => {
    if (!docId || findQ.trim().length < 2) return;
    setFinding(true);
    try {
      setFindResults(await api.search.inDocument(docId, findQ.trim()));
    } catch (e) {
      toast((e as Error).message, 'error');
      setFindResults([]);
    } finally {
      setFinding(false);
    }
  };

  const handleRunGeminiOcr = async () => {
    if (!docId) return;
    setIsOcrRunning(true);
    toast('Starting Google AI Studio OCR for scanned handwritten pages...', 'info');
    try {
      const res = await api.ocr.geminiDocument(docId);
      toast(`Gemini OCR complete: indexed ${res.processed} scanned pages into FTS5 index.`, 'success');
      if (findQ.trim().length >= 2) void runFind();
    } catch (err: any) {
      toast(`Gemini OCR failed: ${err?.message || 'Error'}`, 'error');
    } finally {
      setIsOcrRunning(false);
      setOcrProgress(null);
    }
  };

  const exportPdf = async (opts: { highlights: boolean; ink: boolean; markers: boolean; summary: boolean }) => {
    if (!docId || !doc) return;
    setExporting(true);
    try {
      const target = await api.exporter.savePath(
        doc.filename.replace(/\.pdf$/i, '') + '.annotated.pdf',
        doc.path.replace(/[\\/][^\\/]+$/, '')
      );
      if (!target) return;
      const res = await api.exporter.annotated({
        documentId: docId,
        outPath: target,
        includeHighlights: opts.highlights,
        includeInk: opts.ink,
        includeNoteMarkers: opts.markers,
        includeNoteSummary: opts.summary,
        pages: 'all',
      });
      setExportResult(res);
      toast(`Exported to ${res.outPath}`, 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setExporting(false);
    }
  };

  const removeAnnotation = async () => {
    if (!deleteAnn) return;
    try {
      await api.annotations.remove(deleteAnn.id);
      setDeleteAnn(null);
      await loadPageData();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const toggleFullScreen = async () => {
    try {
      const next = await api.app.toggleFullScreen();
      setFullScreen(next);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  /* ---------------- empty / error states ---------------- */
  if (!docId) {
    return (
      <EmptyState
        icon={<FileText size={20} />}
        title="No document open"
        description="Open a PDF from My Library to read it here. Your annotations are stored in the app database and never written into the original file."
        action={<button className="btn btn-sm btn-primary" onClick={() => setAppPage('library')}>Open library</button>}
      />
    );
  }

  if (loading) return <Loading label="Opening document…" />;
  if (error) {
    return (
      <div className="p-4">
        <ErrorState message={error} onRetry={() => setAppPage('library')} />
        <div className="mt-2 text-center">
          <button className="btn btn-sm" onClick={() => setAppPage('library')}>
            <ArrowLeft size={13} /> Back to library
          </button>
        </div>
      </div>
    );
  }
  if (!doc) return <Loading label="Opening document…" />;

  const scaleFactor = baseDims.w > 0 ? pageDims.w / baseDims.w : 1;
  const zoomPct = Math.round((renderScale || 1) * 100);

  const selectedNoteObj = notes.find(n => n.id === selectedNote) ?? null;
  const selectedAnnObj = anns.find(a => a.id === selectedAnn && a.type === 'textbox') ?? null;
  const pagePointer = (tool === 'select' || tool === 'eraser') ? 'none' : 'auto';

  const toolbarBelow = (b: Box) => b.y < 0.12
    ? { top: `calc(${(b.y + b.h) * 100}% + 6px)` }
    : { top: `calc(${b.y * 100}% - 34px)` };

  // Toolbar rendered *inside* a note/text box: position relative to that box.
  const innerToolbar = (b: Box) => (b.y + b.h > 0.82
    ? { left: 0, bottom: '100%', marginBottom: 4 }
    : { left: 0, top: '100%', marginTop: 4 });

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ background: 'var(--color-bg)' }}>
      {/* toolbar */}
      {toolbarVisible ? (
        <div
          className="flex flex-wrap items-center gap-1.5 border-b px-3 py-1.5"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-panel)' }}
          data-testid="reader-toolbar"
        >
          <button className="btn btn-ghost btn-icon" onClick={() => setAppPage('library')} title="Back to library" aria-label="Back to library">
            <ArrowLeft size={15} />
          </button>

          <button
            className="btn btn-ghost btn-icon"
            onClick={() => setSidebarVisible(!sidebarVisible)}
            title={sidebarVisible ? 'Hide sidebar (Ctrl+B)' : 'Show sidebar (Ctrl+B)'}
            aria-label="Toggle sidebar"
            data-testid="reader-sidebar-toggle"
          >
            {sidebarVisible ? <PanelLeft size={15} /> : <PanelLeftOpen size={15} />}
          </button>

          <div className="flex items-center gap-1">
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => setPageNum(p => Math.max(1, p - 1))}
              disabled={pageNum <= 1}
              title="Previous page (←)"
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex items-center gap-1 text-xs">
              <input
                className="input text-center"
                style={{ width: 52, padding: '3px 4px' }}
                value={pageNum}
                onChange={e => {
                  const v = Number(e.target.value.replace(/\D/g, ''));
                  if (v >= 1 && v <= numPages) setPageNum(v);
                }}
                aria-label="Page number"
              />
              <span style={{ color: 'var(--color-faint)' }}>/ {numPages}</span>
            </div>
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => setPageNum(p => Math.min(numPages, p + 1))}
              disabled={pageNum >= numPages}
              title="Next page (→)"
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="mx-1 h-5 w-px" style={{ background: 'var(--color-border)' }} />

          <button
            className="btn btn-ghost btn-icon"
            onClick={() => { setFitWidth(false); setZoom(z => Math.max(0.25, z - 0.15)); }}
            title="Zoom out (-)"
            aria-label="Zoom out"
          >
            <ZoomOut size={15} />
          </button>
          <span className="w-10 text-center text-[11px] tabular-nums" style={{ color: 'var(--color-muted)' }}>
            {zoomPct}%
          </span>
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => { setFitWidth(false); setZoom(z => Math.min(4, z + 0.15)); }}
            title="Zoom in (+)"
            aria-label="Zoom in"
          >
            <ZoomIn size={15} />
          </button>
          <button
            className="btn btn-sm"
            onClick={() => setFitWidth(true)}
            aria-pressed={fitWidth}
            style={fitWidth ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)' } : undefined}
            title="Fit page width to the window"
          >
            Fit width
          </button>

          {/* Eye-care Paper Themes */}
          <div className="flex items-center rounded-md border p-0.5" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }} title="Paper Eye-Care Modes: Default (White), Sepia (Warm), Night (Inverted Dark)">
            <button
              className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${paperTheme === 'normal' ? 'bg-[var(--color-panel)] text-[var(--color-text)] shadow-xs font-semibold' : 'opacity-70 hover:opacity-100'}`}
              onClick={() => {
                setPaperTheme('normal');
                try { localStorage.setItem('ui.readerPaperTheme', 'normal'); } catch {}
              }}
              title="Default Paper (White)"
            >
              Default
            </button>
            <button
              className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${paperTheme === 'sepia' ? 'bg-[#fbf0d9] text-[#4a3525] shadow-xs font-semibold' : 'opacity-70 hover:opacity-100'}`}
              onClick={() => {
                setPaperTheme('sepia');
                try { localStorage.setItem('ui.readerPaperTheme', 'sepia'); } catch {}
              }}
              title="Warm Sepia (Low Eye Strain)"
            >
              Sepia
            </button>
            <button
              className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${paperTheme === 'inverted' ? 'bg-[#27272a] text-white shadow-xs font-semibold' : 'opacity-70 hover:opacity-100'}`}
              onClick={() => {
                setPaperTheme('inverted');
                try { localStorage.setItem('ui.readerPaperTheme', 'inverted'); } catch {}
              }}
              title="Night Mode (Inverted Dark Paper)"
            >
              Night
            </button>
          </div>

          <div className="mx-1 h-5 w-px" style={{ background: 'var(--color-border)' }} />

          {/* Reading and Annotation tools */}
          <div className="flex items-center gap-0.5" data-testid="reading-tools-group">
            <ToolButton active={tool === 'select'} onClick={() => setTool('select')} title="Select text (Esc)" icon={<MousePointer2 size={15} />} />
            <ToolButton active={tool === 'pan'} onClick={() => setTool('pan')} title="Pan / hand tool" icon={<Hand size={15} />} />
            <ToolButton active={tool === 'highlight'} onClick={() => setTool('highlight')} title="Highlight a region (H)" icon={<Highlighter size={15} />} />
            <ToolButton active={tool === 'underline'} onClick={() => setTool('underline')} title="Underline a region" icon={<Underline size={15} />} />
            <ToolButton active={tool === 'strikethrough'} onClick={() => setTool('strikethrough')} title="Strike through a region" icon={<Strikethrough size={15} />} />
            <ToolButton active={tool === 'pen'} onClick={() => setTool('pen')} title="Freehand pen" icon={<PenTool size={15} />} />
            <ToolButton active={tool === 'note'} onClick={() => setTool('note')} title="Add visual sticky note (N)" icon={<StickyNote size={15} />} />
            <ToolButton active={tool === 'text'} onClick={() => setTool('text')} title="Write text on the PDF (T)" icon={<Type size={15} />} />
            <ToolButton active={tool === 'screenshot'} onClick={() => { setTool('screenshot'); toast('Drag a rectangle on the page to crop for AI Tutor', 'info'); }} title="Crop screenshot for AI Tutor (S)" icon={<Crop size={15} />} />
            <ToolButton active={tool === 'eraser'} onClick={() => setTool('eraser')} title="Eraser — click an annotation to remove it (E)" icon={<Eraser size={15} />} />
          </div>

          <div className="flex items-center gap-1 pl-1" title="Colour for highlights, ink and new notes">
            {COLORS.map(c => (
              <button
                key={c.name}
                onClick={() => setColor(c.name)}
                title={c.name}
                aria-label={`${c.name} colour`}
                aria-pressed={color === c.name}
                className="h-4 w-4 rounded-full"
                style={{
                  background: c.hex,
                  border: color === c.name ? '2px solid var(--color-text)' : '1px solid var(--color-border2)',
                }}
              />
            ))}
          </div>

          {tool === 'pen' && (
            <div className="flex items-center gap-1 pl-1 bg-[var(--color-panel2)] px-1.5 py-0.5 rounded-md border border-[var(--color-border)]">
              <span className="text-[10px] text-[var(--color-muted)] font-medium">Width:</span>
              {[
                { label: 'Fine', w: 1.6 },
                { label: 'Med', w: 2.8 },
                { label: 'Bold', w: 5.0 },
              ].map(opt => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setPenThickness(opt.w)}
                  className={`px-1.5 py-0.2 rounded text-[10px] ${
                    penThickness === opt.w
                      ? 'bg-[var(--color-accent)] text-white font-bold'
                      : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              <button
                type="button"
                onClick={clearCurrentPageInk}
                className="text-[10px] text-red-400 hover:text-red-300 ml-1 px-1 py-0.2 rounded hover:bg-red-500/10"
                title="Clear all ink drawings on this page"
              >
                Clear Ink
              </button>
            </div>
          )}

          <div className="mx-1 h-5 w-px" style={{ background: 'var(--color-border)' }} />

          {/* AI Tools group */}
          <div className="flex items-center gap-1" data-testid="ai-tools-group">
            <button
              className={`btn btn-sm gap-1.5 ${panel === 'ai' && panelOpen ? 'btn-accent' : ''}`}
              onClick={() => { setPanel('ai'); setPanelOpen(true); }}
              title="Ask MECHSTUDY AI Tutor about this document"
            >
              <Sparkles size={13} />
              <span className="hidden sm:inline font-medium">Ask AI</span>
            </button>
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => { setPanel('ai'); setPanelOpen(true); }}
              title={selection ? 'Explain selected text with AI Tutor' : 'Explain key concept with AI Tutor'}
              aria-label="Explain concept"
            >
              <Lightbulb size={15} style={selection ? { color: 'var(--color-accent)' } : undefined} />
            </button>
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => { setPanel('ai'); setPanelOpen(true); }}
              title="Summarize current page with AI Tutor"
              aria-label="Summarize page"
            >
              <FileText size={15} />
            </button>
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => { setPanel('ai'); setPanelOpen(true); }}
              title="Generate GATE / Exam questions from this page"
              aria-label="Generate questions"
            >
              <Brain size={15} />
            </button>
            <button
              className={`btn btn-ghost btn-icon ${tool === 'screenshot' ? 'btn-active' : ''}`}
              onClick={() => { setTool('screenshot'); toast('Drag a rectangle on the page to crop for AI Tutor', 'info'); }}
              title="Capture screenshot diagram for AI questions (S)"
              aria-label="Capture screenshot"
              style={tool === 'screenshot' ? { color: 'var(--color-accent)' } : undefined}
            >
              <Camera size={15} />
            </button>
          </div>

          <div className="ml-auto flex items-center gap-1">
            <button className="btn btn-sm" onClick={() => setBookmarkDraft({ title: `Page ${pageNum}`, description: '' })}>
              <Bookmark size={12} /> Bookmark
            </button>
            <button className="btn btn-sm" onClick={() => setExportOpen(true)}>
              <Download size={12} /> Export
            </button>

            <ToolButton
              active={splitViewOpen}
              onClick={toggleSplitView}
              title="Split-Screen Multi-Document View (Dual PDF)"
              icon={<Columns2 size={15} />}
            />

            <span className="mx-1 h-5 w-px" style={{ background: 'var(--color-border)' }} />

            <button
              className="btn btn-ghost btn-icon"
              onClick={toggleFullScreen}
              title={fullScreen ? 'Leave full-screen window' : 'Full-screen window (separate from focus mode)'}
              aria-label="Toggle full-screen window"
              aria-pressed={fullScreen}
              data-testid="reader-fullscreen"
              style={fullScreen ? { color: 'var(--color-accent)' } : undefined}
            >
              <Scaling size={15} />
            </button>
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => setReaderFocus(!readerFocus)}
              title={readerFocus ? 'Exit focus mode (Esc)' : 'Reader focus mode — hides app chrome (Ctrl+Shift+F)'}
              aria-label="Toggle focus mode"
              aria-pressed={readerFocus}
              data-testid="reader-focus"
            >
              {readerFocus ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => setPanelOpen(!panelOpen)}
              title={panelOpen ? 'Hide side panel' : 'Show side panel'}
              aria-label="Toggle side panel"
              data-testid="reader-panel-toggle"
            >
              {panelOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
            </button>
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => setToolbarVisible(false)}
              title="Hide reader toolbar (restore from the floating button)"
              aria-label="Hide reader toolbar"
              data-testid="reader-toolbar-hide"
            >
              <PanelTopClose size={15} />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 border-b px-3 py-1" style={{ borderColor: 'var(--color-border)', background: 'var(--color-panel)' }}>
          <button
            className="btn btn-sm gap-1.5"
            onClick={() => setToolbarVisible(true)}
            title="Show reader toolbar"
            data-testid="reader-toolbar-restore"
          >
            <PanelTopClose size={13} /> Show toolbar
          </button>
          <span className="text-[11px]" style={{ color: 'var(--color-faint)' }}>
            Page {pageNum} / {numPages} · {zoomPct}%
          </span>
          <button className="btn btn-sm ml-auto gap-1.5" onClick={restoreLayout} title="Restore the default layout">
            <Minimize2 size={12} /> Restore layout
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* page area */}
        <div ref={scrollerRef} className="pdf-scroll relative flex-1 px-4 py-4">
          {renderError && (
            <div className="mx-auto mb-3 max-w-xl">
              <ErrorState message={renderError} onRetry={() => setPageNum(p => p)} />
            </div>
          )}

          {rendering && (
            <div
              className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full px-3 py-1 text-[11px]"
              style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}
            >
              <Spinner size={11} /> rendering…
            </div>
          )}

          <div className="flex justify-center">
            <div
              ref={pageRef}
              className="relative shadow-lg transition-colors duration-200"
              data-testid="reader-page"
              style={{
                width: pageDims.w || undefined,
                height: pageDims.h || undefined,
                background: paperTheme === 'sepia' ? '#fbf0d9' : paperTheme === 'inverted' ? '#18181b' : '#fff',
                cursor: tool === 'select' ? 'auto' : tool === 'note' || tool === 'text' ? 'copy' : tool === 'eraser' ? 'cell' : 'crosshair',
                touchAction: 'none',
              }}
              onMouseUp={captureSelection}
              onPointerDown={() => { if (tool === 'select') { setSelectedNote(null); setSelectedAnn(null); } }}
            >
              <canvas
                ref={canvasRef}
                style={{
                  display: 'block',
                  filter: paperTheme === 'sepia'
                    ? 'sepia(38%) contrast(96%) brightness(96%)'
                    : paperTheme === 'inverted'
                      ? 'invert(92%) hue-rotate(180deg) contrast(105%)'
                      : 'none',
                  transition: 'filter 0.2s ease',
                }}
              />
              <div ref={textRef} className="textLayer" />

              {/* annotation overlay */}
              <div className="pointer-events-none absolute inset-0">
                {anns.filter(a => (a.type === 'highlight' || a.type === 'underline' || a.type === 'strikethrough') && a.x !== null).map(a => (
                  <div
                    key={a.id}
                    title={a.text ?? undefined}
                    onPointerDown={e => {
                      if (tool !== 'eraser') return;
                      e.stopPropagation();
                      void eraseAnnotation(a);
                    }}
                    style={{
                      position: 'absolute',
                      left: `${(a.x ?? 0) * 100}%`,
                      top: `${(a.y ?? 0) * 100}%`,
                      width: `${(a.w ?? 0) * 100}%`,
                      height: `${(a.h ?? 0) * 100}%`,
                      background: a.type === 'highlight' ? `${annColor(a.color)}55` : 'transparent',
                      borderBottom: a.type === 'underline' ? `2px solid ${annColor(a.color)}` : undefined,
                      borderTop: a.type === 'strikethrough' ? `2px solid ${annColor(a.color)}` : undefined,
                      borderRadius: 2,
                      pointerEvents: tool === 'eraser' ? 'auto' : 'none',
                      cursor: tool === 'eraser' ? 'crosshair' : undefined,
                    }}
                  />
                ))}

                {pageDims.w > 0 && anns.filter(a => a.type === 'ink' && a.data_json).map(a => {
                  let strokes: { points: { x: number; y: number }[]; color?: string; width?: number; opacity?: number }[] = [];
                  try { strokes = JSON.parse(a.data_json ?? '{}').strokes ?? []; } catch { strokes = []; }
                  return (
                    <svg
                      key={`ink-${a.id}`}
                      width="100%"
                      height="100%"
                      viewBox={`0 0 ${pageDims.w} ${pageDims.h}`}
                      onPointerDown={e => {
                        if (tool !== 'eraser') return;
                        e.stopPropagation();
                        void eraseAnnotation(a);
                      }}
                      style={{
                        position: 'absolute', inset: 0, overflow: 'visible',
                        pointerEvents: tool === 'eraser' ? 'auto' : 'none',
                        cursor: tool === 'eraser' ? 'crosshair' : undefined,
                      }}
                    >
                      {strokes.map((s, si) => (
                        <polyline
                          key={si}
                          points={s.points.map(p => `${p.x * pageDims.w},${p.y * pageDims.h}`).join(' ')}
                          fill="none"
                          stroke={s.color ?? '#ef4444'}
                          strokeWidth={s.width ?? 2.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity={s.opacity ?? 0.95}
                        />
                      ))}
                    </svg>
                  );
                })}

                {/* text boxes written directly on the page */}
                {anns.filter(a => a.type === 'textbox').map(a => {
                  const selected = selectedAnn === a.id;
                  const editing = editingAnn === a.id;
                  const box: Box = { x: a.x ?? 0.04, y: a.y ?? 0.04, w: a.w ?? DEFAULT_TEXT_W, h: a.h ?? DEFAULT_TEXT_H };
                  const fs = (a.font_size ?? 14) * scaleFactor;
                  return (
                    <div
                      key={`text-${a.id}`}
                      className={`pdf-textbox${selected ? ' selected' : ''}`}
                      data-testid="pdf-textbox"
                      data-ann-id={a.id}
                      style={{
                        left: `${box.x * 100}%`,
                        top: `${box.y * 100}%`,
                        width: `${box.w * 100}%`,
                        height: `${box.h * 100}%`,
                        color: annColor(a.color),
                        fontSize: fs,
                        lineHeight: 1.25,
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                        padding: 2,
                        zIndex: selected ? 25 : 14,
                        pointerEvents: (tool === 'select' || tool === 'eraser') ? 'auto' : 'none',
                        cursor: tool === 'eraser' ? 'crosshair' : editing ? 'text' : 'move',
                      }}
                      onPointerDown={e => {
                        if (tool === 'eraser') { e.stopPropagation(); void eraseAnnotation(a); return; }
                        if (editing) return;
                        e.stopPropagation();
                        startBoxDrag('ann', 'move', a.id, box)(e);
                      }}
                      onDoubleClick={e => { e.stopPropagation(); startEditAnn(a); }}
                    >
                      {editing ? (
                        <textarea
                          autoFocus
                          value={editAnnText}
                          onChange={e => setEditAnnText(e.target.value)}
                          onPointerDown={e => e.stopPropagation()}
                          onBlur={() => void saveAnnText(a.id)}
                          onKeyDown={e => {
                            if (e.key === 'Escape') { e.stopPropagation(); setEditingAnn(null); }
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void saveAnnText(a.id); }
                          }}
                          style={{
                            width: '100%', height: '100%', resize: 'none', border: 'none', outline: 'none',
                            background: 'rgba(255,255,255,0.85)', color: 'inherit',
                            font: 'inherit', padding: 0, margin: 0,
                          }}
                        />
                      ) : (
                        <div style={{ width: '100%', height: '100%', overflow: 'auto' }}>
                          {a.text || <span style={{ opacity: 0.45 }}>Double-click to write</span>}
                        </div>
                      )}

                      {selected && !editing && (
                        <div
                          className="note-toolbar"
                          style={{ ...innerToolbar(box) }}
                          onPointerDown={e => e.stopPropagation()}
                        >
                          {TEXT_SIZES.map(s => (
                            <button
                              key={s}
                              className="btn btn-ghost btn-sm"
                              style={{ padding: '0 4px', fontSize: 10, ...((a.font_size ?? 14) === s ? { color: 'var(--color-accent)' } : {}) }}
                              onClick={() => void styleAnn(a.id, { fontSize: s })}
                              title={`Font size ${s}`}
                            >
                              {s}
                            </button>
                          ))}
                          <span className="h-3 w-px" style={{ background: 'var(--color-border)' }} />
                          {TEXT_COLORS.map(c => (
                            <button
                              key={c}
                              className="note-swatch"
                              style={{ background: c, outline: annColor(a.color) === c ? '2px solid var(--color-accent)' : undefined }}
                              onClick={() => void styleAnn(a.id, { color: c })}
                              title="Text colour"
                              aria-label="Text colour"
                            />
                          ))}
                          <span className="h-3 w-px" style={{ background: 'var(--color-border)' }} />
                          <button className="btn btn-ghost btn-icon h-5 w-5" onClick={() => startEditAnn(a)} title="Edit text">
                            <PenLine size={10} />
                          </button>
                          <button className="btn btn-ghost btn-icon h-5 w-5" onClick={() => void eraseAnnotation(a)} title="Delete text">
                            <Trash2 size={10} />
                          </button>
                        </div>
                      )}

                      {selected && !editing && (
                        <div
                          onPointerDown={startBoxDrag('ann', 'resize', a.id, box)}
                          title="Drag to resize"
                          style={{
                            position: 'absolute', right: -1, bottom: -1, width: 12, height: 12,
                            cursor: 'nwse-resize',
                            background: 'linear-gradient(135deg, transparent 48%, var(--color-accent) 50%)',
                          }}
                        />
                      )}
                    </div>
                  );
                })}

                {/* new text box being written */}
                {textDraft && (
                  <div
                    className="pdf-textbox selected"
                    data-testid="pdf-textbox-draft"
                    style={{
                      left: `${textDraft.x * 100}%`,
                      top: `${textDraft.y * 100}%`,
                      width: `${textDraft.w * 100}%`,
                      height: `${textDraft.h * 100}%`,
                      color: textDraft.color,
                      fontSize: textDraft.fontSize * scaleFactor,
                      lineHeight: 1.25,
                      padding: 2,
                      zIndex: 40,
                      pointerEvents: 'auto',
                    }}
                  >
                    <textarea
                      autoFocus
                      ref={draftTextRef}
                      value={textDraft.text}
                      onChange={e => setTextDraft(d => (d ? { ...d, text: e.target.value } : d))}
                      onKeyDown={e => {
                        if (e.key === 'Escape') { e.stopPropagation(); setTextDraft(null); }
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void saveTextDraft(); }
                      }}
                      placeholder="Type your explanation…"
                      style={{
                        width: '100%', height: '100%', resize: 'none', border: 'none', outline: 'none',
                        background: 'rgba(255,255,255,0.9)', color: 'inherit', font: 'inherit', padding: 0, margin: 0,
                      }}
                    />
                    <div className="note-toolbar" style={{ ...innerToolbar(textDraft) }} onPointerDown={e => e.stopPropagation()}>
                      <button className="btn btn-sm gap-1" onClick={() => void saveTextDraft()}>
                        <Save size={11} /> Save
                      </button>
                      <button className="btn btn-sm" onClick={() => setTextDraft(null)}>Cancel</button>
                      <span className="h-3 w-px" style={{ background: 'var(--color-border)' }} />
                      {TEXT_SIZES.map(s => (
                        <button
                          key={s}
                          className="btn btn-ghost btn-sm"
                          style={{ padding: '0 4px', fontSize: 10, ...(textDraft.fontSize === s ? { color: 'var(--color-accent)' } : {}) }}
                          onClick={() => setTextDraft(d => (d ? { ...d, fontSize: s } : d))}
                          title={`Font size ${s}`}
                        >
                          {s}
                        </button>
                      ))}
                      <span className="h-3 w-px" style={{ background: 'var(--color-border)' }} />
                      {TEXT_COLORS.map(c => (
                        <button
                          key={c}
                          className="note-swatch"
                          style={{ background: c, outline: textDraft.color === c ? '2px solid var(--color-accent)' : undefined }}
                          onClick={() => setTextDraft(d => (d ? { ...d, color: c } : d))}
                          title="Text colour"
                          aria-label="Text colour"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* in-progress drag */}
                {drag && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${Math.min(drag.x0, drag.x1) * 100}%`,
                      top: `${Math.min(drag.y0, drag.y1) * 100}%`,
                      width: `${Math.abs(drag.x1 - drag.x0) * 100}%`,
                      height: `${Math.abs(drag.y1 - drag.y0) * 100}%`,
                      background: tool === 'highlight' ? `${HEX[color]}55` : 'transparent',
                      borderBottom: tool === 'underline' ? `2px solid ${HEX[color]}` : undefined,
                      borderTop: tool === 'strikethrough' ? `2px solid ${HEX[color]}` : undefined,
                      border: tool === 'highlight' ? 'none' : '1px dashed var(--color-accent)',
                    }}
                  />
                )}

                {/* rectangular sticky notes */}
                {notes.map(n => {
                  const theme = noteTheme(n.color);
                  const selected = selectedNote === n.id;
                  const editing = editingNote === n.id;
                  const box: Box = {
                    x: n.x ?? 0.04, y: n.y ?? 0.04,
                    w: n.w ?? DEFAULT_NOTE_W, h: n.h ?? DEFAULT_NOTE_H,
                  };
                  const fs = noteFontPx(n.font_size, scaleFactor);

                  // Minimized state: collapses to compact floating pill with icon & preview
                  if (n.is_minimized) {
                    return (
                      <div
                        key={`note-min-${n.id}`}
                        className="sticky-note-minimized"
                        data-testid="sticky-note-minimized"
                        data-note-id={n.id}
                        style={{
                          position: 'absolute',
                          left: `${box.x * 100}%`,
                          top: `${box.y * 100}%`,
                          background: theme.bg,
                          color: theme.fg,
                          border: selected ? '2px solid var(--color-accent)' : `1px solid ${theme.border}`,
                          borderRadius: '9999px',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                          zIndex: selected ? 30 : 12,
                          fontSize: 11,
                          padding: '3px 8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          cursor: 'pointer',
                          pointerEvents: tool === 'select' ? 'auto' : 'none',
                          maxWidth: 160,
                          userSelect: 'none',
                        }}
                        onPointerDown={e => {
                          e.stopPropagation();
                          setSelectedNote(n.id);
                          setSelectedAnn(null);
                        }}
                        onDoubleClick={e => {
                          e.stopPropagation();
                          void toggleMinimizeNote(n);
                        }}
                        title="Click or double-click to expand sticky note"
                      >
                        <div
                          className="cursor-move flex items-center"
                          onPointerDown={startBoxDrag('note', 'move', n.id, box)}
                          title="Drag to move"
                        >
                          <GripHorizontal size={9} style={{ opacity: 0.6 }} />
                        </div>
                        <StickyNote size={11} />
                        <span className="truncate flex-1 font-medium text-[10.5px]">
                          {n.body ? truncate(n.body, 16) : 'Note'}
                        </span>
                        <button
                          className="hover:opacity-75 p-0.5"
                          onClick={e => {
                            e.stopPropagation();
                            void toggleMinimizeNote(n);
                          }}
                          title="Expand note"
                          aria-label="Expand note"
                        >
                          <Maximize2 size={10} />
                        </button>
                      </div>
                    );
                  }

                  // Expanded realistic sticky note with folded-corner dog-ear
                  return (
                    <div
                      key={`note-${n.id}`}
                      className="sticky-note"
                      data-testid="sticky-note"
                      data-note-id={n.id}
                      style={{
                        position: 'absolute',
                        left: `${box.x * 100}%`,
                        top: `${box.y * 100}%`,
                        width: `${box.w * 100}%`,
                        height: `${box.h * 100}%`,
                        background: `linear-gradient(175deg, ${theme.bg} 0%, color-mix(in srgb, ${theme.bg} 92%, black) 100%)`,
                        color: theme.fg,
                        border: selected ? '2px solid var(--color-accent)' : `1px solid ${theme.border}`,
                        borderRadius: '2px 2px 14px 2px',
                        boxShadow: '2px 4px 14px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.12)',
                        zIndex: selected ? 30 : 12,
                        fontSize: fs,
                        pointerEvents: tool === 'select' ? 'auto' : 'none',
                        cursor: editing ? 'text' : 'default',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                      onPointerDown={e => {
                        e.stopPropagation();
                        setSelectedNote(n.id);
                        setSelectedAnn(null);
                      }}
                      onDoubleClick={e => { e.stopPropagation(); startEditNote(n); }}
                    >
                      {/* Realistic folded corner dog-ear */}
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          right: 0,
                          width: 14,
                          height: 14,
                          background: `linear-gradient(135deg, transparent 50%, color-mix(in srgb, ${theme.border} 70%, black) 50%)`,
                          pointerEvents: 'none',
                          borderTopLeftRadius: 3,
                          filter: 'drop-shadow(-1px -1px 1px rgba(0,0,0,0.15))',
                        }}
                      />

                      <div
                        className="sticky-note-head"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '2px 4px',
                          borderBottom: '1px solid rgba(0,0,0,0.06)',
                          cursor: 'move',
                        }}
                      >
                        <div
                          className="flex items-center gap-1"
                          onPointerDown={startBoxDrag('note', 'move', n.id, box)}
                          title="Drag to move"
                        >
                          <GripHorizontal size={10} />
                          <span style={{ fontSize: 8.5, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.7, fontWeight: 600 }}>
                            note
                          </span>
                        </div>

                        <div className="flex items-center gap-1" onPointerDown={e => e.stopPropagation()}>
                          <button
                            className="hover:opacity-75 p-0.5 rounded text-blue-800"
                            onClick={async () => {
                              try {
                                await api.flashcards.create({
                                  source_type: 'NOTE',
                                  title: `Sticky Note (p. ${pageNum})`,
                                  front: n.body || 'Review this note concept',
                                  back: `Source: ${doc?.filename || 'Notes'}, Page ${pageNum}`,
                                  subject_name: doc?.subject_code || undefined,
                                });
                                toast('Sticky note sent to Flashcards!', 'success');
                              } catch (err: any) {
                                toast(`Failed to send to flashcards: ${err?.message}`, 'error');
                              }
                            }}
                            title="Send to Active Recall Flashcards"
                            aria-label="Send to flashcards"
                          >
                            <Layers size={9} />
                          </button>
                          <button
                            className="hover:opacity-75 p-0.5 rounded"
                            onClick={() => void toggleMinimizeNote(n)}
                            title="Minimize note to compact icon"
                            aria-label="Minimize note"
                          >
                            <Minus size={9} />
                          </button>
                          <button
                            className="hover:opacity-75 p-0.5 rounded text-red-600"
                            onClick={() => setDeleteNoteTarget(n)}
                            title="Delete note"
                            aria-label="Delete note"
                          >
                            <Trash2 size={9} />
                          </button>
                        </div>
                      </div>

                      {editing ? (
                        <textarea
                          autoFocus
                          value={editBody}
                          onChange={e => setEditBody(e.target.value)}
                          onPointerDown={e => e.stopPropagation()}
                          onBlur={() => void saveNoteBody(n.id)}
                          onKeyDown={e => {
                            if (e.key === 'Escape') { e.stopPropagation(); setEditingNote(null); }
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void saveNoteBody(n.id); }
                          }}
                          style={{
                            flex: '1 1 auto', resize: 'none', border: 'none', outline: 'none',
                            background: 'rgba(255,255,255,0.65)', color: 'inherit',
                            font: 'inherit', lineHeight: 1.35, padding: '4px 6px', margin: 0,
                          }}
                        />
                      ) : (
                        <div
                          className="sticky-note-body"
                          onPointerDown={startBoxDrag('note', 'move', n.id, box)}
                          title="Drag to move · double-click to edit"
                          style={{ lineHeight: 1.35, flex: 1, padding: '4px 6px', overflow: 'hidden' }}
                        >
                          {n.body || <span style={{ opacity: 0.55 }}>Double-click to write…</span>}
                        </div>
                      )}

                      <div
                        className="sticky-note-resize"
                        onPointerDown={startBoxDrag('note', 'resize', n.id, box)}
                        title="Drag to resize"
                        data-testid="sticky-note-resize"
                      />
                    </div>
                  );
                })}

                {/* new sticky note being written */}
                {noteDraft && (
                  <div
                    className="sticky-note"
                    data-testid="sticky-note-draft"
                    style={{
                      left: `${noteDraft.x * 100}%`,
                      top: `${noteDraft.y * 100}%`,
                      width: `${noteDraft.w * 100}%`,
                      height: `${noteDraft.h * 100}%`,
                      background: noteTheme(noteDraft.color).bg,
                      color: noteTheme(noteDraft.color).fg,
                      border: '2px solid var(--color-accent)',
                      fontSize: noteFontPx(12, scaleFactor),
                      zIndex: 41,
                      overflow: 'visible',
                      pointerEvents: 'auto',
                    }}
                  >
                    <div className="sticky-note-head" style={{ cursor: 'default' }}>
                      <StickyNote size={10} />
                      <span style={{ fontSize: 8.5, letterSpacing: '0.03em', textTransform: 'uppercase', opacity: 0.65 }}>
                        new note
                      </span>
                    </div>
                    <textarea
                      autoFocus
                      ref={draftNoteRef}
                      value={noteDraft.body}
                      onChange={e => setNoteDraft(d => (d ? { ...d, body: e.target.value } : d))}
                      onKeyDown={e => {
                        if (e.key === 'Escape') { e.stopPropagation(); setNoteDraft(null); }
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void saveNoteDraft(); }
                      }}
                      placeholder="Write several lines…"
                      style={{
                        flex: '1 1 auto', resize: 'none', border: 'none', outline: 'none',
                        background: 'rgba(255,255,255,0.55)', color: 'inherit',
                        font: 'inherit', lineHeight: 1.35, padding: '4px 6px', margin: 0,
                      }}
                    />
                    <div className="note-toolbar" style={{ ...innerToolbar(noteDraft) }} onPointerDown={e => e.stopPropagation()}>
                      <button className="btn btn-sm gap-1" onClick={() => void saveNoteDraft()}>
                        <Save size={11} /> Save
                      </button>
                      <button className="btn btn-sm" onClick={() => setNoteDraft(null)}>Cancel</button>
                      <span className="h-3 w-px" style={{ background: 'var(--color-border)' }} />
                      {NOTE_COLORS.map(c => (
                        <button
                          key={c.name}
                          className="note-swatch"
                          style={{ background: c.bg, outline: noteDraft.color === c.name ? '2px solid var(--color-accent)' : undefined }}
                          onClick={() => setNoteDraft(d => (d ? { ...d, color: c.name } : d))}
                          title={`${c.name} note`}
                          aria-label={`${c.name} note colour`}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* selected note toolbar (outside the note so it is never clipped) */}
                {selectedNoteObj && !editingNote && (
                  <div
                    className="note-toolbar"
                    data-testid="note-toolbar"
                    style={{
                      left: `${(selectedNoteObj.x ?? 0.04) * 100}%`,
                      ...toolbarBelow({
                        x: selectedNoteObj.x ?? 0.04,
                        y: selectedNoteObj.y ?? 0.04,
                        w: selectedNoteObj.w ?? DEFAULT_NOTE_W,
                        h: selectedNoteObj.h ?? DEFAULT_NOTE_H,
                      }),
                    }}
                    onPointerDown={e => e.stopPropagation()}
                  >
                    {NOTE_COLORS.map(c => (
                      <button
                        key={c.name}
                        className="note-swatch"
                        style={{
                          background: c.bg,
                          outline: selectedNoteObj.color === c.name ? '2px solid var(--color-accent)' : undefined,
                        }}
                        onClick={() => void setNoteColor(selectedNoteObj.id, c.name)}
                        title={`${c.name} note`}
                        aria-label={`${c.name} note colour`}
                      />
                    ))}
                    <span className="h-3 w-px" style={{ background: 'var(--color-border)' }} />
                    <button className="btn btn-ghost btn-icon h-5 w-5" onClick={() => startEditNote(selectedNoteObj)} title="Edit note">
                      <PenLine size={10} />
                    </button>
                    <button className="btn btn-ghost btn-icon h-5 w-5" onClick={() => setDeleteNoteTarget(selectedNoteObj)} title="Delete note">
                      <Trash2 size={10} />
                    </button>
                  </div>
                )}

                {/* text-selection toolbar */}
                {selection && (
                  <div
                    className="note-toolbar"
                    data-testid="selection-toolbar"
                    style={{
                      left: `${selection.x * 100}%`,
                      ...(selection.y < 0.06
                        ? { top: `calc(${(selection.y + selection.h) * 100}% + 6px)` }
                        : { top: `calc(${selection.y * 100}% - 36px)` }),
                      pointerEvents: 'auto',
                      zIndex: 50,
                    }}
                    onMouseDown={e => e.preventDefault()}
                    onPointerDown={e => e.stopPropagation()}
                  >
                    <button
                      className="btn btn-sm gap-1 btn-accent"
                      onClick={() => { setPanel('ai'); setPanelOpen(true); }}
                      title="Ask AI Tutor to explain this selection"
                    >
                      <Sparkles size={11} /> Ask AI
                    </button>
                    <button className="btn btn-sm gap-1" onClick={() => void annotateSelection('highlight')}>
                      <Highlighter size={11} /> Highlight
                    </button>
                    <button className="btn btn-sm gap-1" onClick={() => void annotateSelection('underline')}>
                      <Underline size={11} /> Underline
                    </button>
                    <button className="btn btn-sm gap-1" onClick={() => void annotateSelection('strikethrough')}>
                      <Strikethrough size={11} /> Strike
                    </button>
                    <button
                      className="btn btn-sm gap-1 text-amber-400"
                      onClick={async () => {
                        if (!selection) return;
                        try {
                          await api.flashcards.create({
                            source_type: 'HIGHLIGHT',
                            title: `Reader Highlight (p. ${pageNum})`,
                            front: selection.text,
                            back: `Source: ${doc?.filename || 'Notes'}, Page ${pageNum}`,
                            subject_name: doc?.subject_code || undefined,
                          });
                          toast('Sent highlighted text to Flashcards!', 'success');
                          setSelection(null);
                        } catch (e: any) {
                          toast(`Failed to create flashcard: ${e?.message}`, 'error');
                        }
                      }}
                      title="Send highlighted concept to Flashcards deck"
                    >
                      <Layers size={11} /> To Flashcards
                    </button>
                    <button className="btn btn-ghost btn-icon h-5 w-5" onClick={() => setSelection(null)} title="Dismiss">
                      <X size={11} />
                    </button>
                  </div>
                )}
              </div>

              {/* interaction layer */}
              <div
                className="absolute inset-0"
                style={{
                  pointerEvents: pagePointer,
                  cursor: tool === 'screenshot' ? 'crosshair' : tool === 'pan' ? 'grab' : 'default',
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={() => void finishStroke()}
                onPointerLeave={() => { if (drag || penPoints) void finishStroke(); }}
              >
                {/* Screenshot Crop Selection Box */}
                {drag && tool === 'screenshot' && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${Math.min(drag.x0, drag.x1) * 100}%`,
                      top: `${Math.min(drag.y0, drag.y1) * 100}%`,
                      width: `${Math.abs(drag.x1 - drag.x0) * 100}%`,
                      height: `${Math.abs(drag.y1 - drag.y0) * 100}%`,
                      border: '2px dashed var(--color-accent)',
                      background: 'rgba(59, 130, 246, 0.18)',
                      pointerEvents: 'none',
                      zIndex: 60,
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: -22,
                        left: 0,
                        background: 'var(--color-accent)',
                        color: '#fff',
                        fontSize: 9.5,
                        fontWeight: 600,
                        padding: '1px 6px',
                        borderRadius: 3,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      📸 Crop for AI Tutor
                    </div>
                  </div>
                )}
                {penPoints && penPoints.length > 1 && pageDims.w > 0 && (
                  <svg width="100%" height="100%" viewBox={`0 0 ${pageDims.w} ${pageDims.h}`} style={{ position: 'absolute', inset: 0 }}>
                    <polyline
                      points={penPoints.map(p => `${p.x * pageDims.w},${p.y * pageDims.h}`).join(' ')}
                      fill="none"
                      stroke={HEX[color]}
                      strokeWidth={penThickness}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.95}
                    />
                  </svg>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-center gap-3">
            <button className="btn btn-sm" onClick={() => setPageNum(p => Math.max(1, p - 1))} disabled={pageNum <= 1}>
              <ChevronLeft size={12} /> Previous
            </button>
            <span className="text-[11px]" style={{ color: 'var(--color-faint)' }}>
              {tool === 'select'
                ? 'Select text to highlight or underline it · double-click a note to edit.'
                : tool === 'note'
                  ? 'Click anywhere on the page to place a sticky note.'
                  : tool === 'text'
                    ? 'Click anywhere on the page to write text.'
                    : tool === 'eraser'
                      ? 'Click an annotation to erase it.'
                      : 'Drag on the page to mark a region.'}
            </span>
            <button className="btn btn-sm" onClick={() => setPageNum(p => Math.min(numPages, p + 1))} disabled={pageNum >= numPages}>
              Next <ChevronRight size={12} />
            </button>
          </div>
        </div>

        {/* Split-Screen Dual Document Pane */}
        {splitViewOpen && (
          <SplitSecondaryPane
            initialDocId={splitDocId}
            initialPage={splitPage ?? 1}
            onClose={() => setSplitView(false)}
          />
        )}

        {/* side panel */}
        {panelOpen ? (
          <aside
            className="flex shrink-0 flex-col border-l"
            style={{
              width: panel === 'ai' ? aiPanelWidth : 320,
              borderColor: 'var(--color-border)',
              background: 'var(--color-panel)',
            }}
            aria-label="Document panel"
            data-testid="reader-panel"
          >
            <div className="px-2 pt-2">
              <Tabs
                tabs={[
                  { id: 'ai' as Panel, label: 'AI Tutor' },
                  { id: 'notes' as Panel, label: 'Notes', count: notes.length },
                  { id: 'bookmarks' as Panel, label: 'Marks', count: bookmarks.length },
                  { id: 'search' as Panel, label: 'Find' },
                  { id: 'info' as Panel, label: 'Info' },
                ]}
                active={panel}
                onChange={setPanel}
              />
            </div>

            <div className={`flex-1 min-h-0 ${panel === 'ai' ? 'flex flex-col' : 'scroll-y px-3 py-3'}`}>
              {panel === 'ai' && (
                <ReaderAiPanel
                  documentId={docId}
                  docFilename={doc.filename}
                  pageNum={pageNum}
                  selectedText={selection?.text || null}
                  onClearSelection={() => setSelection(null)}
                  onJumpPage={(p) => setPageNum(p)}
                  pendingScreenshot={pendingScreenshot}
                  onClearScreenshot={() => setPendingScreenshot(null)}
                />
              )}
              {panel === 'notes' && (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="label">Notes on this page</span>
                    <button
                      className="btn btn-sm"
                      onClick={() => { setTool('note'); setSelectedNote(null); }}
                      title="Place a sticky note directly on the page"
                    >
                      <StickyNote size={11} /> Place note
                    </button>
                  </div>

                  {notes.length === 0 && (
                    <div className="rounded-lg border border-dashed px-3 py-3 text-[11px]" style={{ borderColor: 'var(--color-border2)', color: 'var(--color-muted)' }}>
                      No notes on page {pageNum}. Choose the sticky-note tool and click the page to add one.
                    </div>
                  )}

                  <div className="space-y-2">
                    {notes.map(n => {
                      const theme = noteTheme(n.color);
                      return (
                        <div
                          key={n.id}
                          className="rounded-lg px-2.5 py-2"
                          style={{
                            background: `color-mix(in srgb, ${theme.bg} 18%, var(--color-panel2))`,
                            border: `1px solid color-mix(in srgb, ${theme.border} 45%, transparent)`,
                          }}
                        >
                          <div className="flex items-center gap-1.5">
                            <StickyNote size={11} />
                            <button
                              className="min-w-0 flex-1 truncate text-left text-[11px] font-semibold"
                              onClick={() => { setSelectedNote(n.id); setSelectedAnn(null); }}
                              title="Select this note on the page"
                            >
                              {n.title ?? `Note #${n.id}`}
                            </button>
                            <button
                              className="btn btn-ghost btn-icon h-5 w-5 text-blue-400"
                              onClick={async () => {
                                try {
                                  await api.flashcards.create({
                                    source_type: 'NOTE',
                                    title: `Sticky Note (p. ${pageNum})`,
                                    front: n.body || 'Review this note concept',
                                    back: `Source: ${doc?.filename || 'Notes'}, Page ${pageNum}`,
                                    subject_name: doc?.subject_code || undefined,
                                  });
                                  toast('Sticky note sent to Flashcards!', 'success');
                                } catch (err: any) {
                                  toast(`Failed to send to flashcards: ${err?.message}`, 'error');
                                }
                              }}
                              title="Send to Flashcards"
                              aria-label="Send to Flashcards"
                            >
                              <Layers size={10} />
                            </button>
                            <button
                              className="btn btn-ghost btn-icon h-5 w-5"
                              onClick={() => startEditNote(n)}
                              title="Edit note"
                              aria-label="Edit note"
                            >
                              <PenLine size={10} />
                            </button>
                            <button
                              className="btn btn-ghost btn-icon h-5 w-5"
                              onClick={() => setDeleteNoteTarget(n)}
                              title="Delete note"
                              aria-label="Delete note"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                          <div className="mt-1 line-clamp-4 whitespace-pre-wrap text-[11px] leading-snug">
                            {n.body || '(empty)'}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4">
                    <span className="label">Annotations on this page</span>
                    {anns.length === 0 ? (
                      <div className="mt-1.5 text-[11px]" style={{ color: 'var(--color-muted)' }}>
                        None yet. Select text, or use the highlight, text or pen tool.
                      </div>
                    ) : (
                      <div className="mt-1.5 space-y-1">
                        {anns.map(a => (
                          <div key={a.id} className="flex items-center gap-2 rounded-md px-2 py-1" style={{ background: 'var(--color-panel2)' }}>
                            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: annColor(a.color) }} />
                            <button
                              className="min-w-0 flex-1 truncate text-left text-[11px]"
                              onClick={() => { setSelectedAnn(a.id); setSelectedNote(null); }}
                              title="Select on the page"
                            >
                              {a.type}{a.text ? ` · ${truncate(a.text, 40)}` : ''}
                            </button>
                            <button
                              className="btn btn-ghost btn-icon h-5 w-5"
                              onClick={() => setDeleteAnn(a)}
                              title="Delete annotation"
                              aria-label="Delete annotation"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {panel === 'bookmarks' && (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="label">Bookmarks</span>
                    <button className="btn btn-sm" onClick={() => setBookmarkDraft({ title: `Page ${pageNum}`, description: '' })}>
                      Add
                    </button>
                  </div>
                  {bookmarks.length === 0 ? (
                    <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
                      No bookmarks in this document.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {bookmarks.map(b => (
                        <div key={b.id} className="flex items-center gap-2 rounded-md px-2 py-1.5" style={{ background: 'var(--color-panel2)' }}>
                          <button className="min-w-0 flex-1 text-left" onClick={() => setPageNum(b.page)}>
                            <div className="truncate text-[11.5px] font-medium">{b.title}</div>
                            <div className="text-[10px]" style={{ color: 'var(--color-muted)' }}>
                              page {b.page}{b.description ? ` · ${truncate(b.description, 30)}` : ''}
                            </div>
                          </button>
                          <button
                            className="btn btn-ghost btn-icon h-5 w-5"
                            onClick={async () => {
                              try { await api.bookmarks.remove(b.id); await loadPageData(); }
                              catch (e) { toast((e as Error).message, 'error'); }
                            }}
                            title="Delete bookmark"
                            aria-label="Delete bookmark"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {panel === 'search' && (
                <>
                  <span className="label">Search inside this document</span>
                  <div className="mt-1.5 flex gap-1.5">
                    <input
                      className="input"
                      placeholder="Word or phrase…"
                      value={findQ}
                      onChange={e => setFindQ(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') void runFind(); }}
                    />
                    <button className="btn btn-sm" onClick={() => void runFind()} disabled={finding || findQ.trim().length < 2}>
                      {finding ? <Spinner size={12} /> : <Search size={12} />}
                    </button>
                  </div>

                  <div className="mt-2 text-[10.5px] leading-snug" style={{ color: 'var(--color-faint)' }}>
                    Only pages with an extracted text layer or OCR text can be searched. Scanned pages return nothing until you OCR them.
                  </div>

                  <button
                    type="button"
                    className="btn btn-sm btn-ghost w-full mt-2 flex items-center justify-center gap-1.5 text-xs text-cyan-400 border border-cyan-800/40 hover:bg-cyan-950/30"
                    onClick={handleRunGeminiOcr}
                    disabled={isOcrRunning}
                    title="Extract text & LaTeX math from scanned pages using Google AI Studio into FTS5 index"
                  >
                    {isOcrRunning ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>OCR Running via Gemini...</span>
                      </>
                    ) : (
                      <>
                        <Cpu size={13} />
                        <span>OCR Scanned Pages via Gemini</span>
                      </>
                    )}
                  </button>

                  {findResults && (
                    <div className="mt-3">
                      <div className="mb-1 text-[11px]" style={{ color: 'var(--color-muted)' }}>
                        {findResults.length} page(s) matched
                      </div>
                      <div className="space-y-1">
                        {findResults.map(r => (
                          <button
                            key={r.page}
                            className="w-full rounded-md px-2 py-1.5 text-left"
                            style={{ background: 'var(--color-panel2)' }}
                            onClick={() => setPageNum(r.page)}
                          >
                            <div className="text-[11px] font-semibold">Page {r.page}</div>
                            <div className="mt-0.5 line-clamp-2 text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
                              {highlightSnippet(r.text, findQ.trim())}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {panel === 'info' && (
                <div className="space-y-3 text-[11.5px]">
                  <div>
                    <div className="label mb-1">File</div>
                    <div className="break-all">{doc.filename}</div>
                    <div className="mt-0.5 break-all text-[10px]" style={{ color: 'var(--color-faint)' }}>{doc.path}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <InfoRow label="Pages" value={String(doc.page_count ?? '—')} />
                    <InfoRow label="Size" value={bytes(doc.size_bytes)} />
                    <InfoRow label="Text layer" value={doc.has_text_layer ? 'Yes' : 'No (scanned)'} />
                    <InfoRow label="Subject" value={doc.subject_name ?? 'Unassigned'} />
                    <InfoRow label="Added" value={dateLabel(doc.added_at)} />
                    <InfoRow label="Last opened" value={dateLabel(doc.last_opened_at)} />
                  </div>
                  {doc.sha256 && (
                    <div>
                      <div className="label mb-1">SHA-256</div>
                      <div className="break-all font-mono text-[9.5px]" style={{ color: 'var(--color-faint)' }}>{doc.sha256}</div>
                    </div>
                  )}
                  <div
                    className="rounded-lg px-2.5 py-2 text-[10.5px] leading-snug"
                    style={{ background: 'var(--color-panel2)', color: 'var(--color-muted)' }}
                  >
                    The original PDF is opened read-only. Highlights, ink, text and notes are stored separately and can be
                    exported into a new annotated copy.
                  </div>
                  <button
                    className="btn btn-sm w-full"
                    onClick={async () => {
                      try { await api.app.revealPath(doc.path); }
                      catch (e) { toast((e as Error).message, 'error'); }
                    }}
                  >
                    Show file in folder
                  </button>
                </div>
              )}
            </div>

            <div className="border-t px-3 py-2 text-[10px]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-faint)' }}>
              Page {pageNum} of {numPages} · {anns.length} annotation(s) · {notes.length} note(s) on this page
            </div>
          </aside>
        ) : (
          <button
            className="layout-rail no-select"
            onClick={() => setPanelOpen(true)}
            title="Show side panel"
            aria-label="Show side panel"
            data-testid="reader-panel-restore"
            style={{ position: 'absolute', right: 0, left: 'auto', top: '50%', borderRadius: '8px 0 0 8px', borderRight: 'none' }}
          >
            <PanelRightOpen size={16} />
            <span className="layout-rail-label">Panel</span>
          </button>
        )}
      </div>

      {/* bookmark composer */}
      <Modal
        open={!!bookmarkDraft}
        onClose={() => setBookmarkDraft(null)}
        title="Add bookmark"
        width={460}
        footer={
          <>
            <button className="btn" onClick={() => setBookmarkDraft(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => void saveBookmark()}>Add bookmark</button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <div className="label mb-1">Title</div>
            <input
              className="input"
              autoFocus
              value={bookmarkDraft?.title ?? ''}
              onChange={e => setBookmarkDraft(d => (d ? { ...d, title: e.target.value } : d))}
            />
          </div>
          <div>
            <div className="label mb-1">Description (optional)</div>
            <input
              className="input"
              value={bookmarkDraft?.description ?? ''}
              onChange={e => setBookmarkDraft(d => (d ? { ...d, description: e.target.value } : d))}
              placeholder="Why does this page matter?"
            />
          </div>
          <div className="text-[11px]" style={{ color: 'var(--color-faint)' }}>Page {pageNum}</div>
        </div>
      </Modal>

      {/* export */}
      <ExportDialog
        open={exportOpen}
        onClose={() => { setExportOpen(false); setExportResult(null); }}
        busy={exporting}
        result={exportResult}
        onExport={(opts) => void exportPdf(opts)}
        onReveal={async (p) => { try { await api.app.revealPath(p); } catch { /* ignore */ } }}
      />

      <ConfirmDialog
        open={!!deleteAnn}
        title="Delete annotation?"
        danger
        confirmLabel="Delete"
        message="This removes the annotation from the app database. The original PDF is unaffected."
        onCancel={() => setDeleteAnn(null)}
        onConfirm={() => void removeAnnotation()}
      />

      <ConfirmDialog
        open={!!deleteNoteTarget}
        title="Delete sticky note?"
        danger
        confirmLabel="Delete note"
        message="The note and its text will be removed from the app database. The original PDF is unaffected."
        onCancel={() => setDeleteNoteTarget(null)}
        onConfirm={() => void removeNote()}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ToolButton({
  active, onClick, title, icon,
}: { active: boolean; onClick: () => void; title: string; icon: React.ReactNode }) {
  return (
    <button
      className="btn btn-ghost btn-icon"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      style={active ? { background: 'color-mix(in srgb, var(--color-accent) 18%, transparent)', color: 'var(--color-accent)' } : undefined}
    >
      {icon}
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md px-2 py-1.5" style={{ background: 'var(--color-panel2)' }}>
      <div className="label" style={{ fontSize: 9.5 }}>{label}</div>
      <div className="truncate text-[11px]">{value}</div>
    </div>
  );
}

function ExportDialog({
  open, onClose, busy, result, onExport, onReveal,
}: {
  open: boolean; onClose: () => void; busy: boolean;
  result: ExportResult | null;
  onExport: (opts: { highlights: boolean; ink: boolean; markers: boolean; summary: boolean }) => void;
  onReveal: (path: string) => void;
}) {
  const [highlights, setHighlights] = React.useState(true);
  const [ink, setInk] = React.useState(true);
  const [markers, setMarkers] = React.useState(true);
  const [summary, setSummary] = React.useState(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Export annotated copy"
      width={520}
      footer={
        <>
          <button className="btn" onClick={onClose}>{result ? 'Close' : 'Cancel'}</button>
          {!result && (
            <button className="btn btn-primary" onClick={() => onExport({ highlights, ink, markers, summary })} disabled={busy}>
              {busy ? <Spinner size={13} /> : <Download size={13} />} Choose file and export
            </button>
          )}
        </>
      }
    >
      {result ? (
        <div className="space-y-2 text-[12px]">
          <div className="flex items-center gap-2" style={{ color: 'var(--color-accent2)' }}>
            <Check size={14} /> Export complete
          </div>
          <div className="rounded-lg px-3 py-2" style={{ background: 'var(--color-panel2)' }}>
            <div className="break-all">{result.outPath}</div>
            <div className="mt-1 text-[11px]" style={{ color: 'var(--color-muted)' }}>
              {result.pages} pages · {result.highlights} marks · {result.inkStrokes} ink strokes · {result.noteMarkers} notes
            </div>
          </div>
          <button className="btn btn-sm" onClick={() => onReveal(result.outPath)}>Show in folder</button>
          <div className="text-[11px]" style={{ color: 'var(--color-faint)' }}>
            The original PDF was not modified.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-muted)' }}>
            A new PDF is written to the location you choose. The original file is never changed.
          </p>
          <label className="flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={highlights} onChange={e => setHighlights(e.target.checked)} />
            Include highlights, underlines, strikethroughs and written text
          </label>
          <label className="flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={ink} onChange={e => setInk(e.target.checked)} />
            Include freehand ink
          </label>
          <label className="flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={markers} onChange={e => setMarkers(e.target.checked)} />
            Include sticky notes on their pages
          </label>
          <label className="flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={summary} onChange={e => setSummary(e.target.checked)} />
            Append a page listing all notes
          </label>
          <div className="flex items-start gap-2 rounded-lg px-2.5 py-2 text-[11px]" style={{ background: 'var(--color-panel2)', color: 'var(--color-muted)' }}>
            <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
            Handwritten pages are raster images. Highlights and notes are drawn on top; no text is re-flowed or re-typed.
          </div>
        </div>
      )}
    </Modal>
  );
}

function highlightSnippet(text: string, term: string): string {
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx < 0) return truncate(text.replace(/\s+/g, ' '), 160);
  const start = Math.max(0, idx - 50);
  const end = Math.min(text.length, idx + term.length + 90);
  const snippet = text.slice(start, end).replace(/\s+/g, ' ');
  return `${start > 0 ? '…' : ''}${snippet}${end < text.length ? '…' : ''}`;
}
