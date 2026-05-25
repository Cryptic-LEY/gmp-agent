import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { questions, userGameState, questionHistory } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getRankByXp, XP_REWARDS } from '@/lib/gamification'

// POST { questionId, answer }
// answer: 单选/判断 传 "A"/"B"/... 或 "对"/"错"
//         多选 传 "AC" / "ABD" 等字母拼接（排序后比较）
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { userId } = payload
  const { questionId, answer } = await req.json() as { questionId: string; answer: string }

  const q = db.select().from(questions).where(eq(questions.questionId, questionId)).get()
  if (!q) return NextResponse.json({ error: 'Question not found' }, { status: 404 })

  // 标准化比较：去空格、大写、排序（多选用）
  const normalize = (s: string) => s.trim().toUpperCase().split('').sort().join('')
  const correct = normalize(answer) === normalize(q.correctAnswer)

  let xpGained = 0
  let leveledUp = false
  let newRankTitle = ''
  let newXp = 0

  if (correct) {
    xpGained = XP_REWARDS[q.questionType] ?? 10

    const state = db.select().from(userGameState).where(eq(userGameState.userId, userId)).get()
    if (state) {
      const oldRank = getRankByXp(state.xp)
      newXp = state.xp + xpGained
      const newRank = getRankByXp(newXp)
      leveledUp = newRank.level > oldRank.level
      newRankTitle = newRank.title

      // 每道正确答题奖励 2 积分（游戏货币）
      const newPoints = (state.points ?? 0) + 2

      db.update(userGameState)
        .set({ xp: newXp, points: newPoints, rankLevel: newRank.level, rankTitle: newRank.title })
        .where(eq(userGameState.userId, userId))
        .run()
    }
  }

  // 记录答题历史（无论对错都记录，错题本依赖此表）
  db.insert(questionHistory).values({
    userId,
    questionId,
    userAnswer: answer,
    isCorrect: correct,
    reviewed: false,
  }).run()

  return NextResponse.json({
    correct,
    correctAnswer: q.correctAnswer,
    xpGained,
    newXp,
    leveledUp,
    ...(leveledUp && { newRankTitle }),
  })
}
