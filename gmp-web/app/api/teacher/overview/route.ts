import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { knowledgePoints, learningPlans, questionHistory, questions, users } from '@/db/schema'
import { verifyToken } from '@/lib/auth'

interface DistributionItem {
  label: string
  value: number
}

interface PlanItem {
  project_name?: string
  priority?: 'high' | 'medium' | 'low'
  reason?: string
  wrong?: number
  total?: number
}

function countBy<T>(items: T[], getKey: (item: T) => string | null | undefined): DistributionItem[] {
  const map = new Map<string, number>()

  for (const item of items) {
    const key = getKey(item)?.trim() || '未设置'
    map.set(key, (map.get(key) ?? 0) + 1)
  }

  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value)
}

function safePlanData(value: string | null | undefined): PlanItem[] {
  if (!value) return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeEducation(value: string | null | undefined) {
  if (value === 'college') return '专科'
  if (value === 'undergraduate') return '本科'
  return value?.trim() || '未选择'
}

function round(value: number) {
  return Math.round(value * 10) / 10
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  const payload = token ? verifyToken(token) : null

  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (payload.role !== 'teacher' && payload.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const userRows = db.select({
    userId: users.userId,
    displayName: users.displayName,
    email: users.email,
    role: users.role,
    realName: users.realName,
    school: users.school,
    major: users.major,
    className: users.className,
    studentId: users.studentId,
    createdAt: users.createdAt,
  }).from(users).all()

  const planRows = db.select({
    id: learningPlans.id,
    userId: learningPlans.userId,
    eduLevel: learningPlans.eduLevel,
    major: learningPlans.major,
    score: learningPlans.score,
    wrongCount: learningPlans.wrongCount,
    planData: learningPlans.planData,
    createdAt: learningPlans.createdAt,
  }).from(learningPlans).all()

  const historyRows = db.select({
    userId: questionHistory.userId,
    isCorrect: questionHistory.isCorrect,
    reviewed: questionHistory.reviewed,
  }).from(questionHistory).all()

  const knowledgeRows = db.select({
    kpId: knowledgePoints.kpId,
    serialCode: knowledgePoints.serialCode,
    eduLevel: knowledgePoints.eduLevel,
    projectName: knowledgePoints.projectName,
    taskName: knowledgePoints.taskName,
    title: knowledgePoints.title,
    pointType: knowledgePoints.pointType,
    difficulty: knowledgePoints.difficulty,
    gmpArticles: knowledgePoints.gmpArticles,
  }).from(knowledgePoints).all()

  const questionRows = db.select({
    questionId: questions.questionId,
    kpId: questions.kpId,
    questionType: questions.questionType,
    difficulty: questions.difficulty,
    stem: questions.stem,
    projectName: questions.projectName,
    eduLevel: questions.eduLevel,
    status: questions.status,
  }).from(questions).all()

  const studentRows = userRows.filter(user => user.role === 'student')
  const latestPlanByUser = new Map<string, typeof planRows[number]>()

  for (const plan of planRows) {
    const current = latestPlanByUser.get(plan.userId)
    if (!current || new Date(plan.createdAt).getTime() > new Date(current.createdAt).getTime()) {
      latestPlanByUser.set(plan.userId, plan)
    }
  }

  const historyByUser = new Map<string, { total: number; correct: number; wrong: number; pendingReview: number }>()
  for (const row of historyRows) {
    const item = historyByUser.get(row.userId) ?? { total: 0, correct: 0, wrong: 0, pendingReview: 0 }
    item.total += 1
    if (row.isCorrect) item.correct += 1
    else item.wrong += 1
    if (!row.reviewed && !row.isCorrect) item.pendingReview += 1
    historyByUser.set(row.userId, item)
  }

  const activeQuestionRows = questionRows.filter(question => question.status === 'active')
  const kpById = new Map(knowledgeRows.map(item => [item.kpId, item]))
  const projectCount = new Set(knowledgeRows.map(item => item.projectName).filter(Boolean)).size
  const taskCount = new Set(knowledgeRows.map(item => item.taskName).filter(Boolean)).size
  const knowledgeCount = knowledgeRows.filter(item => item.pointType === '知识点').length
  const skillCount = knowledgeRows.filter(item => item.pointType === '技能点').length

  const students = studentRows
    .map(user => {
      const latestPlan = latestPlanByUser.get(user.userId)
      const planData = safePlanData(latestPlan?.planData)
      const history = historyByUser.get(user.userId) ?? { total: 0, correct: 0, wrong: 0, pendingReview: 0 }
      const displayName = user.realName?.trim() || user.displayName

      return {
        userId: user.userId,
        displayName,
        email: user.email,
        school: user.school || '未填写',
        className: user.className || '默认班级',
        major: latestPlan?.major || user.major || '未选择',
        educationLevel: normalizeEducation(latestPlan?.eduLevel),
        onboardingCompleted: Boolean(latestPlan),
        diagnosticScore: latestPlan?.score ?? null,
        wrongCount: latestPlan?.wrongCount ?? 0,
        planCreatedAt: latestPlan?.createdAt ?? null,
        planPreview: planData.slice(0, 4).map(item => ({
          projectName: item.project_name || '未命名项目',
          priority: item.priority || 'low',
          reason: item.reason || '',
          wrong: item.wrong ?? 0,
          total: item.total ?? 0,
        })),
        answerStats: history,
        createdAt: user.createdAt,
      }
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())

  const projectTaskMap = new Map<string, {
    projectName: string
    eduLevels: Set<string>
    taskNames: Set<string>
    knowledgeCount: number
    skillCount: number
    questionCount: number
  }>()

  for (const item of knowledgeRows) {
    const projectName = item.projectName?.trim() || '未归属项目'
    const existing = projectTaskMap.get(projectName) ?? {
      projectName,
      eduLevels: new Set<string>(),
      taskNames: new Set<string>(),
      knowledgeCount: 0,
      skillCount: 0,
      questionCount: 0,
    }

    if (item.eduLevel) existing.eduLevels.add(item.eduLevel)
    if (item.taskName) existing.taskNames.add(item.taskName)
    if (item.pointType === '技能点') existing.skillCount += 1
    else existing.knowledgeCount += 1
    projectTaskMap.set(projectName, existing)
  }

  for (const question of activeQuestionRows) {
    const kp = question.kpId ? kpById.get(question.kpId) : null
    const projectName = question.projectName?.trim() || kp?.projectName?.trim() || '未归属项目'
    const existing = projectTaskMap.get(projectName) ?? {
      projectName,
      eduLevels: new Set<string>(),
      taskNames: new Set<string>(),
      knowledgeCount: 0,
      skillCount: 0,
      questionCount: 0,
    }
    existing.questionCount += 1
    projectTaskMap.set(projectName, existing)
  }

  const projectTasks = [...projectTaskMap.values()]
    .map(project => ({
      projectName: project.projectName,
      eduLevels: [...project.eduLevels],
      taskCount: project.taskNames.size,
      taskNames: [...project.taskNames].slice(0, 8),
      knowledgeCount: project.knowledgeCount,
      skillCount: project.skillCount,
      questionCount: project.questionCount,
    }))
    .sort((left, right) => right.knowledgeCount + right.skillCount + right.questionCount - (left.knowledgeCount + left.skillCount + left.questionCount))

  const knowledgeItems = knowledgeRows
    .map(item => ({
      kpId: item.kpId,
      serialCode: item.serialCode || '',
      eduLevel: item.eduLevel || '未设置',
      projectName: item.projectName || '未归属项目',
      taskName: item.taskName || '未归属任务',
      title: item.title,
      pointType: item.pointType,
      difficulty: item.difficulty,
      gmpArticles: item.gmpArticles || '',
    }))
    .slice(0, 240)

  const questionItems = activeQuestionRows
    .map(question => {
      const kp = question.kpId ? kpById.get(question.kpId) : null
      return {
        questionId: question.questionId,
        kpId: question.kpId,
        questionType: question.questionType,
        difficulty: question.difficulty,
        stem: question.stem,
        projectName: question.projectName || kp?.projectName || '未关联项目',
        taskName: kp?.taskName || '未关联任务',
        knowledgeTitle: kp?.title || '未关联知识点',
      }
    })
    .slice(0, 240)

  const scoredStudents = students.filter(student => typeof student.diagnosticScore === 'number')
  const scoreSum = scoredStudents.reduce((sum, student) => sum + (student.diagnosticScore ?? 0), 0)
  const completedCount = students.filter(student => student.onboardingCompleted).length
  const classCount = new Set(students.map(student => `${student.school}-${student.className}`)).size

  return NextResponse.json({
    summary: {
      studentCount: students.length,
      classCount,
      activeRate: students.length ? round((completedCount / students.length) * 100) : 0,
      onboardingCompletedCount: completedCount,
      planGeneratedCount: planRows.length,
      averageDiagnosticScore: scoredStudents.length ? round(scoreSum / scoredStudents.length) : 0,
      passCount: scoredStudents.filter(student => (student.diagnosticScore ?? 0) >= 60).length,
      beginnerCount: scoredStudents.filter(student => (student.diagnosticScore ?? 0) < 60).length,
      answerCount: historyRows.length,
      wrongCount: historyRows.filter(row => !row.isCorrect).length,
      pendingReviewCount: historyRows.filter(row => !row.isCorrect && !row.reviewed).length,
      projectCount,
      taskCount,
      knowledgeCount,
      skillCount,
      questionCount: activeQuestionRows.length,
    },
    distributions: {
      education: countBy(students, student => student.educationLevel),
      major: countBy(students, student => student.major).slice(0, 8),
      className: countBy(students, student => student.className).slice(0, 8),
      questionType: countBy(activeQuestionRows, question => question.questionType),
      questionDifficulty: countBy(activeQuestionRows, question => question.difficulty),
    },
    managementModules: [
      { key: 'students', title: '学生与班级管理', status: 'first', desc: '查看学生资料、前测成绩、学习方案和错题复盘状态。' },
      { key: 'projects', title: '项目任务管理', status: 'first', desc: '查看项目、任务、知识点、技能点和题库覆盖情况。' },
      { key: 'knowledge', title: '知识/技能图谱管理', status: 'first', desc: '检索知识点、技能点、GMP 条款和任务归属。' },
      { key: 'questions', title: '题库与前测规则管理', status: 'first', desc: '查看题型、难度、项目归属和前测题库覆盖。' },
      { key: 'exports', title: '数据统计与导出', status: 'next', desc: '导出学生学习状态、题库统计和课程覆盖数据。' },
    ],
    students,
    projectTasks,
    knowledgeItems,
    questionItems,
  })
}
