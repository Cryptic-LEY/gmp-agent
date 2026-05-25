import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { questionHistory } from '@/db/schema'
import { and, eq } from 'drizzle-orm'

// PATCH /api/practice/history/[id]/reviewed
// Body: { reviewed: boolean }
// 仅允许操作属于自己的记录
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { userId } = payload
  const { id } = await params
  const historyId = parseInt(id, 10)
  if (isNaN(historyId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const { reviewed } = await req.json() as { reviewed: boolean }

  const result = db
    .update(questionHistory)
    .set({ reviewed })
    .where(and(eq(questionHistory.id, historyId), eq(questionHistory.userId, userId)))
    .run()

  if (result.changes === 0) {
    return NextResponse.json({ error: 'Not found or not yours' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
