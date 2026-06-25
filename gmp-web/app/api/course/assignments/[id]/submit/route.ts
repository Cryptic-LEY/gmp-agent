import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { courseAssignments, courseAssignmentSubmissions, learningPlans, questionHistory, questions, trainingProjects } from '@/db/schema'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { canUseTeacherResource } from '@/lib/course-teacher-scope'
import { getCourseAssignmentQuestionPoints, isChoiceQuestionType, isSubjectiveQuestionType } from '@/lib/course-quiz-blueprint'
import { getCourseComponentMaxHours, hoursToCourseCredits, scoreToEarnedHours } from '@/lib/course-hours'
import { ensureAssignmentSubmissionGraderColumn, hydrateAssignmentQuestions } from '@/lib/course-assignment-review'

const AGENT_API_URL = (process.env.AGENT_API_URL ?? process.env.GMP_API_URL ?? 'http://127.0.0.1:8001').replace(/\/+$/, '')

type InsertResult = { insertId?: number | string }

interface AnswerInput {
  question_id: string
  answer: string
}

interface AiGrade {
  score: number
  passed: boolean
  comment: string
  suggestion?: string
}

function toMysqlDateTime(date = new Date()) {
  return date.toISOString().slice(0, 23).replace('T', ' ')
}

function parseMysqlDateTime(value: string | null) {
  if (!value) return null
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
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
  const terms = String(referenceAnswer ?? '')
    .split(/[，。；;、,.!?！？\n\s]+/)
    .map(item => item.trim())
    .filter(item => item.length >= 2)
    .slice(0, 12)
    .map(normalizeTextAnswer)
    .filter(Boolean)
  if (!answer || terms.length === 0) return { score: 0, comment: '未能匹配到有效作答要点。' }
  const hitCount = terms.filter(term => answer.includes(term)).length
  const coverage = hitCount / terms.length
  const lengthBonus = studentAnswer.trim().length >= 80 ? 0.15 : studentAnswer.trim().length >= 40 ? 0.08 : 0
  const score = Math.max(0, Math.min(100, Math.round((coverage + lengthBonus) * 100)))
  return {
    score,
    comment: score >= 60 ? '已覆盖主要参考要点。' : '作答要点覆盖不足，建议补充法规依据、风险分析和处理措施。',
  }
}

function rowOptions(question: typeof questions.$inferSelect) {
  if (question.questionType === '判断题') return [{ key: 'A', text: '对' }, { key: 'B', text: '错' }]
  const values = [question.optionA, question.optionB, question.optionC, question.optionD, question.optionE, question.optionF, question.optionG]
  return ['A', 'B', 'C', 'D', 'E', 'F', 'G']
    .map((key, index) => ({ key, text: values[index] ?? '' }))
    .filter(option => option.text.trim())
}

async function gradeStructuredAnswers(answerInputs: AnswerInput[], userId: string, assignmentDescription: string) {
  const questionIds = answerInputs.map(answer => answer.question_id).filter(Boolean)
  if (questionIds.length === 0) return null
  const [questionRows, hydratedQuestions] = await Promise.all([
    db.select().from(questions).where(inArray(questions.questionId, questionIds)),
    hydrateAssignmentQuestions(assignmentDescription),
  ])
  const questionMap = new Map(questionRows.map(question => [question.questionId, question]))
  const hydratedMap = new Map(hydratedQuestions.flatMap(question => [
    [question.id, question],
    question.questionId ? [question.questionId, question] : null,
  ].filter((entry): entry is [string, typeof question] => Boolean(entry))))
  const answerMap = new Map(answerInputs.map(answer => [answer.question_id, String(answer.answer ?? '')]))
  let earnedPoints = 0
  let maxPoints = 0
  const feedbackLines: string[] = []

  for (const [index, questionId] of questionIds.entries()) {
    const questionRow = questionMap.get(questionId)
    const hydrated = hydratedMap.get(questionId)
    if (!questionRow && !hydrated) continue
    const question = questionRow
      ? {
        questionId: questionRow.questionId,
        questionType: questionRow.questionType,
        stem: questionRow.stem,
        correctAnswer: questionRow.correctAnswer,
        options: rowOptions(questionRow),
      }
      : {
        questionId: hydrated!.questionId || hydrated!.id,
        questionType: hydrated!.questionType,
        stem: hydrated!.stem,
        correctAnswer: hydrated!.correctAnswer,
        options: hydrated!.options,
      }
    const rawAnswer = answerMap.get(questionId) ?? ''
    const points = getCourseAssignmentQuestionPoints(question.questionType)
    maxPoints += points

    let ratio = 0
    let comment = ''
    if (isChoiceQuestionType(question.questionType)) {
      ratio = normalizeChoiceAnswer(rawAnswer) === normalizeChoiceAnswer(question.correctAnswer) ? 1 : 0
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

    const score = Number((points * ratio).toFixed(2))
    earnedPoints += score
    feedbackLines.push([
      `第 ${index + 1} 题【${question.questionType}】${score}/${points}`,
      `标准答案：${question.correctAnswer || '暂无标准答案'}`,
      comment ? `评语：${comment}` : '',
    ].filter(Boolean).join('\n'))

    if (question.questionId) {
      await db.insert(questionHistory).values({
        userId,
        questionId: question.questionId,
        userAnswer: rawAnswer,
        isCorrect: ratio >= 0.6,
        reviewed: false,
      })
    }
  }

  if (maxPoints <= 0) return null
  return {
    score: Math.round((earnedPoints / maxPoints) * 100),
    feedback: feedbackLines.join('\n'),
  }
}

async function gradePlainAssignment(requirement: string, content: string) {
  const aiGrade = await gradeWithAi(requirement, content, requirement, '作业')
  if (aiGrade) {
    return {
      score: Math.max(0, Math.min(100, Math.round(Number(aiGrade.score ?? 0)))),
      feedback: aiGrade.comment || aiGrade.suggestion || 'AI 已完成批改。',
    }
  }
  const lengthScore = content.trim().length >= 400 ? 85 : content.trim().length >= 200 ? 75 : content.trim().length >= 80 ? 65 : 45
  return {
    score: lengthScore,
    feedback: lengthScore >= 60 ? 'AI 服务暂不可用，系统已根据作答完整度给出临时评分。' : '作答内容偏少，建议补充法规依据、风险分析和 CAPA 思路。',
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  const { userId } = payload

  const { id } = await context.params
  const assignmentId = Number.parseInt(id, 10)
  if (Number.isNaN(assignmentId)) {
    return NextResponse.json({ error: '无效的作业 ID' }, { status: 400 })
  }

  let body: { content?: string; answers?: AnswerInput[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求体格式错误' }, { status: 400 })
  }

  if (!body.content?.trim() && (!Array.isArray(body.answers) || body.answers.length === 0)) {
    return NextResponse.json({ error: '提交内容不能为空' }, { status: 400 })
  }

  const assignment = (await db
    .select()
    .from(courseAssignments)
    .where(eq(courseAssignments.id, assignmentId))
    .limit(1))[0]

  if (!assignment) return NextResponse.json({ error: '作业不存在' }, { status: 404 })
  if (!(await canUseTeacherResource(payload, assignment.teacherId))) {
    return NextResponse.json({ error: '作业不存在' }, { status: 404 })
  }

  await ensureAssignmentSubmissionGraderColumn()

  const dueDate = parseMysqlDateTime(assignment.dueDate)
  if (dueDate && dueDate < new Date()) {
    return NextResponse.json({ error: '作业已截止' }, { status: 400 })
  }

  const existing = (await db
    .select()
    .from(courseAssignmentSubmissions)
    .where(and(
      eq(courseAssignmentSubmissions.assignmentId, assignmentId),
      eq(courseAssignmentSubmissions.userId, userId),
    ))
    .limit(1))[0]

  if (existing?.score !== null && existing?.score !== undefined) {
    return NextResponse.json({ error: '作业已由 AI 批改，不能重做' }, { status: 400 })
  }

  const grading = Array.isArray(body.answers) && body.answers.length > 0
    ? await gradeStructuredAnswers(body.answers, userId, assignment.description)
    : null
  const finalGrade = grading ?? await gradePlainAssignment(assignment.description, body.content?.trim() ?? '')
  const score = Math.max(0, Math.min(assignment.maxScore, Math.round((finalGrade.score / 100) * assignment.maxScore)))
  const normalizedScore = assignment.maxScore > 0 ? Math.round((score / assignment.maxScore) * 100) : finalGrade.score
  const [latestPlan] = await db.select().from(learningPlans)
    .where(eq(learningPlans.userId, userId))
    .orderBy(desc(learningPlans.createdAt))
    .limit(1)
  const eduLevel = latestPlan?.eduLevel === 'undergraduate' ? 'undergraduate' : 'college'
  const allProjects = await db.select().from(trainingProjects)
  const maxHours = getCourseComponentMaxHours(allProjects, assignment.trainingId, eduLevel, 'assignment')
  const earnedHours = scoreToEarnedHours(maxHours, normalizedScore)
  const earnedCredits = hoursToCourseCredits(earnedHours, eduLevel)
  const gradedAt = toMysqlDateTime()

  if (existing) {
    await db
      .update(courseAssignmentSubmissions)
      .set({
        content: body.content?.trim() || '',
        submittedAt: toMysqlDateTime(),
        score,
        gradedAt,
        gradedBy: 'ai',
        feedback: finalGrade.feedback,
      })
      .where(eq(courseAssignmentSubmissions.id, existing.id))

    return NextResponse.json({ id: existing.id, updated: true, score, feedback: finalGrade.feedback, earnedHours, earnedCredits, gradedBy: 'ai' })
  }

  const result = await db.raw.run(
    `
      INSERT INTO course_assignment_submissions
        (assignment_id, user_id, content, score, feedback, graded_at, graded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [assignmentId, userId, body.content?.trim() || '', score, finalGrade.feedback, gradedAt, 'ai'],
  ) as InsertResult

  return NextResponse.json({ id: Number(result.insertId ?? 0), updated: false, score, feedback: finalGrade.feedback, earnedHours, earnedCredits, gradedBy: 'ai' })
}
