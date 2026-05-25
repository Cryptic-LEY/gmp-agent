import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { questions } from '@/db/schema'
import { and, eq } from 'drizzle-orm'

// GET /api/onboarding/questions?edu_level=college|undergraduate&major=药学
// 返回20道客观题：易12道 + 中8道
// 答案字段从返回中移除，提交时服务端核对
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!verifyToken(token)) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const eduLevel = searchParams.get('edu_level') ?? 'college'   // college | undergraduate
  // major 暂时只用于日志，后续可做精细化过滤

  const OBJECTIVE_TYPES = ['单选题', '多选题', '判断题']

  // 拉取当前 edu_level 的所有客观题（仅中/难，不含简单题）
  const pool = db.select().from(questions)
    .where(and(eq(questions.status, 'active'), eq(questions.eduLevel, eduLevel)))
    .all()
    .filter(q => OBJECTIVE_TYPES.includes(q.questionType))
    // 只保留中、难两档
    .filter(q => q.difficulty === '中' || q.difficulty === '难')
    // 过滤掉数据不完整的题
    .filter(q => {
      if (q.questionType === '判断题') return true
      return !!(q.optionA && q.optionA.trim() && q.optionB && q.optionB.trim())
    })

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  // 按难度分组
  const mediumPool = pool.filter(q => q.difficulty === '中')
  const hardPool   = pool.filter(q => q.difficulty === '难')

  const mediumShuffled = shuffle(mediumPool)
  const hardShuffled   = shuffle(hardPool)

  // 抽取：中14道 + 难6道，不够则互补
  let medium14 = mediumShuffled.slice(0, 14)
  let hard6    = hardShuffled.slice(0, 6)

  const shortM = 14 - medium14.length
  const shortH = 6  - hard6.length
  if (shortM > 0) medium14 = [...medium14, ...hardShuffled.slice(6, 6 + shortM)]
  if (shortH > 0) hard6    = [...hard6,    ...mediumShuffled.slice(14, 14 + shortH)]

  const selected = shuffle([...medium14, ...hard6])

  // 构造选项数组，隐藏正确答案
  const formatted = selected.map(q => {
    const optionKeys = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const
    const optionFields = [q.optionA, q.optionB, q.optionC, q.optionD, q.optionE, q.optionF, q.optionG]
    let options: { key: string; text: string }[]
    if (q.questionType === '判断题') {
      options = [{ key: 'A', text: '对' }, { key: 'B', text: '错' }]
    } else {
      options = optionKeys.map((key, i) => ({ key, text: optionFields[i] ?? '' })).filter(o => o.text)
    }
    return {
      question_id:   q.questionId,
      question_type: q.questionType,
      stem:          q.stem,
      difficulty:    q.difficulty,
      project_name:  q.projectName,
      options,
      // 不返回 correct_answer
    }
  })

  return NextResponse.json({ questions: formatted, total: formatted.length })
}
