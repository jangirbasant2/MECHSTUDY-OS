import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import {
  Bot, Send, Square, Sparkles, GraduationCap, CalendarDays, Brain, Settings,
  Plus, Trash2, Pin, PinOff, Copy, Check, ChevronDown, ChevronRight,
  RefreshCw, BookOpen, AlertCircle, CheckCircle2, Search, ExternalLink,
  Cpu, Clock, Wrench, ShieldAlert, Play,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useApp } from '../../store';
import { Badge, EmptyState, Loading, SectionHeader, Stat, Tabs } from '../../components/ui';
import { StudyMaterialsBar } from './StudyMaterialsBar';
import { StudyMaterialPicker } from './StudyMaterialPicker';
import { OcrProgressModal } from './OcrProgressModal';
import type {
  AttachedDocumentSummary,
  DocumentProcessingProgress,
  AiEngineStatus,
  AiModelInfo,
  AiConversationSummary,
  AiConversationDetail,
  AiMessage,
  AiCitation,
  AiSettings,
  AiMemory,
} from '../../../../shared/types';

type AITab = 'chat' | 'tutor' | 'planner' | 'memory' | 'settings';
type TutorLevel = 'beginner' | 'university' | 'gate' | 'advanced';

const SUGGESTED_PROMPTS = [
  'Make a study planner for thermodynamics for today as I want to complete entropy',
  'Start my thermodynamics study session',
  'Explain the second law of thermodynamics using my notes',
  'Derive Euler buckling formula with assumptions',
  'What are my weakest topics based on my practice?',
];

const TUTOR_LEVELS: { id: TutorLevel; label: string; desc: string }[] = [
  { id: 'beginner', label: 'Beginner', desc: 'Intuitive physical analogies, core intuition & simple examples' },
  { id: 'university', label: 'University Exam', desc: 'RTU Kota pattern, textbook derivations & step-by-step proofs' },
  { id: 'gate', label: 'GATE ME', desc: 'Formulaic shortcuts, numerical tricks, boundary cases & accuracy' },
  { id: 'advanced', label: 'Advanced Engineering', desc: 'Rigorous continuum mechanics, governing equations & assumptions' },
];

export function AIPage() {
  const toast = useApp(s => s.toast);
  const openDocument = useApp(s => s.openDocument);
  const setPage = useApp(s => s.setPage);

  const [tab, setTab] = React.useState<AITab>('chat');
  const [engineStatus, setEngineStatus] = React.useState<AiEngineStatus | null>(null);
  const [models, setModels] = React.useState<AiModelInfo[]>([]);
  const [settings, setSettings] = React.useState<AiSettings | null>(null);

  // Conversations
  const [conversations, setConversations] = React.useState<AiConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = React.useState<number | null>(null);
  const [activeConv, setActiveConv] = React.useState<AiConversationDetail | null>(null);
  const [searchConvQuery, setSearchConvQuery] = React.useState('');

  // Input & Streaming
  const [inputMessage, setInputMessage] = React.useState('');
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [streamingContent, setStreamingContent] = React.useState('');
  const [streamingCitations, setStreamingCitations] = React.useState<AiCitation[]>([]);
  const [copiedId, setCopiedId] = React.useState<number | null>(null);

  // Tutor state
  const [tutorLevel, setTutorLevel] = React.useState<TutorLevel>('university');

  // Memories
  const [memories, setMemories] = React.useState<AiMemory[]>([]);
  const [newMemoryKey, setNewMemoryKey] = React.useState('');
  const [newMemoryContent, setNewMemoryContent] = React.useState('');
  const [newMemoryCategory, setNewMemoryCategory] = React.useState<AiMemory['category']>('academic_goal');

  // Schedule preview
  const [todaySchedule, setTodaySchedule] = React.useState<any>(null);
  const [startingOllama, setStartingOllama] = React.useState(false);
  const [inlineKey, setInlineKey] = React.useState('');

  // Study Materials & OCR state
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [processingDocs, setProcessingDocs] = React.useState<Map<number, DocumentProcessingProgress>>(new Map());
  const [activeProgressModal, setActiveProgressModal] = React.useState<DocumentProcessingProgress | null>(null);

  const attachedDocIds = React.useMemo(() => {
    return activeConv?.attachedDocuments?.map(d => d.documentId) || [];
  }, [activeConv?.attachedDocuments]);

  const handleSaveMaterials = async (selectedDocIds: number[]) => {
    let convId = activeConvId;
    if (!convId) {
      try {
        const newConv = await api.ai.createConversation('Study Session');
        convId = newConv.id;
        setActiveConvId(convId);
        await loadConversations();
      } catch (e) {
        toast('Failed to initialize conversation for materials: ' + (e as Error).message, 'error');
        return;
      }
    }

    try {
      await api.ai.setAttachedDocuments(convId, selectedDocIds);
      const updated = await api.ai.getConversation(convId);
      setActiveConv(updated);
      toast(`Attached ${selectedDocIds.length} study material(s) to conversation`, 'success');
    } catch (e) {
      toast('Failed to save attached materials: ' + (e as Error).message, 'error');
    }
  };

  const handleDetachMaterial = async (docId: number) => {
    if (!activeConvId) return;
    try {
      await api.ai.detachDocument(activeConvId, docId);
      const updated = await api.ai.getConversation(activeConvId);
      setActiveConv(updated);
      toast('Removed study material from conversation', 'info');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const handleProcessDocument = async (docId: number) => {
    try {
      toast('Starting document text extraction / OCR in background...', 'info');
      const res = await api.ai.processDocument(docId);
      if (!res.success) {
        toast(res.message, 'error');
      }
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const handleStartOllama = async () => {
    setStartingOllama(true);
    try {
      const res = await api.ai.startOllama();
      if (res.started) {
        toast('Ollama server successfully launched in background!', 'success');
        await refreshEngine();
      } else {
        toast(res.error || res.message, 'error');
      }
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setStartingOllama(false);
    }
  };

  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 1. Initial Load & Engine Check
  const refreshEngine = React.useCallback(async () => {
    try {
      const [st, mList, sett] = await Promise.all([
        api.ai.status(),
        api.ai.listModels(),
        api.ai.settings(),
      ]);
      setEngineStatus(st);
      setModels(mList);
      setSettings(sett);
    } catch (e) {
      console.error('Failed to load AI engine status:', e);
    }
  }, []);

  const loadConversations = React.useCallback(async (selectId?: number) => {
    try {
      const list = await api.ai.conversations();
      setConversations(list);
      if (list.length > 0) {
        const targetId = selectId || activeConvId || list[0].id;
        setActiveConvId(targetId);
        const detail = await api.ai.getConversation(targetId);
        setActiveConv(detail);
      } else {
        // Create initial conversation if none exist
        const newC = await api.ai.createConversation('Study Session');
        setConversations([newC]);
        setActiveConvId(newC.id);
        const detail = await api.ai.getConversation(newC.id);
        setActiveConv(detail);
      }
    } catch (e) {
      console.error('Failed to load conversations:', e);
    }
  }, [activeConvId]);

  const loadMemories = React.useCallback(async () => {
    try {
      const mems = await api.ai.getMemories();
      setMemories(mems);
    } catch (e) {
      console.error('Failed to load memories:', e);
    }
  }, []);

  const loadSchedule = React.useCallback(async () => {
    try {
      const res = await api.ai.executeToolDirect('get_today_schedule', {}) as any;
      setTodaySchedule(res?.result);
    } catch {
      // non-fatal
    }
  }, []);

  React.useEffect(() => {
    void refreshEngine();
    void loadConversations();
    void loadMemories();
    void loadSchedule();
  }, [refreshEngine, loadConversations, loadMemories, loadSchedule]);

  // Subscribe to document extraction / OCR progress
  React.useEffect(() => {
    const unsub = api.ai.onDocumentProgress((progress) => {
      setProcessingDocs(prev => {
        const next = new Map(prev);
        if (progress.status === 'completed' || progress.status === 'failed' || progress.status === 'cancelled') {
          next.delete(progress.documentId);
          if (activeConvId) {
            void api.ai.getConversation(activeConvId).then(d => setActiveConv(d));
          }
        } else {
          next.set(progress.documentId, progress);
        }
        return next;
      });

      setActiveProgressModal(curr => {
        if (curr && curr.documentId === progress.documentId) {
          return progress;
        }
        return curr;
      });
    });
    return unsub;
  }, [activeConvId]);

  // Subscribe to streaming chunks
  React.useEffect(() => {
    const unsubscribe = api.ai.onStream((chunk) => {
      if (chunk.delta) {
        setStreamingContent(prev => prev + chunk.delta);
      }
      if (chunk.citations && chunk.citations.length > 0) {
        setStreamingCitations(chunk.citations);
      }
      if (chunk.done) {
        setIsGenerating(false);
        setStreamingContent('');
        setStreamingCitations([]);
        if (activeConvId) {
          api.ai.getConversation(activeConvId).then(setActiveConv);
          api.ai.conversations().then(setConversations);
        }
      }
      scrollToBottom();
    });
    return unsubscribe;
  }, [activeConvId]);

  React.useEffect(() => {
    scrollToBottom();
  }, [activeConv?.messages, streamingContent]);

  // Actions
  const handleSelectConversation = async (id: number) => {
    setActiveConvId(id);
    const detail = await api.ai.getConversation(id);
    setActiveConv(detail);
  };

  const handleNewConversation = async (mode: 'chat' | 'tutor' | 'planner' = 'chat') => {
    try {
      const newC = await api.ai.createConversation('New Conversation', undefined, mode);
      await loadConversations(newC.id);
      toast('Started new conversation', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const handleDeleteConversation = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.ai.deleteConversation(id);
      await loadConversations();
      toast('Conversation deleted', 'info');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const handleClearConversation = async () => {
    if (!activeConvId) return;
    try {
      await api.ai.clearConversation(activeConvId);
      const detail = await api.ai.getConversation(activeConvId);
      setActiveConv(detail);
      toast('Conversation cleared', 'info');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const content = (textToSend || inputMessage).trim();
    if (!content || !activeConvId || isGenerating) return;

    setInputMessage('');
    setIsGenerating(true);
    setStreamingContent('');
    setStreamingCitations([]);

    try {
      await api.ai.sendMessage({
        conversationId: activeConvId,
        content,
        mode: tab === 'tutor' ? 'tutor' : tab === 'planner' ? 'planner' : 'chat',
        tutorLevel: tab === 'tutor' ? tutorLevel : undefined,
        contextDocumentId: activeConv?.attachedDocuments?.[0]?.documentId,
      });
    } catch (e) {
      setIsGenerating(false);
      toast((e as Error).message, 'error');
    }
  };

  const handleStopGeneration = async () => {
    try {
      await api.ai.stopGeneration();
      setIsGenerating(false);
      toast('Generation stopped', 'info');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const handleCopy = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    try {
      await api.ai.updateSettings(settings);
      toast('AI settings saved successfully', 'success');
      await refreshEngine();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const handleAddMemory = async () => {
    if (!newMemoryKey.trim() || !newMemoryContent.trim()) {
      toast('Key and content are required', 'error');
      return;
    }
    try {
      await api.ai.saveMemory(newMemoryKey, newMemoryContent, newMemoryCategory);
      setNewMemoryKey('');
      setNewMemoryContent('');
      await loadMemories();
      toast('Academic memory saved', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const handleDeleteMemory = async (id: number) => {
    try {
      await api.ai.deleteMemory(id);
      await loadMemories();
      toast('Memory removed', 'info');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const filteredConversations = conversations.filter(c =>
    c.title.toLowerCase().includes(searchConvQuery.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      {/* Top Header */}
      <div className="border-b px-5 py-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-panel)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{ background: 'var(--color-accent)', color: '#fff' }}
            >
              <Bot size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold leading-tight">MECHSTUDY AI</h1>
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
                  style={{
                    background: engineStatus?.connected
                      ? 'color-mix(in srgb, var(--color-accent2) 20%, transparent)'
                      : 'color-mix(in srgb, var(--color-danger) 20%, transparent)',
                    color: engineStatus?.connected ? 'var(--color-accent2)' : 'var(--color-danger)',
                  }}
                >
                  {engineStatus?.connected ? `Google AI Connected (${engineStatus?.activeModel || 'gemini-2.5-flash'})` : 'API Key Required'}
                </span>
              </div>
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                Personal Academic Brain for RTU B.Tech Mechanical & GATE ME
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Tabs
              active={tab}
              onChange={setTab}
              tabs={[
                { id: 'chat', label: 'Academic Chat' },
                { id: 'tutor', label: 'AI Tutor' },
                { id: 'planner', label: 'Study Planner' },
                { id: 'memory', label: 'Academic Memory', count: memories.length },
                { id: 'settings', label: 'Settings' },
              ]}
            />
          </div>
        </div>

        {/* Google AI Studio API Key Setup Banner */}
        {engineStatus && !engineStatus.connected && (
          <div
            className="mt-2.5 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-xs"
            style={{
              borderColor: 'color-mix(in srgb, var(--color-warn) 40%, transparent)',
              background: 'color-mix(in srgb, var(--color-warn) 10%, transparent)',
              color: 'var(--color-text)',
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <Sparkles size={16} className="text-amber-400 shrink-0" />
              <div>
                <div className="font-semibold text-xs">Google AI Studio API Key Required for AI Tutor</div>
                <div className="text-[11px] opacity-90">
                  MECHSTUDY AI connects directly to Google AI Studio (<code className="text-cyan-400 font-mono">@google/genai</code>) so you get high-speed tutoring with zero local GPU setup.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <input
                type="password"
                placeholder="Paste AIza... key"
                className="input text-xs w-48 bg-[var(--color-bg)] py-1"
                value={inlineKey}
                onChange={e => setInlineKey(e.target.value)}
              />
              <button
                className="btn btn-sm btn-primary"
                onClick={async () => {
                  if (!inlineKey.trim()) {
                    toast('Please enter a valid Google AI Studio API key', 'error');
                    return;
                  }
                  await api.ai.updateSettings({ apiKey: inlineKey.trim() });
                  toast('API Key saved! Reconnecting AI Tutor...', 'success');
                  await refreshEngine();
                }}
              >
                Save & Connect
              </button>
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="btn btn-sm btn-secondary flex items-center gap-1"
              >
                <span>Free Key</span>
                <ExternalLink size={11} />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ================= CHAT & TUTOR & PLANNER VIEW ================= */}
        {(tab === 'chat' || tab === 'tutor' || tab === 'planner') && (
          <>
            {/* Conversation List Sidebar */}
            <div
              className="flex w-64 flex-col border-r shrink-0"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-panel)' }}
            >
              <div className="p-3 border-b space-y-2" style={{ borderColor: 'var(--color-border)' }}>
                <button
                  className="btn btn-primary w-full gap-2 justify-center"
                  onClick={() => handleNewConversation(tab === 'tutor' ? 'tutor' : tab === 'planner' ? 'planner' : 'chat')}
                >
                  <Plus size={15} /> New Conversation
                </button>
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-2.5" style={{ color: 'var(--color-faint)' }} />
                  <input
                    type="text"
                    placeholder="Search conversations..."
                    value={searchConvQuery}
                    onChange={e => setSearchConvQuery(e.target.value)}
                    className="input w-full pl-8 py-1 text-xs"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {filteredConversations.length === 0 ? (
                  <div className="p-4 text-center text-xs" style={{ color: 'var(--color-muted)' }}>
                    No conversations yet
                  </div>
                ) : (
                  filteredConversations.map(c => {
                    const active = c.id === activeConvId;
                    return (
                      <div
                        key={c.id}
                        onClick={() => handleSelectConversation(c.id)}
                        className="group flex items-center justify-between rounded-lg px-2.5 py-2 text-left cursor-pointer transition-colors"
                        style={{
                          background: active ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'transparent',
                          color: active ? 'var(--color-accent)' : 'var(--color-text)',
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {c.mode === 'tutor' && <GraduationCap size={12} className="text-amber-500 shrink-0" />}
                            {c.mode === 'planner' && <CalendarDays size={12} className="text-sky-500 shrink-0" />}
                            <span className="truncate text-xs font-medium">{c.title}</span>
                          </div>
                          <span className="text-[10px]" style={{ color: 'var(--color-faint)' }}>
                            {c.messageCount} messages · {c.model || 'Default'}
                          </span>
                        </div>
                        <div className="hidden group-hover:flex items-center gap-1">
                          <button
                            className="p-1 hover:text-[var(--color-danger)] transition-colors"
                            onClick={(e) => handleDeleteConversation(c.id, e)}
                            title="Delete conversation"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Sidebar Footer with Active Model */}
              <div className="border-t p-2.5 text-[11px]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Cpu size={13} /> Model:
                  </span>
                  <span className="font-semibold text-xs text-[var(--color-text)]">
                    {settings?.selectedModel || 'qwen3:4b'}
                  </span>
                </div>
              </div>
            </div>

            {/* Conversation Area */}
            <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
              {/* Tutor Mode Banner */}
              {tab === 'tutor' && (
                <div className="border-b px-4 py-2.5 flex items-center justify-between" style={{ borderColor: 'var(--color-border)', background: 'var(--color-panel2)' }}>
                  <div className="flex items-center gap-2">
                    <GraduationCap size={16} className="text-amber-500" />
                    <span className="text-xs font-semibold">Tutor Explanation Level:</span>
                    <div className="flex gap-1">
                      {TUTOR_LEVELS.map(lvl => (
                        <button
                          key={lvl.id}
                          onClick={() => setTutorLevel(lvl.id)}
                          className={`btn btn-sm text-[11px] px-2 py-0.5 rounded ${tutorLevel === lvl.id ? 'btn-primary' : 'btn-ghost'}`}
                          title={lvl.desc}
                        >
                          {lvl.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
                    {TUTOR_LEVELS.find(l => l.id === tutorLevel)?.desc}
                  </span>
                </div>
              )}

              {/* Study Planner Banner */}
              {tab === 'planner' && (
                <div className="border-b px-4 py-2 flex items-center justify-between" style={{ borderColor: 'var(--color-border)', background: 'var(--color-panel2)' }}>
                  <div className="flex items-center gap-2 text-xs">
                    <CalendarDays size={15} className="text-sky-500" />
                    <span>
                      <strong>College Timings Protected:</strong> {settings?.collegeStart} – {settings?.collegeEnd} · Max Daily: {settings?.maxDailyStudyHours}h
                    </span>
                  </div>
                  {todaySchedule && (
                    <span className="text-xs text-[var(--color-muted)]">
                      Today: {todaySchedule.tasksCount} tasks planned
                    </span>
                  )}
                </div>
              )}

              {/* Study Materials Bar */}
              <StudyMaterialsBar
                attachedDocuments={activeConv?.attachedDocuments || []}
                processingDocs={processingDocs}
                onOpenPicker={() => setPickerOpen(true)}
                onDetachDocument={handleDetachMaterial}
                onProcessDocument={handleProcessDocument}
                onOpenReader={(id, page) => openDocument(id, page ?? 1)}
                onViewProgress={(prog) => setActiveProgressModal(prog)}
              />

              {/* Messages Scroll Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {(!activeConv?.messages || activeConv.messages.length === 0) && !streamingContent ? (
                  <div className="flex h-full flex-col items-center justify-center text-center p-6 max-w-xl mx-auto">
                    <div
                      className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
                      style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)', color: 'var(--color-accent)' }}
                    >
                      <Sparkles size={28} />
                    </div>
                    <h2 className="text-lg font-bold">MECHSTUDY AI Brain</h2>
                    <p className="mt-1.5 text-xs text-[var(--color-muted)] leading-relaxed">
                      Your local academic co-pilot for RTU III-Sem and GATE Mechanical. Ask concept explanations, plan study hours, generate numerical practice, or query your handwritten notes.
                    </p>

                    <div className="mt-6 w-full space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-faint)]">
                        Suggested Starters
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {SUGGESTED_PROMPTS.map((prompt, i) => (
                          <button
                            key={i}
                            onClick={() => handleSendMessage(prompt)}
                            className="rounded-lg border p-2.5 text-left text-xs transition-colors hover:border-[var(--color-accent)]"
                            style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}
                          >
                            💡 {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {activeConv?.messages.map(m => (
                      <div
                        key={m.id}
                        className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px]" style={{ color: 'var(--color-faint)' }}>
                          <span>{m.role === 'user' ? 'You' : 'MECHSTUDY AI'}</span>
                          <span>·</span>
                          <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>

                        <div
                          className={`max-w-[85%] rounded-xl px-4 py-3 text-xs leading-relaxed shadow-sm ${
                            m.role === 'user'
                              ? 'text-white'
                              : 'border'
                          }`}
                          style={{
                            background: m.role === 'user'
                              ? 'var(--color-accent)'
                              : 'var(--color-panel)',
                            borderColor: 'var(--color-border)',
                          }}
                        >
                          {/* Markdown rendering with LaTeX Math */}
                          <div className="markdown text-xs space-y-2">
                            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                              {m.content}
                            </ReactMarkdown>
                          </div>

                          {/* Tool Calls Execution Box */}
                          {m.toolCalls && m.toolCalls.length > 0 && (
                            <div className="mt-3 rounded border p-2 text-[11px] space-y-1" style={{ background: 'var(--color-panel2)', borderColor: 'var(--color-border)' }}>
                              <div className="flex items-center gap-1.5 font-semibold text-[var(--color-accent)]">
                                <Wrench size={12} />
                                <span>Tools Executed:</span>
                              </div>
                              {m.toolCalls.map((tc, idx) => (
                                <div key={idx} className="font-mono text-[10px] pl-4">
                                  ⚡ <span className="font-bold">{tc.name}</span>({JSON.stringify(tc.arguments)})
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Citations Box */}
                          {m.citations && m.citations.length > 0 && (
                            <div className="mt-3 rounded border p-2 text-[11px] space-y-1" style={{ background: 'var(--color-panel2)', borderColor: 'var(--color-border)' }}>
                              <div className="flex items-center gap-1.5 font-semibold text-amber-500">
                                <BookOpen size={12} />
                                <span>Verified Study Citations:</span>
                              </div>
                              <div className="grid gap-1 mt-1">
                                {m.citations.map((c, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between rounded px-2 py-1 bg-black/10 text-[10px]"
                                  >
                                    <span className="truncate">
                                      📄 <strong>{c.filename}</strong> (Page {c.page})
                                    </span>
                                    {c.documentId > 0 && (
                                      <button
                                        onClick={() => openDocument(c.documentId, c.page)}
                                        className="btn btn-ghost btn-sm p-0 text-amber-500 hover:underline gap-1"
                                      >
                                        Open <ExternalLink size={10} />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Assistant Message Actions */}
                          {m.role === 'assistant' && (
                            <div className="mt-2 flex items-center justify-between gap-2 border-t pt-1.5" style={{ borderColor: 'var(--color-border)' }}>
                              {(m.content.includes('Planner') || m.content.includes('Study Plan') || m.content.includes('Session')) ? (
                                <button
                                  onClick={() => setPage('planner')}
                                  className="btn btn-sm btn-primary text-[10.5px] gap-1 py-0.5 px-2"
                                  title="View in Planner"
                                >
                                  <CalendarDays size={11} /> Open in Planner
                                </button>
                              ) : <span />}

                              <button
                                onClick={() => handleCopy(m.content, m.id)}
                                className="btn btn-ghost btn-sm text-[10px] gap-1 p-1"
                                title="Copy response"
                              >
                                {copiedId === m.id ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                                {copiedId === m.id ? 'Copied' : 'Copy'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Live Streaming Message Bubble */}
                    {isGenerating && streamingContent && (
                      <div className="flex flex-col items-start">
                        <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px]" style={{ color: 'var(--color-faint)' }}>
                          <span>MECHSTUDY AI</span>
                          <span className="animate-pulse text-amber-500">● Streaming...</span>
                        </div>
                        <div
                          className="max-w-[85%] rounded-xl px-4 py-3 text-xs leading-relaxed shadow-sm border"
                          style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}
                        >
                          <div className="markdown text-xs space-y-2">
                            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                              {streamingContent}
                            </ReactMarkdown>
                          </div>
                          {streamingCitations.length > 0 && (
                            <div className="mt-2 text-[10px] text-amber-500">
                              📚 {streamingCitations.length} study sources retrieved
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Bottom Input Area */}
              <div className="border-t p-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-panel)' }}>
                <div className="flex items-end gap-2">
                  <div className="flex-1 relative">
                    <textarea
                      value={inputMessage}
                      onChange={e => setInputMessage(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder={
                        tab === 'tutor'
                          ? `Ask any mechanical engineering topic at ${tutorLevel} level... (Shift+Enter for newline)`
                          : tab === 'planner'
                            ? 'e.g. "Schedule thermodynamics tomorrow from 6 to 8 PM" or "Find a free 2h slot"'
                            : 'Ask MECHSTUDY AI anything about your syllabus, notes, or schedule...'
                      }
                      rows={2}
                      className="input w-full resize-none p-2.5 text-xs leading-relaxed"
                      disabled={isGenerating}
                    />
                  </div>

                  {isGenerating ? (
                    <button
                      onClick={handleStopGeneration}
                      className="btn btn-danger gap-1.5 h-[56px] px-4 text-xs font-semibold"
                      title="Stop generation"
                    >
                      <Square size={14} /> Stop
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSendMessage()}
                      disabled={!inputMessage.trim()}
                      className="btn btn-primary gap-1.5 h-[56px] px-4 text-xs font-semibold"
                      title="Send message (Enter)"
                    >
                      <Send size={14} /> Send
                    </button>
                  )}
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px]" style={{ color: 'var(--color-muted)' }}>
                  <span>Press <kbd className="rounded bg-black/20 px-1 py-0.5">Enter</kbd> to send, <kbd className="rounded bg-black/20 px-1 py-0.5">Shift+Enter</kbd> for newline</span>
                  {activeConv && activeConv.messages.length > 0 && (
                    <button
                      onClick={handleClearConversation}
                      className="hover:text-[var(--color-danger)] transition-colors"
                    >
                      Clear conversation
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ================= ACADEMIC MEMORY VIEW ================= */}
        {tab === 'memory' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <SectionHeader
              title="Persistent Academic Memory"
              description="Information the AI remembers about your goals, study habits, strengths, and constraints across sessions."
            />

            {/* Add Memory Form */}
            <div className="card p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-faint)]">Add New Academic Memory</h3>
              <div className="grid gap-3 md:grid-cols-3">
                <input
                  type="text"
                  placeholder="Memory Key (e.g. target_gate_rank)"
                  value={newMemoryKey}
                  onChange={e => setNewMemoryKey(e.target.value)}
                  className="input text-xs"
                />
                <select
                  value={newMemoryCategory}
                  onChange={e => setNewMemoryCategory(e.target.value as any)}
                  className="input text-xs"
                >
                  <option value="academic_goal">Academic Goal</option>
                  <option value="preference">Preference</option>
                  <option value="weakness">Weak Topic / Area</option>
                  <option value="constraint">Study Constraint</option>
                  <option value="fact">Fact</option>
                </select>
                <button className="btn btn-primary text-xs" onClick={handleAddMemory}>
                  <Plus size={14} /> Save Memory
                </button>
              </div>
              <textarea
                placeholder="Content (e.g. Targeting top 100 in GATE ME 2027, focusing on Thermodynamics and SOM)"
                value={newMemoryContent}
                onChange={e => setNewMemoryContent(e.target.value)}
                className="input w-full text-xs p-2.5"
                rows={2}
              />
            </div>

            {/* Memories List */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-faint)]">
                Active Memories ({memories.length})
              </h3>
              {memories.length === 0 ? (
                <EmptyState
                  icon={<Brain size={24} />}
                  title="No memories recorded yet"
                  description="The AI automatically records academic goals and constraints, or you can add them manually above."
                />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {memories.map(m => (
                    <div key={m.id} className="card p-3.5 space-y-2 relative">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-xs text-[var(--color-accent)]">
                          {m.key}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="badge text-[10px] uppercase font-semibold">
                            {m.category}
                          </span>
                          <button
                            onClick={() => handleDeleteMemory(m.id)}
                            className="text-[var(--color-faint)] hover:text-[var(--color-danger)] transition-colors"
                            title="Delete memory"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-[var(--color-text)] leading-relaxed">
                        {m.content}
                      </p>
                      <div className="text-[10px] text-[var(--color-faint)]">
                        Source: {m.source} · Updated: {new Date(m.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= AI SETTINGS VIEW ================= */}
        {tab === 'settings' && settings && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <SectionHeader
              title="AI Brain Settings"
              description="Configure local Ollama connection, model inference hyperparameters, and academic schedule constraints."
              action={
                <button className="btn btn-primary" onClick={handleSaveSettings}>
                  Save All Settings
                </button>
              }
            />

            <div className="grid gap-6 md:grid-cols-2">
              {/* Google AI Studio & Provider Config */}
              <div className="card p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-faint)]">
                    AI Inference Provider
                  </h3>
                  <span className="badge badge-accent text-[10px]">Cloud-First</span>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Provider Engine</label>
                  <select
                    className="input w-full text-xs"
                    value="google-ai-studio"
                    disabled
                  >
                    <option value="google-ai-studio">Google AI Studio API (Recommended - Zero GPU Required)</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium">Google AI Studio API Key</label>
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1"
                    >
                      <span>Get Free Key</span>
                      <ExternalLink size={10} />
                    </a>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={settings.apiKey || ''}
                      onChange={e => setSettings({ ...settings, apiKey: e.target.value })}
                      className="input flex-1 text-xs"
                      placeholder="Paste AIzaSy... key"
                    />
                    <button
                      className="btn btn-secondary text-xs"
                      onClick={async () => {
                        if (!settings.apiKey) {
                          toast('Please enter an API key', 'error');
                          return;
                        }
                        const res = await api.ai.testKey(settings.apiKey, settings.selectedModel);
                        if (res.ok) {
                          toast('API Key verified successfully!', 'success');
                          refreshEngine();
                        } else {
                          toast(`Verification failed: ${res.error}`, 'error');
                        }
                      }}
                    >
                      Test Key
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Gemini Model Selector</label>
                  <select
                    value={settings.selectedModel}
                    onChange={e => setSettings({ ...settings, selectedModel: e.target.value })}
                    className="input w-full text-xs"
                  >
                    <option value="gemini-2.5-flash">gemini-2.5-flash (Fast &amp; Responsive - Default)</option>
                    <option value="gemini-2.5-pro">gemini-2.5-pro (Deep Multi-Step Proofs &amp; STEM Derivations)</option>
                    <option value="gemini-2.0-flash">gemini-2.0-flash (High Speed)</option>
                    <option value="gemini-1.5-flash">gemini-1.5-flash (Lightweight)</option>
                  </select>
                  <p className="text-[11px] text-[var(--color-faint)] mt-1">
                    Zero GPU RAM required. Runs in the cloud with sub-second response times.
                  </p>
                </div>

                <div className="flex items-center space-x-2 pt-2">
                  <input
                    type="checkbox"
                    id="autoOcrSetting"
                    checked={settings.autoOcr ?? true}
                    onChange={e => setSettings({ ...settings, autoOcr: e.target.checked })}
                    className="rounded border-[var(--color-border)] bg-[var(--color-bg)] text-cyan-500"
                  />
                  <label htmlFor="autoOcrSetting" className="text-xs text-[var(--color-muted)] cursor-pointer">
                    Auto-OCR scanned PDFs lacking text layer into SQLite FTS5 search
                  </label>
                </div>
              </div>

              {/* Hyperparameters */}
              <div className="card p-4 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-faint)]">
                  Generation Hyperparameters
                </h3>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span>Temperature</span>
                    <span className="font-mono">{settings.temperature}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.05"
                    value={settings.temperature}
                    onChange={e => setSettings({ ...settings, temperature: parseFloat(e.target.value) })}
                    className="w-full cursor-pointer accent-[var(--color-accent)]"
                  />
                  <span className="text-[10px] text-[var(--color-faint)]">
                    Lower (0.2–0.5) = rigorous derivations & factual recall; Higher (0.8+) = creative explanations.
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Context Length (Tokens)</label>
                    <select
                      value={settings.contextLength}
                      onChange={e => setSettings({ ...settings, contextLength: parseInt(e.target.value, 10) })}
                      className="input w-full text-xs"
                    >
                      <option value="2048">2048 (Low VRAM)</option>
                      <option value="4096">4096 (Balanced - Recommended)</option>
                      <option value="8192">8192 (High Context)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Max Generation Tokens</label>
                    <input
                      type="number"
                      value={settings.maxTokens}
                      onChange={e => setSettings({ ...settings, maxTokens: parseInt(e.target.value, 10) })}
                      className="input w-full text-xs"
                      min={256}
                      max={4096}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="autoRag"
                    checked={settings.autoRag}
                    onChange={e => setSettings({ ...settings, autoRag: e.target.checked })}
                    className="checkbox"
                  />
                  <label htmlFor="autoRag" className="text-xs cursor-pointer">
                    Enable Auto-RAG (automatic note search and citation retrieval)
                  </label>
                </div>
              </div>

              {/* Academic Constraints */}
              <div className="card p-4 space-y-4 md:col-span-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-faint)]">
                  Personal Academic Schedule Constraints
                </h3>

                <div className="grid gap-4 md:grid-cols-4">
                  <div>
                    <label className="block text-xs font-medium mb-1">College Start Time</label>
                    <input
                      type="time"
                      value={settings.collegeStart}
                      onChange={e => setSettings({ ...settings, collegeStart: e.target.value })}
                      className="input w-full text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">College End Time</label>
                    <input
                      type="time"
                      value={settings.collegeEnd}
                      onChange={e => setSettings({ ...settings, collegeEnd: e.target.value })}
                      className="input w-full text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Travel Time (Minutes)</label>
                    <input
                      type="number"
                      value={settings.travelMinutes}
                      onChange={e => setSettings({ ...settings, travelMinutes: parseInt(e.target.value, 10) })}
                      className="input w-full text-xs"
                      min={0}
                      max={180}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Max Daily Study Hours</label>
                    <input
                      type="number"
                      value={settings.maxDailyStudyHours}
                      onChange={e => setSettings({ ...settings, maxDailyStudyHours: parseInt(e.target.value, 10) })}
                      className="input w-full text-xs"
                      min={1}
                      max={16}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <StudyMaterialPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        attachedDocIds={attachedDocIds}
        onSave={handleSaveMaterials}
        onProcessDocument={handleProcessDocument}
        processingDocs={processingDocs}
      />

      <OcrProgressModal
        progress={activeProgressModal}
        onClose={() => setActiveProgressModal(null)}
      />
    </div>
  );
}
