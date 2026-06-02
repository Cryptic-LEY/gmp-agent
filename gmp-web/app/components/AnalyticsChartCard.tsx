'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

export interface AnalyticsDatum {
  label: string
  value: number
}

export interface AnalyticsSeries {
  name: string
  values: number[]
  color: string
}

type DistributionVariant = 'donut' | 'bar'
type ChartOption = Record<string, unknown>

const PALETTE = ['#1d6f78', '#409eff', '#16a34a', '#c8812b', '#7c3aed', '#dc5d48', '#0f9f9a', '#64748b']

const CARD_STYLE: CSSProperties = {
  background: 'rgba(255,255,255,0.9)',
  border: '1px solid rgba(30,77,88,0.1)',
  borderRadius: 12,
  boxShadow: '0 18px 44px rgba(29,53,74,0.08)',
  backdropFilter: 'blur(16px)',
  padding: 16,
  minWidth: 0,
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function compactLabel(value: string) {
  return value.length > 10 ? `${value.slice(0, 10)}...` : value
}

function numberLabel(value: number, suffix: string) {
  return `${value.toLocaleString('zh-CN')}${suffix}`
}

function ChartCanvas({
  option,
  empty,
  ariaLabel,
  height,
}: {
  option: ChartOption
  empty: boolean
  ariaLabel: string
  height: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(!empty)
  const [error, setError] = useState('')

  useEffect(() => {
    if (empty) {
      setLoading(false)
      setError('')
      return
    }

    let disposed = false
    let chart: { resize: () => void; dispose: () => void } | null = null
    let observer: ResizeObserver | null = null

    async function drawChart() {
      setLoading(true)
      setError('')

      try {
        const echarts = await import('echarts')
        if (disposed || !containerRef.current) return

        const instance = echarts.init(containerRef.current, undefined, { renderer: 'canvas' })
        chart = instance
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
        instance.setOption({ ...option, animation: !reduceMotion })
        instance.resize()

        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(() => instance.resize())
          observer.observe(containerRef.current)
        }

        setLoading(false)
      } catch {
        if (!disposed) {
          setLoading(false)
          setError('图表加载失败')
        }
      }
    }

    drawChart()

    return () => {
      disposed = true
      observer?.disconnect()
      chart?.dispose()
    }
  }, [empty, option])

  if (empty) {
    return (
      <div style={{ height, display: 'grid', placeItems: 'center', color: '#8aa0aa', fontSize: 13 }}>
        暂无可视化数据
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', height }}>
      {loading && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'grid', placeItems: 'center', color: '#8aa0aa', fontSize: 13 }}>
          图表加载中...
        </div>
      )}
      {error && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'grid', placeItems: 'center', color: '#dc2626', fontSize: 13 }}>
          {error}
        </div>
      )}
      <div
        ref={containerRef}
        role="img"
        tabIndex={0}
        aria-label={ariaLabel}
        style={{ height: '100%', width: '100%', opacity: loading || error ? 0 : 1, transition: 'opacity 180ms ease-out' }}
      />
    </div>
  )
}

export function DistributionChartCard({
  title,
  subtitle,
  items,
  variant = 'donut',
  valueSuffix = '',
  height = 238,
}: {
  title: string
  subtitle?: string
  items: AnalyticsDatum[]
  variant?: DistributionVariant
  valueSuffix?: string
  height?: number
}) {
  const data = useMemo(() => items.filter(item => item.value > 0), [items])
  const total = data.reduce((sum, item) => sum + item.value, 0)
  const ariaLabel = data.length === 0
    ? `${title}，暂无数据。`
    : `${title}，总计 ${numberLabel(total, valueSuffix)}。${data.map(item => `${item.label} ${numberLabel(item.value, valueSuffix)}`).join('，')}。`

  const option = useMemo<ChartOption>(() => {
    if (variant === 'bar') {
      const reversed = [...data].reverse()

      return {
        color: PALETTE,
        aria: { enabled: true, decal: { show: true } },
        tooltip: {
          trigger: 'item',
          formatter: (item: { name?: string; value?: number }) => (
            `${escapeHtml(item.name ?? '')}<br/><strong>${escapeHtml(numberLabel(Number(item.value ?? 0), valueSuffix))}</strong>`
          ),
        },
        grid: { left: 4, right: 52, top: 8, bottom: 8, containLabel: true },
        xAxis: {
          type: 'value',
          minInterval: 1,
          axisLabel: { color: '#7b929e', fontSize: 11 },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: 'rgba(31,71,92,0.08)' } },
        },
        yAxis: {
          type: 'category',
          data: reversed.map(item => item.label),
          axisLabel: { color: '#46606f', fontSize: 11, formatter: compactLabel },
          axisLine: { show: false },
          axisTick: { show: false },
        },
        series: [{
          name: title,
          type: 'bar',
          barMaxWidth: 18,
          data: reversed.map((item, index) => ({
            value: item.value,
            itemStyle: { color: PALETTE[(reversed.length - index - 1) % PALETTE.length], borderRadius: [0, 5, 5, 0] },
          })),
          label: {
            show: true,
            position: 'right',
            color: '#46606f',
            fontSize: 11,
            formatter: (item: { value?: number }) => numberLabel(Number(item.value ?? 0), valueSuffix),
          },
        }],
      }
    }

    return {
      color: PALETTE,
      aria: { enabled: true, decal: { show: true } },
      tooltip: {
        trigger: 'item',
        formatter: (item: { name?: string; value?: number; percent?: number }) => (
          `${escapeHtml(item.name ?? '')}<br/><strong>${escapeHtml(numberLabel(Number(item.value ?? 0), valueSuffix))}</strong> (${Number(item.percent ?? 0).toFixed(1)}%)`
        ),
      },
      legend: {
        type: 'scroll',
        bottom: 0,
        left: 'center',
        icon: 'circle',
        itemWidth: 9,
        itemHeight: 9,
        textStyle: { color: '#607986', fontSize: 11 },
        formatter: compactLabel,
      },
      graphic: [{
        type: 'text',
        left: 'center',
        top: '36%',
        style: {
          text: `${total.toLocaleString('zh-CN')}\n总计`,
          textAlign: 'center',
          fill: '#183b4b',
          fontSize: 17,
          fontWeight: 700,
          lineHeight: 23,
        },
      }],
      series: [{
        name: title,
        type: 'pie',
        radius: ['45%', '68%'],
        center: ['50%', '39%'],
        stillShowZeroSum: false,
        itemStyle: { borderColor: '#fff', borderWidth: 3, borderRadius: 5 },
        label: {
          show: data.length <= 5,
          color: '#46606f',
          fontSize: 11,
          formatter: '{d}%',
        },
        labelLine: { length: 8, length2: 5, lineStyle: { color: '#b4c2c8' } },
        data: data.map(item => ({ name: item.label, value: item.value })),
      }],
    }
  }, [data, title, total, valueSuffix, variant])

  return (
    <section style={CARD_STYLE}>
      <strong style={{ display: 'block', color: '#183b4b', fontSize: 14 }}>{title}</strong>
      {subtitle && <span style={{ display: 'block', marginTop: 4, color: '#6b8a98', fontSize: 12 }}>{subtitle}</span>}
      <ChartCanvas option={option} empty={data.length === 0} ariaLabel={ariaLabel} height={height} />
    </section>
  )
}

export function ComparisonChartCard({
  title,
  subtitle,
  labels,
  series,
  valueSuffix = '',
  height = 300,
  maxItems = 8,
}: {
  title: string
  subtitle?: string
  labels: string[]
  series: AnalyticsSeries[]
  valueSuffix?: string
  height?: number
  maxItems?: number
}) {
  const displayedLabels = labels.slice(0, maxItems)
  const displayedSeries = series.map(item => ({ ...item, values: item.values.slice(0, maxItems) }))
  const hasValues = displayedSeries.some(item => item.values.some(value => value > 0))
  const ariaLabel = hasValues
    ? `${title}。${displayedLabels.map((label, index) => `${label}：${displayedSeries.map(item => `${item.name} ${numberLabel(item.values[index] ?? 0, valueSuffix)}`).join('，')}`).join('；')}。`
    : `${title}，暂无数据。`

  const option = useMemo<ChartOption>(() => {
    const reversedLabels = [...displayedLabels].reverse()

    return {
      color: displayedSeries.map(item => item.color),
      aria: { enabled: true, decal: { show: true } },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (items: Array<{ name?: string; marker?: string; seriesName?: string; value?: number }>) => {
          const first = items[0]
          const rows = items.map(item => `${item.marker ?? ''}${escapeHtml(item.seriesName ?? '')}：<strong>${escapeHtml(numberLabel(Number(item.value ?? 0), valueSuffix))}</strong>`)
          return `${escapeHtml(first?.name ?? '')}<br/>${rows.join('<br/>')}`
        },
      },
      legend: {
        top: 0,
        right: 0,
        icon: 'roundRect',
        itemWidth: 11,
        itemHeight: 7,
        textStyle: { color: '#607986', fontSize: 11 },
      },
      grid: { left: 4, right: 26, top: 42, bottom: 8, containLabel: true },
      xAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: { color: '#7b929e', fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: 'rgba(31,71,92,0.08)' } },
      },
      yAxis: {
        type: 'category',
        data: reversedLabels,
        axisLabel: { color: '#46606f', fontSize: 11, formatter: compactLabel },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: displayedSeries.map(item => ({
        name: item.name,
        type: 'bar',
        stack: 'coverage',
        barMaxWidth: 22,
        itemStyle: { color: item.color, borderRadius: item.name === displayedSeries.at(-1)?.name ? [0, 4, 4, 0] : 0 },
        data: [...item.values].reverse(),
      })),
    }
  }, [displayedLabels, displayedSeries, valueSuffix])

  return (
    <section style={CARD_STYLE}>
      <strong style={{ display: 'block', color: '#183b4b', fontSize: 14 }}>{title}</strong>
      {subtitle && <span style={{ display: 'block', marginTop: 4, color: '#6b8a98', fontSize: 12 }}>{subtitle}</span>}
      <ChartCanvas option={option} empty={!hasValues} ariaLabel={ariaLabel} height={height} />
    </section>
  )
}
