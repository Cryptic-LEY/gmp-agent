import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { learningPlans, questions, trainingProjects } from '@/db/schema'
import { verifyToken } from '@/lib/auth'
import { getPublishedCourseChapterQuiz } from '@/lib/course-chapter-quiz'
import { getCourseQuizGate } from '@/lib/course-quiz-gate'
import { getCourseScopeTeacherId } from '@/lib/course-teacher-scope'
import { courseProjectMatches, normalizeCourseProjectName } from '@/lib/course-project-match'
import { ensureCourseAiAutomation } from '@/lib/course-ai-automation'
import {
  CHAPTER_QUIZ_BLUEPRINT,
  CHAPTER_QUIZ_TOTAL_COUNT,
  describeCourseQuizBlueprint,
  getCourseQuizQuestionPoints,
  isChoiceQuestionType,
  type CourseQuizQuestionType,
} from '@/lib/course-quiz-blueprint'
import {
  getCourseQuizAttemptMeta,
  getCourseQuizSession,
  getOrCreateCourseQuizSession,
  stableShuffle,
} from '@/lib/course-quiz-session'

const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const

type QuestionRow = typeof questions.$inferSelect

function buildOptions(question: QuestionRow) {
  if (question.questionType === '判断题') return [{ key: 'A', text: '对' }, { key: 'B', text: '错' }]
  if (!isChoiceQuestionType(question.questionType)) return []

  const optionFields = [question.optionA, question.optionB, question.optionC, question.optionD, question.optionE, question.optionF, question.optionG]
  return OPTION_KEYS
    .map((key, index) => ({ key, text: optionFields[index] ?? '' }))
    .filter(option => option.text.trim())
}

function questionHasEnoughInput(question: QuestionRow) {
  if (!isChoiceQuestionType(question.questionType) || question.questionType === '判断题') return true
  return Boolean(question.optionA?.trim() && question.optionB?.trim())
}

function questionMatchesChapter(question: QuestionRow, projectName: string, chapterName: string, trainingId: string, eduLevel: string) {
  if (courseProjectMatches(question.projectName, projectName)) return true

  const normalizedProjectName = normalizeCourseProjectName(projectName)
  const chapterKeyword = normalizeCourseProjectName(chapterName)
  const projectText = normalizeCourseProjectName(question.projectName)
  const stemText = normalizeCourseProjectName(question.stem)
  return Boolean(
    (normalizedProjectName && projectText.includes(normalizedProjectName.slice(0, 4))) ||
    (chapterKeyword && stemText.includes(chapterKeyword.slice(0, 4))) ||
    (question.questionId.startsWith(`ai_`) && question.questionId.includes(`_${trainingId}_${eduLevel}_`)),
  )
}

function buildChapterPool(rows: QuestionRow[], projectName: string, chapterName: string, trainingId: string, eduLevel: string) {
  return rows
    .filter(question => questionMatchesChapter(question, projectName, chapterName, trainingId, eduLevel))
    .filter(questionHasEnoughInput)
}

function hasEnoughQuestions(pool: QuestionRow[]) {
  return CHAPTER_QUIZ_BLUEPRINT.every(quota => {
    const available = pool.filter(question => quota.matchTypes.includes(question.questionType as CourseQuizQuestionType))
    return available.length >= quota.count
  })
}

function selectQuestionIds(pool: QuestionRow[], seed: string) {
  const used = new Set<string>()
  const selected: string[] = []

  for (const quota of CHAPTER_QUIZ_BLUEPRINT) {
    const candidates = stableShuffle(
      pool.filter(question => !used.has(question.questionId) && quota.matchTypes.includes(question.questionType as CourseQuizQuestionType)),
      `${seed}|${quota.label}`,
    ).slice(0, quota.count)

    for (const question of candidates) {
      used.add(question.questionId)
      selected.push(question.questionId)
    }
  }

  return selected
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ trainingId: string }> },
) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { trainingId } = await context.params
  const [project] = await db.select().from(trainingProjects)
    .where(eq(trainingProjects.trainingId, trainingId))
    .limit(1)
  if (!project) return NextResponse.json({ error: '章节不存在' }, { status: 404 })

  const scopeTeacherId = await getCourseScopeTeacherId(payload)
  const quizConfig = scopeTeacherId || payload.role === 'admin'
    ? await getPublishedCourseChapterQuiz(trainingId, scopeTeacherId)
    : null
  if (!quizConfig) {
    return NextResponse.json({
      error: '教师尚未发布本章节测验',
      trainingId,
      displayName: project.displayName,
    }, { status: 403 })
  }

  const gate = await getCourseQuizGate(payload.userId, trainingId, scopeTeacherId)
  if (!gate.unlocked) {
    return NextResponse.json({
      error: '请先浏览完本章节全部 PPT 后再开始章节测验',
      trainingId,
      displayName: project.displayName,
      gate,
    }, { status: 403 })
  }

  const [latestPlan] = await db.select().from(learningPlans)
    .where(eq(learningPlans.userId, payload.userId))
    .orderBy(desc(learningPlans.createdAt))
    .limit(1)
  const eduLevel: 'college' | 'undergraduate' =
    latestPlan?.eduLevel === 'undergraduate' ? 'undergraduate' : 'college'
  const projectName = eduLevel === 'undergraduate' ? project.kpProjUg : project.kpProjCol

  if (!projectName) {
    return NextResponse.json({ trainingId, displayName: project.displayName, eduLevel, gate, quizConfig, questions: [], total: 0 })
  }

  const questionRows = await db.select().from(questions)
    .where(and(eq(questions.status, 'active'), eq(questions.eduLevel, eduLevel)))
  let pool = buildChapterPool(questionRows, projectName, project.displayName, trainingId, eduLevel)
  const teacherId = quizConfig.teacherId || scopeTeacherId

  if (!hasEnoughQuestions(pool) && teacherId) {
    await ensureCourseAiAutomation({ trainingId, teacherId, eduLevel })
    const refreshedRows = await db.select().from(questions)
      .where(and(eq(questions.status, 'active'), eq(questions.eduLevel, eduLevel)))
    pool = buildChapterPool(refreshedRows, projectName, project.displayName, trainingId, eduLevel)
  }

  const existingSession = teacherId
    ? await getCourseQuizSession({ trainingId, teacherId, userId: payload.userId, eduLevel })
    : null
  const existingMeta = getCourseQuizAttemptMeta(existingSession?.attemptCount ?? 0)
  if (existingMeta.exhausted) {
    return NextResponse.json({
      error: '本章节测验 3 次重做机会已用完',
      trainingId,
      displayName: project.displayName,
      attempt: existingMeta,
      attemptsExhausted: true,
    }, { status: 403 })
  }

  const selectedIds = existingSession?.questionIds.length
    ? existingSession.questionIds
    : selectQuestionIds(pool, `${payload.userId}|${trainingId}|${eduLevel}`)
  const session = teacherId
    ? await getOrCreateCourseQuizSession({
      trainingId,
      teacherId,
      userId: payload.userId,
      eduLevel,
      questionIds: selectedIds,
    })
    : null
  const attempt = getCourseQuizAttemptMeta(session?.attemptCount ?? 0)
  const selectedRows = selectedIds.length > 0
    ? await db.select().from(questions).where(inArray(questions.questionId, selectedIds))
    : []
  const rowMap = new Map(selectedRows.map(question => [question.questionId, question]))
  const orderedIds = stableShuffle(
    selectedIds.filter(questionId => rowMap.has(questionId)),
    `${payload.userId}|${trainingId}|${eduLevel}|attempt-${attempt.nextAttemptNumber}`,
  )
  const formatted = orderedIds.map(questionId => {
    const question = rowMap.get(questionId)!

    return {
      question_id: question.questionId,
      question_type: question.questionType,
      stem: question.stem,
      difficulty: question.difficulty,
      kp_id: question.kpId,
      points: getCourseQuizQuestionPoints(question.questionType),
      answer_mode: isChoiceQuestionType(question.questionType) ? 'choice' : 'text',
      options: buildOptions(question),
    }
  })

  return NextResponse.json({
    trainingId,
    displayName: project.displayName,
    eduLevel,
    gate,
    quizConfig: {
      title: quizConfig.title,
      description: quizConfig.description,
      questionCount: CHAPTER_QUIZ_TOTAL_COUNT,
      passScore: quizConfig.passScore,
      durationMinutes: Math.max(quizConfig.durationMinutes, 90),
      blueprint: describeCourseQuizBlueprint(),
    },
    attempt,
    questions: formatted,
    total: formatted.length,
  })
}
