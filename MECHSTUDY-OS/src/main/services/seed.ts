import { all, get, run, tx } from '../db';
import { RTU_SYLLABUS } from '../data/rtuSyllabus';
import { GATE_SYLLABUS } from '../data/gateSyllabus';
import type { SeedSubject } from '../data/rtuSyllabus';

function insertVersion(v: any): number {
  const existing = get<{ id: number }>('SELECT id FROM syllabus_versions WHERE name = ?', v.name);
  if (existing) return existing.id;
  return run(
    `INSERT INTO syllabus_versions
      (name, exam_type, university, academic_year, semester, source_doc, source_url, retrieved_at, verification, is_provisional, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    v.name, v.exam_type, v.university, v.academic_year, v.semester,
    v.source_doc, v.source_url, v.retrieved_at, v.verification, v.is_provisional, v.notes
  ).lastInsertRowid;
}

function insertSubjects(versionId: number, subjects: SeedSubject[]): number {
  let count = 0;
  subjects.forEach((s, si) => {
    const subjectId = run(
      `INSERT INTO subjects
        (version_id, code, name, semester, credits, lecture_hours, tutorial_hours, practical_hours,
         ia_marks, ete_marks, total_marks, is_practical, source_doc, verification, sort_order)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      versionId, s.code, s.name, s.semester ?? null, s.credits ?? null,
      s.lecture_hours ?? null, s.tutorial_hours ?? null, s.practical_hours ?? null,
      s.ia_marks ?? null, s.ete_marks ?? null, s.total_marks ?? null,
      s.is_practical ? 1 : 0, null, s.verification ?? 'VERIFIED', si
    ).lastInsertRowid;

    s.units.forEach((u, ui) => {
      const unitId = run(
        'INSERT INTO units (subject_id, number, title, hours, sort_order) VALUES (?,?,?,?,?)',
        subjectId, u.number, u.title, u.hours ?? null, ui
      ).lastInsertRowid;
      u.topics.forEach((tp, ti) => {
        run(
          'INSERT INTO topics (unit_id, number, title, description, sort_order) VALUES (?,?,?,?,?)',
          unitId, ti + 1, tp.title, tp.description ?? null, ti
        );
        count++;
      });
    });
  });
  return count;
}

export function seedSyllabus(): { rtu: number; gate: number; created: boolean } {
  const existing = get<{ c: number }>("SELECT COUNT(*) c FROM syllabus_versions WHERE exam_type = 'RTU'");
  if (existing && existing.c > 0) {
    const t = get<{ c: number }>('SELECT COUNT(*) c FROM topics');
    return { rtu: t?.c ?? 0, gate: 0, created: false };
  }

  return tx(() => {
    const rtuVersion = insertVersion(RTU_SYLLABUS);
    const rtuTopics = insertSubjects(rtuVersion, RTU_SYLLABUS.subjects);

    const gateVersion = insertVersion(GATE_SYLLABUS);
    const gateTopics = insertSubjects(gateVersion, GATE_SYLLABUS.subjects);

    return { rtu: rtuTopics, gate: gateTopics, created: true };
  });
}

export function syllabusVersionIds(): { rtu?: number; gate?: number } {
  return {
    rtu: get<{ id: number }>("SELECT id FROM syllabus_versions WHERE exam_type='RTU' ORDER BY id LIMIT 1")?.id,
    gate: get<{ id: number }>("SELECT id FROM syllabus_versions WHERE exam_type='GATE' ORDER BY id LIMIT 1")?.id,
  };
}

export function subjectStats() {
  return all(
    `SELECT s.id, s.code, s.name, s.semester, s.credits, s.is_practical,
            v.exam_type,
            (SELECT COUNT(*) FROM units u WHERE u.subject_id = s.id) AS units,
            (SELECT COUNT(*) FROM topics t JOIN units u ON u.id = t.unit_id WHERE u.subject_id = s.id) AS topics
     FROM subjects s JOIN syllabus_versions v ON v.id = s.version_id
     ORDER BY v.exam_type, s.sort_order, s.id`
  );
}
