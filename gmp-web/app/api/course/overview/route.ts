import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  courseStudyLogs,
  knowledgePoints,
  kpMastery,
  learningPlans,
  moduleScores,
  trainingProjects,
  users,
} from '@/db/schema'
import { verifyToken } from '@/lib/auth'

const TARGET_HOURS: Record<string, number> = { college: 48, undergraduate: 54 }

function toMysqlDateTime(date: Date) {
  return date.toISOString().slice(0, 23).replace('T', ' ')
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { userId } = payload

  const [latestPlan] = await db.select().from(learningPlans)
    .where(eq(learningPlans.userId, userId))
    .orderBy(desc(learningPlans.createdAt))
    .limit(1)
  const eduLevel: 'college' | 'undergraduate' =
    latestPlan?.eduLevel === 'undergraduate' ? 'undergraduate' : 'college'
  const eduCn = eduLevel === 'undergraduate' ? '本科' : '专科'

  const [user] = await db.select().from(users).where(eq(users.userId, userId)).limit(1)
  const projects = await db.select().from(trainingProjects)
  const allScores = await db.select().from(moduleScores)
    .where(eq(moduleScores.userId, userId))
    .orderBy(desc(moduleScores.completedAt))
  const masteryRows = await db.select().from(kpMastery).where(eq(kpMastery.userId, userId))
  const allKps = await db.select().from(knowledgePoints)
  const studyAgg = await db.select({
    trainingId: courseStudyLogs.trainingId,
    seconds: sql<number>`COALESCE(SUM(${courseStudyLogs.seconds}), 0)`.as('seconds'),
  }).from(courseStudyLogs)
    .where(eq(courseStudyLogs.userId, userId))
    .groupBy(courseStudyLogs.trainingId)

  const latestByModule = new Map<string, typeof allScores[number]>()
  for (const score of allScores) {
    if (!latestByModule.has(score.trainingId)) latestByModule.set(score.trainingId, score)
  }

  const masteryMap = new Map(masteryRows.map(row => [row.kpId, row]))
  const studyMap = new Map(studyAgg.map(row => [row.trainingId, Number(row.seconds) || 0]))
  const totalProjectHours = projects.reduce(
    (sum, project) => sum + (eduLevel === 'undergraduate' ? (project.hoursUg ?? 0) : (project.hoursCollege ?? 0)),
    0,
  )
  const targetTotal = TARGET_HOURS[eduLevel] ?? 48

  const chapters = [...projects].sort((left, right) => left.seqOrder - right.seqOrder).map(project => {
    const projectName = eduLevel === 'undergraduate' ? project.kpProjUg : project.kpProjCol
    const kpsInChapter = projectName
      ? allKps.filter(kp => kp.projectName === projectName && kp.eduLevel === eduCn)
      : []

    let mastered = 0
    let learning = 0
    let weak = 0
    let untested = 0
    for (const kp of kpsInChapter) {
      const mastery = masteryMap.get(kp.kpId)
      if (!mastery || mastery.attemptCount === 0) untested += 1
      else if (mastery.confidence >= 0.8) mastered += 1
      else if (mastery.confidence >= 0.5) learning += 1
      else weak += 1
    }

    const totalKps = kpsInChapter.length
    const masteryPct = totalKps > 0 ? Math.round(((mastered + learning * 0.6) / totalKps) * 100) : 0
    const projectHours = eduLevel === 'undergraduate' ? (project.hoursUg ?? 0) : (project.hoursCollege ?? 0)
    const maxHours = totalProjectHours > 0
      ? Number(((projectHours / totalProjectHours) * targetTotal).toFixed(2))
      : 0
    const latestScore = latestByModule.get(project.trainingId)
    const studySeconds = studyMap.get(project.trainingId) ?? 0

    let status: 'locked' | 'untouched' | 'in_progress' | 'completed' = 'untouched'
    if (latestScore && latestScore.score >= 60) status = 'completed'
    else if (masteryPct > 0 || studySeconds > 0 || latestScore) status = 'in_progress'

    return {
      trainingId: project.trainingId,
      displayName: project.displayName,
      seqOrder: project.seqOrder,
      hours: projectHours,
      maxScoreHours: maxHours,
      status,
      totalKps,
      mastered,
      learning,
      weak,
      untested,
      masteryPct,
      latestScore: latestScore?.score ?? null,
      earnedHours: latestScore?.earnedHours ?? null,
      studyMinutes: Math.round(studySeconds / 60),
      completedAt: latestScore?.completedAt ?? null,
    }
  })

  const totalEarnedHours = chapters.reduce((sum, chapter) => sum + (chapter.earnedHours ?? 0), 0)
  const completedChapters = chapters.filter(chapter => chapter.status === 'completed').length
  const inProgressChapters = chapters.filter(chapter => chapter.status === 'in_progress').length
  const totalStudyMinutes = chapters.reduce((sum, chapter) => sum + chapter.studyMinutes, 0)

  const weekAgo = toMysqlDateTime(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
  const [weekStudy] = await db.select({
    seconds: sql<number>`COALESCE(SUM(${courseStudyLogs.seconds}), 0)`.as('seconds'),
  }).from(courseStudyLogs)
    .where(and(eq(courseStudyLogs.userId, userId), sql`${courseStudyLogs.loggedAt} >= ${weekAgo}`))
  const weekMinutes = Math.round((Number(weekStudy?.seconds) || 0) / 60)

  // 实时推荐：基于 kp_mastery 的薄弱点打分，有数据时优先于静态前测方案
  let recommendations: { trainingId: string; displayName: string; reason: string }[] = []

  if (masteryRows.length > 0) {
    recommendations = chapters
      .filter(c => c.status !== 'completed' && c.totalKps > 0)
      .map(c => {
        // 薄弱权重 3，未练习权重 1，进行中加 2 分鼓励继续
        const urgency = c.weak * 3 + c.untested * 1 + (c.status === 'in_progress' ? 2 : 0)
        let reason = ''
        if (c.weak > 0 && c.untested > 0) {
          reason = `有 ${c.weak} 个薄弱知识点、${c.untested} 个尚未练习`
        } else if (c.weak > 0) {
          reason = `有 ${c.weak} 个知识点掌握度偏低，建议重点复习`
        } else if (c.untested > 0) {
          reason = `有 ${c.untested} 个知识点尚未练习，赶快开始吧`
        } else if (c.status === 'in_progress') {
          reason = `学习进行中，当前掌握度 ${c.masteryPct}%`
        }
        return { trainingId: c.trainingId, displayName: c.displayName, reason, urgency }
      })
      .filter(c => c.reason)
      .sort((a, b) => b.urgency - a.urgency)
      .slice(0, 3)
      .map(({ trainingId, displayName, reason }) => ({ trainingId, displayName, reason }))
  }

  // 无 kp_mastery 数据时（新用户）降级到静态前测方案
  if (recommendations.length === 0 && latestPlan?.planData) {
    try {
      const planItems = JSON.parse(latestPlan.planData) as Array<{ project_name: string; priority: string; reason: string }>
      recommendations = planItems
        .filter(item => item.priority === 'high')
        .slice(0, 3)
        .map(item => {
          const matched = projects.find(project =>
            item.project_name.includes(project.displayName) ||
            (project.kpProjUg && item.project_name.includes(project.kpProjUg)) ||
            (project.kpProjCol && item.project_name.includes(project.kpProjCol))
          )
          return { trainingId: matched?.trainingId ?? '', displayName: matched?.displayName ?? item.project_name, reason: item.reason }
        })
        .filter(item => item.trainingId)
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
      totalEarnedHours: Number(totalEarnedHours.toFixed(2)),
      totalMaxHours: targetTotal,
    },
    recommendations,
    chapters,
  })
}
