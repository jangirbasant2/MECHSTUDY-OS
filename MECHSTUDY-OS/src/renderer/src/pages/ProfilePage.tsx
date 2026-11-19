import React from 'react';
import {
  Award, Zap, Flame, Sparkles, GraduationCap, Star, CheckCircle2,
  Lock, RefreshCw, Trophy, FileText, Target, ShieldCheck,
  Share2, Copy, Check, Edit3, UserCheck, Shield
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store';
import { SectionHeader, Stat, ProgressBar, Loading, EmptyState } from '../components/ui';
import type { UserProfile, UserTrophy } from '../../../shared/types';

const TROPHY_CATALOG = [
  { code: 'NOVICE_SCHOLAR', title: 'First Step', description: 'Earned your first study XP points in MECHSTUDY OS', category: 'general', icon: Zap },
  { code: 'TOPIC_MASTER_1', title: 'Concept Master', description: 'Passed your first AI Topic Mastery Theory Gate quiz', category: 'mastery', icon: ShieldCheck },
  { code: 'TOPIC_MASTER_5', title: 'Five-Star Scholar', description: 'Mastered 5 syllabus topics with verified theory quizzes', category: 'mastery', icon: Star },
  { code: 'RTU_WARRIOR', title: 'RTU Contender', description: 'Earned 200+ RTU college preparation XP points', category: 'rtu', icon: GraduationCap },
  { code: 'GATE_CRACKER', title: 'GATE Aspirant', description: 'Earned 200+ GATE competitive preparation XP points', category: 'gate', icon: Sparkles },
  { code: 'PYQ_ARCHIVIST', title: 'PYQ Archivist', description: 'Uploaded and digitized your first previous-year question paper', category: 'general', icon: FileText },
  { code: 'CBT_WARRIOR', title: 'Full CBT Gladiator', description: 'Completed a strict 180-min GATE CBT Mock without focus violations', category: 'gate', icon: Target },
  { code: 'STREAK_3', title: 'Consistent Mind', description: 'Maintained an active 3-day study streak', category: 'streak', icon: Flame },
];

export function ProfilePage() {
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [trophies, setTrophies] = React.useState<UserTrophy[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editingName, setEditingName] = React.useState(false);
  const [nameInput, setNameInput] = React.useState('');
  const [copiedCard, setCopiedCard] = React.useState(false);
  const toast = useApp(s => s.toast);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [p, t] = await Promise.all([
        api.gamification.getProfile(),
        api.gamification.getTrophies(),
      ]);
      setProfile(p);
      setNameInput(p.username || 'Mechanical Scholar');
      setTrophies(t);
    } catch (e: any) {
      toast(`Could not load profile: ${e?.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const handleSaveUsername = async () => {
    if (!nameInput.trim()) return;
    try {
      const updated = await api.gamification.updateUsername(nameInput.trim());
      setProfile(updated);
      setEditingName(false);
      toast('Username updated!', 'success');
    } catch (e: any) {
      toast(`Failed to update username: ${e?.message}`, 'error');
    }
  };

  const handleCopyRank = async () => {
    if (!profile) return;
    const rankTier = profile.level >= 10 ? '💎 Diamond Grandmaster' : profile.level >= 6 ? '🥇 Gold GATE Crusader' : profile.level >= 3 ? '🥈 Silver Engineering Scholar' : '🥉 Bronze Mechanical Scholar';
    const text = `🏆 MECHSTUDY OS — Academic Rank Card 🎓
Scholar: ${profile.username || 'Mechanical Scholar'} (Level ${profile.level})
Tier: ${rankTier}
Total XP: ${profile.total_xp} XP (RTU: ${profile.rtu_xp} XP | GATE: ${profile.gate_xp} XP)
Active Streak: ${profile.streak_days} Days 🔥
Trophies Unlocked: ${trophies.length} ★
Dual Exam Preparation: RTU Kota + GATE Mechanical`;

    try {
      await navigator.clipboard.writeText(text);
      setCopiedCard(true);
      toast('Shareable Rank Card copied to clipboard!', 'success');
      setTimeout(() => setCopiedCard(false), 2500);
    } catch {
      toast('Failed to copy to clipboard', 'error');
    }
  };

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Loading label="Loading profile & trophy cabinet…" />;
  if (!profile) return <EmptyState title="Profile not found" description="Unable to load user profile." />;

  const currentLevel = profile.level;
  const levelXpProgress = profile.total_xp % 250;
  const levelProgressPct = Math.round((levelXpProgress / 250) * 100);

  const unlockedCodes = new Set(trophies.map(t => t.code));

  return (
    <div className="scroll-y h-full">
      <div className="mx-auto max-w-[1100px] px-6 py-6 space-y-6">
        <SectionHeader
          title="Student Profile & Trophy Cabinet"
          description="Your personal academic progress, verified topic masteries, study streak, and unlocked achievements."
          action={
            <button className="btn btn-sm" onClick={() => void load()}>
              <RefreshCw size={13} /> Refresh
            </button>
          }
        />

        {/* Top Level & XP Card */}
        <div
          className="rounded-2xl border p-6 relative overflow-hidden shadow-sm"
          style={{
            background: 'linear-gradient(135deg, var(--color-panel) 0%, var(--color-panel2) 100%)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white font-black text-2xl shadow-lg">
                {currentLevel}
                <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-black text-xs font-bold border-2 border-[var(--color-panel)]">
                  ★
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  {editingName ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={nameInput}
                        onChange={e => setNameInput(e.target.value)}
                        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1 text-sm font-bold text-white focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={handleSaveUsername}
                        className="btn btn-sm btn-primary py-1 px-2 text-xs"
                      >
                        <Check size={12} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-xl font-bold text-[var(--color-text)]">
                        {profile.username || 'Mechanical Scholar'}
                      </h2>
                      <button
                        type="button"
                        onClick={() => setEditingName(true)}
                        className="btn btn-ghost btn-icon h-6 w-6 text-[var(--color-muted)] hover:text-white"
                        title="Edit Scholar Name"
                      >
                        <Edit3 size={12} />
                      </button>
                    </div>
                  )}
                  <span className="rounded-full bg-cyan-500/10 px-2.5 py-0.5 text-xs font-semibold text-cyan-400 border border-cyan-500/20">
                    Level {currentLevel} · {profile.total_xp} Total XP
                  </span>
                </div>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">
                  Complete study sessions, pass Topic Mastery Quizzes, and upload PYQ papers to level up.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl border px-4 py-2" style={{ background: 'var(--color-panel3)', borderColor: 'var(--color-border)' }}>
                <Flame size={20} className="text-amber-500 animate-bounce" />
                <div>
                  <div className="text-xs text-[var(--color-muted)] font-medium">Study Streak</div>
                  <div className="text-sm font-bold text-[var(--color-text)]">{profile.streak_days} Consecutive Days</div>
                </div>
              </div>
            </div>
          </div>

          {/* Level Progress Bar */}
          <div className="mt-6 pt-5 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex justify-between text-xs font-medium mb-1.5">
              <span className="text-[var(--color-muted)]">Progress to Level {currentLevel + 1}</span>
              <span className="text-[var(--color-text)]">{levelXpProgress} / 250 XP ({levelProgressPct}%)</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-[var(--color-panel3)] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
                style={{ width: `${levelProgressPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Shareable Student Rank Card */}
        {(() => {
          const rankTier = currentLevel >= 10
            ? { name: 'Diamond Grandmaster', gradient: 'from-cyan-500 via-blue-500 to-indigo-600', badge: '💎 DIAMOND TIER', border: 'border-cyan-500/40' }
            : currentLevel >= 6
            ? { name: 'Gold GATE Crusader', gradient: 'from-amber-500 via-yellow-500 to-orange-500', badge: '🥇 GOLD TIER', border: 'border-amber-500/40' }
            : currentLevel >= 3
            ? { name: 'Silver Engineering Scholar', gradient: 'from-slate-400 via-zinc-400 to-gray-500', badge: '🥈 SILVER TIER', border: 'border-slate-400/40' }
            : { name: 'Bronze Mechanical Scholar', gradient: 'from-amber-700 via-amber-800 to-yellow-900', badge: '🥉 BRONZE TIER', border: 'border-amber-700/40' };

          const topTrophies = trophies.slice(0, 3);

          return (
            <div
              className={`rounded-3xl border p-6 relative overflow-hidden shadow-lg ${rankTier.border}`}
              style={{
                background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.9) 100%)',
              }}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                {/* Left: Scholar Info & Metallic Tier */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-white border border-white/20">
                      {rankTier.badge}
                    </span>
                    <span className="text-xs text-[var(--color-muted)]">Verified Student Rank Card</span>
                  </div>

                  <div>
                    <h3 className="text-2xl font-black text-white tracking-tight">
                      {profile.username || 'Mechanical Scholar'}
                    </h3>
                    <div className="text-sm font-semibold bg-gradient-to-r bg-clip-text text-transparent mt-0.5"
                      style={{ backgroundImage: `linear-gradient(to right, #38bdf8, #818cf8)` }}>
                      {rankTier.name} · Level {profile.level}
                    </div>
                  </div>

                  {/* Dual Track Split Badges */}
                  <div className="flex items-center gap-3 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-blue-400">
                      <GraduationCap size={14} />
                      <span>{profile.rtu_xp} RTU XP</span>
                    </div>
                    <span className="text-[var(--color-faint)]">•</span>
                    <div className="flex items-center gap-1.5 font-bold text-cyan-400">
                      <Sparkles size={14} />
                      <span>{profile.gate_xp} GATE XP</span>
                    </div>
                    <span className="text-[var(--color-faint)]">•</span>
                    <div className="flex items-center gap-1.5 font-bold text-orange-400">
                      <Flame size={14} />
                      <span>{profile.streak_days}d Streak</span>
                    </div>
                  </div>
                </div>

                {/* Right: Top 3 Trophies & Share Action */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {topTrophies.length > 0 && (
                    <div className="flex items-center gap-2 bg-[var(--color-panel2)] p-2.5 rounded-2xl border border-[var(--color-border)]">
                      <div className="text-[10.5px] font-semibold text-[var(--color-muted)] mr-1">Showcase:</div>
                      {topTrophies.map(t => (
                        <div
                          key={t.code}
                          className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400"
                          title={`${t.title}: ${t.description}`}
                        >
                          <Award size={16} />
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleCopyRank}
                    className="btn btn-primary btn-sm flex items-center gap-2 px-4 py-2 font-bold text-xs shrink-0"
                  >
                    {copiedCard ? <Check size={14} /> : <Share2 size={14} />}
                    <span>{copiedCard ? 'Rank Copied!' : 'Share Student Rank Card'}</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Dual Track XP Distribution */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-5 border" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <GraduationCap size={18} className="text-blue-500" />
                <span className="font-semibold text-sm text-[var(--color-text)]">RTU College Track</span>
              </div>
              <span className="text-sm font-bold text-blue-400">{profile.rtu_xp} XP</span>
            </div>
            <p className="text-xs text-[var(--color-muted)] mb-3">
              Earned from RTU syllabus mastery, university internal tasks, and End-Sem / Mid-Term mock attempts.
            </p>
            <div className="h-2 w-full rounded-full bg-[var(--color-panel3)] overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full"
                style={{ width: `${Math.min(100, Math.round((profile.rtu_xp / Math.max(1, profile.total_xp)) * 100))}%` }}
              />
            </div>
          </div>

          <div className="card p-5 border" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-cyan-500" />
                <span className="font-semibold text-sm text-[var(--color-text)]">GATE Competitive Track</span>
              </div>
              <span className="text-sm font-bold text-cyan-400">{profile.gate_xp} XP</span>
            </div>
            <p className="text-xs text-[var(--color-muted)] mb-3">
              Earned from GATE CBT practice, speed drills, Numerical NAT sprints, and official mock tests.
            </p>
            <div className="h-2 w-full rounded-full bg-[var(--color-panel3)] overflow-hidden">
              <div
                className="h-full bg-cyan-500 rounded-full"
                style={{ width: `${Math.min(100, Math.round((profile.gate_xp / Math.max(1, profile.total_xp)) * 100))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Trophy Cabinet Grid */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-[var(--color-text)]">Trophy Cabinet</h3>
              <p className="text-xs text-[var(--color-muted)]">
                Unlocked {trophies.length} of {TROPHY_CATALOG.length} academic achievements.
              </p>
            </div>
            <Trophy size={18} className="text-amber-400" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TROPHY_CATALOG.map(t => {
              const isUnlocked = unlockedCodes.has(t.code);
              const unlockedInfo = trophies.find(item => item.code === t.code);
              const Icon = t.icon;

              return (
                <div
                  key={t.code}
                  className={`card p-4 rounded-xl border transition-all ${
                    isUnlocked
                      ? 'border-amber-500/40 bg-amber-500/5 shadow-xs'
                      : 'border-[var(--color-border)] opacity-60 bg-[var(--color-panel)]'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                        isUnlocked
                          ? 'bg-amber-500 text-black shadow-md'
                          : 'bg-[var(--color-panel3)] text-[var(--color-muted)]'
                      }`}
                    >
                      <Icon size={20} />
                    </div>
                    {isUnlocked ? (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                        <CheckCircle2 size={12} /> Unlocked
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-[var(--color-faint)]">
                        <Lock size={12} /> Locked
                      </span>
                    )}
                  </div>

                  <h4 className="mt-3 font-semibold text-xs text-[var(--color-text)]">{t.title}</h4>
                  <p className="text-[11px] text-[var(--color-muted)] mt-1 line-clamp-2 leading-relaxed">
                    {t.description}
                  </p>

                  {isUnlocked && unlockedInfo?.unlocked_at && (
                    <div className="mt-2 text-[9.5px] text-[var(--color-faint)]">
                      {new Date(unlockedInfo.unlocked_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
