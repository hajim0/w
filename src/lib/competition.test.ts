import test from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase/firestore';
import {
  computeWeeklyCompetitionMetrics,
  evaluateChallengeContribution,
  evaluateGoalAttainment,
  getEligibleCompetitionHabits,
  sortCompetitionScores,
} from './competition';
import { Challenge, CompetitionScore, Habit, HabitRecord, XpTransaction } from '../types';

const ts = Timestamp.fromMillis(1700000000000);

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'hab_1',
    userId: 'u1',
    title: '閱讀',
    icon: 'book-open',
    category: 'learning',
    frequency: 'daily',
    targetDays: [0, 1, 2, 3, 4, 5, 6],
    recordType: 'value',
    targetValue: 30,
    unit: '分鐘',
    xpReward: 10,
    habitPurpose: 'competition',
    isPublic: true,
    requirePhoto: false,
    sortOrder: 0,
    archived: false,
    totalCompletions: 0,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

function makeRecord(overrides: Partial<HabitRecord> = {}): HabitRecord {
  return {
    id: 'u1_hab_1_2026-11-16',
    userId: 'u1',
    habitId: 'hab_1',
    habitTitle: '閱讀',
    habitIcon: 'book-open',
    habitCategory: 'learning',
    localDate: '2026-11-16',
    recordType: 'value',
    completedValue: 30,
    unit: '分鐘',
    verificationLevel: 'basic',
    verificationStatus: 'verified',
    xpEarned: 10,
    isPublic: true,
    completedAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

test('Anti-spam cap: personal habits excluded and competition habits capped at 5', () => {
  const habits: Habit[] = [
    makeHabit({ id: 'p1', habitPurpose: 'personal', sortOrder: 0 }),
    makeHabit({ id: 'c1', habitPurpose: 'competition', sortOrder: 1 }),
    makeHabit({ id: 'c2', habitPurpose: 'competition', sortOrder: 2 }),
    makeHabit({ id: 'c3', habitPurpose: 'competition', sortOrder: 3 }),
    makeHabit({ id: 'c4', habitPurpose: 'competition', sortOrder: 4 }),
    makeHabit({ id: 'c5', habitPurpose: 'competition', sortOrder: 5 }),
    makeHabit({ id: 'c6', habitPurpose: 'competition', sortOrder: 6 }),
    makeHabit({ id: 'c7', habitPurpose: 'competition', archived: true, sortOrder: 0 }),
  ];

  const eligible = getEligibleCompetitionHabits(habits);
  assert.equal(eligible.length, 5);
  assert.deepEqual(
    eligible.map((h) => h.id),
    ['c1', 'c2', 'c3', 'c4', 'c5']
  );
});

test('Unit normalization: 30 min reading == 5 km running == 07:30 wake-up attainment (100%)', () => {
  const reading = makeHabit({ id: 'h_read', recordType: 'value', targetValue: 30, unit: '分鐘' });
  const running = makeHabit({ id: 'h_run', recordType: 'value', targetValue: 5, unit: '公里' });
  const wake = makeHabit({ id: 'h_wake', recordType: 'time', targetTime: '07:30', unit: '起床' });

  assert.equal(evaluateGoalAttainment(reading, makeRecord({ completedValue: 30 })), 1);
  assert.equal(evaluateGoalAttainment(reading, makeRecord({ completedValue: 15 })), 0.5);
  assert.equal(evaluateGoalAttainment(running, makeRecord({ completedValue: 5 })), 1);
  assert.equal(evaluateGoalAttainment(wake, makeRecord({ completedTime: '07:15' })), 1);
  assert.equal(evaluateGoalAttainment(wake, makeRecord({ completedTime: '07:50' })), 0.75);
});

test('Competition Score computes 60/25/15 weights independently of XP', () => {
  const habits = [makeHabit({ id: 'c1', xpReward: 10 })];
  // 2026-11-16 is Monday, 2026-11-17 is Tuesday
  const records = [
    makeRecord({ id: 'r1', habitId: 'c1', localDate: '2026-11-16', completedValue: 30, verificationLevel: 'verified' }),
    makeRecord({ id: 'r2', habitId: 'c1', localDate: '2026-11-17', completedValue: 30, verificationLevel: 'basic' }),
  ];
  const xpTx: XpTransaction[] = [
    {
      id: 'tx1',
      userId: 'u1',
      type: 'habit',
      amount: 10,
      sourceId: 'r1',
      localDate: '2026-11-16',
      weekKey: '2026-W47',
      description: 'test',
      createdAt: ts,
    },
  ];

  // Basic league: both days count -> 100% consistency, 100% attainment, 100% stability -> 1000 (100.0 pts)
  const basicMetrics = computeWeeklyCompetitionMetrics({
    habits,
    records,
    xpTransactions: xpTx,
    todayDate: '2026-11-17',
    weekStartDate: '2026-11-16',
    minVerificationLevel: 'basic',
  });
  assert.equal(basicMetrics.competitionScore, 1000);
  assert.equal(basicMetrics.consistencyRate, 100);
  assert.equal(basicMetrics.verifiedCount, 1);

  // Verified-only league: only day 1 counts -> 50% consistency, 100% attainment on completed, 50% stability
  // Weighted = 50*0.6 + 100*0.25 + 50*0.15 = 30 + 25 + 7.5 = 62.5 -> 625
  const verifiedMetrics = computeWeeklyCompetitionMetrics({
    habits,
    records,
    xpTransactions: xpTx,
    todayDate: '2026-11-17',
    weekStartDate: '2026-11-16',
    minVerificationLevel: 'verified',
  });
  assert.equal(verifiedMetrics.competitionScore, 625);
  assert.equal(verifiedMetrics.consistencyRate, 50);
});

test('1v1 Reading Battle enforces dailyCap and Early Bird enforces targetTime', () => {
  const readingDuel: Challenge = {
    id: 'ch1',
    title: 'Reading Battle',
    creatorId: 'u1',
    opponentId: 'u2',
    participantIds: ['u1', 'u2'],
    habitTitle: '閱讀',
    habitIcon: 'book-open',
    recordType: 'value',
    targetValue: 30,
    dailyCap: 60,
    unit: '分鐘',
    startDate: '2026-11-16',
    endDate: '2026-11-22',
    totalDays: 7,
    ruleType: 'most_completions',
    scoringMethod: 'capped_total_value',
    requiredVerificationLevel: 'basic',
    xpPrize: 120,
    status: 'active',
    winnerId: '',
    createdAt: ts,
    updatedAt: ts,
  };

  const overCap = evaluateChallengeContribution(readingDuel, 180, undefined, 'basic');
  assert.equal(overCap.qualifies, true);
  assert.equal(overCap.cappedValue, 60);

  const wakeDuel: Challenge = {
    ...readingDuel,
    id: 'ch2',
    recordType: 'time',
    targetTime: '08:00',
    dailyCap: 1,
    scoringMethod: 'valid_count',
    requiredVerificationLevel: 'verified',
  };

  assert.equal(evaluateChallengeContribution(wakeDuel, 1, '07:45', 'basic').qualifies, false);
  assert.equal(evaluateChallengeContribution(wakeDuel, 1, '08:15', 'verified').qualifies, false);
  assert.equal(evaluateChallengeContribution(wakeDuel, 1, '07:45', 'verified').qualifies, true);
});

test('Multi-board leaderboard sorts accurately across score, consistency, improvement, xp', () => {
  const base: CompetitionScore = {
    id: 's1',
    seasonId: 'season_2026-W47',
    weekKey: '2026-W47',
    userId: 'u1',
    visibleTo: ['u1'],
    displayName: 'A',
    level: 1,
    competitionScore: 700,
    consistencyRate: 60,
    goalAttainmentRate: 80,
    stabilityRate: 70,
    prevWeekConsistencyRate: 20,
    improvementDelta: 40,
    weeklyXp: 100,
    completedCount: 3,
    scheduledCount: 5,
    verifiedCount: 1,
    activeDays: 3,
    seasonStatus: 'active',
    rewardClaimed: false,
    updatedAt: ts,
  };

  const scores: CompetitionScore[] = [
    base,
    { ...base, id: 's2', userId: 'u2', displayName: 'B', competitionScore: 900, consistencyRate: 95, improvementDelta: 5, weeklyXp: 80 },
    { ...base, id: 's3', userId: 'u3', displayName: 'C', competitionScore: 600, consistencyRate: 50, improvementDelta: 10, weeklyXp: 350 },
  ];

  assert.equal(sortCompetitionScores(scores, 'score')[0].userId, 'u2');
  assert.equal(sortCompetitionScores(scores, 'consistency')[0].userId, 'u2');
  assert.equal(sortCompetitionScores(scores, 'improvement')[0].userId, 'u1');
  assert.equal(sortCompetitionScores(scores, 'xp')[0].userId, 'u3');
});
