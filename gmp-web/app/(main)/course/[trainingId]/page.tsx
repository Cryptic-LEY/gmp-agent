'use client'

import { useEffect, useState, useRef, use, type CSSProperties, type RefObject } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, FileText, Sparkles, ClipboardCheck, Gamepad2, MessageSquare,
  CheckCircle2, Clock, Trophy, Target, BookOpen, ArrowRight, Edit3,
  Pin, MessageCircle, Eye, Plus, Send, Calendar, Award, Loader2,
  Video, StickyNote, Highlighter, Download, PlayCircle, ListTree, Search,
  PauseCircle, Volume2, AlertCircle,
  type LucideIcon,
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
    content: string
    score: number | null
    feedback: string | null
    submittedAt: string
    gradedAt: string | null
    graded: boolean
  } | null
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
    completedAt: string | null
    passed: boolean
    published: boolean
    title: string
    description: string | null
    questionCount: number
    passScore: number
    durationMinutes: number
  }
  quizGate: QuizGate
  discussions: { total: number; list: Discussion[] }
  assignments: Assignment[]
  studyMinutes: number
}

type Tab = 'overview' | 'resources' | 'classroom' | 'quiz' | 'simulation' | 'discussion' | 'assignment'
type StudioSideTab = 'catalog' | 'discussion' | 'notes' | 'marks'
type StudioResource = 'ppt' | 'video'

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
  lessonScore?: number
  completed?: boolean
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
    <div style={{ background: '#f4f6f8', minHeight: 'calc(100vh - 58px)' }}>
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
          { id: 'classroom',  label: '课程学习', icon: PlayCircle,     badge: data.courseware?.length || null },
          { id: 'quiz',       label: '章节测验', icon: ClipboardCheck, badge: quiz.latestScore !== null ? `${quiz.latestScore}分` : null },
          { id: 'assignment', label: '作业',     icon: Edit3,          badge: assignments.length > 0 ? assignments.length : null },
          { id: 'resources',  label: '法规资料', icon: FileText,       badge: totalResources },
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
      <div className="tab-content" style={{ padding: '10px 20px 14px' }} key={tab}>
        {tab === 'classroom'  && <LearningStudioTab trainingId={trainingId} data={data} chapter={chapter} courseware={data.courseware ?? []} discussions={discussions.list} setTab={setTab} onChange={loadData} />}
        {tab === 'quiz'       && <QuizTab trainingId={trainingId} quiz={quiz} gate={data.quizGate} eduLevel={chapter.eduLevel} setTab={setTab} />}
        {tab === 'assignment' && <AssignmentTab assignments={assignments} onChange={loadData} />}
        {tab === 'resources'  && <ResourcesTab resources={resources} />}
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
  const videoRef = useRef<HTMLVideoElement>(null)
  const lastVideoReportRef = useRef(0)
  const slideCatalogRefs = useRef<Record<number, HTMLButtonElement | null>>({})
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!selectedLessonId && courseware[0]?.lessonId) setSelectedLessonId(courseware[0].lessonId)
  }, [courseware, selectedLessonId])

  const selectedLesson = courseware.find(item => item.lessonId === selectedLessonId) ?? courseware[0] ?? null
  const filteredCourseware = courseware.filter(item => {
    const keyword = catalogSearch.trim().toLowerCase()
    if (!keyword) return true
    return `${item.title} ${item.description ?? ''}`.toLowerCase().includes(keyword)
  })
  const slides = slideDeck?.slides ?? []
  const classroomUrl = getOpenMaicClassroomUrl(selectedLesson?.pptUrl)
  const totalResources = data.resources.reduce((sum, group) => sum + group.count, 0)
  const masteryCount = data.knowledgePoints.filter(item => item.status === 'mastered').length
  const learningCount = data.knowledgePoints.filter(item => item.status === 'learning').length
  const masteryPct = data.knowledgePoints.length > 0
    ? Math.round((masteryCount + learningCount * 0.6) / data.knowledgePoints.length * 100)
    : 0
  const studyTimeText = data.studyMinutes >= 60
    ? `${Math.floor(data.studyMinutes / 60)}小时${data.studyMinutes % 60}分`
    : `${data.studyMinutes}分钟`

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
      fetch(`/api/course/lessons/${selectedLesson.lessonId}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.ok ? res.json() : null),
      fetch(`/api/course/lessons/${selectedLesson.lessonId}/slides`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.ok ? res.json() : null),
      fetch(`/api/course/lessons/${selectedLesson.lessonId}/annotations`, { headers: { Authorization: `Bearer ${token}` } })
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
  }, [selectedLesson?.lessonId])

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

  useEffect(() => {
    slideCatalogRefs.current[currentSlide]?.scrollIntoView({ block: 'nearest' })
  }, [currentSlide])

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

  function handleVideoProgress() {
    if (!selectedLesson || !videoRef.current) return
    const now = Date.now()
    if (now - lastVideoReportRef.current < 8000) return
    lastVideoReportRef.current = now
    const currentTime = Math.floor(videoRef.current.currentTime)
    void reportLessonProgress(selectedLesson.lessonId, {
      type: 'video',
      currentTime,
      watchedSeconds: currentTime,
    }).then(progress => {
      if (!progress) return
      setLessonDetail(previous => previous
        ? {
          ...previous,
          progress: {
            ...previous.progress,
            videoProgress: progress.videoProgress ?? previous.progress.videoProgress,
            videoWatchedSeconds: progress.videoWatchedSeconds ?? previous.progress.videoWatchedSeconds,
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

  if (!selectedLesson) {
    return (
      <div style={STUDIO_EMPTY}>
        <FileText size={34} color="#9aacb6" />
        <strong>教师尚未发布本章节课件</strong>
        <span>发布 PPT 或视频后，学生打开章节会直接进入这里学习。</span>
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

          <div style={STUDIO_VIEWER}>
            {activeResource === 'ppt' ? (
              <PptViewer
                lesson={selectedLesson}
                deck={slideDeck}
                slides={slides}
                currentSlide={currentSlide}
                classroomUrl={classroomUrl}
                onSlideChange={setCurrentSlide}
                jumpRequest={slideJumpRequest}
              />
            ) : (
              <VideoViewer lesson={selectedLesson} videoRef={videoRef} onProgress={handleVideoProgress} />
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

          <div style={STUDIO_SIDE_CONTENT}>
            {sideTab === 'catalog' && (
              <div style={{ display: 'grid', gap: 10 }}>
                <label style={STUDIO_SEARCH}>
                  <Search size={15} />
                  <input value={catalogSearch} onChange={event => setCatalogSearch(event.target.value)} placeholder="搜索课件" style={STUDIO_SEARCH_INPUT} />
                </label>
                <div style={STUDIO_OVERVIEW_CARD}>
                  <div style={STUDIO_OVERVIEW_HEAD}>
                    <span>学习概览</span>
                    <strong>{masteryPct}%</strong>
                  </div>
                  <div style={STUDIO_PROGRESS_TRACK}>
                    <span style={STUDIO_PROGRESS_FILL(Math.max(4, masteryPct))} />
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
                    <div style={overviewMetricCard}>
                      <small>学习时长</small>
                      <strong>{studyTimeText}</strong>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {filteredCourseware.map((item, index) => {
                    const active = item.lessonId === selectedLesson.lessonId
                    return (
                      <button key={item.lessonId} onClick={() => setSelectedLessonId(item.lessonId)} style={catalogItem(active)}>
                        <span style={{ color: active ? '#1d6f78' : '#7b8794', fontWeight: 800 }}>{index + 1}</span>
                        <span style={{ minWidth: 0 }}>
                          <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</strong>
                          <small>{item.pptUrl ? `${item.pptPageCount || slides.length || 0} 页 PPT` : '无 PPT'} · {item.videoUrl ? '有视频' : '无视频'}</small>
                        </span>
                      </button>
                    )
                  })}
                </div>
                {slides.length > 0 && (
                  <div style={SLIDE_CATALOG_LIST}>
                    {slides.map(slide => (
                      <button
                        key={slide.page}
                        ref={node => { slideCatalogRefs.current[slide.page] = node }}
                        onClick={() => jumpToSlide(slide.page)}
                        style={slideItem(currentSlide === slide.page)}
                        title={slide.title}
                      >
                        <span>{slide.page}</span>
                        <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{slide.title}</strong>
                      </button>
                    ))}
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
  classroomUrl,
  onSlideChange,
  jumpRequest,
}: {
  lesson: Courseware
  deck: SlideDeckPreview | null
  slides: SlidePreview[]
  currentSlide: number
  classroomUrl: string | null
  onSlideChange: (page: number) => void
  jumpRequest: number
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<Record<number, HTMLElement | null>>({})
  const [narrationState, setNarrationState] = useState<'idle' | 'loading' | 'playing' | 'paused'>('idle')
  const [narrationMode, setNarrationMode] = useState<'ai' | 'browser' | null>(null)
  const [narrationNotice, setNarrationNotice] = useState('')
  const [narrationAudioUrl, setNarrationAudioUrl] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioSlideRef = useRef<number | null>(null)
  const audioCacheRef = useRef<Record<number, string>>({})
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
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
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  function pickChineseVoice() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
    const voices = window.speechSynthesis.getVoices()
    return voices.find(voice => voice.lang.toLowerCase().startsWith('zh'))
      ?? voices.find(voice => /chinese|mandarin|中文|普通话/i.test(voice.name))
      ?? null
  }

  function stopBrowserNarration() {
    utteranceRef.current = null
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
  }

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
      utteranceRef.current = null
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
    utteranceRef.current = null
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

  function startBrowserNarration(page: number, text: string, token: number) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (narrationTokenRef.current === token) {
        setNarrationState('idle')
        setNarrationMode(null)
        setNarrationNotice('当前浏览器不支持临时朗读，请配置 AI TTS 后使用讲解模式')
      }
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = 0.92
    utterance.pitch = 1
    const voice = pickChineseVoice()
    if (voice) utterance.voice = voice
    utterance.onend = () => {
      finishNarration(page, token)
    }
    utterance.onerror = () => {
      if (narrationTokenRef.current === token) {
        setNarrationState('idle')
        setNarrationMode(null)
        setNarrationNotice('浏览器临时朗读失败，请检查系统语音设置')
        utteranceRef.current = null
      }
    }
    utteranceRef.current = utterance
    setNarrationMode('browser')
    setNarrationState('playing')
    window.speechSynthesis.speak(utterance)
  }

  async function startNarration(page: number) {
    const slide = slides.find(item => item.page === page) ?? slides[0]
    const text = slide ? getSlideNarrationText(slide) : ''
    if (!slide || !text) return

    const token = narrationTokenRef.current + 1
    narrationTokenRef.current = token
    stopAudioNarration()
    stopBrowserNarration()
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
        setNarrationNotice('AI 音频播放失败，已临时使用浏览器朗读')
        startBrowserNarration(page, text, token)
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
      setNarrationNotice(`${message}，已临时使用浏览器朗读`)
      startBrowserNarration(page, text, token)
    }
  }

  async function toggleNarration() {
    if (narrationState === 'playing') {
      pausedSlideRef.current = audioSlideRef.current ?? currentSlide
      if (narrationMode === 'ai' && audioRef.current) {
        audioRef.current.pause()
      } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.pause()
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
    if (narrationState === 'paused' && pausedSlideRef.current === currentSlide) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.resume()
        setNarrationState('playing')
        setNarrationNotice(`临时朗读中 · 第 ${currentSlide} 页`)
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
              {slide.svg ? (
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
          {classroomUrl && <a href={classroomUrl} target="_blank" rel="noopener" style={PPT_CLASSROOM_LINK}>打开互动课堂</a>}
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

function VideoViewer({ lesson, videoRef, onProgress }: { lesson: Courseware; videoRef: RefObject<HTMLVideoElement | null>; onProgress: () => void }) {
  if (!lesson.videoUrl) {
    return <StudioPlaceholder icon={Video} title="本章节尚未发布视频" desc="教师上传视频后会显示在这里。" />
  }

  return (
    <div style={VIDEO_STAGE}>
      <video
        ref={videoRef}
        src={lesson.videoUrl}
        controls
        onTimeUpdate={onProgress}
        onPause={onProgress}
        onEnded={onProgress}
        style={VIDEO_PLAYER}
      />
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

function getOpenMaicClassroomUrl(url?: string | null) {
  if (!url || !url.includes('/classrooms/')) return null
  try {
    const parsed = new URL(url, window.location.origin)
    const parts = parsed.pathname.split('/').filter(Boolean)
    const index = parts.indexOf('classrooms')
    if (index < 0 || !parts[index + 1]) return null
    return `${parsed.origin}/classrooms/${parts[index + 1]}/`
  } catch {
    return null
  }
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
    gridTemplateColumns: '26px minmax(0, 1fr)',
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

function slideItem(active: boolean): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: '24px minmax(0, 1fr)',
    gap: 8,
    border: 'none',
    background: active ? '#edf6ff' : 'transparent',
    color: active ? '#1677ff' : '#44515f',
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

const STUDIO_SHELL: CSSProperties = {
  height: 'calc(100vh - 156px)',
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
  gridTemplateColumns: 'minmax(0, 1fr) 390px',
  background: '#fff',
}

const STUDIO_MAIN: CSSProperties = {
  position: 'relative',
  minWidth: 0,
  minHeight: 0,
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  borderRight: '6px solid #d4dbe3',
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
  background: '#f8fafc',
  display: 'grid',
  gridTemplateRows: '44px minmax(0, 1fr)',
}

const STUDIO_SIDE_TABS: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  background: '#f1f4f8',
  borderBottom: '1px solid #dfe6ee',
}

const STUDIO_SIDE_CONTENT: CSSProperties = {
  minHeight: 0,
  overflowY: 'auto',
  padding: 14,
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
  scrollBehavior: 'smooth',
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

const PPT_CLASSROOM_LINK: CSSProperties = {
  position: 'sticky',
  right: 28,
  bottom: 24,
  justifySelf: 'end',
  color: '#1677ff',
  background: 'rgba(255,255,255,0.88)',
  border: '1px solid #dbe6f0',
  borderRadius: 7,
  padding: '7px 10px',
  textDecoration: 'none',
  fontWeight: 800,
  fontSize: 12,
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
  height: '100%',
  minHeight: 560,
  background: '#0f172a',
  display: 'grid',
  placeItems: 'center',
}

const VIDEO_PLAYER: CSSProperties = {
  width: '100%',
  height: '100%',
  maxHeight: '100%',
  background: '#0f172a',
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

function ClassroomTab({ chapter, courseware }: { chapter: ChapterDetail['chapter']; courseware: Courseware[] }) {
  const [topic, setTopic] = useState(`${chapter.displayName} - 核心知识点串讲`)
  const [job, setJob] = useState<{ status: 'idle' | 'running' | 'done' | 'failed'; url: string | null; msg: string }>({ status: 'idle', url: null, msg: '' })
  const primaryCourseware = courseware[0]

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
    <div style={{ display: 'grid', gap: 16, maxWidth: 860, margin: '0 auto' }}>
      <section style={{ background: '#fff', borderRadius: 12, border: '1px solid #eaeff2', padding: '22px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <FileText size={18} color="#1d6f78" />
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1c3140' }}>教师发布课件</h2>
        </div>
        {primaryCourseware ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1c3140' }}>{primaryCourseware.title}</p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#7a96a4', lineHeight: 1.7 }}>
                {primaryCourseware.description || `${chapter.displayName} 的章节课件资源`}
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              <a
                href={primaryCourseware.pptUrl || undefined}
                target="_blank"
                rel="noopener"
                aria-disabled={!primaryCourseware.pptUrl}
                style={{
                  pointerEvents: primaryCourseware.pptUrl ? 'auto' : 'none',
                  display: 'grid',
                  gap: 7,
                  padding: 14,
                  borderRadius: 10,
                  border: '1px solid #e0edf0',
                  background: primaryCourseware.pptUrl ? '#f8fbfb' : '#f7f7f7',
                  color: primaryCourseware.pptUrl ? '#1d6f78' : '#9aacb6',
                  textDecoration: 'none',
                }}
              >
                <strong style={{ fontSize: 13 }}>{primaryCourseware.pptUrl ? '打开 PPT/PDF 课件' : '教师尚未发布 PPT'}</strong>
                <span style={{ fontSize: 11, color: '#7a96a4' }}>{primaryCourseware.pptPageCount || 0} 页</span>
              </a>
              <div style={{ padding: 14, borderRadius: 10, border: '1px solid #e0edf0', background: '#f8fbfb' }}>
                <strong style={{ display: 'block', color: '#1c3140', fontSize: 13, marginBottom: 8 }}>
                  {primaryCourseware.videoUrl ? '章节视频' : '教师尚未发布视频'}
                </strong>
                {primaryCourseware.videoUrl ? (
                  <video src={primaryCourseware.videoUrl} controls style={{ width: '100%', borderRadius: 8, background: '#0f172a', maxHeight: 220 }} />
                ) : (
                  <p style={{ margin: 0, color: '#9aacb6', fontSize: 12 }}>视频发布后会显示在这里。</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: '#7a96a4', lineHeight: 1.7 }}>
            教师还没有为本章节发布 PPT 或视频。你仍可以使用下方 AI 课堂临时生成学习材料。
          </p>
        )}
      </section>

      <section style={{ background: '#fff', borderRadius: 12, border: '1px solid #eaeff2', padding: '28px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Sparkles size={18} color="#d97706" />
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1c3140' }}>AI 课堂生成</h2>
      </div>
      <p style={{ margin: '0 0 20px', fontSize: 12, color: '#7a96a4', lineHeight: 1.7 }}>
        基于本章主题自动生成可视化课堂和 PPT 文件。生成时间约 2–5 分钟。
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
          <strong style={{ color: '#1c3140' }}>提示：</strong>AI 课堂会调用已配置的 OpenMAIC 服务，默认地址为本机 3002。
        </p>
      </div>
      </section>
    </div>
  )
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
      <p style={{ margin: '0 0 4px', fontSize: 13, color: '#7a96a4' }}>{quiz.questionCount} 道客观题 · {quiz.passScore} 分通过 · 计入课时分</p>
      <p style={{ margin: '0 0 26px', fontSize: 11, color: '#9aacb6' }}>{quiz.description || '从本章题库随机抽取，包含单选、多选、判断'}</p>

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
        onClick={() => {
          if (unpublished) return
          if (locked) {
            setTab('classroom')
            return
          }
          router.push(`/course/${trainingId}/quiz?eduLevel=${eduLevel}`)
        }}
        style={{
          padding: '12px 36px', borderRadius: 10, border: 'none',
          background: unpublished || locked ? '#eef2f5' : 'linear-gradient(135deg, #183b4b, #1d6f78)',
          color: unpublished || locked ? '#78909c' : '#fff', fontWeight: 700, fontSize: 14, cursor: unpublished ? 'not-allowed' : 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 8,
          letterSpacing: '0.02em',
          boxShadow: unpublished || locked ? 'none' : '0 4px 14px rgba(24,59,75,0.18)',
        }}
      >
        {unpublished ? '等待教师发布' : locked ? '去浏览 PPT' : quiz.latestScore !== null ? '再次测验' : '开始测验'} <ArrowRight size={14} />
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

            {submitted && a.mySubmission && (
              <div style={{
                marginTop: 12,
                border: '1px solid #e4ebf1',
                borderRadius: 9,
                background: '#f8fbfd',
                padding: '10px 12px',
                display: 'grid',
                gap: 8,
              }}>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: 11, color: '#7a96a4', fontWeight: 700 }}>我的提交</p>
                  <p style={{ margin: 0, fontSize: 12, color: '#304655', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{a.mySubmission.content}</p>
                </div>
                {(a.mySubmission.feedback || a.mySubmission.graded) && (
                  <div style={{ borderTop: '1px solid #e8eef3', paddingTop: 8 }}>
                    <p style={{ margin: '0 0 4px', fontSize: 11, color: '#7a96a4', fontWeight: 700 }}>教师反馈</p>
                    <p style={{ margin: 0, fontSize: 12, color: '#304655', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                      {a.mySubmission.feedback || '已评分，暂无文字反馈。'}
                    </p>
                  </div>
                )}
              </div>
            )}

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
              <button onClick={() => { setSubmitTo(a.id); setContent(a.mySubmission?.content ?? '') }} disabled={!!overdue && !submitted} style={{
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
