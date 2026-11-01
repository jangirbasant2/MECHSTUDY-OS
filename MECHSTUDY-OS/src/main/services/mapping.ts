import { all, run, tx } from '../db';

// Transparent, evidence-based mapping. We do NOT invent coverage.
// Mapping is derived only from the official wording of both syllabi, and every
// row records its basis + a similarity score. Status is INFERRED unless the
// subject/area names correspond exactly, in which case PARTIALLY_VERIFIED.

const STOP = new Set([
  'and','or','of','the','in','to','for','with','on','by','its','their','a','an','as','at','from',
  'including','etc','such','types','type','different','various','concept','concepts','basics','basic',
  'introduction','principles','applications','application','methods','method','analysis','using','use',
  'properties','property','systems','system','processes','process','study','various'
]);

function tokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP.has(w))
      .map(w => w.replace(/s$/, ''))
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / Math.min(a.size, b.size);
}

// RTU subject code -> GATE section code that covers the same engineering area.
const SUBJECT_TO_SECTION: Record<string, string> = {
  '3ME2-01': 'GATE-ME-S1',        // Engineering Mathematics
  '3ME3-04': 'GATE-ME-S2',        // Engineering Mechanics
  '3ME4-07': 'GATE-ME-S2',        // Mechanics of Materials
  '3ME4-05': 'GATE-ME-S3',        // Thermodynamics
  '3ME4-06': 'GATE-ME-S4',        // Engineering Materials
};

// Areas that correspond by name (used to justify PARTIALLY_VERIFIED)
const AREA_NAME_HINTS: Record<string, string[]> = {
  '3ME4-05': ['thermodynamics'],
  '3ME4-07': ['mechanics of materials'],
  '3ME3-04': ['engineering mechanics'],
  '3ME4-06': ['engineering materials'],
};

interface Row { id: number; code: string; name: string; title?: string; subject_id?: number }

export function buildMappings(): { inserted: number; skipped: number } {
  const existing = all<{ c: number }>('SELECT COUNT(*) c FROM topic_mappings')[0].c;
  if (existing > 0) return { inserted: 0, skipped: existing };

  const rtuTopics = all<any>(`
    SELECT t.id, t.title, u.id AS unit_id, u.title AS unit_title,
           s.code AS subject_code, s.name AS subject_name
    FROM topics t
    JOIN units u ON u.id = t.unit_id
    JOIN subjects s ON s.id = u.subject_id
    JOIN syllabus_versions v ON v.id = s.version_id
    WHERE v.exam_type = 'RTU'`);

  const gateTopics = all<any>(`
    SELECT t.id, t.title, u.title AS unit_title, s.code AS section_code, s.name AS section_name
    FROM topics t
    JOIN units u ON u.id = t.unit_id
    JOIN subjects s ON s.id = u.subject_id
    JOIN syllabus_versions v ON v.id = s.version_id
    WHERE v.exam_type = 'GATE'`);

  const bySection = new Map<string, any[]>();
  for (const g of gateTopics) {
    if (!bySection.has(g.section_code)) bySection.set(g.section_code, []);
    bySection.get(g.section_code)!.push(g);
  }

  let inserted = 0, skipped = 0;
  const THRESHOLD = 0.5;

  tx(() => {
    for (const rt of rtuTopics) {
      const section = SUBJECT_TO_SECTION[rt.subject_code];
      if (!section) { skipped++; continue; }               // e.g. MEFA, practicals -> no GATE match
      const candidates = bySection.get(section) ?? [];

      let best: any = null;
      let bestScore = 0;
      for (const g of candidates) {
        // Compare topic wording, boosted when the containing areas correspond by name.
        const topicScore = overlap(tokens(rt.title), tokens(g.title));
        const unitScore = overlap(tokens(rt.unit_title), tokens(g.unit_title));
        const hint = (AREA_NAME_HINTS[rt.subject_code] ?? [])
          .some(h => g.unit_title.toLowerCase().includes(h)) ? 0.15 : 0;
        const score = Math.min(1, Math.max(topicScore, unitScore * 0.9) + hint);
        if (score > bestScore) { bestScore = score; best = g; }
      }

      if (!best || bestScore < THRESHOLD) { skipped++; continue; }

      const exactArea = (AREA_NAME_HINTS[rt.subject_code] ?? [])
        .some(h => best.unit_title.toLowerCase().includes(h));

      const status = exactArea && bestScore >= 0.7 ? 'PARTIALLY_VERIFIED' : 'INFERRED';
      const basis =
        `Lexical correspondence between official RTU syllabus wording and official GATE 2027 ` +
        `syllabus wording (score ${bestScore.toFixed(2)}). RTU unit "${rt.unit_title}" -> ` +
        `GATE area "${best.unit_title}". No PDF page-level evidence was used.`;

      run(
        `INSERT OR IGNORE INTO topic_mappings
          (rtu_topic_id, gate_topic_id, status, basis, evidence, shared_concepts, rtu_depth, gate_depth, notes)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        rt.id, best.id, status, basis,
        'Both official syllabus documents (syllabus.pdf text layer; GATE 2027 ME syllabus PDF)',
        null,
        'RTU: exam-oriented, follows the prescribed unit structure.',
        'GATE: broader and more analytical; see the linked GATE topic wording.',
        'Auto-generated during first run. Review and edit before treating as authoritative.'
      );
      inserted++;
    }
  });

  return { inserted, skipped };
}

export function mappingSummary() {
  return all(`
    SELECT status, COUNT(*) AS count FROM topic_mappings GROUP BY status ORDER BY count DESC
  `);
}

export function mappingsForRtuTopic(topicId: number) {
  return all(`
    SELECT m.id, m.status, m.basis, m.evidence, m.shared_concepts, m.rtu_depth, m.gate_depth,
           gt.id AS gate_topic_id, gt.title AS gate_topic, gu.title AS gate_unit,
           gs.name AS gate_section
    FROM topic_mappings m
    JOIN topics gt ON gt.id = m.gate_topic_id
    JOIN units gu ON gu.id = gt.unit_id
    JOIN subjects gs ON gs.id = gu.subject_id
    WHERE m.rtu_topic_id = ?
    ORDER BY m.id`, topicId);
}

export function mappingsForGateTopic(topicId: number) {
  return all(`
    SELECT m.id, m.status, m.basis,
           rt.id AS rtu_topic_id, rt.title AS rtu_topic, ru.title AS rtu_unit,
           rs.code AS rtu_code, rs.name AS rtu_subject
    FROM topic_mappings m
    JOIN topics rt ON rt.id = m.rtu_topic_id
    JOIN units ru ON ru.id = rt.unit_id
    JOIN subjects rs ON rs.id = ru.subject_id
    WHERE m.gate_topic_id = ?
    ORDER BY m.id`, topicId);
}
