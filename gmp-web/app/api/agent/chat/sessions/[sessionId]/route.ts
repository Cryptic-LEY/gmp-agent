import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { verifyToken } from '@/lib/auth'

interface SessionRow {
  session_id: string
  title: string
  audience: 'student' | 'teacher'
  edu_level: string | null
  message_count: number
  created_at: string
  updated_at: string
}

interface MessageRow {
  id: number
  role: 'user' | 'assistant'
  content: string
  sources: string | null
  critic_triggered: 0 | 1 | boolean
  created_at: string
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

function parseSources(value: string | null) {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : undefined
  } catch {
    return undefined
  }
}

function normalizeMessage(row: MessageRow) {
  return {
    id: Number(row.id),
    role: row.role,
    content: row.content,
    sources: parseSources(row.sources),
    criticTriggered: Boolean(row.critic_triggered),
    createdAt: row.created_at,
  }
}

async function getOwnedSession(sessionId: string, userId: string) {
  return (await db.raw.all<SessionRow>(
    `SELECT session_id, title, audience, edu_level, message_count, created_at, updated_at
     FROM ai_chat_sessions
     WHERE session_id = ? AND user_id = ?
     LIMIT 1`,
    [sessionId, userId],
  ))[0]
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { sessionId } = await context.params
  const session = await getOwnedSession(sessionId, payload.userId)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const messages = await db.raw.all<MessageRow>(
    `SELECT id, role, content, sources, critic_triggered, created_at
     FROM ai_chat_messages
     WHERE session_id = ?
     ORDER BY id ASC`,
    [sessionId],
  )

  return NextResponse.json({
    session: normalizeSession(session),
    messages: messages.map(normalizeMessage),
  })
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { sessionId } = await context.params
  const session = await getOwnedSession(sessionId, payload.userId)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.raw.run(
    `DELETE FROM ai_chat_sessions WHERE session_id = ? AND user_id = ?`,
    [sessionId, payload.userId],
  )

  return NextResponse.json({ ok: true })
}
