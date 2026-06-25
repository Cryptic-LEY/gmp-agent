import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { trainingProjects } from '@/db/schema'
import { verifyToken } from '@/lib/auth'
import { getCourseAiQuestionPrefix } from '@/lib/course-ai-automation'
import { type CourseQuizQuestionType, isChoiceQuestionType } from '@/lib/course-quiz-blueprint'

export const runtime = 'nodejs'

type EduLevel = 'college' | 'undergraduate'

const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const
const QUESTION_TYPES: CourseQuizQuestionType[] = ['单选题', '多选题', '判断题', '填空题', '简答题', '综合分析题', '案例分析题']

interface QuestionRow {
  question_id: string
  question_type: CourseQuizQuestionType
  stem: string
  correct_answer: string
  difficulty: string
  option_a: string | null
  option_b: string | null
  option_c: string | null
  option_d: string | null
  option_e: string | null
  option_f: string | null
  option_g: string | null
  explanation: string | null
  project_name: string | null
  edu_level: EduLevel | string | null
}

function requireTeacher(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  const payload = token ? verifyToken(token) : null
  if (!payload || (payload.role !== 'teacher' && payload.role !== 'admin')) return null
  return payload
}

function normalizeEduLevel(value: unknown): EduLevel {
  return value === 'undergraduate' ? 'undergraduate' : 'college'
}

function normalizeQuestionType(value: unknown): CourseQuizQuestionType {
  const text = String(value ?? '')
  return QUESTION_TYPES.includes(text as CourseQuizQuestionType) ? text as CourseQuizQuestionType : '单选题'
}

function normalizeDifficulty(value: unknown) {
  const text = String(value ?? '中')
  return text === '易' || text === '难' ? text : '中'
}

function normalizeOptions(questionType: CourseQuizQuestionType, options: unknown) {
  if (questionType === '判断题') return [{ key: 'A', text: '对' }, { key: 'B', text: '错' }]
  if (!isChoiceQuestionType(questionType)) return []
  if (!Array.isArray(options)) return []

  return options
    .map((option, index) => {
      const source = option as { key?: unknown; text?: unknown }
      const key = String(source.key ?? OPTION_KEYS[index] ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1)
      const text = String(source.text ?? '').trim()
      return key && text ? { key, text } : null
    })
    .filter((option): option is { key: string; text: string } => Boolean(option))
    .filter((option, index, arr) => arr.findIndex(item => item.key === option.key) === index)
    .slice(0, OPTION_KEYS.length)
}

function normalizeAnswer(questionType: CourseQuizQuestionType, answer: unknown, options: Array<{ key: string; text: string }>) {
  const text = String(answer ?? '').trim()
  if (!isChoiceQuestionType(questionType)) return text || '参考答案由教师补充。'
  const available = new Set(options.map(option => option.key))
  const letters = text.toUpperCase().replace(/[^A-Z]/g, '').split('').filter((letter, index, arr) => available.has(letter) && arr.indexOf(letter) === index)
  if (questionType === '多选题') return letters.sort().join('') || options.slice(0, 2).map(option => option.key).join('')
  if (questionType === '判断题') return letters.includes('B') ? 'B' : 'A'
  return letters[0] ?? options[0]?.key ?? 'A'
}

function rowToQuestion(row: QuestionRow) {
  const values = [row.option_a, row.option_b, row.option_c, row.option_d, row.option_e, row.option_f, row.option_g]
  return {
    questionId: row.question_id,
    eduLevel: row.edu_level === 'undergraduate' ? 'undergraduate' : 'college',
    questionType: row.question_type,
    stem: row.stem,
    correctAnswer: row.correct_answer,
    difficulty: row.difficulty || '中',
    explanation: row.explanation ?? '',
    projectName: row.project_name ?? '',
    options: OPTION_KEYS
      .map((key, index) => ({ key, text: values[index] ?? '' }))
      .filter(option => option.text.trim()),
  }
}

function ownsQuestion(questionId: string, teacherId: string, trainingId: string) {
  const collegePrefix = getCourseAiQuestionPrefix(teacherId, trainingId, 'college')
  const undergraduatePrefix = getCourseAiQuestionPrefix(teacherId, trainingId, 'undergraduate')
  return questionId.startsWith(collegePrefix) || questionId.startsWith(undergraduatePrefix)
}

export async function GET(req: NextRequest, context: { params: Promise<{ trainingId: string }> }) {
  const payload = requireTeacher(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { trainingId } = await context.params
  if (!/^T(0[1-9]|1[01])$/.test(trainingId)) return NextResponse.json({ error: '无效的章节 ID' }, { status: 400 })
  if (payload.role === 'admin') return NextResponse.json({ error: '管理员请使用教师账号管理章节题目' }, { status: 403 })

  const collegePrefix = getCourseAiQuestionPrefix(payload.userId, trainingId, 'college')
  const undergraduatePrefix = getCourseAiQuestionPrefix(payload.userId, trainingId, 'undergraduate')
  const rows = await db.raw.all<QuestionRow>(
    `
      SELECT question_id, question_type, stem, correct_answer, difficulty,
        option_a, option_b, option_c, option_d, option_e, option_f, option_g,
        explanation, project_name, edu_level
      FROM questions
      WHERE status = 'active'
        AND (question_id LIKE ? OR question_id LIKE ?)
      ORDER BY FIELD(edu_level, 'college', 'undergraduate'), question_type, question_id
    `,
    [`${collegePrefix}%`, `${undergraduatePrefix}%`],
  )

  return NextResponse.json({ questions: rows.map(rowToQuestion) })
}

export async function POST(req: NextRequest, context: { params: Promise<{ trainingId: string }> }) {
  const payload = requireTeacher(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role === 'admin') return NextResponse.json({ error: '管理员请使用教师账号管理章节题目' }, { status: 403 })

  const { trainingId } = await context.params
  if (!/^T(0[1-9]|1[01])$/.test(trainingId)) return NextResponse.json({ error: '无效的章节 ID' }, { status: 400 })

  const [chapter] = await db.select().from(trainingProjects).where(eq(trainingProjects.trainingId, trainingId)).limit(1)
  if (!chapter) return NextResponse.json({ error: '课程章节不存在' }, { status: 404 })

  let body: {
    questionId?: string
    eduLevel?: EduLevel
    questionType?: CourseQuizQuestionType
    stem?: string
    correctAnswer?: string
    difficulty?: string
    explanation?: string
    options?: Array<{ key: string; text: string }>
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求体格式错误' }, { status: 400 })
  }

  const eduLevel = normalizeEduLevel(body.eduLevel)
  const questionType = normalizeQuestionType(body.questionType)
  const stem = String(body.stem ?? '').trim()
  if (!stem) return NextResponse.json({ error: '题干不能为空' }, { status: 400 })

  const options = normalizeOptions(questionType, body.options)
  if (isChoiceQuestionType(questionType) && options.length < 2) {
    return NextResponse.json({ error: '选择/判断题至少需要 2 个选项' }, { status: 400 })
  }

  const prefix = getCourseAiQuestionPrefix(payload.userId, trainingId, eduLevel)
  const questionId = body.questionId && ownsQuestion(body.questionId, payload.userId, trainingId)
    ? body.questionId
    : `${prefix}manual_${randomUUID().replace(/-/g, '').slice(0, 12)}`
  const correctAnswer = normalizeAnswer(questionType, body.correctAnswer, options)
  const optionValues = OPTION_KEYS.map(key => options.find(option => option.key === key)?.text ?? null)
  const projectName = eduLevel === 'undergraduate' ? chapter.kpProjUg : chapter.kpProjCol

  await db.raw.run(
    `
      INSERT INTO questions (
        question_id, kp_id, question_type, stem, correct_answer, difficulty, option_count,
        option_a, option_b, option_c, option_d, option_e, option_f, option_g,
        explanation, project_name, edu_level, status
      )
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      ON DUPLICATE KEY UPDATE
        question_type = VALUES(question_type),
        stem = VALUES(stem),
        correct_answer = VALUES(correct_answer),
        difficulty = VALUES(difficulty),
        option_count = VALUES(option_count),
        option_a = VALUES(option_a),
        option_b = VALUES(option_b),
        option_c = VALUES(option_c),
        option_d = VALUES(option_d),
        option_e = VALUES(option_e),
        option_f = VALUES(option_f),
        option_g = VALUES(option_g),
        explanation = VALUES(explanation),
        project_name = VALUES(project_name),
        edu_level = VALUES(edu_level),
        status = 'active'
    `,
    [
      questionId,
      questionType,
      stem,
      correctAnswer,
      normalizeDifficulty(body.difficulty),
      options.length,
      optionValues[0],
      optionValues[1],
      optionValues[2],
      optionValues[3],
      optionValues[4],
      optionValues[5],
      optionValues[6],
      String(body.explanation ?? '').trim(),
      projectName,
      eduLevel,
    ],
  )

  const row = await db.raw.get<QuestionRow>(
    `
      SELECT question_id, question_type, stem, correct_answer, difficulty,
        option_a, option_b, option_c, option_d, option_e, option_f, option_g,
        explanation, project_name, edu_level
      FROM questions
      WHERE question_id = ?
    `,
    [questionId],
  )

  return NextResponse.json({ question: row ? rowToQuestion(row) : null })
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ trainingId: string }> }) {
  const payload = requireTeacher(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role === 'admin') return NextResponse.json({ error: '管理员请使用教师账号管理章节题目' }, { status: 403 })

  const { trainingId } = await context.params
  let body: { questionId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求体格式错误' }, { status: 400 })
  }

  const questionId = String(body.questionId ?? '')
  if (!questionId || !ownsQuestion(questionId, payload.userId, trainingId)) {
    return NextResponse.json({ error: '只能删除本章节自动生成的题目' }, { status: 403 })
  }

  await db.raw.run('DELETE FROM questions WHERE question_id = ?', [questionId])
  return NextResponse.json({ ok: true })
}
