import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { users, moduleScores, courseStudyLogs, userGameState } from '@/db/schema'
import { eq, sql, and } from 'drizzle-orm'

// GET /api/course/leaderboard
// 返回与当前用户同班的学习排行榜
// 排序依据：总课时分 + 学习时长（次要）
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  const { userId } = payload

  const me = db.select().from(users).where(eq(users.userId, userId)).get()
  if (!me) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // 同班级用户（无班级则取同学校；都没有则按 orgId）
  let classmates: typeof me[] = []
  if (me.className && me.school) {
    classmates = db.select().from(users)
      .where(and(eq(users.school, me.school), eq(users.className, me.className))).all()
  } else if (me.school) {
    classmates = db.select().from(users).where(eq(users.school, me.school)).all()
  } else {
    classmates = db.select().from(users).where(eq(users.orgId, me.orgId)).all()
  }

  // 每人取最新模块成绩（按 training_id 各取最新一条）
  const allScores = db.select().from(moduleScores).all()
  const scoresByUser = new Map<string, Map<string, typeof allScores[0]>>()
  // 假设 completedAt 是 ISO 字符串，可以字符串比较
  for (const s of allScores) {
    const byUser = scoresByUser.get(s.userId) ?? new Map()
    const existing = byUser.get(s.trainingId)
    if (!existing || s.completedAt > existing.completedAt) {
      byUser.set(s.trainingId, s)
    }
    scoresByUser.set(s.userId, byUser)
  }

  // 每人学习时长
  const studyAgg = db.select({
    userId: courseStudyLogs.userId,
    seconds: sql<number>`SUM(${courseStudyLogs.seconds})`.as('seconds'),
  }).from(courseStudyLogs).groupBy(courseStudyLogs.userId).all()
  const studyMap = new Map(studyAgg.map(r => [r.userId, Number(r.seconds) || 0]))

  // 每人游戏状态
  const gameRows = db.select().from(userGameState).all()
  const gameMap = new Map(gameRows.map(g => [g.userId, g]))

  // 装配
  const ranking = classmates.map(u => {
    const userScores = scoresByUser.get(u.userId) ?? new Map()
    let totalEarnedHours = 0
    let completedChapters = 0
    for (const s of userScores.values()) {
      totalEarnedHours += s.earnedHours
      if (s.score >= 60) completedChapters++
    }
    return {
      userId: u.userId,
      displayName: u.displayName,
      realName: u.realName ?? '',
      avatar: u.displayName?.[0] ?? '同',
      totalEarnedHours: parseFloat(totalEarnedHours.toFixed(2)),
      completedChapters,
      studyMinutes: Math.round((studyMap.get(u.userId) ?? 0) / 60),
      xp: gameMap.get(u.userId)?.xp ?? 0,
      rankTitle: gameMap.get(u.userId)?.rankTitle ?? 'GMP新人',
      isMe: u.userId === userId,
    }
  })

  ranking.sort((a, b) => {
    if (b.totalEarnedHours !== a.totalEarnedHours) return b.totalEarnedHours - a.totalEarnedHours
    if (b.completedChapters !== a.completedChapters) return b.completedChapters - a.completedChapters
    if (b.studyMinutes !== a.studyMinutes) return b.studyMinutes - a.studyMinutes
    return b.xp - a.xp
  })

  const myRank = ranking.findIndex(r => r.isMe) + 1

  return NextResponse.json({
    scope: me.className && me.school ? '本班' : me.school ? '本校' : '全平台',
    className: me.className,
    school: me.school,
    total: ranking.length,
    myRank,
    list: ranking.slice(0, 20),                       // Top 20
  })
}
