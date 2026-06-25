import { NextRequest, NextResponse } from 'next/server'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { courseAssignments, courseAssignmentSubmissions, trainingProjects, users } from '@/db/schema'
import { verifyToken } from '@/lib/auth'
import {
  buildSubmissionReviewItemsWithFallback,
  ensureAssignmentSubmissionGraderColumn,
  hydrateAssignmentQuestions,
  normalizeGrader,
} from '@/lib/course-assignment-review'

type InsertResult = { insertId?: number | string }

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

export async function GET(req: NextRequest) {
  const payload = requireTeacher(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const trainingId = searchParams.get('trainingId')

  const chapters = await db.select().from(trainingProjects).orderBy(asc(trainingProjects.seqOrder))

  const filters = []
  if (trainingId) filters.push(eq(courseAssignments.trainingId, trainingId))
  if (payload.role !== 'admin') filters.push(eq(courseAssignments.teacherId, payload.userId))
  const assignments = filters.length > 0
    ? await db.select().from(courseAssignments)
      .where(and(...filters))
      .orderBy(asc(courseAssignments.trainingId), asc(courseAssignments.createdAt))
    : await db.select().from(courseAssignments).orderBy(asc(courseAssignments.trainingId), asc(courseAssignments.createdAt))

  await ensureAssignmentSubmissionGraderColumn()
  const studentFilters = [eq(users.role, 'student')]
  if (payload.role !== 'admin') studentFilters.push(eq(users.teacherUserId, payload.userId))
  const studentRows = await db.select({
    userId: users.userId,
    studentName: users.displayName,
    studentEmail: users.email,
    className: users.className,
  }).from(users).where(and(...studentFilters))
  const chapterMap = new Map(chapters.map(chapter => [chapter.trainingId, chapter]))
  const assignmentIds = assignments.map(assignment => assignment.id)
  const submissions = assignmentIds.length > 0
    ? await db.select({
      id: courseAssignmentSubmissions.id,
      assignmentId: courseAssignmentSubmissions.assignmentId,
      userId: courseAssignmentSubmissions.userId,
      content: courseAssignmentSubmissions.content,
      score: courseAssignmentSubmissions.score,
      feedback: courseAssignmentSubmissions.feedback,
      submittedAt: courseAssignmentSubmissions.submittedAt,
      gradedAt: courseAssignmentSubmissions.gradedAt,
      gradedBy: courseAssignmentSubmissions.gradedBy,
      studentName: users.displayName,
      studentEmail: users.email,
      className: users.className,
    })
      .from(courseAssignmentSubmissions)
      .innerJoin(users, eq(courseAssignmentSubmissions.userId, users.userId))
      .where(inArray(courseAssignmentSubmissions.assignmentId, assignmentIds))
      .orderBy(asc(courseAssignmentSubmissions.submittedAt))
    : []

  const submissionsByAssignment = new Map<number, typeof submissions>()
  for (const submission of submissions) {
    if (!submissionsByAssignment.has(submission.assignmentId)) submissionsByAssignment.set(submission.assignmentId, [])
    submissionsByAssignment.get(submission.assignmentId)!.push(submission)
  }

  const assignmentGroups = new Map<string, typeof assignments>()
  for (const assignment of assignments) {
    const key = `${assignment.teacherId}:${assignment.trainingId}:${assignment.title.trim()}`
    if (!assignmentGroups.has(key)) assignmentGroups.set(key, [])
    assignmentGroups.get(key)!.push(assignment)
  }
  const displayAssignments = Array.from(assignmentGroups.values()).map(group => {
    const submitted = group.find(assignment => (submissionsByAssignment.get(assignment.id)?.length ?? 0) > 0)
    return submitted ?? group[0]
  })
  const mergedSubmissionsByAssignment = new Map<number, typeof submissions>()
  for (const group of assignmentGroups.values()) {
    const representative = group.find(assignment => (submissionsByAssignment.get(assignment.id)?.length ?? 0) > 0) ?? group[0]
    const merged = group.flatMap(assignment => submissionsByAssignment.get(assignment.id) ?? [])
    mergedSubmissionsByAssignment.set(representative.id, merged)
  }

  const sortedDisplayAssignments = displayAssignments.sort((left, right) => {
    const leftOrder = chapterMap.get(left.trainingId)?.seqOrder ?? Number.MAX_SAFE_INTEGER
    const rightOrder = chapterMap.get(right.trainingId)?.seqOrder ?? Number.MAX_SAFE_INTEGER
    return leftOrder - rightOrder || left.trainingId.localeCompare(right.trainingId, 'zh-CN', { numeric: true }) || left.createdAt.localeCompare(right.createdAt)
  })

  const responseAssignments = await Promise.all(sortedDisplayAssignments.map(async assignment => {
      const assignmentSubmissions = mergedSubmissionsByAssignment.get(assignment.id) ?? []
      const submittedUserIds = new Set(assignmentSubmissions.map(submission => submission.userId))
      const missingStudents = studentRows.filter(student => !submittedUserIds.has(student.userId))
      const reviewQuestions = await hydrateAssignmentQuestions(assignment.description)
      const sortedSubmissions = [...assignmentSubmissions].sort((left, right) =>
        (left.className ?? '').localeCompare(right.className ?? '', 'zh-CN', { numeric: true }) ||
        (left.studentName ?? '').localeCompare(right.studentName ?? '', 'zh-CN', { numeric: true }) ||
        (left.studentEmail ?? '').localeCompare(right.studentEmail ?? '', 'zh-CN', { numeric: true }))
      const submissionPayloads = await Promise.all(sortedSubmissions.map(async submission => ({
        id: submission.id,
        userId: submission.userId,
        studentName: submission.studentName,
        studentEmail: submission.studentEmail,
        className: submission.className,
        content: submission.content,
        score: submission.score,
        feedback: submission.feedback,
        submittedAt: submission.submittedAt,
        gradedAt: submission.gradedAt,
        gradedBy: normalizeGrader(submission.gradedBy),
        questionReviews: await buildSubmissionReviewItemsWithFallback(reviewQuestions, submission.content, submission.feedback),
      })))
      const chapter = chapterMap.get(assignment.trainingId)
      return {
        id: assignment.id,
        trainingId: assignment.trainingId,
        chapterName: chapter?.displayName ?? assignment.trainingId,
        title: assignment.title,
        description: assignment.description,
        assignmentType: assignment.assignmentType,
        maxScore: assignment.maxScore,
        dueDate: assignment.dueDate,
        createdAt: assignment.createdAt,
        studentTotal: studentRows.length,
        submissionCount: assignmentSubmissions.length,
        missingCount: missingStudents.length,
        missingStudents,
        gradedCount: assignmentSubmissions.filter(submission => submission.score !== null).length,
        questions: reviewQuestions,
        submissions: submissionPayloads,
      }
    }))

  return NextResponse.json({ assignments: responseAssignments })
}

export async function POST(req: NextRequest) {
  const payload = requireTeacher(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  const result = await db.raw.run(
    `
      INSERT INTO course_assignments
        (training_id, teacher_id, title, description, assignment_type, max_score, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      trainingId,
      payload.userId,
      title,
      description,
      body.assignmentType?.trim() || '案例分析',
      Math.max(1, Math.min(100, Number(body.maxScore ?? 100))),
      normalizeDueDate(body.dueDate),
    ],
  ) as InsertResult

  return NextResponse.json({ id: Number(result.insertId ?? 0) })
}
