import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { questions, trainingProjects, learningPlans } from '@/db/schema'
import { and, eq, desc } from 'drizzle-orm'

// GET /api/course/quiz/[trainingId]
// 抽 10 道客观题作为章节测验。中:难 = 6:4
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ trainingId: string }> },
) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  const { userId } = payload

  const { trainingId } = await context.params

  const project = db.select().from(trainingProjects)
    .where(eq(trainingProjects.trainingId, trainingId)).get()
  if (!project) return NextResponse.json({ error: '章节不存在' }, { status: 404 })

  // 学历推断
  const latestPlan = db.select().from(learningPlans)
    .where(eq(learningPlans.userId, userId))
    .orderBy(desc(learningPlans.createdAt)).limit(1).get()
  const eduLevel: 'college' | 'undergraduate' = (latestPlan?.eduLevel as 'college' | 'undergraduate') || 'college'
  const projName = eduLevel === 'undergraduate' ? project.kpProjUg : project.kpProjCol

  if (!projName) return NextResponse.json({ questions: [], total: 0 })

  const OBJECTIVE_TYPES = ['单选题', '多选题', '判断题']

  // 该章节的所有客观题
  const pool = db.select().from(questions)
    .where(and(eq(questions.status, 'active'), eq(questions.eduLevel, eduLevel)))
    .all()
    .filter(q => OBJECTIVE_TYPES.includes(q.questionType))
    .filter(q => q.projectName === projName)
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

  const medium = shuffle(pool.filter(q => q.difficulty === '中'))
  const hard   = shuffle(pool.filter(q => q.difficulty === '难'))
  const easy   = shuffle(pool.filter(q => q.difficulty === '易'))

  // 6 中 + 4 难，不够用易补
  let take: typeof pool = [...medium.slice(0, 6), ...hard.slice(0, 4)]
  if (take.length < 10) {
    const remaining = [
      ...medium.slice(6), ...hard.slice(4), ...easy,
    ].slice(0, 10 - take.length)
    take = [...take, ...remaining]
  }

  const final = shuffle(take).slice(0, 10)

  const formatted = final.map(q => {
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
      kp_id:         q.kpId,
      options,
    }
  })

  return NextResponse.json({
    trainingId,
    displayName: project.displayName,
    eduLevel,
    questions: formatted,
    total: formatted.length,
  })
}
