import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Camera,
  Check,
  ChevronRight,
  Edit3,
  ListOrdered,
  Lock,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  ActivityFeedItem,
  Habit,
  HabitRecord,
  UserPrivate,
  XpTransaction,
} from '../types';
import { CATEGORY_LABELS, HABIT_TEMPLATES } from '../constants/habits';
import {
  formatReadableDate,
  getCurrentTimeHHMM,
  getGreeting,
  isHabitScheduledForDate,
} from '../lib/date';
import { buildDailyRecap } from '../lib/competition';
import { HabitIcon } from './HabitIcon';
import { HomeSkeleton } from './Skeletons';

interface HomeViewProps {
  loading: boolean;
  user: UserPrivate;
  habits: Habit[];
  todayRecords: HabitRecord[];
  allRecords: HabitRecord[];
  todayXpTransactions: XpTransaction[];
  feedItems: ActivityFeedItem[];
  todayDate: string;
  onQuickCheckIn: (habit: Habit) => Promise<void>;
  onOpenCheckInModal: (habit: Habit, existingRecord?: HabitRecord) => void;
  onOpenCreateHabit: () => void;
  onOpenEditHabit: (habit: Habit) => void;
  onDeleteHabit: (habit: Habit) => Promise<void>;
  onReorderHabits: (ordered: Habit[]) => Promise<void>;
  onInstallStarterPack: () => Promise<void>;
  onOpenFriends: () => void;
  onOpenCompete: () => void;
}

export function HomeView({
  loading,
  user,
  habits,
  todayRecords,
  allRecords,
  todayXpTransactions,
  feedItems,
  todayDate,
  onQuickCheckIn,
  onOpenCheckInModal,
  onOpenCreateHabit,
  onOpenEditHabit,
  onDeleteHabit,
  onReorderHabits,
  onInstallStarterPack,
  onOpenFriends,
  onOpenCompete,
}: HomeViewProps) {
  const [filterMode, setFilterMode] = useState<'today' | 'all'>('today');
  const [reorderMode, setReorderMode] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  const [busyHabitId, setBusyHabitId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const scheduledToday = useMemo(
    () => habits.filter((h) => !h.archived && isHabitScheduledForDate(h, todayDate)),
    [habits, todayDate]
  );

  const recordByHabitId = useMemo(() => {
    const map = new Map<string, HabitRecord>();
    todayRecords.forEach((r) => map.set(r.habitId, r));
    return map;
  }, [todayRecords]);

  const recap = useMemo(
    () =>
      buildDailyRecap({
        user,
        habits,
        todayRecords,
        allRecords,
        todayXpTransactions,
        feedItems,
        todayDate,
      }),
    [user, habits, todayRecords, allRecords, todayXpTransactions, feedItems, todayDate]
  );

  const completedTodayCount = recap.completedCount;
  const completionRate = recap.completionRate;
  const todayXp = recap.todayXp;

  const displayedHabits = useMemo(() => {
    const base = filterMode === 'today' ? scheduledToday : habits.filter((h) => !h.archived);
    return [...base].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [filterMode, scheduledToday, habits]);

  const pendingHabits = displayedHabits.filter((h) => !recordByHabitId.has(h.id));
  const completedHabits = displayedHabits.filter((h) => recordByHabitId.has(h.id));

  const handleHabitTap = async (habit: Habit) => {
    const existing = recordByHabitId.get(habit.id);
    if (existing) {
      onOpenCheckInModal(habit, existing);
      return;
    }
    if (habit.recordType === 'check' && !habit.requirePhoto) {
      setBusyHabitId(habit.id);
      try {
        await onQuickCheckIn(habit);
      } finally {
        setBusyHabitId(null);
      }
    } else {
      onOpenCheckInModal(habit);
    }
  };

  const moveHabit = async (index: number, direction: -1 | 1) => {
    const list = [...habits].sort((a, b) => a.sortOrder - b.sortOrder);
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const temp = list[index];
    list[index] = list[targetIdx];
    list[targetIdx] = temp;
    await onReorderHabits(list);
  };

  if (loading) {
    return <HomeSkeleton />;
  }

  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (completionRate / 100) * circumference;

  return (
    <div className="space-y-7">
      {/* Quiet Editorial Header & Today's Progress */}
      <section
        style={{ boxShadow: 'var(--shadow-card)' }}
        className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-6 theme-transition"
      >
        <div className="space-y-2.5 min-w-0">
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span>{formatReadableDate(todayDate)}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">Level {user.level}</span>
            <span aria-hidden="true">·</span>
            <span>Become Better, Together</span>
          </div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-[var(--text-primary)] truncate">
            {getGreeting()}，{user.displayName}
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-0.5 text-xs text-[var(--text-secondary)]">
            <span className="font-mono-tabular">
              完成進度 <strong className="font-semibold text-[var(--text-primary)]">{completedTodayCount}/{scheduledToday.length}</strong>
            </span>
            <span aria-hidden="true" className="text-[var(--border-strong)]">·</span>
            <span className="font-mono-tabular">
              連續 <strong className="font-semibold text-[var(--text-primary)]">{user.currentStreak}</strong> 天
            </span>
            <span aria-hidden="true" className="text-[var(--border-strong)]">·</span>
            <span className="font-mono-tabular">
              今日 <strong className="font-semibold text-[var(--accent-primary)]">+{todayXp} XP</strong>
            </span>
          </div>
        </div>

        {/* Minimalist Completion Ring */}
        <div className="flex items-center gap-4 shrink-0 self-start sm:self-center">
          <div className="relative w-[76px] h-[76px] flex items-center justify-center">
            <svg className="w-[76px] h-[76px] -rotate-90" viewBox="0 0 76 76">
              <circle
                cx="38"
                cy="38"
                r={radius}
                fill="none"
                stroke="var(--ring-track)"
                strokeWidth="4.5"
              />
              <circle
                cx="38"
                cy="38"
                r={radius}
                fill="none"
                stroke={completionRate === 100 ? 'var(--accent-success)' : 'var(--accent-primary)'}
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-500 ease-out"
              />
            </svg>
            <span className="absolute font-mono-tabular text-sm font-semibold text-[var(--text-primary)]">
              {completionRate}%
            </span>
          </div>
        </div>
      </section>

      {/* Social Accountability Pulse & Daily Recap Toggle Strip */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={onOpenFriends}
          className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] hover:border-[var(--border-strong)] flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--bg-subtle)] text-[var(--accent-primary)] flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                {recap.friendsActiveTodayCount > 0
                  ? `${recap.friendsActiveTodayCount} 位好友今日已打卡`
                  : '今日好友動態'}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] truncate">
                {recap.friendFeedTodayCount > 0
                  ? `共有 ${recap.friendFeedTodayCount} 則新進度可按讚加油`
                  : '前往動態牆為夥伴打氣'}
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[var(--text-muted)] shrink-0" strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={onOpenCompete}
          className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] hover:border-[var(--border-strong)] flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--bg-subtle)] text-[var(--accent-warning)] flex items-center justify-center shrink-0">
              <Trophy className="w-4 h-4" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                競賽習慣 {recap.competitionCompleted}/{recap.competitionScheduled}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] truncate">
                查看本週綜合競賽分與排名
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[var(--text-muted)] shrink-0" strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={() => setShowRecap((v) => !v)}
          className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
            showRecap
              ? 'bg-[var(--accent-primary-soft)] border-[var(--accent-primary)]/40'
              : 'bg-[var(--bg-surface)] border-[var(--border-hairline)] hover:border-[var(--border-strong)]'
          }`}
        >
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[var(--text-primary)]">
              每日總結 Daily Recap
            </div>
            <div className="text-[11px] text-[var(--text-muted)] font-mono-tabular mt-0.5">
              較昨日 {recap.rateDeltaVsYesterday >= 0 ? `+${recap.rateDeltaVsYesterday}%` : `${recap.rateDeltaVsYesterday}%`} · 尚餘 {recap.pendingHabits.length} 項
            </div>
          </div>
          <span className="text-xs font-medium text-[var(--accent-primary)] shrink-0">
            {showRecap ? '收起' : '檢視'}
          </span>
        </button>
      </section>

      {showRecap && (
        <section
          style={{ boxShadow: 'var(--shadow-card)' }}
          className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
              今日節律總結（{todayDate}）
            </h2>
            <span className="text-xs font-mono-tabular text-[var(--accent-primary)] font-semibold">
              完成率 {recap.completionRate}%
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-[var(--bg-subtle)]">
              <div className="text-[11px] text-[var(--text-muted)]">完成習慣數</div>
              <div className="font-mono-tabular text-base font-semibold text-[var(--text-primary)] mt-0.5">
                {recap.completedCount} / {recap.scheduledCount}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[var(--bg-subtle)]">
              <div className="text-[11px] text-[var(--text-muted)]">今日獲得 XP</div>
              <div className="font-mono-tabular text-base font-semibold text-[var(--accent-primary)] mt-0.5">
                +{recap.todayXp} XP
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[var(--bg-subtle)]">
              <div className="text-[11px] text-[var(--text-muted)]">較昨日完成率</div>
              <div className="font-mono-tabular text-base font-semibold text-[var(--text-primary)] mt-0.5">
                {recap.rateDeltaVsYesterday >= 0 ? `+${recap.rateDeltaVsYesterday}%` : `${recap.rateDeltaVsYesterday}%`}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[var(--bg-subtle)]">
              <div className="text-[11px] text-[var(--text-muted)]">活躍好友數</div>
              <div className="font-mono-tabular text-base font-semibold text-[var(--text-primary)] mt-0.5">
                {recap.friendsActiveTodayCount} 位
              </div>
            </div>
          </div>
          {recap.pendingHabits.length > 0 ? (
            <div className="text-xs text-[var(--text-secondary)]">
              尚未完成提醒：{recap.pendingHabits.map((h) => h.title).join('、')}
            </div>
          ) : (
            <div className="text-xs text-[var(--accent-success)] font-medium">
              今日排程已全數達標，維持極佳的自我提升節奏。
            </div>
          )}
        </section>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-[var(--bg-subtle)] border border-[var(--border-hairline)] rounded-xl">
          <button
            type="button"
            onClick={() => setFilterMode('today')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              filterMode === 'today'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            今日排程（{scheduledToday.length}）
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              filterMode === 'all'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            全部習慣（{habits.filter((h) => !h.archived).length}）
          </button>
        </div>

        <div className="flex items-center gap-2">
          {habits.length > 1 && (
            <button
              type="button"
              onClick={() => setReorderMode((v) => !v)}
              className={`h-10 px-3.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                reorderMode
                  ? 'bg-[var(--accent-warning-soft)] border-[var(--accent-warning)]/40 text-[var(--accent-warning)]'
                  : 'bg-[var(--bg-surface)] border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>{reorderMode ? '完成排序' : '排序'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenCreateHabit}
            className="h-10 px-4 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] text-xs font-semibold flex items-center gap-1.5 hover:bg-[var(--accent-primary-hover)] active:scale-[0.98] transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" strokeWidth={1.75} />
            <span>新增習慣</span>
          </button>
        </div>
      </div>

      {/* Empty State */}
      {habits.filter((h) => !h.archived).length === 0 ? (
        <div
          style={{ boxShadow: 'var(--shadow-card)' }}
          className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-8 sm:p-10 text-center space-y-5"
        >
          <div className="w-11 h-11 rounded-xl bg-[var(--accent-primary-soft)] flex items-center justify-center mx-auto text-[var(--accent-primary)]">
            <Sparkles className="w-5 h-5" strokeWidth={1.75} />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
              建立你的第一個自律習慣
            </h2>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              區分「個人成長」與「納入競賽」習慣，從早起、閱讀 30 分鐘或重訓開始，與好友一起持續進步。
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={onOpenCreateHabit}
              className="w-full sm:w-auto h-11 px-5 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] text-sm font-semibold hover:bg-[var(--accent-primary-hover)] transition-colors cursor-pointer"
            >
              自訂或選擇習慣範本
            </button>
            <button
              type="button"
              onClick={onInstallStarterPack}
              className="w-full sm:w-auto h-11 px-5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors cursor-pointer"
            >
              一鍵匯入 4 項精選習慣（{HABIT_TEMPLATES[0].title} / 喝水 / 閱讀 / 運動）
            </button>
          </div>
        </div>
      ) : reorderMode ? (
        <div
          style={{ boxShadow: 'var(--shadow-card)' }}
          className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl divide-y divide-[var(--border-hairline)]"
        >
          {[...habits]
            .filter((h) => !h.archived)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((habit, idx, arr) => (
              <div key={habit.id} className="px-4 py-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono-tabular text-xs text-[var(--text-muted)] w-5">
                    {idx + 1}
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-primary)] shrink-0">
                    <HabitIcon name={habit.icon} className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {habit.title}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveHabit(idx, -1)}
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 cursor-pointer"
                    aria-label="上移"
                  >
                    <ArrowUp className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    disabled={idx === arr.length - 1}
                    onClick={() => moveHabit(idx, 1)}
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 cursor-pointer"
                    aria-label="下移"
                  >
                    <ArrowDown className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            ))}
        </div>
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-medium text-[var(--text-secondary)]">
                待完成（{pendingHabits.length}）
              </h2>
            </div>

            {pendingHabits.length === 0 ? (
              <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-6 text-center text-sm text-[var(--text-secondary)]">
                {scheduledToday.length > 0
                  ? '今日排程習慣已全部完成，保持這份節律。'
                  : '今日無排程習慣，可切換至「全部習慣」或新增項目。'}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {pendingHabits.map((habit) => {
                  const isBusy = busyHabitId === habit.id;
                  const scheduled = isHabitScheduledForDate(habit, todayDate);
                  const isComp = habit.habitPurpose === 'competition';
                  return (
                    <motion.div
                      key={habit.id}
                      layout
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      style={{ boxShadow: 'var(--shadow-card)' }}
                      className="group bg-[var(--bg-surface)] border border-[var(--border-hairline)] hover:border-[var(--border-strong)] rounded-2xl p-4 flex items-center justify-between gap-3 theme-transition"
                    >
                      <button
                        type="button"
                        disabled={isBusy || !scheduled}
                        onClick={() => handleHabitTap(habit)}
                        className="flex items-center gap-3.5 min-w-0 flex-1 text-left cursor-pointer disabled:opacity-60"
                      >
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                            scheduled
                              ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)] group-hover:bg-[var(--accent-primary-soft)] group-hover:text-[var(--accent-primary)]'
                              : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
                          }`}
                        >
                          <HabitIcon name={habit.icon} className="w-[18px] h-[18px]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                              {habit.title}
                            </span>
                            {isComp && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--accent-primary-soft)] text-[var(--accent-primary)] shrink-0">
                                競賽
                              </span>
                            )}
                            {!habit.isPublic && (
                              <Lock className="w-3 h-3 text-[var(--text-muted)] shrink-0" strokeWidth={1.75} aria-label="私人習慣" />
                            )}
                            {habit.requirePhoto && (
                              <Camera className="w-3 h-3 text-[var(--accent-warning)] shrink-0" strokeWidth={1.75} aria-label="需附照片" />
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] mt-0.5 truncate">
                            <span>{CATEGORY_LABELS[habit.category]}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {habit.recordType === 'time'
                                ? `目標 ${habit.targetTime || '07:30'}`
                                : habit.recordType === 'value'
                                ? `${habit.targetValue} ${habit.unit}`
                                : '單次打卡'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono-tabular text-[var(--accent-primary)] font-medium">
                              +{habit.xpReward} XP
                            </span>
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => onOpenEditHabit(habit)}
                          className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                          aria-label="編輯習慣"
                        >
                          <Edit3 className="w-4 h-4" strokeWidth={1.75} />
                        </button>
                        {confirmDeleteId === habit.id ? (
                          <button
                            type="button"
                            onClick={async () => {
                              await onDeleteHabit(habit);
                              setConfirmDeleteId(null);
                            }}
                            className="px-2.5 h-9 rounded-lg bg-[var(--accent-danger-soft)] text-[var(--accent-danger)] text-xs font-medium cursor-pointer"
                          >
                            確認刪除
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(habit.id)}
                            className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-danger)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                            aria-label="刪除習慣"
                          >
                            <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isBusy || !scheduled}
                          onClick={() => handleHabitTap(habit)}
                          className="min-w-[44px] min-h-[44px] rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] hover:bg-[var(--accent-primary)] hover:border-transparent text-[var(--text-primary)] hover:text-[var(--accent-primary-fg)] flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
                          aria-label={`完成 ${habit.title}`}
                        >
                          <Check className="w-4 h-4" strokeWidth={1.85} />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </section>

          {completedHabits.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-medium text-[var(--text-secondary)]">
                已完成（{completedHabits.length}）
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {completedHabits.map((habit) => {
                  const rec = recordByHabitId.get(habit.id)!;
                  const completedClock = rec.completedAt?.toDate
                    ? getCurrentTimeHHMM(rec.completedAt.toDate())
                    : rec.completedTime || '--:--';
                  const isVerified =
                    rec.verificationLevel === 'verified' || rec.verificationLevel === 'integrated';
                  return (
                    <motion.div
                      key={habit.id}
                      layout
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className="bg-[var(--bg-subtle)]/70 border border-[var(--border-hairline)] rounded-2xl p-4 flex items-center justify-between gap-3 theme-transition"
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-xl bg-[var(--accent-success-soft)] text-[var(--accent-success)] flex items-center justify-center shrink-0">
                          <Check className="w-4 h-4" strokeWidth={2} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-[var(--text-secondary)] truncate">
                              {habit.title}
                            </span>
                            {isVerified && (
                              <ShieldCheck
                                className="w-3.5 h-3.5 text-[var(--accent-success)] shrink-0"
                                strokeWidth={1.75}
                                aria-label="已驗證打卡"
                              />
                            )}
                            {!habit.isPublic && (
                              <Lock className="w-3 h-3 text-[var(--text-muted)] shrink-0" strokeWidth={1.75} />
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] mt-0.5 truncate">
                            <span className="font-mono-tabular">完成於 {completedClock}</span>
                            {habit.recordType === 'value' && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono-tabular text-[var(--text-secondary)]">
                                  {rec.completedValue} {rec.unit}
                                </span>
                              </>
                            )}
                            {habit.recordType === 'time' && rec.completedTime && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono-tabular text-[var(--text-secondary)]">
                                  紀錄 {rec.completedTime}
                                </span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            <span className="font-mono-tabular text-[var(--accent-success)]">
                              +{rec.xpEarned} XP
                            </span>
                            {(rec.editCount || 0) > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono-tabular text-[11px]">
                                  已修訂 {rec.editCount} 次
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {rec.photoDataUrl && (
                          <img
                            src={rec.photoDataUrl}
                            alt="打卡照片"
                            className="w-9 h-9 rounded-lg object-cover border border-[var(--border-hairline)]"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenCheckInModal(habit, rec)}
                          className="h-9 px-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors cursor-pointer"
                        >
                          編輯紀錄
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
