import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { courseStudyLogs } from '@/db/schema'

const VALID_ACTIVITIES = ['reading', 'quiz', 'video', 'discussion']

// POST /api/course/study-log
// body: { trainingId, seconds, activity? }
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  const { userId } = payload

  let body: { trainingId?: string; seconds?: number; activity?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: '请求体格式错误' }, { status: 400 }) }

  const { trainingId, seconds, activity } = body
  if (!trainingId || !/^T(0[1-9]|1[01])$/.test(trainingId)) {
    return NextResponse.json({ error: '无效的章节 ID' }, { status: 400 })
  }
  if (typeof seconds !== 'number' || seconds <= 0 || seconds > 3600) {
    return NextResponse.json({ error: '学习时长不合法' }, { status: 400 })
  }

  db.insert(courseStudyLogs).values({
    userId, trainingId,
    seconds: Math.floor(seconds),
    activity: VALID_ACTIVITIES.includes(activity ?? '') ? activity! : 'reading',
  }).run()

  return NextResponse.json({ ok: true })
}
