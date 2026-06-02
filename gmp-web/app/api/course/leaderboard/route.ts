import { NextRequest, NextResponse } from 'next/server'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { courseStudyLogs, moduleScores, userGameState, users } from '@/db/schema'
import { verifyToken } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { userId } = payload
  const [me] = await db.select().from(users).where(eq(users.userId, userId)).limit(1)
  if (!me) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  let classmates: typeof me[] = []
  if (me.className && me.school) {
    classmates = await db.select().from(users)
      .where(and(eq(users.school, me.school), eq(users.className, me.className)))
  } else if (me.school) {
    classmates = await db.select().from(users).where(eq(users.school, me.school))
  } else {
    classmates = await db.select().from(users).where(eq(users.orgId, me.orgId))
  }

  const allScores = await db.select().from(moduleScores)
  const scoresByUser = new Map<string, Map<string, typeof allScores[number]>>()
  for (const score of allScores) {
    const byModule = scoresByUser.get(score.userId) ?? new Map<string, typeof score>()
    const existing = byModule.get(score.trainingId)
    if (!existing || score.completedAt > existing.completedAt) {
      byModule.set(score.trainingId, score)
    }
    scoresByUser.set(score.userId, byModule)
  }

  const studyAgg = await db.select({
    userId: courseStudyLogs.userId,
    seconds: sql<number>`COALESCE(SUM(${courseStudyLogs.seconds}), 0)`.as('seconds'),
  }).from(courseStudyLogs).groupBy(courseStudyLogs.userId)
  const studyMap = new Map(studyAgg.map(row => [row.userId, Number(row.seconds) || 0]))

  const gameRows = await db.select().from(userGameState)
  const gameMap = new Map(gameRows.map(row => [row.userId, row]))

  const ranking = classmates.map(user => {
    const userScores = scoresByUser.get(user.userId) ?? new Map<string, typeof allScores[number]>()
    let totalEarnedHours = 0
    let completedChapters = 0
    for (const score of userScores.values()) {
      totalEarnedHours += score.earnedHours
      if (score.score >= 60) completedChapters += 1
    }

    return {
      userId: user.userId,
      displayName: user.displayName,
      realName: user.realName ?? '',
      avatar: user.displayName?.[0] ?? '同',
      totalEarnedHours: Number(totalEarnedHours.toFixed(2)),
      completedChapters,
      studyMinutes: Math.round((studyMap.get(user.userId) ?? 0) / 60),
      xp: gameMap.get(user.userId)?.xp ?? 0,
      rankTitle: gameMap.get(user.userId)?.rankTitle ?? 'GMP新人',
      isMe: user.userId === userId,
    }
  })

  ranking.sort((left, right) => {
    if (right.totalEarnedHours !== left.totalEarnedHours) return right.totalEarnedHours - left.totalEarnedHours
    if (right.completedChapters !== left.completedChapters) return right.completedChapters - left.completedChapters
    if (right.studyMinutes !== left.studyMinutes) return right.studyMinutes - left.studyMinutes
    return right.xp - left.xp
  })

  return NextResponse.json({
    scope: me.className && me.school ? '本班' : me.school ? '本校' : '全平台',
    className: me.className,
    school: me.school,
    total: ranking.length,
    myRank: ranking.findIndex(row => row.isMe) + 1,
    list: ranking.slice(0, 20),
  })
}
