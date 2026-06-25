'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Network, BookOpen, TrendingUp, AlertCircle, HelpCircle } from 'lucide-react'

const GraphPanel = dynamic(() => import('../dashboard/GraphPanel'), { ssr: false })

interface MasteryStats {
  masteryMap: Record<string, { confidence: number; attempt_count: number; correct_count: number }>
  total: number
}

export default function ProgressPage() {
  const router = useRouter()
  const [token, setToken]         = useState('')
  const [stats, setStats]         = useState<{ mastered: number; learning: number; weak: number; untested: number; total: number } | null>(null)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    const tok = localStorage.getItem('token')
    if (!tok) { router.push('/login'); return }
    setToken(tok)

    fetch('/api/user/mastery', { headers: { Authorization: `Bearer ${tok}` } })
      .then(r => r.ok ? r.json() : null)
      .then((data: MasteryStats | null) => {
        if (!data) return
        let mastered = 0, learning = 0, weak = 0
        for (const m of Object.values(data.masteryMap)) {
          if (m.attempt_count === 0) continue
          if (m.confidence >= 0.8)       mastered++
          else if (m.confidence >= 0.5)  learning++
          else                           weak++
        }
        const tested  = mastered + learning + weak
        const untested = 469 - tested   // 总 KP 数
        setStats({ mastered, learning, weak, untested, total: 469 })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [router])

  const STAT_CARDS = stats ? [
    { label: '已掌握', value: stats.mastered, color: '#2f7e58', bg: 'rgba(47,126,88,0.08)',  border: 'rgba(47,126,88,0.2)',  icon: BookOpen,      desc: '正确率 ≥ 80%' },
    { label: '学习中', value: stats.learning, color: '#d97706', bg: 'rgba(217,119,6,0.08)',  border: 'rgba(217,119,6,0.22)', icon: TrendingUp,    desc: '正确率 50–79%' },
    { label: '需加强', value: stats.weak,     color: '#bc5b57', bg: 'rgba(188,91,87,0.07)',  border: 'rgba(188,91,87,0.2)',  icon: AlertCircle,   desc: '正确率 < 50%' },
    { label: '未学习', value: stats.untested, color: '#9ba8b0', bg: 'rgba(155,168,176,0.07)', border: 'rgba(155,168,176,0.2)', icon: HelpCircle,  desc: '尚未答题' },
  ] : []

  return (
    <div style={{ padding: '24px 28px', minHeight: 'calc(100vh - 86px)' }}>

      {/* 页头 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg,#2f7e58,#4a9e6b)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Network size={18} color="#fff" strokeWidth={2} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#183b4b' }}>我的进度</h1>
          <p style={{ margin: 0, fontSize: 13, color: '#6b8a98' }}>基于答题记录的知识点掌握度可视化</p>
        </div>
      </div>

      {/* 统计卡片行 */}
      {!loading && stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 20 }}>
          {STAT_CARDS.map(({ label, value, color, bg, border, icon: Icon, desc }) => (
            <div key={label} style={{
              background: bg, border: `1px solid ${border}`,
              borderRadius: 12, padding: '14px 18px',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={17} color={color} strokeWidth={2} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  <span style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
                  <span style={{ fontSize: 12, color: '#9ba8b0' }}>/ {stats.total}</span>
                </div>
                <p style={{ margin: '3px 0 0', fontSize: 12, fontWeight: 600, color }}>{label}</p>
                <p style={{ margin: 0, fontSize: 11, color: '#9ba8b0' }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 进度条 */}
      {!loading && stats && (
        <div style={{
          background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(31,71,92,0.1)',
          borderRadius: 12, padding: '14px 20px', marginBottom: 20,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#183b4b' }}>整体进度</span>
            <span style={{ fontSize: 12, color: '#6b8a98' }}>
              已测试 {stats.mastered + stats.learning + stats.weak} / {stats.total} 个知识点
            </span>
          </div>
          <div style={{ height: 10, borderRadius: 999, background: 'rgba(155,168,176,0.15)', overflow: 'hidden', display: 'flex' }}>
            {[
              { value: stats.mastered, color: '#2f7e58' },
              { value: stats.learning, color: '#d97706' },
              { value: stats.weak,     color: '#bc5b57' },
            ].map(({ value, color }) => (
              <div key={color} style={{
                width: `${(value / stats.total) * 100}%`,
                background: color, transition: 'width 0.6s ease',
              }} />
            ))}
          </div>
        </div>
      )}

      {/* 知识图谱 */}
      <div style={{
        background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(31,71,92,0.1)',
        borderRadius: 14, overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(31,71,92,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Network size={14} color="#2f7e58" />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#183b4b' }}>知识点掌握图谱</span>
          <span style={{ fontSize: 12, color: '#9ba8b0', marginLeft: 4 }}>拖动节点 · 滚轮缩放 · 悬停查看详情</span>
        </div>
        <div style={{ height: 580, padding: 8 }}>
          {token && <GraphPanel key="mastery" type="mastery" token={token} />}
        </div>
      </div>

      <p style={{ textAlign: 'center', fontSize: 11, color: '#9ba8b0', marginTop: 14, opacity: 0.7 }}>
        每次完成前测或实训仿真后，掌握度自动更新 · 绿色节点越多说明学习越扎实 💪
      </p>
    </div>
  )
}
