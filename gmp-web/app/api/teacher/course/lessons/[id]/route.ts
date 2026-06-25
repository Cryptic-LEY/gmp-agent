import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { courseLessons } from '@/db/schema'
import { verifyToken } from '@/lib/auth'

function requireTeacher(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  const payload = token ? verifyToken(token) : null
  if (!payload || (payload.role !== 'teacher' && payload.role !== 'admin')) return null
  return payload
}

function normalizeLessonBody(body: Record<string, unknown>) {
  const questions = Array.isArray(body.testQuestions) ? body.testQuestions : []
  return {
    trainingId: String(body.trainingId ?? '').trim() || null,
    title: String(body.title ?? '').trim(),
    description: String(body.description ?? '').trim(),
    sortOrder: Number(body.sortOrder ?? 0),
    pptUrl: String(body.pptUrl ?? '').trim(),
    pptPageCount: Math.max(0, Number(body.pptPageCount ?? 0)),
    videoUrl: String(body.videoUrl ?? '').trim(),
    videoDuration: Math.max(0, Number(body.videoDuration ?? 0)),
    testQuestions: JSON.stringify(questions),
    passScore: Math.max(0, Math.min(100, Number(body.passScore ?? 60))),
    status: String(body.status ?? 'draft') === 'published' ? 'published' : 'draft',
  }
}

function currentDbTimestamp() {
  return new Date().toISOString().slice(0, 23).replace('T', ' ')
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = requireTeacher(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [existing] = await db.select().from(courseLessons).where(eq(courseLessons.lessonId, id)).limit(1)
  if (!existing) return NextResponse.json({ error: '课时不存在' }, { status: 404 })
  if (payload.role !== 'admin' && existing.teacherId !== payload.userId) {
    return NextResponse.json({ error: '只能编辑自己发布的课时资源' }, { status: 403 })
  }

  const body = await req.json()
  const lesson = normalizeLessonBody(body)
  if (!lesson.trainingId) return NextResponse.json({ error: '请选择对应课程章节' }, { status: 400 })
  if (!lesson.title) return NextResponse.json({ error: '请输入课时标题' }, { status: 400 })

  await db.update(courseLessons).set({ ...lesson, updatedAt: currentDbTimestamp() }).where(eq(courseLessons.lessonId, id))
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = requireTeacher(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [existing] = await db.select().from(courseLessons).where(eq(courseLessons.lessonId, id)).limit(1)
  if (!existing) return NextResponse.json({ error: '课时不存在' }, { status: 404 })
  if (payload.role !== 'admin' && existing.teacherId !== payload.userId) {
    return NextResponse.json({ error: '只能删除自己发布的课时资源' }, { status: 403 })
  }

  await db.raw.run('DELETE FROM course_lesson_progress WHERE lesson_id = ?', [id])
  await db.delete(courseLessons).where(eq(courseLessons.lessonId, id))
  return NextResponse.json({ ok: true })
}
