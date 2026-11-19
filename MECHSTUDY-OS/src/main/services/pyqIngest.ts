import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { getDb } from '../db';
import { openPdf, closePdf, pageCount, pageTextRaw } from './pdf';
import { extractPyqsWithGemini, generateRtuPaperWithGemini, evaluateRtuAnswersWithGemini } from './ai/gemini';
import { awardXp, unlockTrophy } from './gamification';
import { exportRtuPaperToPdf } from './export';
import type {
  IngestPyqResult,
  RtuPyq,
  GatePyq,
  ExamPaperRecord,
  PyqIngestProgress,
  GateMistakeRecord,
  RtuEvaluationResult,
} from '../../shared/types';

export async function ingestPyqPdf(
  filePath: string,
  targetExamHint: 'RTU' | 'GATE' | 'AUTO' = 'AUTO',
  onProgress?: (progress: PyqIngestProgress) => void,
  forceReingest = false
): Promise<IngestPyqResult> {
  let doc: any = null;
  const errors: string[] = [];

  try {
    // 1. Content-Hash Deduplication Check
    onProgress?.({ stage: 'hashing', current: 0, total: 100, message: 'Computing file content hash...' });
    const fileBytes = await readFile(filePath);
    const fileHash = createHash('sha256').update(fileBytes).digest('hex');
    const fileName = basename(filePath);
    const fileStat = await stat(filePath);

    if (!forceReingest) {
      const cached = (getDb().prepare(`
        SELECT * FROM pyq_ingest_cache WHERE file_hash = ?
      `).get(fileHash) as unknown) as {
        file_hash: string;
        file_name: string;
        file_size: number;
        exam_track: 'RTU' | 'GATE';
        subject_name: string;
        year: number;
        questions_count: number;
      } | undefined;

      if (cached && cached.questions_count > 0) {
        onProgress?.({
          stage: 'done',
          current: 100,
          total: 100,
          message: `Loaded ${cached.questions_count} questions from local cache.`,
        });

        const recentQuestions = cached.exam_track === 'RTU'
          ? (getDb().prepare('SELECT * FROM rtu_pyqs WHERE subject_name LIKE ? AND year = ? ORDER BY id DESC LIMIT 50').all(`%${cached.subject_name}%`, cached.year) as unknown as RtuPyq[])
          : (getDb().prepare('SELECT * FROM gate_pyqs WHERE year = ? ORDER BY id DESC LIMIT 50').all(cached.year) as unknown as GatePyq[]);

        return {
          examTrack: cached.exam_track,
          subjectName: cached.subject_name,
          year: cached.year,
          questionsExtracted: cached.questions_count,
          errors: [],
          cached: true,
          extractedQuestions: recentQuestions,
        };
      }
    }

    // 2. Open PDF and Read Text
    onProgress?.({ stage: 'reading', current: 10, total: 100, message: 'Reading PDF document structure...' });
    doc = await openPdf(filePath);
    const numPages = pageCount(doc);
    let fullText = '';
    const pageTexts: { page: number; text: string }[] = [];

    for (let p = 1; p <= numPages; p++) {
      const pText = await pageTextRaw(doc, p);
      pageTexts.push({ page: p, text: pText });
      fullText += `\n--- PAGE ${p} ---\n` + pText;
    }

    const isScannedOrSparse = fullText.replace(/--- PAGE \d+ ---/g, '').trim().length < 150;

    // 3. Batch / Chunked Queue Processing
    let parsed: any = { examTrack: targetExamHint === 'AUTO' ? 'RTU' : targetExamHint, questions: [] };

    if (isScannedOrSparse) {
      // Scanned document: send the raw file buffer to Gemini multimodal
      onProgress?.({ stage: 'extracting', current: 30, total: 100, message: 'Analyzing scanned document with multimodal AI...' });
      const singleParsed = await extractPyqsWithGemini({ imageBuffer: fileBytes, mimeType: 'application/pdf' }, targetExamHint);
      if (singleParsed && Array.isArray(singleParsed.questions)) {
        parsed = singleParsed;
      }
    } else if (numPages <= 4) {
      // Small text PDF: extract directly
      onProgress?.({ stage: 'extracting', current: 30, total: 100, message: `Extracting questions from ${numPages} pages...` });
      const singleParsed = await extractPyqsWithGemini(fullText, targetExamHint);
      if (singleParsed && Array.isArray(singleParsed.questions)) {
        parsed = singleParsed;
      }
    } else {
      // Multi-page large PDF: chunk in batches of 3-4 pages to prevent timeouts & token limits
      const CHUNK_SIZE = 4;
      const totalChunks = Math.ceil(numPages / CHUNK_SIZE);
      const allExtractedQuestions: any[] = [];

      for (let c = 0; c < totalChunks; c++) {
        const startP = c * CHUNK_SIZE + 1;
        const endP = Math.min((c + 1) * CHUNK_SIZE, numPages);
        const chunkText = pageTexts
          .filter(pt => pt.page >= startP && pt.page <= endP)
          .map(pt => `\n--- PAGE ${pt.page} ---\n` + pt.text)
          .join('\n');

        const pct = Math.round(30 + ((c + 1) / totalChunks) * 50);
        onProgress?.({
          stage: 'extracting',
          current: pct,
          total: 100,
          message: `Processing batch ${c + 1} of ${totalChunks} (Pages ${startP}–${endP})...`,
        });

        try {
          const chunkResult = await extractPyqsWithGemini(chunkText, targetExamHint);
          if (chunkResult) {
            if (c === 0) {
              parsed.examTrack = chunkResult.examTrack || parsed.examTrack;
              parsed.subjectName = chunkResult.subjectName;
              parsed.subjectCode = chunkResult.subjectCode;
              parsed.year = chunkResult.year;
              parsed.examTerm = chunkResult.examTerm;
            }
            if (Array.isArray(chunkResult.questions)) {
              allExtractedQuestions.push(...chunkResult.questions);
            }
          }
        } catch (e: any) {
          errors.push(`Batch ${c + 1} error: ${e?.message}`);
        }
      }
      parsed.questions = allExtractedQuestions;
    }

    if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      throw new Error('AI could not identify any questions from the uploaded PYQ document.');
    }

    // 4. Save and Index Questions
    onProgress?.({ stage: 'saving', current: 85, total: 100, message: 'Storing and indexing questions into local SQLite...' });

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
    const insertedRecords: Array<RtuPyq | GatePyq> = [];

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

          const res = insertRtu.run(
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

          insertedRecords.push({
            id: Number(res.lastInsertRowid),
            subject_id: subjectId,
            subject_code: subjectCode,
            subject_name: subjectName,
            unit_number: q.unitNumber || 1,
            topic_id: null,
            year,
            exam_term: examTerm,
            part,
            question_number: String(q.number || insertedCount),
            question_text: qText,
            marks: Number(q.marks) || (part === 'Part C' ? 15 : part === 'Part B' ? 8 : 2),
            solution_text: q.solution || null,
            diagram_description: null,
            created_at: new Date().toISOString(),
          });

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

          const res = insertGate.run(
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

          insertedRecords.push({
            id: Number(res.lastInsertRowid),
            subject_id: subjectId,
            subject_code: subjectCode,
            subject_name: subjectName,
            topic_id: null,
            section,
            year,
            shift: 1,
            question_number: Number(q.number) || insertedCount,
            type,
            question_text: qText,
            options_json: q.options ? JSON.stringify(q.options) : null,
            answer_key: q.answerKey ? String(q.answerKey) : null,
            nat_range_start: natRangeStart,
            nat_range_end: natRangeEnd,
            marks,
            negative_marks: negMarks,
            solution_text: q.solution || null,
            created_at: new Date().toISOString(),
          });

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

    // 5. Store Cache Entry
    try {
      getDb().prepare(`
        INSERT INTO pyq_ingest_cache (file_hash, file_name, file_size, exam_track, subject_name, year, questions_count)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(file_hash) DO UPDATE SET
          questions_count = excluded.questions_count,
          created_at = datetime('now')
      `).run(fileHash, fileName, fileStat.size, examTrack, subjectName, year, insertedCount);
    } catch {
      // Ignore cache insertion error
    }

    // Award XP for successful PYQ ingestion
    if (insertedCount > 0) {
      awardXp(100, examTrack);
      unlockTrophy('PYQ_ARCHIVIST');
    }

    onProgress?.({
      stage: 'done',
      current: 100,
      total: 100,
      message: `Successfully ingested ${insertedCount} questions from ${fileName}.`,
    });

    return {
      examTrack,
      subjectName,
      year,
      questionsExtracted: insertedCount,
      errors,
      cached: false,
      extractedQuestions: insertedRecords,
    };
  } finally {
    if (doc) await closePdf(doc);
  }
}

/* ---------------- Manual Override & Editing Helpers ---------------- */

export function updateRtuPyq(id: number, patch: Partial<RtuPyq>): boolean {
  const fields: string[] = [];
  const params: any[] = [];

  if (patch.subject_name !== undefined) { fields.push('subject_name = ?'); params.push(patch.subject_name); }
  if (patch.unit_number !== undefined) { fields.push('unit_number = ?'); params.push(patch.unit_number); }
  if (patch.part !== undefined) { fields.push('part = ?'); params.push(patch.part); }
  if (patch.question_number !== undefined) { fields.push('question_number = ?'); params.push(patch.question_number); }
  if (patch.question_text !== undefined) { fields.push('question_text = ?'); params.push(patch.question_text); }
  if (patch.marks !== undefined) { fields.push('marks = ?'); params.push(patch.marks); }
  if (patch.solution_text !== undefined) { fields.push('solution_text = ?'); params.push(patch.solution_text); }
  if (patch.year !== undefined) { fields.push('year = ?'); params.push(patch.year); }

  if (fields.length === 0) return false;
  params.push(id);

  const res = getDb().prepare(`UPDATE rtu_pyqs SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  return Number(res.changes) > 0;
}

export function deleteRtuPyq(id: number): boolean {
  const res = getDb().prepare('DELETE FROM rtu_pyqs WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

export function updateGatePyq(id: number, patch: Partial<GatePyq>): boolean {
  const fields: string[] = [];
  const params: any[] = [];

  if (patch.subject_name !== undefined) { fields.push('subject_name = ?'); params.push(patch.subject_name); }
  if (patch.section !== undefined) { fields.push('section = ?'); params.push(patch.section); }
  if (patch.question_number !== undefined) { fields.push('question_number = ?'); params.push(patch.question_number); }
  if (patch.type !== undefined) { fields.push('type = ?'); params.push(patch.type); }
  if (patch.question_text !== undefined) { fields.push('question_text = ?'); params.push(patch.question_text); }
  if (patch.options_json !== undefined) { fields.push('options_json = ?'); params.push(patch.options_json); }
  if (patch.answer_key !== undefined) { fields.push('answer_key = ?'); params.push(patch.answer_key); }
  if (patch.marks !== undefined) { fields.push('marks = ?'); params.push(patch.marks); }
  if (patch.solution_text !== undefined) { fields.push('solution_text = ?'); params.push(patch.solution_text); }
  if (patch.year !== undefined) { fields.push('year = ?'); params.push(patch.year); }

  if (fields.length === 0) return false;
  params.push(id);

  const res = getDb().prepare(`UPDATE gate_pyqs SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  return Number(res.changes) > 0;
}

export function deleteGatePyq(id: number): boolean {
  const res = getDb().prepare('DELETE FROM gate_pyqs WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

/* ---------------- GATE Mistake Notebook Helpers ---------------- */

export function recordGateMistakes(attemptId: number, mistakes: any[]): number {
  const insert = getDb().prepare(`
    INSERT INTO gate_mistakes (
      attempt_id, question_id, subject_name, section, question_text,
      options_json, correct_answer, user_answer, marks, negative_marks_lost,
      solution_text, reviewed, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, datetime('now'))
  `);

  let count = 0;
  for (const m of mistakes) {
    insert.run(
      attemptId,
      m.question_id || null,
      m.subject_name || 'Mechanical Engineering',
      m.section || 'ME',
      m.question_text,
      m.options_json || null,
      m.correct_answer || null,
      m.user_answer || null,
      m.marks || 1,
      m.negative_marks_lost || 0,
      m.solution_text || null,
      m.notes || null
    );
    count++;
  }
  return count;
}

export function getGateMistakes(subjectName?: string, section?: string, reviewed?: number): GateMistakeRecord[] {
  let sql = 'SELECT * FROM gate_mistakes WHERE 1=1';
  const params: any[] = [];
  if (subjectName) {
    sql += ' AND subject_name LIKE ?';
    params.push(`%${subjectName}%`);
  }
  if (section) {
    sql += ' AND section = ?';
    params.push(section);
  }
  if (reviewed !== undefined) {
    sql += ' AND reviewed = ?';
    params.push(reviewed);
  }
  sql += ' ORDER BY id DESC LIMIT 200';
  return (getDb().prepare(sql).all(...params) as unknown) as GateMistakeRecord[];
}

export function updateGateMistake(id: number, reviewed: number, notes?: string): boolean {
  const res = getDb().prepare(`
    UPDATE gate_mistakes SET reviewed = ?, notes = COALESCE(?, notes) WHERE id = ?
  `).run(reviewed, notes ?? null, id);
  return Number(res.changes) > 0;
}

export function deleteGateMistake(id: number): boolean {
  const res = getDb().prepare('DELETE FROM gate_mistakes WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

/* ---------------- RTU Answer Evaluation & Clean PDF Export ---------------- */

export async function evaluateRtuAnswers(
  paperId: number,
  studentAnswers: Array<{ questionNumber: string; answerText?: string; imageBase64?: string }>
): Promise<RtuEvaluationResult> {
  const paperRow = (getDb().prepare(`
    SELECT title, subject_id, questions_json FROM exam_papers WHERE id = ?
  `).get(paperId) as unknown) as { title: string; subject_id: number; questions_json: string } | undefined;

  if (!paperRow) throw new Error(`Exam paper ID ${paperId} not found.`);

  const paperData = JSON.parse(paperRow.questions_json);
  const subjectRow = paperRow.subject_id
    ? (getDb().prepare('SELECT name FROM subjects WHERE id = ?').get(paperRow.subject_id) as any)
    : null;

  const subjectName = subjectRow?.name || paperRow.title;

  // Flatten questions from sections
  const questions: Array<{ number: string; part?: string; questionText: string; marks: number }> = [];
  if (Array.isArray(paperData.sections)) {
    for (const sec of paperData.sections) {
      if (Array.isArray(sec.questions)) {
        for (const q of sec.questions) {
          questions.push({
            number: String(q.number),
            part: sec.name,
            questionText: q.text,
            marks: Number(q.marks) || 2,
          });
        }
      }
    }
  }

  const result = await evaluateRtuAnswersWithGemini(
    subjectName,
    paperRow.title,
    questions,
    studentAnswers
  );

  // Store in rtu_evaluations table
  try {
    getDb().prepare(`
      INSERT INTO rtu_evaluations (paper_id, student_answers_json, evaluations_json, total_score, max_score, rubric_feedback, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      paperId,
      JSON.stringify(studentAnswers),
      JSON.stringify(result.evaluations),
      result.totalScore,
      result.maxScore,
      `${result.overallGrade} Grade - ${result.keyStrengths?.join(', ')}`
    );
  } catch {
    // Ignore store error
  }

  return result;
}

export async function exportRtuPaper(paperId: number, savePath: string): Promise<string> {
  const paperRow = (getDb().prepare(`
    SELECT title, duration_minutes, total_marks, questions_json FROM exam_papers WHERE id = ?
  `).get(paperId) as unknown) as { title: string; duration_minutes: number; total_marks: number; questions_json: string } | undefined;

  if (!paperRow) throw new Error(`Exam paper ID ${paperId} not found.`);

  const paperData = JSON.parse(paperRow.questions_json);
  return await exportRtuPaperToPdf(paperData, savePath);
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

export async function ingestPyqDirectory(
  dirPath: string,
  targetExamHint: 'RTU' | 'GATE' | 'AUTO' = 'AUTO',
  onProgress?: (progress: PyqIngestProgress & { currentFile?: string; completedFiles?: number; totalFiles?: number }) => void,
  forceReingest = false
): Promise<{ totalFiles: number; successfulFiles: number; totalQuestions: number; errors: string[] }> {
  const { readdir } = await import('node:fs/promises');
  const { join, basename: getBasename } = await import('node:path');

  async function getPdfFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await getPdfFiles(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        files.push(fullPath);
      }
    }
    return files;
  }

  const pdfFiles = await getPdfFiles(dirPath);
  let totalQuestions = 0;
  let successfulFiles = 0;
  const errors: string[] = [];

  for (let i = 0; i < pdfFiles.length; i++) {
    const file = pdfFiles[i];
    try {
      const result = await ingestPyqPdf(
        file,
        targetExamHint,
        (prog) => {
          if (onProgress) {
            onProgress({
              ...prog,
              currentFile: getBasename(file),
              completedFiles: i,
              totalFiles: pdfFiles.length,
            });
          }
        },
        forceReingest
      );
      if (result.questionsExtracted > 0 || result.errors.length === 0) {
        successfulFiles++;
        totalQuestions += result.questionsExtracted;
      } else {
        errors.push(`${getBasename(file)}: ${result.errors.join(', ')}`);
      }
    } catch (err: any) {
      errors.push(`${getBasename(file)}: ${err.message}`);
    }
  }

  return {
    totalFiles: pdfFiles.length,
    successfulFiles,
    totalQuestions,
    errors,
  };
}

