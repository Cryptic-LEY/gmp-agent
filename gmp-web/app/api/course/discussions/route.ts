import { NextRequest, NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { courseDiscussions, users } from '@/db/schema'
import { verifyToken } from '@/lib/auth'

const VALID_TAGS = ['提问', '心得', '讨论', '答疑']

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!verifyToken(token)) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const trainingId = searchParams.get('trainingId')
  if (!trainingId) return NextResponse.json({ error: 'trainingId required' }, { status: 400 })

  const rows = await db.select({
    id: courseDiscussions.id,
    title: courseDiscussions.title,
    content: courseDiscussions.content,
    tag: courseDiscussions.tag,
    pinned: courseDiscussions.pinned,
    viewCount: courseDiscussions.viewCount,
    replyCount: courseDiscussions.replyCount,
    createdAt: courseDiscussions.createdAt,
    authorId: courseDiscussions.userId,
    authorName: users.displayName,
    authorRole: users.role,
  })
    .from(courseDiscussions)
    .innerJoin(users, eq(courseDiscussions.userId, users.userId))
    .where(eq(courseDiscussions.trainingId, trainingId))
    .orderBy(desc(courseDiscussions.pinned), desc(courseDiscussions.createdAt))

  return NextResponse.json({ discussions: rows, total: rows.length })
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  let body: { trainingId?: string; title?: string; content?: string; tag?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求体格式错误' }, { status: 400 })
  }

  const title = body.title?.trim()
  const content = body.content?.trim()
  if (!body.trainingId || !title || !content) {
    return NextResponse.json({ error: '章节、标题、内容均不能为空' }, { status: 400 })
  }
  if (!/^T(0[1-9]|1[01])$/.test(body.trainingId)) {
    return NextResponse.json({ error: '无效的章节 ID' }, { status: 400 })
  }

  const tag = body.tag && VALID_TAGS.includes(body.tag) ? body.tag : '提问'
  const result = await db.raw.run(
    `INSERT INTO course_discussions (training_id, user_id, title, content, tag) VALUES (?, ?, ?, ?, ?)`,
    [body.trainingId, payload.userId, title, content, tag],
  ) as { insertId?: number }

  return NextResponse.json({
    id: Number(result.insertId ?? 0),
    trainingId: body.trainingId,
    title,
    content,
    tag,
  })
}
