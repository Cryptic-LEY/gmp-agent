import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { verifyToken } from '@/lib/auth'

type MessageRole = 'user' | 'assistant'

interface SessionRow {
  session_id: string
  message_count: number
}

function normalizeRole(value: unknown): MessageRole | null {
  return value === 'user' || value === 'assistant' ? value : null
}

function titleFromQuestion(question: string) {
  const normalized = question.replace(/\s+/g, ' ').trim()
  if (!normalized) return null
  return normalized.length > 32 ? `${normalized.slice(0, 32)}...` : normalized
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { sessionId } = await context.params
  const session = (await db.raw.all<SessionRow>(
    `SELECT session_id, message_count
     FROM ai_chat_sessions
     WHERE session_id = ? AND user_id = ?
     LIMIT 1`,
    [sessionId, payload.userId],
  ))[0]

  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const role = normalizeRole(body.role)
  const content = typeof body.content === 'string' ? body.content.trim() : ''
  if (!role || !content) {
    return NextResponse.json({ error: 'role and content required' }, { status: 400 })
  }

  const sources = Array.isArray(body.sources)
    ? body.sources.filter(item => typeof item === 'string').slice(0, 20)
    : []
  const criticTriggered = Boolean(body.criticTriggered)

  const result = await db.raw.run(
    `INSERT INTO ai_chat_messages (session_id, role, content, sources, critic_triggered)
     VALUES (?, ?, ?, ?, ?)`,
    [sessionId, role, content, sources.length ? JSON.stringify(sources) : null, criticTriggered],
  ) as { insertId?: number | string }

  const title = role === 'user' && session.message_count === 0 ? titleFromQuestion(content) : null
  const eduLevel = typeof body.eduLevel === 'string' && body.eduLevel.trim() ? body.eduLevel.trim() : null

  await db.raw.run(
    `UPDATE ai_chat_sessions
     SET message_count = message_count + 1,
         title = COALESCE(?, title),
         edu_level = COALESCE(?, edu_level),
         updated_at = CURRENT_TIMESTAMP(3)
     WHERE session_id = ? AND user_id = ?`,
    [title, eduLevel, sessionId, payload.userId],
  )

  return NextResponse.json({ ok: true, id: Number(result.insertId ?? 0) })
}
