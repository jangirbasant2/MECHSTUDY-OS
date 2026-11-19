import React, { useState, useEffect } from 'react';
import { X, Edit3, Trash2, Check, RefreshCw, AlertCircle, FileText, CheckCircle2 } from 'lucide-react';
import type { RtuPyq, GatePyq } from '../../../shared/types';

interface PyqReviewDrawerProps {
  open: boolean;
  onClose: () => void;
  defaultTrack?: 'RTU' | 'GATE';
  initialQuestions?: Array<RtuPyq | GatePyq>;
  onQuestionsUpdated?: () => void;
}

export function PyqReviewDrawer({
  open,
  onClose,
  defaultTrack = 'RTU',
  initialQuestions,
  onQuestionsUpdated,
}: PyqReviewDrawerProps) {
  const [activeTrack, setActiveTrack] = useState<'RTU' | 'GATE'>(defaultTrack);
  const [rtuList, setRtuList] = useState<RtuPyq[]>([]);
  const [gateList, setGateList] = useState<GatePyq[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const fetchQuestions = async () => {
    setLoading(true);
    try {
      if (initialQuestions && initialQuestions.length > 0) {
        const rtus = initialQuestions.filter((q: any) => 'part' in q) as RtuPyq[];
        const gates = initialQuestions.filter((q: any) => 'type' in q) as GatePyq[];
        if (rtus.length > 0) setRtuList(rtus);
        if (gates.length > 0) setGateList(gates);
      } else {
        const [rList, gList] = await Promise.all([
          window.api.pyq.getRtuList(),
          window.api.pyq.getGateList(),
        ]);
        setRtuList(rList);
        setGateList(gList);
      }
    } catch (e: any) {
      setStatusMsg(`Error loading questions: ${e?.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setActiveTrack(defaultTrack);
      fetchQuestions();
    }
  }, [open, defaultTrack]);

  if (!open) return null;

  const handleStartEdit = (q: any) => {
    setEditingId(q.id);
    setEditForm({ ...q });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    try {
      if (activeTrack === 'RTU') {
        await window.api.pyq.updateRtu(editingId, {
          subject_name: editForm.subject_name,
          unit_number: Number(editForm.unit_number),
          part: editForm.part,
          question_number: editForm.question_number,
          question_text: editForm.question_text,
          marks: Number(editForm.marks),
          solution_text: editForm.solution_text,
          year: Number(editForm.year),
        });
        setRtuList(prev => prev.map(item => item.id === editingId ? { ...item, ...editForm } : item));
      } else {
        await window.api.pyq.updateGate(editingId, {
          subject_name: editForm.subject_name,
          section: editForm.section,
          type: editForm.type,
          question_number: Number(editForm.question_number),
          question_text: editForm.question_text,
          answer_key: editForm.answer_key,
          marks: Number(editForm.marks),
          solution_text: editForm.solution_text,
          year: Number(editForm.year),
        });
        setGateList(prev => prev.map(item => item.id === editingId ? { ...item, ...editForm } : item));
      }
      setEditingId(null);
      setStatusMsg('Question updated successfully.');
      setTimeout(() => setStatusMsg(null), 3000);
      onQuestionsUpdated?.();
    } catch (e: any) {
      setStatusMsg(`Save failed: ${e?.message}`);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this question from the bank?')) return;
    try {
      if (activeTrack === 'RTU') {
        await window.api.pyq.deleteRtu(id);
        setRtuList(prev => prev.filter(q => q.id !== id));
      } else {
        await window.api.pyq.deleteGate(id);
        setGateList(prev => prev.filter(q => q.id !== id));
      }
      setStatusMsg('Question deleted.');
      setTimeout(() => setStatusMsg(null), 3000);
      onQuestionsUpdated?.();
    } catch (e: any) {
      setStatusMsg(`Delete failed: ${e?.message}`);
    }
  };

  const questionsToShow = activeTrack === 'RTU' ? rtuList : gateList;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-2xl h-full bg-[var(--color-bg)] border-l border-[var(--color-border)] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-panel)]">
          <div className="flex items-center space-x-3">
            <FileText size={20} className="text-cyan-400" />
            <div>
              <h2 className="text-sm font-bold text-[var(--color-text)]">Review & Override Extracted Questions</h2>
              <p className="text-xs text-[var(--color-muted)]">Verify tags, adjust marks, or correct OCR math equations</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-white hover:bg-[var(--color-panel2)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Track Tabs & Actions */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-panel2)]">
          <div className="flex rounded-lg p-1 bg-[var(--color-bg)] border border-[var(--color-border)]">
            <button
              onClick={() => setActiveTrack('RTU')}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                activeTrack === 'RTU' ? 'bg-blue-600 text-white shadow-xs' : 'text-[var(--color-muted)] hover:text-white'
              }`}
            >
              RTU University ({rtuList.length})
            </button>
            <button
              onClick={() => setActiveTrack('GATE')}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                activeTrack === 'GATE' ? 'bg-amber-600 text-white shadow-xs' : 'text-[var(--color-muted)] hover:text-white'
              }`}
            >
              GATE National ({gateList.length})
            </button>
          </div>

          <button
            onClick={fetchQuestions}
            className="flex items-center space-x-1.5 text-xs text-[var(--color-muted)] hover:text-cyan-400 transition-colors"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Reload</span>
          </button>
        </div>

        {/* Status Toast */}
        {statusMsg && (
          <div className="mx-6 mt-3 px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-xs text-cyan-300 flex items-center space-x-2">
            <CheckCircle2 size={14} />
            <span>{statusMsg}</span>
          </div>
        )}

        {/* Question List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading && questionsToShow.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-[var(--color-muted)] space-y-2">
              <RefreshCw size={24} className="animate-spin text-cyan-400" />
              <p className="text-xs">Loading extracted questions…</p>
            </div>
          ) : questionsToShow.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-[var(--color-muted)] space-y-2">
              <AlertCircle size={28} />
              <p className="text-sm font-medium">No questions found in this category.</p>
              <p className="text-xs">Upload a PYQ paper to auto-extract and view questions here.</p>
            </div>
          ) : (
            questionsToShow.map((q: any) => {
              const isEditing = editingId === q.id;

              return (
                <div
                  key={q.id}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4 transition-all hover:border-[var(--color-border-hover)]"
                >
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] text-[var(--color-muted)] block mb-1">Subject Name</label>
                          <input
                            type="text"
                            value={editForm.subject_name || ''}
                            onChange={e => setEditForm({ ...editForm, subject_name: e.target.value })}
                            className="w-full text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-2.5 py-1.5 text-white"
                          />
                        </div>
                        {activeTrack === 'RTU' ? (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[11px] text-[var(--color-muted)] block mb-1">Part</label>
                              <select
                                value={editForm.part || 'Part A'}
                                onChange={e => setEditForm({ ...editForm, part: e.target.value })}
                                className="w-full text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-2 py-1.5 text-white"
                              >
                                <option value="Part A">Part A (2M)</option>
                                <option value="Part B">Part B (8M)</option>
                                <option value="Part C">Part C (15M)</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-[11px] text-[var(--color-muted)] block mb-1">Unit</label>
                              <input
                                type="number"
                                min={1}
                                max={5}
                                value={editForm.unit_number || 1}
                                onChange={e => setEditForm({ ...editForm, unit_number: Number(e.target.value) })}
                                className="w-full text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-2.5 py-1.5 text-white"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[11px] text-[var(--color-muted)] block mb-1">Section</label>
                              <select
                                value={editForm.section || 'ME'}
                                onChange={e => setEditForm({ ...editForm, section: e.target.value })}
                                className="w-full text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-2 py-1.5 text-white"
                              >
                                <option value="GA">General Aptitude</option>
                                <option value="EM">Engg Mathematics</option>
                                <option value="ME">Mechanical</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-[11px] text-[var(--color-muted)] block mb-1">Type</label>
                              <select
                                value={editForm.type || 'MCQ'}
                                onChange={e => setEditForm({ ...editForm, type: e.target.value })}
                                className="w-full text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-2 py-1.5 text-white"
                              >
                                <option value="MCQ">MCQ</option>
                                <option value="MSQ">MSQ</option>
                                <option value="NAT">NAT</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] text-[var(--color-muted)] block mb-1">Question Number</label>
                          <input
                            type="text"
                            value={editForm.question_number || ''}
                            onChange={e => setEditForm({ ...editForm, question_number: e.target.value })}
                            className="w-full text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-2.5 py-1.5 text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-[var(--color-muted)] block mb-1">Marks</label>
                          <input
                            type="number"
                            step="0.5"
                            value={editForm.marks || 1}
                            onChange={e => setEditForm({ ...editForm, marks: Number(e.target.value) })}
                            className="w-full text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-2.5 py-1.5 text-white"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] text-[var(--color-muted)] block mb-1">Question Text (Supports LaTeX)</label>
                        <textarea
                          rows={3}
                          value={editForm.question_text || ''}
                          onChange={e => setEditForm({ ...editForm, question_text: e.target.value })}
                          className="w-full text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md p-2.5 text-white font-mono"
                        />
                      </div>

                      {activeTrack === 'GATE' && (
                        <div>
                          <label className="text-[11px] text-[var(--color-muted)] block mb-1">Answer Key</label>
                          <input
                            type="text"
                            value={editForm.answer_key || ''}
                            onChange={e => setEditForm({ ...editForm, answer_key: e.target.value })}
                            className="w-full text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-2.5 py-1.5 text-white"
                            placeholder="e.g. A or 14.5"
                          />
                        </div>
                      )}

                      <div>
                        <label className="text-[11px] text-[var(--color-muted)] block mb-1">Solution / Model Derivation</label>
                        <textarea
                          rows={2}
                          value={editForm.solution_text || ''}
                          onChange={e => setEditForm({ ...editForm, solution_text: e.target.value })}
                          className="w-full text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md p-2 text-white"
                          placeholder="Optional solution or explanation..."
                        />
                      </div>

                      <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[var(--color-border)]">
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1.5 rounded-lg text-xs text-[var(--color-muted)] hover:text-white"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
                        >
                          <Check size={14} />
                          <span>Save Changes</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {/* Meta Tags */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            {activeTrack === 'RTU' ? (q.part || 'Part A') : `${q.section || 'ME'} · ${q.type || 'MCQ'}`}
                          </span>
                          <span className="text-xs font-semibold text-[var(--color-text)]">
                            Q{q.question_number}
                          </span>
                          <span className="text-[11px] text-[var(--color-muted)]">
                            ({q.marks} {q.marks === 1 ? 'Mark' : 'Marks'})
                          </span>
                          {q.year && (
                            <span className="text-[10px] text-[var(--color-muted)] bg-[var(--color-bg)] px-2 py-0.5 rounded border border-[var(--color-border)]">
                              {q.year}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => handleStartEdit(q)}
                            className="p-1.5 rounded text-[var(--color-muted)] hover:text-white hover:bg-[var(--color-panel2)] transition-colors"
                            title="Edit / Reassign"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(q.id)}
                            className="p-1.5 rounded text-[var(--color-muted)] hover:text-red-400 hover:bg-[var(--color-panel2)] transition-colors"
                            title="Delete Question"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Question Text */}
                      <p className="text-xs text-[var(--color-text)] leading-relaxed mb-2 font-medium">
                        {q.question_text}
                      </p>

                      {/* Answer / Solution preview */}
                      {(q.answer_key || q.solution_text) && (
                        <div className="text-[11px] text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded-md p-2 mt-2">
                          {q.answer_key && <span className="font-bold mr-2">Key: {q.answer_key}</span>}
                          {q.solution_text && <span className="text-[var(--color-muted)]">{q.solution_text}</span>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
