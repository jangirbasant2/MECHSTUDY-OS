// Prototype the question-paper parser against the real extracted text.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.env.TEMP, 'pyq-text');

const PAPERS = [
  { label: 'GATE ME 2022 S1', paper: 'GATE-ME-2022-Question-Paper.txt', key: null },
  { label: 'GATE ME 2022 S2', paper: 'me_2022.txt', key: null },
  { label: 'GATE ME 2023', paper: 'GATE-ME-2023-Question-Paper.txt', key: null },
  { label: 'GATE ME 2024 S2', paper: 'GATE-ME-2024-Question-Paper.txt', key: null },
  { label: 'GATE ME 2025', paper: 'ME2025.txt', key: 'ME_Keys (1).txt' },
  { label: 'GATE ME 2026', paper: 'ME.txt', key: 'ME_Keys.txt' },
];

const NOISE = [
  /=== PAGE \d+ ===/g,
  /Page\s+\d+\s+of\s+\d+/gi,
  /Organizing Institute:\s*[A-Za-z.\s]{0,40}?(?=\s{2,}|$)/g,
  /Mechanical Engineering\s*\(ME\)/gi,
  /General Aptitude\s*\(GA\)/gi,
  /GATE\s+\d{4}\s*\(ME\s*Set\s*-\s*\d\)/gi,
  /ME-\d+\b/g,
];

function clean(raw) {
  let text = raw;
  for (const re of NOISE) text = text.replace(re, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

export function parseKeyTable(text) {
  const at = text.search(/Q\.\s*No\.\s*Session\s+(?:Question Type|Que\.\s*Type|Q\.\s*Type)/i);
  if (at < 0) return { rows: [], body: text };
  const body = text.slice(0, at);
  const table = text.slice(at);
  const rows = [];
  const re = /(\d{1,2})\s+(\d+)\s+(MCQ|MSQ|NAT)\s+(GA|ME)\s+(.+?)\s+(\d)(?=\s|$)/g;
  let m;
  while ((m = re.exec(table))) {
    rows.push({ qno: +m[1], session: +m[2], type: m[3], section: m[4], key: m[5].trim(), marks: +m[6] });
  }
  return { rows, body };
}

function splitQuestions(body) {
  const starts = [];
  const re = /Q\.\s*(\d{1,2})(?!\d)/g;
  let m;
  while ((m = re.exec(body))) {
    const after = body.slice(m.index, m.index + 70);
    // section headers: "Q.1 - Q.5 Carry ONE mark each."
    if (/^Q\.\s*\d{1,2}\s*[-\u2013\u2014]\s*Q\.\s*\d{1,2}\s+Carry/i.test(after)) continue;
    // tail of a section header: "Q.5 Carry ONE mark each."
    if (/^Q\.\s*\d{1,2}\s+Carry\b/i.test(after)) continue;
    starts.push({ qno: +m[1], index: m.index, contentStart: m.index + m[0].length });
  }
  const out = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i].contentStart;
    const end = i + 1 < starts.length ? starts[i + 1].index : body.length;
    out.push({ qno: starts[i].qno, chunk: body.slice(start, end).trim() });
  }
  return out;
}

function parseOptions(chunk) {
  // Options appear as "(A)   text   (B)   text ..." usually after the stem.
  const at = chunk.search(/\(A\)\s/);
  if (at < 0) return { text: chunk.trim(), options: [] };
  const text = chunk.slice(0, at).trim();
  const rest = chunk.slice(at);
  const marks = [...rest.matchAll(/\(([A-D])\)/g)];
  if (marks.length !== 4) return { text: chunk.trim(), options: [] };
  const options = [];
  for (let i = 0; i < 4; i++) {
    const from = marks[i].index + marks[i][0].length;
    const to = i + 1 < 4 ? marks[i + 1].index : rest.length;
    options.push({ letter: marks[i][1], text: rest.slice(from, to).trim() });
  }
  // Letters must be strictly A, B, C, D in order.
  if (options.map(o => o.letter).join('') !== 'ABCD') return { text: chunk.trim(), options: [] };
  return { text, options };
}

let failures = 0;
for (const cfg of PAPERS) {
  const rawPaper = readFileSync(join(DIR, cfg.paper), 'utf8');
  const keyText = cfg.key ? readFileSync(join(DIR, cfg.key), 'utf8') : rawPaper;
  const { rows, body } = parseKeyTable(keyText);
  const paperBody = cfg.key ? clean(rawPaper) : clean(body);
  const parsed = splitQuestions(paperBody).map(q => {
    const o = parseOptions(q.chunk);
    const key = rows.find(r => r.qno === q.qno);
    return { qno: q.qno, ...o, key };
  });
  const nums = parsed.map(q => q.qno);
  const dupes = [...new Set(nums.filter((n, i) => nums.indexOf(n) !== i))];
  const missing = Array.from({ length: 65 }, (_, i) => i + 1).filter(n => !nums.includes(n));
  const natWithOptions = parsed.filter(q => q.key?.type === 'NAT' && q.options.length > 0);
  const choiceWithoutOptions = parsed.filter(q => q.key && q.key.type !== 'NAT' && q.options.length !== 4);
  const emptyOptions = parsed.filter(q => q.options.some(o => !o.text));
  const degraded = parsed.filter(q => q.text.includes('??'));
  console.log(`\n${cfg.label}  (${cfg.paper}${cfg.key ? ' + ' + cfg.key : ''})`);
  console.log(`  key rows: ${rows.length}  sessions: ${[...new Set(rows.map(r => r.session))]}`);
  console.log(`  questions: ${parsed.length}  unique: ${new Set(nums).size}  dupes: ${dupes.join(',') || 'none'}  missing: ${missing.join(',') || 'none'}`);
  console.log(`  with 4 options: ${parsed.filter(q => q.options.length === 4).length}  NAT: ${parsed.filter(q => q.key?.type === 'NAT').length}  MSQ: ${parsed.filter(q => q.key?.type === 'MSQ').length}`);
  console.log(`  NAT with options: ${natWithOptions.map(q => q.qno).join(',') || 'none'}`);
  console.log(`  choice w/o 4 options: ${choiceWithoutOptions.map(q => q.qno).join(',') || 'none'}`);
  console.log(`  empty option text: ${emptyOptions.map(q => q.qno).join(',') || 'none'}`);
  console.log(`  degraded text (??): ${degraded.length}`);
  if (parsed.length !== 65 || dupes.length || missing.length) failures++;
}
console.log(`\npapers failing basic checks: ${failures}`);
