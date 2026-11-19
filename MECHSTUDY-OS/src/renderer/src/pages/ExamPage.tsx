import React from 'react';
import {
  Plus, Play, Trash2, Award, Target,
  ChevronRight, ChevronLeft, Settings,
  CheckCircle, XCircle, HelpCircle, AlertCircle,
  FileText, Timer, Star, Zap, Sparkles, Calculator,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store';
import {
  ConfirmDialog, EmptyState, ErrorState,
  Loading, Modal, SectionHeader, Stat, Tabs,
} from '../components/ui';
import { clock, dateLabel, pct, seconds } from '../lib/format';
import type { ExamConfig, ExamQuestion, ExamResponse, ExamResult, ExamSessionSummary } from '../../../shared/types';
import { evaluateToNumber } from '../../../shared/mathExpr';
import { RtuExamEngine } from '../components/RtuExamEngine';
import { GateCbtEngine } from '../components/GateCbtEngine';

function Card({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`card p-4 ${className}`} {...props}>{children}</div>;
}

function Button({ size, variant, className = '', children, ...props }: any) {
  const vClass = variant === 'primary' ? 'btn-primary' : variant === 'destructive' ? 'btn-danger' : variant === 'secondary' ? 'btn-secondary' : variant === 'ghost' ? 'btn-ghost' : '';
  const sClass = size === 'sm' ? 'btn-sm' : '';
  return <button className={`btn ${vClass} ${sClass} ${className}`} {...props}>{children}</button>;
}

function Input({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="block text-xs font-medium text-[var(--color-faint)]">
      {label && <span className="mb-1 block">{label}</span>}
      <input className="input w-full" {...props} />
    </label>
  );
}

function Select({ label, options, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; options?: Array<{ value: string; label: string }> }) {
  return (
    <label className="block text-xs font-medium text-[var(--color-faint)]">
      {label && <span className="mb-1 block">{label}</span>}
      <select className="input w-full" {...props}>
        {options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function Tooltip({ content, children }: any) {
  return <span title={content}>{children}</span>;
}

function Badge({ children, className = '', color }: { children: React.ReactNode; className?: string; color?: string; variant?: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border border-current/20 ${className}`}
      style={{ color: color || 'var(--color-accent)' }}
    >
      {children}
    </span>
  );
}

type ExamTab = 'configs' | 'running' | 'history';

const QUESTION_TYPES = [
  { value: '', label: 'All types (MCQ, MSQ, Numerical)' },
  { value: 'mcq', label: 'MCQ only' },
  { value: 'msq', label: 'MSQ (multiple correct)' },
  { value: 'numerical', label: 'Numerical (NAT)' },
];

const DEFAULT_SCHEME = {
  marks: { mcq: 1, msq: 1, numerical: 1 },
  mcqNegativeFraction: 1 / 3,
  negativeNumerical: false,
};

interface ExamPreset {
  title: string;
  badge: string;
  description: string;
  durationSeconds: number;
  limit: number;
  type: string;
  scheme: typeof DEFAULT_SCHEME;
  color: string;
}

const GATE_PRESETS: ExamPreset[] = [
  {
    title: 'GATE ME Full-Length Mock',
    badge: 'GATE Standard',
    description: '65 questions, 180 min, 100 marks standard GATE pattern (-1/3 & -2/3 MCQ, 0 NAT/MSQ, Virtual Calc enabled)',
    durationSeconds: 10800,
    limit: 65,
    type: '',
    scheme: { marks: { mcq: 1, msq: 1, numerical: 1 }, mcqNegativeFraction: 1 / 3, negativeNumerical: false },
    color: '#06b6d4',
  },
  {
    title: 'GATE Sectional Speed Drill',
    badge: 'Speed Test',
    description: '25 high-yield mechanical questions, 45 min test of numerical speed and concept clarity',
    durationSeconds: 2700,
    limit: 25,
    type: '',
    scheme: { marks: { mcq: 1, msq: 1, numerical: 1 }, mcqNegativeFraction: 1 / 3, negativeNumerical: false },
    color: '#3b82f6',
  },
  {
    title: 'Rapid Numerical / NAT Sprint',
    badge: 'NAT Drill',
    description: '15 Numerical Answer Type (NAT) problems, 30 min calculator discipline',
    durationSeconds: 1800,
    limit: 15,
    type: 'numerical',
    scheme: { marks: { mcq: 1, msq: 1, numerical: 2 }, mcqNegativeFraction: 0, negativeNumerical: false },
    color: '#f59e0b',
  },
];

const IIT_PRESETS: ExamPreset[] = [
  {
    title: 'IIT JEE Advanced Full Paper',
    badge: 'IIT Standard',
    description: '54 questions across Physics, Chemistry, Math, 180 min (Single Correct +3/-1, Multi-Correct +4/-2, Numerical +4/0, Calculator Disabled)',
    durationSeconds: 10800,
    limit: 54,
    type: '',
    scheme: { marks: { mcq: 3, msq: 4, numerical: 4 }, mcqNegativeFraction: 1 / 3, negativeNumerical: false },
    color: '#f97316',
  },
  {
    title: 'IIT PCM Sectional Sprint',
    badge: 'PCM Speed Test',
    description: '36 questions (PCM), 120 min multi-concept problem solving with strict negative marking',
    durationSeconds: 7200,
    limit: 36,
    type: '',
    scheme: { marks: { mcq: 3, msq: 4, numerical: 4 }, mcqNegativeFraction: 1 / 3, negativeNumerical: false },
    color: '#8b5cf6',
  },
  {
    title: 'IIT Multi-Correct & Numerical Drill',
    badge: 'Advanced Drill',
    description: '18 high-rigor multiple-correct and integer problems, 60 min deep test',
    durationSeconds: 3600,
    limit: 18,
    type: '',
    scheme: { marks: { mcq: 3, msq: 4, numerical: 4 }, mcqNegativeFraction: 0.5, negativeNumerical: false },
    color: '#10b981',
  },
];

function VirtualCalculator({ onClose }: { onClose: () => void }) {
  const [expr, setExpr] = React.useState('');
  const [result, setResult] = React.useState('');

  const append = (s: string) => setExpr(prev => prev + s);
  const clear = () => { setExpr(''); setResult(''); };
  const backspace = () => setExpr(prev => prev.slice(0, -1));

  const compute = () => {
    if (!expr.trim()) return;
    const num = evaluateToNumber(expr);
    if (num !== null && Number.isFinite(num)) {
      setResult(String(Math.round(num * 1e6) / 1e6));
    } else {
      setResult('Error');
    }
  };

  return (
    <div
      className="fixed bottom-12 right-12 z-50 w-72 rounded-xl border p-3 shadow-2xl backdrop-blur-md"
      style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}
      data-testid="virtual-calculator"
    >
      <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <span className="text-xs font-semibold flex items-center gap-1.5 text-cyan-400">
          <Calculator size={14} /> GATE Virtual Calculator
        </span>
        <button onClick={onClose} className="text-xs text-[var(--color-muted)] hover:text-white">✕</button>
      </div>

      <div className="my-2 rounded bg-[var(--color-bg)] p-2 text-right">
        <div className="h-4 truncate text-[11px] font-mono text-[var(--color-muted)]">{expr || '0'}</div>
        <div className="h-6 truncate text-base font-mono font-bold text-white">{result || '0'}</div>
      </div>

      <div className="grid grid-cols-4 gap-1 text-xs">
        <button onClick={clear} className="btn btn-sm btn-ghost text-rose-400 font-bold">C</button>
        <button onClick={backspace} className="btn btn-sm btn-ghost text-amber-400">DEL</button>
        <button onClick={() => append('^')} className="btn btn-sm btn-ghost font-mono">^</button>
        <button onClick={() => append('/')} className="btn btn-sm btn-ghost text-cyan-400 font-bold">/</button>

        <button onClick={() => append('sin(')} className="btn btn-sm btn-ghost text-[10px]">sin</button>
        <button onClick={() => append('cos(')} className="btn btn-sm btn-ghost text-[10px]">cos</button>
        <button onClick={() => append('tan(')} className="btn btn-sm btn-ghost text-[10px]">tan</button>
        <button onClick={() => append('*')} className="btn btn-sm btn-ghost text-cyan-400 font-bold">*</button>

        <button onClick={() => append('sqrt(')} className="btn btn-sm btn-ghost text-[10px]">√</button>
        <button onClick={() => append('ln(')} className="btn btn-sm btn-ghost text-[10px]">ln</button>
        <button onClick={() => append('(')} className="btn btn-sm btn-ghost">(</button>
        <button onClick={() => append(')')} className="btn btn-sm btn-ghost">)</button>

        <button onClick={() => append('7')} className="btn btn-sm btn-ghost font-bold">7</button>
        <button onClick={() => append('8')} className="btn btn-sm btn-ghost font-bold">8</button>
        <button onClick={() => append('9')} className="btn btn-sm btn-ghost font-bold">9</button>
        <button onClick={() => append('-')} className="btn btn-sm btn-ghost text-cyan-400 font-bold">-</button>

        <button onClick={() => append('4')} className="btn btn-sm btn-ghost font-bold">4</button>
        <button onClick={() => append('5')} className="btn btn-sm btn-ghost font-bold">5</button>
        <button onClick={() => append('6')} className="btn btn-sm btn-ghost font-bold">6</button>
        <button onClick={() => append('+')} className="btn btn-sm btn-ghost text-cyan-400 font-bold">+</button>

        <button onClick={() => append('1')} className="btn btn-sm btn-ghost font-bold">1</button>
        <button onClick={() => append('2')} className="btn btn-sm btn-ghost font-bold">2</button>
        <button onClick={() => append('3')} className="btn btn-sm btn-ghost font-bold">3</button>
        <button onClick={() => append('pi')} className="btn btn-sm btn-ghost text-[10px]">π</button>

        <button onClick={() => append('0')} className="btn btn-sm btn-ghost font-bold">0</button>
        <button onClick={() => append('.')} className="btn btn-sm btn-ghost font-bold">.</button>
        <button onClick={() => append('e')} className="btn btn-sm btn-ghost font-mono">e</button>
        <button onClick={compute} className="btn btn-sm btn-primary font-bold bg-cyan-600 text-white">=</button>
      </div>
    </div>
  );
}

function parseOptions(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch { return []; }
}

export function ExamPage() {
  const toast = useApp(s => s.toast);
  const openTopic = useApp(s => s.openTopic);
  const activeExamMode = useApp(s => s.activeExamMode);

  const [showCalculator, setShowCalculator] = React.useState(false);
  const activePresets = activeExamMode === 'IIT' ? IIT_PRESETS : GATE_PRESETS;

  const [tab, setTab] = React.useState<ExamTab>('configs');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [configs, setConfigs] = React.useState<ExamConfig[]>([]);
  const [subjects, setSubjects] = React.useState<Array<{ id: number; name: string }>>([]);

  const [editor, setEditor] = React.useState<{ open: boolean; config: Partial<ExamConfig> | null }>({ open: false, config: null });
  const [confirmDelete, setConfirmDelete] = React.useState<ExamConfig | null>(null);

  // Running exam state
  const [runningExam, setRunningExam] = React.useState<{
    sessionId: number;
    config: ExamConfig;
    questions: ExamQuestion[];
    deadlineEpoch: number;
    responses: Map<number, ExamResponse>;
    currentIndex: number;
    timeRemaining: number;
    expired: boolean;
  } | null>(null);

  const runningExamRef = React.useRef(runningExam);
  runningExamRef.current = runningExam;

  // History
  const [history, setHistory] = React.useState<ExamSessionSummary[]>([]);
  const [selectedHistory, setSelectedHistory] = React.useState<ExamResult | null>(null);

  const loadConfigs = React.useCallback(async () => {
    try {
      const [cfgs, subs] = await Promise.all([
        api.exam.configs(),
        api.syllabus.subjects('RTU'),
      ]);
      setConfigs(cfgs);
      setSubjects(subs.map(s => ({ id: s.id, name: s.name })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = React.useCallback(async () => {
    try {
      const sessions = await api.exam.sessions(50);
      setHistory(sessions);
    } catch (e) {
      console.error('Failed to load exam history:', e);
    }
  }, []);

  React.useEffect(() => {
    loadConfigs();
    loadHistory();
  }, [loadConfigs, loadHistory]);

  // Timer tick for running exam
  React.useEffect(() => {
    if (!runningExam?.deadlineEpoch) return;

    const updateTimer = () => {
      const current = runningExamRef.current;
      if (!current) return;
      const now = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, current.deadlineEpoch - now);
      const expired = now >= current.deadlineEpoch;

      setRunningExam(prev => prev ? { ...prev, timeRemaining: remaining, expired } : null);

      if (expired) {
        // Auto-submit
        void submitExam(true);
      }
    };

    updateTimer();
    const id = window.setInterval(updateTimer, 1000);

    return () => window.clearInterval(id);
  }, [runningExam?.deadlineEpoch]);

  /* ---------- Config actions ---------- */

  const openEditor = (config?: ExamConfig) => {
    if (config) {
      setEditor({ open: true, config: {
        title: config.title,
        durationSeconds: config.durationSeconds,
        subjectId: config.subjectId,
        type: config.type,
        limit: config.limit,
        scheme: config.scheme,
        includeUnkeyed: config.includeUnkeyed,
      }});
    } else {
      setEditor({ open: true, config: {
        title: 'Mock test',
        durationSeconds: 1800,
        subjectId: null,
        type: '',
        limit: 20,
        scheme: DEFAULT_SCHEME,
        includeUnkeyed: false,
      }});
    }
  };

  const applyPreset = (preset: ExamPreset) => {
    setEditor({
      open: true,
      config: {
        title: preset.title,
        durationSeconds: preset.durationSeconds,
        subjectId: null,
        type: preset.type,
        limit: preset.limit,
        scheme: preset.scheme,
        includeUnkeyed: false,
      },
    });
  };

  const saveConfig = async () => {
    if (!editor.config) return;
    try {
      if ('id' in editor.config && editor.config.id) {
        // Update not implemented yet - would need new IPC
        toast('Update not implemented', 'info');
      } else {
        const id = await api.exam.createConfig(editor.config as Omit<ExamConfig, 'id' | 'createdAt'>);
        toast(`Exam config created (id: ${id})`, 'success');
      }
      setEditor({ open: false, config: null });
      loadConfigs();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const deleteConfig = async () => {
    if (!confirmDelete) return;
    try {
      await api.exam.deleteConfig(confirmDelete.id);
      toast('Exam config deleted', 'success');
      loadConfigs();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setConfirmDelete(null);
    }
  };

  /* ---------- Running exam actions ---------- */

  const startExam = async (config: ExamConfig) => {
    try {
      const result = await api.exam.start(config.id);
      const responses = new Map<number, ExamResponse>();
      result.questions.forEach(q => {
        responses.set(q.id, {
          questionId: q.id,
          answer: null,
          marked: false,
          visited: false,
          seconds: 0,
        });
      });
      setRunningExam({
        sessionId: result.sessionId,
        config,
        questions: result.questions,
        deadlineEpoch: result.deadlineEpoch,
        responses,
        currentIndex: 0,
        timeRemaining: config.durationSeconds,
        expired: false,
      });
      setTab('running');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const submitExam = async (timeout = false) => {
    const currentExam = runningExamRef.current;
    if (!currentExam) return;
    try {
      const responses = Array.from(currentExam.responses.values());
      const result = await api.exam.submit(
        currentExam.sessionId,
        responses,
        timeout ? 'timeout' : 'manual'
      );
      toast(`Exam submitted! Score: ${result.score}/${result.maxScore} (${result.percent}%)`, 'success');
      setRunningExam(null);
      setTab('history');
      loadHistory();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const updateResponse = (questionId: number, patch: Partial<ExamResponse>) => {
    if (!runningExam) return;
    const current = runningExam.responses.get(questionId) || {
      questionId,
      answer: null,
      marked: false,
      visited: true,
      seconds: 0,
    };
    runningExam.responses.set(questionId, { ...current, ...patch });
    setRunningExam({ ...runningExam, responses: new Map(runningExam.responses) });
  };

  const goToQuestion = (index: number) => {
    if (!runningExam) return;
    const clamped = Math.max(0, Math.min(runningExam.questions.length - 1, index));
    updateResponse(runningExam.questions[runningExam.currentIndex].id, { visited: true });
    setRunningExam({ ...runningExam, currentIndex: clamped });
    updateResponse(runningExam.questions[clamped].id, { visited: true });
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  /* ---------- History actions ---------- */

  const viewResult = async (session: ExamSessionSummary) => {
    try {
      const result = await api.exam.session(session.id);
      if (result) setSelectedHistory(result);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const deleteSession = async (id: number) => {
    try {
      await api.exam.deleteSession(id);
      toast('Session deleted', 'success');
      loadHistory();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  /* ---------- Render ---------- */

  if (loading) return <Loading label="Loading exam configs…" />;

  return (
    <div className="scroll-y h-full p-5">
      <SectionHeader
        title="Exam Mode"
        description="Timed mock tests with GATE-style marking. Questions come from the imported PYQ bank."
        action={tab === 'configs' ? (
          <button className="btn btn-primary" onClick={() => openEditor()}>
            <Plus size={15} /> New Config
          </button>
        ) : undefined}
      />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'configs', label: 'Configs', count: configs.length },
          { id: 'running', label: 'Running' },
          { id: 'history', label: 'History', count: history.length },
        ]}
      />

      <div className="mt-4">
        {error && <ErrorState message={error} onRetry={loadConfigs} />}

        {/* Configs Tab */}
        {tab === 'configs' && (
          <div className="space-y-6">
            {/* Mode-Specific Official Exam Engines */}
            {activeExamMode === 'RTU' ? (
              <RtuExamEngine />
            ) : (
              <GateCbtEngine />
            )}

            {/* Quick Start Presets & Custom Configs */}
            <div className="rounded-xl border p-4 mb-4" style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-[var(--color-accent)]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text)]">
                    Additional Exam Presets &amp; Speed Drills
                  </h3>
                </div>
                <span className="text-[11px] text-[var(--color-muted)]">
                  {activeExamMode === 'RTU' ? 'Custom Topic Sprints' : 'GATE Mechanical Timed Tests'}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {activePresets.map(preset => (
                  <div
                    key={preset.title}
                    className="flex flex-col justify-between rounded-lg border p-3 transition-all hover:border-[var(--color-accent)]"
                    style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border2)' }}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                          style={{ background: `${preset.color}20`, color: preset.color }}
                        >
                          {preset.badge}
                        </span>
                        <span className="text-[11px] font-mono text-[var(--color-muted)]">
                          {preset.durationSeconds / 60}m · {preset.limit}Q
                        </span>
                      </div>
                      <h4 className="text-xs font-semibold leading-snug mb-1 text-[var(--color-text)]">
                        {preset.title}
                      </h4>
                      <p className="text-[11px] leading-relaxed line-clamp-2 text-[var(--color-muted)] mb-3">
                        {preset.description}
                      </p>
                    </div>

                    <button
                      className="btn btn-sm btn-ghost w-full justify-center gap-1 text-[11px] font-medium"
                      style={{ border: '1px solid var(--color-border)', color: 'var(--color-accent)' }}
                      onClick={() => applyPreset(preset)}
                    >
                      <Plus size={12} /> Use Preset
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {configs.length === 0 ? (
              <EmptyState
                icon={<Settings size={22} />}
                title="No custom exam configs yet"
                description="Select one of the presets above or create a custom mock test configuration"
                action={<button className="btn btn-primary" onClick={() => openEditor()}><Plus size={14} /> Create Custom Config</button>}
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {configs.map(config => (
                  <Card key={config.id} className="relative">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-lg">{config.title}</h3>
                        <p className="text-sm text-[var(--color-faint)] mt-1">
                          {config.durationSeconds / 60} min · {config.limit} questions · {config.type || 'All types'}
                        </p>
                      </div>
                      <Badge color={config.scheme.mcqNegativeFraction > 0 ? 'var(--color-danger)' : 'var(--color-muted)'}>
                        −{Math.round(config.scheme.mcqNegativeFraction * 100)}% MCQ
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                      <div>
                        <span className="text-[var(--color-faint)]">Marks</span>
                        <div className="font-mono">
                          MCQ: {config.scheme.marks.mcq} · MSQ: {config.scheme.marks.msq} · NAT: {config.scheme.marks.numerical}
                        </div>
                      </div>
                      <div>
                        <span className="text-[var(--color-faint)]">Subject</span>
                        <div>
                          {config.subjectId
                            ? subjects.find(s => s.id === config.subjectId)?.name || 'Unknown'
                            : 'All subjects'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        className="btn btn-primary flex-1"
                        onClick={() => startExam(config)}
                      >
                        <Play size={14} /> Start Exam
                      </button>
                      <button className="btn btn-ghost btn-icon" onClick={() => openEditor(config)} title="Edit">
                        ✎
                      </button>
                      <button className="btn btn-ghost btn-icon" onClick={() => setConfirmDelete(config)} title="Delete">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Running Exam Tab */}
        {tab === 'running' && runningExam && (
          <div className="h-full flex flex-col">
            {/* Timer bar */}
            <div className={`mb-4 p-3 rounded-lg border ${runningExam.timeRemaining < 300 ? 'bg-[var(--color-danger)]/10 border-[var(--color-danger)]' : 'bg-[var(--color-bg-elevated)]'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Timer className={`w-6 h-6 ${runningExam.timeRemaining < 60 ? 'text-[var(--color-danger)] animate-pulse' : ''}`} />
                  <div>
                    <div className="text-[11px] text-[var(--color-faint)] uppercase tracking-wide">Time Remaining</div>
                    <div className="text-2xl font-mono font-bold tabular-nums">{formatTime(runningExam.timeRemaining)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  {activeExamMode === 'GATE' ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost flex items-center gap-1.5 text-xs font-medium text-cyan-400 border border-cyan-800/40 hover:bg-cyan-950/30"
                      onClick={() => setShowCalculator(!showCalculator)}
                      title="Toggle GATE Scientific Calculator"
                    >
                      <Calculator size={13} />
                      <span>{showCalculator ? 'Hide Calc' : 'Virtual Calc'}</span>
                    </button>
                  ) : (
                    <span
                      className="text-[10px] text-[var(--color-faint)] italic px-2 py-1 rounded border border-[var(--color-border)]"
                      title="Calculators are strictly prohibited in IIT JEE Advanced examinations."
                    >
                      No Calc (IIT Mode)
                    </span>
                  )}
                  <span className="text-[var(--color-faint)]">
                    {runningExam.currentIndex + 1} / {runningExam.questions.length}
                  </span>
                  <Button
                    size="sm"
                    variant={runningExam.expired ? 'destructive' : 'primary'}
                    onClick={() => submitExam()}
                    disabled={runningExam.expired}
                  >
                    {runningExam.expired ? 'Time Expired' : 'Submit Exam'}
                  </Button>
                </div>
              </div>

              {/* Question palette */}
              <div className="mt-3 flex flex-wrap gap-1">
                {runningExam.questions.map((q, i) => {
                  const resp = runningExam.responses.get(q.id);
                  const visited = resp?.visited;
                  const answered = resp?.answer && resp.answer.trim();
                  const marked = resp?.marked;
                  let status: 'not-visited' | 'visited' | 'answered' | 'marked' | 'answered-marked' = 'not-visited';
                  if (marked && answered) status = 'answered-marked';
                  else if (marked) status = 'marked';
                  else if (answered) status = 'answered';
                  else if (visited) status = 'visited';

                  const colors = {
                    'not-visited': 'bg-[var(--color-border)] text-[var(--color-faint)]',
                    'visited': 'bg-[var(--color-accent)]/20 text-[var(--color-accent)]',
                    'answered': 'bg-[var(--color-accent)] text-white',
                    'marked': 'bg-[var(--color-accent2)] text-white',
                    'answered-marked': 'bg-[var(--color-accent2)]/80 text-white',
                  };

                  return (
                    <button
                      key={q.id}
                      onClick={() => goToQuestion(i)}
                      className={`w-8 h-8 rounded text-xs font-medium transition-colors ${colors[status]} ${i === runningExam.currentIndex ? 'ring-2 ring-[var(--color-ring)]' : ''}`}
                      title={`Q${i + 1}: ${q.type.toUpperCase()}`}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Question area */}
            <div className="flex-1 overflow-auto">
              {runningExam.questions.map((q, i) => i === runningExam.currentIndex && (
                <QuestionCard
                  key={q.id}
                  question={q}
                  index={i}
                  total={runningExam.questions.length}
                  response={runningExam.responses.get(q.id)}
                  onAnswerChange={(answer) => updateResponse(q.id, { answer, visited: true })}
                  onMarkChange={(marked) => updateResponse(q.id, { marked, visited: true })}
                  onNavigate={goToQuestion}
                />
              ))}
            </div>

            {/* Virtual Scientific Calculator for GATE Mode */}
            {showCalculator && activeExamMode === 'GATE' && (
              <VirtualCalculator onClose={() => setShowCalculator(false)} />
            )}
          </div>
        )}

        {/* History Tab */}
        {tab === 'history' && (
          <div className="space-y-4">
            {history.length === 0 ? (
              <EmptyState
                icon={<FileText className="w-12 h-12" />}
                title="No exam sessions yet"
                description="Complete a mock test to see your history here"
              />
            ) : (
              <div className="space-y-3">
                {history.map(session => (
                  <Card key={session.id} className="relative">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-[var(--color-bg-elevated)]">
                          <Award className={`w-6 h-6 ${session.percent >= 70 ? 'text-[var(--color-accent)]' : session.percent >= 40 ? 'text-[var(--color-accent2)]' : 'text-[var(--color-danger)]'}`} />
                        </div>
                        <div>
                          <h3 className="font-semibold">{session.configTitle}</h3>
                          <p className="text-sm text-[var(--color-faint)]">
                            {dateLabel(session.startedAt)} · {session.submittedBy === 'timeout' ? 'Auto-submitted' : 'Manual submit'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-2xl font-bold font-mono tabular-nums">
                            {session.score}/{session.maxScore}
                          </div>
                          <div className={`text-sm font-medium ${
                            session.percent >= 70 ? 'text-[var(--color-accent)]' :
                            session.percent >= 40 ? 'text-[var(--color-accent2)]' :
                            'text-[var(--color-danger)]'
                          }`}>
                            {session.percent}%
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => viewResult(session)}>
                            <FileText className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteSession(session.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Config Editor Modal */}
      {editor.open && editor.config && (
        <Modal open onClose={() => setEditor({ open: false, config: null })} title={editor.config.id ? 'Edit Exam Config' : 'New Exam Config'} width={640}>
          <div className="space-y-4 max-h-[60vh] overflow-auto pr-2">
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Title"
                value={editor.config.title || ''}
                onChange={e => setEditor({ open: true, config: { ...editor.config!, title: e.target.value } })}
                placeholder="Mock test"
              />
              <Input
                label="Duration (minutes)"
                type="number"
                value={Math.round((editor.config.durationSeconds || 1800) / 60)}
                onChange={e => setEditor({ open: true, config: { ...editor.config!, durationSeconds: parseInt(e.target.value) * 60 } })}
                min={1}
                max={360}
              />
              <Select
                label="Subject"
                value={editor.config.subjectId?.toString() || ''}
                onChange={e => setEditor({ open: true, config: { ...editor.config!, subjectId: e.target.value ? parseInt(e.target.value) : null } })}
                options={[{ value: '', label: 'All subjects' }, ...subjects.map(s => ({ value: s.id.toString(), label: s.name }))]}
              />
              <Select
                label="Question Type"
                value={editor.config.type || ''}
                onChange={e => setEditor({ open: true, config: { ...editor.config!, type: e.target.value } })}
                options={QUESTION_TYPES}
              />
              <Input
                label="Question Limit"
                type="number"
                value={editor.config.limit || 20}
                onChange={e => setEditor({ open: true, config: { ...editor.config!, limit: parseInt(e.target.value) } })}
                min={1}
                max={200}
              />
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="includeUnkeyed"
                  checked={editor.config.includeUnkeyed}
                  onChange={e => setEditor({ open: true, config: { ...editor.config!, includeUnkeyed: e.target.checked } })}
                  className="checkbox"
                />
                <label htmlFor="includeUnkeyed" className="text-sm cursor-pointer">
                  Include unkeyed questions (cannot be graded)
                </label>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Marking Scheme</h4>
              <div className="grid gap-4 md:grid-cols-3">
                <Input
                  label="MCQ Marks"
                  type="number"
                  value={editor.config.scheme?.marks.mcq || 1}
                  onChange={e => setEditor({ open: true, config: { ...editor.config!, scheme: { ...editor.config!.scheme!, marks: { ...editor.config!.scheme!.marks, mcq: parseInt(e.target.value) } } } })}
                  min={0}
                  max={100}
                />
                <Input
                  label="MSQ Marks"
                  type="number"
                  value={editor.config.scheme?.marks.msq || 1}
                  onChange={e => setEditor({ open: true, config: { ...editor.config!, scheme: { ...editor.config!.scheme!, marks: { ...editor.config!.scheme!.marks, msq: parseInt(e.target.value) } } } })}
                  min={0}
                  max={100}
                />
                <Input
                  label="NAT Marks"
                  type="number"
                  value={editor.config.scheme?.marks.numerical || 1}
                  onChange={e => setEditor({ open: true, config: { ...editor.config!, scheme: { ...editor.config!.scheme!, marks: { ...editor.config!.scheme!.marks, numerical: parseInt(e.target.value) } } } })}
                  min={0}
                  max={100}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2 mt-3">
                <Input
                  label="MCQ Negative Fraction"
                  type="number"
                  step="0.01"
                  value={editor.config.scheme?.mcqNegativeFraction ?? 1/3}
                  onChange={e => setEditor({ open: true, config: { ...editor.config!, scheme: { ...editor.config!.scheme!, mcqNegativeFraction: parseFloat(e.target.value) } } })}
                  min={0}
                  max={1}
                />
                <div className="flex items-center gap-2 mt-6">
                  <input
                    type="checkbox"
                    id="negativeNumerical"
                    checked={editor.config.scheme?.negativeNumerical}
                    onChange={e => setEditor({ open: true, config: { ...editor.config!, scheme: { ...editor.config!.scheme!, negativeNumerical: e.target.checked } } })}
                    className="checkbox"
                  />
                  <label htmlFor="negativeNumerical" className="text-sm cursor-pointer">
                    Negative marking for NAT
                  </label>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4 border-t pt-4">
            <Button variant="ghost" onClick={() => setEditor({ open: false, config: null })}>Cancel</Button>
            <Button variant="primary" onClick={saveConfig}>Save Config</Button>
          </div>
        </Modal>
      )}

      {/* Delete Config Confirm */}
      {confirmDelete && (
        <ConfirmDialog
          open
          onCancel={() => setConfirmDelete(null)}
          onConfirm={deleteConfig}
          title="Delete exam config?"
          message={`This will permanently delete "${confirmDelete.title}". This cannot be undone.`}
          confirmLabel="Delete"
          danger
        />
      )}

      {/* Result Modal */}
      {selectedHistory && (
        <Modal open onClose={() => setSelectedHistory(null)} title="Exam Result" width={720}>
          <ExamResultView result={selectedHistory} onClose={() => setSelectedHistory(null)} />
        </Modal>
      )}
    </div>
  );
}

/* ---------- Question Card Component ---------- */

function QuestionCard({
  question,
  index,
  total,
  response,
  onAnswerChange,
  onMarkChange,
  onNavigate,
}: {
  question: ExamQuestion;
  index: number;
  total: number;
  response: ExamResponse | undefined;
  onAnswerChange: (answer: string) => void;
  onMarkChange: (marked: boolean) => void;
  onNavigate: (index: number) => void;
}) {
  const options = parseOptions(question.options_json);
  const isMCQ = question.type === 'mcq';
  const isMSQ = question.type === 'msq';
  const isNAT = question.type === 'numerical';

  const answered = response?.answer?.trim();
  const marked = response?.marked;

  return (
    <Card className="max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <Badge variant={isMCQ ? 'default' : isMSQ ? 'secondary' : 'outline'}>
            {isMCQ ? 'MCQ' : isMSQ ? 'MSQ' : 'NAT'}
          </Badge>
          <span className="text-sm text-[var(--color-faint)]">
            Question {index + 1} of {total} · {question.marks || 1} mark{question.marks !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={marked ? 'secondary' : 'ghost'}
            onClick={() => onMarkChange(!marked)}
          >
            <Star className={`w-4 h-4 ${marked ? 'fill-current' : ''}`} />
          </Button>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => onNavigate(index - 1)} disabled={index === 0}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onNavigate(index + 1)} disabled={index === total - 1}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="prose prose-sm max-w-none mb-4">
        <p>{question.text}</p>
      </div>

      {options.length > 0 && (
        <div className="space-y-2 mb-4">
          {options.map((opt, i) => {
            const letter = String.fromCharCode(65 + i);
            const isSelected = isMCQ ? answered === letter : Boolean(answered?.includes(letter));
            return (
              <label
                key={i}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[var(--color-accent)]/10 border-[var(--color-accent)]'
                    : 'hover:bg-[var(--color-bg-elevated)]'
                }`}
              >
                <input
                  type={isMCQ ? 'radio' : 'checkbox'}
                  name={`q-${question.id}`}
                  value={letter}
                  checked={isSelected}
                  onChange={() => {
                    if (isMCQ) {
                      onAnswerChange(letter);
                    } else {
                      const current = answered || '';
                      onAnswerChange(current.includes(letter) ? current.replace(letter, '') : current + letter);
                    }
                  }}
                  className="radio-checkbox"
                />
                <span className="font-mono text-sm w-6 text-center text-[var(--color-faint)]">
                  {letter}.
                </span>
                <span className="flex-1">{opt}</span>
              </label>
            );
          })}
        </div>
      )}

      {isNAT && (
        <div className="mb-4">
          <Input
            label="Your answer (number or expression)"
            value={response?.answer || ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onAnswerChange(e.target.value)}
            placeholder="e.g. 42, 2*(3+4), sqrt(144)/2, 50%"
            type="text"
          />
          <p className="text-xs text-[var(--color-faint)] mt-1">
            Supports: + - * / ^ % ( ) π e sqrt sin cos tan log ln floor ceil round min max deg rad · Unicode: × ÷ − π ² ³ · Percent: 50% = 0.5
          </p>
        </div>
      )}

      {question.key_range && (
        <Tooltip content="Official key range (for reference only during practice)">
          <Badge variant="outline" className="ml-2">
            Key: {question.key_range}
          </Badge>
        </Tooltip>
      )}
    </Card>
  );
}

/* ---------- Result View Component ---------- */

function ExamResultView({ result, onClose }: { result: ExamResult; onClose: () => void }) {
  const [activeTab, setActiveTab] = React.useState<'byQuestion' | 'bySubject' | 'byType'>('byQuestion');

  const statusColors = {
    correct: 'text-[var(--color-accent)]',
    wrong: 'text-[var(--color-danger)]',
    skipped: 'text-[var(--color-faint)]',
    unjudged: 'text-[var(--color-accent2)]',
  };

  const statusIcons = {
    correct: <CheckCircle className="w-4 h-4" />,
    wrong: <XCircle className="w-4 h-4" />,
    skipped: <HelpCircle className="w-4 h-4" />,
    unjudged: <AlertCircle className="w-4 h-4" />,
  };

  return (
    <div className="space-y-6 max-h-[70vh] overflow-auto pr-2">
      {/* Score header */}
      <div className="grid grid-cols-4 gap-4 text-center">
        <Stat
          label="Score"
          value={`${result.score}/${result.maxScore}`}
          sub={`${result.percent}%`}
        />
        <Stat
          label="Correct"
          value={result.correct}
          sub={result.wrong > 0 ? `${result.wrong} wrong` : undefined}
        />
        <Stat
          label="Time Used"
          value={seconds(result.timeUsedSeconds)}
          sub={`of ${seconds(result.durationSeconds)}`}
        />
        <Stat
          label="Negative Marks"
          value={result.negativeMarks}
        />
      </div>

      {/* Breakdown tabs */}
      <Tabs
        active={activeTab}
        onChange={(t) => setActiveTab(t as any)}
        tabs={[
          { id: 'byQuestion', label: 'Questions', count: result.perQuestion.length },
          { id: 'bySubject', label: 'By Subject', count: result.bySubject.length },
          { id: 'byType', label: 'By Type', count: result.byType.length },
        ]}
      />

      {/* Questions list */}
      {activeTab === 'byQuestion' && (
        <div className="space-y-3">
          {result.perQuestion.map((q, i) => (
            <Card key={q.questionId} className="overflow-hidden">
              <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 p-3 items-center">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${statusColors[q.status]}`}>
                  {statusIcons[q.status]}
                </div>
                <div className="min-w-0">
                  <p className="font-medium truncate">Q{q.questionId}</p>
                  <p className="text-xs text-[var(--color-faint)]">
                    {q.chosen ? `Your answer: ${q.chosen}` : 'Not answered'}
                    {q.key && ` · Key: ${q.key}`}
                  </p>
                </div>
                <div className={`font-mono font-medium ${statusColors[q.status]}`}>
                  {q.awarded >= 0 ? '+' : ''}{q.awarded} / {q.marks}
                </div>
                {q.penalty > 0 && (
                  <Badge variant="outline" className="text-[var(--color-danger)] border-[var(--color-danger)]">
                    −{q.penalty}
                  </Badge>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Subject breakdown */}
      {activeTab === 'bySubject' && (
        <div className="pt-2">
          {result.bySubject.length === 0 ? (
            <p className="text-xs text-[var(--color-faint)]">No subject breakdown available.</p>
          ) : (
            <div className="space-y-2">
              {result.bySubject.map(row => (
                <div key={row.key} className="flex items-center justify-between text-sm p-2 rounded bg-[var(--color-bg-elevated)]">
                  <span>{row.key}</span>
                  <span className="font-mono">{row.score}/{row.max} ({pct(row.score, row.max)}%)</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Type breakdown */}
      {activeTab === 'byType' && (
        <div className="pt-2">
          {result.byType.length === 0 ? (
            <p className="text-xs text-[var(--color-faint)]">No type breakdown available.</p>
          ) : (
            <div className="space-y-2">
              {result.byType.map(row => (
                <div key={row.key} className="flex items-center justify-between text-sm p-2 rounded bg-[var(--color-bg-elevated)]">
                  <span>{row.key.toUpperCase()}</span>
                  <span className="font-mono">{row.score}/{row.max} ({pct(row.score, row.max)}%)</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}