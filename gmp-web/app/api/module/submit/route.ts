import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { moduleScores, trainingProjects } from '@/db/schema'
import { eq } from 'drizzle-orm'

// 课程标准总学时（与 scores 路由保持一致）
const TARGET_HOURS: Record<string, number> = {
  college:       48,
  undergraduate: 54,
}

// 合法的 training_id 集合
const VALID_TRAINING_IDS = new Set(['T01','T02','T03','T04','T05','T06','T07','T08','T09','T10','T11'])

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { userId } = payload

  // ── 解析请求体 ──────────────────────────────────────────────────────────
  let body: { trainingId?: string; score?: number; eduLevel?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求体格式错误' }, { status: 400 })
  }

  const { trainingId, score, eduLevel } = body

  // ── 参数校验 ────────────────────────────────────────────────────────────
  if (!trainingId || !VALID_TRAINING_IDS.has(trainingId)) {
    return NextResponse.json({ error: '无效的实训项目ID，应为 T01~T11' }, { status: 400 })
  }
  if (typeof score !== 'number' || score < 0 || score > 100) {
    return NextResponse.json({ error: '分数必须为 0~100 的整数' }, { status: 400 })
  }
  if (!eduLevel || !TARGET_HOURS[eduLevel]) {
    return NextResponse.json({ error: '学历层次必须为 college 或 undergraduate' }, { status: 400 })
  }

  // ── 获取实训项目学时数据 ─────────────────────────────────────────────────
  const project = db.select().from(trainingProjects).where(eq(trainingProjects.trainingId, trainingId)).get()
  if (!project) {
    return NextResponse.json({ error: '实训项目不存在' }, { status: 404 })
  }

  // 当前学历对应的项目学时
  const projHours = eduLevel === 'undergraduate' ? (project.hoursUg ?? 0) : (project.hoursCollege ?? 0)

  // 同学历下所有项目总学时（用于比例计算）
  const allProjects = db.select().from(trainingProjects).all()
  const totalProjectHours = allProjects.reduce((sum, p) => {
    const h = eduLevel === 'undergraduate' ? (p.hoursUg ?? 0) : (p.hoursCollege ?? 0)
    return sum + h
  }, 0)

  // ── 计算课时分 ───────────────────────────────────────────────────────────
  // 满分课时 = (项目学时 / 专业总学时) × 课程标准学时(48或54)
  // 实得课时 = 满分课时 × (成绩 / 100)
  const targetTotal = TARGET_HOURS[eduLevel]
  const maxHours = totalProjectHours > 0
    ? (projHours / totalProjectHours) * targetTotal
    : 0
  const earnedHours = parseFloat((maxHours * (score / 100)).toFixed(2))

  // ── 写入数据库 ───────────────────────────────────────────────────────────
  db.insert(moduleScores).values({
    userId,
    trainingId,
    eduLevel,
    score,
    earnedHours,
  }).run()

  return NextResponse.json({
    trainingId,
    displayName: project.displayName,
    score,
    maxHours:    parseFloat(maxHours.toFixed(2)),
    earnedHours,
    eduLevel,
  })
}
