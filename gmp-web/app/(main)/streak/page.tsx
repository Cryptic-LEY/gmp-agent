'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarCheck2, Flame, Sparkles, Trophy } from 'lucide-react'

interface StreakData { checkedDates: string[]; streakDays: number; maxStreak: number; totalDays: number }

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const MONTHS   = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']

const PANEL: React.CSSProperties = {
  background: 'rgba(255,255,255,0.88)',
  border: '1px solid rgba(31,71,92,0.12)',
  borderRadius: 20,
  boxShadow: '0 18px 44px rgba(29,53,74,0.09)',
  backdropFilter: 'blur(18px)',
}

function buildGrid() {
  const today = new Date()
  const start = new Date(today)
  start.setDate(start.getDate() - (15 * 7 + today.getDay()))
  const days: string[] = []
  const cur = new Date(start)
  while (cur <= today) { days.push(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1) }
  return days
}

function getMonthLabels(days: string[]) {
  const labels: { label: string; colIndex: number }[] = []
  let lastMonth = -1
  days.forEach((d, i) => {
    const month = new Date(d).getMonth()
    const col   = Math.floor(i / 7)
    if (month !== lastMonth) { labels.push({ label: MONTHS[month], colIndex: col }); lastMonth = month }
  })
  return labels
}

function getEncourageText(streakDays: number) {
  if (streakDays === 0) return '今天还没打卡，完成一次学习就能点亮今日进度。'
  if (streakDays >= 14) return '稳定学习节奏已经形成，继续保持 GMP 合规训练。'
  if (streakDays >= 7) return '已连续坚持一周以上，知识积累正在变成习惯。'
  if (streakDays >= 3) return '连续学习状态不错，再坚持几天冲刺周目标。'
  return '好的开始，继续加油。'
}

export default function StreakPage() {
  const router = useRouter()
  const [data, setData]             = useState<StreakData | null>(null)
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { router.push('/login'); return }
    fetch('/api/streak', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then((d: StreakData) => { setData(d); setLoading(false) })
  }, [router])

  const days       = buildGrid()
  const checkedSet = new Set(data?.checkedDates ?? [])
  const today      = new Date().toISOString().slice(0, 10)
  const cols: string[][] = []
  for (let i = 0; i < days.length; i += 7) cols.push(days.slice(i, i + 7))
  const monthLabels = getMonthLabels(days)
  const streakDays = data?.streakDays ?? 0
  const maxStreak = data?.maxStreak ?? 0
  const totalDays = data?.totalDays ?? 0
  const weekChecked = days.slice(-7).filter(date => checkedSet.has(date)).length

  function cellColor(date: string) {
    if (date > today) return 'rgba(31,71,92,0.06)'
    if (checkedSet.has(date)) return date === today ? '#1d6f78' : '#35818a'
    if (date === today) return 'rgba(200,129,43,0.3)'
    return 'rgba(31,71,92,0.09)'
  }

  return (
    <div style={{ padding: 20, minHeight: '100vh' }}>
      <section style={{ position: 'relative', overflow: 'hidden', borderRadius: 24, padding: 24, marginBottom: 16, background: 'linear-gradient(135deg, rgba(29,111,120,0.96), rgba(53,129,138,0.86) 48%, rgba(200,129,43,0.82))', boxShadow: '0 24px 60px rgba(29,53,74,0.16)' }}>
        <div style={{ position: 'absolute', right: -48, top: -62, width: 210, height: 210, borderRadius: '50%', background: 'rgba(255,255,255,0.14)' }} />
        <div style={{ position: 'absolute', left: '42%', bottom: -74, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.09)' }} />
        <div style={{ position: 'relative', display: 'flex', gap: 20, alignItems: 'stretch', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 420px', minWidth: 0 }}>
            <p style={{ color: 'rgba(255,255,255,0.78)', fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', margin: 0 }}>学习中心</p>
            <h1 style={{ color: '#fff', fontSize: 34, fontWeight: 900, margin: '8px 0 0', fontFamily: "'Trebuchet MS','Microsoft YaHei',sans-serif" }}>连续打卡</h1>
            <p style={{ color: 'rgba(255,255,255,0.84)', fontSize: 14, lineHeight: 1.8, margin: '10px 0 0', maxWidth: 520 }}>
              每天登录自动点亮学习足迹，用稳定节奏积累 GMP 法规、质量管理与实训能力。
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
              {[
                { icon: Flame, label: '当前连续', value: loading ? '—' : `${streakDays} 天`, color: '#fff' },
                { icon: Trophy, label: '历史最长', value: loading ? '—' : `${maxStreak} 天`, color: '#fff6d8' },
                { icon: CalendarCheck2, label: '累计打卡', value: loading ? '—' : `${totalDays} 天`, color: '#dff9f2' },
              ].map(item => (
                <div key={item.label} style={{ minWidth: 128, padding: '12px 14px', borderRadius: 16, background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(12px)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: 800 }}>
                    <item.icon size={14} color={item.color} />
                    {item.label}
                  </div>
                  <strong style={{ display: 'block', color: '#fff', fontSize: 24, marginTop: 7 }}>{item.value}</strong>
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding: 18, borderRadius: 22, background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(255,255,255,0.46)', boxShadow: '0 20px 50px rgba(12,32,45,0.15)' }}>
            <div style={{ width: 72, height: 72, borderRadius: 22, display: 'grid', placeItems: 'center', background: streakDays >= 3 ? 'rgba(200,129,43,0.14)' : 'rgba(29,111,120,0.1)', marginBottom: 12 }}>
              {streakDays >= 3 ? <Flame size={34} color="#c8812b" /> : <Sparkles size={34} color="#1d6f78" />}
            </div>
            <p style={{ color: '#6b8a98', fontSize: 12, fontWeight: 800, margin: 0 }}>今日学习状态</p>
            <strong style={{ display: 'block', color: '#183b4b', fontSize: 32, lineHeight: 1.1, marginTop: 6 }}>{loading ? '—' : `${streakDays} 天`}</strong>
            <p style={{ color: '#46606f', fontSize: 13, lineHeight: 1.7, margin: '9px 0 0' }}>{loading ? '正在读取打卡数据...' : getEncourageText(streakDays)}</p>
          </div>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
        {[
          { label: '本周已点亮', value: loading ? '—' : `${weekChecked}/7`, desc: '保持周学习频率' },
          { label: '当前目标', value: loading ? '—' : streakDays >= 7 ? '进阶保持' : '连续 7 天', desc: streakDays >= 7 ? '挑战更长周期' : `还差 ${Math.max(7 - streakDays, 0)} 天` },
          { label: '学习徽章', value: loading ? '—' : streakDays >= 14 ? '稳态学习者' : streakDays >= 7 ? '一周坚持' : streakDays >= 3 ? '连续起步' : '待点亮', desc: '由连续天数自动更新' },
        ].map(item => (
          <div key={item.label} style={{ ...PANEL, padding: 16, display: 'grid', gap: 6 }}>
            <span style={{ color: '#6b8a98', fontSize: 12 }}>{item.label}</span>
            <strong style={{ color: '#183b4b', fontSize: 24 }}>{item.value}</strong>
            <span style={{ color: '#8aa0aa', fontSize: 12 }}>{item.desc}</span>
          </div>
        ))}
      </section>

      <div style={{ ...PANEL, padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
          <div>
            <p style={{ color: '#183b4b', fontSize: 16, fontWeight: 800, margin: 0 }}>过去 16 周活动</p>
            <p style={{ color: '#6b8a98', fontSize: 12, margin: '4px 0 0' }}>颜色越深代表当天已完成学习打卡。</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: '#6b8a98', fontSize: 11 }}>少</span>
            {['rgba(31,71,92,0.09)', 'rgba(29,111,120,0.2)', '#35818a', '#1d6f78'].map(c => (
              <div key={c} style={{ width: 12, height: 12, borderRadius: 3, background: c }} />
            ))}
            <span style={{ color: '#6b8a98', fontSize: 11 }}>多</span>
          </div>
        </div>

        {/* Month labels */}
        <div style={{ paddingLeft: 28, marginBottom: 4 }}>
          <div style={{ display: 'flex', gap: 3 }}>
            {cols.map((_, colIdx) => {
              const lbl = monthLabels.find(m => m.colIndex === colIdx)
              return <div key={colIdx} style={{ width: 13, fontSize: 10, color: '#6b8a98', overflow: 'visible', whiteSpace: 'nowrap' }}>{lbl?.label ?? ''}</div>
            })}
          </div>
        </div>

        {/* Grid */}
        <div style={{ display: 'flex', gap: 3 }}>
          {/* Weekday labels */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginRight: 4 }}>
            {WEEKDAYS.map((d, i) => (
              <div key={d} style={{ width: 18, height: 13, fontSize: 10, color: '#6b8a98', textAlign: 'right', lineHeight: '13px' }}>{i % 2 === 1 ? d : ''}</div>
            ))}
          </div>
          {/* Cells */}
          {cols.map((week, ci) => (
            <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {week.map(date => (
                <div key={date}
                  onMouseEnter={() => setHoveredDate(date)}
                  onMouseLeave={() => setHoveredDate(null)}
                  title={`${date}${checkedSet.has(date) ? ' · 已打卡' : ''}`}
                  style={{ width: 13, height: 13, borderRadius: 3, background: cellColor(date), cursor: 'default', transition: 'transform 0.1s', transform: hoveredDate === date ? 'scale(1.3)' : 'scale(1)' }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Hover hint */}
        <div style={{ height: 20, marginTop: 12, textAlign: 'center' }}>
          {hoveredDate && (
            <span style={{ fontSize: 11, color: '#6b8a98' }}>
              {hoveredDate}
              {checkedSet.has(hoveredDate) ? <span style={{ color: '#2f7e58', marginLeft: 6 }}>· 已打卡 ✓</span>
                : hoveredDate === today ? <span style={{ color: '#c8812b', marginLeft: 6 }}>· 今天</span>
                : hoveredDate > today   ? <span style={{ color: '#b0b9c2', marginLeft: 6 }}>· 未来</span>
                : <span style={{ color: '#b0b9c2', marginLeft: 6 }}>· 未打卡</span>}
            </span>
          )}
        </div>
      </div>

      <p style={{ textAlign: 'center', fontSize: 11, color: '#6b8a98', opacity: 0.78, marginTop: 16 }}>每天登录即视为打卡，坚持学习 GMP，成为合规专家。</p>
    </div>
  )
}
