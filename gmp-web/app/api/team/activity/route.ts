import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { setTeamActivityStatus, touchTeamPresence } from '@/lib/team-collaboration'

function auth(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  return token ? verifyToken(token) : null
}

export async function POST(req: NextRequest) {
  const payload = auth(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    status?: string
    projectId?: number
    roomId?: string | null
  }
  const status = body.status === 'solo' || body.status === 'team' ? body.status : 'idle'
  const projectId = Number.isFinite(Number(body.projectId)) ? Number(body.projectId) : null
  const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : null

  await touchTeamPresence(payload.userId)
  await setTeamActivityStatus(payload.userId, status, projectId, roomId)

  return NextResponse.json({ ok: true, status })
}
