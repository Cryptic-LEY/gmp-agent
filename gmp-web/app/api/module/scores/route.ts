import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { moduleScores, trainingProjects, learningPlans } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

// 课程标准总学时
const TARGET_HOURS: Record<string, number> = {
  college:       48,
  undergraduate: 54,
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { userId } = payload

  // ── 1. 获取所有实训项目 ───────────────────────────────────────────────────
  const projects = db.select().from(trainingProjects).all()

  // ── 2. 推断用户学历层次 (优先取最新模块提交记录, 其次取学习方案) ───────────
  let userEduLevel = 'college'

  const latestScore = db.select()
    .from(moduleScores)
    .where(eq(moduleScores.userId, userId))
    .orderBy(desc(moduleScores.completedAt))
    .limit(1)
    .get()

  if (latestScore) {
    userEduLevel = latestScore.eduLevel
  } else {
    const plan = db.select()
      .from(learningPlans)
      .where(eq(learningPlans.userId, userId))
      .orderBy(desc(learningPlans.createdAt))
      .limit(1)
      .get()
    if (plan) userEduLevel = plan.eduLevel
  }

  // ── 3. 计算各项目满分课时 ────────────────────────────────────────────────
  const totalProjectHours = projects.reduce((sum, p) => {
    const h = userEduLevel === 'undergraduate' ? (p.hoursUg ?? 0) : (p.hoursCollege ?? 0)
    return sum + h
  }, 0)
  const targetTotal = TARGET_HOURS[userEduLevel] ?? 48

  // ── 4. 取每个模块的最新提交成绩 ─────────────────────────────────────────
  const allScores = db.select()
    .from(moduleScores)
    .where(eq(moduleScores.userId, userId))
    .orderBy(desc(moduleScores.completedAt))
    .all()

  // 每个 training_id 只保留最新一条
  const latestByModule = new Map<string, typeof allScores[0]>()
  for (const s of allScores) {
    if (!latestByModule.has(s.trainingId)) {
      latestByModule.set(s.trainingId, s)
    }
  }

  // ── 5. 组装返回数据 ──────────────────────────────────────────────────────
  const modules = projects
    .sort((a, b) => a.seqOrder - b.seqOrder)
    .map(p => {
      const projHours = userEduLevel === 'undergraduate' ? (p.hoursUg ?? 0) : (p.hoursCollege ?? 0)
      const maxHours = totalProjectHours > 0
        ? parseFloat(((projHours / totalProjectHours) * targetTotal).toFixed(2))
        : 0
      const record = latestByModule.get(p.trainingId)
      return {
        trainingId:  p.trainingId,
        displayName: p.displayName,
        maxHours,
        score:       record?.score ?? null,
        earnedHours: record?.earnedHours ?? null,
        completedAt: record?.completedAt ?? null,
      }
    })

  const totalEarnedHours = modules.reduce((sum, m) => sum + (m.earnedHours ?? 0), 0)

  return NextResponse.json({
    eduLevel:        userEduLevel,
    totalMaxHours:   targetTotal,
    totalEarnedHours: parseFloat(totalEarnedHours.toFixed(2)),
    modules,
  })
}
