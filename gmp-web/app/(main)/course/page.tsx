'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  GraduationCap, Trophy, Clock, Sparkles, ArrowRight, CheckCircle2,
  PlayCircle, Lock, Target, Users, TrendingUp, BookMarked, Crown,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface Chapter {
  trainingId: string
  displayName: string
  seqOrder: number
  hours: number | null
  maxScoreHours: number
  maxScoreCredits?: number
  status: 'locked' | 'untouched' | 'in_progress' | 'completed'
  totalKps: number
  mastered: number
  learning: number
  weak: number
  untested: number
  masteryPct: number
  pptProgressPct: number
  videoProgressPct: number
  coursewareProgressPct: number
  pptResourceCount: number
  videoResourceCount: number
  latestScore: number | null
  earnedHours: number | null
  earnedCredits?: number | null
  studyMinutes: number
  completedAt: string | null
}

interface Overview {
  user: { displayName: string; eduLevel: string; major: string; className: string }
  summary: {
    totalChapters: number
    completedChapters: number
    inProgressChapters: number
    totalStudyMinutes: number
    weekStudyMinutes: number
    totalEarnedHours: number
    totalMaxHours: number
    totalEarnedCredits?: number
    totalMaxCredits?: number
    knowledgeMasteryPct: number
    coursewareProgressPct: number
  }
  recommendations: { trainingId: string; displayName: string; reason: string }[]
  chapters: Chapter[]
}

interface LeaderboardItem {
  userId: string
  displayName: string
  avatar: string
  totalEarnedHours: number
  totalEarnedCredits?: number
  completedChapters: number
  studyMinutes: number
  isMe: boolean
}

interface LeaderboardData {
  scope: string
  className: string | null
  myRank: number
  total: number
  list: LeaderboardItem[]
}

interface AssetEnsureProgress {
  current: number
  total: number
  trainingId: string
  message: string
}

const COURSE_ASSET_TRAINING_IDS = ['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08', 'T09', 'T10', 'T11']

// ── Component ────────────────────────────────────────────────────────────────

export default function CourseHomePage() {
  const router = useRouter()
  const [data, setData] = useState<Overview | null>(null)
  const [lb, setLb] = useState<LeaderboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [assetProgress, setAssetProgress] = useState<AssetEnsureProgress | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { router.push('/login'); return }
    const authToken = token

    let alive = true
    const headers = { Authorization: `Bearer ${authToken}` }
    async function ensureAssetsInBackground() {
      const today = new Date().toISOString().slice(0, 10)
      const cacheKey = `course-assets-ensured:${today}:${authToken.slice(-18)}`
      if (localStorage.getItem(cacheKey) === 'done') return

      const total = COURSE_ASSET_TRAINING_IDS.length
      setAssetProgress({ current: 0, total, trainingId: '', message: '正在检查课程测验和作业...' })
      try {
        for (const [index, trainingId] of COURSE_ASSET_TRAINING_IDS.entries()) {
          if (!alive) return
          setAssetProgress({
            current: index,
            total,
            trainingId,
            message: `正在加载 ${trainingId} 的章节测验和作业...`,
          })
          await fetch('/api/course/assets/ensure', {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ trainingId }),
          }).catch(() => null)
          if (!alive) return
          setAssetProgress({
            current: index + 1,
            total,
            trainingId,
            message: `已完成 ${index + 1}/${total} 章课程资源检查`,
          })
        }
        localStorage.setItem(cacheKey, 'done')
      } finally {
        if (alive) setAssetProgress(null)
      }
    }

    async function loadCourseHome() {
      const [ov, l] = await Promise.all([
        fetch('/api/course/overview', { headers }).then(r => r.ok ? r.json() : null),
        fetch('/api/course/leaderboard', { headers }).then(r => r.ok ? r.json() : null),
      ])
      if (!alive) return
      setData(ov)
      setLb(l)
      setLoading(false)
      void ensureAssetsInBackground()
    }

    loadCourseHome().catch(() => {
      if (!alive) return
      setData(null)
      setLoading(false)
    })

    return () => { alive = false }
  }, [router])

  if (loading) return <LoadingState progress={assetProgress} />
  if (!data) return <div style={{ padding: 40, color: '#6b8a98' }}>加载失败</div>

  const { user, summary, recommendations, chapters } = data
  const progressPct = summary.totalChapters > 0
    ? Math.round(summary.completedChapters / summary.totalChapters * 100)
    : 0
  const coursewarePct = summary.coursewareProgressPct ?? 0
  const knowledgePct = summary.knowledgeMasteryPct ?? 0
  const courseCreditEarned = summary.totalEarnedCredits ?? summary.totalEarnedHours
  const courseCreditTotal = summary.totalMaxCredits ?? summary.totalMaxHours

  return (
    <div style={{ padding: '20px 24px 40px', minHeight: 'calc(100vh - 86px)', background: '#f4f6f8' }}>
      <style>{`
        @keyframes shimmer { 0%{transform:translateX(-100%);} 100%{transform:translateX(100%);} }
        @keyframes fadeIn  { from{opacity:0;transform:translateY(8px);} to{opacity:1;transform:translateY(0);} }
        .chapter-card { animation: fadeIn 0.4s ease both; }
        .chapter-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(24,59,75,0.10); }
        .chapter-card { transition: all 0.2s ease; }
        .rec-card:hover { transform: translateY(-2px); }
        .rec-card { transition: transform 0.18s ease; }
      `}</style>

      {/* ── Hero / 总览 ────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #183b4b 0%, #1d6f78 65%, #2b9aa5 100%)',
        borderRadius: 16,
        padding: '24px 28px',
        marginBottom: 20,
        color: '#fff',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* 装饰圆点 */}
        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
        <div style={{ position: 'absolute', bottom: -60, right: 80, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, position: 'relative' }}>
          {/* 左侧：欢迎语 + KPI */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <GraduationCap size={20} strokeWidth={1.8} />
              <p style={{ margin: 0, fontSize: 13, opacity: 0.78, letterSpacing: '0.04em' }}>课程学习</p>
            </div>
            <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>
              你好，{user.displayName}
            </h1>
            <p style={{ margin: '0 0 20px', fontSize: 13, opacity: 0.78 }}>
              {user.eduLevel === 'undergraduate' ? '本科' : '专科'}
              {user.major && ` · ${user.major}`}
              {user.className && ` · ${user.className}`}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, maxWidth: 600 }}>
              {[
                { label: '已完成章节', value: summary.completedChapters, total: summary.totalChapters, suffix: '章', icon: CheckCircle2 },
                { label: '课件进度', value: coursewarePct, suffix: '%', icon: BookMarked },
                { label: '知识掌握', value: knowledgePct, suffix: '%', icon: Target },
                { label: '累计课时分', value: courseCreditEarned, total: courseCreditTotal, suffix: '分', icon: Trophy },
              ].map(({ label, value, total, suffix, icon: Icon }) => (
                <div key={label} style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.7, marginBottom: 6 }}>
                    <Icon size={11} />
                    <span style={{ fontSize: 11 }}>{label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em' }}>{value}</span>
                    {total !== undefined && <span style={{ fontSize: 11, opacity: 0.6 }}>/{total}</span>}
                    <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 2 }}>{suffix}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 右侧：双环形进度 */}
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexShrink: 0 }}>
            <DonutProgress pct={progressPct} label="章节完成" size={108} thick={9} accent="#fff" track="rgba(255,255,255,0.15)" />
            <DonutProgress pct={coursewarePct} label="课件进度" size={108} thick={9} accent="#ffd76b" track="rgba(255,255,255,0.15)" />
            <DonutProgress pct={knowledgePct} label="知识掌握" size={108} thick={9} accent="#b7f3d0" track="rgba(255,255,255,0.15)" />
          </div>
        </div>
      </div>

      {/* ── 个性化推荐 ─────────────────────────────────────────────── */}
      {recommendations.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Sparkles size={15} color="#d97706" />
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#183b4b' }}>个性化推荐</h2>
            <span style={{ fontSize: 11, color: '#9aacb6' }}>基于你的能力前测结果</span>
          </div>
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
            {recommendations.map(r => (
              <Link
                key={r.trainingId}
                href={`/course/${r.trainingId}`}
                className="rec-card"
                style={{
                  flex: '0 0 320px',
                  background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                  border: '1px solid #fde68a',
                  borderRadius: 12, padding: '14px 16px',
                  textDecoration: 'none',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <span style={{ fontSize: 10, color: '#92400e', background: '#fef3c7', padding: '2px 8px', borderRadius: 20, fontWeight: 600, border: '1px solid #fcd34d' }}>
                    重点强化
                  </span>
                  <span style={{ fontSize: 11, color: '#92400e', fontWeight: 700 }}>{r.trainingId}</span>
                </div>
                <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: '#1c3140' }}>{r.displayName}</p>
                <p style={{ margin: 0, fontSize: 11, color: '#78350f', lineHeight: 1.6, opacity: 0.85 }}>{r.reason}</p>
                <ArrowRight size={14} color="#b45309" style={{ position: 'absolute', right: 14, bottom: 14 }} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── 主内容：章节网格 + 侧栏 ──────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: 20 }}>

        {/* ── 章节网格 ────────────────────────────────────────── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BookMarked size={15} color="#1d6f78" />
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#183b4b' }}>课程目录</h2>
              <span style={{ fontSize: 11, color: '#9aacb6' }}>共 {chapters.length} 章</span>
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 11 }}>
              <StatusLegend color="#16a34a" label="已完成" />
              <StatusLegend color="#d97706" label="学习中" />
              <StatusLegend color="#94a3b8" label="未开始" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {chapters.map((c, idx) => (
              <ChapterCard key={c.trainingId} chapter={c} delay={idx * 30} />
            ))}
          </div>
        </div>

        {/* ── 侧栏：班级排行榜 ──────────────────────────────────── */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <LeaderboardCard data={lb} />
        </aside>
      </div>
    </div>
  )
}

// ── 子组件 ──────────────────────────────────────────────────────────────────

function DonutProgress({
  pct, label, size = 100, thick = 8, accent = '#1d6f78', track = '#eef2f5',
}: { pct: number; label: string; size?: number; thick?: number; accent?: string; track?: string }) {
  const r = (size - thick) / 2
  const c = 2 * Math.PI * r
  const dash = c * Math.min(Math.max(pct, 0), 100) / 100
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={thick} fill="none" />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            stroke={accent} strokeWidth={thick} fill="none"
            strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.8s ease' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em' }}>{pct}<span style={{ fontSize: 12, opacity: 0.7 }}>%</span></span>
        </div>
      </div>
      <span style={{ fontSize: 11, opacity: 0.8 }}>{label}</span>
    </div>
  )
}

function StatusLegend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#6b8a98' }}>
      <span style={{ width: 7, height: 7, borderRadius: 2, background: color }} />
      {label}
    </span>
  )
}

function ChapterCard({ chapter, delay }: { chapter: Chapter; delay: number }) {
  const c = chapter
  const earnedCredit = c.earnedCredits ?? c.earnedHours
  const statusConfig = {
    completed:   { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', label: '已完成', icon: CheckCircle2 },
    in_progress: { color: '#d97706', bg: '#fffbeb', border: '#fde68a', label: '学习中', icon: PlayCircle },
    untouched:   { color: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0', label: '未开始', icon: PlayCircle },
    locked:      { color: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0', label: '未解锁', icon: Lock },
  }[c.status]
  const StatusIcon = statusConfig.icon

  return (
    <Link
      href={`/course/${c.trainingId}`}
      className="chapter-card"
      style={{
        display: 'block', textDecoration: 'none',
        background: '#fff', borderRadius: 12, padding: '16px 18px',
        border: '1px solid #eaeff2',
        animationDelay: `${delay}ms`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 左侧状态条 */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        background: statusConfig.color,
      }} />

      {/* 头部 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 24, fontWeight: 900, color: statusConfig.color,
            lineHeight: 1, letterSpacing: '-0.04em',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {c.trainingId.slice(1)}
          </span>
          <div>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#1c3140', letterSpacing: '-0.005em' }}>
              {c.displayName}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#7a96a4' }}>
              {c.totalKps} 知识点 · {c.hours} 学时
            </p>
          </div>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          fontSize: 10, padding: '2px 7px', borderRadius: 20,
          background: statusConfig.bg,
          color: statusConfig.color, fontWeight: 600,
          border: `1px solid ${statusConfig.border}`,
        }}>
          <StatusIcon size={10} />{statusConfig.label}
        </span>
      </div>

      {/* 掌握度条 + 数字 */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: '#7a96a4' }}>掌握度</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1c3140' }}>{c.masteryPct}%</span>
        </div>
        <div style={{ height: 5, background: '#eef2f5', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${c.masteryPct}%`,
            background: `linear-gradient(90deg, ${statusConfig.color}, ${statusConfig.color}cc)`,
            borderRadius: 3, transition: 'width 0.4s ease',
          }} />
        </div>
      </div>

      {(c.pptResourceCount > 0 || c.videoResourceCount > 0) && (
        <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, background: '#f6fafb', border: '1px solid #edf3f6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 5, fontSize: 10.5, color: '#6b8a98', fontWeight: 700 }}>
            <span>课件进度 {c.coursewareProgressPct}%</span>
            <span>PPT {c.pptProgressPct}% · 视频 {c.videoProgressPct}%</span>
          </div>
          <div style={{ height: 4, background: '#e8f1f3', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${c.coursewareProgressPct}%`, background: '#1d6f78', borderRadius: 999 }} />
          </div>
        </div>
      )}

      {/* 4 类知识点小格 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 10 }}>
        {[
          { count: c.mastered, color: '#16a34a', label: '掌握' },
          { count: c.learning, color: '#d97706', label: '学习' },
          { count: c.weak,     color: '#dc2626', label: '薄弱' },
          { count: c.untested, color: '#94a3b8', label: '未测' },
        ].map(({ count, color, label }) => (
          <div key={label} style={{ textAlign: 'center', padding: '5px 0', borderRadius: 6, background: '#fafbfc' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color, lineHeight: 1 }}>{count}</div>
            <div style={{ fontSize: 9, color: '#9aacb6', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* 底部：测验成绩 / 学习时长 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingTop: 10, borderTop: '1px solid #f0f4f6',
      }}>
        <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#7a96a4' }}>
          {c.latestScore !== null && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <Target size={11} />
              <span style={{ color: c.latestScore >= 60 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{c.latestScore}</span>分
            </span>
          )}
          {c.studyMinutes > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <Clock size={11} />{c.studyMinutes}分钟
            </span>
          )}
          {earnedCredit !== null && earnedCredit !== undefined && earnedCredit > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#1d6f78', fontWeight: 600 }}>
              <Trophy size={11} />+{earnedCredit}
            </span>
          )}
        </div>
        <ArrowRight size={13} color="#7a96a4" />
      </div>
    </Link>
  )
}

function LeaderboardCard({ data }: { data: LeaderboardData | null }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eaeff2', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #f0f4f6' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Crown size={14} color="#d97706" />
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1c3140' }}>{data?.scope ?? '班级'}排行榜</h3>
          </div>
          {data && data.myRank > 0 && (
            <span style={{ fontSize: 10, color: '#7a96a4' }}>
              我的排名 <strong style={{ color: '#1d6f78' }}>{data.myRank}</strong>/{data.total}
            </span>
          )}
        </div>
        {data?.className && (
          <p style={{ margin: '4px 0 0', fontSize: 10, color: '#9aacb6' }}>{data.className}</p>
        )}
      </div>

      {!data || data.list.length === 0 ? (
        <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 11, color: '#9aacb6' }}>
          <Users size={20} color="#cdd8df" style={{ marginBottom: 6 }} />
          <p style={{ margin: 0 }}>暂无同学数据</p>
        </div>
      ) : (
        <div>
          {data.list.slice(0, 10).map((u, i) => {
            const rankColor = i === 0 ? '#d97706' : i === 1 ? '#94a3b8' : i === 2 ? '#a16207' : '#cdd8df'
            const earnedCredit = u.totalEarnedCredits ?? u.totalEarnedHours
            return (
              <div key={u.userId} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 16px',
                background: u.isMe ? 'rgba(29,111,120,0.05)' : 'transparent',
                borderLeft: u.isMe ? '2px solid #1d6f78' : '2px solid transparent',
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: i < 3 ? rankColor : '#f0f4f6',
                  color: i < 3 ? '#fff' : '#7a96a4',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #215566, #35818a)',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                }}>
                  {u.avatar}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: u.isMe ? 700 : 500, color: '#1c3140', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.displayName}{u.isMe && <span style={{ marginLeft: 4, fontSize: 9, color: '#1d6f78' }}>· 我</span>}
                  </p>
                  <p style={{ margin: 0, fontSize: 10, color: '#9aacb6' }}>
                    {u.completedChapters} 章 · {u.studyMinutes}分
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#1d6f78', fontVariantNumeric: 'tabular-nums' }}>
                    {earnedCredit}
                  </p>
                  <p style={{ margin: 0, fontSize: 9, color: '#9aacb6' }}>课时分</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function LoadingState({ progress }: { progress: AssetEnsureProgress | null }) {
  const total = progress?.total ?? COURSE_ASSET_TRAINING_IDS.length
  const current = progress?.current ?? 0
  const pct = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <div style={{ padding: 60, textAlign: 'center', color: '#7a96a4' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ width: 32, height: 32, border: '3px solid #eef2f5', borderTopColor: '#1d6f78', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 1s linear infinite' }} />
      <p style={{ margin: 0, fontSize: 13 }}>{progress?.message || '加载课程数据中...'}</p>
      <div style={{ width: 'min(360px, 82vw)', margin: '14px auto 0', display: 'grid', gap: 7 }}>
        <div style={{ height: 8, borderRadius: 999, background: '#e8eef2', overflow: 'hidden' }}>
          <span style={{ display: 'block', width: `${Math.max(6, pct)}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#1d6f78,#409eff)', transition: 'width 0.25s ease' }} />
        </div>
        <small style={{ color: '#8aa0aa', fontSize: 12 }}>
          {progress?.trainingId ? `${progress.trainingId} · ` : ''}{current}/{total} · {pct}%
        </small>
      </div>
    </div>
  )
}
