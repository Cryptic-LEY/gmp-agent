import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import {
  questions, moduleScores, trainingProjects, kpMastery, questionHistory,
} from '@/db/schema'
import { and, eq, inArray } from 'drizzle-orm'

const TARGET_HOURS: Record<string, number> = { college: 48, undergraduate: 54 }

interface AnswerInput {
  question_id: string
  answer: string                    // "A" / "ABD" / "B" (判断A=对,B=错)
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  const { userId } = payload

  let body: { trainingId?: string; eduLevel?: string; answers?: AnswerInput[] }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: '请求体格式错误' }, { status: 400 }) }

  const { trainingId, eduLevel, answers } = body
  if (!trainingId || !/^T(0[1-9]|1[01])$/.test(trainingId)) {
    return NextResponse.json({ error: '无效的章节 ID' }, { status: 400 })
  }
  if (!eduLevel || !TARGET_HOURS[eduLevel]) {
    return NextResponse.json({ error: '无效的学历层次' }, { status: 400 })
  }
  if (!Array.isArray(answers) || answers.length === 0) {
    return NextResponse.json({ error: '答案不能为空' }, { status: 400 })
  }

  const project = db.select().from(trainingProjects).where(eq(trainingProjects.trainingId, trainingId)).get()
  if (!project) return NextResponse.json({ error: '章节不存在' }, { status: 404 })

  // 取题目
  const qIds = answers.map(a => a.question_id)
  const qRows = db.select().from(questions).where(inArray(questions.questionId, qIds)).all()
  const qMap = new Map(qRows.map(q => [q.questionId, q]))

  // 评分
  let correctCount = 0
  const details: Array<{ qid: string; correct: boolean; userAnswer: string; correctAnswer: string }> = []
  const kpStats = new Map<string, { attempts: number; correct: number }>()

  for (const ans of answers) {
    const q = qMap.get(ans.question_id)
    if (!q) continue
    // 规整答案：去空格 + 排序（多选题）
    const ua = (ans.answer ?? '').trim().toUpperCase().split('').sort().join('')
    const ca = (q.correctAnswer ?? '').trim().toUpperCase().split('').sort().join('')
    const ok = ua === ca && ua.length > 0
    if (ok) correctCount++
    details.push({ qid: q.questionId, correct: ok, userAnswer: ans.answer, correctAnswer: q.correctAnswer })

    // 题目历史
    db.insert(questionHistory).values({
      userId,
      questionId: q.questionId,
      userAnswer: ans.answer,
      isCorrect: ok,
    }).run()

    // 掌握度统计
    if (q.kpId) {
      const stat = kpStats.get(q.kpId) ?? { attempts: 0, correct: 0 }
      stat.attempts++
      if (ok) stat.correct++
      kpStats.set(q.kpId, stat)
    }
  }

  // 更新 kp_mastery
  for (const [kpId, stat] of kpStats.entries()) {
    const existing = db.select().from(kpMastery)
      .where(and(eq(kpMastery.userId, userId), eq(kpMastery.kpId, kpId))).get()
    const newAttempts = (existing?.attemptCount ?? 0) + stat.attempts
    const newCorrect  = (existing?.correctCount ?? 0) + stat.correct
    const newConfidence = newAttempts > 0 ? newCorrect / newAttempts : 0
    if (existing) {
      db.update(kpMastery)
        .set({
          attemptCount: newAttempts,
          correctCount: newCorrect,
          confidence: newConfidence,
          lastTestedAt: new Date().toISOString(),
        })
        .where(and(eq(kpMastery.userId, userId), eq(kpMastery.kpId, kpId)))
        .run()
    } else {
      db.insert(kpMastery).values({
        userId, kpId,
        attemptCount: newAttempts,
        correctCount: newCorrect,
        confidence: newConfidence,
        lastTestedAt: new Date().toISOString(),
      }).run()
    }
  }

  // 计算总分（0-100）
  const score = answers.length > 0
    ? Math.round((correctCount / answers.length) * 100)
    : 0

  // 计算课时分
  const projHours = eduLevel === 'undergraduate' ? (project.hoursUg ?? 0) : (project.hoursCollege ?? 0)
  const allProjects = db.select().from(trainingProjects).all()
  const totalProjectHours = allProjects.reduce(
    (s, p) => s + (eduLevel === 'undergraduate' ? (p.hoursUg ?? 0) : (p.hoursCollege ?? 0)), 0)
  const targetTotal = TARGET_HOURS[eduLevel]
  const maxHours = totalProjectHours > 0 ? (projHours / totalProjectHours) * targetTotal : 0
  const earnedHours = parseFloat((maxHours * (score / 100)).toFixed(2))

  db.insert(moduleScores).values({
    userId, trainingId, eduLevel, score, earnedHours,
  }).run()

  return NextResponse.json({
    trainingId,
    score,
    correctCount,
    totalCount: answers.length,
    earnedHours,
    maxHours: parseFloat(maxHours.toFixed(2)),
    passed: score >= 60,
    details,
  })
}
