import React from 'react';
import {
  Sigma, Search, Copy, Check, Sparkles, BookOpen, ExternalLink,
  Filter, Award, Lightbulb, Info, ArrowRight,
} from 'lucide-react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useApp } from '../store';
import {
  FORMULA_SUBJECTS,
  IIT_FORMULA_SUBJECTS,
  MECHANICAL_FORMULAS,
  IIT_FORMULAS,
  type FormulaItem,
} from '../data/formulasData';
import { EmptyState } from '../components/ui';

function KaTeXFormula({ latex, displayMode = true }: { latex: string; displayMode?: boolean }) {
  const html = React.useMemo(() => {
    try {
      return katex.renderToString(latex, {
        displayMode,
        throwOnError: false,
      });
    } catch {
      return latex;
    }
  }, [latex, displayMode]);

  return (
    <div
      className="overflow-x-auto py-2 text-center text-[15px] sm:text-[17px] font-medium"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function FormulasPage() {
  const toast = useApp(s => s.toast);
  const setPage = useApp(s => s.setPage);
  const activeExamMode = useApp(s => s.activeExamMode);

  const activeSubjects = activeExamMode === 'IIT' ? IIT_FORMULA_SUBJECTS : FORMULA_SUBJECTS;
  const activeDataset = activeExamMode === 'IIT' ? IIT_FORMULAS : MECHANICAL_FORMULAS;

  const [selectedSubject, setSelectedSubject] = React.useState<string>('All Subjects');
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  // Reset selected subject filter when switching between GATE and IIT modes
  React.useEffect(() => {
    setSelectedSubject('All Subjects');
  }, [activeExamMode]);

  const filteredFormulas = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeDataset.filter(item => {
      const matchSub = selectedSubject === 'All Subjects' || item.subject === selectedSubject;
      if (!matchSub) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.topic.toLowerCase().includes(q) ||
        item.latex.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.variables.some(v => v.name.toLowerCase().includes(q) || v.symbol.toLowerCase().includes(q))
      );
    });
  }, [activeDataset, selectedSubject, searchQuery]);

  const handleCopyLatex = async (formula: FormulaItem) => {
    try {
      await navigator.clipboard.writeText(formula.latex);
      setCopiedId(formula.id);
      toast('Copied LaTeX formula to clipboard', 'success');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast('Failed to copy to clipboard', 'error');
    }
  };

  const getRelevanceBadge = (rel: FormulaItem['gateRelevance']) => {
    switch (rel) {
      case 'Crucial':
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-rose-500 bg-rose-500/10 border border-rose-500/20">
            ★ Crucial (High Yield)
          </span>
        );
      case 'Very High':
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-amber-500 bg-amber-500/10 border border-amber-500/20">
            ● Very High GATE
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-sky-500 bg-sky-500/10 border border-sky-500/20">
            High Frequency
          </span>
        );
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4 sm:p-6" style={{ background: 'var(--color-bg)' }}>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)', color: 'var(--color-accent)' }}
            >
              <Sigma size={20} />
            </div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>
              {activeExamMode === 'IIT' ? 'IIT JEE Advanced Formula Vault' : 'GATE Mechanical Formula Vault'}
            </h1>
          </div>
          <p className="mt-1 text-xs" style={{ color: 'var(--color-muted)' }}>
            {activeExamMode === 'IIT'
              ? 'Curated mathematical and physical formulas for IIT JEE Advanced (Physics, Chemistry, Mathematics) with instant KaTeX math rendering'
              : 'Curated mathematical cheat-sheets for RTU Kota & GATE Mechanical with instant KaTeX math rendering'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="btn btn-sm btn-accent gap-1.5"
            onClick={() => setPage('practice')}
            title="Go to Practice questions"
          >
            <Award size={14} />
            <span>Practice Questions</span>
          </button>
          <button
            className="btn btn-sm gap-1.5"
            onClick={() => setPage('exam')}
            title="Go to Timed Exam Mode"
          >
            <Sparkles size={14} />
            <span>Mock Test</span>
          </button>
        </div>
      </div>

      {/* Subject Filter Tabs */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {activeSubjects.map(subj => {
          const active = selectedSubject === subj;
          return (
            <button
              key={subj}
              onClick={() => setSelectedSubject(subj)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                active
                  ? 'bg-[var(--color-accent)] text-white shadow-xs font-semibold'
                  : 'bg-[var(--color-panel)] hover:bg-[var(--color-panel2)] text-[var(--color-muted)] hover:text-[var(--color-text)]'
              }`}
              style={{ border: '1px solid var(--color-border)' }}
            >
              {subj}
            </button>
          );
        })}
      </div>

      {/* Search Input Bar */}
      <div className="relative mb-6">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--color-faint)' }}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search formulas by name, topic, symbol (e.g. stress, Carnot, Euler, Laplace, Bernoulli)..."
          className="input w-full pl-9 pr-4 py-2 text-xs rounded-lg"
          style={{
            background: 'var(--color-panel)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text)',
          }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs px-1 text-[var(--color-faint)] hover:text-[var(--color-text)]"
          >
            Clear
          </button>
        )}
      </div>

      {/* Results Count Banner */}
      <div className="mb-4 flex items-center justify-between text-xs" style={{ color: 'var(--color-faint)' }}>
        <span>
          Showing {filteredFormulas.length} formula{filteredFormulas.length === 1 ? '' : 's'} in {selectedSubject}
        </span>
      </div>

      {/* Formulas Grid */}
      {filteredFormulas.length === 0 ? (
        <EmptyState
          icon={<Sigma size={24} />}
          title="No formulas found"
          description={`No formulas matched your search "${searchQuery}". Try searching for another topic, keyword, or select All Subjects.`}
          action={
            <button className="btn btn-sm btn-primary" onClick={() => { setSearchQuery(''); setSelectedSubject('All Subjects'); }}>
              Reset Filters
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-12">
          {filteredFormulas.map(formula => {
            const isCopied = copiedId === formula.id;
            return (
              <div
                key={formula.id}
                className="card flex flex-col justify-between p-4 transition-shadow hover:shadow-md"
                style={{
                  background: 'var(--color-panel)',
                  borderColor: 'var(--color-border)',
                }}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-[var(--color-panel2)] text-[var(--color-muted)]">
                          {formula.subject}
                        </span>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-[var(--color-panel2)] text-[var(--color-accent)]">
                          {formula.topic}
                        </span>
                        {getRelevanceBadge(formula.gateRelevance)}
                      </div>
                      <h2 className="text-sm font-semibold leading-tight" style={{ color: 'var(--color-text)' }}>
                        {formula.title}
                      </h2>
                    </div>

                    <button
                      className="btn btn-ghost btn-icon btn-sm shrink-0"
                      onClick={() => handleCopyLatex(formula)}
                      title="Copy LaTeX expression"
                      aria-label="Copy LaTeX"
                    >
                      {isCopied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    </button>
                  </div>

                  {/* Math Display Box */}
                  <div
                    className="my-3 rounded-lg p-3 border shadow-xs"
                    style={{
                      background: 'var(--color-bg)',
                      borderColor: 'var(--color-border2)',
                      color: 'var(--color-text)',
                    }}
                  >
                    <KaTeXFormula latex={formula.latex} displayMode={true} />
                  </div>

                  {/* Physical Meaning / Description */}
                  <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--color-muted)' }}>
                    {formula.description}
                  </p>

                  {/* Variables Breakdown */}
                  {formula.variables.length > 0 && (
                    <div className="mb-3 rounded-md p-2 text-[11px]" style={{ background: 'var(--color-panel2)' }}>
                      <span className="font-semibold block mb-1 text-[var(--color-faint)]">Parameters:</span>
                      <ul className="space-y-0.5">
                        {formula.variables.map(v => (
                          <li key={v.symbol} className="flex items-baseline gap-1.5">
                            <code className="px-1 py-0.2 rounded font-mono text-[10px] bg-[var(--color-panel)] text-[var(--color-accent)] font-semibold shrink-0">
                              {v.symbol}
                            </code>
                            <span style={{ color: 'var(--color-text)' }}>: {v.name}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Conditions / Assumptions */}
                  {formula.conditions && (
                    <div className="flex items-start gap-1.5 text-[11px] mb-3 text-[var(--color-faint)]">
                      <Info size={12} className="shrink-0 mt-0.5 text-[var(--color-accent)]" />
                      <span>{formula.conditions}</span>
                    </div>
                  )}
                </div>

                {/* Footer Action */}
                <div className="pt-2 border-t flex items-center justify-between text-xs" style={{ borderColor: 'var(--color-border)' }}>
                  <button
                    className="btn btn-ghost btn-sm gap-1 text-[11px] text-[var(--color-accent)]"
                    onClick={() => setPage('practice')}
                  >
                    <span>Practice Questions</span>
                    <ArrowRight size={12} />
                  </button>
                  <span className="text-[10px] font-mono text-[var(--color-faint)]">
                    LaTeX: ${formula.latex.slice(0, 24)}...$
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
