import { Timestamp } from 'firebase/firestore';

export type NavTab = 'home' | 'friends' | 'compete' | 'progress' | 'profile';

export type HabitCategory = 'life' | 'fitness' | 'learning' | 'work' | 'finance' | 'custom';
export type HabitFrequency = 'daily' | 'weekly';
export type HabitRecordType = 'check' | 'value' | 'time';
export type HabitPurpose = 'personal' | 'competition';
export type VerificationLevel = 'basic' | 'verified' | 'integrated';
export type VerificationStatus = 'verified' | 'pending_review' | 'rejected';

export interface PrivacySettings {
  showActivityToFriends: boolean;
  showProfilePublicly: boolean;
  discoverable: boolean;
}

export interface NotificationSettings {
  dailyReminder: boolean;
  friendActivity: boolean;
  challengeUpdates: boolean;
}

export interface UserPrivate {
  uid: string;
  email: string;
  username: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  inviteCode: string;
  timezone: string;
  totalXp: number;
  weeklyXp: number;
  weekKey: string;
  level: number;
  currentStreak: number;
  bestStreak: number;
  bestWeeklyRank?: number;
  lastCheckInDate?: string;
  lastDailyBonusDate?: string;
  lastStreak7BonusDate?: string;
  friendsCount: number;
  winsCount?: number;
  referredByUid?: string;
  firstCheckInDone?: boolean;
  privacySettings: PrivacySettings;
  notificationSettings: NotificationSettings;
  lastTxId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PublicProfile {
  uid: string;
  username: string;
  usernameLower: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  inviteCode: string;
  totalXp: number;
  weeklyXp: number;
  weekKey: string;
  level: number;
  currentStreak: number;
  bestStreak: number;
  bestWeeklyRank?: number;
  weeklyCompetitionScore?: number;
  weeklyConsistencyRate?: number;
  friendsCount: number;
  winsCount?: number;
  isDiscoverable: boolean;
  showProfilePublicly: boolean;
  unlockedBadges: string[];
  lastTxId?: string;
  updatedAt: Timestamp;
}

export interface Habit {
  id: string;
  userId: string;
  title: string;
  icon: string;
  category: HabitCategory;
  frequency: HabitFrequency;
  targetDays: number[]; // 0 = Sun, 1 = Mon ... 6 = Sat
  recordType: HabitRecordType;
  targetValue: number;
  targetTime?: string; // HH:mm
  unit: string;
  reminderTime?: string; // HH:mm
  xpReward: 10 | 20;
  habitPurpose?: HabitPurpose; // 'personal' | 'competition'
  isPublic: boolean;
  requirePhoto: boolean;
  sortOrder: number;
  archived: boolean;
  totalCompletions: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface HabitRecord {
  id: string;
  userId: string;
  habitId: string;
  habitTitle: string;
  habitIcon: string;
  habitCategory: HabitCategory;
  localDate: string; // YYYY-MM-DD
  recordType: HabitRecordType;
  completedValue: number;
  completedTime?: string; // HH:mm
  unit: string;
  note?: string;
  photoDataUrl?: string;
  timerSeconds?: number;
  isCompetitionIncluded?: boolean;
  verificationLevel?: VerificationLevel;
  verificationStatus?: VerificationStatus;
  editCount?: number;
  xpEarned: 10 | 20;
  isPublic: boolean;
  completedAt: Timestamp;
  updatedAt: Timestamp;
}

export interface HabitRecordAuditLog {
  id: string;
  recordId: string;
  userId: string;
  habitId: string;
  localDate: string;
  action: 'edit';
  previousValue: number;
  newValue: number;
  previousTime?: string;
  newTime?: string;
  previousVerificationLevel: VerificationLevel;
  newVerificationLevel: VerificationLevel;
  reason?: string;
  editedAt: Timestamp;
}

export type XpTransactionType =
  | 'habit'
  | 'daily_bonus'
  | 'streak_7'
  | 'challenge_win'
  | 'team_goal'
  | 'league_reward'
  | 'referral_bonus';

export interface XpTransaction {
  id: string;
  userId: string;
  type: XpTransactionType;
  amount: number;
  sourceId: string;
  localDate: string;
  weekKey: string;
  description: string;
  createdAt: Timestamp;
}

export interface CompetitionScoringWeights {
  consistency: number; // 60
  goalAttainment: number; // 25
  stability: number; // 15
}

export interface CompetitionSeason {
  id: string;
  leagueType: 'circle' | 'private';
  name: string;
  weekKey: string;
  startDate: string;
  endDate: string;
  creatorId: string;
  inviteCode?: string;
  memberUids: string[];
  minVerificationLevel: 'basic' | 'verified';
  maxCompetitionHabits: number;
  scoringWeights: CompetitionScoringWeights;
  rulesLocked: boolean;
  status: 'active' | 'settled';
  winnerId?: string;
  mostImprovedUid?: string;
  settledAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CompetitionParticipant {
  id: string; // ${seasonId}_${userId}
  seasonId: string;
  weekKey: string;
  userId: string;
  memberUids: string[];
  displayName: string;
  username: string;
  avatarUrl?: string;
  level: number;
  titleKey: string;
  rulesAccepted: boolean;
  joinedAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CompetitionScore {
  id: string; // ${seasonId}_${userId}
  seasonId: string;
  weekKey: string;
  userId: string;
  visibleTo: string[];
  displayName: string;
  avatarUrl?: string;
  level: number;
  competitionScore: number; // 0..1000 (represents 0.0..100.0 pts)
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
  seasonStatus: 'active' | 'settled';
  rewardClaimed: boolean;
  updatedAt: Timestamp;
}

export interface Friendship {
  id: string;
  requesterId: string;
  recipientId: string;
  participants: string[];
  status: 'pending' | 'accepted' | 'declined';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ActivityFeedItem {
  id: string;
  userId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar?: string;
  habitId: string;
  habitTitle: string;
  habitIcon: string;
  habitCategory: string;
  recordId: string;
  localDate: string;
  recordType: HabitRecordType;
  completedValue: number;
  completedTime?: string;
  unit: string;
  verificationLevel?: VerificationLevel;
  isCompetitionIncluded?: boolean;
  xpEarned: 10 | 20;
  dailyCompleted: number;
  dailyTotal: number;
  streakDays: number;
  photoDataUrl?: string;
  visibleTo: string[];
  likesCount: number;
  cheersCount: number;
  commentsCount: number;
  lastCommentId?: string;
  createdAt: Timestamp;
}

export interface FeedReaction {
  userId: string;
  displayName: string;
  type: 'like' | 'cheer';
  createdAt: Timestamp;
}

export interface FeedComment {
  id: string;
  feedId: string;
  userId: string;
  authorName: string;
  authorAvatar?: string;
  text: string;
  createdAt: Timestamp;
}

export type ChallengeScoringMethod = 'valid_count' | 'capped_total_value' | 'completion_rate';

export interface Challenge {
  id: string;
  title: string;
  templateKey?: string;
  creatorId: string;
  opponentId: string;
  participantIds: string[];
  habitTitle: string;
  habitIcon: string;
  recordType: HabitRecordType;
  targetValue: number;
  targetTime?: string;
  dailyCap?: number;
  unit: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  ruleType: 'most_completions' | 'highest_rate';
  scoringMethod?: ChallengeScoringMethod;
  requiredVerificationLevel?: 'basic' | 'verified';
  rulesLocked?: boolean;
  xpPrize: number;
  status: 'pending' | 'active' | 'completed' | 'declined';
  winnerId: string;
  settledAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ChallengeMember {
  id: string;
  challengeId: string;
  userId: string;
  participantIds: string[];
  displayName: string;
  avatarUrl?: string;
  linkedHabitId: string;
  completedDates: string[];
  completionsCount: number;
  effectiveValue?: number;
  verifiedCompletionsCount?: number;
  completionRate: number;
  claimedReward: boolean;
  updatedAt: Timestamp;
}

export type TeamGoalType =
  | 'total_completions'
  | 'total_workouts'
  | 'total_reading_mins'
  | 'team_completion_rate';

export interface Team {
  id: string;
  name: string;
  description?: string;
  creatorId: string;
  inviteCode: string;
  memberUids: string[];
  memberCount: number;
  maxMembers: number;
  goalTitle: string;
  goalType?: TeamGoalType;
  goalUnit?: string;
  minMemberContribution?: number;
  targetTotalCompletions: number;
  currentTotalCompletions: number;
  startDate: string;
  endDate: string;
  xpPrize: number;
  status: 'active' | 'completed';
  achievementUnlocked: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  memberUids?: string[];
  displayName: string;
  avatarUrl?: string;
  role: 'owner' | 'member';
  contributionCount: number;
  completedDates: string[];
  claimedReward: boolean;
  joinedAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Achievement {
  id: string;
  userId: string;
  badgeKey: string;
  title: string;
  description: string;
  unlockedAt: Timestamp;
}

export interface AchievementRecord {
  id: string;
  userId: string;
  badgeKey: string;
  title: string;
  description: string;
  sourceMetric: string;
  unlockedAt: Timestamp;
}

export interface ReferralRecord {
  id: string; // invitedUid
  referrerUid: string;
  invitedUid: string;
  invitedName: string;
  status: 'pending' | 'activated';
  firstRecordId?: string;
  claimedByReferrer: boolean;
  createdAt: Timestamp;
  activatedAt?: Timestamp;
}

export interface AppNotification {
  id: string;
  userId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  type:
    | 'friend_request'
    | 'friend_accepted'
    | 'like'
    | 'cheer'
    | 'comment'
    | 'challenge_invite'
    | 'challenge_result'
    | 'team_invite'
    | 'achievement';
  title: string;
  body?: string;
  targetTab?: string;
  targetId?: string;
  read: boolean;
  createdAt: Timestamp;
}

export interface HabitTemplate {
  key: string;
  title: string;
  icon: string;
  category: HabitCategory;
  frequency: HabitFrequency;
  targetDays: number[];
  recordType: HabitRecordType;
  targetValue: number;
  targetTime?: string;
  unit: string;
  xpReward: 10 | 20;
  recommendedPurpose?: HabitPurpose;
  description: string;
}

export interface ChallengeTemplate {
  key: string;
  title: string;
  subtitle: string;
  habitTitle: string;
  habitIcon: string;
  recordType: HabitRecordType;
  targetValue: number;
  targetTime?: string;
  dailyCap: number;
  unit: string;
  days: number;
  ruleType: 'most_completions' | 'highest_rate';
  scoringMethod: ChallengeScoringMethod;
  xpPrize: number;
}
