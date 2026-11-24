import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import {
  Sparkles, Send, Square, RotateCcw, Trash2, Camera, X, Lightbulb,
  FileText, Brain, HelpCircle, AlertTriangle, Scan, Check, Copy, ArrowRight,
} from 'lucide-react';
import { api } from '../../lib/api';
import { Badge, Spinner } from '../../components/ui';
import { VoiceInputButton } from '../../components/VoiceInputButton';
import type {
  AiMessage,
  AiModelInfo,
  TemporaryScreenshotRecord,
} from '../../../../shared/types';

interface ReaderAiPanelProps {
  documentId: number;
  docFilename: string;
  pageNum: number;
  selectedText: string | null;
  onClearSelection: () => void;
  onJumpPage: (page: number) => void;
  pendingScreenshot: string | null;
  onClearScreenshot: () => void;
}

export function ReaderAiPanel({
  documentId,
  docFilename,
  pageNum,
  selectedText,
  onClearSelection,
  onJumpPage,
  pendingScreenshot,
  onClearScreenshot,
}: ReaderAiPanelProps) {
  const [conversationId, setConversationId] = React.useState<number | null>(null);
  const [messages, setMessages] = React.useState<AiMessage[]>([]);
  const [input, setInput] = React.useState('');
  const [streaming, setStreaming] = React.useState(false);
  const [streamDelta, setStreamDelta] = React.useState('');
  const [activeModel, setActiveModel] = React.useState('qwen3:4b');
  const [models, setModels] = React.useState<AiModelInfo[]>([]);
  const [ocrRunning, setOcrRunning] = React.useState(false);
  const [tempScreenshots, setTempScreenshots] = React.useState<TemporaryScreenshotRecord[]>([]);

  const chatBottomRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  // Initialize or load reader conversation
  React.useEffect(() => {
    let alive = true;
    async function initConversation() {
      try {
        const [settings, allConvs, mdlList] = await Promise.all([
          api.ai.settings(),
          api.ai.conversations('chat'),
          api.ai.listModels().catch(() => []),
        ]);
        if (!alive) return;
        setActiveModel(settings.selectedModel);
        setModels(mdlList);

        // Find existing reader conversation for this document, or create one
        const titleTarget = `Reader Tutor: ${docFilename}`;
        const existing = allConvs.find(c => c.title === titleTarget);
        let cid: number;
        if (existing) {
          cid = existing.id;
        } else {
          const created = await api.ai.createConversation(titleTarget, settings.selectedModel, 'tutor');
          cid = created.id;
          // Attach current document
          await api.ai.attachDocument(cid, documentId);
        }

        setConversationId(cid);
        const detail = await api.ai.getConversation(cid);
        if (alive && detail) {
          setMessages(detail.messages || []);
        }

        // Fetch any existing temporary screenshots for countdown
        const ss = await api.ai.getTemporaryScreenshots(cid).catch(() => []);
        if (alive) setTempScreenshots(ss);
      } catch (err) {
        console.error('Failed to init reader AI conversation:', err);
      }
    }

    void initConversation();
    return () => { alive = false; };
  }, [documentId, docFilename]);

  // Listen to streaming chunks
  React.useEffect(() => {
    const unsub = api.ai.onStream((chunk) => {
      if (chunk.conversationId === conversationId) {
        if (chunk.done || chunk.error) {
          setStreaming(false);
          setStreamDelta('');
          if (conversationId) {
            void api.ai.getConversation(conversationId).then(det => {
              if (det) setMessages(det.messages || []);
            });
            void api.ai.getTemporaryScreenshots(conversationId).then(setTempScreenshots);
          }
        } else {
          setStreamDelta(prev => prev + chunk.delta);
        }
      }
    });
    return unsub;
  }, [conversationId]);

  // Scroll to bottom when new messages or stream chunks arrive
  React.useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamDelta]);

  const isVisionModel = (modelName: string): boolean => {
    const m = modelName.toLowerCase();
    return (
      m.includes('vision') ||
      m.includes('llava') ||
      m.includes('minicpm') ||
      m.includes('moondream') ||
      m.includes('vl') ||
      m.includes('bakllava')
    );
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query && !pendingScreenshot) return;
    if (!conversationId || streaming) return;

    setInput('');
    setStreaming(true);
    setStreamDelta('');

    try {
      const images: string[] = [];
      if (pendingScreenshot) {
        images.push(pendingScreenshot);
        // Save screenshot record to DB with 5-message countdown
        await api.ai.saveTemporaryScreenshot(conversationId, pendingScreenshot);
        onClearScreenshot();
      }

      await api.ai.sendMessage({
        conversationId,
        content: query || 'Explain and analyze this screenshot diagram from the current page.',
        model: activeModel,
        mode: 'tutor',
        contextDocumentId: documentId,
        contextPage: pageNum,
        selectedText: selectedText || undefined,
        images: images.length > 0 ? images : undefined,
      });

      // Clear selection after query sent
      if (selectedText) onClearSelection();

      // Refresh screenshots list
      const ss = await api.ai.getTemporaryScreenshots(conversationId).catch(() => []);
      setTempScreenshots(ss);
    } catch (err: any) {
      setStreaming(false);
      setStreamDelta(`\n\n⚠️ **Error:** ${err?.message || 'Failed to send message'}`);
    }
  };

  const handleClearHistory = async () => {
    if (!conversationId) return;
    try {
      await api.ai.clearConversation(conversationId);
      setMessages([]);
      setTempScreenshots([]);
    } catch (e) {
      console.error('Failed to clear conversation:', e);
    }
  };

  const handleOcrScreenshot = async () => {
    if (!pendingScreenshot) return;
    setOcrRunning(true);
    try {
      // Analyze current page text for context
      const analysis = await api.ai.analyzeDocumentTopic(documentId, 'formula equation diagram');
      const snippet = analysis.pageMatches?.[0]?.snippet || analysis.contentSummary || '';
      setInput(prev => (prev ? prev + '\n' : '') + `[Page context: ${snippet.slice(0, 150)}] Explain the diagram shown in the screenshot.`);
    } catch (e) {
      setInput(prev => (prev ? prev + '\n' : '') + 'Explain the diagram in this captured region.');
    } finally {
      setOcrRunning(false);
    }
  };

  const hasVision = isVisionModel(activeModel);

  return (
    <div className="flex h-full flex-col text-xs" data-testid="reader-ai-panel">
      {/* Header Context Card */}
      <div className="border-b p-2.5" style={{ borderColor: 'var(--color-border)', background: 'var(--color-panel2)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-semibold text-[11.5px]">
            <Sparkles size={13} style={{ color: 'var(--color-accent)' }} />
            <span>AI Tutor</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="rounded px-1.5 py-0.5 text-[10px] font-mono" style={{ background: 'var(--color-bg)', color: 'var(--color-muted)' }}>
              {activeModel}
            </span>
            <button
              className="btn btn-ghost btn-icon h-5 w-5"
              onClick={() => void handleClearHistory()}
              title="Clear conversation history"
              aria-label="Clear chat"
            >
              <Trash2 size={11} />
            </button>
          </div>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px]">
          <span className="badge badge-sm truncate max-w-[140px]" title={docFilename}>
            📄 {docFilename}
          </span>
          <span className="badge badge-sm" style={{ background: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}>
            Page {pageNum}
          </span>
        </div>

        {/* Selected text preview banner */}
        {selectedText && (
          <div className="mt-2 rounded border px-2 py-1 text-[11px] leading-snug" style={{ borderColor: 'var(--color-accent)', background: 'var(--color-bg)' }}>
            <div className="flex items-center justify-between font-medium" style={{ color: 'var(--color-accent)' }}>
              <span className="flex items-center gap-1"><Lightbulb size={11} /> Selected Text Context:</span>
              <button onClick={onClearSelection} title="Dismiss selection" className="hover:opacity-75"><X size={10} /></button>
            </div>
            <div className="mt-0.5 line-clamp-2 italic" style={{ color: 'var(--color-muted)' }}>
              "{selectedText}"
            </div>
          </div>
        )}
      </div>

      {/* Quick Action Pills */}
      <div className="scroll-x flex items-center gap-1 border-b px-2 py-1.5" style={{ borderColor: 'var(--color-border)', background: 'var(--color-panel)' }}>
        <button
          className="btn btn-xs whitespace-nowrap gap-1"
          onClick={() => void handleSendMessage(selectedText ? 'Explain this selected concept in clear physical detail.' : 'Explain the key concept on this page.')}
          disabled={streaming}
        >
          <Lightbulb size={10} /> Explain
        </button>
        <button
          className="btn btn-xs whitespace-nowrap gap-1"
          onClick={() => void handleSendMessage('Simplify this with an intuitive physical analogy and plain language.')}
          disabled={streaming}
        >
          <Sparkles size={10} /> Simplify
        </button>
        <button
          className="btn btn-xs whitespace-nowrap gap-1"
          onClick={() => void handleSendMessage('Provide a practical engineering numerical example illustrating this concept.')}
          disabled={streaming}
        >
          <FileText size={10} /> Example
        </button>
        <button
          className="btn btn-xs whitespace-nowrap gap-1"
          onClick={() => void handleSendMessage('Walk through the derivation step-by-step with clear assumptions stated first.')}
          disabled={streaming}
        >
          📐 Derivation
        </button>
        <button
          className="btn btn-xs whitespace-nowrap gap-1"
          onClick={() => void handleSendMessage('Generate a GATE Mechanical Engineering (GATE ME) style numerical problem based on this concept with step-by-step solution.')}
          disabled={streaming}
        >
          <Brain size={10} /> GATE Problem
        </button>
        <button
          className="btn btn-xs whitespace-nowrap gap-1"
          onClick={() => void handleSendMessage('Summarize the essential laws, definitions, and equations on this page in concise bullet points.')}
          disabled={streaming}
        >
          📝 Summarize Page
        </button>
      </div>

      {/* Messages Stream */}
      <div className="scroll-y flex-1 space-y-3 p-3">
        {messages.length === 0 && !streaming && (
          <div className="py-6 text-center text-[11px]" style={{ color: 'var(--color-muted)' }}>
            <Sparkles size={24} className="mx-auto mb-2 opacity-50" style={{ color: 'var(--color-accent)' }} />
            <p className="font-semibold text-xs">AI Tutor Ready</p>
            <p className="mt-1 leading-snug">
              Ask anything about <strong>{docFilename}</strong> (Page {pageNum}).
              <br />Select text on the page or crop a screenshot diagram to ask specific questions.
            </p>
          </div>
        )}

        {messages.map((m) => {
          const isUser = m.role === 'user';
          return (
            <div
              key={m.id}
              className={`rounded-lg p-2.5 ${isUser ? 'ml-4' : 'mr-2'}`}
              style={{
                background: isUser ? 'var(--color-panel2)' : 'var(--color-bg)',
                border: `1px solid ${isUser ? 'var(--color-border)' : 'var(--color-border2)'}`,
              }}
            >
              <div className="mb-1 flex items-center justify-between text-[10px]" style={{ color: 'var(--color-muted)' }}>
                <span className="font-semibold">{isUser ? 'You' : 'MECHSTUDY AI Tutor'}</span>
              </div>
              <div className="prose-mech text-[11.5px] leading-relaxed break-words">
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {m.content}
                </ReactMarkdown>
              </div>
            </div>
          );
        })}

        {/* Live streaming bubble */}
        {streaming && (
          <div
            className="rounded-lg border p-2.5 mr-2"
            style={{ background: 'var(--color-bg)', borderColor: 'var(--color-accent)' }}
          >
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: 'var(--color-accent)' }}>
              <Spinner size={10} /> Generating explanation…
            </div>
            <div className="prose-mech text-[11.5px] leading-relaxed break-words">
              <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                {streamDelta || 'Thinking…'}
              </ReactMarkdown>
            </div>
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* Pending Screenshot Thumbnail Banner */}
      {pendingScreenshot && (
        <div className="border-t p-2" style={{ borderColor: 'var(--color-border)', background: 'var(--color-panel2)' }}>
          <div className="flex items-start gap-2">
            <div className="relative shrink-0 overflow-hidden rounded border" style={{ borderColor: 'var(--color-accent)', width: 72, height: 50 }}>
              <img src={pendingScreenshot} alt="Cropped PDF Region" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[11px] flex items-center gap-1">
                  <Camera size={11} style={{ color: 'var(--color-accent)' }} /> Screenshot Captured
                </span>
                <button onClick={onClearScreenshot} title="Remove screenshot" className="btn btn-ghost btn-icon h-4 w-4">
                  <X size={10} />
                </button>
              </div>
              <div className="mt-0.5 text-[10px] text-amber-500 font-medium">
                ⏳ Temporary screenshot — expires after 5 messages
              </div>

              {!hasVision && (
                <div className="mt-1 flex items-center gap-1">
                  <span className="text-[9.5px]" style={{ color: 'var(--color-muted)' }}>
                    Text-only model active:
                  </span>
                  <button
                    className="btn btn-xs gap-1 py-0 px-1 text-[9.5px]"
                    onClick={() => void handleOcrScreenshot()}
                    disabled={ocrRunning}
                    title="Extract text from screenshot with OCR"
                  >
                    {ocrRunning ? <Spinner size={8} /> : <Scan size={8} />} Run OCR
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Active Temporary Screenshots Countdown Status */}
      {tempScreenshots.length > 0 && !pendingScreenshot && (
        <div className="border-t px-2.5 py-1 text-[10px] flex items-center justify-between" style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>
          <span>📸 Active screenshot in chat:</span>
          <span className="font-semibold text-amber-500">
            {tempScreenshots[0].messagesRemaining} message(s) until auto-delete
          </span>
        </div>
      )}

      {/* Input box */}
      <div className="border-t p-2" style={{ borderColor: 'var(--color-border)', background: 'var(--color-panel)' }}>
        <div className="flex gap-1.5">
          <textarea
            ref={inputRef}
            className="input min-h-[38px] max-h-24 flex-1 resize-none py-1.5 text-xs leading-snug"
            placeholder={
              pendingScreenshot
                ? 'Ask a question about this screenshot diagram… (Enter to send)'
                : selectedText
                ? 'Ask about this selected text… (Enter to send)'
                : `Ask about Page ${pageNum} or this document… (Enter to send)`
            }
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSendMessage();
              }
            }}
            disabled={streaming}
            rows={2}
          />
          <VoiceInputButton
            disabled={streaming}
            className="self-end px-2 py-1.5"
            size={13}
            showTimer={false}
            onTranscript={(transcribedText) => {
              setInput(prev => {
                const trimmed = prev.trim();
                return trimmed ? `${trimmed} ${transcribedText}` : transcribedText;
              });
            }}
            onInterimTranscript={(interim) => {
              setInput(prev => {
                const trimmed = prev.trim();
                return trimmed ? `${trimmed} ${interim}` : interim;
              });
            }}
          />
          {streaming ? (
            <button
              className="btn btn-danger self-end px-2 py-1.5"
              onClick={() => void api.ai.stopGeneration()}
              title="Stop generation"
            >
              <Square size={13} />
            </button>
          ) : (
            <button
              className="btn btn-accent self-end px-2 py-1.5"
              onClick={() => void handleSendMessage()}
              disabled={(!input.trim() && !pendingScreenshot) || streaming}
              title="Send to AI Tutor (Enter)"
            >
              <Send size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
