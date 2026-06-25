import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { courseAssignments, courseAssignmentSubmissions } from '@/db/schema'
import { verifyToken } from '@/lib/auth'
import { ensureAssignmentSubmissionGraderColumn } from '@/lib/course-assignment-review'

function requireTeacher(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  const payload = token ? verifyToken(token) : null
  if (!payload || (payload.role !== 'teacher' && payload.role !== 'admin')) return null
  return payload
}

function toMysqlDateTime(date = new Date()) {
  return date.toISOString().slice(0, 23).replace('T', ' ')
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const payload = requireTeacher(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const submissionId = Number.parseInt(id, 10)
  if (Number.isNaN(submissionId)) return NextResponse.json({ error: '无效的提交 ID' }, { status: 400 })
  const [submission] = await db.select({
    id: courseAssignmentSubmissions.id,
    teacherId: courseAssignments.teacherId,
  }).from(courseAssignmentSubmissions)
    .innerJoin(courseAssignments, eq(courseAssignmentSubmissions.assignmentId, courseAssignments.id))
    .where(eq(courseAssignmentSubmissions.id, submissionId))
    .limit(1)

  if (!submission) return NextResponse.json({ error: '提交不存在' }, { status: 404 })
  if (payload.role !== 'admin' && submission.teacherId !== payload.userId) {
    return NextResponse.json({ error: '只能批改自己发布作业的提交' }, { status: 403 })
  }

  let body: { score?: number; feedback?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求体格式错误' }, { status: 400 })
  }

  const score = Number(body.score)
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    return NextResponse.json({ error: '分数需在 0-100 之间' }, { status: 400 })
  }

  await ensureAssignmentSubmissionGraderColumn()
  await db.update(courseAssignmentSubmissions)
    .set({
      score: Math.round(score),
      feedback: body.feedback?.trim() || null,
      gradedAt: toMysqlDateTime(),
      gradedBy: 'teacher',
    })
    .where(eq(courseAssignmentSubmissions.id, submissionId))

  return NextResponse.json({ ok: true })
}
