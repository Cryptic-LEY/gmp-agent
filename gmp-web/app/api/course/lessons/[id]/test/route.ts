import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { courseLessons } from '@/db/schema'
import { verifyToken } from '@/lib/auth'
import { calculateLessonScore, getLessonBaseScore, gradeLessonTest, isLessonResourceCompleted, safeJsonArray, type LessonQuestion } from '@/lib/course-learning'
import { canUseTeacherResource, getCourseScopeTeacherId } from '@/lib/course-teacher-scope'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const [lesson] = await db.select().from(courseLessons).where(eq(courseLessons.lessonId, id))
  if (!lesson || lesson.status !== 'published' || !(await canUseTeacherResource(payload, lesson.teacherId))) {
    return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  }

  const questions = safeJsonArray<LessonQuestion>(lesson.testQuestions)
  const answers = typeof body.answers === 'object' && body.answers ? body.answers as Record<string, string> : {}
  const result = gradeLessonTest(questions, answers)
  const passed = result.score >= lesson.passScore
  const lessons = await db.select().from(courseLessons).where(eq(courseLessons.status, 'published'))
  const scopeTeacherId = await getCourseScopeTeacherId(payload)
  const scopedLessons = payload.role === 'admin' ? lessons : lessons.filter(item => item.teacherId === scopeTeacherId)
  const current = await db.raw.get<{
    ppt_completed: number
    video_completed: number
    note_content: string | null
    annotation_count: number
  }>('SELECT * FROM course_lesson_progress WHERE user_id = ? AND lesson_id = ?', [payload.userId, id])
  const progressForScore = {
    pptCompleted: current?.ppt_completed ?? 0,
    videoCompleted: current?.video_completed ?? 0,
    testPassed: passed,
    testScore: result.score,
    noteContent: current?.note_content ?? '',
    annotationCount: current?.annotation_count ?? 0,
  }
  const scoreOptions = {
    hasPpt: Boolean(lesson.pptUrl) && Number(lesson.pptPageCount ?? 0) > 0,
    hasVideo: Boolean(lesson.videoUrl) && Number(lesson.videoDuration ?? 0) > 0,
    hasTest: questions.length > 0,
  }
  const lessonScore = calculateLessonScore(progressForScore, getLessonBaseScore(scopedLessons.length), scoreOptions)
  const completed = isLessonResourceCompleted(progressForScore, scoreOptions)

  await db.raw.run(`
    INSERT INTO course_lesson_progress (
      user_id, lesson_id, ppt_viewed_pages, ppt_completed, video_watched_seconds, video_max_position,
      video_completed, test_score, test_passed, test_completed, note_content, annotation_count, lesson_score, completed, completed_at
    ) VALUES (?, ?, '[]', 0, 0, 0, 0, ?, ?, 1, '', 0, ?, ?, IF(?, CURRENT_TIMESTAMP(3), NULL))
    ON DUPLICATE KEY UPDATE
      test_score = VALUES(test_score),
      test_passed = VALUES(test_passed),
      test_completed = 1,
      lesson_score = VALUES(lesson_score),
      completed = VALUES(completed),
      completed_at = IF(VALUES(completed) = 1 AND completed_at IS NULL, CURRENT_TIMESTAMP(3), completed_at),
      updated_at = CURRENT_TIMESTAMP(3)
  `, [payload.userId, id, result.score, passed, lessonScore, completed, completed])

  return NextResponse.json({ ...result, passed, passScore: lesson.passScore, lessonScore, completed })
}
