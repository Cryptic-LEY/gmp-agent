import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { courseLessonProgress, courseLessons } from '@/db/schema'
import { safeJsonArray } from '@/lib/course-learning'

export interface CourseQuizGate {
  unlocked: boolean
  totalPptPages: number
  viewedPptPages: number
  missingPages: number
  completedLessons: number
  requiredLessons: number
}

export async function getCourseQuizGate(userId: string, trainingId: string, teacherId?: string | null): Promise<CourseQuizGate> {
  const lessonFilters = [eq(courseLessons.trainingId, trainingId), eq(courseLessons.status, 'published')]
  if (teacherId) lessonFilters.push(eq(courseLessons.teacherId, teacherId))

  const lessons = await db.select().from(courseLessons)
    .where(and(...lessonFilters))

  const pptLessons = lessons.filter(lesson => Boolean(lesson.pptUrl) && Number(lesson.pptPageCount ?? 0) > 0)
  const lessonIds = pptLessons.map(lesson => lesson.lessonId)
  const progressRows = lessonIds.length > 0
    ? await db.select().from(courseLessonProgress)
      .where(and(eq(courseLessonProgress.userId, userId), inArray(courseLessonProgress.lessonId, lessonIds)))
    : []
  const progressMap = new Map(progressRows.map(row => [row.lessonId, row]))

  let viewedPptPages = 0
  let completedLessons = 0
  let totalPptPages = 0

  for (const lesson of pptLessons) {
    const pageCount = Number(lesson.pptPageCount ?? 0)
    totalPptPages += pageCount
    const viewed = new Set(
      safeJsonArray<number>(progressMap.get(lesson.lessonId)?.pptViewedPages)
        .map(page => Number(page))
        .filter(page => Number.isFinite(page) && page >= 1 && page <= pageCount),
    )
    viewedPptPages += viewed.size
    if (pageCount > 0 && viewed.size >= pageCount) completedLessons += 1
  }

  const missingPages = Math.max(0, totalPptPages - viewedPptPages)
  return {
    unlocked: totalPptPages === 0 || missingPages === 0,
    totalPptPages,
    viewedPptPages,
    missingPages,
    completedLessons,
    requiredLessons: pptLessons.length,
  }
}
