import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { courseLessons, trainingProjects } from '@/db/schema'
import { verifyToken } from '@/lib/auth'
import { safeJsonArray, type LessonQuestion } from '@/lib/course-learning'

function requireTeacher(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  const payload = token ? verifyToken(token) : null
  if (!payload || (payload.role !== 'teacher' && payload.role !== 'admin')) return null
  return payload
}

function normalizeLessonBody(body: Record<string, unknown>) {
  const questions = Array.isArray(body.testQuestions) ? body.testQuestions : []
  return {
    trainingId: String(body.trainingId ?? '').trim() || null,
    title: String(body.title ?? '').trim(),
    description: String(body.description ?? '').trim(),
    sortOrder: Number(body.sortOrder ?? 0),
    pptUrl: String(body.pptUrl ?? '').trim(),
    pptPageCount: Math.max(0, Number(body.pptPageCount ?? 0)),
    videoUrl: String(body.videoUrl ?? '').trim(),
    videoDuration: Math.max(0, Number(body.videoDuration ?? 0)),
    testQuestions: JSON.stringify(questions),
    passScore: Math.max(0, Math.min(100, Number(body.passScore ?? 60))),
    status: String(body.status ?? 'draft') === 'published' ? 'published' : 'draft',
  }
}

export async function GET(req: NextRequest) {
  const payload = requireTeacher(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = payload.role === 'admin'
    ? await db.select().from(courseLessons)
    : await db.select().from(courseLessons).where(eq(courseLessons.teacherId, payload.userId))
  const chapters = await db.select().from(trainingProjects)
  const statsRows = await db.raw.all<{ lesson_id: string; learner_count: number; completed_count: number; avg_score: number | null }>(`
    SELECT lesson_id, COUNT(*) AS learner_count, SUM(completed) AS completed_count, AVG(lesson_score) AS avg_score
    FROM course_lesson_progress
    GROUP BY lesson_id
  `)
  const statsByLesson = new Map(statsRows.map(row => [row.lesson_id, row]))
  const chapterById = new Map(chapters.map(chapter => [chapter.trainingId, chapter]))

  return NextResponse.json({
    chapters: chapters
      .sort((left, right) => left.seqOrder - right.seqOrder)
      .map(chapter => ({
        trainingId: chapter.trainingId,
        displayName: chapter.displayName,
        seqOrder: chapter.seqOrder,
        hoursCollege: chapter.hoursCollege,
        hoursUg: chapter.hoursUg,
      })),
    lessons: rows
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map(lesson => {
        const stats = statsByLesson.get(lesson.lessonId)
        const chapter = lesson.trainingId ? chapterById.get(lesson.trainingId) : null
        return {
          ...lesson,
          chapter: chapter
            ? {
                trainingId: chapter.trainingId,
                displayName: chapter.displayName,
                seqOrder: chapter.seqOrder,
              }
            : null,
          testQuestions: safeJsonArray<LessonQuestion>(lesson.testQuestions),
          stats: {
            learnerCount: Number(stats?.learner_count ?? 0),
            completedCount: Number(stats?.completed_count ?? 0),
            averageScore: Math.round(Number(stats?.avg_score ?? 0) * 10) / 10,
          },
        }
      }),
  })
}

export async function POST(req: NextRequest) {
  const payload = requireTeacher(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const lesson = normalizeLessonBody(body)
  if (!lesson.trainingId) return NextResponse.json({ error: '请选择对应课程章节' }, { status: 400 })
  if (!lesson.title) return NextResponse.json({ error: '请输入课时标题' }, { status: 400 })

  const lessonId = `lesson_${randomUUID()}`
  await db.insert(courseLessons).values({ lessonId, teacherId: payload.userId, ...lesson })

  return NextResponse.json({ lessonId })
}
