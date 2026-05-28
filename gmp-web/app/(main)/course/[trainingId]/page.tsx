'use client'

import { useEffect, useState, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, FileText, Sparkles, ClipboardCheck, Gamepad2, MessageSquare,
  CheckCircle2, Clock, Trophy, Target, BookOpen, ArrowRight, Edit3,
  Pin, MessageCircle, Eye, Plus, Send, Calendar, Award, Loader2,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface KnowledgePoint {
  kpId: string
  title: string
  content: string | null
  difficulty: number
  pointType: string
  taskName: string | null
  confidence: number
  attemptCount: number
  status: 'mastered' | 'learning' | 'weak' | 'untested'
}

interface RegItem {
  regId: string
  docType: string
  regDoc: string
  chapter: string | null
  section: string | null
  article: string | null
  content: string | null
}

interface ResourceGroup {
  docType: string
  count: number
  items: RegItem[]
}

interface Discussion {
  id: number
  title: string
  content: string
  tag: string
  pinned: boolean
  replyCount: number
  viewCount: number
  createdAt: string
  author: string
}

interface Assignment {
  id: number
  title: string
  description: string
  assignmentType: string
  maxScore: number
  dueDate: string | null
  createdAt: string
  submitted: boolean
  mySubmission: {
    id: number
    score: number | null
    submittedAt: string
    graded: boolean
  } | null
}

interface ChapterDetail {
  chapter: {
    trainingId: string
    displayName: string
    seqOrder: number
    eduLevel: string
    hours: number | null
    projectName: string | null
  }
  knowledgePoints: KnowledgePoint[]
  resources: ResourceGroup[]
  quiz: {
    latestScore: number | null
    earnedHours: number | null
    completedAt: string | null
    passed: boolean
  }
  discussions: { total: number; list: Discussion[] }
  assignments: Assignment[]
  studyMinutes: number
}

type Tab = 'overview' | 'resources' | 'classroom' | 'quiz' | 'simulation' | 'discussion' | 'assignment'

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function ChapterDetailPage({ params }: { params: Promise<{ trainingId: string }> }) {
  const { trainingId } = use(params)
  const router = useRouter()
  const [data, setData] = useState<ChapterDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('overview')
  const enterRef = useRef<number>(Date.now())

  const loadData = () => {
    const token = localStorage.getItem('token')
    if (!token) { router.push('/login'); return }
    fetch(`/api/course/chapter/${trainingId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadData()
    // 进入页面时间
    enterRef.current = Date.now()

    // 离开时上报学习时长
    const reportLog = () => {
      const secs = Math.floor((Date.now() - enterRef.current) / 1000)
      if (secs < 5) return
      const token = localStorage.getItem('token')
      if (!token) return
      navigator.sendBeacon?.(
        `/api/course/study-log`,
        new Blob([JSON.stringify({ trainingId, seconds: Math.min(secs, 3600), activity: 'reading' })], { type: 'application/json' }),
      ) ?? fetch('/api/course/study-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ trainingId, seconds: Math.min(secs, 3600), activity: 'reading' }),
      }).catch(() => {})
    }
    window.addEventListener('beforeunload', reportLog)
    return () => {
      reportLog()
      window.removeEventListener('beforeunload', reportLog)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainingId])

  if (loading) return <LoadingScreen />
  if (!data) return <div style={{ padding: 40, color: '#6b8a98' }}>加载失败</div>

  const { chapter, knowledgePoints, resources, quiz, discussions, assignments } = data
  const totalResources = resources.reduce((s, g) => s + g.count, 0)

  return (
    <div style={{ background: '#f4f6f8', minHeight: 'calc(100vh - 86px)' }}>
      <style>{`
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px);} to{opacity:1;transform:translateY(0);} }
        .tab-content { animation: fadeIn 0.3s ease both; }
        .tab-btn:hover { background: rgba(29,111,120,0.08) !important; }
        .reg-item:hover { background: #f4f7f9 !important; }
        .disc-card:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(24,59,75,0.07); }
        .disc-card { transition: all 0.2s; }
      `}</style>

      {/* ── 顶部返回 + 章节头 ────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #183b4b 0%, #1d6f78 100%)',
        padding: '18px 28px 24px',
        color: '#fff',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -30, right: -20, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />

        <Link href="/course" style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          color: 'rgba(255,255,255,0.75)', textDecoration: 'none', fontSize: 12, marginBottom: 14,
        }}>
          <ChevronLeft size={14} /> 返回课程目录
        </Link>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, position: 'relative' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.15)', letterSpacing: '0.02em', fontWeight: 600 }}>
                {chapter.trainingId}
              </span>
              <span style={{ fontSize: 12, opacity: 0.75 }}>
                {chapter.eduLevel === 'undergraduate' ? '本科' : '专科'} · {chapter.hours} 学时
              </span>
            </div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>
              {chapter.displayName}
            </h1>
            <p style={{ margin: '6px 0 0', fontSize: 13, opacity: 0.78 }}>
              {knowledgePoints.length} 知识点 · {totalResources} 条法规资料 · {discussions.total} 讨论 · {assignments.length} 作业
            </p>
          </div>

          {/* 测验成绩卡 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 12, padding: '12px 16px', flexShrink: 0,
          }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 10, opacity: 0.75, letterSpacing: '0.05em' }}>最近测验</p>
              <p style={{ margin: '2px 0 0', fontSize: 24, fontWeight: 800, letterSpacing: '-0.04em', color: quiz.passed ? '#86efac' : quiz.latestScore !== null ? '#fca5a5' : '#fff' }}>
                {quiz.latestScore !== null ? quiz.latestScore : '—'}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 10, opacity: 0.6 }}>{quiz.latestScore !== null ? '/100' : '未参加'}</p>
            </div>
            {quiz.earnedHours !== null && quiz.earnedHours > 0 && (
              <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.15)' }} />
            )}
            {quiz.earnedHours !== null && quiz.earnedHours > 0 && (
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 10, opacity: 0.75 }}>课时分</p>
                <p style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700, color: '#ffd76b' }}>+{quiz.earnedHours}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #eaeff2',
        padding: '0 28px', display: 'flex', gap: 4, overflowX: 'auto',
        position: 'sticky', top: 86, zIndex: 10,
      }}>
        {([
          { id: 'overview',    label: '总览',     icon: BookOpen,        badge: null },
          { id: 'resources',   label: '法规资料', icon: FileText,        badge: totalResources },
          { id: 'classroom',   label: 'AI 课堂',  icon: Sparkles,        badge: null },
          { id: 'quiz',        label: '章节测验', icon: ClipboardCheck,  badge: quiz.latestScore !== null ? `${quiz.latestScore}分` : null },
          { id: 'simulation',  label: '实训仿真', icon: Gamepad2,        badge: null },
          { id: 'discussion',  label: '讨论区',   icon: MessageSquare,   badge: discussions.total > 0 ? discussions.total : null },
          { id: 'assignment',  label: '作业',     icon: Edit3,           badge: assignments.length > 0 ? assignments.length : null },
        ] as const).map(({ id, label, icon: Icon, badge }) => {
          const active = tab === id
          return (
            <button
              key={id} onClick={() => setTab(id as Tab)}
              className="tab-btn"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '12px 16px', border: 'none', background: 'transparent',
                cursor: 'pointer', fontSize: 13,
                color: active ? '#1d6f78' : '#6b8a98',
                fontWeight: active ? 700 : 500,
                borderBottom: `2px solid ${active ? '#1d6f78' : 'transparent'}`,
                transition: 'all 0.15s',
              }}
            >
              <Icon size={14} />
              {label}
              {badge !== null && badge !== undefined && (
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 20,
                  background: active ? 'rgba(29,111,120,0.12)' : '#eef2f5',
                  color: active ? '#1d6f78' : '#7a96a4',
                  fontWeight: 600, marginLeft: 2,
                }}>{badge}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Tab 内容区 ────────────────────────────────────────────── */}
      <div className="tab-content" style={{ padding: '20px 28px' }} key={tab}>
        {tab === 'overview'   && <OverviewTab data={data} setTab={setTab} />}
        {tab === 'resources'  && <ResourcesTab resources={resources} />}
        {tab === 'classroom'  && <ClassroomTab chapter={chapter} />}
        {tab === 'quiz'       && <QuizTab trainingId={trainingId} quiz={quiz} eduLevel={chapter.eduLevel} onComplete={loadData} />}
        {tab === 'simulation' && <SimulationTab trainingId={trainingId} chapter={chapter} />}
        {tab === 'discussion' && <DiscussionTab trainingId={trainingId} discussions={discussions.list} onChange={loadData} />}
        {tab === 'assignment' && <AssignmentTab assignments={assignments} onChange={loadData} />}
      </div>
    </div>
  )
}

// ── Tab: 总览 ───────────────────────────────────────────────────────────────

function OverviewTab({ data, setTab }: { data: ChapterDetail; setTab: (t: Tab) => void }) {
  const { knowledgePoints: kps, quiz, discussions, assignments, studyMinutes } = data

  const masteryStats = {
    mastered: kps.filter(k => k.status === 'mastered').length,
    learning: kps.filter(k => k.status === 'learning').length,
    weak: kps.filter(k => k.status === 'weak').length,
    untested: kps.filter(k => k.status === 'untested').length,
  }
  const masteryPct = kps.length > 0
    ? Math.round((masteryStats.mastered + masteryStats.learning * 0.6) / kps.length * 100)
    : 0

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20 }}>
      <div>
        {/* 学习概况 */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eaeff2', padding: '20px 22px', marginBottom: 16 }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#1c3140' }}>学习概况</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <Stat label="掌握知识点" value={masteryStats.mastered} suffix={`/${kps.length}`} color="#16a34a" icon={CheckCircle2} />
            <Stat label="学习中" value={masteryStats.learning} color="#d97706" icon={Target} />
            <Stat label="测验成绩" value={quiz.latestScore ?? '—'} suffix={quiz.latestScore !== null ? '分' : ''} color={quiz.passed ? '#16a34a' : '#7a96a4'} icon={Award} />
            <Stat label="学习时长" value={studyMinutes} suffix="分钟" color="#1d6f78" icon={Clock} />
          </div>
        </div>

        {/* 知识点掌握度 */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eaeff2', padding: '20px 22px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1c3140' }}>知识点掌握度</h2>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#1d6f78', letterSpacing: '-0.02em' }}>{masteryPct}%</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: '#eef2f5', overflow: 'hidden', marginBottom: 14, display: 'flex' }}>
            {(['mastered', 'learning', 'weak', 'untested'] as const).map(s => {
              const w = kps.length > 0 ? masteryStats[s] / kps.length * 100 : 0
              const color = { mastered: '#16a34a', learning: '#d97706', weak: '#dc2626', untested: '#cdd8df' }[s]
              return w > 0 ? <div key={s} style={{ width: `${w}%`, background: color, transition: 'width 0.5s' }} /> : null
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[
              { s: 'mastered', label: '已掌握', color: '#16a34a' },
              { s: 'learning', label: '学习中', color: '#d97706' },
              { s: 'weak',     label: '薄弱',   color: '#dc2626' },
              { s: 'untested', label: '未测',   color: '#94a3b8' },
            ].map(({ s, label, color }) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#6b8a98' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                {label} <strong style={{ color: '#1c3140', marginLeft: 'auto' }}>{masteryStats[s as keyof typeof masteryStats]}</strong>
              </div>
            ))}
          </div>
        </div>

        {/* 知识点列表 */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eaeff2', overflow: 'hidden' }}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid #f0f4f6' }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1c3140' }}>本章知识点</h2>
          </div>
          {kps.length === 0 ? (
            <p style={{ padding: 24, textAlign: 'center', color: '#9aacb6', fontSize: 12, margin: 0 }}>本章节暂无知识点数据</p>
          ) : (
            <div>
              {kps.map((kp, i) => {
                const sc = {
                  mastered: { color: '#16a34a', bg: '#dcfce7', label: '掌握' },
                  learning: { color: '#d97706', bg: '#fef3c7', label: '学习' },
                  weak:     { color: '#dc2626', bg: '#fee2e2', label: '薄弱' },
                  untested: { color: '#94a3b8', bg: '#f1f5f9', label: '未测' },
                }[kp.status]
                return (
                  <div key={kp.kpId} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 22px',
                    borderBottom: i < kps.length - 1 ? '1px solid #f6f8fa' : 'none',
                  }}>
                    <span style={{ fontSize: 11, color: '#cdd8df', fontWeight: 700, minWidth: 24, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1c3140' }}>{kp.title}</p>
                      {kp.taskName && (
                        <p style={{ margin: '2px 0 0', fontSize: 10, color: '#9aacb6' }}>{kp.taskName}</p>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 10, color: '#7a96a4' }}>
                        {kp.attemptCount > 0 ? `${Math.round(kp.confidence * 100)}%` : '—'}
                      </span>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: sc.bg, color: sc.color, fontWeight: 600 }}>
                        {sc.label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 右侧：快速入口 */}
      <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <QuickAction
          onClick={() => setTab('quiz')}
          icon={ClipboardCheck} title="章节测验"
          desc={quiz.latestScore !== null ? `最近：${quiz.latestScore} 分` : '检测本章掌握情况'}
          accent="#1d6f78"
        />
        <QuickAction
          onClick={() => setTab('classroom')}
          icon={Sparkles} title="AI 课堂"
          desc="生成本章可视化课堂"
          accent="#d97706"
        />
        <QuickAction
          onClick={() => setTab('simulation')}
          icon={Gamepad2} title="实训仿真"
          desc="进入工业场景模拟"
          accent="#7c3aed"
        />
        <QuickAction
          onClick={() => setTab('discussion')}
          icon={MessageSquare} title="参与讨论"
          desc={discussions.total > 0 ? `${discussions.total} 个话题` : '提问或分享心得'}
          accent="#0891b2"
        />
      </aside>
    </div>
  )
}

// ── Tab: 法规资料 ────────────────────────────────────────────────────────────

function ResourcesTab({ resources }: { resources: ResourceGroup[] }) {
  const [activeGroup, setActiveGroup] = useState<string | null>(resources[0]?.docType ?? null)
  const [expanded, setExpanded] = useState<string | null>(null)

  if (resources.length === 0) {
    return <EmptyState icon={FileText} title="暂无法规资料" desc="本章节没有关联的法规条款" />
  }

  const group = resources.find(g => g.docType === activeGroup) ?? resources[0]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', gap: 16 }}>
      {/* 资料分组 */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eaeff2', padding: '12px 8px', height: 'fit-content' }}>
        <p style={{ margin: '4px 12px 8px', fontSize: 11, color: '#9aacb6', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>资料类型</p>
        {resources.map(g => {
          const active = g.docType === activeGroup
          return (
            <button
              key={g.docType}
              onClick={() => { setActiveGroup(g.docType); setExpanded(null) }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '8px 12px', border: 'none',
                background: active ? 'rgba(29,111,120,0.08)' : 'transparent',
                borderRadius: 6, cursor: 'pointer', textAlign: 'left',
                color: active ? '#1d6f78' : '#1c3140',
                fontSize: 12.5, fontWeight: active ? 600 : 400,
                marginBottom: 2,
              }}
            >
              <span>{g.docType}</span>
              <span style={{ fontSize: 10, color: active ? '#1d6f78' : '#9aacb6', background: active ? 'rgba(29,111,120,0.15)' : '#eef2f5', padding: '1px 7px', borderRadius: 10, fontWeight: 600 }}>
                {g.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* 资料内容 */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eaeff2', overflow: 'hidden' }}>
        <div style={{ padding: '14px 22px', borderBottom: '1px solid #f0f4f6' }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1c3140' }}>{group.docType}</h2>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9aacb6' }}>共 {group.count} 条相关条款</p>
        </div>
        <div style={{ maxHeight: '62vh', overflowY: 'auto' }}>
          {group.items.map((item) => {
            const isExp = expanded === item.regId
            const articleNum = item.article && /^[0-9]+$/.test(item.article)
              ? `第${item.article}条`
              : item.article ? `第${item.article}条` : item.section || ''
            return (
              <div
                key={item.regId}
                className="reg-item"
                onClick={() => setExpanded(isExp ? null : item.regId)}
                style={{
                  padding: '14px 22px', borderBottom: '1px solid #f6f8fa',
                  cursor: 'pointer', transition: 'background 0.12s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <FileText size={14} color="#1d6f78" style={{ marginTop: 3, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: '#1c3140', lineHeight: 1.6 }}>
                      {articleNum && <span style={{ color: '#1d6f78', marginRight: 8 }}>{articleNum}</span>}
                      {item.chapter && <span style={{ color: '#7a96a4', fontWeight: 400, fontSize: 11 }}>{item.chapter}</span>}
                    </p>
                    {item.content && (
                      <p style={{
                        margin: '6px 0 0', fontSize: 12, color: '#3d5a68', lineHeight: 1.75,
                        ...(isExp ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
                      }}>
                        {item.content}
                      </p>
                    )}
                    {!isExp && item.content && item.content.length > 120 && (
                      <p style={{ margin: '4px 0 0', fontSize: 11, color: '#1d6f78', fontWeight: 600 }}>展开全文 ↓</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Tab: AI 课堂（接入 OpenMAIC） ───────────────────────────────────────────

function ClassroomTab({ chapter }: { chapter: ChapterDetail['chapter'] }) {
  const [topic, setTopic] = useState(`${chapter.displayName} - 核心知识点串讲`)
  const [job, setJob] = useState<{ status: 'idle' | 'running' | 'done' | 'failed'; url: string | null; msg: string }>({ status: 'idle', url: null, msg: '' })

  async function generate() {
    setJob({ status: 'running', url: null, msg: '正在生成课堂…' })
    const token = localStorage.getItem('token')
    try {
      const res = await fetch('/api/openmaic/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requirement: topic }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setJob({ status: 'failed', url: null, msg: data.error || '生成失败' })
        return
      }
      const jobId = data.jobId
      // 轮询
      const poll = async () => {
        await new Promise(r => setTimeout(r, 4000))
        const pr = await fetch(`/api/openmaic/poll/${jobId}`, { headers: { Authorization: `Bearer ${token}` } })
        const pd = await pr.json()
        if (pd.status === 'succeeded') {
          setJob({ status: 'done', url: pd.classroomUrl, msg: '生成完成' })
        } else if (pd.status === 'failed') {
          setJob({ status: 'failed', url: null, msg: pd.error || '生成失败' })
        } else {
          setJob({ status: 'running', url: null, msg: pd.message || '生成中…' })
          poll()
        }
      }
      poll()
    } catch (err) {
      setJob({ status: 'failed', url: null, msg: err instanceof Error ? err.message : '网络错误' })
    }
  }

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eaeff2', padding: '28px 32px', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Sparkles size={18} color="#d97706" />
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1c3140' }}>AI 课堂生成</h2>
      </div>
      <p style={{ margin: '0 0 20px', fontSize: 12, color: '#7a96a4', lineHeight: 1.7 }}>
        基于本章主题自动生成可视化课堂，包含课程大纲、板书、语音讲解等内容。生成时间约 2–5 分钟。
      </p>

      <label style={{ display: 'block', fontSize: 12, color: '#7a96a4', marginBottom: 6, fontWeight: 600 }}>课堂主题</label>
      <input
        value={topic}
        onChange={e => setTopic(e.target.value)}
        disabled={job.status === 'running'}
        placeholder="输入想要学习的主题，可在章节名基础上微调"
        style={{
          width: '100%', padding: '10px 14px', borderRadius: 8,
          border: '1.5px solid #dde6eb', fontSize: 13, color: '#1c3140',
          outline: 'none', marginBottom: 16,
        }}
      />

      <button
        onClick={generate}
        disabled={job.status === 'running' || !topic.trim()}
        style={{
          width: '100%', padding: '12px', borderRadius: 10,
          background: job.status === 'running' ? '#cdd8df' : 'linear-gradient(135deg, #d97706, #b45309)',
          color: '#fff', fontWeight: 700, fontSize: 14, border: 'none',
          cursor: job.status === 'running' ? 'wait' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        {job.status === 'running'
          ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />{job.msg}</>
          : <><Sparkles size={14} />开始生成课堂</>}
      </button>

      {job.status === 'done' && job.url && (
        <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#15803d', display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={14} />课堂生成完成
          </p>
          <a href={job.url} target="_blank" rel="noopener" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            color: '#1d6f78', textDecoration: 'none', fontSize: 12, fontWeight: 600,
          }}>
            打开课堂 <ArrowRight size={12} />
          </a>
        </div>
      )}

      {job.status === 'failed' && (
        <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca' }}>
          <p style={{ margin: 0, fontSize: 12, color: '#b91c1c' }}>{job.msg}</p>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#7a96a4' }}>请确认 OpenMAIC 服务正在运行（端口 3002）</p>
        </div>
      )}

      <div style={{ marginTop: 20, padding: 12, borderRadius: 8, background: '#f8fafc', border: '1px solid #eaeff2' }}>
        <p style={{ margin: 0, fontSize: 11, color: '#7a96a4', lineHeight: 1.7 }}>
          <strong style={{ color: '#1c3140' }}>提示：</strong>AI 课堂会调用 OpenMAIC 服务（本地端口 3002），需要先在终端启动它：
          <code style={{ background: '#eef2f5', padding: '1px 6px', borderRadius: 3, margin: '0 4px', fontSize: 10 }}>pnpm dev -- -p 3002</code>
        </p>
      </div>
    </div>
  )
}

// ── Tab: 章节测验入口 ─────────────────────────────────────────────────────

function QuizTab({ trainingId, quiz, eduLevel }: { trainingId: string; quiz: ChapterDetail['quiz']; eduLevel: string; onComplete?: () => void }) {
  const router = useRouter()
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eaeff2', padding: '36px 32px', maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: 'linear-gradient(135deg, #1d6f78, #35818a)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 18px',
        boxShadow: '0 8px 24px rgba(29,111,120,0.25)',
      }}>
        <ClipboardCheck size={32} color="#fff" />
      </div>
      <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800, color: '#1c3140', letterSpacing: '-0.02em' }}>章节测验</h2>
      <p style={{ margin: '0 0 4px', fontSize: 13, color: '#7a96a4' }}>10 道客观题 · 60 分通过 · 计入课时分</p>
      <p style={{ margin: '0 0 26px', fontSize: 11, color: '#9aacb6' }}>从本章题库随机抽取，包含单选、多选、判断</p>

      {quiz.latestScore !== null && (
        <div style={{
          background: quiz.passed ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${quiz.passed ? '#bbf7d0' : '#fecaca'}`,
          borderRadius: 10, padding: '14px 18px', marginBottom: 22, textAlign: 'left',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ margin: 0, fontSize: 11, color: '#7a96a4' }}>最近一次成绩</p>
              <p style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 800, color: quiz.passed ? '#16a34a' : '#dc2626', letterSpacing: '-0.03em' }}>
                {quiz.latestScore}<span style={{ fontSize: 12, color: '#7a96a4', fontWeight: 500 }}> / 100</span>
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              {quiz.earnedHours !== null && (
                <p style={{ margin: 0, fontSize: 11, color: '#7a96a4' }}>获得课时分</p>
              )}
              {quiz.earnedHours !== null && (
                <p style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700, color: '#1d6f78' }}>+{quiz.earnedHours}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => router.push(`/course/${trainingId}/quiz?eduLevel=${eduLevel}`)}
        style={{
          padding: '12px 36px', borderRadius: 10, border: 'none',
          background: 'linear-gradient(135deg, #183b4b, #1d6f78)',
          color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 8,
          letterSpacing: '0.02em',
          boxShadow: '0 4px 14px rgba(24,59,75,0.18)',
        }}
      >
        {quiz.latestScore !== null ? '再次测验' : '开始测验'} <ArrowRight size={14} />
      </button>
    </div>
  )
}

// ── Tab: 仿真训练入口 ─────────────────────────────────────────────────────

function SimulationTab({ trainingId, chapter }: { trainingId: string; chapter: ChapterDetail['chapter'] }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #1e1b4b 0%, #4c1d95 100%)',
      borderRadius: 12, padding: '32px 36px',
      color: '#fff', maxWidth: 720, margin: '0 auto',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: -30, right: -30, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <Gamepad2 size={20} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>实训仿真 · {chapter.displayName}</h2>
        </div>
        <p style={{ margin: '0 0 22px', fontSize: 13, opacity: 0.78, lineHeight: 1.8 }}>
          进入沉浸式 RPG 工厂场景，扮演 GMP 专员处理本章节的偏差与 CAPA 任务。
          包含剧情调查、Boss 答题战、奖牌结算三个阶段。
        </p>
        <Link
          href={`/simulation?from=${trainingId}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '11px 28px', borderRadius: 10,
            background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 13,
            letterSpacing: '0.02em',
          }}
        >
          进入仿真训练 <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  )
}

// ── Tab: 讨论区 ──────────────────────────────────────────────────────────

function DiscussionTab({ trainingId, discussions, onChange }: { trainingId: string; discussions: Discussion[]; onChange: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tag, setTag] = useState('提问')
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()

  async function postDiscussion() {
    if (!title.trim() || !content.trim()) return
    setSubmitting(true)
    const token = localStorage.getItem('token')
    try {
      const res = await fetch('/api/course/discussions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ trainingId, title, content, tag }),
      })
      if (res.ok) {
        setShowForm(false); setTitle(''); setContent('')
        onChange()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const tagConfig: Record<string, { color: string; bg: string }> = {
    '提问': { color: '#2563eb', bg: '#dbeafe' },
    '心得': { color: '#16a34a', bg: '#dcfce7' },
    '讨论': { color: '#7c3aed', bg: '#ede9fe' },
    '答疑': { color: '#d97706', bg: '#fef3c7' },
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1c3140' }}>章节讨论</h2>
        <button
          onClick={() => setShowForm(s => !s)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '7px 14px', borderRadius: 8,
            background: showForm ? '#fff' : '#1d6f78',
            color: showForm ? '#1d6f78' : '#fff',
            border: showForm ? '1px solid #1d6f78' : 'none',
            cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}
        >
          <Plus size={13} />{showForm ? '取消' : '发起讨论'}
        </button>
      </div>

      {/* 发帖表单 */}
      {showForm && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eaeff2', padding: 18, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {['提问', '心得', '讨论'].map(t => (
              <button key={t} onClick={() => setTag(t)} style={{
                padding: '4px 12px', borderRadius: 20, border: 'none',
                background: tag === t ? tagConfig[t].bg : '#f0f4f6',
                color: tag === t ? tagConfig[t].color : '#7a96a4',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}>{t}</button>
            ))}
          </div>
          <input
            value={title} onChange={e => setTitle(e.target.value)}
            placeholder="标题"
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #dde6eb', fontSize: 13, marginBottom: 8, outline: 'none' }}
          />
          <textarea
            value={content} onChange={e => setContent(e.target.value)}
            placeholder="说说你的问题或想法…"
            rows={4}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #dde6eb', fontSize: 13, marginBottom: 10, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
          />
          <button
            onClick={postDiscussion}
            disabled={submitting || !title.trim() || !content.trim()}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              background: submitting || !title.trim() || !content.trim() ? '#cdd8df' : '#1d6f78',
              color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: submitting || !title.trim() || !content.trim() ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}
          >
            <Send size={11} />{submitting ? '发布中…' : '发布讨论'}
          </button>
        </div>
      )}

      {discussions.length === 0 ? (
        <EmptyState icon={MessageSquare} title="还没有讨论" desc="成为第一个发起讨论的人吧" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {discussions.map(d => {
            const tc = tagConfig[d.tag] ?? tagConfig['讨论']
            return (
              <div
                key={d.id}
                className="disc-card"
                onClick={() => router.push(`/course/${trainingId}/discussions/${d.id}`)}
                style={{
                  background: '#fff', borderRadius: 10,
                  border: '1px solid #eaeff2', padding: '14px 18px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  {d.pinned && <Pin size={12} color="#d97706" />}
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: tc.bg, color: tc.color, fontWeight: 600 }}>
                    {d.tag}
                  </span>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#1c3140', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.title}
                  </p>
                </div>
                <p style={{
                  margin: '0 0 8px', fontSize: 12, color: '#3d5a68', lineHeight: 1.6,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {d.content}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 10, color: '#9aacb6' }}>
                  <span>{d.author}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><MessageCircle size={11} />{d.replyCount}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Eye size={11} />{d.viewCount}</span>
                  <span style={{ marginLeft: 'auto' }}>{formatRelative(d.createdAt)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Tab: 作业 ────────────────────────────────────────────────────────────

function AssignmentTab({ assignments, onChange }: { assignments: Assignment[]; onChange: () => void }) {
  const [submitTo, setSubmitTo] = useState<number | null>(null)
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (!submitTo || !content.trim()) return
    setSubmitting(true)
    const token = localStorage.getItem('token')
    try {
      const res = await fetch(`/api/course/assignments/${submitTo}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content }),
      })
      if (res.ok) {
        setSubmitTo(null); setContent('')
        onChange()
      }
    } finally { setSubmitting(false) }
  }

  if (assignments.length === 0) {
    return <EmptyState icon={Edit3} title="暂无作业" desc="教师尚未为本章布置作业" />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {assignments.map(a => {
        const overdue = a.dueDate && new Date(a.dueDate) < new Date()
        const submitted = !!a.mySubmission
        return (
          <div key={a.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #eaeff2', padding: '18px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: '#ede9fe', color: '#7c3aed', fontWeight: 600 }}>
                    {a.assignmentType}
                  </span>
                  <span style={{ fontSize: 10, color: '#7a96a4' }}>满分 {a.maxScore}</span>
                  {a.dueDate && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: overdue ? '#dc2626' : '#7a96a4' }}>
                      <Calendar size={10} />截止 {new Date(a.dueDate).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <h3 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: '#1c3140' }}>{a.title}</h3>
                <p style={{ margin: 0, fontSize: 12, color: '#3d5a68', lineHeight: 1.7 }}>{a.description}</p>
              </div>
              {submitted && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 11, padding: '4px 10px', borderRadius: 20,
                  background: a.mySubmission!.graded ? '#dcfce7' : '#fef3c7',
                  color: a.mySubmission!.graded ? '#16a34a' : '#d97706',
                  fontWeight: 600,
                }}>
                  <CheckCircle2 size={11} />
                  {a.mySubmission!.graded ? `${a.mySubmission!.score} / ${a.maxScore}` : '已提交'}
                </span>
              )}
            </div>

            {submitTo === a.id ? (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f0f4f6' }}>
                <textarea
                  value={content} onChange={e => setContent(e.target.value)}
                  placeholder="写下你的作业内容（支持长文本）…"
                  rows={6}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #dde6eb', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', marginBottom: 10 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={submit} disabled={submitting || !content.trim()} style={{
                    padding: '7px 18px', borderRadius: 7, border: 'none',
                    background: submitting || !content.trim() ? '#cdd8df' : '#1d6f78',
                    color: '#fff', fontSize: 12, fontWeight: 600,
                    cursor: submitting || !content.trim() ? 'not-allowed' : 'pointer',
                  }}>{submitting ? '提交中…' : '提交作业'}</button>
                  <button onClick={() => { setSubmitTo(null); setContent('') }} style={{
                    padding: '7px 18px', borderRadius: 7,
                    background: 'transparent', color: '#7a96a4',
                    border: '1px solid #dde6eb', cursor: 'pointer', fontSize: 12,
                  }}>取消</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setSubmitTo(a.id); setContent(a.mySubmission?.id ? '' : '') }} disabled={!!overdue && !submitted} style={{
                marginTop: 10, padding: '6px 14px', borderRadius: 7,
                background: overdue && !submitted ? '#f0f4f6' : 'rgba(29,111,120,0.1)',
                color: overdue && !submitted ? '#9aacb6' : '#1d6f78',
                border: 'none', fontSize: 12, fontWeight: 600,
                cursor: overdue && !submitted ? 'not-allowed' : 'pointer',
              }}>
                {submitted ? '重新提交' : overdue ? '已截止' : '开始作答'}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Utility components ─────────────────────────────────────────────────────

function Stat({ label, value, suffix, color, icon: Icon }: { label: string; value: number | string; suffix?: string; color: string; icon: React.ComponentType<{ size?: number; color?: string }> }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <Icon size={11} color={color} />
        <span style={{ fontSize: 11, color: '#7a96a4' }}>{label}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color, letterSpacing: '-0.03em', lineHeight: 1 }}>
        {value}{suffix && <span style={{ fontSize: 12, color: '#7a96a4', fontWeight: 500, marginLeft: 2 }}>{suffix}</span>}
      </div>
    </div>
  )
}

function QuickAction({ onClick, icon: Icon, title, desc, accent }: { onClick: () => void; icon: React.ComponentType<{ size?: number; color?: string }>; title: string; desc: string; accent: string }) {
  return (
    <button onClick={onClick} style={{
      background: '#fff', borderRadius: 12, border: '1px solid #eaeff2',
      padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
      display: 'flex', alignItems: 'center', gap: 12,
      transition: 'all 0.18s',
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateX(2px)'; e.currentTarget.style.borderColor = accent }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.borderColor = '#eaeff2' }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 9,
        background: `${accent}15`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={16} color={accent} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1c3140' }}>{title}</p>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#7a96a4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{desc}</p>
      </div>
      <ArrowRight size={13} color="#cdd8df" />
    </button>
  )
}

function EmptyState({ icon: Icon, title, desc }: { icon: React.ComponentType<{ size?: number; color?: string }>; title: string; desc: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eaeff2', padding: '60px 30px', textAlign: 'center' }}>
      <div style={{ width: 48, height: 48, borderRadius: 12, background: '#f4f6f8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <Icon size={20} color="#cdd8df" />
      </div>
      <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: '#1c3140' }}>{title}</p>
      <p style={{ margin: 0, fontSize: 12, color: '#9aacb6' }}>{desc}</p>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div style={{ padding: 60, textAlign: 'center', color: '#7a96a4' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ width: 32, height: 32, border: '3px solid #eef2f5', borderTopColor: '#1d6f78', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 1s linear infinite' }} />
      <p style={{ margin: 0, fontSize: 13 }}>加载章节数据中…</p>
    </div>
  )
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min}分钟前`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}小时前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}天前`
  return new Date(iso).toLocaleDateString()
}
