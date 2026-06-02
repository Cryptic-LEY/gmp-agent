import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import {
  DAILY_CHECKIN_POINTS,
  DAILY_CHECKIN_XP,
  RANKS,
  calcStreak,
  getCheckinDateKey,
  getRankByXp,
  getRankProgress,
  getStreakMilestoneXp,
} from '@/lib/gamification'

interface StoredGameState extends RowDataPacket {
  xp: number
  points: number
  rank_level: number
  rank_title: string
  streak_days: number
  max_streak: number
  last_login_date: string | null
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { userId } = payload
  const today = getCheckinDateKey()
  const connection = await db.$client.getConnection()

  try {
    await connection.beginTransaction()
    await connection.execute('INSERT IGNORE INTO user_game_state (user_id) VALUES (?)', [userId])

    const [states] = await connection.execute<StoredGameState[]>(`
      SELECT xp, points, rank_level, rank_title, streak_days, max_streak, last_login_date
      FROM user_game_state
      WHERE user_id = ?
      FOR UPDATE
    `, [userId])
    const state = states[0]
    if (!state) throw new Error('Unable to load game state')

    const { newStreak, isFirstLoginToday } = calcStreak(state.last_login_date, state.streak_days, today)
    let dailyXpAwarded = 0
    let dailyPointsAwarded = 0
    let milestoneXpAwarded = 0

    if (isFirstLoginToday) {
      dailyXpAwarded = DAILY_CHECKIN_XP
      dailyPointsAwarded = DAILY_CHECKIN_POINTS
      await connection.execute(
        'INSERT IGNORE INTO checkin_log (user_id, `date`) VALUES (?, ?)',
        [userId, today],
      )
    }

    const milestoneXp = getStreakMilestoneXp(newStreak)
    if (milestoneXp > 0) {
      const rewardKey = `streak:${newStreak}:${today}`
      const [claim] = await connection.execute<ResultSetHeader>(`
        INSERT IGNORE INTO game_reward_claims (user_id, reward_key, xp, points)
        VALUES (?, ?, ?, 0)
      `, [userId, rewardKey, milestoneXp])
      if (claim.affectedRows === 1) {
        milestoneXpAwarded = milestoneXp
      }
    }

    const newXp = state.xp + dailyXpAwarded + milestoneXpAwarded
    const newPoints = state.points + dailyPointsAwarded
    const rank = getRankByXp(newXp)
    const nextRank = RANKS.find(item => item.level === rank.level + 1) ?? null
    const maxStreak = Math.max(state.max_streak, newStreak)

    await connection.execute(`
      UPDATE user_game_state
      SET streak_days = ?, max_streak = ?, last_login_date = ?, xp = ?, points = ?,
          rank_level = ?, rank_title = ?
      WHERE user_id = ?
    `, [newStreak, maxStreak, today, newXp, newPoints, rank.level, rank.title, userId])

    await connection.commit()

    return NextResponse.json({
      xp: newXp,
      points: newPoints,
      rankLevel: rank.level,
      rankTitle: rank.title,
      rankProgress: getRankProgress(newXp),
      xpToNext: nextRank ? nextRank.minXp - newXp : 0,
      streakDays: newStreak,
      maxStreak,
      checkinXpAwarded: dailyXpAwarded + milestoneXpAwarded,
      dailyXpAwarded,
      milestoneXpAwarded,
      pointsAwarded: dailyPointsAwarded,
    })
  } catch (error) {
    await connection.rollback()
    console.error('load game state failed', error)
    return NextResponse.json({ error: '加载游戏状态失败' }, { status: 500 })
  } finally {
    connection.release()
  }
}
