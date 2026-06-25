import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { ensureTeamCollaborationSchema } from '@/lib/team-collaboration'

interface PrivateMessageRow {
  id: number
  sender_id: string
  receiver_id: string
  content: string
  created_at: string
}

interface PrivateMessageNoticeRow extends PrivateMessageRow {
  sender_name: string
  sender_avatar: string | null
}

function auth(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  return token ? verifyToken(token) : null
}

export async function GET(req: NextRequest) {
  const payload = auth(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureTeamCollaborationSchema()
  const peerId = new URL(req.url).searchParams.get('peerId')?.trim()
  if (!peerId) {
    const rows = await db.raw.all<PrivateMessageNoticeRow>(
      `SELECT m.id, m.sender_id, m.receiver_id, m.content, m.created_at,
              u.display_name AS sender_name, u.avatar_url AS sender_avatar
       FROM team_private_messages m
       INNER JOIN users u ON u.user_id = m.sender_id
       WHERE m.receiver_id = ?
       ORDER BY m.created_at DESC
       LIMIT 20`,
      [payload.userId],
    )
    return NextResponse.json({
      messages: [],
      notices: rows.map(row => ({
        id: Number(row.id),
        senderId: row.sender_id,
        senderName: row.sender_name,
        senderAvatar: row.sender_avatar,
        content: row.content,
        createdAt: row.created_at,
      })),
    })
  }

  const rows = await db.raw.all<PrivateMessageRow>(
    `SELECT id, sender_id, receiver_id, content, created_at
     FROM team_private_messages
     WHERE (sender_id = ? AND receiver_id = ?)
        OR (sender_id = ? AND receiver_id = ?)
     ORDER BY created_at ASC
     LIMIT 100`,
    [payload.userId, peerId, peerId, payload.userId],
  )

  return NextResponse.json({
    messages: rows.map(row => ({
      id: Number(row.id),
      senderId: row.sender_id,
      receiverId: row.receiver_id,
      content: row.content,
      createdAt: row.created_at,
      mine: row.sender_id === payload.userId,
    })),
  })
}

export async function POST(req: NextRequest) {
  const payload = auth(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureTeamCollaborationSchema()
  const body = await req.json().catch(() => ({})) as { peerId?: string; content?: string }
  const peerId = body.peerId?.trim()
  const content = body.content?.trim()
  if (!peerId || !content) return NextResponse.json({ error: '消息内容不能为空' }, { status: 400 })
  if (content.length > 1000) return NextResponse.json({ error: '消息不能超过 1000 字' }, { status: 400 })

  const result = await db.raw.run(
    `INSERT INTO team_private_messages (sender_id, receiver_id, content)
     VALUES (?, ?, ?)`,
    [payload.userId, peerId, content],
  ) as { insertId?: number | string }
  const id = Number(result.insertId ?? 0)

  return NextResponse.json({
    ok: true,
    message: {
      id,
      senderId: payload.userId,
      receiverId: peerId,
      content,
      createdAt: new Date().toISOString(),
      mine: true,
    },
  })
}
