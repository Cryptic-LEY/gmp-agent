import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { courseLessons, trainingProjects, users } from '@/db/schema'
import { verifyToken } from '@/lib/auth'
import { calculateLessonScore, getLessonBaseScore, safeJsonArray, type LessonQuestion } from '@/lib/course-learning'

function requireTeacher(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  const payload = token ? verifyToken(token) : null
  if (!payload || (payload.role !== 'teacher' && payload.role !== 'admin')) return null
  return payload
}

function dbBool(value: unknown) {
  return value === true || value === 1 || value === '1'
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
  const studentFilters = [eq(users.role, 'student')]
  if (payload.role !== 'admin') studentFilters.push(eq(users.teacherUserId, payload.userId))
  const studentRows = await db.select({
    userId: users.userId,
    studentName: users.displayName,
    studentEmail: users.email,
    className: users.className,
  }).from(users).where(and(...studentFilters))
  const studentIdSet = new Set(studentRows.map(student => student.userId))
  const progressRows = await db.raw.all<{
    user_id: string
    lesson_id: string
    ppt_viewed_pages: string
    ppt_completed: number | boolean
    video_watched_seconds: number | null
    video_max_position: number | null
    video_completed: number | boolean
    test_score: number | null
    test_passed: number | boolean
    note_content: string | null
    annotation_count: number | null
    lesson_score: number | null
    updated_at: string
  }>(`
    SELECT
      user_id,
      lesson_id,
      ppt_viewed_pages,
      ppt_completed,
      video_watched_seconds,
      video_max_position,
      video_completed,
      test_score,
      test_passed,
      note_content,
      annotation_count,
      lesson_score,
      updated_at
    FROM course_lesson_progress
  `)
  const progressByLesson = new Map<string, typeof progressRows>()
  for (const progress of progressRows) {
    if (!studentIdSet.has(progress.user_id)) continue
    if (!progressByLesson.has(progress.lesson_id)) progressByLesson.set(progress.lesson_id, [])
    progressByLesson.get(progress.lesson_id)!.push(progress)
  }
  const chapterById = new Map(chapters.map(chapter => [chapter.trainingId, chapter]))
  const lessonBaseScore = getLessonBaseScore(rows.filter(lesson => lesson.status === 'published').length)

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
        const lessonProgressRows = progressByLesson.get(lesson.lessonId) ?? []
        const progressByStudent = new Map(lessonProgressRows.map(progress => [progress.user_id, progress]))
        const studentProgress = studentRows.map(student => {
          const progress = progressByStudent.get(student.userId)
          const testQuestions = safeJsonArray<LessonQuestion>(lesson.testQuestions)
          const viewedPages = safeJsonArray<number>(progress?.ppt_viewed_pages)
            .map(page => Number(page))
            .filter(page => Number.isFinite(page) && page >= 1 && page <= lesson.pptPageCount)
          const uniquePages = [...new Set(viewedPages)].sort((left, right) => left - right)
          const pptProgress = lesson.pptPageCount > 0 ? Math.min(100, Math.round((uniquePages.length / lesson.pptPageCount) * 100)) : 0
          const videoWatchedSeconds = Math.max(0, Number(progress?.video_watched_seconds ?? 0))
          const videoMaxPosition = Math.max(0, Number(progress?.video_max_position ?? 0))
          const videoProgress = lesson.videoDuration > 0
            ? Math.min(100, Math.round((videoWatchedSeconds / lesson.videoDuration) * 100))
            : dbBool(progress?.video_completed) ? 100 : 0
          const lessonScore = progress
            ? calculateLessonScore({
              pptCompleted: dbBool(progress.ppt_completed),
              videoCompleted: dbBool(progress.video_completed),
              testPassed: dbBool(progress.test_passed),
              testScore: progress.test_score,
              noteContent: progress.note_content ?? '',
              annotationCount: progress.annotation_count ?? 0,
            }, lessonBaseScore, {
              hasPpt: Boolean(lesson.pptUrl) && Number(lesson.pptPageCount ?? 0) > 0,
              hasVideo: Boolean(lesson.videoUrl) && Number(lesson.videoDuration ?? 0) > 0,
              hasTest: testQuestions.length > 0,
            })
            : 0
          return {
            ...student,
            viewedPages: uniquePages,
            viewedPageCount: uniquePages.length,
            pptProgress,
            pptCompleted: dbBool(progress?.ppt_completed),
            videoWatchedSeconds,
            videoMaxPosition,
            videoProgress,
            videoCompleted: dbBool(progress?.video_completed),
            lessonScore,
            updatedAt: progress?.updated_at ?? null,
          }
        })
        const activeLearners = studentProgress.filter(student => student.updatedAt)
        const completedStudents = studentProgress.filter(student => student.pptCompleted || student.pptProgress >= 100)
        const videoCompletedStudents = studentProgress.filter(student => student.videoCompleted || student.videoProgress >= 95)
        const averageScore = activeLearners.length > 0
          ? activeLearners.reduce((sum, student) => sum + student.lessonScore, 0) / activeLearners.length
          : 0
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
            learnerCount: activeLearners.length,
            completedCount: completedStudents.length,
            averageScore: Math.round(averageScore * 10) / 10,
            studentTotal: studentRows.length,
            pptCompletedCount: completedStudents.length,
            videoCompletedCount: videoCompletedStudents.length,
          },
          students: studentProgress,
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
