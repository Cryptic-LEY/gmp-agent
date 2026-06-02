'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  ChevronRight,
  Clock3,
  Download,
  FlaskConical,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
} from 'lucide-react'
import { buildPersonalizedScheme, compactProjectName, prioritySort, type PersonalizedScheme, type PlanItem } from '@/lib/personalized-plan'

interface PlanData {
  hasplan: boolean
  id?: number
  edu_level?: string
  major?: string
  score?: number
  wrong_count?: number
  plan?: PlanItem[]
  personalized_scheme?: PersonalizedScheme
  created_at?: string
}

const PRIORITY_CONFIG = {
  high: {
    label: '重点强化',
    color: '#b42318',
    bg: '#fff6f4',
    border: '#ffd6cf',
    soft: 'rgba(180,35,24,0.1)',
  },
  medium: {
    label: '建议复习',
    color: '#a15c07',
    bg: '#fff9eb',
    border: '#f9dfa8',
    soft: 'rgba(161,92,7,0.1)',
  },
  low: {
    label: '保持巩固',
    color: '#087443',
    bg: '#f1fbf6',
    border: '#b9ebcf',
    soft: 'rgba(8,116,67,0.1)',
  },
}

const PANEL: CSSProperties = {
  background: 'rgba(255,255,255,0.92)',
  border: '1px solid rgba(31,71,92,0.12)',
  borderRadius: 10,
  boxShadow: '0 10px 28px rgba(29,53,74,0.07)',
}

const GHOST_BUTTON: CSSProperties = {
  minHeight: 38,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  padding: '0 14px',
  color: '#46606f',
  border: '1px solid rgba(31,71,92,0.16)',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.72)',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
}

const PRIMARY_BUTTON: CSSProperties = {
  ...GHOST_BUTTON,
  color: '#fff',
  border: 'none',
  background: '#1d6f78',
  boxShadow: '0 10px 18px rgba(29,111,120,0.18)',
}

function scoreColor(score: number) {
  if (score >= 80) return '#087443'
  if (score >= 60) return '#a15c07'
  return '#b42318'
}

function educationLabel(value?: string) {
  return value === 'undergraduate' ? '本科' : value === 'college' ? '专科' : '未设置'
}

export default function PlanPage() {
  const router = useRouter()
  const [planData, setPlanData] = useState<PlanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
      return
    }

    fetch('/api/onboarding/plan', { headers: { Authorization: `Bearer ${token}` } })
      .then(response => response.json())
      .then((data: PlanData) => setPlanData(data))
      .catch(() => setPlanData({ hasplan: false }))
      .finally(() => setLoading(false))
  }, [router])

  async function handleDownload() {
    setDownloading(true)
    try {
      const token = localStorage.getItem('token')!
      const response = await fetch('/api/onboarding/download-plan', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) return

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'GMP个性化学习方案.docx'
      link.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: 420, display: 'grid', placeItems: 'center', color: '#6b8a98' }}>
        <style>{pageStyles}</style>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <Loader2 className="plan-spin" size={22} color="#1d6f78" />
          正在生成学习方案...
        </div>
      </div>
    )
  }

  if (!planData?.hasplan) {
    return (
      <div style={{ padding: 20 }}>
        <style>{pageStyles}</style>
        <section style={{ ...PANEL, minHeight: 360, display: 'grid', placeItems: 'center', padding: 32, textAlign: 'center' }}>
          <div style={{ maxWidth: 520 }}>
            <div style={{ width: 58, height: 58, display: 'grid', placeItems: 'center', margin: '0 auto 18px', color: '#1d6f78', borderRadius: 14, background: 'rgba(29,111,120,0.1)' }}>
              <Sparkles size={28} />
            </div>
            <h1 style={{ margin: '0 0 10px', color: '#183b4b', fontSize: 24 }}>先完成能力前测</h1>
            <p style={{ margin: '0 0 22px', color: '#6b8a98', fontSize: 14, lineHeight: 1.8 }}>
              完成前测后，系统会结合薄弱项和智能导学建议，生成包含每日练习、课程学习、实训仿真的个性化方案。
            </p>
            <button
              type="button"
              onClick={() => { localStorage.removeItem('onboarding_done'); router.push('/onboarding') }}
              style={PRIMARY_BUTTON}
            >
              去完成前测 <ChevronRight size={16} />
            </button>
          </div>
        </section>
      </div>
    )
  }

  const plan = planData.plan ?? []
  const score = planData.score ?? 0
  const dateText = planData.created_at?.slice(0, 10) ?? ''
  const scheme = planData.personalized_scheme ?? buildPersonalizedScheme(plan, score)
  const highCount = plan.filter(item => item.priority === 'high').length
  const mediumCount = plan.filter(item => item.priority === 'medium').length
  const lowCount = plan.filter(item => item.priority === 'low').length
  const groupedPlan = {
    high: plan.filter(item => item.priority === 'high'),
    medium: plan.filter(item => item.priority === 'medium'),
    low: plan.filter(item => item.priority === 'low'),
  }

  const actions = [
    { key: 'daily', icon: Target, tone: '#1d6f78', action: scheme.daily_practice },
    { key: 'course', icon: BookOpen, tone: '#356fba', action: scheme.course_learning },
    { key: 'simulation', icon: FlaskConical, tone: '#9a5b11', action: scheme.simulation_training },
  ]

  return (
    <div className="plan-page">
      <style>{pageStyles}</style>

      <header className="plan-header">
        <div>
          <p className="plan-eyebrow">Personalized Learning</p>
          <h1>个性化学习方案</h1>
          <p>基于能力前测、薄弱项和智能导学建议生成，按“练习、课程、实训”推进。</p>
        </div>
        <div className="plan-actions">
          <button type="button" onClick={() => { localStorage.removeItem('onboarding_done'); router.push('/onboarding') }} style={GHOST_BUTTON}>
            <RefreshCw size={14} />重新前测
          </button>
          <button type="button" onClick={handleDownload} disabled={downloading} style={{ ...PRIMARY_BUTTON, opacity: downloading ? 0.72 : 1 }}>
            {downloading ? <Loader2 className="plan-spin" size={14} /> : <Download size={14} />}
            下载方案
          </button>
        </div>
      </header>

      <section className="plan-hero">
        <div className="score-panel">
          <div className="score-ring" style={{ borderColor: scoreColor(score), color: scoreColor(score), background: `${scoreColor(score)}12` }}>
            <strong>{score}</strong>
            <span>分</span>
          </div>
          <div>
            <p className="plan-eyebrow">前测结果</p>
            <h2>{score < 60 ? '先补基础，再进阶' : score < 80 ? '基础可用，重点补漏' : '基础较稳，进入深化'}</h2>
            <p>{scheme.summary}</p>
            <div className="meta-row">
              <span><CalendarDays size={14} />{dateText || '最近一次前测'}</span>
              <span><BookOpen size={14} />{educationLabel(planData.edu_level)} · {planData.major || '未设置专业'}</span>
              <span><AlertTriangle size={14} />错题 {planData.wrong_count ?? 0} 道</span>
            </div>
          </div>
        </div>

        <div className="diagnosis-panel">
          <div className="panel-title">
            <BrainCircuit size={17} />
            <span>导学判断</span>
          </div>
          <div className="focus-list">
            {scheme.ai_focus.map(item => <span key={item}>{item}</span>)}
          </div>
          <div className="mini-stats">
            <MetricCard label="重点强化" value={`${highCount}项`} tone="#b42318" />
            <MetricCard label="建议复习" value={`${mediumCount}项`} tone="#a15c07" />
            <MetricCard label="保持巩固" value={`${lowCount}项`} tone="#087443" />
          </div>
        </div>
      </section>

      <section className="action-grid" aria-label="学习执行入口">
        {actions.map(({ key, icon: Icon, tone, action }) => (
          <article key={key} className="action-card">
            <div className="action-icon" style={{ color: tone, background: `${tone}14` }}><Icon size={22} /></div>
            <div className="action-copy">
              <div className="action-title-row">
                <h3>{action.title}</h3>
                <span><Clock3 size={13} />{action.duration}</span>
              </div>
              <p className="focus-text">重点：{action.focus}</p>
              <p>{action.detail}</p>
            </div>
            <button type="button" onClick={() => router.push(action.href)} className="action-button" style={{ color: tone }}>
              进入{action.title} <ArrowRight size={15} />
            </button>
          </article>
        ))}
      </section>

      <div className="content-grid">
        <section style={PANEL} className="plan-section">
          <div className="section-head">
            <div>
              <p className="plan-eyebrow">7 Day Plan</p>
              <h2>一周推进计划</h2>
            </div>
            <button type="button" onClick={() => router.push('/report')} style={GHOST_BUTTON}>
              查看学习报告 <BarChart3 size={14} />
            </button>
          </div>
          <div className="week-list">
            {scheme.seven_day_plan.map((item, index) => (
              <article key={item.day} className="week-item">
                <div className="day-mark">{index + 1}</div>
                <div>
                  <span>{item.day}</span>
                  <strong>{item.title}</strong>
                </div>
                <ul>
                  {item.tasks.map(task => <li key={task}>{task}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <aside style={PANEL} className="plan-section">
          <div className="section-head compact">
            <div>
              <p className="plan-eyebrow">Weak Points</p>
              <h2>薄弱项来源</h2>
            </div>
          </div>
          <div className="weak-list">
            {(scheme.weak_items.length ? scheme.weak_items : prioritySort(plan).slice(0, 5)).map(item => {
              const config = PRIORITY_CONFIG[item.priority]
              return (
                <div key={item.project_name} className="weak-item">
                  <span style={{ color: config.color, background: config.soft }}>{config.label}</span>
                  <strong>{compactProjectName(item.project_name)}</strong>
                  <p>{item.reason}</p>
                  <small>{item.total > 0 ? `前测 ${item.wrong}/${item.total} 题出错` : '前测未覆盖，建议主动学习'}</small>
                </div>
              )
            })}
          </div>
        </aside>
      </div>

      <section style={PANEL} className="plan-section">
        <div className="section-head">
          <div>
            <p className="plan-eyebrow">Priority Projects</p>
            <h2>项目优先级</h2>
          </div>
          <span className="section-note">先做重点强化，再处理建议复习，最后保持巩固。</span>
        </div>
        <div className="priority-columns">
          {(['high', 'medium', 'low'] as const).map(priority => (
            <PriorityColumn key={priority} priority={priority} items={groupedPlan[priority]} />
          ))}
        </div>
      </section>
    </div>
  )
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong style={{ color: tone }}>{value}</strong>
    </div>
  )
}

function PriorityColumn({ priority, items }: { priority: PlanItem['priority']; items: PlanItem[] }) {
  const config = PRIORITY_CONFIG[priority]

  return (
    <article className="priority-column" style={{ background: config.bg, borderColor: config.border }}>
      <header>
        <span style={{ color: config.color, background: config.soft }}>{config.label}</span>
        <strong>{items.length} 项</strong>
      </header>
      <div className="priority-list">
        {items.length === 0 ? (
          <p className="empty-priority">暂无项目</p>
        ) : items.map(item => (
          <div key={item.project_name} className="priority-item">
            <strong>{compactProjectName(item.project_name)}</strong>
            <p>{item.reason}</p>
            <small>{item.total > 0 ? `错 ${item.wrong} / 答 ${item.total}` : '前测未涉及'}</small>
          </div>
        ))}
      </div>
    </article>
  )
}

const pageStyles = `
@keyframes planSpin {
  to { transform: rotate(360deg); }
}

.plan-spin {
  animation: planSpin 1s linear infinite;
}

.plan-page {
  min-height: 100vh;
  padding: 20px;
  color: #183b4b;
}

.plan-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.plan-eyebrow {
  margin: 0 0 5px;
  color: #1d6f78;
  font-size: 11px;
  line-height: 1.2;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.plan-header h1,
.plan-hero h2,
.plan-section h2,
.action-card h3 {
  margin: 0;
  color: #183b4b;
  letter-spacing: 0;
}

.plan-header h1 {
  font-size: 27px;
  line-height: 1.2;
}

.plan-header p:not(.plan-eyebrow),
.score-panel p,
.action-card p {
  margin: 6px 0 0;
  color: #6b8a98;
  font-size: 13px;
  line-height: 1.65;
}

.plan-actions,
.meta-row,
.action-title-row,
.section-head {
  display: flex;
  align-items: center;
}

.plan-actions {
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.plan-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.8fr);
  gap: 14px;
  margin-bottom: 14px;
}

.score-panel,
.diagnosis-panel,
.action-card {
  border: 1px solid rgba(31,71,92,0.12);
  border-radius: 10px;
  background: rgba(255,255,255,0.92);
  box-shadow: 0 10px 28px rgba(29,53,74,0.07);
}

.score-panel {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  gap: 20px;
  align-items: center;
  padding: 22px;
}

.score-ring {
  width: 112px;
  height: 112px;
  display: grid;
  place-items: center;
  align-content: center;
  border: 5px solid;
  border-radius: 50%;
}

.score-ring strong {
  font-size: 38px;
  line-height: 0.95;
}

.score-ring span {
  font-size: 12px;
  font-weight: 800;
}

.score-panel h2 {
  font-size: 22px;
}

.meta-row {
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 14px;
}

.meta-row span {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 9px;
  color: #46606f;
  border: 1px solid rgba(31,71,92,0.1);
  border-radius: 7px;
  background: rgba(255,255,255,0.68);
  font-size: 12px;
  font-weight: 700;
}

.diagnosis-panel {
  padding: 18px;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 12px;
  color: #1d6f78;
  font-size: 14px;
  font-weight: 800;
}

.focus-list {
  display: grid;
  gap: 8px;
  margin-bottom: 14px;
}

.focus-list span {
  min-height: 36px;
  display: flex;
  align-items: center;
  padding: 0 11px;
  color: #315161;
  border: 1px solid rgba(29,111,120,0.14);
  border-radius: 8px;
  background: rgba(29,111,120,0.055);
  font-size: 13px;
  font-weight: 750;
}

.mini-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.metric-card {
  padding: 10px;
  border-radius: 8px;
  background: rgba(248,251,252,0.9);
  border: 1px solid rgba(31,71,92,0.08);
}

.metric-card span {
  display: block;
  margin-bottom: 5px;
  color: #6b8a98;
  font-size: 11px;
}

.metric-card strong {
  font-size: 20px;
  line-height: 1;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 14px;
}

.action-card {
  min-height: 230px;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 14px;
  padding: 18px;
}

.action-icon {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 10px;
}

.action-title-row {
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.action-title-row h3 {
  font-size: 17px;
}

.action-title-row span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  color: #6b8a98;
  font-size: 11px;
  font-weight: 800;
}

.focus-text {
  color: #1d6f78 !important;
  font-weight: 800;
}

.action-button {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  border: 1px solid rgba(31,71,92,0.12);
  border-radius: 8px;
  background: rgba(248,251,252,0.94);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr);
  gap: 14px;
  margin-bottom: 14px;
}

.plan-section {
  padding: 18px;
}

.section-head {
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;
}

.section-head h2 {
  font-size: 19px;
}

.section-note {
  color: #6b8a98;
  font-size: 12px;
}

.week-list {
  display: grid;
  gap: 8px;
}

.week-item {
  display: grid;
  grid-template-columns: 34px 120px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 11px 12px;
  border: 1px solid rgba(31,71,92,0.08);
  border-radius: 9px;
  background: rgba(248,251,252,0.74);
}

.day-mark {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  color: #fff;
  border-radius: 8px;
  background: #1d6f78;
  font-size: 13px;
  font-weight: 900;
}

.week-item span {
  display: block;
  color: #6b8a98;
  font-size: 11px;
  font-weight: 800;
}

.week-item strong {
  display: block;
  color: #183b4b;
  font-size: 14px;
}

.week-item ul {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  padding: 0;
  margin: 0;
  list-style: none;
}

.week-item li {
  min-height: 26px;
  display: inline-flex;
  align-items: center;
  padding: 0 8px;
  color: #46606f;
  border-radius: 7px;
  background: #fff;
  font-size: 12px;
}

.weak-list {
  display: grid;
  gap: 9px;
}

.weak-item {
  padding: 12px;
  border: 1px solid rgba(31,71,92,0.08);
  border-radius: 9px;
  background: rgba(248,251,252,0.78);
}

.weak-item span,
.priority-column header span {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 900;
}

.weak-item strong {
  display: block;
  margin: 9px 0 5px;
  color: #183b4b;
  font-size: 14px;
}

.weak-item p {
  margin: 0 0 6px;
  color: #6b8a98;
  font-size: 12px;
  line-height: 1.6;
}

.weak-item small {
  color: #8fa0aa;
  font-size: 11px;
}

.priority-columns {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.priority-column {
  min-height: 220px;
  padding: 13px;
  border: 1px solid;
  border-radius: 10px;
}

.priority-column header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.priority-column header strong {
  color: #46606f;
  font-size: 12px;
}

.priority-list {
  display: grid;
  gap: 8px;
}

.priority-item {
  padding: 10px;
  border-radius: 8px;
  background: rgba(255,255,255,0.78);
  border: 1px solid rgba(31,71,92,0.06);
}

.priority-item strong {
  display: block;
  margin-bottom: 4px;
  color: #183b4b;
  font-size: 13px;
}

.priority-item p {
  margin: 0 0 6px;
  color: #6b8a98;
  font-size: 12px;
  line-height: 1.55;
}

.priority-item small,
.empty-priority {
  color: #8fa0aa;
  font-size: 11px;
}

@media (max-width: 1120px) {
  .plan-hero,
  .content-grid {
    grid-template-columns: 1fr;
  }

  .action-grid,
  .priority-columns {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .plan-page {
    padding: 12px;
  }

  .plan-header,
  .section-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .plan-actions {
    width: 100%;
    justify-content: stretch;
  }

  .plan-actions button,
  .section-head button {
    flex: 1;
  }

  .score-panel {
    grid-template-columns: 1fr;
  }

  .score-ring {
    width: 96px;
    height: 96px;
  }

  .mini-stats {
    grid-template-columns: 1fr;
  }

  .week-item {
    grid-template-columns: 34px minmax(0, 1fr);
  }

  .week-item ul {
    grid-column: 2;
  }
}
`
