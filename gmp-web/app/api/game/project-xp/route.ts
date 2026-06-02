import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { RANKS, getProjectCompletionXp, getRankByXp, getRankProgress } from '@/lib/gamification'

type ProjectMedalPayload = 'bronze' | 'silver' | 'gold'

interface StoredGameState extends RowDataPacket {
  xp: number
  points: number
  rank_level: number
  rank_title: string
}

function isProjectMedal(value: unknown): value is ProjectMedalPayload {
  return value === 'bronze' || value === 'silver' || value === 'gold'
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const body = await req.json() as {
    projectId?: number
    projectTitle?: string
    medal?: unknown
    projectScore?: number
    finalBoss?: boolean
  }

  const projectId = Number(body.projectId)
  const projectScore = Number(body.projectScore)
  if (!Number.isInteger(projectId) || projectId <= 0 || !isProjectMedal(body.medal) || !Number.isFinite(projectScore)) {
    return NextResponse.json({ error: 'Invalid project reward payload' }, { status: 400 })
  }

  const { userId } = payload
  const finalBoss = Boolean(body.finalBoss)
  const xpGained = getProjectCompletionXp({ finalBoss, medal: body.medal, projectScore })
  const rewardKey = `simulation:project:${projectId}:completion`
  const connection = await db.$client.getConnection()

  try {
    await connection.beginTransaction()
    await connection.execute('INSERT IGNORE INTO user_game_state (user_id) VALUES (?)', [userId])

    const [states] = await connection.execute<StoredGameState[]>(`
      SELECT xp, points, rank_level, rank_title
      FROM user_game_state
      WHERE user_id = ?
      FOR UPDATE
    `, [userId])
    const state = states[0]
    if (!state) throw new Error('Unable to load game state')

    const [claim] = await connection.execute<ResultSetHeader>(`
      INSERT IGNORE INTO game_reward_claims (user_id, reward_key, xp, points)
      VALUES (?, ?, ?, 0)
    `, [userId, rewardKey, xpGained])

    const alreadyClaimed = claim.affectedRows !== 1
    const newXp = alreadyClaimed ? state.xp : state.xp + xpGained
    const oldRank = getRankByXp(state.xp)
    const newRank = getRankByXp(newXp)
    const nextRank = RANKS.find(item => item.level === newRank.level + 1) ?? null

    if (!alreadyClaimed) {
      await connection.execute(`
        UPDATE user_game_state
        SET xp = ?, rank_level = ?, rank_title = ?
        WHERE user_id = ?
      `, [newXp, newRank.level, newRank.title, userId])
    }

    await connection.commit()

    return NextResponse.json({
      xpGained: alreadyClaimed ? 0 : xpGained,
      rewardXp: xpGained,
      alreadyClaimed,
      newXp,
      rankLevel: newRank.level,
      rankTitle: newRank.title,
      rankProgress: getRankProgress(newXp),
      xpToNext: nextRank ? nextRank.minXp - newXp : 0,
      leveledUp: !alreadyClaimed && newRank.level > oldRank.level,
      message: alreadyClaimed
        ? '该项目 XP 已领取'
        : `${body.projectTitle || `项目${projectId}`}完成，获得 +${xpGained} XP`,
    })
  } catch (error) {
    await connection.rollback()
    console.error('claim project xp failed', error)
    return NextResponse.json({ error: '项目 XP 发放失败' }, { status: 500 })
  } finally {
    connection.release()
  }
}
