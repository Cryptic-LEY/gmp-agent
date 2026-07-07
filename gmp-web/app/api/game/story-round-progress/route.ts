import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import {
  getUserSimulationStoryRoundIds,
  isSimulationStoryProjectId,
  normalizeSimulationStoryRoundIds,
  saveUserSimulationStoryRoundIds,
} from '@/lib/simulation/story-round-progress-store'

function getUserId(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const payload = verifyToken(token)
  return payload?.userId ?? null
}

function cleanProjectId(value: unknown) {
  const projectId = Number(value)
  return isSimulationStoryProjectId(projectId) ? projectId : null
}

export async function GET(req: NextRequest) {
  const userId = getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projectId = cleanProjectId(req.nextUrl.searchParams.get('projectId'))
  if (!projectId) return NextResponse.json({ error: 'Invalid simulation project id' }, { status: 400 })

  try {
    const watchedRoundIds = await getUserSimulationStoryRoundIds(userId, projectId)
    return NextResponse.json({ watchedRoundIds })
  } catch (error) {
    console.error('load simulation story round progress failed', error)
    return NextResponse.json({ error: 'Load simulation story round progress failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const projectId = cleanProjectId(body?.projectId)
  if (!projectId) return NextResponse.json({ error: 'Invalid simulation project id' }, { status: 400 })

  const roundIds = normalizeSimulationStoryRoundIds(
    Array.isArray(body?.roundIds) ? body.roundIds : [body?.roundId],
  )

  try {
    const watchedRoundIds = await saveUserSimulationStoryRoundIds(userId, projectId, roundIds)
    return NextResponse.json({ watchedRoundIds })
  } catch (error) {
    console.error('save simulation story round progress failed', error)
    return NextResponse.json({ error: 'Save simulation story round progress failed' }, { status: 500 })
  }
}
