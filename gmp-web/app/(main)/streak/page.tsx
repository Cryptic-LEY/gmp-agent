'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

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

  function cellColor(date: string) {
    if (date > today) return 'rgba(31,71,92,0.06)'
    if (checkedSet.has(date)) return date === today ? '#1d6f78' : '#35818a'
    if (date === today) return 'rgba(200,129,43,0.3)'
    return 'rgba(31,71,92,0.09)'
  }

  return (
    <div style={{ padding: 20, minHeight: '100vh' }}>

      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ color: '#1d6f78', fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', margin: 0 }}>学习中心</p>
        <h1 style={{ color: '#183b4b', fontSize: 26, fontWeight: 700, margin: '4px 0 0', fontFamily: "'Trebuchet MS','Microsoft YaHei',sans-serif" }}>连续打卡</h1>
      </div>

      {/* Hero stat */}
      <div style={{ ...PANEL, padding: '28px 32px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: 'rgba(200,129,43,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0 }}>
          {!loading && (data?.streakDays ?? 0) >= 3 ? '🔥' : '📘'}
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ color: '#183b4b', fontSize: 36, fontWeight: 700, margin: 0, fontFamily: "'Trebuchet MS','Microsoft YaHei',sans-serif", lineHeight: 1 }}>
            {loading ? '—' : `${data?.streakDays ?? 0} 天`}
          </p>
          <p style={{ color: '#6b8a98', fontSize: 14, margin: '6px 0 0' }}>
            {loading ? '' : data?.streakDays === 0 ? '今天还没打卡，快来开始吧！' : data!.streakDays >= 7 ? '坚持就是胜利，继续保持！' : '好的开始，继续加油！'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          {[
            { label: '历史最长', value: data?.maxStreak ?? 0, unit: '天' },
            { label: '累计打卡', value: data?.totalDays ?? 0, unit: '天' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center', padding: '10px 20px', background: 'rgba(29,111,120,0.06)', borderRadius: 14, border: '1px solid rgba(29,111,120,0.1)' }}>
              <p style={{ color: '#183b4b', fontSize: 24, fontWeight: 700, margin: 0, fontFamily: "'Trebuchet MS','Microsoft YaHei',sans-serif" }}>{loading ? '—' : s.value}</p>
              <p style={{ color: '#6b8a98', fontSize: 11, margin: '3px 0 0' }}>{s.unit} · {s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Heatmap */}
      <div style={{ ...PANEL, padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <p style={{ color: '#183b4b', fontSize: 14, fontWeight: 600, margin: 0 }}>过去 16 周活动</p>
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

      <p style={{ textAlign: 'center', fontSize: 11, color: '#6b8a98', opacity: 0.7, marginTop: 16 }}>每天登录即视为打卡，坚持学习 GMP，成为合规专家 💊</p>
    </div>
  )
}
