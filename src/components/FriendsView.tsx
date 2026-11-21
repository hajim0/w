import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import {
  Check,
  Copy,
  Flame,
  Heart,
  Link2,
  MessageSquare,
  Search,
  Send,
  ShieldCheck,
  Swords,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { motion } from 'motion/react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  ActivityFeedItem,
  FeedComment,
  FeedReaction,
  Friendship,
  Habit,
  PublicProfile,
  ReferralRecord,
  UserPrivate,
} from '../types';
import { getTitleForLevel } from '../constants/habits';
import { formatCompetitionScore } from '../lib/competition';
import { formatTimeAgo, getCurrentTimeHHMM } from '../lib/date';
import {
  addFeedComment,
  fetchFriendPublicHabits,
  findUsersByQuery,
  removeFriend,
  respondFriendRequest,
  sendFriendRequest,
  toggleFeedReaction,
} from '../services/firestoreService';
import { useToast } from './Toast';
import { HabitIcon } from './HabitIcon';
import { FeedSkeleton } from './Skeletons';

interface FriendsViewProps {
  loading: boolean;
  user: UserPrivate;
  friendships: Friendship[];
  friendProfiles: Record<string, PublicProfile>;
  feedItems: ActivityFeedItem[];
  referrals?: ReferralRecord[];
  onChallengeFriend: (friend: PublicProfile) => void;
}

export function FriendsView({
  loading,
  user,
  friendships,
  friendProfiles,
  feedItems,
  referrals = [],
  onChallengeFriend,
}: FriendsViewProps) {
  const { showToast } = useToast();
  const [subTab, setSubTab] = useState<'feed' | 'friends' | 'add'>('feed');
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<PublicProfile[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  const [myReactions, setMyReactions] = useState<Record<string, 'like' | 'cheer' | null>>({});
  const [openCommentsId, setOpenCommentsId] = useState<string | null>(null);
  const [commentsList, setCommentsList] = useState<FeedComment[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  const [inspectFriend, setInspectFriend] = useState<PublicProfile | null>(null);
  const [inspectHabits, setInspectHabits] = useState<Habit[]>([]);
  const [loadingInspect, setLoadingInspect] = useState(false);

  const pendingIncoming = useMemo(
    () =>
      friendships.filter(
        (f) => f.status === 'pending' && f.recipientId === user.uid
      ),
    [friendships, user.uid]
  );

  const pendingOutgoing = useMemo(
    () =>
      friendships.filter(
        (f) => f.status === 'pending' && f.requesterId === user.uid
      ),
    [friendships, user.uid]
  );

  const acceptedFriends = useMemo(() => {
    return friendships
      .filter((f) => f.status === 'accepted')
      .map((f) => {
        const otherUid = f.requesterId === user.uid ? f.recipientId : f.requesterId;
        return { friendship: f, profile: friendProfiles[otherUid], uid: otherUid };
      })
      .filter((item) => Boolean(item.profile));
  }, [friendships, friendProfiles, user.uid]);

  useEffect(() => {
    let active = true;
    const loadReactions = async () => {
      const updates: Record<string, 'like' | 'cheer' | null> = {};
      await Promise.all(
        feedItems.slice(0, 25).map(async (item) => {
          try {
            const snap = await getDoc(
              doc(db, 'activity_feed', item.id, 'reactions', user.uid)
            );
            updates[item.id] = snap.exists() ? (snap.data() as FeedReaction).type : null;
          } catch {
            updates[item.id] = null;
          }
        })
      );
      if (active) setMyReactions(updates);
    };
    if (feedItems.length > 0) loadReactions();
    return () => {
      active = false;
    };
  }, [feedItems, user.uid]);

  useEffect(() => {
    if (!openCommentsId) {
      setCommentsList([]);
      return;
    }
    const q = query(
      collection(db, 'activity_feed', openCommentsId, 'comments'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setCommentsList(snap.docs.map((d) => d.data() as FeedComment));
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, `activity_feed/${openCommentsId}/comments`);
      }
    );
    return () => unsub();
  }, [openCommentsId]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setHasSearched(true);
    try {
      const results = await findUsersByQuery(searchQuery, user.uid);
      setSearchResults(results);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '搜尋失敗', 'error');
    } finally {
      setSearching(false);
    }
  };

  const handleSendInvite = async (targetUid: string) => {
    setSendingTo(targetUid);
    try {
      await sendFriendRequest(user, targetUid);
      showToast('已送出好友邀請');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '無法發送邀請', 'error');
    } finally {
      setSendingTo(null);
    }
  };

  const handleCopyInviteCode = async () => {
    try {
      await navigator.clipboard.writeText(user.inviteCode);
      showToast(`已複製邀請碼 ${user.inviteCode}`);
    } catch {
      showToast(`你的邀請碼：${user.inviteCode}`);
    }
  };

  const handleCopyInviteLink = async () => {
    const link = `${window.location.origin}/?invite=${user.inviteCode}`;
    try {
      await navigator.clipboard.writeText(link);
      showToast('已複製專屬邀請連結');
    } catch {
      showToast(`邀請連結：${link}`);
    }
  };

  const handleReact = async (item: ActivityFeedItem, type: 'like' | 'cheer') => {
    const prev = myReactions[item.id] ?? null;
    const optimistic = prev === type ? null : type;
    setMyReactions((m) => ({ ...m, [item.id]: optimistic }));
    try {
      await toggleFeedReaction(item, user, type);
    } catch (err) {
      setMyReactions((m) => ({ ...m, [item.id]: prev }));
      showToast(err instanceof Error ? err.message : '互動失敗', 'error');
    }
  };

  const handlePostComment = async (item: ActivityFeedItem) => {
    if (!commentInput.trim()) return;
    setPostingComment(true);
    try {
      await addFeedComment(item, user, commentInput);
      setCommentInput('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '留言失敗', 'error');
    } finally {
      setPostingComment(false);
    }
  };

  const handleInspectFriend = async (profile: PublicProfile) => {
    setInspectFriend(profile);
    setLoadingInspect(true);
    setInspectHabits([]);
    try {
      if (profile.showProfilePublicly) {
        const h = await fetchFriendPublicHabits(profile.uid);
        setInspectHabits(h);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '載入好友公開習慣失敗', 'error');
    } finally {
      setLoadingInspect(false);
    }
  };

  if (loading) return <FeedSkeleton />;

  return (
    <div className="space-y-7">
      {/* Header & Sub-Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            好友動態
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            即時看見夥伴的公開打卡進度，互相鼓勵並保持節律。
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[var(--bg-subtle)] border border-[var(--border-hairline)] rounded-xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setSubTab('feed')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              subTab === 'feed'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            動態牆
          </button>
          <button
            type="button"
            onClick={() => setSubTab('friends')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              subTab === 'friends'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            好友（{acceptedFriends.length}）
            {pendingIncoming.length > 0 ? ` · ${pendingIncoming.length} 待確認` : ''}
          </button>
          <button
            type="button"
            onClick={() => setSubTab('add')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              subTab === 'add'
                ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            新增好友
          </button>
        </div>
      </div>

      {/* Pending Requests Banner */}
      {pendingIncoming.length > 0 && subTab !== 'friends' && (
        <div className="bg-[var(--bg-surface)] border border-[var(--accent-warning)]/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-sm text-[var(--text-primary)]">
            你有 <span className="font-mono-tabular font-semibold text-[var(--accent-warning)]">{pendingIncoming.length}</span> 則待確認的好友邀請
          </div>
          <button
            type="button"
            onClick={() => setSubTab('friends')}
            className="h-9 px-4 rounded-xl bg-[var(--accent-warning)] text-[#151614] text-xs font-semibold whitespace-nowrap self-start sm:self-auto cursor-pointer hover:opacity-90 transition-opacity"
          >
            立即查看
          </button>
        </div>
      )}

      {/* SUBTAB 1: FEED */}
      {subTab === 'feed' && (
        <>
          {acceptedFriends.length === 0 && feedItems.length === 0 ? (
            <div
              style={{ boxShadow: 'var(--shadow-card)' }}
              className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-8 sm:p-10 text-center space-y-5"
            >
              <div className="w-11 h-11 rounded-xl bg-[var(--accent-warning-soft)] flex items-center justify-center mx-auto text-[var(--accent-warning)]">
                <Users className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <div className="max-w-md mx-auto space-y-2">
                <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
                  邀請第一位自律夥伴
                </h2>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  分享你的專屬邀請碼{' '}
                  <span className="font-mono-tabular text-[var(--text-primary)] font-semibold">
                    {user.inviteCode}
                  </span>{' '}
                  或透過使用者名稱搜尋好友，開始互相監督。
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleCopyInviteLink}
                  className="w-full sm:w-auto h-11 px-5 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[var(--accent-primary-hover)] transition-colors cursor-pointer"
                >
                  <Link2 className="w-4 h-4" strokeWidth={1.75} />
                  <span>複製邀請連結</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab('add')}
                  className="w-full sm:w-auto h-11 px-5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors cursor-pointer"
                >
                  搜尋使用者名稱
                </button>
              </div>
            </div>
          ) : feedItems.length === 0 ? (
            <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-8 text-center space-y-2">
              <p className="text-sm font-medium text-[var(--text-primary)]">尚無公開動態</p>
              <p className="text-xs text-[var(--text-muted)]">
                你與好友完成設定為「公開」的習慣打卡後，將會即時顯示於此。
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              {feedItems.map((item) => {
                const reaction = myReactions[item.id] ?? null;
                const authorProf = friendProfiles[item.userId];
                const createdDate = item.createdAt?.toDate ? item.createdAt.toDate() : new Date();
                const isOwn = item.userId === user.uid;

                return (
                  <article
                    key={item.id}
                    style={{ boxShadow: 'var(--shadow-card)' }}
                    className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-5 space-y-4 theme-transition"
                  >
                    {/* Author Row */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {item.authorAvatar ? (
                          <img
                            src={item.authorAvatar}
                            alt={item.authorName}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-full object-cover border border-[var(--border-hairline)] shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-center text-sm font-semibold text-[var(--text-primary)] shrink-0">
                            {item.authorName.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                              {item.authorName}
                            </span>
                            <span className="text-xs text-[var(--text-muted)] truncate">
                              @{item.authorUsername}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] mt-0.5">
                            <span>{formatTimeAgo(createdDate)}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono-tabular">
                              今日進度 {item.dailyCompleted}/{item.dailyTotal}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-0.5 font-mono-tabular text-[var(--accent-warning)]">
                              <Flame className="w-3 h-3" strokeWidth={1.75} />
                              {item.streakDays}天
                            </span>
                          </div>
                        </div>
                      </div>

                      {!isOwn && authorProf && (
                        <button
                          type="button"
                          onClick={() => onChallengeFriend(authorProf)}
                          className="h-8 px-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
                        >
                          <Swords className="w-3.5 h-3.5" strokeWidth={1.75} />
                          <span>挑戰</span>
                        </button>
                      )}
                    </div>

                    {/* Clean Check-in Strip (avoid card-in-card heavy borders) */}
                    <div className="px-3.5 py-3 rounded-xl bg-[var(--bg-subtle)] flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-[var(--accent-primary-soft)] text-[var(--accent-primary)] flex items-center justify-center shrink-0">
                          <HabitIcon name={item.habitIcon} className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                              {item.habitTitle}
                            </span>
                            {item.isCompetitionIncluded && (
                              <span className="text-[10px] font-medium text-[var(--accent-primary)] shrink-0">
                                競賽
                              </span>
                            )}
                            {(item.verificationLevel === 'verified' ||
                              item.verificationLevel === 'integrated') && (
                              <span
                                className="inline-flex items-center gap-0.5 text-[10px] text-[var(--accent-success)] shrink-0"
                                title="已附照片或計時驗證"
                              >
                                <ShieldCheck className="w-3 h-3" strokeWidth={1.75} />
                                <span>已驗證</span>
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-[var(--text-secondary)] font-mono-tabular mt-0.5">
                            {item.recordType === 'value'
                              ? `完成 ${item.completedValue} ${item.unit}`
                              : item.recordType === 'time'
                              ? `紀錄時間 ${item.completedTime || getCurrentTimeHHMM(createdDate)}`
                              : `完成於 ${getCurrentTimeHHMM(createdDate)}`}
                          </div>
                        </div>
                      </div>

                      <span className="font-mono-tabular text-xs font-semibold text-[var(--accent-primary)] shrink-0">
                        +{item.xpEarned} XP
                      </span>
                    </div>

                    {item.photoDataUrl && (
                      <div className="rounded-xl overflow-hidden border border-[var(--border-hairline)]">
                        <img
                          src={item.photoDataUrl}
                          alt={`${item.habitTitle}打卡照片`}
                          className="w-full max-h-64 object-cover"
                        />
                      </div>
                    )}

                    {/* Action Bar */}
                    <div className="flex items-center justify-between pt-2 border-t border-[var(--border-hairline)]">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleReact(item, 'like')}
                          className={`h-9 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                            reaction === 'like'
                              ? 'bg-[var(--accent-danger-soft)] text-[var(--accent-danger)]'
                              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                          }`}
                        >
                          <Heart className={`w-3.5 h-3.5 ${reaction === 'like' ? 'fill-current' : ''}`} strokeWidth={1.75} />
                          <span className="font-mono-tabular">讚 {item.likesCount}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleReact(item, 'cheer')}
                          className={`h-9 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                            reaction === 'cheer'
                              ? 'bg-[var(--accent-warning-soft)] text-[var(--accent-warning)]'
                              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                          }`}
                        >
                          <Zap className={`w-3.5 h-3.5 ${reaction === 'cheer' ? 'fill-current' : ''}`} strokeWidth={1.75} />
                          <span className="font-mono-tabular">加油 {item.cheersCount}</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setOpenCommentsId((curr) => (curr === item.id ? null : item.id))
                        }
                        className="h-9 px-3 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5" strokeWidth={1.75} />
                        <span className="font-mono-tabular">留言 {item.commentsCount}</span>
                      </button>
                    </div>

                    {/* Comments Drawer */}
                    {openCommentsId === item.id && (
                      <div className="pt-3 border-t border-[var(--border-hairline)] space-y-3">
                        {commentsList.length === 0 ? (
                          <p className="text-xs text-[var(--text-muted)]">還沒有留言，留一句鼓勵吧。</p>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {commentsList.map((c) => (
                              <div key={c.id} className="text-xs leading-relaxed">
                                <span className="font-semibold text-[var(--text-primary)] mr-2">
                                  {c.authorName}
                                </span>
                                <span className="text-[var(--text-secondary)]">{c.text}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            maxLength={280}
                            value={commentInput}
                            onChange={(e) => setCommentInput(e.target.value)}
                            placeholder="寫下留言..."
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handlePostComment(item);
                              }
                            }}
                            className="flex-1 h-9 px-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
                          />
                          <button
                            type="button"
                            disabled={postingComment || !commentInput.trim()}
                            onClick={() => handlePostComment(item)}
                            className="h-9 px-3 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] text-xs font-semibold flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5" strokeWidth={1.75} />
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* SUBTAB 2: FRIENDS LIST & REQUESTS */}
      {subTab === 'friends' && (
        <div className="space-y-6">
          {pendingIncoming.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-medium text-[var(--accent-warning)]">
                待確認邀請（{pendingIncoming.length}）
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pendingIncoming.map((f) => {
                  const prof = friendProfiles[f.requesterId];
                  return (
                    <div
                      key={f.id}
                      className="bg-[var(--bg-surface)] border border-[var(--accent-warning)]/40 rounded-2xl p-4 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-center font-semibold text-sm text-[var(--text-primary)] shrink-0">
                          {(prof?.displayName || 'F').slice(0, 1)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[var(--text-primary)] truncate">
                            {prof?.displayName || '自律夥伴'}
                          </div>
                          <div className="text-xs text-[var(--text-muted)] truncate">
                            @{prof?.username || f.requesterId.slice(0, 8)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={async () => {
                            await respondFriendRequest(f, 'accepted', user);
                            showToast('已成為好友');
                          }}
                          className="h-9 px-3 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" strokeWidth={1.75} />
                          <span>接受</span>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await respondFriendRequest(f, 'declined', user);
                            showToast('已婉拒邀請');
                          }}
                          className="h-9 px-2.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-secondary)] text-xs cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" strokeWidth={1.75} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {pendingOutgoing.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="text-xs font-medium text-[var(--text-muted)]">
                已送出的邀請（{pendingOutgoing.length}）
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pendingOutgoing.map((f) => {
                  const prof = friendProfiles[f.recipientId];
                  return (
                    <div
                      key={f.id}
                      className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl p-3.5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[var(--text-primary)] truncate">
                          {prof?.displayName || '等待確認'}
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">等待對方確認中</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFriend(f.id)}
                        className="text-xs text-[var(--text-muted)] hover:text-[var(--accent-danger)] transition-colors cursor-pointer"
                      >
                        取消邀請
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-xs font-medium text-[var(--text-secondary)]">
              我的夥伴圈（{acceptedFriends.length}）
            </h2>
            {acceptedFriends.length === 0 ? (
              <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-8 text-center space-y-3">
                <p className="text-sm text-[var(--text-secondary)]">尚未加入任何好友</p>
                <button
                  type="button"
                  onClick={() => setSubTab('add')}
                  className="h-10 px-4 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] text-xs font-semibold cursor-pointer"
                >
                  立即新增好友
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {acceptedFriends.map(({ friendship, profile }) => (
                  <div
                    key={friendship.id}
                    style={{ boxShadow: 'var(--shadow-card)' }}
                    className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] hover:border-[var(--border-strong)] rounded-2xl p-4 flex items-center justify-between gap-3 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => handleInspectFriend(profile)}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      {profile.avatarUrl ? (
                        <img
                          src={profile.avatarUrl}
                          alt={profile.displayName}
                          referrerPolicy="no-referrer"
                          className="w-11 h-11 rounded-full object-cover border border-[var(--border-hairline)] shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-center font-semibold text-[var(--text-primary)] shrink-0">
                          {profile.displayName.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                            {profile.displayName}
                          </span>
                          <span className="text-[11px] text-[var(--text-muted)] shrink-0">
                            {getTitleForLevel(profile.level).label}
                          </span>
                        </div>
                        <div className="text-xs text-[var(--text-muted)] font-mono-tabular mt-0.5 truncate">
                          @{profile.username} · Lv.{profile.level} · 週競賽分{' '}
                          {formatCompetitionScore(profile.weeklyCompetitionScore || 0)} ·{' '}
                          {profile.currentStreak}天連續
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onChallengeFriend(profile)}
                        className="h-9 px-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors cursor-pointer"
                      >
                        發起挑戰
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await removeFriend(friendship.id);
                          showToast('已解除好友關係');
                        }}
                        className="h-9 px-2.5 rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--accent-danger)] transition-colors cursor-pointer"
                      >
                        移除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* SUBTAB 3: ADD FRIEND */}
      {subTab === 'add' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div
            style={{ boxShadow: 'var(--shadow-card)' }}
            className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-6 space-y-5"
          >
            <div className="space-y-1">
              <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                分享你的個人邀請碼
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                讓朋友直接輸入你的邀請碼或點擊專屬連結即可互相連結。
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] text-[var(--text-muted)]">專屬邀請碼</div>
                <div className="font-mono-tabular text-xl font-semibold tracking-wider text-[var(--accent-primary)] mt-0.5">
                  {user.inviteCode}
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopyInviteCode}
                className="h-10 px-4 rounded-xl bg-[var(--control-active-bg)] text-[var(--control-active-fg)] text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 transition-opacity cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>複製代碼</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopyInviteLink}
              className="w-full h-11 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)] flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Link2 className="w-4 h-4" strokeWidth={1.75} />
              <span>複製專屬邀請連結</span>
            </button>

            <div className="pt-4 border-t border-[var(--border-hairline)] space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-[var(--text-primary)]">邀請成長激勵進度</span>
                <span className="font-mono-tabular text-[var(--text-muted)]">
                  已啟動 {referrals.filter((r) => r.status === 'activated').length} / {referrals.length} 位
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                透過你的專屬連結註冊並完成首次有效打卡後，系統將自動為你解鎖{' '}
                <span className="text-[var(--text-primary)] font-medium">Better Together</span>{' '}
                徽章並發放 +30 XP 推薦獎勵。
              </p>
              {referrals.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {referrals.slice(0, 5).map((r) => (
                    <div
                      key={r.id}
                      className="px-3 py-2 rounded-lg bg-[var(--bg-subtle)] flex items-center justify-between text-xs"
                    >
                      <span className="text-[var(--text-primary)] truncate">{r.invitedName}</span>
                      <span
                        className={`font-mono-tabular text-[11px] ${
                          r.status === 'activated'
                            ? 'text-[var(--accent-success)] font-medium'
                            : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {r.status === 'activated'
                          ? r.claimedByReferrer
                            ? '已發放 +30 XP'
                            : '已打卡待入帳'
                          : '等待首次打卡'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div
            style={{ boxShadow: 'var(--shadow-card)' }}
            className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-6 space-y-5"
          >
            <div className="space-y-1">
              <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                搜尋使用者名稱或邀請碼
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                輸入對方的 @username 或 KAD-XXXXX 邀請碼。
              </p>
            </div>

            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" strokeWidth={1.75} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="輸入使用者名稱或邀請碼..."
                  className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={searching || !searchQuery.trim()}
                className="h-11 px-4 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] text-xs font-semibold whitespace-nowrap shrink-0 hover:bg-[var(--accent-primary-hover)] disabled:opacity-50 transition-colors cursor-pointer"
              >
                {searching ? '搜尋中' : '搜尋'}
              </button>
            </form>

            {hasSearched && (
              <div className="space-y-2.5 pt-2 border-t border-[var(--border-hairline)]">
                {searchResults.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] py-2">
                    找不到符合的使用者（或對方已關閉搜尋隱私）。
                  </p>
                ) : (
                  searchResults.map((prof) => {
                    const rel = friendships.find((f) =>
                      f.participants.includes(prof.uid)
                    );
                    return (
                      <div
                        key={prof.uid}
                        className="p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-[var(--bg-surface)] border border-[var(--border-hairline)] flex items-center justify-center text-xs font-semibold text-[var(--text-primary)] shrink-0">
                            {prof.displayName.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-[var(--text-primary)] truncate">
                              {prof.displayName}
                            </div>
                            <div className="text-xs text-[var(--text-muted)] truncate">
                              @{prof.username} · Lv.{prof.level}
                            </div>
                          </div>
                        </div>

                        {rel?.status === 'accepted' ? (
                          <span className="text-xs text-[var(--accent-success)] font-medium shrink-0">已是好友</span>
                        ) : rel?.status === 'pending' ? (
                          <span className="text-xs text-[var(--accent-warning)] font-medium shrink-0">邀請中</span>
                        ) : (
                          <button
                            type="button"
                            disabled={sendingTo === prof.uid}
                            onClick={() => handleSendInvite(prof.uid)}
                            className="h-9 px-3 rounded-lg bg-[var(--control-active-bg)] text-[var(--control-active-fg)] text-xs font-semibold flex items-center gap-1 shrink-0 hover:opacity-90 transition-opacity cursor-pointer"
                          >
                            <UserPlus className="w-3.5 h-3.5" strokeWidth={1.75} />
                            <span>加好友</span>
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Friend Public Profile Modal */}
      {inspectFriend && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm p-0 sm:p-4">
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ boxShadow: 'var(--shadow-modal)' }}
            className="w-full sm:max-w-md bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-t-2xl sm:rounded-2xl overflow-hidden max-h-[85dvh] flex flex-col theme-transition"
          >
            <div className="px-6 py-4 border-b border-[var(--border-hairline)] flex items-center justify-between">
              <span className="font-display text-base font-semibold text-[var(--text-primary)]">
                夥伴檔案
              </span>
              <button
                type="button"
                onClick={() => setInspectFriend(null)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-5">
              <div className="flex items-center gap-4">
                {inspectFriend.avatarUrl ? (
                  <img
                    src={inspectFriend.avatarUrl}
                    alt={inspectFriend.displayName}
                    referrerPolicy="no-referrer"
                    className="w-14 h-14 rounded-full object-cover border border-[var(--border-hairline)]"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-center text-lg font-semibold text-[var(--text-primary)]">
                    {inspectFriend.displayName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-lg font-semibold text-[var(--text-primary)]">
                      {inspectFriend.displayName}
                    </h3>
                    <span className="text-[11px] font-medium text-[var(--accent-primary)]">
                      {getTitleForLevel(inspectFriend.level).label}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    @{inspectFriend.username} · Level {inspectFriend.level}
                  </p>
                </div>
              </div>

              {inspectFriend.bio && (
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{inspectFriend.bio}</p>
              )}

              <div className="grid grid-cols-4 gap-2 text-center bg-[var(--bg-subtle)] rounded-xl p-3 border border-[var(--border-hairline)]">
                <div>
                  <div className="font-mono-tabular text-base font-semibold text-[var(--accent-primary)]">
                    {formatCompetitionScore(inspectFriend.weeklyCompetitionScore || 0)}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">週競賽分</div>
                </div>
                <div>
                  <div className="font-mono-tabular text-base font-semibold text-[var(--text-primary)]">
                    {inspectFriend.totalXp}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">總 XP</div>
                </div>
                <div>
                  <div className="font-mono-tabular text-base font-semibold text-[var(--accent-warning)]">
                    {inspectFriend.currentStreak}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">目前連續</div>
                </div>
                <div>
                  <div className="font-mono-tabular text-base font-semibold text-[var(--text-primary)]">
                    {inspectFriend.unlockedBadges?.length || 0}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">成就徽章</div>
                </div>
              </div>

              <div className="space-y-2.5">
                <h4 className="text-xs font-medium text-[var(--text-secondary)]">公開習慣</h4>
                {!inspectFriend.showProfilePublicly ? (
                  <p className="text-xs text-[var(--text-muted)]">對方已設定隱藏公開習慣列表。</p>
                ) : loadingInspect ? (
                  <p className="text-xs text-[var(--text-muted)]">載入中...</p>
                ) : inspectHabits.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">對方目前沒有公開顯示的習慣。</p>
                ) : (
                  <div className="space-y-2">
                    {inspectHabits.map((h) => (
                      <div
                        key={h.id}
                        className="p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2.5">
                          <HabitIcon name={h.icon} className="w-4 h-4 text-[var(--accent-primary)]" />
                          <span className="text-sm font-medium text-[var(--text-primary)]">{h.title}</span>
                        </div>
                        <span className="font-mono-tabular text-xs text-[var(--text-muted)]">
                          累積 {h.totalCompletions} 次
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
