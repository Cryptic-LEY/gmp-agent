'use client'

import { useEffect, useState, useRef, useMemo, use, type CSSProperties, type RefObject, type WheelEvent as ReactWheelEvent } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, FileText, Sparkles, ClipboardCheck, Gamepad2, MessageSquare,
  CheckCircle2, Clock, Trophy, Target, BookOpen, ArrowRight, Edit3,
  Pin, MessageCircle, Eye, Plus, Send, Calendar, Award, Loader2,
  Video, StickyNote, Highlighter, Download, PlayCircle, ListTree, Search,
  PauseCircle, Volume2, VolumeX, Maximize2, Minimize2, AlertCircle, RotateCcw, X, Network,
  type LucideIcon,
} from 'lucide-react'
import {
  createFallbackAssignmentQuestions,
  extractAssignmentQuestions,
  stripAssignmentQuestionBlock,
  type CourseAssignmentQuestion,
} from '@/lib/course-assignment-questions'
import GraphPanel, { type GraphData } from '../../dashboard/GraphPanel'

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
  questions?: CourseAssignmentQuestion[]
  submitted: boolean
  mySubmission: {
    id: number
    content: string
    score: number | null
    feedback: string | null
    submittedAt: string
    gradedAt: string | null
    gradedBy?: 'ai' | 'teacher'
    graded: boolean
  } | null
}

interface AssignmentSubmitResult {
  assignmentTitle: string
  score: number | null
  maxScore: number
  feedback: string | null
  earnedHours: number | null
  earnedCredits?: number | null
}

interface QuizAttemptMeta {
  usedAttempts: number
  nextAttemptNumber: number
  maxAttempts: number
  retakeLimit: number
  remainingRetakes: number
  exhausted: boolean
}

interface Courseware {
  lessonId: string
  title: string
  description: string | null
  sortOrder: number
  pptUrl: string | null
  pptPageCount: number
  videoUrl: string | null
  videoDuration: number
  passScore: number
  updatedAt: string
  progress?: {
    viewedPages: number[]
    pptProgress: number
    pptCompleted: boolean
    videoProgress: number
    videoWatchedSeconds?: number
    videoMaxPosition?: number
    videoCompleted: boolean
    annotationCount: number
  }
}

interface QuizGate {
  unlocked: boolean
  totalPptPages: number
  viewedPptPages: number
  missingPages: number
  completedLessons: number
  requiredLessons: number
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
  courseware: Courseware[]
  quiz: {
    latestScore: number | null
    earnedHours: number | null
    earnedCredits?: number | null
    totalEarnedHours: number
    totalEarnedCredits?: number
    assignmentEarnedHours: number
    assignmentEarnedCredits?: number
    maxCredits?: number
    completedAt: string | null
    passed: boolean
    published: boolean
    title: string
    description: string | null
    questionCount: number
    passScore: number
    durationMinutes: number
    attempt: QuizAttemptMeta
  }
  quizGate: QuizGate
  discussions: { total: number; list: Discussion[] }
  assignments: Assignment[]
  studyMinutes: number
}

type Tab = 'overview' | 'resources' | 'classroom' | 'quiz' | 'simulation' | 'discussion' | 'assignment' | 'knowledge'
type StudioSideTab = 'catalog' | 'discussion' | 'notes' | 'marks'
type StudioResource = 'ppt' | 'video'
type AutoCoursewareStatus = 'idle' | 'running' | 'succeeded' | 'failed'

interface LessonDetail {
  lessonId: string
  title: string
  pptUrl: string | null
  pptPageCount: number
  videoUrl: string | null
  videoDuration: number
  progress: {
    viewedPages: number[]
    noteContent: string
    pptProgress: number
    videoProgress: number
    videoWatchedSeconds: number
    videoMaxPosition: number
    pptCompleted: boolean
    videoCompleted: boolean
    annotationCount: number
    completed: boolean
  }
}

interface SlidePreview {
  page: number
  title: string
  lines: string[]
  image?: string | null
  svg?: string | null
  notes?: string | null
}

interface SlideDeckPreview {
  previewType: 'empty' | 'pdf' | 'pptx' | 'unsupported'
  url?: string
  slides: SlidePreview[]
  error?: string
}

interface LessonAnnotation {
  id: number
  resource: StudioResource
  pageNumber: number | null
  videoTime: number | null
  text: string
  createdAt: string
}

interface LessonProgressUpdate {
  viewedPages?: number[]
  pptCompleted?: boolean
  pptProgress?: number
  videoCompleted?: boolean
  videoProgress?: number
  videoWatchedSeconds?: number
  videoMaxPosition?: number
  lessonScore?: number
  completed?: boolean
}

interface VideoProgressReport {
  currentTime: number
  watchedSeconds: number
  watchDelta: number
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function ChapterDetailPage({ params }: { params: Promise<{ trainingId: string }> }) {
  const { trainingId } = use(params)
  const router = useRouter()
  const [data, setData] = useState<ChapterDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('classroom')
  const enterRef = useRef<number>(Date.now())

  const loadData = () => {
    const token = localStorage.getItem('token')
    if (!token) { router.push('/login'); return }
    fetch(`/api/course/chapter/${trainingId}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
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
  const coursewareProgressParts = (data.courseware ?? []).flatMap(item => [
    ...(item.pptUrl ? [item.progress?.pptProgress ?? 0] : []),
    ...(item.videoUrl ? [item.progress?.videoProgress ?? 0] : []),
  ])
  const coursewareProgressBadge = coursewareProgressParts.length > 0
    ? `${Math.round(coursewareProgressParts.reduce((sum, value) => sum + value, 0) / coursewareProgressParts.length)}%`
    : null

  return (
    <div style={COURSE_DETAIL_PAGE}>
      <style>{`
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px);} to{opacity:1;transform:translateY(0);} }
        @keyframes spin { from{transform:rotate(0deg);} to{transform:rotate(360deg);} }
        .tab-content { animation: fadeIn 0.3s ease both; }
        .tab-btn:hover { background: rgba(29,111,120,0.08) !important; }
        .reg-item:hover { background: #f4f7f9 !important; }
        .disc-card:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(24,59,75,0.07); }
        .disc-card { transition: all 0.2s; }
      `}</style>

      {/* ── 紧凑章节栏 ──────────────────────────────────────────────── */}
      <div style={CHAPTER_COMPACT_BAR}>
        <Link href="/course" style={CHAPTER_BACK_LINK}>
          <ChevronLeft size={14} /> 返回课程目录
        </Link>
        <span style={CHAPTER_ID_BADGE}>{chapter.trainingId}</span>
        <strong style={CHAPTER_COMPACT_TITLE}>{chapter.displayName}</strong>
        <span style={CHAPTER_COMPACT_META}>
          {chapter.eduLevel === 'undergraduate' ? '本科' : '专科'} · {chapter.hours} 学时 · {knowledgePoints.length} 知识点 · {totalResources} 条法规资料
        </span>
        <span style={CHAPTER_QUIZ_STATUS}>
          最近测验 {quiz.latestScore !== null ? `${quiz.latestScore}分` : '未参加'}
        </span>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #eaeff2',
        padding: '0 20px', display: 'flex', gap: 4, overflowX: 'auto',
        position: 'sticky', top: 58, zIndex: 10,
      }}>
        {([
          { id: 'classroom',  label: '课程学习', icon: PlayCircle,     badge: coursewareProgressBadge ?? (data.courseware?.length || null) },
          { id: 'quiz',       label: '章节测验', icon: ClipboardCheck, badge: quiz.latestScore !== null ? `${quiz.latestScore}分` : null },
          { id: 'assignment', label: '作业',     icon: Edit3,          badge: assignments.length > 0 ? assignments.length : null },
          { id: 'resources',  label: '法规资料', icon: FileText,       badge: totalResources },
          { id: 'knowledge',  label: '章节知识图谱', icon: Network,     badge: knowledgePoints.length || null },
        ] as const).map(({ id, label, icon: Icon, badge }) => {
          const active = tab === id
          return (
            <button
              key={id} onClick={() => {
                setTab(id as Tab)
                if (id === 'quiz') loadData()
              }}
              className="tab-btn"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 14px', border: 'none', background: 'transparent',
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
      <div className="tab-content" style={COURSE_TAB_CONTENT} key={tab}>
        {tab === 'classroom'  && <LearningStudioTab trainingId={trainingId} data={data} chapter={chapter} courseware={data.courseware ?? []} discussions={discussions.list} setTab={setTab} onChange={loadData} />}
        {tab === 'quiz'       && <QuizTab trainingId={trainingId} quiz={quiz} gate={data.quizGate} eduLevel={chapter.eduLevel} setTab={setTab} />}
        {tab === 'assignment' && <AssignmentTab assignments={assignments} onChange={loadData} />}
        {tab === 'resources'  && <ResourcesTab resources={resources} />}
        {tab === 'knowledge'  && <KnowledgeMapTab data={data} />}
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
          icon={PlayCircle} title="课程学习"
          desc="浏览本章课件内容"
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

// ── Tab: 章节知识图谱 ─────────────────────────────────────────────────────

function KnowledgeMapTab({ data }: { data: ChapterDetail }) {
  const points = data.knowledgePoints
  const graphData = useMemo(
    () => buildChapterGraphData(points, data.chapter.displayName),
    [points, data.chapter.displayName],
  )

  if (points.length === 0) {
    return <EmptyState icon={Network} title="暂无章节知识图谱" desc="本章节暂未关联知识点" />
  }

  return (
    <div style={KNOWLEDGE_GRAPH_PANEL}>
      <div style={KNOWLEDGE_GRAPH_HEAD}>
        <Network size={16} color="#1d6f78" />
        <strong>章节知识图谱</strong>
        <span style={{ marginLeft: 'auto', color: '#6b8a98', fontSize: 12, fontWeight: 800 }}>{data.chapter.displayName} · {points.length} 个知识点</span>
      </div>
      <div style={KNOWLEDGE_GRAPH_CANVAS}>
        <GraphPanel type="knowledge" token="" dataOverride={graphData} minHeight={560} />
      </div>
    </div>
  )
}

function buildChapterGraphData(points: KnowledgePoint[], chapterName: string): GraphData {
  const categoryNames = Array.from(new Set(points.map(point => point.taskName?.trim() || '项目整体')))
  const categoryIndex = Object.fromEntries(categoryNames.map((name, index) => [name, index]))
  const nodes = points.map(point => ({
    id: point.kpId,
    name: point.title,
    category: categoryIndex[point.taskName?.trim() || '项目整体'] ?? 0,
    project: chapterName,
    task: point.taskName || '项目整体',
    difficulty: point.difficulty || 3,
    symbolSize: 8 + (point.difficulty || 3) * 2,
  }))

  const edges: Array<{ source: string; target: string }> = []
  const byTask = new Map<string, KnowledgePoint[]>()
  for (const point of points) {
    const key = point.taskName?.trim() || '项目整体'
    byTask.set(key, [...(byTask.get(key) ?? []), point])
  }
  for (const taskPoints of byTask.values()) {
    for (let index = 0; index < taskPoints.length - 1; index += 1) {
      edges.push({ source: taskPoints[index].kpId, target: taskPoints[index + 1].kpId })
    }
  }

  return {
    nodes,
    edges,
    categories: categoryNames.map(name => ({ name })),
  }
}

// ── Tab: 课程学习 ─────────────────────────────────────────────────────────

function LearningStudioTab({
  trainingId,
  data,
  chapter,
  courseware,
  discussions,
  setTab,
  onChange,
}: {
  trainingId: string
  data: ChapterDetail
  chapter: ChapterDetail['chapter']
  courseware: Courseware[]
  discussions: Discussion[]
  setTab: (tab: Tab) => void
  onChange: () => void
}) {
  const router = useRouter()
  const [selectedLessonId, setSelectedLessonId] = useState(courseware[0]?.lessonId ?? '')
  const [activeResource, setActiveResource] = useState<StudioResource>('ppt')
  const [sideTab, setSideTab] = useState<StudioSideTab>('catalog')
  const [lessonDetail, setLessonDetail] = useState<LessonDetail | null>(null)
  const [slideDeck, setSlideDeck] = useState<SlideDeckPreview | null>(null)
  const [currentSlide, setCurrentSlide] = useState(1)
  const [noteDraft, setNoteDraft] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [markInput, setMarkInput] = useState('')
  const [annotations, setAnnotations] = useState<LessonAnnotation[]>([])
  const [loadingAnnotations, setLoadingAnnotations] = useState(false)
  const [notice, setNotice] = useState('')
  const [discussionTitle, setDiscussionTitle] = useState('')
  const [discussionContent, setDiscussionContent] = useState('')
  const [discussionTag, setDiscussionTag] = useState('提问')
  const [submittingDiscussion, setSubmittingDiscussion] = useState(false)
  const [slideJumpRequest, setSlideJumpRequest] = useState(0)
  const [automationNotice, setAutomationNotice] = useState('')
  const [coursewareJob, setCoursewareJob] = useState<{ status: AutoCoursewareStatus; progress: number; message: string }>({
    status: 'idle',
    progress: 0,
    message: '',
  })
  const videoRef = useRef<HTMLVideoElement>(null)
  const lastVideoReportRef = useRef(0)
  const slideCatalogRefs = useRef<Record<number, HTMLButtonElement | null>>({})
  const onChangeRef = useRef(onChange)
  const automationTriggeredRef = useRef(false)
  const coursewareTriggeredRef = useRef(false)
  const coursewarePollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    return () => {
      if (coursewarePollRef.current) clearTimeout(coursewarePollRef.current)
    }
  }, [])

  async function saveGeneratedCourseware(token: string, result: Record<string, unknown>) {
    const pptUrl = String(result.pptUrl || result.outlineUrl || result.url || '').trim()
    const pptPageCount = Math.max(1, Number(result.sceneCount ?? result.totalScenes ?? result.slideCount ?? 18))
    if (!pptUrl) throw new Error('AI 已完成生成，但没有返回 PPT 文件地址')

    const response = await fetch('/api/course/automation/courseware', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        trainingId,
        pptUrl,
        pptPageCount,
        title: `${chapter.displayName} 教学PPT`,
        description: `${chapter.displayName} 的 AI 自动生成教学课件`,
        eduLevel: chapter.eduLevel,
      }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(payload?.error || 'AI 课件保存失败')
    return payload
  }

  async function pollGeneratedCourseware(jobId: string, token: string) {
    try {
      const response = await fetch(`/api/openmaic/poll/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.success) throw new Error(data?.error || 'AI 课件生成状态读取失败')

      setCoursewareJob({
        status: 'running',
        progress: typeof data.progress === 'number' ? data.progress : 0,
        message: data.message || 'AI 正在生成章节 PPT...',
      })

      if (!data.done) {
        coursewarePollRef.current = setTimeout(() => { void pollGeneratedCourseware(jobId, token) }, 4500)
        return
      }

      if (data.status !== 'succeeded' || !data.result) throw new Error(data.error || 'AI 课件生成失败')
      setCoursewareJob({ status: 'running', progress: 96, message: 'PPT 已生成，正在生成章节测验和作业...' })
      const saved = await saveGeneratedCourseware(token, data.result as Record<string, unknown>)
      setCoursewareJob({
        status: 'succeeded',
        progress: 100,
        message: saved?.message || 'AI 课件、章节测验和作业已生成',
      })
      setAutomationNotice('')
      onChangeRef.current()
    } catch (error) {
      setCoursewareJob({
        status: 'failed',
        progress: 0,
        message: error instanceof Error ? error.message : 'AI 课件自动生成失败',
      })
    }
  }

  async function startAutoCoursewareGeneration() {
    const token = localStorage.getItem('token')
    if (!token) return
    setCoursewareJob({ status: 'running', progress: 4, message: 'AI 正在准备章节 PPT...' })

    try {
      const response = await fetch('/api/openmaic/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          requirement: `${chapter.displayName} 教学PPT`,
          outputFormat: 'pptx',
          trainingId,
          teachingGoals: `围绕 ${chapter.displayName} 建立 GMP 法规理解、质量风险识别和现场执行能力。`,
          keyPoints: `${chapter.projectName || chapter.displayName}；法规依据；质量风险；现场案例；CAPA 闭环。`,
          caseContext: `结合 ${chapter.displayName} 的制药现场场景、检查缺陷和学生课程学习任务生成课件。`,
          studentLevel: chapter.eduLevel === 'undergraduate' ? '本科药学、制药工程与药品质量管理相关学生' : '高职药学、制药工程与药品质量管理相关学生',
          classHours: '2 学时',
          slideCount: 18,
          styleHint: 'GMP 培训课件风格：封面、学习目标、法规体系、质量风险、案例研讨、课堂小结。',
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.success || !data.jobId) throw new Error(data?.error || 'AI 课件生成任务创建失败')
      setCoursewareJob({ status: 'running', progress: 8, message: data.message || 'AI 课件生成任务已创建...' })
      await pollGeneratedCourseware(data.jobId as string, token)
    } catch (error) {
      setCoursewareJob({
        status: 'failed',
        progress: 0,
        message: error instanceof Error ? error.message : 'AI 课件自动生成失败',
      })
    }
  }

  useEffect(() => {
    if (courseware.length > 0 || coursewareTriggeredRef.current) return
    coursewareTriggeredRef.current = true
    void startAutoCoursewareGeneration()
  }, [courseware.length, trainingId])

  useEffect(() => {
    const hasUnstructuredAiAssignment = data.assignments.some(assignment =>
      /AI|题组/.test(`${assignment.assignmentType} ${assignment.title}`) &&
      extractAssignmentQuestions(assignment.description).length === 0
    )
    const needsAutomation = !data.quiz.published || data.assignments.length === 0 || hasUnstructuredAiAssignment
    if (!data.quizGate.unlocked || data.quizGate.totalPptPages === 0 || !needsAutomation) return
    if (automationTriggeredRef.current) return

    const token = localStorage.getItem('token')
    if (!token) return
    automationTriggeredRef.current = true
    setAutomationNotice('AI 正在根据已浏览 PPT 生成章节测验和作业...')

    fetch('/api/course/automation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ trainingId }),
    })
      .then(async response => {
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.error || 'AI 自动生成暂时失败')
        setAutomationNotice('')
        onChangeRef.current()
      })
      .catch(error => {
        setAutomationNotice(error instanceof Error ? error.message : 'AI 自动生成暂时失败，教师可稍后在后台生成或编辑')
      })
  }, [trainingId, data.quiz.published, data.assignments, data.quizGate.unlocked, data.quizGate.totalPptPages])

  useEffect(() => {
    if (!selectedLessonId && courseware[0]?.lessonId) setSelectedLessonId(courseware[0].lessonId)
  }, [courseware, selectedLessonId])

  const selectedLesson = courseware.find(item => item.lessonId === selectedLessonId) ?? courseware[0] ?? null
  const selectedLessonResourceKey = selectedLesson
    ? `${selectedLesson.lessonId}|${selectedLesson.pptUrl ?? ''}|${selectedLesson.updatedAt ?? ''}`
    : ''
  const filteredCourseware = courseware.filter(item => {
    const keyword = catalogSearch.trim().toLowerCase()
    if (!keyword) return true
    return `${item.title} ${item.description ?? ''}`.toLowerCase().includes(keyword)
  })
  const slides = slideDeck?.slides ?? []
  const totalResources = data.resources.reduce((sum, group) => sum + group.count, 0)
  const masteryCount = data.knowledgePoints.filter(item => item.status === 'mastered').length
  const learningCount = data.knowledgePoints.filter(item => item.status === 'learning').length
  const masteryPct = data.knowledgePoints.length > 0
    ? Math.round((masteryCount + learningCount * 0.6) / data.knowledgePoints.length * 100)
    : 0
  const pptLessons = courseware.filter(item => item.pptUrl)
  const videoLessons = courseware.filter(item => item.videoUrl)
  const averagePptProgress = pptLessons.length > 0
    ? Math.round(pptLessons.reduce((sum, item) => sum + (item.progress?.pptProgress ?? 0), 0) / pptLessons.length)
    : 0
  const averageVideoProgress = videoLessons.length > 0
    ? Math.round(videoLessons.reduce((sum, item) => sum + (item.progress?.videoProgress ?? 0), 0) / videoLessons.length)
    : 0
  const resourceProgressParts = [
    ...pptLessons.map(item => item.progress?.pptProgress ?? 0),
    ...videoLessons.map(item => item.progress?.videoProgress ?? 0),
  ]
  const resourceProgressPct = resourceProgressParts.length > 0
    ? Math.round(resourceProgressParts.reduce((sum, value) => sum + value, 0) / resourceProgressParts.length)
    : 0
  const selectedProgress = lessonDetail && selectedLesson && lessonDetail.lessonId === selectedLesson.lessonId
    ? lessonDetail.progress
    : selectedLesson?.progress
  const selectedVideoWatchedSeconds = Math.max(0, Math.floor(selectedProgress?.videoWatchedSeconds ?? 0))
  const selectedVideoDuration = Math.max(0, Math.floor(selectedLesson?.videoDuration ?? 0))
  const selectedVideoProgress = selectedVideoDuration > 0
    ? Math.min(100, Math.round((selectedVideoWatchedSeconds / selectedVideoDuration) * 100))
    : (selectedProgress?.videoProgress ?? 0)
  const studyTimeText = data.studyMinutes >= 60
    ? `${Math.floor(data.studyMinutes / 60)}小时${data.studyMinutes % 60}分`
    : `${data.studyMinutes}分钟`

  function isCoursewareComplete(item: Courseware) {
    const progress = item.lessonId === lessonDetail?.lessonId ? lessonDetail.progress : item.progress
    const pptDone = !item.pptUrl || Boolean(progress?.pptCompleted) || (progress?.pptProgress ?? 0) >= 100
    const videoDone = !item.videoUrl || Boolean(progress?.videoCompleted) || (progress?.videoProgress ?? 0) >= 95
    return pptDone && videoDone
  }

  function jumpToSlide(page: number) {
    setActiveResource('ppt')
    setCurrentSlide(page)
    setSlideJumpRequest(value => value + 1)
  }

  useEffect(() => {
    if (!selectedLesson?.lessonId) return
    let cancelled = false
    const token = localStorage.getItem('token')
    if (!token) return

    setLessonDetail(null)
    setSlideDeck(null)
    setAnnotations([])
    setCurrentSlide(1)
    setNotice('')
    setLoadingAnnotations(true)

    Promise.all([
      fetch(`/api/course/lessons/${selectedLesson.lessonId}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
        .then(res => res.ok ? res.json() : null),
      fetch(`/api/course/lessons/${selectedLesson.lessonId}/slides?v=${encodeURIComponent(selectedLessonResourceKey)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
        .then(res => res.ok ? res.json() : null),
      fetch(`/api/course/lessons/${selectedLesson.lessonId}/annotations`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
        .then(res => res.ok ? res.json() : null),
    ]).then(([lesson, deck, annotationData]) => {
      if (cancelled) return
      if (lesson) {
        setLessonDetail(lesson as LessonDetail)
        setNoteDraft((lesson as LessonDetail).progress?.noteContent ?? '')
      }
      if (deck) setSlideDeck(deck as SlideDeckPreview)
      setAnnotations(Array.isArray(annotationData?.annotations) ? annotationData.annotations : [])
    }).catch(() => {
      if (!cancelled) setSlideDeck({ previewType: 'unsupported', slides: [], error: '课件读取失败' })
    }).finally(() => {
      if (!cancelled) setLoadingAnnotations(false)
    })

    return () => { cancelled = true }
  }, [selectedLessonResourceKey])

  useEffect(() => {
    if (activeResource !== 'ppt' || !selectedLesson?.lessonId) return
    void reportLessonProgress(selectedLesson.lessonId, { type: 'ppt', pageNumber: currentSlide }).then(progress => {
      if (!progress) return
      setLessonDetail(previous => previous
        ? {
          ...previous,
          progress: {
            ...previous.progress,
            viewedPages: progress.viewedPages ?? previous.progress.viewedPages,
            pptProgress: progress.pptProgress ?? previous.progress.pptProgress,
            pptCompleted: Boolean(progress.pptCompleted),
            completed: Boolean(progress.completed),
          },
        }
        : previous)
      if (progress.pptCompleted && !lessonDetail?.progress?.pptCompleted) onChangeRef.current()
    })
  }, [activeResource, currentSlide, selectedLesson?.lessonId, lessonDetail?.progress?.pptCompleted])

  async function saveNote() {
    if (!selectedLesson) return
    const token = localStorage.getItem('token')
    if (!token) return
    setSavingNote(true)
    try {
      const res = await fetch(`/api/course/lessons/${selectedLesson.lessonId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ noteContent: noteDraft }),
      })
      if (res.ok) {
        setNotice('笔记已保存')
        onChangeRef.current()
      }
    } finally {
      setSavingNote(false)
    }
  }

  function handleVideoProgress(report?: VideoProgressReport) {
    if (!selectedLesson || !videoRef.current) return
    const now = Date.now()
    if (now - lastVideoReportRef.current < 900 && !report) return
    lastVideoReportRef.current = now
    const currentTime = Math.max(0, Math.floor(report?.currentTime ?? videoRef.current.currentTime))
    const watchedSeconds = Math.max(0, Math.floor(report?.watchedSeconds ?? currentTime))
    const watchDelta = Math.max(0, Math.min(4, Number(report?.watchDelta ?? 0)))
    void reportLessonProgress(selectedLesson.lessonId, {
      type: 'video',
      currentTime,
      watchedSeconds,
      watchDelta,
    }).then(progress => {
      if (!progress) return
      setLessonDetail(previous => previous
        ? {
          ...previous,
          progress: {
            ...previous.progress,
            videoProgress: progress.videoProgress ?? previous.progress.videoProgress,
            videoWatchedSeconds: progress.videoWatchedSeconds ?? previous.progress.videoWatchedSeconds,
            videoMaxPosition: progress.videoMaxPosition ?? previous.progress.videoMaxPosition,
            videoCompleted: Boolean(progress.videoCompleted),
            completed: Boolean(progress.completed),
          },
        }
        : previous)
    })
  }

  async function addMark() {
    if (!selectedLesson) return
    const token = localStorage.getItem('token')
    if (!token) return
    const videoTime = Math.floor(videoRef.current?.currentTime ?? 0)
    const text = markInput.trim() || (activeResource === 'ppt'
      ? `第 ${currentSlide} 页重点`
      : `视频 ${formatSeconds(videoTime)} 重点`)
    const res = await fetch(`/api/course/lessons/${selectedLesson.lessonId}/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        resource: activeResource,
        pageNumber: activeResource === 'ppt' ? currentSlide : undefined,
        videoTime: activeResource === 'video' ? videoTime : undefined,
        text,
      }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.annotation) {
      setNotice(data?.error || '标注保存失败')
      return
    }
    setAnnotations(previous => [data.annotation as LessonAnnotation, ...previous].slice(0, 50))
    setLessonDetail(previous => previous
      ? {
        ...previous,
        progress: {
          ...previous.progress,
          annotationCount: data.annotationCount ?? previous.progress.annotationCount,
          completed: Boolean(data.completed),
        },
      }
      : previous)
    setMarkInput('')
    setNotice('标注已保存')
    setSideTab('marks')
    onChangeRef.current()
  }

  function openAnnotation(annotation: LessonAnnotation) {
    if (annotation.resource === 'ppt' && annotation.pageNumber) {
      jumpToSlide(annotation.pageNumber)
      return
    }
    if (annotation.resource === 'video') {
      setActiveResource('video')
      window.setTimeout(() => {
        if (videoRef.current && annotation.videoTime !== null) {
          videoRef.current.currentTime = annotation.videoTime
        }
      }, 80)
    }
  }

  async function postInlineDiscussion() {
    if (!discussionTitle.trim() || !discussionContent.trim()) return
    const token = localStorage.getItem('token')
    if (!token) return
    setSubmittingDiscussion(true)
    try {
      const res = await fetch('/api/course/discussions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          trainingId,
          title: discussionTitle.trim(),
          content: discussionContent.trim(),
          tag: discussionTag,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setNotice(data?.error || '讨论发布失败')
        return
      }
      setDiscussionTitle('')
      setDiscussionContent('')
      setDiscussionTag('提问')
      setNotice('讨论已发布')
      onChangeRef.current()
    } finally {
      setSubmittingDiscussion(false)
    }
  }

  function handleSideWheel(event: ReactWheelEvent<HTMLDivElement>) {
    const node = event.currentTarget
    if (node.scrollHeight > node.clientHeight + 1) {
      event.stopPropagation()
    }
  }

  if (!selectedLesson) {
    const running = coursewareJob.status === 'running'
    const failed = coursewareJob.status === 'failed'
    return (
      <div style={STUDIO_EMPTY}>
        {running ? <Loader2 size={34} color="#1d6f78" /> : failed ? <AlertCircle size={34} color="#b91c1c" /> : <Sparkles size={34} color="#1d6f78" />}
        <strong>{running ? 'AI 正在生成本章 PPT' : failed ? 'AI 课件生成暂时失败' : '正在准备本章课程学习内容'}</strong>
        <span>{coursewareJob.message || '系统会自动生成 PPT，并同步生成章节测验和作业。'}</span>
        {running && (
          <div style={{ width: 'min(360px, 82vw)', display: 'grid', gap: 8 }}>
            <div style={{ height: 8, borderRadius: 999, background: 'rgba(31,71,92,0.08)', overflow: 'hidden' }}>
              <span style={{ display: 'block', width: `${Math.max(6, coursewareJob.progress)}%`, height: '100%', background: 'linear-gradient(90deg,#1d6f78,#409eff)', transition: 'width 0.3s ease' }} />
            </div>
            <small style={{ color: '#6b8a98' }}>{Math.round(coursewareJob.progress)}%</small>
          </div>
        )}
        {failed && (
          <button
            type="button"
            onClick={() => {
              coursewareTriggeredRef.current = true
              void startAutoCoursewareGeneration()
            }}
            style={STUDIO_PRIMARY_BUTTON}
          >
            <RotateCcw size={14} />重新生成
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={STUDIO_SHELL}>
      <div style={STUDIO_BODY}>
        <main style={STUDIO_MAIN}>
          <div style={STUDIO_RESOURCE_BAR}>
            <div>
              <h2 style={{ margin: 0, color: '#1f2f3d', fontSize: 20, fontWeight: 800 }}>{selectedLesson.title}</h2>
              <p style={{ margin: '3px 0 0', color: '#748494', fontSize: 12 }}>
                {selectedLesson.description || `${chapter.displayName} 课程学习资源`}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button onClick={() => setActiveResource('ppt')} style={resourceButton(activeResource === 'ppt')}>
                <FileText size={15} />PPT
              </button>
              <button onClick={() => setActiveResource('video')} style={resourceButton(activeResource === 'video')}>
                <Video size={15} />视频
              </button>
              {selectedLesson.pptUrl && (
                <a href={selectedLesson.pptUrl} target="_blank" rel="noopener" style={STUDIO_ICON_LINK}>
                  <Download size={15} />原文件
                </a>
              )}
            </div>
          </div>

          <div style={activeResource === 'video' ? { ...STUDIO_VIEWER, ...STUDIO_VIDEO_VIEWER } : STUDIO_VIEWER}>
            {activeResource === 'ppt' ? (
              <PptViewer
                lesson={selectedLesson}
                deck={slideDeck}
                slides={slides}
                currentSlide={currentSlide}
                onSlideChange={setCurrentSlide}
                jumpRequest={slideJumpRequest}
              />
            ) : (
              <VideoViewer lesson={selectedLesson} videoRef={videoRef} progress={lessonDetail?.progress ?? selectedLesson.progress} onProgress={handleVideoProgress} />
            )}
          </div>

          <div style={STUDIO_TOOLDOCK}>
            <button style={dockButtonStyle} onClick={() => setSideTab('notes')} title="笔记"><StickyNote size={18} /></button>
            <button style={dockButtonStyle} onClick={() => { void addMark() }} title="标注"><Highlighter size={18} /></button>
            <button style={dockButtonStyle} onClick={() => setSideTab('discussion')} title="讨论"><MessageSquare size={18} /></button>
          </div>
        </main>

        <aside style={STUDIO_SIDE}>
          <div style={STUDIO_SIDE_TABS}>
            {[
              { id: 'catalog', label: '目录', icon: ListTree },
              { id: 'discussion', label: '讨论', icon: MessageSquare },
              { id: 'notes', label: '笔记', icon: StickyNote },
              { id: 'marks', label: '标注', icon: Highlighter },
            ].map(item => {
              const Icon = item.icon
              const active = sideTab === item.id
              return (
                <button key={item.id} onClick={() => setSideTab(item.id as StudioSideTab)} style={sideTabButton(active)}>
                  <Icon size={14} />{item.label}
                </button>
              )
            })}
          </div>

          <div style={STUDIO_SIDE_CONTENT} onWheel={handleSideWheel}>
            {sideTab === 'catalog' && (
              <div style={STUDIO_CATALOG_PANEL}>
                <label style={STUDIO_SEARCH}>
                  <Search size={15} />
                  <input value={catalogSearch} onChange={event => setCatalogSearch(event.target.value)} placeholder="搜索课件" style={STUDIO_SEARCH_INPUT} />
                </label>
                <div style={STUDIO_OVERVIEW_CARD}>
                  <div style={STUDIO_OVERVIEW_HEAD}>
                    <span>课件完成度</span>
                    <strong>{resourceProgressPct}%</strong>
                  </div>
                  <div style={STUDIO_PROGRESS_TRACK}>
                    <span style={STUDIO_PROGRESS_FILL(Math.max(4, resourceProgressPct))} />
                  </div>
                  <div style={STUDIO_RESOURCE_PROGRESS_GRID}>
                    <div style={overviewMetricCard}>
                      <small>PPT 浏览</small>
                      <strong>{averagePptProgress}%</strong>
                    </div>
                    <div style={overviewMetricCard}>
                      <small>视频观看</small>
                      <strong>{averageVideoProgress}%</strong>
                    </div>
                    <div style={overviewMetricCard}>
                      <small>知识掌握</small>
                      <strong>{masteryPct}%</strong>
                    </div>
                    <div style={overviewMetricCard}>
                      <small>学习时长</small>
                      <strong>{studyTimeText}</strong>
                    </div>
                  </div>
                  <div style={STUDIO_OVERVIEW_GRID}>
                    <button onClick={() => { onChangeRef.current(); setTab('quiz') }} style={overviewMetricButton}>
                      <small>最近测验</small>
                      <strong>{data.quiz.latestScore !== null ? `${data.quiz.latestScore}分` : '未测验'}</strong>
                    </button>
                    <button onClick={() => setTab('assignment')} style={overviewMetricButton}>
                      <small>作业</small>
                      <strong>{data.assignments.length}项</strong>
                    </button>
                    <button onClick={() => setTab('resources')} style={overviewMetricButton}>
                      <small>法规资料</small>
                      <strong>{totalResources}条</strong>
                    </button>
                  </div>
                </div>
                {activeResource === 'video' && selectedLesson.videoUrl && (
                  <div style={STUDIO_VIDEO_PROGRESS_CARD}>
                    <div style={STUDIO_OVERVIEW_HEAD}>
                      <span>视频观看进度</span>
                      {selectedProgress?.videoCompleted ? <CheckCircle2 size={16} color="#16a34a" /> : <strong>{selectedVideoProgress}%</strong>}
                    </div>
                    <div style={STUDIO_PROGRESS_TRACK}>
                      <span style={STUDIO_PROGRESS_FILL(Math.max(4, selectedVideoProgress))} />
                    </div>
                    <div style={STUDIO_VIDEO_PROGRESS_META}>
                      <span>已观看 {formatSeconds(selectedVideoWatchedSeconds)}</span>
                      <span>总时长 {selectedVideoDuration > 0 ? formatSeconds(selectedVideoDuration) : '--:--'}</span>
                    </div>
                  </div>
                )}
                {automationNotice && /失败|暂时|错误/.test(automationNotice) && (
                  <div style={AI_AUTOMATION_NOTICE}>
                    <Sparkles size={13} />
                    <span>{automationNotice}</span>
                  </div>
                )}
                <div style={{ display: 'grid', gap: 6, flexShrink: 0 }}>
                  {filteredCourseware.map((item, index) => {
                    const active = item.lessonId === selectedLesson.lessonId
                    const done = isCoursewareComplete(item)
                    return (
                      <button key={item.lessonId} onClick={() => setSelectedLessonId(item.lessonId)} style={catalogItem(active)}>
                        <span style={{ color: active ? '#1d6f78' : '#7b8794', fontWeight: 800 }}>{index + 1}</span>
                        <span style={{ minWidth: 0 }}>
                          <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</strong>
                          <small>PPT {item.progress?.pptProgress ?? 0}% · 视频 {item.progress?.videoProgress ?? 0}%</small>
                        </span>
                        {done ? <CheckCircle2 size={16} color="#16a34a" /> : <span />}
                      </button>
                    )
                  })}
                </div>
                {slides.length > 0 && (
                  <div style={SLIDE_CATALOG_LIST}>
                    {slides.map(slide => {
                      const done = selectedProgress?.viewedPages?.includes(slide.page) ?? false
                      return (
                        <button
                          key={slide.page}
                          ref={node => { slideCatalogRefs.current[slide.page] = node }}
                          onClick={() => jumpToSlide(slide.page)}
                          style={slideItem(currentSlide === slide.page, done)}
                          title={slide.title}
                        >
                          <span>{slide.page}</span>
                          <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{slide.title}</strong>
                          {done ? <CheckCircle2 size={14} color="#16a34a" /> : <span />}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {sideTab === 'discussion' && (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={DISCUSSION_COMPOSER}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['提问', '心得', '讨论'].map(tag => (
                      <button
                        key={tag}
                        onClick={() => setDiscussionTag(tag)}
                        style={discussionTagButton(discussionTag === tag)}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                  <input
                    value={discussionTitle}
                    onChange={event => setDiscussionTitle(event.target.value)}
                    placeholder="写一个讨论标题"
                    style={MARK_INPUT}
                  />
                  <textarea
                    value={discussionContent}
                    onChange={event => setDiscussionContent(event.target.value)}
                    placeholder="记录疑问、学习心得或想和同学讨论的点"
                    rows={4}
                    style={{ ...NOTE_TEXTAREA, resize: 'none' }}
                  />
                  <button
                    onClick={() => { void postInlineDiscussion() }}
                    disabled={submittingDiscussion || !discussionTitle.trim() || !discussionContent.trim()}
                    style={{
                      ...STUDIO_PRIMARY_BUTTON,
                      opacity: submittingDiscussion || !discussionTitle.trim() || !discussionContent.trim() ? 0.55 : 1,
                      cursor: submittingDiscussion || !discussionTitle.trim() || !discussionContent.trim() ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <Send size={13} />{submittingDiscussion ? '发布中...' : '发布讨论'}
                  </button>
                </div>
                {discussions.length === 0 ? (
                  <p style={STUDIO_MUTED}>本章节还没有讨论。</p>
                ) : discussions.slice(0, 8).map(item => (
                  <button
                    key={item.id}
                    onClick={() => router.push(`/course/${trainingId}/discussions/${item.id}`)}
                    style={DISCUSSION_MINI}
                  >
                    <strong>{item.title}</strong>
                    <span>{item.author} · {item.replyCount} 回复</span>
                  </button>
                ))}
              </div>
            )}

            {sideTab === 'notes' && (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={NOTE_META}>
                  <span>当前进度</span>
                  <strong>PPT {lessonDetail?.progress?.pptProgress ?? 0}% · 视频 {lessonDetail?.progress?.videoProgress ?? 0}%</strong>
                </div>
                <textarea value={noteDraft} onChange={event => setNoteDraft(event.target.value)} rows={14} placeholder="记录本节课重点、疑问或复习提示" style={NOTE_TEXTAREA} />
                {notice && <p style={STUDIO_NOTICE}>{notice}</p>}
                <button onClick={() => { void saveNote() }} disabled={savingNote} style={STUDIO_PRIMARY_BUTTON}>{savingNote ? '保存中...' : '保存笔记'}</button>
              </div>
            )}

            {sideTab === 'marks' && (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                  <input value={markInput} onChange={event => setMarkInput(event.target.value)} placeholder="标注说明" style={MARK_INPUT} />
                  <button onClick={() => { void addMark() }} style={STUDIO_PRIMARY_BUTTON}>添加</button>
                </div>
                {notice && <p style={STUDIO_NOTICE}>{notice}</p>}
                {loadingAnnotations ? (
                  <p style={STUDIO_MUTED}>标注加载中...</p>
                ) : annotations.length === 0 ? (
                  <p style={STUDIO_MUTED}>可以标记 PPT 页或视频时间点。</p>
                ) : annotations.map(mark => (
                  <button key={mark.id} onClick={() => openAnnotation(mark)} style={MARK_ITEM}>
                    <span>{mark.resource === 'ppt' ? 'PPT' : '视频'} · {mark.resource === 'ppt' ? `P${mark.pageNumber ?? '-'}` : formatSeconds(mark.videoTime ?? 0)}</span>
                    <strong>{mark.text}</strong>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

function PptViewer({
  lesson,
  deck,
  slides,
  currentSlide,
  onSlideChange,
  jumpRequest,
}: {
  lesson: Courseware
  deck: SlideDeckPreview | null
  slides: SlidePreview[]
  currentSlide: number
  onSlideChange: (page: number) => void
  jumpRequest: number
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<Record<number, HTMLElement | null>>({})
  const [narrationState, setNarrationState] = useState<'idle' | 'loading' | 'playing' | 'paused'>('idle')
  const [narrationMode, setNarrationMode] = useState<'ai' | null>(null)
  const [narrationNotice, setNarrationNotice] = useState('')
  const [narrationAudioUrl, setNarrationAudioUrl] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioSlideRef = useRef<number | null>(null)
  const audioCacheRef = useRef<Record<number, string>>({})
  const narrationTokenRef = useRef(0)
  const pausedSlideRef = useRef<number | null>(null)
  const currentSlideRef = useRef(currentSlide)

  const activeSlide = slides.find(item => item.page === currentSlide) ?? slides[0]
  const activeNarrationText = activeSlide ? getSlideNarrationText(activeSlide) : ''
  const narrationMetaText = narrationNotice || `第 ${currentSlide} 页 · ${activeSlide?.title ?? '课件内容'}`

  useEffect(() => {
    currentSlideRef.current = currentSlide
  }, [currentSlide])

  useEffect(() => {
    const page = pageRefs.current[currentSlide]
    const scroller = scrollerRef.current
    if (!scroller || jumpRequest === 0) return
    if (!page) return
    const top = Math.max(0, page.offsetTop - 18)
    scroller.scrollTo({ top, behavior: 'smooth' })
  }, [jumpRequest])

  function handleScroll() {
    const scroller = scrollerRef.current
    if (!scroller || slides.length === 0) return
    const anchorY = scroller.scrollTop + scroller.clientHeight * 0.38
    let nearestPage = currentSlide
    let nearestDistance = Number.POSITIVE_INFINITY
    for (const slide of slides) {
      const node = pageRefs.current[slide.page]
      if (!node) continue
      const distance = Math.abs(node.offsetTop - anchorY)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestPage = slide.page
      }
    }
    if (nearestPage !== currentSlide) onSlideChange(nearestPage)
  }

  useEffect(() => {
    return () => {
      narrationTokenRef.current += 1
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.removeAttribute('src')
        audioRef.current.load()
        audioSlideRef.current = null
      }
    }
  }, [])

  function stopAudioNarration() {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.onended = null
    audio.onerror = null
    audio.removeAttribute('src')
    audio.load()
    audioSlideRef.current = null
    setNarrationAudioUrl('')
  }

  function scrollToSlide(page: number) {
    const scroller = scrollerRef.current
    const node = pageRefs.current[page]
    if (!scroller || !node) return
    scroller.scrollTo({ top: Math.max(0, node.offsetTop - 18), behavior: 'smooth' })
  }

  function getNextSlidePage(page: number) {
    const index = slides.findIndex(item => item.page === page)
    return index >= 0 ? slides[index + 1]?.page ?? null : null
  }

  function finishNarration(page: number, token: number) {
    if (narrationTokenRef.current !== token) return
    if (currentSlideRef.current !== page) {
      setNarrationState('idle')
      setNarrationMode(null)
      setNarrationNotice(`第 ${page} 页讲解已结束`)
      audioSlideRef.current = null
      return
    }
    const nextPage = getNextSlidePage(page)
    if (nextPage) {
      setNarrationState('loading')
      setNarrationNotice(`正在进入第 ${nextPage} 页讲解...`)
      onSlideChange(nextPage)
      scrollToSlide(nextPage)
      window.setTimeout(() => {
        if (narrationTokenRef.current === token) void startNarration(nextPage)
      }, 320)
      return
    }
    setNarrationState('idle')
    setNarrationMode(null)
    setNarrationNotice('本课件讲解已播放完毕')
    audioSlideRef.current = null
  }

  async function fetchAiNarrationAudio(slide: SlidePreview, text: string) {
    const cached = audioCacheRef.current[slide.page]
    if (cached) return cached
    const token = localStorage.getItem('token')
    if (!token) throw new Error('请重新登录后播放 AI 讲解')
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text, page: slide.page, title: slide.title }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.audioUrl) {
      throw new Error(data?.error || 'AI 讲解音频生成失败')
    }
    audioCacheRef.current[slide.page] = data.audioUrl
    return data.audioUrl as string
  }

  async function startNarration(page: number) {
    const slide = slides.find(item => item.page === page) ?? slides[0]
    const text = slide ? getSlideNarrationText(slide) : ''
    if (!slide || !text) return

    const token = narrationTokenRef.current + 1
    narrationTokenRef.current = token
    stopAudioNarration()
    pausedSlideRef.current = null
    setNarrationState('loading')
    setNarrationMode('ai')
    setNarrationNotice(`正在合成第 ${slide.page} 页 AI 讲解音频...`)

    try {
      const audioUrl = await fetchAiNarrationAudio(slide, text)
      if (narrationTokenRef.current !== token) return
      const audio = audioRef.current
      if (!audio) throw new Error('音频播放器未就绪')
      setNarrationAudioUrl(audioUrl)
      audio.src = audioUrl
      audio.currentTime = 0
      audioSlideRef.current = page
      audio.onended = () => finishNarration(page, token)
      audio.onerror = () => {
        if (narrationTokenRef.current !== token) return
        setNarrationState('idle')
        setNarrationMode(null)
        setNarrationNotice('AI 音频播放失败，请稍后重试或检查 AI 语音配置')
      }
      try {
        await audio.play()
        if (narrationTokenRef.current === token) {
          setNarrationMode('ai')
          setNarrationState('playing')
          setNarrationNotice(`AI 讲解中 · 第 ${slide.page} 页`)
        }
      } catch {
        if (narrationTokenRef.current === token) {
          pausedSlideRef.current = page
          setNarrationMode('ai')
          setNarrationState('paused')
          setNarrationNotice('AI 音频已生成，可点击继续播放或使用右侧音频控件')
        }
      }
    } catch (err) {
      if (narrationTokenRef.current !== token) return
      const message = err instanceof Error ? err.message : 'AI 讲解音频生成失败'
      setNarrationState('idle')
      setNarrationMode(null)
      setNarrationNotice(`${message}，请稍后重试或检查 AI 语音配置`)
    }
  }

  async function toggleNarration() {
    if (narrationState === 'playing') {
      pausedSlideRef.current = audioSlideRef.current ?? currentSlide
      if (narrationMode === 'ai' && audioRef.current) {
        audioRef.current.pause()
      }
      setNarrationState('paused')
      setNarrationNotice('讲解已暂停')
      return
    }
    if (narrationState === 'paused' && narrationMode === 'ai' && audioRef.current) {
      try {
        await audioRef.current.play()
        setNarrationState('playing')
        setNarrationNotice(`AI 讲解中 · 第 ${audioSlideRef.current ?? currentSlide} 页`)
      } catch {
        setNarrationNotice('浏览器阻止了自动播放，请再次点击播放')
      }
      return
    }
    await startNarration(currentSlide)
  }

  if (!lesson.pptUrl) {
    return <StudioPlaceholder icon={FileText} title="本章节尚未发布 PPT" desc="教师发布课件后会显示在这里。" />
  }

  if (deck?.previewType === 'pdf') {
    return <iframe src={lesson.pptUrl} title={lesson.title} style={STUDIO_IFRAME} />
  }

  if (slides.length > 0) {
    return (
      <div style={PPT_STAGE} ref={scrollerRef} onScroll={handleScroll}>
        <div style={PPT_NARRATION_BAR}>
          <div style={PPT_NARRATION_INFO}>
            <Volume2 size={16} />
            <span>AI 讲解</span>
            <small style={PPT_NARRATION_META}>{narrationMetaText}</small>
          </div>
          <audio
            ref={audioRef}
            controls
            preload="auto"
            style={audioControlStyle(Boolean(narrationAudioUrl))}
          />
          <button
            onClick={() => { void toggleNarration() }}
            disabled={!activeNarrationText || narrationState === 'loading'}
            style={narrationButtonStyle(!activeNarrationText || narrationState === 'loading')}
            title={activeNarrationText ? '播放或暂停 AI 讲解' : '当前页没有可讲解内容'}
          >
            {narrationState === 'loading'
              ? <Loader2 size={16} />
              : narrationState === 'playing'
                ? <PauseCircle size={16} />
                : <PlayCircle size={16} />}
            {narrationState === 'loading' ? '生成中' : narrationState === 'playing' ? '暂停' : narrationState === 'paused' ? '继续播放' : '播放讲解'}
          </button>
        </div>
        <div style={PPT_CANVAS_WRAP}>
          {slides.map(slide => (
            <section
              key={slide.page}
              ref={node => { pageRefs.current[slide.page] = node }}
              style={PPT_SCROLL_SECTION}
            >
              <div style={PPT_PAGE_META}>
                <span>{slide.page} / {slides.length}</span>
                <strong>{slide.title}</strong>
              </div>
              {slide.image ? (
                <img src={slide.image} alt={`第 ${slide.page} 页：${slide.title}`} style={PPT_IMAGE_PAGE} />
              ) : slide.svg ? (
                <div style={PPT_SVG_PAGE} dangerouslySetInnerHTML={{ __html: slide.svg }} />
              ) : (
                <div style={PPT_SLIDE}>
                  <div style={PPT_SLIDE_RAIL} />
                  <p style={PPT_EYEBROW}>GMP 课程课件 · 第 {slide.page} 页</p>
                  <h3 style={PPT_TITLE}>{slide.title}</h3>
                  <div style={PPT_LINES}>
                    {(slide.lines.length ? slide.lines : ['本页为图片或复杂版式内容，可点击原文件查看完整效果。']).slice(0, 7).map((line, index) => (
                      <p key={`${slide.page}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span>{line}</p>
                    ))}
                  </div>
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    )
  }

  return (
    <StudioPlaceholder
      icon={FileText}
      title={deck?.error || '正在读取 PPT 预览'}
      desc={deck ? '当前文件可通过“原文件”打开查看。' : '课件内容加载中...'}
    />
  )
}

function getSlideNarrationText(slide: SlidePreview) {
  const notes = slide.notes?.trim()
  if (notes) return notes
  return [slide.title, ...slide.lines]
    .map(item => item?.trim())
    .filter(Boolean)
    .join('。')
}

function VideoViewer({
  lesson,
  videoRef,
  progress,
  onProgress,
}: {
  lesson: Courseware
  videoRef: RefObject<HTMLVideoElement | null>
  progress?: { videoWatchedSeconds?: number; videoCompleted?: boolean; videoProgress?: number } | null
  onProgress: (report?: VideoProgressReport) => void
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(Math.max(0, lesson.videoDuration || 0))
  const [watchedSeconds, setWatchedSeconds] = useState(Math.max(0, Math.floor(progress?.videoWatchedSeconds ?? 0)))
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [guardNotice, setGuardNotice] = useState('')
  const watchedSecondsRef = useRef(Math.max(0, Math.floor(progress?.videoWatchedSeconds ?? 0)))
  const lastTimeRef = useRef(0)
  const lastReportedWatchedRef = useRef(Math.max(0, Math.floor(progress?.videoWatchedSeconds ?? 0)))
  const guardNoticeTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const video = videoRef.current
    const initialWatched = Math.max(0, Math.floor(progress?.videoWatchedSeconds ?? 0))
    setPlaying(false)
    setCurrentTime(initialWatched)
    setWatchedSeconds(initialWatched)
    setDuration(Math.max(0, lesson.videoDuration || 0))
    setVolume(video?.volume ?? 1)
    setMuted(video?.muted ?? false)
    watchedSecondsRef.current = initialWatched
    lastReportedWatchedRef.current = initialWatched
    lastTimeRef.current = initialWatched
    if (video && lesson.videoUrl) {
      lockPlaybackPolicy(video)
      video.load()
    }
  }, [lesson.lessonId, lesson.videoUrl, lesson.videoDuration])

  useEffect(() => {
    const nextWatched = Math.max(0, Math.floor(progress?.videoWatchedSeconds ?? 0))
    if (nextWatched <= watchedSecondsRef.current) return
    watchedSecondsRef.current = nextWatched
    lastReportedWatchedRef.current = Math.max(lastReportedWatchedRef.current, nextWatched)
    setWatchedSeconds(nextWatched)
    const video = videoRef.current
    if (video && !progress?.videoCompleted && video.currentTime < nextWatched - 1) {
      video.currentTime = nextWatched
      lastTimeRef.current = nextWatched
      setCurrentTime(nextWatched)
    }
  }, [progress?.videoWatchedSeconds])

  useEffect(() => {
    function syncFullscreen() {
      setFullscreen(document.fullscreenElement === stageRef.current)
    }

    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])

  useEffect(() => {
    return () => {
      if (guardNoticeTimerRef.current) clearTimeout(guardNoticeTimerRef.current)
    }
  }, [])

  if (!lesson.videoUrl) {
    return <StudioPlaceholder icon={Video} title="本章节尚未发布视频" desc="教师上传视频后会显示在这里。" />
  }

  const stableDuration = duration > 0 ? duration : Math.max(0, lesson.videoDuration || 0)
  const timelineMax = Math.max(1, stableDuration || currentTime || 1)
  const timelineValue = Math.min(currentTime, timelineMax)
  const completed = Boolean(progress?.videoCompleted) || (stableDuration > 0 && watchedSeconds >= Math.floor(stableDuration * 0.95))
  const allowedSeekTime = completed ? timelineMax : Math.min(timelineMax, Math.max(0, watchedSecondsRef.current))
  const watchedLabel = formatSeconds(Math.floor(Math.max(0, watchedSeconds)))
  const currentLabel = formatSeconds(Math.floor(Math.max(0, currentTime)))
  const durationLabel = stableDuration > 0 ? formatSeconds(Math.floor(stableDuration)) : '--:--'
  const watchedPercent = stableDuration > 0 ? Math.min(100, Math.round((watchedSeconds / stableDuration) * 100)) : (progress?.videoProgress ?? 0)

  function syncMediaState() {
    const video = videoRef.current
    if (!video) return
    const nextDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : stableDuration
    const nextTime = Number.isFinite(video.currentTime) ? Math.max(0, video.currentTime) : 0
    setDuration(nextDuration)
    setCurrentTime(nextTime)
    setVolume(video.volume)
    setMuted(video.muted)
  }

  function showGuardNotice(message: string) {
    setGuardNotice(message)
    if (guardNoticeTimerRef.current) clearTimeout(guardNoticeTimerRef.current)
    guardNoticeTimerRef.current = window.setTimeout(() => setGuardNotice(''), 1800)
  }

  function enforceNormalPlaybackRate() {
    const video = videoRef.current
    if (!video) return
    if (video.playbackRate !== 1) video.playbackRate = 1
  }

  function lockPlaybackPolicy(video: HTMLVideoElement) {
    video.playbackRate = 1
    try {
      video.disablePictureInPicture = true
    } catch {}
  }

  async function startPlayback() {
    const video = videoRef.current
    if (!video) return
    enforceNormalPlaybackRate()
    try {
      await video.play()
    } catch {
      setPlaying(false)
    }
  }

  function handleLoadedMetadata() {
    const video = videoRef.current
    if (video) {
      lockPlaybackPolicy(video)
    }
    if (video && watchedSecondsRef.current > 0 && !completed) {
      video.currentTime = Math.min(watchedSecondsRef.current, Math.max(0, video.duration || timelineMax))
    }
    syncMediaState()
    void startPlayback()
  }

  function handleTimeUpdate() {
    const video = videoRef.current
    if (!video) return
    enforceNormalPlaybackRate()

    const rawTime = Math.max(0, video.currentTime)
    const delta = rawTime - lastTimeRef.current
    const jumpedAhead = !completed && rawTime > watchedSecondsRef.current + 2.25 && delta > 4
    if (jumpedAhead) {
      const rollback = Math.min(timelineMax, watchedSecondsRef.current)
      video.currentTime = rollback
      lastTimeRef.current = rollback
      setCurrentTime(rollback)
      showGuardNotice('请按顺序观看')
      return
    }

    let added = 0
    if (!video.paused && video.playbackRate === 1 && delta > 0 && delta <= 4) {
      added = Math.min(delta, 1.25)
      const nextWatched = Math.min(timelineMax, Math.max(watchedSecondsRef.current, watchedSecondsRef.current + added, Math.min(rawTime, watchedSecondsRef.current + 2)))
      added = Math.max(0, nextWatched - watchedSecondsRef.current)
      watchedSecondsRef.current = nextWatched
      setWatchedSeconds(nextWatched)
    }

    lastTimeRef.current = rawTime
    syncMediaState()

    const watchedFloor = Math.floor(watchedSecondsRef.current)
    if (added > 0 && watchedFloor > lastReportedWatchedRef.current) {
      const reportDelta = watchedFloor - lastReportedWatchedRef.current
      lastReportedWatchedRef.current = watchedFloor
      onProgress({
        currentTime: Math.floor(rawTime),
        watchedSeconds: watchedFloor,
        watchDelta: reportDelta,
      })
    }
  }

  async function togglePlayback() {
    const video = videoRef.current
    if (!video) return
    if (video.paused || video.ended) {
      if (video.ended) video.currentTime = 0
      try {
        await video.play()
      } catch {
        setPlaying(false)
      }
    } else {
      video.pause()
    }
  }

  function handleSeek(next: number) {
    const video = videoRef.current
    if (!video) return
    const target = Math.max(0, Math.min(timelineMax, next))
    if (!completed && target > allowedSeekTime + 0.5) {
      video.currentTime = allowedSeekTime
      lastTimeRef.current = allowedSeekTime
      setCurrentTime(allowedSeekTime)
      showGuardNotice('请按顺序观看')
      return
    }
    video.currentTime = target
    lastTimeRef.current = target
    setCurrentTime(target)
  }

  function handleVolume(next: number) {
    const video = videoRef.current
    if (!video) return
    const safeVolume = Math.min(1, Math.max(0, next))
    video.volume = safeVolume
    video.muted = safeVolume === 0
    setVolume(safeVolume)
    setMuted(video.muted)
  }

  function toggleMuted() {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setMuted(video.muted)
  }

  async function toggleFullscreen() {
    const target = stageRef.current
    if (!target) return
    try {
      if (document.fullscreenElement === target) {
        await document.exitFullscreen()
      } else {
        await target.requestFullscreen()
      }
    } catch {
      setFullscreen(false)
    }
  }

  function handleSeeking() {
    const video = videoRef.current
    if (!video) return
    if (!completed && video.currentTime > allowedSeekTime + 0.75) {
      video.currentTime = allowedSeekTime
      showGuardNotice('请按顺序观看')
    }
    lastTimeRef.current = video.currentTime
    setCurrentTime(video.currentTime)
  }

  function handleEnded() {
    const finalTime = Math.floor(stableDuration || videoRef.current?.currentTime || watchedSecondsRef.current)
    if (finalTime > watchedSecondsRef.current) {
      const reportDelta = Math.max(0, finalTime - lastReportedWatchedRef.current)
      watchedSecondsRef.current = finalTime
      lastReportedWatchedRef.current = finalTime
      setWatchedSeconds(finalTime)
      onProgress({
        currentTime: finalTime,
        watchedSeconds: finalTime,
        watchDelta: Math.min(4, reportDelta),
      })
    }
    setPlaying(false)
    syncMediaState()
  }

  return (
    <div ref={stageRef} style={fullscreen ? { ...VIDEO_STAGE, ...VIDEO_STAGE_FULLSCREEN } : VIDEO_STAGE}>
      <video
        key={lesson.videoUrl}
        ref={videoRef}
        src={lesson.videoUrl}
        preload="auto"
        autoPlay
        playsInline
        disablePictureInPicture
        controlsList="nodownload noplaybackrate"
        onClick={() => { void togglePlayback() }}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onSeeking={handleSeeking}
        onRateChange={enforceNormalPlaybackRate}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false)
          handleTimeUpdate()
        }}
        onEnded={handleEnded}
        onVolumeChange={syncMediaState}
        style={VIDEO_PLAYER}
      />
      <div style={VIDEO_WATCH_BADGE}>
        <span>{completed ? '已完成' : `已观看 ${watchedLabel}`}</span>
        <strong>{watchedPercent}%</strong>
      </div>
      {guardNotice && <div style={VIDEO_GUARD_NOTICE}>{guardNotice}</div>}
      <div style={VIDEO_CONTROL_BAR}>
        <button
          type="button"
          onClick={() => { void togglePlayback() }}
          style={VIDEO_ICON_BUTTON}
          aria-label={playing ? '暂停视频' : '播放视频'}
          title={playing ? '暂停' : '播放'}
        >
          {playing ? <PauseCircle size={24} /> : <PlayCircle size={24} />}
        </button>
        <span style={VIDEO_TIME_TEXT}>{currentLabel}</span>
        <input
          type="range"
          min={0}
          max={timelineMax}
          step={0.1}
          value={timelineValue}
          onChange={event => handleSeek(Number(event.currentTarget.value))}
          aria-label="视频播放进度"
          title={`可回看至 ${formatSeconds(Math.floor(allowedSeekTime))}`}
          style={VIDEO_PROGRESS_RANGE}
        />
        <span style={VIDEO_TIME_TEXT}>{durationLabel}</span>
        <button
          type="button"
          onClick={toggleMuted}
          style={VIDEO_ICON_BUTTON}
          aria-label={muted || volume === 0 ? '取消静音' : '静音'}
          title={muted || volume === 0 ? '取消静音' : '静音'}
        >
          {muted || volume === 0 ? <VolumeX size={21} /> : <Volume2 size={21} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={event => handleVolume(Number(event.currentTarget.value))}
          aria-label="视频音量"
          style={VIDEO_VOLUME_RANGE}
        />
        <button
          type="button"
          onClick={() => { void toggleFullscreen() }}
          style={VIDEO_ICON_BUTTON}
          aria-label={fullscreen ? '退出全屏' : '全屏播放'}
          title={fullscreen ? '退出全屏' : '全屏'}
        >
          {fullscreen ? <Minimize2 size={21} /> : <Maximize2 size={21} />}
        </button>
      </div>
    </div>
  )
}

function StudioPlaceholder({ icon: Icon, title, desc }: { icon: LucideIcon; title: string; desc: string }) {
  return (
    <div style={STUDIO_PLACEHOLDER}>
      <Icon size={38} color="#a7b4c2" />
      <strong>{title}</strong>
      <span>{desc}</span>
    </div>
  )
}

async function reportLessonProgress(lessonId: string, body: Record<string, unknown>): Promise<LessonProgressUpdate | null> {
  const token = localStorage.getItem('token')
  if (!token) return null
  const res = await fetch(`/api/course/lessons/${lessonId}/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }).catch(() => {})
  if (!res?.ok) return null
  return res.json().catch(() => null)
}

function formatSeconds(value: number) {
  const minutes = Math.floor(value / 60)
  const seconds = value % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function resourceButton(active: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    border: `1px solid ${active ? '#2f7dad' : '#dce4ec'}`,
    background: active ? '#e8f4ff' : '#fff',
    color: active ? '#1b67a2' : '#536170',
    padding: '8px 13px',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 13,
  }
}

function sideTabButton(active: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    border: 'none',
    background: active ? '#fff' : 'transparent',
    color: active ? '#1677ff' : '#3d4752',
    borderBottom: active ? '2px solid #1677ff' : '2px solid transparent',
    padding: '10px 8px 8px',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: active ? 800 : 600,
  }
}

function catalogItem(active: boolean): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: '26px minmax(0, 1fr) 18px',
    gap: 8,
    alignItems: 'center',
    textAlign: 'left',
    border: 'none',
    borderRadius: 6,
    background: active ? '#eaf3ff' : '#fff',
    color: active ? '#1f2f3d' : '#354250',
    padding: '10px 9px',
    cursor: 'pointer',
    fontSize: 13,
  }
}

function slideItem(active: boolean, done: boolean): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: '24px minmax(0, 1fr) 16px',
    gap: 8,
    border: 'none',
    background: active ? '#edf6ff' : done ? '#f5fbf7' : 'transparent',
    color: active ? '#1677ff' : done ? '#1f6f4a' : '#44515f',
    textAlign: 'left',
    padding: '7px 8px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    alignItems: 'center',
  }
}

const SLIDE_CATALOG_LIST: CSSProperties = {
  borderTop: '1px solid #edf1f5',
  paddingTop: 10,
  display: 'grid',
  gap: 5,
  paddingRight: 3,
  minHeight: 0,
  scrollPaddingBlock: 8,
}

const STUDIO_CATALOG_PANEL: CSSProperties = {
  minHeight: 0,
  display: 'grid',
  gap: 10,
}

const overviewMetricCard: CSSProperties = {
  display: 'grid',
  gap: 4,
  alignContent: 'center',
  textAlign: 'left',
  border: '1px solid #e3eaf1',
  borderRadius: 7,
  background: '#fff',
  color: '#2c3a48',
  padding: '9px 10px',
  minHeight: 58,
  fontSize: 12,
}

const overviewMetricButton: CSSProperties = {
  ...overviewMetricCard,
  cursor: 'pointer',
}

const CHAPTER_COMPACT_BAR: CSSProperties = {
  minHeight: 46,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 20px',
  background: 'linear-gradient(90deg, #183b4b 0%, #1d6f78 100%)',
  color: '#fff',
  overflow: 'hidden',
}

const CHAPTER_BACK_LINK: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  color: 'rgba(255,255,255,0.78)',
  textDecoration: 'none',
  fontSize: 12,
  fontWeight: 700,
  flexShrink: 0,
}

const CHAPTER_ID_BADGE: CSSProperties = {
  borderRadius: 999,
  background: 'rgba(255,255,255,0.16)',
  padding: '3px 9px',
  fontSize: 11,
  fontWeight: 900,
  flexShrink: 0,
}

const CHAPTER_COMPACT_TITLE: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 18,
  lineHeight: 1.2,
  fontWeight: 900,
}

const CHAPTER_COMPACT_META: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'rgba(255,255,255,0.72)',
  fontSize: 12,
  fontWeight: 600,
  flex: 1,
}

const CHAPTER_QUIZ_STATUS: CSSProperties = {
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 999,
  padding: '4px 10px',
  color: 'rgba(255,255,255,0.82)',
  fontSize: 12,
  fontWeight: 800,
  flexShrink: 0,
}

const COURSE_DETAIL_PAGE: CSSProperties = {
  height: 'calc(100dvh - 94px)',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  background: '#f4f6f8',
  overflow: 'hidden',
}

const COURSE_TAB_CONTENT: CSSProperties = {
  flex: 1,
  minHeight: 0,
  padding: '10px 14px 14px',
  overflow: 'hidden',
}

const STUDIO_SHELL: CSSProperties = {
  height: '100%',
  minHeight: 0,
  background: '#edf1f5',
  border: '1px solid #d8e0e8',
  borderRadius: 8,
  overflow: 'hidden',
  boxShadow: '0 16px 36px rgba(31,47,61,0.08)',
}

const STUDIO_TOPBAR: CSSProperties = {
  height: 36,
  background: '#354962',
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  alignItems: 'center',
  padding: '0 16px',
}

const STUDIO_BACK: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  color: '#d4deea',
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: 700,
}

const STUDIO_BODY: CSSProperties = {
  height: '100%',
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) clamp(320px, 28vw, 390px)',
  background: '#fff',
}

const STUDIO_MAIN: CSSProperties = {
  position: 'relative',
  minWidth: 0,
  minHeight: 0,
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  borderRight: '6px solid #d4dbe3',
  overflow: 'hidden',
  overscrollBehavior: 'auto',
}

const STUDIO_RESOURCE_BAR: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
  padding: '14px 24px 10px',
  background: '#fff',
}

const STUDIO_VIEWER: CSSProperties = {
  position: 'relative',
  minHeight: 0,
  height: '100%',
  margin: '0 24px 18px',
  background: '#f4f6f8',
  border: '1px solid #d9e1ea',
  borderRadius: 4,
  overflow: 'hidden',
}

const STUDIO_VIDEO_VIEWER: CSSProperties = {
  height: 'auto',
  minHeight: 0,
  alignSelf: 'start',
  background: '#0f172a',
  overflow: 'hidden',
}

const STUDIO_TOOLDOCK: CSSProperties = {
  position: 'absolute',
  left: 20,
  bottom: 24,
  display: 'grid',
  gap: 12,
  zIndex: 2,
}

const dockButtonStyle: CSSProperties = {
  width: 42,
  height: 42,
  border: 'none',
  borderRadius: 5,
  background: '#354962',
  color: '#fff',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  boxShadow: '0 8px 18px rgba(25,43,61,0.18)',
}

const STUDIO_SIDE: CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  height: '100%',
  background: '#f8fafc',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const STUDIO_SIDE_TABS: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  background: '#f1f4f8',
  borderBottom: '1px solid #dfe6ee',
  flexShrink: 0,
}

const STUDIO_SIDE_CONTENT: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  overscrollBehavior: 'contain',
  scrollbarGutter: 'stable',
  padding: 14,
  touchAction: 'pan-y',
}

const STUDIO_SEARCH: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  border: '1px solid #dbe3ec',
  borderRadius: 999,
  background: '#fff',
  padding: '8px 12px',
  color: '#9aa8b6',
  flexShrink: 0,
}

const STUDIO_SEARCH_INPUT: CSSProperties = {
  border: 'none',
  outline: 'none',
  minWidth: 0,
  flex: 1,
  background: 'transparent',
  color: '#263442',
  fontSize: 13,
}

const STUDIO_OVERVIEW_CARD: CSSProperties = {
  border: '1px solid #dfe7ef',
  borderRadius: 8,
  background: '#f8fbff',
  padding: 12,
  display: 'grid',
  gap: 10,
  flexShrink: 0,
}

const AI_AUTOMATION_NOTICE: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 7,
  border: '1px solid #cfe8dc',
  borderRadius: 8,
  background: '#f1fbf6',
  color: '#176344',
  padding: '9px 10px',
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1.55,
  flexShrink: 0,
}

const STUDIO_OVERVIEW_HEAD: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  color: '#2c3a48',
  fontSize: 13,
  fontWeight: 800,
}

const STUDIO_PROGRESS_TRACK: CSSProperties = {
  height: 7,
  borderRadius: 999,
  background: '#e4edf5',
  overflow: 'hidden',
}

function STUDIO_PROGRESS_FILL(width: number): CSSProperties {
  return {
    display: 'block',
    width: `${Math.min(100, Math.max(0, width))}%`,
    height: '100%',
    borderRadius: 999,
    background: 'linear-gradient(90deg, #1d6f78, #2f9e80)',
  }
}

const STUDIO_OVERVIEW_GRID: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
}

const STUDIO_RESOURCE_PROGRESS_GRID: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
}

const STUDIO_VIDEO_PROGRESS_CARD: CSSProperties = {
  border: '1px solid #d7eadf',
  borderRadius: 8,
  background: '#f4fbf7',
  padding: 12,
  display: 'grid',
  gap: 9,
  flexShrink: 0,
}

const STUDIO_VIDEO_PROGRESS_META: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  color: '#557066',
  fontSize: 12,
  fontWeight: 800,
}

const KNOWLEDGE_GRAPH_PANEL: CSSProperties = {
  border: '1px solid #dfe7ef',
  borderRadius: 8,
  background: '#fff',
  overflow: 'hidden',
}

const KNOWLEDGE_GRAPH_HEAD: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '12px 16px',
  color: '#31475a',
  fontSize: 14,
  fontWeight: 900,
  borderBottom: '1px solid #edf2f6',
}

const KNOWLEDGE_GRAPH_CANVAS: CSSProperties = {
  height: 600,
  padding: 16,
  background: '#fff',
}

const STUDIO_ICON_LINK: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  border: '1px solid #dce4ec',
  background: '#fff',
  color: '#536170',
  padding: '8px 13px',
  borderRadius: 8,
  textDecoration: 'none',
  fontWeight: 800,
  fontSize: 13,
}

const STUDIO_PRIMARY_BUTTON: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  border: 'none',
  borderRadius: 8,
  background: '#1677ff',
  color: '#fff',
  padding: '8px 12px',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 800,
}

const STUDIO_MUTED: CSSProperties = {
  margin: 0,
  color: '#8998a8',
  fontSize: 13,
  lineHeight: 1.7,
}

const STUDIO_NOTICE: CSSProperties = {
  margin: 0,
  border: '1px solid #d7ebe3',
  background: '#f1fbf7',
  color: '#1d6f54',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 12,
  fontWeight: 700,
}

const STUDIO_EMPTY: CSSProperties = {
  minHeight: 420,
  background: '#fff',
  border: '1px solid #e1e8ef',
  borderRadius: 8,
  display: 'grid',
  placeItems: 'center',
  alignContent: 'center',
  gap: 10,
  color: '#7b8794',
}

const STUDIO_IFRAME: CSSProperties = {
  width: '100%',
  height: '100%',
  minHeight: 560,
  border: 'none',
  background: '#fff',
}

const PPT_STAGE: CSSProperties = {
  height: '100%',
  minHeight: 0,
  maxHeight: '100%',
  background: '#e7ebf0',
  overflowY: 'scroll',
  overflowX: 'hidden',
  overscrollBehavior: 'contain',
  scrollBehavior: 'auto',
}

const PPT_NARRATION_BAR: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  padding: '8px 14px',
  background: 'rgba(248,250,252,0.94)',
  borderBottom: '1px solid #dbe4ee',
  backdropFilter: 'blur(10px)',
}

const PPT_NARRATION_INFO: CSSProperties = {
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  color: '#2f4052',
  fontSize: 13,
  fontWeight: 800,
}

const PPT_NARRATION_META: CSSProperties = {
  flex: 1,
  minWidth: 0,
  color: '#68798b',
  fontSize: 12,
  fontWeight: 700,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

function narrationButtonStyle(disabled: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    border: '1px solid #cfe0ef',
    borderRadius: 8,
    background: disabled ? '#eef3f7' : '#1677ff',
    color: disabled ? '#93a4b4' : '#fff',
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 900,
    cursor: disabled ? 'not-allowed' : 'pointer',
    flexShrink: 0,
  }
}

function audioControlStyle(visible: boolean): CSSProperties {
  return {
    width: visible ? 230 : 0,
    height: 32,
    opacity: visible ? 1 : 0,
    pointerEvents: visible ? 'auto' : 'none',
    transition: 'opacity 160ms ease, width 160ms ease',
    flexShrink: 0,
  }
}

const PPT_CANVAS_WRAP: CSSProperties = {
  position: 'relative',
  display: 'grid',
  justifyItems: 'center',
  gap: 22,
  padding: '18px 48px 30px',
}

const PPT_SCROLL_SECTION: CSSProperties = {
  width: 'min(100%, 1060px)',
  display: 'grid',
  gap: 8,
  scrollMarginTop: 20,
}

const PPT_PAGE_META: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  color: '#607080',
  fontSize: 12,
  fontWeight: 800,
}

const PPT_SVG_PAGE: CSSProperties = {
  width: '100%',
  aspectRatio: '16 / 9',
  background: '#fff',
  boxShadow: '0 18px 42px rgba(28,49,64,0.14)',
  lineHeight: 0,
}

const PPT_IMAGE_PAGE: CSSProperties = {
  width: '100%',
  aspectRatio: '16 / 9',
  display: 'block',
  objectFit: 'contain',
  background: '#fff',
  boxShadow: '0 18px 42px rgba(28,49,64,0.14)',
}

const PPT_SLIDE: CSSProperties = {
  position: 'relative',
  width: 'min(86%, 960px)',
  aspectRatio: '16 / 9',
  background: '#fff',
  border: '1px solid #d7e0ea',
  boxShadow: '0 18px 42px rgba(28,49,64,0.14)',
  padding: '54px 66px 42px',
  overflow: 'hidden',
}

const PPT_SLIDE_RAIL: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  bottom: 0,
  width: 12,
  background: '#4472c4',
}

const PPT_EYEBROW: CSSProperties = {
  margin: 0,
  color: '#ed7d31',
  fontSize: 12,
  fontWeight: 900,
}

const PPT_TITLE: CSSProperties = {
  margin: '10px 0 24px',
  color: '#26364a',
  fontSize: 30,
  lineHeight: 1.2,
  fontWeight: 900,
  letterSpacing: 0,
}

const PPT_LINES: CSSProperties = {
  display: 'grid',
  gap: 9,
  color: '#44546a',
  fontSize: 15,
  lineHeight: 1.55,
}

const PPT_NAV: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 18,
  background: '#f8fafc',
  borderTop: '1px solid #dfe6ee',
  color: '#44515f',
  fontSize: 13,
  fontWeight: 800,
}

const VIDEO_STAGE: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: 'clamp(320px, 62vh, 720px)',
  minHeight: 0,
  background: '#0f172a',
  display: 'grid',
  placeItems: 'center',
  overflow: 'hidden',
}

const VIDEO_STAGE_FULLSCREEN: CSSProperties = {
  height: '100vh',
  borderRadius: 0,
}

const VIDEO_PLAYER: CSSProperties = {
  width: '100%',
  height: '100%',
  maxHeight: '100%',
  background: '#0f172a',
  display: 'block',
  objectFit: 'contain',
}

const VIDEO_WATCH_BADGE: CSSProperties = {
  position: 'absolute',
  right: 14,
  top: 14,
  zIndex: 3,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  border: '1px solid rgba(255,255,255,0.22)',
  borderRadius: 8,
  background: 'rgba(15,23,42,0.78)',
  color: '#dce8f2',
  padding: '7px 10px',
  fontSize: 12,
  fontWeight: 800,
  backdropFilter: 'blur(8px)',
}

const VIDEO_GUARD_NOTICE: CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  zIndex: 4,
  transform: 'translate(-50%, -50%)',
  border: '1px solid rgba(255,255,255,0.24)',
  borderRadius: 8,
  background: 'rgba(15,23,42,0.86)',
  color: '#fff',
  padding: '10px 14px',
  fontSize: 13,
  fontWeight: 900,
  boxShadow: '0 14px 38px rgba(0,0,0,0.22)',
}

const VIDEO_CONTROL_BAR: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 3,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  padding: '30px 14px 12px',
  background: 'linear-gradient(180deg, rgba(15,23,42,0), rgba(15,23,42,0.92) 38%, rgba(15,23,42,0.98))',
  color: '#fff',
}

const VIDEO_ICON_BUTTON: CSSProperties = {
  width: 34,
  height: 34,
  flex: '0 0 34px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid rgba(255,255,255,0.22)',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.11)',
  color: '#fff',
  cursor: 'pointer',
}

const VIDEO_TIME_TEXT: CSSProperties = {
  minWidth: 38,
  flex: '0 0 auto',
  color: '#e5edf5',
  fontSize: 12,
  fontWeight: 800,
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'center',
}

const VIDEO_PROGRESS_RANGE: CSSProperties = {
  flex: '1 1 128px',
  minWidth: 108,
  height: 22,
  accentColor: '#2dd4bf',
  cursor: 'pointer',
}

const VIDEO_VOLUME_RANGE: CSSProperties = {
  width: 74,
  minWidth: 58,
  height: 22,
  accentColor: '#2dd4bf',
  cursor: 'pointer',
}

const STUDIO_PLACEHOLDER: CSSProperties = {
  minHeight: 560,
  display: 'grid',
  placeItems: 'center',
  alignContent: 'center',
  gap: 10,
  color: '#718093',
  background: '#f7f9fb',
  textAlign: 'center',
}

const NOTE_META: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  border: '1px solid #e1e8ef',
  background: '#fff',
  borderRadius: 8,
  padding: '10px 12px',
  color: '#718093',
  fontSize: 12,
}

const NOTE_TEXTAREA: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #dbe3ec',
  borderRadius: 8,
  background: '#fff',
  color: '#263442',
  padding: 12,
  resize: 'vertical',
  fontSize: 13,
  lineHeight: 1.7,
  outline: 'none',
}

const MARK_INPUT: CSSProperties = {
  minWidth: 0,
  border: '1px solid #dbe3ec',
  borderRadius: 8,
  background: '#fff',
  color: '#263442',
  padding: '8px 10px',
  outline: 'none',
  fontSize: 13,
}

const MARK_ITEM: CSSProperties = {
  display: 'grid',
  gap: 4,
  border: '1px solid #e1e8ef',
  borderRadius: 8,
  background: '#fff',
  padding: 10,
  color: '#263442',
  fontSize: 13,
  textAlign: 'left',
  cursor: 'pointer',
  width: '100%',
}

const DISCUSSION_COMPOSER: CSSProperties = {
  border: '1px solid #e1e8ef',
  borderRadius: 8,
  background: '#fff',
  padding: 11,
  display: 'grid',
  gap: 8,
}

function discussionTagButton(active: boolean): CSSProperties {
  return {
    border: 'none',
    borderRadius: 999,
    background: active ? '#e6f3f4' : '#f0f4f7',
    color: active ? '#1d6f78' : '#6f8290',
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 800,
  }
}

const DISCUSSION_MINI: CSSProperties = {
  border: '1px solid #e1e8ef',
  borderRadius: 8,
  background: '#fff',
  color: '#263442',
  padding: 11,
  display: 'grid',
  gap: 5,
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: 13,
  width: '100%',
}

// ── Tab: 章节测验入口 ─────────────────────────────────────────────────────

function QuizTab({
  trainingId,
  quiz,
  gate,
  eduLevel,
  setTab,
}: {
  trainingId: string
  quiz: ChapterDetail['quiz']
  gate: QuizGate
  eduLevel: string
  setTab: (tab: Tab) => void
}) {
  const router = useRouter()
  const unpublished = !quiz.published
  const locked = !unpublished && gate && !gate.unlocked
  const progressPct = gate.totalPptPages > 0 ? Math.round((gate.viewedPptPages / gate.totalPptPages) * 100) : 100
  const earnedCredit = quiz.totalEarnedCredits ?? quiz.earnedCredits ?? quiz.totalEarnedHours ?? quiz.earnedHours ?? 0
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
      <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800, color: '#1c3140', letterSpacing: '-0.02em' }}>{quiz.title || '章节测验'}</h2>
      <p style={{ margin: '0 0 4px', fontSize: 13, color: '#7a96a4' }}>{quiz.questionCount} 题 · {quiz.passScore} 分通过 · 3 次重做机会 · 计入课时分</p>
      <p style={{ margin: '0 0 26px', fontSize: 11, color: '#9aacb6' }}>{quiz.description || '题型包含单选、多选、判断、填空、简答和综合分析'}</p>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 22,
        padding: '7px 12px',
        borderRadius: 999,
        background: quiz.attempt.exhausted ? '#fef2f2' : '#eef8f4',
        color: quiz.attempt.exhausted ? '#b91c1c' : '#176344',
        fontSize: 12,
        fontWeight: 800,
      }}>
        <RotateCcw size={13} />
        已提交 {quiz.attempt.usedAttempts}/{quiz.attempt.maxAttempts} 次 · 剩余重做 {quiz.attempt.remainingRetakes} 次
      </div>

      {unpublished && (
        <div style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 10,
          padding: '14px 18px',
          marginBottom: 22,
          textAlign: 'left',
        }}>
          <p style={{ margin: '0 0 6px', color: '#475569', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={15} />教师尚未发布本章节测验
          </p>
          <p style={{ margin: 0, fontSize: 12, color: '#64748b', lineHeight: 1.7 }}>
            发布后你完成 PPT 浏览即可开始测验。
          </p>
        </div>
      )}

      {locked && (
        <div style={{
          background: '#fff7ed',
          border: '1px solid #fed7aa',
          borderRadius: 10,
          padding: '14px 18px',
          marginBottom: 22,
          textAlign: 'left',
        }}>
          <p style={{ margin: '0 0 8px', color: '#9a3412', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={15} />需要先浏览完本章节全部 PPT
          </p>
          <div style={{ height: 7, borderRadius: 999, background: '#ffedd5', overflow: 'hidden', marginBottom: 8 }}>
            <span style={{ display: 'block', width: `${Math.max(4, progressPct)}%`, height: '100%', background: '#f97316', borderRadius: 999 }} />
          </div>
          <p style={{ margin: 0, fontSize: 12, color: '#9a3412', lineHeight: 1.7 }}>
            已浏览 {gate.viewedPptPages}/{gate.totalPptPages} 页，仍需浏览 {gate.missingPages} 页；完成后章节测验会自动解锁。
          </p>
        </div>
      )}

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
              {earnedCredit > 0 && (
                <p style={{ margin: 0, fontSize: 11, color: '#7a96a4' }}>累计课时分</p>
              )}
              {earnedCredit > 0 && (
                <p style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700, color: '#1d6f78' }}>+{earnedCredit}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => {
          if (unpublished) return
          if (quiz.attempt.exhausted) return
          if (locked) {
            setTab('classroom')
            return
          }
          router.push(`/course/${trainingId}/quiz?eduLevel=${eduLevel}`)
        }}
        style={{
          padding: '12px 36px', borderRadius: 10, border: 'none',
          background: unpublished || locked || quiz.attempt.exhausted ? '#eef2f5' : 'linear-gradient(135deg, #183b4b, #1d6f78)',
          color: unpublished || locked || quiz.attempt.exhausted ? '#78909c' : '#fff', fontWeight: 700, fontSize: 14, cursor: unpublished || quiz.attempt.exhausted ? 'not-allowed' : 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 8,
          letterSpacing: '0.02em',
          boxShadow: unpublished || locked || quiz.attempt.exhausted ? 'none' : '0 4px 14px rgba(24,59,75,0.18)',
        }}
      >
        {unpublished ? '等待教师发布' : locked ? '去浏览 PPT' : quiz.attempt.exhausted ? '重做次数已用完' : quiz.latestScore !== null ? '再次测验' : '开始测验'} <ArrowRight size={14} />
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
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string[]>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitResult, setSubmitResult] = useState<AssignmentSubmitResult | null>(null)
  const [modalHost, setModalHost] = useState<HTMLElement | null>(null)
  const activeAssignment = submitTo === null ? null : assignments.find(assignment => assignment.id === submitTo) ?? null

  useEffect(() => {
    setModalHost(document.body)
  }, [])

  useEffect(() => {
    if (!activeAssignment && !submitResult) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [activeAssignment, submitResult])

  function answerKey(assignmentId: number, questionId: string) {
    return `${assignmentId}:${questionId}`
  }

  function getAssignmentQuestions(assignment: Assignment) {
    if (assignment.questions?.length) return assignment.questions
    const parsed = extractAssignmentQuestions(assignment.description)
    if (parsed.length > 0) return parsed
    if (!isStructuredAssignment(assignment)) return []
    return createFallbackAssignmentQuestions(assignment.title, assignment.description)
  }

  function isStructuredAssignment(assignment: Assignment) {
    return /AI|题组|单选|多选|判断|填空|综合/.test(`${assignment.assignmentType} ${assignment.description}`)
  }

  function setChoiceAnswer(assignmentId: number, question: CourseAssignmentQuestion, key: string) {
    const storageKey = answerKey(assignmentId, question.id)
    setQuestionAnswers(previous => {
      const current = previous[storageKey] ?? []
      if (question.questionType === '多选题') {
        return { ...previous, [storageKey]: current.includes(key) ? current.filter(item => item !== key) : [...current, key].sort() }
      }
      return { ...previous, [storageKey]: [key] }
    })
  }

  function setTextAssignmentAnswer(assignmentId: number, question: CourseAssignmentQuestion, value: string) {
    setQuestionAnswers(previous => ({ ...previous, [answerKey(assignmentId, question.id)]: [value] }))
  }

  function isQuestionAnswered(assignmentId: number, question: CourseAssignmentQuestion) {
    return (questionAnswers[answerKey(assignmentId, question.id)] ?? []).join('').trim().length > 0
  }

  function buildStructuredSubmission(assignment: Assignment, questions: CourseAssignmentQuestion[]) {
    return questions.map((question, index) => {
      const value = questionAnswers[answerKey(assignment.id, question.id)] ?? []
      const answer = question.questionType === '多选题' ? value.join('') : value[0] ?? ''
      return [
        `${index + 1}.【${question.questionType}】${question.stem}`,
        question.options.length > 0 ? question.options.map(option => `${option.key}. ${option.text}`).join('\n') : '',
        `答案：${answer}`,
      ].filter(Boolean).join('\n')
    }).join('\n\n')
  }

  function allStructuredAnswered(assignment: Assignment, questions: CourseAssignmentQuestion[]) {
    return questions.every(question => (questionAnswers[answerKey(assignment.id, question.id)] ?? []).join('').trim().length > 0)
  }

  function buildStructuredAnswers(assignment: Assignment, questions: CourseAssignmentQuestion[]) {
    return questions
      .filter(question => question.questionId || question.id)
      .map(question => {
        const value = questionAnswers[answerKey(assignment.id, question.id)] ?? []
        return {
          question_id: question.questionId ?? question.id,
          answer: question.questionType === '多选题' ? value.join('') : value[0] ?? '',
        }
      })
  }

  function openAssignment(assignment: Assignment) {
    setSubmitTo(assignment.id)
    setContent(assignment.mySubmission?.content ?? '')
    setQuestionAnswers({})
    setSubmitError('')
  }

  function closeAssignmentModal() {
    if (submitting) return
    setSubmitTo(null)
    setContent('')
    setQuestionAnswers({})
    setSubmitError('')
  }

  async function submit(assignment: Assignment) {
    const questions = getAssignmentQuestions(assignment)
    const structuredContent = questions.length > 0 ? buildStructuredSubmission(assignment, questions) : ''
    const finalContent = questions.length > 0 ? structuredContent : content
    if (!submitTo || !finalContent.trim()) return
    setSubmitting(true)
    setSubmitError('')
    const token = localStorage.getItem('token')
    try {
      const res = await fetch(`/api/course/assignments/${submitTo}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          content: finalContent,
          answers: questions.length > 0 ? buildStructuredAnswers(assignment, questions) : undefined,
        }),
      })
      const payload = await res.json().catch(() => null)
      if (res.ok) {
        const numericScore = Number(payload?.score)
        setSubmitResult({
          assignmentTitle: assignment.title,
          score: Number.isFinite(numericScore) ? numericScore : null,
          maxScore: assignment.maxScore,
          feedback: typeof payload?.feedback === 'string' ? payload.feedback : null,
          earnedHours: Number.isFinite(Number(payload?.earnedHours)) ? Number(payload.earnedHours) : null,
          earnedCredits: Number.isFinite(Number(payload?.earnedCredits)) ? Number(payload.earnedCredits) : null,
        })
        setSubmitTo(null); setContent(''); setQuestionAnswers({})
        onChange()
      } else {
        setSubmitError(payload?.error || '提交失败，请稍后重试')
      }
    } finally { setSubmitting(false) }
  }

  if (assignments.length === 0) {
    return <EmptyState icon={Edit3} title="暂无作业" desc="教师尚未为本章布置作业" />
  }

  function renderQuestionCard(assignment: Assignment, question: CourseAssignmentQuestion, index: number) {
    const value = questionAnswers[answerKey(assignment.id, question.id)] ?? []
    const textValue = value[0] ?? ''
    const choice = question.questionType === '单选题' || question.questionType === '多选题' || question.questionType === '判断题'
    const done = isQuestionAnswered(assignment.id, question)
    return (
      <div
        key={question.id}
        id={`assignment-q-${assignment.id}-${index}`}
        style={{
          border: '1px solid #e4ebf1',
          borderRadius: 10,
          background: '#fff',
          padding: '16px 18px',
          scrollMarginTop: 16,
          scrollMarginBottom: 24,
          boxShadow: done ? 'inset 3px 0 0 #1d6f78, 0 1px 4px rgba(20,50,68,0.05)' : '0 1px 4px rgba(20,50,68,0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: done ? '#1d6f78' : '#cdd8df', minWidth: 32, fontVariantNumeric: 'tabular-nums' }}>
              {String(index + 1).padStart(2, '0')}
            </span>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: '#eef2f5', color: '#5a7f8e', fontWeight: 800 }}>{question.questionType}</span>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: 'rgba(29,111,120,0.08)', color: '#1d6f78', fontWeight: 800 }}>{question.points} 分</span>
            {question.questionType === '多选题' && (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: '#fff7ed', color: '#b45309', fontWeight: 800 }}>多选</span>
            )}
          </div>
          {done && <CheckCircle2 size={16} color="#1d6f78" strokeWidth={2.5} />}
        </div>
        <p style={{ margin: '0 0 12px', color: '#1c3140', fontSize: 14, lineHeight: 1.8, fontWeight: 700 }}>{question.stem}</p>
        {choice ? (
          <div style={{ display: 'grid', gap: 7 }}>
            {question.options.map(option => {
              const active = value.includes(option.key)
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setChoiceAnswer(assignment.id, question, option.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    width: '100%',
                    textAlign: 'left',
                    border: `1.5px solid ${active ? '#1d6f78' : '#e4ebf1'}`,
                    background: active ? 'rgba(29,111,120,0.07)' : '#fbfcfd',
                    borderRadius: 8,
                    padding: '9px 11px',
                    cursor: 'pointer',
                    color: '#304655',
                    fontSize: 13,
                    lineHeight: 1.6,
                  }}
                >
                  <strong style={{ color: active ? '#1d6f78' : '#7a96a4' }}>{option.key}.</strong>
                  <span>{option.text}</span>
                </button>
              )
            })}
          </div>
        ) : question.questionType === '填空题' ? (
          <input
            value={textValue}
            onChange={event => setTextAssignmentAnswer(assignment.id, question, event.target.value)}
            placeholder="请输入答案"
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #dde6eb', fontSize: 13, color: '#1c3140', outline: 'none', background: '#fafbfc' }}
          />
        ) : (
          <textarea
            value={textValue}
            onChange={event => setTextAssignmentAnswer(assignment.id, question, event.target.value)}
            placeholder={question.questionType === '简答题' ? '请分点作答' : '请写出完整分析过程'}
            rows={question.questionType === '简答题' ? 4 : 6}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #dde6eb', fontSize: 13, lineHeight: 1.7, color: '#1c3140', outline: 'none', resize: 'vertical', fontFamily: 'inherit', background: '#fafbfc' }}
          />
        )}
      </div>
    )
  }

  function renderAssignmentModal() {
    if (!activeAssignment) return null
    const submittedDetail = activeAssignment.mySubmission
    if (submittedDetail) {
      const graderLabel = submittedDetail.gradedBy === 'teacher' ? '教师批改完成' : 'AI 批改完成'
      const reviewQuestions = getAssignmentQuestions(activeAssignment)
        .map(question => question as CourseAssignmentQuestion & { userAnswer?: string; comment?: string })
        .filter(question => String(question.correctAnswer ?? '').trim())
      return (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 5000,
            background: 'rgba(15, 30, 42, 0.46)',
            backdropFilter: 'blur(4px)',
            padding: 'clamp(12px, 3vh, 24px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{
            width: 'min(760px, calc(100vw - 32px))',
            maxHeight: 'calc(100dvh - 48px)',
            background: '#fff',
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.7)',
            boxShadow: '0 24px 80px rgba(15, 30, 42, 0.28)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{ padding: '18px 22px 16px', borderBottom: '1px solid #e4ebf1', display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexShrink: 0 }}>
              <div>
                <p style={{ margin: 0, fontSize: 11, color: '#9aacb6', fontWeight: 800, letterSpacing: '0.04em' }}>作业详情</p>
                <h2 style={{ margin: '4px 0 0', fontSize: 18, lineHeight: 1.35, color: '#1c3140', fontWeight: 900 }}>{activeAssignment.title}</h2>
                <p style={{ margin: '5px 0 0', fontSize: 12, color: '#7a96a4' }}>
                  {submittedDetail.graded ? `${graderLabel} · ${submittedDetail.score ?? '--'} / ${activeAssignment.maxScore} 分` : '已提交，等待批改'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeAssignmentModal}
                aria-label="关闭作业详情"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  border: '1px solid #dde6eb',
                  background: '#fff',
                  color: '#7a96a4',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: 18, overflowY: 'auto', display: 'grid', gap: 12, minHeight: 0 }}>
              <div style={{ padding: 14, borderRadius: 12, background: submittedDetail.graded ? 'rgba(29,111,120,0.07)' : '#fff7ed', border: `1px solid ${submittedDetail.graded ? 'rgba(29,111,120,0.14)' : '#fed7aa'}` }}>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: submittedDetail.graded ? '#1d6f78' : '#b45309', fontWeight: 800 }}>{submittedDetail.graded ? graderLabel : '批改结果'}</p>
                <strong style={{ display: 'block', color: '#1c3140', fontSize: 24, marginBottom: 8 }}>
                  {submittedDetail.graded ? `${submittedDetail.score ?? '--'} / ${activeAssignment.maxScore} 分` : '待批改'}
                </strong>
                {!reviewQuestions.length && <p style={{ margin: 0, color: '#304655', fontSize: 13, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
                  {submittedDetail.feedback || '暂无文字反馈。'}
                </p>}
              </div>
              {submittedDetail.graded && reviewQuestions.length > 0 && (
                <div style={{ padding: 14, borderRadius: 12, background: '#fff', border: '1px solid #e4ebf1', display: 'grid', gap: 10 }}>
                  <p style={{ margin: 0, fontSize: 12, color: '#1d6f78', fontWeight: 900 }}>逐题批改</p>
                  {reviewQuestions.map((question, index) => {
                    const comment = question.comment || question.explanation || ''
                    return (
                      <div key={question.id || index} style={{ padding: 12, borderRadius: 10, background: '#f8fbfd', border: '1px solid rgba(30,77,88,0.08)', display: 'grid', gap: 6 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{ color: '#9aacb6', fontWeight: 900, fontSize: 13 }}>{String(index + 1).padStart(2, '0')}</span>
                          <div style={{ minWidth: 0 }}>
                            <strong style={{ display: 'block', color: '#1c3140', fontSize: 13, lineHeight: 1.55 }}>{question.stem}</strong>
                            {question.userAnswer && <p style={{ margin: '6px 0 0', color: '#304655', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>我的答案：{question.userAnswer}</p>}
                            <p style={{ margin: '6px 0 0', color: '#1d6f78', fontSize: 12, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>标准答案：{question.correctAnswer}</p>
                            {comment && <p style={{ margin: '4px 0 0', color: '#7a96a4', fontSize: 12, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>评语：{comment}</p>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {!reviewQuestions.length && (
                <div style={{ padding: 14, borderRadius: 12, background: '#f8fbfd', border: '1px solid #e4ebf1' }}>
                  <p style={{ margin: '0 0 8px', fontSize: 12, color: '#7a96a4', fontWeight: 800 }}>我的提交</p>
                  <p style={{ margin: 0, color: '#304655', fontSize: 13, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{submittedDetail.content}</p>
                </div>
              )}
            </div>
            <div style={{ padding: '13px 18px', borderTop: '1px solid #e4ebf1', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
              <button type="button" onClick={closeAssignmentModal} style={{ padding: '10px 18px', borderRadius: 9, background: '#1d6f78', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )
    }
    const questions = getAssignmentQuestions(activeAssignment)
    const structured = questions.length > 0
    const questionTotal = structured ? questions.length : 1
    const answeredCount = structured
      ? questions.filter(question => isQuestionAnswered(activeAssignment.id, question)).length
      : content.trim().length > 0 ? 1 : 0
    const allAnswered = structured ? allStructuredAnswered(activeAssignment, questions) : content.trim().length > 0
    const progress = questionTotal > 0 ? Math.round((answeredCount / questionTotal) * 100) : 0

    return (
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 5000,
          background: 'rgba(15, 30, 42, 0.46)',
          backdropFilter: 'blur(4px)',
          padding: 'clamp(12px, 3vh, 24px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{
          width: 'min(1040px, calc(100vw - 32px))',
          height: 'min(820px, calc(100dvh - 48px))',
          maxHeight: 'calc(100dvh - 48px)',
          background: '#f4f6f8',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.7)',
          boxShadow: '0 24px 80px rgba(15, 30, 42, 0.28)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{ background: '#fff', padding: '18px 22px 16px', borderBottom: '1px solid #e4ebf1', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, marginBottom: 13 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 11, color: '#9aacb6', fontWeight: 800, letterSpacing: '0.04em' }}>AI 作业作答</p>
                <h2 style={{ margin: '4px 0 0', fontSize: 18, lineHeight: 1.35, color: '#1c3140', fontWeight: 900 }}>{activeAssignment.title}</h2>
                <p style={{ margin: '5px 0 0', fontSize: 12, color: '#7a96a4' }}>
                  共 {questionTotal} 题 · 满分 {activeAssignment.maxScore} 分 · 提交后 AI 立即批改，不能重做
                </p>
              </div>
              <button
                type="button"
                onClick={closeAssignmentModal}
                disabled={submitting}
                aria-label="关闭作业弹窗"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  border: '1px solid #dde6eb',
                  background: '#fff',
                  color: '#7a96a4',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ flex: 1, height: 5, borderRadius: 999, background: '#eef2f5', overflow: 'hidden' }}>
                <span style={{ display: 'block', width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #1d6f78, #35818a)', borderRadius: 999, transition: 'width 0.2s ease' }} />
              </div>
              <span style={{ fontSize: 12, color: '#7a96a4', fontWeight: 800, whiteSpace: 'nowrap' }}>
                已答 {answeredCount}/{questionTotal}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {structured ? questions.map((question, index) => {
                const done = isQuestionAnswered(activeAssignment.id, question)
                return (
                  <button
                    key={question.id}
                    type="button"
                    onClick={() => document.getElementById(`assignment-q-${activeAssignment.id}-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                    title={done ? `第 ${index + 1} 题已作答` : `第 ${index + 1} 题未作答`}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      border: done ? 'none' : '1.5px solid #dde6eb',
                      background: done ? '#1d6f78' : '#fff',
                      color: done ? '#fff' : '#93aab7',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 900,
                      padding: 0,
                    }}
                  >
                    {index + 1}
                  </button>
                )
              }) : (
                <button
                  type="button"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    border: answeredCount ? 'none' : '1.5px solid #dde6eb',
                    background: answeredCount ? '#1d6f78' : '#fff',
                    color: answeredCount ? '#fff' : '#93aab7',
                    fontSize: 11,
                    fontWeight: 900,
                    padding: 0,
                  }}
                >
                  1
                </button>
              )}
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, padding: '18px 18px 28px', overflowY: 'auto', overscrollBehavior: 'contain', scrollBehavior: 'smooth', scrollPaddingBottom: 28, display: 'grid', alignContent: 'start', gap: 10 }}>
            {structured ? (
              questions.map((question, index) => renderQuestionCard(activeAssignment, question, index))
            ) : (
              <div id={`assignment-q-${activeAssignment.id}-0`} style={{ background: '#fff', borderRadius: 10, border: '1px solid #e4ebf1', padding: 16, scrollMarginTop: 16, scrollMarginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
                  <span style={{ fontSize: 22, fontWeight: 900, color: content.trim() ? '#1d6f78' : '#cdd8df', minWidth: 32 }}>01</span>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: '#eef2f5', color: '#5a7f8e', fontWeight: 800 }}>作业内容</span>
                </div>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="写下你的作业内容（支持长文本）…"
                  rows={10}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 8, border: '1.5px solid #dde6eb', fontSize: 13, lineHeight: 1.7, color: '#1c3140', outline: 'none', resize: 'vertical', fontFamily: 'inherit', background: '#fafbfc' }}
                />
              </div>
            )}
          </div>

          <div style={{ background: '#fff', borderTop: '1px solid #e4ebf1', padding: '13px 18px', display: 'grid', gap: 10, flexShrink: 0 }}>
            {submitError && (
              <p style={{ margin: 0, fontSize: 12, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 5 }}>
                <AlertCircle size={13} />{submitError}
              </p>
            )}
            {!allAnswered && (
              <p style={{ margin: 0, fontSize: 12, color: '#b45309', display: 'flex', alignItems: 'center', gap: 5 }}>
                <AlertCircle size={13} />还有 {questionTotal - answeredCount} 道题未作答
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={closeAssignmentModal}
                disabled={submitting}
                style={{ padding: '10px 18px', borderRadius: 9, background: '#fff', color: '#7a96a4', border: '1px solid #dde6eb', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => submit(activeAssignment)}
                disabled={submitting || !allAnswered}
                style={{
                  padding: '10px 24px',
                  borderRadius: 9,
                  border: 'none',
                  background: submitting || !allAnswered ? '#cdd8df' : 'linear-gradient(135deg, #183b4b, #1d6f78)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: submitting || !allAnswered ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                }}
              >
                {submitting ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />AI 批改中…</> : <><CheckCircle2 size={14} />提交作业</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  function renderSubmitResultModal() {
    if (!submitResult) return null

    return (
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 5100,
          background: 'rgba(15, 30, 42, 0.5)',
          backdropFilter: 'blur(4px)',
          padding: 'clamp(12px, 3vh, 24px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{
          width: 'min(460px, calc(100vw - 32px))',
          maxHeight: 'calc(100dvh - 48px)',
          background: '#fff',
          borderRadius: 16,
          padding: '26px 28px',
          boxShadow: '0 24px 70px rgba(15, 30, 42, 0.28)',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{ width: 66, height: 66, borderRadius: '50%', background: 'linear-gradient(135deg, #1d6f78, #2f9e80)', display: 'grid', placeItems: 'center', margin: '0 auto 16px', color: '#fff', flexShrink: 0 }}>
            <Award size={30} />
          </div>
          <p style={{ margin: 0, fontSize: 12, color: '#7a96a4', fontWeight: 800, letterSpacing: '0.06em', flexShrink: 0 }}>AI 批改完成</p>
          <h2 style={{ margin: '6px 0 0', fontSize: 17, color: '#1c3140', lineHeight: 1.45, flexShrink: 0 }}>{submitResult.assignmentTitle}</h2>
          <div style={{ margin: '14px 0 10px', flexShrink: 0 }}>
            <span style={{ fontSize: 58, lineHeight: 1, fontWeight: 900, color: '#1d6f78', letterSpacing: '-0.05em' }}>
              {submitResult.score ?? '--'}
            </span>
            <span style={{ fontSize: 14, color: '#9aacb6', fontWeight: 700 }}> / {submitResult.maxScore} 分</span>
          </div>
          {(submitResult.earnedCredits ?? submitResult.earnedHours) !== null && (
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#1d6f78', fontWeight: 800, flexShrink: 0 }}>
              已计入课时分：+{submitResult.earnedCredits ?? submitResult.earnedHours}
            </p>
          )}
          <p style={{ margin: '0 0 18px', color: '#7a96a4', fontSize: 12, lineHeight: 1.7, flexShrink: 0 }}>
            详细作答与 AI 反馈可在作业卡片中点击查看。
          </p>
          <button
            type="button"
            onClick={() => setSubmitResult(null)}
            style={{ width: '100%', border: 'none', borderRadius: 10, padding: '12px', background: '#1d6f78', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}
          >
            知道了
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {assignments.map(a => {
          const overdue = a.dueDate && new Date(a.dueDate) < new Date()
          const submitted = !!a.mySubmission
          const questions = getAssignmentQuestions(a)
          const cleanDescription = stripAssignmentQuestionBlock(a.description)
          return (
            <div key={a.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #eaeff2', padding: '18px 22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: '#ede9fe', color: '#7c3aed', fontWeight: 600 }}>
                      {a.assignmentType}
                    </span>
                    <span style={{ fontSize: 10, color: '#7a96a4' }}>满分 {a.maxScore}</span>
                    {questions.length > 0 && <span style={{ fontSize: 10, color: '#7a96a4' }}>共 {questions.length} 题</span>}
                    {a.dueDate && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: overdue ? '#dc2626' : '#7a96a4' }}>
                        <Calendar size={10} />截止 {new Date(a.dueDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <h3 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: '#1c3140' }}>{a.title}</h3>
                  <p style={{ margin: 0, fontSize: 12, color: '#3d5a68', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{cleanDescription}</p>
                </div>
                {submitted && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 11, padding: '4px 10px', borderRadius: 20,
                    background: a.mySubmission!.graded ? '#dcfce7' : '#fef3c7',
                    color: a.mySubmission!.graded ? '#16a34a' : '#d97706',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}>
                    <CheckCircle2 size={11} />
                    {a.mySubmission!.graded ? `${a.mySubmission!.score} / ${a.maxScore}` : '已提交'}
                  </span>
                )}
              </div>

              <button onClick={() => openAssignment(a)} disabled={!!overdue && !submitted} style={{
                marginTop: 10, padding: '7px 15px', borderRadius: 8,
                background: overdue && !submitted ? '#f0f4f6' : 'rgba(29,111,120,0.1)',
                color: overdue && !submitted ? '#9aacb6' : '#1d6f78',
                border: 'none', fontSize: 12, fontWeight: 700,
                cursor: overdue && !submitted ? 'not-allowed' : 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                {submitted ? <>查看作业详情 <ArrowRight size={12} /></> : overdue ? '已截止' : <>开始作答 <ArrowRight size={12} /></>}
              </button>
            </div>
          )
        })}
      </div>

      {modalHost && activeAssignment ? createPortal(renderAssignmentModal(), modalHost) : null}

      {modalHost && submitResult ? createPortal(renderSubmitResultModal(), modalHost) : null}
    </>
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
