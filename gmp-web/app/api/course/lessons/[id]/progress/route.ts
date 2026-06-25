import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { courseLessons } from '@/db/schema'
import { verifyToken } from '@/lib/auth'
import { calculateLessonScore, getLessonBaseScore, isLessonResourceCompleted, safeJsonArray } from '@/lib/course-learning'
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

  const lessons = await db.select().from(courseLessons).where(eq(courseLessons.status, 'published'))
  const scopeTeacherId = await getCourseScopeTeacherId(payload)
  const scopedLessons = payload.role === 'admin' ? lessons : lessons.filter(item => item.teacherId === scopeTeacherId)
  const current = await db.raw.get<{
    ppt_viewed_pages: string
    ppt_completed: number
    video_watched_seconds: number
    video_max_position: number
    video_completed: number
    test_score: number | null
    test_passed: number
    test_completed: number
    note_content: string | null
    annotation_count: number
    elapsed_seconds: number | null
  }>(`
    SELECT *,
      TIMESTAMPDIFF(MICROSECOND, updated_at, CURRENT_TIMESTAMP(3)) / 1000000 AS elapsed_seconds
    FROM course_lesson_progress
    WHERE user_id = ? AND lesson_id = ?
  `, [payload.userId, id])

  const viewedPages = new Set(safeJsonArray<number>(current?.ppt_viewed_pages))
  if (body.type === 'ppt') {
    const pageNumber = Number(body.pageNumber)
    if (Number.isFinite(pageNumber) && pageNumber >= 1 && pageNumber <= lesson.pptPageCount) viewedPages.add(pageNumber)
  }

  const previousVideoWatchedSeconds = Math.max(0, Number(current?.video_watched_seconds ?? 0))
  const previousVideoMaxPosition = Math.max(0, Number(current?.video_max_position ?? 0))
  let videoWatchedSeconds = previousVideoWatchedSeconds
  let videoMaxPosition = previousVideoMaxPosition
  if (body.type === 'video') {
    const duration = Math.max(0, Number(lesson.videoDuration ?? 0))
    const reportedCurrentTime = Math.max(0, Math.floor(Number(body.currentTime ?? 0)))
    const reportedWatchedSeconds = Math.max(0, Math.floor(Number(body.watchedSeconds ?? previousVideoWatchedSeconds)))
    const reportedDelta = Math.max(0, Math.min(4, Number(body.watchDelta ?? 0)))
    const elapsedAllowance = current
      ? Math.max(0, Number(current.elapsed_seconds ?? 0) + 0.35)
      : 1
    const acceptedDelta = Math.min(reportedDelta, elapsedAllowance)
    const allowedCurrentTime = previousVideoWatchedSeconds + Math.max(2, Math.ceil(acceptedDelta) + 2)
    const acceptedPosition = reportedCurrentTime <= allowedCurrentTime
      ? Math.max(reportedCurrentTime, reportedWatchedSeconds)
      : previousVideoWatchedSeconds
    const deltaPosition = previousVideoWatchedSeconds + acceptedDelta
    const nextWatched = Math.floor(Math.max(previousVideoWatchedSeconds, Math.min(acceptedPosition, deltaPosition)))
    videoWatchedSeconds = duration > 0 ? Math.min(duration, nextWatched) : nextWatched
    videoMaxPosition = Math.max(previousVideoMaxPosition, Math.min(videoWatchedSeconds, reportedCurrentTime))
  }
  const pptCompleted = lesson.pptPageCount > 0 && viewedPages.size >= lesson.pptPageCount
  const videoCompleted = lesson.videoDuration > 0 && videoWatchedSeconds >= Math.floor(lesson.videoDuration * 0.95)
  const lessonBaseScore = getLessonBaseScore(scopedLessons.length)
  const progressForScore = {
    pptCompleted,
    videoCompleted,
    testPassed: current?.test_passed ?? 0,
    testScore: current?.test_score ?? null,
    noteContent: current?.note_content ?? '',
    annotationCount: current?.annotation_count ?? 0,
  }
  const scoreOptions = {
    hasPpt: Boolean(lesson.pptUrl) && Number(lesson.pptPageCount ?? 0) > 0,
    hasVideo: Boolean(lesson.videoUrl) && Number(lesson.videoDuration ?? 0) > 0,
    hasTest: safeJsonArray<unknown>(lesson.testQuestions).length > 0,
  }
  const lessonScore = calculateLessonScore(progressForScore, lessonBaseScore, scoreOptions)
  const completed = isLessonResourceCompleted(progressForScore, scoreOptions)

  await db.raw.run(`
    INSERT INTO course_lesson_progress (
      user_id, lesson_id, ppt_viewed_pages, ppt_completed, video_watched_seconds, video_max_position,
      video_completed, test_score, test_passed, test_completed, note_content, annotation_count, lesson_score, completed, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, IF(?, CURRENT_TIMESTAMP(3), NULL))
    ON DUPLICATE KEY UPDATE
      ppt_viewed_pages = VALUES(ppt_viewed_pages),
      ppt_completed = VALUES(ppt_completed),
      video_watched_seconds = GREATEST(video_watched_seconds, VALUES(video_watched_seconds)),
      video_max_position = GREATEST(video_max_position, VALUES(video_max_position)),
      video_completed = VALUES(video_completed),
      lesson_score = VALUES(lesson_score),
      completed = VALUES(completed),
      completed_at = IF(VALUES(completed) = 1 AND completed_at IS NULL, CURRENT_TIMESTAMP(3), completed_at),
      updated_at = CURRENT_TIMESTAMP(3)
  `, [
    payload.userId,
    id,
    JSON.stringify([...viewedPages].sort((left, right) => left - right)),
    pptCompleted,
    videoWatchedSeconds,
    videoMaxPosition,
    videoCompleted,
    current?.test_score ?? null,
    current?.test_passed ?? false,
    current?.test_completed ?? false,
    current?.note_content ?? '',
    current?.annotation_count ?? 0,
    lessonScore,
    completed,
    completed,
  ])

  const sortedViewedPages = [...viewedPages].sort((left, right) => left - right)
  const pptProgress = lesson.pptPageCount > 0 ? Math.min(100, Math.round((sortedViewedPages.length / lesson.pptPageCount) * 100)) : 0
  const videoProgress = lesson.videoDuration > 0 ? Math.min(100, Math.round((videoWatchedSeconds / lesson.videoDuration) * 100)) : 0

  return NextResponse.json({
    viewedPages: sortedViewedPages,
    pptCompleted,
    pptProgress,
    videoCompleted,
    videoProgress,
    videoWatchedSeconds,
    videoMaxPosition,
    lessonScore,
    completed,
  })
}
