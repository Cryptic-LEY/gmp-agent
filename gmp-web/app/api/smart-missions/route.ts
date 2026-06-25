import { NextRequest, NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { learningPlans, userGameState, users } from '@/db/schema'
import { buildAdaptiveLearningPlan } from '@/lib/adaptive-learning-plan'
import { buildPersonalizedScheme, compactProjectName, prioritySort, safeParsePlan, type PlanItem } from '@/lib/personalized-plan'
import { chooseUnlockedSimulationProject, getUserSimulationProjectProgress, type SimulationProjectProgressMap } from '@/lib/simulation/project-progress-store'
import type { SmartMissionItem, SmartMissionModule, SmartMissionResponse } from '@/lib/smart-mission-types'

const SIMULATION_PROJECTS = [
  { projectId: 1, projectTitle: '配方诞生：工艺风险评审', missionCode: 'MISSION 01', caseFocus: '处方工艺转移包', riskSignal: 'CQA/CPP 关系未评估' },
  { projectId: 2, projectTitle: '战衣净魂：清洁验证挑战', missionCode: 'MISSION 02', caseFocus: '共线设备清洁验证', riskSignal: '最难清洁点未覆盖' },
  { projectId: 3, projectTitle: '委托迷雾：MAH 远程审计', missionCode: 'MISSION 03', caseFocus: '委托生产审计包', riskSignal: '质量协议升级时限缺失' },
  { projectId: 4, projectTitle: '温度危机：冷链追溯', missionCode: 'MISSION 04', caseFocus: '冷链发运与召回评估', riskSignal: '运输温度超限' },
  { projectId: 5, projectTitle: '验证堡垒：eBRS 上线行动', missionCode: 'MISSION 05', caseFocus: '电子批记录系统验证', riskSignal: '权限与审计追踪未挑战测试' },
  { projectId: 6, projectTitle: '沉默真相：实验室数据追踪', missionCode: 'MISSION 06', caseFocus: '实验室数据完整性调查', riskSignal: '审计追踪存在空窗期' },
  { projectId: 7, projectTitle: '失控的偏差：CAPA 调查之旅', missionCode: 'MISSION 07', caseFocus: '偏差调查与 CAPA', riskSignal: '复测替代 OOS 调查' },
  { projectId: 8, projectTitle: '厂房迷宫：设施设备风险排查', missionCode: 'MISSION 08', caseFocus: '厂房设施与设备管理', riskSignal: '环境与设备状态证据不足' },
  { projectId: 9, projectTitle: '放行审判：产品质量决策', missionCode: 'MISSION 09', caseFocus: '产品放行、投诉与召回', riskSignal: '放行证据链不完整' },
  { projectId: 10, projectTitle: '自检风暴：综合风险审计', missionCode: 'MISSION 10', caseFocus: 'GMP 自检与风险管理', riskSignal: '缺陷分级与 CAPA 跟踪不足' },
  { projectId: 11, projectTitle: '终局 Boss：质量体系总核验', missionCode: 'FINAL BOSS', caseFocus: '全流程质量体系', riskSignal: '跨模块证据链断裂' },
]

function eduLabel(value: string | null | undefined) {
  if (value === 'undergraduate') return '本科'
  if (value === 'college') return '专科'
  return '未设置'
}

function routeModule(module: SmartMissionModule) {
  const map: Record<SmartMissionModule, string> = {
    dashboard: '/dashboard',
    plan: '/plan',
    course: '/course',
    practice: '/practice',
    simulation: '/simulation',
    progress: '/progress',
    report: '/report',
    streak: '/streak',
    chat: '/chat',
    profile: '/profile',
  }
  return map[module]
}

function projectHref(item: PlanItem | undefined) {
  return item?.training_id ? `/course/${item.training_id}` : '/course'
}

function simulationProjectFromPlan(item: PlanItem | undefined, progress: SimulationProjectProgressMap) {
  const raw = item?.training_id?.match(/\d+/)?.[0]
  const parsed = Number(raw)
  const preferredId = Number.isFinite(parsed)
    ? Math.max(1, Math.min(SIMULATION_PROJECTS.length, parsed))
    : undefined
  const unlockedProject = chooseUnlockedSimulationProject(progress, preferredId)
  return SIMULATION_PROJECTS.find(project => project.projectId === unlockedProject.id) ?? SIMULATION_PROJECTS[0]
}

function priorityLabel(priority: PlanItem['priority']) {
  if (priority === 'high') return '重点强化'
  if (priority === 'medium') return '建议复习'
  return '保持巩固'
}

function makeMission(args: Omit<SmartMissionItem, 'status'> & { status?: SmartMissionItem['status'] }): SmartMissionItem {
  return {
    ...args,
    status: args.status ?? 'support',
  }
}

function starterResponse(displayName: string, rankTitle: string, streakDays: number, progress: SimulationProjectProgressMap): SmartMissionResponse {
  const unlockedProject = chooseUnlockedSimulationProject(progress, undefined)
  const simulation = SIMULATION_PROJECTS.find(project => project.projectId === unlockedProject.id) ?? SIMULATION_PROJECTS[0]
  const modules: SmartMissionItem[] = [
    makeMission({
      module: 'plan',
      label: '个性化学习',
      title: '先完成能力前测',
      detail: '生成第一版学习画像后，系统会把课程、练习和实训串成任务链。',
      href: '/onboarding',
      reason: '尚未发现学习方案',
      evidence: ['未完成前测'],
      reward: '解锁动态方案',
      status: 'recommended',
      tone: 'teal',
    }),
    makeMission({
      module: 'simulation',
      label: '实训仿真',
      title: `预览 ${simulation.projectTitle}`,
      detail: '前测后会按薄弱项推荐最合适的远征项目。',
      href: '/simulation',
      reason: simulation.riskSignal,
      evidence: [simulation.caseFocus],
      reward: '通关得 XP / 金币 / 奖杯',
      status: 'next',
      tone: 'amber',
    }),
  ]

  return {
    hasPlan: false,
    generatedBy: 'starter',
    student: { displayName, eduLevel: '未设置', major: '未设置', score: null, rankTitle, streakDays },
    summary: '先完成能力前测，系统会立刻生成今日任务链。',
    primaryFocus: '能力前测',
    weakItems: [],
    chain: modules,
    modules,
    simulation: {
      ...simulation,
      reward: '+120 XP 起',
      reason: simulation.riskSignal,
    },
  }
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const [user] = await db.select().from(users).where(eq(users.userId, payload.userId)).limit(1)
  const [game] = await db.select().from(userGameState).where(eq(userGameState.userId, payload.userId)).limit(1)
  const displayName = user?.displayName ?? '同学'
  const rankTitle = game?.rankTitle ?? 'GMP新人'
  const streakDays = game?.streakDays ?? 0
  const simulationProgress = await getUserSimulationProjectProgress(payload.userId).catch(() => ({}))

  const latest = (await db.select().from(learningPlans)
    .where(eq(learningPlans.userId, payload.userId))
    .orderBy(desc(learningPlans.createdAt))
    .limit(1))[0]

  if (!latest) return NextResponse.json(starterResponse(displayName, rankTitle, streakDays, simulationProgress))

  const score = Number(latest.score ?? 0)
  const adaptive = await buildAdaptiveLearningPlan(payload.userId, latest, { useAi: false }).catch(() => null)
  const fallbackPlan = safeParsePlan(latest.planData)
  const plan = adaptive?.plan ?? prioritySort(fallbackPlan)
  const scheme = adaptive?.personalizedScheme ?? buildPersonalizedScheme(plan, score)
  const topItems = (plan.length ? plan : fallbackPlan).slice(0, 5)
  const actionableItems = topItems.filter(item => item.priority !== 'low')
  const primary = actionableItems[0] ?? topItems[0]
  const secondary = actionableItems[1] ?? topItems[1]
  const primaryFocus = primary ? compactProjectName(primary.project_name) : 'GMP基础能力'
  const secondaryFocus = secondary ? compactProjectName(secondary.project_name) : '错题复盘'
  const simulation = simulationProjectFromPlan(primary, simulationProgress)
  const evidence = primary?.evidence?.length
    ? primary.evidence.slice(0, 3)
    : primary?.total
      ? [`前测 ${primary.wrong}/${primary.total} 题出错`]
      : ['动态画像证据不足，建议先补一次练习']
  const generatedBy: SmartMissionResponse['generatedBy'] = adaptive?.generatedBy ?? 'rules'

  const chain: SmartMissionItem[] = [
    makeMission({
      module: 'practice',
      label: '练习定位',
      title: `完成 ${primaryFocus} 专项题`,
      detail: scheme.daily_practice.detail,
      href: '/practice',
      reason: `先用题目确认 ${primaryFocus} 的具体错点`,
      evidence,
      reward: '+50 XP 目标',
      status: 'recommended',
      tone: 'teal',
    }),
    makeMission({
      module: 'course',
      label: '课程补漏',
      title: `补学 ${primaryFocus} 章节`,
      detail: scheme.course_learning.detail,
      href: projectHref(primary),
      reason: '把错题背后的课程框架补齐',
      evidence: primary?.recommended_actions?.slice(0, 2) ?? [`搭配 ${secondaryFocus} 巩固`],
      reward: '课时分 / 章节测验',
      status: 'next',
      tone: 'blue',
    }),
    makeMission({
      module: 'simulation',
      label: '实训验收',
      title: `挑战 ${simulation.projectTitle}`,
      detail: scheme.simulation_training.detail,
      href: '/simulation',
      reason: simulation.riskSignal,
      evidence: [simulation.caseFocus, primaryFocus, `推荐项目 ${simulation.missionCode}`],
      reward: '+120 XP 起 / 金币 / 奖杯',
      status: 'next',
      tone: 'amber',
    }),
  ]

  const modules: SmartMissionItem[] = [
    makeMission({
      module: 'dashboard',
      label: '主页',
      title: '查看今日任务链',
      detail: '从主页进入今日优先任务，检查打卡和总体进度。',
      href: routeModule('dashboard'),
      reason: '学习入口聚合',
      evidence: [`当前等级 ${rankTitle}`, `连续 ${streakDays} 天`],
      reward: '今日节奏',
      tone: 'green',
    }),
    makeMission({
      module: 'plan',
      label: '个性化学习',
      title: `AI 判断：先抓 ${primaryFocus}`,
      detail: scheme.summary,
      href: routeModule('plan'),
      reason: '系统综合前测、掌握度、测验和学习投入',
      evidence,
      reward: '动态重排',
      status: 'recommended',
      tone: 'teal',
    }),
    ...chain,
    makeMission({
      module: 'progress',
      label: '我的进度',
      title: '查看知识点掌握图谱',
      detail: '确认薄弱知识点是否已经从高风险转入学习中。',
      href: routeModule('progress'),
      reason: '掌握度会随练习和测验更新',
      evidence: [`主攻 ${primaryFocus}`, `搭配 ${secondaryFocus}`],
      reward: '掌握度反馈',
      tone: 'green',
    }),
    makeMission({
      module: 'report',
      label: '成绩报告',
      title: '复盘一轮学习表现',
      detail: '看正确率、错题类型、实训表现，再决定下一轮任务。',
      href: routeModule('report'),
      reason: '把学习数据转成下一步动作',
      evidence: [`前测 ${score} 分`, `错题 ${latest.wrongCount ?? 0} 道`],
      reward: '复盘结论',
      tone: 'violet',
    }),
    makeMission({
      module: 'streak',
      label: '连续打卡',
      title: streakDays > 0 ? `保持 ${streakDays} 天连续学习` : '点亮今日学习',
      detail: '每天一次轻量任务，保住学习节奏和 XP 奖励。',
      href: routeModule('streak'),
      reason: '连续性决定长期掌握',
      evidence: [`当前 ${streakDays} 天`, `等级 ${rankTitle}`],
      reward: '+5 XP / 里程碑',
      tone: 'amber',
    }),
    makeMission({
      module: 'chat',
      label: 'AI 助学',
      title: `追问 ${primaryFocus} 的错因`,
      detail: '把错题或课程截图交给小精灵，让它解释判断逻辑。',
      href: routeModule('chat'),
      reason: '遇到卡点时用 AI 做即时拆解',
      evidence: scheme.ai_focus.slice(0, 2),
      reward: '思路澄清',
      tone: 'violet',
    }),
    makeMission({
      module: 'profile',
      label: '个人中心',
      title: '确认专业与身份资料',
      detail: '学历和专业会影响方案排序、案例推荐和实训角色。',
      href: routeModule('profile'),
      reason: '学习画像依赖资料完整性',
      evidence: [eduLabel(latest.eduLevel), latest.major ?? '未设置'],
      reward: '推荐更准',
      tone: 'blue',
    }),
  ]

  return NextResponse.json({
    hasPlan: true,
    generatedBy,
    student: {
      displayName,
      eduLevel: eduLabel(latest.eduLevel),
      major: latest.major ?? '未设置',
      score,
      rankTitle,
      streakDays,
    },
    summary: scheme.summary,
    primaryFocus,
    weakItems: topItems.slice(0, 4).map(item => ({
      title: compactProjectName(item.project_name),
      priority: item.priority,
      evidence: item.evidence?.slice(0, 3) ?? [item.reason],
      adaptiveScore: Math.round(item.adaptive_score ?? 0),
      href: projectHref(item),
    })),
    chain,
    modules,
    simulation: {
      ...simulation,
      reward: '+120 XP 起 / +360 金币 / 奖杯',
      reason: `${priorityLabel(primary?.priority ?? 'medium')}，${simulation.riskSignal}`,
    },
  } satisfies SmartMissionResponse)
}
