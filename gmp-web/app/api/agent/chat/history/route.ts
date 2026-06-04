import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { chatMessages } from '@/db/schema'
import { eq, desc, asc } from 'drizzle-orm'

// GET /api/agent/chat/history — 返回最近 50 条对话记录
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const rows = await db.select().from(chatMessages)
    .where(eq(chatMessages.userId, payload.userId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(50)

  // 正序排列
  const ordered = rows.reverse()

  // 过滤：必须是成对的 user→assistant，去掉尾部孤立的 user 消息
  const paired: typeof ordered = []
  for (let i = 0; i < ordered.length; i++) {
    if (ordered[i].role === 'user' && ordered[i + 1]?.role === 'assistant') {
      paired.push(ordered[i], ordered[i + 1])
      i++ // 跳过已处理的 assistant
    }
  }

  // 去掉连续重复的 user 消息（同内容连续出现只保留最后一对）
  const deduped: typeof paired = []
  for (let i = 0; i < paired.length; i += 2) {
    const user = paired[i]
    const assistant = paired[i + 1]
    if (!user || !assistant) break
    const prevUser = deduped[deduped.length - 2]
    if (prevUser?.content === user.content) {
      // 替换上一对（保留最新的回答）
      deduped[deduped.length - 2] = user
      deduped[deduped.length - 1] = assistant
    } else {
      deduped.push(user, assistant)
    }
  }

  const messages = deduped.map(r => ({
    role:    r.role as 'user' | 'assistant',
    content: r.content,
    sources: r.sources ? JSON.parse(r.sources) as string[] : undefined,
  }))

  return NextResponse.json({ messages })
}

// POST /api/agent/chat/history — 保存一条消息
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { role, content, sources } = await req.json() as {
    role: string; content: string; sources?: string[]
  }

  if (!role || !content) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  await db.insert(chatMessages).values({
    userId:  payload.userId,
    role,
    content,
    sources: sources ? JSON.stringify(sources) : null,
  })

  return NextResponse.json({ ok: true })
}
