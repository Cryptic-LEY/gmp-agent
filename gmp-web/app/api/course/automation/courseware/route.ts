import { randomUUID } from 'crypto'
import { and, desc, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { courseLessons, learningPlans, trainingProjects } from '@/db/schema'
import { verifyToken } from '@/lib/auth'
import { ensureCourseAiAutomation } from '@/lib/course-ai-automation'
import { getCourseScopeTeacherId } from '@/lib/course-teacher-scope'

export const runtime = 'nodejs'

type EduLevel = 'college' | 'undergraduate'

function normalizePptUrl(value: unknown) {
  const url = String(value ?? '').trim()
  if (!url) return ''
  if (/^https?:\/\//i.test(url) || url.startsWith('/')) return url
  return `/${url.replace(/^\/+/, '')}`
}

function currentDbTimestamp() {
  return new Date().toISOString().slice(0, 23).replace('T', ' ')
}

async function getStudentEduLevel(userId: string): Promise<EduLevel> {
  const [latestPlan] = await db.select().from(learningPlans)
    .where(eq(learningPlans.userId, userId))
    .orderBy(desc(learningPlans.createdAt))
    .limit(1)

  return latestPlan?.eduLevel === 'undergraduate' ? 'undergraduate' : 'college'
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    trainingId?: string
    pptUrl?: string
    pptPageCount?: number
    title?: string
    description?: string
    eduLevel?: EduLevel
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求体格式错误' }, { status: 400 })
  }

  const trainingId = body.trainingId?.trim()
  if (!trainingId || !/^T(0[1-9]|1[01])$/.test(trainingId)) {
    return NextResponse.json({ error: '无效的章节 ID' }, { status: 400 })
  }

  const pptUrl = normalizePptUrl(body.pptUrl)
  if (!pptUrl) return NextResponse.json({ error: 'PPT 生成结果无效' }, { status: 400 })

  const teacherId = await getCourseScopeTeacherId(payload)
  if (!teacherId) {
    return NextResponse.json({ error: '当前学生未绑定教师，无法保存自动生成课件' }, { status: 403 })
  }

  const [chapter] = await db.select().from(trainingProjects)
    .where(eq(trainingProjects.trainingId, trainingId))
    .limit(1)
  if (!chapter) return NextResponse.json({ error: '课程章节不存在' }, { status: 404 })

  const [existing] = await db.select().from(courseLessons)
    .where(and(eq(courseLessons.trainingId, trainingId), eq(courseLessons.teacherId, teacherId)))
    .limit(1)

  const pptPageCount = Math.max(1, Math.min(120, Math.round(Number(body.pptPageCount ?? existing?.pptPageCount ?? 1))))
  const title = body.title?.trim() || existing?.title || `${chapter.displayName} 教学PPT`
  const description = body.description?.trim() || existing?.description || `${chapter.displayName} 的 AI 自动生成教学课件`

  if (existing) {
    await db.update(courseLessons)
      .set({
        title,
        description,
        sortOrder: chapter.seqOrder,
        pptUrl,
        pptPageCount,
        videoUrl: existing.videoUrl ?? '',
        videoDuration: existing.videoDuration ?? 0,
        testQuestions: existing.testQuestions || '[]',
        passScore: existing.passScore ?? 60,
        status: 'published',
        updatedAt: currentDbTimestamp(),
      })
      .where(eq(courseLessons.lessonId, existing.lessonId))
  } else {
    await db.insert(courseLessons).values({
      lessonId: `lesson_${randomUUID()}`,
      trainingId,
      teacherId,
      title,
      description,
      sortOrder: chapter.seqOrder,
      pptUrl,
      pptPageCount,
      videoUrl: '',
      videoDuration: 0,
      testQuestions: '[]',
      passScore: 60,
      status: 'published',
    })
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
    return NextResponse.json({ error: error || '课件已保存，但测验/作业自动生成失败', results }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    trainingId,
    teacherId,
    pptUrl,
    pptPageCount,
    message: 'AI 课件、章节测验和作业已生成，教师端可继续编辑管理',
    results,
  })
}
