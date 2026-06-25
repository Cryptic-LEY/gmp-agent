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
  questions,
  regLibrary,
  trainingProjects,
  users,
} from '@/db/schema'
import { verifyToken } from '@/lib/auth'
import { normalizeMasteryConfidence } from '@/lib/adaptive-learning-plan'
import { getPublishedCourseChapterQuiz } from '@/lib/course-chapter-quiz'
import { boolValue, safeJsonArray } from '@/lib/course-learning'
import { getCourseQuizGate } from '@/lib/course-quiz-gate'
import { getCourseScopeTeacherId } from '@/lib/course-teacher-scope'
import {
  CHAPTER_QUIZ_TOTAL_COUNT,
  COURSE_ASSIGNMENT_BLUEPRINT,
  describeCourseQuizBlueprint,
  getCourseAssignmentQuestionPoints,
  isChoiceQuestionType,
  type CourseQuizQuestionType,
} from '@/lib/course-quiz-blueprint'
import { getCourseQuizAttemptMeta, getCourseQuizSession } from '@/lib/course-quiz-session'
import { courseProjectMatches, normalizeCourseProjectName } from '@/lib/course-project-match'
import { getCourseChapterMaxCredits, getCourseChapterMaxHours, getCourseComponentMaxHours, hoursToCourseCredits, scoreToEarnedHours } from '@/lib/course-hours'
import { stripAssignmentQuestionBlock } from '@/lib/course-assignment-questions'
import {
  buildSubmissionReviewItemsWithFallback,
  ensureAssignmentSubmissionGraderColumn,
  hydrateAssignmentQuestions,
  normalizeGrader,
  stripAssignmentAnswers,
} from '@/lib/course-assignment-review'

const CHAPTER_KEYWORD_STOP_WORDS = new Set([
  'GMP',
  '管理',
  '质量',
  '生产',
  '产品',
  '基础',
  '实训',
  '综合',
  '课程',
  '章节',
])

function unique<T>(values: T[]) {
  return [...new Set(values)]
}

function buildChapterKeywords(displayName: string) {
  const cleaned = displayName
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[，,;；:：·\-]/g, '、')
  const parts = cleaned
    .split(/[与和及、\s]+/)
    .map(part => part.trim())
    .filter(part => part.length >= 2)
  const terms: string[] = []

  for (const part of parts) {
    terms.push(part)
    const compact = part.replace(/(管理|实训|基础)$/g, '')
    if (compact.length >= 2) terms.push(compact)
    for (const size of [2, 3]) {
      for (let index = 0; index <= part.length - size; index += 1) {
        terms.push(part.slice(index, index + size))
      }
    }
  }

  return unique(terms)
    .map(term => term.trim())
    .filter(term => term.length >= 2 && !CHAPTER_KEYWORD_STOP_WORDS.has(term))
    .sort((left, right) => right.length - left.length)
}

function pickChapterScopedKps<T extends { title: string; taskName: string | null; content: string | null }>(
  kps: T[],
  chapterName: string,
) {
  const keywords = buildChapterKeywords(chapterName)
  if (keywords.length === 0) return kps

  const matched = kps.filter(kp => {
    const haystack = `${kp.title ?? ''} ${kp.taskName ?? ''} ${kp.content ?? ''}`
    return keywords.some(keyword => haystack.includes(keyword))
  })

  return matched.length > 0 ? matched : kps
}

function scoreRegForChapter(
  reg: {
    docType: string
    regDoc: string
    chapter: string | null
    section: string | null
    article: string | null
    content: string | null
  },
  keywords: string[],
) {
  const location = `${reg.chapter ?? ''} ${reg.section ?? ''}`
  const haystack = `${reg.docType} ${reg.regDoc} ${location} ${reg.article ?? ''} ${reg.content ?? ''}`
  return keywords.reduce((score, keyword) => {
    if (!haystack.includes(keyword)) return score
    return score + (location.includes(keyword) ? 6 : keyword.length >= 4 ? 4 : 2)
  }, 0)
}

const REG_CHAPTER_SCOPE: Record<string, string[]> = {
  T01: ['第一章'],
  T02: ['第二章'],
  T03: ['第四章', '第五章'],
  T04: ['第八章', '计算机化系统'],
  T05: ['第七章', '确认与验证'],
  T06: ['第六章'],
  T07: ['第九章'],
  T08: ['第十章'],
  T09: ['第十二章', '产品发运', '召回', '投诉', '放行'],
  T10: ['第十一章'],
  T11: ['第十三章', '自检', '风险'],
}

function filterRegsByTrainingScope<
  T extends {
    docType: string
    regDoc: string
    chapter: string | null
    section: string | null
    article: string | null
    content: string | null
  },
>(trainingId: string, regs: T[]) {
  const scope = REG_CHAPTER_SCOPE[trainingId]
  if (!scope?.length) return regs

  const scoped = regs.filter(reg => {
    const haystack = `${reg.docType} ${reg.regDoc} ${reg.chapter ?? ''} ${reg.section ?? ''} ${reg.article ?? ''} ${reg.content ?? ''}`
    return scope.some(term => haystack.includes(term))
  })

  return scoped.length > 0 ? scoped : regs
}

type QuestionRow = typeof questions.$inferSelect

function shuffle<T>(items: T[]) {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function questionMatchesChapter(question: QuestionRow, projectName: string | null, chapterName: string, trainingId: string, eduLevel: string) {
  if (projectName && courseProjectMatches(question.projectName, projectName)) return true
  const chapterKeyword = normalizeCourseProjectName(chapterName)
  const stemText = normalizeCourseProjectName(question.stem)
  return Boolean(
    (chapterKeyword && stemText.includes(chapterKeyword.slice(0, 4))) ||
    (question.questionId.startsWith('ai_') && question.questionId.includes(`_${trainingId}_${eduLevel}_`)),
  )
}

function questionHasEnoughInput(question: QuestionRow) {
  if (!isChoiceQuestionType(question.questionType) || question.questionType === '判断题') return true
  return Boolean(question.optionA?.trim() && question.optionB?.trim())
}

function buildQuestionOptions(question: QuestionRow) {
  if (question.questionType === '判断题') return [{ key: 'A', text: '对' }, { key: 'B', text: '错' }]
  if (!isChoiceQuestionType(question.questionType)) return []
  const keys = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const
  const values = [question.optionA, question.optionB, question.optionC, question.optionD, question.optionE, question.optionF, question.optionG]
  return keys
    .map((key, index) => ({ key, text: values[index] ?? '' }))
    .filter(option => option.text.trim())
}

function buildRandomAssignmentQuestions(pool: QuestionRow[]) {
  const used = new Set<string>()
  return COURSE_ASSIGNMENT_BLUEPRINT.flatMap(quota => {
    const candidates = shuffle(pool.filter(question =>
      !used.has(question.questionId) &&
      quota.matchTypes.includes(question.questionType as CourseQuizQuestionType)
    )).slice(0, quota.count)
    for (const question of candidates) used.add(question.questionId)
    return candidates.map(question => ({
      id: question.questionId,
      questionId: question.questionId,
      questionType: quota.label,
      stem: question.stem,
      points: getCourseAssignmentQuestionPoints(question.questionType),
      options: buildQuestionOptions(question),
    }))
  })
}

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
    const confidence = normalizeMasteryConfidence(mastery?.confidence)
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

  const chapterResourceKps = pickChapterScopedKps(kps, project.displayName)
  const chapterResourceKpIds = chapterResourceKps.map(kp => kp.kpId)
  const chapterKeywords = buildChapterKeywords(project.displayName)

  const linkedRegs = chapterResourceKpIds.length > 0
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
      .where(inArray(kpRegLinks.kpId, chapterResourceKpIds))
    : []

  const seenReg = new Set<string>()
  const regsByDocType = new Map<string, typeof linkedRegs>()
  const rankedRegs = linkedRegs
    .map(reg => ({ reg, score: scoreRegForChapter(reg, chapterKeywords) }))
    .filter(item => chapterKeywords.length === 0 || item.score > 0)
    .sort((left, right) => right.score - left.score)
    .map(item => item.reg)
  const scopedRegs = filterRegsByTrainingScope(trainingId, rankedRegs.length > 0 ? rankedRegs : linkedRegs)

  for (const reg of scopedRegs) {
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
  const quizSession = quizConfig?.teacherId
    ? await getCourseQuizSession({ trainingId, teacherId: quizConfig.teacherId, userId, eduLevel })
    : null
  const quizAttempt = getCourseQuizAttemptMeta(quizSession?.attemptCount ?? 0)

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
  await ensureAssignmentSubmissionGraderColumn()
  const mySubmissions = assignmentIds.length > 0
    ? await db.select().from(courseAssignmentSubmissions)
      .where(and(
        eq(courseAssignmentSubmissions.userId, userId),
        inArray(courseAssignmentSubmissions.assignmentId, assignmentIds),
      ))
    : []
  const submissionMap = new Map(mySubmissions.map(submission => [submission.assignmentId, submission]))
  const assignmentGroups = new Map<string, typeof assignments>()
  for (const assignment of assignments) {
    const key = `${assignment.teacherId}:${assignment.trainingId}:${assignment.title.trim()}`
    if (!assignmentGroups.has(key)) assignmentGroups.set(key, [])
    assignmentGroups.get(key)!.push(assignment)
  }
  const displayAssignments = Array.from(assignmentGroups.values()).map(group => {
    const submitted = group.find(assignment => submissionMap.has(assignment.id))
    return submitted ?? group[0]
  })
  const activeQuestionRows = await db.select().from(questions)
    .where(and(eq(questions.status, 'active'), eq(questions.eduLevel, eduLevel)))
  const assignmentQuestionPool = activeQuestionRows
    .filter(question => questionMatchesChapter(question, projectName ?? null, project.displayName, trainingId, eduLevel))
    .filter(questionHasEnoughInput)
  const allProjects = await db.select().from(trainingProjects)
  const chapterMaxHours = getCourseChapterMaxHours(allProjects, trainingId, eduLevel)
  const chapterMaxCredits = getCourseChapterMaxCredits(allProjects, trainingId, eduLevel)
  const assignmentMaxHours = getCourseComponentMaxHours(allProjects, trainingId, eduLevel, 'assignment')
  const gradedAssignmentScores = displayAssignments
    .map(assignment => submissionMap.get(assignment.id)?.score)
    .filter((score): score is number => typeof score === 'number')
  const assignmentAverageScore = gradedAssignmentScores.length > 0
    ? gradedAssignmentScores.reduce((sum, score) => sum + score, 0) / gradedAssignmentScores.length
    : 0
  const assignmentEarnedHours = scoreToEarnedHours(assignmentMaxHours, assignmentAverageScore)
  const latestQuizEarnedHours = latestQuiz?.earnedHours ?? 0
  const totalEarnedHours = Number(Math.min(chapterMaxHours, latestQuizEarnedHours + assignmentEarnedHours).toFixed(2))
  const latestQuizEarnedCredits = hoursToCourseCredits(latestQuizEarnedHours, eduLevel)
  const assignmentEarnedCredits = hoursToCourseCredits(assignmentEarnedHours, eduLevel)
  const totalEarnedCredits = hoursToCourseCredits(totalEarnedHours, eduLevel)

  const [studyAgg] = await db.select({
    seconds: sql<number>`COALESCE(SUM(${courseStudyLogs.seconds}), 0)`.as('seconds'),
  })
    .from(courseStudyLogs)
    .where(and(eq(courseStudyLogs.userId, userId), eq(courseStudyLogs.trainingId, trainingId)))

  const assignmentPayload = await Promise.all(displayAssignments.map(async assignment => {
    const submission = submissionMap.get(assignment.id)
    const reviewQuestions = await hydrateAssignmentQuestions(assignment.description)
    const savedQuestions = reviewQuestions.map(stripAssignmentAnswers)
    const assignmentQuestions = submission
      ? await buildSubmissionReviewItemsWithFallback(reviewQuestions, submission.content, submission.feedback)
      : savedQuestions.length > 0
        ? savedQuestions
        : buildRandomAssignmentQuestions(assignmentQuestionPool)

    return {
      id: assignment.id,
      title: assignment.title,
      description: stripAssignmentQuestionBlock(assignment.description),
      assignmentType: assignment.assignmentType,
      maxScore: assignment.maxScore,
      dueDate: assignment.dueDate,
      createdAt: assignment.createdAt,
      questions: assignmentQuestions,
      submitted: !!submission,
      mySubmission: submission
        ? {
          id: submission.id,
          score: submission.score,
          content: submission.content,
          feedback: submission.feedback,
          submittedAt: submission.submittedAt,
          gradedAt: submission.gradedAt,
          gradedBy: normalizeGrader(submission.gradedBy),
          graded: submission.score !== null,
        }
        : null,
    }
  }))

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
          videoWatchedSeconds: Math.max(0, Number(progress?.videoWatchedSeconds ?? 0)),
          videoMaxPosition: Math.max(0, Number(progress?.videoMaxPosition ?? 0)),
          videoProgress,
          videoCompleted: boolValue(progress?.videoCompleted),
          annotationCount: progress?.annotationCount ?? 0,
        },
      }
    }),
    quiz: {
      latestScore: latestQuiz?.score ?? null,
      earnedHours: latestQuiz?.earnedHours ?? null,
      earnedCredits: latestQuizEarnedCredits > 0 ? latestQuizEarnedCredits : null,
      totalEarnedHours,
      totalEarnedCredits,
      assignmentEarnedHours,
      assignmentEarnedCredits,
      maxCredits: chapterMaxCredits,
      completedAt: latestQuiz?.completedAt ?? null,
      passed: (latestQuiz?.score ?? 0) >= (quizConfig?.passScore ?? 60),
      published: Boolean(quizConfig),
      title: quizConfig?.title ?? `${project.displayName} 章节测验`,
      description: quizConfig?.description ?? describeCourseQuizBlueprint(),
      questionCount: CHAPTER_QUIZ_TOTAL_COUNT,
      passScore: quizConfig?.passScore ?? 60,
      durationMinutes: Math.max(quizConfig?.durationMinutes ?? 90, 90),
      attempt: quizAttempt,
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
    assignments: assignmentPayload,
    studyMinutes: Math.round((Number(studyAgg?.seconds) || 0) / 60),
  })
}
