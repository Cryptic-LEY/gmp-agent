import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { courseAssignments, courseAssignmentSubmissions } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { canUseTeacherResource } from '@/lib/course-teacher-scope'

type InsertResult = { insertId?: number | string }

function toMysqlDateTime(date = new Date()) {
  return date.toISOString().slice(0, 23).replace('T', ' ')
}

function parseMysqlDateTime(value: string | null) {
  if (!value) return null
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

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
  const assignmentId = Number.parseInt(id, 10)
  if (Number.isNaN(assignmentId)) {
    return NextResponse.json({ error: '无效的作业 ID' }, { status: 400 })
  }

  let body: { content?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求体格式错误' }, { status: 400 })
  }

  if (!body.content?.trim()) {
    return NextResponse.json({ error: '提交内容不能为空' }, { status: 400 })
  }

  const assignment = (await db
    .select()
    .from(courseAssignments)
    .where(eq(courseAssignments.id, assignmentId))
    .limit(1))[0]

  if (!assignment) return NextResponse.json({ error: '作业不存在' }, { status: 404 })
  if (!(await canUseTeacherResource(payload, assignment.teacherId))) {
    return NextResponse.json({ error: '作业不存在' }, { status: 404 })
  }

  const dueDate = parseMysqlDateTime(assignment.dueDate)
  if (dueDate && dueDate < new Date()) {
    return NextResponse.json({ error: '作业已截止' }, { status: 400 })
  }

  const existing = (await db
    .select()
    .from(courseAssignmentSubmissions)
    .where(and(
      eq(courseAssignmentSubmissions.assignmentId, assignmentId),
      eq(courseAssignmentSubmissions.userId, userId),
    ))
    .limit(1))[0]

  if (existing) {
    await db
      .update(courseAssignmentSubmissions)
      .set({
        content: body.content.trim(),
        submittedAt: toMysqlDateTime(),
        score: null,
        gradedAt: null,
        feedback: null,
      })
      .where(eq(courseAssignmentSubmissions.id, existing.id))

    return NextResponse.json({ id: existing.id, updated: true })
  }

  const result = await db.raw.run(
    `
      INSERT INTO course_assignment_submissions
        (assignment_id, user_id, content)
      VALUES (?, ?, ?)
    `,
    [assignmentId, userId, body.content.trim()],
  ) as InsertResult

  return NextResponse.json({ id: Number(result.insertId ?? 0), updated: false })
}
