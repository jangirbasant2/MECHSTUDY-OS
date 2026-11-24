import React, { useState } from 'react';
import {
  Mic, Award, Sparkles, CheckCircle2, AlertCircle, BookOpen, ChevronRight,
  RotateCcw, ShieldCheck, Flame, UserCheck, MessageSquare, ArrowRight, Loader2,
  X
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store';
import { Modal } from './ui';

export interface VivaSimulatorModalProps {
  open: boolean;
  onClose: () => void;
  defaultTrack?: 'RTU_LAB' | 'GATE_PSU_INTERVIEW';
}

const RTU_LABS = [
  'Materials Testing Lab',
  'Fluid Mechanics Lab',
  'Heat Transfer Lab',
  'Basic Mechanical Engineering Lab',
  'Machine Drawing Practice',
];

const PSU_SUBJECTS = [
  'Engineering Thermodynamics',
  'Mechanics of Solids',
  'Fluid Mechanics Lab',
  'Heat Transfer Lab',
  'Materials Testing Lab',
];

export function VivaSimulatorModal({ open, onClose, defaultTrack = 'RTU_LAB' }: VivaSimulatorModalProps) {
  const toast = useApp(s => s.toast);
  const activeExamMode = useApp(s => s.activeExamMode);

  const [track, setTrack] = useState<'RTU_LAB' | 'GATE_PSU_INTERVIEW'>(
    defaultTrack || (activeExamMode === 'GATE' ? 'GATE_PSU_INTERVIEW' : 'RTU_LAB')
  );
  const [selectedSubject, setSelectedSubject] = useState<string>(
    track === 'RTU_LAB' ? RTU_LABS[0] : PSU_SUBJECTS[0]
  );
  const [difficulty, setDifficulty] = useState<'basic' | 'moderate' | 'rigorous'>('moderate');

  // Session state
  const [sessionActive, setSessionActive] = useState<boolean>(false);
  const [loadingQuestion, setLoadingQuestion] = useState<boolean>(false);
  const [submittingAnswer, setSubmittingAnswer] = useState<boolean>(false);

  // Active examination state
  const [openingGreeting, setOpeningGreeting] = useState<string>('');
  const [currentQuestion, setCurrentQuestion] = useState<string>('');
  const [contextNotes, setContextNotes] = useState<string>('');
  const [studentAnswer, setStudentAnswer] = useState<string>('');
  const [lastEvaluation, setLastEvaluation] = useState<any | null>(null);

  // History & scoring
  const [history, setHistory] = useState<Array<{
    question: string;
    studentAnswer: string;
    score: number;
    feedback: string;
  }>>([]);
  const [isFinished, setIsFinished] = useState<boolean>(false);

  const handleStartSession = async () => {
    setLoadingQuestion(true);
    setSessionActive(true);
    setIsFinished(false);
    setHistory([]);
    setLastEvaluation(null);
    setStudentAnswer('');

    try {
      const res = await api.viva.startSession({
        track,
        subjectOrLab: selectedSubject,
        difficulty,
      });
      setOpeningGreeting(res.openingGreeting);
      setCurrentQuestion(res.initialQuestion);
      setContextNotes(res.contextNotes);
    } catch (err: any) {
      toast(`Failed to start viva session: ${err?.message}`, 'error');
      setSessionActive(false);
    } finally {
      setLoadingQuestion(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!studentAnswer.trim()) {
      toast('Please type your verbal answer to the examiner.', 'info');
      return;
    }

    setSubmittingAnswer(true);
    try {
      const res = await api.viva.evaluateAnswer({
        track,
        subjectOrLab: selectedSubject,
        questionHistory: history.map(h => ({
          question: h.question,
          studentAnswer: h.studentAnswer,
          score: h.score,
        })),
        currentQuestion,
        studentAnswer: studentAnswer.trim(),
      });

      setLastEvaluation(res);
      const newHistory = [
        ...history,
        {
          question: currentQuestion,
          studentAnswer: studentAnswer.trim(),
          score: res.score,
          feedback: res.examinerFeedback,
        },
      ];
      setHistory(newHistory);

      if (res.isSessionFinished || newHistory.length >= 4) {
        setIsFinished(true);
        // Award XP for completing viva-voce practice
        try {
          await api.gamification.awardXp(25, track === 'RTU_LAB' ? 'RTU' : 'GATE');
          toast('+25 XP Awarded for completing Technical Viva simulation!', 'success');
        } catch {}
      }
    } catch (err: any) {
      toast(`Error evaluating answer: ${err?.message}`, 'error');
    } finally {
      setSubmittingAnswer(false);
    }
  };

  const handleNextQuestion = () => {
    if (lastEvaluation?.followUpQuestion) {
      setCurrentQuestion(lastEvaluation.followUpQuestion);
      setStudentAnswer('');
      setLastEvaluation(null);
    }
  };

  const resetSession = () => {
    setSessionActive(false);
    setIsFinished(false);
    setHistory([]);
    setLastEvaluation(null);
    setStudentAnswer('');
  };

  const avgScore = history.length > 0
    ? (history.reduce((acc, h) => acc + h.score, 0) / history.length).toFixed(1)
    : '0.0';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        track === 'RTU_LAB'
          ? 'RTU Laboratory Viva-Voce Simulator'
          : 'PSU / BARC / GATE Technical Interview Board'
      }
      width={680}
      footer={
        <div className="flex items-center justify-between w-full">
          {sessionActive ? (
            <button
              type="button"
              className="btn btn-sm btn-ghost gap-1.5 text-xs text-[var(--color-muted)]"
              onClick={resetSession}
            >
              <RotateCcw size={13} /> Exit & Start New Viva
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-sm" onClick={onClose}>
              Close
            </button>
            {!sessionActive && (
              <button
                type="button"
                className="btn btn-sm btn-primary gap-1.5"
                onClick={handleStartSession}
                disabled={loadingQuestion}
              >
                {loadingQuestion ? <Loader2 size={13} className="animate-spin" /> : <Mic size={13} />}
                <span>Begin Examination</span>
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        {/* Setup Screen (Before Starting) */}
        {!sessionActive && (
          <div className="space-y-4 py-1">
            <div className="rounded-xl border p-3.5 bg-[var(--color-panel2)] border-[var(--color-border)] flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
                <Sparkles size={18} />
              </div>
              <p className="text-[11.5px] leading-relaxed text-[var(--color-muted)]">
                Experience realistic, rigorous oral engineering examinations with instant feedback, physical reasoning critiques, and marks rubric. Designed for <strong>RTU Practical Lab end-sem external vivas</strong> and <strong>BARC / PSU / IIT technical interviews</strong>.
              </p>
            </div>

            {/* Track Selector */}
            <div>
              <label className="block text-[11px] font-semibold mb-1 text-[var(--color-text)]">
                Select Interview Track:
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  className={`p-3 rounded-xl border text-left transition-all ${
                    track === 'RTU_LAB'
                      ? 'border-blue-500 bg-blue-500/10 text-[var(--color-text)]'
                      : 'border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-muted)]'
                  }`}
                  onClick={() => {
                    setTrack('RTU_LAB');
                    setSelectedSubject(RTU_LABS[0]);
                  }}
                >
                  <div className="font-bold text-xs text-blue-400 flex items-center gap-1.5">
                    <BookOpen size={14} /> RTU Practical Lab Viva
                  </div>
                  <div className="text-[10.5px] mt-1 text-[var(--color-muted)]">
                    External examiner style: experimental setups, ASTM specimens, error analysis & precautions.
                  </div>
                </button>

                <button
                  type="button"
                  className={`p-3 rounded-xl border text-left transition-all ${
                    track === 'GATE_PSU_INTERVIEW'
                      ? 'border-purple-500 bg-purple-500/10 text-[var(--color-text)]'
                      : 'border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-muted)]'
                  }`}
                  onClick={() => {
                    setTrack('GATE_PSU_INTERVIEW');
                    setSelectedSubject(PSU_SUBJECTS[0]);
                  }}
                >
                  <div className="font-bold text-xs text-purple-400 flex items-center gap-1.5">
                    <Award size={14} /> PSU & BARC Technical Panel
                  </div>
                  <div className="text-[10.5px] mt-1 text-[var(--color-muted)]">
                    Research board style: deep fundamental derivations, boundary conditions & physical intuition.
                  </div>
                </button>
              </div>
            </div>

            {/* Subject / Lab Selector */}
            <div>
              <label className="block text-[11px] font-semibold mb-1 text-[var(--color-text)]">
                Laboratory / Core Subject:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(track === 'RTU_LAB' ? RTU_LABS : PSU_SUBJECTS).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSelectedSubject(s)}
                    className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                      selectedSubject === s
                        ? 'border-[var(--color-accent)] bg-[var(--color-panel2)] font-semibold text-[var(--color-text)]'
                        : 'border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-muted)] hover:text-[var(--color-text)]'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Difficulty */}
            <div>
              <label className="block text-[11px] font-semibold mb-1 text-[var(--color-text)]">
                Panel Rigor Level:
              </label>
              <div className="flex items-center gap-2">
                {(['basic', 'moderate', 'rigorous'] as const).map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    className={`px-3 py-1.5 rounded-lg border text-xs capitalize ${
                      difficulty === d
                        ? 'bg-[var(--color-panel2)] border-[var(--color-accent)] text-[var(--color-accent)] font-bold'
                        : 'bg-[var(--color-panel)] border-[var(--color-border)] text-[var(--color-muted)]'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Active Viva Screen */}
        {sessionActive && (
          <div className="space-y-4">
            {/* Header Status Bar */}
            <div className="flex items-center justify-between p-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel2)]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-bold text-xs text-[var(--color-text)]">{selectedSubject}</span>
                <span className="text-[10px] text-[var(--color-muted)]">· Question #{history.length + 1}</span>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-[var(--color-muted)]">
                  Rounds: <strong className="text-[var(--color-text)]">{history.length} / 4</strong>
                </span>
                {history.length > 0 && (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
                    Avg Score: {avgScore} / 10
                  </span>
                )}
              </div>
            </div>

            {/* Completed Final Screen */}
            {isFinished ? (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--color-text)]">
                    Examination Completed Successfully!
                  </h3>
                  <p className="text-xs text-[var(--color-muted)] mt-1">
                    You have answered all questions posed by the panel.
                  </p>
                </div>

                <div className="inline-flex items-center gap-3 px-4 py-2 rounded-xl bg-[var(--color-panel)] border border-[var(--color-border)]">
                  <div>
                    <div className="text-[10px] text-[var(--color-muted)]">Overall Viva Score</div>
                    <div className="text-xl font-black text-emerald-400">{avgScore} / 10</div>
                  </div>
                  <div className="w-px h-8 bg-[var(--color-border)]" />
                  <div>
                    <div className="text-[10px] text-[var(--color-muted)]">XP Reward</div>
                    <div className="text-xl font-black text-purple-400">+25 XP</div>
                  </div>
                </div>

                <div className="text-left space-y-2 mt-4 pt-3 border-t border-[var(--color-border)]">
                  <span className="text-[11px] font-bold text-[var(--color-text)]">Question History & Ratings:</span>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {history.map((h, i) => (
                      <div key={i} className="p-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] text-[11px] space-y-1">
                        <div className="flex items-center justify-between font-semibold text-[var(--color-text)]">
                          <span>Q{i + 1}: {h.question.slice(0, 65)}...</span>
                          <span className="text-emerald-400 font-bold">{h.score}/10</span>
                        </div>
                        <div className="text-[10px] text-[var(--color-muted)] italic">
                          "{h.feedback}"
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Examiner Question Box */}
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4 space-y-2">
                  <div className="flex items-center gap-2 text-[10px] font-bold text-purple-400 uppercase tracking-wider">
                    <UserCheck size={12} />
                    <span>External Examiner Panel</span>
                  </div>

                  {openingGreeting && history.length === 0 && (
                    <p className="text-xs text-[var(--color-muted)] italic border-l-2 border-purple-400 pl-2 py-0.5">
                      "{openingGreeting}"
                    </p>
                  )}

                  <p className="text-sm font-semibold text-[var(--color-text)] leading-relaxed">
                    {currentQuestion}
                  </p>

                  {contextNotes && (
                    <div className="text-[10.5px] text-[var(--color-muted)] bg-[var(--color-panel2)] p-2 rounded-lg border border-[var(--color-border)] mt-2">
                      💡 <strong>Key Examination Focus:</strong> {contextNotes}
                    </div>
                  )}
                </div>

                {/* Last Evaluation (if student submitted) */}
                {lastEvaluation && (
                  <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                        <Award size={14} /> Panel Rating: {lastEvaluation.score} / 10 ({lastEvaluation.verdict})
                      </span>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary gap-1 text-xs"
                        onClick={handleNextQuestion}
                      >
                        <span>Next Question</span>
                        <ArrowRight size={12} />
                      </button>
                    </div>

                    <div className="text-xs text-[var(--color-text)] leading-relaxed bg-[var(--color-panel)] p-2.5 rounded-lg border border-[var(--color-border)]">
                      <strong>Examiner's Remarks:</strong> "{lastEvaluation.examinerFeedback}"
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                        <span className="font-bold block mb-0.5">Key Strengths:</span>
                        <ul className="list-disc list-inside space-y-0.5 text-[10.5px]">
                          {lastEvaluation.strengths?.map((s: string, idx: number) => (
                            <li key={idx}>{s}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                        <span className="font-bold block mb-0.5">Missed Concepts:</span>
                        <ul className="list-disc list-inside space-y-0.5 text-[10.5px]">
                          {lastEvaluation.missedConcepts?.map((m: string, idx: number) => (
                            <li key={idx}>{m}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="text-[11px] text-[var(--color-muted)] bg-[var(--color-panel)] p-2.5 rounded-lg border border-[var(--color-border)]">
                      <span className="font-bold text-[var(--color-text)] block mb-1">Model Ideal Answer:</span>
                      {lastEvaluation.modelAnswer}
                    </div>
                  </div>
                )}

                {/* Student Answer Input Box (Hidden when viewing evaluation) */}
                {!lastEvaluation && (
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-[var(--color-text)]">
                      Your Verbal Answer to the Panel:
                    </label>
                    <textarea
                      className="input w-full text-xs"
                      rows={4}
                      value={studentAnswer}
                      onChange={e => setStudentAnswer(e.target.value)}
                      placeholder="Explain your physical reasoning, assumptions, equations, and experimental precautions clearly..."
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-[var(--color-muted)]">
                        Tip: Include relevant formulas, physical mechanisms, and units for top marks.
                      </span>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary gap-1.5"
                        onClick={handleSubmitAnswer}
                        disabled={submittingAnswer || !studentAnswer.trim()}
                      >
                        {submittingAnswer ? <Loader2 size={13} className="animate-spin" /> : <Mic size={13} />}
                        <span>Submit Answer to Examiner</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
