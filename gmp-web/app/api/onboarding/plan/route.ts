import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { learningPlans } from '@/db/schema'
import { buildAdaptiveLearningPlan } from '@/lib/adaptive-learning-plan'
import { buildPersonalizedScheme, safeParsePlan } from '@/lib/personalized-plan'
import { eq, desc } from 'drizzle-orm'

// GET /api/onboarding/plan
// 返回当前用户最新的前测结果和学习方案
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
  const lite = req.nextUrl.searchParams.get('lite') === '1'
  if (lite) {
    return NextResponse.json({
      hasplan: true,
      id: latest.id,
      edu_level: latest.eduLevel,
      major: latest.major,
      score: latest.score,
      wrong_count: latest.wrongCount,
      plan,
      personalized_scheme: buildPersonalizedScheme(plan, latest.score),
      generated_by: 'rules',
      dynamic_profile: null,
      created_at: latest.createdAt,
    })
  }

  const adaptiveResult = await buildAdaptiveLearningPlan(userId, latest, { useAi: true }).catch(() => null)
  const adaptivePlan = adaptiveResult?.plan ?? plan
  const scheme = adaptiveResult?.personalizedScheme ?? buildPersonalizedScheme(plan, latest.score)

  return NextResponse.json({
    hasplan: true,
    id: latest.id,
    edu_level: latest.eduLevel,
    major: latest.major,
    score: latest.score,
    wrong_count: latest.wrongCount,
    plan: adaptivePlan,
    personalized_scheme: scheme,
    generated_by: adaptiveResult?.generatedBy ?? 'rules',
    dynamic_profile: adaptiveResult?.profile ?? null,
    created_at: latest.createdAt,
  })
}
