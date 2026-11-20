import React, { useState, useEffect } from 'react';
import {
  FileText, Sparkles, CheckCircle2, Award, Calendar, BookOpen, Loader2,
  ChevronDown, ChevronRight, Eye, EyeOff, Printer, Download, ArrowRight,
  GraduationCap, AlertCircle, Check, Image as ImageIcon, Clock, Timer,
  UploadCloud, Play, Pause, AlertTriangle, BookMarked
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store';
import { Loading, EmptyState, SectionHeader, Modal } from './ui';
import type { ExamPaperRecord, RtuEvaluationResult } from '../../../shared/types';

function formatExamTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function RtuExamEngine() {
  const toast = useApp(s => s.toast);
  const setPage = useApp(s => s.setPage);

  const [subjects, setSubjects] = useState<Array<{ id: number; name: string; code: string }>>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [selectedUnits, setSelectedUnits] = useState<number[]>([1, 2, 3, 4, 5]);
  const [subMode, setSubMode] = useState<'END_SEM' | 'MT1' | 'MT2'>('END_SEM');
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activePaperRecord, setActivePaperRecord] = useState<ExamPaperRecord | null>(null);
  const [activePaper, setActivePaper] = useState<any | null>(null);
  const [showSolutions, setShowSolutions] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Timer State
  const [timerActive, setTimerActive] = useState(false);
  const [timerPaused, setTimerPaused] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(10800); // 3h default
  const [totalDurationSeconds, setTotalDurationSeconds] = useState(10800);

  // Evaluation Modal & PDF Upload State
  const [evalModalOpen, setEvalModalOpen] = useState(false);
  const [studentAnswers, setStudentAnswers] = useState<Record<string, string>>({});
  const [answerPdfPath, setAnswerPdfPath] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<RtuEvaluationResult | null>(null);

  useEffect(() => {
    if (!timerActive || timerPaused) return;
    const interval = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setTimerActive(false);
          setEvalModalOpen(true);
          toast('Time is up! Upload your answer sheet PDF for evaluation.', 'info');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timerActive, timerPaused, toast]);

  useEffect(() => {
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
    setActivePaperRecord(null);
    setEvaluationResult(null);

    try {
      const unitsToUse = subMode === 'END_SEM' ? [1, 2, 3, 4, 5] : selectedUnits;
      const paperRecord = await api.pyq.generateRtuPaper(selectedSubjectId, subMode, unitsToUse);
      setActivePaperRecord(paperRecord);
      const parsedData = JSON.parse(paperRecord.questions_json);
      setActivePaper(parsedData);
      const dur = subMode === 'END_SEM' ? 180 * 60 : 60 * 60;
      setSecondsRemaining(dur);
      setTotalDurationSeconds(dur);
      setTimerActive(false);
      setTimerPaused(false);
      toast(`Generated ${subMode === 'END_SEM' ? 'End-Sem Predicted Paper (3 Hours)' : `${subMode} (1 Hour)`} successfully!`, 'success');
    } catch (e: any) {
      toast(`Paper generation failed: ${e?.message}`, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleExportPdf = async () => {
    if (!activePaperRecord) return;
    setExportingPdf(true);
    try {
      const cleanTitle = (activePaper?.title || 'RTU_Paper').replace(/[^a-zA-Z0-9_-]/g, '_');
      const chosenPath = await api.pyq.pickSavePath(`${cleanTitle}.pdf`);
      if (!chosenPath) return;

      await api.pyq.exportRtuPaper(activePaperRecord.id, chosenPath);
      toast(`Exported question paper to ${chosenPath}!`, 'success');
    } catch (e: any) {
      toast(`Failed to export PDF: ${e?.message}`, 'error');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleStartEvaluation = async () => {
    if (!activePaperRecord) return;
    setEvaluating(true);
    try {
      const formattedAnswers = Object.entries(studentAnswers).map(([qNum, text]) => ({
        questionNumber: qNum,
        answerText: text,
      }));

      const res = await api.pyq.evaluateRtuAnswers(activePaperRecord.id, formattedAnswers, answerPdfPath || undefined);
      setEvaluationResult(res);
      toast(`Evaluation complete: Score ${res.totalScore}/${res.maxScore} (Grade ${res.overallGrade})`, 'success');
    } catch (e: any) {
      toast(`Evaluation error: ${e?.message}`, 'error');
    } finally {
      setEvaluating(false);
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
              <span className="text-xs font-bold text-[var(--color-text)]">End-Sem Predicted Paper</span>
              <Award size={16} className="text-blue-400" />
            </div>
            <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">
              Full 100 Marks (3 Hours / 180 Min). Analyzes recurring past 3-5 years PYQ questions and high-probability derivations across all 5 units.
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
              <span className="text-xs font-bold text-[var(--color-text)]">Mid-Term 1 (MT-1)</span>
              <Calendar size={16} className="text-blue-400" />
            </div>
            <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">
              30 Marks (1 Hour / 60 Min). Units 1 &amp; 2 exam with exact match questions and derivations.
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
              <span className="text-xs font-bold text-[var(--color-text)]">Mid-Term 2 (MT-2)</span>
              <Calendar size={16} className="text-blue-400" />
            </div>
            <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">
              30 Marks (1 Hour / 60 Min). Units 3, 4 &amp; 5 exam with analytical numericals and internal choices.
            </p>
          </button>
        </div>

        {/* Controls: Subject & Units */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <label className="block text-xs font-semibold text-[var(--color-muted)] mb-1.5">
              Select RTU Subject:
            </label>
            <select
              value={selectedSubjectId || ''}
              onChange={e => setSelectedSubjectId(Number(e.target.value))}
              className="w-full rounded-xl border px-3 py-2 text-xs font-medium"
              style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              {subjects.map(s => (
                <option key={s.id} value={s.id}>
                  {s.code ? `[${s.code}] ` : ''}{s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--color-muted)] mb-1.5">
              Included Units:
            </label>
            <div className="flex items-center gap-1.5">
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
          {/* Live RTU Exam Countdown Timer & Status Bar */}
          <div className="rounded-xl border p-4 flex flex-col md:flex-row items-center justify-between gap-4 bg-[var(--color-panel2)]" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl flex items-center justify-center ${timerActive && !timerPaused ? 'bg-blue-500/20 text-blue-400 animate-pulse' : 'bg-zinc-800 text-zinc-400'}`}>
                <Clock size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-mono font-black tracking-tight text-[var(--color-text)]">
                    {formatExamTime(secondsRemaining)}
                  </span>
                  <span className="text-xs text-[var(--color-muted)]">
                    / {formatExamTime(totalDurationSeconds)}
                  </span>
                  {secondsRemaining <= 300 && timerActive && (
                    <span className="rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-300 px-2 py-0.5 text-[10.5px] font-bold flex items-center gap-1">
                      <AlertTriangle size={12} /> &lt;5m remaining!
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[var(--color-muted)]">
                  {subMode === 'END_SEM' ? 'Official End-Sem Timed Session (3 Hours)' : `${subMode} Timed Session (1 Hour)`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!timerActive ? (
                <button
                  type="button"
                  className="btn btn-sm bg-emerald-600 hover:bg-emerald-500 text-white text-xs flex items-center gap-1.5 px-3 py-1.5"
                  onClick={() => {
                    setTimerActive(true);
                    setTimerPaused(false);
                    toast('Exam timer started! Good luck.', 'info');
                  }}
                >
                  <Play size={13} />
                  <span>Start Timed Exam</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm btn-secondary text-xs flex items-center gap-1.5 px-3 py-1.5"
                  onClick={() => setTimerPaused(!timerPaused)}
                >
                  {timerPaused ? <Play size={13} /> : <Pause size={13} />}
                  <span>{timerPaused ? 'Resume Timer' : 'Pause'}</span>
                </button>
              )}

              <button
                type="button"
                className="btn btn-sm btn-ghost text-xs text-[var(--color-muted)] hover:text-white"
                onClick={() => {
                  setTimerActive(false);
                  setTimerPaused(false);
                  const dur = subMode === 'END_SEM' ? 180 * 60 : 60 * 60;
                  setSecondsRemaining(dur);
                }}
              >
                Reset
              </button>

              <button
                type="button"
                className="btn btn-sm bg-blue-600 hover:bg-blue-500 text-white text-xs flex items-center gap-1.5 px-4 py-1.5 ml-2 shadow-xs"
                onClick={() => setEvalModalOpen(true)}
              >
                <UploadCloud size={14} />
                <span>Finish &amp; Upload Answer PDF</span>
              </button>
            </div>
          </div>

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

            {/* Action Bar */}
            <div className="flex items-center justify-between gap-2 mt-4 pt-4 border-t border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-secondary text-xs flex items-center gap-1.5"
                  disabled={exportingPdf}
                  onClick={handleExportPdf}
                >
                  {exportingPdf ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
                  <span>Export Clean Question Paper PDF</span>
                </button>

                <button
                  type="button"
                  className="btn btn-sm bg-blue-600 hover:bg-blue-500 text-white text-xs flex items-center gap-1.5"
                  onClick={() => setEvalModalOpen(true)}
                >
                  <GraduationCap size={14} />
                  <span>Evaluate My Answers (RTU Rubric)</span>
                </button>
              </div>

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

      {/* Answer Evaluation Modal */}
      {evalModalOpen && (
        <Modal
          open={true}
          title="RTU Step-Marking Answer Evaluator 🎓"
          onClose={() => setEvalModalOpen(false)}
          width={760}
        >
          <div className="space-y-4 py-2">
            {!evaluationResult ? (
              <>
                <p className="text-xs text-[var(--color-muted)]">
                  Enter your derivations, formulas, and intermediate calculation steps, or upload your handwritten/scanned answer sheet PDF. Gemini AI will grade your submission strictly following official RTU university step-marking rubrics (Formulas: 25%, Steps: 40%, Diagram: 20%, Final Unit: 15%).
                </p>

                {/* Upload Answer PDF */}
                <div className="rounded-xl border border-dashed border-blue-500/40 p-4 bg-blue-500/5">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 shrink-0">
                        <UploadCloud size={20} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[var(--color-text)]">
                          Upload Scanned Answer Sheet PDF (Optional / Recommended)
                        </div>
                        <p className="text-[11px] text-[var(--color-muted)] truncate max-w-[420px]">
                          {answerPdfPath
                            ? `Selected: ${answerPdfPath.split(/[/\\]/).pop()}`
                            : 'Upload your written answer sheet PDF (phone cam scan or scanner) for AI OCR & diagram evaluation.'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary text-xs"
                        onClick={async () => {
                          const picked = await api.library.pickFile([{ name: 'PDF Documents', extensions: ['pdf'] }]);
                          if (picked) {
                            setAnswerPdfPath(picked);
                            toast('Answer sheet PDF attached!', 'success');
                          }
                        }}
                      >
                        {answerPdfPath ? 'Change PDF' : 'Select PDF'}
                      </button>
                      {answerPdfPath && (
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost text-xs text-red-400 hover:text-red-300"
                          onClick={() => setAnswerPdfPath(null)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="max-h-[420px] overflow-y-auto space-y-4 pr-1">
                  {Array.isArray(activePaper?.sections) && activePaper.sections.flatMap((s: any) => s.questions || []).map((q: any) => {
                    const qKey = String(q.number);
                    return (
                      <div key={qKey} className="rounded-xl border border-[var(--color-border)] p-3 bg-[var(--color-panel2)] space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-blue-400">Question {qKey} ({q.marks} Marks)</span>
                          <span className="text-[10.5px] text-[var(--color-muted)] truncate max-w-[280px]">{q.text}</span>
                        </div>
                        <textarea
                          rows={3}
                          value={studentAnswers[qKey] || ''}
                          onChange={e => setStudentAnswers({ ...studentAnswers, [qKey]: e.target.value })}
                          placeholder="Type your formula, derivation steps, intermediate values, and final boxed answer..."
                          className="w-full text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-2.5 text-white"
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-[var(--color-border)]">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEvalModalOpen(false)} disabled={evaluating}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm flex items-center gap-1.5"
                    disabled={evaluating}
                    onClick={handleStartEvaluation}
                  >
                    {evaluating ? (
                      <>
                        <Loader2 size={13} className="animate-spin" /> Evaluating Steps with RTU Rubric…
                      </>
                    ) : (
                      <>
                        <Check size={13} /> Submit &amp; Grade with Rubric
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                {/* Score Banner */}
                <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-5 text-center">
                  <div className="text-3xl font-black text-blue-400">
                    {evaluationResult.totalScore} / {evaluationResult.maxScore}
                  </div>
                  <div className="text-xs font-semibold text-[var(--color-muted)] mt-1">
                    Overall Grade: <span className="text-white font-bold text-sm">{evaluationResult.overallGrade}</span>
                  </div>
                </div>

                {/* Mistake Book Auto-Sync Notification */}
                <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <BookMarked size={18} className="text-blue-400 shrink-0" />
                    <div className="text-xs">
                      <span className="font-semibold text-white">Mistake Book Auto-Sync: </span>
                      <span className="text-[var(--color-muted)]">
                        All questions with lost marks have been automatically added to your Mistake Book with step-marking rubrics.
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary text-xs flex items-center gap-1 shrink-0"
                    onClick={() => {
                      setEvalModalOpen(false);
                      setPage('practice');
                    }}
                  >
                    <span>Open Mistake Book</span>
                    <ArrowRight size={13} />
                  </button>
                </div>

                {/* Strengths & Improvements */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <div className="font-bold text-emerald-400 mb-1">Key Strengths:</div>
                    <ul className="list-disc list-inside space-y-1 text-[var(--color-muted)]">
                      {evaluationResult.keyStrengths?.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                    <div className="font-bold text-amber-400 mb-1">Areas to Improve:</div>
                    <ul className="list-disc list-inside space-y-1 text-[var(--color-muted)]">
                      {evaluationResult.improvementAreas?.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                </div>

                {/* Per Question Breakdown */}
                <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
                  {evaluationResult.evaluations?.map((ev, i) => (
                    <div key={i} className="rounded-lg border border-[var(--color-border)] p-3 bg-[var(--color-panel2)] text-xs space-y-1.5">
                      <div className="flex items-center justify-between font-bold">
                        <span className="text-blue-400">Question {ev.questionNumber}</span>
                        <span className="text-white">{ev.marksAwarded} / {ev.maxMarks} Marks</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1 text-[10px] text-[var(--color-muted)] bg-[var(--color-bg)] p-1.5 rounded">
                        <span>Formula: {ev.rubricBreakdown?.formulaMarks}M</span>
                        <span>Steps: {ev.rubricBreakdown?.stepMarks}M</span>
                        <span>Diagram: {ev.rubricBreakdown?.diagramMarks}M</span>
                        <span>Units/Ans: {ev.rubricBreakdown?.finalAnswerMarks}M</span>
                      </div>
                      <p className="text-[11px] text-[var(--color-text)] leading-relaxed">{ev.feedback}</p>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end pt-2 border-t border-[var(--color-border)]">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setEvalModalOpen(false)}>
                    Close Report
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
