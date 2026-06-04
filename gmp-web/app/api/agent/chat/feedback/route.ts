import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'

// POST /api/agent/chat/feedback — 学生举报 AI 答案有误
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { messageContent, userComment } = await req.json() as {
    messageContent: string
    userComment?: string
  }

  if (!messageContent) return NextResponse.json({ error: 'Missing content' }, { status: 400 })

  await db.raw.run(
    `INSERT INTO feedback_log (user_id, message_role, message_content, user_comment)
     VALUES (?, 'assistant', ?, ?)`,
    [payload.userId, messageContent, userComment ?? null],
  )

  return NextResponse.json({ ok: true })
}
