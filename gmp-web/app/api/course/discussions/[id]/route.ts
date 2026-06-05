import { NextRequest, NextResponse } from 'next/server'
import { asc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { courseDiscussionReplies, courseDiscussions, users } from '@/db/schema'
import { verifyToken } from '@/lib/auth'

function parseDiscussionId(value: string) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!verifyToken(token)) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { id } = await context.params
  const discussionId = parseDiscussionId(id)
  if (!discussionId) return NextResponse.json({ error: '无效的 ID' }, { status: 400 })

  const [topic] = await db.select({
    id: courseDiscussions.id,
    trainingId: courseDiscussions.trainingId,
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
    .where(eq(courseDiscussions.id, discussionId))
    .limit(1)

  if (!topic) return NextResponse.json({ error: '讨论不存在' }, { status: 404 })

  await db.update(courseDiscussions)
    .set({ viewCount: sql`${courseDiscussions.viewCount} + 1` })
    .where(eq(courseDiscussions.id, discussionId))

  const replies = await db.select({
    id: courseDiscussionReplies.id,
    content: courseDiscussionReplies.content,
    isAi: courseDiscussionReplies.isAi,
    createdAt: courseDiscussionReplies.createdAt,
    authorId: courseDiscussionReplies.userId,
    authorName: users.displayName,
    authorRole: users.role,
  })
    .from(courseDiscussionReplies)
    .leftJoin(users, eq(courseDiscussionReplies.userId, users.userId))
    .where(eq(courseDiscussionReplies.discussionId, discussionId))
    .orderBy(asc(courseDiscussionReplies.createdAt))

  return NextResponse.json({ topic, replies })
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { id } = await context.params
  const discussionId = parseDiscussionId(id)
  if (!discussionId) return NextResponse.json({ error: '无效的 ID' }, { status: 400 })

  let body: { content?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求体格式错误' }, { status: 400 })
  }

  const content = body.content?.trim()
  if (!content) return NextResponse.json({ error: '内容不能为空' }, { status: 400 })

  const [topic] = await db.select().from(courseDiscussions)
    .where(eq(courseDiscussions.id, discussionId))
    .limit(1)
  if (!topic) return NextResponse.json({ error: '讨论不存在' }, { status: 404 })

  const result = await db.raw.run(
    `INSERT INTO course_discussion_replies (discussion_id, user_id, content, is_ai) VALUES (?, ?, ?, 0)`,
    [discussionId, payload.userId, content],
  ) as { insertId?: number }

  await db.update(courseDiscussions)
    .set({ replyCount: sql`${courseDiscussions.replyCount} + 1` })
    .where(eq(courseDiscussions.id, discussionId))

  return NextResponse.json({ id: Number(result.insertId ?? 0) })
}
