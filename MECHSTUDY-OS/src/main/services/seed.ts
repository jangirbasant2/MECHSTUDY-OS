import { all, get, run, tx } from '../db';
import { RTU_SYLLABUS } from '../data/rtuSyllabus';
import { GATE_SYLLABUS } from '../data/gateSyllabus';
import { IIT_SYLLABUS } from '../data/iitSyllabus';
import type { SeedSubject } from '../data/rtuSyllabus';

function insertVersion(v: any): number {
  const existing = get<{ id: number }>('SELECT id FROM syllabus_versions WHERE name = ?', v.name);
  if (existing) return existing.id;
  return run(
    `INSERT INTO syllabus_versions
      (name, exam_type, university, academic_year, semester, source_doc, source_url, retrieved_at, verification, is_provisional, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    v.name, v.exam_type, v.university, v.academic_year, v.semester,
    v.source_doc, v.source_url, v.retrieved_at, v.verification, v.is_provisional ? 1 : 0, v.notes
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

export function syncFtsSyllabus(): number {
  try {
    const tableExists = get<{ c: number }>("SELECT count(*) c FROM sqlite_master WHERE type='table' AND name='fts_syllabus'");
    if (!tableExists || tableExists.c === 0) return 0;

    const count = get<{ c: number }>('SELECT count(*) c FROM fts_syllabus');
    if (count && count.c > 0) return count.c;

    run(`
      INSERT INTO fts_syllabus (topic_id, subject_code, subject_name, semester, unit_number, unit_title, topic_title, topic_description, exam_type)
      SELECT t.id, s.code, s.name, COALESCE(s.semester, 0), u.number, u.title, t.title, COALESCE(t.description, ''), v.exam_type
      FROM topics t
      JOIN units u ON u.id = t.unit_id
      JOIN subjects s ON s.id = u.subject_id
      JOIN syllabus_versions v ON v.id = s.version_id
    `);

    return get<{ c: number }>('SELECT count(*) c FROM fts_syllabus')?.c ?? 0;
  } catch (err) {
    console.warn('[seed] syncFtsSyllabus warning:', err);
    return 0;
  }
}

export function seedSyllabus(): { rtu: number; gate: number; iit: number; created: boolean } {
  return tx(() => {
    let rtuCount = 0;
    let gateCount = 0;
    let iitCount = 0;
    let anyCreated = false;

    const rtuExisting = get<{ id: number }>("SELECT id FROM syllabus_versions WHERE exam_type = 'RTU'");
    if (!rtuExisting) {
      const v = insertVersion(RTU_SYLLABUS);
      rtuCount = insertSubjects(v, RTU_SYLLABUS.subjects);
      anyCreated = true;
    } else {
      const existingCodes = new Set(
        all<{ code: string }>('SELECT code FROM subjects WHERE version_id = ?', rtuExisting.id).map(r => r.code)
      );
      const missingSubjects = RTU_SYLLABUS.subjects.filter(s => !existingCodes.has(s.code));
      if (missingSubjects.length > 0) {
        rtuCount = insertSubjects(rtuExisting.id, missingSubjects);
        anyCreated = true;
      }
    }

    const gateExisting = get<{ id: number }>("SELECT id FROM syllabus_versions WHERE exam_type = 'GATE'");
    if (!gateExisting) {
      const v = insertVersion(GATE_SYLLABUS);
      gateCount = insertSubjects(v, GATE_SYLLABUS.subjects);
      anyCreated = true;
    }

    const iitExisting = get<{ id: number }>("SELECT id FROM syllabus_versions WHERE exam_type = 'IIT'");
    if (!iitExisting) {
      const v = insertVersion(IIT_SYLLABUS);
      iitCount = insertSubjects(v, IIT_SYLLABUS.subjects);
      anyCreated = true;
    }

    syncFtsSyllabus();

    return { rtu: rtuCount, gate: gateCount, iit: iitCount, created: anyCreated };
  });
}

export function syllabusVersionIds(): { rtu?: number; gate?: number; iit?: number } {
  return {
    rtu: get<{ id: number }>("SELECT id FROM syllabus_versions WHERE exam_type='RTU' ORDER BY id LIMIT 1")?.id,
    gate: get<{ id: number }>("SELECT id FROM syllabus_versions WHERE exam_type='GATE' ORDER BY id LIMIT 1")?.id,
    iit: get<{ id: number }>("SELECT id FROM syllabus_versions WHERE exam_type='IIT' ORDER BY id LIMIT 1")?.id,
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
