import React from 'react';
import {
  FileText, Sparkles, CheckCircle2, Award, Calendar, BookOpen, Loader2,
  ChevronDown, ChevronRight, Eye, EyeOff, Printer, Download, ArrowRight,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store';
import { Loading, EmptyState, SectionHeader } from './ui';
import type { ExamPaperRecord } from '../../../shared/types';

export function RtuExamEngine() {
  const toast = useApp(s => s.toast);

  const [subjects, setSubjects] = React.useState<Array<{ id: number; name: string; code: string }>>([]);
  const [selectedSubjectId, setSelectedSubjectId] = React.useState<number | null>(null);
  const [selectedUnits, setSelectedUnits] = React.useState<number[]>([1, 2, 3, 4, 5]);
  const [subMode, setSubMode] = React.useState<'END_SEM' | 'MT1' | 'MT2'>('END_SEM');
  const [loadingSubjects, setLoadingSubjects] = React.useState(true);
  const [generating, setGenerating] = React.useState(false);
  const [activePaper, setActivePaper] = React.useState<any | null>(null);
  const [showSolutions, setShowSolutions] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    api.syllabus.subjects('RTU')
      .then(subs => {
        if (!alive) return;
        const valid = subs.map(s => ({ id: s.id, name: s.name, code: s.code || '' }));
        setSubjects(valid);
        if (valid.length > 0) setSelectedSubjectId(valid[0].id);
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoadingSubjects(false); });

    return () => { alive = false; };
  }, []);

  const toggleUnit = (u: number) => {
    if (selectedUnits.includes(u)) {
      if (selectedUnits.length > 1) {
        setSelectedUnits(selectedUnits.filter(x => x !== u));
      }
    } else {
      setSelectedUnits([...selectedUnits, u].sort((a, b) => a - b));
    }
  };

  const handleGeneratePaper = async () => {
    if (!selectedSubjectId) return;
    setGenerating(true);
    setActivePaper(null);

    try {
      const unitsToUse = subMode === 'END_SEM' ? [1, 2, 3, 4, 5] : selectedUnits;
      const paperRecord = await api.pyq.generateRtuPaper(selectedSubjectId, subMode, unitsToUse);
      const parsedData = JSON.parse(paperRecord.questions_json);
      setActivePaper(parsedData);
      toast(`Generated ${subMode === 'END_SEM' ? 'End-Sem Predicted Paper' : subMode} successfully!`, 'success');
    } catch (e: any) {
      toast(`Paper generation failed: ${e?.message}`, 'error');
    } finally {
      setGenerating(false);
    }
  };

  if (loadingSubjects) return <Loading label="Loading RTU subjects & curriculum…" />;

  return (
    <div className="space-y-6">
      {/* RTU Sub-Mode Selector */}
      <div className="rounded-2xl border p-5" style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
              <BookOpen size={16} className="text-blue-500" />
              <span>RTU University Examination Modes</span>
            </h3>
            <p className="text-xs text-[var(--color-muted)]">
              Accurate predictions and hybrid paper generation based on past 3–5 years of university PYQs.
            </p>
          </div>
          <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400 border border-blue-500/20">
            RTU Kota Curriculum
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => {
              setSubMode('END_SEM');
              setSelectedUnits([1, 2, 3, 4, 5]);
            }}
            className={`rounded-xl border p-4 text-left transition-all ${
              subMode === 'END_SEM'
                ? 'border-blue-500 bg-blue-500/10 shadow-xs ring-1 ring-blue-500'
                : 'border-[var(--color-border)] hover:bg-[var(--color-panel2)]'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-blue-400">Mode 1</span>
              <Award size={16} className="text-blue-400" />
            </div>
            <h4 className="text-xs font-bold text-[var(--color-text)] mb-1">End-Sem Predicted Paper</h4>
            <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">
              Analyzes recurring topics and weightage across past 3–5 years. Full Part A, Part B &amp; Part C format.
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setSubMode('MT1');
              setSelectedUnits([1, 2]);
            }}
            className={`rounded-xl border p-4 text-left transition-all ${
              subMode === 'MT1'
                ? 'border-blue-500 bg-blue-500/10 shadow-xs ring-1 ring-blue-500'
                : 'border-[var(--color-border)] hover:bg-[var(--color-panel2)]'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-blue-400">Mode 2</span>
              <Calendar size={16} className="text-blue-400" />
            </div>
            <h4 className="text-xs font-bold text-[var(--color-text)] mb-1">Mid-Term 1 (MT-1)</h4>
            <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">
              Hybrid assembly: pulls uploaded RTU PYQs for selected MT-1 syllabus; AI generates authentic gap questions.
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setSubMode('MT2');
              setSelectedUnits([3, 4, 5]);
            }}
            className={`rounded-xl border p-4 text-left transition-all ${
              subMode === 'MT2'
                ? 'border-blue-500 bg-blue-500/10 shadow-xs ring-1 ring-blue-500'
                : 'border-[var(--color-border)] hover:bg-[var(--color-panel2)]'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-blue-400">Mode 3</span>
              <Calendar size={16} className="text-blue-400" />
            </div>
            <h4 className="text-xs font-bold text-[var(--color-text)] mb-1">Mid-Term 2 (MT-2)</h4>
            <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">
              Intelligent hybrid assembly tailored for your Mid-Term 2 syllabus units with full university marking schemes.
            </p>
          </button>
        </div>

        {/* Configuration Controls */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <label className="block text-xs font-semibold text-[var(--color-muted)] mb-1.5">
              Select RTU Subject:
            </label>
            <select
              className="input w-full text-xs"
              value={selectedSubjectId ?? ''}
              onChange={e => setSelectedSubjectId(Number(e.target.value))}
            >
              {subjects.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--color-muted)] mb-1.5">
              {subMode === 'END_SEM' ? 'Curriculum Scope (Full Syllabus):' : 'Select Units for Mid-Term Syllabus:'}
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {[1, 2, 3, 4, 5].map(u => {
                const isSelected = selectedUnits.includes(u);
                return (
                  <button
                    key={u}
                    type="button"
                    disabled={subMode === 'END_SEM'}
                    onClick={() => toggleUnit(u)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'border border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-panel2)]'
                    }`}
                  >
                    Unit {u}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            className="btn btn-primary btn-sm flex items-center gap-2 px-5 py-2"
            disabled={generating}
            onClick={handleGeneratePaper}
          >
            {generating ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Assembling Exam Paper with AI…
              </>
            ) : (
              <>
                <Sparkles size={14} /> Generate &amp; Launch RTU Paper
              </>
            )}
          </button>
        </div>
      </div>

      {/* Generated RTU Paper Display */}
      {activePaper && (
        <div className="rounded-2xl border p-6 space-y-6 shadow-sm" style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}>
          {/* Official RTU Paper Header */}
          <div className="text-center pb-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <div className="text-[11px] font-bold uppercase tracking-widest text-blue-400 mb-1">
              Rajasthan Technical University, Kota
            </div>
            <h2 className="text-lg font-black text-[var(--color-text)]">
              {activePaper.title}
            </h2>
            <div className="flex items-center justify-center gap-6 mt-2 text-xs font-medium text-[var(--color-muted)]">
              <span>Time Allowed: {activePaper.durationMinutes} Minutes</span>
              <span>•</span>
              <span>Maximum Marks: {activePaper.totalMarks}</span>
            </div>

            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                type="button"
                className="btn btn-sm btn-ghost text-xs flex items-center gap-1.5"
                onClick={() => setShowSolutions(!showSolutions)}
              >
                {showSolutions ? <EyeOff size={13} /> : <Eye size={13} />}
                <span>{showSolutions ? 'Hide Model Solutions' : 'Reveal Model Solutions'}</span>
              </button>
            </div>
          </div>

          {/* Sections: Part A, Part B, Part C */}
          {Array.isArray(activePaper.sections) && activePaper.sections.map((section: any, sIdx: number) => (
            <div key={sIdx} className="space-y-4">
              <div className="flex items-center justify-between rounded-lg px-3 py-2 bg-[var(--color-panel2)] border border-[var(--color-border)]">
                <div>
                  <span className="text-xs font-bold text-blue-400 mr-2">{section.name}</span>
                  <span className="text-xs text-[var(--color-text)] font-semibold">{section.description}</span>
                </div>
              </div>

              <div className="space-y-3">
                {Array.isArray(section.questions) && section.questions.map((q: any, qIdx: number) => (
                  <div
                    key={qIdx}
                    className="rounded-xl border p-4 transition-all"
                    style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 flex-1">
                        <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-bold text-blue-400 shrink-0">
                          Q{q.number || qIdx + 1}
                        </span>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-[var(--color-text)] leading-relaxed whitespace-pre-wrap">
                            {q.text}
                          </p>
                          {q.unit && (
                            <span className="inline-block text-[10px] text-[var(--color-faint)]">
                              (From Unit {q.unit})
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="rounded bg-[var(--color-panel2)] px-2 py-0.5 text-xs font-semibold text-[var(--color-muted)] shrink-0">
                        {q.marks} Marks
                      </span>
                    </div>

                    {showSolutions && q.solution && (
                      <div className="mt-3 pt-3 border-t border-[var(--color-border)] text-xs text-emerald-400 bg-emerald-500/5 p-3 rounded-lg">
                        <div className="font-semibold text-[11px] mb-1 text-emerald-300">Model Solution / Derivation:</div>
                        <p className="text-[11.5px] leading-relaxed whitespace-pre-wrap text-[var(--color-text)]">
                          {q.solution}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
