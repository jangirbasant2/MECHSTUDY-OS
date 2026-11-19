import { readFile } from 'node:fs/promises';
import { getDb } from '../db';
import { openPdf, closePdf, pageCount, pageTextRaw } from './pdf';
import { extractPyqsWithGemini, generateRtuPaperWithGemini } from './ai/gemini';
import { awardXp, unlockTrophy } from './gamification';
import type { IngestPyqResult, RtuPyq, GatePyq, ExamPaperRecord } from '../../shared/types';

export async function ingestPyqPdf(
  filePath: string,
  targetExamHint: 'RTU' | 'GATE' | 'AUTO' = 'AUTO'
): Promise<IngestPyqResult> {
  let doc: any = null;
  const errors: string[] = [];

  try {
    doc = await openPdf(filePath);
    const numPages = pageCount(doc);
    let fullText = '';

    for (let p = 1; p <= numPages; p++) {
      const pText = await pageTextRaw(doc, p);
      fullText += `\n--- PAGE ${p} ---\n` + pText;
    }

    // If native text layer is nearly empty, read raw file buffer for Gemini multimodal ingestion
    let extractionInput: string | { imageBuffer: Buffer; mimeType: string } = fullText;
    if (fullText.replace(/--- PAGE \d+ ---/g, '').trim().length < 150) {
      const pdfBytes = await readFile(filePath);
      // Pass the first few pages as buffer or text
      extractionInput = { imageBuffer: pdfBytes, mimeType: 'application/pdf' };
    }

    const parsed = await extractPyqsWithGemini(extractionInput, targetExamHint);
    if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      throw new Error('AI could not identify any questions from the uploaded PYQ document.');
    }

    const examTrack: 'RTU' | 'GATE' = parsed.examTrack === 'GATE' ? 'GATE' : 'RTU';
    const rawSubject = (parsed.subjectName || 'Mechanical Engineering').trim();
    const rawCode = (parsed.subjectCode || '').trim();
    const year = Number(parsed.year) || new Date().getFullYear();
    const examTerm = (parsed.examTerm || 'Main').trim();

    // Match subject in local database
    const matchedSubject = (getDb().prepare(`
      SELECT id, code, name FROM subjects
      WHERE name LIKE ? OR code LIKE ?
      ORDER BY id ASC LIMIT 1
    `).get(`%${rawSubject}%`, `%${rawCode || rawSubject}%`) as unknown) as { id: number; code: string; name: string } | undefined;

    const subjectId = matchedSubject?.id ?? null;
    const subjectName = matchedSubject?.name ?? rawSubject;
    const subjectCode = matchedSubject?.code ?? rawCode;

    let insertedCount = 0;

    if (examTrack === 'RTU') {
      const insertRtu = getDb().prepare(`
        INSERT INTO rtu_pyqs (
          subject_id, subject_code, subject_name, unit_number, topic_id,
          year, exam_term, part, question_number, question_text, marks,
          solution_text, diagram_description, raw_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      for (const q of parsed.questions) {
        try {
          const part = (q.part || (q.marks >= 15 ? 'Part C' : q.marks >= 6 ? 'Part B' : 'Part A')).trim();
          const qText = (q.questionText || '').trim();
          if (!qText) continue;

          insertRtu.run(
            subjectId,
            subjectCode,
            subjectName,
            q.unitNumber || 1,
            null,
            year,
            examTerm,
            part,
            String(q.number || insertedCount + 1),
            qText,
            Number(q.marks) || (part === 'Part C' ? 15 : part === 'Part B' ? 8 : 2),
            q.solution || null,
            null,
            JSON.stringify(q)
          );
          insertedCount++;

          // Index into FTS5
          try {
            getDb().prepare(`
              INSERT INTO fts_pages(text, document_id, page, source)
              VALUES (?, ?, ?, 'rtu_pyq')
            `).run(`${subjectName} PYQ ${year} ${part} Q${q.number}: ${qText} ${q.solution || ''}`, 0, insertedCount);
          } catch {
            // Ignore FTS insertion error if any
          }
        } catch (e: any) {
          errors.push(`Failed to insert question: ${e?.message}`);
        }
      }
    } else {
      // GATE PYQs
      const insertGate = getDb().prepare(`
        INSERT INTO gate_pyqs (
          subject_id, subject_code, subject_name, topic_id, section,
          year, shift, question_number, type, question_text, options_json,
          answer_key, nat_range_start, nat_range_end, marks, negative_marks,
          solution_text, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      for (const q of parsed.questions) {
        try {
          const qText = (q.questionText || '').trim();
          if (!qText) continue;

          const type = (q.type || 'MCQ').toUpperCase() as 'MCQ' | 'MSQ' | 'NAT';
          const marks = Number(q.marks) || 1;
          const negMarks = type === 'MCQ' ? (marks === 2 ? 0.66 : 0.33) : 0;
          const section = (q.section || 'ME').toUpperCase();

          const natRangeStart = Array.isArray(q.natRange) && q.natRange.length > 0 ? Number(q.natRange[0]) : null;
          const natRangeEnd = Array.isArray(q.natRange) && q.natRange.length > 1 ? Number(q.natRange[1]) : natRangeStart;

          insertGate.run(
            subjectId,
            subjectCode,
            subjectName,
            null,
            section,
            year,
            1,
            Number(q.number) || insertedCount + 1,
            type,
            qText,
            q.options ? JSON.stringify(q.options) : null,
            q.answerKey ? String(q.answerKey) : null,
            natRangeStart,
            natRangeEnd,
            marks,
            negMarks,
            q.solution || null
          );
          insertedCount++;

          // Index into FTS5
          try {
            getDb().prepare(`
              INSERT INTO fts_pages(text, document_id, page, source)
              VALUES (?, ?, ?, 'gate_pyq')
            `).run(`GATE ${year} ${section} Q${q.number} [${type}]: ${qText} ${q.solution || ''}`, 0, insertedCount);
          } catch {
            // Ignore FTS insertion error
          }
        } catch (e: any) {
          errors.push(`Failed to insert question: ${e?.message}`);
        }
      }
    }

    // Award XP for successful PYQ ingestion
    if (insertedCount > 0) {
      awardXp(100, examTrack);
      unlockTrophy('PYQ_ARCHIVIST');
    }

    return {
      examTrack,
      subjectName,
      year,
      questionsExtracted: insertedCount,
      errors,
    };
  } finally {
    if (doc) await closePdf(doc);
  }
}

export function getRtuPyqList(subjectId?: number, part?: string): RtuPyq[] {
  let sql = 'SELECT * FROM rtu_pyqs WHERE 1=1';
  const params: any[] = [];
  if (subjectId) {
    sql += ' AND subject_id = ?';
    params.push(subjectId);
  }
  if (part) {
    sql += ' AND part = ?';
    params.push(part);
  }
  sql += ' ORDER BY year DESC, id ASC LIMIT 200';
  return (getDb().prepare(sql).all(...params) as unknown) as RtuPyq[];
}

export function getGatePyqList(subjectId?: number, section?: string): GatePyq[] {
  let sql = 'SELECT * FROM gate_pyqs WHERE 1=1';
  const params: any[] = [];
  if (subjectId) {
    sql += ' AND subject_id = ?';
    params.push(subjectId);
  }
  if (section) {
    sql += ' AND section = ?';
    params.push(section);
  }
  sql += ' ORDER BY year DESC, question_number ASC LIMIT 200';
  return (getDb().prepare(sql).all(...params) as unknown) as GatePyq[];
}

export async function createRtuExamPaper(
  subjectId: number,
  mode: 'END_SEM' | 'MT1' | 'MT2',
  selectedUnitNumbers: number[] = [1, 2, 3, 4, 5]
): Promise<ExamPaperRecord> {
  const subject = (getDb().prepare('SELECT id, name, code FROM subjects WHERE id = ?').get(subjectId) as unknown) as { id: number; name: string; code: string } | undefined;
  if (!subject) throw new Error(`Subject ID ${subjectId} not found.`);

  const units = (getDb().prepare(`
    SELECT number, title FROM units WHERE subject_id = ? ORDER BY number ASC
  `).all(subjectId) as unknown) as Array<{ number: number; title: string }>;

  const filteredUnits = units.filter(u => selectedUnitNumbers.includes(u.number));

  // Get uploaded PYQ questions for context
  const existingPyqs = (getDb().prepare(`
    SELECT part, question_number, question_text, marks FROM rtu_pyqs
    WHERE subject_id = ? OR subject_name LIKE ?
    ORDER BY year DESC LIMIT 15
  `).all(subjectId, `%${subject.name}%`) as unknown) as Array<{ part: string; question_number: string; question_text: string; marks: number }>;

  const pyqSnippets = existingPyqs.map(q => `[${q.part}] Q: ${q.question_text} (${q.marks} Marks)`);

  const generatedPaper = await generateRtuPaperWithGemini(
    subject.name,
    mode,
    filteredUnits.map(u => ({ unitNumber: u.number, title: u.title })),
    pyqSnippets
  );

  const title = generatedPaper.title || `${subject.name} - ${mode}`;
  const totalMarks = generatedPaper.totalMarks || (mode === 'END_SEM' ? 100 : 30);
  const duration = generatedPaper.durationMinutes || (mode === 'END_SEM' ? 180 : 90);

  const res = getDb().prepare(`
    INSERT INTO exam_papers (exam_type, title, subject_id, config_json, questions_json, duration_minutes, total_marks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    `RTU_${mode}`,
    title,
    subjectId,
    JSON.stringify({ mode, selectedUnits: selectedUnitNumbers }),
    JSON.stringify(generatedPaper),
    duration,
    totalMarks
  );

  return {
    id: Number(res.lastInsertRowid),
    exam_type: `RTU_${mode}`,
    title,
    subject_id: subjectId,
    questions_json: JSON.stringify(generatedPaper),
    duration_minutes: duration,
    total_marks: totalMarks,
    created_at: new Date().toISOString(),
  };
}

export function getGateCbtPaper(mode: 'STRICT_CBT' | 'PRACTICE' = 'STRICT_CBT'): ExamPaperRecord {
  // Query questions from gate_pyqs or questions table
  let pyqs = (getDb().prepare(`
    SELECT * FROM gate_pyqs ORDER BY year DESC, question_number ASC LIMIT 65
  `).all() as unknown) as any[];

  if (pyqs.length < 15) {
    // Fallback to questions table
    const fallbackQs = (getDb().prepare(`
      SELECT id, text as question_text, type, marks, options_json, answer as answer_key, solution as solution_text
      FROM questions WHERE exam = 'GATE' OR origin = 'user_created' LIMIT 65
    `).all() as unknown) as any[];
    pyqs = [...pyqs, ...fallbackQs];
  }

  // Format into standard 65 questions (or available count)
  const formattedQuestions = pyqs.map((q, idx) => {
    let options: string[] = [];
    try {
      if (q.options_json) options = JSON.parse(q.options_json);
    } catch {
      options = [];
    }

    const type = (q.type || 'MCQ').toUpperCase();
    const marks = Number(q.marks) || (idx < 25 ? 1 : 2);
    const negativeMarks = type === 'MCQ' ? (marks === 2 ? 0.66 : 0.33) : 0;
    const section = idx < 10 ? 'General Aptitude' : idx < 25 ? 'Engineering Mathematics' : 'Mechanical Engineering';

    return {
      id: q.id || idx + 1,
      number: idx + 1,
      section,
      type,
      questionText: q.question_text || q.text,
      options,
      answerKey: q.answer_key || q.answer,
      natRangeStart: q.nat_range_start,
      natRangeEnd: q.nat_range_end,
      marks,
      negativeMarks,
      solution: q.solution_text || q.solution,
    };
  });

  const title = mode === 'STRICT_CBT'
    ? 'Official GATE CBT Mock Exam (65 Qs / 180 min / Strict Focus Lock)'
    : 'GATE Practice Mock Exam (Flexible)';

  const paperData = {
    title,
    mode,
    totalQuestions: formattedQuestions.length,
    totalMarks: 100,
    durationMinutes: 180,
    questions: formattedQuestions,
  };

  const res = getDb().prepare(`
    INSERT INTO exam_papers (exam_type, title, subject_id, config_json, questions_json, duration_minutes, total_marks, created_at)
    VALUES (?, ?, NULL, ?, ?, 180, 100, datetime('now'))
  `).run(
    mode === 'STRICT_CBT' ? 'GATE_MAIN' : 'GATE_MOCK',
    title,
    JSON.stringify({ mode }),
    JSON.stringify(paperData)
  );

  return {
    id: Number(res.lastInsertRowid),
    exam_type: mode === 'STRICT_CBT' ? 'GATE_MAIN' : 'GATE_MOCK',
    title,
    subject_id: null,
    questions_json: JSON.stringify(paperData),
    duration_minutes: 180,
    total_marks: 100,
    created_at: new Date().toISOString(),
  };
}
