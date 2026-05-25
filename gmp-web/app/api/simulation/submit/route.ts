import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { simulationSessions, questionHistory } from '@/db/schema'

interface AnswerItem { question_id: string; answer: string }

function upsertKpMastery(userId: string, kpId: string, isCorrect: boolean) {
  const correct = isCorrect ? 1 : 0
  db.$client.prepare(`
    INSERT INTO kp_mastery (user_id, kp_id, confidence, attempt_count, correct_count, last_tested_at)
    VALUES (?, ?, ?, 1, ?, datetime('now'))
    ON CONFLICT(user_id, kp_id) DO UPDATE SET
      attempt_count  = attempt_count + 1,
      correct_count  = correct_count + ?,
      confidence     = CAST(correct_count + ? AS REAL) / (attempt_count + 1),
      last_tested_at = datetime('now')
  `).run(userId, kpId, correct, correct, correct, correct)
}

// POST /api/simulation/submit
// Body: { product_name, dosage_category, answers: [{question_id, answer}] }
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { userId } = payload
  const { product_name, dosage_category, answers } = await req.json() as {
    product_name: string
    dosage_category: string
    answers: AnswerItem[]
  }

  if (!answers?.length) return NextResponse.json({ error: 'No answers' }, { status: 400 })

  const normalize = (s: string) => s.trim().toUpperCase().split('').sort().join('')

  type AnswerRecord = {
    question_id: string
    user_answer: string
    correct_answer: string
    is_correct: boolean
    explanation: string | null
    stem: string
    question_type: string
    options: { key: string; text: string }[]
  }

  const records: AnswerRecord[] = []
  let correct = 0

  for (const ans of answers) {
    const q = db.$client.prepare(`
      SELECT question_id, kp_id, correct_answer, explanation, stem, question_type,
             option_a, option_b, option_c, option_d, option_e, option_f, option_g
      FROM questions WHERE question_id = ?
    `).get(ans.question_id) as Record<string, string | null> | undefined

    if (!q) continue

    const isCorrect = normalize(ans.answer) === normalize(q.correct_answer ?? '')
    if (isCorrect) correct++

    const options: { key: string; text: string }[] = []
    for (const k of ['a','b','c','d','e','f','g']) {
      const v = q[`option_${k}`]
      if (v) options.push({ key: k.toUpperCase(), text: v })
    }

    records.push({
      question_id:    ans.question_id,
      user_answer:    ans.answer,
      correct_answer: q.correct_answer ?? '',
      is_correct:     isCorrect,
      explanation:    q.explanation ?? null,
      stem:           q.stem ?? '',
      question_type:  q.question_type ?? '',
      options,
    })

    // 同步写入 question_history
    db.insert(questionHistory).values({
      userId, questionId: ans.question_id,
      userAnswer: ans.answer, isCorrect, reviewed: false,
    }).run()

    // 更新知识点掌握度
    const kpId = (q as Record<string, string | null>).kp_id
    if (kpId) {
      upsertKpMastery(userId, kpId, isCorrect)
    }
  }

  const maxScore = records.length * 10
  const score    = correct * 10

  // 保存仿真记录
  db.insert(simulationSessions).values({
    userId,
    productName:    product_name,
    dosageCategory: dosage_category,
    score,
    maxScore,
    answers: JSON.stringify(records),
  }).run()

  const pct   = records.length > 0 ? Math.round((correct / records.length) * 100) : 0
  const grade =
    pct >= 90 ? 'A' :
    pct >= 75 ? 'B' :
    pct >= 60 ? 'C' : 'D'

  return NextResponse.json({ score, max_score: maxScore, correct, total: records.length, pct, grade, records })
}
