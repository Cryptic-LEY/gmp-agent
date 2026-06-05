import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { knowledgePoints, questions } from '@/db/schema'
import { buildDifficultiesByType } from '@/lib/practice-filters'
import { eq } from 'drizzle-orm'

interface KpMeta {
  kpId: string
  title: string
  projectName: string | null
  taskName: string | null
}

function stripBlank(value: string | null) {
  return value?.trim() || null
}

function buildOptions(question: typeof questions.$inferSelect) {
  if (question.questionType === '判断题') {
    return [{ key: 'A', text: '对' }, { key: 'B', text: '错' }]
  }

  const optionKeys = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const
  const optionFields = [
    question.optionA,
    question.optionB,
    question.optionC,
    question.optionD,
    question.optionE,
    question.optionF,
    question.optionG,
  ]

  return optionKeys
    .map((key, i) => ({ key, text: optionFields[i] ?? '' }))
    .filter(option => option.text)
}

// GET /api/practice/question?type=单选题&difficulty=易&project=...&kpId=...
// GET /api/practice/question?meta=1 返回练习筛选项
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!verifyToken(token)) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const meta = searchParams.get('meta')
  const type = stripBlank(searchParams.get('type'))
  const difficulty = stripBlank(searchParams.get('difficulty'))
  const project = stripBlank(searchParams.get('project'))
  const kpId = stripBlank(searchParams.get('kpId'))

  const kps = await db.select({
    kpId: knowledgePoints.kpId,
    title: knowledgePoints.title,
    projectName: knowledgePoints.projectName,
    taskName: knowledgePoints.taskName,
  }).from(knowledgePoints) as KpMeta[]

  const kpById = new Map(kps.map(kp => [kp.kpId, kp]))
  const rows = await db.select().from(questions).where(eq(questions.status, 'active'))

  if (meta) {
    const activeKpIds = new Set(rows.map(question => question.kpId).filter((id): id is string => Boolean(id)))
    const activeKps = kps.filter(kp => activeKpIds.has(kp.kpId))
    const questionTypes = [...new Set(rows.map(question => question.questionType).filter(Boolean))]
    const difficulties = [...new Set(rows.map(question => question.difficulty).filter(Boolean))]
    const difficultiesByType = buildDifficultiesByType(rows)
    const projects = [...new Set(
      rows
        .map(question => question.projectName || (question.kpId ? kpById.get(question.kpId)?.projectName : null))
        .filter((value): value is string => Boolean(value))
    )].sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
    const knowledgeItems = activeKps
      .filter(kp => kp.title)
      .sort((left, right) => left.title.localeCompare(right.title, 'zh-Hans-CN'))
      .slice(0, 160)
      .map(kp => ({
        kpId: kp.kpId,
        title: kp.title,
        projectName: kp.projectName,
        taskName: kp.taskName,
      }))

    return NextResponse.json({ questionTypes, difficulties, difficultiesByType, projects, knowledgeItems })
  }

  const filteredRows = rows.filter(question => {
    if (type && question.questionType !== type) return false
    if (difficulty && question.difficulty !== difficulty) return false
    if (kpId && question.kpId !== kpId) return false
    if (project) {
      const kp = question.kpId ? kpById.get(question.kpId) : null
      const projectName = question.projectName || kp?.projectName
      if (projectName !== project) return false
    }
    return true
  })

  if (filteredRows.length === 0) {
    return NextResponse.json({ error: 'No questions found' }, { status: 404 })
  }

  const question = filteredRows[Math.floor(Math.random() * filteredRows.length)]
  const kp = question.kpId ? kpById.get(question.kpId) : null

  return NextResponse.json({
    questionId: question.questionId,
    kpId: question.kpId,
    knowledgeTitle: kp?.title ?? null,
    projectName: question.projectName || kp?.projectName || null,
    taskName: kp?.taskName ?? null,
    questionType: question.questionType,
    stem: question.stem,
    difficulty: question.difficulty,
    options: buildOptions(question),
    explanation: question.explanation,
  })
}
