import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import {
  trainingProjects, moduleScores, learningPlans, knowledgePoints,
  kpMastery, courseStudyLogs, users,
} from '@/db/schema'
import { eq, desc, and, sql } from 'drizzle-orm'

const TARGET_HOURS: Record<string, number> = { college: 48, undergraduate: 54 }

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  const { userId } = payload

  // 1. 学历推断
  const latestPlan = db.select().from(learningPlans)
    .where(eq(learningPlans.userId, userId))
    .orderBy(desc(learningPlans.createdAt)).limit(1).get()
  const eduLevel: 'college' | 'undergraduate' = (latestPlan?.eduLevel as 'college' | 'undergraduate') || 'college'

  // 2. 用户信息
  const user = db.select().from(users).where(eq(users.userId, userId)).get()

  // 3. 11 个项目
  const projects = db.select().from(trainingProjects).all()

  // 4. 每模块最新成绩
  const allScores = db.select().from(moduleScores)
    .where(eq(moduleScores.userId, userId))
    .orderBy(desc(moduleScores.completedAt)).all()
  const latestByModule = new Map<string, typeof allScores[0]>()
  for (const s of allScores) {
    if (!latestByModule.has(s.trainingId)) latestByModule.set(s.trainingId, s)
  }

  // 5. 用户掌握度 + 各项目知识点数
  const masteryRows = db.select().from(kpMastery).where(eq(kpMastery.userId, userId)).all()
  const masteryMap = new Map(masteryRows.map(m => [m.kpId, m]))

  const allKps = db.select().from(knowledgePoints).all()

  // 6. 学习时长汇总（按 trainingId）
  const studyAgg = db.select({
    trainingId: courseStudyLogs.trainingId,
    seconds: sql<number>`SUM(${courseStudyLogs.seconds})`.as('seconds'),
  }).from(courseStudyLogs)
    .where(eq(courseStudyLogs.userId, userId))
    .groupBy(courseStudyLogs.trainingId)
    .all()
  const studyMap = new Map(studyAgg.map(r => [r.trainingId, Number(r.seconds) || 0]))

  // 7. 装配章节数据
  const totalProjectHours = projects.reduce((sum, p) =>
    sum + (eduLevel === 'undergraduate' ? (p.hoursUg ?? 0) : (p.hoursCollege ?? 0)), 0)
  const targetTotal = TARGET_HOURS[eduLevel] ?? 48

  const chapters = projects.sort((a, b) => a.seqOrder - b.seqOrder).map(p => {
    const projName = eduLevel === 'undergraduate' ? p.kpProjUg : p.kpProjCol
    const kpsInChapter = projName
      ? allKps.filter(kp => kp.projectName === projName && kp.eduLevel === (eduLevel === 'undergraduate' ? '本科' : '专科'))
      : []
    const totalKps = kpsInChapter.length

    let mastered = 0, learning = 0, weak = 0, untested = 0
    for (const kp of kpsInChapter) {
      const m = masteryMap.get(kp.kpId)
      if (!m || m.attemptCount === 0) untested++
      else if (m.confidence >= 0.8) mastered++
      else if (m.confidence >= 0.5) learning++
      else weak++
    }

    const masteryPct = totalKps > 0
      ? Math.round((mastered + learning * 0.6) / totalKps * 100)
      : 0

    const projHours = eduLevel === 'undergraduate' ? (p.hoursUg ?? 0) : (p.hoursCollege ?? 0)
    const maxHours = totalProjectHours > 0
      ? parseFloat(((projHours / totalProjectHours) * targetTotal).toFixed(2))
      : 0
    const score = latestByModule.get(p.trainingId)
    const studySeconds = studyMap.get(p.trainingId) ?? 0

    // 章节状态：未学 / 学习中 / 已完成
    let status: 'locked' | 'untouched' | 'in_progress' | 'completed' = 'untouched'
    if (score && score.score >= 60) status = 'completed'
    else if (masteryPct > 0 || studySeconds > 0 || score) status = 'in_progress'

    return {
      trainingId: p.trainingId,
      displayName: p.displayName,
      seqOrder: p.seqOrder,
      hours: projHours,
      maxScoreHours: maxHours,
      status,
      totalKps,
      mastered, learning, weak, untested,
      masteryPct,
      latestScore: score?.score ?? null,
      earnedHours: score?.earnedHours ?? null,
      studyMinutes: Math.round(studySeconds / 60),
      completedAt: score?.completedAt ?? null,
    }
  })

  // 8. 总览统计
  const totalEarnedHours = chapters.reduce((s, c) => s + (c.earnedHours ?? 0), 0)
  const completedChapters = chapters.filter(c => c.status === 'completed').length
  const inProgressChapters = chapters.filter(c => c.status === 'in_progress').length
  const totalStudyMinutes = chapters.reduce((s, c) => s + c.studyMinutes, 0)

  // 9. 本周学习时长（最近7天）
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const weekStudy = db.select({
    seconds: sql<number>`COALESCE(SUM(${courseStudyLogs.seconds}), 0)`.as('seconds'),
  }).from(courseStudyLogs)
    .where(and(eq(courseStudyLogs.userId, userId), sql`${courseStudyLogs.loggedAt} >= ${weekAgo}`))
    .get()
  const weekMinutes = Math.round((Number(weekStudy?.seconds) || 0) / 60)

  // 10. 个性化推荐：取学习方案里 high priority 的前 3 章节
  let recommendations: { trainingId: string; displayName: string; reason: string }[] = []
  if (latestPlan?.planData) {
    try {
      const planItems = JSON.parse(latestPlan.planData) as Array<{ project_name: string; priority: string; reason: string }>
      const highItems = planItems.filter(i => i.priority === 'high').slice(0, 3)
      recommendations = highItems.map(item => {
        // 试图匹配 trainingId
        const matched = projects.find(p =>
          item.project_name.includes(p.displayName) ||
          (p.kpProjUg && item.project_name.includes(p.kpProjUg)) ||
          (p.kpProjCol && item.project_name.includes(p.kpProjCol))
        )
        return {
          trainingId: matched?.trainingId ?? '',
          displayName: matched?.displayName ?? item.project_name,
          reason: item.reason,
        }
      }).filter(r => r.trainingId)
    } catch { /* ignore */ }
  }

  return NextResponse.json({
    user: {
      displayName: user?.displayName ?? '同学',
      eduLevel,
      major: latestPlan?.major ?? user?.major ?? '',
      className: user?.className ?? '',
    },
    summary: {
      totalChapters: chapters.length,
      completedChapters,
      inProgressChapters,
      totalStudyMinutes,
      weekStudyMinutes: weekMinutes,
      totalEarnedHours: parseFloat(totalEarnedHours.toFixed(2)),
      totalMaxHours: targetTotal,
    },
    recommendations,
    chapters,
  })
}
