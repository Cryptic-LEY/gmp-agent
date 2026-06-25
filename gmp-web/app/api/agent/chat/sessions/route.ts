import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { verifyToken, type JwtPayload } from '@/lib/auth'

type Audience = 'student' | 'teacher'

interface SessionRow {
  session_id: string
  title: string
  audience: Audience
  edu_level: string | null
  message_count: number
  created_at: string
  updated_at: string
}

function parseAudience(value: unknown): Audience {
  return value === 'teacher' ? 'teacher' : 'student'
}

function canUseAudience(payload: JwtPayload, audience: Audience) {
  return audience !== 'teacher' || payload.role === 'teacher' || payload.role === 'admin'
}

function normalizeTitle(value: unknown) {
  const title = typeof value === 'string' ? value.trim() : ''
  if (!title) return '新对话'
  return title.length > 40 ? `${title.slice(0, 40)}...` : title
}

function normalizeSession(row: SessionRow) {
  return {
    sessionId: row.session_id,
    title: row.title,
    audience: row.audience,
    eduLevel: row.edu_level,
    messageCount: Number(row.message_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const audience = parseAudience(searchParams.get('audience'))
  if (!canUseAudience(payload, audience)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const limit = Math.max(1, Math.min(Number(searchParams.get('limit') ?? 50), 100))
  const rows = await db.raw.all<SessionRow>(
    `SELECT session_id, title, audience, edu_level, message_count, created_at, updated_at
     FROM ai_chat_sessions
     WHERE user_id = ? AND audience = ?
     ORDER BY updated_at DESC
     LIMIT ${limit}`,
    [payload.userId, audience],
  )

  return NextResponse.json({ sessions: rows.map(normalizeSession) })
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const audience = parseAudience(body.audience)
  if (!canUseAudience(payload, audience)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sessionId = randomUUID()
  const title = normalizeTitle(body.title)
  const eduLevel = typeof body.eduLevel === 'string' && body.eduLevel.trim() ? body.eduLevel.trim() : null

  await db.raw.run(
    `INSERT INTO ai_chat_sessions (session_id, user_id, audience, title, edu_level)
     VALUES (?, ?, ?, ?, ?)`,
    [sessionId, payload.userId, audience, title, eduLevel],
  )

  const row = (await db.raw.all<SessionRow>(
    `SELECT session_id, title, audience, edu_level, message_count, created_at, updated_at
     FROM ai_chat_sessions
     WHERE session_id = ? AND user_id = ?
     LIMIT 1`,
    [sessionId, payload.userId],
  ))[0]

  return NextResponse.json({ session: normalizeSession(row) })
}
