import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { userGameState } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getRankByXp, XP_REWARDS } from '@/lib/gamification'

// 答题后调用：POST { questionType, correct }
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { userId } = payload
  const body = await req.json()
  const { questionType, correct } = body as { questionType: string; correct: boolean }

  if (!correct) {
    return NextResponse.json({ xpGained: 0, message: '答错不扣分，继续加油' })
  }

  const xpGained = XP_REWARDS[questionType] ?? 10

  const state = (await db.select().from(userGameState).where(eq(userGameState.userId, userId)).limit(1))[0]
  if (!state) return NextResponse.json({ error: 'Game state not found' }, { status: 404 })

  const newXp = state.xp + xpGained
  const oldRank = getRankByXp(state.xp)
  const newRank = getRankByXp(newXp)
  const leveledUp = newRank.level > oldRank.level

  await db.update(userGameState)
    .set({
      xp: newXp,
      rankLevel: newRank.level,
      rankTitle: newRank.title,
    })
    .where(eq(userGameState.userId, userId))
    .execute()

  return NextResponse.json({
    xpGained,
    newXp,
    rankLevel: newRank.level,
    rankTitle: newRank.title,
    leveledUp,
    ...(leveledUp && { message: `恭喜晋升：${newRank.title}！` }),
  })
}
