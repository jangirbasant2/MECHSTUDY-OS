import React, { useState, useEffect } from 'react';
import { Sparkles, CheckCircle2, AlertCircle, Loader2, Award, ArrowRight, BookOpen } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store';
import { Modal } from './ui';
import type { DueRevisionTopic } from '../../../shared/types';

interface QuickDrillModalProps {
  open: boolean;
  onClose: () => void;
  examTrack: 'RTU' | 'GATE';
  dueTopic?: DueRevisionTopic | null;
  onDrillComplete?: () => void;
}

export function QuickDrillModal({
  open,
  onClose,
  examTrack,
  dueTopic,
  onDrillComplete,
}: QuickDrillModalProps) {
  const toast = useApp(s => s.toast);

  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState<{
    questionText: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
  } | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [drillResult, setDrillResult] = useState<{
    correct: boolean;
    xpAwarded: number;
    explanation: string;
    nextReviewAt: string;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      setQuestion(null);
      setSelectedAnswer(null);
      setDrillResult(null);
      return;
    }

    const fetchQuestion = async () => {
      setLoading(true);
      try {
        const topicTitle = dueTopic?.topicTitle || (examTrack === 'RTU' ? 'Pure Bending of Beams' : 'First Law of Thermodynamics');
        const subjectName = dueTopic?.subjectName || (examTrack === 'RTU' ? 'Mechanics of Solids' : 'Engineering Thermodynamics');

        const q = await api.quiz.generateMastery({
          topicTitle,
          subjectName,
          examTrack,
        });
        setQuestion(q);
      } catch (e: any) {
        toast(`Could not generate drill question: ${e?.message}`, 'error');
        onClose();
      } finally {
        setLoading(false);
      }
    };

    fetchQuestion();
  }, [open, dueTopic, examTrack]);

  if (!open) return null;

  const handleSubmitAnswer = async () => {
    if (!selectedAnswer || !question) return;
    setSubmitting(true);

    const isCorrect = selectedAnswer.trim().toLowerCase() === question.correctAnswer.trim().toLowerCase()
      || selectedAnswer.trim().startsWith(question.correctAnswer.trim());

    try {
      const topicId = dueTopic?.topicId || 1;
      const res = await api.gamification.completeRevisionDrill(topicId, isCorrect);
      setDrillResult({
        correct: isCorrect,
        xpAwarded: res.xpAwarded,
        explanation: question.explanation,
        nextReviewAt: res.nextReviewAt,
      });

      if (isCorrect) {
        toast(`+${res.xpAwarded} Revision XP earned! Daily streak extended.`, 'success');
      } else {
        toast('Review the concept explanation and retry soon.', 'info');
      }
      onDrillComplete?.();
    } catch (e: any) {
      toast(`Drill evaluation error: ${e?.message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={true}
      title="5-Min Quick Conceptual Drill ⚡"
      onClose={onClose}
      width={600}
    >
      <div className="space-y-4 py-2">
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <Loader2 size={28} className="animate-spin text-cyan-400" />
            <p className="text-xs text-[var(--color-muted)] font-medium">
              Generating rapid revision question via Gemini AI…
            </p>
          </div>
        )}

        {question && !drillResult && (
          <div className="space-y-4">
            {dueTopic && (
              <div className="flex items-center gap-2 text-[11px] text-cyan-400 bg-cyan-500/10 px-3 py-1.5 rounded-lg border border-cyan-500/20">
                <BookOpen size={13} />
                <span>Spaced Repetition: <strong>{dueTopic.topicTitle}</strong> ({dueTopic.subjectName})</span>
              </div>
            )}

            <div className="rounded-xl border border-[var(--color-border)] p-4 bg-[var(--color-panel2)]">
              <p className="text-xs font-semibold text-[var(--color-text)] leading-relaxed">
                {question.questionText}
              </p>
            </div>

            <div className="space-y-2">
              {question.options.map((opt, i) => {
                const isSelected = selectedAnswer === opt;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedAnswer(opt)}
                    className={`w-full text-left p-3 rounded-xl border text-xs font-medium transition-all flex items-center justify-between ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                        : 'border-[var(--color-border)] bg-[var(--color-bg)] hover:bg-[var(--color-panel2)] text-[var(--color-text)]'
                    }`}
                  >
                    <span>{opt}</span>
                    {isSelected && <span className="text-xs font-bold text-cyan-400">●</span>}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[var(--color-border)]">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={submitting}>
                Skip
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm flex items-center gap-1.5"
                disabled={!selectedAnswer || submitting}
                onClick={handleSubmitAnswer}
              >
                {submitting ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Evaluating…
                  </>
                ) : (
                  <>
                    <Sparkles size={13} /> Confirm Answer
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {drillResult && (
          <div className="space-y-4 text-center py-2">
            <div className={`p-4 rounded-2xl border ${
              drillResult.correct ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30'
            }`}>
              {drillResult.correct ? (
                <CheckCircle2 size={36} className="text-emerald-400 mx-auto mb-1.5" />
              ) : (
                <AlertCircle size={36} className="text-rose-400 mx-auto mb-1.5" />
              )}
              <h3 className={`text-base font-bold ${drillResult.correct ? 'text-emerald-300' : 'text-rose-300'}`}>
                {drillResult.correct ? 'Correct! Concept Verified' : 'Incorrect Attempt'}
              </h3>
              <p className="text-xs text-[var(--color-muted)] mt-1">
                {drillResult.correct
                  ? `+${drillResult.xpAwarded} Revision XP awarded! Next review scheduled in spaced repetition cycle.`
                  : 'Review the explanation below to reinforce your understanding.'}
              </p>
            </div>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel2)] p-4 text-left text-xs space-y-1.5">
              <span className="font-bold text-cyan-400">Conceptual Explanation:</span>
              <p className="text-[11.5px] text-[var(--color-text)] leading-relaxed">
                {drillResult.explanation}
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
