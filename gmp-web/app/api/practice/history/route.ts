import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { questionHistory, questions, knowledgePoints } from '@/db/schema'
import { eq, and, desc } from 'drizzle-orm'

// GET /api/practice/history?filter=wrong|all&limit=100
// 返回当前用户的答题历史（默认只返回错题），附带题目全量信息
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { userId } = payload
  const { searchParams } = new URL(req.url)
  const filter = searchParams.get('filter') ?? 'wrong' // wrong | all
  const limit  = Math.min(parseInt(searchParams.get('limit') ?? '200'), 500)

  // 拉取历史记录
  const historyRows = db
    .select()
    .from(questionHistory)
    .where(
      filter === 'wrong'
        ? and(eq(questionHistory.userId, userId), eq(questionHistory.isCorrect, false))
        : eq(questionHistory.userId, userId)
    )
    .orderBy(desc(questionHistory.answeredAt))
    .limit(limit)
    .all()

  if (historyRows.length === 0) {
    return NextResponse.json({ items: [], stats: { total: 0, pending: 0, reviewed: 0 } })
  }

  // 去重：同一题只保留最新一条（避免同题多次错误刷屏）
  const seen = new Set<string>()
  const dedupedHistory = historyRows.filter(h => {
    if (seen.has(h.questionId)) return false
    seen.add(h.questionId)
    return true
  })

  // 批量拉取题目详情
  const qIds = [...new Set(dedupedHistory.map(h => h.questionId))]
  const qMap = new Map<string, typeof questions.$inferSelect>()
  for (const qid of qIds) {
    const q = db.select().from(questions).where(eq(questions.questionId, qid)).get()
    if (q) qMap.set(qid, q)
  }

  // 批量拉取 KP（用于 chapter / topic）
  const kpIds = [...new Set(
    [...qMap.values()].map(q => q.kpId).filter((id): id is string => !!id)
  )]
  const kpMap = new Map<string, typeof knowledgePoints.$inferSelect>()
  for (const kpId of kpIds) {
    const kp = db.select().from(knowledgePoints).where(eq(knowledgePoints.kpId, kpId)).get()
    if (kp) kpMap.set(kpId, kp)
  }

  // 组合结果
  const items = dedupedHistory.map(h => {
    const q = qMap.get(h.questionId)
    if (!q) return null

    const kp = q.kpId ? kpMap.get(q.kpId) : null

    // 构造选项数组（与 /api/practice/question 格式一致）
    const optionKeys = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const
    const optionFields = [q.optionA, q.optionB, q.optionC, q.optionD, q.optionE, q.optionF, q.optionG]
    let options: { key: string; text: string }[]
    if (q.questionType === '判断题') {
      options = [{ key: 'A', text: '对' }, { key: 'B', text: '错' }]
    } else {
      options = optionKeys
        .map((key, i) => ({ key, text: optionFields[i] ?? '' }))
        .filter(o => o.text)
    }

    // 用户答案拆分成字母数组
    const userAnswerLetters = h.userAnswer.toUpperCase().split('').filter(c => /[A-G]/.test(c))
    const correctLetters    = q.correctAnswer.toUpperCase().split('').filter(c => /[A-G]/.test(c))

    return {
      historyId:     h.id,
      questionId:    h.questionId,
      answeredAt:    h.answeredAt,
      isCorrect:     h.isCorrect,
      reviewed:      h.reviewed,
      userAnswer:    userAnswerLetters,
      correctAnswer: correctLetters,
      questionType:  q.questionType,
      difficulty:    q.difficulty,
      stem:          q.stem,
      options,
      explanation:   q.explanation ?? null,
      chapter:       kp?.projectName ?? null,
      topic:         kp?.taskName   ?? null,
      kpTitle:       kp?.title      ?? null,
    }
  }).filter(Boolean)

  // 统计（基于全部错题，不受 dedupe 影响太多，这里用 deduped 做近似）
  const allWrong    = db.select().from(questionHistory)
    .where(and(eq(questionHistory.userId, userId), eq(questionHistory.isCorrect, false)))
    .all()
  const totalWrong  = new Set(allWrong.map(h => h.questionId)).size
  const pendingCount  = allWrong.filter(h => !h.reviewed).length  // 严格：有任意一条 reviewed=false
  // 取每题最新一条来判断是否已 reviewed
  const latestByQ = new Map<string, typeof questionHistory.$inferSelect>()
  for (const h of allWrong) {
    if (!latestByQ.has(h.questionId)) latestByQ.set(h.questionId, h)
  }
  const reviewedCount = [...latestByQ.values()].filter(h => h.reviewed).length
  const pendCount     = totalWrong - reviewedCount

  return NextResponse.json({
    items,
    stats: {
      total:    totalWrong,
      pending:  pendCount,
      reviewed: reviewedCount,
    },
  })
}
