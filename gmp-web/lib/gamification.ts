export interface RankInfo {
  level: number
  title: string
  minXp: number
  maxXp: number // -1 表示满级
}

export const RANKS: RankInfo[] = [
  { level: 1,  title: 'GMP新人',   minXp: 0,     maxXp: 99    },
  { level: 2,  title: 'GMP学徒',   minXp: 100,   maxXp: 299   },
  { level: 3,  title: 'GMP助理',   minXp: 300,   maxXp: 599   },
  { level: 4,  title: 'GMP专员',   minXp: 600,   maxXp: 999   },
  { level: 5,  title: 'GMP工程师', minXp: 1000,  maxXp: 1499  },
  { level: 6,  title: 'GMP主管',   minXp: 1500,  maxXp: 2499  },
  { level: 7,  title: 'GMP经理',   minXp: 2500,  maxXp: 3999  },
  { level: 8,  title: 'GMP总监',   minXp: 4000,  maxXp: 6499  },
  { level: 9,  title: 'GMP专家',   minXp: 6500,  maxXp: 9999  },
  { level: 10, title: 'GMP大师',   minXp: 10000, maxXp: -1    },
]

// 不同题型答对给的 XP
export const XP_REWARDS: Record<string, number> = {
  '单选题': 10,
  '判断题': 10,
  '多选题': 15,
  '简答题': 20,
  '案例题': 25,
}

export const DAILY_CHECKIN_XP = 5
export const DAILY_CHECKIN_POINTS = 5
export const PROJECT_COMPLETION_BASE_XP = 120
export const FINAL_BOSS_COMPLETION_BASE_XP = 220
export const PROJECT_MEDAL_BONUS_XP: Record<'bronze' | 'silver' | 'gold', number> = {
  bronze: 20,
  silver: 45,
  gold: 80,
}
export const STREAK_MILESTONE_XP: Record<number, number> = {
  3: 50,
  7: 150,
  14: 300,
  30: 600,
}

export function getStreakMilestoneXp(streakDays: number): number {
  return STREAK_MILESTONE_XP[streakDays] ?? 0
}

export function getCheckinDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(date)
}

export function getRankByXp(xp: number): RankInfo {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (xp >= RANKS[i].minXp) return RANKS[i]
  }
  return RANKS[0]
}

// 返回当前等级进度 0~1
export function getRankProgress(xp: number): number {
  const rank = getRankByXp(xp)
  if (rank.maxXp === -1) return 1
  const range = rank.maxXp - rank.minXp + 1
  const earned = xp - rank.minXp
  return Math.min(earned / range, 1)
}

export function getProjectCompletionXp({
  finalBoss,
  medal,
  projectScore,
}: {
  finalBoss: boolean
  medal: 'bronze' | 'silver' | 'gold'
  projectScore: number
}): number {
  const baseXp = finalBoss ? FINAL_BOSS_COMPLETION_BASE_XP : PROJECT_COMPLETION_BASE_XP
  const scoreBonus = Math.max(0, Math.min(40, Math.floor((projectScore - 60) / 2)))
  return baseXp + PROJECT_MEDAL_BONUS_XP[medal] + scoreBonus
}

// 计算打卡 streak，返回新的 streakDays 和是否是今天首次登录
export function calcStreak(
  lastLoginDate: string | null,
  currentStreak: number,
  today = getCheckinDateKey(),
): { newStreak: number; isFirstLoginToday: boolean } {
  if (!lastLoginDate) {
    return { newStreak: 1, isFirstLoginToday: true }
  }
  if (lastLoginDate === today) {
    return { newStreak: currentStreak, isFirstLoginToday: false }
  }

  const yesterday = new Date(`${today}T00:00:00+08:00`)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const yesterdayStr = getCheckinDateKey(yesterday)

  if (lastLoginDate === yesterdayStr) {
    return { newStreak: currentStreak + 1, isFirstLoginToday: true }
  }

  // 断签，重置
  return { newStreak: 1, isFirstLoginToday: true }
}
