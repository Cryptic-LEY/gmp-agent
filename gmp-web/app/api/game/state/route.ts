import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { userGameState, checkinLog } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { getRankByXp, getRankProgress, calcStreak, RANKS, STREAK_BONUS_XP } from '@/lib/gamification'

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { userId } = payload

  const existing = db.select().from(userGameState).where(eq(userGameState.userId, userId)).get()
  if (!existing) {
    db.insert(userGameState).values({ userId }).run()
  }

  const state = db.select().from(userGameState).where(eq(userGameState.userId, userId)).get()!
  const { newStreak, isFirstLoginToday } = calcStreak(state.lastLoginDate, state.streakDays)
  const today = new Date().toISOString().slice(0, 10)

  let newXp = state.xp
  if (isFirstLoginToday) {
    newXp += STREAK_BONUS_XP

    // 写入打卡历史（防重复）
    const already = db.select().from(checkinLog)
      .where(and(eq(checkinLog.userId, userId), eq(checkinLog.date, today)))
      .get()
    if (!already) {
      db.insert(checkinLog).values({ userId, date: today }).run()
    }
  }

  const rank = getRankByXp(newXp)
  const nextRank = RANKS.find(r => r.level === rank.level + 1) ?? null

  // 每日首次登录奖励积分（游戏货币，与 XP 互不换算）
  const newPoints = (state.points ?? 0) + (isFirstLoginToday ? 5 : 0)

  db.update(userGameState)
    .set({
      streakDays: newStreak,
      maxStreak: Math.max(state.maxStreak, newStreak),
      lastLoginDate: today,
      xp: newXp,
      points: newPoints,
      rankLevel: rank.level,
      rankTitle: rank.title,
    })
    .where(eq(userGameState.userId, userId))
    .run()

  return NextResponse.json({
    xp: newXp,
    points: newPoints,
    rankLevel: rank.level,
    rankTitle: rank.title,
    rankProgress: getRankProgress(newXp),
    xpToNext: nextRank ? nextRank.minXp - newXp : 0,
    streakDays: newStreak,
    maxStreak: Math.max(state.maxStreak, newStreak),
    streakBonusAwarded: isFirstLoginToday,
  })
}
