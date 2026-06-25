import { NextRequest, NextResponse } from 'next/server'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { kpMastery, moduleScores, questionHistory, questions, trainingProjects } from '@/db/schema'
import { verifyToken } from '@/lib/auth'
import { getPublishedCourseChapterQuiz } from '@/lib/course-chapter-quiz'
import { getCourseQuizGate } from '@/lib/course-quiz-gate'
import { getCourseScopeTeacherId } from '@/lib/course-teacher-scope'
import {
  CHAPTER_QUIZ_TOTAL_POINTS,
  getCourseQuizQuestionPoints,
  isChoiceQuestionType,
  isSubjectiveQuestionType,
} from '@/lib/course-quiz-blueprint'
import {
  getCourseQuizAttemptMeta,
  getCourseQuizSession,
  incrementCourseQuizAttempt,
} from '@/lib/course-quiz-session'
import { hoursToCourseCredits, getCourseComponentMaxHours, scoreToEarnedHours } from '@/lib/course-hours'

const AGENT_API_URL = (process.env.AGENT_API_URL ?? process.env.GMP_API_URL ?? 'http://127.0.0.1:8001').replace(/\/+$/, '')

interface AnswerInput {
  question_id: string
  answer: string
}

interface AiGrade {
  score: number
  passed: boolean
  comment: string
  strengths?: string[]
  issues?: string[]
  suggestion?: string
}

function toMysqlDateTime(date = new Date()) {
  return date.toISOString().slice(0, 23).replace('T', ' ')
}

function normalizeChoiceAnswer(value: string) {
  return (value ?? '').trim().toUpperCase().split('').sort().join('')
}

function normalizeTextAnswer(value: string) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[，。；;、,.!?！？：:\s"'“”‘’（）()[\]{}<>《》\-—_]/g, '')
}

function splitReferenceAnswers(value: string) {
  return String(value ?? '')
    .split(/\n|[|｜;；、]/)
    .map(item => item.trim())
    .filter(Boolean)
}

function gradeFillAnswer(userAnswer: string, referenceAnswer: string) {
  const userText = normalizeTextAnswer(userAnswer)
  const references = splitReferenceAnswers(referenceAnswer).map(normalizeTextAnswer).filter(Boolean)
  if (!userText || references.length === 0) return 0
  if (references.some(reference => userText === reference || userText.includes(reference) || reference.includes(userText))) return 100
  return 0
}

async function gradeWithAi(question: string, studentAnswer: string, referenceAnswer: string, questionType: string): Promise<AiGrade | null> {
  try {
    const response = await fetch(`${AGENT_API_URL}/practice/grade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        student_answer: studentAnswer,
        reference_answer: referenceAnswer,
        question_type: questionType,
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) return null
    return await response.json() as AiGrade
  } catch {
    return null
  }
}

function gradeSubjectiveFallback(studentAnswer: string, referenceAnswer: string) {
  const answer = normalizeTextAnswer(studentAnswer)
  const references = splitReferenceAnswers(referenceAnswer)
  const terms = references.length > 1
    ? references
    : String(referenceAnswer ?? '')
      .split(/[，。；;、,.!?！？\n\s]+/)
      .map(item => item.trim())
      .filter(item => item.length >= 2)
      .slice(0, 12)

  const normalizedTerms = terms.map(normalizeTextAnswer).filter(Boolean)
  if (!answer || normalizedTerms.length === 0) return { score: 0, comment: '未能匹配到有效作答要点。' }

  const hitCount = normalizedTerms.filter(term => answer.includes(term)).length
  const coverage = hitCount / normalizedTerms.length
  const lengthBonus = studentAnswer.trim().length >= 80 ? 0.15 : studentAnswer.trim().length >= 40 ? 0.08 : 0
  const score = Math.max(0, Math.min(100, Math.round((coverage + lengthBonus) * 100)))
  return {
    score,
    comment: score >= 60 ? '已覆盖主要参考要点。' : '作答要点覆盖不足，建议补充法规依据、风险分析和处理措施。',
  }
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
  if (!eduLevel || (eduLevel !== 'college' && eduLevel !== 'undergraduate')) {
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

  const teacherId = quizConfig.teacherId || scopeTeacherId
  if (!teacherId) {
    return NextResponse.json({ error: '缺少章节测验教师范围，请重新进入课程页面' }, { status: 400 })
  }

  const session = await getCourseQuizSession({
    trainingId,
    teacherId,
    userId: payload.userId,
    eduLevel,
  })
  if (!session?.questionIds.length) {
    return NextResponse.json({ error: '请重新进入测验页面获取固定题组后再提交' }, { status: 400 })
  }

  const attemptMeta = getCourseQuizAttemptMeta(session.attemptCount)
  if (attemptMeta.exhausted) {
    return NextResponse.json({
      error: '本章节测验 3 次重做机会已用完',
      trainingId,
      attempt: attemptMeta,
      attemptsExhausted: true,
    }, { status: 403 })
  }

  const answerMap = new Map(answers.map(answer => [answer.question_id, String(answer.answer ?? '')]))
  const questionIds = session.questionIds
  const questionRows = await db.select().from(questions).where(inArray(questions.questionId, questionIds))
  const questionMap = new Map(questionRows.map(question => [question.questionId, question]))

  let correctCount = 0
  let earnedPoints = 0
  let maxPoints = 0
  const details: Array<{
    qid: string
    correct: boolean
    userAnswer: string
    correctAnswer: string
    score: number
    maxScore: number
    comment?: string
  }> = []
  const kpStats = new Map<string, { attempts: number; correct: number }>()

  for (const questionId of questionIds) {
    const question = questionMap.get(questionId)
    if (!question) continue

    const rawAnswer = answerMap.get(question.questionId) ?? ''
    const questionPoints = getCourseQuizQuestionPoints(question.questionType)
    maxPoints += questionPoints

    let ratio = 0
    let comment = ''
    if (isChoiceQuestionType(question.questionType)) {
      const userAnswer = normalizeChoiceAnswer(rawAnswer)
      const correctAnswer = normalizeChoiceAnswer(question.correctAnswer)
      ratio = userAnswer.length > 0 && userAnswer === correctAnswer ? 1 : 0
    } else if (question.questionType === '填空题') {
      ratio = gradeFillAnswer(rawAnswer, question.correctAnswer) / 100
    } else if (isSubjectiveQuestionType(question.questionType)) {
      const aiGrade = rawAnswer.trim()
        ? await gradeWithAi(question.stem, rawAnswer, question.correctAnswer, question.questionType)
        : null
      if (aiGrade) {
        ratio = Math.max(0, Math.min(100, Number(aiGrade.score ?? 0))) / 100
        comment = aiGrade.comment || aiGrade.suggestion || ''
      } else {
        const fallbackGrade = gradeSubjectiveFallback(rawAnswer, question.correctAnswer)
        ratio = fallbackGrade.score / 100
        comment = fallbackGrade.comment
      }
    }

    const questionScore = Number((questionPoints * ratio).toFixed(2))
    earnedPoints += questionScore
    const passedQuestion = ratio >= 0.6
    if (passedQuestion) correctCount += 1

    details.push({
      qid: question.questionId,
      correct: passedQuestion,
      userAnswer: rawAnswer,
      correctAnswer: question.correctAnswer,
      score: questionScore,
      maxScore: questionPoints,
      comment,
    })

    await db.insert(questionHistory).values({
      userId: payload.userId,
      questionId: question.questionId,
      userAnswer: rawAnswer,
      isCorrect: passedQuestion,
    })

    if (question.kpId) {
      const stat = kpStats.get(question.kpId) ?? { attempts: 0, correct: 0 }
      stat.attempts += 1
      if (passedQuestion) stat.correct += 1
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

  const score = maxPoints > 0
    ? Math.round((earnedPoints / maxPoints) * 100)
    : Math.round((earnedPoints / CHAPTER_QUIZ_TOTAL_POINTS) * 100)
  const allProjects = await db.select().from(trainingProjects)
  const maxHours = getCourseComponentMaxHours(allProjects, trainingId, eduLevel, 'quiz')
  const earnedHours = scoreToEarnedHours(maxHours, score)
  const maxCredits = hoursToCourseCredits(maxHours, eduLevel)
  const earnedCredits = hoursToCourseCredits(earnedHours, eduLevel)

  await db.insert(moduleScores).values({
    userId: payload.userId,
    trainingId,
    eduLevel,
    score,
    earnedHours,
  })
  await incrementCourseQuizAttempt(session.id)
  const updatedAttempt = getCourseQuizAttemptMeta(session.attemptCount + 1)

  return NextResponse.json({
    trainingId,
    score,
    correctCount,
    totalCount: questionRows.length,
    earnedPoints: Number(earnedPoints.toFixed(2)),
    maxPoints: Number(maxPoints.toFixed(2)),
    earnedHours,
    earnedCredits,
    maxHours: Number(maxHours.toFixed(2)),
    maxCredits,
    passScore: quizConfig.passScore,
    passed: score >= quizConfig.passScore,
    attempt: updatedAttempt,
    details,
  })
}
