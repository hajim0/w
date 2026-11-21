import React, { useEffect, useState } from 'react';
import { X, Check, Lock, Globe, Camera, Trophy, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import {
  Habit,
  HabitCategory,
  HabitFrequency,
  HabitPurpose,
  HabitRecordType,
  HabitTemplate,
} from '../types';
import {
  CATEGORY_LABELS,
  HABIT_ICONS,
  HABIT_TEMPLATES,
  MAX_COMPETITION_HABITS,
  WEEKDAY_LABELS,
} from '../constants/habits';
import { HabitIcon } from './HabitIcon';

interface HabitModalProps {
  isOpen: boolean;
  editingHabit?: Habit | null;
  activeCompetitionCount: number;
  onClose: () => void;
  onSave: (data: {
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
    habitPurpose: HabitPurpose;
    isPublic: boolean;
    requirePhoto: boolean;
  }) => Promise<void>;
}

export function HabitModal({
  isOpen,
  editingHabit,
  activeCompetitionCount,
  onClose,
  onSave,
}: HabitModalProps) {
  const [mode, setMode] = useState<'templates' | 'custom'>('templates');
  const [templateCat, setTemplateCat] = useState<string>('all');

  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState('target');
  const [category, setCategory] = useState<HabitCategory>('life');
  const [frequency, setFrequency] = useState<HabitFrequency>('daily');
  const [targetDays, setTargetDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [recordType, setRecordType] = useState<HabitRecordType>('check');
  const [targetValue, setTargetValue] = useState<number>(1);
  const [targetTime, setTargetTime] = useState<string>('07:30');
  const [unit, setUnit] = useState<string>('次');
  const [reminderTime, setReminderTime] = useState<string>('');
  const [xpReward, setXpReward] = useState<10 | 20>(10);
  const [habitPurpose, setHabitPurpose] = useState<HabitPurpose>('personal');
  const [isPublic, setIsPublic] = useState<boolean>(true);
  const [requirePhoto, setRequirePhoto] = useState<boolean>(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alreadyCompetition = editingHabit?.habitPurpose === 'competition';
  const canSelectCompetition = alreadyCompetition || activeCompetitionCount < MAX_COMPETITION_HABITS;

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (editingHabit) {
      setMode('custom');
      setTitle(editingHabit.title);
      setIcon(editingHabit.icon);
      setCategory(editingHabit.category);
      setFrequency(editingHabit.frequency);
      setTargetDays(editingHabit.targetDays || [0, 1, 2, 3, 4, 5, 6]);
      setRecordType(editingHabit.recordType);
      setTargetValue(editingHabit.targetValue || 1);
      setTargetTime(editingHabit.targetTime || '07:30');
      setUnit(editingHabit.unit || '次');
      setReminderTime(editingHabit.reminderTime || '');
      setXpReward(editingHabit.xpReward === 20 ? 20 : 10);
      setHabitPurpose(editingHabit.habitPurpose || 'personal');
      setIsPublic(editingHabit.isPublic);
      setRequirePhoto(editingHabit.requirePhoto);
    } else {
      setMode('templates');
      setTemplateCat('all');
      setTitle('');
      setIcon('target');
      setCategory('life');
      setFrequency('daily');
      setTargetDays([0, 1, 2, 3, 4, 5, 6]);
      setRecordType('check');
      setTargetValue(1);
      setTargetTime('07:30');
      setUnit('次');
      setReminderTime('');
      setXpReward(10);
      setHabitPurpose('personal');
      setIsPublic(true);
      setRequirePhoto(false);
    }
  }, [isOpen, editingHabit]);

  if (!isOpen) return null;

  const applyTemplate = (tpl: HabitTemplate) => {
    setTitle(tpl.title);
    setIcon(tpl.icon);
    setCategory(tpl.category);
    setFrequency(tpl.frequency);
    setTargetDays(tpl.targetDays);
    setRecordType(tpl.recordType);
    setTargetValue(tpl.targetValue);
    setTargetTime(tpl.targetTime || '07:30');
    setUnit(tpl.unit);
    setXpReward(tpl.xpReward);
    setHabitPurpose(
      tpl.recommendedPurpose === 'competition' && canSelectCompetition ? 'competition' : 'personal'
    );
    setMode('custom');
  };

  const toggleDay = (day: number) => {
    setTargetDays((prev) =>
      prev.includes(day) ? (prev.length > 1 ? prev.filter((d) => d !== day) : prev) : [...prev, day].sort()
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('請輸入習慣名稱');
      return;
    }
    if (recordType === 'value' && (!targetValue || targetValue <= 0)) {
      setError('數值目標必須大於 0');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        icon,
        category,
        frequency,
        targetDays: frequency === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : targetDays,
        recordType,
        targetValue: recordType === 'value' ? Number(targetValue) : 1,
        targetTime: recordType === 'time' ? targetTime : undefined,
        unit: recordType === 'check' ? '次' : recordType === 'time' ? (unit || '點') : unit || '分鐘',
        reminderTime: reminderTime || undefined,
        xpReward,
        habitPurpose,
        isPublic,
        requirePhoto,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗，請檢查欄位後重試');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredTemplates =
    templateCat === 'all'
      ? HABIT_TEMPLATES
      : HABIT_TEMPLATES.filter((t) => t.category === templateCat);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm p-0 sm:p-4">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        style={{ boxShadow: 'var(--shadow-modal)' }}
        className="w-full sm:max-w-xl max-h-[90dvh] bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden theme-transition"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-hairline)] shrink-0">
          <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
            {editingHabit ? '編輯習慣' : '建立新習慣'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            aria-label="關閉"
          >
            <X className="w-5 h-5" strokeWidth={1.75} />
          </button>
        </div>

        {!editingHabit && (
          <div className="px-6 pt-4 shrink-0">
            <div className="grid grid-cols-2 p-1 bg-[var(--bg-subtle)] rounded-xl border border-[var(--border-hairline)]">
              <button
                type="button"
                onClick={() => setMode('templates')}
                className={`h-9 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  mode === 'templates'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                精選範本庫
              </button>
              <button
                type="button"
                onClick={() => setMode('custom')}
                className={`h-9 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  mode === 'custom'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                完全自訂設定
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {mode === 'templates' && !editingHabit ? (
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {(['all', 'life', 'fitness', 'learning', 'work', 'finance'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setTemplateCat(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer border ${
                      templateCat === cat
                        ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] border-transparent'
                        : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {cat === 'all' ? '全部' : CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {filteredTemplates.map((tpl) => (
                  <button
                    key={tpl.key}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className="text-left p-3.5 rounded-xl bg-[var(--bg-subtle)]/75 hover:bg-[var(--bg-subtle)] border border-[var(--border-hairline)] hover:border-[var(--border-strong)] transition-all flex items-start gap-3 cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-hairline)] flex items-center justify-center text-[var(--text-primary)] shrink-0">
                      <HabitIcon name={tpl.icon} className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                          {tpl.title}
                        </span>
                        <span className="font-mono-tabular text-[11px] text-[var(--accent-primary)] font-medium shrink-0">
                          +{tpl.xpReward} XP
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-1">
                        {CATEGORY_LABELS[tpl.category]} ·{' '}
                        {tpl.recordType === 'time'
                          ? `目標 ${tpl.targetTime}`
                          : tpl.recordType === 'value'
                          ? `${tpl.targetValue} ${tpl.unit}`
                          : '每日一次'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <form id="habit-form" onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-3 rounded-xl bg-[var(--accent-danger-soft)] border border-[var(--accent-danger)]/30 text-xs text-[var(--accent-danger)]">
                  {error}
                </div>
              )}

              {/* Habit Purpose: Personal vs Competition */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    習慣用途（個人成長 / 納入競賽）
                  </label>
                  <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                    競賽名額 {activeCompetitionCount} / {MAX_COMPETITION_HABITS}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setHabitPurpose('personal')}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      habitPurpose === 'personal'
                        ? 'bg-[var(--bg-subtle)] border-[var(--accent-primary)] text-[var(--text-primary)]'
                        : 'bg-[var(--bg-subtle)]/50 border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                      <Sparkles className="w-3.5 h-3.5 text-[var(--accent-primary)]" strokeWidth={1.75} />
                      <span>個人成長 Personal</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-snug">
                      自由紀錄與統計，不計入週聯賽排名。
                    </p>
                  </button>

                  <button
                    type="button"
                    disabled={!canSelectCompetition}
                    onClick={() => setHabitPurpose('competition')}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                      habitPurpose === 'competition'
                        ? 'bg-[var(--accent-primary-soft)] border-[var(--accent-primary)] text-[var(--text-primary)]'
                        : 'bg-[var(--bg-subtle)]/50 border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                      <Trophy className="w-3.5 h-3.5 text-[var(--accent-warning)]" strokeWidth={1.75} />
                      <span>納入競賽 Competition</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-snug">
                      計入每週聯賽綜合競賽分（上限 {MAX_COMPETITION_HABITS} 項）。
                    </p>
                  </button>
                </div>
                {!canSelectCompetition && (
                  <p className="text-[11px] text-[var(--accent-warning)]">
                    已達 {MAX_COMPETITION_HABITS} 項競賽習慣上限，可先將其他項目改為「個人成長」以維持公平性。
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--text-secondary)]">習慣名稱</label>
                <input
                  type="text"
                  maxLength={48}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例如：深度閱讀、早起、5公里跑步"
                  className="w-full h-11 px-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--text-secondary)]">圖示</label>
                <div className="grid grid-cols-9 gap-1.5">
                  {HABIT_ICONS.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setIcon(ic)}
                      className={`h-10 rounded-lg flex items-center justify-center transition-colors border cursor-pointer ${
                        icon === ic
                          ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] border-transparent'
                          : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <HabitIcon name={ic} className="w-4 h-4" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">分類</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as HabitCategory)}
                    className="w-full h-11 px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
                  >
                    {(Object.keys(CATEGORY_LABELS) as HabitCategory[]).map((cat) => (
                      <option key={cat} value={cat}>
                        {CATEGORY_LABELS[cat]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">難度積分（防刷分固定檔位）</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setXpReward(10)}
                      className={`h-11 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                        xpReward === 10
                          ? 'bg-[var(--control-active-bg)] text-[var(--control-active-fg)] border-transparent'
                          : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      一般 · 10 XP
                    </button>
                    <button
                      type="button"
                      onClick={() => setXpReward(20)}
                      className={`h-11 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                        xpReward === 20
                          ? 'bg-[var(--accent-warning-soft)] text-[var(--text-primary)] border-[var(--accent-warning)]/60 font-semibold'
                          : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      高難度 · 20 XP
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-[var(--text-secondary)]">打卡紀錄方式</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'check', label: '一鍵完成' },
                    { id: 'value', label: '數值目標' },
                    { id: 'time', label: '時間紀錄' },
                  ].map((rt) => (
                    <button
                      key={rt.id}
                      type="button"
                      onClick={() => {
                        setRecordType(rt.id as HabitRecordType);
                        if (rt.id === 'value' && unit === '次') setUnit('分鐘');
                        if (rt.id === 'time') setUnit('點');
                      }}
                      className={`h-10 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                        recordType === rt.id
                          ? 'bg-[var(--accent-primary-soft)] text-[var(--accent-primary)] border-[var(--accent-primary)]/40'
                          : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {rt.label}
                    </button>
                  ))}
                </div>
              </div>

              {recordType === 'value' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--text-secondary)]">目標數值</label>
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={targetValue}
                      onChange={(e) => setTargetValue(Number(e.target.value))}
                      className="w-full h-11 px-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm font-mono-tabular text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--text-secondary)]">單位（分鐘 / 公里 / ml）</label>
                    <input
                      type="text"
                      maxLength={16}
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      placeholder="分鐘"
                      className="w-full h-11 px-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                  </div>
                </div>
              )}

              {recordType === 'time' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--text-secondary)]">目標時間（如早起 07:30）</label>
                    <input
                      type="time"
                      value={targetTime}
                      onChange={(e) => setTargetTime(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm font-mono-tabular text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--text-secondary)]">標籤單位</label>
                    <input
                      type="text"
                      maxLength={16}
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      placeholder="起床 / 就寢"
                      className="w-full h-11 px-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">執行頻率</label>
                  <div className="flex items-center gap-1 bg-[var(--bg-subtle)] p-0.5 rounded-lg border border-[var(--border-hairline)]">
                    <button
                      type="button"
                      onClick={() => setFrequency('daily')}
                      className={`px-3 py-1 text-xs rounded-md transition-colors cursor-pointer ${
                        frequency === 'daily'
                          ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs font-medium'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      每日
                    </button>
                    <button
                      type="button"
                      onClick={() => setFrequency('weekly')}
                      className={`px-3 py-1 text-xs rounded-md transition-colors cursor-pointer ${
                        frequency === 'weekly'
                          ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs font-medium'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      指定星期
                    </button>
                  </div>
                </div>

                {frequency === 'weekly' && (
                  <div className="grid grid-cols-7 gap-1.5">
                    {WEEKDAY_LABELS.map((label, idx) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleDay(idx)}
                        className={`h-10 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                          targetDays.includes(idx)
                            ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] border-transparent'
                            : 'bg-[var(--bg-subtle)] text-[var(--text-muted)] border-[var(--border-hairline)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--text-secondary)]">提醒時間（選填）</label>
                <input
                  type="time"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-sm font-mono-tabular text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              <div className="space-y-2.5 pt-3 border-t border-[var(--border-hairline)]">
                <button
                  type="button"
                  onClick={() => setIsPublic((v) => !v)}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl bg-[var(--bg-subtle)]/75 border border-[var(--border-hairline)] hover:border-[var(--border-strong)] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 text-left">
                    {isPublic ? (
                      <Globe className="w-4 h-4 text-[var(--accent-primary)] shrink-0" strokeWidth={1.75} />
                    ) : (
                      <Lock className="w-4 h-4 text-[var(--text-muted)] shrink-0" strokeWidth={1.75} />
                    )}
                    <div>
                      <div className="text-sm font-medium text-[var(--text-primary)]">
                        {isPublic ? '公開給好友' : '僅自己可見（私人習慣）'}
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {isPublic ? '打卡完成後會同步至好友動態牆' : '不會出現在任何好友動態或個人公開頁'}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      backgroundColor: isPublic ? 'var(--accent-primary)' : 'var(--switch-off)',
                    }}
                    className="w-10 h-6 rounded-full p-0.5 transition-colors shrink-0"
                  >
                    <div
                      style={{ backgroundColor: 'var(--switch-knob)' }}
                      className={`w-5 h-5 rounded-full transition-transform ${
                        isPublic ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setRequirePhoto((v) => !v)}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl bg-[var(--bg-subtle)]/75 border border-[var(--border-hairline)] hover:border-[var(--border-strong)] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 text-left">
                    <Camera className="w-4 h-4 text-[var(--accent-warning)] shrink-0" strokeWidth={1.75} />
                    <div>
                      <div className="text-sm font-medium text-[var(--text-primary)]">打卡需要附上照片</div>
                      <div className="text-xs text-[var(--text-muted)]">自動標記為 Verified 已驗證紀錄</div>
                    </div>
                  </div>
                  <div
                    style={{
                      backgroundColor: requirePhoto ? 'var(--accent-warning)' : 'var(--switch-off)',
                    }}
                    className="w-10 h-6 rounded-full p-0.5 transition-colors shrink-0"
                  >
                    <div
                      style={{ backgroundColor: 'var(--switch-knob)' }}
                      className={`w-5 h-5 rounded-full transition-transform ${
                        requirePhoto ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </button>
              </div>
            </form>
          )}
        </div>

        {(mode === 'custom' || editingHabit) && (
          <div className="px-6 py-4 border-t border-[var(--border-hairline)] flex items-center gap-3 shrink-0 bg-[var(--bg-surface)]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-secondary)] text-sm font-medium hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              form="habit-form"
              disabled={submitting}
              className="flex-[1.5] h-11 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[var(--accent-primary-hover)] active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer"
            >
              <Check className="w-4 h-4" strokeWidth={1.75} />
              <span>{submitting ? '儲存中...' : editingHabit ? '儲存變更' : '建立習慣'}</span>
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
