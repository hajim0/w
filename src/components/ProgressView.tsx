import React, { useMemo, useState } from 'react';
import { Award, Flame, History, ShieldCheck, Sparkles, TrendingUp, Trophy } from 'lucide-react';
import {
  CompetitionScore,
  CompetitionSeason,
  Habit,
  HabitRecord,
  HabitRecordAuditLog,
  UserPrivate,
  XpTransaction,
} from '../types';
import { getTitleForLevel, xpRequiredForLevel } from '../constants/habits';
import {
  computeWeeklyCompetitionMetrics,
  formatCompetitionScore,
  getWeekBoundsFromDate,
} from '../lib/competition';
import {
  getLastNDaysLocal,
  getMondayOfWeekLocal,
  getWeekKey,
  isHabitScheduledForDate,
  parseLocalDate,
} from '../lib/date';
import { HabitIcon } from './HabitIcon';

interface ProgressViewProps {
  user: UserPrivate;
  habits: Habit[];
  records: HabitRecord[];
  xpTransactions: XpTransaction[];
  seasons?: CompetitionSeason[];
  scores?: CompetitionScore[];
  auditLogs?: HabitRecordAuditLog[];
  todayDate: string;
}

export function ProgressView({
  user,
  habits,
  records,
  xpTransactions,
  seasons = [],
  scores = [],
  auditLogs = [],
  todayDate,
}: ProgressViewProps) {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  const titleDef = getTitleForLevel(user.level);
  const weekBounds = useMemo(() => getWeekBoundsFromDate(todayDate), [todayDate]);
  const liveCompMetrics = useMemo(
    () =>
      computeWeeklyCompetitionMetrics({
        habits,
        records,
        xpTransactions,
        todayDate,
        weekStartDate: weekBounds.startDate,
      }),
    [habits, records, xpTransactions, todayDate, weekBounds.startDate]
  );

  const currentLvlFloor = xpRequiredForLevel(user.level);
  const nextLvlCeil = xpRequiredForLevel(user.level + 1);
  const levelPct = Math.min(
    100,
    Math.max(
      0,
      Math.round(((user.totalXp - currentLvlFloor) / Math.max(1, nextLvlCeil - currentLvlFloor)) * 100)
    )
  );

  const recordsByDate = useMemo(() => {
    const map = new Map<string, HabitRecord[]>();
    records.forEach((r) => {
      const list = map.get(r.localDate) || [];
      list.push(r);
      map.set(r.localDate, list);
    });
    return map;
  }, [records]);

  const weeklyRate = useMemo(() => {
    const activeHabits = habits.filter((h) => !h.archived);
    if (activeHabits.length === 0) return 0;
    const monday = getMondayOfWeekLocal(todayDate);
    let scheduledTotal = 0;
    let completedTotal = 0;
    let cursor = monday;
    for (let i = 0; i < 7; i++) {
      if (cursor > todayDate) break;
      const dayRecs = new Set((recordsByDate.get(cursor) || []).map((r) => r.habitId));
      activeHabits.forEach((h) => {
        if (isHabitScheduledForDate(h, cursor)) {
          scheduledTotal++;
          if (dayRecs.has(h.id)) completedTotal++;
        }
      });
      const dt = parseLocalDate(cursor);
      dt.setDate(dt.getDate() + 1);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      cursor = `${y}-${m}-${d}`;
    }
    return scheduledTotal > 0 ? Math.round((completedTotal / scheduledTotal) * 100) : 0;
  }, [habits, recordsByDate, todayDate]);

  const monthlyRate = useMemo(() => {
    const activeHabits = habits.filter((h) => !h.archived);
    if (activeHabits.length === 0) return 0;
    const [year, month, day] = todayDate.split('-').map(Number);
    let scheduledTotal = 0;
    let completedTotal = 0;
    for (let d = 1; d <= day; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayRecs = new Set((recordsByDate.get(dateStr) || []).map((r) => r.habitId));
      activeHabits.forEach((h) => {
        if (isHabitScheduledForDate(h, dateStr)) {
          scheduledTotal++;
          if (dayRecs.has(h.id)) completedTotal++;
        }
      });
    }
    return scheduledTotal > 0 ? Math.round((completedTotal / scheduledTotal) * 100) : 0;
  }, [habits, recordsByDate, todayDate]);

  const bestDailyXp = useMemo(() => {
    const byDay = new Map<string, number>();
    xpTransactions.forEach((tx) => {
      byDay.set(tx.localDate, (byDay.get(tx.localDate) || 0) + tx.amount);
    });
    let max = 0;
    byDay.forEach((v) => {
      if (v > max) max = v;
    });
    return max;
  }, [xpTransactions]);

  const habitBreakdown = useMemo(() => {
    const counts = new Map<string, { title: string; icon: string; count: number }>();
    habits.forEach((h) => {
      counts.set(h.id, { title: h.title, icon: h.icon, count: 0 });
    });
    records.forEach((r) => {
      const existing = counts.get(r.habitId);
      if (existing) {
        existing.count++;
      } else {
        counts.set(r.habitId, { title: r.habitTitle, icon: r.habitIcon, count: 1 });
      }
    });
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [habits, records]);

  const monthCalendar = useMemo(() => {
    const [yearStr, monthStr] = todayDate.split('-');
    const year = Number(yearStr);
    const monthIdx = Number(monthStr) - 1;
    const firstDay = new Date(year, monthIdx, 1);
    const totalDaysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    const startOffset = firstDay.getDay();

    const cells: Array<{ dateStr: string; dayNum: number; count: number } | null> = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= totalDaysInMonth; d++) {
      const dateStr = `${yearStr}-${monthStr}-${String(d).padStart(2, '0')}`;
      cells.push({
        dateStr,
        dayNum: d,
        count: (recordsByDate.get(dateStr) || []).length,
      });
    }
    return {
      label: `${year} 年 ${monthIdx + 1} 月`,
      cells,
    };
  }, [todayDate, recordsByDate]);

  const trendSeries = useMemo(() => {
    if (period === 'day') {
      const days = getLastNDaysLocal(14, todayDate);
      return days.map((d) => ({
        label: d.slice(5),
        value: (recordsByDate.get(d) || []).length,
      }));
    }
    if (period === 'week') {
      const weeksMap = new Map<string, number>();
      records.forEach((r) => {
        const wk = getWeekKey(r.localDate);
        weeksMap.set(wk, (weeksMap.get(wk) || 0) + 1);
      });
      const result: { label: string; value: number }[] = [];
      const seen = new Set<string>();
      for (let i = 7; i >= 0; i--) {
        const dt = parseLocalDate(todayDate);
        dt.setDate(dt.getDate() - i * 7);
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        const wk = getWeekKey(`${y}-${m}-${d}`);
        if (!seen.has(wk)) {
          seen.add(wk);
          result.push({ label: wk.slice(5), value: weeksMap.get(wk) || 0 });
        }
      }
      return result;
    }
    const [yr, mo] = todayDate.split('-').map(Number);
    const monthsMap = new Map<string, number>();
    records.forEach((r) => {
      const ym = r.localDate.slice(0, 7);
      monthsMap.set(ym, (monthsMap.get(ym) || 0) + 1);
    });
    const out: { label: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const dt = new Date(yr, mo - 1 - i, 1);
      const ym = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      out.push({ label: `${dt.getMonth() + 1}月`, value: monthsMap.get(ym) || 0 });
    }
    return out;
  }, [period, todayDate, recordsByDate, records]);

  const maxTrendVal = Math.max(1, ...trendSeries.map((s) => s.value));
  const maxHabitCount = Math.max(1, ...habitBreakdown.map((h) => h.count));

  return (
    <div className="space-y-7">
      {/* Header & Period Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            個人成長紀錄
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            所有統計完全依據你的真實打卡紀錄與有效積分計算。
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[var(--bg-subtle)] border border-[var(--border-hairline)] rounded-xl self-start sm:self-auto">
          {([
            { id: 'day', label: '日' },
            { id: 'week', label: '週' },
            { id: 'month', label: '月' },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPeriod(tab.id)}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                period === tab.id
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div
          style={{ boxShadow: 'var(--shadow-card)' }}
          className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-5 space-y-2"
        >
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>等級與稱號</span>
            <Sparkles className="w-3.5 h-3.5 text-[var(--accent-primary)]" strokeWidth={1.75} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono-tabular text-2xl font-semibold text-[var(--text-primary)]">
              Lv.{user.level}
            </span>
            <span className="text-xs font-medium text-[var(--accent-primary)]">
              {titleDef.label} · {titleDef.zhLabel}
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="w-full h-1.5 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
              <div
                className="h-full bg-[var(--accent-primary)] rounded-full transition-all duration-300"
                style={{ width: `${levelPct}%` }}
              />
            </div>
            <div className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
              {user.totalXp} / {nextLvlCeil} XP
            </div>
          </div>
        </div>

        <div
          style={{ boxShadow: 'var(--shadow-card)' }}
          className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-5 space-y-1.5"
        >
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>本週完成率</span>
            <TrendingUp className="w-3.5 h-3.5 text-[var(--accent-primary)]" strokeWidth={1.75} />
          </div>
          <div className="font-mono-tabular text-2xl font-semibold text-[var(--text-primary)]">
            {weeklyRate}%
          </div>
          <div className="text-[11px] text-[var(--text-muted)] font-mono-tabular">
            本月完成率 {monthlyRate}%
          </div>
        </div>

        <div
          style={{ boxShadow: 'var(--shadow-card)' }}
          className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-5 space-y-1.5"
        >
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>連續打卡紀錄</span>
            <Flame className="w-3.5 h-3.5 text-[var(--accent-warning)]" strokeWidth={1.75} />
          </div>
          <div className="font-mono-tabular text-2xl font-semibold text-[var(--text-primary)]">
            {user.currentStreak} 天
          </div>
          <div className="text-[11px] text-[var(--text-muted)] font-mono-tabular">
            歷史最長 {user.bestStreak} 天
          </div>
        </div>

        <div
          style={{ boxShadow: 'var(--shadow-card)' }}
          className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-5 space-y-1.5"
        >
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>個人最佳紀錄</span>
            <Award className="w-3.5 h-3.5 text-[var(--accent-warning)]" strokeWidth={1.75} />
          </div>
          <div className="font-mono-tabular text-2xl font-semibold text-[var(--text-primary)]">
            {records.length} 次
          </div>
          <div className="text-[11px] text-[var(--text-muted)] font-mono-tabular">
            單日最高 +{bestDailyXp} XP
          </div>
        </div>
      </section>

      {/* Dual-Track System: Personal XP vs Fair Competition Score */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          style={{ boxShadow: 'var(--shadow-card)' }}
          className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-5 space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              個人成長積分（Personal XP）
            </span>
            <span className="font-mono-tabular text-xs font-semibold text-[var(--text-primary)]">
              {user.totalXp} XP
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            用於長期等級與「{titleDef.label}」稱號晉升。個人習慣與競賽習慣打卡皆可累積，鼓勵全面生活節律管理。
          </p>
        </div>

        <div
          style={{ boxShadow: 'var(--shadow-card)' }}
          className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-5 space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              本週公平競賽分（Competition Score）
            </span>
            <span className="font-mono-tabular text-xs font-semibold text-[var(--accent-primary)]">
              {formatCompetitionScore(liveCompMetrics.competitionScore)} / 100.0
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed font-mono-tabular">
            一致率 60%（{liveCompMetrics.consistencyRate}%）· 目標達成 25%（{liveCompMetrics.goalAttainmentRate}%）· 穩定度 15%（{liveCompMetrics.stabilityRate}%）
          </p>
        </div>
      </section>

      {/* Monochromatic Low-Saturation Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Heatmap */}
        <section
          style={{ boxShadow: 'var(--shadow-card)' }}
          className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
              每月打卡熱力圖
            </h2>
            <span className="text-xs text-[var(--text-muted)] font-mono-tabular">
              {monthCalendar.label}
            </span>
          </div>

          <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] text-[var(--text-muted)] pb-1">
            {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {monthCalendar.cells.map((cell, idx) => {
              if (!cell) return <div key={`empty_${idx}`} className="aspect-square" />;
              const isToday = cell.dateStr === todayDate;
              const style: React.CSSProperties =
                cell.count === 0
                  ? {
                      backgroundColor: 'var(--bg-subtle)',
                      color: 'var(--text-muted)',
                    }
                  : cell.count === 1
                  ? {
                      backgroundColor: 'color-mix(in srgb, var(--accent-primary) 22%, transparent)',
                      color: 'var(--text-primary)',
                    }
                  : cell.count === 2
                  ? {
                      backgroundColor: 'color-mix(in srgb, var(--accent-primary) 55%, transparent)',
                      color: 'var(--text-primary)',
                    }
                  : {
                      backgroundColor: 'var(--accent-primary)',
                      color: 'var(--accent-primary-fg)',
                      fontWeight: 600,
                    };

              return (
                <div
                  key={cell.dateStr}
                  title={`${cell.dateStr}：完成 ${cell.count} 項習慣`}
                  style={style}
                  className={`aspect-square rounded-lg flex items-center justify-center text-xs font-mono-tabular transition-colors ${
                    isToday ? 'ring-1.5 ring-[var(--accent-warning)]' : ''
                  }`}
                >
                  {cell.dayNum}
                </div>
              );
            })}
          </div>
        </section>

        {/* Historical Trend Chart */}
        <section
          style={{ boxShadow: 'var(--shadow-card)' }}
          className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-6 space-y-4 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
              {period === 'day'
                ? '近 14 日打卡趨勢'
                : period === 'week'
                ? '近 8 週打卡趨勢'
                : '近 6 個月打卡趨勢'}
            </h2>
            <span className="text-xs text-[var(--text-muted)] font-mono-tabular">單位：次</span>
          </div>

          <div className="h-52 flex items-end gap-2 pt-4">
            {trendSeries.map((pt) => {
              const heightPct = Math.round((pt.value / maxTrendVal) * 100);
              return (
                <div
                  key={pt.label}
                  className="flex-1 flex flex-col items-center justify-end gap-2 h-full group"
                >
                  <span className="font-mono-tabular text-[10px] text-[var(--text-secondary)]">
                    {pt.value > 0 ? pt.value : ''}
                  </span>
                  <div className="w-full flex-1 flex items-end">
                    <div
                      title={`${pt.label}：${pt.value} 次`}
                      className="w-full rounded-t-md transition-all duration-300"
                      style={{
                        height: `${Math.max(4, heightPct)}%`,
                        backgroundColor:
                          pt.value > 0 ? 'var(--accent-primary)' : 'var(--bg-subtle)',
                        opacity: pt.value > 0 ? 0.88 : 1,
                      }}
                    />
                  </div>
                  <span className="font-mono-tabular text-[10px] text-[var(--text-muted)] truncate max-w-full">
                    {pt.label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Bottom Row: Habit Breakdown & XP Audit Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section
          style={{ boxShadow: 'var(--shadow-card)' }}
          className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-6 space-y-4"
        >
          <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
            各習慣累積完成次數
          </h2>
          {habitBreakdown.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">尚未有打卡紀錄。</p>
          ) : (
            <div className="space-y-3.5">
              {habitBreakdown.map((item) => (
                <div key={item.title} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <HabitIcon name={item.icon} className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
                      <span className="text-[var(--text-primary)] truncate">{item.title}</span>
                    </div>
                    <span className="font-mono-tabular text-[var(--text-secondary)] shrink-0">
                      {item.count} 次
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
                    <div
                      className="h-full bg-[var(--accent-primary)] rounded-full transition-all duration-300"
                      style={{ width: `${Math.round((item.count / maxHabitCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section
          style={{ boxShadow: 'var(--shadow-card)' }}
          className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-6 space-y-4"
        >
          <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
            近期 XP 積分紀錄
          </h2>
          {xpTransactions.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">完成一次習慣打卡後，積分明細將記錄於此。</p>
          ) : (
            <div className="divide-y divide-[var(--border-hairline)] max-h-72 overflow-y-auto pr-1">
              {xpTransactions.slice(0, 15).map((tx) => (
                <div key={tx.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                      {tx.description}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] font-mono-tabular">
                      {tx.localDate} · {tx.weekKey}
                    </div>
                  </div>
                  <span className="font-mono-tabular text-xs font-semibold text-[var(--accent-primary)] shrink-0">
                    +{tx.amount} XP
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Season History & Record Audit Trail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section
          style={{ boxShadow: 'var(--shadow-card)' }}
          className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-6 space-y-4"
        >
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-[var(--accent-primary)]" strokeWidth={1.75} />
            <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
              週賽季歷史表現
            </h2>
          </div>
          {scores.filter((s) => s.userId === user.uid).length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">
              尚無歷史週賽季紀錄，將習慣設為「競賽習慣」並持續打卡即可生成週賽成績。
            </p>
          ) : (
            <div className="divide-y divide-[var(--border-hairline)] max-h-64 overflow-y-auto pr-1">
              {scores
                .filter((s) => s.userId === user.uid)
                .slice()
                .sort((a, b) => (b.weekKey > a.weekKey ? 1 : -1))
                .map((sc) => {
                  const matchedSeason = seasons.find(
                    (se) =>
                      se.id === sc.seasonId ||
                      (se.leagueType === 'circle' && `circle_${se.weekKey}` === sc.seasonId)
                  );
                  return (
                    <div key={sc.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                          {matchedSeason?.name || `週賽季 ${sc.weekKey}`}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] font-mono-tabular">
                          一致 {sc.consistencyRate}% · 達標 {sc.goalAttainmentRate}% · 進步{' '}
                          {sc.improvementDelta >= 0 ? '+' : ''}
                          {sc.improvementDelta}%
                        </div>
                      </div>
                      <span className="font-mono-tabular text-xs font-semibold text-[var(--accent-primary)] shrink-0">
                        {formatCompetitionScore(sc.competitionScore)} 分
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </section>

        <section
          style={{ boxShadow: 'var(--shadow-card)' }}
          className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-[var(--accent-warning)]" strokeWidth={1.75} />
              <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                紀錄修訂審計日誌
              </h2>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
              <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
              不可竄改
            </span>
          </div>
          {auditLogs.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">
              目前沒有修改過打卡數值的紀錄。所有既有打卡的數值變更都會保留於此以維持競賽公平。
            </p>
          ) : (
            <div className="divide-y divide-[var(--border-hairline)] max-h-64 overflow-y-auto pr-1">
              {auditLogs.slice(0, 15).map((log) => (
                <div key={log.id} className="py-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono-tabular text-[var(--text-primary)]">
                      {log.localDate} · 數值 {log.previousValue} → {log.newValue}
                    </span>
                    <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                      {log.previousVerificationLevel} → {log.newVerificationLevel}
                    </span>
                  </div>
                  {log.reason && (
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      備註：{log.reason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
