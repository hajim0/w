import { Habit } from '../types';

export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Taipei';
  } catch {
    return 'Asia/Taipei';
  }
}

export function getLocalDateStr(date: Date = new Date(), timeZone?: string): string {
  try {
    const tz = timeZone || getUserTimezone();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date); // YYYY-MM-DD
  } catch {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}

export function getCurrentTimeHHMM(date: Date = new Date()): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function parseLocalDate(localDate: string): Date {
  const [y, m, d] = localDate.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDaysLocal(localDate: string, days: number): string {
  const dt = parseLocalDate(localDate);
  dt.setDate(dt.getDate() + days);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getDayOfWeekFromLocalDate(localDate: string): number {
  return parseLocalDate(localDate).getDay(); // 0=Sun..6=Sat
}

/**
 * ISO-8601 week key starting Monday (YYYY-Www), ensuring Monday resets.
 */
export function getWeekKey(localDate?: string): string {
  const dt = localDate ? parseLocalDate(localDate) : parseLocalDate(getLocalDateStr());
  const dayNum = dt.getDay() || 7; // Mon=1..Sun=7
  dt.setDate(dt.getDate() + 4 - dayNum);
  const yearStart = new Date(dt.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${dt.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function getMondayOfWeekLocal(localDate: string): string {
  const dt = parseLocalDate(localDate);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isHabitScheduledForDate(habit: Habit, localDate: string): boolean {
  if (habit.archived) return false;
  if (habit.frequency === 'daily') return true;
  const dow = getDayOfWeekFromLocalDate(localDate);
  if (!habit.targetDays || habit.targetDays.length === 0) return true;
  return habit.targetDays.includes(dow);
}

export function formatReadableDate(localDate: string): string {
  const dt = parseLocalDate(localDate);
  const weekdays = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
  return `${dt.getMonth() + 1}月${dt.getDate()}日 · ${weekdays[dt.getDay()]}`;
}

export function formatTimeAgo(date: Date): string {
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return '剛剛';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} 分鐘前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} 小時前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} 天前`;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function getGreeting(date: Date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return '夜深了，保持節奏';
  if (h < 11) return '早安，開啟今日節律';
  if (h < 14) return '午安，維持專注動能';
  if (h < 18) return '午後，推進關鍵目標';
  return '晚安，檢視今日收穫';
}

export function getLastNDaysLocal(n: number, endDate: string): string[] {
  const arr: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    arr.push(addDaysLocal(endDate, -i));
  }
  return arr;
}

export function getDaysBetweenInclusive(startDate: string, endDate: string): number {
  const start = parseLocalDate(startDate).getTime();
  const end = parseLocalDate(endDate).getTime();
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}
