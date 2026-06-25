import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  courseAssignments,
  courseAssignmentSubmissions,
  courseLessonProgress,
  courseLessons,
  courseStudyLogs,
  knowledgePoints,
  kpMastery,
  learningPlans,
  moduleScores,
  trainingProjects,
  users,
} from '@/db/schema'
import { verifyToken } from '@/lib/auth'
import { buildAdaptiveLearningPlan, normalizeMasteryConfidence } from '@/lib/adaptive-learning-plan'
import {
  COURSE_LEARNING_CREDIT_TARGET,
  COURSE_TARGET_HOURS,
  getCourseChapterMaxCredits,
  getCourseChapterMaxHours,
  getCourseComponentMaxHours,
  getCourseProjectHours,
  hoursToCourseCredits,
  scoreToEarnedHours,
} from '@/lib/course-hours'

function toMysqlDateTime(date: Date) {
  return date.toISOString().slice(0, 23).replace('T', ' ')
}

function safeJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as T[] : []
  } catch {
    return []
  }
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
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
  const assignmentRows = await db.select({
    trainingId: courseAssignments.trainingId,
    score: courseAssignmentSubmissions.score,
  })
    .from(courseAssignmentSubmissions)
    .innerJoin(courseAssignments, eq(courseAssignmentSubmissions.assignmentId, courseAssignments.id))
    .where(eq(courseAssignmentSubmissions.userId, userId))
  const masteryRows = await db.select().from(kpMastery).where(eq(kpMastery.userId, userId))
  const allKps = await db.select().from(knowledgePoints)
  const studyAgg = await db.select({
    trainingId: courseStudyLogs.trainingId,
    seconds: sql<number>`COALESCE(SUM(${courseStudyLogs.seconds}), 0)`.as('seconds'),
  }).from(courseStudyLogs)
    .where(eq(courseStudyLogs.userId, userId))
    .groupBy(courseStudyLogs.trainingId)
  const publishedLessons = await db.select().from(courseLessons)
    .where(eq(courseLessons.status, 'published'))
  const lessonIds = publishedLessons.map(lesson => lesson.lessonId)
  const lessonProgressRows = lessonIds.length > 0
    ? await db.select().from(courseLessonProgress)
      .where(and(eq(courseLessonProgress.userId, userId), inArray(courseLessonProgress.lessonId, lessonIds)))
    : []

  const latestByModule = new Map<string, typeof allScores[number]>()
  for (const score of allScores) {
    if (!latestByModule.has(score.trainingId)) latestByModule.set(score.trainingId, score)
  }

  const masteryMap = new Map(masteryRows.map(row => [row.kpId, row]))
  const studyMap = new Map(studyAgg.map(row => [row.trainingId, Number(row.seconds) || 0]))
  const lessonProgressMap = new Map(lessonProgressRows.map(row => [row.lessonId, row]))
  const lessonsByTraining = new Map<string, typeof publishedLessons>()
  for (const lesson of publishedLessons) {
    if (!lesson.trainingId) continue
    const list = lessonsByTraining.get(lesson.trainingId) ?? []
    list.push(lesson)
    lessonsByTraining.set(lesson.trainingId, list)
  }
  const targetTotal = COURSE_TARGET_HOURS[eduLevel] ?? 48
  const assignmentScoresByTraining = new Map<string, number[]>()
  for (const row of assignmentRows) {
    if (typeof row.score !== 'number') continue
    const values = assignmentScoresByTraining.get(row.trainingId) ?? []
    values.push(row.score)
    assignmentScoresByTraining.set(row.trainingId, values)
  }

  const chapters = [...projects].sort((left, right) => left.seqOrder - right.seqOrder).map(project => {
    const projectName = eduLevel === 'undergraduate' ? project.kpProjUg : project.kpProjCol
    const kpsInChapter = projectName
      ? allKps.filter(kp =>
        kp.projectName === projectName &&
        kp.eduLevel === eduCn &&
        kp.pointType === '知识点' &&
        kp.status === 'active')
      : []

    let mastered = 0
    let learning = 0
    let weak = 0
    let untested = 0
    for (const kp of kpsInChapter) {
      const mastery = masteryMap.get(kp.kpId)
      const confidence = normalizeMasteryConfidence(mastery?.confidence)
      if (!mastery || mastery.attemptCount === 0) untested += 1
      else if (confidence >= 0.8) mastered += 1
      else if (confidence >= 0.5) learning += 1
      else weak += 1
    }

    const totalKps = kpsInChapter.length
    const masteryPct = totalKps > 0 ? Math.round(((mastered + learning * 0.6) / totalKps) * 100) : 0
    const projectHours = getCourseProjectHours(project, eduLevel)
    const maxHours = Number(getCourseChapterMaxHours(projects, project.trainingId, eduLevel).toFixed(2))
    const maxCredits = getCourseChapterMaxCredits(projects, project.trainingId, eduLevel)
    const latestScore = latestByModule.get(project.trainingId)
    const assignmentScores = assignmentScoresByTraining.get(project.trainingId) ?? []
    const assignmentAverage = assignmentScores.length > 0
      ? assignmentScores.reduce((sum, score) => sum + score, 0) / assignmentScores.length
      : 0
    const assignmentEarnedHours = scoreToEarnedHours(
      getCourseComponentMaxHours(projects, project.trainingId, eduLevel, 'assignment'),
      assignmentAverage,
    )
    const earnedHours = Number(Math.min(maxHours, (latestScore?.earnedHours ?? 0) + assignmentEarnedHours).toFixed(2))
    const earnedCredits = hoursToCourseCredits(earnedHours, eduLevel)
    const studySeconds = studyMap.get(project.trainingId) ?? 0
    const lessonsInChapter = lessonsByTraining.get(project.trainingId) ?? []
    const pptProgresses = lessonsInChapter
      .filter(lesson => Boolean(lesson.pptUrl) && lesson.pptPageCount > 0)
      .map(lesson => {
        const progress = lessonProgressMap.get(lesson.lessonId)
        const viewedPages = safeJsonArray<number>(progress?.pptViewedPages)
        return Math.min(100, Math.round((new Set(viewedPages).size / lesson.pptPageCount) * 100))
      })
    const videoProgresses = lessonsInChapter
      .filter(lesson => Boolean(lesson.videoUrl) && lesson.videoDuration > 0)
      .map(lesson => {
        const progress = lessonProgressMap.get(lesson.lessonId)
        return Math.min(100, Math.round(((progress?.videoWatchedSeconds ?? 0) / lesson.videoDuration) * 100))
      })
    const pptProgressPct = average(pptProgresses)
    const videoProgressPct = average(videoProgresses)
    const coursewareProgressPct = average([...pptProgresses, ...videoProgresses])

    let status: 'locked' | 'untouched' | 'in_progress' | 'completed' = 'untouched'
    if (latestScore && latestScore.score >= 60) status = 'completed'
    else if (masteryPct > 0 || coursewareProgressPct > 0 || studySeconds > 0 || latestScore || assignmentScores.length > 0) status = 'in_progress'

    return {
      trainingId: project.trainingId,
      displayName: project.displayName,
      seqOrder: project.seqOrder,
      hours: projectHours,
      maxScoreHours: maxHours,
      maxScoreCredits: maxCredits,
      status,
      totalKps,
      mastered,
      learning,
      weak,
      untested,
      masteryPct,
      pptProgressPct,
      videoProgressPct,
      coursewareProgressPct,
      pptResourceCount: pptProgresses.length,
      videoResourceCount: videoProgresses.length,
      latestScore: latestScore?.score ?? null,
      earnedHours: earnedHours > 0 ? earnedHours : null,
      earnedCredits: earnedCredits > 0 ? earnedCredits : null,
      studyMinutes: Math.round(studySeconds / 60),
      completedAt: latestScore?.completedAt ?? null,
    }
  })

  const totalEarnedHours = chapters.reduce((sum, chapter) => sum + (chapter.earnedHours ?? 0), 0)
  const totalEarnedCredits = hoursToCourseCredits(totalEarnedHours, eduLevel)
  const completedChapters = chapters.filter(chapter => chapter.status === 'completed').length
  const inProgressChapters = chapters.filter(chapter => chapter.status === 'in_progress').length
  const totalStudyMinutes = chapters.reduce((sum, chapter) => sum + chapter.studyMinutes, 0)
  const totalKpCount = chapters.reduce((sum, chapter) => sum + chapter.totalKps, 0)
  const knowledgeMasteryPct = totalKpCount > 0
    ? Math.round(chapters.reduce((sum, chapter) => sum + chapter.masteryPct * chapter.totalKps, 0) / totalKpCount)
    : 0
  const coursewareChapters = chapters.filter(chapter => chapter.pptResourceCount > 0 || chapter.videoResourceCount > 0)
  const coursewareProgressPct = average(coursewareChapters.map(chapter => chapter.coursewareProgressPct))

  const weekAgo = toMysqlDateTime(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
  const [weekStudy] = await db.select({
    seconds: sql<number>`COALESCE(SUM(${courseStudyLogs.seconds}), 0)`.as('seconds'),
  }).from(courseStudyLogs)
    .where(and(eq(courseStudyLogs.userId, userId), sql`${courseStudyLogs.loggedAt} >= ${weekAgo}`))
  const weekMinutes = Math.round((Number(weekStudy?.seconds) || 0) / 60)

  let recommendations: { trainingId: string; displayName: string; reason: string }[] = chapters
    .filter(chapter => chapter.status !== 'completed')
    .map(chapter => ({
      chapter,
      score: chapter.weak * 12 +
        chapter.learning * 4 +
        chapter.untested * 0.8 +
        Math.max(0, 72 - chapter.masteryPct) +
        (chapter.coursewareProgressPct > 0 ? Math.max(0, 60 - chapter.coursewareProgressPct) * 0.3 : 0),
    }))
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score || left.chapter.seqOrder - right.chapter.seqOrder)
    .slice(0, 3)
    .map(({ chapter }) => {
      const reasonParts = [
        `知识掌握 ${chapter.masteryPct}%`,
        chapter.weak > 0 ? `薄弱点 ${chapter.weak} 个` : '',
        chapter.learning > 0 ? `学习中 ${chapter.learning} 个` : '',
        chapter.coursewareProgressPct > 0 ? `课件进度 ${chapter.coursewareProgressPct}%` : '',
      ].filter(Boolean)
      return {
        trainingId: chapter.trainingId,
        displayName: chapter.displayName,
        reason: reasonParts.join('，') || '建议先完成课件学习，再进入章节测验与作业巩固。',
      }
    })

  if (recommendations.length === 0) {
    const adaptiveResult = latestPlan
      ? await buildAdaptiveLearningPlan(userId, latestPlan, { useAi: false }).catch(() => null)
      : null

    if (adaptiveResult) {
      recommendations = adaptiveResult.plan
        .filter(item => item.priority === 'high' || (item.adaptive_score ?? 0) >= 50)
        .slice(0, 3)
        .map(item => ({
          trainingId: item.training_id ?? '',
          displayName: item.display_name ?? item.project_name,
          reason: item.ai_reason ?? item.reason,
        }))
        .filter(item => item.trainingId)
    }
  }

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
          return {
            trainingId: matched?.trainingId ?? '',
            displayName: matched?.displayName ?? item.project_name,
            reason: item.reason,
          }
        })
        .filter(item => item.trainingId)
    } catch {
      recommendations = []
    }
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
      totalEarnedCredits,
      totalMaxCredits: COURSE_LEARNING_CREDIT_TARGET,
      knowledgeMasteryPct,
      coursewareProgressPct,
    },
    recommendations,
    chapters,
  })
}
