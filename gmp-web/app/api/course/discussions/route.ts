import { NextRequest, NextResponse } from 'next/server'
import { desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { courseDiscussions, trainingProjects, users } from '@/db/schema'
import { verifyToken } from '@/lib/auth'

const VALID_TAGS = ['提问', '心得', '讨论', '答疑']
const AI_USER_ID = 'ai-assistant'

// 触发 AI 自动答疑（fire-and-forget，不阻塞主响应）
async function triggerAiReply(discussionId: number, title: string, content: string, trainingId: string) {
  try {
    // 拼上章节背景
    const [chapter] = await db.select({ displayName: trainingProjects.displayName })
      .from(trainingProjects)
      .where(eq(trainingProjects.trainingId, trainingId))
      .limit(1)
    const chapterName = chapter?.displayName ?? trainingId

    const question = [
      `【GMP课程 · ${chapterName} 章节讨论】`,
      `学生提问标题：${title}`,
      `问题详情：${content}`,
      '请结合 GMP 法规和课程知识点，给出清晰、准确的解答。如果涉及具体条款，请引用原文。',
    ].join('\n')

    const resp = await fetch('http://localhost:8001/chat/tutor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!resp.ok) return

    const data = await resp.json() as { answer?: string }
    const answer = data.answer?.trim()
    if (!answer) return

    // 写入 AI 回复
    await db.raw.run(
      `INSERT INTO course_discussion_replies (discussion_id, user_id, content, is_ai) VALUES (?, ?, ?, 1)`,
      [discussionId, AI_USER_ID, answer],
    )
    // 更新回复数
    await db.update(courseDiscussions)
      .set({ replyCount: sql`${courseDiscussions.replyCount} + 1` })
      .where(eq(courseDiscussions.id, discussionId))
  } catch {
    // AI 答疑失败不影响学生发帖
  }
}

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

  const discussionId = Number(result.insertId ?? 0)

  // 「提问」和「答疑」标签自动触发 AI 答疑（不等待，不影响响应速度）
  if (tag === '提问' || tag === '答疑') {
    void triggerAiReply(discussionId, title, content, body.trainingId)
  }

  return NextResponse.json({
    id: discussionId,
    trainingId: body.trainingId,
    title,
    content,
    tag,
  })
}
