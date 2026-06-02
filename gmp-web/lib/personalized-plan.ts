export interface PlanItem {
  project_name: string
  priority: 'high' | 'medium' | 'low'
  reason: string
  wrong: number
  total: number
}

export interface PlanAction {
  title: string
  duration: string
  focus: string
  detail: string
  href: string
}

export interface PersonalizedScheme {
  summary: string
  ai_focus: string[]
  weak_items: PlanItem[]
  daily_practice: PlanAction
  course_learning: PlanAction
  simulation_training: PlanAction
  seven_day_plan: Array<{
    day: string
    title: string
    tasks: string[]
  }>
}

export function safeParsePlan(value: string): PlanItem[] {
  try {
    const parsed = JSON.parse(value) as PlanItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function compactProjectName(name: string) {
  return name.replace(/^专-/, '').replace(/^项目[一二三四五六七八九十十一]+[：·]/, '').trim()
}

export function prioritySort(plan: PlanItem[]) {
  const rank = { high: 0, medium: 1, low: 2 } as const
  return [...plan].sort((a, b) => rank[a.priority] - rank[b.priority])
}

export function buildPersonalizedScheme(plan: PlanItem[], score: number): PersonalizedScheme {
  const sortedPlan = prioritySort(plan)
  const weakItems = sortedPlan.filter(item => item.priority !== 'low').slice(0, 5)
  const focusItems = (weakItems.length ? weakItems : sortedPlan.slice(0, 3))
  const focusNames = focusItems.map(item => compactProjectName(item.project_name))
  const primaryFocus = focusNames[0] ?? 'GMP基础能力'
  const secondaryFocus = focusNames[1] ?? '错题复盘'
  const highCount = plan.filter(item => item.priority === 'high').length
  const mediumCount = plan.filter(item => item.priority === 'medium').length

  const summary = score < 60
    ? `前测得分 ${score} 分，建议先补基础框架，再用练习和实训做闭环验证。`
    : highCount > 0
      ? `前测得分 ${score} 分，主要薄弱项集中在 ${primaryFocus}，建议先重点强化再推进综合场景。`
      : mediumCount > 0
        ? `前测得分 ${score} 分，整体基础可继续推进，当前重点是消除零散盲区。`
        : `前测得分 ${score} 分，基础较稳，建议进入进阶练习和实训巩固。`

  return {
    summary,
    ai_focus: [
      `优先处理：${primaryFocus}`,
      `搭配巩固：${secondaryFocus}`,
      score < 60 ? '学习节奏：先课程、再练习、后仿真' : '学习节奏：练习定位、课程补漏、仿真验收',
    ],
    weak_items: weakItems,
    daily_practice: {
      title: '每日练习',
      duration: score < 60 ? '每日 25 分钟' : '每日 20 分钟',
      focus: focusNames.slice(0, 2).join('、') || '错题复盘',
      detail: score < 60
        ? '每天完成 15 道基础题和 5 道错题复盘，先把易错概念打稳。'
        : '每天围绕薄弱项目完成 10 道专项题、5 道错题复盘、5 道混合题。保持短频快反馈。',
      href: '/practice',
    },
    course_learning: {
      title: '课程学习',
      duration: score < 60 ? '每日 35 分钟' : '每日 25 分钟',
      focus: primaryFocus,
      detail: '按薄弱项优先学习课程章节，先看知识结构，再看案例和条款解释，学完后立即做章节小测。',
      href: '/course',
    },
    simulation_training: {
      title: '实训仿真',
      duration: '每周 2 次',
      focus: primaryFocus,
      detail: '完成课程和专项练习后进入对应项目仿真，用角色任务、证据判断和 Boss 核验验证掌握度。',
      href: '/simulation',
    },
    seven_day_plan: [
      { day: '第1天', title: '确认薄弱项', tasks: [`阅读 ${primaryFocus} 课程导入`, '完成 20 道前测错点同类题'] },
      { day: '第2天', title: '补课程框架', tasks: [`学习 ${primaryFocus} 核心章节`, '整理 3 条易错规则'] },
      { day: '第3天', title: '专项练习', tasks: ['完成薄弱项专项练习', '错题加入复盘清单'] },
      { day: '第4天', title: '案例理解', tasks: [`学习 ${secondaryFocus} 相关案例`, '完成章节小测'] },
      { day: '第5天', title: '综合练习', tasks: ['混合练习 20 题', '复盘连续答错知识点'] },
      { day: '第6天', title: '实训仿真', tasks: [`进入 ${primaryFocus} 对应项目`, '完成一次完整仿真流程'] },
      { day: '第7天', title: '复盘调整', tasks: ['查看学习报告', '根据新错题调整下周练习重点'] },
    ],
  }
}
