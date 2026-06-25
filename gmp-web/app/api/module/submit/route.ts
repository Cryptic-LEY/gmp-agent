import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { moduleScores, trainingProjects } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { hoursToCourseCredits } from '@/lib/course-hours'

const TARGET_HOURS: Record<string, number> = {
  college: 48,
  undergraduate: 54,
}

const VALID_TRAINING_IDS = new Set([
  'T01',
  'T02',
  'T03',
  'T04',
  'T05',
  'T06',
  'T07',
  'T08',
  'T09',
  'T10',
  'T11',
])

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { userId } = payload

  let body: { trainingId?: string; score?: number; eduLevel?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求体格式错误' }, { status: 400 })
  }

  const { trainingId, score, eduLevel } = body
  if (!trainingId || !VALID_TRAINING_IDS.has(trainingId)) {
    return NextResponse.json({ error: '无效的实训项目 ID，应为 T01~T11' }, { status: 400 })
  }
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) {
    return NextResponse.json({ error: '分数必须为 0~100' }, { status: 400 })
  }
  if (!eduLevel || !TARGET_HOURS[eduLevel]) {
    return NextResponse.json({ error: '学历层次必须为 college 或 undergraduate' }, { status: 400 })
  }

  const project = (await db
    .select()
    .from(trainingProjects)
    .where(eq(trainingProjects.trainingId, trainingId))
    .limit(1))[0]

  if (!project) {
    return NextResponse.json({ error: '实训项目不存在' }, { status: 404 })
  }

  const projectHours = eduLevel === 'undergraduate'
    ? (project.hoursUg ?? 0)
    : (project.hoursCollege ?? 0)

  const allProjects = await db.select().from(trainingProjects)
  const totalProjectHours = allProjects.reduce((sum, item) => {
    const hours = eduLevel === 'undergraduate' ? (item.hoursUg ?? 0) : (item.hoursCollege ?? 0)
    return sum + hours
  }, 0)

  const targetTotal = TARGET_HOURS[eduLevel]
  const maxHours = totalProjectHours > 0
    ? (projectHours / totalProjectHours) * targetTotal
    : 0
  const earnedHours = Number.parseFloat((maxHours * (score / 100)).toFixed(2))
  const earnedCredits = hoursToCourseCredits(earnedHours, eduLevel)

  await db.insert(moduleScores).values({
    userId,
    trainingId,
    eduLevel,
    score: Math.round(score),
    earnedHours,
  })

  return NextResponse.json({
    trainingId,
    displayName: project.displayName,
    score: Math.round(score),
    maxHours: Number.parseFloat(maxHours.toFixed(2)),
    earnedHours,
    earnedCredits,
    eduLevel,
  })
}
