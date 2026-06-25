import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'

function normalizeConfidence(value: number | null | undefined) {
  const numeric = Number(value ?? 0)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(1, numeric > 1 ? numeric / 100 : numeric))
}

// GET /api/report/summary
// 返回成绩报告所需的全部聚合数据
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { userId } = payload

  // ── 1. 总体统计 ─────────────────────────────────────────────────────────────
  const overall = await db.raw.get<{ total: number; correct: number }>(`
    SELECT COUNT(*) as total, SUM(is_correct) as correct
    FROM question_history WHERE user_id = ?
  `, [userId]) ?? { total: 0, correct: 0 }

  // ── 2. 游戏状态 ─────────────────────────────────────────────────────────────
  const game = await db.raw.get<{ xp: number; points: number; rank_level: number; rank_title: string; streak_days: number; max_streak: number }>(`
    SELECT xp, points, rank_level, rank_title, streak_days, max_streak
    FROM user_game_state WHERE user_id = ?
  `, [userId])

  // ── 3. 按项目统计（最近答题） ─────────────────────────────────────────────
  const byProject = await db.raw.all<{ project_name: string; total: number; correct: number }>(`
    SELECT q.project_name,
           COUNT(*) as total,
           SUM(qh.is_correct) as correct
    FROM question_history qh
    JOIN questions q ON q.question_id = qh.question_id
    WHERE qh.user_id = ? AND q.project_name IS NOT NULL
    GROUP BY q.project_name
    ORDER BY total DESC
  `, [userId])

  // ── 4. 近 14 天每日答题数 ────────────────────────────────────────────────
  const byDate = await db.raw.all<{ date: string; total: number; correct: number }>(`
    SELECT date(answered_at) as date,
           COUNT(*) as total,
           SUM(is_correct) as correct
    FROM question_history
    WHERE user_id = ?
      AND answered_at >= date_sub(current_timestamp(3), interval 14 day)
    GROUP BY date
    ORDER BY date ASC
  `, [userId])

  // ── 5. 前测分数 ──────────────────────────────────────────────────────────
  const latestPlan = await db.raw.get<{ score: number; edu_level: string; major: string; wrong_count: number; created_at: string }>(`
    SELECT score, edu_level, major, wrong_count, created_at
    FROM learning_plans
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `, [userId])

  // ── 6. 仿真记录 ──────────────────────────────────────────────────────────
  const simSessions = await db.raw.all<{ product_name: string; dosage_category: string; score: number; max_score: number; completed_at: string }>(`
    SELECT product_name, dosage_category, score, max_score, completed_at
    FROM simulation_sessions
    WHERE user_id = ?
    ORDER BY completed_at DESC
    LIMIT 5
  `, [userId])

  // ── 7. 打卡天数 ──────────────────────────────────────────────────────────
  const checkins = await db.raw.all<{ date: string }>(`
    SELECT date FROM checkin_log WHERE user_id = ? ORDER BY date DESC LIMIT 60
  `, [userId])

  // ── 8. 近 14 天错题题型分布 ─────────────────────────────────────────────
  const wrongByType = await db.raw.all<{ question_type: string; cnt: number }>(`
    SELECT q.question_type, COUNT(*) as cnt
    FROM question_history qh
    JOIN questions q ON q.question_id = qh.question_id
    WHERE qh.user_id = ? AND qh.is_correct = 0
    GROUP BY q.question_type
    ORDER BY cnt DESC
  `, [userId])

  // ── 9. 知识点掌握度 — 薄弱点 Top 10 ───────────────────────────────────
  const weakKps = await db.raw.all<{ kp_id: string; confidence: number; attempt_count: number; correct_count: number; title: string | null }>(`
    SELECT km.kp_id, km.confidence, km.attempt_count, km.correct_count, kp.title
    FROM kp_mastery km
    LEFT JOIN knowledge_points kp ON kp.kp_id = km.kp_id
    WHERE km.user_id = ? AND km.attempt_count >= 1
    ORDER BY CASE WHEN km.confidence > 1 THEN km.confidence / 100 ELSE km.confidence END ASC
    LIMIT 10
  `, [userId])

  // ── 10. 知识点掌握度统计 ────────────────────────────────────────────────
  const masteryStats = await db.raw.get<{ tested_kps: number; mastered: number; weak: number; avg_confidence: number }>(`
    SELECT
      COUNT(*) as tested_kps,
      SUM(CASE WHEN (CASE WHEN confidence > 1 THEN confidence / 100 ELSE confidence END) >= 0.8 THEN 1 ELSE 0 END) as mastered,
      SUM(CASE WHEN (CASE WHEN confidence > 1 THEN confidence / 100 ELSE confidence END) < 0.5 THEN 1 ELSE 0 END) as weak,
      ROUND(AVG(CASE WHEN confidence > 1 THEN confidence / 100 ELSE confidence END) * 100) as avg_confidence
    FROM kp_mastery
    WHERE user_id = ?
  `, [userId])

  return NextResponse.json({
    overall: {
      total:   overall.total ?? 0,
      correct: overall.correct ?? 0,
      accuracy: overall.total > 0 ? Math.round(((overall.correct ?? 0) / overall.total) * 100) : 0,
    },
    game: game ?? { xp: 0, points: 0, rank_level: 1, rank_title: 'GMP新人', streak_days: 0, max_streak: 0 },
    by_project: byProject.map(p => ({
      ...p,
      accuracy: p.total > 0 ? Math.round(((p.correct ?? 0) / p.total) * 100) : 0,
    })),
    by_date: byDate,
    latest_plan: latestPlan ?? null,
    sim_sessions: simSessions,
    checkin_dates: checkins.map(c => c.date),
    wrong_by_type: wrongByType,
    weak_kps: weakKps.map(k => ({
      kp_id:        k.kp_id,
      title:        k.title ?? k.kp_id,
      confidence:   Math.round(normalizeConfidence(k.confidence) * 100),
      attempt_count: k.attempt_count,
      correct_count: k.correct_count,
    })),
    mastery_stats: masteryStats ?? { tested_kps: 0, mastered: 0, weak: 0, avg_confidence: 0 },
  })
}
