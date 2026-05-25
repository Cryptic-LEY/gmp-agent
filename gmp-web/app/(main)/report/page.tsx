'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart3, Loader2, TrendingUp, CheckCircle,
  Target, Award, Flame, Zap, BookOpen,
  FlaskConical, AlertTriangle, Coins,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface Overall    { total: number; correct: number; accuracy: number }
interface GameState  { xp: number; points: number; rank_level: number; rank_title: string; streak_days: number; max_streak: number }
interface ProjectStat{ project_name: string; total: number; correct: number; accuracy: number }
interface DateStat   { date: string; total: number; correct: number }
interface Plan       { score: number; edu_level: string; major: string; wrong_count: number; created_at: string }
interface SimSession { product_name: string; dosage_category: string; score: number; max_score: number; completed_at: string }
interface WrongType    { question_type: string; cnt: number }
interface WeakKp       { kp_id: string; title: string; confidence: number; attempt_count: number; correct_count: number }
interface MasteryStats { tested_kps: number; mastered: number; weak: number; avg_confidence: number }

interface ReportData {
  overall: Overall
  game: GameState
  by_project: ProjectStat[]
  by_date: DateStat[]
  latest_plan: Plan | null
  sim_sessions: SimSession[]
  checkin_dates: string[]
  wrong_by_type: WrongType[]
  weak_kps: WeakKp[]
  mastery_stats: MasteryStats
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PANEL: React.CSSProperties = {
  background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(31,71,92,0.12)',
  borderRadius: 12, boxShadow: '0 8px 24px rgba(29,53,74,0.07)',
}

function scoreColor(n: number) {
  return n >= 80 ? '#16a34a' : n >= 60 ? '#d97706' : '#dc2626'
}

function shortProjectName(name: string) {
  return name.replace(/^专-/, '').replace(/^项目\d+·/, '').replace(/^项目[一二三四五六七八九十]+：/, '')
}

// Generate last 14 days as YYYY-MM-DD strings
function last14Days(): string[] {
  const days: string[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ReportPage() {
  const router = useRouter()
  const [data, setData]     = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { router.push('/login'); return }

    fetch('/api/report/summary', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((d: ReportData) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [router])

  if (loading) return (
    <div style={{ padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#6b8a98', minHeight: 400 }}>
      <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: '#1d6f78' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      加载中…
    </div>
  )

  if (!data) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#9ba8b0' }}>数据加载失败，请刷新重试</div>
  )

  const { overall, game, by_project, by_date, latest_plan, sim_sessions, checkin_dates, wrong_by_type, weak_kps, mastery_stats } = data
  const days14 = last14Days()
  const dateMap = Object.fromEntries(by_date.map(d => [d.date, d]))
  const maxDayTotal = Math.max(...days14.map(d => dateMap[d]?.total ?? 0), 1)

  // Sim avg score
  const simAvg = sim_sessions.length > 0
    ? Math.round(sim_sessions.reduce((s, r) => s + (r.max_score > 0 ? (r.score / r.max_score) * 100 : 0), 0) / sim_sessions.length)
    : null

  return (
    <div style={{ padding: 20 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes grow{from{width:0}}`}</style>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ color: '#1d6f78', fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', margin: 0 }}>进阶功能</p>
        <h1 style={{ color: '#183b4b', fontSize: 26, fontWeight: 700, margin: '4px 0 0' }}>成绩报告</h1>
      </div>

      {/* ── 总览卡片 ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { icon: BookOpen,   label: '累计答题',   value: `${overall.total}题`,          sub: `答对 ${overall.correct} 题`,             color: '#1d6f78' },
          { icon: Target,     label: '综合正确率', value: `${overall.accuracy}%`,         sub: overall.accuracy >= 70 ? '保持良好！' : '继续努力',  color: scoreColor(overall.accuracy) },
          { icon: Flame,      label: '当前连续打卡', value: `${game.streak_days}天`,      sub: `最长 ${game.max_streak} 天`,             color: '#d97706' },
          { icon: Zap,        label: '经验值 XP',  value: `${game.xp}`,                  sub: `${game.rank_title}（Lv.${game.rank_level}）`, color: '#7c3aed' },
          { icon: Coins,      label: '游戏积分',   value: `${game.points ?? 0}`,          sub: '每题答对 +2，每日登录 +5',               color: '#d97706' },
        ].map(s => (
          <div key={s.label} style={{ ...PANEL, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: `${s.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <s.icon size={16} color={s.color} />
              </div>
              <span style={{ fontSize: 12, color: '#6b8a98' }}>{s.label}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#9ba8b0', marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, marginBottom: 16 }}>

        {/* ── 近14天答题趋势 ───────────────────────────────────────────────── */}
        <div style={{ ...PANEL, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <TrendingUp size={16} color="#1d6f78" />
            <span style={{ fontWeight: 700, fontSize: 14, color: '#183b4b' }}>近 14 天答题趋势</span>
          </div>

          {/* Bar chart */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120, marginBottom: 8 }}>
            {days14.map(day => {
              const stat = dateMap[day]
              const total   = stat?.total ?? 0
              const correct = stat?.correct ?? 0
              const barH    = total > 0 ? Math.max((total / maxDayTotal) * 100, 6) : 2
              const correctH = total > 0 ? (correct / total) * barH : 0
              const isToday = day === new Date().toISOString().slice(0,10)

              return (
                <div key={day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'default' }}
                  title={total > 0 ? `${day}\n答题 ${total} 题，正确 ${correct} 题（${Math.round((correct/total)*100)}%）` : `${day}\n未答题`}
                >
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: 110, gap: 1 }}>
                    {total > 0 ? (
                      <>
                        <div style={{ width: '100%', height: `${correctH}%`, borderRadius: '2px 2px 0 0', background: '#1d6f78', minHeight: 3 }} />
                        <div style={{ width: '100%', height: `${barH - correctH}%`, background: '#fca5a5', minHeight: total - correct > 0 ? 2 : 0 }} />
                      </>
                    ) : (
                      <div style={{ width: '100%', height: 2, background: '#e8edf0', borderRadius: 1 }} />
                    )}
                  </div>
                  <span style={{ fontSize: 9, color: isToday ? '#1d6f78' : '#c0ccd4', fontWeight: isToday ? 700 : 400 }}>
                    {day.slice(5)}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#9ba8b0' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#1d6f78', display: 'inline-block' }} />正确
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#fca5a5', display: 'inline-block' }} />错误
            </span>
          </div>
        </div>

        {/* ── 右侧：前测 + 仿真 ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* 前测分数 */}
          <div style={{ ...PANEL, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <CheckCircle size={15} color="#1d6f78" />
              <span style={{ fontWeight: 700, fontSize: 14, color: '#183b4b' }}>能力前测</span>
            </div>
            {latest_plan ? (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: 36, fontWeight: 800, color: scoreColor(latest_plan.score), lineHeight: 1 }}>{latest_plan.score}</span>
                  <span style={{ fontSize: 14, color: '#9ba8b0', paddingBottom: 4 }}>/ 100 分</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: '#e8edf0', overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{ height: '100%', width: `${latest_plan.score}%`, borderRadius: 3, background: scoreColor(latest_plan.score) }} />
                </div>
                <p style={{ fontSize: 12, color: '#9ba8b0', margin: 0 }}>
                  {latest_plan.edu_level === 'undergraduate' ? '本科' : '专科'} · {latest_plan.major}<br />
                  {latest_plan.created_at.slice(0, 10)} 参加前测
                </p>
              </>
            ) : (
              <p style={{ color: '#9ba8b0', fontSize: 13, margin: 0 }}>尚未完成前测</p>
            )}
          </div>

          {/* 仿真平均分 */}
          <div style={{ ...PANEL, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <FlaskConical size={15} color="#1d6f78" />
              <span style={{ fontWeight: 700, fontSize: 14, color: '#183b4b' }}>实训仿真</span>
            </div>
            {sim_sessions.length > 0 ? (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: 36, fontWeight: 800, color: scoreColor(simAvg ?? 0), lineHeight: 1 }}>{simAvg}</span>
                  <span style={{ fontSize: 14, color: '#9ba8b0', paddingBottom: 4 }}>分均分</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {sim_sessions.slice(0, 3).map((s, i) => {
                    const pct = s.max_score > 0 ? Math.round((s.score / s.max_score) * 100) : 0
                    return (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b8a98' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{s.product_name}</span>
                        <span style={{ fontWeight: 700, color: scoreColor(pct), flexShrink: 0 }}>{pct}分</span>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <p style={{ color: '#9ba8b0', fontSize: 13, margin: 0 }}>尚未完成实训仿真</p>
            )}
          </div>
        </div>
      </div>

      {/* ── 各项目正确率 ──────────────────────────────────────────────────────── */}
      {by_project.length > 0 && (
        <div style={{ ...PANEL, padding: '22px 24px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
            <BarChart3 size={16} color="#1d6f78" />
            <span style={{ fontWeight: 700, fontSize: 14, color: '#183b4b' }}>各项目答题情况</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {by_project.map(p => (
              <div key={p.project_name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: '#355564', fontWeight: 500 }}>{shortProjectName(p.project_name)}</span>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: '#9ba8b0' }}>{p.correct}/{p.total} 题</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor(p.accuracy), minWidth: 36, textAlign: 'right' }}>{p.accuracy}%</span>
                  </div>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: '#e8edf0', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${p.accuracy}%`, borderRadius: 3,
                    background: p.accuracy >= 80 ? '#16a34a' : p.accuracy >= 60 ? '#1d6f78' : '#dc2626',
                    transition: 'width 0.6s ease',
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* ── 错题题型分布 ─────────────────────────────────────────────────── */}
        <div style={{ ...PANEL, padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <AlertTriangle size={15} color="#d97706" />
            <span style={{ fontWeight: 700, fontSize: 14, color: '#183b4b' }}>错题题型分布</span>
          </div>
          {wrong_by_type.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {wrong_by_type.map(w => {
                const maxCnt = wrong_by_type[0].cnt
                return (
                  <div key={w.question_type}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, color: '#355564' }}>{w.question_type}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>{w.cnt} 题</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: '#e8edf0', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(w.cnt / maxCnt) * 100}%`, borderRadius: 3, background: '#fca5a5' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#9ba8b0' }}>
              <CheckCircle size={24} color="#16a34a" style={{ margin: '0 auto 8px' }} />
              <p style={{ fontSize: 13, margin: 0 }}>暂无错题记录</p>
            </div>
          )}
        </div>

        {/* ── 打卡热力图（近60天） ─────────────────────────────────────────── */}
        <div style={{ ...PANEL, padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Flame size={15} color="#d97706" />
            <span style={{ fontWeight: 700, fontSize: 14, color: '#183b4b' }}>学习打卡记录</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#9ba8b0' }}>
              近 60 天共打卡 {checkin_dates.length} 天
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {(() => {
              const days: string[] = []
              for (let i = 59; i >= 0; i--) {
                const d = new Date()
                d.setDate(d.getDate() - i)
                days.push(d.toISOString().slice(0, 10))
              }
              return days.map(day => {
                const checked = checkin_dates.includes(day)
                const isToday = day === new Date().toISOString().slice(0,10)
                return (
                  <div
                    key={day}
                    title={`${day}${checked ? ' ✓ 已打卡' : ''}`}
                    style={{
                      width: 12, height: 12, borderRadius: 2,
                      background: isToday ? '#1d6f78' : checked ? '#67c7d0' : '#e8edf0',
                      border: isToday ? '1.5px solid #1d6f78' : 'none',
                    }}
                  />
                )
              })
            })()}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 10, fontSize: 11, color: '#9ba8b0', alignItems: 'center' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#67c7d0', display: 'inline-block' }} />已打卡
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#e8edf0', display: 'inline-block' }} />未打卡
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#1d6f78', display: 'inline-block' }} />今天
          </div>
        </div>

      </div>

      {/* ── 知识点掌握度 ─────────────────────────────────────────────────────── */}
      <div style={{ ...PANEL, padding: '20px 24px', marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Target size={16} color="#1d6f78" />
            <span style={{ fontWeight: 700, fontSize: 14, color: '#183b4b' }}>知识点掌握度</span>
          </div>
          {mastery_stats.tested_kps > 0 && (
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#6b8a98' }}>
              <span>已测 <strong style={{ color: '#183b4b' }}>{mastery_stats.tested_kps}</strong> 个知识点</span>
              <span>平均 <strong style={{ color: '#1d6f78' }}>{mastery_stats.avg_confidence}%</strong></span>
              <span>已掌握 <strong style={{ color: '#16a34a' }}>{mastery_stats.mastered}</strong></span>
              <span>薄弱 <strong style={{ color: '#dc2626' }}>{mastery_stats.weak}</strong></span>
            </div>
          )}
        </div>

        {mastery_stats.tested_kps === 0 ? (
          <p style={{ fontSize: 13, color: '#9ba8b0', textAlign: 'center', padding: '20px 0' }}>
            完成前测或实训仿真后，这里将展示各知识点的掌握情况
          </p>
        ) : (
          <>
            {/* 掌握度总览条 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ height: 10, borderRadius: 5, background: '#eef4f3', overflow: 'hidden', display: 'flex' }}>
                {(() => {
                  const total = mastery_stats.tested_kps || 1
                  const masteredPct = Math.round((mastery_stats.mastered / total) * 100)
                  const weakPct    = Math.round((mastery_stats.weak / total) * 100)
                  const midPct     = 100 - masteredPct - weakPct
                  return (
                    <>
                      <div style={{ width: `${masteredPct}%`, background: '#16a34a', transition: 'width 0.5s' }} />
                      <div style={{ width: `${midPct}%`, background: '#fbbf24', transition: 'width 0.5s' }} />
                      <div style={{ width: `${weakPct}%`, background: '#ef4444', transition: 'width 0.5s' }} />
                    </>
                  )
                })()}
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 11, color: '#9ba8b0' }}>
                <span><span style={{ color: '#16a34a' }}>■</span> 已掌握 ≥80%</span>
                <span><span style={{ color: '#fbbf24' }}>■</span> 巩固中 50-79%</span>
                <span><span style={{ color: '#ef4444' }}>■</span> 薄弱 &lt;50%</span>
              </div>
            </div>

            {/* 薄弱知识点 Top 列表 */}
            {weak_kps.length > 0 && (
              <div>
                <p style={{ fontSize: 12, color: '#6b8a98', marginBottom: 8 }}>📌 最需巩固的知识点</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {weak_kps.map(kp => (
                    <div key={kp.kp_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 90, flexShrink: 0, fontSize: 11, color: '#6b8a98', textAlign: 'right' }}>
                        {kp.confidence}%
                      </div>
                      <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#eef4f3', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${kp.confidence}%`,
                          background: kp.confidence < 40 ? '#ef4444' : kp.confidence < 65 ? '#fbbf24' : '#1d6f78',
                          borderRadius: 3, transition: 'width 0.4s',
                        }} />
                      </div>
                      <span style={{ fontSize: 12, color: '#183b4b', flex: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {kp.title}
                      </span>
                      <span style={{ fontSize: 11, color: '#9ba8b0', flexShrink: 0 }}>
                        {kp.correct_count}/{kp.attempt_count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 综合学习建议 ──────────────────────────────────────────────────────── */}
      <div style={{ ...PANEL, padding: '20px 24px', marginTop: 16, background: 'rgba(29,111,120,0.04)', border: '1px solid rgba(29,111,120,0.14)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Award size={16} color="#1d6f78" />
          <span style={{ fontWeight: 700, fontSize: 14, color: '#183b4b' }}>综合学习建议</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {overall.accuracy < 60 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <AlertTriangle size={14} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 13, color: '#355564', lineHeight: 1.6 }}>
                当前正确率 {overall.accuracy}%，建议优先回顾「错题本」中的薄弱知识点，结合课件重新学习。
              </span>
            </div>
          )}
          {by_project.filter(p => p.accuracy < 50 && p.total >= 3).slice(0, 2).map(p => (
            <div key={p.project_name} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Target size={14} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 13, color: '#355564', lineHeight: 1.6 }}>
                「{shortProjectName(p.project_name)}」正确率仅 {p.accuracy}%，是当前主要薄弱点，建议安排针对性复习。
              </span>
            </div>
          ))}
          {game.streak_days === 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Flame size={14} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 13, color: '#355564', lineHeight: 1.6 }}>
                当前连续打卡中断，坚持每日打卡可获得 XP 奖励并保持学习节律。
              </span>
            </div>
          )}
          {sim_sessions.length === 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <FlaskConical size={14} color="#1d6f78" style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 13, color: '#355564', lineHeight: 1.6 }}>
                尚未完成实训仿真。实训仿真基于真实药品案例，能有效检验 GMP 实际应用能力，建议尽早体验。
              </span>
            </div>
          )}
          {overall.accuracy >= 80 && game.streak_days >= 3 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <CheckCircle size={14} color="#16a34a" style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 13, color: '#355564', lineHeight: 1.6 }}>
                学习状态良好，正确率 {overall.accuracy}%，连续打卡 {game.streak_days} 天。继续保持，向更高难度题目挑战！
              </span>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
