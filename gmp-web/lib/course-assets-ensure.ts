import { asc, desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { learningPlans, trainingProjects } from '@/db/schema'
import { ensureCourseAiAutomation } from '@/lib/course-ai-automation'

export type EduLevel = 'college' | 'undergraduate'

export async function getLatestStudentEduLevel(userId: string): Promise<EduLevel> {
  const [latestPlan] = await db.select().from(learningPlans)
    .where(eq(learningPlans.userId, userId))
    .orderBy(desc(learningPlans.createdAt))
    .limit(1)

  return latestPlan?.eduLevel === 'undergraduate' ? 'undergraduate' : 'college'
}

export async function ensureCourseAssetsForTeacher({
  teacherId,
  trainingId,
  eduLevels,
}: {
  teacherId: string
  trainingId?: string
  eduLevels: EduLevel[]
}) {
  const chapters = trainingId
    ? await db.select().from(trainingProjects)
      .where(eq(trainingProjects.trainingId, trainingId))
      .orderBy(asc(trainingProjects.seqOrder))
    : await db.select().from(trainingProjects)
      .orderBy(asc(trainingProjects.seqOrder))

  const normalizedEduLevels = Array.from(new Set(eduLevels)).filter((level): level is EduLevel =>
    level === 'college' || level === 'undergraduate',
  )
  const results = []

  for (const chapter of chapters) {
    for (const eduLevel of normalizedEduLevels) {
      results.push(await ensureCourseAiAutomation({
        trainingId: chapter.trainingId,
        teacherId,
        eduLevel,
      }))
    }
  }

  const generatedQuestions = results.reduce((sum, result) => sum + (result.generatedQuestions ?? 0), 0)
  const generatedAssignment = results.some(result => result.generatedAssignment)
  const usedFallback = results.some(result => result.usedFallback)
  const failed = results.find(result => !result.ok)
  const error = failed && 'error' in failed ? failed.error : undefined

  return {
    ok: !failed,
    error,
    chapterCount: chapters.length,
    eduLevels: normalizedEduLevels,
    generatedQuestions,
    generatedAssignment,
    usedFallback,
    results,
  }
}
