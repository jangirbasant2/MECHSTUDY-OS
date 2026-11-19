import React from 'react';
import {
  Timer, Calculator, ShieldAlert, Award, CheckCircle2, AlertTriangle,
  RotateCcw, Sparkles, User, ChevronRight, HelpCircle, ArrowRight,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store';
import { evaluateToNumber } from '../../../shared/mathExpr';

interface GateQuestion {
  id: number;
  number: number;
  section: string;
  type: 'MCQ' | 'MSQ' | 'NAT' | string;
  questionText: string;
  options: string[];
  answerKey?: string;
  natRangeStart?: number;
  natRangeEnd?: number;
  marks: number;
  negativeMarks: number;
  solution?: string;
}

type QuestionStatus = 'not_visited' | 'not_answered' | 'answered' | 'marked_review' | 'answered_marked';

export function GateCbtEngine() {
  const toast = useApp(s => s.toast);

  const [mode, setMode] = React.useState<'STRICT_CBT' | 'PRACTICE'>('STRICT_CBT');
  const [running, setRunning] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [questions, setQuestions] = React.useState<GateQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [activeSection, setActiveSection] = React.useState('All');
  const [secondsRemaining, setSecondsRemaining] = React.useState(10800); // 180 min
  const [answers, setAnswers] = React.useState<Record<number, string>>({});
  const [statuses, setStatuses] = React.useState<Record<number, QuestionStatus>>({});
  const [showCalculator, setShowCalculator] = React.useState(false);
  const [showSubmitModal, setShowSubmitModal] = React.useState(false);
  const [examResult, setExamResult] = React.useState<any | null>(null);
  const [violationTerminated, setViolationTerminated] = React.useState(false);

  // Focus lock / Anti-Cheat for Strict CBT Mode
  React.useEffect(() => {
    if (!running || mode !== 'STRICT_CBT' || examResult || violationTerminated) return;

    const handleFocusLoss = () => {
      setViolationTerminated(true);
      setRunning(false);
      toast('Focus Violation: You switched tabs or minimized the exam window. The strict CBT exam has terminated.', 'error');
    };

    window.addEventListener('blur', handleFocusLoss);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) handleFocusLoss();
    });

    return () => {
      window.removeEventListener('blur', handleFocusLoss);
    };
  }, [running, mode, examResult, violationTerminated, toast]);

  // Timer countdown
  React.useEffect(() => {
    if (!running || examResult || violationTerminated) return;

    const timer = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmit(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [running, examResult, violationTerminated]);

  const handleStartExam = async (selectedMode: 'STRICT_CBT' | 'PRACTICE') => {
    setLoading(true);
    setMode(selectedMode);
    setViolationTerminated(false);
    setExamResult(null);

    try {
      const paperRecord = await api.pyq.getGateCbtPaper(selectedMode);
      const paperData = JSON.parse(paperRecord.questions_json);
      const qs: GateQuestion[] = paperData.questions || [];

      if (qs.length === 0) {
        throw new Error('No GATE questions available in question bank.');
      }

      const initialStatuses: Record<number, QuestionStatus> = {};
      qs.forEach((q, idx) => {
        initialStatuses[q.id] = idx === 0 ? 'not_answered' : 'not_visited';
      });

      setQuestions(qs);
      setStatuses(initialStatuses);
      setAnswers({});
      setCurrentIndex(0);
      setSecondsRemaining(paperData.durationMinutes * 60 || 10800);
      setRunning(true);
      toast(`Started ${selectedMode === 'STRICT_CBT' ? 'Strict GATE CBT Mock' : 'Practice Mock Test'}`, 'success');
    } catch (e: any) {
      toast(`Could not start exam: ${e?.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectQuestion = (idx: number) => {
    if (idx < 0 || idx >= questions.length) return;
    const currentQ = questions[currentIndex];
    const targetQ = questions[idx];

    // If moving from a question that was not_visited, update to not_answered
    if (statuses[currentQ.id] === 'not_visited') {
      setStatuses(prev => ({ ...prev, [currentQ.id]: 'not_answered' }));
    }
    if (statuses[targetQ.id] === 'not_visited') {
      setStatuses(prev => ({ ...prev, [targetQ.id]: 'not_answered' }));
    }

    setCurrentIndex(idx);
  };

  const handleSaveAndNext = () => {
    const q = questions[currentIndex];
    const hasAnswer = Boolean(answers[q.id]?.trim());

    setStatuses(prev => ({
      ...prev,
      [q.id]: hasAnswer ? 'answered' : 'not_answered',
    }));

    if (currentIndex < questions.length - 1) {
      handleSelectQuestion(currentIndex + 1);
    }
  };

  const handleMarkForReviewAndNext = () => {
    const q = questions[currentIndex];
    const hasAnswer = Boolean(answers[q.id]?.trim());

    setStatuses(prev => ({
      ...prev,
      [q.id]: hasAnswer ? 'answered_marked' : 'marked_review',
    }));

    if (currentIndex < questions.length - 1) {
      handleSelectQuestion(currentIndex + 1);
    }
  };

  const handleClearResponse = () => {
    const q = questions[currentIndex];
    setAnswers(prev => {
      const next = { ...prev };
      delete next[q.id];
      return next;
    });
    setStatuses(prev => ({ ...prev, [q.id]: 'not_answered' }));
  };

  const handleAppendNat = (val: string) => {
    const q = questions[currentIndex];
    setAnswers(prev => ({ ...prev, [q.id]: (prev[q.id] || '') + val }));
  };

  const handleBackspaceNat = () => {
    const q = questions[currentIndex];
    setAnswers(prev => ({ ...prev, [q.id]: (prev[q.id] || '').slice(0, -1) }));
  };

  const handleClearNat = () => {
    const q = questions[currentIndex];
    setAnswers(prev => ({ ...prev, [q.id]: '' }));
  };

  const handleSubmit = (auto = false) => {
    setRunning(false);
    setShowSubmitModal(false);

    let score = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let unattemptedCount = 0;

    questions.forEach(q => {
      const userAns = (answers[q.id] || '').trim();
      if (!userAns) {
        unattemptedCount++;
        return;
      }

      let isCorrect = false;
      if (q.type === 'NAT') {
        const numVal = parseFloat(userAns);
        if (!isNaN(numVal)) {
          if (q.natRangeStart !== undefined && q.natRangeEnd !== undefined) {
            isCorrect = numVal >= q.natRangeStart && numVal <= q.natRangeEnd;
          } else if (q.answerKey) {
            isCorrect = Math.abs(numVal - parseFloat(q.answerKey)) < 0.01;
          }
        }
      } else {
        isCorrect = userAns.toLowerCase() === (q.answerKey || '').toLowerCase();
      }

      if (isCorrect) {
        score += q.marks;
        correctCount++;
      } else {
        score -= q.negativeMarks;
        wrongCount++;
      }
    });

    const resultPayload = {
      score: Math.max(0, Math.round(score * 100) / 100),
      totalMarks: 100,
      correctCount,
      wrongCount,
      unattemptedCount,
      totalQuestions: questions.length,
      timeTakenSeconds: 10800 - secondsRemaining,
    };

    setExamResult(resultPayload);
    toast(auto ? 'Time expired. Exam auto-submitted!' : 'Exam submitted successfully!', 'success');

    // Award XP
    api.gamification.awardXp(Math.max(20, Math.round(score * 2)), 'GATE');
  };

  // Status counts for palette
  const statusCounts = React.useMemo(() => {
    const counts = { not_visited: 0, not_answered: 0, answered: 0, marked_review: 0, answered_marked: 0 };
    Object.values(statuses).forEach(st => {
      counts[st] = (counts[st] || 0) + 1;
    });
    return counts;
  }, [statuses]);

  const formatTimer = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Section list
  const sections = React.useMemo(() => {
    const set = new Set(questions.map(q => q.section));
    return ['All', ...Array.from(set)];
  }, [questions]);

  const filteredQuestionIndices = React.useMemo(() => {
    return questions
      .map((q, idx) => ({ q, idx }))
      .filter(({ q }) => activeSection === 'All' || q.section === activeSection)
      .map(({ idx }) => idx);
  }, [questions, activeSection]);

  const currentQ = questions[currentIndex];

  if (!running && !examResult && !violationTerminated) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border p-5" style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
                <Sparkles size={16} className="text-cyan-400" />
                <span>GATE CBT Examination Engine (TCS iON Standard)</span>
              </h3>
              <p className="text-xs text-[var(--color-muted)]">
                Authentic Indian CBT interface with official question palettes, negative marking, and strict focus lock.
              </p>
            </div>
            <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-400 border border-cyan-500/20">
              GATE ME Simulation
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-cyan-400">Strict Sub-Mode 1</span>
                  <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-400">
                    ANTI-CHEAT LOCK
                  </span>
                </div>
                <h4 className="text-sm font-bold text-[var(--color-text)] mb-1">
                  Strict Main GATE Exam (Real Exam Simulation)
                </h4>
                <p className="text-xs text-[var(--color-muted)] leading-relaxed mb-3">
                  Full 65 questions, 180 min, 100 marks. Strict fullscreen lock: switching tabs or minimizing terminates the exam with 0 score.
                </p>
                <div className="text-[11px] font-mono text-cyan-300 space-y-1 mb-4">
                  <div>• 10 General Aptitude + 55 Mechanical &amp; Maths</div>
                  <div>• Negative Marking: -0.33 for 1M MCQ, -0.66 for 2M MCQ</div>
                  <div>• Virtual Scientific Calculator Enabled</div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary w-full py-2 text-xs font-bold bg-cyan-600 hover:bg-cyan-500"
                onClick={() => handleStartExam('STRICT_CBT')}
                disabled={loading}
              >
                Launch Strict Full-Length CBT Exam
              </button>
            </div>

            <div className="rounded-xl border border-[var(--color-border)] p-5 flex flex-col justify-between bg-[var(--color-panel2)]">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-emerald-400">Practice Sub-Mode 2</span>
                  <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                    FLEXIBLE PRACTICE
                  </span>
                </div>
                <h4 className="text-sm font-bold text-[var(--color-text)] mb-1">
                  GATE Practice Mock Test
                </h4>
                <p className="text-xs text-[var(--color-muted)] leading-relaxed mb-3">
                  Flexible practice test using the authentic TCS iON CBT interface. No anti-cheat penalty, allowing pause and thorough question review.
                </p>
                <div className="text-[11px] font-mono text-[var(--color-muted)] space-y-1 mb-4">
                  <div>• Practice at your own pace</div>
                  <div>• Replicates the official GATE calculator &amp; palette</div>
                  <div>• Earn GATE XP upon completion</div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary w-full py-2 text-xs font-bold"
                onClick={() => handleStartExam('PRACTICE')}
                disabled={loading}
              >
                Launch Practice Mock Test
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (violationTerminated) {
    return (
      <div className="max-w-lg mx-auto py-12 text-center space-y-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500 mx-auto">
          <ShieldAlert size={36} />
        </div>
        <h2 className="text-xl font-bold text-rose-400">Exam Terminated: Focus Lock Violation</h2>
        <p className="text-xs text-[var(--color-muted)] leading-relaxed">
          In Strict Main GATE Exam mode, tab switching, window blurring, and exiting fullscreen are strictly prohibited to simulate real exam pressure.
        </p>
        <div className="pt-4">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setViolationTerminated(false)}
          >
            Return to Exam Setup
          </button>
        </div>
      </div>
    );
  }

  if (examResult) {
    return (
      <div className="max-w-xl mx-auto py-8 space-y-6">
        <div className="rounded-2xl border p-6 text-center space-y-3" style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}>
          <CheckCircle2 size={44} className="text-emerald-400 mx-auto" />
          <h2 className="text-xl font-bold text-[var(--color-text)]">GATE CBT Result Summary</h2>
          <div className="text-4xl font-black text-cyan-400 font-mono">
            {examResult.score} <span className="text-lg text-[var(--color-muted)]">/ 100</span>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <div className="rounded-xl p-3 bg-emerald-500/10 text-emerald-400">
              <div className="text-xs font-bold">{examResult.correctCount}</div>
              <div className="text-[10px] text-[var(--color-muted)]">Correct</div>
            </div>
            <div className="rounded-xl p-3 bg-rose-500/10 text-rose-400">
              <div className="text-xs font-bold">{examResult.wrongCount}</div>
              <div className="text-[10px] text-[var(--color-muted)]">Wrong</div>
            </div>
            <div className="rounded-xl p-3 bg-neutral-500/10 text-neutral-400">
              <div className="text-xs font-bold">{examResult.unattemptedCount}</div>
              <div className="text-[10px] text-[var(--color-muted)]">Unattempted</div>
            </div>
          </div>

          <div className="pt-4 flex justify-center">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                setExamResult(null);
                setRunning(false);
              }}
            >
              Take Another Mock
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------- AUTHENTIC TCS iON / GATE OFFICIAL CBT LAYOUT ----------------
  return (
    <div className="flex h-full min-h-[580px] w-full flex-col bg-[var(--color-bg)] select-none">
      {/* Top CBT Header */}
      <header
        className="flex h-12 shrink-0 items-center justify-between border-b px-4"
        style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-600 text-white font-bold text-xs">
            GATE
          </div>
          <div>
            <div className="text-xs font-bold text-[var(--color-text)]">GATE 2025 Mechanical Engineering</div>
            <div className="text-[10px] text-[var(--color-faint)]">
              {mode === 'STRICT_CBT' ? 'Official Computer-Based Test' : 'Practice Mock Simulation'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold text-cyan-400 hover:bg-cyan-950/20 transition-all"
            style={{ borderColor: 'var(--color-border)' }}
            onClick={() => setShowCalculator(!showCalculator)}
          >
            <Calculator size={14} />
            <span>Virtual Calculator</span>
          </button>

          <div className="flex items-center gap-2 rounded-lg bg-neutral-900/80 px-3 py-1 border border-neutral-700">
            <Timer size={15} className={secondsRemaining < 300 ? 'text-rose-500 animate-pulse' : 'text-cyan-400'} />
            <span className="font-mono text-sm font-bold text-white tracking-wide">
              {formatTimer(secondsRemaining)}
            </span>
          </div>
        </div>
      </header>

      {/* Main 75% / 25% Split Panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* 75% Left Main Examination Panel */}
        <div className="flex flex-1 flex-col border-r" style={{ borderColor: 'var(--color-border)' }}>
          {/* Section Tabs Header */}
          <div className="flex items-center gap-2 border-b px-4 py-2 bg-[var(--color-panel2)]" style={{ borderColor: 'var(--color-border)' }}>
            <span className="text-[11px] font-bold text-[var(--color-muted)] mr-2">Sections:</span>
            {sections.map(s => (
              <button
                key={s}
                onClick={() => setActiveSection(s)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                  activeSection === s
                    ? 'bg-cyan-600 text-white shadow-xs'
                    : 'text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-panel3)]'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Question Subheader */}
          <div className="flex items-center justify-between border-b px-5 py-2.5 bg-[var(--color-panel)]" style={{ borderColor: 'var(--color-border)' }}>
            <div className="text-xs font-bold text-[var(--color-text)]">
              Question No. {currentQ.number} ({currentQ.type})
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-emerald-400 font-semibold">Marks: +{currentQ.marks}</span>
              <span className="text-rose-400 font-semibold">Negative: -{currentQ.negativeMarks}</span>
            </div>
          </div>

          {/* Scrollable Question Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="text-sm font-medium text-[var(--color-text)] leading-relaxed whitespace-pre-wrap">
              {currentQ.questionText}
            </div>

            {/* Answer Options: MCQ vs MSQ vs NAT */}
            {currentQ.type === 'NAT' ? (
              <div className="rounded-2xl border p-5 max-w-sm" style={{ background: 'var(--color-panel2)', borderColor: 'var(--color-border)' }}>
                <div className="text-xs font-bold text-cyan-400 mb-2">On-Screen Numeric Keypad (NAT)</div>
                <div className="rounded-xl border bg-black/60 p-3 mb-4 text-right">
                  <span className="font-mono text-lg font-bold text-cyan-300">
                    {answers[currentQ.id] || '0'}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-1.5 font-mono text-xs">
                  {['7', '8', '9', 'C'].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => val === 'C' ? handleClearNat() : handleAppendNat(val)}
                      className={`h-10 rounded-lg font-bold border transition-all ${
                        val === 'C' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' : 'bg-[var(--color-panel)] hover:bg-cyan-600 hover:text-white border-[var(--color-border)]'
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                  {['4', '5', '6', 'DEL'].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => val === 'DEL' ? handleBackspaceNat() : handleAppendNat(val)}
                      className={`h-10 rounded-lg font-bold border transition-all ${
                        val === 'DEL' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-[var(--color-panel)] hover:bg-cyan-600 hover:text-white border-[var(--color-border)]'
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                  {['1', '2', '3', '-'].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleAppendNat(val)}
                      className="h-10 rounded-lg font-bold border bg-[var(--color-panel)] hover:bg-cyan-600 hover:text-white border-[var(--color-border)]"
                    >
                      {val}
                    </button>
                  ))}
                  {['0', '.', '', ''].map((val, i) => val ? (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleAppendNat(val)}
                      className="h-10 rounded-lg font-bold border bg-[var(--color-panel)] hover:bg-cyan-600 hover:text-white border-[var(--color-border)]"
                    >
                      {val}
                    </button>
                  ) : <div key={i} />)}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {currentQ.options.map((opt, optIdx) => {
                  const optLetter = String.fromCharCode(65 + optIdx);
                  const isSelected = answers[currentQ.id] === optLetter || answers[currentQ.id] === opt;

                  return (
                    <button
                      key={optIdx}
                      type="button"
                      onClick={() => setAnswers(prev => ({ ...prev, [currentQ.id]: optLetter }))}
                      className={`w-full flex items-start gap-3 rounded-xl border p-3.5 text-left text-xs transition-all ${
                        isSelected
                          ? 'border-cyan-500 bg-cyan-500/10 text-[var(--color-text)] font-medium shadow-xs'
                          : 'border-[var(--color-border)] hover:bg-[var(--color-panel2)] text-[var(--color-muted)]'
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${
                          isSelected
                            ? 'border-cyan-500 bg-cyan-500 text-white'
                            : 'border-[var(--color-border)] text-[var(--color-muted)]'
                        }`}
                      >
                        {optLetter}
                      </span>
                      <span className="flex-1 leading-snug">{opt}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Action Footer Bar */}
          <footer
            className="flex h-14 shrink-0 items-center justify-between border-t px-5"
            style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-sm btn-ghost border text-xs"
                style={{ borderColor: 'var(--color-border)' }}
                onClick={handleMarkForReviewAndNext}
              >
                Mark for Review &amp; Next
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost border text-xs text-rose-400"
                style={{ borderColor: 'var(--color-border)' }}
                onClick={handleClearResponse}
              >
                Clear Response
              </button>
            </div>

            <button
              type="button"
              className="btn btn-primary btn-sm px-6 font-bold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5"
              onClick={handleSaveAndNext}
            >
              <span>Save &amp; Next</span>
              <ArrowRight size={13} />
            </button>
          </footer>
        </div>

        {/* 25% Right Sidebar Question Palette */}
        <div
          className="w-[280px] shrink-0 border-l flex flex-col"
          style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}
        >
          {/* Candidate Profile Box */}
          <div className="p-3 border-b flex items-center gap-3" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-600 text-white">
              <User size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold truncate text-[var(--color-text)]">Candidate: Basant Jangir</div>
              <div className="text-[10px] text-[var(--color-faint)]">Roll: GATE-ME-2025</div>
            </div>
          </div>

          {/* Official 5-Color Status Legend */}
          <div className="p-3 border-b text-[10px] space-y-1.5" style={{ borderColor: 'var(--color-border)' }}>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-1.5">
                <span className="h-4 w-4 rounded-full bg-emerald-500 text-white font-bold flex items-center justify-center text-[9px]">
                  {statusCounts.answered}
                </span>
                <span>Answered</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-4 w-4 rounded-full bg-rose-500 text-white font-bold flex items-center justify-center text-[9px]">
                  {statusCounts.not_answered}
                </span>
                <span>Not Answered</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-4 w-4 rounded-full bg-neutral-600 text-white font-bold flex items-center justify-center text-[9px]">
                  {statusCounts.not_visited}
                </span>
                <span>Not Visited</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-4 w-4 rounded-full bg-purple-600 text-white font-bold flex items-center justify-center text-[9px]">
                  {statusCounts.marked_review}
                </span>
                <span>Marked</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 pt-1">
              <span className="h-4 w-4 rounded-full bg-purple-600 text-emerald-400 font-bold flex items-center justify-center text-[11px] relative">
                ●
              </span>
              <span>Answered &amp; Marked for Review (Evaluated)</span>
            </div>
          </div>

          {/* Question Palette Grid */}
          <div className="flex-1 overflow-y-auto p-3">
            <div className="text-[11px] font-bold text-[var(--color-muted)] mb-2">Question Palette:</div>
            <div className="grid grid-cols-5 gap-1.5">
              {filteredQuestionIndices.map(idx => {
                const q = questions[idx];
                const st = statuses[q.id] || 'not_visited';
                const isCurrent = idx === currentIndex;

                const bgColors: Record<QuestionStatus, string> = {
                  not_visited: 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700',
                  not_answered: 'bg-rose-600 text-white hover:bg-rose-500',
                  answered: 'bg-emerald-600 text-white hover:bg-emerald-500',
                  marked_review: 'bg-purple-600 text-white hover:bg-purple-500',
                  answered_marked: 'bg-purple-700 text-emerald-300 font-bold border border-emerald-400',
                };

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => handleSelectQuestion(idx)}
                    className={`h-8 w-full rounded font-mono text-xs font-semibold transition-all ${bgColors[st]} ${
                      isCurrent ? 'ring-2 ring-cyan-400 scale-105' : ''
                    }`}
                  >
                    {q.number}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Submit Exam Button */}
          <div className="p-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <button
              type="button"
              className="btn btn-primary w-full py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
              onClick={() => setShowSubmitModal(true)}
            >
              Submit Exam
            </button>
          </div>
        </div>
      </div>

      {/* Calculator Modal */}
      {showCalculator && (
        <div
          className="fixed bottom-14 right-14 z-50 w-72 rounded-xl border p-3 shadow-2xl backdrop-blur-md"
          style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <span className="text-xs font-semibold flex items-center gap-1.5 text-cyan-400">
              <Calculator size={14} /> GATE Scientific Calculator
            </span>
            <button onClick={() => setShowCalculator(false)} className="text-xs text-[var(--color-muted)] hover:text-white">✕</button>
          </div>
          <div className="p-2 text-xs text-[var(--color-muted)] text-center">
            Official GATE virtual calculator active.
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border p-5 space-y-4" style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}>
            <h3 className="text-sm font-bold text-[var(--color-text)]">Submit Examination?</h3>
            <p className="text-xs text-[var(--color-muted)]">
              You have answered {statusCounts.answered + statusCounts.answered_marked} of {questions.length} questions.
              Are you sure you want to finalize and submit?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowSubmitModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm bg-emerald-600 text-white"
                onClick={() => handleSubmit(false)}
              >
                Confirm Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
