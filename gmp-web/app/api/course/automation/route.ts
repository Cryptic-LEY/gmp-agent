import { NextRequest, NextResponse } from 'next/server'
import { desc, eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { courseLessons, learningPlans } from '@/db/schema'
import { verifyToken } from '@/lib/auth'
import { ensureCourseAiAutomation } from '@/lib/course-ai-automation'
import { getCourseQuizGate } from '@/lib/course-quiz-gate'
import { getCourseScopeTeacherId } from '@/lib/course-teacher-scope'

export const runtime = 'nodejs'

type EduLevel = 'college' | 'undergraduate'

async function getStudentEduLevel(userId: string): Promise<EduLevel> {
  const [latestPlan] = await db.select().from(learningPlans)
    .where(eq(learningPlans.userId, userId))
    .orderBy(desc(learningPlans.createdAt))
    .limit(1)

  return latestPlan?.eduLevel === 'undergraduate' ? 'undergraduate' : 'college'
}

async function inferTeacherId(trainingId: string, preferredTeacherId: string | null) {
  if (preferredTeacherId) return preferredTeacherId

  const [lesson] = await db.select({
    teacherId: courseLessons.teacherId,
  }).from(courseLessons)
    .where(and(eq(courseLessons.trainingId, trainingId), eq(courseLessons.status, 'published')))
    .limit(1)

  return lesson?.teacherId ?? null
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { trainingId?: string; eduLevel?: EduLevel }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求体格式错误' }, { status: 400 })
  }

  const trainingId = body.trainingId?.trim()
  if (!trainingId || !/^T(0[1-9]|1[01])$/.test(trainingId)) {
    return NextResponse.json({ error: '无效的章节 ID' }, { status: 400 })
  }

  const scopedTeacherId = await getCourseScopeTeacherId(payload)
  const teacherId = await inferTeacherId(trainingId, scopedTeacherId)
  if (!teacherId) {
    return NextResponse.json({ error: '当前章节尚未绑定教师课件，无法自动生成' }, { status: 403 })
  }

  if (payload.role === 'student') {
    const gate = await getCourseQuizGate(payload.userId, trainingId, teacherId)
    if (!gate.unlocked) {
      return NextResponse.json({
        error: '请先浏览完本章节全部 PPT 后再生成测验和作业',
        gate,
      }, { status: 409 })
    }
  }

  const eduLevels: EduLevel[] = payload.role === 'student'
    ? [await getStudentEduLevel(payload.userId)]
    : body.eduLevel
      ? [body.eduLevel]
      : ['college', 'undergraduate']

  const results = []
  for (const eduLevel of eduLevels) {
    results.push(await ensureCourseAiAutomation({ trainingId, teacherId, eduLevel }))
  }

  const failed = results.find(result => !result.ok)
  if (failed) {
    const error = 'error' in failed ? failed.error : null
    return NextResponse.json({ error: error || '自动生成失败', results }, { status: 500 })
  }

  const generatedQuestions = results.reduce((sum, result) => sum + (result.generatedQuestions ?? 0), 0)
  const generatedAssignment = results.some(result => result.generatedAssignment)
  const usedFallback = results.some(result => result.usedFallback)

  return NextResponse.json({
    ok: true,
    teacherId,
    trainingId,
    generatedQuestions,
    generatedAssignment,
    usedFallback,
    message: usedFallback
      ? '已使用规则模板生成章节测验和作业，教师可在后台修改'
      : 'AI 已生成章节测验和作业，教师可在后台修改',
    results,
  })
}
