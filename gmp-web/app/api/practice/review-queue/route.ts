import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { knowledgePoints, kpMastery, learningPlans } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

// 遗忘曲线：按掌握度确定复习间隔（天）
function reviewIntervalDays(confidence: number): number {
  if (confidence < 0.4)  return 1
  if (confidence < 0.6)  return 3
  if (confidence < 0.75) return 7
  if (confidence < 0.9)  return 14
  return 21
}

// GET /api/practice/review-queue
// 返回今日待复习的 KP 列表（基于遗忘曲线）
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { userId } = payload

  // 推断学历层次
  const [latestPlan] = await db.select().from(learningPlans)
    .where(eq(learningPlans.userId, userId))
    .orderBy(desc(learningPlans.createdAt))
    .limit(1)
  const eduCn = latestPlan?.eduLevel === 'undergraduate' ? '本科' : '专科'

  // 该学历的全部 KP
  const allKps = await db.select({
    kpId:        knowledgePoints.kpId,
    title:       knowledgePoints.title,
    projectName: knowledgePoints.projectName,
  }).from(knowledgePoints)
    .where(eq(knowledgePoints.eduLevel, eduCn))

  // 用户掌握度记录
  const masteryRows = await db.select().from(kpMastery)
    .where(eq(kpMastery.userId, userId))

  const masteryMap = new Map(masteryRows.map(r => [r.kpId, r]))
  const now = Date.now()

  type DueItem = { kpId: string; title: string; projectName: string | null; confidence: number; daysSince: number; isNew: boolean }
  const dueItems: DueItem[] = []
  const newItems: DueItem[] = []  // 从未练过的

  for (const kp of allKps) {
    const mastery = masteryMap.get(kp.kpId)

    if (!mastery || mastery.attemptCount === 0) {
      // 从未练过 — 作为低优先级补充（最多取 5 个）
      newItems.push({ kpId: kp.kpId, title: kp.title, projectName: kp.projectName, confidence: 0, daysSince: 9999, isNew: true })
      continue
    }

    const lastTested = mastery.lastTestedAt ? new Date(mastery.lastTestedAt).getTime() : 0
    const daysSince = (now - lastTested) / (1000 * 60 * 60 * 24)
    const interval = reviewIntervalDays(mastery.confidence)

    if (daysSince >= interval) {
      dueItems.push({
        kpId: kp.kpId,
        title: kp.title,
        projectName: kp.projectName,
        confidence: mastery.confidence,
        daysSince: Math.floor(daysSince),
        isNew: false,
      })
    }
  }

  // 按紧迫程度排序：超期越多越靠前，同等超期则掌握度低的优先
  dueItems.sort((a, b) => {
    const aUrgency = a.daysSince / reviewIntervalDays(a.confidence)
    const bUrgency = b.daysSince / reviewIntervalDays(b.confidence)
    return bUrgency - aUrgency
  })

  // 最多 20 个待复习，不足时从未练过的 KP 里补（最多补 5 个）
  const maxNew = Math.min(5, Math.max(0, 20 - dueItems.length))
  const combined = [...dueItems, ...newItems.slice(0, maxNew)]
  const kpIds = combined.map(item => item.kpId)

  return NextResponse.json({
    count:     kpIds.length,
    dueCount:  dueItems.length,
    newCount:  Math.min(maxNew, newItems.length),
    kpIds,
    dueItems:  combined.slice(0, 20),
  })
}
