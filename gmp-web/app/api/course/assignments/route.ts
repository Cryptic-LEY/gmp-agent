import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { courseAssignments, courseAssignmentSubmissions } from '@/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { getCourseScopeTeacherId } from '@/lib/course-teacher-scope'
import { stripAssignmentQuestionBlock } from '@/lib/course-assignment-questions'
import { ensureAssignmentSubmissionGraderColumn, normalizeGrader } from '@/lib/course-assignment-review'

type InsertResult = { insertId?: number | string }

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

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  const { userId } = payload

  const { searchParams } = new URL(req.url)
  const trainingId = searchParams.get('trainingId')
  const scopeTeacherId = await getCourseScopeTeacherId(payload)
  const hasTeacherScope = payload.role === 'admin' || Boolean(scopeTeacherId)

  const filters = []
  if (trainingId) filters.push(eq(courseAssignments.trainingId, trainingId))
  if (scopeTeacherId) filters.push(eq(courseAssignments.teacherId, scopeTeacherId))
  const assignments = hasTeacherScope
    ? filters.length > 0
      ? await db.select().from(courseAssignments).where(and(...filters)).orderBy(desc(courseAssignments.createdAt))
      : await db.select().from(courseAssignments).orderBy(desc(courseAssignments.createdAt))
    : []

  await ensureAssignmentSubmissionGraderColumn()
  const submissions = await db
    .select()
    .from(courseAssignmentSubmissions)
    .where(eq(courseAssignmentSubmissions.userId, userId))

  const subMap = new Map(submissions.map(submission => [submission.assignmentId, submission]))
  const list = assignments.map(assignment => {
    const submission = subMap.get(assignment.id)
    return {
      id: assignment.id,
      trainingId: assignment.trainingId,
      title: assignment.title,
      description: stripAssignmentQuestionBlock(assignment.description),
      assignmentType: assignment.assignmentType,
      maxScore: assignment.maxScore,
      dueDate: assignment.dueDate,
      createdAt: assignment.createdAt,
      mySubmission: submission
        ? {
            id: submission.id,
            content: submission.content,
            score: submission.score,
            feedback: submission.feedback,
            submittedAt: submission.submittedAt,
            gradedAt: submission.gradedAt,
            gradedBy: normalizeGrader(submission.gradedBy),
          }
        : null,
    }
  })

  return NextResponse.json({ assignments: list })
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  const { userId, role } = payload

  if (role !== 'teacher' && role !== 'admin') {
    return NextResponse.json({ error: '权限不足，仅教师可发布作业' }, { status: 403 })
  }

  let body: {
    trainingId?: string
    title?: string
    description?: string
    assignmentType?: string
    maxScore?: number
    dueDate?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求体格式错误' }, { status: 400 })
  }

  const { trainingId, title, description, assignmentType, maxScore, dueDate } = body
  if (!trainingId || !/^T(0[1-9]|1[01])$/.test(trainingId)) {
    return NextResponse.json({ error: '无效的章节 ID' }, { status: 400 })
  }
  if (!title?.trim() || !description?.trim()) {
    return NextResponse.json({ error: '标题和说明不能为空' }, { status: 400 })
  }

  const result = await db.raw.run(
    `
      INSERT INTO course_assignments
        (training_id, teacher_id, title, description, assignment_type, max_score, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      trainingId,
      userId,
      title.trim(),
      description.trim(),
      assignmentType?.trim() || '案例分析',
      maxScore ?? 100,
      normalizeDueDate(dueDate),
    ],
  ) as InsertResult

  return NextResponse.json({ id: Number(result.insertId ?? 0) })
}
