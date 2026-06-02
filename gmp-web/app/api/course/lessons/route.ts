import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { courseLessonProgress, courseLessons } from '@/db/schema'
import { verifyToken } from '@/lib/auth'
import { boolValue, calculateLessonScore, getLessonBaseScore, safeJsonArray, sanitizeQuestions, type LessonQuestion } from '@/lib/course-learning'
import { getCourseScopeTeacherId } from '@/lib/course-teacher-scope'

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scopeTeacherId = await getCourseScopeTeacherId(payload)
  const hasTeacherScope = payload.role === 'admin' || Boolean(scopeTeacherId)
  const lessonFilters = [eq(courseLessons.status, 'published')]
  if (scopeTeacherId) lessonFilters.push(eq(courseLessons.teacherId, scopeTeacherId))
  const lessonRows = hasTeacherScope
    ? await db.select().from(courseLessons).where(and(...lessonFilters))
    : []
  const sortedLessons = lessonRows.sort((left, right) => left.sortOrder - right.sortOrder)
  const progressRows = await db.select().from(courseLessonProgress).where(eq(courseLessonProgress.userId, payload.userId))
  const progressByLesson = new Map(progressRows.map(row => [row.lessonId, row]))
  const lessonBaseScore = getLessonBaseScore(sortedLessons.length)

  const lessons = sortedLessons.map(lesson => {
    const progress = progressByLesson.get(lesson.lessonId)
    const viewedPages = safeJsonArray<number>(progress?.pptViewedPages)
    const pptProgress = lesson.pptPageCount > 0 ? Math.min(100, Math.round((viewedPages.length / lesson.pptPageCount) * 100)) : 0
    const videoProgress = lesson.videoDuration > 0 ? Math.min(100, Math.round(((progress?.videoWatchedSeconds ?? 0) / lesson.videoDuration) * 100)) : 0
    const questions = safeJsonArray<LessonQuestion>(lesson.testQuestions)
    const lessonScore = progress ? calculateLessonScore(progress, lessonBaseScore) : 0

    return {
      lessonId: lesson.lessonId,
      title: lesson.title,
      description: lesson.description,
      sortOrder: lesson.sortOrder,
      pptUrl: lesson.pptUrl,
      pptPageCount: lesson.pptPageCount,
      videoUrl: lesson.videoUrl,
      videoDuration: lesson.videoDuration,
      passScore: lesson.passScore,
      questionCount: questions.length,
      baseScore: lessonBaseScore,
      progress: {
        pptProgress,
        pptCompleted: boolValue(progress?.pptCompleted),
        videoProgress,
        videoCompleted: boolValue(progress?.videoCompleted),
        testCompleted: boolValue(progress?.testCompleted),
        testPassed: boolValue(progress?.testPassed),
        testScore: progress?.testScore ?? null,
        noteContent: progress?.noteContent ?? '',
        lessonScore,
        completed: boolValue(progress?.completed),
      },
    }
  })

  const earnedScore = lessons.reduce((sum, lesson) => sum + lesson.progress.lessonScore, 0)

  return NextResponse.json({
    totalScore: 350,
    lessonBaseScore,
    earnedScore: Math.round(earnedScore * 100) / 100,
    completedCount: lessons.filter(lesson => lesson.progress.completed).length,
    lessons,
  })
}
