import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { courseDiscussions, courseDiscussionReplies, users } from '@/db/schema'
import { eq, sql, asc } from 'drizzle-orm'

// GET /api/course/discussions/[id] - 返回主题 + 所有回复
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!verifyToken(token)) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { id } = await context.params
  const discussionId = parseInt(id, 10)
  if (isNaN(discussionId)) return NextResponse.json({ error: '无效的 ID' }, { status: 400 })

  const topic = db.select({
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
    .where(eq(courseDiscussions.id, discussionId)).get()

  if (!topic) return NextResponse.json({ error: '讨论不存在' }, { status: 404 })

  // 浏览数 +1
  db.update(courseDiscussions)
    .set({ viewCount: sql`${courseDiscussions.viewCount} + 1` })
    .where(eq(courseDiscussions.id, discussionId)).run()

  const replies = db.select({
    id: courseDiscussionReplies.id,
    content: courseDiscussionReplies.content,
    isAi: courseDiscussionReplies.isAi,
    createdAt: courseDiscussionReplies.createdAt,
    authorId: courseDiscussionReplies.userId,
    authorName: users.displayName,
    authorRole: users.role,
  })
    .from(courseDiscussionReplies)
    .innerJoin(users, eq(courseDiscussionReplies.userId, users.userId))
    .where(eq(courseDiscussionReplies.discussionId, discussionId))
    .orderBy(asc(courseDiscussionReplies.createdAt)).all()

  return NextResponse.json({ topic, replies })
}

// POST /api/course/discussions/[id] - 发回复
// body: { content }
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  const { userId } = payload

  const { id } = await context.params
  const discussionId = parseInt(id, 10)
  if (isNaN(discussionId)) return NextResponse.json({ error: '无效的 ID' }, { status: 400 })

  let body: { content?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: '请求体格式错误' }, { status: 400 }) }

  if (!body.content?.trim()) return NextResponse.json({ error: '内容不能为空' }, { status: 400 })

  const topic = db.select().from(courseDiscussions).where(eq(courseDiscussions.id, discussionId)).get()
  if (!topic) return NextResponse.json({ error: '讨论不存在' }, { status: 404 })

  const result = db.insert(courseDiscussionReplies).values({
    discussionId, userId,
    content: body.content.trim(),
    isAi: false,
  }).run()

  db.update(courseDiscussions)
    .set({ replyCount: sql`${courseDiscussions.replyCount} + 1` })
    .where(eq(courseDiscussions.id, discussionId)).run()

  return NextResponse.json({ id: Number(result.lastInsertRowid) })
}
