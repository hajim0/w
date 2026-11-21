import React, { useState } from 'react';
import {
  Award,
  Bell,
  Camera,
  Check,
  Copy,
  Edit3,
  Flame,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Shield,
  Sun,
  Users,
} from 'lucide-react';
import {
  Achievement,
  AchievementRecord,
  Habit,
  PublicProfile,
  UserPrivate,
} from '../types';
import {
  ACHIEVEMENT_CATALOG,
  TITLES_CATALOG,
  getTitleForLevel,
} from '../constants/habits';
import { compressImageFile } from '../lib/image';
import { useTheme } from '../lib/theme';
import { updateUserProfileAndSettings } from '../services/firestoreService';
import { useToast } from './Toast';
import { HabitIcon } from './HabitIcon';

interface ProfileViewProps {
  user: UserPrivate;
  publicProfile: PublicProfile;
  habits: Habit[];
  achievements: Achievement[];
  achievementRecords?: AchievementRecord[];
  friendsCount: number;
  onSignOut: () => Promise<void>;
}

export function ProfileView({
  user,
  publicProfile,
  habits,
  achievements,
  achievementRecords = [],
  friendsCount,
  onSignOut,
}: ProfileViewProps) {
  const { showToast } = useToast();
  const { mode, setMode } = useTheme();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [username, setUsername] = useState(user.username);
  const [bio, setBio] = useState(user.bio || '');
  const [saving, setSaving] = useState(false);

  const unlockedMap = new Map(achievements.map((a) => [a.badgeKey, a]));
  const unlockedRecordsMap = new Map(achievementRecords.map((r) => [r.badgeKey, r]));
  const titleDef = getTitleForLevel(user.level);
  const publicHabits = habits.filter((h) => h.isPublic && !h.archived);
  const activeCompHabitsCount = habits.filter(
    (h) => !h.archived && h.habitPurpose === 'competition'
  ).length;
  const activePersonalHabitsCount = habits.filter(
    (h) => !h.archived && h.habitPurpose !== 'competition'
  ).length;

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, 360, 0.78);
      await updateUserProfileAndSettings(user, { avatarUrl: compressed });
      showToast('已更新個人頭像');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '頭像上傳失敗', 'error');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateUserProfileAndSettings(user, {
        displayName,
        username,
        bio,
      });
      showToast('個人檔案已更新');
      setEditing(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '更新失敗', 'error');
    } finally {
      setSaving(false);
    }
  };

  const togglePrivacy = async (key: keyof UserPrivate['privacySettings']) => {
    const next = {
      ...user.privacySettings,
      [key]: !user.privacySettings[key],
    };
    try {
      await updateUserProfileAndSettings(user, { privacySettings: next });
      showToast('已儲存隱私設定');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '設定更新失敗', 'error');
    }
  };

  const toggleNotification = async (key: keyof UserPrivate['notificationSettings']) => {
    const next = {
      ...user.notificationSettings,
      [key]: !user.notificationSettings[key],
    };
    try {
      await updateUserProfileAndSettings(user, { notificationSettings: next });
      showToast('已儲存通知偏好');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '設定更新失敗', 'error');
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Card */}
      <section
        style={{ boxShadow: 'var(--shadow-card)' }}
        className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-6 space-y-6 theme-transition"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <label className="relative group cursor-pointer shrink-0">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.displayName}
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border border-[var(--border-strong)]"
                />
              ) : (
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[var(--bg-subtle)] border border-[var(--border-strong)] flex items-center justify-center text-2xl font-semibold text-[var(--text-primary)]">
                  {user.displayName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-[var(--control-active-bg)] text-[var(--control-active-fg)] border border-[var(--bg-surface)] flex items-center justify-center">
                <Camera className="w-3.5 h-3.5" strokeWidth={1.75} />
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </label>

            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-xl sm:text-2xl font-semibold text-[var(--text-primary)] truncate">
                  {user.displayName}
                </h1>
                <span className="text-xs font-medium text-[var(--accent-primary)]">
                  {titleDef.label} · {titleDef.zhLabel}
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] font-mono-tabular">
                @{user.username} · 邀請碼 {user.inviteCode}
              </p>
              <p className="text-sm text-[var(--text-secondary)] line-clamp-2">
                {user.bio || '尚未填寫個人簡介'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(user.inviteCode).catch(() => {});
                showToast(`已複製邀請碼 ${user.inviteCode}`);
              }}
              className="h-10 px-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>邀請碼</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setDisplayName(user.displayName);
                setUsername(user.username);
                setBio(user.bio || '');
                setEditing((v) => !v);
              }}
              className="h-10 px-3.5 rounded-xl bg-[var(--control-active-bg)] text-[var(--control-active-fg)] text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>{editing ? '收起編輯' : '編輯檔案'}</span>
            </button>
          </div>
        </div>

        {editing && (
          <form
            onSubmit={handleSaveProfile}
            className="pt-5 border-t border-[var(--border-hairline)] grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            <div className="space-y-1.5">
              <label className="text-xs text-[var(--text-secondary)]">顯示名稱</label>
              <input
                type="text"
                maxLength={40}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-[var(--text-secondary)]">使用者名稱（英數字及底線）</label>
              <input
                type="text"
                maxLength={24}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm font-mono-tabular text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                required
              />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs text-[var(--text-secondary)]">個人簡介</label>
              <input
                type="text"
                maxLength={160}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="h-10 px-5 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] text-xs font-semibold flex items-center gap-1.5 hover:bg-[var(--accent-primary-hover)] transition-colors cursor-pointer"
              >
                <Check className="w-4 h-4" strokeWidth={1.75} />
                <span>{saving ? '儲存中...' : '儲存個人資料'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-[var(--border-hairline)]">
          <div className="p-3.5 rounded-xl bg-[var(--bg-subtle)]">
            <div className="text-[11px] text-[var(--text-muted)]">當前等級</div>
            <div className="font-mono-tabular text-xl font-semibold text-[var(--text-primary)] mt-0.5">
              Lv.{user.level}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-[var(--bg-subtle)]">
            <div className="text-[11px] text-[var(--text-muted)]">總累積 XP</div>
            <div className="font-mono-tabular text-xl font-semibold text-[var(--accent-primary)] mt-0.5">
              {user.totalXp}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-[var(--bg-subtle)]">
            <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
              <Flame className="w-3 h-3 text-[var(--accent-warning)]" strokeWidth={1.75} />
              <span>連續打卡</span>
            </div>
            <div className="font-mono-tabular text-xl font-semibold text-[var(--text-primary)] mt-0.5">
              {user.currentStreak} 天
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-[var(--bg-subtle)]">
            <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
              <Users className="w-3 h-3" strokeWidth={1.75} />
              <span>好友數量</span>
            </div>
            <div className="font-mono-tabular text-xl font-semibold text-[var(--text-primary)] mt-0.5">
              {friendsCount}
            </div>
          </div>
        </div>
      </section>

      {/* Title Progression Path (6 Tiers) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
            長期稱號成長路線
          </h2>
          <span className="font-mono-tabular text-xs text-[var(--text-muted)]">
            目前：{titleDef.label}（Lv.{user.level}）
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {TITLES_CATALOG.map((t) => {
            const reached = user.level >= t.minLevel;
            const isCurrent = titleDef.key === t.key;
            return (
              <div
                key={t.key}
                className={`p-3.5 rounded-2xl border transition-colors space-y-1 ${
                  isCurrent
                    ? 'bg-[var(--accent-primary-soft)] border-[var(--accent-primary)]/50'
                    : reached
                    ? 'bg-[var(--bg-surface)] border-[var(--border-hairline)]'
                    : 'bg-[var(--bg-subtle)]/70 border-[var(--border-hairline)] opacity-60'
                }`}
              >
                <div className="text-xs font-semibold text-[var(--text-primary)]">{t.label}</div>
                <div className="text-[11px] text-[var(--text-secondary)]">{t.zhLabel}</div>
                <div className="text-[10px] font-mono-tabular text-[var(--text-muted)] pt-0.5">
                  Lv.{t.minLevel}{t.maxLevel ? `–${t.maxLevel}` : '+'}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Achievement Badges */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
            成就里程碑
          </h2>
          <span className="font-mono-tabular text-xs text-[var(--text-muted)]">
            已解鎖 {publicProfile.unlockedBadges.length} / {ACHIEVEMENT_CATALOG.length}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ACHIEVEMENT_CATALOG.map((badge) => {
            const unlocked =
              unlockedMap.has(badge.key) || publicProfile.unlockedBadges.includes(badge.key);
            const achRec = unlockedRecordsMap.get(badge.key);
            return (
              <div
                key={badge.key}
                className={`p-4 rounded-2xl border transition-colors flex items-start gap-3.5 ${
                  unlocked
                    ? 'bg-[var(--bg-surface)] border-[var(--accent-primary)]/40'
                    : 'bg-[var(--bg-subtle)]/70 border-[var(--border-hairline)] opacity-65'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    unlocked
                      ? 'bg-[var(--accent-primary-soft)] text-[var(--accent-primary)]'
                      : 'bg-[var(--bg-surface)] text-[var(--text-muted)]'
                  }`}
                >
                  {unlocked ? (
                    <Award className="w-[18px] h-[18px]" strokeWidth={1.75} />
                  ) : (
                    <Award className="w-[18px] h-[18px]" strokeWidth={1.5} />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">{badge.title}</div>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-snug">
                    {badge.description}
                  </p>
                  <div className="text-[11px] font-mono-tabular text-[var(--text-muted)] mt-1.5 truncate">
                    {unlocked
                      ? achRec?.sourceMetric
                        ? `已達成（${achRec.sourceMetric}）`
                        : '已達成'
                      : `條件：${badge.requirementText}`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Public Habits & Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Public Habits Showcase */}
        <section
          style={{ boxShadow: 'var(--shadow-card)' }}
          className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
              個人公開習慣
            </h2>
            <span className="font-mono-tabular text-xs text-[var(--text-muted)]">
              個人 {activePersonalHabitsCount} · 競賽 {activeCompHabitsCount} · 公開 {publicHabits.length}
            </span>
          </div>
          {publicHabits.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">
              目前所有習慣皆為私人狀態，或尚未建立習慣。
            </p>
          ) : (
            <div className="space-y-2.5">
              {publicHabits.map((h) => (
                <div
                  key={h.id}
                  className="p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <HabitIcon name={h.icon} className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                    <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {h.title}
                    </span>
                    {h.habitPurpose === 'competition' && (
                      <span className="text-[10px] font-medium text-[var(--accent-primary)] shrink-0">
                        競賽
                      </span>
                    )}
                  </div>
                  <span className="font-mono-tabular text-xs text-[var(--text-muted)] shrink-0">
                    完成 {h.totalCompletions} 次
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Appearance, Privacy & Notification Settings */}
        <section
          style={{ boxShadow: 'var(--shadow-card)' }}
          className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-6 space-y-6"
        >
          {/* Theme Mode Selector */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <Palette className="w-4 h-4 text-[var(--accent-primary)]" strokeWidth={1.75} />
              <span>介面外觀主題</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-[var(--bg-subtle)] border border-[var(--border-hairline)] rounded-xl">
              {(
                [
                  { id: 'light', label: '淺色模式', icon: Sun },
                  { id: 'dark', label: '深色模式', icon: Moon },
                  { id: 'system', label: '跟隨系統', icon: Monitor },
                ] as const
              ).map((opt) => {
                const Icon = opt.icon;
                const active = mode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setMode(opt.id);
                      showToast(`已切換為${opt.label}`);
                    }}
                    className={`h-9 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-[var(--border-hairline)]">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <Shield className="w-4 h-4 text-[var(--accent-primary)]" strokeWidth={1.75} />
              <span>隱私設定</span>
            </div>

            {[
              {
                key: 'showActivityToFriends' as const,
                label: '將公開習慣打卡推播至好友動態牆',
              },
              {
                key: 'showProfilePublicly' as const,
                label: '允許好友在個人檔案檢視我的公開習慣列表',
              },
              {
                key: 'discoverable' as const,
                label: '允許其他使用者透過 @username 搜尋到我',
              },
            ].map((item) => {
              const active = user.privacySettings[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => togglePrivacy(item.key)}
                  className="w-full flex items-center justify-between gap-3 py-2 text-left cursor-pointer"
                >
                  <span className="text-xs text-[var(--text-secondary)]">{item.label}</span>
                  <div
                    style={{
                      backgroundColor: active ? 'var(--accent-primary)' : 'var(--switch-off)',
                    }}
                    className="w-9 h-5 rounded-full p-0.5 shrink-0 transition-colors"
                  >
                    <div
                      style={{ backgroundColor: 'var(--switch-knob)' }}
                      className={`w-4 h-4 rounded-full transition-transform ${
                        active ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          <div className="space-y-3 pt-4 border-t border-[var(--border-hairline)]">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <Bell className="w-4 h-4 text-[var(--accent-warning)]" strokeWidth={1.75} />
              <span>通知設定</span>
            </div>

            {[
              { key: 'dailyReminder' as const, label: '每日習慣提醒通知' },
              { key: 'friendActivity' as const, label: '好友按讚、加油與留言通知' },
              { key: 'challengeUpdates' as const, label: '1v1 與團隊挑戰狀態更新' },
            ].map((item) => {
              const active = user.notificationSettings[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => toggleNotification(item.key)}
                  className="w-full flex items-center justify-between gap-3 py-2 text-left cursor-pointer"
                >
                  <span className="text-xs text-[var(--text-secondary)]">{item.label}</span>
                  <div
                    style={{
                      backgroundColor: active ? 'var(--accent-warning)' : 'var(--switch-off)',
                    }}
                    className="w-9 h-5 rounded-full p-0.5 shrink-0 transition-colors"
                  >
                    <div
                      style={{ backgroundColor: 'var(--switch-knob)' }}
                      className={`w-4 h-4 rounded-full transition-transform ${
                        active ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          <div className="pt-4 border-t border-[var(--border-hairline)]">
            <button
              type="button"
              onClick={onSignOut}
              className="w-full h-11 rounded-xl bg-[var(--accent-danger-soft)] border border-[var(--accent-danger)]/30 text-[var(--accent-danger)] text-xs font-semibold flex items-center justify-center gap-2 hover:opacity-85 transition-opacity cursor-pointer"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.75} />
              <span>登出帳號（{user.email}）</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
