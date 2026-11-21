import { ChallengeTemplate, HabitCategory, HabitTemplate, TeamGoalType } from '../types';

export const MAX_COMPETITION_HABITS = 5;

export const COMPETITION_WEIGHTS = {
  consistency: 60,
  goalAttainment: 25,
  stability: 15,
} as const;

export const TEAM_GOAL_TYPE_LABELS: Record<
  TeamGoalType,
  { label: string; unit: string; defaultTarget: number }
> = {
  total_completions: { label: '累積習慣完成次數', unit: '次', defaultTarget: 30 },
  total_workouts: { label: '累積運動次數', unit: '次', defaultTarget: 20 },
  total_reading_mins: { label: '累積閱讀時間', unit: '分鐘', defaultTarget: 600 },
  team_completion_rate: { label: '團隊達標次數', unit: '次', defaultTarget: 40 },
};

export const CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  {
    key: 'early_bird',
    title: 'Early Bird 早起挑戰',
    subtitle: '7 天內於 08:00 前起床，比較有效達標次數',
    habitTitle: '早起',
    habitIcon: 'sun',
    recordType: 'time',
    targetValue: 1,
    targetTime: '08:00',
    dailyCap: 1,
    unit: '起床',
    days: 7,
    ruleType: 'most_completions',
    scoringMethod: 'valid_count',
    xpPrize: 100,
  },
  {
    key: 'reading_battle',
    title: 'Reading Battle 閱讀挑戰',
    subtitle: '7 天累積閱讀 300 分鐘，每日計入上限 60 分鐘',
    habitTitle: '閱讀',
    habitIcon: 'book-open',
    recordType: 'value',
    targetValue: 30,
    dailyCap: 60,
    unit: '分鐘',
    days: 7,
    ruleType: 'most_completions',
    scoringMethod: 'capped_total_value',
    xpPrize: 120,
  },
  {
    key: 'workout_challenge',
    title: 'Workout Challenge 健身挑戰',
    subtitle: '7 天訓練累積有效分鐘，每日上限 90 分鐘',
    habitTitle: '重訓',
    habitIcon: 'dumbbell',
    recordType: 'value',
    targetValue: 45,
    dailyCap: 90,
    unit: '分鐘',
    days: 7,
    ruleType: 'most_completions',
    scoringMethod: 'capped_total_value',
    xpPrize: 120,
  },
  {
    key: 'learning_challenge',
    title: 'Learning Challenge 學習挑戰',
    subtitle: '7 天每日深度學習，比較有效累積分鐘數',
    habitTitle: '程式學習',
    habitIcon: 'code',
    recordType: 'value',
    targetValue: 45,
    dailyCap: 90,
    unit: '分鐘',
    days: 7,
    ruleType: 'most_completions',
    scoringMethod: 'capped_total_value',
    xpPrize: 120,
  },
  {
    key: 'consistency_challenge',
    title: 'Consistency Challenge 連續完成挑戰',
    subtitle: '14 天維持穩定完成率，比較達標比率',
    habitTitle: '完成每日任務',
    habitIcon: 'target',
    recordType: 'check',
    targetValue: 1,
    dailyCap: 1,
    unit: '次',
    days: 14,
    ruleType: 'highest_rate',
    scoringMethod: 'completion_rate',
    xpPrize: 150,
  },
];

export interface TitleDefinition {
  key: 'Beginner' | 'Disciplined' | 'Consistent' | 'Dedicated' | 'Elite' | 'Master';
  label: string;
  zhLabel: string;
  minLevel: number;
  maxLevel?: number;
  description: string;
}

export const TITLES_CATALOG: TitleDefinition[] = [
  {
    key: 'Beginner',
    label: 'Beginner',
    zhLabel: '啟程者',
    minLevel: 1,
    maxLevel: 3,
    description: '建立初步自我提升節律，完成最初幾週的連續打卡。',
  },
  {
    key: 'Disciplined',
    label: 'Disciplined',
    zhLabel: '自律踐行者',
    minLevel: 4,
    maxLevel: 7,
    description: '已將關鍵日常習慣融入生活，具備穩定執行能力。',
  },
  {
    key: 'Consistent',
    label: 'Consistent',
    zhLabel: '穩定節律者',
    minLevel: 8,
    maxLevel: 12,
    description: '能長期維持高完成率，在每週賽季中保持穩定表現。',
  },
  {
    key: 'Dedicated',
    label: 'Dedicated',
    zhLabel: '專注深耕者',
    minLevel: 13,
    maxLevel: 19,
    description: '長期深耕多項自我提升目標並帶動身邊夥伴前進。',
  },
  {
    key: 'Elite',
    label: 'Elite',
    zhLabel: '卓越領航者',
    minLevel: 20,
    maxLevel: 29,
    description: '少數達成長期高紀律水準的領先實踐者。',
  },
  {
    key: 'Master',
    label: 'Master',
    zhLabel: '大師境界',
    minLevel: 30,
    description: '自律已成為第二天性，持續以行動影響整個社群圈。',
  },
];

export function getTitleForLevel(level: number): TitleDefinition {
  for (let i = TITLES_CATALOG.length - 1; i >= 0; i--) {
    if (level >= TITLES_CATALOG[i].minLevel) return TITLES_CATALOG[i];
  }
  return TITLES_CATALOG[0];
}

export const CATEGORY_LABELS: Record<HabitCategory, string> = {
  life: '生活',
  fitness: '運動',
  learning: '學習',
  work: '工作',
  finance: '財務',
  custom: '自訂',
};

export const HABIT_ICONS = [
  'sun',
  'moon',
  'sparkles',
  'droplets',
  'dumbbell',
  'heart-pulse',
  'footprints',
  'bike',
  'book-open',
  'languages',
  'code',
  'target',
  'check-circle',
  'wallet',
  'trending-up',
  'flame',
  'clock',
  'pen-tool',
] as const;

export const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

export const HABIT_TEMPLATES: HabitTemplate[] = [
  // 生活
  {
    key: 'wake_up',
    title: '早起',
    icon: 'sun',
    category: 'life',
    frequency: 'daily',
    targetDays: [0, 1, 2, 3, 4, 5, 6],
    recordType: 'time',
    targetValue: 1,
    targetTime: '07:30',
    unit: '起床',
    xpReward: 20,
    description: '記錄每日清醒時間，維持穩定生理時鐘',
  },
  {
    key: 'sleep_early',
    title: '早睡',
    icon: 'moon',
    category: 'life',
    frequency: 'daily',
    targetDays: [0, 1, 2, 3, 4, 5, 6],
    recordType: 'time',
    targetValue: 1,
    targetTime: '23:00',
    unit: '就寢',
    xpReward: 20,
    description: '於目標時間前就寢，確保深度修復睡眠',
  },
  {
    key: 'tidy_room',
    title: '整理房間',
    icon: 'sparkles',
    category: 'life',
    frequency: 'daily',
    targetDays: [0, 1, 2, 3, 4, 5, 6],
    recordType: 'check',
    targetValue: 1,
    unit: '次',
    xpReward: 10,
    description: '維持桌面與生活空間整潔有序',
  },
  {
    key: 'drink_water',
    title: '喝水',
    icon: 'droplets',
    category: 'life',
    frequency: 'daily',
    targetDays: [0, 1, 2, 3, 4, 5, 6],
    recordType: 'value',
    targetValue: 2000,
    unit: 'ml',
    xpReward: 10,
    description: '補充每日基礎水分攝取目標',
  },

  // 運動
  {
    key: 'strength_training',
    title: '重訓',
    icon: 'dumbbell',
    category: 'fitness',
    frequency: 'weekly',
    targetDays: [1, 3, 5],
    recordType: 'value',
    targetValue: 60,
    unit: '分鐘',
    xpReward: 20,
    description: '肌力與複合動作訓練，記錄有效訓練時長',
  },
  {
    key: 'cardio',
    title: '有氧',
    icon: 'heart-pulse',
    category: 'fitness',
    frequency: 'weekly',
    targetDays: [2, 4, 6],
    recordType: 'value',
    targetValue: 30,
    unit: '分鐘',
    xpReward: 10,
    description: '維持心肺區間訓練提升基礎代謝',
  },
  {
    key: 'running',
    title: '跑步',
    icon: 'footprints',
    category: 'fitness',
    frequency: 'weekly',
    targetDays: [2, 4, 6],
    recordType: 'value',
    targetValue: 5,
    unit: '公里',
    xpReward: 20,
    description: '戶外或跑道耐力跑，記錄累積距離',
  },
  {
    key: 'cycling',
    title: '騎車',
    icon: 'bike',
    category: 'fitness',
    frequency: 'weekly',
    targetDays: [0, 6],
    recordType: 'value',
    targetValue: 15,
    unit: '公里',
    xpReward: 20,
    description: '公路或室內飛輪騎行訓練',
  },

  // 學習
  {
    key: 'reading',
    title: '閱讀',
    icon: 'book-open',
    category: 'learning',
    frequency: 'daily',
    targetDays: [0, 1, 2, 3, 4, 5, 6],
    recordType: 'value',
    targetValue: 30,
    unit: '分鐘',
    xpReward: 10,
    description: '每日深度閱讀，累積知識複利',
  },
  {
    key: 'english',
    title: '英文學習',
    icon: 'languages',
    category: 'learning',
    frequency: 'daily',
    targetDays: [1, 2, 3, 4, 5],
    recordType: 'value',
    targetValue: 20,
    unit: '分鐘',
    xpReward: 10,
    description: '聽說讀寫輸入或單字練習',
  },
  {
    key: 'coding',
    title: '程式學習',
    icon: 'code',
    category: 'learning',
    frequency: 'daily',
    targetDays: [1, 2, 3, 4, 5],
    recordType: 'value',
    targetValue: 45,
    unit: '分鐘',
    xpReward: 20,
    description: '演算法、系統架構或技術實作練習',
  },

  // 工作
  {
    key: 'deep_work',
    title: '專注工作',
    icon: 'target',
    category: 'work',
    frequency: 'weekly',
    targetDays: [1, 2, 3, 4, 5],
    recordType: 'value',
    targetValue: 90,
    unit: '分鐘',
    xpReward: 20,
    description: '無干擾深度工作時段，推進高價值任務',
  },
  {
    key: 'daily_tasks',
    title: '完成每日任務',
    icon: 'check-circle',
    category: 'work',
    frequency: 'weekly',
    targetDays: [1, 2, 3, 4, 5],
    recordType: 'check',
    targetValue: 1,
    unit: '次',
    xpReward: 10,
    description: '結清當日核心代辦事項與進度交付',
  },

  // 財務
  {
    key: 'bookkeeping',
    title: '記帳',
    icon: 'wallet',
    category: 'finance',
    frequency: 'daily',
    targetDays: [0, 1, 2, 3, 4, 5, 6],
    recordType: 'check',
    targetValue: 1,
    unit: '次',
    xpReward: 10,
    description: '追蹤每日現金流與消費分類',
  },
  {
    key: 'investment_research',
    title: '投資研究',
    icon: 'trending-up',
    category: 'finance',
    frequency: 'weekly',
    targetDays: [1, 3, 5],
    recordType: 'value',
    targetValue: 20,
    unit: '分鐘',
    xpReward: 20,
    description: '閱讀財報、總經數據與資產配置檢視',
  },
];

export interface BadgeDefinition {
  key: string;
  title: string;
  description: string;
  requirementText: string;
}

export const ACHIEVEMENT_CATALOG: BadgeDefinition[] = [
  {
    key: 'first_step',
    title: 'First Step',
    description: '完成人生第一次習慣打卡，開啟自律飛輪。',
    requirementText: '完成 1 次習慣打卡',
  },
  {
    key: 'early_bird',
    title: 'Early Bird',
    description: '連續 7 天完成「早起」習慣紀錄。',
    requirementText: '早起連續打卡 7 天',
  },
  {
    key: 'bookworm',
    title: 'Bookworm',
    description: '累積閱讀時數達 100 小時（6,000 分鐘）。',
    requirementText: '累積閱讀 6,000 分鐘',
  },
  {
    key: 'consistency_30',
    title: 'Consistency',
    description: '達成連續打卡 30 天不中斷里程碑。',
    requirementText: '連續打卡 30 天',
  },
  {
    key: 'champion_5',
    title: 'Champion',
    description: '在 1 VS 1 好友挑戰中贏得 5 場勝利。',
    requirementText: '贏得 5 場好友挑戰',
  },
  {
    key: 'team_player',
    title: 'Team Architect',
    description: '與團隊夥伴合力達成團隊共同挑戰目標並滿足個人最低貢獻。',
    requirementText: '完成 1 次團隊挑戰並達標',
  },
  {
    key: 'improvement_30',
    title: 'Improvement',
    description: '每週習慣完成率較前一週提升 30 個百分點以上。',
    requirementText: '週完成率提升 >= 30%',
  },
  {
    key: 'league_champion',
    title: 'Season Champion',
    description: '於 Weekly League 週賽季結算奪得第一名。',
    requirementText: '週賽季結算第 1 名',
  },
  {
    key: 'league_podium',
    title: 'Season Podium',
    description: '於 Weekly League 週賽季結算進入前三名。',
    requirementText: '週賽季結算前 3 名',
  },
  {
    key: 'most_improved',
    title: 'Breakthrough',
    description: '於 Weekly League 週賽季奪得最高進步幅度獎。',
    requirementText: '週賽季最佳進步幅度',
  },
  {
    key: 'referral_mentor',
    title: 'Better Together',
    description: '成功邀請好友加入並完成首次有效打卡。',
    requirementText: '好友完成首次有效打卡',
  },
  {
    key: 'centurion',
    title: 'Centurion',
    description: '全習慣累積完成達 100 次打卡紀錄。',
    requirementText: '累積 100 次打卡紀錄',
  },
];

export function levelFromXp(xp: number): number {
  let lvl = 1;
  while (xp >= xpRequiredForLevel(lvl + 1)) {
    lvl++;
  }
  return lvl;
}

export function xpRequiredForLevel(level: number): number {
  if (level <= 1) return 0;
  return 50 * (level - 1) * level;
}
