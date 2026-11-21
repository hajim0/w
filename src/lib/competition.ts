import { COMPETITION_WEIGHTS, MAX_COMPETITION_HABITS } from '../constants/habits';
import {
  ActivityFeedItem,
  Challenge,
  CompetitionScore,
  Habit,
  HabitRecord,
  UserPrivate,
  VerificationLevel,
  XpTransaction,
} from '../types';
import {
  addDaysLocal,
  getMondayOfWeekLocal,
  getWeekKey,
  isHabitScheduledForDate,
  parseLocalDate,
} from './date';

export interface WeeklyMetricsResult {
  weekKey: string;
  startDate: string;
  endDate: string;
  competitionScore: number; // 0..1000 (0.0..100.0 pts)
  consistencyRate: number; // 0..100
  goalAttainmentRate: number; // 0..100
  stabilityRate: number; // 0..100
  prevWeekConsistencyRate: number; // 0..100
  improvementDelta: number; // -100..100
  weeklyXp: number;
  completedCount: number;
  scheduledCount: number;
  verifiedCount: number;
  activeDays: number;
  eligibleHabitCount: number;
}

export function formatCompetitionScore(scoreInt: number): string {
  return (Math.max(0, Math.min(1000, scoreInt)) / 10).toFixed(1);
}

export function isHabitCompetitionEligible(habit: Habit): boolean {
  return !habit.archived && habit.habitPurpose === 'competition';
}

export function getEligibleCompetitionHabits(habits: Habit[]): Habit[] {
  return habits
    .filter(isHabitCompetitionEligible)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, MAX_COMPETITION_HABITS);
}

export function getWeekBoundsFromDate(localDate: string): {
  weekKey: string;
  startDate: string;
  endDate: string;
} {
  const startDate = getMondayOfWeekLocal(localDate);
  const endDate = addDaysLocal(startDate, 6);
  const weekKey = getWeekKey(startDate);
  return { weekKey, startDate, endDate };
}

export function getPreviousWeekMonday(mondayDate: string): string {
  return addDaysLocal(mondayDate, -7);
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Normalizes any habit record's goal attainment to [0, 1] regardless of unit.
 */
export function evaluateGoalAttainment(habit: Habit, record: HabitRecord): number {
  if (habit.recordType === 'check') return 1;
  if (habit.recordType === 'value') {
    const target = Math.max(1, habit.targetValue || 1);
    return Math.min(1, Math.max(0, (record.completedValue || 0) / target));
  }
  // time-based habit
  if (habit.targetTime && record.completedTime) {
    const diffMins = timeToMinutes(record.completedTime) - timeToMinutes(habit.targetTime);
    if (diffMins <= 0) return 1;
    if (diffMins <= 30) return 0.75;
    return 0.5;
  }
  return 1;
}

export function meetsVerificationRequirement(
  recordLevel: VerificationLevel | undefined,
  requiredLevel: 'basic' | 'verified'
): boolean {
  if (requiredLevel === 'basic') return true;
  return recordLevel === 'verified' || recordLevel === 'integrated';
}

/**
 * Calculates weekly Competition Score (60% Consistency + 25% Goal Attainment + 15% Stability)
 * strictly over eligible Competition Habits (capped at MAX_COMPETITION_HABITS = 5)
 * and separate from personal XP.
 */
export function computeWeeklyCompetitionMetrics(params: {
  habits: Habit[];
  records: HabitRecord[];
  xpTransactions: XpTransaction[];
  todayDate: string;
  weekStartDate?: string;
  minVerificationLevel?: 'basic' | 'verified';
}): WeeklyMetricsResult {
  const {
    habits,
    records,
    xpTransactions,
    todayDate,
    minVerificationLevel = 'basic',
  } = params;

  const startDate = params.weekStartDate || getMondayOfWeekLocal(todayDate);
  const endDate = addDaysLocal(startDate, 6);
  const weekKey = getWeekKey(startDate);
  const evalEndDate = todayDate < endDate ? (todayDate >= startDate ? todayDate : startDate) : endDate;

  const compHabits = getEligibleCompetitionHabits(habits);
  const compHabitMap = new Map(compHabits.map((h) => [h.id, h]));

  // Build map of valid competition records for this week
  const weekRecordsByDateHabit = new Map<string, HabitRecord>();
  const activeDaySet = new Set<string>();
  let verifiedCount = 0;

  records.forEach((r) => {
    if (r.localDate < startDate || r.localDate > evalEndDate) return;
    if (!compHabitMap.has(r.habitId)) return;
    if (r.verificationStatus === 'rejected') return;
    if (!meetsVerificationRequirement(r.verificationLevel, minVerificationLevel)) return;

    weekRecordsByDateHabit.set(`${r.localDate}_${r.habitId}`, r);
    activeDaySet.add(r.localDate);
    if (r.verificationLevel === 'verified' || r.verificationLevel === 'integrated') {
      verifiedCount++;
    }
  });

  // Compute scheduled vs completed across startDate..evalEndDate
  let scheduledCount = 0;
  let completedCount = 0;
  let attainmentSum = 0;
  let elapsedDays = 0;

  let cursor = startDate;
  while (cursor <= evalEndDate && elapsedDays < 7) {
    elapsedDays++;
    compHabits.forEach((h) => {
      if (isHabitScheduledForDate(h, cursor)) {
        scheduledCount++;
        const rec = weekRecordsByDateHabit.get(`${cursor}_${h.id}`);
        if (rec) {
          completedCount++;
          attainmentSum += evaluateGoalAttainment(h, rec);
        }
      }
    });
    cursor = addDaysLocal(cursor, 1);
  }

  const consistencyRate =
    scheduledCount > 0 ? Math.min(100, Math.round((completedCount / scheduledCount) * 100)) : 0;

  const goalAttainmentRate =
    completedCount > 0 ? Math.min(100, Math.round((attainmentSum / completedCount) * 100)) : 0;

  const stabilityRate =
    elapsedDays > 0 && compHabits.length > 0
      ? Math.min(100, Math.round((activeDaySet.size / elapsedDays) * 100))
      : 0;

  // Previous week consistency (for Improvement Ranking)
  const prevStart = getPreviousWeekMonday(startDate);
  const prevEnd = addDaysLocal(prevStart, 6);
  const prevMap = new Set<string>();
  records.forEach((r) => {
    if (r.localDate >= prevStart && r.localDate <= prevEnd && compHabitMap.has(r.habitId)) {
      if (meetsVerificationRequirement(r.verificationLevel, minVerificationLevel)) {
        prevMap.add(`${r.localDate}_${r.habitId}`);
      }
    }
  });

  let prevScheduled = 0;
  let prevCompleted = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDaysLocal(prevStart, i);
    compHabits.forEach((h) => {
      if (isHabitScheduledForDate(h, d)) {
        prevScheduled++;
        if (prevMap.has(`${d}_${h.id}`)) prevCompleted++;
      }
    });
  }
  const prevWeekConsistencyRate =
    prevScheduled > 0 ? Math.min(100, Math.round((prevCompleted / prevScheduled) * 100)) : 0;

  const improvementDelta =
    compHabits.length > 0 && scheduledCount > 0
      ? consistencyRate - prevWeekConsistencyRate
      : 0;

  const weighted =
    consistencyRate * (COMPETITION_WEIGHTS.consistency / 100) +
    goalAttainmentRate * (COMPETITION_WEIGHTS.goalAttainment / 100) +
    stabilityRate * (COMPETITION_WEIGHTS.stability / 100);

  const competitionScore =
    compHabits.length > 0 && scheduledCount > 0
      ? Math.min(1000, Math.max(0, Math.round(weighted * 10)))
      : 0;

  const weeklyXp = xpTransactions
    .filter((tx) => tx.weekKey === weekKey)
    .reduce((sum, tx) => sum + tx.amount, 0);

  return {
    weekKey,
    startDate,
    endDate,
    competitionScore,
    consistencyRate,
    goalAttainmentRate,
    stabilityRate,
    prevWeekConsistencyRate,
    improvementDelta,
    weeklyXp,
    completedCount,
    scheduledCount,
    verifiedCount,
    activeDays: activeDaySet.size,
    eligibleHabitCount: compHabits.length,
  };
}

/**
 * Computes personal habit completion rate for a given week (used for Improvement achievement).
 */
export function computePersonalWeekRate(
  habits: Habit[],
  records: HabitRecord[],
  weekStartDate: string,
  maxDate?: string
): number {
  const active = habits.filter((h) => !h.archived);
  if (active.length === 0) return 0;
  const end = maxDate && maxDate < addDaysLocal(weekStartDate, 6) ? maxDate : addDaysLocal(weekStartDate, 6);
  const recSet = new Set(records.map((r) => `${r.localDate}_${r.habitId}`));
  let scheduled = 0;
  let completed = 0;
  let cursor = weekStartDate;
  let guard = 0;
  while (cursor <= end && guard < 7) {
    guard++;
    active.forEach((h) => {
      if (isHabitScheduledForDate(h, cursor)) {
        scheduled++;
        if (recSet.has(`${cursor}_${h.id}`)) completed++;
      }
    });
    cursor = addDaysLocal(cursor, 1);
  }
  return scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0;
}

/**
 * Evaluates whether a check-in qualifies for a 1v1 challenge and computes its daily capped value.
 */
export function evaluateChallengeContribution(
  challenge: Challenge,
  completedValue: number,
  completedTime: string | undefined,
  verificationLevel: VerificationLevel
): { qualifies: boolean; cappedValue: number } {
  const reqLevel = challenge.requiredVerificationLevel || 'basic';
  if (!meetsVerificationRequirement(verificationLevel, reqLevel)) {
    return { qualifies: false, cappedValue: 0 };
  }

  const dailyCap =
    challenge.dailyCap && challenge.dailyCap > 0
      ? challenge.dailyCap
      : challenge.recordType === 'value'
      ? Math.max(1, challenge.targetValue || 60)
      : 1;

  if (challenge.recordType === 'time') {
    if (challenge.targetTime && completedTime) {
      const ok = completedTime <= challenge.targetTime;
      return { qualifies: ok, cappedValue: ok ? 1 : 0 };
    }
    return { qualifies: true, cappedValue: 1 };
  }

  if (challenge.recordType === 'value') {
    if (challenge.scoringMethod === 'capped_total_value') {
      const val = Math.max(0, Math.min(dailyCap, completedValue || 0));
      return { qualifies: val > 0, cappedValue: val };
    }
    const ok = completedValue >= (challenge.targetValue || 1);
    return { qualifies: ok, cappedValue: ok ? Math.min(dailyCap, completedValue) : 0 };
  }

  return { qualifies: true, cappedValue: 1 };
}

export interface DailyRecapSummary {
  completedCount: number;
  scheduledCount: number;
  completionRate: number;
  todayXp: number;
  yesterdayRate: number;
  rateDeltaVsYesterday: number;
  friendsActiveTodayCount: number;
  friendFeedTodayCount: number;
  pendingHabits: Habit[];
  competitionCompleted: number;
  competitionScheduled: number;
}

export function buildDailyRecap(params: {
  user: UserPrivate;
  habits: Habit[];
  todayRecords: HabitRecord[];
  allRecords: HabitRecord[];
  todayXpTransactions: XpTransaction[];
  feedItems: ActivityFeedItem[];
  todayDate: string;
}): DailyRecapSummary {
  const { user, habits, todayRecords, allRecords, todayXpTransactions, feedItems, todayDate } = params;
  const scheduledToday = habits.filter((h) => !h.archived && isHabitScheduledForDate(h, todayDate));
  const doneIds = new Set(todayRecords.map((r) => r.habitId));
  const pendingHabits = scheduledToday.filter((h) => !doneIds.has(h.id));
  const completedCount = scheduledToday.length - pendingHabits.length;
  const completionRate =
    scheduledToday.length > 0 ? Math.round((completedCount / scheduledToday.length) * 100) : 0;

  const yesterday = addDaysLocal(todayDate, -1);
  const scheduledYesterday = habits.filter((h) => !h.archived && isHabitScheduledForDate(h, yesterday));
  const yesterdayDoneIds = new Set(
    allRecords.filter((r) => r.localDate === yesterday).map((r) => r.habitId)
  );
  const yesterdayCompleted = scheduledYesterday.filter((h) => yesterdayDoneIds.has(h.id)).length;
  const yesterdayRate =
    scheduledYesterday.length > 0
      ? Math.round((yesterdayCompleted / scheduledYesterday.length) * 100)
      : 0;

  const todayXp = todayXpTransactions.reduce((sum, tx) => sum + tx.amount, 0);

  const friendFeedToday = feedItems.filter(
    (f) => f.localDate === todayDate && f.userId !== user.uid
  );
  const friendsActiveTodayCount = new Set(friendFeedToday.map((f) => f.userId)).size;

  const compScheduled = scheduledToday.filter((h) => h.habitPurpose === 'competition');
  const competitionCompleted = compScheduled.filter((h) => doneIds.has(h.id)).length;

  return {
    completedCount,
    scheduledCount: scheduledToday.length,
    completionRate,
    todayXp,
    yesterdayRate,
    rateDeltaVsYesterday: completionRate - yesterdayRate,
    friendsActiveTodayCount,
    friendFeedTodayCount: friendFeedToday.length,
    pendingHabits,
    competitionCompleted,
    competitionScheduled: compScheduled.length,
  };
}

export type LeaderboardBoardType = 'score' | 'consistency' | 'improvement' | 'xp';

export function sortCompetitionScores(
  scores: CompetitionScore[],
  board: LeaderboardBoardType
): CompetitionScore[] {
  const copy = [...scores];
  copy.sort((a, b) => {
    if (board === 'score') {
      return (
        b.competitionScore - a.competitionScore ||
        b.consistencyRate - a.consistencyRate ||
        b.weeklyXp - a.weeklyXp
      );
    }
    if (board === 'consistency') {
      return (
        b.consistencyRate - a.consistencyRate ||
        b.competitionScore - a.competitionScore ||
        b.verifiedCount - a.verifiedCount
      );
    }
    if (board === 'improvement') {
      return (
        b.improvementDelta - a.improvementDelta ||
        b.consistencyRate - a.consistencyRate ||
        b.competitionScore - a.competitionScore
      );
    }
    return b.weeklyXp - a.weeklyXp || b.competitionScore - a.competitionScore;
  });
  return copy;
}

export function getDaysRemainingInclusive(todayDate: string, endDate: string): number {
  if (todayDate > endDate) return 0;
  const t = parseLocalDate(todayDate).getTime();
  const e = parseLocalDate(endDate).getTime();
  return Math.max(0, Math.round((e - t) / 86400000) + 1);
}
