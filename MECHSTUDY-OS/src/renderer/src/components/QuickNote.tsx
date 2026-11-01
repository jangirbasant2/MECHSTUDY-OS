import React from 'react';
import { StickyNote } from 'lucide-react';
import { useApp } from '../store';
import { api } from '../lib/api';
import { Modal, Field, Spinner } from './ui';
import type { SubjectRow, TreeSubject } from '../../../shared/types';

const COLORS = ['yellow', 'green', 'blue', 'pink', 'purple', 'amber'];
const COLOR_HEX: Record<string, string> = {
  yellow: '#f5c542', green: '#5ecf6a', blue: '#5b9cf8',
  pink: '#f07ba8', purple: '#a78bfa', amber: '#f59e0b',
};

export function QuickNoteDialog() {
  const ctx = useApp(s => s.quickNote);
  const close = useApp(s => s.closeQuickNote);
  const toast = useApp(s => s.toast);

  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [color, setColor] = React.useState('yellow');
  const [subjectId, setSubjectId] = React.useState<number | ''>('');
  const [topicId, setTopicId] = React.useState<number | ''>('');
  const [subjects, setSubjects] = React.useState<SubjectRow[]>([]);
  const [topics, setTopics] = React.useState<{ id: number; title: string; unit_title: string }[]>([]);
  const [saving, setSaving] = React.useState(false);

  const open = !!ctx?.open;

  React.useEffect(() => {
    if (!open) return;
    setTitle('');
    setBody('');
    setColor('yellow');
    setSubjectId('');
    setTopicId('');
    api.syllabus.subjects('RTU').then(setSubjects).catch(() => setSubjects([]));
  }, [open]);

  React.useEffect(() => {
    if (!subjectId) { setTopics([]); return; }
    let alive = true;
    api.syllabus.tree('RTU').then((tree: TreeSubject[]) => {
      if (!alive) return;
      const s = tree.find(t => t.id === Number(subjectId));
      const list = s
        ? s.units.flatMap(u => u.topics.map(t => ({ id: t.id, title: t.title, unit_title: u.title })))
        : [];
      setTopics(list);
    }).catch(() => { if (alive) setTopics([]); });
    return () => { alive = false; };
  }, [subjectId]);

  const save = async () => {
    if (!body.trim() && !title.trim()) {
      toast('Write something in the note first', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.notes.create({
        documentId: ctx?.documentId,
        page: ctx?.page,
        color,
        title: title.trim() || null,
        body: body.trim(),
        subjectId: subjectId === '' ? undefined : Number(subjectId),
        topicId: topicId === '' ? undefined : Number(topicId),
      });
      toast('Note saved', 'success');
      close();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Quick note"
      width={540}
      footer={
        <>
          <button className="btn" onClick={close} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving && <Spinner size={14} />} Save note
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {ctx?.documentId && (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
            style={{ background: 'var(--color-panel2)', color: 'var(--color-muted)' }}
          >
            <StickyNote size={13} />
            Attached to the open document{ctx.page ? `, page ${ctx.page}` : ''}
          </div>
        )}

        <Field label="Title" hint="Optional — used in the notes list.">
          <input
            className="input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Second law — key points"
            autoFocus
          />
        </Field>

        <Field label="Note" required>
          <textarea
            className="input"
            rows={6}
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Write your note. Markdown is supported in notebook entries; sticky notes are plain text."
            style={{ resize: 'vertical', lineHeight: 1.55 }}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Subject">
            <select
              className="input"
              value={subjectId}
              onChange={e => { setSubjectId(e.target.value === '' ? '' : Number(e.target.value)); setTopicId(''); }}
            >
              <option value="">Not linked</option>
              {subjects.map(s => (
                <option key={s.id} value={s.id}>{s.code ? `${s.code} — ` : ''}{s.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Topic">
            <select
              className="input"
              value={topicId}
              onChange={e => setTopicId(e.target.value === '' ? '' : Number(e.target.value))}
              disabled={!topics.length}
            >
              <option value="">{topics.length ? 'Not linked' : 'Pick a subject first'}</option>
              {topics.map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Colour">
          <div className="flex items-center gap-2">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                title={c}
                aria-label={`${c} note`}
                aria-pressed={color === c}
                className="h-7 w-7 rounded-full transition-transform"
                style={{
                  background: COLOR_HEX[c],
                  border: color === c ? '2px solid var(--color-text)' : '2px solid transparent',
                  transform: color === c ? 'scale(1.06)' : 'none',
                }}
              />
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
