import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { courseLessonProgress, courseLessons } from '@/db/schema'
import { verifyToken } from '@/lib/auth'
import { boolValue, calculateLessonScore, getLessonBaseScore, isLessonResourceCompleted, safeJsonArray, sanitizeQuestions, type LessonQuestion } from '@/lib/course-learning'
import { canUseTeacherResource, getCourseScopeTeacherId } from '@/lib/course-teacher-scope'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const lessons = await db.select().from(courseLessons).where(eq(courseLessons.status, 'published'))
  const lesson = lessons.find(item => item.lessonId === id)
  if (!lesson || !(await canUseTeacherResource(payload, lesson.teacherId))) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  const scopeTeacherId = await getCourseScopeTeacherId(payload)
  const scopedLessons = payload.role === 'admin'
    ? lessons
    : lessons.filter(item => item.teacherId === scopeTeacherId)

  const [progress] = await db.select().from(courseLessonProgress).where(and(eq(courseLessonProgress.userId, payload.userId), eq(courseLessonProgress.lessonId, id)))
  const lessonBaseScore = getLessonBaseScore(scopedLessons.length)
  const viewedPages = safeJsonArray<number>(progress?.pptViewedPages)
  const questions = safeJsonArray<LessonQuestion>(lesson.testQuestions)
  const pptProgress = lesson.pptPageCount > 0 ? Math.min(100, Math.round((viewedPages.length / lesson.pptPageCount) * 100)) : 0
  const videoProgress = lesson.videoDuration > 0 ? Math.min(100, Math.round(((progress?.videoWatchedSeconds ?? 0) / lesson.videoDuration) * 100)) : 0
  const scoreOptions = {
    hasPpt: Boolean(lesson.pptUrl) && Number(lesson.pptPageCount ?? 0) > 0,
    hasVideo: Boolean(lesson.videoUrl) && Number(lesson.videoDuration ?? 0) > 0,
    hasTest: questions.length > 0,
  }
  const lessonScore = progress ? calculateLessonScore(progress, lessonBaseScore, scoreOptions) : 0

  return NextResponse.json({
    lessonId: lesson.lessonId,
    title: lesson.title,
    description: lesson.description,
    sortOrder: lesson.sortOrder,
    pptUrl: lesson.pptUrl,
    pptPageCount: lesson.pptPageCount,
    videoUrl: lesson.videoUrl,
    videoDuration: lesson.videoDuration,
    passScore: lesson.passScore,
    baseScore: lessonBaseScore,
    questions: sanitizeQuestions(questions),
    progress: {
      viewedPages,
      pptProgress,
      pptCompleted: boolValue(progress?.pptCompleted),
      videoWatchedSeconds: progress?.videoWatchedSeconds ?? 0,
      videoMaxPosition: progress?.videoMaxPosition ?? 0,
      videoProgress,
      videoCompleted: boolValue(progress?.videoCompleted),
      testCompleted: boolValue(progress?.testCompleted),
      testPassed: boolValue(progress?.testPassed),
      testScore: progress?.testScore ?? null,
      noteContent: progress?.noteContent ?? '',
      annotationCount: progress?.annotationCount ?? 0,
      lessonScore,
      completed: progress ? isLessonResourceCompleted(progress, scoreOptions) : false,
    },
  })
}
