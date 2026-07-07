import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { verifyToken } from '@/lib/auth'

const AGENT_API_URL = (process.env.AGENT_API_URL ?? process.env.GMP_API_URL ?? 'http://127.0.0.1:8001').replace(/\/+$/, '')

interface MessageRow {
  id: number
  session_id: string
  role: string
  content: string
}

interface SessionRow {
  session_id: string
}

function asTrimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeMessageId(value: unknown) {
  const id = Number(value)
  return Number.isFinite(id) && id > 0 ? Math.trunc(id) : null
}

function limitText(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value
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
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const requestedSessionId = asTrimmedString(body.sessionId) || null
  const requestedMessageId = normalizeMessageId(body.messageId)
  const userComment = limitText(asTrimmedString(body.userComment), 2000) || null

  let sessionId: string | null = null
  let messageId: number | null = null
  let messageRole = asTrimmedString(body.messageRole) || 'assistant'
  let messageContent = asTrimmedString(body.messageContent)
  let question = limitText(asTrimmedString(body.question), 8000)

  if (requestedMessageId) {
    const message = (await db.raw.all<MessageRow>(
      `SELECT m.id, m.session_id, m.role, m.content
       FROM ai_chat_messages m
       INNER JOIN ai_chat_sessions s ON s.session_id = m.session_id
       WHERE m.id = ? AND s.user_id = ?
       LIMIT 1`,
      [requestedMessageId, payload.userId],
    ))[0]

    if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    if (requestedSessionId && requestedSessionId !== message.session_id) {
      return NextResponse.json({ error: 'Message does not belong to session' }, { status: 400 })
    }

    sessionId = message.session_id
    messageId = Number(message.id)
    messageRole = message.role
    if (!messageContent) messageContent = message.content

    const previousUserMessage = (await db.raw.all<{ content: string }>(
      `SELECT content
       FROM ai_chat_messages
       WHERE session_id = ? AND role = 'user' AND id < ?
       ORDER BY id DESC
       LIMIT 1`,
      [sessionId, messageId],
    ))[0]
    if (!question) question = limitText(previousUserMessage?.content ?? '', 8000)
  } else if (requestedSessionId) {
    const session = (await db.raw.all<SessionRow>(
      `SELECT session_id
       FROM ai_chat_sessions
       WHERE session_id = ? AND user_id = ?
       LIMIT 1`,
      [requestedSessionId, payload.userId],
    ))[0]

    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    sessionId = session.session_id

    const latestUserMessage = (await db.raw.all<{ content: string }>(
      `SELECT content
       FROM ai_chat_messages
       WHERE session_id = ? AND role = 'user'
       ORDER BY id DESC
       LIMIT 1`,
      [sessionId],
    ))[0]
    if (!question) question = limitText(latestUserMessage?.content ?? '', 8000)
  }

  if (messageRole !== 'assistant') {
    return NextResponse.json({ error: 'Only assistant answers can be reported' }, { status: 400 })
  }

  messageContent = limitText(messageContent, 8000)
  if (!messageContent) {
    return NextResponse.json({ error: 'messageContent required' }, { status: 400 })
  }

  const result = await db.raw.run(
    `INSERT INTO ai_feedback_log (user_id, session_id, message_id, message_role, message_content, user_comment)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [payload.userId, sessionId, messageId, messageRole, messageContent, userComment],
  ) as { insertId?: number | string }

  let errorBookId: number | null = null
  if (question) {
    try {
      const resp = await fetch(`${AGENT_API_URL}/chat/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          bad_answer: messageContent,
          reason: userComment || '用户点击答案有误',
          fix_hint: '',
        }),
        signal: AbortSignal.timeout(5000),
      })
      if (resp.ok) {
        const data = await resp.json().catch(() => ({})) as { error_id?: number }
        errorBookId = typeof data.error_id === 'number' ? data.error_id : null
      }
    } catch {
      // 本地反馈日志已记录；后端评测闭环不可用时不影响用户提交。
    }
  }

  return NextResponse.json({ ok: true, id: Number(result.insertId ?? 0), errorBookId })
}
