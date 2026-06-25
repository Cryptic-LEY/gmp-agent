import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'

interface KpRow {
  kp_id: string
  serial_code: string | null
  project_name: string
  task_name: string
  title: string
  difficulty: number
  point_type: string
}

interface IssueRow {
  question_id: string
  stem: string
  question_type: string
  difficulty: string | null
  project_name: string | null
  kp_id: string | null
  kp_project_name: string | null
  task_name: string | null
  kp_title: string | null
  wrong_count: number
  correct_count: number
  reviewed_count: number
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') || 'knowledge'

  if (type === 'knowledge') {
    const rows = await db.raw.all<KpRow>(
      `SELECT kp_id, serial_code, project_name, task_name, title, difficulty, point_type
       FROM knowledge_points WHERE point_type='知识点' ORDER BY kp_id`
    )

      // Build category list (unique project names)
      const projectNames = [...new Set(rows.map(r => r.project_name))]
      const categories = projectNames.map(name => ({ name }))
      const categoryIndex = Object.fromEntries(projectNames.map((n, i) => [n, i]))

      // Build nodes
      const nodes = rows.map(r => ({
        id: r.kp_id,
        name: r.title,
        serialCode: r.serial_code || '',
        category: categoryIndex[r.project_name],
        project: r.project_name,
        task: r.task_name,
        difficulty: r.difficulty,
        symbolSize: 8 + (r.difficulty || 3) * 2,
      }))

      // Build edges: sequential within same task_name
      const edges: { source: string; target: string }[] = []
      const byTask: Record<string, KpRow[]> = {}
      for (const r of rows) {
        if (!byTask[r.task_name]) byTask[r.task_name] = []
        byTask[r.task_name].push(r)
      }
      for (const taskRows of Object.values(byTask)) {
        for (let i = 0; i < taskRows.length - 1; i++) {
          edges.push({ source: taskRows[i].kp_id, target: taskRows[i + 1].kp_id })
        }
      }

    return NextResponse.json({ nodes, edges, categories })
  }

  if (type === 'ability') {
    const rows = await db.raw.all<KpRow>(
      `SELECT kp_id, serial_code, project_name, task_name, title, difficulty, point_type
       FROM knowledge_points WHERE point_type='技能点' ORDER BY kp_id`
    )

      const projectNames = [...new Set(rows.map(r => r.project_name))]
      const categories = projectNames.map(name => ({ name }))
      const categoryIndex = Object.fromEntries(projectNames.map((n, i) => [n, i]))

      const nodes = rows.map(r => ({
        id: r.kp_id,
        name: r.title,
        serialCode: r.serial_code || '',
        category: categoryIndex[r.project_name],
        project: r.project_name,
        task: r.task_name,
        difficulty: r.difficulty,
        symbolSize: 20 + (r.difficulty || 3) * 4,
      }))

      const edges: { source: string; target: string }[] = []
      const byTask: Record<string, KpRow[]> = {}
      for (const r of rows) {
        if (!byTask[r.task_name]) byTask[r.task_name] = []
        byTask[r.task_name].push(r)
      }
      for (const taskRows of Object.values(byTask)) {
        for (let i = 0; i < taskRows.length - 1; i++) {
          edges.push({ source: taskRows[i].kp_id, target: taskRows[i + 1].kp_id })
        }
      }

    return NextResponse.json({ nodes, edges, categories })
  }

  if (type === 'issue') {
    const rows = await db.raw.all<IssueRow>(
      `
        SELECT
          q.question_id,
          q.stem,
          q.question_type,
          q.difficulty,
          q.project_name,
          q.kp_id,
          kp.project_name AS kp_project_name,
          kp.task_name,
          kp.title AS kp_title,
          SUM(CASE WHEN qh.is_correct = 0 THEN 1 ELSE 0 END) AS wrong_count,
          SUM(CASE WHEN qh.is_correct = 1 THEN 1 ELSE 0 END) AS correct_count,
          SUM(CASE WHEN qh.reviewed = 1 THEN 1 ELSE 0 END) AS reviewed_count
        FROM question_history qh
        INNER JOIN questions q ON qh.question_id = q.question_id
        LEFT JOIN knowledge_points kp ON q.kp_id = kp.kp_id
        WHERE qh.user_id = ?
        GROUP BY
          q.question_id, q.stem, q.question_type, q.difficulty, q.project_name,
          q.kp_id, kp.project_name, kp.task_name, kp.title
        HAVING wrong_count > 0
        ORDER BY wrong_count DESC, q.question_id
      `,
      [payload.userId],
    )

    const categories = [{ name: '未复盘错题' }, { name: '已复盘错题' }]
    const nodes = rows.map(row => {
      const wrongCount = Number(row.wrong_count ?? 0)
      const correctCount = Number(row.correct_count ?? 0)
      const reviewed = Number(row.reviewed_count ?? 0) > 0
      return {
        id: row.question_id,
        name: row.stem.length > 30 ? `${row.stem.slice(0, 30)}...` : row.stem,
        fullStem: row.stem,
        category: reviewed ? 1 : 0,
        project: row.project_name || row.kp_project_name || '未关联项目',
        task: row.task_name || row.kp_title || row.question_type,
        questionType: row.question_type,
        wrongCount,
        correctCount,
        reviewed,
        difficulty: wrongCount,
        symbolSize: Math.min(44, 16 + wrongCount * 5),
      }
    })

    const edges: { source: string; target: string }[] = []
    const connectWithin = (items: IssueRow[]) => {
      for (let index = 0; index < items.length - 1; index++) {
        edges.push({ source: items[index].question_id, target: items[index + 1].question_id })
      }
    }
    const byKnowledgePoint = new Map<string, IssueRow[]>()
    const byTask = new Map<string, IssueRow[]>()
    for (const row of rows) {
      const kpKey = row.kp_id || ''
      if (kpKey) byKnowledgePoint.set(kpKey, [...(byKnowledgePoint.get(kpKey) ?? []), row])
      const taskKey = row.task_name || row.project_name || ''
      if (taskKey) byTask.set(taskKey, [...(byTask.get(taskKey) ?? []), row])
    }
    for (const items of byKnowledgePoint.values()) connectWithin(items)
    for (const items of byTask.values()) connectWithin(items)

    return NextResponse.json({ nodes, edges, categories })
  }

  return NextResponse.json({ nodes: [], edges: [], categories: [] })
}
