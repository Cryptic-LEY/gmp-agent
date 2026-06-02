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

  return NextResponse.json({ nodes: [], edges: [], categories: [] })
}
