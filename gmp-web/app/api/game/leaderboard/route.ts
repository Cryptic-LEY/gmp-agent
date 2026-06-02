import type { RowDataPacket } from 'mysql2'
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'

interface LeaderboardRow extends RowDataPacket {
  user_id: string
  display_name: string
  avatar_url: string | null
  school: string | null
  major: string | null
  xp: number
  points: number
  rank_level: number
  rank_title: string
  streak_days: number
  max_streak: number
  leaderboard_rank: number
}

function toEntry(row: LeaderboardRow) {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    school: row.school,
    major: row.major,
    xp: row.xp,
    points: row.points,
    rankLevel: row.rank_level,
    rankTitle: row.rank_title,
    streakDays: row.streak_days,
    maxStreak: row.max_streak,
    leaderboardRank: row.leaderboard_rank,
  }
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const limitParam = Number(req.nextUrl.searchParams.get('limit') ?? 10)
  const limit = Math.max(3, Math.min(30, Number.isFinite(limitParam) ? Math.floor(limitParam) : 10))

  const rows = await db.raw.all<LeaderboardRow>(`
    WITH ranked AS (
      SELECT
        u.user_id,
        COALESCE(NULLIF(u.real_name, ''), u.display_name) AS display_name,
        u.avatar_url,
        u.school,
        u.major,
        gs.xp,
        gs.points,
        gs.rank_level,
        gs.rank_title,
        gs.streak_days,
        gs.max_streak,
        ROW_NUMBER() OVER (
          ORDER BY gs.xp DESC, gs.points DESC, gs.max_streak DESC, u.created_at ASC, u.user_id ASC
        ) AS leaderboard_rank
      FROM user_game_state gs
      INNER JOIN users u ON u.user_id = gs.user_id
      WHERE u.role = 'student'
    )
    SELECT *
    FROM ranked
    WHERE leaderboard_rank <= ? OR user_id = ?
    ORDER BY leaderboard_rank ASC
  `, [limit, payload.userId])

  const entries = rows.filter(row => row.leaderboard_rank <= limit).map(toEntry)
  const currentUser = rows.find(row => row.user_id === payload.userId)

  return NextResponse.json({
    entries,
    currentUser: currentUser ? toEntry(currentUser) : null,
  })
}
