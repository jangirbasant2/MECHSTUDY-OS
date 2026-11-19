import React from 'react';
import {
  CheckCircle2, XCircle, Award, Loader2, Sparkles, BookOpen, AlertCircle, ArrowRight,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store';
import { Modal } from './ui';
import type { TopicQuizQuestion, TopicQuizResult } from '../../../shared/types';

interface MasteryModalProps {
  topicId: number;
  topicTitle: string;
  subjectName: string;
  examTrack: 'RTU' | 'GATE';
  onClose: () => void;
  onSuccess: () => void;
}

export function MasteryModal({
  topicId,
  topicTitle,
  subjectName,
  examTrack,
  onClose,
  onSuccess,
}: MasteryModalProps) {
  const toast = useApp(s => s.toast);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [quiz, setQuiz] = React.useState<TopicQuizQuestion | null>(null);
  const [selectedOption, setSelectedOption] = React.useState<string>('');
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<TopicQuizResult | null>(null);

  // Generate question from Google AI Studio on mount
  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    api.quiz.generateMastery({ topicTitle, subjectName, examTrack })
      .then((data) => {
        if (!alive) return;
        setQuiz({
          topicId,
          examTrack,
          questionText: data.questionText,
          options: data.options,
          correctAnswer: data.correctAnswer,
          explanation: data.explanation,
        });
      })
      .catch((err: any) => {
        if (!alive) return;
        setError(err?.message || 'Failed to generate topic mastery quiz.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false; };
  }, [topicId, topicTitle, subjectName, examTrack]);

  const handleSubmit = async () => {
    if (!quiz || !selectedOption) return;
    setSubmitting(true);

    try {
      const res = await api.gamification.verifyMastery({
        topicId,
        examTrack,
        questionText: quiz.questionText,
        options: quiz.options,
        correctAnswer: quiz.correctAnswer,
        userAnswer: selectedOption,
        explanation: quiz.explanation,
      });

      setResult(res);

      if (res.correct) {
        toast(`Mastery Verified! +${res.xpAwarded} XP awarded.`, 'success');
        if (res.unlockedTrophies && res.unlockedTrophies.length > 0) {
          for (const t of res.unlockedTrophies) {
            toast(`🏆 Achievement Unlocked: ${t.title}!`, 'success');
          }
        }
        onSuccess();
      } else {
        toast('Mastery check failed. Review the explanation and try again.', 'error');
      }
    } catch (e: any) {
      toast(`Verification error: ${e?.message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={true}
      title="Topic Mastery Gate 🛡️"
      onClose={onClose}
      width={640}
    >
      <p className="text-xs text-[var(--color-muted)] mb-3">
        Demonstrate conceptual understanding to mark &ldquo;{topicTitle}&rdquo; as Completed.
      </p>
      <div className="space-y-4 py-2">
        {loading && (
          <div className="flex flex-col items-center justify-center py-10 space-y-3">
            <Loader2 size={28} className="animate-spin text-cyan-400" />
            <p className="text-xs text-[var(--color-muted)] font-medium">
              Generating rigorous conceptual question via Gemini AI…
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
            <div className="flex items-center gap-2 font-semibold mb-1">
              <AlertCircle size={15} /> Could not load quiz
            </div>
            <p className="text-[11px] leading-relaxed">{error}</p>
            <p className="mt-2 text-[10px] text-[var(--color-faint)]">
              Ensure your Google AI Studio API key is configured in the top header.
            </p>
          </div>
        )}

        {quiz && !result && (
          <div className="space-y-4">
            <div className="rounded-xl border p-4" style={{ background: 'var(--color-panel2)', borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-400 mb-2">
                <Sparkles size={13} />
                <span>Concept Verification Question</span>
              </div>
              <p className="text-xs font-medium text-[var(--color-text)] leading-relaxed whitespace-pre-wrap">
                {quiz.questionText}
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-semibold text-[var(--color-muted)]">
                Select your answer:
              </label>
              {quiz.options.map((opt, idx) => {
                const isSelected = selectedOption === opt;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedOption(opt)}
                    className={`w-full flex items-start gap-3 rounded-xl border p-3 text-left text-xs transition-all ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-500/10 text-[var(--color-text)] font-medium shadow-xs'
                        : 'border-[var(--color-border)] hover:bg-[var(--color-panel2)] text-[var(--color-muted)]'
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                        isSelected
                          ? 'border-cyan-500 bg-cyan-500 text-white'
                          : 'border-[var(--color-border)] text-[var(--color-muted)]'
                      }`}
                    >
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="flex-1 leading-snug">{opt}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm flex items-center gap-1.5"
                disabled={!selectedOption || submitting}
                onClick={handleSubmit}
              >
                {submitting ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Verifying…
                  </>
                ) : (
                  <>
                    Verify Answer &amp; Complete <ArrowRight size={13} />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-4 py-2">
            <div
              className={`rounded-2xl border p-5 text-center ${
                result.correct
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
              }`}
            >
              <div className="flex justify-center mb-2">
                {result.correct ? (
                  <CheckCircle2 size={42} className="text-emerald-400" />
                ) : (
                  <XCircle size={42} className="text-amber-400" />
                )}
              </div>
              <h3 className="text-base font-bold">
                {result.correct ? 'Mastery Verified! Topic Completed' : 'Incorrect Answer'}
              </h3>
              <p className="text-xs text-[var(--color-muted)] mt-1">
                {result.correct
                  ? `Topic marked completed. You earned +${result.xpAwarded} ${examTrack} XP!`
                  : 'The topic remains incomplete. Review your notes and understanding before retrying.'}
              </p>
            </div>

            {/* Explanation */}
            <div className="rounded-xl border p-4 space-y-2" style={{ background: 'var(--color-panel2)', borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text)]">
                <BookOpen size={14} className="text-cyan-400" />
                <span>Concept &amp; Derivation Explanation</span>
              </div>
              <p className="text-xs text-[var(--color-muted)] leading-relaxed whitespace-pre-wrap">
                {result.explanation}
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
                {result.correct ? 'Done' : 'Back to Topic'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
