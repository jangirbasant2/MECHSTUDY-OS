import { getDb } from '../db';
import type { UserProfile, UserTrophy, TopicQuizResult } from '../../shared/types';

const INITIAL_TROPHIES = [
  { code: 'NOVICE_SCHOLAR', title: 'First Step', description: 'Earned your first study XP points', category: 'general', icon: 'zap' },
  { code: 'TOPIC_MASTER_1', title: 'Concept Master', description: 'Successfully passed your first Topic Mastery Theory Gate', category: 'mastery', icon: 'award' },
  { code: 'TOPIC_MASTER_5', title: 'Five-Star Scholar', description: 'Mastered 5 syllabus topics with verified theory quizzes', category: 'mastery', icon: 'star' },
  { code: 'RTU_WARRIOR', title: 'RTU Contender', description: 'Earned 200+ RTU college preparation XP', category: 'rtu', icon: 'graduation-cap' },
  { code: 'GATE_CRACKER', title: 'GATE Aspirant', description: 'Earned 200+ GATE competitive preparation XP', category: 'gate', icon: 'sparkles' },
  { code: 'PYQ_ARCHIVIST', title: 'PYQ Archivist', description: 'Uploaded and digitized your first previous-year question paper', category: 'general', icon: 'file-text' },
  { code: 'CBT_WARRIOR', title: 'Full CBT Gladiator', description: 'Completed a strict 180-min GATE CBT Mock without focus violations', category: 'gate', icon: 'target' },
  { code: 'STREAK_3', title: 'Consistent Mind', description: 'Maintained a 3-day active study streak', category: 'streak', icon: 'flame' },
];

export function getUserProfile(): UserProfile {
  const row = getDb().prepare('SELECT * FROM user_profile WHERE id = 1').get() as any;
  if (!row) {
    getDb().prepare(`
      INSERT OR IGNORE INTO user_profile (id, total_xp, rtu_xp, gate_xp, level, streak_days)
      VALUES (1, 0, 0, 0, 1, 0)
    `).run();
    return getUserProfile();
  }

  return {
    id: row.id,
    total_xp: row.total_xp || 0,
    rtu_xp: row.rtu_xp || 0,
    gate_xp: row.gate_xp || 0,
    level: row.level || 1,
    streak_days: row.streak_days || 0,
    last_active_date: row.last_active_date || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function getUserTrophies(): UserTrophy[] {
  return (getDb().prepare('SELECT * FROM user_trophies ORDER BY unlocked_at DESC').all() as unknown) as UserTrophy[];
}

export function unlockTrophy(code: string): UserTrophy | null {
  const trophyDef = INITIAL_TROPHIES.find(t => t.code === code);
  if (!trophyDef) return null;

  try {
    const existing = getDb().prepare('SELECT * FROM user_trophies WHERE code = ?').get(code);
    if (existing) return (existing as unknown) as UserTrophy;

    getDb().prepare(`
      INSERT INTO user_trophies (code, title, description, category, icon, unlocked_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(trophyDef.code, trophyDef.title, trophyDef.description, trophyDef.category, trophyDef.icon);

    return (getDb().prepare('SELECT * FROM user_trophies WHERE code = ?').get(code) as unknown) as UserTrophy;
  } catch {
    return null;
  }
}

export function awardXp(amount: number, track: 'RTU' | 'GATE' | 'BOTH' = 'BOTH'): { profile: UserProfile; unlockedTrophies: UserTrophy[] } {
  const current = getUserProfile();
  const today = new Date().toISOString().slice(0, 10);

  let newStreak = current.streak_days;
  if (current.last_active_date) {
    const lastDate = new Date(current.last_active_date);
    const diffDays = Math.floor((new Date(today).getTime() - lastDate.getTime()) / (1000 * 3600 * 24));
    if (diffDays === 1) {
      newStreak += 1;
    } else if (diffDays > 1) {
      newStreak = 1;
    }
  } else {
    newStreak = 1;
  }

  const addTotal = Math.max(0, amount);
  const addRtu = track === 'RTU' || track === 'BOTH' ? addTotal : 0;
  const addGate = track === 'GATE' || track === 'BOTH' ? addTotal : 0;

  const nextTotal = current.total_xp + addTotal;
  const nextRtu = current.rtu_xp + addRtu;
  const nextGate = current.gate_xp + addGate;
  const nextLevel = Math.max(1, Math.floor(nextTotal / 250) + 1);

  getDb().prepare(`
    UPDATE user_profile
    SET total_xp = ?, rtu_xp = ?, gate_xp = ?, level = ?, streak_days = ?, last_active_date = ?, updated_at = datetime('now')
    WHERE id = 1
  `).run(nextTotal, nextRtu, nextGate, nextLevel, newStreak, today);

  const updatedProfile = getUserProfile();
  const unlockedTrophies: UserTrophy[] = [];

  // Check milestone achievements
  if (nextTotal > 0) {
    const t = unlockTrophy('NOVICE_SCHOLAR');
    if (t) unlockedTrophies.push(t);
  }
  if (nextRtu >= 200) {
    const t = unlockTrophy('RTU_WARRIOR');
    if (t) unlockedTrophies.push(t);
  }
  if (nextGate >= 200) {
    const t = unlockTrophy('GATE_CRACKER');
    if (t) unlockedTrophies.push(t);
  }
  if (newStreak >= 3) {
    const t = unlockTrophy('STREAK_3');
    if (t) unlockedTrophies.push(t);
  }

  return { profile: updatedProfile, unlockedTrophies };
}

export function recordMasteryQuizResult(
  topicId: number,
  examTrack: 'RTU' | 'GATE',
  questionText: string,
  options: string[],
  correctAnswer: string,
  userAnswer: string,
  explanation: string
): TopicQuizResult {
  const normUser = userAnswer.trim().toLowerCase();
  const normCorrect = correctAnswer.trim().toLowerCase();
  const isCorrect = normUser === normCorrect || normCorrect.includes(normUser) || normUser.includes(normCorrect);

  const xpAwarded = isCorrect ? 50 : 0;

  getDb().prepare(`
    INSERT INTO topic_quizzes (topic_id, exam_track, question_text, options_json, correct_answer, user_answer, is_correct, explanation, xp_awarded, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    topicId,
    examTrack,
    questionText,
    JSON.stringify(options),
    correctAnswer,
    userAnswer,
    isCorrect ? 1 : 0,
    explanation,
    xpAwarded
  );

  let unlockedTrophies: UserTrophy[] = [];
  let newLevel = 1;

  if (isCorrect) {
    // Mark topic completed in SQLite topic_progress
    getDb().prepare(`
      INSERT INTO topic_progress (topic_id, status, theory_done, updated_at)
      VALUES (?, 'completed', 1, datetime('now'))
      ON CONFLICT(topic_id) DO UPDATE SET
        status = 'completed',
        theory_done = 1,
        updated_at = datetime('now')
    `).run(topicId);

    const awardResult = awardXp(50, examTrack);
    unlockedTrophies = awardResult.unlockedTrophies;
    newLevel = awardResult.profile.level;

    // Count total mastered topics
    const countRow = getDb().prepare(`
      SELECT count(*) as c FROM topic_progress WHERE status = 'completed'
    `).get() as { c: number };

    if (countRow.c >= 1) {
      const t = unlockTrophy('TOPIC_MASTER_1');
      if (t) unlockedTrophies.push(t);
    }
    if (countRow.c >= 5) {
      const t = unlockTrophy('TOPIC_MASTER_5');
      if (t) unlockedTrophies.push(t);
    }
  }

  return {
    correct: isCorrect,
    explanation,
    xpAwarded,
    newLevel,
    unlockedTrophies,
  };
}
