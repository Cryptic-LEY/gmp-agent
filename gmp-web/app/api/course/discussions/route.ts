import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { courseDiscussions, users } from '@/db/schema'
import { eq, desc, and } from 'drizzle-orm'

// GET /api/course/discussions?trainingId=T01
// 返回该章节讨论列表
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!verifyToken(token)) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const trainingId = searchParams.get('trainingId')
  if (!trainingId) return NextResponse.json({ error: 'trainingId required' }, { status: 400 })

  const rows = db.select({
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
    .all()

  return NextResponse.json({ discussions: rows, total: rows.length })
}

// POST /api/course/discussions
// body: { trainingId, title, content, tag? }
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  const { userId } = payload

  let body: { trainingId?: string; title?: string; content?: string; tag?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: '请求体格式错误' }, { status: 400 }) }

  const { trainingId, title, content, tag } = body
  if (!trainingId || !title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: '章节、标题、内容均不能为空' }, { status: 400 })
  }
  if (!/^T(0[1-9]|1[01])$/.test(trainingId)) {
    return NextResponse.json({ error: '无效的章节 ID' }, { status: 400 })
  }

  const validTags = ['提问', '心得', '讨论', '答疑']
  const finalTag = tag && validTags.includes(tag) ? tag : '提问'

  const result = db.insert(courseDiscussions).values({
    trainingId, userId,
    title: title.trim(),
    content: content.trim(),
    tag: finalTag,
  }).run()

  return NextResponse.json({
    id: Number(result.lastInsertRowid),
    trainingId, title, content, tag: finalTag,
  })
}
