import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { moduleScores, questions, trainingProjects, users } from '@/db/schema'
import { verifyToken } from '@/lib/auth'
import { ensureCourseChapterQuizTable } from '@/lib/course-chapter-quiz'
import { CHAPTER_QUIZ_BLUEPRINT, CHAPTER_QUIZ_TOTAL_COUNT, type CourseQuizQuestionType } from '@/lib/course-quiz-blueprint'
import { courseProjectMatches } from '@/lib/course-project-match'

type Status = 'draft' | 'published'

interface QuizRow {
  training_id: string
  teacher_id: string
  title: string
  description: string | null
  question_count: number
  pass_score: number
  duration_minutes: number
  status: Status
  created_at: string
  updated_at: string
}

function requireTeacher(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  const payload = token ? verifyToken(token) : null
  if (!payload || (payload.role !== 'teacher' && payload.role !== 'admin')) return null
  return payload
}

function chapterQuizQuestionType(questionType: string) {
  return CHAPTER_QUIZ_BLUEPRINT.some(quota => quota.matchTypes.includes(questionType as CourseQuizQuestionType))
}

export async function GET(req: NextRequest) {
  const payload = requireTeacher(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureCourseChapterQuizTable()
  const chapters = await db.select().from(trainingProjects)
  const questionRows = await db.select().from(questions)
  const studentFilters = [eq(users.role, 'student')]
  if (payload.role !== 'admin') studentFilters.push(eq(users.teacherUserId, payload.userId))
  const studentRows = await db.select({
    userId: users.userId,
    studentName: users.displayName,
    studentEmail: users.email,
    className: users.className,
  }).from(users).where(and(...studentFilters))
  const studentIds = new Set(studentRows.map(student => student.userId))
  const scoreRows = await db.select({
    userId: moduleScores.userId,
    trainingId: moduleScores.trainingId,
    score: moduleScores.score,
    completedAt: moduleScores.completedAt,
  }).from(moduleScores)
  const latestScoreByStudentChapter = new Map<string, typeof scoreRows[number]>()
  for (const score of scoreRows) {
    if (!studentIds.has(score.userId)) continue
    const key = `${score.trainingId}:${score.userId}`
    const current = latestScoreByStudentChapter.get(key)
    if (!current || new Date(score.completedAt).getTime() > new Date(current.completedAt).getTime()) {
      latestScoreByStudentChapter.set(key, score)
    }
  }
  const quizRows = payload.role === 'admin'
    ? await db.raw.all<QuizRow>(`SELECT * FROM course_chapter_quizzes`)
    : await db.raw.all<QuizRow>(`SELECT * FROM course_chapter_quizzes WHERE teacher_id = ?`, [payload.userId])
  const quizMap = new Map(quizRows.map(row => [row.training_id, row]))

  return NextResponse.json({
    quizzes: chapters
      .sort((left, right) => left.seqOrder - right.seqOrder)
      .map(chapter => {
        const quiz = quizMap.get(chapter.trainingId)
        const completedScores = studentRows
          .map(student => latestScoreByStudentChapter.get(`${chapter.trainingId}:${student.userId}`))
          .filter((score): score is typeof scoreRows[number] => Boolean(score))
        const completedUserIds = new Set(completedScores.map(score => score.userId))
        const missingStudents = studentRows.filter(student => !completedUserIds.has(student.userId))
        const projectNames = [chapter.kpProjCol, chapter.kpProjUg].filter((value): value is string => Boolean(value))
        const questionPoolCount = questionRows
          .filter(question => question.status === 'active')
          .filter(question => chapterQuizQuestionType(question.questionType))
          .filter(question => projectNames.some(projectName => courseProjectMatches(question.projectName, projectName)))
          .filter(question => {
            if (question.questionType === '判断题') return true
            if (question.questionType !== '单选题' && question.questionType !== '多选题') return true
            return Boolean(question.optionA?.trim() && question.optionB?.trim())
          }).length

        return {
          trainingId: chapter.trainingId,
          displayName: chapter.displayName,
          seqOrder: chapter.seqOrder,
          questionPoolCount,
          studentTotal: studentRows.length,
          completedCount: completedScores.length,
          missingCount: missingStudents.length,
          missingStudents,
          averageScore: completedScores.length > 0
            ? Math.round((completedScores.reduce((sum, score) => sum + Number(score.score ?? 0), 0) / completedScores.length) * 10) / 10
            : 0,
          title: quiz?.title ?? `${chapter.displayName} 章节测验`,
          description: quiz?.description ?? `${chapter.displayName} 的章节学习达成度测验`,
          questionCount: Math.max(CHAPTER_QUIZ_TOTAL_COUNT, Number(quiz?.question_count ?? CHAPTER_QUIZ_TOTAL_COUNT)),
          passScore: Number(quiz?.pass_score ?? 60),
          durationMinutes: Math.max(90, Number(quiz?.duration_minutes ?? 90)),
          status: quiz?.status === 'published' ? 'published' : 'draft',
          updatedAt: quiz?.updated_at ?? null,
        }
      }),
  })
}

export async function POST(req: NextRequest) {
  const payload = requireTeacher(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    trainingId?: string
    title?: string
    description?: string
    questionCount?: number
    passScore?: number
    durationMinutes?: number
    status?: Status
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求体格式错误' }, { status: 400 })
  }

  const trainingId = body.trainingId?.trim()
  if (!trainingId || !/^T(0[1-9]|1[01])$/.test(trainingId)) {
    return NextResponse.json({ error: '无效的章节 ID' }, { status: 400 })
  }

  const [chapter] = await db.select().from(trainingProjects)
    .where(eq(trainingProjects.trainingId, trainingId))
    .limit(1)
  if (!chapter) return NextResponse.json({ error: '课程章节不存在' }, { status: 404 })

  const title = body.title?.trim() || `${chapter.displayName} 章节测验`
  const description = body.description?.trim() || `${chapter.displayName} 的章节学习达成度测验`
  const questionCount = CHAPTER_QUIZ_TOTAL_COUNT
  const passScore = Math.max(1, Math.min(100, Number(body.passScore ?? 60)))
  const durationMinutes = Math.max(30, Math.min(180, Number(body.durationMinutes ?? 90)))
  const status = body.status === 'published' ? 'published' : 'draft'

  await ensureCourseChapterQuizTable()
  await db.raw.run(
    `
      INSERT INTO course_chapter_quizzes
        (training_id, teacher_id, title, description, question_count, pass_score, duration_minutes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        description = VALUES(description),
        question_count = VALUES(question_count),
        pass_score = VALUES(pass_score),
        duration_minutes = VALUES(duration_minutes),
        status = VALUES(status),
        updated_at = CURRENT_TIMESTAMP(3)
    `,
    [trainingId, payload.userId, title, description, questionCount, passScore, durationMinutes, status],
  )

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const payload = requireTeacher(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { trainingId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求体格式错误' }, { status: 400 })
  }

  const trainingId = body.trainingId?.trim()
  if (!trainingId || !/^T(0[1-9]|1[01])$/.test(trainingId)) {
    return NextResponse.json({ error: '无效的章节 ID' }, { status: 400 })
  }

  await ensureCourseChapterQuizTable()
  const existing = payload.role === 'admin'
    ? await db.raw.get<QuizRow>(`SELECT * FROM course_chapter_quizzes WHERE training_id = ? LIMIT 1`, [trainingId])
    : await db.raw.get<QuizRow>(`SELECT * FROM course_chapter_quizzes WHERE training_id = ? AND teacher_id = ?`, [trainingId, payload.userId])
  if (!existing) return NextResponse.json({ error: '章节测验不存在' }, { status: 404 })

  await db.raw.run(
    payload.role === 'admin'
      ? `DELETE FROM course_chapter_quizzes WHERE training_id = ?`
      : `DELETE FROM course_chapter_quizzes WHERE training_id = ? AND teacher_id = ?`,
    payload.role === 'admin' ? [trainingId] : [trainingId, payload.userId],
  )

  return NextResponse.json({ ok: true })
}
