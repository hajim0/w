import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  BarChart3,
  Bell,
  Check,
  Home,
  Monitor,
  Moon,
  Sun,
  Trophy,
  User as UserIcon,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  testConnection,
} from './lib/firebase';
import {
  Achievement,
  AchievementRecord,
  ActivityFeedItem,
  AppNotification,
  Challenge,
  ChallengeMember,
  CompetitionScore,
  CompetitionSeason,
  Friendship,
  Habit,
  HabitRecord,
  HabitRecordAuditLog,
  NavTab,
  PublicProfile,
  ReferralRecord,
  Team,
  TeamMember,
  UserPrivate,
  XpTransaction,
} from './types';
import { HABIT_TEMPLATES } from './constants/habits';
import { formatTimeAgo, getLocalDateStr, isHabitScheduledForDate } from './lib/date';
import {
  claimPendingReferralRewards,
  completeHabitCheckIn,
  createHabit,
  deleteHabit,
  ensureUserProfile,
  lookupUserByInviteCode,
  markAllNotificationsRead,
  markNotificationRead,
  reorderHabits,
  sendFriendRequest,
  syncMyWeeklySeasonScore,
  updateCheckInRecord,
  updateHabit,
} from './services/firestoreService';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider, useToast } from './components/Toast';
import { ThemeProvider, useTheme } from './lib/theme';
import { AuthScreen } from './components/AuthScreen';
import { HomeView } from './components/HomeView';
import { HabitModal } from './components/HabitModal';
import { CheckInModal } from './components/CheckInModal';
import { FriendsView } from './components/FriendsView';
import { CompeteView } from './components/CompeteView';
import { ProgressView } from './components/ProgressView';
import { ProfileView } from './components/ProfileView';
import { HomeSkeleton } from './components/Skeletons';

function KadenceApp() {
  const { showToast } = useToast();
  const { mode, cycleMode } = useTheme();

  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profileReadyUid, setProfileReadyUid] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [notifOpen, setNotifOpen] = useState(false);

  // Core User State
  const [userPrivate, setUserPrivate] = useState<UserPrivate | null>(null);
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [records, setRecords] = useState<HabitRecord[]>([]);
  const [xpTransactions, setXpTransactions] = useState<XpTransaction[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [friendProfiles, setFriendProfiles] = useState<Record<string, PublicProfile>>({});
  const [feedItems, setFeedItems] = useState<ActivityFeedItem[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [challengeMembers, setChallengeMembers] = useState<ChallengeMember[]>([]);
  const [legacyTeams, setLegacyTeams] = useState<Team[]>([]);
  const [teamChallenges, setTeamChallenges] = useState<Team[]>([]);
  const [teamMembersMap, setTeamMembersMap] = useState<Record<string, TeamMember[]>>({});
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [achievementRecords, setAchievementRecords] = useState<AchievementRecord[]>([]);
  const [seasons, setSeasons] = useState<CompetitionSeason[]>([]);
  const [competitionScores, setCompetitionScores] = useState<CompetitionScore[]>([]);
  const [auditLogs, setAuditLogs] = useState<HabitRecordAuditLog[]>([]);
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // Modals
  const [habitModalOpen, setHabitModalOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [checkInHabit, setCheckInHabit] = useState<Habit | null>(null);
  const [checkInRecord, setCheckInRecord] = useState<HabitRecord | null>(null);
  const [challengeTargetFriend, setChallengeTargetFriend] = useState<PublicProfile | null>(null);

  // Invite URL param handling
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('invite');
  });
  const pendingInviteCodeRef = useRef<string | null>(pendingInviteCode);
  const [invitePreviewUser, setInvitePreviewUser] = useState<PublicProfile | null>(null);

  // Network listeners & initial connection check
  useEffect(() => {
    testConnection();
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      setProfileReadyUid(null);
      setProfileError(null);
      if (fbUser) {
        setProfileLoading(true);
        try {
          await ensureUserProfile(fbUser, pendingInviteCodeRef.current || undefined);
          setProfileReadyUid(fbUser.uid);
        } catch (err) {
          console.error('Failed to ensure profile:', err);
          setProfileError(err instanceof Error ? err.message : '初始化個人資料失敗');
        } finally {
          setProfileLoading(false);
        }
      } else {
        setUserPrivate(null);
        setPublicProfile(null);
        setHabits([]);
        setRecords([]);
        setXpTransactions([]);
        setFriendships([]);
        setFriendProfiles({});
        setFeedItems([]);
        setChallenges([]);
        setChallengeMembers([]);
        setLegacyTeams([]);
        setTeamChallenges([]);
        setTeamMembersMap({});
        setAchievements([]);
        setAchievementRecords([]);
        setSeasons([]);
        setCompetitionScores([]);
        setAuditLogs([]);
        setReferrals([]);
        setNotifications([]);
        setDataLoading(false);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Resolve ?invite=CODE after login
  useEffect(() => {
    if (!firebaseUser || profileReadyUid !== firebaseUser.uid || !pendingInviteCode) return;
    let active = true;
    lookupUserByInviteCode(pendingInviteCode)
      .then((prof) => {
        if (active && prof && prof.uid !== firebaseUser.uid) {
          setInvitePreviewUser(prof);
        }
      })
      .catch(() => {})
      .finally(() => {
        setPendingInviteCode(null);
        const url = new URL(window.location.href);
        url.searchParams.delete('invite');
        window.history.replaceState({}, '', url.pathname + url.search);
      });
    return () => {
      active = false;
    };
  }, [firebaseUser, profileReadyUid, pendingInviteCode]);

  // Real-time Firestore Subscriptions for Authenticated User
  useEffect(() => {
    if (!authReady || !firebaseUser || profileReadyUid !== firebaseUser.uid) return;
    const uid = firebaseUser.uid;
    setDataLoading(true);

    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(
        doc(db, 'users', uid),
        (snap) => {
          if (snap.exists()) setUserPrivate(snap.data() as UserPrivate);
          setDataLoading(false);
        },
        (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}`)
      )
    );

    unsubs.push(
      onSnapshot(
        doc(db, 'public_profiles', uid),
        (snap) => {
          if (snap.exists()) setPublicProfile(snap.data() as PublicProfile);
        },
        (err) => handleFirestoreError(err, OperationType.GET, `public_profiles/${uid}`)
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'habits'), where('userId', '==', uid)),
        (snap) => {
          const list = snap.docs
            .map((d) => d.data() as Habit)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          setHabits(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'habits')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'habit_records'), where('userId', '==', uid)),
        (snap) => {
          setRecords(snap.docs.map((d) => d.data() as HabitRecord));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'habit_records')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'xp_transactions'), where('userId', '==', uid)),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as XpTransaction);
          list.sort((a, b) => {
            const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return tb - ta;
          });
          setXpTransactions(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'xp_transactions')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'friendships'), where('participants', 'array-contains', uid)),
        (snap) => {
          setFriendships(snap.docs.map((d) => d.data() as Friendship));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'friendships')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'activity_feed'), where('visibleTo', 'array-contains', uid)),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as ActivityFeedItem);
          list.sort((a, b) => {
            const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return tb - ta;
          });
          setFeedItems(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'activity_feed')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'challenges'), where('participantIds', 'array-contains', uid)),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as Challenge);
          list.sort((a, b) => {
            const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return tb - ta;
          });
          setChallenges(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'challenges')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'challenge_members'), where('participantIds', 'array-contains', uid)),
        (snap) => {
          setChallengeMembers(snap.docs.map((d) => d.data() as ChallengeMember));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'challenge_members')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'teams'), where('memberUids', 'array-contains', uid)),
        (snap) => {
          setLegacyTeams(snap.docs.map((d) => d.data() as Team));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'teams')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'team_challenges'), where('memberUids', 'array-contains', uid)),
        (snap) => {
          setTeamChallenges(snap.docs.map((d) => d.data() as Team));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'team_challenges')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'achievements'), where('userId', '==', uid)),
        (snap) => {
          setAchievements(snap.docs.map((d) => d.data() as Achievement));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'achievements')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'achievement_records'), where('userId', '==', uid)),
        (snap) => {
          setAchievementRecords(snap.docs.map((d) => d.data() as AchievementRecord));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'achievement_records')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'competition_seasons'), where('memberUids', 'array-contains', uid)),
        (snap) => {
          setSeasons(snap.docs.map((d) => d.data() as CompetitionSeason));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'competition_seasons')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'competition_scores'), where('visibleTo', 'array-contains', uid)),
        (snap) => {
          setCompetitionScores(snap.docs.map((d) => d.data() as CompetitionScore));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'competition_scores')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'habit_record_audit_logs'), where('userId', '==', uid)),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as HabitRecordAuditLog);
          list.sort((a, b) => {
            const ta = a.editedAt?.toMillis ? a.editedAt.toMillis() : 0;
            const tb = b.editedAt?.toMillis ? b.editedAt.toMillis() : 0;
            return tb - ta;
          });
          setAuditLogs(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'habit_record_audit_logs')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'referrals'), where('referrerUid', '==', uid)),
        (snap) => {
          setReferrals(snap.docs.map((d) => d.data() as ReferralRecord));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'referrals')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'notifications'), where('userId', '==', uid)),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as AppNotification);
          list.sort((a, b) => {
            const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return tb - ta;
          });
          setNotifications(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
      )
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authReady, firebaseUser, profileReadyUid]);

  // Subscribe to PublicProfiles of related users (friends & pending requests)
  const relatedUids = useMemo(() => {
    if (!firebaseUser) return [];
    const uidSet = new Set<string>();
    friendships.forEach((f) => {
      f.participants.forEach((p) => {
        if (p !== firebaseUser.uid) uidSet.add(p);
      });
    });
    return Array.from(uidSet);
  }, [friendships, firebaseUser]);

  useEffect(() => {
    if (relatedUids.length === 0) {
      setFriendProfiles({});
      return;
    }
    const unsubs = relatedUids.map((otherUid) =>
      onSnapshot(
        doc(db, 'public_profiles', otherUid),
        (snap) => {
          if (snap.exists()) {
            setFriendProfiles((prev) => ({
              ...prev,
              [otherUid]: snap.data() as PublicProfile,
            }));
          }
        },
        (err) => handleFirestoreError(err, OperationType.GET, `public_profiles/${otherUid}`)
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [relatedUids]);

  const teams = useMemo(() => {
    const map = new Map<string, Team>();
    legacyTeams.forEach((t) => map.set(t.id, t));
    teamChallenges.forEach((t) => map.set(t.id, t));
    return Array.from(map.values());
  }, [legacyTeams, teamChallenges]);

  // Subscribe to TeamMembers for each team I'm in
  useEffect(() => {
    if (!firebaseUser || teams.length === 0) {
      setTeamMembersMap({});
      return;
    }
    const unsubs: Array<() => void> = [];
    teams.forEach((team) => {
      team.memberUids.forEach((memberUid) => {
        const memberDocId = `${team.id}_${memberUid}`;
        unsubs.push(
          onSnapshot(
            doc(db, 'team_members', memberDocId),
            (snap) => {
              if (!snap.exists()) return;
              const tm = snap.data() as TeamMember;
              setTeamMembersMap((prev) => {
                const curr = prev[team.id] || [];
                const filtered = curr.filter((item) => item.id !== tm.id);
                return { ...prev, [team.id]: [...filtered, tm] };
              });
            },
            (err) => handleFirestoreError(err, OperationType.GET, `team_members/${memberDocId}`)
          )
        );
      });
    });
    return () => unsubs.forEach((u) => u());
  }, [teams, firebaseUser]);

  const acceptedFriendUids = useMemo(() => {
    if (!firebaseUser) return [];
    return friendships
      .filter((f) => f.status === 'accepted')
      .map((f) => (f.requesterId === firebaseUser.uid ? f.recipientId : f.requesterId));
  }, [friendships, firebaseUser]);

  const myTeamMembersFlat = useMemo(() => {
    if (!firebaseUser) return [];
    return Object.values(teamMembersMap)
      .flat()
      .filter((m) => m.userId === firebaseUser.uid);
  }, [teamMembersMap, firebaseUser]);

  const todayDate = getLocalDateStr(new Date(), userPrivate?.timezone);

  // Sync Weekly League Competition Score (guarded by deterministic fingerprint to prevent loops)
  const lastSyncFingerprintRef = useRef<string>('');
  useEffect(() => {
    if (!userPrivate || !publicProfile || dataLoading) return;
    const habitSig = habits
      .map((h) => `${h.id}:${h.archived ? 1 : 0}:${h.habitPurpose || 'personal'}:${h.sortOrder}:${h.targetValue}:${h.targetTime || ''}:${h.frequency}:${h.targetDays.join(',')}`)
      .join('|');
    const recordSig = records
      .map((r) => `${r.id}:${r.completedValue}:${r.completedTime || ''}:${r.editCount || 0}:${r.verificationLevel || 'basic'}`)
      .join('|');
    const privateSeasonSig = seasons
      .filter((s) => s.leagueType === 'private' && s.status === 'active')
      .map((s) => `${s.id}:${s.memberUids.length}`)
      .join('|');
    const fingerprint = `${userPrivate.uid}#${todayDate}#${acceptedFriendUids.join(',')}#${xpTransactions.length}#${habitSig}#${recordSig}#${privateSeasonSig}`;

    if (lastSyncFingerprintRef.current === fingerprint) return;
    lastSyncFingerprintRef.current = fingerprint;

    syncMyWeeklySeasonScore({
      currentUser: userPrivate,
      publicProfile,
      habits,
      records,
      xpTransactions,
      friendUids: acceptedFriendUids,
      seasons,
      scores: competitionScores,
      todayDate,
    }).catch((err) => {
      console.warn('Weekly season score sync skipped:', err);
    });
  }, [
    userPrivate,
    publicProfile,
    dataLoading,
    habits,
    records,
    xpTransactions,
    acceptedFriendUids,
    seasons,
    competitionScores,
    todayDate,
  ]);

  // Claim any activated referral rewards automatically
  const referralClaimRunningRef = useRef(false);
  useEffect(() => {
    if (!userPrivate || !publicProfile || referralClaimRunningRef.current) return;
    const hasClaimable = referrals.some(
      (r) => r.referrerUid === userPrivate.uid && r.status === 'activated' && !r.claimedByReferrer
    );
    if (!hasClaimable) return;
    referralClaimRunningRef.current = true;
    claimPendingReferralRewards(userPrivate, publicProfile, referrals)
      .then((awarded) => {
        if (awarded > 0) {
          showToast(`受邀好友已完成首次有效打卡！獲得 +${awarded} XP 與 Better Together 徽章`, 'xp');
        }
      })
      .catch(() => {})
      .finally(() => {
        referralClaimRunningRef.current = false;
      });
  }, [referrals, userPrivate, publicProfile, showToast]);

  const activeCompetitionCount = useMemo(
    () => habits.filter((h) => !h.archived && h.habitPurpose === 'competition').length,
    [habits]
  );

  const todayRecords = useMemo(
    () => records.filter((r) => r.localDate === todayDate),
    [records, todayDate]
  );

  const todayXpTransactions = useMemo(
    () => xpTransactions.filter((tx) => tx.localDate === todayDate),
    [xpTransactions, todayDate]
  );

  const unreadNotifCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  // Handlers
  const handleSignIn = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setActiveTab('home');
    showToast('已安全登出');
  };

  const handleSaveHabit = async (data: Parameters<typeof createHabit>[1] extends infer T ? Omit<T, 'sortOrder'> : never) => {
    if (!userPrivate) return;
    if (editingHabit) {
      await updateHabit(editingHabit.id, data, userPrivate.uid);
      showToast(`已更新習慣「${data.title}」`);
    } else {
      await createHabit(userPrivate.uid, {
        ...data,
        sortOrder: habits.length,
      });
      showToast(`已建立習慣「${data.title}」`);
    }
  };

  const handleInstallStarterPack = async () => {
    if (!userPrivate) return;
    const starterKeys = ['wake_up', 'drink_water', 'reading', 'strength_training'];
    const starters = HABIT_TEMPLATES.filter((t) => starterKeys.includes(t.key));
    try {
      let compAssigned = activeCompetitionCount;
      for (let i = 0; i < starters.length; i++) {
        const tpl = starters[i];
        const wantsCompetition = tpl.key !== 'drink_water' && compAssigned < 5;
        if (wantsCompetition) compAssigned++;
        await createHabit(userPrivate.uid, {
          title: tpl.title,
          icon: tpl.icon,
          category: tpl.category,
          frequency: tpl.frequency,
          targetDays: tpl.targetDays,
          recordType: tpl.recordType,
          targetValue: tpl.targetValue,
          targetTime: tpl.targetTime,
          unit: tpl.unit,
          xpReward: tpl.xpReward,
          habitPurpose: wantsCompetition ? 'competition' : 'personal',
          isPublic: true,
          requirePhoto: false,
          sortOrder: habits.length + i,
        });
      }
      showToast('已匯入 4 項精選基礎習慣（含競賽習慣與個人成長習慣）');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '匯入失敗', 'error');
    }
  };

  const executeCheckIn = async (
    habit: Habit,
    payload: {
      completedValue: number;
      completedTime?: string;
      note?: string;
      photoDataUrl?: string;
      timerSeconds?: number;
    }
  ) => {
    if (!userPrivate || !publicProfile) return;
    const scheduledToday = habits.filter(
      (h) => !h.archived && isHabitScheduledForDate(h, todayDate)
    );
    const result = await completeHabitCheckIn({
      user: userPrivate,
      publicProfile,
      habit,
      localDate: todayDate,
      completedValue: payload.completedValue,
      completedTime: payload.completedTime,
      note: payload.note,
      photoDataUrl: payload.photoDataUrl,
      timerSeconds: payload.timerSeconds,
      friendUids: acceptedFriendUids,
      scheduledHabitsTodayCount: scheduledToday.length,
      alreadyCompletedTodayCount: todayRecords.length,
      allHabits: habits,
      allUserRecords: records,
      activeChallenges: challenges.filter((c) => c.status === 'active'),
      myChallengeMembers: challengeMembers,
      activeTeams: teams.filter((t) => t.status === 'active'),
      myTeamMembers: myTeamMembersFlat,
    });

    let msg = `完成「${habit.title}」+${result.xpGained} XP`;
    if (result.verificationLevel === 'verified') msg += ' · 已驗證';
    if (result.dailyBonusAwarded) msg += '（含全完成獎勵 +30 XP）';
    if (result.streak7BonusAwarded) msg += '（7 天連續獎勵 +50 XP）';
    showToast(msg, 'xp');
  };

  // Loading / Auth Gate
  if (!authReady || profileLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] theme-transition flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-5">
          <div className="font-display text-lg font-semibold tracking-[0.08em] text-center text-[var(--text-primary)]">
            KADENCE
          </div>
          <HomeSkeleton />
        </div>
      </div>
    );
  }

  if (firebaseUser && profileError) {
    return (
      <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] theme-transition flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-hairline)] shadow-[var(--shadow-card)] rounded-2xl p-6 space-y-4 text-center">
          <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
            帳號資料載入失敗
          </h2>
          <p className="text-xs text-[var(--text-secondary)] break-words">
            無法完成帳號同步，請檢查網路或重新登入後再試。
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={async () => {
                setProfileLoading(true);
                setProfileError(null);
                try {
                  await ensureUserProfile(firebaseUser, pendingInviteCodeRef.current || undefined);
                  setProfileReadyUid(firebaseUser.uid);
                } catch (err) {
                  setProfileError(err instanceof Error ? err.message : '重試失敗');
                } finally {
                  setProfileLoading(false);
                }
              }}
              className="h-10 px-4 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--accent-primary-fg)] text-xs font-semibold transition-colors cursor-pointer"
            >
              重新連線
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="h-10 px-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              登出
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!firebaseUser || !userPrivate || !publicProfile) {
    return (
      <AuthScreen onSignIn={handleSignIn} pendingInviteCode={pendingInviteCode} />
    );
  }

  const navItems: Array<{ id: NavTab; label: string; icon: React.ReactNode }> = [
    { id: 'home', label: 'Home', icon: <Home className="w-[18px] h-[18px]" strokeWidth={1.75} /> },
    { id: 'friends', label: 'Friends', icon: <Users className="w-[18px] h-[18px]" strokeWidth={1.75} /> },
    { id: 'compete', label: 'Compete', icon: <Trophy className="w-[18px] h-[18px]" strokeWidth={1.75} /> },
    { id: 'progress', label: 'Progress', icon: <BarChart3 className="w-[18px] h-[18px]" strokeWidth={1.75} /> },
    { id: 'profile', label: 'Profile', icon: <UserIcon className="w-[18px] h-[18px]" strokeWidth={1.75} /> },
  ];

  const themeCycleLabel =
    mode === 'light'
      ? '切換主題（目前：淺色）'
      : mode === 'dark'
      ? '切換主題（目前：深色）'
      : '切換主題（目前：跟隨系統）';

  const ThemeCycleIcon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor;

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] theme-transition flex flex-col lg:flex-row">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-[var(--bg-subtle)] border-r border-[var(--border-hairline)] theme-transition px-5 py-7 justify-between">
        <div className="space-y-8">
          <div className="flex items-center justify-between px-2">
            <span className="font-display text-lg font-semibold tracking-[0.06em] text-[var(--text-primary)]">
              KADENCE
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={cycleMode}
                title={themeCycleLabel}
                aria-label={themeCycleLabel}
                className="w-9 h-9 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] hover:border-[var(--border-strong)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <ThemeCycleIcon className="w-4 h-4" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={() => setNotifOpen(true)}
                className="relative w-9 h-9 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] hover:border-[var(--border-strong)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                aria-label="通知中心"
              >
                <Bell className="w-4 h-4" strokeWidth={1.75} />
                {unreadNotifCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] font-mono-tabular text-[10px] font-semibold flex items-center justify-center">
                    {unreadNotifCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full h-11 px-3.5 rounded-xl flex items-center gap-3 text-sm transition-colors whitespace-nowrap cursor-pointer border ${
                    active
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-hairline)] shadow-[var(--shadow-card)] font-semibold'
                      : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] font-medium'
                  }`}
                >
                  <span className={active ? 'text-[var(--accent-primary)]' : 'text-current'}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom User Summary */}
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className="p-3 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] hover:border-[var(--border-strong)] shadow-[var(--shadow-card)] flex items-center gap-3 text-left transition-colors cursor-pointer"
        >
          {userPrivate.avatarUrl ? (
            <img
              src={userPrivate.avatarUrl}
              alt={userPrivate.displayName}
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-full object-cover shrink-0 border border-[var(--border-hairline)]"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-[var(--bg-elevated)] text-[var(--text-secondary)] flex items-center justify-center text-xs font-semibold shrink-0 border border-[var(--border-hairline)]">
              {userPrivate.displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
              {userPrivate.displayName}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] font-mono-tabular">
              Lv.{userPrivate.level} · {userPrivate.totalXp} XP
            </div>
          </div>
        </button>
      </aside>

      {/* Mobile Top Bar (compact 52px) */}
      <header className="lg:hidden sticky top-0 z-30 h-[52px] px-4 bg-[var(--bg-canvas)]/90 backdrop-blur-md border-b border-[var(--border-hairline)] theme-transition flex items-center justify-between">
        <span className="font-display text-base font-semibold tracking-[0.06em] text-[var(--text-primary)] whitespace-nowrap shrink-0">
          KADENCE
        </span>
        <div className="flex items-center">
          <button
            type="button"
            onClick={cycleMode}
            title={themeCycleLabel}
            aria-label={themeCycleLabel}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <ThemeCycleIcon className="w-[18px] h-[18px]" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => setNotifOpen(true)}
            className="relative min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            aria-label="通知中心"
          >
            <Bell className="w-[18px] h-[18px]" strokeWidth={1.75} />
            {unreadNotifCount > 0 && (
              <span className="absolute top-2.5 right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] font-mono-tabular text-[10px] font-semibold flex items-center justify-center">
                {unreadNotifCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 lg:pl-64 pb-24 lg:pb-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10 space-y-6">
          {isOffline && (
            <div className="p-3.5 rounded-xl bg-[var(--accent-warning-soft)] border border-[var(--accent-warning)]/30 text-[var(--text-primary)] text-xs flex items-center gap-2.5">
              <WifiOff className="w-4 h-4 shrink-0 text-[var(--accent-warning)]" strokeWidth={1.75} />
              <span>目前處於離線狀態，變更將於網路恢復後自動同步至雲端。</span>
            </div>
          )}

          {invitePreviewUser && (
            <div className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--accent-primary)]/35 shadow-[var(--shadow-card)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-sm text-[var(--text-primary)]">
                來自邀請連結：要向 <span className="font-semibold">{invitePreviewUser.displayName}</span>（@{invitePreviewUser.username}）送出好友邀請嗎？
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setInvitePreviewUser(null)}
                  className="h-9 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  忽略
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await sendFriendRequest(userPrivate, invitePreviewUser.uid);
                      showToast(`已向 ${invitePreviewUser.displayName} 送出好友邀請`);
                    } catch (err) {
                      showToast(err instanceof Error ? err.message : '無法發送邀請', 'error');
                    } finally {
                      setInvitePreviewUser(null);
                    }
                  }}
                  className="h-9 px-4 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--accent-primary-fg)] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" strokeWidth={2} />
                  <span>加為好友</span>
                </button>
              </div>
            </div>
          )}

          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >

          {activeTab === 'home' && (
            <HomeView
              loading={dataLoading}
              user={userPrivate}
              habits={habits}
              todayRecords={todayRecords}
              allRecords={records}
              todayXpTransactions={todayXpTransactions}
              feedItems={feedItems}
              todayDate={todayDate}
              onQuickCheckIn={(habit) =>
                executeCheckIn(habit, { completedValue: 1 })
              }
              onOpenCheckInModal={(habit, rec) => {
                setCheckInHabit(habit);
                setCheckInRecord(rec || null);
              }}
              onOpenCreateHabit={() => {
                setEditingHabit(null);
                setHabitModalOpen(true);
              }}
              onOpenEditHabit={(habit) => {
                setEditingHabit(habit);
                setHabitModalOpen(true);
              }}
              onDeleteHabit={async (habit) => {
                await deleteHabit(habit.id);
                showToast(`已刪除習慣「${habit.title}」`);
              }}
              onReorderHabits={async (ordered) => {
                await reorderHabits(ordered);
                showToast('已儲存習慣順序');
              }}
              onInstallStarterPack={handleInstallStarterPack}
              onOpenFriends={() => setActiveTab('friends')}
              onOpenCompete={() => setActiveTab('compete')}
            />
          )}

          {activeTab === 'friends' && (
            <FriendsView
              loading={dataLoading}
              user={userPrivate}
              friendships={friendships}
              friendProfiles={friendProfiles}
              feedItems={feedItems}
              referrals={referrals}
              onChallengeFriend={(friend) => {
                setChallengeTargetFriend(friend);
                setActiveTab('compete');
              }}
            />
          )}

          {activeTab === 'compete' && (
            <CompeteView
              user={userPrivate}
              publicProfile={publicProfile}
              habits={habits}
              records={records}
              xpTransactions={xpTransactions}
              friendProfiles={friendProfiles}
              acceptedFriendUids={acceptedFriendUids}
              seasons={seasons}
              scores={competitionScores}
              challenges={challenges}
              challengeMembers={challengeMembers}
              teams={teams}
              teamMembersMap={teamMembersMap}
              todayDate={todayDate}
              preselectedOpponent={challengeTargetFriend}
              onClearPreselectedOpponent={() => setChallengeTargetFriend(null)}
            />
          )}

          {activeTab === 'progress' && (
            <ProgressView
              user={userPrivate}
              habits={habits}
              records={records}
              xpTransactions={xpTransactions}
              seasons={seasons}
              scores={competitionScores}
              auditLogs={auditLogs}
              todayDate={todayDate}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileView
              user={userPrivate}
              publicProfile={publicProfile}
              habits={habits}
              achievements={achievements}
              achievementRecords={achievementRecords}
              friendsCount={acceptedFriendUids.length}
              onSignOut={handleSignOut}
            />
          )}
          </motion.div>
        </div>
      </main>

      {/* Mobile Fixed Bottom Navigation Bar (5 tabs, compact 64px) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--bg-surface)]/92 backdrop-blur-md border-t border-[var(--border-hairline)] pb-safe theme-transition">
        <div className="grid grid-cols-5 h-16 items-center">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                  active
                    ? 'text-[var(--accent-primary)] font-semibold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {item.icon}
                <span className="text-[10px] font-medium tracking-tight leading-none">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Habit Create/Edit Modal */}
      <HabitModal
        isOpen={habitModalOpen}
        editingHabit={editingHabit}
        activeCompetitionCount={activeCompetitionCount}
        onClose={() => {
          setHabitModalOpen(false);
          setEditingHabit(null);
        }}
        onSave={handleSaveHabit}
      />

      {/* Habit Value/Time/Photo/Edit Check-in Modal */}
      <CheckInModal
        habit={checkInHabit}
        existingRecord={checkInRecord}
        onClose={() => {
          setCheckInHabit(null);
          setCheckInRecord(null);
        }}
        onConfirm={async (payload) => {
          if (!checkInHabit) return;
          if (checkInRecord) {
            await updateCheckInRecord(checkInRecord, payload);
            showToast(`已更新「${checkInHabit.title}」今日紀錄（已留存審計記錄）`);
          } else {
            await executeCheckIn(checkInHabit, payload);
          }
        }}
      />

      {/* Notifications Drawer */}
      <AnimatePresence>
        {notifOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setNotifOpen(false)}
            className="fixed inset-0 z-50 flex justify-end bg-[var(--bg-overlay)] backdrop-blur-sm"
          >
            <motion.div
              initial={{ x: 32, opacity: 0.9 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 32, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-[var(--bg-surface)] border-l border-[var(--border-hairline)] shadow-[var(--shadow-modal)] h-full flex flex-col"
            >
              <div className="px-5 py-4 border-b border-[var(--border-hairline)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
                    通知中心
                  </h3>
                  {unreadNotifCount > 0 && (
                    <span className="font-mono-tabular text-xs text-[var(--accent-primary)] font-medium">
                      {unreadNotifCount} 未讀
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {unreadNotifCount > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        markAllNotificationsRead(
                          notifications.filter((n) => !n.read).map((n) => n.id)
                        )
                      }
                      className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                    >
                      全部已讀
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setNotifOpen(false)}
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                    aria-label="關閉通知中心"
                  >
                    <X className="w-5 h-5" strokeWidth={1.75} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-hairline)]">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[var(--text-muted)]">
                    目前沒有新通知
                  </div>
                ) : (
                  notifications.map((n) => {
                    const dt = n.createdAt?.toDate ? n.createdAt.toDate() : new Date();
                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={async () => {
                          if (!n.read) await markNotificationRead(n.id);
                          if (n.targetTab) setActiveTab(n.targetTab as NavTab);
                          setNotifOpen(false);
                        }}
                        className={`w-full text-left p-4 hover:bg-[var(--bg-hover)] transition-colors space-y-1 cursor-pointer ${
                          !n.read ? 'bg-[var(--accent-primary-soft)]' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-[var(--text-primary)]">
                            {n.title}
                          </span>
                          <span className="text-[11px] text-[var(--text-muted)] shrink-0">
                            {formatTimeAgo(dt)}
                          </span>
                        </div>
                        {n.body && (
                          <p className="text-xs text-[var(--text-secondary)]">{n.body}</p>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <ToastProvider>
          <KadenceApp />
        </ToastProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
