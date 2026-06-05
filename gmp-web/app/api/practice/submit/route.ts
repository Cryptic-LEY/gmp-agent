import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { knowledgePoints, kpMastery, questionHistory, questions, userGameState } from '@/db/schema'
import { and, eq, inArray, ne } from 'drizzle-orm'
import { getRankByXp, XP_REWARDS } from '@/lib/gamification'

interface AiGrade {
  score: number
  passed: boolean
  comment: string
  strengths: string[]
  issues: string[]
  suggestion: string
}

function isSubjectiveQuestion(questionType: string) {
  return questionType.includes('简答') || questionType.includes('案例')
}

function toMysqlDateTime(date = new Date()) {
  return date.toISOString().slice(0, 23).replace('T', ' ')
}

async function gradeWithAi(question: string, studentAnswer: string, referenceAnswer: string, questionType: string): Promise<AiGrade | null> {
  try {
    const resp = await fetch('http://localhost:8001/practice/grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        student_answer: studentAnswer,
        reference_answer: referenceAnswer,
        question_type: questionType,
      }),
    })

    if (!resp.ok) return null
    return await resp.json() as AiGrade
  } catch {
    return null
  }
}

// POST { questionId, answer }
// answer: 单选/判断为 "A"/"B"/...，多选为 "AC"/"ABD"，主观题为文本。
export async function POST(req: NextRequest) {
  try {
    return await handlePracticeSubmit(req)
  } catch (error) {
    console.error('[practice/submit] failed', error)
    return NextResponse.json({ error: '提交失败，请稍后重试' }, { status: 500 })
  }
}

async function handlePracticeSubmit(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { userId } = payload
  let body: { questionId?: string; answer?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求体格式错误' }, { status: 400 })
  }

  const { questionId, answer } = body

  if (!questionId || !answer) {
    return NextResponse.json({ error: 'Missing questionId or answer' }, { status: 400 })
  }

  const question = (await db.select().from(questions).where(eq(questions.questionId, questionId)).limit(1))[0]
  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 })

  const kp = question.kpId
    ? (await db.select({
      kpId: knowledgePoints.kpId,
      title: knowledgePoints.title,
      projectName: knowledgePoints.projectName,
      taskName: knowledgePoints.taskName,
      pointType: knowledgePoints.pointType,
    }).from(knowledgePoints).where(eq(knowledgePoints.kpId, question.kpId)).limit(1))[0]
    : null

  const normalize = (value: string) => value.trim().toUpperCase().split('').sort().join('')
  const subjective = isSubjectiveQuestion(question.questionType)
  const aiGrade = subjective
    ? await gradeWithAi(question.stem, answer, question.correctAnswer, question.questionType)
    : null
  const correct = subjective ? Boolean(aiGrade?.passed) : normalize(answer) === normalize(question.correctAnswer)

  let xpGained = 0
  let leveledUp = false
  let newRankTitle = ''
  let newXp = 0

  if (correct) {
    xpGained = XP_REWARDS[question.questionType] ?? 10

    const state = (await db.select().from(userGameState).where(eq(userGameState.userId, userId)).limit(1))[0]
    if (state) {
      const oldRank = getRankByXp(state.xp)
      newXp = state.xp + xpGained
      const newRank = getRankByXp(newXp)
      leveledUp = newRank.level > oldRank.level
      newRankTitle = newRank.title
      const newPoints = (state.points ?? 0) + 2

      await db.update(userGameState)
        .set({ xp: newXp, points: newPoints, rankLevel: newRank.level, rankTitle: newRank.title })
        .where(eq(userGameState.userId, userId))
        .execute()
    }
  }

  await db.insert(questionHistory).values({
    userId,
    questionId,
    userAnswer: answer,
    isCorrect: correct,
    reviewed: false,
  }).execute()

  let masteryConfidence: number | null = null
  let weakPointUpdated = false

  if (question.kpId && (!subjective || aiGrade)) {
    const existing = (await db.select().from(kpMastery)
      .where(and(eq(kpMastery.userId, userId), eq(kpMastery.kpId, question.kpId)))
      .limit(1))[0]

    const attemptCount = (existing?.attemptCount ?? 0) + 1
    const correctCount = (existing?.correctCount ?? 0) + (correct ? 1 : 0)
    masteryConfidence = Math.round((correctCount / attemptCount) * 100)
    weakPointUpdated = !correct || masteryConfidence < 70

    if (existing) {
      await db.update(kpMastery)
        .set({
          attemptCount,
          correctCount,
          confidence: masteryConfidence,
          lastTestedAt: toMysqlDateTime(),
        })
        .where(and(eq(kpMastery.userId, userId), eq(kpMastery.kpId, question.kpId)))
        .execute()
    } else {
      await db.insert(kpMastery)
        .values({
          userId,
          kpId: question.kpId,
          attemptCount,
          correctCount,
          confidence: masteryConfidence,
          lastTestedAt: toMysqlDateTime(),
        })
        .execute()
    }
  }

  // ── Practice Agent：答题后推荐最弱KP的相关题目 ──────────────────────────
  let suggestedQuestions: Array<{
    questionId: string; stem: string; questionType: string
    difficulty: string; options: { key: string; text: string }[]
  }> = []

  if (weakPointUpdated && kp?.projectName && question.kpId) {
    try {
      // 同项目其他KP
      const projectKps = await db.select({ kpId: knowledgePoints.kpId })
        .from(knowledgePoints)
        .where(and(
          eq(knowledgePoints.projectName, kp.projectName),
          ne(knowledgePoints.kpId, question.kpId),
        ))

      if (projectKps.length > 0) {
        const projectKpIds = projectKps.map(k => k.kpId)

        // 用户对这些KP的掌握度
        const masteryData = await db.select({ kpId: kpMastery.kpId, confidence: kpMastery.confidence })
          .from(kpMastery)
          .where(and(eq(kpMastery.userId, userId), inArray(kpMastery.kpId, projectKpIds)))

        const masteryMap = new Map(masteryData.map(m => [m.kpId, m.confidence]))

        // 排序：未练过(-1) < 掌握度低的
        const sorted = [...projectKpIds].sort((a, b) => {
          const ca = masteryMap.has(a) ? (masteryMap.get(a) ?? 0) : -1
          const cb = masteryMap.has(b) ? (masteryMap.get(b) ?? 0) : -1
          return ca - cb
        })

        const weakestKpId = sorted[0]

        // 找该KP的题目，随机取1道
        const candidates = await db.select().from(questions)
          .where(and(eq(questions.kpId, weakestKpId), eq(questions.status, 'active')))
          .limit(10)

        if (candidates.length > 0) {
          const picked = candidates[Math.floor(Math.random() * candidates.length)]
          const weakKpInfo = projectKps.find(p => p.kpId === weakestKpId)
          const weakMastery = masteryMap.get(weakestKpId)

          const optionKeys = ['A','B','C','D','E','F','G'] as const
          const optFields = [picked.optionA, picked.optionB, picked.optionC, picked.optionD, picked.optionE, picked.optionF, picked.optionG]
          const opts = picked.questionType === '判断题'
            ? [{ key: 'A', text: '对' }, { key: 'B', text: '错' }]
            : optionKeys.map((k, i) => ({ key: k, text: optFields[i] ?? '' })).filter(o => o.text)

          suggestedQuestions = [{
            questionId: picked.questionId,
            stem: picked.stem,
            questionType: picked.questionType,
            difficulty: picked.difficulty,
            options: opts,
            // 额外信息供前端展示
            ...({ weakKpId: weakestKpId, weakMastery: weakMastery ?? null } as object),
          }]
        }
      }
    } catch {
      // 推荐失败不影响主流程
    }
  }

  return NextResponse.json({
    correct,
    pendingReview: subjective && !aiGrade,
    aiGraded: Boolean(aiGrade),
    aiGrade,
    correctAnswer: question.correctAnswer,
    explanation: question.explanation,
    questionType: question.questionType,
    difficulty: question.difficulty,
    knowledgePoint: kp ? {
      kpId: kp.kpId,
      title: kp.title,
      projectName: kp.projectName,
      taskName: kp.taskName,
      pointType: kp.pointType,
    } : null,
    masteryConfidence,
    weakPointUpdated,
    suggestedQuestions,
    xpGained,
    newXp,
    leveledUp,
    ...(leveledUp && { newRankTitle }),
  })
}
