import { NextRequest, NextResponse } from 'next/server'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { kpMastery, moduleScores, questionHistory, questions, trainingProjects } from '@/db/schema'
import { verifyToken } from '@/lib/auth'
import { getPublishedCourseChapterQuiz } from '@/lib/course-chapter-quiz'
import { getCourseQuizGate } from '@/lib/course-quiz-gate'
import { getCourseScopeTeacherId } from '@/lib/course-teacher-scope'

const TARGET_HOURS: Record<string, number> = { college: 48, undergraduate: 54 }

interface AnswerInput {
  question_id: string
  answer: string
}

function toMysqlDateTime(date = new Date()) {
  return date.toISOString().slice(0, 23).replace('T', ' ')
}

function normalizeAnswer(value: string) {
  return (value ?? '').trim().toUpperCase().split('').sort().join('')
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  let body: { trainingId?: string; eduLevel?: string; answers?: AnswerInput[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求体格式错误' }, { status: 400 })
  }

  const { trainingId, eduLevel, answers } = body
  if (!trainingId || !/^T(0[1-9]|1[01])$/.test(trainingId)) {
    return NextResponse.json({ error: '无效的章节 ID' }, { status: 400 })
  }
  if (!eduLevel || !TARGET_HOURS[eduLevel]) {
    return NextResponse.json({ error: '无效的学历层次' }, { status: 400 })
  }
  if (!Array.isArray(answers) || answers.length === 0) {
    return NextResponse.json({ error: '答案不能为空' }, { status: 400 })
  }

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
    }, { status: 403 })
  }

  const gate = await getCourseQuizGate(payload.userId, trainingId, scopeTeacherId)
  if (!gate.unlocked) {
    return NextResponse.json({
      error: '请先浏览完本章节全部 PPT 后再提交章节测验',
      trainingId,
      gate,
    }, { status: 403 })
  }

  const questionIds = answers.map(answer => answer.question_id)
  const questionRows = await db.select().from(questions).where(inArray(questions.questionId, questionIds))
  const questionMap = new Map(questionRows.map(question => [question.questionId, question]))

  let correctCount = 0
  const details: Array<{ qid: string; correct: boolean; userAnswer: string; correctAnswer: string }> = []
  const kpStats = new Map<string, { attempts: number; correct: number }>()

  for (const answer of answers) {
    const question = questionMap.get(answer.question_id)
    if (!question) continue

    const userAnswer = normalizeAnswer(answer.answer)
    const correctAnswer = normalizeAnswer(question.correctAnswer)
    const correct = userAnswer.length > 0 && userAnswer === correctAnswer
    if (correct) correctCount += 1

    details.push({
      qid: question.questionId,
      correct,
      userAnswer: answer.answer,
      correctAnswer: question.correctAnswer,
    })

    await db.insert(questionHistory).values({
      userId: payload.userId,
      questionId: question.questionId,
      userAnswer: answer.answer,
      isCorrect: correct,
    })

    if (question.kpId) {
      const stat = kpStats.get(question.kpId) ?? { attempts: 0, correct: 0 }
      stat.attempts += 1
      if (correct) stat.correct += 1
      kpStats.set(question.kpId, stat)
    }
  }

  for (const [kpId, stat] of kpStats.entries()) {
    const [existing] = await db.select().from(kpMastery)
      .where(and(eq(kpMastery.userId, payload.userId), eq(kpMastery.kpId, kpId)))
      .limit(1)
    const attemptCount = (existing?.attemptCount ?? 0) + stat.attempts
    const correctTotal = (existing?.correctCount ?? 0) + stat.correct
    const confidence = attemptCount > 0 ? correctTotal / attemptCount : 0

    if (existing) {
      await db.update(kpMastery)
        .set({
          attemptCount,
          correctCount: correctTotal,
          confidence,
          lastTestedAt: toMysqlDateTime(),
        })
        .where(and(eq(kpMastery.userId, payload.userId), eq(kpMastery.kpId, kpId)))
    } else {
      await db.insert(kpMastery).values({
        userId: payload.userId,
        kpId,
        attemptCount,
        correctCount: correctTotal,
        confidence,
        lastTestedAt: toMysqlDateTime(),
      })
    }
  }

  const score = answers.length > 0 ? Math.round((correctCount / answers.length) * 100) : 0
  const projectHours = eduLevel === 'undergraduate' ? (project.hoursUg ?? 0) : (project.hoursCollege ?? 0)
  const allProjects = await db.select().from(trainingProjects)
  const totalProjectHours = allProjects.reduce(
    (sum, item) => sum + (eduLevel === 'undergraduate' ? (item.hoursUg ?? 0) : (item.hoursCollege ?? 0)),
    0,
  )
  const maxHours = totalProjectHours > 0 ? (projectHours / totalProjectHours) * TARGET_HOURS[eduLevel] : 0
  const earnedHours = Number((maxHours * (score / 100)).toFixed(2))

  await db.insert(moduleScores).values({
    userId: payload.userId,
    trainingId,
    eduLevel,
    score,
    earnedHours,
  })

  return NextResponse.json({
    trainingId,
    score,
    correctCount,
    totalCount: answers.length,
    earnedHours,
    maxHours: Number(maxHours.toFixed(2)),
    passScore: quizConfig.passScore,
    passed: score >= quizConfig.passScore,
    details,
  })
}
