/**
 * Marking a practice answer.
 *
 * Imported GATE questions store the official key verbatim, which is not a
 * single string: MCQ keys are letters ("B"), MSQ keys are sets that may have
 * alternative accepted sets ("A, B OR A, C"), and NAT keys are ranges
 * ("0.59 to 0.63", "-0.29 to -0.25 OR 0.25 to 0.29"). Comparing the typed
 * answer to that text as a string would mark every numerical question wrong,
 * so the comparison is done here, in one place.
 *
 * Returns null when the question has no answer to judge against.
 */

export interface GradableQuestion {
  type: string;
  answer: string | null;
  key_range?: string | null;
  /** Provenance of the stored answer; withheld keys must not mark anything. */
  answer_status?: string | null;
}

/** Every numeric interval an official NAT key allows. */
export function keyRanges(text: string): [number, number][] {
  const out: [number, number][] = [];
  for (const part of text.split(/\s+OR\s+/i)) {
    const m = part.match(/^\s*(-?\d+(?:\.\d+)?)\s*(?:to|:)\s*(-?\d+(?:\.\d+)?)/i);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      out.push([Math.min(a, b), Math.max(a, b)]);
      continue;
    }
    const s = part.trim().match(/^-?\d+(?:\.\d+)?$/);
    if (s) out.push([Number(s[0]), Number(s[0])]);
  }
  return out;
}

/** Accepted letter sets of an MCQ/MSQ key ("A; C" / "A, B OR A, B"). */
export function letterSets(text: string): string[][] {
  return text
    .split(/\s+OR\s+/i)
    .map(part => [...new Set((part.toUpperCase().match(/[A-D]/g) ?? []))].sort())
    .filter(set => set.length > 0);
}

const chosenLetters = (chosen: string) =>
  [...new Set((chosen.toUpperCase().match(/[A-D]/g) ?? []))].sort();

export function gradeAnswer(question: GradableQuestion, chosen: string): boolean | null {
  // A key that was withheld is not an answer. key_range still holds the
  // printed text for transparency, but marking against it would present a
  // placeholder as fact.
  if (question.answer_status === 'unresolved' || question.answer_status === 'conflict') return null;

  const official = (question.key_range || question.answer || '').trim();
  if (!official) return null;

  const kind = question.type === 'numerical' ? 'number' : 'letters';

  if (kind === 'number') {
    const value = Number(chosen.trim().replace(/,/g, ''));
    if (!Number.isFinite(value)) return false;
    const ranges = keyRanges(official);
    if (!ranges.length) return null;
    return ranges.some(([lo, hi]) => value >= lo && value <= hi);
  }

  const mine = chosenLetters(chosen);
  if (!mine.length) return false;
  const accepted = letterSets(official);
  if (!accepted.length) return null;
  return accepted.some(set => set.length === mine.length && set.every((l, i) => l === mine[i]));
}

export const ANSWER_STATUS_LABEL: Record<string, string> = {
  official_verified: 'Official key (confirmed twice)',
  official_single: 'Official key (single source)',
  conflict: 'Key documents disagree',
  unresolved: 'No trustworthy key',
};
