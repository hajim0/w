import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  Achievement,
  ActivityFeedItem,
  Challenge,
  ChallengeMember,
  ChallengeScoringMethod,
  CompetitionParticipant,
  CompetitionScore,
  CompetitionSeason,
  FeedReaction,
  Friendship,
  Habit,
  HabitCategory,
  HabitFrequency,
  HabitPurpose,
  HabitRecord,
  HabitRecordType,
  NotificationSettings,
  PrivacySettings,
  PublicProfile,
  ReferralRecord,
  Team,
  TeamGoalType,
  TeamMember,
  UserPrivate,
  VerificationLevel,
  XpTransaction,
} from '../types';
import {
  ACHIEVEMENT_CATALOG,
  COMPETITION_WEIGHTS,
  MAX_COMPETITION_HABITS,
  getTitleForLevel,
  levelFromXp,
} from '../constants/habits';
import {
  addDaysLocal,
  getDaysBetweenInclusive,
  getLocalDateStr,
  getUserTimezone,
  getWeekKey,
} from '../lib/date';
import {
  computePersonalWeekRate,
  computeWeeklyCompetitionMetrics,
  evaluateChallengeContribution,
  getPreviousWeekMonday,
  getWeekBoundsFromDate,
  sortCompetitionScores,
} from '../lib/competition';

function sanitizeIdPart(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 24) || 'user';
}

function generateInviteCode(uid: string): string {
  const clean = uid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5) || 'KAD';
  const rand = Math.random().toString(36).replace(/[^a-z0-9]/g, '').toUpperCase().slice(0, 4).padEnd(4, '7');
  return `KAD-${clean}${rand}`.slice(0, 14);
}

function generateTeamInviteCode(prefix = 'TM'): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = `${prefix}-`;
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function getFriendshipId(uidA: string, uidB: string): string {
  return uidA < uidB ? `${uidA}_${uidB}` : `${uidB}_${uidA}`;
}

function addAchievementWriteToBatch(
  batch: ReturnType<typeof writeBatch>,
  uid: string,
  badgeKey: string,
  sourceMetric: string,
  now: ReturnType<typeof serverTimestamp>
): boolean {
  const def = ACHIEVEMENT_CATALOG.find((b) => b.key === badgeKey);
  if (!def) return false;
  const achId = `${uid}_${badgeKey}`;
  batch.set(doc(db, 'achievements', achId), {
    id: achId,
    userId: uid,
    badgeKey,
    title: def.title,
    description: def.description,
    unlockedAt: now,
  });
  batch.set(doc(db, 'achievement_records', achId), {
    id: achId,
    userId: uid,
    badgeKey,
    title: def.title,
    description: def.description,
    sourceMetric: sourceMetric.slice(0, 80),
    unlockedAt: now,
  });
  return true;
}

/**
 * Ensures first-time Google Sign-In initializes users/{uid}, public_profiles/{uid},
 * usernames/{usernameLower}, invites/{inviteCode}, and optional referral tracking atomically.
 */
export async function ensureUserProfile(
  firebaseUser: FirebaseUser,
  referralInviteCode?: string
): Promise<UserPrivate> {
  const uid = firebaseUser.uid;
  const userRef = doc(db, 'users', uid);
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      return snap.data() as UserPrivate;
    }

    const email = (firebaseUser.email || `${uid}@kadence.app`).slice(0, 254);
    const rawName = (firebaseUser.displayName || email.split('@')[0] || 'Discipliner').trim();
    const displayName = rawName.slice(0, 40) || 'Discipliner';

    const emailPrefix = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    const baseUsername = (emailPrefix.length >= 2 ? emailPrefix : `user_${uid.slice(0, 5)}`).slice(0, 16);

    let username = baseUsername;
    const unameSnap = await getDoc(doc(db, 'usernames', username.toLowerCase()));
    if (unameSnap.exists()) {
      const suffix = Math.floor(1000 + Math.random() * 9000);
      username = `${baseUsername.slice(0, 18)}_${suffix}`;
    }
    const usernameLower = username.toLowerCase();
    const inviteCode = generateInviteCode(uid);
    const timezone = getUserTimezone();
    const localDate = getLocalDateStr(new Date(), timezone);
    const weekKey = getWeekKey(localDate);
    const now = serverTimestamp();

    let referrerUid: string | undefined;
    if (referralInviteCode) {
      const cleanRefCode = referralInviteCode.trim().toUpperCase();
      if (/^[A-Z0-9\-]{4,16}$/.test(cleanRefCode)) {
        const refInviteSnap = await getDoc(doc(db, 'invites', cleanRefCode));
        if (refInviteSnap.exists()) {
          const candidate = refInviteSnap.data().uid as string;
          if (candidate && candidate !== uid) {
            referrerUid = candidate;
          }
        }
      }
    }

    const batch = writeBatch(db);

    const userData: Record<string, unknown> = {
      uid,
      email,
      username,
      displayName,
      bio: '每天與夥伴並肩維持穩定的節律。',
      inviteCode,
      timezone,
      totalXp: 0,
      weeklyXp: 0,
      weekKey,
      level: 1,
      currentStreak: 0,
      bestStreak: 0,
      bestWeeklyRank: 0,
      friendsCount: 0,
      winsCount: 0,
      firstCheckInDone: false,
      privacySettings: {
        showActivityToFriends: true,
        showProfilePublicly: true,
        discoverable: true,
      },
      notificationSettings: {
        dailyReminder: true,
        friendActivity: true,
        challengeUpdates: true,
      },
      createdAt: now,
      updatedAt: now,
    };

    if (referrerUid) {
      userData.referredByUid = referrerUid;
    }

    if (firebaseUser.photoURL && firebaseUser.photoURL.length <= 300000) {
      userData.avatarUrl = firebaseUser.photoURL;
    }

    const publicData: Record<string, unknown> = {
      uid,
      username,
      usernameLower,
      displayName,
      bio: '每天與夥伴並肩維持穩定的節律。',
      inviteCode,
      totalXp: 0,
      weeklyXp: 0,
      weekKey,
      level: 1,
      currentStreak: 0,
      bestStreak: 0,
      bestWeeklyRank: 0,
      weeklyCompetitionScore: 0,
      weeklyConsistencyRate: 0,
      friendsCount: 0,
      winsCount: 0,
      isDiscoverable: true,
      showProfilePublicly: true,
      unlockedBadges: [],
      updatedAt: now,
    };
    if (userData.avatarUrl) {
      publicData.avatarUrl = userData.avatarUrl;
    }

    batch.set(userRef, userData);
    batch.set(doc(db, 'public_profiles', uid), publicData);
    batch.set(doc(db, 'usernames', usernameLower), {
      uid,
      username,
      createdAt: now,
    });
    batch.set(doc(db, 'invites', inviteCode), {
      uid,
      inviteCode,
      createdAt: now,
    });

    if (referrerUid) {
      batch.set(doc(db, 'referrals', uid), {
        id: uid,
        referrerUid,
        invitedUid: uid,
        invitedName: displayName,
        status: 'pending',
        claimedByReferrer: false,
        createdAt: now,
      });
    }

    await batch.commit();
    const createdSnap = await getDoc(userRef);
    return createdSnap.data() as UserPrivate;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
  }
}

export async function updateUserProfileAndSettings(
  currentUser: UserPrivate,
  updates: {
    displayName?: string;
    username?: string;
    bio?: string;
    avatarUrl?: string;
    privacySettings?: PrivacySettings;
    notificationSettings?: NotificationSettings;
    friendsCount?: number;
    bestWeeklyRank?: number;
  }
): Promise<void> {
  const uid = currentUser.uid;
  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();

    const nextDisplayName = (updates.displayName ?? currentUser.displayName).trim().slice(0, 40) || currentUser.displayName;
    const nextBio = (updates.bio ?? currentUser.bio ?? '').trim().slice(0, 160);
    const nextPrivacy = updates.privacySettings ?? currentUser.privacySettings;
    const nextNotif = updates.notificationSettings ?? currentUser.notificationSettings;
    const nextFriendsCount = updates.friendsCount ?? currentUser.friendsCount;
    const nextBestWeeklyRank = updates.bestWeeklyRank ?? currentUser.bestWeeklyRank ?? 0;

    let nextUsername = currentUser.username;
    if (updates.username && updates.username.trim() !== currentUser.username) {
      const cleaned = updates.username.trim().replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24);
      if (cleaned.length < 2) {
        throw new Error('使用者名稱至少需要 2 個英數字元或底線');
      }
      const lowerNew = cleaned.toLowerCase();
      const lowerOld = currentUser.username.toLowerCase();
      if (lowerNew !== lowerOld) {
        const existingUname = await getDoc(doc(db, 'usernames', lowerNew));
        if (existingUname.exists() && existingUname.data().uid !== uid) {
          throw new Error('此使用者名稱已被其他人使用');
        }
        batch.delete(doc(db, 'usernames', lowerOld));
        batch.set(doc(db, 'usernames', lowerNew), {
          uid,
          username: cleaned,
          createdAt: now,
        });
      }
      nextUsername = cleaned;
    }

    const userUpdate: Record<string, unknown> = {
      displayName: nextDisplayName,
      username: nextUsername,
      bio: nextBio,
      privacySettings: nextPrivacy,
      notificationSettings: nextNotif,
      friendsCount: nextFriendsCount,
      bestWeeklyRank: nextBestWeeklyRank,
      updatedAt: now,
    };

    const publicUpdate: Record<string, unknown> = {
      displayName: nextDisplayName,
      username: nextUsername,
      usernameLower: nextUsername.toLowerCase(),
      bio: nextBio,
      isDiscoverable: nextPrivacy.discoverable,
      showProfilePublicly: nextPrivacy.showProfilePublicly,
      friendsCount: nextFriendsCount,
      bestWeeklyRank: nextBestWeeklyRank,
      updatedAt: now,
    };

    if (updates.avatarUrl !== undefined) {
      userUpdate.avatarUrl = updates.avatarUrl;
      publicUpdate.avatarUrl = updates.avatarUrl;
    }

    batch.update(doc(db, 'users', uid), userUpdate);
    batch.update(doc(db, 'public_profiles', uid), publicUpdate);
    await batch.commit();
  } catch (error) {
    if (error instanceof Error && (error.message.includes('使用者名稱') || error.message.includes('圖片'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

async function countUserCompetitionHabits(userId: string, excludeHabitId?: string): Promise<number> {
  const q = query(collection(db, 'habits'), where('userId', '==', userId));
  const snap = await getDocs(q);
  let count = 0;
  snap.forEach((d) => {
    const h = d.data() as Habit;
    if (!h.archived && h.habitPurpose === 'competition' && h.id !== excludeHabitId) {
      count++;
    }
  });
  return count;
}

export async function createHabit(
  userId: string,
  input: {
    title: string;
    icon: string;
    category: HabitCategory;
    frequency: HabitFrequency;
    targetDays: number[];
    recordType: HabitRecordType;
    targetValue: number;
    targetTime?: string;
    unit: string;
    reminderTime?: string;
    xpReward: 10 | 20;
    habitPurpose?: HabitPurpose;
    isPublic: boolean;
    requirePhoto: boolean;
    sortOrder: number;
  }
): Promise<string> {
  const purpose: HabitPurpose = input.habitPurpose === 'competition' ? 'competition' : 'personal';
  if (purpose === 'competition') {
    const compCount = await countUserCompetitionHabits(userId);
    if (compCount >= MAX_COMPETITION_HABITS) {
      throw new Error(`每週競賽最多只能納入 ${MAX_COMPETITION_HABITS} 個習慣，請先將其他競賽習慣調整為個人成長。`);
    }
  }

  const id = `hab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = serverTimestamp();
  try {
    const payload: Record<string, unknown> = {
      id,
      userId,
      title: input.title.trim().slice(0, 48),
      icon: input.icon.slice(0, 32),
      category: input.category,
      frequency: input.frequency,
      targetDays: input.targetDays.slice(0, 7),
      recordType: input.recordType,
      targetValue: Math.max(0, Math.min(10000, Number(input.targetValue) || 1)),
      unit: input.unit.trim().slice(0, 16),
      xpReward: input.xpReward === 20 ? 20 : 10,
      habitPurpose: purpose,
      isPublic: Boolean(input.isPublic),
      requirePhoto: Boolean(input.requirePhoto),
      sortOrder: Math.max(0, Math.floor(input.sortOrder)),
      archived: false,
      totalCompletions: 0,
      createdAt: now,
      updatedAt: now,
    };
    if (input.targetTime) payload.targetTime = input.targetTime.slice(0, 5);
    if (input.reminderTime) payload.reminderTime = input.reminderTime.slice(0, 5);

    await setDoc(doc(db, 'habits', id), payload);
    return id;
  } catch (error) {
    if (error instanceof Error && error.message.includes('競賽')) throw error;
    handleFirestoreError(error, OperationType.CREATE, `habits/${id}`);
  }
}

export async function updateHabit(
  habitId: string,
  updates: Partial<{
    title: string;
    icon: string;
    category: HabitCategory;
    frequency: HabitFrequency;
    targetDays: number[];
    recordType: HabitRecordType;
    targetValue: number;
    targetTime: string;
    unit: string;
    reminderTime: string;
    xpReward: 10 | 20;
    habitPurpose: HabitPurpose;
    isPublic: boolean;
    requirePhoto: boolean;
    sortOrder: number;
    archived: boolean;
  }>,
  ownerUserId?: string
): Promise<void> {
  try {
    if (updates.habitPurpose === 'competition' && !updates.archived) {
      let uid = ownerUserId;
      if (!uid) {
        const snap = await getDoc(doc(db, 'habits', habitId));
        if (snap.exists()) uid = (snap.data() as Habit).userId;
      }
      if (uid) {
        const compCount = await countUserCompetitionHabits(uid, habitId);
        if (compCount >= MAX_COMPETITION_HABITS) {
          throw new Error(`每週競賽最多只能納入 ${MAX_COMPETITION_HABITS} 個習慣，請先將其他競賽習慣調整為個人成長。`);
        }
      }
    }

    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (updates.title !== undefined) payload.title = updates.title.trim().slice(0, 48);
    if (updates.icon !== undefined) payload.icon = updates.icon.slice(0, 32);
    if (updates.category !== undefined) payload.category = updates.category;
    if (updates.frequency !== undefined) payload.frequency = updates.frequency;
    if (updates.targetDays !== undefined) payload.targetDays = updates.targetDays.slice(0, 7);
    if (updates.recordType !== undefined) payload.recordType = updates.recordType;
    if (updates.targetValue !== undefined)
      payload.targetValue = Math.max(0, Math.min(10000, Number(updates.targetValue) || 1));
    if (updates.targetTime !== undefined) payload.targetTime = updates.targetTime.slice(0, 5);
    if (updates.unit !== undefined) payload.unit = updates.unit.trim().slice(0, 16);
    if (updates.reminderTime !== undefined) payload.reminderTime = updates.reminderTime.slice(0, 5);
    if (updates.xpReward !== undefined) payload.xpReward = updates.xpReward === 20 ? 20 : 10;
    if (updates.habitPurpose !== undefined) payload.habitPurpose = updates.habitPurpose;
    if (updates.isPublic !== undefined) payload.isPublic = Boolean(updates.isPublic);
    if (updates.requirePhoto !== undefined) payload.requirePhoto = Boolean(updates.requirePhoto);
    if (updates.sortOrder !== undefined) payload.sortOrder = Math.max(0, Math.floor(updates.sortOrder));
    if (updates.archived !== undefined) payload.archived = Boolean(updates.archived);

    await updateDoc(doc(db, 'habits', habitId), payload);
  } catch (error) {
    if (error instanceof Error && error.message.includes('競賽')) throw error;
    handleFirestoreError(error, OperationType.UPDATE, `habits/${habitId}`);
  }
}

export async function deleteHabit(habitId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'habits', habitId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `habits/${habitId}`);
  }
}

export async function reorderHabits(orderedHabits: Habit[]): Promise<void> {
  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();
    orderedHabits.forEach((habit, idx) => {
      batch.update(doc(db, 'habits', habit.id), {
        sortOrder: idx,
        updatedAt: now,
      });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'habits/reorder');
  }
}

export interface CheckInResult {
  xpGained: number;
  dailyBonusAwarded: boolean;
  streak7BonusAwarded: boolean;
  unlockedBadges: string[];
  verificationLevel: VerificationLevel;
}

/**
 * Performs an atomic habit check-in with anti-duplicate XP protection,
 * verification level tagging (basic vs verified photo/timer), referral activation,
 * optional public friend activity feed publishing, achievement unlocking,
 * and challenge/team progress sync.
 */
export async function completeHabitCheckIn(params: {
  user: UserPrivate;
  publicProfile: PublicProfile;
  habit: Habit;
  localDate: string;
  completedValue: number;
  completedTime?: string;
  note?: string;
  photoDataUrl?: string;
  timerSeconds?: number;
  friendUids: string[];
  scheduledHabitsTodayCount: number;
  alreadyCompletedTodayCount: number;
  allHabits: Habit[];
  allUserRecords: HabitRecord[];
  activeChallenges: Challenge[];
  myChallengeMembers: ChallengeMember[];
  activeTeams: Team[];
  myTeamMembers: TeamMember[];
}): Promise<CheckInResult> {
  const {
    user,
    publicProfile,
    habit,
    localDate,
    completedValue,
    completedTime,
    note,
    photoDataUrl,
    timerSeconds,
    friendUids,
    scheduledHabitsTodayCount,
    alreadyCompletedTodayCount,
    allHabits,
    allUserRecords,
    activeChallenges,
    myChallengeMembers,
    activeTeams,
    myTeamMembers,
  } = params;

  const uid = user.uid;
  const recordId = `${uid}_${habit.id}_${localDate}`;
  const txId = `${uid}_habit_${habit.id}_${localDate}`;
  const weekKey = getWeekKey(localDate);
  const now = serverTimestamp();

  const cleanTimerSeconds = timerSeconds ? Math.max(0, Math.min(86400, Math.round(timerSeconds))) : 0;
  const verificationLevel: VerificationLevel =
    photoDataUrl || cleanTimerSeconds >= 60 ? 'verified' : 'basic';
  const isCompetitionIncluded = habit.habitPurpose === 'competition';

  // Compute updated streak
  let newStreak = user.currentStreak;
  if (user.lastCheckInDate === localDate) {
    newStreak = Math.max(1, user.currentStreak);
  } else if (user.lastCheckInDate === addDaysLocal(localDate, -1)) {
    newStreak = user.currentStreak + 1;
  } else {
    newStreak = 1;
  }
  const newBestStreak = Math.max(user.bestStreak, newStreak);

  let runningTotalXp = user.totalXp + habit.xpReward;
  let runningWeeklyXp = (user.weekKey === weekKey ? user.weeklyXp : 0) + habit.xpReward;
  let runningLevel = levelFromXp(runningTotalXp);

  const sanitizedValue = Math.max(0, Math.min(10000, Number(completedValue) || 1));

  const recordPayload: Record<string, unknown> = {
    id: recordId,
    userId: uid,
    habitId: habit.id,
    habitTitle: habit.title.slice(0, 48),
    habitIcon: habit.icon.slice(0, 32),
    habitCategory: habit.category,
    localDate,
    recordType: habit.recordType,
    completedValue: sanitizedValue,
    unit: habit.unit.slice(0, 16),
    isCompetitionIncluded,
    verificationLevel,
    verificationStatus: 'verified',
    editCount: 0,
    xpEarned: habit.xpReward,
    isPublic: habit.isPublic,
    completedAt: now,
    updatedAt: now,
  };
  if (completedTime) recordPayload.completedTime = completedTime.slice(0, 5);
  if (note && note.trim()) recordPayload.note = note.trim().slice(0, 200);
  if (photoDataUrl) recordPayload.photoDataUrl = photoDataUrl;
  if (cleanTimerSeconds > 0) recordPayload.timerSeconds = cleanTimerSeconds;

  try {
    const existingRecordSnap = await getDoc(doc(db, 'habit_records', recordId));
    if (existingRecordSnap.exists()) {
      throw new Error('此習慣今日已完成打卡，無法重複領取積分。');
    }

    const batch1 = writeBatch(db);

    batch1.set(doc(db, 'habit_records', recordId), recordPayload);

    batch1.set(doc(db, 'xp_transactions', txId), {
      id: txId,
      userId: uid,
      type: 'habit',
      amount: habit.xpReward,
      sourceId: recordId,
      localDate,
      weekKey,
      description: `完成習慣「${habit.title}」`,
      createdAt: now,
    });

    batch1.update(doc(db, 'habits', habit.id), {
      totalCompletions: habit.totalCompletions + 1,
      updatedAt: now,
    });

    batch1.update(doc(db, 'users', uid), {
      totalXp: runningTotalXp,
      weeklyXp: runningWeeklyXp,
      weekKey,
      level: runningLevel,
      currentStreak: newStreak,
      bestStreak: newBestStreak,
      lastCheckInDate: localDate,
      firstCheckInDone: true,
      lastTxId: txId,
      updatedAt: now,
    });

    batch1.update(doc(db, 'public_profiles', uid), {
      totalXp: runningTotalXp,
      weeklyXp: runningWeeklyXp,
      weekKey,
      level: runningLevel,
      currentStreak: newStreak,
      bestStreak: newBestStreak,
      lastTxId: txId,
      updatedAt: now,
    });

    if (habit.isPublic && user.privacySettings.showActivityToFriends) {
      const visibleTo = Array.from(new Set([uid, ...friendUids])).slice(0, 100);
      const feedPayload: Record<string, unknown> = {
        id: recordId,
        userId: uid,
        authorName: user.displayName,
        authorUsername: user.username,
        habitId: habit.id,
        habitTitle: habit.title.slice(0, 48),
        habitIcon: habit.icon.slice(0, 32),
        habitCategory: habit.category,
        recordId,
        localDate,
        recordType: habit.recordType,
        completedValue: sanitizedValue,
        unit: habit.unit.slice(0, 16),
        verificationLevel,
        isCompetitionIncluded,
        xpEarned: habit.xpReward,
        dailyCompleted: alreadyCompletedTodayCount + 1,
        dailyTotal: Math.max(1, scheduledHabitsTodayCount),
        streakDays: newStreak,
        visibleTo,
        likesCount: 0,
        cheersCount: 0,
        commentsCount: 0,
        createdAt: now,
      };
      if (user.avatarUrl) feedPayload.authorAvatar = user.avatarUrl;
      if (completedTime) feedPayload.completedTime = completedTime.slice(0, 5);
      if (photoDataUrl) feedPayload.photoDataUrl = photoDataUrl;

      batch1.set(doc(db, 'activity_feed', recordId), feedPayload);
    }

    await batch1.commit();
  } catch (error) {
    if (error instanceof Error && error.message.includes('無法重複領取積分')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `habit_records/${recordId}`);
  }

  // Activate referral if this user was invited and hadn't activated yet
  if (user.referredByUid && !user.firstCheckInDone) {
    try {
      const refSnap = await getDoc(doc(db, 'referrals', uid));
      if (refSnap.exists() && (refSnap.data() as ReferralRecord).status === 'pending') {
        await updateDoc(doc(db, 'referrals', uid), {
          status: 'activated',
          firstRecordId: recordId,
          activatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.warn('Referral activation skipped:', err);
    }
  }

  let totalXpGained = habit.xpReward;
  let dailyBonusAwarded = false;
  let streak7BonusAwarded = false;
  const newlyUnlockedBadges: string[] = [];

  // Batch 2: All Daily Habits Bonus (+30 XP)
  const completedAfter = alreadyCompletedTodayCount + 1;
  if (
    scheduledHabitsTodayCount > 0 &&
    completedAfter >= scheduledHabitsTodayCount &&
    user.lastDailyBonusDate !== localDate
  ) {
    const bonusTxId = `${uid}_daily_${localDate}`;
    try {
      const existingBonus = await getDoc(doc(db, 'xp_transactions', bonusTxId));
      if (!existingBonus.exists()) {
        runningTotalXp += 30;
        runningWeeklyXp += 30;
        runningLevel = levelFromXp(runningTotalXp);

        const batch2 = writeBatch(db);
        batch2.set(doc(db, 'xp_transactions', bonusTxId), {
          id: bonusTxId,
          userId: uid,
          type: 'daily_bonus',
          amount: 30,
          sourceId: localDate,
          localDate,
          weekKey,
          description: '達成今日全部習慣目標獎勵',
          createdAt: serverTimestamp(),
        });
        batch2.update(doc(db, 'users', uid), {
          totalXp: runningTotalXp,
          weeklyXp: runningWeeklyXp,
          weekKey,
          level: runningLevel,
          lastDailyBonusDate: localDate,
          lastTxId: bonusTxId,
          updatedAt: serverTimestamp(),
        });
        batch2.update(doc(db, 'public_profiles', uid), {
          totalXp: runningTotalXp,
          weeklyXp: runningWeeklyXp,
          weekKey,
          level: runningLevel,
          lastTxId: bonusTxId,
          updatedAt: serverTimestamp(),
        });
        await batch2.commit();
        totalXpGained += 30;
        dailyBonusAwarded = true;
      }
    } catch (err) {
      console.warn('Daily bonus skipped:', err);
    }
  }

  // Batch 3: 7-Day Streak Milestone Bonus (+50 XP)
  if (newStreak > 0 && newStreak % 7 === 0 && user.lastStreak7BonusDate !== localDate) {
    const streakTxId = `${uid}_streak7_${localDate}_${newStreak}`;
    try {
      const existingStreakTx = await getDoc(doc(db, 'xp_transactions', streakTxId));
      if (!existingStreakTx.exists()) {
        runningTotalXp += 50;
        runningWeeklyXp += 50;
        runningLevel = levelFromXp(runningTotalXp);

        const batch3 = writeBatch(db);
        batch3.set(doc(db, 'xp_transactions', streakTxId), {
          id: streakTxId,
          userId: uid,
          type: 'streak_7',
          amount: 50,
          sourceId: String(newStreak),
          localDate,
          weekKey,
          description: `達成連續打卡 ${newStreak} 天里程碑`,
          createdAt: serverTimestamp(),
        });
        batch3.update(doc(db, 'users', uid), {
          totalXp: runningTotalXp,
          weeklyXp: runningWeeklyXp,
          weekKey,
          level: runningLevel,
          lastStreak7BonusDate: localDate,
          lastTxId: streakTxId,
          updatedAt: serverTimestamp(),
        });
        batch3.update(doc(db, 'public_profiles', uid), {
          totalXp: runningTotalXp,
          weeklyXp: runningWeeklyXp,
          weekKey,
          level: runningLevel,
          lastTxId: streakTxId,
          updatedAt: serverTimestamp(),
        });
        await batch3.commit();
        totalXpGained += 50;
        streak7BonusAwarded = true;
      }
    } catch (err) {
      console.warn('Streak bonus skipped:', err);
    }
  }

  // Evaluate Data-Verified Achievements
  const currentBadges = new Set(publicProfile.unlockedBadges || []);
  const totalRecordsCount = allUserRecords.length + 1;
  const achBatch = writeBatch(db);
  let hasNewBadges = false;

  const tryUnlock = (badgeKey: string, sourceMetric: string) => {
    if (currentBadges.has(badgeKey)) return;
    if (addAchievementWriteToBatch(achBatch, uid, badgeKey, sourceMetric, serverTimestamp())) {
      currentBadges.add(badgeKey);
      newlyUnlockedBadges.push(badgeKey);
      hasNewBadges = true;
    }
  };

  if (totalRecordsCount >= 1) tryUnlock('first_step', `totalRecords:${totalRecordsCount}`);
  if (totalRecordsCount >= 100) tryUnlock('centurion', `totalRecords:${totalRecordsCount}`);
  if (newStreak >= 30) tryUnlock('consistency_30', `streak:${newStreak}`);

  if (habit.title.includes('早起')) {
    const wakeDates = new Set(
      allUserRecords
        .filter((r) => r.habitTitle.includes('早起'))
        .map((r) => r.localDate)
        .concat(localDate)
    );
    let consecutiveWake = 0;
    for (let i = 0; i < 7; i++) {
      if (wakeDates.has(addDaysLocal(localDate, -i))) consecutiveWake++;
    }
    if (consecutiveWake >= 7) tryUnlock('early_bird', `earlyBirdStreak:${consecutiveWake}`);
  }

  if (habit.title.includes('閱讀')) {
    const readingMins =
      allUserRecords
        .filter((r) => r.habitTitle.includes('閱讀'))
        .reduce((acc, r) => acc + (r.completedValue || 0), 0) + sanitizedValue;
    if (readingMins >= 6000) tryUnlock('bookworm', `readingMins:${readingMins}`);
  }

  // Improvement badge: weekly personal completion rate +30% vs previous week
  const syntheticRecord = {
    ...(recordPayload as unknown as HabitRecord),
    completedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  const mergedRecords = allUserRecords.concat(syntheticRecord);
  const { startDate: curMonday } = getWeekBoundsFromDate(localDate);
  const prevMonday = getPreviousWeekMonday(curMonday);
  const prevRate = computePersonalWeekRate(allHabits, allUserRecords, prevMonday);
  const curRate = computePersonalWeekRate(allHabits, mergedRecords, curMonday, localDate);
  const hasPrevData = allUserRecords.some((r) => r.localDate >= prevMonday && r.localDate < curMonday);
  if (hasPrevData && curRate - prevRate >= 30) {
    tryUnlock('improvement_30', `rateDelta:+${curRate - prevRate}%`);
  }

  if (hasNewBadges) {
    try {
      achBatch.update(doc(db, 'public_profiles', uid), {
        unlockedBadges: Array.from(currentBadges).slice(0, 24),
        updatedAt: serverTimestamp(),
      });
      await achBatch.commit();
    } catch (err) {
      console.warn('Achievement unlock skipped:', err);
    }
  }

  // Sync Active 1v1 Challenges (Verification + Daily Cap Enforced)
  for (const ch of activeChallenges) {
    if (ch.status !== 'active') continue;
    if (localDate < ch.startDate || localDate > ch.endDate) continue;
    const member = myChallengeMembers.find((m) => m.challengeId === ch.id && m.userId === uid);
    if (!member) continue;
    const matchesHabit =
      member.linkedHabitId === habit.id ||
      (!member.linkedHabitId && habit.title === ch.habitTitle);
    if (!matchesHabit) continue;

    const { qualifies, cappedValue } = evaluateChallengeContribution(
      ch,
      sanitizedValue,
      completedTime,
      verificationLevel
    );
    if (!qualifies) continue;

    if (!member.completedDates.includes(localDate)) {
      const nextDates = [...member.completedDates, localDate].slice(0, 90);
      const nextCount = nextDates.length;
      const nextEffective = (member.effectiveValue ?? member.completionsCount) + cappedValue;
      const nextVerifiedCount =
        (member.verifiedCompletionsCount ?? 0) + (verificationLevel !== 'basic' ? 1 : 0);
      const nextRate = Math.min(100, Math.round((nextCount / Math.max(1, ch.totalDays)) * 100));
      try {
        await updateDoc(doc(db, 'challenge_members', member.id), {
          linkedHabitId: habit.id,
          completedDates: nextDates,
          completionsCount: nextCount,
          effectiveValue: nextEffective,
          verifiedCompletionsCount: nextVerifiedCount,
          completionRate: nextRate,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn('Challenge progress sync skipped:', err);
      }
    }
  }

  // Sync Active Team Challenges (supports both team_challenges and legacy teams)
  for (const team of activeTeams) {
    if (team.status !== 'active') continue;
    if (localDate < team.startDate || localDate > team.endDate) continue;
    const tm = myTeamMembers.find((m) => m.teamId === team.id && m.userId === uid);
    if (!tm) continue;

    const gType: TeamGoalType = team.goalType || 'total_completions';
    let delta = 1;
    if (gType === 'total_workouts') {
      if (habit.category !== 'fitness') continue;
      delta = 1;
    } else if (gType === 'total_reading_mins') {
      if (habit.category !== 'learning' && !habit.title.includes('閱讀')) continue;
      delta = Math.max(1, Math.min(300, Math.round(sanitizedValue)));
    }

    try {
      const nextCompletedDates = tm.completedDates.includes(localDate)
        ? tm.completedDates
        : [...tm.completedDates, localDate].slice(0, 90);
      const nextTotal = team.currentTotalCompletions + delta;
      const reachedGoal = nextTotal >= team.targetTotalCompletions;

      const tcSnap = await getDoc(doc(db, 'team_challenges', team.id));
      const targetCol = tcSnap.exists() ? 'team_challenges' : 'teams';

      const teamBatch = writeBatch(db);
      teamBatch.update(doc(db, 'team_members', tm.id), {
        contributionCount: tm.contributionCount + delta,
        completedDates: nextCompletedDates,
        memberUids: team.memberUids,
        updatedAt: serverTimestamp(),
      });
      teamBatch.update(doc(db, targetCol, team.id), {
        currentTotalCompletions: nextTotal,
        achievementUnlocked: team.achievementUnlocked || reachedGoal,
        status: reachedGoal ? 'completed' : team.status,
        updatedAt: serverTimestamp(),
      });
      await teamBatch.commit();
    } catch (err) {
      console.warn('Team progress sync skipped:', err);
    }
  }

  return {
    xpGained: totalXpGained,
    dailyBonusAwarded,
    streak7BonusAwarded,
    unlockedBadges: newlyUnlockedBadges,
    verificationLevel,
  };
}

/**
 * Edits an existing check-in record WITHOUT granting extra XP and writes an immutable audit log.
 */
export async function updateCheckInRecord(
  existingRecord: HabitRecord,
  updates: {
    completedValue: number;
    completedTime?: string;
    note?: string;
    photoDataUrl?: string;
    timerSeconds?: number;
    reason?: string;
  }
): Promise<void> {
  const prevLevel: VerificationLevel = existingRecord.verificationLevel || 'basic';
  const nextTimer = updates.timerSeconds ?? existingRecord.timerSeconds ?? 0;
  const hasPhoto = Boolean(updates.photoDataUrl ?? existingRecord.photoDataUrl);
  const nextLevel: VerificationLevel =
    prevLevel === 'integrated'
      ? 'integrated'
      : prevLevel === 'verified' || hasPhoto || nextTimer >= 60
      ? 'verified'
      : 'basic';

  const nextValue = Math.max(0, Math.min(10000, Number(updates.completedValue) || 1));
  const nextEditCount = (existingRecord.editCount ?? 0) + 1;
  const logId = `${existingRecord.userId}_audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = serverTimestamp();

  try {
    const batch = writeBatch(db);
    const payload: Record<string, unknown> = {
      completedValue: nextValue,
      verificationLevel: nextLevel,
      verificationStatus: 'verified',
      editCount: nextEditCount,
      updatedAt: now,
    };
    if (updates.completedTime !== undefined) payload.completedTime = updates.completedTime.slice(0, 5);
    if (updates.note !== undefined) payload.note = updates.note.trim().slice(0, 200);
    if (updates.photoDataUrl !== undefined) payload.photoDataUrl = updates.photoDataUrl;
    if (updates.timerSeconds !== undefined) {
      payload.timerSeconds = Math.max(0, Math.min(86400, Math.round(updates.timerSeconds)));
    }

    batch.update(doc(db, 'habit_records', existingRecord.id), payload);

    const auditPayload: Record<string, unknown> = {
      id: logId,
      recordId: existingRecord.id,
      userId: existingRecord.userId,
      habitId: existingRecord.habitId,
      localDate: existingRecord.localDate,
      action: 'edit',
      previousValue: existingRecord.completedValue,
      newValue: nextValue,
      previousVerificationLevel: prevLevel,
      newVerificationLevel: nextLevel,
      editedAt: now,
    };
    if (existingRecord.completedTime) auditPayload.previousTime = existingRecord.completedTime;
    if (updates.completedTime) auditPayload.newTime = updates.completedTime.slice(0, 5);
    if (updates.reason && updates.reason.trim()) auditPayload.reason = updates.reason.trim().slice(0, 160);

    batch.set(doc(db, 'habit_record_audit_logs', logId), auditPayload);

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `habit_records/${existingRecord.id}`);
  }
}

/**
 * Syncs current user's Weekly League Circle Season + Private Leagues scores (60/25/15).
 */
export async function syncMyWeeklySeasonScore(params: {
  currentUser: UserPrivate;
  publicProfile: PublicProfile;
  habits: Habit[];
  records: HabitRecord[];
  xpTransactions: XpTransaction[];
  friendUids: string[];
  seasons: CompetitionSeason[];
  scores: CompetitionScore[];
  todayDate: string;
}): Promise<void> {
  const {
    currentUser,
    publicProfile,
    habits,
    records,
    xpTransactions,
    friendUids,
    seasons,
    scores,
    todayDate,
  } = params;

  const uid = currentUser.uid;
  const { weekKey, startDate, endDate } = getWeekBoundsFromDate(todayDate);
  const circleSeasonId = `circle_${weekKey}`;
  const circleSeasonDocId = `${circleSeasonId}_${uid}`;
  const visibleCircle = Array.from(new Set([uid, ...friendUids])).slice(0, 100);
  const titleDef = getTitleForLevel(currentUser.level);
  const now = serverTimestamp();

  // 1. Ensure user's personal Weekly Circle Season metadata exists & friend roster is fresh
  const existingCircleSeason = seasons.find((s) => s.id === circleSeasonDocId);
  try {
    if (!existingCircleSeason) {
      const seasonSnap = await getDoc(doc(db, 'competition_seasons', circleSeasonDocId));
      if (!seasonSnap.exists()) {
        await setDoc(doc(db, 'competition_seasons', circleSeasonDocId), {
          id: circleSeasonDocId,
          leagueType: 'circle',
          name: `好友圈週聯賽 ${weekKey}`,
          weekKey,
          startDate,
          endDate,
          creatorId: uid,
          memberUids: visibleCircle,
          minVerificationLevel: 'basic',
          maxCompetitionHabits: MAX_COMPETITION_HABITS,
          scoringWeights: { ...COMPETITION_WEIGHTS },
          rulesLocked: true,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        });
      }
    } else if (
      existingCircleSeason.status === 'active' &&
      JSON.stringify([...existingCircleSeason.memberUids].sort()) !== JSON.stringify([...visibleCircle].sort())
    ) {
      await updateDoc(doc(db, 'competition_seasons', circleSeasonDocId), {
        memberUids: visibleCircle,
        updatedAt: now,
      });
    }
  } catch (err) {
    console.warn('Circle season sync skipped:', err);
  }

  // 2. Sync Friend Circle CompetitionScore
  const circleMetrics = computeWeeklyCompetitionMetrics({
    habits,
    records,
    xpTransactions,
    todayDate,
    weekStartDate: startDate,
    minVerificationLevel: 'basic',
  });

  const existingCircleScore = scores.find((s) => s.id === `${circleSeasonId}_${uid}`);
  const isCircleSettled =
    existingCircleSeason?.status === 'settled' || existingCircleScore?.seasonStatus === 'settled';

  if (!isCircleSettled) {
    const scoreDocId = `${circleSeasonId}_${uid}`;
    try {
      const batch = writeBatch(db);
      const scorePayload: Record<string, unknown> = {
        id: scoreDocId,
        seasonId: circleSeasonId,
        weekKey,
        userId: uid,
        visibleTo: visibleCircle,
        displayName: currentUser.displayName,
        level: currentUser.level,
        competitionScore: circleMetrics.competitionScore,
        consistencyRate: circleMetrics.consistencyRate,
        goalAttainmentRate: circleMetrics.goalAttainmentRate,
        stabilityRate: circleMetrics.stabilityRate,
        prevWeekConsistencyRate: circleMetrics.prevWeekConsistencyRate,
        improvementDelta: circleMetrics.improvementDelta,
        weeklyXp: circleMetrics.weeklyXp,
        completedCount: circleMetrics.completedCount,
        scheduledCount: circleMetrics.scheduledCount,
        verifiedCount: circleMetrics.verifiedCount,
        activeDays: circleMetrics.activeDays,
        seasonStatus: 'active',
        rewardClaimed: existingCircleScore?.rewardClaimed ?? false,
        updatedAt: now,
      };
      if (currentUser.avatarUrl) scorePayload.avatarUrl = currentUser.avatarUrl;
      batch.set(doc(db, 'competition_scores', scoreDocId), scorePayload, { merge: true });

      // Participant doc
      const partPayload: Record<string, unknown> = {
        id: scoreDocId,
        seasonId: circleSeasonId,
        weekKey,
        userId: uid,
        memberUids: visibleCircle,
        displayName: currentUser.displayName,
        username: currentUser.username,
        level: currentUser.level,
        titleKey: titleDef.key,
        rulesAccepted: true,
        joinedAt: now,
        updatedAt: now,
      };
      if (currentUser.avatarUrl) partPayload.avatarUrl = currentUser.avatarUrl;
      const partRef = doc(db, 'competition_participants', scoreDocId);
      const partSnap = await getDoc(partRef);
      if (partSnap.exists()) {
        batch.update(partRef, {
          memberUids: visibleCircle,
          displayName: currentUser.displayName,
          username: currentUser.username,
          level: currentUser.level,
          titleKey: titleDef.key,
          ...(currentUser.avatarUrl ? { avatarUrl: currentUser.avatarUrl } : {}),
          updatedAt: now,
        });
      } else {
        batch.set(partRef, partPayload);
      }

      if (
        publicProfile.weeklyCompetitionScore !== circleMetrics.competitionScore ||
        publicProfile.weeklyConsistencyRate !== circleMetrics.consistencyRate ||
        publicProfile.weekKey !== weekKey
      ) {
        batch.update(doc(db, 'public_profiles', uid), {
          weeklyCompetitionScore: circleMetrics.competitionScore,
          weeklyConsistencyRate: circleMetrics.consistencyRate,
          weekKey,
          updatedAt: now,
        });
      }

      await batch.commit();
    } catch (err) {
      console.warn('Circle competition score sync skipped:', err);
    }
  }

  // 3. Sync Private Leagues for this week
  const activePrivateSeasons = seasons.filter(
    (s) => s.leagueType === 'private' && s.status === 'active' && s.weekKey === weekKey && s.memberUids.includes(uid)
  );
  for (const season of activePrivateSeasons) {
    const scoreDocId = `${season.id}_${uid}`;
    const existingPrivateScore = scores.find((s) => s.id === scoreDocId);
    if (existingPrivateScore?.seasonStatus === 'settled') continue;

    const metrics = computeWeeklyCompetitionMetrics({
      habits,
      records,
      xpTransactions,
      todayDate,
      weekStartDate: season.startDate,
      minVerificationLevel: season.minVerificationLevel,
    });
    try {
      const scorePayload: Record<string, unknown> = {
        id: scoreDocId,
        seasonId: season.id,
        weekKey: season.weekKey,
        userId: uid,
        visibleTo: season.memberUids,
        displayName: currentUser.displayName,
        level: currentUser.level,
        competitionScore: metrics.competitionScore,
        consistencyRate: metrics.consistencyRate,
        goalAttainmentRate: metrics.goalAttainmentRate,
        stabilityRate: metrics.stabilityRate,
        prevWeekConsistencyRate: metrics.prevWeekConsistencyRate,
        improvementDelta: metrics.improvementDelta,
        weeklyXp: metrics.weeklyXp,
        completedCount: metrics.completedCount,
        scheduledCount: metrics.scheduledCount,
        verifiedCount: metrics.verifiedCount,
        activeDays: metrics.activeDays,
        seasonStatus: 'active',
        rewardClaimed: existingPrivateScore?.rewardClaimed ?? false,
        updatedAt: now,
      };
      if (currentUser.avatarUrl) scorePayload.avatarUrl = currentUser.avatarUrl;
      await setDoc(doc(db, 'competition_scores', scoreDocId), scorePayload, { merge: true });
    } catch (err) {
      console.warn('Private league score sync skipped:', err);
    }
  }
}

export async function createPrivateLeague(params: {
  creator: UserPrivate;
  name: string;
  minVerificationLevel: 'basic' | 'verified';
  todayDate: string;
}): Promise<{ seasonId: string; inviteCode: string }> {
  const { creator, name, minVerificationLevel, todayDate } = params;
  const seasonId = `league_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const inviteCode = generateTeamInviteCode('LG');
  const { weekKey, startDate, endDate } = getWeekBoundsFromDate(todayDate);
  const titleDef = getTitleForLevel(creator.level);
  const now = serverTimestamp();

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'competition_seasons', seasonId), {
      id: seasonId,
      leagueType: 'private',
      name: name.trim().slice(0, 64),
      weekKey,
      startDate,
      endDate,
      creatorId: creator.uid,
      inviteCode,
      memberUids: [creator.uid],
      minVerificationLevel,
      maxCompetitionHabits: MAX_COMPETITION_HABITS,
      scoringWeights: { ...COMPETITION_WEIGHTS },
      rulesLocked: true,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    const partPayload: Record<string, unknown> = {
      id: `${seasonId}_${creator.uid}`,
      seasonId,
      weekKey,
      userId: creator.uid,
      memberUids: [creator.uid],
      displayName: creator.displayName,
      username: creator.username,
      level: creator.level,
      titleKey: titleDef.key,
      rulesAccepted: true,
      joinedAt: now,
      updatedAt: now,
    };
    if (creator.avatarUrl) partPayload.avatarUrl = creator.avatarUrl;
    batch.set(doc(db, 'competition_participants', `${seasonId}_${creator.uid}`), partPayload);

    await batch.commit();
    return { seasonId, inviteCode };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `competition_seasons/${seasonId}`);
  }
}

export async function joinPrivateLeagueByCode(inviteCode: string, user: UserPrivate): Promise<string> {
  const cleanCode = inviteCode.trim().toUpperCase();
  if (!/^[A-Z0-9\-]{4,16}$/.test(cleanCode)) {
    throw new Error('聯賽邀請碼格式無效');
  }
  try {
    const q = query(
      collection(db, 'competition_seasons'),
      where('leagueType', '==', 'private'),
      where('status', '==', 'active'),
      where('inviteCode', '==', cleanCode),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      throw new Error('找不到進行中的私人聯賽邀請碼');
    }
    const seasonDoc = snap.docs[0];
    const season = seasonDoc.data() as CompetitionSeason;

    if (season.memberUids.includes(user.uid)) {
      throw new Error('你已經在這個私人聯賽中');
    }
    if (season.memberUids.length >= 10) {
      throw new Error('此私人聯賽已達 10 人上限');
    }

    const nextMembers = [...season.memberUids, user.uid];
    const titleDef = getTitleForLevel(user.level);
    const now = serverTimestamp();

    const batch = writeBatch(db);
    batch.update(doc(db, 'competition_seasons', season.id), {
      memberUids: nextMembers,
      updatedAt: now,
    });

    const partPayload: Record<string, unknown> = {
      id: `${season.id}_${user.uid}`,
      seasonId: season.id,
      weekKey: season.weekKey,
      userId: user.uid,
      memberUids: nextMembers,
      displayName: user.displayName,
      username: user.username,
      level: user.level,
      titleKey: titleDef.key,
      rulesAccepted: true,
      joinedAt: now,
      updatedAt: now,
    };
    if (user.avatarUrl) partPayload.avatarUrl = user.avatarUrl;
    batch.set(doc(db, 'competition_participants', `${season.id}_${user.uid}`), partPayload);

    await batch.commit();
    return season.name;
  } catch (error) {
    if (error instanceof Error && (error.message.includes('聯賽') || error.message.includes('邀請碼'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `competition_seasons/${cleanCode}`);
  }
}

export async function settleCompetitionSeason(
  season: CompetitionSeason,
  seasonScores: CompetitionScore[],
  currentUser: UserPrivate
): Promise<{ winnerId: string; mostImprovedUid: string }> {
  if (season.status === 'settled') {
    return {
      winnerId: season.winnerId || '',
      mostImprovedUid: season.mostImprovedUid || '',
    };
  }
  const rankedByScore = sortCompetitionScores(seasonScores, 'score');
  const rankedByImprove = sortCompetitionScores(seasonScores, 'improvement');
  const winnerId = rankedByScore[0]?.userId || currentUser.uid;
  const topImproved = rankedByImprove[0];
  const mostImprovedUid =
    topImproved && topImproved.improvementDelta > 0 ? topImproved.userId : '';

  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();
    const updatePayload: Record<string, unknown> = {
      status: 'settled',
      winnerId,
      settledAt: now,
      updatedAt: now,
    };
    if (mostImprovedUid) updatePayload.mostImprovedUid = mostImprovedUid;

    batch.update(doc(db, 'competition_seasons', season.id), updatePayload);
    await batch.commit();
    return { winnerId, mostImprovedUid };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `competition_seasons/${season.id}`);
  }
}

export async function claimLeagueReward(params: {
  season: CompetitionSeason;
  seasonScores: CompetitionScore[];
  currentUser: UserPrivate;
  publicProfile: PublicProfile;
}): Promise<{ xpAwarded: number; unlockedBadges: string[] }> {
  const { season, seasonScores, currentUser, publicProfile } = params;
  const uid = currentUser.uid;
  const ranked = sortCompetitionScores(seasonScores, 'score');
  const myIndex = ranked.findIndex((s) => s.userId === uid);
  const myScore = ranked[myIndex];
  if (!myScore) throw new Error('尚未有本賽季積分紀錄');
  if (myScore.rewardClaimed) throw new Error('已領取過本賽季獎勵');

  const rank = myIndex + 1;
  const scoreKeyId = `${season.leagueType === 'circle' ? `circle_${season.weekKey}` : season.id}_${uid}`;
  const txId = `${uid}_league_${season.id}`;

  const badgesToUnlock: { key: string; metric: string }[] = [];
  let xpAmount = 0;

  if (rank === 1 && myScore.competitionScore > 0) {
    xpAmount = 100;
    badgesToUnlock.push({ key: 'league_champion', metric: `season:${season.weekKey},rank:1` });
    badgesToUnlock.push({ key: 'league_podium', metric: `season:${season.weekKey},rank:1` });
  } else if (rank <= 3 && myScore.competitionScore > 0) {
    xpAmount = 60;
    badgesToUnlock.push({ key: 'league_podium', metric: `season:${season.weekKey},rank:${rank}` });
  } else if (myScore.consistencyRate >= 80) {
    xpAmount = 40;
  }

  if (season.mostImprovedUid === uid && myScore.improvementDelta > 0) {
    if (xpAmount === 0) xpAmount = 50;
    badgesToUnlock.push({
      key: 'most_improved',
      metric: `season:${season.weekKey},delta:+${myScore.improvementDelta}%`,
    });
  }

  const localDate = getLocalDateStr(new Date(), currentUser.timezone);
  const weekKey = getWeekKey(localDate);
  const currentBadges = new Set(publicProfile.unlockedBadges || []);
  const newlyUnlocked: string[] = [];

  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();

    badgesToUnlock.forEach((b) => {
      if (!currentBadges.has(b.key)) {
        if (addAchievementWriteToBatch(batch, uid, b.key, b.metric, now)) {
          currentBadges.add(b.key);
          newlyUnlocked.push(b.key);
        }
      }
    });

    const nextBestRank =
      !currentUser.bestWeeklyRank || currentUser.bestWeeklyRank === 0
        ? rank
        : Math.min(currentUser.bestWeeklyRank, rank);

    if (xpAmount > 0) {
      const existingTx = await getDoc(doc(db, 'xp_transactions', txId));
      if (!existingTx.exists()) {
        const nextTotalXp = currentUser.totalXp + xpAmount;
        const nextWeeklyXp = (currentUser.weekKey === weekKey ? currentUser.weeklyXp : 0) + xpAmount;
        const nextLevel = levelFromXp(nextTotalXp);

        batch.set(doc(db, 'xp_transactions', txId), {
          id: txId,
          userId: uid,
          type: 'league_reward',
          amount: xpAmount,
          sourceId: season.id,
          localDate,
          weekKey,
          description: `${season.name} 第 ${rank} 名賽季結算獎勵`,
          createdAt: now,
        });

        batch.update(doc(db, 'users', uid), {
          totalXp: nextTotalXp,
          weeklyXp: nextWeeklyXp,
          weekKey,
          level: nextLevel,
          lastTxId: txId,
          updatedAt: now,
        });

        batch.update(doc(db, 'public_profiles', uid), {
          totalXp: nextTotalXp,
          weeklyXp: nextWeeklyXp,
          weekKey,
          level: nextLevel,
          bestWeeklyRank: nextBestRank,
          unlockedBadges: Array.from(currentBadges).slice(0, 24),
          lastTxId: txId,
          updatedAt: now,
        });
      }
    } else if (newlyUnlocked.length > 0 || nextBestRank !== currentUser.bestWeeklyRank) {
      batch.update(doc(db, 'public_profiles', uid), {
        bestWeeklyRank: nextBestRank,
        unlockedBadges: Array.from(currentBadges).slice(0, 24),
        updatedAt: now,
      });
    }

    batch.update(doc(db, 'competition_scores', scoreKeyId), {
      seasonStatus: 'settled',
      rewardClaimed: true,
      updatedAt: now,
    });

    await batch.commit();
    return { xpAwarded: xpAmount, unlockedBadges: newlyUnlocked };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `competition_scores/${scoreKeyId}`);
  }
}

export async function startNextCircleSeason(params: {
  currentUser: UserPrivate;
  friendUids: string[];
  fromMondayDate: string;
}): Promise<string> {
  const { currentUser, friendUids, fromMondayDate } = params;
  const nextMonday = addDaysLocal(fromMondayDate, 7);
  const { weekKey, startDate, endDate } = getWeekBoundsFromDate(nextMonday);
  const seasonDocId = `circle_${weekKey}_${currentUser.uid}`;
  const visibleCircle = Array.from(new Set([currentUser.uid, ...friendUids])).slice(0, 100);
  const now = serverTimestamp();

  try {
    const snap = await getDoc(doc(db, 'competition_seasons', seasonDocId));
    if (!snap.exists()) {
      await setDoc(doc(db, 'competition_seasons', seasonDocId), {
        id: seasonDocId,
        leagueType: 'circle',
        name: `好友圈週聯賽 ${weekKey}`,
        weekKey,
        startDate,
        endDate,
        creatorId: currentUser.uid,
        memberUids: visibleCircle,
        minVerificationLevel: 'basic',
        maxCompetitionHabits: MAX_COMPETITION_HABITS,
        scoringWeights: { ...COMPETITION_WEIGHTS },
        rulesLocked: true,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
    }
    return weekKey;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `competition_seasons/${seasonDocId}`);
  }
}

/**
 * Claims XP + Better Together badge for any activated friend referrals.
 */
export async function claimPendingReferralRewards(
  currentUser: UserPrivate,
  publicProfile: PublicProfile,
  referrals: ReferralRecord[]
): Promise<number> {
  const uid = currentUser.uid;
  const claimable = referrals.filter(
    (r) => r.referrerUid === uid && r.status === 'activated' && !r.claimedByReferrer
  );
  if (claimable.length === 0) return 0;

  let totalAwarded = 0;
  let runningTotalXp = currentUser.totalXp;
  let runningWeeklyXp = currentUser.weeklyXp;
  const localDate = getLocalDateStr(new Date(), currentUser.timezone);
  const weekKey = getWeekKey(localDate);
  if (currentUser.weekKey !== weekKey) runningWeeklyXp = 0;
  const badges = new Set(publicProfile.unlockedBadges || []);

  for (const ref of claimable) {
    const txId = `${uid}_ref_${ref.invitedUid}`;
    try {
      const existingTx = await getDoc(doc(db, 'xp_transactions', txId));
      if (existingTx.exists()) continue;

      runningTotalXp += 30;
      runningWeeklyXp += 30;
      const nextLevel = levelFromXp(runningTotalXp);
      const batch = writeBatch(db);
      const now = serverTimestamp();

      batch.set(doc(db, 'xp_transactions', txId), {
        id: txId,
        userId: uid,
        type: 'referral_bonus',
        amount: 30,
        sourceId: ref.invitedUid,
        localDate,
        weekKey,
        description: `邀請夥伴「${ref.invitedName}」完成首次有效打卡`,
        createdAt: now,
      });

      batch.update(doc(db, 'referrals', ref.invitedUid), {
        claimedByReferrer: true,
      });

      if (!badges.has('referral_mentor')) {
        if (addAchievementWriteToBatch(batch, uid, 'referral_mentor', `invited:${ref.invitedUid}`, now)) {
          badges.add('referral_mentor');
        }
      }

      batch.update(doc(db, 'users', uid), {
        totalXp: runningTotalXp,
        weeklyXp: runningWeeklyXp,
        weekKey,
        level: nextLevel,
        lastTxId: txId,
        updatedAt: now,
      });

      batch.update(doc(db, 'public_profiles', uid), {
        totalXp: runningTotalXp,
        weeklyXp: runningWeeklyXp,
        weekKey,
        level: nextLevel,
        unlockedBadges: Array.from(badges).slice(0, 24),
        lastTxId: txId,
        updatedAt: now,
      });

      await batch.commit();
      totalAwarded += 30;
    } catch (err) {
      console.warn('Referral reward claim skipped:', err);
    }
  }
  return totalAwarded;
}

export async function findUsersByQuery(rawQuery: string, currentUid: string): Promise<PublicProfile[]> {
  const cleaned = rawQuery.trim();
  if (!cleaned) return [];

  const resultsMap = new Map<string, PublicProfile>();

  try {
    const upperCode = cleaned.toUpperCase();
    if (/^[A-Z0-9\-]{4,16}$/.test(upperCode)) {
      const inviteSnap = await getDoc(doc(db, 'invites', upperCode));
      if (inviteSnap.exists()) {
        const targetUid = inviteSnap.data().uid as string;
        if (targetUid !== currentUid) {
          const profSnap = await getDoc(doc(db, 'public_profiles', targetUid));
          if (profSnap.exists()) {
            resultsMap.set(targetUid, profSnap.data() as PublicProfile);
          }
        }
      }
    }

    const lowerUname = cleaned.replace(/^@/, '').toLowerCase();
    if (/^[a-z0-9_]{2,24}$/.test(lowerUname)) {
      const unameSnap = await getDoc(doc(db, 'usernames', lowerUname));
      if (unameSnap.exists()) {
        const targetUid = unameSnap.data().uid as string;
        if (targetUid !== currentUid) {
          const profSnap = await getDoc(doc(db, 'public_profiles', targetUid));
          if (profSnap.exists()) {
            const prof = profSnap.data() as PublicProfile;
            if (prof.isDiscoverable) {
              resultsMap.set(targetUid, prof);
            }
          }
        }
      }
    }

    if (lowerUname.length >= 2) {
      try {
        const q = query(
          collection(db, 'public_profiles'),
          where('isDiscoverable', '==', true),
          where('usernameLower', '>=', lowerUname),
          where('usernameLower', '<=', lowerUname + '\uf8ff'),
          limit(10)
        );
        const snap = await getDocs(q);
        snap.forEach((d) => {
          const prof = d.data() as PublicProfile;
          if (prof.uid !== currentUid) {
            resultsMap.set(prof.uid, prof);
          }
        });
      } catch (prefixErr) {
        console.warn('Prefix search skipped (exact lookup still active):', prefixErr);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'public_profiles');
  }

  return Array.from(resultsMap.values());
}

export async function lookupUserByInviteCode(code: string): Promise<PublicProfile | null> {
  const upperCode = code.trim().toUpperCase();
  if (!/^[A-Z0-9\-]{4,16}$/.test(upperCode)) return null;
  try {
    const inviteSnap = await getDoc(doc(db, 'invites', upperCode));
    if (!inviteSnap.exists()) return null;
    const targetUid = inviteSnap.data().uid as string;
    const profSnap = await getDoc(doc(db, 'public_profiles', targetUid));
    return profSnap.exists() ? (profSnap.data() as PublicProfile) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `invites/${upperCode}`);
  }
}

export async function sendFriendRequest(currentUser: UserPrivate, targetUid: string): Promise<void> {
  if (currentUser.uid === targetUid) throw new Error('不能加自己為好友');
  const fid = getFriendshipId(currentUser.uid, targetUid);
  const fRef = doc(db, 'friendships', fid);
  try {
    const existingSnap = await getDoc(fRef);
    if (existingSnap.exists()) {
      const st = existingSnap.data().status;
      if (st === 'accepted') throw new Error('你們已經是好友了');
      if (st === 'pending') throw new Error('好友邀請已發送，請等待對方確認');
      await deleteDoc(fRef);
    }

    const now = serverTimestamp();
    const batch = writeBatch(db);
    batch.set(fRef, {
      id: fid,
      requesterId: currentUser.uid,
      recipientId: targetUid,
      participants: [currentUser.uid, targetUid].sort(),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });

    const notifId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const notifPayload: Record<string, unknown> = {
      id: notifId,
      userId: targetUid,
      senderId: currentUser.uid,
      senderName: currentUser.displayName,
      type: 'friend_request',
      title: `${currentUser.displayName} 想成為你的自律夥伴`,
      body: '前往 Friends 頁面確認好友邀請',
      targetTab: 'friends',
      targetId: fid,
      read: false,
      createdAt: now,
    };
    if (currentUser.avatarUrl) notifPayload.senderAvatar = currentUser.avatarUrl;
    batch.set(doc(db, 'notifications', notifId), notifPayload);

    await batch.commit();
  } catch (error) {
    if (error instanceof Error && (error.message.includes('好友') || error.message.includes('自己'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, `friendships/${fid}`);
  }
}

export async function respondFriendRequest(
  friendship: Friendship,
  decision: 'accepted' | 'declined',
  currentUser: UserPrivate
): Promise<void> {
  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();
    batch.update(doc(db, 'friendships', friendship.id), {
      status: decision,
      updatedAt: now,
    });

    if (decision === 'accepted') {
      const notifId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const notifPayload: Record<string, unknown> = {
        id: notifId,
        userId: friendship.requesterId,
        senderId: currentUser.uid,
        senderName: currentUser.displayName,
        type: 'friend_accepted',
        title: `${currentUser.displayName} 已接受你的好友邀請`,
        body: '現在可以在動態牆看到彼此的公開打卡紀錄',
        targetTab: 'friends',
        targetId: friendship.id,
        read: false,
        createdAt: now,
      };
      if (currentUser.avatarUrl) notifPayload.senderAvatar = currentUser.avatarUrl;
      batch.set(doc(db, 'notifications', notifId), notifPayload);
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `friendships/${friendship.id}`);
  }
}

export async function removeFriend(friendshipId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'friendships', friendshipId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `friendships/${friendshipId}`);
  }
}

export async function toggleFeedReaction(
  feedItem: ActivityFeedItem,
  currentUser: UserPrivate,
  reactionType: 'like' | 'cheer'
): Promise<void> {
  const reactRef = doc(db, 'activity_feed', feedItem.id, 'reactions', currentUser.uid);
  const feedRef = doc(db, 'activity_feed', feedItem.id);
  try {
    const snap = await getDoc(reactRef);
    const batch = writeBatch(db);
    const now = serverTimestamp();

    let likesDelta = 0;
    let cheersDelta = 0;

    if (snap.exists()) {
      const existing = snap.data() as FeedReaction;
      if (existing.type === reactionType) {
        batch.delete(reactRef);
        if (reactionType === 'like') likesDelta = -1;
        else cheersDelta = -1;
      } else {
        batch.set(reactRef, {
          userId: currentUser.uid,
          displayName: currentUser.displayName,
          type: reactionType,
          createdAt: now,
        });
        if (reactionType === 'like') {
          likesDelta = 1;
          cheersDelta = -1;
        } else {
          likesDelta = -1;
          cheersDelta = 1;
        }
      }
    } else {
      batch.set(reactRef, {
        userId: currentUser.uid,
        displayName: currentUser.displayName,
        type: reactionType,
        createdAt: now,
      });
      if (reactionType === 'like') likesDelta = 1;
      else cheersDelta = 1;

      if (feedItem.userId !== currentUser.uid) {
        const notifId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const notifPayload: Record<string, unknown> = {
          id: notifId,
          userId: feedItem.userId,
          senderId: currentUser.uid,
          senderName: currentUser.displayName,
          type: reactionType,
          title:
            reactionType === 'like'
              ? `${currentUser.displayName} 讚賞了你的「${feedItem.habitTitle}」`
              : `${currentUser.displayName} 為你的「${feedItem.habitTitle}」加油打氣`,
          targetTab: 'friends',
          targetId: feedItem.id,
          read: false,
          createdAt: now,
        };
        if (currentUser.avatarUrl) notifPayload.senderAvatar = currentUser.avatarUrl;
        batch.set(doc(db, 'notifications', notifId), notifPayload);
      }
    }

    batch.update(feedRef, {
      likesCount: Math.max(0, feedItem.likesCount + likesDelta),
      cheersCount: Math.max(0, feedItem.cheersCount + cheersDelta),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `activity_feed/${feedItem.id}/reactions`);
  }
}

export async function addFeedComment(
  feedItem: ActivityFeedItem,
  currentUser: UserPrivate,
  text: string
): Promise<void> {
  const cleaned = text.trim().slice(0, 280);
  if (!cleaned) return;
  const commentId = `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();

    const commentPayload: Record<string, unknown> = {
      id: commentId,
      feedId: feedItem.id,
      userId: currentUser.uid,
      authorName: currentUser.displayName,
      text: cleaned,
      createdAt: now,
    };
    if (currentUser.avatarUrl) commentPayload.authorAvatar = currentUser.avatarUrl;

    batch.set(doc(db, 'activity_feed', feedItem.id, 'comments', commentId), commentPayload);
    batch.update(doc(db, 'activity_feed', feedItem.id), {
      commentsCount: feedItem.commentsCount + 1,
      lastCommentId: commentId,
    });

    if (feedItem.userId !== currentUser.uid) {
      const notifId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const notifPayload: Record<string, unknown> = {
        id: notifId,
        userId: feedItem.userId,
        senderId: currentUser.uid,
        senderName: currentUser.displayName,
        type: 'comment',
        title: `${currentUser.displayName} 留言了你的打卡動態`,
        body: cleaned.slice(0, 120),
        targetTab: 'friends',
        targetId: feedItem.id,
        read: false,
        createdAt: now,
      };
      if (currentUser.avatarUrl) notifPayload.senderAvatar = currentUser.avatarUrl;
      batch.set(doc(db, 'notifications', notifId), notifPayload);
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `activity_feed/${feedItem.id}/comments/${commentId}`);
  }
}

export async function createChallenge(params: {
  creator: UserPrivate;
  opponent: PublicProfile;
  title: string;
  templateKey?: string;
  habitTitle: string;
  habitIcon: string;
  recordType: HabitRecordType;
  targetValue: number;
  targetTime?: string;
  dailyCap?: number;
  unit: string;
  startDate: string;
  endDate: string;
  ruleType: 'most_completions' | 'highest_rate';
  scoringMethod?: ChallengeScoringMethod;
  requiredVerificationLevel?: 'basic' | 'verified';
  xpPrize: number;
  creatorLinkedHabitId: string;
}): Promise<string> {
  const challengeId = `chl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const totalDays = getDaysBetweenInclusive(params.startDate, params.endDate);
  const participantIds = [params.creator.uid, params.opponent.uid];
  const now = serverTimestamp();

  const dailyCap =
    params.dailyCap && params.dailyCap >= 1
      ? Math.min(1000, Math.round(params.dailyCap))
      : params.recordType === 'value'
      ? Math.max(1, Math.min(1000, Math.round(params.targetValue || 60)))
      : 1;

  try {
    const batch = writeBatch(db);
    const challengePayload: Record<string, unknown> = {
      id: challengeId,
      title: params.title.trim().slice(0, 64),
      creatorId: params.creator.uid,
      opponentId: params.opponent.uid,
      participantIds,
      habitTitle: params.habitTitle.trim().slice(0, 48),
      habitIcon: params.habitIcon.slice(0, 32),
      recordType: params.recordType,
      targetValue: Math.max(0, Number(params.targetValue) || 1),
      dailyCap,
      unit: params.unit.trim().slice(0, 16),
      startDate: params.startDate,
      endDate: params.endDate,
      totalDays: Math.min(90, Math.max(1, totalDays)),
      ruleType: params.ruleType,
      scoringMethod: params.scoringMethod || (params.ruleType === 'highest_rate' ? 'completion_rate' : 'valid_count'),
      requiredVerificationLevel: params.requiredVerificationLevel || 'basic',
      rulesLocked: true,
      xpPrize: Math.min(200, Math.max(10, Math.round(params.xpPrize))),
      status: 'pending',
      winnerId: '',
      createdAt: now,
      updatedAt: now,
    };
    if (params.targetTime) challengePayload.targetTime = params.targetTime.slice(0, 5);
    if (params.templateKey) challengePayload.templateKey = params.templateKey.slice(0, 40);

    batch.set(doc(db, 'challenges', challengeId), challengePayload);

    const creatorMemberPayload: Record<string, unknown> = {
      id: `${challengeId}_${params.creator.uid}`,
      challengeId,
      userId: params.creator.uid,
      participantIds,
      displayName: params.creator.displayName,
      linkedHabitId: params.creatorLinkedHabitId,
      completedDates: [],
      completionsCount: 0,
      effectiveValue: 0,
      verifiedCompletionsCount: 0,
      completionRate: 0,
      claimedReward: false,
      updatedAt: now,
    };
    if (params.creator.avatarUrl) creatorMemberPayload.avatarUrl = params.creator.avatarUrl;

    const opponentMemberPayload: Record<string, unknown> = {
      id: `${challengeId}_${params.opponent.uid}`,
      challengeId,
      userId: params.opponent.uid,
      participantIds,
      displayName: params.opponent.displayName,
      linkedHabitId: '',
      completedDates: [],
      completionsCount: 0,
      effectiveValue: 0,
      verifiedCompletionsCount: 0,
      completionRate: 0,
      claimedReward: false,
      updatedAt: now,
    };
    if (params.opponent.avatarUrl) opponentMemberPayload.avatarUrl = params.opponent.avatarUrl;

    batch.set(doc(db, 'challenge_members', `${challengeId}_${params.creator.uid}`), creatorMemberPayload);
    batch.set(doc(db, 'challenge_members', `${challengeId}_${params.opponent.uid}`), opponentMemberPayload);

    const notifId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const notifPayload: Record<string, unknown> = {
      id: notifId,
      userId: params.opponent.uid,
      senderId: params.creator.uid,
      senderName: params.creator.displayName,
      type: 'challenge_invite',
      title: `${params.creator.displayName} 向你發起 1 VS 1 挑戰`,
      body: `${params.title}（${totalDays} 天 · 獎勵 ${params.xpPrize} XP）`,
      targetTab: 'compete',
      targetId: challengeId,
      read: false,
      createdAt: now,
    };
    if (params.creator.avatarUrl) notifPayload.senderAvatar = params.creator.avatarUrl;
    batch.set(doc(db, 'notifications', notifId), notifPayload);

    await batch.commit();
    return challengeId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `challenges/${challengeId}`);
  }
}

export async function respondChallenge(
  challenge: Challenge,
  decision: 'active' | 'declined',
  linkedHabitId?: string
): Promise<void> {
  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();
    batch.update(doc(db, 'challenges', challenge.id), {
      status: decision,
      updatedAt: now,
    });
    if (decision === 'active' && linkedHabitId) {
      batch.update(doc(db, 'challenge_members', `${challenge.id}_${challenge.opponentId}`), {
        linkedHabitId,
        updatedAt: now,
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `challenges/${challenge.id}`);
  }
}

export async function linkChallengeHabit(memberId: string, habitId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'challenge_members', memberId), {
      linkedHabitId: habitId,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `challenge_members/${memberId}`);
  }
}

export async function settleChallenge(
  challenge: Challenge,
  members: ChallengeMember[],
  currentUser: UserPrivate,
  publicProfile: PublicProfile
): Promise<string> {
  const mA = members.find((m) => m.userId === challenge.creatorId);
  const mB = members.find((m) => m.userId === challenge.opponentId);
  if (!mA || !mB) throw new Error('找不到挑戰參與者資料');

  const metricA =
    challenge.scoringMethod === 'capped_total_value'
      ? mA.effectiveValue ?? mA.completionsCount
      : challenge.scoringMethod === 'completion_rate'
      ? mA.completionRate
      : mA.completionsCount;
  const metricB =
    challenge.scoringMethod === 'capped_total_value'
      ? mB.effectiveValue ?? mB.completionsCount
      : challenge.scoringMethod === 'completion_rate'
      ? mB.completionRate
      : mB.completionsCount;

  let winnerId = 'tie';
  if (metricA > metricB) {
    winnerId = mA.userId;
  } else if (metricB > metricA) {
    winnerId = mB.userId;
  }

  try {
    const now = serverTimestamp();
    await updateDoc(doc(db, 'challenges', challenge.id), {
      status: 'completed',
      winnerId,
      settledAt: now,
      updatedAt: now,
    });

    if (winnerId === currentUser.uid) {
      await claimChallengeReward(challenge, currentUser, publicProfile);
    }

    return winnerId;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `challenges/${challenge.id}`);
  }
}

export async function claimChallengeReward(
  challenge: Challenge,
  currentUser: UserPrivate,
  publicProfile: PublicProfile
): Promise<boolean> {
  const uid = currentUser.uid;
  const memberId = `${challenge.id}_${uid}`;
  const txId = `${uid}_challenge_${challenge.id}`;

  const localDate = getLocalDateStr(new Date(), currentUser.timezone);
  const weekKey = getWeekKey(localDate);
  const nextTotalXp = currentUser.totalXp + challenge.xpPrize;
  const nextWeeklyXp = (currentUser.weekKey === weekKey ? currentUser.weeklyXp : 0) + challenge.xpPrize;
  const nextLevel = levelFromXp(nextTotalXp);
  const nextWins = (currentUser.winsCount || 0) + 1;

  const badges = new Set(publicProfile.unlockedBadges || []);
  let unlockedChamp = false;
  if (nextWins >= 5 && !badges.has('champion_5')) {
    badges.add('champion_5');
    unlockedChamp = true;
  }

  try {
    const existingTx = await getDoc(doc(db, 'xp_transactions', txId));
    if (existingTx.exists()) return false;

    const batch = writeBatch(db);
    const now = serverTimestamp();

    batch.set(doc(db, 'xp_transactions', txId), {
      id: txId,
      userId: uid,
      type: 'challenge_win',
      amount: challenge.xpPrize,
      sourceId: challenge.id,
      localDate,
      weekKey,
      description: `贏得 1v1 挑戰「${challenge.title}」`,
      createdAt: now,
    });

    batch.update(doc(db, 'challenge_members', memberId), {
      claimedReward: true,
      updatedAt: now,
    });

    batch.update(doc(db, 'users', uid), {
      totalXp: nextTotalXp,
      weeklyXp: nextWeeklyXp,
      weekKey,
      level: nextLevel,
      winsCount: nextWins,
      lastTxId: txId,
      updatedAt: now,
    });

    batch.update(doc(db, 'public_profiles', uid), {
      totalXp: nextTotalXp,
      weeklyXp: nextWeeklyXp,
      weekKey,
      level: nextLevel,
      winsCount: nextWins,
      unlockedBadges: Array.from(badges).slice(0, 24),
      lastTxId: txId,
      updatedAt: now,
    });

    if (unlockedChamp) {
      addAchievementWriteToBatch(batch, uid, 'champion_5', `challengeWins:${nextWins}`, now);
    }

    await batch.commit();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `xp_transactions/${txId}`);
  }
}

export async function createTeam(params: {
  creator: UserPrivate;
  name: string;
  description: string;
  goalTitle: string;
  goalType?: TeamGoalType;
  goalUnit?: string;
  minMemberContribution?: number;
  targetTotalCompletions: number;
  startDate: string;
  endDate: string;
  xpPrize: number;
}): Promise<{ teamId: string; inviteCode: string }> {
  const teamId = `team_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const inviteCode = generateTeamInviteCode('TM');
  const now = serverTimestamp();
  const minContrib = Math.max(1, Math.min(500, Math.round(params.minMemberContribution ?? 3)));

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'team_challenges', teamId), {
      id: teamId,
      name: params.name.trim().slice(0, 48),
      description: params.description.trim().slice(0, 160),
      creatorId: params.creator.uid,
      inviteCode,
      memberUids: [params.creator.uid],
      memberCount: 1,
      maxMembers: 10,
      goalTitle: params.goalTitle.trim().slice(0, 64),
      goalType: params.goalType || 'total_completions',
      goalUnit: (params.goalUnit || '次').slice(0, 16),
      minMemberContribution: minContrib,
      targetTotalCompletions: Math.max(3, Math.min(50000, Math.round(params.targetTotalCompletions))),
      currentTotalCompletions: 0,
      startDate: params.startDate,
      endDate: params.endDate,
      xpPrize: Math.min(200, Math.max(10, Math.round(params.xpPrize))),
      status: 'active',
      achievementUnlocked: false,
      createdAt: now,
      updatedAt: now,
    });

    batch.set(doc(db, 'team_invites', inviteCode), {
      inviteCode,
      teamId,
      teamName: params.name.trim().slice(0, 48),
      creatorId: params.creator.uid,
      createdAt: now,
    });

    const memberPayload: Record<string, unknown> = {
      id: `${teamId}_${params.creator.uid}`,
      teamId,
      userId: params.creator.uid,
      memberUids: [params.creator.uid],
      displayName: params.creator.displayName,
      role: 'owner',
      contributionCount: 0,
      completedDates: [],
      claimedReward: false,
      joinedAt: now,
      updatedAt: now,
    };
    if (params.creator.avatarUrl) memberPayload.avatarUrl = params.creator.avatarUrl;
    batch.set(doc(db, 'team_members', `${teamId}_${params.creator.uid}`), memberPayload);

    await batch.commit();
    return { teamId, inviteCode };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `team_challenges/${teamId}`);
  }
}

export async function joinTeamByCode(inviteCode: string, user: UserPrivate): Promise<string> {
  const cleanCode = inviteCode.trim().toUpperCase();
  if (!/^[A-Z0-9\-]{4,16}$/.test(cleanCode)) {
    throw new Error('邀請碼格式無效');
  }
  try {
    const invSnap = await getDoc(doc(db, 'team_invites', cleanCode));
    if (!invSnap.exists()) throw new Error('找不到此團隊邀請碼');

    const teamId = invSnap.data().teamId as string;
    let teamRef = doc(db, 'team_challenges', teamId);
    let teamSnap = await getDoc(teamRef);
    if (!teamSnap.exists()) {
      teamRef = doc(db, 'teams', teamId);
      teamSnap = await getDoc(teamRef);
    }
    if (!teamSnap.exists()) throw new Error('團隊已不存在');

    const team = teamSnap.data() as Team;
    if (team.memberUids.includes(user.uid)) {
      throw new Error('你已經是此團隊成員');
    }
    if (team.memberUids.length >= 10) {
      throw new Error('團隊人數已達上限（10 人）');
    }

    const now = serverTimestamp();
    const batch = writeBatch(db);
    const nextMemberUids = [...team.memberUids, user.uid];

    batch.update(teamRef, {
      memberUids: nextMemberUids,
      memberCount: nextMemberUids.length,
      updatedAt: now,
    });

    const memberPayload: Record<string, unknown> = {
      id: `${teamId}_${user.uid}`,
      teamId,
      userId: user.uid,
      memberUids: nextMemberUids,
      displayName: user.displayName,
      role: 'member',
      contributionCount: 0,
      completedDates: [],
      claimedReward: false,
      joinedAt: now,
      updatedAt: now,
    };
    if (user.avatarUrl) memberPayload.avatarUrl = user.avatarUrl;
    batch.set(doc(db, 'team_members', `${teamId}_${user.uid}`), memberPayload);

    await batch.commit();
    return team.name;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('邀請碼') || error.message.includes('團隊'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `team_challenges/${cleanCode}`);
  }
}

export async function claimTeamReward(
  team: Team,
  myMember: TeamMember,
  currentUser: UserPrivate,
  publicProfile: PublicProfile
): Promise<boolean> {
  const minRequired = team.minMemberContribution ?? 1;
  if (myMember.contributionCount < minRequired) {
    throw new Error(
      `為防止搭便車，須至少貢獻 ${minRequired} ${team.goalUnit || '次'}（目前 ${myMember.contributionCount}）才可領取團隊獎勵`
    );
  }

  const uid = currentUser.uid;
  const txId = `${uid}_team_${team.id}`;

  const localDate = getLocalDateStr(new Date(), currentUser.timezone);
  const weekKey = getWeekKey(localDate);
  const nextTotalXp = currentUser.totalXp + team.xpPrize;
  const nextWeeklyXp = (currentUser.weekKey === weekKey ? currentUser.weeklyXp : 0) + team.xpPrize;
  const nextLevel = levelFromXp(nextTotalXp);

  const badges = new Set(publicProfile.unlockedBadges || []);
  const unlockTeamBadge = !badges.has('team_player');
  if (unlockTeamBadge) badges.add('team_player');

  try {
    const existingTx = await getDoc(doc(db, 'xp_transactions', txId));
    if (existingTx.exists()) return false;

    const batch = writeBatch(db);
    const now = serverTimestamp();

    batch.set(doc(db, 'xp_transactions', txId), {
      id: txId,
      userId: uid,
      type: 'team_goal',
      amount: team.xpPrize,
      sourceId: team.id,
      localDate,
      weekKey,
      description: `團隊「${team.name}」達成共同目標`,
      createdAt: now,
    });

    batch.update(doc(db, 'team_members', `${team.id}_${uid}`), {
      claimedReward: true,
      updatedAt: now,
    });

    batch.update(doc(db, 'users', uid), {
      totalXp: nextTotalXp,
      weeklyXp: nextWeeklyXp,
      weekKey,
      level: nextLevel,
      lastTxId: txId,
      updatedAt: now,
    });

    batch.update(doc(db, 'public_profiles', uid), {
      totalXp: nextTotalXp,
      weeklyXp: nextWeeklyXp,
      weekKey,
      level: nextLevel,
      unlockedBadges: Array.from(badges).slice(0, 24),
      lastTxId: txId,
      updatedAt: now,
    });

    if (unlockTeamBadge) {
      addAchievementWriteToBatch(
        batch,
        uid,
        'team_player',
        `team:${team.id},contrib:${myMember.contributionCount}`,
        now
      );
    }

    await batch.commit();
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('搭便車')) throw error;
    handleFirestoreError(error, OperationType.WRITE, `xp_transactions/${txId}`);
  }
}

export async function fetchFriendPublicHabits(friendUid: string): Promise<Habit[]> {
  try {
    const q = query(
      collection(db, 'habits'),
      where('userId', '==', friendUid),
      where('isPublic', '==', true)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as Habit)
      .filter((h) => !h.archived)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `habits/${friendUid}`);
  }
}

export async function markNotificationRead(notifId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notifId), { read: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${notifId}`);
  }
}

export async function markAllNotificationsRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const batch = writeBatch(db);
    ids.slice(0, 50).forEach((id) => {
      batch.update(doc(db, 'notifications', id), { read: true });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'notifications/batchRead');
  }
}

export { sanitizeIdPart, Timestamp };
