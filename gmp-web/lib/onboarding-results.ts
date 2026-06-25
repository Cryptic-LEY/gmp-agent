import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { learningPlans, questionHistory, questions } from '@/db/schema'

export interface OnboardingAnswerItem {
  question_id: string
  answer: string
}

export interface OnboardingPlanItem {
  project_name: string
  priority: 'high' | 'medium' | 'low'
  reason: string
  wrong: number
  total: number
}

export interface OnboardingResult {
  score: number
  wrong_count: number
  plan: OnboardingPlanItem[]
  edu_level: string
  major: string
}

type QuestionRow = typeof questions.$inferSelect

interface EvaluatedAnswer {
  answer: OnboardingAnswerItem
  question: QuestionRow
  isCorrect: boolean
}

async function upsertKpMastery(userId: string, kpId: string, isCorrect: boolean) {
  const correct = isCorrect ? 1 : 0
  await db.raw.run(`
    INSERT INTO kp_mastery (user_id, kp_id, confidence, attempt_count, correct_count, last_tested_at)
    VALUES (?, ?, ?, 1, ?, CURRENT_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE
      attempt_count  = attempt_count + 1,
      correct_count  = correct_count + ?,
      confidence     = (correct_count + ?) / (attempt_count + 1),
      last_tested_at = CURRENT_TIMESTAMP(3)
  `, [userId, kpId, correct, correct, correct, correct])
}

function normalizeAnswer(value: string) {
  return value.trim().toUpperCase().split('').sort().join('')
}

async function loadAnsweredQuestions(answers: OnboardingAnswerItem[]) {
  const qMap = new Map<string, QuestionRow>()
  for (const answer of answers) {
    if (!answer.question_id) continue
    const question = (await db.select().from(questions)
      .where(eq(questions.questionId, answer.question_id))
      .limit(1))[0]
    if (question) qMap.set(answer.question_id, question)
  }
  return qMap
}

function buildPlan(eduLevel: string, score: number, evaluated: EvaluatedAnswer[]) {
  type ProjectStats = { wrong: number; total: number }
  const projectStats = new Map<string, ProjectStats>()

  for (const item of evaluated) {
    const project = item.question.projectName ?? '未分类'
    const stats = projectStats.get(project) ?? { wrong: 0, total: 0 }
    stats.total++
    if (!item.isCorrect) stats.wrong++
    projectStats.set(project, stats)
  }

  const collegeProjects = [
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
  const undergraduateProjects = [
    '项目一：GMP认知与法规基础',
    '项目二：质量管理体系构建与运行',
    '项目三：厂房设施与设备管理',
    '项目四：药品生产管理',
    '项目五：确认与验证',
    '项目六：物料与产品管理',
    '项目七：生产过程管理',
    '项目八：质量控制与实验室管理',
    '项目九：产品放行、投诉与召回管理',
    '项目十：委托生产与委托检验',
    '项目十一：GMP自检与综合风险管理实训',
  ]

  const allProjects = eduLevel === 'undergraduate' ? undergraduateProjects : collegeProjects
  const plan: OnboardingPlanItem[] = allProjects.map(project => {
    const stats = projectStats.get(project) ?? { wrong: 0, total: 0 }
    const errorRate = stats.total > 0 ? stats.wrong / stats.total : 0

    let priority: 'high' | 'medium' | 'low'
    let reason: string

    if (score < 60) {
      if (stats.total === 0) {
        priority = 'medium'
        reason = '前测总分偏低，本项目未直接覆盖，建议作为基础补学项目'
      } else if (errorRate >= 0.5) {
        priority = 'high'
        reason = `前测总分偏低且本项目错误率 ${Math.round(errorRate * 100)}%，先重点攻克`
      } else if (stats.wrong > 0) {
        priority = 'medium'
        reason = `前测总分偏低，本项目错 ${stats.wrong}/${stats.total} 题，建议安排补漏`
      } else {
        priority = 'low'
        reason = '本项目前测答题暂稳，可在基础补齐后巩固'
      }
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
      reason = '本项目掌握良好，适当巩固即可'
    }

    return { project_name: project, priority, reason, wrong: stats.wrong, total: stats.total }
  })

  for (const [project, stats] of projectStats.entries()) {
    if (!allProjects.includes(project) && project !== '未分类') {
      const errorRate = stats.total > 0 ? stats.wrong / stats.total : 0
      plan.push({
        project_name: project,
        priority: errorRate >= 0.5 ? 'high' : errorRate >= 0.2 ? 'medium' : 'low',
        reason: `错误率 ${Math.round(errorRate * 100)}%`,
        wrong: stats.wrong,
        total: stats.total,
      })
    }
  }

  return plan
}

async function evaluateOnboarding(eduLevel: string, major: string, answers: OnboardingAnswerItem[]) {
  const qMap = await loadAnsweredQuestions(answers)
  let correct = 0
  const evaluated: EvaluatedAnswer[] = []

  for (const answer of answers) {
    const question = qMap.get(answer.question_id)
    if (!question) continue
    const isCorrect = normalizeAnswer(answer.answer) === normalizeAnswer(question.correctAnswer)
    if (isCorrect) correct++
    evaluated.push({ answer, question, isCorrect })
  }

  const total = answers.length
  const score = total > 0 ? Math.round((correct / total) * 100) : 0
  const wrongCount = evaluated.filter(item => !item.isCorrect).length
  const plan = buildPlan(eduLevel, score, evaluated)

  return {
    result: { score, wrong_count: wrongCount, plan, edu_level: eduLevel, major },
    evaluated,
  }
}

export async function previewOnboardingResult(eduLevel: string, major: string, answers: OnboardingAnswerItem[]) {
  const { result } = await evaluateOnboarding(eduLevel, major, answers)
  return result
}

export async function saveOnboardingResult(userId: string, eduLevel: string, major: string, answers: OnboardingAnswerItem[]) {
  const { result, evaluated } = await evaluateOnboarding(eduLevel, major, answers)

  for (const item of evaluated) {
    await db.insert(questionHistory).values({
      userId,
      questionId: item.answer.question_id,
      userAnswer: item.answer.answer,
      isCorrect: item.isCorrect,
      reviewed: false,
    }).execute()

    if (item.question.kpId) {
      await upsertKpMastery(userId, item.question.kpId, item.isCorrect)
    }
  }

  await db.insert(learningPlans).values({
    userId,
    eduLevel,
    major,
    score: result.score,
    wrongCount: result.wrong_count,
    planData: JSON.stringify(result.plan),
  }).execute()

  return result
}
