import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  courseAssignments,
  courseAssignmentSubmissions,
  courseStudyLogs,
  knowledgePoints,
  kpMastery,
  learningPlans,
  moduleScores,
  trainingProjects,
} from '@/db/schema'
import {
  buildPersonalizedScheme,
  compactProjectName,
  prioritySort,
  safeParsePlan,
  type PersonalizedScheme,
  type PlanAction,
  type PlanItem,
} from '@/lib/personalized-plan'
import { courseProjectMatches, normalizeCourseProjectName } from '@/lib/course-project-match'

type LearningPlan = typeof learningPlans.$inferSelect
type TrainingProject = typeof trainingProjects.$inferSelect
type EduLevel = 'college' | 'undergraduate'

interface AdaptiveLearningPlanOptions {
  useAi?: boolean
}

interface AdaptiveProfileProject {
  training_id: string
  project_name: string
  display_name: string
  priority: PlanItem['priority']
  adaptive_score: number
  evidence: string[]
  recommended_actions: string[]
}

export interface AdaptiveLearningProfile {
  edu_level: EduLevel
  major: string
  pretest_score: number
  wrong_count: number
  generated_at: string
  projects: AdaptiveProfileProject[]
}

export interface AdaptiveLearningPlanResult {
  plan: PlanItem[]
  personalizedScheme: PersonalizedScheme
  generatedBy: 'rules' | 'ai+rules'
  profile: AdaptiveLearningProfile
}

const PRIORITY_RANK: Record<PlanItem['priority'], number> = { high: 0, medium: 1, low: 2 }

const MAJOR_FOCUS = [
  {
    match: ['中药'],
    label: '中药制剂/饮片质量管理',
    projectKeywords: ['生产', '物料', '质量控制', '放行', '风险'],
    caseFocus: ['玄麦甘桔胶囊', '三七片', '银翘合剂'],
  },
  {
    match: ['生物'],
    label: '生物制品与无菌风险控制',
    projectKeywords: ['验证', '质量控制', '设施', '设备', '风险'],
    caseFocus: ['冻干人用狂犬病疫苗'],
  },
  {
    match: ['管理', '监督'],
    label: '质量体系、放行与监管检查',
    projectKeywords: ['质量', '放行', '投诉', '召回', '自检', '检查'],
    caseFocus: ['注射用头孢曲松钠', '卡马西平片'],
  },
  {
    match: ['化学', '制剂', '药学', '生产', '设备'],
    label: '化学药制剂生产与验证',
    projectKeywords: ['生产', '验证', '设备', '质量控制', '物料'],
    caseFocus: ['卡马西平片', '对乙酰氨基酚胶囊', '硫酸锌颗粒'],
  },
]

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

export function normalizeMasteryConfidence(value: number | null | undefined) {
  const numeric = Number(value ?? 0)
  if (!Number.isFinite(numeric)) return 0
  return clamp01(numeric > 1 ? numeric / 100 : numeric)
}

function toMysqlDateTime(date: Date) {
  return date.toISOString().slice(0, 23).replace('T', ' ')
}

function getEduLevel(value: string | null | undefined): EduLevel {
  return value === 'undergraduate' ? 'undergraduate' : 'college'
}

function getEduLabel(eduLevel: EduLevel) {
  return eduLevel === 'undergraduate' ? '本科' : '专科'
}

function getProjectName(project: TrainingProject, eduLevel: EduLevel) {
  return eduLevel === 'undergraduate'
    ? (project.kpProjUg || project.displayName)
    : (project.kpProjCol || project.displayName)
}

function findPretestItem(plan: PlanItem[], project: TrainingProject, projectName: string) {
  const candidates = [projectName, project.displayName, project.kpProjUg, project.kpProjCol].filter(Boolean)
  return plan.find(item => candidates.some(candidate =>
    courseProjectMatches(item.project_name, candidate) ||
    normalizeCourseProjectName(item.project_name).includes(normalizeCourseProjectName(candidate)) ||
    normalizeCourseProjectName(candidate).includes(normalizeCourseProjectName(item.project_name))
  ))
}

function getMajorFocus(major: string) {
  return MAJOR_FOCUS.find(item => item.match.some(keyword => major.includes(keyword)))
}

function projectHasMajorFocus(projectName: string, displayName: string, major: string) {
  const focus = getMajorFocus(major)
  if (!focus) return false
  const text = `${projectName} ${displayName}`
  return focus.projectKeywords.some(keyword => text.includes(keyword))
}

function describeMajorFocus(major: string) {
  const focus = getMajorFocus(major)
  if (!focus) return null
  return `${focus.label}，建议结合 ${focus.caseFocus.slice(0, 2).join('、')} 案例`
}

function average(values: number[]) {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null
}

function buildActions(args: {
  weakKpCount: number
  latestScore: number | null
  studyMinutes: number
  pretestRate: number | null
  projectName: string
}) {
  const actions: string[] = []
  if (args.weakKpCount > 0 || (args.pretestRate ?? 0) >= 0.2) {
    actions.push(`围绕 ${compactProjectName(args.projectName)} 完成专项练习并复盘错题`)
  }
  if (args.latestScore !== null && args.latestScore < 70) {
    actions.push('先补课程关键知识点，再重做章节测验')
  }
  if (args.studyMinutes < 20) {
    actions.push('补齐课程课件学习，形成基础框架')
  }
  if (actions.length === 0) actions.push('保持每周混合练习，防止遗忘回落')
  return actions.slice(0, 3)
}

function buildReason(evidence: string[], priority: PlanItem['priority']) {
  if (evidence.length > 0) return `综合诊断：${evidence.slice(0, 3).join('；')}`
  if (priority === 'high') return '综合表现提示该项目需要优先强化。'
  if (priority === 'medium') return '该项目存在零散盲区，建议安排复习。'
  return '该项目整体较稳定，保持巩固即可。'
}

function buildRuleSummary(plan: PlanItem[], score: number) {
  const sorted = prioritySort(plan)
  const top = sorted[0]
  const second = sorted[1]
  if (!top) return `前测得分 ${score} 分，当前暂无足够学习记录，建议先完成课程学习与每日练习。`
  const topName = compactProjectName(top.project_name)
  const secondName = second ? compactProjectName(second.project_name) : '错题复盘'
  if (score < 60) {
    return `前测得分 ${score} 分，系统已结合后续学习记录重新排序，建议先补 ${topName}，再用 ${secondName} 做闭环巩固。`
  }
  return `系统综合前测、知识点掌握度、章节成绩和学习投入后，当前最需要关注 ${topName}，并搭配 ${secondName} 巩固。`
}

function buildRuleFocus(plan: PlanItem[], major: string) {
  const sorted = prioritySort(plan)
  const focus = sorted.slice(0, 2).map(item => compactProjectName(item.project_name))
  const majorFocus = describeMajorFocus(major)
  return [
    `优先处理：${focus[0] ?? 'GMP基础能力'}`,
    `搭配巩固：${focus[1] ?? '错题复盘'}`,
    majorFocus ? `专业侧重：${majorFocus}` : '学习节奏：练习定位、课程补漏、仿真验收',
  ]
}

function sortAdaptivePlan(plan: PlanItem[]) {
  return [...plan].sort((left, right) => {
    const priorityDiff = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority]
    if (priorityDiff !== 0) return priorityDiff
    return (right.adaptive_score ?? 0) - (left.adaptive_score ?? 0)
  })
}

// 专科 training_id 与 kp_proj_col 是多对一（如 T06/T07 共享"专-项目6"），
// 按行直出会产生同名 project_name 的重复条目，这里按 project_name 合并。
function mergeDuplicateProjectItems(plan: PlanItem[]): PlanItem[] {
  const groups = new Map<string, PlanItem[]>()
  for (const item of plan) {
    const group = groups.get(item.project_name)
    if (group) group.push(item)
    else groups.set(item.project_name, [item])
  }

  return Array.from(groups.values()).map(group => {
    if (group.length === 1) return group[0]

    const primary = group.reduce((best, item) =>
      (item.adaptive_score ?? 0) > (best.adaptive_score ?? 0) ? item : best)
    const masteryValues = group.map(item => item.mastery_avg).filter((value): value is number => value != null)

    return {
      ...primary,
      wrong: group.reduce((sum, item) => sum + item.wrong, 0),
      total: group.reduce((sum, item) => sum + item.total, 0),
      evidence: Array.from(new Set(group.flatMap(item => item.evidence ?? []))),
      recommended_actions: Array.from(new Set(group.flatMap(item => item.recommended_actions ?? []))),
      mastery_avg: masteryValues.length
        ? Math.round(masteryValues.reduce((sum, value) => sum + value, 0) / masteryValues.length)
        : null,
      study_minutes: group.reduce((sum, item) => sum + (item.study_minutes ?? 0), 0),
    }
  })
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stringArray(value: unknown, fallback: string[]) {
  return Array.isArray(value)
    ? value.map(item => String(item ?? '').trim()).filter(Boolean).slice(0, 5)
    : fallback
}

function mergeAction(fallback: PlanAction, value: unknown): PlanAction {
  if (!isPlainObject(value)) return fallback
  return {
    title: String(value.title || fallback.title),
    duration: String(value.duration || fallback.duration),
    focus: String(value.focus || fallback.focus),
    detail: String(value.detail || fallback.detail),
    href: fallback.href,
  }
}

function mergeSevenDayPlan(fallback: PersonalizedScheme['seven_day_plan'], value: unknown) {
  if (!Array.isArray(value)) return fallback
  const parsed = value
    .map((item, index) => {
      if (!isPlainObject(item)) return null
      const tasks = stringArray(item.tasks, fallback[index]?.tasks ?? [])
      if (tasks.length === 0) return null
      return {
        day: String(item.day || fallback[index]?.day || `第${index + 1}天`),
        title: String(item.title || fallback[index]?.title || '学习任务'),
        tasks,
      }
    })
    .filter((item): item is PersonalizedScheme['seven_day_plan'][number] => Boolean(item))
    .slice(0, 7)
  return parsed.length === 7 ? parsed : fallback
}

async function enhanceSchemeWithAi(profile: AdaptiveLearningProfile, fallback: PersonalizedScheme) {
  const agentApiUrl = process.env.AGENT_API_URL ?? 'http://127.0.0.1:8001'
  try {
    const response = await fetch(`${agentApiUrl}/learning-plan/adaptive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile }),
      signal: AbortSignal.timeout(12_000),
    })
    if (!response.ok) return { scheme: fallback, usedAi: false }
    const payload = await response.json() as Record<string, unknown>
    const schemeValue = isPlainObject(payload.scheme) ? payload.scheme : payload
    const scheme: PersonalizedScheme = {
      summary: String(schemeValue.summary || fallback.summary),
      ai_focus: stringArray(schemeValue.ai_focus, fallback.ai_focus),
      weak_items: fallback.weak_items,
      daily_practice: mergeAction(fallback.daily_practice, schemeValue.daily_practice),
      course_learning: mergeAction(fallback.course_learning, schemeValue.course_learning),
      simulation_training: mergeAction(fallback.simulation_training, schemeValue.simulation_training),
      seven_day_plan: mergeSevenDayPlan(fallback.seven_day_plan, schemeValue.seven_day_plan),
    }
    return { scheme, usedAi: true }
  } catch {
    return { scheme: fallback, usedAi: false }
  }
}

export async function buildAdaptiveLearningPlan(
  userId: string,
  knownLatestPlan?: LearningPlan | null,
  options: AdaptiveLearningPlanOptions = {},
): Promise<AdaptiveLearningPlanResult | null> {
  const latestPlan = knownLatestPlan ?? (await db.select().from(learningPlans)
    .where(eq(learningPlans.userId, userId))
    .orderBy(desc(learningPlans.createdAt))
    .limit(1))[0]

  if (!latestPlan) return null

  const eduLevel = getEduLevel(latestPlan.eduLevel)
  const eduLabel = getEduLabel(eduLevel)
  const major = latestPlan.major || ''
  const pretestPlan = safeParsePlan(latestPlan.planData)

  const [
    projects,
    kps,
    masteryRows,
    allScores,
    assignmentRows,
    studyAgg,
    weekStudyAgg,
  ] = await Promise.all([
    db.select().from(trainingProjects),
    db.select().from(knowledgePoints).where(eq(knowledgePoints.eduLevel, eduLabel)),
    db.select().from(kpMastery).where(eq(kpMastery.userId, userId)),
    db.select().from(moduleScores)
      .where(eq(moduleScores.userId, userId))
      .orderBy(desc(moduleScores.completedAt)),
    db.select({
      trainingId: courseAssignments.trainingId,
      score: courseAssignmentSubmissions.score,
    })
      .from(courseAssignmentSubmissions)
      .innerJoin(courseAssignments, eq(courseAssignmentSubmissions.assignmentId, courseAssignments.id))
      .where(eq(courseAssignmentSubmissions.userId, userId)),
    db.select({
      trainingId: courseStudyLogs.trainingId,
      seconds: sql<number>`COALESCE(SUM(${courseStudyLogs.seconds}), 0)`.as('seconds'),
    }).from(courseStudyLogs)
      .where(eq(courseStudyLogs.userId, userId))
      .groupBy(courseStudyLogs.trainingId),
    db.select({
      trainingId: courseStudyLogs.trainingId,
      seconds: sql<number>`COALESCE(SUM(${courseStudyLogs.seconds}), 0)`.as('seconds'),
    }).from(courseStudyLogs)
      .where(and(
        eq(courseStudyLogs.userId, userId),
        sql`${courseStudyLogs.loggedAt} >= ${toMysqlDateTime(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))}`,
      ))
      .groupBy(courseStudyLogs.trainingId),
  ])

  const latestScoreByTraining = new Map<string, typeof allScores[number]>()
  for (const score of allScores) {
    if (!latestScoreByTraining.has(score.trainingId)) latestScoreByTraining.set(score.trainingId, score)
  }

  const masteryByKp = new Map(masteryRows.map(row => [row.kpId, row]))
  const studySecondsByTraining = new Map(studyAgg.map(row => [row.trainingId, Number(row.seconds) || 0]))
  const weekStudySecondsByTraining = new Map(weekStudyAgg.map(row => [row.trainingId, Number(row.seconds) || 0]))
  const assignmentScoresByTraining = new Map<string, number[]>()
  for (const row of assignmentRows) {
    if (typeof row.score !== 'number') continue
    const values = assignmentScoresByTraining.get(row.trainingId) ?? []
    values.push(row.score)
    assignmentScoresByTraining.set(row.trainingId, values)
  }

  const adaptivePlan = projects
    .sort((left, right) => left.seqOrder - right.seqOrder)
    .map(project => {
      const projectName = getProjectName(project, eduLevel)
      const pretestItem = findPretestItem(pretestPlan, project, projectName)
      const projectKps = kps.filter(kp => courseProjectMatches(kp.projectName, projectName))
      const confidenceValues = projectKps
        .map(kp => masteryByKp.get(kp.kpId))
        .filter((row): row is NonNullable<typeof row> => Boolean(row && row.attemptCount > 0))
        .map(row => normalizeMasteryConfidence(row.confidence))
      const avgConfidence = average(confidenceValues)
      const weakKpCount = confidenceValues.filter(value => value < 0.5).length
      const untestedCount = Math.max(0, projectKps.length - confidenceValues.length)
      const pretestRate = pretestItem && pretestItem.total > 0 ? pretestItem.wrong / pretestItem.total : null
      const pretestWeakness = pretestRate ?? (latestPlan.score < 60 ? 0.45 : 0.18)
      const masteryWeakness = avgConfidence === null ? 0.38 : 1 - avgConfidence
      const latestScore = latestScoreByTraining.get(project.trainingId)?.score ?? null
      const assignmentAverage = average(assignmentScoresByTraining.get(project.trainingId) ?? [])
      const assessmentScore = latestScore ?? assignmentAverage
      const assessmentWeakness = assessmentScore !== null ? Math.max(0, (80 - assessmentScore) / 80) : 0.3
      const totalStudyMinutes = Math.round((studySecondsByTraining.get(project.trainingId) ?? 0) / 60)
      const weekStudyMinutes = Math.round((weekStudySecondsByTraining.get(project.trainingId) ?? 0) / 60)
      const activityGap = totalStudyMinutes === 0
        ? 0.5
        : weekStudyMinutes === 0 && (pretestRate ?? 0) >= 0.2
          ? 0.28
          : 0
      const coverageGap = projectKps.length > 0 ? untestedCount / projectKps.length : 0.25
      const majorBoost = projectHasMajorFocus(projectName, project.displayName, major) ? 8 : 0
      const lowScoreBoost = latestPlan.score < 60 ? 5 : 0
      const adaptiveScore = Math.min(100, Math.round(
        pretestWeakness * 35 +
        masteryWeakness * 25 +
        assessmentWeakness * 20 +
        coverageGap * 10 +
        activityGap * 10 +
        majorBoost +
        lowScoreBoost,
      ))

      const priority: PlanItem['priority'] =
        adaptiveScore >= 55 || (pretestRate ?? 0) >= 0.5 || (avgConfidence !== null && avgConfidence < 0.5) || (latestScore !== null && latestScore < 60)
          ? 'high'
          : adaptiveScore >= 32 || (pretestRate ?? 0) >= 0.2 || weakKpCount > 0
            ? 'medium'
            : 'low'

      const evidence: string[] = []
      if (pretestItem?.total) evidence.push(`前测 ${pretestItem.wrong}/${pretestItem.total} 题出错`)
      if (avgConfidence !== null) evidence.push(`知识点平均掌握度 ${Math.round(avgConfidence * 100)}%`)
      if (weakKpCount > 0) evidence.push(`${weakKpCount} 个知识点低于 50%`)
      if (latestScore !== null) evidence.push(`最近章节测验 ${latestScore} 分`)
      if (assignmentAverage !== null) evidence.push(`作业平均 ${Math.round(assignmentAverage)} 分`)
      if (totalStudyMinutes < 20) evidence.push('课程学习投入偏少')
      const majorFocus = describeMajorFocus(major)
      if (majorFocus && projectHasMajorFocus(projectName, project.displayName, major)) {
        evidence.push(`匹配专业侧重：${majorFocus}`)
      }

      const recommendedActions = buildActions({
        weakKpCount,
        latestScore,
        studyMinutes: totalStudyMinutes,
        pretestRate,
        projectName,
      })

      return {
        project_name: projectName,
        display_name: project.displayName,
        training_id: project.trainingId,
        priority,
        reason: buildReason(evidence, priority),
        wrong: pretestItem?.wrong ?? 0,
        total: pretestItem?.total ?? 0,
        adaptive_score: adaptiveScore,
        evidence,
        recommended_actions: recommendedActions,
        mastery_avg: avgConfidence === null ? null : Math.round(avgConfidence * 100),
        latest_score: latestScore,
        study_minutes: totalStudyMinutes,
        source: 'adaptive' as const,
      }
    })

  const sortedPlan = sortAdaptivePlan(mergeDuplicateProjectItems(adaptivePlan))
  const fallbackScheme = buildPersonalizedScheme(sortedPlan, latestPlan.score, {
    summary: buildRuleSummary(sortedPlan, latestPlan.score),
    aiFocus: buildRuleFocus(sortedPlan, major),
  })
  const profile: AdaptiveLearningProfile = {
    edu_level: eduLevel,
    major,
    pretest_score: latestPlan.score,
    wrong_count: latestPlan.wrongCount,
    generated_at: new Date().toISOString(),
    projects: sortedPlan.slice(0, 6).map(item => ({
      training_id: item.training_id ?? '',
      project_name: item.project_name,
      display_name: item.display_name ?? item.project_name,
      priority: item.priority,
      adaptive_score: item.adaptive_score ?? 0,
      evidence: item.evidence ?? [],
      recommended_actions: item.recommended_actions ?? [],
    })),
  }

  const { scheme, usedAi } = options.useAi === false
    ? { scheme: fallbackScheme, usedAi: false }
    : await enhanceSchemeWithAi(profile, fallbackScheme)

  return {
    plan: sortedPlan,
    personalizedScheme: scheme,
    generatedBy: usedAi ? 'ai+rules' : 'rules',
    profile,
  }
}
