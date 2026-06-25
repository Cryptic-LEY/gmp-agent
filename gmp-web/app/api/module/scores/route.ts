import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { learningPlans, moduleScores, trainingProjects } from '@/db/schema'
import { desc, eq } from 'drizzle-orm'
import { COURSE_LEARNING_CREDIT_TARGET, COURSE_TARGET_HOURS, hoursToCourseCredits } from '@/lib/course-hours'

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { userId } = payload
  const projects = await db.select().from(trainingProjects)

  let userEduLevel = 'college'
  const latestScore = (await db
    .select()
    .from(moduleScores)
    .where(eq(moduleScores.userId, userId))
    .orderBy(desc(moduleScores.completedAt))
    .limit(1))[0]

  if (latestScore) {
    userEduLevel = latestScore.eduLevel
  } else {
    const plan = (await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.userId, userId))
      .orderBy(desc(learningPlans.createdAt))
      .limit(1))[0]

    if (plan) userEduLevel = plan.eduLevel
  }

  const totalProjectHours = projects.reduce((sum, project) => {
    const hours = userEduLevel === 'undergraduate'
      ? (project.hoursUg ?? 0)
      : (project.hoursCollege ?? 0)
    return sum + hours
  }, 0)
  const targetTotal = COURSE_TARGET_HOURS[userEduLevel === 'undergraduate' ? 'undergraduate' : 'college'] ?? 48

  const allScores = await db
    .select()
    .from(moduleScores)
    .where(eq(moduleScores.userId, userId))
    .orderBy(desc(moduleScores.completedAt))

  const latestByModule = new Map<string, typeof allScores[number]>()
  for (const score of allScores) {
    if (!latestByModule.has(score.trainingId)) {
      latestByModule.set(score.trainingId, score)
    }
  }

  const modules = [...projects]
    .sort((a, b) => a.seqOrder - b.seqOrder)
    .map(project => {
      const projectHours = userEduLevel === 'undergraduate'
        ? (project.hoursUg ?? 0)
        : (project.hoursCollege ?? 0)
      const maxHours = totalProjectHours > 0
        ? Number.parseFloat(((projectHours / totalProjectHours) * targetTotal).toFixed(2))
        : 0
      const record = latestByModule.get(project.trainingId)

      return {
        trainingId: project.trainingId,
        displayName: project.displayName,
        maxHours,
        maxCredits: hoursToCourseCredits(maxHours, userEduLevel),
        score: record?.score ?? null,
        earnedHours: record?.earnedHours ?? null,
        earnedCredits: record?.earnedHours ? hoursToCourseCredits(record.earnedHours, userEduLevel) : null,
        completedAt: record?.completedAt ?? null,
      }
    })

  const totalEarnedHours = modules.reduce((sum, module) => sum + (module.earnedHours ?? 0), 0)
  const totalEarnedCredits = hoursToCourseCredits(totalEarnedHours, userEduLevel)

  return NextResponse.json({
    eduLevel: userEduLevel,
    totalMaxHours: targetTotal,
    totalEarnedHours: Number.parseFloat(totalEarnedHours.toFixed(2)),
    totalMaxCredits: COURSE_LEARNING_CREDIT_TARGET,
    totalEarnedCredits,
    modules,
  })
}
