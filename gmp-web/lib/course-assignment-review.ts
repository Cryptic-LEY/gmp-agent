import { inArray, or } from 'drizzle-orm'
import { db } from '@/db'
import { questions } from '@/db/schema'
import { extractAssignmentQuestions, type CourseAssignmentQuestion } from '@/lib/course-assignment-questions'
import { isChoiceQuestionType } from '@/lib/course-quiz-blueprint'

export type AssignmentGrader = 'ai' | 'teacher'

export interface AssignmentQuestionWithAnswer extends CourseAssignmentQuestion {
  correctAnswer: string
  explanation: string
}

export interface AssignmentReviewItem extends AssignmentQuestionWithAnswer {
  userAnswer: string
  comment?: string
}

type QuestionRow = typeof questions.$inferSelect

function buildQuestionOptions(question: QuestionRow) {
  if (question.questionType === '判断题') return [{ key: 'A', text: '对' }, { key: 'B', text: '错' }]
  if (!isChoiceQuestionType(question.questionType)) return []
  const keys = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const
  const values = [question.optionA, question.optionB, question.optionC, question.optionD, question.optionE, question.optionF, question.optionG]
  return keys
    .map((key, index) => ({ key, text: values[index] ?? '' }))
    .filter(option => option.text.trim())
}

function normalizeAnswerQuestion(question: CourseAssignmentQuestion, row?: QuestionRow | null): AssignmentQuestionWithAnswer {
  return {
    ...question,
    questionId: question.questionId || row?.questionId,
    questionType: question.questionType || (row?.questionType as CourseAssignmentQuestion['questionType']),
    stem: question.stem || row?.stem || '',
    options: question.options.length > 0 ? question.options : row ? buildQuestionOptions(row) : [],
    correctAnswer: String(question.correctAnswer || row?.correctAnswer || '').trim(),
    explanation: String(question.explanation || row?.explanation || '').trim(),
  }
}

export function stripAssignmentAnswers(question: AssignmentQuestionWithAnswer): CourseAssignmentQuestion {
  const { correctAnswer: _correctAnswer, explanation: _explanation, ...safeQuestion } = question
  return safeQuestion
}

export async function ensureAssignmentSubmissionGraderColumn() {
  const rows = await db.raw.all<{ Field: string }>(
    "SHOW COLUMNS FROM course_assignment_submissions LIKE 'graded_by'",
  )
  if (rows.length > 0) return
  await db.raw.run(
    "ALTER TABLE course_assignment_submissions ADD COLUMN graded_by VARCHAR(32) NOT NULL DEFAULT 'ai' AFTER graded_at",
  )
}

export async function hydrateAssignmentQuestions(description: string | null | undefined) {
  const parsed = extractAssignmentQuestions(description)
  if (parsed.length === 0) return [] as AssignmentQuestionWithAnswer[]

  const ids = parsed.map(question => question.questionId || question.id).filter(Boolean)
  const stems = parsed.map(question => question.stem).filter(Boolean)
  const conditions = []
  if (ids.length > 0) conditions.push(inArray(questions.questionId, ids))
  if (stems.length > 0) conditions.push(inArray(questions.stem, stems))
  const rows = conditions.length > 0
    ? await db.select().from(questions).where(conditions.length === 1 ? conditions[0] : or(...conditions))
    : []

  const byId = new Map(rows.map(row => [row.questionId, row]))
  const byStem = new Map(rows.map(row => [row.stem, row]))

  return parsed.map(question => {
    const row = byId.get(question.questionId || question.id) ?? byStem.get(question.stem)
    return normalizeAnswerQuestion(question, row)
  })
}

export function parseAssignmentAnswerMap(content: string | null | undefined, reviewQuestions: AssignmentQuestionWithAnswer[]) {
  const blocks = String(content ?? '').split(/\n{2,}/)
  const answerMap = new Map<string, string>()

  reviewQuestions.forEach((question, index) => {
    const block = blocks[index] ?? ''
    const match = block.match(/答案[:：]\s*([\s\S]*)$/)
    const answer = match?.[1]?.trim() ?? ''
    answerMap.set(question.id, answer)
    if (question.questionId) answerMap.set(question.questionId, answer)
  })

  return answerMap
}

export function attachSubmissionAnswers(
  reviewQuestions: AssignmentQuestionWithAnswer[],
  content: string | null | undefined,
): AssignmentReviewItem[] {
  const answerMap = parseAssignmentAnswerMap(content, reviewQuestions)
  return reviewQuestions.map(question => ({
    ...question,
    userAnswer: answerMap.get(question.questionId || question.id) ?? answerMap.get(question.id) ?? '',
  }))
}

function parseFeedbackAnswerBlocks(feedback: string | null | undefined) {
  const blocks = String(feedback ?? '')
    .split(/(?=第\s*\d+\s*题)/)
    .map(block => block.trim())
    .filter(Boolean)

  return blocks.map(block => {
    const standardMatch = block.match(/标准答案[:：]\s*([\s\S]*?)(?:\n评语[:：]|\n第\s*\d+\s*题|$)/)
    const commentMatch = block.match(/评语[:：]\s*([\s\S]*)$/)
    return {
      correctAnswer: standardMatch?.[1]?.trim() ?? '',
      explanation: commentMatch?.[1]?.trim() ?? '',
    }
  })
}

function parseSubmissionQuestionBlocks(content: string | null | undefined) {
  return String(content ?? '')
    .split(/\n{2,}/)
    .map((block, index) => {
      const lines = block.split('\n').map(line => line.trim()).filter(Boolean)
      const firstLine = lines[0] ?? ''
      const questionMatch = firstLine.match(/^\s*\d+[.、]\s*【([^】]+)】\s*([\s\S]+)$/)
      const answerMatch = block.match(/答案[:：]\s*([\s\S]*)$/)
      return {
        id: `submitted_${index + 1}`,
        questionType: questionMatch?.[1]?.trim() || '作业题',
        stem: questionMatch?.[2]?.trim() || firstLine || `第 ${index + 1} 题`,
        userAnswer: answerMatch?.[1]?.trim() ?? '',
      }
    })
    .filter(item => item.stem)
}

export function buildSubmissionReviewItems(
  reviewQuestions: AssignmentQuestionWithAnswer[],
  content: string | null | undefined,
  feedback?: string | null,
): AssignmentReviewItem[] {
  if (reviewQuestions.length > 0) {
    const feedbackBlocks = parseFeedbackAnswerBlocks(feedback)
    return attachSubmissionAnswers(reviewQuestions, content).map((item, index) => ({
      ...item,
      comment: feedbackBlocks[index]?.explanation ?? '',
    }))
  }

  const questionBlocks = parseSubmissionQuestionBlocks(content)
  const feedbackBlocks = parseFeedbackAnswerBlocks(feedback)
  return questionBlocks
    .map((question, index) => {
      const answer = feedbackBlocks[index]
      return {
        id: question.id,
        questionType: question.questionType as AssignmentQuestionWithAnswer['questionType'],
        stem: question.stem,
        points: 1,
        options: [],
        correctAnswer: answer?.correctAnswer ?? '',
        explanation: answer?.explanation ?? '',
        comment: answer?.explanation ?? '',
        userAnswer: question.userAnswer,
      }
    })
    .filter(item => item.correctAnswer)
}

export async function buildSubmissionReviewItemsWithFallback(
  reviewQuestions: AssignmentQuestionWithAnswer[],
  content: string | null | undefined,
  feedback?: string | null,
): Promise<AssignmentReviewItem[]> {
  const fromKnownQuestions = buildSubmissionReviewItems(reviewQuestions, content, feedback)
  if (fromKnownQuestions.length > 0) return fromKnownQuestions

  const questionBlocks = parseSubmissionQuestionBlocks(content)
  if (questionBlocks.length === 0) return []
  const stems = questionBlocks.map(question => question.stem).filter(Boolean)
  if (stems.length === 0) return []

  const rows = await db.select().from(questions).where(inArray(questions.stem, stems))
  const byStem = new Map(rows.map(row => [row.stem, row]))

  const reviewItems: AssignmentReviewItem[] = []
  for (const [index, question] of questionBlocks.entries()) {
      const row = byStem.get(question.stem)
      if (!row?.correctAnswer) continue
      reviewItems.push({
        id: `submitted_${index + 1}`,
        questionId: row.questionId,
        questionType: row.questionType as AssignmentQuestionWithAnswer['questionType'],
        stem: row.stem,
        points: 1,
        options: buildQuestionOptions(row),
        correctAnswer: row.correctAnswer,
        explanation: row.explanation ?? '',
        comment: '',
        userAnswer: question.userAnswer,
      })
  }
  return reviewItems
}

export function normalizeGrader(value: string | null | undefined): AssignmentGrader {
  return value === 'teacher' ? 'teacher' : 'ai'
}
