import { all, run } from '../db';
import type { SearchHit } from '../../shared/types';

function ftsQuery(raw: string): string | null {
  const terms = raw.toLowerCase().replace(/["'*()^:{}[\]]/g, ' ').split(/\s+/).filter(t => t.length > 1);
  if (!terms.length) return null;
  return terms.map(t => `"${t}"*`).join(' AND ');
}

/** Mechanical Engineering semantic concept synonym map */
const MECHANICAL_CONCEPT_ONTOLOGY: Record<string, { label: string; terms: string[] }> = {
  sfee: {
    label: 'Steady Flow Energy Equation (SFEE)',
    terms: ['steady flow energy equation', 'open system first law', 'enthalpy', 'nozzle', 'turbine', 'compressor']
  },
  'steady flow': {
    label: 'Steady Flow Energy Equation (SFEE)',
    terms: ['sfee', 'open system', 'control volume', 'enthalpy']
  },
  entropy: {
    label: 'Entropy & Second Law',
    terms: ['clausius inequality', 'ds = dq/t', 'entropy generation', 's_gen', 'reversibility', 'isentropic']
  },
  carnot: {
    label: 'Carnot Cycle & Absolute Temperature',
    terms: ['reversible engine', 'maximum thermal efficiency', 'second law', 'clausius']
  },
  brayton: {
    label: 'Brayton / Joule Cycle',
    terms: ['gas turbine', 'joule cycle', 'pressure ratio', 'back work ratio', 'intercooling', 'reheat']
  },
  rankine: {
    label: 'Rankine Vapour Power Cycle',
    terms: ['steam turbine', 'boiler', 'condenser', 'reheat cycle', 'regenerative feed heating', 'bleed steam']
  },
  otto: {
    label: 'Air Standard Otto Cycle',
    terms: ['constant volume cycle', 'spark ignition', 'compression ratio', 'petrol engine']
  },
  diesel: {
    label: 'Diesel & Dual Combustion Cycles',
    terms: ['constant pressure heat addition', 'cut-off ratio', 'compression ignition']
  },
  mohr: {
    label: "Mohr's Circle & Principal Stresses",
    terms: ['principal stress', 'maximum shear stress', 'pole point', 'plane stress', 'strain rosette']
  },
  'principal stress': {
    label: "Mohr's Circle of Stress",
    terms: ['mohr', 'max shear stress', 'eigenvalues of stress tensor', 'failure theories']
  },
  euler: {
    label: 'Euler Column Buckling',
    terms: ['critical buckling load', 'slenderness ratio', 'effective length', 'end conditions', 'column']
  },
  buckling: {
    label: 'Euler Column Buckling',
    terms: ['euler', 'critical load', 'slenderness ratio', 'rankine gordon']
  },
  biot: {
    label: 'Biot Number (Transient Conduction)',
    terms: ['lumped capacitance', 'transient heat transfer', 'internal conduction resistance', 'bi < 0.1']
  },
  nusselt: {
    label: 'Nusselt Number (Convection)',
    terms: ['convective heat transfer coefficient', 'h*L/k', 'boundary layer', 'reynolds analogy']
  },
  bernoulli: {
    label: "Bernoulli's Energy Equation",
    terms: ['inviscid incompressible flow', 'streamline', 'total head', 'pressure head', 'venturimeter']
  },
  darcy: {
    label: 'Darcy-Weisbach Pipe Flow Friction',
    terms: ['pipe friction factor', 'head loss', 'moody chart', 'laminar f = 64/re']
  },
  friction: {
    label: 'Fluid Friction / Pipe Losses',
    terms: ['darcy weisbach', 'moody chart', 'roughness', 'minor losses']
  },
  merchant: {
    label: "Merchant's Metal Cutting Circle",
    terms: ['shear plane angle', 'shear force', 'cutting force', 'chip thickness ratio', 'rake angle']
  },
  chvorinov: {
    label: "Chvorinov's Solidification Rule",
    terms: ['solidification time', 'casting modulus', 'volume to surface area ratio', 'riser design']
  },
  kutzbach: {
    label: 'Kutzbach / Grübler Mobility Criterion',
    terms: ['degrees of freedom', 'kinematic pair', 'inversion', 'mechanism']
  },
  vibration: {
    label: 'Mechanical Vibrations & Resonance',
    terms: ['natural frequency', 'damping ratio', 'transmissibility', 'critical damping', 'whirling speed']
  },
  eigen: {
    label: 'Eigenvalues & Diagonalization',
    terms: ['cayley hamilton theorem', 'characteristic equation', 'matrix rank', 'orthogonal vectors']
  }
};

export { SearchHit };

export function search(q: string, limit = 40): SearchHit[] {
  const hits: SearchHit[] = [];
  const normalizedQ = q.trim().toLowerCase();
  if (!normalizedQ || normalizedQ.length < 2) return [];

  const like = `%${normalizedQ}%`;
  const fq = ftsQuery(normalizedQ);

  // Concept synonym detection for semantic augmentation
  const semanticConcepts: Array<{ label: string; terms: string[] }> = [];
  for (const [key, concept] of Object.entries(MECHANICAL_CONCEPT_ONTOLOGY)) {
    if (normalizedQ.includes(key) || concept.terms.some(t => normalizedQ.includes(t))) {
      semanticConcepts.push(concept);
    }
  }

  // 1. Page text (text layer or OCR) via FTS5
  if (fq) {
    try {
      const rows = all<any>(`
        SELECT f.document_id, f.page, f.source,
               snippet(fts_pages, 0, '[', ']', '…', 14) AS snip,
               d.filename
        FROM fts_pages f JOIN documents d ON d.id = f.document_id
        WHERE fts_pages MATCH ? ORDER BY rank LIMIT ?`, fq, limit);
      for (const r of rows) {
        hits.push({
          kind: 'page', title: r.filename, subtitle: `Page ${r.page}`,
          snippet: r.snip, documentId: r.document_id, page: r.page,
          source: r.source === 'ocr' ? 'OCR text' : 'PDF text layer',
          score: 1.0,
        });
      }
    } catch { /* malformed FTS query */ }
  }

  // 2. Personal notes (sticky + notebook)
  if (fq) {
    try {
      const rows = all<any>(`
        SELECT kind, ref_id, title, snippet(fts_notes, 1, '[', ']', '…', 14) AS snip
        FROM fts_notes WHERE fts_notes MATCH ? ORDER BY rank LIMIT ?`, fq, limit);
      for (const r of rows) {
        hits.push({
          kind: 'note',
          title: r.title || (r.kind === 'sticky' ? 'Sticky note' : 'Notebook entry'),
          subtitle: r.kind === 'sticky' ? 'Sticky note' : 'Notebook',
          snippet: r.snip, refId: r.ref_id,
          score: 0.9,
        });
      }
    } catch { /* ignore */ }
  }

  // 3. Documents by filename
  for (const r of all<any>(`
    SELECT d.id, d.filename, d.rel_path, d.page_count, s.name AS subject_name
    FROM documents d LEFT JOIN subjects s ON s.id=d.subject_id
    WHERE d.filename LIKE ? OR d.rel_path LIKE ? LIMIT ?`, like, like, limit)) {
    hits.push({
      kind: 'document', title: r.filename, subtitle: r.subject_name ?? r.rel_path,
      documentId: r.id, refId: r.id,
      score: 0.95,
    });
  }

  // 4. Syllabus topics (strictly excluding Technical Communication)
  for (const r of all<any>(`
    SELECT t.id, t.title, u.title AS unit_title, s.name AS subject_name, v.exam_type
    FROM topics t JOIN units u ON u.id=t.unit_id JOIN subjects s ON s.id=u.subject_id
    JOIN syllabus_versions v ON v.id=s.version_id
    WHERE (t.title LIKE ? OR t.description LIKE ?)
      AND s.name NOT LIKE '%Technical Communication%'
    LIMIT ?`, like, like, limit)) {
    hits.push({
      kind: 'topic', title: r.title,
      subtitle: `${r.subject_name} · ${r.unit_title} (${r.exam_type})`, refId: r.id,
      examType: r.exam_type,
      score: 0.85,
    });
  }

  // 5. Bookmarks
  for (const r of all<any>(`
    SELECT b.id, b.title, b.page, d.filename, d.id AS document_id
    FROM bookmarks b JOIN documents d ON d.id=b.document_id
    WHERE b.title LIKE ? OR b.description LIKE ? LIMIT ?`, like, like, limit)) {
    hits.push({
      kind: 'bookmark', title: r.title, subtitle: `${r.filename} · page ${r.page}`,
      documentId: r.document_id, page: r.page, refId: r.id,
      score: 0.8,
    });
  }

  // 6. PYQ Bank Search (RTU & GATE PYQs)
  try {
    for (const r of all<any>(`
      SELECT id, subject_name, year, marks, question_text, exam_type
      FROM (
        SELECT id, subject_name, year, marks, question_text, 'RTU' AS exam_type FROM rtu_pyqs
        UNION ALL
        SELECT id, subject_name, year, marks, question_text, 'GATE' AS exam_type FROM gate_pyqs
      )
      WHERE question_text LIKE ?
      LIMIT 15`, like)) {
      hits.push({
        kind: 'pyq',
        title: `${r.exam_type} ${r.year ? `${r.year} ` : ''}(${r.marks} marks) - ${r.subject_name || 'Mechanical Core'}`,
        subtitle: `${r.exam_type} Previous Year Question`,
        snippet: r.question_text?.slice(0, 160) + '...',
        refId: r.id,
        examType: r.exam_type,
        score: 0.75,
      });
    }
  } catch { /* pyq table check */ }

  // 7. Semantic Vector & Concept Augmentation
  // If query matches any mechanical ontology concepts, run secondary semantic expansion
  if (semanticConcepts.length > 0) {
    for (const concept of semanticConcepts) {
      for (const term of concept.terms.slice(0, 3)) {
        const termFq = ftsQuery(term);
        if (termFq) {
          try {
            const semPages = all<any>(`
              SELECT f.document_id, f.page, f.source,
                     snippet(fts_pages, 0, '[', ']', '…', 14) AS snip,
                     d.filename
              FROM fts_pages f JOIN documents d ON d.id = f.document_id
              WHERE fts_pages MATCH ?
              ORDER BY rank LIMIT 5`, termFq);
            for (const r of semPages) {
              if (!hits.some(h => h.documentId === r.document_id && h.page === r.page)) {
                hits.push({
                  kind: 'page',
                  title: r.filename,
                  subtitle: `Page ${r.page} · ${concept.label}`,
                  snippet: r.snip,
                  documentId: r.document_id,
                  page: r.page,
                  source: r.source === 'ocr' ? 'OCR text' : 'PDF text layer',
                  isSemantic: true,
                  matchedConcept: concept.label,
                  score: 0.7,
                });
              }
            }
          } catch {}
        }
      }
    }
  }

  // Sort by score descending
  hits.sort((a, b) => (b.score ?? 0.5) - (a.score ?? 0.5));
  return hits.slice(0, limit);
}

/** Store extracted page text and keep FTS in sync. */
export function indexPageText(documentId: number, page: number, text: string, source: 'text_layer' | 'ocr', confidence?: number) {
  run('INSERT OR REPLACE INTO document_pages (document_id, page, text, source, confidence) VALUES (?,?,?,?,?)',
    documentId, page, text, source, confidence ?? null);
  run('DELETE FROM fts_pages WHERE document_id=? AND page=?', documentId, page);
  if (text.trim()) run('INSERT INTO fts_pages (text, document_id, page, source) VALUES (?,?,?,?)',
    text, documentId, page, source);
}
