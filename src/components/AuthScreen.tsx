import React, { useState } from 'react';
import { ArrowRight, Check, Flame, Monitor, Moon, ShieldCheck, Sun, Users } from 'lucide-react';
import { useTheme } from '../lib/theme';

interface AuthScreenProps {
  onSignIn: () => Promise<void>;
  pendingInviteCode?: string | null;
}

export function AuthScreen({ onSignIn, pendingInviteCode }: AuthScreenProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const { mode, setMode } = useTheme();

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await onSignIn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('auth/unauthorized-domain')) {
        const host = typeof window !== 'undefined' ? window.location.hostname : '目前網域';
        setError(
          `網域「${host}」尚未加入 Firebase 授權網域。請前往 Firebase Console → Authentication → Settings → Authorized domains 新增此網域後重試。`
        );
      } else if (msg.includes('auth/popup-blocked')) {
        setError('瀏覽器封鎖了 Google 登入彈窗，請允許此網站開啟彈出視窗後再試一次。');
      } else if (msg.includes('auth/popup-closed-by-user')) {
        setError('已取消 Google 登入視窗。');
      } else {
        setError(err instanceof Error ? err.message : '登入失敗，請稍後再試');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] theme-transition flex flex-col lg:flex-row">
      {/* Left Hero Visual */}
      <div className="relative lg:w-[52%] min-h-[280px] lg:min-h-screen overflow-hidden bg-[#151614] border-b lg:border-b-0 lg:border-r border-[var(--border-hairline)]">
        {!imgError ? (
          <img
            src="/src/assets/images/login_obsidian_hero_1795097880972.jpg"
            alt="極簡建築空間"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="absolute inset-0 w-full h-full object-cover opacity-75"
          />
        ) : (
          <div className="absolute inset-0 bg-[#1C1D1B]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#151614]/95 via-[#151614]/55 to-[#151614]/30" />

        <div className="relative z-10 h-full flex flex-col justify-between p-6 sm:p-10 lg:p-14">
          <div className="flex items-center justify-between">
            <span className="font-display text-lg font-semibold tracking-tight text-[#F0F0EA]">
              KADENCE
            </span>
          </div>

          <div className="max-w-lg space-y-3.5 pt-12 lg:pt-0">
            <p className="text-xs font-medium text-[#C5A273] tracking-wider">
              社交自律習慣平台
            </p>
            <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight leading-[1.2] text-[#F0F0EA]">
              讓自律不再是一個人的事情，而是和朋友一起持續進步。
            </h1>
            <p className="text-sm text-[#B4B5AE] leading-relaxed">
              結合極簡每日打卡、好友即時動態、每週排行榜與 1 VS 1 挑戰，把每一天的堅持轉化為可衡量的長期成長。
            </p>
          </div>
        </div>
      </div>

      {/* Right Auth Panel */}
      <div className="flex-1 flex flex-col justify-between p-6 sm:p-10 lg:p-16">
        {/* Quiet Theme Selector */}
        <div className="flex justify-end">
          <div
            className="inline-flex items-center gap-0.5 p-1 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)]"
            role="group"
            aria-label="外觀主題"
          >
            {(
              [
                { id: 'light', label: '淺色', icon: Sun },
                { id: 'dark', label: '深色', icon: Moon },
                { id: 'system', label: '系統', icon: Monitor },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const active = mode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setMode(opt.id)}
                  className={`h-8 px-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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

        <div className="w-full max-w-md mx-auto space-y-7 my-auto py-8">
          <div className="space-y-2">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
              開始你的節律紀錄
            </h2>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              使用 Google 帳號安全登入，你的習慣設定、連續紀錄與好友挑戰將跨裝置即時同步。
            </p>
          </div>

          {pendingInviteCode && (
            <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--accent-warning)]/40 space-y-1">
              <p className="text-xs font-medium text-[var(--accent-warning)]">收到好友邀請連結</p>
              <p className="text-sm text-[var(--text-primary)]">
                登入後即可自動查詢邀請碼{' '}
                <span className="font-mono-tabular font-semibold">{pendingInviteCode}</span> 並送出好友連結。
              </p>
            </div>
          )}

          <div className="space-y-3.5 border-y border-[var(--border-hairline)] py-5">
            <div className="flex items-start gap-3">
              <Check className="w-4 h-4 text-[var(--accent-primary)] mt-0.5 shrink-0" strokeWidth={1.75} />
              <div className="text-sm text-[var(--text-secondary)]">
                一鍵完成每日打卡與時間／數值紀錄，杜絕重複刷分
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Users className="w-4 h-4 text-[var(--accent-primary)] mt-0.5 shrink-0" strokeWidth={1.75} />
              <div className="text-sm text-[var(--text-secondary)]">
                每個習慣可獨立設定公開或私人，完全掌控社交隱私
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Flame className="w-4 h-4 text-[var(--accent-warning)] mt-0.5 shrink-0" strokeWidth={1.75} />
              <div className="text-sm text-[var(--text-secondary)]">
                每週一自動結算好友排行、1v1 對決與 3–10 人團隊目標
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-[var(--accent-danger-soft)] border border-[var(--accent-danger)]/30 text-xs text-[var(--accent-danger)] leading-relaxed">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <button
              type="button"
              onClick={handleLogin}
              disabled={loading}
              className="w-full h-12 px-5 rounded-xl bg-[var(--control-active-bg)] text-[var(--control-active-fg)] font-semibold text-sm flex items-center justify-center gap-3 hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z"
                />
              </svg>
              <span>{loading ? '正在安全驗證中...' : '使用 Google 帳號繼續'}</span>
              {!loading && <ArrowRight className="w-4 h-4" strokeWidth={1.75} />}
            </button>

            <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
              <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>由 Firebase Authentication 加密驗證並隔離個人資料</span>
            </div>
          </div>
        </div>

        <div />
      </div>
    </div>
  );
}
