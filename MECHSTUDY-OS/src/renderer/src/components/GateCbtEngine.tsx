import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import {
  Timer, Calculator, ShieldAlert, Award, CheckCircle2, AlertTriangle,
  RotateCcw, Sparkles, User, ChevronRight, HelpCircle, ArrowRight, BookOpen,
  Zap, Lightbulb, Target, AlertCircle, X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store';
import { Modal } from './ui';
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
  const setExamActive = useApp(s => s.setExamActive);

  const [mode, setMode] = React.useState<'STRICT_CBT' | 'PRACTICE'>('STRICT_CBT');
  const [running, setRunning] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [questions, setQuestions] = React.useState<GateQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [activeSection, setActiveSection] = React.useState('All');
  const [secondsRemaining, setSecondsRemaining] = React.useState(10800); // 180 min
  const [answers, setAnswers] = React.useState<Record<number, string>>({});
  const [statuses, setStatuses] = React.useState<Record<number, QuestionStatus>>({});
  const toggleGateCalc = useApp(s => s.toggleGateCalc);
  const gateCalcOpen = useApp(s => s.gateCalcOpen);
  const [showSubmitModal, setShowSubmitModal] = React.useState(false);
  const [preExamModalOpen, setPreExamModalOpen] = React.useState(false);
  const [showMistakesModal, setShowMistakesModal] = React.useState(false);
  const [mistakesList, setMistakesList] = React.useState<any[]>([]);
  const [mistakeSectionFilter, setMistakeSectionFilter] = React.useState<string>('All');
  const [examResult, setExamResult] = React.useState<any | null>(null);
  const [violationTerminated, setViolationTerminated] = React.useState(false);

  // AI Exam Coach Walkthrough state
  const [showAiCoach, setShowAiCoach] = React.useState(false);
  const [aiCoachFilter, setAiCoachFilter] = React.useState<'ALL' | 'WRONG' | 'CORRECT' | 'UNATTEMPTED'>('ALL');
  const [selectedCoachQuestion, setSelectedCoachQuestion] = React.useState<GateQuestion | null>(null);
  const [coachingData, setCoachingData] = React.useState<any | null>(null);
  const [coachingLoading, setCoachingLoading] = React.useState(false);

  // Auto clean-up fullscreen & exam mode on unmount
  React.useEffect(() => {
    return () => {
      setExamActive(false);
      api.window.setFullScreen(false).catch(() => {});
    };
  }, [setExamActive]);

  // Focus lock / Anti-Cheat for Strict CBT Mode
  React.useEffect(() => {
    if (!running || mode !== 'STRICT_CBT' || examResult || violationTerminated) return;

    const handleFocusLoss = () => {
      setViolationTerminated(true);
      setRunning(false);
      setExamActive(false);
      api.window.setFullScreen(false).catch(() => {});
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
      setExamActive(true);
      api.window.setFullScreen(true).catch(() => {});
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
    setExamActive(false);
    api.window.setFullScreen(false).catch(() => {});
    setShowSubmitModal(false);

    let score = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let unattemptedCount = 0;
    let negativeMarksLost = 0;

    let gaScore = 0;
    let emScore = 0;
    let meScore = 0;

    const mistakeRecords: any[] = [];

    questions.forEach(q => {
      const userAns = (answers[q.id] || '').trim();
      if (!userAns) {
        unattemptedCount++;
        mistakeRecords.push({
          question_id: q.id,
          subject_name: q.section === 'GA' ? 'General Aptitude' : q.section === 'EM' ? 'Engineering Mathematics' : 'Mechanical Engineering',
          section: q.section,
          question_text: q.questionText,
          options_json: q.options ? JSON.stringify(q.options) : null,
          correct_answer: q.answerKey,
          user_answer: '(Unattempted)',
          marks: q.marks,
          negative_marks_lost: 0,
          solution_text: q.solution,
          notes: 'Unattempted during exam',
        });
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
        if (q.section === 'GA') gaScore += q.marks;
        else if (q.section === 'EM') emScore += q.marks;
        else meScore += q.marks;
      } else {
        score -= q.negativeMarks;
        wrongCount++;
        negativeMarksLost += q.negativeMarks;
        if (q.section === 'GA') gaScore -= q.negativeMarks;
        else if (q.section === 'EM') emScore -= q.negativeMarks;
        else meScore -= q.negativeMarks;

        mistakeRecords.push({
          question_id: q.id,
          subject_name: q.section === 'GA' ? 'General Aptitude' : q.section === 'EM' ? 'Engineering Mathematics' : 'Mechanical Engineering',
          section: q.section,
          question_text: q.questionText,
          options_json: q.options ? JSON.stringify(q.options) : null,
          correct_answer: q.answerKey,
          user_answer: userAns,
          marks: q.marks,
          negative_marks_lost: q.negativeMarks,
          solution_text: q.solution,
          notes: 'Incorrect attempt',
        });
      }
    });

    const timeTaken = 10800 - secondsRemaining;
    const attemptedCount = correctCount + wrongCount;
    const accuracy = attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0;
    const avgSecondsPerQ = attemptedCount > 0 ? Math.round(timeTaken / attemptedCount) : 0;

    const resultPayload = {
      score: Math.max(0, Math.round(score * 100) / 100),
      totalMarks: 100,
      correctCount,
      wrongCount,
      unattemptedCount,
      negativeMarksLost: Math.round(negativeMarksLost * 100) / 100,
      accuracy,
      avgSecondsPerQ,
      gaScore: Math.max(0, Math.round(gaScore * 100) / 100),
      emScore: Math.max(0, Math.round(emScore * 100) / 100),
      meScore: Math.max(0, Math.round(meScore * 100) / 100),
      totalQuestions: questions.length,
      timeTakenSeconds: timeTaken,
    };

    setExamResult(resultPayload);
    toast(auto ? 'Time expired. Exam auto-submitted!' : 'Exam submitted successfully!', 'success');

    // Auto-save mistakes into GATE Mistake Notebook
    if (mistakeRecords.length > 0) {
      api.pyq.recordGateMistakes(1, mistakeRecords).catch(() => {});
    }

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

  const handleCoachQuestion = async (q: GateQuestion) => {
    setSelectedCoachQuestion(q);
    setCoachingData(null);
    setCoachingLoading(true);

    const userAns = answers[q.id];
    let isCorrect = false;
    if (q.type === 'NAT') {
      const numVal = parseFloat(userAns);
      isCorrect = Boolean(!isNaN(numVal) && (
        (q.natRangeStart !== undefined && q.natRangeEnd !== undefined && numVal >= q.natRangeStart && numVal <= q.natRangeEnd) ||
        (q.answerKey && Math.abs(numVal - parseFloat(q.answerKey)) < 0.01)
      ));
    } else {
      isCorrect = Boolean(userAns && q.answerKey && userAns.trim().toUpperCase() === q.answerKey.trim().toUpperCase());
    }

    try {
      const result = await api.pyq.coachExamQuestion({
        questionNumber: q.number,
        questionText: q.questionText,
        type: q.type,
        options: q.options,
        correctAnswer: q.answerKey || (q.natRangeStart !== undefined ? `${q.natRangeStart} to ${q.natRangeEnd}` : ''),
        userAnswer: userAns,
        isCorrect,
        solution: q.solution,
        marks: q.marks,
      });
      setCoachingData(result);
    } catch (e: any) {
      toast(`AI Coaching request failed: ${e?.message}`, 'error');
    } finally {
      setCoachingLoading(false);
    }
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
                onClick={() => setPreExamModalOpen(true)}
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

          <div className="mt-4 pt-4 border-t flex justify-end" style={{ borderColor: 'var(--color-border)' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm text-xs flex items-center gap-1.5"
              onClick={async () => {
                const list = await api.pyq.getGateMistakes();
                setMistakesList(list);
                setShowMistakesModal(true);
              }}
            >
              <BookOpen size={14} className="text-amber-400" />
              <span>Open GATE Mistake Notebook</span>
            </button>
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
      <div className="max-w-3xl mx-auto py-8 space-y-6">
        <div className="rounded-2xl border p-6 space-y-6" style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}>
          {/* Header */}
          <div className="text-center space-y-2 pb-4 border-b border-[var(--color-border)]">
            <CheckCircle2 size={40} className="text-emerald-400 mx-auto" />
            <h2 className="text-xl font-bold text-[var(--color-text)]">GATE CBT Examination Scorecard</h2>
            <div className="text-4xl font-black text-cyan-400 font-mono">
              {examResult.score} <span className="text-lg text-[var(--color-muted)]">/ 100</span>
            </div>
            <p className="text-xs text-[var(--color-muted)]">
              GATE Mechanical Engineering Standard Evaluation
            </p>
          </div>

          {/* Core Analytics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl p-3 bg-emerald-500/10 border border-emerald-500/20 text-center">
              <div className="text-xs text-[var(--color-muted)]">Accuracy</div>
              <div className="text-lg font-bold text-emerald-400 font-mono">{examResult.accuracy}%</div>
              <div className="text-[10px] text-[var(--color-muted)]">{examResult.correctCount} Correct / {examResult.correctCount + examResult.wrongCount} Attempted</div>
            </div>

            <div className="rounded-xl p-3 bg-rose-500/10 border border-rose-500/20 text-center">
              <div className="text-xs text-[var(--color-muted)]">Negative Marks Lost</div>
              <div className="text-lg font-bold text-rose-400 font-mono">-{examResult.negativeMarksLost}</div>
              <div className="text-[10px] text-[var(--color-muted)]">{examResult.wrongCount} Wrong MCQs</div>
            </div>

            <div className="rounded-xl p-3 bg-cyan-500/10 border border-cyan-500/20 text-center">
              <div className="text-xs text-[var(--color-muted)]">Time / Question</div>
              <div className="text-lg font-bold text-cyan-400 font-mono">
                {Math.floor(examResult.avgSecondsPerQ / 60)}m {examResult.avgSecondsPerQ % 60}s
              </div>
              <div className="text-[10px] text-[var(--color-muted)]">Target: 2m 46s</div>
            </div>

            <div className="rounded-xl p-3 bg-neutral-500/10 border border-neutral-500/20 text-center">
              <div className="text-xs text-[var(--color-muted)]">Unattempted</div>
              <div className="text-lg font-bold text-neutral-300 font-mono">{examResult.unattemptedCount}</div>
              <div className="text-[10px] text-[var(--color-muted)]">0 Penalty</div>
            </div>
          </div>

          {/* Sectional Breakdown */}
          <div className="rounded-xl p-4 bg-[var(--color-panel2)] border border-[var(--color-border)] space-y-3">
            <div className="text-xs font-bold text-[var(--color-text)]">Section-wise Performance Breakdown:</div>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)]">
                <div className="text-[10.5px] text-[var(--color-muted)]">General Aptitude</div>
                <div className="text-sm font-bold text-cyan-400 font-mono">{examResult.gaScore} <span className="text-[10px] text-[var(--color-muted)]">/ 15M</span></div>
              </div>
              <div className="p-3 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)]">
                <div className="text-[10.5px] text-[var(--color-muted)]">Engineering Maths</div>
                <div className="text-sm font-bold text-blue-400 font-mono">{examResult.emScore} <span className="text-[10px] text-[var(--color-muted)]">/ 13M</span></div>
              </div>
              <div className="p-3 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)]">
                <div className="text-[10.5px] text-[var(--color-muted)]">Mechanical Core</div>
                <div className="text-sm font-bold text-amber-400 font-mono">{examResult.meScore} <span className="text-[10px] text-[var(--color-muted)]">/ 72M</span></div>
              </div>
            </div>
          </div>

          {/* Mistake Auto-Saved Notice */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-center justify-between text-xs text-amber-300">
            <div className="flex items-center gap-2">
              <BookOpen size={16} className="text-amber-400 shrink-0" />
              <span>
                Auto-saved {examResult.wrongCount + examResult.unattemptedCount} questions into your <strong>GATE Mistake Notebook</strong> for targeted revision.
              </span>
            </div>
            <button
              type="button"
              className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold shrink-0 ml-3"
              onClick={async () => {
                const list = await api.pyq.getGateMistakes();
                setMistakesList(list);
                setShowMistakesModal(true);
              }}
            >
              Open Notebook
            </button>
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap justify-between items-center gap-2 pt-2 border-t border-[var(--color-border)]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={async () => {
                  const list = await api.pyq.getGateMistakes();
                  setMistakesList(list);
                  setShowMistakesModal(true);
                }}
              >
                Review Mistakes
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm flex items-center gap-1.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold shadow-md"
                onClick={() => {
                  setShowAiCoach(true);
                  if (questions.length > 0) {
                    const firstTarget = questions.find(q => {
                      const ans = answers[q.id];
                      return !ans || ans.trim().toUpperCase() !== (q.answerKey || '').trim().toUpperCase();
                    }) || questions[0];
                    handleCoachQuestion(firstTarget);
                  }
                }}
              >
                <Sparkles size={14} className="text-amber-300" />
                <span>AI Exam Coach & Walkthrough</span>
              </button>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                setExamResult(null);
                setRunning(false);
                setExamActive(false);
                api.window.setFullScreen(false).catch(() => {});
              }}
            >
              Take Another Mock Exam
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
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all ${
              gateCalcOpen
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-xs'
                : 'text-cyan-400 hover:bg-cyan-950/20'
            }`}
            style={{ borderColor: 'var(--color-border)' }}
            onClick={() => toggleGateCalc()}
            title="Toggle TCS-iON GATE Virtual Calculator (Alt+C)"
          >
            <Calculator size={14} />
            <span>Virtual Calculator (Alt+C)</span>
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

      {/* Pre-Exam Anti-Cheat Warning Modal */}
      {preExamModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/40 p-6 space-y-4 shadow-2xl" style={{ background: 'var(--color-panel)' }}>
            <div className="flex items-center gap-3 text-rose-400">
              <ShieldAlert size={26} />
              <h3 className="text-base font-bold text-white">Strict GATE CBT Simulation Rules</h3>
            </div>
            <div className="text-xs text-[var(--color-muted)] space-y-2.5 leading-relaxed">
              <p>
                • <strong className="text-rose-300">Fullscreen Focus Lock:</strong> Switching application tabs, minimizing, or clicking outside will immediately reset and terminate the exam with zero marks, simulating real exam conditions.
              </p>
              <p>
                • <strong className="text-[var(--color-text)]">Marking Scheme:</strong> 1-mark MCQs carry <span className="text-rose-400">-0.33</span> negative marking; 2-mark MCQs carry <span className="text-rose-400">-0.66</span> negative marking. MSQ &amp; NAT have no negative marking.
              </p>
              <p>
                • <strong className="text-[var(--color-text)]">Duration:</strong> 180 Minutes (3 Hours) strictly enforced for 65 Questions (10 General Aptitude + 55 Technical &amp; Maths).
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreExamModalOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm bg-rose-600 hover:bg-rose-500 text-white font-bold"
                onClick={() => {
                  setPreExamModalOpen(false);
                  handleStartExam('STRICT_CBT');
                }}
              >
                I Understand &amp; Agree — Start Exam
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GATE Mistake Notebook Modal */}
      {showMistakesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-2xl max-h-[85vh] rounded-2xl border border-[var(--color-border)] p-6 space-y-4 flex flex-col shadow-2xl" style={{ background: 'var(--color-panel)' }}>
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <BookOpen size={18} className="text-amber-400" />
                <h3 className="text-sm font-bold text-[var(--color-text)]">
                  GATE Mistake Notebook ({mistakesList.length})
                </h3>
              </div>
              <button
                onClick={() => setShowMistakesModal(false)}
                className="p-1 rounded text-[var(--color-muted)] hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-2">
              {['All', 'GA', 'EM', 'ME'].map(sec => (
                <button
                  key={sec}
                  onClick={() => setMistakeSectionFilter(sec)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    mistakeSectionFilter === sec
                      ? 'bg-amber-600 text-white'
                      : 'bg-[var(--color-bg)] text-[var(--color-muted)] hover:text-white border border-[var(--color-border)]'
                  }`}
                >
                  {sec === 'All' ? 'All Sections' : sec === 'GA' ? 'General Aptitude' : sec === 'EM' ? 'Engg Maths' : 'Mechanical'}
                </button>
              ))}
            </div>

            {/* Mistake Items */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {mistakesList
                .filter(m => mistakeSectionFilter === 'All' || m.section === mistakeSectionFilter)
                .map((m: any) => (
                  <div
                    key={m.id}
                    className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          {m.section || 'ME'}
                        </span>
                        <span className="text-[11px] text-[var(--color-muted)] font-medium">
                          {m.subject_name}
                        </span>
                      </div>
                      {m.negative_marks_lost > 0 && (
                        <span className="text-rose-400 text-[10px] font-semibold">
                          Lost: -{m.negative_marks_lost} Marks
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-[var(--color-text)] leading-relaxed font-medium">
                      {m.question_text}
                    </p>

                    <div className="grid grid-cols-2 gap-2 text-[11px] p-2 rounded-lg bg-[var(--color-panel2)]">
                      <div>
                        <span className="text-[var(--color-muted)]">Your Answer: </span>
                        <span className="text-rose-400 font-bold">{m.user_answer}</span>
                      </div>
                      <div>
                        <span className="text-[var(--color-muted)]">Correct Key: </span>
                        <span className="text-emerald-400 font-bold">{m.correct_answer}</span>
                      </div>
                    </div>

                    {m.solution_text && (
                      <div className="text-[11px] text-emerald-300 bg-emerald-500/5 p-2.5 rounded-lg border border-emerald-500/10">
                        <span className="font-bold">Solution Note: </span>
                        <span>{m.solution_text}</span>
                      </div>
                    )}
                  </div>
                ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-[var(--color-border)]">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowMistakesModal(false)}
              >
                Close Notebook
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Exam Coaching Walkthrough Modal */}
      {showAiCoach && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div
            className="flex flex-col w-full max-w-5xl h-[88vh] rounded-2xl border shadow-2xl overflow-hidden"
            style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b px-5 py-3.5 bg-[var(--color-panel2)]" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-cyan-600 to-indigo-600 text-white">
                  <Sparkles size={16} />
                </div>
                <div>
                  <div className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
                    <span>AI Post-Exam Review & Active Coaching</span>
                    <span className="badge badge-accent text-[10px]">Google AI Studio</span>
                  </div>
                  <div className="text-[11px] text-[var(--color-muted)]">
                    Deep conceptual diagnosis for mistakes + speed shortcuts for correct solutions
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAiCoach(false)}
                className="p-1 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-panel3)]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-2 px-5 py-2.5 border-b bg-[var(--color-bg)]/50" style={{ borderColor: 'var(--color-border)' }}>
              <span className="text-[11px] font-semibold text-[var(--color-muted)] mr-1">Filter Questions:</span>
              {(['ALL', 'WRONG', 'CORRECT', 'UNATTEMPTED'] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setAiCoachFilter(f)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    aiCoachFilter === f
                      ? 'bg-cyan-600 text-white shadow-xs'
                      : 'text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-panel2)]'
                  }`}
                >
                  {f === 'ALL' ? `All (${questions.length})` : f === 'WRONG' ? `❌ Wrong (${examResult?.wrongCount || 0})` : f === 'CORRECT' ? `✅ Correct (${examResult?.correctCount || 0})` : `⚪ Unattempted (${examResult?.unattemptedCount || 0})`}
                </button>
              ))}
            </div>

            {/* 2-Column Split: Questions Rail + Active Coach Panel */}
            <div className="flex flex-1 min-h-0 overflow-hidden">
              {/* Left Question Selector Rail */}
              <div className="w-64 border-r overflow-y-auto p-3 space-y-2 bg-[var(--color-panel2)]/30 shrink-0" style={{ borderColor: 'var(--color-border)' }}>
                {questions
                  .filter(q => {
                    const ans = answers[q.id];
                    let isCorrect = false;
                    if (q.type === 'NAT') {
                      const numVal = parseFloat(ans);
                      isCorrect = Boolean(!isNaN(numVal) && (
                        (q.natRangeStart !== undefined && q.natRangeEnd !== undefined && numVal >= q.natRangeStart && numVal <= q.natRangeEnd) ||
                        (q.answerKey && Math.abs(numVal - parseFloat(q.answerKey)) < 0.01)
                      ));
                    } else {
                      isCorrect = Boolean(ans && q.answerKey && ans.trim().toUpperCase() === q.answerKey.trim().toUpperCase());
                    }

                    if (aiCoachFilter === 'WRONG') return Boolean(ans && !isCorrect);
                    if (aiCoachFilter === 'CORRECT') return isCorrect;
                    if (aiCoachFilter === 'UNATTEMPTED') return !ans;
                    return true;
                  })
                  .map(q => {
                    const ans = answers[q.id];
                    let isCorrect = false;
                    if (q.type === 'NAT') {
                      const numVal = parseFloat(ans);
                      isCorrect = Boolean(!isNaN(numVal) && (
                        (q.natRangeStart !== undefined && q.natRangeEnd !== undefined && numVal >= q.natRangeStart && numVal <= q.natRangeEnd) ||
                        (q.answerKey && Math.abs(numVal - parseFloat(q.answerKey)) < 0.01)
                      ));
                    } else {
                      isCorrect = Boolean(ans && q.answerKey && ans.trim().toUpperCase() === q.answerKey.trim().toUpperCase());
                    }
                    const isSelected = selectedCoachQuestion?.id === q.id;

                    return (
                      <div
                        key={q.id}
                        onClick={() => handleCoachQuestion(q)}
                        className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                          isSelected
                            ? 'border-cyan-500 bg-cyan-500/10 shadow-xs'
                            : 'border-[var(--color-border)] hover:border-cyan-500/40 hover:bg-[var(--color-panel2)]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-[var(--color-text)]">Q{q.number}</span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-sm">
                            {isCorrect ? (
                              <span className="text-emerald-400">✅ +{q.marks}M</span>
                            ) : ans ? (
                              <span className="text-rose-400">❌ -{q.negativeMarks}M</span>
                            ) : (
                              <span className="text-[var(--color-muted)]">⚪ 0M</span>
                            )}
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--color-muted)] truncate">{q.questionText}</div>
                      </div>
                    );
                  })}
              </div>

              {/* Right Coaching Breakdown Panel */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-[var(--color-bg)]">
                {selectedCoachQuestion ? (
                  <>
                    {/* Question Banner */}
                    <div className="rounded-xl border p-4 bg-[var(--color-panel)]" style={{ borderColor: 'var(--color-border)' }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-cyan-400">
                          Question #{selectedCoachQuestion.number} · {selectedCoachQuestion.section} · {selectedCoachQuestion.type} ({selectedCoachQuestion.marks} Mark{selectedCoachQuestion.marks > 1 ? 's' : ''})
                        </span>
                        <div className="flex items-center gap-3 text-xs">
                          <div>
                            <span className="text-[var(--color-muted)]">Your Answer: </span>
                            <span className="font-bold text-[var(--color-text)]">{answers[selectedCoachQuestion.id] || 'Not Attempted'}</span>
                          </div>
                          <div>
                            <span className="text-[var(--color-muted)]">Correct Key: </span>
                            <span className="font-bold text-emerald-400">{selectedCoachQuestion.answerKey || (selectedCoachQuestion.natRangeStart !== undefined ? `${selectedCoachQuestion.natRangeStart} to ${selectedCoachQuestion.natRangeEnd}` : 'N/A')}</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-[var(--color-text)] leading-relaxed font-medium">
                        {selectedCoachQuestion.questionText}
                      </p>
                    </div>

                    {coachingLoading ? (
                      <div className="flex flex-col items-center justify-center py-16 space-y-3">
                        <RotateCcw size={28} className="animate-spin text-cyan-400" />
                        <div className="text-xs font-semibold text-[var(--color-text)]">
                          AI Coach analyzing question, option traps, and speed shortcuts…
                        </div>
                        <div className="text-[11px] text-[var(--color-muted)]">
                          Grounded on official GATE Mechanical syllabus & derivations
                        </div>
                      </div>
                    ) : coachingData ? (
                      <div className="space-y-4">
                        {/* 1. Diagnosis */}
                        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-1.5">
                          <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
                            <Target size={15} />
                            <span>Concept Diagnosis & Focus</span>
                          </div>
                          <p className="text-xs text-[var(--color-text)] leading-relaxed">
                            {coachingData.diagnosis}
                          </p>
                        </div>

                        {/* 2. Step-by-Step Rigorous Solution */}
                        <div className="rounded-xl border border-indigo-500/30 bg-[var(--color-panel)] p-4 space-y-2">
                          <div className="flex items-center gap-2 text-xs font-bold text-indigo-400 uppercase tracking-wider">
                            <BookOpen size={15} />
                            <span>Rigorous Mathematical Solution</span>
                          </div>
                          <div className="prose prose-invert prose-xs max-w-none text-xs leading-relaxed">
                            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                              {coachingData.stepByStepSolution}
                            </ReactMarkdown>
                          </div>
                        </div>

                        {/* 3. Speed Trick & Shortcut */}
                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-1.5">
                          <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                            <Zap size={15} />
                            <span>⚡ 45-Second Speed Trick / Exam Shortcut</span>
                          </div>
                          <div className="prose prose-invert prose-xs max-w-none text-xs text-emerald-200 leading-relaxed">
                            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                              {coachingData.shortcutOrSpeedTrick}
                            </ReactMarkdown>
                          </div>
                        </div>

                        {/* 4. Option Traps Breakdown */}
                        {coachingData.optionsBreakdown && coachingData.optionsBreakdown.length > 0 && (
                          <div className="rounded-xl border p-4 space-y-2 bg-[var(--color-panel)]" style={{ borderColor: 'var(--color-border)' }}>
                            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                              <AlertCircle size={15} />
                              <span>Examiner Distractor Traps</span>
                            </div>
                            <div className="grid gap-2">
                              {coachingData.optionsBreakdown.map((opt: any, i: number) => (
                                <div key={i} className={`p-2.5 rounded-lg border text-xs ${opt.isTrap ? 'border-amber-500/30 bg-amber-500/5' : 'border-[var(--color-border)] bg-[var(--color-panel2)]'}`}>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-bold text-[var(--color-text)]">Option {opt.option}:</span>
                                    {opt.isTrap && <span className="text-[10px] bg-amber-500/20 text-amber-300 font-semibold px-1.5 py-0.5 rounded-sm">Examiner Trap</span>}
                                  </div>
                                  <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">{opt.analysis}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 5. Key Takeaway */}
                        {coachingData.keyTakeaway && (
                          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-start gap-2.5 text-xs text-amber-300">
                            <Lightbulb size={16} className="text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold">Golden Memory Hook: </span>
                              <span>{coachingData.keyTakeaway}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 text-[var(--color-muted)]">
                        <Sparkles size={24} className="mb-2 text-cyan-400" />
                        <div className="text-xs">Click a question on the left to receive custom AI coaching.</div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-[var(--color-muted)]">
                    <Sparkles size={32} className="mb-2 text-cyan-400" />
                    <div className="text-xs font-semibold">Select any question on the left to start coaching</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
