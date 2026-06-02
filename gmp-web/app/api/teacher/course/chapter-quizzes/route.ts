import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { questions, trainingProjects } from '@/db/schema'
import { verifyToken } from '@/lib/auth'
import { ensureCourseChapterQuizTable } from '@/lib/course-chapter-quiz'

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

function objectiveQuestionCount(questionType: string) {
  return ['单选题', '多选题', '判断题'].includes(questionType)
}

export async function GET(req: NextRequest) {
  const payload = requireTeacher(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureCourseChapterQuizTable()
  const chapters = await db.select().from(trainingProjects)
  const questionRows = await db.select().from(questions)
  const quizRows = payload.role === 'admin'
    ? await db.raw.all<QuizRow>(`SELECT * FROM course_chapter_quizzes`)
    : await db.raw.all<QuizRow>(`SELECT * FROM course_chapter_quizzes WHERE teacher_id = ?`, [payload.userId])
  const quizMap = new Map(quizRows.map(row => [row.training_id, row]))

  return NextResponse.json({
    quizzes: chapters
      .sort((left, right) => left.seqOrder - right.seqOrder)
      .map(chapter => {
        const quiz = quizMap.get(chapter.trainingId)
        const projectNames = [chapter.kpProjCol, chapter.kpProjUg].filter((value): value is string => Boolean(value))
        const questionPoolCount = questionRows
          .filter(question => question.status === 'active')
          .filter(question => objectiveQuestionCount(question.questionType))
          .filter(question => Boolean(question.projectName) && projectNames.includes(question.projectName!))
          .filter(question => {
            if (question.questionType === '判断题') return true
            return Boolean(question.optionA?.trim() && question.optionB?.trim())
          }).length

        return {
          trainingId: chapter.trainingId,
          displayName: chapter.displayName,
          seqOrder: chapter.seqOrder,
          questionPoolCount,
          title: quiz?.title ?? `${chapter.displayName} 章节测验`,
          description: quiz?.description ?? `${chapter.displayName} 的章节学习达成度测验`,
          questionCount: Number(quiz?.question_count ?? 10),
          passScore: Number(quiz?.pass_score ?? 60),
          durationMinutes: Number(quiz?.duration_minutes ?? 30),
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
  const questionCount = Math.max(1, Math.min(50, Number(body.questionCount ?? 10)))
  const passScore = Math.max(1, Math.min(100, Number(body.passScore ?? 60)))
  const durationMinutes = Math.max(5, Math.min(180, Number(body.durationMinutes ?? 30)))
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
