import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { questions } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'

// GET /api/practice/question?type=单选题
// type 不传则随机混合（仅客观题）
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!verifyToken(token)) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')

  const OBJECTIVE_TYPES = ['单选题', '多选题', '判断题']

  let query = db
    .select()
    .from(questions)
    .where(eq(questions.status, 'active'))

  // 过滤题型：指定则用指定的，否则只取客观题
  const rows = query.all().filter(q =>
    type ? q.questionType === type : OBJECTIVE_TYPES.includes(q.questionType)
  )

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No questions found' }, { status: 404 })
  }

  const q = rows[Math.floor(Math.random() * rows.length)]

  // 判断题固定用 A=对 B=错
  let options: { key: string; text: string }[]
  if (q.questionType === '判断题') {
    options = [{ key: 'A', text: '对' }, { key: 'B', text: '错' }]
  } else {
    const optionKeys = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const
    const optionFields = [q.optionA, q.optionB, q.optionC, q.optionD, q.optionE, q.optionF, q.optionG]
    options = optionKeys
      .map((key, i) => ({ key, text: optionFields[i] ?? '' }))
      .filter(o => o.text)
  }

  return NextResponse.json({
    questionId: q.questionId,
    questionType: q.questionType,
    stem: q.stem,
    difficulty: q.difficulty,
    options,
  })
}
