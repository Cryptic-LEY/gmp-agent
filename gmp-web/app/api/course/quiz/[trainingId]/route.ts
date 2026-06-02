import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { learningPlans, questions, trainingProjects } from '@/db/schema'
import { verifyToken } from '@/lib/auth'
import { getPublishedCourseChapterQuiz } from '@/lib/course-chapter-quiz'
import { getCourseQuizGate } from '@/lib/course-quiz-gate'
import { getCourseScopeTeacherId } from '@/lib/course-teacher-scope'

const OBJECTIVE_TYPES = ['单选题', '多选题', '判断题']

function shuffle<T>(items: T[]) {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
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

  const pool = (await db.select().from(questions)
    .where(and(eq(questions.status, 'active'), eq(questions.eduLevel, eduLevel))))
    .filter(question => OBJECTIVE_TYPES.includes(question.questionType))
    .filter(question => question.projectName === projectName)
    .filter(question => {
      if (question.questionType === '判断题') return true
      return Boolean(question.optionA?.trim() && question.optionB?.trim())
    })

  const medium = shuffle(pool.filter(question => question.difficulty === '中'))
  const hard = shuffle(pool.filter(question => question.difficulty === '难'))
  const easy = shuffle(pool.filter(question => question.difficulty === '易'))

  const questionLimit = Math.max(1, Math.min(50, quizConfig.questionCount || 10))
  const mediumTake = Math.ceil(questionLimit * 0.6)
  const hardTake = Math.max(0, questionLimit - mediumTake)
  let selected = [...medium.slice(0, mediumTake), ...hard.slice(0, hardTake)]
  if (selected.length < questionLimit) {
    selected = [...selected, ...medium.slice(mediumTake), ...hard.slice(hardTake), ...easy].slice(0, questionLimit)
  }

  const formatted = shuffle(selected).slice(0, questionLimit).map(question => {
    const optionKeys = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const
    const optionFields = [question.optionA, question.optionB, question.optionC, question.optionD, question.optionE, question.optionF, question.optionG]
    const options = question.questionType === '判断题'
      ? [{ key: 'A', text: '对' }, { key: 'B', text: '错' }]
      : optionKeys
        .map((key, index) => ({ key, text: optionFields[index] ?? '' }))
        .filter(option => option.text)

    return {
      question_id: question.questionId,
      question_type: question.questionType,
      stem: question.stem,
      difficulty: question.difficulty,
      kp_id: question.kpId,
      options,
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
      questionCount: quizConfig.questionCount,
      passScore: quizConfig.passScore,
      durationMinutes: quizConfig.durationMinutes,
    },
    questions: formatted,
    total: formatted.length,
  })
}
