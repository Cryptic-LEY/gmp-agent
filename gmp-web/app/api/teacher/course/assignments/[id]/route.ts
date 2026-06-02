import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { courseAssignments, trainingProjects } from '@/db/schema'
import { verifyToken } from '@/lib/auth'

function requireTeacher(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  const payload = token ? verifyToken(token) : null
  if (!payload || (payload.role !== 'teacher' && payload.role !== 'admin')) return null
  return payload
}

function normalizeDueDate(value?: string | null) {
  const raw = value?.trim()
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw} 23:59:59.000`
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
    const normalized = raw.replace('T', ' ')
    return normalized.length === 16 ? `${normalized}:00.000` : normalized
  }
  return raw
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const payload = requireTeacher(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const assignmentId = Number.parseInt(id, 10)
  if (Number.isNaN(assignmentId)) return NextResponse.json({ error: '无效的作业 ID' }, { status: 400 })
  const [existing] = await db.select().from(courseAssignments).where(eq(courseAssignments.id, assignmentId)).limit(1)
  if (!existing) return NextResponse.json({ error: '作业不存在' }, { status: 404 })
  if (payload.role !== 'admin' && existing.teacherId !== payload.userId) {
    return NextResponse.json({ error: '只能编辑自己发布的作业' }, { status: 403 })
  }

  let body: {
    trainingId?: string
    title?: string
    description?: string
    assignmentType?: string
    maxScore?: number
    dueDate?: string | null
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求体格式错误' }, { status: 400 })
  }

  const trainingId = body.trainingId?.trim()
  const title = body.title?.trim()
  const description = body.description?.trim()
  if (!trainingId || !/^T(0[1-9]|1[01])$/.test(trainingId)) {
    return NextResponse.json({ error: '无效的章节 ID' }, { status: 400 })
  }
  if (!title || !description) {
    return NextResponse.json({ error: '标题和说明不能为空' }, { status: 400 })
  }

  const [chapter] = await db.select().from(trainingProjects)
    .where(eq(trainingProjects.trainingId, trainingId))
    .limit(1)
  if (!chapter) return NextResponse.json({ error: '课程章节不存在' }, { status: 404 })

  await db.update(courseAssignments)
    .set({
      trainingId,
      title,
      description,
      assignmentType: body.assignmentType?.trim() || '案例分析',
      maxScore: Math.max(1, Math.min(100, Number(body.maxScore ?? 100))),
      dueDate: normalizeDueDate(body.dueDate),
    })
    .where(payload.role === 'admin'
      ? eq(courseAssignments.id, assignmentId)
      : and(eq(courseAssignments.id, assignmentId), eq(courseAssignments.teacherId, payload.userId)))

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const payload = requireTeacher(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const assignmentId = Number.parseInt(id, 10)
  if (Number.isNaN(assignmentId)) return NextResponse.json({ error: '无效的作业 ID' }, { status: 400 })
  const [existing] = await db.select().from(courseAssignments).where(eq(courseAssignments.id, assignmentId)).limit(1)
  if (!existing) return NextResponse.json({ error: '作业不存在' }, { status: 404 })
  if (payload.role !== 'admin' && existing.teacherId !== payload.userId) {
    return NextResponse.json({ error: '只能删除自己发布的作业' }, { status: 403 })
  }

  await db.delete(courseAssignments).where(payload.role === 'admin'
    ? eq(courseAssignments.id, assignmentId)
    : and(eq(courseAssignments.id, assignmentId), eq(courseAssignments.teacherId, payload.userId)))
  return NextResponse.json({ ok: true })
}
