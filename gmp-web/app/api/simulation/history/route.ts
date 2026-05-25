import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'

// GET /api/simulation/history — 当前用户最近 10 次仿真记录
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { userId } = payload

  const sessions = db.$client.prepare(`
    SELECT id, product_name, dosage_category, score, max_score, completed_at
    FROM simulation_sessions
    WHERE user_id = ?
    ORDER BY completed_at DESC
    LIMIT 10
  `).all(userId) as {
    id: number; product_name: string; dosage_category: string
    score: number; max_score: number; completed_at: string
  }[]

  return NextResponse.json({ sessions })
}
