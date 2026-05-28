import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { courseAssignments, courseAssignmentSubmissions } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

// POST /api/course/assignments/[id]/submit - 学生提交作业
// body: { content }
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  const { userId } = payload

  const { id } = await context.params
  const assignmentId = parseInt(id, 10)
  if (isNaN(assignmentId)) return NextResponse.json({ error: '无效的作业 ID' }, { status: 400 })

  let body: { content?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: '请求体格式错误' }, { status: 400 }) }

  if (!body.content?.trim()) {
    return NextResponse.json({ error: '提交内容不能为空' }, { status: 400 })
  }

  const assignment = db.select().from(courseAssignments).where(eq(courseAssignments.id, assignmentId)).get()
  if (!assignment) return NextResponse.json({ error: '作业不存在' }, { status: 404 })

  // 检查截止时间
  if (assignment.dueDate && new Date(assignment.dueDate) < new Date()) {
    return NextResponse.json({ error: '作业已截止' }, { status: 400 })
  }

  // 是否已交
  const existing = db.select().from(courseAssignmentSubmissions)
    .where(and(
      eq(courseAssignmentSubmissions.assignmentId, assignmentId),
      eq(courseAssignmentSubmissions.userId, userId),
    )).get()

  if (existing) {
    // 重新提交：更新
    db.update(courseAssignmentSubmissions)
      .set({
        content: body.content.trim(),
        submittedAt: new Date().toISOString(),
        score: null,
        gradedAt: null,
        feedback: null,
      })
      .where(eq(courseAssignmentSubmissions.id, existing.id)).run()
    return NextResponse.json({ id: existing.id, updated: true })
  }

  const result = db.insert(courseAssignmentSubmissions).values({
    assignmentId,
    userId,
    content: body.content.trim(),
  }).run()

  return NextResponse.json({ id: Number(result.lastInsertRowid), updated: false })
}
