import React, { useState, useEffect, useCallback } from 'react';
import {
  Layers, RotateCw, Check, AlertCircle, Sparkles, Plus, Award,
  BookOpen, Brain, RefreshCw, ChevronLeft, ChevronRight, CheckCircle2,
  Bookmark, ShieldAlert, Zap, Filter
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store';
import type { FlashcardItem, FlashcardSourceType } from '../../../shared/types';
import katex from 'katex';
import 'katex/dist/katex.min.css';

function renderMathText(text: string) {
  if (!text) return null;
  // Splits by $$...$$ or $...$
  const parts = text.split(/(\$\$[\s\S]+?\$\$|\$[^\$]+?\$)/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith('$$') && part.endsWith('$$')) {
          const math = part.slice(2, -2);
          try {
            const html = katex.renderToString(math, { displayMode: true, throwOnError: false });
            return <div key={i} className="my-2" dangerouslySetInnerHTML={{ __html: html }} />;
          } catch {
            return <div key={i} className="font-mono">{math}</div>;
          }
        }
        if (part.startsWith('$') && part.endsWith('$')) {
          const math = part.slice(1, -1);
          try {
            const html = katex.renderToString(math, { displayMode: false, throwOnError: false });
            return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
          } catch {
            return <span key={i} className="font-mono">{math}</span>;
          }
        }
        return <span key={i} className="whitespace-pre-wrap">{part}</span>;
      })}
    </span>
  );
}

export function FlashcardDeck() {
  const toast = useApp(s => s.toast);

  const [cards, setCards] = useState<FlashcardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<FlashcardSourceType | 'ALL'>('ALL');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewedInSession, setReviewedInSession] = useState(0);
  const [sessionXpEarned, setSessionXpEarned] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // Modal for new custom flashcard
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');
  const [newSubject, setNewSubject] = useState('Engineering Thermodynamics');

  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.flashcards.list({
        sourceType: filterType === 'ALL' ? undefined : filterType,
      });
      setCards(data);
      setCurrentIndex(0);
      setIsFlipped(false);
    } catch (e: any) {
      toast(`Failed to load flashcards: ${e?.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [filterType, toast]);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const handleRate = async (rating: 'again' | 'hard' | 'good' | 'easy') => {
    if (!cards[currentIndex]) return;
    const currentCard = cards[currentIndex];

    try {
      await api.flashcards.review(currentCard.id, rating);
      const newReviewed = reviewedInSession + 1;
      setReviewedInSession(newReviewed);

      // Award +10 XP for every 10 cards reviewed
      if (newReviewed % 10 === 0) {
        const res = await api.flashcards.completeSession(newReviewed);
        if (res.xpAwarded > 0) {
          setSessionXpEarned(prev => prev + res.xpAwarded);
          toast(`Milestone Reached! +10 XP awarded for active recall practice!`, 'success');
        }
      }

      setIsFlipped(false);
      if (currentIndex < cards.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        toast('Completed full deck review!', 'success');
        void loadCards();
      }
    } catch (e: any) {
      toast(`Failed to record review: ${e?.message}`, 'error');
    }
  };

  const handleSyncDecks = async () => {
    setSyncing(true);
    try {
      const [fromMistakes, fromWeak] = await Promise.all([
        api.flashcards.syncMistakes(),
        api.flashcards.syncWeakTopics(),
      ]);
      toast(`Auto-Deck Synced: ${fromMistakes} mistake cards, ${fromWeak} mastery gap cards added!`, 'success');
      await loadCards();
    } catch (e: any) {
      toast(`Sync failed: ${e?.message}`, 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleCreateCustom = async () => {
    if (!newTitle.trim() || !newFront.trim() || !newBack.trim()) {
      toast('Please fill in title, front prompt, and back answer.', 'info');
      return;
    }

    try {
      await api.flashcards.create({
        source_type: 'CUSTOM',
        title: newTitle.trim(),
        front: newFront.trim(),
        back: newBack.trim(),
        subject_name: newSubject,
      });
      toast('Created new custom flashcard!', 'success');
      setCreateModalOpen(false);
      setNewTitle('');
      setNewFront('');
      setNewBack('');
      await loadCards();
    } catch (e: any) {
      toast(`Error creating flashcard: ${e?.message}`, 'error');
    }
  };

  const currentCard = cards[currentIndex];

  return (
    <div className="space-y-5">
      {/* Deck Controls Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border p-4 bg-[var(--color-panel)] border-[var(--color-border)]">
        <div>
          <h3 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
            <Layers size={16} className="text-blue-400" />
            <span>Active Recall Flashcards Deck</span>
          </h3>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Auto-compiled from Reader notes, GATE Mistake Notebook, and weak mastery quiz concepts.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled={syncing}
            onClick={handleSyncDecks}
            className="btn btn-sm btn-secondary text-xs flex items-center gap-1.5"
            title="Scan mistake notebook & quizzes for new flashcards"
          >
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
            <span>Auto-Sync Deck</span>
          </button>

          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="btn btn-sm btn-primary text-xs flex items-center gap-1.5"
          >
            <Plus size={13} />
            <span>New Card</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {[
          { id: 'ALL', label: 'All Cards', icon: Layers },
          { id: 'GATE_MISTAKE', label: 'GATE Mistakes Deck', icon: ShieldAlert },
          { id: 'WEAK_TOPIC', label: 'Mastery Gap Concepts', icon: Zap },
          { id: 'NOTE', label: 'PDF Reader Notes', icon: BookOpen },
          { id: 'CUSTOM', label: 'Custom Formula Cards', icon: Bookmark },
        ].map(tab => {
          const active = filterType === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id as any)}
              className={`rounded-lg px-3 py-1.5 font-medium transition-all flex items-center gap-1.5 ${
                active
                  ? 'bg-blue-600 text-white font-semibold shadow-xs'
                  : 'bg-[var(--color-panel)] text-[var(--color-muted)] hover:bg-[var(--color-panel2)] hover:text-[var(--color-text)] border border-[var(--color-border)]'
              }`}
            >
              <Icon size={12} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Session Progress Bar & Stats */}
      <div className="flex items-center justify-between text-xs text-[var(--color-muted)] px-1">
        <span>
          Card {cards.length > 0 ? currentIndex + 1 : 0} of {cards.length}
        </span>
        <div className="flex items-center gap-3">
          <span>Reviewed Today: <strong className="text-white">{reviewedInSession}</strong> cards</span>
          {sessionXpEarned > 0 && (
            <span className="flex items-center gap-1 text-amber-400 font-bold">
              <Sparkles size={12} /> +{sessionXpEarned} XP Earned
            </span>
          )}
        </div>
      </div>

      {/* 3D Flashcard Display Area */}
      {loading ? (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-12 text-center text-xs text-[var(--color-muted)]">
          <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-blue-400" />
          Loading active recall deck…
        </div>
      ) : !currentCard ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-panel)] p-12 text-center space-y-3">
          <Brain size={32} className="mx-auto text-blue-400 opacity-60" />
          <h4 className="text-sm font-bold text-white">No Flashcards In This Deck</h4>
          <p className="text-xs text-[var(--color-muted)] max-w-md mx-auto">
            Click <strong>"Auto-Sync Deck"</strong> to automatically generate flashcards from your GATE Mistake Notebook and Mastery Quiz gaps, or create one manually.
          </p>
          <button type="button" onClick={handleSyncDecks} className="btn btn-sm btn-primary">
            <RefreshCw size={12} /> Auto-Sync Mistakes &amp; Gaps
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Card Container with 3D Flip */}
          <div
            onClick={handleFlip}
            className="group cursor-pointer select-none rounded-3xl border border-[var(--color-border)] p-8 sm:p-12 min-h-[320px] sm:min-h-[360px] flex flex-col justify-between transition-all duration-300 shadow-md hover:shadow-xl relative overflow-hidden"
            style={{
              background: isFlipped
                ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)'
                : 'linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%)',
            }}
          >
            {/* Card Badge Top */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-blue-500/20 px-2 py-0.5 text-[10.5px] font-bold text-blue-400">
                  {currentCard.source_type.replace('_', ' ')}
                </span>
                {currentCard.subject_name && (
                  <span className="text-[11px] text-[var(--color-muted)]">
                    {currentCard.subject_name}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-[var(--color-faint)]">
                Click anywhere or press Space to {isFlipped ? 'flip back' : 'reveal solution'}
              </span>
            </div>

            {/* Card Content (Front Prompt or Back KaTeX Solution) */}
            <div className="my-auto py-4 text-center">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted)] mb-2">
                {isFlipped ? 'Answer & Derivation (Back)' : 'Question / Prompt (Front)'}
              </div>
              <div className="text-base sm:text-lg font-semibold text-white leading-relaxed max-w-2xl mx-auto">
                {renderMathText(isFlipped ? currentCard.back : currentCard.front)}
              </div>
            </div>

            {/* Card Flip Hint Bottom */}
            <div className="flex items-center justify-between text-xs pt-3 border-t border-[var(--color-border)] text-[var(--color-muted)]">
              <span className="text-[11px] truncate max-w-[280px]">{currentCard.title}</span>
              <span className="text-[11px] font-medium text-blue-400 flex items-center gap-1">
                <RotateCw size={12} /> Flip Card
              </span>
            </div>
          </div>

          {/* Confidence Rating Buttons (SuperMemo SM-2 Interval Spacing) */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-xs font-medium text-[var(--color-muted)]">
              How well did you recall this concept?
            </span>

            <div className="grid grid-cols-4 gap-2 w-full sm:w-auto">
              {/* Again (Fail - 1 day) */}
              <button
                type="button"
                onClick={() => handleRate('again')}
                className="rounded-xl px-3 py-2 text-xs font-bold transition-all bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 flex flex-col items-center"
              >
                <span>Again</span>
                <span className="text-[9px] font-normal opacity-75 mt-0.5">1 Day</span>
              </button>

              {/* Hard (2 days) */}
              <button
                type="button"
                onClick={() => handleRate('hard')}
                className="rounded-xl px-3 py-2 text-xs font-bold transition-all bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 flex flex-col items-center"
              >
                <span>Hard</span>
                <span className="text-[9px] font-normal opacity-75 mt-0.5">2 Days</span>
              </button>

              {/* Good (4-6 days) */}
              <button
                type="button"
                onClick={() => handleRate('good')}
                className="rounded-xl px-3 py-2 text-xs font-bold transition-all bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 flex flex-col items-center"
              >
                <span>Good</span>
                <span className="text-[9px] font-normal opacity-75 mt-0.5">5 Days</span>
              </button>

              {/* Easy (7+ days) */}
              <button
                type="button"
                onClick={() => handleRate('easy')}
                className="rounded-xl px-3 py-2 text-xs font-bold transition-all bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 flex flex-col items-center"
              >
                <span>Easy</span>
                <span className="text-[9px] font-normal opacity-75 mt-0.5">8+ Days</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Custom Flashcard Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Plus size={16} className="text-blue-400" />
              <span>Create Custom Flashcard</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--color-muted)] mb-1">
                  Card Title:
                </label>
                <input
                  type="text"
                  placeholder="e.g., Carnot Efficiency with Unit Conversions"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5 text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--color-muted)] mb-1">
                  Subject:
                </label>
                <input
                  type="text"
                  value={newSubject}
                  onChange={e => setNewSubject(e.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5 text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--color-muted)] mb-1">
                  Front Prompt (Supports $...$ for KaTeX):
                </label>
                <textarea
                  rows={3}
                  placeholder="Enter the question, concept, or formula prompt..."
                  value={newFront}
                  onChange={e => setNewFront(e.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5 text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--color-muted)] mb-1">
                  Back Answer &amp; Derivation (Supports $...$ for KaTeX):
                </label>
                <textarea
                  rows={4}
                  placeholder="Enter the correct derivation, units, or formula solution..."
                  value={newBack}
                  onChange={e => setNewBack(e.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5 text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="btn btn-ghost btn-sm text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateCustom}
                className="btn btn-primary btn-sm text-xs"
              >
                Save Flashcard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
