import { NextRequest, NextResponse } from 'next/server'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  courseAssignments,
  courseAssignmentSubmissions,
  courseDiscussions,
  courseLessonProgress,
  courseLessons,
  courseStudyLogs,
  knowledgePoints,
  kpMastery,
  kpRegLinks,
  learningPlans,
  moduleScores,
  regLibrary,
  trainingProjects,
  users,
} from '@/db/schema'
import { verifyToken } from '@/lib/auth'
import { getPublishedCourseChapterQuiz } from '@/lib/course-chapter-quiz'
import { boolValue, safeJsonArray } from '@/lib/course-learning'
import { getCourseQuizGate } from '@/lib/course-quiz-gate'
import { getCourseScopeTeacherId } from '@/lib/course-teacher-scope'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ trainingId: string }> },
) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { userId } = payload
  const { trainingId } = await context.params

  if (!/^T(0[1-9]|1[01])$/.test(trainingId)) {
    return NextResponse.json({ error: '无效的章节 ID' }, { status: 400 })
  }

  const [project] = await db.select().from(trainingProjects)
    .where(eq(trainingProjects.trainingId, trainingId))
    .limit(1)
  if (!project) return NextResponse.json({ error: '章节不存在' }, { status: 404 })

  const [latestPlan] = await db.select().from(learningPlans)
    .where(eq(learningPlans.userId, userId))
    .orderBy(desc(learningPlans.createdAt))
    .limit(1)
  const eduLevel: 'college' | 'undergraduate' =
    latestPlan?.eduLevel === 'undergraduate' ? 'undergraduate' : 'college'
  const eduCn = eduLevel === 'undergraduate' ? '本科' : '专科'
  const projectName = eduLevel === 'undergraduate' ? project.kpProjUg : project.kpProjCol

  const kps = projectName
    ? await db.select().from(knowledgePoints)
      .where(and(eq(knowledgePoints.projectName, projectName), eq(knowledgePoints.eduLevel, eduCn)))
    : []
  const kpIds = kps.map(kp => kp.kpId)

  const masteryRows = kpIds.length > 0
    ? await db.select().from(kpMastery)
      .where(and(eq(kpMastery.userId, userId), inArray(kpMastery.kpId, kpIds)))
    : []
  const masteryMap = new Map(masteryRows.map(row => [row.kpId, row]))

  const knowledgePointsResult = kps.map(kp => {
    const mastery = masteryMap.get(kp.kpId)
    const confidence = mastery?.confidence ?? 0
    const status: 'mastered' | 'learning' | 'weak' | 'untested' =
      !mastery || mastery.attemptCount === 0 ? 'untested'
        : confidence >= 0.8 ? 'mastered'
        : confidence >= 0.5 ? 'learning'
        : 'weak'

    return {
      kpId: kp.kpId,
      title: kp.title,
      content: kp.content,
      difficulty: kp.difficulty,
      pointType: kp.pointType,
      taskName: kp.taskName,
      confidence: Number(confidence.toFixed(2)),
      attemptCount: mastery?.attemptCount ?? 0,
      status,
    }
  })

  const linkedRegs = kpIds.length > 0
    ? await db.select({
      regId: kpRegLinks.regId,
      docType: regLibrary.docType,
      regDoc: regLibrary.regDoc,
      chapter: regLibrary.chapterName,
      section: regLibrary.sectionName,
      article: regLibrary.articleNum,
      content: regLibrary.content,
    })
      .from(kpRegLinks)
      .innerJoin(regLibrary, eq(kpRegLinks.regId, regLibrary.regId))
      .where(inArray(kpRegLinks.kpId, kpIds))
    : []

  const seenReg = new Set<string>()
  const regsByDocType = new Map<string, typeof linkedRegs>()
  for (const reg of linkedRegs) {
    if (seenReg.has(reg.regId)) continue
    seenReg.add(reg.regId)
    if (!regsByDocType.has(reg.docType)) regsByDocType.set(reg.docType, [])
    regsByDocType.get(reg.docType)!.push(reg)
  }
  const resources = Array.from(regsByDocType.entries()).map(([docType, items]) => ({
    docType,
    count: items.length,
    items: items.slice(0, 20),
  }))

  const [latestQuiz] = await db.select().from(moduleScores)
    .where(and(eq(moduleScores.userId, userId), eq(moduleScores.trainingId, trainingId)))
    .orderBy(desc(moduleScores.completedAt))
    .limit(1)
  const scopeTeacherId = await getCourseScopeTeacherId(payload)
  const hasTeacherScope = payload.role === 'admin' || Boolean(scopeTeacherId)
  const quizConfig = hasTeacherScope ? await getPublishedCourseChapterQuiz(trainingId, scopeTeacherId) : null

  const coursewareFilters = [eq(courseLessons.trainingId, trainingId), eq(courseLessons.status, 'published')]
  if (scopeTeacherId) coursewareFilters.push(eq(courseLessons.teacherId, scopeTeacherId))
  const coursewareRows = hasTeacherScope
    ? await db.select().from(courseLessons)
      .where(and(...coursewareFilters))
      .orderBy(asc(courseLessons.sortOrder))
    : []
  const lessonIds = coursewareRows.map(lesson => lesson.lessonId)
  const progressRows = lessonIds.length > 0
    ? await db.select().from(courseLessonProgress)
      .where(and(eq(courseLessonProgress.userId, userId), inArray(courseLessonProgress.lessonId, lessonIds)))
    : []
  const progressMap = new Map(progressRows.map(progress => [progress.lessonId, progress]))
  const quizGate = hasTeacherScope
    ? await getCourseQuizGate(userId, trainingId, scopeTeacherId)
    : { unlocked: false, totalPptPages: 0, viewedPptPages: 0, missingPages: 0, completedLessons: 0, requiredLessons: 0 }

  const discussions = await db.select({
    id: courseDiscussions.id,
    title: courseDiscussions.title,
    content: courseDiscussions.content,
    tag: courseDiscussions.tag,
    pinned: courseDiscussions.pinned,
    viewCount: courseDiscussions.viewCount,
    replyCount: courseDiscussions.replyCount,
    createdAt: courseDiscussions.createdAt,
    authorName: users.displayName,
  })
    .from(courseDiscussions)
    .innerJoin(users, eq(courseDiscussions.userId, users.userId))
    .where(eq(courseDiscussions.trainingId, trainingId))
    .orderBy(desc(courseDiscussions.pinned), desc(courseDiscussions.createdAt))
    .limit(10)

  const [discussionTotal] = await db.select({ count: sql<number>`COUNT(*)`.as('count') })
    .from(courseDiscussions)
    .where(eq(courseDiscussions.trainingId, trainingId))

  const assignmentFilters = [eq(courseAssignments.trainingId, trainingId)]
  if (scopeTeacherId) assignmentFilters.push(eq(courseAssignments.teacherId, scopeTeacherId))
  const assignments = hasTeacherScope
    ? await db.select().from(courseAssignments)
      .where(and(...assignmentFilters))
      .orderBy(desc(courseAssignments.createdAt))
    : []
  const assignmentIds = assignments.map(assignment => assignment.id)
  const mySubmissions = assignmentIds.length > 0
    ? await db.select().from(courseAssignmentSubmissions)
      .where(and(
        eq(courseAssignmentSubmissions.userId, userId),
        inArray(courseAssignmentSubmissions.assignmentId, assignmentIds),
      ))
    : []
  const submissionMap = new Map(mySubmissions.map(submission => [submission.assignmentId, submission]))

  const [studyAgg] = await db.select({
    seconds: sql<number>`COALESCE(SUM(${courseStudyLogs.seconds}), 0)`.as('seconds'),
  })
    .from(courseStudyLogs)
    .where(and(eq(courseStudyLogs.userId, userId), eq(courseStudyLogs.trainingId, trainingId)))

  return NextResponse.json({
    chapter: {
      trainingId: project.trainingId,
      displayName: project.displayName,
      seqOrder: project.seqOrder,
      eduLevel,
      hours: eduLevel === 'undergraduate' ? project.hoursUg : project.hoursCollege,
      projectName,
    },
    knowledgePoints: knowledgePointsResult,
    resources,
    courseware: coursewareRows.map(lesson => {
      const progress = progressMap.get(lesson.lessonId)
      const viewedPages = safeJsonArray<number>(progress?.pptViewedPages)
        .map(page => Number(page))
        .filter(page => Number.isFinite(page) && page >= 1 && page <= lesson.pptPageCount)
      const pptProgress = lesson.pptPageCount > 0 ? Math.min(100, Math.round((new Set(viewedPages).size / lesson.pptPageCount) * 100)) : 0
      const videoProgress = lesson.videoDuration > 0 ? Math.min(100, Math.round(((progress?.videoWatchedSeconds ?? 0) / lesson.videoDuration) * 100)) : 0
      return {
        lessonId: lesson.lessonId,
        title: lesson.title,
        description: lesson.description,
        sortOrder: lesson.sortOrder,
        pptUrl: lesson.pptUrl,
        pptPageCount: lesson.pptPageCount,
        videoUrl: lesson.videoUrl,
        videoDuration: lesson.videoDuration,
        passScore: lesson.passScore,
        updatedAt: lesson.updatedAt,
        progress: {
          viewedPages: [...new Set(viewedPages)].sort((left, right) => left - right),
          pptProgress,
          pptCompleted: boolValue(progress?.pptCompleted),
          videoProgress,
          videoCompleted: boolValue(progress?.videoCompleted),
          annotationCount: progress?.annotationCount ?? 0,
        },
      }
    }),
    quiz: {
      latestScore: latestQuiz?.score ?? null,
      earnedHours: latestQuiz?.earnedHours ?? null,
      completedAt: latestQuiz?.completedAt ?? null,
      passed: (latestQuiz?.score ?? 0) >= (quizConfig?.passScore ?? 60),
      published: Boolean(quizConfig),
      title: quizConfig?.title ?? `${project.displayName} 章节测验`,
      description: quizConfig?.description ?? null,
      questionCount: quizConfig?.questionCount ?? 10,
      passScore: quizConfig?.passScore ?? 60,
      durationMinutes: quizConfig?.durationMinutes ?? 30,
    },
    quizGate,
    discussions: {
      total: Number(discussionTotal?.count ?? 0),
      list: discussions.map(discussion => ({
        id: discussion.id,
        title: discussion.title,
        content: discussion.content,
        tag: discussion.tag,
        pinned: !!discussion.pinned,
        replyCount: discussion.replyCount,
        viewCount: discussion.viewCount,
        createdAt: discussion.createdAt,
        author: discussion.authorName,
      })),
    },
    assignments: assignments.map(assignment => {
      const submission = submissionMap.get(assignment.id)
      return {
        id: assignment.id,
        title: assignment.title,
        description: assignment.description,
        assignmentType: assignment.assignmentType,
        maxScore: assignment.maxScore,
        dueDate: assignment.dueDate,
        createdAt: assignment.createdAt,
        submitted: !!submission,
        mySubmission: submission
          ? {
            id: submission.id,
            score: submission.score,
            content: submission.content,
            feedback: submission.feedback,
            submittedAt: submission.submittedAt,
            gradedAt: submission.gradedAt,
            graded: submission.score !== null,
          }
          : null,
      }
    }),
    studyMinutes: Math.round((Number(studyAgg?.seconds) || 0) / 60),
  })
}
