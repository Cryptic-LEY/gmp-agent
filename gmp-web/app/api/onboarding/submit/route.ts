import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { questions, learningPlans, questionHistory } from '@/db/schema'
import { eq } from 'drizzle-orm'

// 将答题结果 upsert 进 kp_mastery
// 每道题答对 → kp 正确次数+1，答错 → 只加尝试次数
// confidence = correct_count / attempt_count （简单比率，直观可解释）
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

interface AnswerItem { question_id: string; answer: string }

interface PlanItem {
  project_name: string
  priority: 'high' | 'medium' | 'low'
  reason: string
  wrong: number
  total: number
}

// POST /api/onboarding/submit
// Body: { edu_level, major, answers: [{question_id, answer}] }
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { userId } = payload
  const { edu_level, major, answers } = await req.json() as {
    edu_level: string; major: string; answers: AnswerItem[]
  }

  if (!answers?.length) return NextResponse.json({ error: 'No answers' }, { status: 400 })

  // 批量拉取题目（含正确答案）
  const qMap = new Map<string, typeof questions.$inferSelect>()
  for (const ans of answers) {
    const q = db.select().from(questions).where(eq(questions.questionId, ans.question_id)).get()
    if (q) qMap.set(ans.question_id, q)
  }

  // 评分
  const normalize = (s: string) => s.trim().toUpperCase().split('').sort().join('')
  let correct = 0
  const wrongIds: string[] = []

  for (const ans of answers) {
    const q = qMap.get(ans.question_id)
    if (!q) continue
    const isCorrect = normalize(ans.answer) === normalize(q.correctAnswer)
    if (isCorrect) { correct++ } else { wrongIds.push(ans.question_id) }

    // 写入答题历史（前测记录）
    db.insert(questionHistory).values({
      userId, questionId: ans.question_id,
      userAnswer: ans.answer, isCorrect, reviewed: false,
    }).run()

    // 更新知识点掌握度
    if (q.kpId) {
      upsertKpMastery(userId, q.kpId, isCorrect)
    }
  }

  const total     = answers.length
  const score     = Math.round((correct / total) * 100)
  const wrongCount = wrongIds.length

  // ── 学习方案生成 ─────────────────────────────────────────────────────────
  // 统计每个项目的答题情况
  type ProjectStats = { wrong: number; total: number }
  const projectStats = new Map<string, ProjectStats>()

  for (const ans of answers) {
    const q = qMap.get(ans.question_id)
    const proj = q?.projectName ?? '未分类'
    const stats = projectStats.get(proj) ?? { wrong: 0, total: 0 }
    stats.total++
    if (wrongIds.includes(ans.question_id)) stats.wrong++
    projectStats.set(proj, stats)
  }

  // 定义项目顺序（专科 / 本科映射）
  const COLLEGE_PROJECTS = [
    '专-项目1·GMP实施与管理理论准备',
    '专-项目2·机构与文件系统管理',
    '专-项目3·厂房设施与设备管理',
    '专-项目4·质量控制实验室管理',
    '专-项目5·确认与验证管理',
    '专-项目6·生产全过程管理',
    '专-项目7·质量保证',
    '专-项目8·委托生产与委托检验',
    '专-项目9·企业自检与药品生产检查',
  ]
  const UG_PROJECTS = [
    '项目一：GMP认知与法规基础',
    '项目二：质量管理体系构建与运行',
    '项目三：厂房设施与设备管理',
    '项目四：药品生产管理',        // placeholder
    '项目五：确认与验证',
    '项目六：物料与产品管理',
    '项目七：生产过程管理',
    '项目八：质量控制与实验室管理',
    '项目九：产品放行、投诉与召回管理',
    '项目十：委托生产与委托检验',
    '项目十一：GMP自检与综合风险管理实训',
  ]

  const allProjects = edu_level === 'undergraduate' ? UG_PROJECTS : COLLEGE_PROJECTS

  // 构建方案：出现在答题中的项目 + 未出现的项目（默认低优先级）
  const plan: PlanItem[] = allProjects.map(proj => {
    const stats = projectStats.get(proj) ?? { wrong: 0, total: 0 }
    const errorRate = stats.total > 0 ? stats.wrong / stats.total : 0

    let priority: 'high' | 'medium' | 'low'
    let reason: string

    if (score < 60) {
      priority = 'high'
      reason = '前测得分偏低（<60分），建议从头系统学习本项目'
    } else if (stats.total === 0) {
      priority = 'low'
      reason = '前测未涉及本项目，建议自主学习巩固'
    } else if (errorRate >= 0.5) {
      priority = 'high'
      reason = `本项目错误率 ${Math.round(errorRate * 100)}%，是主要薄弱点，需重点攻克`
    } else if (errorRate >= 0.2) {
      priority = 'medium'
      reason = `本项目错误率 ${Math.round(errorRate * 100)}%，存在知识盲区，建议重点复习`
    } else {
      priority = 'low'
      reason = stats.total > 0 ? '本项目掌握良好，适当巩固即可' : '前测未涉及本项目，建议自主学习巩固'
    }

    return { project_name: proj, priority, reason, wrong: stats.wrong, total: stats.total }
  })

  // 也将出现在答题但不在预设列表中的项目加进去
  for (const [proj, stats] of projectStats.entries()) {
    if (!allProjects.includes(proj) && proj !== '未分类') {
      const errorRate = stats.total > 0 ? stats.wrong / stats.total : 0
      plan.push({
        project_name: proj,
        priority: errorRate >= 0.5 ? 'high' : errorRate >= 0.2 ? 'medium' : 'low',
        reason: `错误率 ${Math.round(errorRate * 100)}%`,
        wrong: stats.wrong,
        total: stats.total,
      })
    }
  }

  // 保存到 learning_plans
  db.insert(learningPlans).values({
    userId, eduLevel: edu_level, major, score, wrongCount,
    planData: JSON.stringify(plan),
  }).run()

  return NextResponse.json({ score, wrong_count: wrongCount, plan, edu_level, major })
}
