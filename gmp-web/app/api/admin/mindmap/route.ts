import { eq, or } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { knowledgePoints, kpDependencies } from '@/db/schema'
import { verifyToken } from '@/lib/auth'

function getAuthPayload(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  return token ? verifyToken(token) : null
}

function requireRole(req: NextRequest, roles: string[]) {
  const payload = getAuthPayload(req)
  return payload && roles.includes(payload.role) ? payload : null
}

function difficultyValue(value: unknown) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 3
  return Math.max(1, Math.min(5, Math.round(n)))
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function GET(req: NextRequest) {
  if (!requireRole(req, ['admin', 'teacher'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') || 'all'
  const eduLevel = searchParams.get('eduLevel') || 'all'
  const project = searchParams.get('project') || 'all'
  const search = (searchParams.get('search') || '').trim().toLowerCase()
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize = Math.max(1, Math.min(200, Number(searchParams.get('pageSize') || 50)))

  const allRows = await db.select().from(knowledgePoints)
  const deps = await db.select().from(kpDependencies)
  const depMap = new Map<string, { dependsOn: string[]; requiredFor: string[] }>()

  for (const dep of deps) {
    if (!depMap.has(dep.fromKpId)) depMap.set(dep.fromKpId, { dependsOn: [], requiredFor: [] })
    if (!depMap.has(dep.toKpId)) depMap.set(dep.toKpId, { dependsOn: [], requiredFor: [] })
    depMap.get(dep.fromKpId)!.requiredFor.push(dep.toKpId)
    depMap.get(dep.toKpId)!.dependsOn.push(dep.fromKpId)
  }

  const rows = allRows.filter(row => {
    if (type !== 'all' && row.pointType !== (type === 'skill' ? '技能点' : '知识点')) return false
    if (eduLevel !== 'all' && row.eduLevel !== eduLevel) return false
    if (project !== 'all' && row.projectName !== project) return false
    if (search) {
      const fields = [row.title, row.serialCode, row.projectName, row.taskName, row.gmpArticles, row.content]
      if (!fields.some(field => field?.toLowerCase().includes(search))) return false
    }
    return true
  })

  const total = rows.length
  const start = (page - 1) * pageSize
  const paginatedRows = rows.slice(start, start + pageSize)
  const projects = [...new Set(allRows.map(row => row.projectName).filter(Boolean))].sort()

  return NextResponse.json({
    items: paginatedRows.map(item => ({
      kpId: item.kpId,
      serialCode: item.serialCode || '',
      granularity: item.granularity || '点级',
      eduLevel: item.eduLevel || '未设置',
      projectName: item.projectName || '',
      taskName: item.taskName || '',
      title: item.title,
      content: item.content || '',
      gmpArticles: item.gmpArticles || '',
      sourceType: item.sourceType || '教材',
      difficulty: item.difficulty || 3,
      pointType: item.pointType || '知识点',
      masteryRequirement: item.masteryRequirement || '',
      status: item.status || 'active',
      dependsOn: depMap.get(item.kpId)?.dependsOn || [],
      requiredFor: depMap.get(item.kpId)?.requiredFor || [],
    })),
    total,
    page,
    pageSize,
    projects,
  })
}

export async function POST(req: NextRequest) {
  if (!requireRole(req, ['admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const title = textValue(body.title)

    if (!title) {
      return NextResponse.json({ error: '知识点名称不能为空' }, { status: 400 })
    }

    const kpId = `KP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

    await db.insert(knowledgePoints).values({
      kpId,
      serialCode: textValue(body.serialCode) || null,
      granularity: textValue(body.granularity) || '点级',
      eduLevel: textValue(body.eduLevel) || '本科',
      projectName: textValue(body.projectName) || null,
      taskName: textValue(body.taskName) || null,
      title,
      content: textValue(body.content) || null,
      gmpArticles: textValue(body.gmpArticles) || null,
      sourceType: textValue(body.sourceType) || '教材',
      difficulty: difficultyValue(body.difficulty),
      pointType: textValue(body.pointType) || '知识点',
      masteryRequirement: textValue(body.masteryRequirement) || null,
      status: textValue(body.status) || 'active',
      updatedAt: new Date().toISOString(),
    }).execute()

    return NextResponse.json({ success: true, kpId }, { status: 201 })
  } catch (err) {
    console.error('create knowledge point failed', err)
    return NextResponse.json({ error: '创建知识点失败' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  if (!requireRole(req, ['admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const kpId = textValue(body.kpId)

    if (!kpId) {
      return NextResponse.json({ error: '缺少知识点ID' }, { status: 400 })
    }

    const updates: Partial<typeof knowledgePoints.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    }

    if (body.serialCode !== undefined) updates.serialCode = textValue(body.serialCode) || null
    if (body.granularity !== undefined) updates.granularity = textValue(body.granularity) || '点级'
    if (body.eduLevel !== undefined) updates.eduLevel = textValue(body.eduLevel) || '本科'
    if (body.projectName !== undefined) updates.projectName = textValue(body.projectName) || null
    if (body.taskName !== undefined) updates.taskName = textValue(body.taskName) || null
    if (body.title !== undefined) updates.title = textValue(body.title)
    if (body.content !== undefined) updates.content = textValue(body.content) || null
    if (body.gmpArticles !== undefined) updates.gmpArticles = textValue(body.gmpArticles) || null
    if (body.sourceType !== undefined) updates.sourceType = textValue(body.sourceType) || '教材'
    if (body.difficulty !== undefined) updates.difficulty = difficultyValue(body.difficulty)
    if (body.pointType !== undefined) updates.pointType = textValue(body.pointType) || '知识点'
    if (body.masteryRequirement !== undefined) updates.masteryRequirement = textValue(body.masteryRequirement) || null
    if (body.status !== undefined) updates.status = textValue(body.status) || 'active'

    if (updates.title !== undefined && !updates.title) {
      return NextResponse.json({ error: '知识点名称不能为空' }, { status: 400 })
    }

    await db.update(knowledgePoints).set(updates).where(eq(knowledgePoints.kpId, kpId)).execute()
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('update knowledge point failed', err)
    return NextResponse.json({ error: '更新知识点失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  if (!requireRole(req, ['admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const kpId = searchParams.get('kpId')

  if (!kpId) {
    return NextResponse.json({ error: '缺少知识点ID' }, { status: 400 })
  }

  try {
    await db.delete(kpDependencies)
      .where(or(eq(kpDependencies.fromKpId, kpId), eq(kpDependencies.toKpId, kpId)))
      .execute()
    await db.delete(knowledgePoints).where(eq(knowledgePoints.kpId, kpId)).execute()
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('delete knowledge point failed', err)
    return NextResponse.json({ error: '删除知识点失败' }, { status: 500 })
  }
}
