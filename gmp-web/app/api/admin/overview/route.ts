import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { knowledgePoints, learningPlans, questionHistory, questions, users } from '@/db/schema'
import { verifyToken } from '@/lib/auth'

function getAuthPayload(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  return token ? verifyToken(token) : null
}

function countBy<T>(items: T[], getKey: (item: T) => string | null | undefined) {
  const map = new Map<string, number>()

  for (const item of items) {
    const key = getKey(item)?.trim() || '未设置'
    map.set(key, (map.get(key) ?? 0) + 1)
  }

  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value)
}

function normalizeEducation(value: string | null | undefined) {
  if (value === 'college') return '专科'
  if (value === 'undergraduate') return '本科'
  return value?.trim() || '未选择'
}

export async function GET(req: NextRequest) {
  const payload = getAuthPayload(req)
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (payload.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const userRows = await db.select({
    userId: users.userId,
    displayName: users.displayName,
    email: users.email,
    role: users.role,
    school: users.school,
    className: users.className,
    major: users.major,
    groupId: users.groupId,
    createdAt: users.createdAt,
  }).from(users)

  const planRows = await db.select({
    userId: learningPlans.userId,
    eduLevel: learningPlans.eduLevel,
    score: learningPlans.score,
    createdAt: learningPlans.createdAt,
  }).from(learningPlans)

  const knowledgeRows = await db.select({
    kpId: knowledgePoints.kpId,
    projectName: knowledgePoints.projectName,
    taskName: knowledgePoints.taskName,
    pointType: knowledgePoints.pointType,
    status: knowledgePoints.status,
  }).from(knowledgePoints)

  const questionRows = await db.select({
    questionId: questions.questionId,
    questionType: questions.questionType,
    difficulty: questions.difficulty,
    status: questions.status,
  }).from(questions)

  const historyRows = await db.select({
    isCorrect: questionHistory.isCorrect,
    reviewed: questionHistory.reviewed,
  }).from(questionHistory)

  const latestPlanByUser = new Map<string, typeof planRows[number]>()
  for (const plan of planRows) {
    const current = latestPlanByUser.get(plan.userId)
    if (!current || new Date(plan.createdAt).getTime() > new Date(current.createdAt).getTime()) {
      latestPlanByUser.set(plan.userId, plan)
    }
  }

  const studentRows = userRows.filter(user => user.role === 'student')
  const activeQuestions = questionRows.filter(question => question.status === 'active')
  const activeKnowledge = knowledgeRows.filter(item => item.status === 'active')
  const classCount = new Set(
    studentRows
      .map(user => `${user.school || ''}-${user.className || user.groupId || ''}`.trim())
      .filter(value => value !== '-'),
  ).size

  const scoredPlans = planRows.filter(plan => typeof plan.score === 'number')
  const scoreSum = scoredPlans.reduce((sum, plan) => sum + plan.score, 0)

  return NextResponse.json({
    summary: {
      totalUsers: userRows.length,
      studentCount: studentRows.length,
      teacherCount: userRows.filter(user => user.role === 'teacher').length,
      adminCount: userRows.filter(user => user.role === 'admin').length,
      classCount,
      planCount: planRows.length,
      averageDiagnosticScore: scoredPlans.length ? Math.round((scoreSum / scoredPlans.length) * 10) / 10 : 0,
      knowledgeCount: activeKnowledge.filter(item => item.pointType === '知识点').length,
      skillCount: activeKnowledge.filter(item => item.pointType === '技能点').length,
      projectCount: new Set(activeKnowledge.map(item => item.projectName).filter(Boolean)).size,
      taskCount: new Set(activeKnowledge.map(item => item.taskName).filter(Boolean)).size,
      questionCount: activeQuestions.length,
      answerCount: historyRows.length,
      wrongCount: historyRows.filter(row => !row.isCorrect).length,
      pendingReviewCount: historyRows.filter(row => !row.isCorrect && !row.reviewed).length,
      orgCount: new Set(userRows.map(user => user.school || user.groupId || '默认机构')).size,
    },
    distributions: {
      byRole: countBy(userRows, user => {
        if (user.role === 'student') return '学生'
        if (user.role === 'teacher') return '教师'
        if (user.role === 'admin') return '管理员'
        return user.role
      }),
      byEducation: countBy(studentRows, user => normalizeEducation(latestPlanByUser.get(user.userId)?.eduLevel)),
      byMajor: countBy(studentRows, user => latestPlanByUser.get(user.userId)?.eduLevel ? user.major : user.major).slice(0, 8),
      byQuestionType: countBy(activeQuestions, question => question.questionType),
      byQuestionDifficulty: countBy(activeQuestions, question => question.difficulty),
    },
    modules: [
      { key: 'users', title: '用户与权限', status: 'done', desc: '账号、角色、基础资料与密码重置。' },
      { key: 'schools', title: '学校组织', status: 'done', desc: '学校档案、班级专业、开通状态与校内数据范围。' },
      { key: 'projects', title: '项目任务', status: 'done', desc: '项目、任务、知识点和题库覆盖情况。' },
      { key: 'simulation', title: '实训仿真', status: 'done', desc: '仿真项目、场景关卡、通关记录、勋章和课时分管理。' },
      { key: 'mindmap', title: '知识图谱', status: 'done', desc: '知识点、技能点、项目任务与GMP条款维护。' },
      { key: 'questions', title: '题库管理', status: 'done', desc: '题型、难度、项目归属和知识点关联查看。' },
      { key: 'deps', title: '依赖关系', status: 'done', desc: '维护知识点之间的前置依赖。' },
      { key: 'rules', title: '规则配置', status: 'done', desc: '前测规则、分数判断和个性化方案规则范围。' },
      { key: 'monitoring', title: '系统运行监控', status: 'done', desc: '服务状态、接口调用量、AI调用量、错误日志、数据库和存储状态。' },
      { key: 'aiConfig', title: 'AI与系统配置', status: 'done', desc: 'DashScope Key、模型、Embedding、RAG参数、提示词模板和知识库更新。' },
      { key: 'exports', title: '统计导出', status: 'done', desc: '导出学生学习状态和题库统计。' },
      { key: 'org', title: '多机构扩展', status: 'todo', desc: '监管机构、企业机构、套餐和跨机构数据权限。' },
      { key: 'backup', title: '备份恢复', status: 'todo', desc: '数据库备份、恢复与操作审计。' },
    ],
    systemStatus: {
      database: '正常',
      api: '正常',
      version: '1.0.0',
      lastBackup: null,
    },
  })
}
