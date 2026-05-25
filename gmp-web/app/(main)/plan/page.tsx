'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sparkles, Download, RefreshCw, ExternalLink,
  Target, BookOpen, CheckCircle, AlertTriangle,
  BarChart3, Cpu, ChevronRight, Loader2, Play,
  Clock, CheckSquare, XCircle, Zap,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface PlanItem {
  project_name: string
  priority: 'high' | 'medium' | 'low'
  reason: string
  wrong: number
  total: number
}

interface PlanData {
  hasplan: boolean
  id?: number
  edu_level?: string
  major?: string
  score?: number
  wrong_count?: number
  plan?: PlanItem[]
  created_at?: string
}

type JobStatus = 'idle' | 'pending' | 'running' | 'succeeded' | 'failed'

interface JobState {
  jobId: string | null
  status: JobStatus
  step: string
  progress: number
  message: string
  scenesGenerated: number
  totalScenes: number | null
  classroomUrl: string | null
  error: string | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG = {
  high:   { label: '重点强化', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', dot: '🔴' },
  medium: { label: '建议复习', color: '#d97706', bg: '#fffbeb', border: '#fcd34d', dot: '🟡' },
  low:    { label: '已掌握',   color: '#16a34a', bg: '#f0fdf4', border: '#86efac', dot: '🟢' },
}

const STEP_LABELS: Record<string, string> = {
  initializing:       '初始化中…',
  researching:        '检索相关资料…',
  generating_outlines:'生成课程大纲…',
  generating_scenes:  '生成课堂场景…',
  generating_media:   '生成媒体内容…',
  generating_tts:     '合成语音…',
  persisting:         '保存课堂内容…',
  completed:          '生成完成！',
}

function scoreColor(s: number) {
  return s >= 80 ? '#16a34a' : s >= 60 ? '#d97706' : '#dc2626'
}

const PANEL: React.CSSProperties = {
  background: 'rgba(255,255,255,0.9)',
  border: '1px solid rgba(31,71,92,0.12)',
  borderRadius: 12,
  boxShadow: '0 8px 24px rgba(29,53,74,0.07)',
}

const INITIAL_JOB: JobState = {
  jobId: null, status: 'idle', step: '', progress: 0,
  message: '', scenesGenerated: 0, totalScenes: null,
  classroomUrl: null, error: null,
}

// ── Component ────────────────────────────────────────────────────────────────

export default function PlanPage() {
  const router = useRouter()
  const [planData, setPlanData]         = useState<PlanData | null>(null)
  const [loading, setLoading]           = useState(true)
  const [downloading, setDownloading]   = useState(false)
  const [activeSection, setActiveSection] = useState<'plan' | 'openmaic'>('plan')
  const [openmaicTopic, setOpenmaicTopic] = useState('GMP中的数据完整性要求')
  const [job, setJob]                   = useState<JobState>(INITIAL_JOB)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── fetch plan on mount ──────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { router.push('/login'); return }

    fetch('/api/onboarding/plan', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((d: PlanData) => setPlanData(d))
      .catch(() => setPlanData({ hasplan: false }))
      .finally(() => setLoading(false))
  }, [router])

  // ── stop polling on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => { if (pollRef.current) clearTimeout(pollRef.current) }
  }, [])

  // ── download word plan ───────────────────────────────────────────────────
  async function handleDownload() {
    setDownloading(true)
    try {
      const token = localStorage.getItem('token')!
      const res = await fetch('/api/onboarding/download-plan', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const blob = await res.blob()
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        a.href = url
        a.download = 'GMP个性化学习方案.docx'
        a.click()
        URL.revokeObjectURL(url)
      }
    } finally {
      setDownloading(false)
    }
  }

  // ── OpenMAIC: start generation ───────────────────────────────────────────
  async function handleGenerateClassroom() {
    if (!openmaicTopic.trim()) return
    if (pollRef.current) clearTimeout(pollRef.current)

    setJob({ ...INITIAL_JOB, status: 'pending', message: '正在提交生成请求…' })

    const token = localStorage.getItem('token')!
    let jobId: string

    try {
      const res = await fetch('/api/openmaic/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requirement: openmaicTopic }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        const msg = data.error ?? '提交生成请求失败'
        setJob(j => ({ ...j, status: 'failed', error: msg }))
        return
      }
      jobId = data.jobId as string
      setJob(j => ({
        ...j, jobId, status: 'running',
        step: data.step ?? 'initializing',
        message: data.message ?? '任务已创建，正在生成…',
      }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setJob(j => ({ ...j, status: 'failed', error: `无法连接到服务：${msg}` }))
      return
    }

    // Start polling
    schedulePoll(jobId, token)
  }

  function schedulePoll(jobId: string, token: string) {
    pollRef.current = setTimeout(() => pollJob(jobId, token), 5000)
  }

  async function pollJob(jobId: string, token: string) {
    try {
      const res = await fetch(`/api/openmaic/poll/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()

      if (!res.ok || !data.success) {
        setJob(j => ({ ...j, status: 'failed', error: data.error ?? '轮询失败' }))
        return
      }

      const update: Partial<JobState> = {
        step:            data.step ?? '',
        progress:        typeof data.progress === 'number' ? data.progress : 0,
        message:         data.message ?? '',
        scenesGenerated: typeof data.scenesGenerated === 'number' ? data.scenesGenerated : 0,
        totalScenes:     typeof data.totalScenes === 'number' ? data.totalScenes : null,
      }

      if (data.done) {
        if (data.status === 'succeeded' && data.result?.url) {
          setJob(j => ({
            ...j, ...update, status: 'succeeded',
            classroomUrl: data.result.url as string,
            progress: 100,
          }))
        } else {
          setJob(j => ({
            ...j, ...update, status: 'failed',
            error: data.error ?? '课堂生成失败，请重试',
          }))
        }
        return
      }

      setJob(j => ({ ...j, ...update, status: 'running' }))
      schedulePoll(jobId, token)
    } catch (err) {
      // Network blip — retry once more
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[openmaic poll] error, will retry:', msg)
      schedulePoll(jobId, token)
    }
  }

  function handleReset() {
    if (pollRef.current) clearTimeout(pollRef.current)
    setJob(INITIAL_JOB)
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#6b8a98', minHeight: 400 }}>
      <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: '#1d6f78' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      加载中…
    </div>
  )

  // ── 无前测记录 ──────────────────────────────────────────────────────────────
  if (!planData?.hasplan) return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 24 }}>
        <p style={{ color: '#1d6f78', fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', margin: 0 }}>AI 功能</p>
        <h1 style={{ color: '#183b4b', fontSize: 26, fontWeight: 700, margin: '4px 0 0' }}>个性化学习</h1>
      </div>
      <div style={{ ...PANEL, padding: '56px 40px', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(29,111,120,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <Sparkles size={30} color="#1d6f78" strokeWidth={1.6} />
        </div>
        <h2 style={{ color: '#183b4b', fontSize: 20, fontWeight: 700, margin: '0 0 10px' }}>尚未完成能力前测</h2>
        <p style={{ color: '#6b8a98', fontSize: 14, margin: '0 0 24px', lineHeight: 1.8 }}>
          完成前测后，AI 将自动生成你的个性化学习方案。<br />前测仅需 5~10 分钟，共 20 道客观题。
        </p>
        <button
          onClick={() => { localStorage.removeItem('onboarding_done'); router.push('/onboarding') }}
          style={{ padding: '12px 28px', borderRadius: 8, border: 'none', background: '#1d6f78', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          去完成前测 <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )

  // ── 有前测记录 ──────────────────────────────────────────────────────────────
  const plan       = planData.plan ?? []
  const score      = planData.score ?? 0
  const eduLabel   = planData.edu_level === 'undergraduate' ? '本科' : '专科'
  const dateStr    = planData.created_at?.slice(0, 10) ?? ''
  const highCount  = plan.filter(p => p.priority === 'high').length
  const mediumCount= plan.filter(p => p.priority === 'medium').length
  const lowCount   = plan.filter(p => p.priority === 'low').length

  // Suggested topics from top priority projects
  const suggestedTopics = [
    ...plan.filter(p => p.priority === 'high').slice(0, 3).map(p => p.project_name),
    'GMP数据完整性与ALCOA+原则',
    'OOS调查与偏差处理流程',
    'GMP批生产记录规范填写',
  ].slice(0, 6)

  return (
    <div style={{ padding: 20, minHeight: '100vh' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
      `}</style>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <p style={{ color: '#1d6f78', fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', margin: 0 }}>AI 功能</p>
          <h1 style={{ color: '#183b4b', fontSize: 26, fontWeight: 700, margin: '4px 0 0' }}>个性化学习</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { localStorage.removeItem('onboarding_done'); router.push('/onboarding') }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'transparent', color: '#6b8a98', border: '1px solid rgba(31,71,92,0.2)', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
          >
            <RefreshCw size={14} />重新前测
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#1d6f78', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: downloading ? 0.7 : 1 }}
          >
            {downloading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />}
            下载学习方案（Word）
          </button>
        </div>
      </div>

      {/* Score summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: '前测得分', value: `${score}分`,      sub: '满分100',    color: scoreColor(score) },
          { label: '学历',     value: eduLabel,            sub: planData.major ?? '', color: '#183b4b' },
          { label: '重点强化', value: `${highCount}项`,   sub: '需优先学习', color: '#dc2626' },
          { label: '建议复习', value: `${mediumCount}项`, sub: '巩固提升',   color: '#d97706' },
          { label: '已掌握',   value: `${lowCount}项`,    sub: '保持即可',   color: '#16a34a' },
        ].map(s => (
          <div key={s.label} style={{ ...PANEL, padding: '14px 16px', display: 'grid', gap: 3 }}>
            <span style={{ color: '#6b7d86', fontSize: 11 }}>{s.label}</span>
            <strong style={{ color: s.color, fontSize: 22, lineHeight: 1 }}>{s.value}</strong>
            <small style={{ color: '#9ba8b0', fontSize: 11 }}>{s.sub}</small>
          </div>
        ))}
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(31,71,92,0.1)', borderRadius: 10, padding: '4px 8px' }}>
        {([
          { id: 'plan',     label: '学习方案',         icon: Target },
          { id: 'openmaic', label: 'OpenMAIC 智慧课堂', icon: Cpu },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveSection(id)} style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', border: 'none', borderRadius: 8,
            background: activeSection === id ? '#1d6f78' : 'transparent',
            color: activeSection === id ? '#fff' : '#6b8a98',
            fontWeight: activeSection === id ? 700 : 400, fontSize: 14, cursor: 'pointer', transition: 'all 0.15s',
          }}>
            <Icon size={16} />{label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#9ba8b0', alignSelf: 'center', paddingRight: 4 }}>
          前测日期：{dateStr}
        </span>
      </div>

      {/* ── Section: 学习方案 ─────────────────────────────────────────────────── */}
      {activeSection === 'plan' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* AI insight */}
          <div style={{ ...PANEL, padding: '18px 22px', background: 'rgba(29,111,120,0.04)', border: '1px solid rgba(29,111,120,0.14)' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <Sparkles size={18} color="#1d6f78" style={{ flexShrink: 0, marginTop: 2 }} />
              <p style={{ margin: 0, color: '#355564', fontSize: 14, lineHeight: 1.75 }}>
                {score >= 80
                  ? `你的前测得分 ${score} 分，基础较为扎实。建议直接进入薄弱项目的深化练习，同时定期回顾错题。`
                  : score >= 60
                  ? `你的前测得分 ${score} 分，整体基础良好，存在部分知识盲区。建议重点攻克「重点强化」项目，逐步提升到熟练应用层级。`
                  : `你的前测得分 ${score} 分，建议从基础开始系统学习。按照下方项目顺序完整学习课件与视频，扎实掌握后再进行练习。`}
                &nbsp;完整方案可
                <button onClick={handleDownload} style={{ color: '#1d6f78', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 14, textDecoration: 'underline' }}>
                  下载 Word 文件
                </button>留存。
              </p>
            </div>
          </div>

          {/* Priority groups */}
          {(['high', 'medium', 'low'] as const).map(prio => {
            const items = plan.filter(p => p.priority === prio)
            if (items.length === 0) return null
            const cfg = PRIORITY_CONFIG[prio]
            return (
              <div key={prio}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 8px' }}>
                  <span style={{ fontSize: 14 }}>{cfg.dot}</span>
                  <span style={{ fontWeight: 700, fontSize: 14, color: cfg.color }}>{cfg.label}</span>
                  <span style={{ fontSize: 12, color: '#9ba8b0' }}>（{items.length} 个项目）</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {items.map((item, i) => (
                    <div key={i} style={{ ...PANEL, padding: '14px 18px', background: cfg.bg, border: `1px solid ${cfg.border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: 600, fontSize: 14, color: '#183b4b', margin: '0 0 3px' }}>{item.project_name}</p>
                        <p style={{ fontSize: 12, color: '#6b8a98', margin: 0, lineHeight: 1.6 }}>{item.reason}</p>
                      </div>
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        {item.total > 0 ? (
                          <>
                            <div style={{ fontSize: 18, fontWeight: 700, color: cfg.color, lineHeight: 1 }}>
                              {item.wrong}/{item.total}
                            </div>
                            <div style={{ fontSize: 10, color: '#9ba8b0' }}>错/答</div>
                          </>
                        ) : (
                          <span style={{ fontSize: 11, color: '#c0ccd4' }}>未涉及</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {/* Study tips */}
          <div style={{ ...PANEL, padding: '18px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <BookOpen size={16} color="#1d6f78" />
              <span style={{ fontWeight: 700, fontSize: 14, color: '#183b4b' }}>学习方法建议</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { icon: CheckCircle,   text: '每日学习建议不少于45分钟：知识20分钟 + 练习20分钟 + 错题复习5分钟' },
                { icon: Target,        text: '优先完成「重点强化」项目，再推进「建议复习」，「已掌握」定期巩固即可' },
                { icon: AlertTriangle, text: '答错题目会自动进入「错题本」，每周至少复盘一次，直到标记为已掌握' },
                { icon: BarChart3,     text: '每个项目学完后，做一次专项练习检验效果，可在「每日练习」中筛选项目' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <Icon size={14} color="#1d6f78" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 13, color: '#355564', lineHeight: 1.6 }}>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Section: OpenMAIC 智慧课堂 ──────────────────────────────────────── */}
      {activeSection === 'openmaic' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Intro card */}
          <div style={{ ...PANEL, padding: '20px 24px', background: 'linear-gradient(135deg, rgba(29,111,120,0.05), rgba(75,67,156,0.04))' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#215566,#4b439c)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Cpu size={22} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 6px', color: '#183b4b', fontSize: 18, fontWeight: 700 }}>OpenMAIC 智慧课堂</h3>
                <p style={{ margin: '0 0 12px', color: '#6b8a98', fontSize: 14, lineHeight: 1.7 }}>
                  基于多智能体的交互式课堂生成系统。输入学习主题，AI 自动生成结构化 PPT 课件、知识地图与互动问答，为 GMP 学习打造沉浸式教学体验。
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['自动生成PPT', '多场景课堂', '互动问答', '多智能体协作'].map(t => (
                    <span key={t} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 999, background: 'rgba(29,111,120,0.1)', color: '#1d6f78', fontWeight: 600 }}>{t}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Main interaction area */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 12 }}>

            {/* Left: generate panel */}
            <div style={{ ...PANEL, padding: '22px 24px' }}>
              <p style={{ fontWeight: 700, fontSize: 14, color: '#183b4b', margin: '0 0 14px' }}>生成课堂内容</p>

              {/* Topic input */}
              <label style={{ display: 'block', fontSize: 12, color: '#6b8a98', marginBottom: 6 }}>学习主题</label>
              <textarea
                value={openmaicTopic}
                onChange={e => setOpenmaicTopic(e.target.value)}
                placeholder="例：GMP中的数据完整性要求与ALCOA+原则、洁净区环境监控规范…"
                rows={3}
                disabled={job.status === 'pending' || job.status === 'running'}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid rgba(31,71,92,0.18)', fontSize: 14, color: '#183b4b', background: '#fff', outline: 'none', boxSizing: 'border-box', marginBottom: 14, resize: 'vertical', lineHeight: 1.6, opacity: (job.status === 'pending' || job.status === 'running') ? 0.6 : 1 }}
              />

              {/* ── Idle / Error state: show generate button ── */}
              {(job.status === 'idle' || job.status === 'failed') && (
                <>
                  {job.status === 'failed' && job.error && (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fca5a5', marginBottom: 12 }}>
                      <XCircle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
                      <span style={{ fontSize: 13, color: '#b91c1c', lineHeight: 1.5 }}>{job.error}</span>
                    </div>
                  )}
                  <button
                    onClick={handleGenerateClassroom}
                    disabled={!openmaicTopic.trim()}
                    style={{
                      width: '100%', padding: '12px 0', borderRadius: 8, border: 'none',
                      background: openmaicTopic.trim() ? 'linear-gradient(135deg,#215566,#35818a)' : '#dde3e8',
                      color: openmaicTopic.trim() ? '#fff' : '#9ba8b0',
                      fontWeight: 700, fontSize: 15, cursor: openmaicTopic.trim() ? 'pointer' : 'not-allowed',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    <Zap size={16} />
                    {job.status === 'failed' ? '重新生成' : '生成智慧课堂'}
                  </button>
                </>
              )}

              {/* ── Running / Pending state: show progress ── */}
              {(job.status === 'pending' || job.status === 'running') && (
                <div>
                  {/* Progress bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: '#355564', fontWeight: 600 }}>
                      {STEP_LABELS[job.step] ?? job.message ?? '处理中…'}
                    </span>
                    <span style={{ fontSize: 12, color: '#9ba8b0' }}>{job.progress}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: '#e8edf0', overflow: 'hidden', marginBottom: 10 }}>
                    <div style={{
                      height: '100%', borderRadius: 4,
                      background: 'linear-gradient(90deg,#215566,#35818a)',
                      width: `${job.progress}%`,
                      transition: 'width 0.5s ease',
                    }} />
                  </div>

                  {/* Scene progress */}
                  {job.totalScenes !== null && (
                    <p style={{ fontSize: 12, color: '#6b8a98', margin: '0 0 10px' }}>
                      已生成 {job.scenesGenerated} / {job.totalScenes} 个课堂场景
                    </p>
                  )}

                  {/* Spinner + cancel */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Loader2 size={16} color="#1d6f78" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: '#6b8a98', flex: 1, animation: 'pulse 2s ease infinite' }}>
                      AI 正在生成课堂，通常需要 2~5 分钟，请耐心等待…
                    </span>
                    <button
                      onClick={handleReset}
                      style={{ fontSize: 12, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}

              {/* ── Succeeded state: show classroom link ── */}
              {job.status === 'succeeded' && job.classroomUrl && (
                <div>
                  {/* Success banner */}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 16px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #86efac', marginBottom: 14 }}>
                    <CheckSquare size={18} color="#16a34a" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#166534' }}>课堂生成成功！</p>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: '#4ade80' }}>
                        已生成 {job.scenesGenerated} 个课堂场景
                      </p>
                    </div>
                  </div>

                  {/* Open classroom button */}
                  <button
                    onClick={() => window.open(job.classroomUrl!, '_blank')}
                    style={{
                      width: '100%', padding: '13px 0', borderRadius: 8, border: 'none',
                      background: 'linear-gradient(135deg,#215566,#4b439c)',
                      color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      marginBottom: 10,
                    }}
                  >
                    <Play size={16} />进入智慧课堂
                    <ExternalLink size={14} style={{ opacity: 0.7 }} />
                  </button>

                  <button
                    onClick={handleReset}
                    style={{ width: '100%', padding: '10px 0', borderRadius: 8, border: '1.5px solid rgba(31,71,92,0.18)', background: 'transparent', color: '#6b8a98', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <RefreshCw size={14} />生成新课堂
                  </button>
                </div>
              )}
            </div>

            {/* Right: suggested topics */}
            <div style={{ ...PANEL, padding: '18px 20px' }}>
              <p style={{ fontWeight: 700, fontSize: 13, color: '#183b4b', margin: '0 0 4px' }}>
                <Sparkles size={13} color="#1d6f78" style={{ display: 'inline', marginRight: 5 }} />
                推荐主题
              </p>
              <p style={{ fontSize: 11, color: '#9ba8b0', margin: '0 0 12px' }}>
                根据你的学习方案生成
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {suggestedTopics.map(topic => (
                  <button
                    key={topic}
                    onClick={() => setOpenmaicTopic(topic)}
                    disabled={job.status === 'pending' || job.status === 'running'}
                    style={{
                      textAlign: 'left', padding: '8px 12px', borderRadius: 6,
                      border: '1px solid rgba(31,71,92,0.12)',
                      background: openmaicTopic === topic ? 'rgba(29,111,120,0.08)' : '#fff',
                      color: openmaicTopic === topic ? '#1d6f78' : '#355564',
                      fontSize: 12, lineHeight: 1.4, cursor: 'pointer',
                      fontWeight: openmaicTopic === topic ? 600 : 400,
                      transition: 'all 0.12s',
                      opacity: (job.status === 'pending' || job.status === 'running') ? 0.5 : 1,
                    }}
                  >
                    {topic}
                  </button>
                ))}
              </div>

              {/* Status indicator */}
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(31,71,92,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: job.status === 'succeeded' ? '#16a34a'
                              : job.status === 'failed'    ? '#dc2626'
                              : job.status === 'idle'      ? '#9ba8b0'
                              : '#d97706',
                    animation: (job.status === 'pending' || job.status === 'running') ? 'pulse 1.5s ease infinite' : 'none',
                  }} />
                  <span style={{ fontSize: 11, color: '#6b8a98' }}>
                    {job.status === 'idle'      ? 'OpenMAIC 服务就绪'
                   : job.status === 'pending'   ? '正在提交…'
                   : job.status === 'running'   ? '生成中…'
                   : job.status === 'succeeded' ? '课堂已生成'
                   : '生成失败'}
                  </span>
                </div>
                {(job.status === 'running' || job.status === 'pending') && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                    <Clock size={11} color="#9ba8b0" />
                    <span style={{ fontSize: 11, color: '#9ba8b0' }}>通常需要 2~5 分钟</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Info footer */}
          <div style={{ ...PANEL, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start', background: 'rgba(255,251,235,0.8)', border: '1px solid rgba(252,211,77,0.4)' }}>
            <AlertTriangle size={16} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ margin: 0, fontSize: 13, color: '#78460d', lineHeight: 1.65 }}>
              OpenMAIC 需要在本地启动（默认端口 3002）。如尚未启动，请在 OpenMAIC 目录中运行
              <code style={{ background: 'rgba(0,0,0,0.06)', padding: '0 5px', borderRadius: 4, fontFamily: 'monospace', fontSize: 12 }}>npm run dev -- -p 3002</code>，
              然后刷新此页面。生成内容基于 AI 大模型，建议结合教材和教师指导使用。
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
