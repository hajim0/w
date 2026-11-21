import React, { useEffect, useState } from 'react';
import { Camera, Check, Pause, Play, RotateCcw, ShieldCheck, Timer, Upload, X } from 'lucide-react';
import { motion } from 'motion/react';
import { Habit, HabitRecord } from '../types';
import { getCurrentTimeHHMM } from '../lib/date';
import { compressImageFile } from '../lib/image';
import { HabitIcon } from './HabitIcon';

interface CheckInModalProps {
  habit: Habit | null;
  existingRecord: HabitRecord | null;
  onClose: () => void;
  onConfirm: (payload: {
    completedValue: number;
    completedTime?: string;
    note?: string;
    photoDataUrl?: string;
    timerSeconds?: number;
    reason?: string;
  }) => Promise<void>;
}

function formatTimerClock(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function CheckInModal({
  habit,
  existingRecord,
  onClose,
  onConfirm,
}: CheckInModalProps) {
  const [value, setValue] = useState<number>(30);
  const [timeStr, setTimeStr] = useState<string>(getCurrentTimeHHMM());
  const [note, setNote] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(undefined);
  const [timerSeconds, setTimerSeconds] = useState<number>(0);
  const [timerRunning, setTimerRunning] = useState<boolean>(false);
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!habit) return;
    setError(null);
    setTimerRunning(false);
    setReason('');
    if (existingRecord) {
      setValue(existingRecord.completedValue);
      setTimeStr(existingRecord.completedTime || getCurrentTimeHHMM());
      setNote(existingRecord.note || '');
      setPhotoDataUrl(existingRecord.photoDataUrl);
      setTimerSeconds(existingRecord.timerSeconds || 0);
    } else {
      setValue(habit.targetValue || 1);
      setTimeStr(getCurrentTimeHHMM());
      setNote('');
      setPhotoDataUrl(undefined);
      setTimerSeconds(0);
    }
  }, [habit, existingRecord]);

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => {
      setTimerSeconds((s) => Math.min(86400, s + 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  if (!habit) return null;

  const isEditing = Boolean(existingRecord);
  const isVerifiedReady =
    Boolean(photoDataUrl) ||
    timerSeconds >= 60 ||
    existingRecord?.verificationLevel === 'verified' ||
    existingRecord?.verificationLevel === 'integrated';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressing(true);
    setError(null);
    try {
      const compressed = await compressImageFile(file);
      setPhotoDataUrl(compressed);
    } catch (err) {
      setError(err instanceof Error ? err.message : '照片處理失敗');
    } finally {
      setCompressing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (habit.requirePhoto && !photoDataUrl) {
      setError('此習慣已設定必須附上照片證明');
      return;
    }
    if (habit.recordType === 'value' && (!value || value <= 0)) {
      setError('請輸入有效完成數值');
      return;
    }
    setTimerRunning(false);
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm({
        completedValue: habit.recordType === 'value' ? Number(value) : 1,
        completedTime: habit.recordType === 'time' ? timeStr : getCurrentTimeHHMM(),
        note: note.trim() || undefined,
        photoDataUrl,
        timerSeconds: timerSeconds > 0 ? timerSeconds : undefined,
        reason: isEditing && reason.trim() ? reason.trim() : undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '打卡失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm p-0 sm:p-4">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        style={{ boxShadow: 'var(--shadow-modal)' }}
        className="w-full sm:max-w-md max-h-[92dvh] bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden theme-transition"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-hairline)] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent-primary-soft)] flex items-center justify-center text-[var(--accent-primary)] shrink-0">
              <HabitIcon name={habit.icon} className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-base font-semibold text-[var(--text-primary)] truncate">
                {habit.title}
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                {isEditing ? '修改今日紀錄（寫入審計日誌，不重複給 XP）' : `完成可獲得 +${habit.xpReward} XP`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" strokeWidth={1.75} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-[var(--accent-danger-soft)] border border-[var(--accent-danger)]/30 text-xs text-[var(--accent-danger)]">
              {error}
            </div>
          )}

          {/* Verification Status Preview */}
          <div className="px-3.5 py-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs">
              <ShieldCheck
                className={`w-4 h-4 shrink-0 ${
                  isVerifiedReady ? 'text-[var(--accent-success)]' : 'text-[var(--text-muted)]'
                }`}
                strokeWidth={1.75}
              />
              <span className="text-[var(--text-secondary)]">
                {isVerifiedReady ? 'Verified 已驗證紀錄（附照片或計時 ≥ 60 秒）' : 'Basic 基礎手動紀錄'}
              </span>
            </div>
            <span
              className={`text-[11px] font-mono-tabular font-medium ${
                isVerifiedReady ? 'text-[var(--accent-success)]' : 'text-[var(--text-muted)]'
              }`}
            >
              {isVerifiedReady ? 'VERIFIED' : 'BASIC'}
            </span>
          </div>

          {habit.recordType === 'value' && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                實際完成數量（目標 {habit.targetValue} {habit.unit}）
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={10000}
                  step="any"
                  value={value}
                  onChange={(e) => setValue(Number(e.target.value))}
                  className="flex-1 h-12 px-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-lg font-mono-tabular font-semibold text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
                  required
                />
                <span className="text-sm text-[var(--text-secondary)] font-medium shrink-0">{habit.unit}</span>
              </div>
            </div>
          )}

          {habit.recordType === 'time' && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                記錄時間{habit.targetTime ? `（目標 ${habit.targetTime}）` : ''}
              </label>
              <input
                type="time"
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                className="w-full h-12 px-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-lg font-mono-tabular font-semibold text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
                required
              />
            </div>
          )}

          {/* Built-in Focus Timer Proof */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-[var(--text-secondary)] flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Timer className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>內建專注計時佐證（滿 60 秒即升級 Verified）</span>
              </span>
            </label>
            <div className="p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-between gap-3">
              <span className="font-mono-tabular text-lg font-semibold text-[var(--text-primary)]">
                {formatTimerClock(timerSeconds)}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setTimerRunning((v) => !v)}
                  className={`h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors ${
                    timerRunning
                      ? 'bg-[var(--accent-warning-soft)] text-[var(--accent-warning)]'
                      : 'bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)]'
                  }`}
                >
                  {timerRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{timerRunning ? '暫停' : timerSeconds > 0 ? '繼續' : '開始計時'}</span>
                </button>
                {timerSeconds > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setTimerRunning(false);
                      setTimerSeconds(0);
                    }}
                    className="h-8 w-8 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center cursor-pointer"
                    aria-label="重設計時"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-[var(--text-secondary)]">備註心得（選填）</label>
            <input
              type="text"
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="記錄今天的狀態或重點..."
              className="w-full h-11 px-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
            />
          </div>

          {isEditing && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                修訂原因（將保留於審計日誌，選填）
              </label>
              <input
                type="text"
                maxLength={160}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="例如：補登實際閱讀時長 / 更正打卡時間"
                className="w-full h-10 px-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-medium text-[var(--text-secondary)] flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>{habit.requirePhoto ? '打卡照片（必填）' : '打卡照片（選填，上傳即 Verified）'}</span>
            </label>

            {photoDataUrl ? (
              <div className="relative rounded-xl overflow-hidden border border-[var(--border-hairline)] bg-[var(--bg-subtle)]">
                <img
                  src={photoDataUrl}
                  alt="打卡照片預覽"
                  className="w-full max-h-48 object-cover"
                />
                <button
                  type="button"
                  onClick={() => setPhotoDataUrl(undefined)}
                  className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-black/70 text-xs text-white hover:bg-black/85 transition-colors cursor-pointer"
                >
                  移除
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 h-24 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-subtle)]/50 hover:bg-[var(--bg-subtle)] text-xs text-[var(--text-secondary)] cursor-pointer transition-colors">
                <Upload className="w-4 h-4" strokeWidth={1.75} />
                <span>{compressing ? '壓縮處理中...' : '點擊選擇或拍攝照片'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting || compressing}
            className="w-full h-12 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[var(--accent-primary-hover)] active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer"
          >
            <Check className="w-4 h-4" strokeWidth={1.75} />
            <span>
              {submitting
                ? '寫入同步中...'
                : isEditing
                ? '儲存紀錄修訂'
                : `確認完成並領取 +${habit.xpReward} XP`}
            </span>
          </button>
        </form>
      </motion.div>
    </div>
  );
}
