import { and, eq } from 'drizzle-orm'
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

export async function GET(req: NextRequest) {
  if (!requireRole(req, ['admin', 'teacher'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const deps = await db.select().from(kpDependencies)
  const kps = await db.select({
    kpId: knowledgePoints.kpId,
    title: knowledgePoints.title,
    serialCode: knowledgePoints.serialCode,
  }).from(knowledgePoints)

  const kpMap = new Map(kps.map(item => [item.kpId, item]))

  return NextResponse.json({
    items: deps.map(dep => ({
      id: `${dep.fromKpId}->${dep.toKpId}`,
      fromKpId: dep.fromKpId,
      fromTitle: kpMap.get(dep.fromKpId)?.title || dep.fromKpId,
      fromSerialCode: kpMap.get(dep.fromKpId)?.serialCode || '',
      toKpId: dep.toKpId,
      toTitle: kpMap.get(dep.toKpId)?.title || dep.toKpId,
      toSerialCode: kpMap.get(dep.toKpId)?.serialCode || '',
    })),
  })
}

export async function POST(req: NextRequest) {
  if (!requireRole(req, ['admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json() as { fromKpId?: string; toKpId?: string }
    const fromKpId = body.fromKpId?.trim()
    const toKpId = body.toKpId?.trim()

    if (!fromKpId || !toKpId) {
      return NextResponse.json({ error: '缺少依赖关系参数' }, { status: 400 })
    }

    if (fromKpId === toKpId) {
      return NextResponse.json({ error: '不能创建自我依赖' }, { status: 400 })
    }

    const existing = (await db.select().from(kpDependencies)
      .where(and(eq(kpDependencies.fromKpId, fromKpId), eq(kpDependencies.toKpId, toKpId)))
      .limit(1))[0]

    if (existing) {
      return NextResponse.json({ error: '依赖关系已存在' }, { status: 409 })
    }

    await db.insert(kpDependencies).values({ fromKpId, toKpId }).execute()
    return NextResponse.json({ success: true }, { status: 201 })
  } catch (err) {
    console.error('create dependency failed', err)
    return NextResponse.json({ error: '创建依赖关系失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  if (!requireRole(req, ['admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const fromKpId = searchParams.get('fromKpId')
  const toKpId = searchParams.get('toKpId')

  if (!fromKpId || !toKpId) {
    return NextResponse.json({ error: '缺少依赖关系参数' }, { status: 400 })
  }

  try {
    await db.delete(kpDependencies)
      .where(and(eq(kpDependencies.fromKpId, fromKpId), eq(kpDependencies.toKpId, toKpId)))
      .execute()
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('delete dependency failed', err)
    return NextResponse.json({ error: '删除依赖关系失败' }, { status: 500 })
  }
}
