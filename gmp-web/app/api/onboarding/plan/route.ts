import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { knowledgePoints, kpMastery, learningPlans } from '@/db/schema'
import { buildPersonalizedScheme, safeParsePlan } from '@/lib/personalized-plan'
import { eq, desc } from 'drizzle-orm'

// GET /api/onboarding/plan
// 返回前测结果 + 学习方案 + 各项目实时掌握度（来自 kp_mastery）
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { userId } = payload

  const latest = (await db.select().from(learningPlans)
    .where(eq(learningPlans.userId, userId))
    .orderBy(desc(learningPlans.createdAt))
    .limit(1))[0]

  if (!latest) {
    return NextResponse.json({ hasplan: false })
  }

  const plan = safeParsePlan(latest.planData)
  const scheme = buildPersonalizedScheme(plan, latest.score)

  // 实时掌握度：读 kp_mastery + knowledge_points，按 projectName 聚合
  const eduCn = latest.eduLevel === 'undergraduate' ? '本科' : '专科'
  const [masteryRows, kpRows] = await Promise.all([
    db.select().from(kpMastery).where(eq(kpMastery.userId, userId)),
    db.select({
      kpId: knowledgePoints.kpId,
      projectName: knowledgePoints.projectName,
      eduLevel: knowledgePoints.eduLevel,
    }).from(knowledgePoints),
  ])

  const masteryMap = new Map(masteryRows.map(r => [r.kpId, r]))

  // 按 projectName 统计掌握情况
  const byProject: Record<string, { mastered: number; learning: number; weak: number; untested: number; total: number }> = {}
  for (const kp of kpRows) {
    if (!kp.projectName) continue
    if (kp.eduLevel && kp.eduLevel !== eduCn) continue
    if (!byProject[kp.projectName]) {
      byProject[kp.projectName] = { mastered: 0, learning: 0, weak: 0, untested: 0, total: 0 }
    }
    const stats = byProject[kp.projectName]
    stats.total++
    const m = masteryMap.get(kp.kpId)
    if (!m || m.attemptCount === 0) stats.untested++
    else if (m.confidence >= 0.8) stats.mastered++
    else if (m.confidence >= 0.5) stats.learning++
    else stats.weak++
  }

  // 计算各项目掌握度百分比
  const masteryByProject: Record<string, {
    mastered: number; learning: number; weak: number; untested: number
    total: number; masteryPct: number; hasMasteryData: boolean
  }> = {}
  for (const [proj, stats] of Object.entries(byProject)) {
    const tested = stats.mastered + stats.learning + stats.weak
    masteryByProject[proj] = {
      ...stats,
      masteryPct: stats.total > 0
        ? Math.round(((stats.mastered + stats.learning * 0.6) / stats.total) * 100)
        : 0,
      hasMasteryData: tested > 0,
    }
  }

  return NextResponse.json({
    hasplan: true,
    id: latest.id,
    edu_level: latest.eduLevel,
    major: latest.major,
    score: latest.score,
    wrong_count: latest.wrongCount,
    plan,
    personalized_scheme: scheme,
    created_at: latest.createdAt,
    mastery_by_project: masteryByProject,
    has_realtime_data: masteryRows.length > 0,
  })
}
