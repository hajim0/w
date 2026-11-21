import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  Calendar,
  Check,
  Copy,
  History,
  Lock,
  Plus,
  Share2,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  Challenge,
  ChallengeMember,
  ChallengeScoringMethod,
  CompetitionScore,
  CompetitionSeason,
  Habit,
  HabitRecord,
  HabitRecordType,
  PublicProfile,
  Team,
  TeamGoalType,
  TeamMember,
  UserPrivate,
  XpTransaction,
} from '../types';
import {
  CHALLENGE_TEMPLATES,
  MAX_COMPETITION_HABITS,
  TEAM_GOAL_TYPE_LABELS,
  getTitleForLevel,
} from '../constants/habits';
import { addDaysLocal, getWeekKey } from '../lib/date';
import {
  LeaderboardBoardType,
  computeWeeklyCompetitionMetrics,
  formatCompetitionScore,
  getDaysRemainingInclusive,
  getEligibleCompetitionHabits,
  getWeekBoundsFromDate,
  sortCompetitionScores,
} from '../lib/competition';
import {
  claimChallengeReward,
  claimLeagueReward,
  claimTeamReward,
  createChallenge,
  createPrivateLeague,
  createTeam,
  joinPrivateLeagueByCode,
  joinTeamByCode,
  linkChallengeHabit,
  respondChallenge,
  settleChallenge,
  settleCompetitionSeason,
  startNextCircleSeason,
  updateUserProfileAndSettings,
} from '../services/firestoreService';
import { useToast } from './Toast';
import { HabitIcon } from './HabitIcon';

interface CompeteViewProps {
  user: UserPrivate;
  publicProfile: PublicProfile;
  habits: Habit[];
  records: HabitRecord[];
  xpTransactions: XpTransaction[];
  friendProfiles: Record<string, PublicProfile>;
  acceptedFriendUids: string[];
  seasons: CompetitionSeason[];
  scores: CompetitionScore[];
  challenges: Challenge[];
  challengeMembers: ChallengeMember[];
  teams: Team[];
  teamMembersMap: Record<string, TeamMember[]>;
  todayDate: string;
  preselectedOpponent: PublicProfile | null;
  onClearPreselectedOpponent: () => void;
}

const SCORING_METHOD_LABELS: Record<ChallengeScoringMethod, string> = {
  valid_count: '有效達標次數',
  capped_total_value: '每日上限累積值',
  completion_rate: '達標完成率 %',
};

export function CompeteView({
  user,
  publicProfile,
  habits,
  records,
  xpTransactions,
  friendProfiles,
  acceptedFriendUids,
  seasons,
  scores,
  challenges,
  challengeMembers,
  teams,
  teamMembersMap,
  todayDate,
  preselectedOpponent,
  onClearPreselectedOpponent,
}: CompeteViewProps) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<'leaderboard' | 'duels' | 'teams'>('leaderboard');

  // Weekly League State
  const [selectedLeagueKey, setSelectedLeagueKey] = useState<string>('circle');
  const [boardType, setBoardType] = useState<LeaderboardBoardType>('score');
  const [showCreateLeague, setShowCreateLeague] = useState(false);
  const [leagueName, setLeagueName] = useState('');
  const [leagueMinVerif, setLeagueMinVerif] = useState<'basic' | 'verified'>('basic');
  const [creatingLeague, setCreatingLeague] = useState(false);
  const [leagueJoinCode, setLeagueJoinCode] = useState('');
  const [joiningLeague, setJoiningLeague] = useState(false);
  const [settlingSeason, setSettlingSeason] = useState(false);
  const [claimingSeasonId, setClaimingSeasonId] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showRulesInfo, setShowRulesInfo] = useState(false);

  // 1v1 Challenge State
  const [showDuelModal, setShowDuelModal] = useState(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>('early_bird');
  const [opponentUid, setOpponentUid] = useState('');
  const [duelTitle, setDuelTitle] = useState('Early Bird 早起挑戰');
  const [duelHabitTitle, setDuelHabitTitle] = useState('早起');
  const [duelHabitIcon, setDuelHabitIcon] = useState('sun');
  const [duelRecordType, setDuelRecordType] = useState<HabitRecordType>('time');
  const [duelTargetValue, setDuelTargetValue] = useState(1);
  const [duelTargetTime, setDuelTargetTime] = useState('08:00');
  const [duelDailyCap, setDuelDailyCap] = useState(1);
  const [duelUnit, setDuelUnit] = useState('起床');
  const [duelDays, setDuelDays] = useState(7);
  const [duelRuleType, setDuelRuleType] = useState<'most_completions' | 'highest_rate'>('most_completions');
  const [duelScoringMethod, setDuelScoringMethod] = useState<ChallengeScoringMethod>('valid_count');
  const [duelReqVerif, setDuelReqVerif] = useState<'basic' | 'verified'>('basic');
  const [duelXpPrize, setDuelXpPrize] = useState(100);
  const [duelLinkedHabitId, setDuelLinkedHabitId] = useState('');
  const [creatingDuel, setCreatingDuel] = useState(false);

  const [acceptingChallenge, setAcceptingChallenge] = useState<Challenge | null>(null);
  const [acceptHabitId, setAcceptHabitId] = useState('');

  // Team Challenge State
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamDesc, setTeamDesc] = useState('');
  const [teamGoalType, setTeamGoalType] = useState<TeamGoalType>('total_completions');
  const [teamGoalTitle, setTeamGoalTitle] = useState('本週團隊共同累積 30 次打卡');
  const [teamTargetCount, setTeamTargetCount] = useState(30);
  const [teamMinContrib, setTeamMinContrib] = useState(3);
  const [teamDays, setTeamDays] = useState(14);
  const [teamXpPrize, setTeamXpPrize] = useState(120);
  const [creatingTeam, setCreatingTeam] = useState(false);

  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joiningTeam, setJoiningTeam] = useState(false);

  const weekBounds = useMemo(() => getWeekBoundsFromDate(todayDate), [todayDate]);
  const currentWeekKey = weekBounds.weekKey;
  const eligibleCompHabits = useMemo(() => getEligibleCompetitionHabits(habits), [habits]);

  const activePrivateLeagues = useMemo(
    () =>
      seasons.filter(
        (s) => s.leagueType === 'private' && s.status === 'active'
      ),
    [seasons]
  );

  const settledSeasons = useMemo(
    () =>
      seasons
        .filter((s) => s.status === 'settled')
        .sort((a, b) => (b.weekKey > a.weekKey ? 1 : -1)),
    [seasons]
  );

  const myCircleSeason = useMemo(
    () =>
      seasons.find(
        (s) =>
          s.leagueType === 'circle' &&
          s.weekKey === currentWeekKey &&
          s.creatorId === user.uid
      ) || null,
    [seasons, currentWeekKey, user.uid]
  );

  const selectedPrivateSeason = useMemo(
    () => activePrivateLeagues.find((s) => s.id === selectedLeagueKey) || null,
    [activePrivateLeagues, selectedLeagueKey]
  );

  useEffect(() => {
    if (selectedLeagueKey !== 'circle' && !selectedPrivateSeason) {
      setSelectedLeagueKey('circle');
    }
  }, [selectedLeagueKey, selectedPrivateSeason]);

  const activeSeasonId = selectedPrivateSeason
    ? selectedPrivateSeason.id
    : `circle_${currentWeekKey}`;

  const activeSeasonMeta: CompetitionSeason | null = selectedPrivateSeason || myCircleSeason;
  const activeStartDate = activeSeasonMeta?.startDate || weekBounds.startDate;
  const activeEndDate = activeSeasonMeta?.endDate || weekBounds.endDate;
  const activeMinVerif = activeSeasonMeta?.minVerificationLevel || 'basic';
  const daysRemaining = getDaysRemainingInclusive(todayDate, activeEndDate);

  const applyTemplate = (tplKey: string) => {
    const tpl = CHALLENGE_TEMPLATES.find((t) => t.key === tplKey);
    if (!tpl) return;
    setSelectedTemplateKey(tpl.key);
    setDuelTitle(tpl.title);
    setDuelHabitTitle(tpl.habitTitle);
    setDuelHabitIcon(tpl.habitIcon);
    setDuelRecordType(tpl.recordType);
    setDuelTargetValue(tpl.targetValue);
    setDuelTargetTime(tpl.targetTime || '08:00');
    setDuelDailyCap(tpl.dailyCap);
    setDuelUnit(tpl.unit);
    setDuelDays(tpl.days);
    setDuelRuleType(tpl.ruleType);
    setDuelScoringMethod(tpl.scoringMethod);
    setDuelXpPrize(tpl.xpPrize);
    const matched = habits.find((h) => !h.archived && h.title === tpl.habitTitle);
    setDuelLinkedHabitId(matched?.id || '');
  };

  useEffect(() => {
    if (preselectedOpponent) {
      setMode('duels');
      setOpponentUid(preselectedOpponent.uid);
      setShowDuelModal(true);
      onClearPreselectedOpponent();
    }
  }, [preselectedOpponent, onClearPreselectedOpponent]);

  // Build Fair Weekly League Ranking Entries
  const rawSeasonScores = useMemo(() => {
    const rosterUids = selectedPrivateSeason
      ? selectedPrivateSeason.memberUids
      : Array.from(new Set([user.uid, ...acceptedFriendUids]));

    const scoreByUid = new Map<string, CompetitionScore>();
    scores
      .filter((s) => s.seasonId === activeSeasonId)
      .forEach((s) => scoreByUid.set(s.userId, s));

    return rosterUids.map((uid): CompetitionScore => {
      const existing = scoreByUid.get(uid);
      if (existing) return existing;

      if (uid === user.uid) {
        const live = computeWeeklyCompetitionMetrics({
          habits,
          records,
          xpTransactions,
          todayDate,
          weekStartDate: activeStartDate,
          minVerificationLevel: activeMinVerif,
        });
        return {
          id: `${activeSeasonId}_${uid}`,
          seasonId: activeSeasonId,
          weekKey: activeSeasonMeta?.weekKey || currentWeekKey,
          userId: uid,
          visibleTo: rosterUids,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          level: user.level,
          competitionScore: live.competitionScore,
          consistencyRate: live.consistencyRate,
          goalAttainmentRate: live.goalAttainmentRate,
          stabilityRate: live.stabilityRate,
          prevWeekConsistencyRate: live.prevWeekConsistencyRate,
          improvementDelta: live.improvementDelta,
          weeklyXp: live.weeklyXp,
          completedCount: live.completedCount,
          scheduledCount: live.scheduledCount,
          verifiedCount: live.verifiedCount,
          activeDays: live.activeDays,
          seasonStatus: activeSeasonMeta?.status || 'active',
          rewardClaimed: false,
          updatedAt: user.updatedAt,
        };
      }

      const prof = friendProfiles[uid];
      return {
        id: `${activeSeasonId}_${uid}`,
        seasonId: activeSeasonId,
        weekKey: activeSeasonMeta?.weekKey || currentWeekKey,
        userId: uid,
        visibleTo: rosterUids,
        displayName: prof?.displayName || '夥伴',
        avatarUrl: prof?.avatarUrl,
        level: prof?.level || 1,
        competitionScore:
          prof?.weekKey === currentWeekKey ? prof.weeklyCompetitionScore || 0 : 0,
        consistencyRate:
          prof?.weekKey === currentWeekKey ? prof.weeklyConsistencyRate || 0 : 0,
        goalAttainmentRate: 0,
        stabilityRate: 0,
        prevWeekConsistencyRate: 0,
        improvementDelta: 0,
        weeklyXp: prof?.weekKey === currentWeekKey ? prof.weeklyXp || 0 : 0,
        completedCount: 0,
        scheduledCount: 0,
        verifiedCount: 0,
        activeDays: 0,
        seasonStatus: activeSeasonMeta?.status || 'active',
        rewardClaimed: false,
        updatedAt: prof?.updatedAt || user.updatedAt,
      };
    });
  }, [
    selectedPrivateSeason,
    user,
    acceptedFriendUids,
    scores,
    activeSeasonId,
    habits,
    records,
    xpTransactions,
    todayDate,
    activeStartDate,
    activeMinVerif,
    activeSeasonMeta,
    currentWeekKey,
    friendProfiles,
  ]);

  const rankedLeaderboard = useMemo(
    () => sortCompetitionScores(rawSeasonScores, boardType),
    [rawSeasonScores, boardType]
  );

  const scoreOrderedEntries = useMemo(
    () => sortCompetitionScores(rawSeasonScores, 'score'),
    [rawSeasonScores]
  );

  const myRankIndex = rankedLeaderboard.findIndex((e) => e.userId === user.uid);
  const myRank = myRankIndex >= 0 ? myRankIndex + 1 : 1;
  const myEntry = rankedLeaderboard[myRankIndex];

  const myScoreRankIndex = scoreOrderedEntries.findIndex((e) => e.userId === user.uid);
  const myScoreRank = myScoreRankIndex >= 0 ? myScoreRankIndex + 1 : 1;
  const myScoreEntry = scoreOrderedEntries[myScoreRankIndex];

  const gapText = useMemo(() => {
    if (myRankIndex <= 0 || !myEntry) return '暫居當前榜單首位';
    const above = rankedLeaderboard[myRankIndex - 1];
    if (boardType === 'score') {
      const diff = Math.max(0, above.competitionScore - myEntry.competitionScore);
      return `距離上一名差 ${(diff / 10).toFixed(1)} 分`;
    }
    if (boardType === 'consistency') {
      return `距離上一名差 ${Math.max(0, above.consistencyRate - myEntry.consistencyRate)}%`;
    }
    if (boardType === 'improvement') {
      return `距離上一名差 ${Math.max(0, above.improvementDelta - myEntry.improvementDelta)}%`;
    }
    return `距離上一名差 ${Math.max(0, above.weeklyXp - myEntry.weeklyXp)} XP`;
  }, [myRankIndex, myEntry, rankedLeaderboard, boardType]);

  // Persist bestWeeklyRank only when improved (guarded to avoid write loops)
  const bestRankSyncedRef = useRef<number>(user.bestWeeklyRank || 0);
  useEffect(() => {
    if (!myScoreEntry || myScoreEntry.competitionScore <= 0) return;
    const currentBest = user.bestWeeklyRank || 0;
    if (
      (currentBest === 0 || myScoreRank < currentBest) &&
      bestRankSyncedRef.current !== myScoreRank
    ) {
      bestRankSyncedRef.current = myScoreRank;
      updateUserProfileAndSettings(user, { bestWeeklyRank: myScoreRank }).catch(() => {});
    }
  }, [myScoreRank, myScoreEntry, user]);

  const handleCreatePrivateLeague = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leagueName.trim()) {
      showToast('請輸入私人聯賽名稱', 'error');
      return;
    }
    setCreatingLeague(true);
    try {
      const res = await createPrivateLeague({
        creator: user,
        name: leagueName,
        minVerificationLevel: leagueMinVerif,
        todayDate,
      });
      showToast(`已建立私人聯賽，邀請碼：${res.inviteCode}`);
      setSelectedLeagueKey(res.seasonId);
      setLeagueName('');
      setShowCreateLeague(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '建立聯賽失敗', 'error');
    } finally {
      setCreatingLeague(false);
    }
  };

  const handleJoinPrivateLeague = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leagueJoinCode.trim()) return;
    setJoiningLeague(true);
    try {
      const joinedName = await joinPrivateLeagueByCode(leagueJoinCode, user);
      showToast(`已加入私人聯賽「${joinedName}」`);
      setLeagueJoinCode('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '加入聯賽失敗', 'error');
    } finally {
      setJoiningLeague(false);
    }
  };

  const handleSettleSeason = async () => {
    if (!activeSeasonMeta) return;
    setSettlingSeason(true);
    try {
      await settleCompetitionSeason(activeSeasonMeta, scoreOrderedEntries, user);
      showToast('賽季已完成結算，現在可領取對應名次與進步獎勵！');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '結算失敗', 'error');
    } finally {
      setSettlingSeason(false);
    }
  };

  const handleClaimSeasonReward = async (season: CompetitionSeason) => {
    setClaimingSeasonId(season.id);
    try {
      const targetSeasonId =
        season.leagueType === 'circle' ? `circle_${season.weekKey}` : season.id;
      const targetScores =
        targetSeasonId === activeSeasonId
          ? scoreOrderedEntries
          : scores.filter((s) => s.seasonId === targetSeasonId);
      const res = await claimLeagueReward({
        season,
        seasonScores: targetScores,
        currentUser: user,
        publicProfile,
      });
      if (res.xpAwarded > 0 || res.unlockedBadges.length > 0) {
        showToast(
          `已領取賽季結算獎勵${res.xpAwarded > 0 ? ` +${res.xpAwarded} XP` : ''}`,
          'xp'
        );
      } else {
        showToast('已完成本賽季結算確認');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '領取獎勵失敗', 'error');
    } finally {
      setClaimingSeasonId(null);
    }
  };

  const handleStartNextSeason = async () => {
    try {
      const nextWk = await startNextCircleSeason({
        currentUser: user,
        friendUids: acceptedFriendUids,
        fromMondayDate: activeStartDate,
      });
      showToast(`已開啟下一週賽季 ${nextWk}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '開啟新賽季失敗', 'error');
    }
  };

  const shareSummaryText = useMemo(() => {
    const scoreStr = formatCompetitionScore(myScoreEntry?.competitionScore || 0);
    return [
      `KADENCE 週賽季成績卡（${activeStartDate} ~ ${activeEndDate}）`,
      `${user.displayName} · ${getTitleForLevel(user.level).label}（Lv.${user.level}）`,
      `目前排名：#${myScoreRank} / ${scoreOrderedEntries.length} 位參賽者`,
      `綜合競賽分：${scoreStr} / 100.0`,
      `一致性 ${myScoreEntry?.consistencyRate || 0}% · 目標達成 ${myScoreEntry?.goalAttainmentRate || 0}% · 穩定度 ${myScoreEntry?.stabilityRate || 0}%`,
      `邀請好友一起自律：${window.location.origin}/?invite=${user.inviteCode}`,
    ].join('\n');
  }, [
    myScoreEntry,
    activeStartDate,
    activeEndDate,
    user,
    myScoreRank,
    scoreOrderedEntries.length,
  ]);

  const handleCreateDuel = async (e: React.FormEvent) => {
    e.preventDefault();
    const opponent = friendProfiles[opponentUid];
    if (!opponent) {
      showToast('請先選擇一位好友作為對手', 'error');
      return;
    }
    setCreatingDuel(true);
    try {
      const endDate = addDaysLocal(todayDate, Math.max(1, duelDays - 1));
      await createChallenge({
        creator: user,
        opponent,
        title: duelTitle,
        templateKey: selectedTemplateKey || undefined,
        habitTitle: duelHabitTitle,
        habitIcon: duelHabitIcon || (duelRecordType === 'time' ? 'sun' : 'target'),
        recordType: duelRecordType,
        targetValue: duelTargetValue,
        targetTime: duelRecordType === 'time' ? duelTargetTime : undefined,
        dailyCap: duelRecordType === 'value' ? duelDailyCap : 1,
        unit: duelUnit,
        startDate: todayDate,
        endDate,
        ruleType: duelRuleType,
        scoringMethod: duelScoringMethod,
        requiredVerificationLevel: duelReqVerif,
        xpPrize: duelXpPrize,
        creatorLinkedHabitId: duelLinkedHabitId,
      });
      showToast(`已向 ${opponent.displayName} 發送 1v1 挑戰邀請（規則已鎖定）`);
      setShowDuelModal(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '建立挑戰失敗', 'error');
    } finally {
      setCreatingDuel(false);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) {
      showToast('請輸入團隊名稱', 'error');
      return;
    }
    setCreatingTeam(true);
    try {
      const endDate = addDaysLocal(todayDate, Math.max(1, teamDays - 1));
      const meta = TEAM_GOAL_TYPE_LABELS[teamGoalType];
      const res = await createTeam({
        creator: user,
        name: teamName,
        description: teamDesc,
        goalTitle: teamGoalTitle,
        goalType: teamGoalType,
        goalUnit: meta.unit,
        minMemberContribution: teamMinContrib,
        targetTotalCompletions: teamTargetCount,
        startDate: todayDate,
        endDate,
        xpPrize: teamXpPrize,
      });
      showToast(`已建立團隊，邀請碼：${res.inviteCode}`);
      setShowCreateTeam(false);
      setTeamName('');
      setTeamDesc('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '建立團隊失敗', 'error');
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) return;
    setJoiningTeam(true);
    try {
      const joinedName = await joinTeamByCode(joinCodeInput, user);
      showToast(`已成功加入團隊「${joinedName}」`);
      setJoinCodeInput('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '加入團隊失敗', 'error');
    } finally {
      setJoiningTeam(false);
    }
  };

  return (
    <div className="space-y-7">
      {/* Header & Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            競爭與挑戰
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            公平標準化的週賽季聯賽、1 VS 1 規則鎖定對決與團隊共同目標。
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[var(--bg-subtle)] border border-[var(--border-hairline)] rounded-xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setMode('leaderboard')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              mode === 'leaderboard'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Weekly League
          </button>
          <button
            type="button"
            onClick={() => setMode('duels')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              mode === 'duels'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            1 VS 1 挑戰
          </button>
          <button
            type="button"
            onClick={() => setMode('teams')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              mode === 'teams'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            團隊挑戰
          </button>
        </div>
      </div>

      {/* MODE 1: WEEKLY LEAGUE */}
      {mode === 'leaderboard' && (
        <div className="space-y-6">
          {/* League Selector & Private League Controls */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setSelectedLeagueKey('circle')}
                className={`h-9 px-3.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                  selectedLeagueKey === 'circle'
                    ? 'bg-[var(--control-active-bg)] text-[var(--control-active-fg)] border-transparent'
                    : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:text-[var(--text-primary)]'
                }`}
              >
                好友圈週聯賽（{currentWeekKey}）
              </button>
              {activePrivateLeagues.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => setSelectedLeagueKey(pl.id)}
                  className={`h-9 px-3.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer flex items-center gap-1.5 ${
                    selectedLeagueKey === pl.id
                      ? 'bg-[var(--control-active-bg)] text-[var(--control-active-fg)] border-transparent'
                      : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Lock className="w-3 h-3" strokeWidth={1.75} />
                  <span>{pl.name}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <form onSubmit={handleJoinPrivateLeague} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={leagueJoinCode}
                  onChange={(e) => setLeagueJoinCode(e.target.value)}
                  placeholder="聯賽碼 LG-..."
                  className="w-32 h-9 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs font-mono-tabular text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
                <button
                  type="submit"
                  disabled={joiningLeague || !leagueJoinCode.trim()}
                  className="h-9 px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-xs font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)] disabled:opacity-50 cursor-pointer"
                >
                  {joiningLeague ? '加入中' : '加入聯賽'}
                </button>
              </form>
              <button
                type="button"
                onClick={() => setShowCreateLeague(true)}
                className="h-9 px-3.5 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] text-xs font-semibold flex items-center gap-1.5 hover:bg-[var(--accent-primary-hover)] transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>建立私人聯賽</span>
              </button>
            </div>
          </div>

          {/* KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div
              style={{ boxShadow: 'var(--shadow-card)' }}
              className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-5 space-y-1.5"
            >
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>當前榜單排名</span>
                <span className="font-mono-tabular">剩餘 {daysRemaining} 天</span>
              </div>
              <div className="font-mono-tabular text-2xl font-semibold text-[var(--text-primary)]">
                #{myRank}
                <span className="text-xs text-[var(--text-muted)] font-normal ml-1.5">
                  / {rankedLeaderboard.length} 人
                </span>
              </div>
              <div className="text-xs text-[var(--text-secondary)]">{gapText}</div>
            </div>

            <div
              style={{ boxShadow: 'var(--shadow-card)' }}
              className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-5 space-y-1.5"
            >
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>本週綜合競賽分</span>
                <span className="font-mono-tabular">滿分 100.0</span>
              </div>
              <div className="font-mono-tabular text-2xl font-semibold text-[var(--accent-primary)]">
                {formatCompetitionScore(myScoreEntry?.competitionScore || 0)}
              </div>
              <div className="text-xs text-[var(--text-secondary)] font-mono-tabular">
                一致 {myScoreEntry?.consistencyRate || 0}% · 達標 {myScoreEntry?.goalAttainmentRate || 0}% · 穩定 {myScoreEntry?.stabilityRate || 0}%
              </div>
            </div>

            <div
              style={{ boxShadow: 'var(--shadow-card)' }}
              className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-5 space-y-1.5"
            >
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>參賽習慣上限 & 最佳名次</span>
                <span className="font-mono-tabular">
                  {eligibleCompHabits.length}/{MAX_COMPETITION_HABITS} 項
                </span>
              </div>
              <div className="font-mono-tabular text-2xl font-semibold text-[var(--accent-warning)]">
                {user.bestWeeklyRank && user.bestWeeklyRank > 0
                  ? `#${user.bestWeeklyRank}`
                  : '—'}
              </div>
              <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                <span>依週一至週日標準化計分</span>
                <button
                  type="button"
                  onClick={() => setShowRulesInfo((v) => !v)}
                  className="text-[var(--accent-primary)] hover:underline cursor-pointer"
                >
                  {showRulesInfo ? '收起規則' : '計分規則'}
                </button>
              </div>
            </div>
          </div>

          {/* Fair Rule Explainer (Collapsible) */}
          {showRulesInfo && (
            <div className="bg-[var(--bg-subtle)] border border-[var(--border-hairline)] rounded-2xl p-5 space-y-2.5 text-xs text-[var(--text-secondary)] leading-relaxed">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--text-primary)]">
                  XP 與競賽積分分離原則（防洗分設計）
                </span>
                <span className="font-mono-tabular text-[11px] text-[var(--text-muted)] flex items-center gap-1">
                  <Lock className="w-3 h-3" strokeWidth={1.75} />
                  規則已鎖定（60 / 25 / 15）
                </span>
              </div>
              <p>
                1. <strong>Personal Habits vs Competition Habits</strong>：只有標記為「競賽習慣」的項目（最多 {MAX_COMPETITION_HABITS} 項）會計入每週聯賽，避免新增大量簡單任務刷分。
              </p>
              <p>
                2. <strong>標準化競賽分數（0.0 ~ 100.0）</strong>：60% 週一致性（應打卡次數達標率）＋ 25% 目標達成率（跨單位標準化至 0~100%）＋ 15% 穩定度（活躍天數比）。
              </p>
              <p>
                3. <strong>分層獎勵與進步激勵</strong>：賽季結算第 1 名 +100 XP、前 3 名 +60 XP、週一致率 ≥80% 參與獎 +40 XP、最佳進步幅度 +50 XP。
              </p>
            </div>
          )}

          {/* Season Status Action Bar & Board Switcher */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 bg-[var(--bg-subtle)] border border-[var(--border-hairline)] rounded-xl self-start overflow-x-auto max-w-full">
              {(
                [
                  { id: 'score', label: '綜合競賽分' },
                  { id: 'consistency', label: '一致性排行' },
                  { id: 'improvement', label: '進步幅度' },
                  { id: 'xp', label: '本週 XP' },
                ] as const
              ).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBoardType(b.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    boardType === b.id
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {selectedPrivateSeason?.inviteCode && (
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard
                      .writeText(selectedPrivateSeason.inviteCode || '')
                      .catch(() => {});
                    showToast(`已複製聯賽邀請碼 ${selectedPrivateSeason.inviteCode}`);
                  }}
                  className="h-9 px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-xs font-mono-tabular text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>{selectedPrivateSeason.inviteCode}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowShareModal(true)}
                className="h-9 px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-xs font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)] flex items-center gap-1.5 cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>分享週成績卡</span>
              </button>

              {activeSeasonMeta &&
                activeSeasonMeta.status === 'active' &&
                (activeSeasonMeta.creatorId === user.uid ||
                  activeSeasonMeta.leagueType === 'circle') && (
                  <button
                    type="button"
                    disabled={settlingSeason}
                    onClick={handleSettleSeason}
                    className="h-9 px-3.5 rounded-xl bg-[var(--control-active-bg)] text-[var(--control-active-fg)] text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50 cursor-pointer"
                  >
                    <Calendar className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>{settlingSeason ? '結算中...' : '結算本賽季'}</span>
                  </button>
                )}

              {activeSeasonMeta &&
                activeSeasonMeta.status === 'settled' &&
                !myScoreEntry?.rewardClaimed && (
                  <button
                    type="button"
                    disabled={claimingSeasonId === activeSeasonMeta.id}
                    onClick={() => handleClaimSeasonReward(activeSeasonMeta)}
                    className="h-9 px-3.5 rounded-xl bg-[var(--accent-warning)] text-[#151614] text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>領取賽季結算獎勵</span>
                  </button>
                )}

              {activeSeasonMeta &&
                activeSeasonMeta.status === 'settled' &&
                activeSeasonMeta.leagueType === 'circle' && (
                  <button
                    type="button"
                    onClick={handleStartNextSeason}
                    className="h-9 px-3.5 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] text-xs font-semibold cursor-pointer"
                  >
                    開啟下一週賽季
                  </button>
                )}
            </div>
          </div>

          {/* Season Verification & Window Banner */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs text-[var(--text-secondary)]">
            <div className="flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-[var(--accent-primary)]" strokeWidth={1.75} />
              <span>
                賽季期間：{activeStartDate} ~ {activeEndDate} · 規則已鎖定（一致 60% / 達標 25% / 穩定 15%）
              </span>
            </div>
            <div className="flex items-center gap-1.5 font-mono-tabular text-[11px]">
              {activeMinVerif === 'verified' ? (
                <span className="inline-flex items-center gap-1 text-[var(--accent-primary)] font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
                  僅採計 Verified 打卡
                </span>
              ) : (
                <span className="text-[var(--text-muted)]">採計全部有效競賽打卡</span>
              )}
            </div>
          </div>

          {/* Leaderboard Table */}
          <div
            style={{ boxShadow: 'var(--shadow-card)' }}
            className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl divide-y divide-[var(--border-hairline)] overflow-hidden"
          >
            {rankedLeaderboard.map((entry, idx) => {
              const rank = idx + 1;
              const isMe = entry.userId === user.uid;
              const isTopThree = rank <= 3;
              const titleDef = getTitleForLevel(entry.level || 1);

              const primaryValue =
                boardType === 'score'
                  ? `${formatCompetitionScore(entry.competitionScore)} 分`
                  : boardType === 'consistency'
                  ? `${entry.consistencyRate}%`
                  : boardType === 'improvement'
                  ? `${entry.improvementDelta >= 0 ? '+' : ''}${entry.improvementDelta}%`
                  : `${entry.weeklyXp} XP`;

              const secondaryDetail =
                boardType === 'score'
                  ? `一致 ${entry.consistencyRate}% · 達標 ${entry.goalAttainmentRate}% · 活躍 ${entry.activeDays}天`
                  : boardType === 'consistency'
                  ? `競賽分 ${formatCompetitionScore(entry.competitionScore)} · 完成 ${entry.completedCount}/${entry.scheduledCount}`
                  : boardType === 'improvement'
                  ? `本週 ${entry.consistencyRate}%（上週 ${entry.prevWeekConsistencyRate}%）`
                  : `競賽分 ${formatCompetitionScore(entry.competitionScore)} · 一致率 ${entry.consistencyRate}%`;

              return (
                <div
                  key={entry.userId}
                  className={`px-5 py-4 flex items-center justify-between gap-4 transition-colors ${
                    isMe ? 'bg-[var(--bg-subtle)]/75' : ''
                  }`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span
                      className={`font-mono-tabular text-sm w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        rank === 1
                          ? 'bg-[var(--accent-primary-soft)] text-[var(--accent-primary)] font-semibold'
                          : isTopThree
                          ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)] font-semibold'
                          : 'text-[var(--text-muted)] font-medium'
                      }`}
                    >
                      {String(rank).padStart(2, '0')}
                    </span>

                    {entry.avatarUrl ? (
                      <img
                        src={entry.avatarUrl}
                        alt={entry.displayName}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-full object-cover border border-[var(--border-hairline)] shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-center text-sm font-semibold text-[var(--text-primary)] shrink-0">
                        {entry.displayName.slice(0, 1).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                          {entry.displayName}
                        </span>
                        {isMe && (
                          <span className="text-[11px] text-[var(--accent-primary)] font-medium">
                            你
                          </span>
                        )}
                        <span className="text-[11px] text-[var(--text-muted)] hidden sm:inline">
                          {titleDef.label}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--text-muted)] font-mono-tabular truncate">
                        Lv.{entry.level || 1} · {secondaryDetail}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono-tabular text-base font-semibold text-[var(--text-primary)]">
                      {primaryValue}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] font-mono-tabular">
                      {entry.verifiedCount > 0
                        ? `${entry.verifiedCount} 次已驗證`
                        : `${entry.weeklyXp} XP`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Historical Settled Seasons */}
          {settledSeasons.length > 0 && (
            <section className="space-y-3 pt-2">
              <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
                <History className="w-4 h-4 text-[var(--accent-primary)]" strokeWidth={1.75} />
                <span>歷史賽季結算紀錄（{settledSeasons.length}）</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {settledSeasons.map((season) => {
                  const targetSeasonId =
                    season.leagueType === 'circle' ? `circle_${season.weekKey}` : season.id;
                  const myScoreDoc = scores.find(
                    (s) => s.seasonId === targetSeasonId && s.userId === user.uid
                  );
                  const winnerName =
                    season.winnerId === user.uid
                      ? user.displayName
                      : friendProfiles[season.winnerId || '']?.displayName || '冠軍';

                  return (
                    <div
                      key={season.id}
                      style={{ boxShadow: 'var(--shadow-card)' }}
                      className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-4 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="text-sm font-semibold text-[var(--text-primary)] truncate">
                          {season.name}
                        </div>
                        <div className="text-xs text-[var(--text-muted)] font-mono-tabular">
                          {season.startDate} ~ {season.endDate} · 冠軍 {winnerName}
                        </div>
                        {myScoreDoc && (
                          <div className="text-xs text-[var(--text-secondary)] font-mono-tabular">
                            你的成績：{formatCompetitionScore(myScoreDoc.competitionScore)} 分（一致率 {myScoreDoc.consistencyRate}%）
                          </div>
                        )}
                      </div>
                      {myScoreDoc && !myScoreDoc.rewardClaimed ? (
                        <button
                          type="button"
                          disabled={claimingSeasonId === season.id}
                          onClick={() => handleClaimSeasonReward(season)}
                          className="h-9 px-3 rounded-xl bg-[var(--accent-warning)] text-[#151614] text-xs font-semibold shrink-0 cursor-pointer"
                        >
                          領取獎勵
                        </button>
                      ) : (
                        <span className="text-[11px] font-mono-tabular text-[var(--text-muted)] shrink-0">
                          已結算
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {/* MODE 2: 1 VS 1 CHALLENGES */}
      {mode === 'duels' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium text-[var(--text-secondary)]">
              進行中與歷史對決（{challenges.length}）
            </h2>
            <button
              type="button"
              onClick={() => {
                if (acceptedFriendUids.length === 0) {
                  showToast('請先在 Friends 頁面新增好友才能發起 1v1 挑戰', 'error');
                  return;
                }
                setOpponentUid(acceptedFriendUids[0] || '');
                applyTemplate(selectedTemplateKey || 'early_bird');
                setShowDuelModal(true);
              }}
              className="h-10 px-4 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] text-xs font-semibold flex items-center gap-1.5 hover:bg-[var(--accent-primary-hover)] transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              <span>發起 1 VS 1 挑戰</span>
            </button>
          </div>

          {challenges.length === 0 ? (
            <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-8 text-center space-y-3">
              <Swords className="w-6 h-6 text-[var(--accent-warning)] mx-auto" strokeWidth={1.75} />
              <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
                還沒有進行中的對決
              </h3>
              <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
                選擇標準挑戰模板與好友展開 7 天或 14 天對決，挑戰規則建立後自動鎖定並設有每日計分上限。
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {challenges.map((ch) => {
                const members = challengeMembers.filter((m) => m.challengeId === ch.id);
                const creatorM = members.find((m) => m.userId === ch.creatorId);
                const oppM = members.find((m) => m.userId === ch.opponentId);
                const myM = members.find((m) => m.userId === user.uid);
                const isOpponentPending =
                  ch.status === 'pending' && ch.opponentId === user.uid;
                const scoringMethod: ChallengeScoringMethod =
                  ch.scoringMethod ||
                  (ch.ruleType === 'highest_rate' ? 'completion_rate' : 'valid_count');

                return (
                  <div
                    key={ch.id}
                    style={{ boxShadow: 'var(--shadow-card)' }}
                    className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-5 space-y-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--accent-primary)] shrink-0">
                          <HabitIcon name={ch.habitIcon} className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                              {ch.title}
                            </h3>
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-[var(--text-muted)] shrink-0">
                              <Lock className="w-2.5 h-2.5" strokeWidth={1.75} />
                              規則鎖定
                            </span>
                          </div>
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">
                            {ch.habitTitle} ·{' '}
                            {ch.recordType === 'time'
                              ? `${ch.targetTime} 前完成`
                              : ch.recordType === 'value'
                              ? `${ch.targetValue} ${ch.unit}${ch.dailyCap ? `（日上限 ${ch.dailyCap}）` : ''}`
                              : '每日完成'}{' '}
                            · {ch.startDate} ~ {ch.endDate}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-mono-tabular text-xs font-semibold text-[var(--accent-warning)] block">
                          {ch.xpPrize} XP
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {SCORING_METHOD_LABELS[scoringMethod]}
                        </span>
                      </div>
                    </div>

                    {ch.requiredVerificationLevel === 'verified' && (
                      <div className="flex items-center gap-1.5 text-[11px] text-[var(--accent-primary)]">
                        <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
                        <span>此挑戰需照片或專注計時驗證達標才計分</span>
                      </div>
                    )}

                    {/* Scoreboard */}
                    <div className="grid grid-cols-2 gap-3">
                      {[creatorM, oppM].map((m, i) => {
                        if (!m) return null;
                        const isWinner =
                          ch.status === 'completed' && ch.winnerId === m.userId;
                        const primaryStat =
                          scoringMethod === 'capped_total_value'
                            ? `${m.effectiveValue ?? m.completionsCount}`
                            : `${m.completionsCount}`;
                        const primaryUnit =
                          scoringMethod === 'capped_total_value'
                            ? ch.unit
                            : `/ ${ch.totalDays} 天`;

                        return (
                          <div
                            key={m.id || i}
                            className={`p-3.5 rounded-xl border ${
                              isWinner
                                ? 'bg-[var(--accent-primary-soft)] border-[var(--accent-primary)]/40'
                                : 'bg-[var(--bg-subtle)] border-[var(--border-hairline)]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                                {m.displayName}
                              </span>
                              {isWinner && (
                                <Trophy className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" strokeWidth={1.75} />
                              )}
                            </div>
                            <div className="font-mono-tabular text-xl font-semibold text-[var(--text-primary)] mt-1">
                              {primaryStat}
                              <span className="text-xs text-[var(--text-muted)] font-normal ml-1">
                                {primaryUnit}
                              </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-[var(--bg-surface)] mt-2 overflow-hidden">
                              <div
                                className="h-full bg-[var(--accent-primary)] rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(100, m.completionRate)}%` }}
                              />
                            </div>
                            <div className="text-[11px] text-[var(--text-muted)] font-mono-tabular mt-1">
                              完成率 {m.completionRate}%
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Linked Habit Selector when Active */}
                    {ch.status === 'active' && myM && (
                      <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--border-hairline)]">
                        <span className="text-xs text-[var(--text-muted)] shrink-0">綁定計分習慣：</span>
                        <select
                          value={myM.linkedHabitId}
                          onChange={async (e) => {
                            await linkChallengeHabit(myM.id, e.target.value);
                            showToast('已更新挑戰綁定習慣');
                          }}
                          className="flex-1 h-9 px-2.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                        >
                          <option value="">自動比對同名習慣「{ch.habitTitle}」</option>
                          {habits.map((h) => (
                            <option key={h.id} value={h.id}>
                              {h.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-xs text-[var(--text-muted)]">
                        {ch.status === 'pending'
                          ? ch.creatorId === user.uid
                            ? '等待對方接受邀請'
                            : '邀請你加入挑戰'
                          : ch.status === 'declined'
                          ? '已婉拒'
                          : ch.status === 'completed'
                          ? ch.winnerId === 'tie'
                            ? '平手結算'
                            : `勝者：${
                                members.find((m) => m.userId === ch.winnerId)?.displayName || ''
                              }`
                          : '進行中 · 打卡將自動同步成績'}
                      </span>

                      <div className="flex items-center gap-2">
                        {isOpponentPending && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setAcceptingChallenge(ch);
                                const matched = habits.find((h) => h.title === ch.habitTitle);
                                setAcceptHabitId(matched?.id || '');
                              }}
                              className="h-9 px-3.5 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] text-xs font-semibold cursor-pointer"
                            >
                              接受挑戰
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await respondChallenge(ch, 'declined');
                                showToast('已婉拒挑戰');
                              }}
                              className="h-9 px-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs text-[var(--text-secondary)] cursor-pointer"
                            >
                              婉拒
                            </button>
                          </>
                        )}

                        {ch.status === 'active' && (
                          <button
                            type="button"
                            onClick={async () => {
                              const winner = await settleChallenge(
                                ch,
                                members,
                                user,
                                publicProfile
                              );
                              showToast(
                                winner === user.uid
                                  ? `恭喜勝出！獲得 +${ch.xpPrize} XP`
                                  : '挑戰已結算完成',
                                winner === user.uid ? 'xp' : 'success'
                              );
                            }}
                            className="h-9 px-3.5 rounded-lg bg-[var(--control-active-bg)] text-[var(--control-active-fg)] text-xs font-semibold cursor-pointer"
                          >
                            {todayDate >= ch.endDate ? '結算成績' : '提前結算'}
                          </button>
                        )}

                        {ch.status === 'completed' &&
                          ch.winnerId === user.uid &&
                          myM &&
                          !myM.claimedReward && (
                            <button
                              type="button"
                              onClick={async () => {
                                const ok = await claimChallengeReward(ch, user, publicProfile);
                                if (ok) showToast(`已領取勝利獎勵 +${ch.xpPrize} XP`, 'xp');
                              }}
                              className="h-9 px-3.5 rounded-lg bg-[var(--accent-warning)] text-[#151614] text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
                            >
                              領取 +{ch.xpPrize} XP
                            </button>
                          )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODE 3: TEAM CHALLENGES */}
      {mode === 'teams' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <form
              onSubmit={handleJoinTeam}
              style={{ boxShadow: 'var(--shadow-card)' }}
              className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-3"
            >
              <input
                type="text"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value)}
                placeholder="輸入團隊邀請碼（如 TM-XXXXXX）"
                className="flex-1 h-10 px-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm font-mono-tabular text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
              />
              <button
                type="submit"
                disabled={joiningTeam || !joinCodeInput.trim()}
                className="h-10 px-4 rounded-xl bg-[var(--control-active-bg)] text-[var(--control-active-fg)] text-xs font-semibold whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
              >
                {joiningTeam ? '加入中...' : '加入私人團隊'}
              </button>
            </form>

            <div
              style={{ boxShadow: 'var(--shadow-card)' }}
              className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-5 flex items-center justify-between gap-4"
            >
              <div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  建立團隊挑戰（3～10 人）
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5">
                  設定共同目標與最低個人貢獻門檻，防止搭便車。
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateTeam(true)}
                className="h-10 px-4 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] text-xs font-semibold whitespace-nowrap shrink-0 flex items-center gap-1.5 hover:bg-[var(--accent-primary-hover)] transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                <span>建立團隊</span>
              </button>
            </div>
          </div>

          {teams.length === 0 ? (
            <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-8 text-center space-y-2">
              <Users className="w-6 h-6 text-[var(--accent-primary)] mx-auto" strokeWidth={1.75} />
              <p className="text-sm font-medium text-[var(--text-primary)]">尚未加入任何團隊挑戰</p>
              <p className="text-xs text-[var(--text-muted)]">
                建立一個團隊並把邀請碼分享給朋友，或輸入朋友給你的團隊碼。
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {teams.map((team) => {
                const members = teamMembersMap[team.id] || [];
                const myMember = members.find((m) => m.userId === user.uid);
                const gType: TeamGoalType = team.goalType || 'total_completions';
                const goalMeta = TEAM_GOAL_TYPE_LABELS[gType];
                const unit = team.goalUnit || goalMeta.unit;
                const minReq = team.minMemberContribution ?? 1;
                const meetsMinContrib = (myMember?.contributionCount ?? 0) >= minReq;
                const pct = Math.min(
                  100,
                  Math.round(
                    (team.currentTotalCompletions / Math.max(1, team.targetTotalCompletions)) *
                      100
                  )
                );

                return (
                  <div
                    key={team.id}
                    style={{ boxShadow: 'var(--shadow-card)' }}
                    className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-5 space-y-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-display text-base font-semibold text-[var(--text-primary)] truncate">
                            {team.name}
                          </h3>
                          {team.achievementUnlocked && (
                            <Award className="w-4 h-4 text-[var(--accent-warning)] shrink-0" strokeWidth={1.75} />
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">{team.goalTitle}</p>
                        <p className="text-[11px] text-[var(--text-muted)] font-mono-tabular mt-1">
                          {goalMeta.label} · 成員 {team.memberCount}/{team.maxMembers} · {team.startDate} ~ {team.endDate}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(team.inviteCode).catch(() => {});
                          showToast(`已複製團隊邀請碼 ${team.inviteCode}`);
                        }}
                        className="h-8 px-2.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[11px] font-mono-tabular text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                      >
                        <Copy className="w-3 h-3" strokeWidth={1.75} />
                        <span>{team.inviteCode}</span>
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[var(--text-secondary)]">
                          團隊總進度（個人領獎門檻：≥ {minReq} {unit}）
                        </span>
                        <span className="font-mono-tabular font-semibold text-[var(--accent-primary)]">
                          {team.currentTotalCompletions} / {team.targetTotalCompletions} {unit}（{pct}%）
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
                        <div
                          className="h-full bg-[var(--accent-primary)] rounded-full transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-[var(--border-hairline)]">
                      <div className="text-xs text-[var(--text-muted)]">成員貢獻度</div>
                      <div className="space-y-2">
                        {members
                          .slice()
                          .sort((a, b) => b.contributionCount - a.contributionCount)
                          .map((m) => (
                            <div
                              key={m.id}
                              className="flex items-center justify-between text-xs"
                            >
                              <span className="text-[var(--text-primary)] truncate">
                                {m.displayName}
                                {m.userId === user.uid ? '（你）' : ''}
                              </span>
                              <span className="font-mono-tabular text-[var(--text-secondary)]">
                                {m.contributionCount} {unit}貢獻
                                {m.contributionCount >= minReq ? ' · 已達門檻' : ''}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>

                    {team.achievementUnlocked && myMember && !myMember.claimedReward && (
                      <div className="space-y-2">
                        {!meetsMinContrib && (
                          <p className="text-[11px] text-[var(--accent-warning)]">
                            需個人累積貢獻達 {minReq} {unit}（目前 {myMember.contributionCount}）方可領取團隊目標獎勵。
                          </p>
                        )}
                        <button
                          type="button"
                          disabled={!meetsMinContrib}
                          onClick={async () => {
                            try {
                              const ok = await claimTeamReward(team, myMember, user, publicProfile);
                              if (ok) showToast(`已解鎖團隊成就並領取 +${team.xpPrize} XP`, 'xp');
                            } catch (err) {
                              showToast(
                                err instanceof Error ? err.message : '尚未達領取條件',
                                'error'
                              );
                            }
                          }}
                          className="w-full h-10 rounded-xl bg-[var(--accent-warning)] text-[#151614] text-xs font-semibold hover:opacity-90 disabled:opacity-45 transition-opacity cursor-pointer"
                        >
                          領取團隊目標獎勵 +{team.xpPrize} XP
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CREATE PRIVATE LEAGUE MODAL */}
      {showCreateLeague && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm p-0 sm:p-4">
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ boxShadow: 'var(--shadow-modal)' }}
            className="w-full sm:max-w-md bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-t-2xl sm:rounded-2xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-[var(--border-hairline)] flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
                建立私人週聯賽（3～10 人）
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateLeague(false)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </div>
            <form onSubmit={handleCreatePrivateLeague} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-[var(--text-secondary)]">聯賽名稱</label>
                <input
                  type="text"
                  maxLength={64}
                  value={leagueName}
                  onChange={(e) => setLeagueName(e.target.value)}
                  placeholder="例如：自律實驗室 W48"
                  className="w-full h-11 px-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-[var(--text-secondary)]">驗證門檻</label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'basic', title: '標準模式', desc: '採計全部競賽打卡' },
                      { id: 'verified', title: '嚴格驗證', desc: '僅照片或計時 ≥60s' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setLeagueMinVerif(opt.id)}
                      className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                        leagueMinVerif === opt.id
                          ? 'bg-[var(--accent-primary-soft)] border-[var(--accent-primary)] text-[var(--text-primary)]'
                          : 'bg-[var(--bg-subtle)] border-[var(--border-hairline)] text-[var(--text-secondary)]'
                      }`}
                    >
                      <div className="text-xs font-semibold">{opt.title}</div>
                      <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[11px] text-[var(--text-muted)] leading-relaxed">
                賽季時間自動鎖定為本週一至週日（{weekBounds.startDate} ~ {weekBounds.endDate}），採 60% 一致性 + 25% 達標率 + 15% 穩定度公平計分。
              </div>

              <button
                type="submit"
                disabled={creatingLeague}
                className="w-full h-11 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] text-sm font-semibold hover:bg-[var(--accent-primary-hover)] transition-colors cursor-pointer"
              >
                {creatingLeague ? '建立中...' : '建立私人聯賽並產生邀請碼'}
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* SHARE WEEKLY RESULT MODAL */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{ boxShadow: 'var(--shadow-modal)' }}
            className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-[var(--border-hairline)] flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
                本週競賽成績卡
              </h3>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-display text-xs tracking-[0.1em] text-[var(--text-muted)]">
                    KADENCE · {activeSeasonMeta?.weekKey || currentWeekKey}
                  </span>
                  <span className="font-mono-tabular text-xs text-[var(--accent-primary)] font-semibold">
                    #{myScoreRank} / {scoreOrderedEntries.length}
                  </span>
                </div>
                <div>
                  <div className="text-base font-semibold text-[var(--text-primary)]">
                    {user.displayName}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {getTitleForLevel(user.level).label} · Lv.{user.level}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[var(--border-hairline)] text-center">
                  <div>
                    <div className="font-mono-tabular text-lg font-semibold text-[var(--accent-primary)]">
                      {formatCompetitionScore(myScoreEntry?.competitionScore || 0)}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">綜合競賽分</div>
                  </div>
                  <div>
                    <div className="font-mono-tabular text-lg font-semibold text-[var(--text-primary)]">
                      {myScoreEntry?.consistencyRate || 0}%
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">週一致性</div>
                  </div>
                  <div>
                    <div className="font-mono-tabular text-lg font-semibold text-[var(--accent-warning)]">
                      {user.currentStreak}天
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">連續節律</div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(shareSummaryText).catch(() => {});
                  showToast('已複製週成績卡與邀請連結');
                  setShowShareModal(false);
                }}
                className="w-full h-11 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[var(--accent-primary-hover)] transition-colors cursor-pointer"
              >
                <Copy className="w-4 h-4" strokeWidth={1.75} />
                <span>複製成績卡分享文字</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* CREATE 1V1 CHALLENGE MODAL */}
      {showDuelModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm p-0 sm:p-4">
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ boxShadow: 'var(--shadow-modal)' }}
            className="w-full sm:max-w-lg bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-t-2xl sm:rounded-2xl overflow-hidden max-h-[90dvh] flex flex-col"
          >
            <div className="px-6 py-4 border-b border-[var(--border-hairline)] flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
                發起 1 VS 1 好友挑戰
              </h3>
              <button
                type="button"
                onClick={() => setShowDuelModal(false)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </div>
            <form onSubmit={handleCreateDuel} className="p-6 overflow-y-auto space-y-4">
              {/* 5 Standard Templates */}
              <div className="space-y-1.5">
                <label className="text-xs text-[var(--text-secondary)]">快速套用公平挑戰模板</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {CHALLENGE_TEMPLATES.map((tpl) => {
                    const active = selectedTemplateKey === tpl.key;
                    return (
                      <button
                        key={tpl.key}
                        type="button"
                        onClick={() => applyTemplate(tpl.key)}
                        className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                          active
                            ? 'bg-[var(--accent-primary-soft)] border-[var(--accent-primary)]'
                            : 'bg-[var(--bg-subtle)] border-[var(--border-hairline)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {tpl.title}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                          {tpl.subtitle}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-[var(--text-secondary)]">選擇對手</label>
                <select
                  value={opponentUid}
                  onChange={(e) => setOpponentUid(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  required
                >
                  {acceptedFriendUids.map((uid) => {
                    const prof = friendProfiles[uid];
                    if (!prof) return null;
                    return (
                      <option key={uid} value={uid}>
                        {prof.displayName}（@{prof.username}）
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-[var(--text-secondary)]">挑戰名稱</label>
                <input
                  type="text"
                  maxLength={64}
                  value={duelTitle}
                  onChange={(e) => setDuelTitle(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-[var(--text-secondary)]">挑戰習慣關鍵詞</label>
                  <input
                    type="text"
                    maxLength={48}
                    value={duelHabitTitle}
                    onChange={(e) => setDuelHabitTitle(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[var(--text-secondary)]">計分方式</label>
                  <select
                    value={duelScoringMethod}
                    onChange={(e) => {
                      const next = e.target.value as ChallengeScoringMethod;
                      setDuelScoringMethod(next);
                      setDuelRuleType(
                        next === 'completion_rate' ? 'highest_rate' : 'most_completions'
                      );
                    }}
                    className="w-full h-11 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  >
                    <option value="valid_count">有效達標次數</option>
                    <option value="capped_total_value">每日上限累積數值</option>
                    <option value="completion_rate">達標完成率 %</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-[var(--text-secondary)]">判定類型</label>
                  <select
                    value={duelRecordType}
                    onChange={(e) => setDuelRecordType(e.target.value as HabitRecordType)}
                    className="w-full h-11 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  >
                    <option value="time">時間達標</option>
                    <option value="value">數值達標</option>
                    <option value="check">完成次數</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[var(--text-secondary)]">驗證門檻</label>
                  <select
                    value={duelReqVerif}
                    onChange={(e) => setDuelReqVerif(e.target.value as 'basic' | 'verified')}
                    className="w-full h-11 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  >
                    <option value="basic">標準打卡</option>
                    <option value="verified">需照片 / 計時 ≥60s</option>
                  </select>
                </div>
              </div>

              {duelRecordType === 'time' && (
                <div className="space-y-1.5">
                  <label className="text-xs text-[var(--text-secondary)]">目標時間（需在此時間前完成）</label>
                  <input
                    type="time"
                    value={duelTargetTime}
                    onChange={(e) => setDuelTargetTime(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm font-mono-tabular text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              )}

              {duelRecordType === 'value' && (
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="space-y-1.5">
                    <label className="text-xs text-[var(--text-secondary)]">每日低標</label>
                    <input
                      type="number"
                      min={1}
                      value={duelTargetValue}
                      onChange={(e) => setDuelTargetValue(Number(e.target.value))}
                      className="w-full h-11 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm font-mono-tabular text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-[var(--text-secondary)]">每日計分上限</label>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={duelDailyCap}
                      onChange={(e) => setDuelDailyCap(Number(e.target.value))}
                      className="w-full h-11 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm font-mono-tabular text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-[var(--text-secondary)]">單位</label>
                    <input
                      type="text"
                      value={duelUnit}
                      onChange={(e) => setDuelUnit(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-[var(--text-secondary)]">挑戰天數</label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={duelDays}
                    onChange={(e) => setDuelDays(Number(e.target.value))}
                    className="w-full h-11 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm font-mono-tabular text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[var(--text-secondary)]">勝者獎勵 XP（10~200）</label>
                  <input
                    type="number"
                    min={10}
                    max={200}
                    step={10}
                    value={duelXpPrize}
                    onChange={(e) => setDuelXpPrize(Number(e.target.value))}
                    className="w-full h-11 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm font-mono-tabular text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-[var(--text-secondary)]">綁定你的習慣（選填）</label>
                <select
                  value={duelLinkedHabitId}
                  onChange={(e) => setDuelLinkedHabitId(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                >
                  <option value="">自動比對同名習慣</option>
                  {habits.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.title}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={creatingDuel}
                className="w-full h-11 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] text-sm font-semibold hover:bg-[var(--accent-primary-hover)] transition-colors cursor-pointer"
              >
                {creatingDuel ? '送出邀請中...' : '鎖定規則並發出挑戰邀請'}
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* ACCEPT CHALLENGE LINK HABIT MODAL */}
      {acceptingChallenge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{ boxShadow: 'var(--shadow-modal)' }}
            className="w-full max-w-sm bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-6 space-y-4"
          >
            <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
              接受挑戰：{acceptingChallenge.title}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              選擇要連動計分的習慣，每日打卡達標將自動計入本挑戰成績。
            </p>
            <select
              value={acceptHabitId}
              onChange={(e) => setAcceptHabitId(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
            >
              <option value="">自動比對同名習慣「{acceptingChallenge.habitTitle}」</option>
              {habits.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.title}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAcceptingChallenge(null)}
                className="flex-1 h-10 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs text-[var(--text-secondary)] cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={async () => {
                  await respondChallenge(acceptingChallenge, 'active', acceptHabitId);
                  showToast('已加入對決！');
                  setAcceptingChallenge(null);
                }}
                className="flex-1 h-10 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
              >
                <Check className="w-4 h-4" strokeWidth={1.75} />
                <span>確認開戰</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* CREATE TEAM MODAL */}
      {showCreateTeam && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm p-0 sm:p-4">
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ boxShadow: 'var(--shadow-modal)' }}
            className="w-full sm:max-w-md bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-t-2xl sm:rounded-2xl overflow-hidden max-h-[90dvh] flex flex-col"
          >
            <div className="px-6 py-4 border-b border-[var(--border-hairline)] flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
                建立私人團隊（3～10 人）
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateTeam(false)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </div>
            <form onSubmit={handleCreateTeam} className="p-6 overflow-y-auto space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-[var(--text-secondary)]">團隊名稱</label>
                <input
                  type="text"
                  maxLength={48}
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="例如：晨型人俱樂部"
                  className="w-full h-11 px-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-[var(--text-secondary)]">團隊目標類型</label>
                <select
                  value={teamGoalType}
                  onChange={(e) => {
                    const next = e.target.value as TeamGoalType;
                    setTeamGoalType(next);
                    const meta = TEAM_GOAL_TYPE_LABELS[next];
                    setTeamTargetCount(meta.defaultTarget);
                    setTeamGoalTitle(`團隊共同達成 ${meta.defaultTarget} ${meta.unit}${meta.label.replace('累積', '')}`);
                  }}
                  className="w-full h-11 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                >
                  {(Object.keys(TEAM_GOAL_TYPE_LABELS) as TeamGoalType[]).map((gt) => (
                    <option key={gt} value={gt}>
                      {TEAM_GOAL_TYPE_LABELS[gt].label}（單位：{TEAM_GOAL_TYPE_LABELS[gt].unit}）
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-[var(--text-secondary)]">共同目標描述</label>
                <input
                  type="text"
                  maxLength={64}
                  value={teamGoalTitle}
                  onChange={(e) => setTeamGoalTitle(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="space-y-1.5">
                  <label className="text-xs text-[var(--text-secondary)]">
                    目標總量
                  </label>
                  <input
                    type="number"
                    min={3}
                    max={50000}
                    value={teamTargetCount}
                    onChange={(e) => setTeamTargetCount(Number(e.target.value))}
                    className="w-full h-11 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm font-mono-tabular text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[var(--text-secondary)]">個人最低貢獻</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={teamMinContrib}
                    onChange={(e) => setTeamMinContrib(Number(e.target.value))}
                    className="w-full h-11 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm font-mono-tabular text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[var(--text-secondary)]">天數</label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={teamDays}
                    onChange={(e) => setTeamDays(Number(e.target.value))}
                    className="w-full h-11 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm font-mono-tabular text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[var(--text-secondary)]">獎勵 XP</label>
                  <input
                    type="number"
                    min={10}
                    max={200}
                    step={10}
                    value={teamXpPrize}
                    onChange={(e) => setTeamXpPrize(Number(e.target.value))}
                    className="w-full h-11 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm font-mono-tabular text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={creatingTeam}
                className="w-full h-11 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] text-sm font-semibold hover:bg-[var(--accent-primary-hover)] transition-colors cursor-pointer"
              >
                {creatingTeam ? '建立中...' : '建立團隊並產生邀請碼'}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
