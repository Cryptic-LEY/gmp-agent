'use client'

import { useEffect, useRef, useState } from 'react'

interface GraphNode {
  id: string
  name: string
  category: number
  project: string
  task: string
  difficulty: number
  symbolSize: number
}

interface GraphEdge {
  source: string
  target: string
}

interface GraphCategory {
  name: string
}

interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  categories: GraphCategory[]
}

interface MasteryEntry {
  confidence: number
  attempt_count: number
  correct_count: number
}

// 课程图谱调色盘（按项目/能力分类）
const PALETTE = [
  '#1d6f78','#2e8b93','#3da8b2','#4fc3cd','#62d9e3',
  '#215566','#306b7e','#3f8296','#4e99ae','#5db0c6',
  '#7c4dab','#9c6dc5','#bc8de0','#6b3fa0','#8a5cc0',
  '#d4845a','#e8a07a','#f0bd9a','#c96840','#b04a20',
  '#4a9e6b','#6ab98a','#8ad4a9','#2a8050','#1a6038',
]

// 掌握度四档颜色
const MASTERY_COLORS = {
  mastered: '#2f7e58',   // ≥80%  绿：掌握
  learning: '#d97706',   // 50-79% 橙：学习中
  weak:     '#bc5b57',   // 1-49%  红：薄弱
  untested: '#b0bec5',   // 0% / 未学  灰：未学
}

function masteryColor(m: MasteryEntry | undefined): string {
  if (!m || m.attempt_count === 0) return MASTERY_COLORS.untested
  const confidence = normalizeConfidence(m.confidence)
  if (confidence >= 0.8)  return MASTERY_COLORS.mastered
  if (confidence >= 0.5)  return MASTERY_COLORS.learning
  return MASTERY_COLORS.weak
}

function masteryLabel(m: MasteryEntry | undefined): string {
  if (!m || m.attempt_count === 0) return '未学'
  const confidence = normalizeConfidence(m.confidence)
  if (confidence >= 0.8)  return `掌握 ${Math.round(confidence * 100)}%`
  if (confidence >= 0.5)  return `学习中 ${Math.round(confidence * 100)}%`
  return `薄弱 ${Math.round(confidence * 100)}%`
}

function normalizeConfidence(value: number | undefined) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, (value ?? 0) > 1 ? (value ?? 0) / 100 : (value ?? 0)))
}

function masteryCategory(m: MasteryEntry | undefined) {
  if (!m || m.attempt_count === 0) return 3
  const confidence = normalizeConfidence(m.confidence)
  if (confidence >= 0.8) return 0
  if (confidence >= 0.5) return 1
  return 2
}

// ── Props ─────────────────────────────────────────────────────────────────────
// type: 'knowledge' | 'ability'  → 普通课程图谱
// type: 'mastery'                → 个人进度叠加（内部仍取 knowledge 数据，但染掌握度色）
export default function GraphPanel({ type, token }: { type: string; token: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<any>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [stats,   setStats]   = useState<{ mastered: number; learning: number; weak: number; untested: number } | null>(null)

  const isMastery = type === 'mastery'

  useEffect(() => {
    if (!containerRef.current) return
    let chart: any = null
    let destroyed  = false

    async function init() {
      setLoading(true)
      setError('')
      setStats(null)

      try {
        // 掌握度模式：同时拉知识图谱 + 个人掌握数据
        const graphType = isMastery ? 'knowledge' : type
        const fetches: Promise<Response>[] = [
          fetch(`/api/graph?type=${graphType}`, { headers: { Authorization: `Bearer ${token}` } }),
        ]
        if (isMastery) {
          fetches.push(fetch('/api/user/mastery', { headers: { Authorization: `Bearer ${token}` } }))
        }

        const [echarts, ...responses] = await Promise.all([
          import('echarts'),
          ...fetches,
        ])

        if (destroyed) return
        for (const r of responses) {
          if (!r.ok) throw new Error('图谱数据加载失败')
        }

        const data: GraphData = await responses[0].json()
        const masteryMap: Record<string, MasteryEntry> = isMastery
          ? (await responses[1].json()).masteryMap
          : {}

        if (destroyed || !containerRef.current) return

        chart = echarts.init(containerRef.current, undefined, { renderer: 'canvas' })
        chartRef.current = chart

        // ── 统计四档数量（仅掌握度模式）──────────────────────────────────────
        if (isMastery) {
          let mastered = 0, learning = 0, weak = 0, untested = 0
          for (const node of data.nodes) {
            const m = masteryMap[node.id]
            const confidence = normalizeConfidence(m?.confidence)
            if (!m || m.attempt_count === 0) untested++
            else if (confidence >= 0.8)      mastered++
            else if (confidence >= 0.5)      learning++
            else                             weak++
          }
          setStats({ mastered, learning, weak, untested })
        }

        // ── 节点染色 ──────────────────────────────────────────────────────────
        const coloredNodes = data.nodes.map(node => {
          if (!isMastery) return node
          const m = masteryMap[node.id]
          return {
            ...node,
            category: masteryCategory(m),
            symbolSize: Math.max(12, node.symbolSize + (m?.attempt_count ? 4 : 0)),
            itemStyle: { color: masteryColor(m), borderColor: 'rgba(255,255,255,0.7)', borderWidth: 1.5 },
          }
        })

        // 掌握度模式：legend 改为四档说明，不再按项目分类
        const masteryCategories = [
          { name: '掌握 (≥80%)', itemStyle: { color: MASTERY_COLORS.mastered } },
          { name: '学习中 (50-79%)', itemStyle: { color: MASTERY_COLORS.learning } },
          { name: '薄弱 (<50%)', itemStyle: { color: MASTERY_COLORS.weak } },
          { name: '未学', itemStyle: { color: MASTERY_COLORS.untested } },
        ]
        const masteryLegendData = isMastery ? masteryCategories.map(category => category.name) : null

        const coloredCategories = isMastery
          ? masteryCategories
          : data.categories.map((c, i) => ({
              name: c.name,
              itemStyle: { color: PALETTE[i % PALETTE.length] },
            }))

        const option = {
          backgroundColor: 'transparent',
          tooltip: {
            trigger: 'item',
            formatter: (params: any) => {
              if (params.dataType !== 'node') return ''
              const m = isMastery ? masteryMap[params.data.id] : undefined
              return `<div style="max-width:260px;font-size:13px;line-height:1.7">
                <b>${params.data.name}</b><br/>
                <span style="color:#888">${params.data.project}</span><br/>
                ${params.data.task ? `<span style="color:#aaa;font-size:12px">${params.data.task}</span><br/>` : ''}
                ${isMastery ? `<span style="color:${masteryColor(m)};font-weight:700">${masteryLabel(m)}</span>${m ? ` · 答题 ${m.attempt_count} 次` : ''}` : ''}
              </div>`
            },
          },
          legend: isMastery
            ? {
                orient: 'vertical',
                right: 10, top: 20,
                data: masteryLegendData,
                selectedMode: false,
                textStyle: { fontSize: 12, color: '#46606f' },
              }
            : {
                orient: 'vertical',
                right: 10, top: 20,
                textStyle: { fontSize: 11, color: '#46606f' },
                data: coloredCategories.map(c => c.name),
                type: 'scroll',
                pageIconSize: 10,
                pageTextStyle: { fontSize: 11 },
              },
          series: [
            {
              type: 'graph',
              layout: 'force',
              data: coloredNodes,
              links: data.edges,
              categories: coloredCategories,
              roam: true,
              draggable: true,
              force: {
                repulsion: (type === 'ability') ? 200 : 80,
                edgeLength: (type === 'ability') ? 120 : 60,
                gravity: 0.08,
                layoutAnimation: true,
              },
              label: {
                show: type === 'ability',
                position: 'bottom',
                fontSize: 11,
                color: '#333',
                formatter: (params: any) => {
                  const n = params.data.name as string
                  return n.length > 10 ? n.slice(0, 10) + '…' : n
                },
              },
              emphasis: {
                focus: 'adjacency',
                label: { show: true, fontSize: 12, fontWeight: 'bold' },
              },
              lineStyle: { color: 'source', opacity: isMastery ? 0.2 : 0.4, width: 1.5, curveness: 0.2 },
              itemStyle: isMastery
                ? { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)' }
                : { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)' },
            },
          ],
        }

        chart.setOption(option)
        chart.resize()
        window.setTimeout(() => chart?.resize(), 80)
        setLoading(false)

        const handleResize = () => chart?.resize()
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
      } catch (e: any) {
        if (!destroyed) setError(e.message || '加载失败')
        setLoading(false)
      }
    }

    const cleanup = init()
    return () => {
      destroyed = true
      cleanup.then(fn => fn?.())
      chart?.dispose()
      chartRef.current = null
    }
  }, [type, token, isMastery])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 480 }}>
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12, color: '#6b8a98',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '3px solid rgba(29,111,120,0.15)',
            borderTopColor: '#1d6f78',
            animation: 'spin 0.8s linear infinite',
          }} />
          <span style={{ fontSize: 13 }}>{isMastery ? '正在加载个人进度…' : '正在加载图谱…'}</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}
      {error && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: '#e05252', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* 掌握度模式：顶部四格统计条 */}
      {isMastery && !loading && !error && stats && (
        <div style={{
          position: 'absolute', top: 8, left: 8, zIndex: 10,
          display: 'flex', gap: 6,
        }}>
          {[
            { label: '掌握',   count: stats.mastered, color: MASTERY_COLORS.mastered },
            { label: '学习中', count: stats.learning, color: MASTERY_COLORS.learning },
            { label: '薄弱',   count: stats.weak,     color: MASTERY_COLORS.weak     },
            { label: '未学',   count: stats.untested, color: MASTERY_COLORS.untested },
          ].map(s => (
            <div key={s.label} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 20,
              background: 'rgba(255,255,255,0.9)',
              border: `1.5px solid ${s.color}44`,
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: s.color, fontWeight: 700 }}>{s.count}</span>
              <span style={{ fontSize: 11, color: '#6b8a98' }}>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 480 }} />
    </div>
  )
}
