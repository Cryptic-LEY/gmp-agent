import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'

function normalizeConfidence(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value > 1 ? value / 100 : value))
}

// GET /api/user/mastery
// 返回当前用户全量 kp_mastery，以 kp_id 为键的 Map
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { userId } = payload

  const rows = await db.raw.all<{ kp_id: string; confidence: number; attempt_count: number; correct_count: number }>(`
    SELECT kp_id, confidence, attempt_count, correct_count
    FROM kp_mastery
    WHERE user_id = ?
  `, [userId])

  // 转成 { [kp_id]: { confidence, attempt_count, correct_count } }，前端 O(1) 查询
  const masteryMap: Record<string, { confidence: number; attempt_count: number; correct_count: number }> = {}
  for (const r of rows) {
    masteryMap[r.kp_id] = {
      confidence:    normalizeConfidence(r.confidence),
      attempt_count: r.attempt_count,
      correct_count: r.correct_count,
    }
  }

  return NextResponse.json({ masteryMap, total: rows.length })
}
