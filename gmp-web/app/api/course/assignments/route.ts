import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { courseAssignments, courseAssignmentSubmissions, users } from '@/db/schema'
import { eq, desc, and } from 'drizzle-orm'

// GET /api/course/assignments?trainingId=T01  - 章节作业列表
// 不传 trainingId 则返回我所有未交作业
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  const { userId } = payload

  const { searchParams } = new URL(req.url)
  const trainingId = searchParams.get('trainingId')

  const assignments = trainingId
    ? db.select().from(courseAssignments).where(eq(courseAssignments.trainingId, trainingId)).orderBy(desc(courseAssignments.createdAt)).all()
    : db.select().from(courseAssignments).orderBy(desc(courseAssignments.createdAt)).all()

  const submissions = db.select().from(courseAssignmentSubmissions)
    .where(eq(courseAssignmentSubmissions.userId, userId)).all()
  const subMap = new Map(submissions.map(s => [s.assignmentId, s]))

  const list = assignments.map(a => {
    const sub = subMap.get(a.id)
    return {
      id: a.id,
      trainingId: a.trainingId,
      title: a.title,
      description: a.description,
      assignmentType: a.assignmentType,
      maxScore: a.maxScore,
      dueDate: a.dueDate,
      createdAt: a.createdAt,
      mySubmission: sub
        ? { id: sub.id, content: sub.content, score: sub.score, feedback: sub.feedback,
            submittedAt: sub.submittedAt, gradedAt: sub.gradedAt }
        : null,
    }
  })

  return NextResponse.json({ assignments: list })
}

// POST /api/course/assignments  - 教师发布作业
// body: { trainingId, title, description, assignmentType?, maxScore?, dueDate? }
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  const { userId, role } = payload

  if (role !== 'teacher' && role !== 'admin') {
    return NextResponse.json({ error: '权限不足，仅教师可发布作业' }, { status: 403 })
  }

  let body: { trainingId?: string; title?: string; description?: string; assignmentType?: string; maxScore?: number; dueDate?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: '请求体格式错误' }, { status: 400 }) }

  const { trainingId, title, description, assignmentType, maxScore, dueDate } = body
  if (!trainingId || !/^T(0[1-9]|1[01])$/.test(trainingId)) {
    return NextResponse.json({ error: '无效的章节 ID' }, { status: 400 })
  }
  if (!title?.trim() || !description?.trim()) {
    return NextResponse.json({ error: '标题和说明不能为空' }, { status: 400 })
  }

  const result = db.insert(courseAssignments).values({
    trainingId,
    teacherId: userId,
    title: title.trim(),
    description: description.trim(),
    assignmentType: assignmentType ?? '案例分析',
    maxScore: maxScore ?? 100,
    dueDate: dueDate ?? null,
  }).run()

  return NextResponse.json({ id: Number(result.lastInsertRowid) })
}
