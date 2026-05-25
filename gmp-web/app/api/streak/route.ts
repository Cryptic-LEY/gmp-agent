import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { checkinLog, userGameState } from '@/db/schema'
import { eq, and, gte } from 'drizzle-orm'

// 返回过去 16 周（112 天）的打卡记录
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { userId } = payload

  const start = new Date()
  start.setDate(start.getDate() - 111)
  const startStr = start.toISOString().slice(0, 10)

  const logs = db.select({ date: checkinLog.date })
    .from(checkinLog)
    .where(and(eq(checkinLog.userId, userId), gte(checkinLog.date, startStr)))
    .all()

  const checkedDates = new Set(logs.map(l => l.date))

  const state = db.select().from(userGameState).where(eq(userGameState.userId, userId)).get()

  return NextResponse.json({
    checkedDates: [...checkedDates],
    streakDays: state?.streakDays ?? 0,
    maxStreak: state?.maxStreak ?? 0,
    totalDays: checkedDates.size,
  })
}
