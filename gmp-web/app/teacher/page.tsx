'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  BookOpenCheck,
  GraduationCap,
  Bot,
  CheckCircle2,
  ClipboardList,
  Cpu,
  Database,
  Download,
  ExternalLink,
  FileText,
  Filter,
  Layers3,
  LoaderCircle,
  LogOut,
  Network,
  Play,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Sparkles,
  Upload,
  User,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import ConsoleHeaderActions, { DEFAULT_CONSOLE_LAYOUT, type ConsoleLayoutConfig } from '../components/ConsoleHeaderActions'
import RoleProfileCenter from '../components/RoleProfileCenter'
import { ComparisonChartCard, DistributionChartCard } from '../components/AnalyticsChartCard'

type SectionKey = 'overview' | 'students' | 'standards' | 'course' | 'projects' | 'knowledge' | 'questions' | 'rules' | 'planRules' | 'cases' | 'aiAssist' | 'exports' | 'profile'
type CourseResourceKind = 'ppt' | 'video'

interface ProfileResponse {
  userId: string
  displayName: string
  email: string
  role: string
  orgId: string
  createdAt: string
  realName?: string | null
  school?: string | null
  major?: string | null
  className?: string | null
  studentId?: string | null
  idCard?: string | null
  phone?: string | null
  avatarUrl?: string | null
}

interface ProfileForm {
  displayName: string
  email: string
  realName: string
  school: string
  major: string
  className: string
  studentId: string
  idCard: string
  phone: string
}

interface DistributionItem {
  label: string
  value: number
}

interface StudentItem {
  userId: string
  displayName: string
  email: string
  school: string
  className: string
  major: string
  educationLevel: string
  onboardingCompleted: boolean
  diagnosticScore: number | null
  wrongCount: number
  planCreatedAt: string | null
  planPreview: Array<{
    projectName: string
    priority: 'high' | 'medium' | 'low'
    reason: string
    wrong: number
    total: number
  }>
  answerStats: {
    total: number
    correct: number
    wrong: number
    pendingReview: number
  }
  createdAt: string
}

interface ProjectTaskItem {
  projectName: string
  eduLevels: string[]
  taskCount: number
  taskNames: string[]
  knowledgeCount: number
  skillCount: number
  questionCount: number
}

interface KnowledgeItem {
  kpId: string
  serialCode: string
  eduLevel: string
  projectName: string
  taskName: string
  title: string
  pointType: string
  difficulty: number
  gmpArticles: string
}

interface QuestionItem {
  questionId: string
  kpId: string | null
  questionType: string
  difficulty: string
  stem: string
  projectName: string
  taskName: string
  knowledgeTitle: string
}

interface ManagementModule {
  key: string
  title: string
  status: 'first' | 'next'
  desc: string
}

interface LessonQuestion {
  id: string
  type: 'single' | 'multiple' | 'judge'
  stem: string
  options: Array<{ key: string; text: string }>
  answer: string
  analysis?: string
}

interface TeacherCourseLesson {
  lessonId: string
  trainingId: string | null
  title: string
  description: string | null
  sortOrder: number
  pptUrl: string | null
  pptPageCount: number
  videoUrl: string | null
  videoDuration: number
  passScore: number
  status: 'draft' | 'published'
  testQuestions: LessonQuestion[]
  chapter?: {
    trainingId: string
    displayName: string
    seqOrder: number
  } | null
  stats: {
    learnerCount: number
    completedCount: number
    averageScore: number
  }
}

interface TeacherCourseChapter {
  trainingId: string
  displayName: string
  seqOrder: number
  hoursCollege: number | null
  hoursUg: number | null
}

interface CourseLessonForm {
  lessonId: string | null
  trainingId: string
  title: string
  description: string
  sortOrder: number
  pptUrl: string
  pptPageCount: number
  videoUrl: string
  videoDuration: number
  passScore: number
  status: 'draft' | 'published'
  testQuestionsText: string
}

interface TeacherAssignmentSubmission {
  id: number
  userId: string
  studentName: string
  studentEmail: string
  className: string | null
  content: string
  score: number | null
  feedback: string | null
  submittedAt: string
  gradedAt: string | null
}

interface TeacherAssignment {
  id: number
  trainingId: string
  chapterName: string
  title: string
  description: string
  assignmentType: string
  maxScore: number
  dueDate: string | null
  createdAt: string
  submissionCount: number
  gradedCount: number
  submissions: TeacherAssignmentSubmission[]
}

interface AssignmentForm {
  id: number | null
  trainingId: string
  title: string
  description: string
  assignmentType: string
  maxScore: number
  dueDate: string
}

interface TeacherChapterQuiz {
  trainingId: string
  displayName: string
  seqOrder: number
  questionPoolCount: number
  title: string
  description: string | null
  questionCount: number
  passScore: number
  durationMinutes: number
  status: 'draft' | 'published'
  updatedAt: string | null
}

interface ChapterQuizForm {
  trainingId: string
  title: string
  description: string
  questionCount: number
  passScore: number
  durationMinutes: number
  status: 'draft' | 'published'
}

interface GradeDraft {
  score: string
  feedback: string
}

interface TeacherChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
  criticTriggered?: boolean
}

interface TeacherOverviewResponse {
  summary: {
    studentCount: number
    classCount: number
    activeRate: number
    onboardingCompletedCount: number
    planGeneratedCount: number
    averageDiagnosticScore: number
    passCount: number
    beginnerCount: number
    answerCount: number
    wrongCount: number
    pendingReviewCount: number
    projectCount: number
    taskCount: number
    knowledgeCount: number
    skillCount: number
    questionCount: number
  }
  distributions: {
    education: DistributionItem[]
    major: DistributionItem[]
    className: DistributionItem[]
    questionType: DistributionItem[]
    questionDifficulty: DistributionItem[]
  }
  managementModules: ManagementModule[]
  students: StudentItem[]
  projectTasks: ProjectTaskItem[]
  knowledgeItems: KnowledgeItem[]
  questionItems: QuestionItem[]
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
  pptUrl: string | null
  outlineUrl: string | null
  pptFileName: string | null
  error: string | null
}

const INITIAL_JOB: JobState = {
  jobId: null,
  status: 'idle',
  step: '',
  progress: 0,
  message: '',
  scenesGenerated: 0,
  totalScenes: null,
  classroomUrl: null,
  pptUrl: null,
  outlineUrl: null,
  pptFileName: null,
  error: null,
}

const STEP_LABELS: Record<string, string> = {
  initializing: '初始化中...',
  researching: '检索课程资料...',
  generating_outlines: '生成课件大纲...',
  generating_scenes: '生成课堂场景...',
  generating_media: '生成媒体内容...',
  generating_tts: '生成讲解备注...',
  persisting: '保存课堂内容...',
  completed: '生成完成',
}

function clampAiSlideCount(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 18
  return Math.max(6, Math.min(60, Math.round(value)))
}

function inferSlideCountFromPrompt(value: string) {
  const match = value.match(/(?:生成|制作|做|需要|约|大约)?\s*(\d{1,2})\s*(?:页|张|p|P|slides?)/i)
  if (!match) return null
  return clampAiSlideCount(Number(match[1]))
}

const COURSE_STANDARD_GROUPS = [
  { title: '专业范围', items: ['专科专业', '本科专业'] },
  { title: '课程目标', items: ['课程教学目标', '项目目标'] },
  { title: '项目设置', items: ['项目任务设置', '项目课时', '项目课时占比', '项目解锁顺序'] },
]

const PRETEST_RULE_GROUPS = [
  { title: '20 道题规则', items: ['覆盖所有项目', '易 12 道', '中 8 道'] },
  { title: '出题策略', items: ['按专业出题', '按项目课时占比出题'] },
  { title: '分数判断规则', items: ['60 分以下：新手，全面系统学习', '60 分及以上：根据错点生成个性化学习方案'] },
  { title: '结果应用', items: ['错点分析规则', '前测结果及应用'] },
]

const PLAN_RULE_GROUPS = [
  { title: '专业与剂型映射', items: ['中药学 / 中药制药：中成药、中药饮片', '生物制药：生物制品', '化学制药：原料药', '药学 / 药物制剂：化学药品', '其他专业：随机选择'] },
  { title: '剂型选择规则', items: ['常见 1-2 个主剂型', '辅助剂型'] },
  { title: '推荐与强化', items: ['项目推荐规则', '薄弱点强化规则'] },
  { title: '案例关联', items: ['专业产品剂型工艺规程关联', '专业产品案例关联'] },
]

const CASE_PROJECTS = [
  '项目一：GMP认知与法规基础',
  '项目二：质量管理体系构建与运行',
  '项目三：厂房设施与设备管理',
  '项目四：文件管理与数据完整性',
  '项目五：确认与验证',
  '项目六：物料与产品管理',
  '项目七：生产过程管理',
  '项目八：质量控制与实验室管理',
  '项目九：产品放行投诉与召回管理',
  '项目十：委托生产与委托检验',
  '项目十一：GMP自检与综合风险管理实训',
]

const PANEL: CSSProperties = {
  background: 'rgba(255,255,255,0.9)',
  borderRadius: 12,
  border: '1px solid rgba(30,77,88,0.1)',
  boxShadow: '0 18px 44px rgba(29,53,74,0.08)',
  backdropFilter: 'blur(16px)',
}

const TH: CSSProperties = {
  padding: '10px 12px',
  color: '#6b8a98',
  fontSize: 12,
  fontWeight: 800,
  textAlign: 'left',
  borderBottom: '1px solid rgba(30,77,88,0.1)',
  background: 'rgba(246,251,251,0.78)',
  whiteSpace: 'nowrap',
}

const TD: CSSProperties = {
  padding: 12,
  color: '#314d5b',
  fontSize: 13,
  lineHeight: 1.55,
  borderBottom: '1px solid rgba(31,71,92,0.07)',
  verticalAlign: 'top',
}

const NAV_ITEMS: Array<{ key: SectionKey; label: string; title: string; desc: string; icon: LucideIcon }> = [
  { key: 'overview', label: '教学总览', title: '教学总览', desc: '学生、前测、学习方案、题库与知识图谱的运行概况。', icon: BarChart3 },
  { key: 'students', label: '学生管理', title: '学生管理', desc: '查看学生资料、前测结果、错题复盘和个性化学习路线。', icon: UsersRound },
  { key: 'standards', label: '课程标准', title: '课程标准管理', desc: '维护专业层次、课程目标、项目任务、课时占比和解锁顺序。', icon: BookOpen },
  { key: 'course', label: '课程学习', title: '课程学习管理', desc: '管理每节课的 PPT、视频、章节测试、发布状态和学生完成情况。', icon: GraduationCap },
  { key: 'projects', label: '项目任务', title: '项目任务', desc: '按项目查看任务、知识点、技能点和题库覆盖情况。', icon: Layers3 },
  { key: 'knowledge', label: '知识图谱', title: '知识/技能图谱', desc: '检索知识点、技能点、任务归属和 GMP 条款关联。', icon: Network },
  { key: 'questions', label: '题库管理', title: '题库管理', desc: '查看题型、难度、项目归属和知识点关联。', icon: ClipboardList },
  { key: 'rules', label: '前测规则', title: '前测规则管理', desc: '管理 20 道题规则、专业出题、课时占比出题、分数判断和错点分析。', icon: Settings2 },
  { key: 'planRules', label: '方案规则', title: '个性化方案规则管理', desc: '维护专业与剂型映射、项目推荐、薄弱点强化和案例关联规则。', icon: Sparkles },
  { key: 'cases', label: '案例库', title: '案例库管理', desc: '按本科教材项目和 GMP 检查案例维护课堂案例资源。', icon: BookOpenCheck },
  { key: 'aiAssist', label: 'AI助手', title: 'AI助手', desc: '面向教师备课、课堂讲解、学生错点复盘和 GMP 法规答疑。', icon: Cpu },
  { key: 'exports', label: '统计导出', title: '统计导出', desc: '导出学生学习状态、题库统计和图谱覆盖数据。', icon: Download },
]

const PROFILE_NAV = {
  title: '个人中心',
  desc: '查看并维护教师账号资料。',
}

const EMPTY_PROFILE_FORM: ProfileForm = {
  displayName: '',
  email: '',
  realName: '',
  school: '',
  major: '',
  className: '',
  studentId: '',
  idCard: '',
  phone: '',
}

const EMPTY_COURSE_FORM: CourseLessonForm = {
  lessonId: null,
  trainingId: '',
  title: '',
  description: '',
  sortOrder: 1,
  pptUrl: '',
  pptPageCount: 1,
  videoUrl: '',
  videoDuration: 600,
  passScore: 60,
  status: 'draft',
  testQuestionsText: JSON.stringify([
    {
      id: 'q1',
      type: 'single',
      stem: '本节课的核心 GMP 要求是什么？',
      options: [
        { key: 'A', text: '质量风险管理' },
        { key: 'B', text: '仅完成生产数量' },
        { key: 'C', text: '忽略文件记录' },
        { key: 'D', text: '减少必要验证' },
      ],
      answer: 'A',
      analysis: 'GMP 学习应围绕质量风险、文件记录和持续改进展开。',
    },
  ], null, 2),
}

const EMPTY_ASSIGNMENT_FORM: AssignmentForm = {
  id: null,
  trainingId: '',
  title: '',
  description: '',
  assignmentType: '案例分析',
  maxScore: 100,
  dueDate: '',
}

const EMPTY_CHAPTER_QUIZ_FORM: ChapterQuizForm = {
  trainingId: '',
  title: '',
  description: '',
  questionCount: 10,
  passScore: 60,
  durationMinutes: 30,
  status: 'draft',
}

const COURSE_UPLOAD_ACCEPT: Record<CourseResourceKind, string> = {
  ppt: '.pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation',
  video: '.mp4,.webm,.ogg,video/mp4,video/webm,video/ogg',
}

const COURSE_UPLOAD_HINT: Record<CourseResourceKind, string> = {
  ppt: '支持 PDF、PPT、PPTX，上传后学生端使用文件路径预览。',
  video: '支持 MP4、WebM、OGG，上传后学生端直接播放。',
}

function profileToForm(profile: ProfileResponse): ProfileForm {
  return {
    displayName: profile.displayName || '',
    email: profile.email || '',
    realName: profile.realName || '',
    school: profile.school || '',
    major: profile.major || '',
    className: profile.className || '',
    studentId: profile.studentId || '',
    idCard: profile.idCard || '',
    phone: profile.phone || '',
  }
}

function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'green' | 'orange' | 'blue' | 'red' }) {
  const palette = {
    neutral: { bg: 'rgba(31,71,92,0.08)', fg: '#46606f' },
    green: { bg: 'rgba(22,163,74,0.11)', fg: '#15803d' },
    orange: { bg: 'rgba(200,129,43,0.12)', fg: '#8a5a18' },
    blue: { bg: 'rgba(37,99,235,0.1)', fg: '#1d4ed8' },
    red: { bg: 'rgba(220,38,38,0.1)', fg: '#b91c1c' },
  }[tone]

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', width: 'fit-content', minHeight: 22, padding: '2px 7px', borderRadius: 7, background: palette.bg, color: palette.fg, fontSize: 11, fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
}

function includesText(...values: Array<string | number | null | undefined>) {
  const haystack = values.map(value => String(value ?? '').toLowerCase()).join(' ')
  return (keyword: string) => haystack.includes(keyword.trim().toLowerCase())
}

function formatDateTimeInput(value?: string | null) {
  if (!value) return ''
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  return normalized.slice(0, 16)
}

function downloadCsv(filename: string, rows: Array<Record<string, string | number | boolean | null | undefined>>) {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0])
  const escapeCell = (value: string | number | boolean | null | undefined) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = [headers.join(','), ...rows.map(row => headers.map(header => escapeCell(row[header])).join(','))].join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function getResourceFileName(url: string) {
  const lastSegment = url.split('/').filter(Boolean).pop() || url
  try {
    return decodeURIComponent(lastSegment)
  } catch {
    return lastSegment
  }
}

function readVideoDuration(file: File) {
  return new Promise<number | null>(resolve => {
    const video = document.createElement('video')
    const objectUrl = URL.createObjectURL(file)
    const cleanup = () => URL.revokeObjectURL(objectUrl)

    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      cleanup()
      const duration = Math.ceil(video.duration)
      resolve(Number.isFinite(duration) && duration > 0 ? duration : null)
    }
    video.onerror = () => {
      cleanup()
      resolve(null)
    }
    video.src = objectUrl
  })
}

function RuleGroupCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div style={{ padding: 14, borderRadius: 8, background: 'rgba(246,251,251,0.78)', border: '1px solid rgba(30,77,88,0.08)', display: 'grid', gap: 10 }}>
      <strong style={{ color: '#183b4b', fontSize: 14 }}>{title}</strong>
      <div style={{ display: 'grid', gap: 7 }}>
        {items.map(item => (
          <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: '#46606f', fontSize: 13, lineHeight: 1.6 }}>
            <CheckCircle2 size={14} color="#1d6f78" style={{ flexShrink: 0, marginTop: 3 }} />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function TeacherPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [displayName, setDisplayName] = useState('教师')
  const [overview, setOverview] = useState<TeacherOverviewResponse | null>(null)
  const [activeSection, setActiveSection] = useState<SectionKey>('overview')
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [difficultyFilter, setDifficultyFilter] = useState('all')
  const [consoleFullscreen, setConsoleFullscreen] = useState(false)
  const [consoleLayout, setConsoleLayout] = useState<ConsoleLayoutConfig>(DEFAULT_CONSOLE_LAYOUT)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [profile, setProfile] = useState<ProfileResponse | null>(null)
  const [profileForm, setProfileForm] = useState<ProfileForm>(EMPTY_PROFILE_FORM)
  const [savingProfile, setSavingProfile] = useState(false)
  const [courseLessons, setCourseLessons] = useState<TeacherCourseLesson[]>([])
  const [courseChapters, setCourseChapters] = useState<TeacherCourseChapter[]>([])
  const [courseAssignments, setCourseAssignments] = useState<TeacherAssignment[]>([])
  const [chapterQuizzes, setChapterQuizzes] = useState<TeacherChapterQuiz[]>([])
  const [courseLoading, setCourseLoading] = useState(false)
  const [courseForm, setCourseForm] = useState<CourseLessonForm>(EMPTY_COURSE_FORM)
  const [assignmentForm, setAssignmentForm] = useState<AssignmentForm>(EMPTY_ASSIGNMENT_FORM)
  const [chapterQuizForm, setChapterQuizForm] = useState<ChapterQuizForm>(EMPTY_CHAPTER_QUIZ_FORM)
  const [gradeDrafts, setGradeDrafts] = useState<Record<number, GradeDraft>>({})
  const [savingCourse, setSavingCourse] = useState(false)
  const [savingAssignment, setSavingAssignment] = useState(false)
  const [savingChapterQuiz, setSavingChapterQuiz] = useState(false)
  const [uploadingCourseFile, setUploadingCourseFile] = useState<CourseResourceKind | null>(null)
  const [showCoursewareModal, setShowCoursewareModal] = useState(false)
  const [showCourseLessonModal, setShowCourseLessonModal] = useState(false)
  const [showAssignmentModal, setShowAssignmentModal] = useState(false)
  const [showAssignmentReviewModal, setShowAssignmentReviewModal] = useState(false)
  const [reviewAssignment, setReviewAssignment] = useState<TeacherAssignment | null>(null)
  const [showChapterQuizModal, setShowChapterQuizModal] = useState(false)
  const [showChapterQuizListModal, setShowChapterQuizListModal] = useState(false)
  const [teacherChatMessages, setTeacherChatMessages] = useState<TeacherChatMessage[]>([
    { role: 'assistant', content: '你好！我是教师端 AI助手，可以帮你做 GMP 课程备课、课堂讲解设计、法规条文解释、案例讨论和学生错点讲评。' },
  ])
  const [teacherChatInput, setTeacherChatInput] = useState('')
  const [teacherChatLoading, setTeacherChatLoading] = useState(false)
  const [aiTopic, setAiTopic] = useState('GMP文件管理与数据完整性')
  const [aiTargetTrainingId, setAiTargetTrainingId] = useState('')
  const [aiTeachingGoals, setAiTeachingGoals] = useState('掌握本章节的法规依据、质量风险控制点和现场证据链。')
  const [aiKeyPoints, setAiKeyPoints] = useState('法规层级与核心要求；飞行检查高频缺陷；CAPA闭环与案例研讨。')
  const [aiCaseContext, setAiCaseContext] = useState('结合药品生产现场的文件记录、设备清洁、偏差调查或数据完整性问题设计课堂案例。')
  const [aiStudentLevel, setAiStudentLevel] = useState('高职/本科药学、制药工程与药品质量管理相关学生')
  const [aiClassHours, setAiClassHours] = useState('2 学时')
  const [aiSlideCount, setAiSlideCount] = useState(18)
  const [job, setJob] = useState<JobState>(INITIAL_JOB)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const teacherChatBottomRef = useRef<HTMLDivElement>(null)
  const teacherChatTextareaRef = useRef<HTMLTextAreaElement>(null)
  const effectiveAiSlideCount = inferSlideCountFromPrompt(aiTopic) ?? aiSlideCount

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.replace('/login')
      return
    }

    async function loadTeacherData() {
      try {
        const headers = { Authorization: `Bearer ${token}` }
        const profileResponse = await fetch('/api/user/profile', { headers })

        if (profileResponse.status === 401) {
          localStorage.clear()
          router.replace('/login')
          return
        }

        const profile = await profileResponse.json() as ProfileResponse
        if (profile.role !== 'teacher' && profile.role !== 'admin') {
          router.replace('/dashboard')
          return
        }

        setDisplayName(profile.displayName || '教师')
        setProfile(profile)
        setProfileForm(profileToForm(profile))
        const overviewResponse = await fetch('/api/teacher/overview', { headers })
        const overviewData = await overviewResponse.json()

        if (!overviewResponse.ok) {
          setError(overviewData.error || '教师端数据读取失败')
          return
        }

        setOverview(overviewData as TeacherOverviewResponse)
      } catch {
        setError('教师端数据读取失败，请刷新后重试。')
      } finally {
        setLoading(false)
      }
    }

    loadTeacherData()
  }, [router])

  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current)
    }
  }, [])

  useEffect(() => {
    teacherChatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [teacherChatMessages, teacherChatLoading])

  const activeNav = activeSection === 'profile' ? PROFILE_NAV : (NAV_ITEMS.find(item => item.key === activeSection) ?? NAV_ITEMS[0])

  const statCards = useMemo(() => {
    if (!overview) return []
    const { summary } = overview

    return [
      { label: '学生数量', value: summary.studentCount, unit: '人', icon: UsersRound, tone: '#1d6f78' },
      { label: '班级数量', value: summary.classCount, unit: '个', icon: BookOpenCheck, tone: '#2563eb' },
      { label: '前测完成', value: summary.onboardingCompletedCount, unit: '人', icon: CheckCircle2, tone: '#16a34a' },
      { label: '平均前测', value: summary.averageDiagnosticScore, unit: '分', icon: BarChart3, tone: '#c8812b' },
      { label: '项目/任务', value: `${summary.projectCount}/${summary.taskCount}`, unit: '', icon: Layers3, tone: '#7c3aed' },
      { label: '题库规模', value: summary.questionCount, unit: '题', icon: ClipboardList, tone: '#dc2626' },
    ]
  }, [overview])

  const filterOptions = useMemo(() => {
    if (!overview) return { classes: [], projects: [], questionTypes: [], difficulties: [], pointTypes: [] }

    return {
      classes: unique(overview.students.map(student => student.className)),
      projects: unique(overview.projectTasks.map(project => project.projectName).concat(overview.knowledgeItems.map(item => item.projectName), overview.questionItems.map(item => item.projectName))),
      questionTypes: unique(overview.questionItems.map(item => item.questionType)),
      difficulties: unique(overview.questionItems.map(item => item.difficulty)),
      pointTypes: unique(overview.knowledgeItems.map(item => item.pointType)),
    }
  }, [overview])

  const filteredStudents = useMemo(() => {
    if (!overview) return []
    const keyword = search.trim().toLowerCase()

    return overview.students.filter(student => {
      if (classFilter !== 'all' && student.className !== classFilter) return false
      if (keyword && !includesText(student.displayName, student.email, student.school, student.className, student.major, student.educationLevel)(keyword)) return false
      return true
    })
  }, [classFilter, overview, search])

  const filteredKnowledge = useMemo(() => {
    if (!overview) return []
    const keyword = search.trim().toLowerCase()

    return overview.knowledgeItems.filter(item => {
      if (projectFilter !== 'all' && item.projectName !== projectFilter) return false
      if (typeFilter !== 'all' && item.pointType !== typeFilter) return false
      if (keyword && !includesText(item.serialCode, item.title, item.projectName, item.taskName, item.gmpArticles)(keyword)) return false
      return true
    })
  }, [overview, projectFilter, search, typeFilter])

  const filteredQuestions = useMemo(() => {
    if (!overview) return []
    const keyword = search.trim().toLowerCase()

    return overview.questionItems.filter(item => {
      if (projectFilter !== 'all' && item.projectName !== projectFilter) return false
      if (difficultyFilter !== 'all' && item.difficulty !== difficultyFilter) return false
      if (typeFilter !== 'all' && item.questionType !== typeFilter) return false
      if (keyword && !includesText(item.stem, item.projectName, item.taskName, item.knowledgeTitle)(keyword)) return false
      return true
    })
  }, [difficultyFilter, overview, projectFilter, search, typeFilter])

  function resetFilters(nextSection: SectionKey) {
    setActiveSection(nextSection)
    setSearch('')
    setClassFilter('all')
    setProjectFilter('all')
    setTypeFilter('all')
    setDifficultyFilter('all')
    setNotice('')
    if (nextSection === 'course') loadCourseLessons()
  }

  function logout() {
    localStorage.clear()
    router.push('/login')
  }

  async function loadOwnProfile() {
    const token = localStorage.getItem('token')
    if (!token) {
      router.replace('/login')
      return
    }

    const response = await fetch('/api/user/profile', {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (response.status === 401) {
      localStorage.clear()
      router.replace('/login')
      return
    }

    const data = await response.json()
    if (!response.ok) throw new Error(data.error || '教师资料读取失败')

    const nextProfile = data as ProfileResponse
    setProfile(nextProfile)
    setProfileForm(profileToForm(nextProfile))
    setDisplayName(nextProfile.displayName || '教师')
  }

  function openProfile() {
    setActiveSection('profile')
    setSearch('')
    setClassFilter('all')
    setProjectFilter('all')
    setTypeFilter('all')
    setDifficultyFilter('all')
    setError('')
    setNotice('')
    loadOwnProfile().catch(err => setError(err instanceof Error ? err.message : '教师资料读取失败'))
  }

  async function saveProfile() {
    const token = localStorage.getItem('token')
    if (!token) {
      router.replace('/login')
      return
    }

    setSavingProfile(true)
    setError('')
    setNotice('')

    try {
      const response = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm),
      })
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || '保存教师资料失败')

      await loadOwnProfile()
      localStorage.setItem('displayName', profileForm.displayName)
      setNotice('个人资料已保存')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存教师资料失败')
    } finally {
      setSavingProfile(false)
    }
  }

  async function saveAvatar(avatarUrl: string) {
    const token = localStorage.getItem('token')
    if (!token) {
      router.replace('/login')
      throw new Error('登录状态已失效')
    }
    const response = await fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatarUrl }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || '头像保存失败')
    await loadOwnProfile()
    localStorage.setItem('avatarUrl', avatarUrl)
    window.dispatchEvent(new Event('profile-avatar-updated'))
    setNotice('头像已更新')
  }

  async function loadCourseLessons() {
    const token = localStorage.getItem('token')
    if (!token) {
      router.replace('/login')
      return
    }

    setCourseLoading(true)
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const [lessonResponse, assignmentResponse, quizResponse] = await Promise.all([
        fetch('/api/teacher/course/lessons', { headers }),
        fetch('/api/teacher/course/assignments', { headers }),
        fetch('/api/teacher/course/chapter-quizzes', { headers }),
      ])
      const [lessonData, assignmentData, quizData] = await Promise.all([
        lessonResponse.json(),
        assignmentResponse.json(),
        quizResponse.json(),
      ])
      if (!lessonResponse.ok) throw new Error(lessonData.error || '课程学习数据读取失败')
      if (!assignmentResponse.ok) throw new Error(assignmentData.error || '作业数据读取失败')
      if (!quizResponse.ok) throw new Error(quizData.error || '章节测验数据读取失败')
      setCourseChapters(lessonData.chapters ?? [])
      setCourseLessons(lessonData.lessons ?? [])
      setCourseAssignments(assignmentData.assignments ?? [])
      setChapterQuizzes(quizData.quizzes ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '课程学习数据读取失败')
    } finally {
      setCourseLoading(false)
    }
  }

  function editCourseLesson(lesson: TeacherCourseLesson) {
    setCourseForm({
      lessonId: lesson.lessonId,
      trainingId: lesson.trainingId || '',
      title: lesson.title,
      description: lesson.description || '',
      sortOrder: lesson.sortOrder,
      pptUrl: lesson.pptUrl || '',
      pptPageCount: lesson.pptPageCount || 1,
      videoUrl: lesson.videoUrl || '',
      videoDuration: lesson.videoDuration || 600,
      passScore: lesson.passScore || 60,
      status: lesson.status,
      testQuestionsText: JSON.stringify(lesson.testQuestions ?? [], null, 2),
    })
    setNotice('已载入课时，可在弹窗中编辑。')
    setShowCourseLessonModal(true)
  }

  function startChapterResource(chapter: TeacherCourseChapter) {
    const existing = courseLessons.find(lesson => lesson.trainingId === chapter.trainingId)
    if (existing) {
      editCourseLesson(existing)
      return
    }

    setCourseForm({
      ...EMPTY_COURSE_FORM,
      trainingId: chapter.trainingId,
      title: chapter.displayName,
      sortOrder: chapter.seqOrder,
      description: `${chapter.displayName} 的章节课件与视频资源`,
    })
    setAiTopic(`${chapter.displayName} 教学PPT`)
    setAiTargetTrainingId(chapter.trainingId)
    setNotice(`已选择 ${chapter.trainingId} · ${chapter.displayName}`)
    setShowCourseLessonModal(true)
  }

  async function uploadCourseResource(kind: CourseResourceKind, file: File | undefined) {
    if (!file) return
    const token = localStorage.getItem('token')
    if (!token) {
      router.replace('/login')
      return
    }

    setUploadingCourseFile(kind)
    setError('')
    setNotice('')

    try {
      const duration = kind === 'video' ? await readVideoDuration(file) : null
      const formData = new FormData()
      formData.append('kind', kind)
      formData.append('file', file)

      const response = await fetch('/api/teacher/course/uploads', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const data = await response.json() as { url?: string; error?: string; originalName?: string }
      if (!response.ok || !data.url) throw new Error(data.error || '文件上传失败')

      setCourseForm(form => kind === 'ppt'
        ? { ...form, pptUrl: data.url ?? '' }
        : { ...form, videoUrl: data.url ?? '', videoDuration: duration ?? form.videoDuration })
      setNotice(`${kind === 'ppt' ? 'PPT/PDF' : '视频'}已上传：${data.originalName || file.name}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '文件上传失败')
    } finally {
      setUploadingCourseFile(null)
    }
  }

  async function saveCourseLesson() {
    const token = localStorage.getItem('token')
    if (!token) {
      router.replace('/login')
      return
    }

    let testQuestions: LessonQuestion[]
    try {
      const parsed = JSON.parse(courseForm.testQuestionsText)
      testQuestions = Array.isArray(parsed) ? parsed : []
    } catch {
      setError('章节测试 JSON 格式不正确')
      return
    }
    if (!courseForm.trainingId) {
      setError('请先选择对应的课程章节')
      return
    }

    setSavingCourse(true)
    setError('')
    setNotice('')
    try {
      const payload = { ...courseForm, testQuestions }
      const response = await fetch(courseForm.lessonId ? `/api/teacher/course/lessons/${courseForm.lessonId}` : '/api/teacher/course/lessons', {
        method: courseForm.lessonId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '课时保存失败')
      setNotice(courseForm.lessonId ? '课时已更新' : '课时已新增')
      setCourseForm(EMPTY_COURSE_FORM)
      setShowCourseLessonModal(false)
      await loadCourseLessons()
    } catch (err) {
      setError(err instanceof Error ? err.message : '课时保存失败')
    } finally {
      setSavingCourse(false)
    }
  }

  async function deleteCourseLesson(lessonId: string) {
    const token = localStorage.getItem('token')
    if (!token) return
    if (!window.confirm('确定删除该课时？学生学习记录也会一并删除。')) return

    const response = await fetch(`/api/teacher/course/lessons/${lessonId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await response.json()
    if (!response.ok) {
      setError(data.error || '删除失败')
      return
    }
    setNotice('课时已删除')
    await loadCourseLessons()
  }

  function editAssignment(assignment: TeacherAssignment) {
    setAssignmentForm({
      id: assignment.id,
      trainingId: assignment.trainingId,
      title: assignment.title,
      description: assignment.description,
      assignmentType: assignment.assignmentType,
      maxScore: assignment.maxScore,
      dueDate: formatDateTimeInput(assignment.dueDate),
    })
    setNotice('已载入作业，可在弹窗中编辑。')
    setShowAssignmentModal(true)
  }

  function openAssignmentReview(assignment: TeacherAssignment) {
    setReviewAssignment(assignment)
    setShowAssignmentReviewModal(true)
  }

  function startChapterAssignment(chapter: TeacherCourseChapter) {
    setAssignmentForm({
      ...EMPTY_ASSIGNMENT_FORM,
      trainingId: chapter.trainingId,
      title: `${chapter.displayName} 作业`,
      description: `围绕 ${chapter.displayName} 完成案例分析、法规依据梳理或学习反思。`,
    })
    setShowAssignmentModal(true)
  }

  async function saveAssignment() {
    const token = localStorage.getItem('token')
    if (!token) {
      router.replace('/login')
      return
    }
    if (!assignmentForm.trainingId || !assignmentForm.title.trim() || !assignmentForm.description.trim()) {
      setError('请补全作业章节、标题和说明')
      return
    }

    setSavingAssignment(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(
        assignmentForm.id ? `/api/teacher/course/assignments/${assignmentForm.id}` : '/api/teacher/course/assignments',
        {
          method: assignmentForm.id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(assignmentForm),
        },
      )
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '作业保存失败')
      setAssignmentForm(EMPTY_ASSIGNMENT_FORM)
      setShowAssignmentModal(false)
      setNotice(assignmentForm.id ? '作业已更新' : '作业已发布')
      await loadCourseLessons()
    } catch (err) {
      setError(err instanceof Error ? err.message : '作业保存失败')
    } finally {
      setSavingAssignment(false)
    }
  }

  async function deleteAssignment(assignmentId: number) {
    const token = localStorage.getItem('token')
    if (!token) return
    if (!window.confirm('确定删除该作业？学生提交记录也会一并删除。')) return

    const response = await fetch(`/api/teacher/course/assignments/${assignmentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await response.json()
    if (!response.ok) {
      setError(data.error || '删除作业失败')
      return
    }
    setNotice('作业已删除')
    await loadCourseLessons()
  }

  function editChapterQuiz(quiz: TeacherChapterQuiz) {
    setChapterQuizForm({
      trainingId: quiz.trainingId,
      title: quiz.title,
      description: quiz.description || '',
      questionCount: quiz.questionCount,
      passScore: quiz.passScore,
      durationMinutes: quiz.durationMinutes,
      status: quiz.status,
    })
    setNotice('已载入章节测验配置。')
    setShowChapterQuizModal(true)
  }

  function startChapterQuiz(chapter: TeacherCourseChapter) {
    const existing = chapterQuizzes.find(quiz => quiz.trainingId === chapter.trainingId)
    if (existing) {
      editChapterQuiz(existing)
      return
    }
    setChapterQuizForm({
      ...EMPTY_CHAPTER_QUIZ_FORM,
      trainingId: chapter.trainingId,
      title: `${chapter.displayName} 章节测验`,
      description: `${chapter.displayName} 的章节学习达成度测验`,
    })
    setShowChapterQuizModal(true)
  }

  async function saveChapterQuiz(status = chapterQuizForm.status) {
    const token = localStorage.getItem('token')
    if (!token) {
      router.replace('/login')
      return
    }
    if (!chapterQuizForm.trainingId || !chapterQuizForm.title.trim()) {
      setError('请补全测验章节和标题')
      return
    }

    setSavingChapterQuiz(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/teacher/course/chapter-quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...chapterQuizForm, status }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '章节测验保存失败')
      setChapterQuizForm(EMPTY_CHAPTER_QUIZ_FORM)
      setShowChapterQuizModal(false)
      setNotice(status === 'published' ? '章节测验已发布' : '章节测验已保存为草稿')
      await loadCourseLessons()
    } catch (err) {
      setError(err instanceof Error ? err.message : '章节测验保存失败')
    } finally {
      setSavingChapterQuiz(false)
    }
  }

  async function toggleChapterQuizStatus(quiz: TeacherChapterQuiz) {
    const token = localStorage.getItem('token')
    if (!token) return
    const nextStatus = quiz.status === 'published' ? 'draft' : 'published'

    setSavingChapterQuiz(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/teacher/course/chapter-quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          trainingId: quiz.trainingId,
          title: quiz.title,
          description: quiz.description || '',
          questionCount: quiz.questionCount,
          passScore: quiz.passScore,
          durationMinutes: quiz.durationMinutes,
          status: nextStatus,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '章节测验状态更新失败')
      setNotice(nextStatus === 'published' ? '章节测验已发布' : '章节测验已下架')
      await loadCourseLessons()
    } catch (err) {
      setError(err instanceof Error ? err.message : '章节测验状态更新失败')
    } finally {
      setSavingChapterQuiz(false)
    }
  }

  async function gradeSubmission(submissionId: number) {
    const token = localStorage.getItem('token')
    if (!token) return
    const draft = gradeDrafts[submissionId]
    if (!draft || !draft.score.trim()) {
      setError('请填写评分')
      return
    }

    const response = await fetch(`/api/teacher/course/assignments/submissions/${submissionId}/grade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ score: Number(draft.score), feedback: draft.feedback }),
    })
    const data = await response.json()
    if (!response.ok) {
      setError(data.error || '评分保存失败')
      return
    }
    setGradeDrafts(current => {
      const next = { ...current }
      delete next[submissionId]
      return next
    })
    setNotice('评分已保存')
    await loadCourseLessons()
    setReviewAssignment(current => {
      if (!current) return current
      const refreshed = courseAssignments.find(assignment => assignment.id === current.id)
      return refreshed ?? current
    })
  }

  async function sendTeacherChatMessage() {
    const question = teacherChatInput.trim()
    if (!question || teacherChatLoading) return

    const token = localStorage.getItem('token')
    if (!token) {
      router.replace('/login')
      return
    }

    setTeacherChatMessages(prev => [...prev, { role: 'user', content: question }, { role: 'assistant', content: '' }])
    setTeacherChatInput('')
    if (teacherChatTextareaRef.current) teacherChatTextareaRef.current.style.height = 'auto'
    setTeacherChatLoading(true)

    try {
      const history = teacherChatMessages.slice(-6).map(message => ({ role: message.role, content: message.content }))
      const response = await fetch('/api/agent/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          question,
          audience: 'teacher',
          history,
        }),
      })

      if (!response.ok || !response.body) {
        setTeacherChatMessages(prev => {
          const messages = [...prev]
          messages[messages.length - 1] = { role: 'assistant', content: 'AI服务暂时不可用，请检查后端是否启动。' }
          return messages
        })
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()
          if (!payload) continue

          try {
            const event = JSON.parse(payload)
            if (event.chunk) {
              setTeacherChatMessages(prev => {
                const messages = [...prev]
                messages[messages.length - 1] = { ...messages[messages.length - 1], content: messages[messages.length - 1].content + event.chunk }
                return messages
              })
            } else if (event.done) {
              setTeacherChatMessages(prev => {
                const messages = [...prev]
                messages[messages.length - 1] = { ...messages[messages.length - 1], sources: event.sources, criticTriggered: event.critic_triggered }
                return messages
              })
            }
          } catch {
            // Ignore malformed SSE chunks from interrupted streams.
          }
        }
      }
    } catch {
      setTeacherChatMessages(prev => {
        const messages = [...prev]
        messages[messages.length - 1] = { role: 'assistant', content: 'AI服务暂时不可用，请检查后端是否启动。' }
        return messages
      })
    } finally {
      setTeacherChatLoading(false)
    }
  }

  function handleTeacherChatKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendTeacherChatMessage()
    }
  }

  function handleTeacherChatInputChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setTeacherChatInput(event.target.value)
    const element = event.target
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 140)}px`
  }

  async function handleGenerateClassroom() {
    if (!aiTopic.trim()) return
    if (pollRef.current) clearTimeout(pollRef.current)

    const targetTrainingId = aiTargetTrainingId || courseForm.trainingId
    setJob({ ...INITIAL_JOB, status: 'pending', message: '正在提交课件生成任务...' })

    const token = localStorage.getItem('token')
    if (!token) {
      router.replace('/login')
      return
    }

    try {
      const response = await fetch('/api/openmaic/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          requirement: aiTopic,
          outputFormat: 'pptx',
          trainingId: targetTrainingId || undefined,
          teachingGoals: aiTeachingGoals,
          keyPoints: aiKeyPoints,
          caseContext: aiCaseContext,
          studentLevel: aiStudentLevel,
          classHours: aiClassHours,
          slideCount: effectiveAiSlideCount,
          styleHint: '参考 GMP培训课件.pptx 的培训课件风格：封面、目标、法规体系、缺陷数据、CAPA流程、案例研讨、总结。',
        }),
      })
      const data = await response.json()

      if (!response.ok || !data.success) {
        setJob(current => ({ ...current, status: 'failed', error: data.error ?? '提交课件生成任务失败' }))
        return
      }

      const jobId = data.jobId as string
      setJob(current => ({
        ...current,
        jobId,
        status: 'running',
        step: data.step ?? 'initializing',
        message: data.message ?? '任务已创建，正在生成...',
      }))
      schedulePoll(jobId, token)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OpenMAIC 服务连接失败'
      setJob(current => ({ ...current, status: 'failed', error: message }))
    }
  }

  function schedulePoll(jobId: string, token: string) {
    pollRef.current = setTimeout(() => pollJob(jobId, token), 5000)
  }

  async function pollJob(jobId: string, token: string) {
    try {
      const response = await fetch(`/api/openmaic/poll/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()

      if (!response.ok || !data.success) {
        setJob(current => ({ ...current, status: 'failed', error: data.error ?? '课件生成状态读取失败' }))
        return
      }

      const update: Partial<JobState> = {
        step: data.step ?? '',
        progress: typeof data.progress === 'number' ? data.progress : 0,
        message: data.message ?? '',
        scenesGenerated: typeof data.scenesGenerated === 'number' ? data.scenesGenerated : 0,
        totalScenes: typeof data.totalScenes === 'number' ? data.totalScenes : null,
      }

      if (data.done) {
        if (data.status === 'succeeded' && data.result?.url) {
          const pptUrl = (data.result.pptUrl || data.result.outlineUrl || data.result.url) as string
          const sceneCount = typeof data.result.sceneCount === 'number' ? data.result.sceneCount : 1
          const targetTrainingId = aiTargetTrainingId || courseForm.trainingId
          const targetChapter = courseChapters.find(chapter => chapter.trainingId === targetTrainingId)
          setCourseForm(form => ({
            ...form,
            trainingId: form.trainingId || targetTrainingId,
            title: form.title || targetChapter?.displayName || aiTopic,
            description: form.description || `${targetChapter?.displayName || aiTopic} 的教学课件资源`,
            sortOrder: targetChapter?.seqOrder ?? form.sortOrder,
            pptUrl,
            pptPageCount: Math.max(form.pptPageCount, sceneCount),
          }))
          setJob(current => ({
            ...current,
            ...update,
            status: 'succeeded',
            classroomUrl: data.result.url as string,
            pptUrl,
            outlineUrl: (data.result.outlineUrl || null) as string | null,
            pptFileName: (data.result.pptFileName || null) as string | null,
            progress: 100,
          }))
          setNotice('OpenMAIC 已生成 PPT，并已回填到课件文件字段。可保存课时或直接发布到所选章节。')
        } else {
          setJob(current => ({ ...current, ...update, status: 'failed', error: data.error ?? '课件生成失败，请重试' }))
        }
        return
      }

      setJob(current => ({ ...current, ...update, status: 'running' }))
      schedulePoll(jobId, token)
    } catch (err) {
      setJob(current => ({ ...current, status: 'failed', error: err instanceof Error ? err.message : '课件生成状态读取失败' }))
    }
  }

  function resetAiJob() {
    if (pollRef.current) clearTimeout(pollRef.current)
    setJob(INITIAL_JOB)
  }

  async function publishGeneratedPptToChapter() {
    const token = localStorage.getItem('token')
    if (!token) {
      router.replace('/login')
      return
    }

    const targetTrainingId = aiTargetTrainingId || courseForm.trainingId
    if (!targetTrainingId) {
      setError('请先选择要上传到哪个课程章节')
      return
    }
    if (!job.pptUrl) {
      setError('请先生成 PPT')
      return
    }

    let testQuestions: LessonQuestion[]
    try {
      const parsed = JSON.parse(courseForm.testQuestionsText || EMPTY_COURSE_FORM.testQuestionsText)
      testQuestions = Array.isArray(parsed) ? parsed : []
    } catch {
      setError('章节测试 JSON 格式不正确')
      return
    }

    const chapter = courseChapters.find(item => item.trainingId === targetTrainingId)
    const existing = courseLessons.find(lesson => lesson.trainingId === targetTrainingId)
    const payload = {
      ...courseForm,
      lessonId: existing?.lessonId ?? null,
      trainingId: targetTrainingId,
      title: courseForm.title || chapter?.displayName || aiTopic,
      description: courseForm.description || `${chapter?.displayName || aiTopic} 的教学课件资源`,
      sortOrder: chapter?.seqOrder ?? courseForm.sortOrder,
      pptUrl: job.pptUrl,
      pptPageCount: Math.max(courseForm.pptPageCount || 1, job.totalScenes || effectiveAiSlideCount),
      videoUrl: existing?.videoUrl || courseForm.videoUrl,
      videoDuration: existing?.videoDuration || courseForm.videoDuration,
      passScore: courseForm.passScore,
      status: 'published' as const,
      testQuestions,
    }

    setSavingCourse(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(existing ? `/api/teacher/course/lessons/${existing.lessonId}` : '/api/teacher/course/lessons', {
        method: existing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '生成课件发布失败')

      setCourseForm(form => ({
        ...form,
        ...payload,
        lessonId: existing?.lessonId ?? data.lessonId ?? form.lessonId,
        testQuestionsText: JSON.stringify(testQuestions, null, 2),
      }))
      await loadCourseLessons()
      setNotice(`已发布到 ${targetTrainingId}${chapter ? ` · ${chapter.displayName}` : ''}，学生端课程学习可见。`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成课件发布失败')
    } finally {
      setSavingCourse(false)
    }
  }

  const headerSearchItems = useMemo(() => [
    { category: '页面导航', label: '教学总览', desc: '查看学生、前测、题库与知识图谱统计', action: () => resetFilters('overview') },
    { category: '页面导航', label: '学生管理', desc: '查看学生资料、学习方案和错题复盘', action: () => resetFilters('students') },
    { category: '页面导航', label: '课程标准', desc: '维护专业、目标、课时占比和解锁顺序', action: () => resetFilters('standards') },
    { category: '页面导航', label: '课程学习', desc: '管理 PPT、视频、测试和发布状态', action: () => resetFilters('course') },
    { category: '页面导航', label: '项目任务', desc: '按项目查看任务、知识点和题库覆盖', action: () => resetFilters('projects') },
    { category: '页面导航', label: '知识图谱', desc: '检索知识点、技能点和 GMP 条款关联', action: () => resetFilters('knowledge') },
    { category: '页面导航', label: '题库管理', desc: '查看题型、难度、项目归属和知识点', action: () => resetFilters('questions') },
    { category: '页面导航', label: '前测规则', desc: '查看出题、分数判断和错点分析规则', action: () => resetFilters('rules') },
    { category: '页面导航', label: '方案规则', desc: '查看专业剂型映射和项目推荐规则', action: () => resetFilters('planRules') },
    { category: '页面导航', label: '案例库', desc: '查看项目案例和 GMP 检查案例', action: () => resetFilters('cases') },
    { category: '页面导航', label: '统计导出', desc: '导出学习状态、题库统计和图谱数据', action: () => resetFilters('exports') },
    { category: '账号', label: '个人中心', desc: '维护教师个人资料和账号安全设置', action: openProfile },
  ], [])

  const headerNotifications = useMemo(() => [
    { id: 'teacher-pending', icon: '审', title: '待复核错题', desc: overview ? `当前有 ${overview.summary.pendingReviewCount} 条错题等待教师复核。` : '教师端数据加载后显示待复核统计。', time: '刚刚', read: (overview?.summary.pendingReviewCount ?? 0) === 0 },
    { id: 'teacher-students', icon: '学', title: '学生学习状态', desc: overview ? `${overview.summary.onboardingCompletedCount}/${overview.summary.studentCount} 名学生已完成前测。` : '可在学生管理中查看学习进度。', time: '今日', read: false },
    { id: 'teacher-export', icon: '表', title: '统计导出可用', desc: '可导出学生学习状态、题库统计和知识图谱覆盖数据。', time: '本周', read: true },
  ], [overview])

  const consoleRadius = Math.max(4, Math.min(16, consoleLayout.pageRadius))
  const topMenuMode = consoleLayout.menuMode === 'top'
  const sidebarCollapsed = consoleLayout.menuMode === 'compact'
  const showSidebar = !consoleFullscreen && !topMenuMode
  const sidebarWidth = showSidebar ? (sidebarCollapsed ? 68 : 232) : 0
  const themeColor = consoleLayout.themeColor
  const softThemeBg = `${themeColor}1f`
  const sidebarDark = consoleLayout.darkMode || consoleLayout.themeStyle === 'side-dark'
  const headerDark = consoleLayout.darkMode || consoleLayout.themeStyle === 'top-dark'
  const shellBg = consoleLayout.darkMode
    ? '#111827'
    : [
      'linear-gradient(90deg, rgba(29,111,120,0.045) 1px, transparent 1px)',
      'linear-gradient(180deg, rgba(29,111,120,0.032) 1px, transparent 1px)',
      'linear-gradient(180deg, #f6fbfb 0%, #eef6f2 54%, #f8f4ed 100%)',
    ].join(', ')
  const surfaceBg = consoleLayout.darkMode ? '#182232' : 'rgba(255,255,255,0.92)'
  const surfaceBorder = consoleLayout.darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(30,77,88,0.1)'
  const bodyText = consoleLayout.darkMode ? '#f4f4f5' : '#183b4b'
  const mutedText = consoleLayout.darkMode ? '#bfcbd9' : '#6b7d86'
  const sidebarBg = sidebarDark
    ? 'linear-gradient(180deg, #122233 0%, #0f1c2a 58%, #0b1622 100%)'
    : 'rgba(255,255,255,0.94)'
  const sidebarText = sidebarDark ? 'rgba(225,237,244,0.82)' : '#46606f'
  const sidebarActiveText = sidebarDark ? '#fff' : themeColor

  function renderToolbar(kind: 'students' | 'knowledge' | 'questions') {
    return (
      <div style={{ ...PANEL, padding: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Filter size={16} color="#1d6f78" />
        <label style={{ height: 38, minWidth: 240, display: 'flex', alignItems: 'center', gap: 8, padding: '0 11px', borderRadius: 10, border: '1px solid rgba(30,77,88,0.12)', background: 'rgba(255,255,255,0.92)' }}>
          <Search size={15} color="#6b8a98" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索姓名、项目、题干或条款" style={{ border: 'none', outline: 'none', flex: 1, minWidth: 0, color: '#183b4b', fontSize: 13, background: 'transparent' }} />
        </label>
        {kind === 'students' && (
          <select value={classFilter} onChange={event => setClassFilter(event.target.value)} style={SELECT_STYLE} aria-label="全部班级">
            <option value="all">全部班级</option>
            {filterOptions.classes.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        )}
        {kind !== 'students' && (
          <select value={projectFilter} onChange={event => setProjectFilter(event.target.value)} style={SELECT_STYLE} aria-label="全部项目">
            <option value="all">全部项目</option>
            {filterOptions.projects.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        )}
        {kind === 'knowledge' && (
          <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} style={SELECT_STYLE} aria-label="全部类型">
            <option value="all">全部类型</option>
            {filterOptions.pointTypes.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        )}
        {kind === 'questions' && (
          <>
            <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} style={SELECT_STYLE} aria-label="全部题型">
              <option value="all">全部题型</option>
              {filterOptions.questionTypes.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={difficultyFilter} onChange={event => setDifficultyFilter(event.target.value)} style={SELECT_STYLE} aria-label="全部难度">
              <option value="all">全部难度</option>
              {filterOptions.difficulties.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </>
        )}
      </div>
    )
  }

  function renderOverview() {
    if (!overview) return null

    return (
      <>
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
          {statCards.map(({ label, value, unit, icon: Icon, tone }) => (
            <div key={label} style={{ ...PANEL, padding: 16, display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ color: '#6b8a98', fontSize: 13 }}>{label}</span>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: `${tone}14`, display: 'grid', placeItems: 'center' }}>
                  <Icon size={17} color={tone} />
                </div>
              </div>
              <strong style={{ color: '#183b4b', fontSize: 26 }}>{value}<span style={{ color: '#8aa0aa', fontSize: 12, marginLeft: 3 }}>{unit}</span></strong>
            </div>
          ))}
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 12 }}>
          <DistributionChartCard title="学生层次分布" subtitle="按当前学生的学历层次统计" items={overview.distributions.education} valueSuffix=" 人" />
          <DistributionChartCard title="专业方向分布" subtitle="学生专业 Top 8" items={overview.distributions.major} variant="bar" valueSuffix=" 人" />
          <DistributionChartCard title="题型分布" subtitle="已启用题库组成" items={overview.distributions.questionType} valueSuffix=" 题" />
          <DistributionChartCard title="题目难度分布" subtitle="用于观察前测梯度" items={overview.distributions.questionDifficulty} valueSuffix=" 题" />
        </section>

        <section style={{ ...PANEL, padding: 16, display: 'grid', gap: 12 }}>
          <strong style={{ color: '#183b4b' }}>待关注事项</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            <div style={NOTICE_STYLE}><AlertTriangle size={17} color="#c8812b" />待复盘错题 {overview.summary.pendingReviewCount} 条</div>
            <div style={NOTICE_STYLE}><CheckCircle2 size={17} color="#1d6f78" />前测完成率 {overview.summary.activeRate}%</div>
            <div style={NOTICE_STYLE}><Database size={17} color="#2563eb" />知识/技能点 {overview.summary.knowledgeCount + overview.summary.skillCount} 个</div>
          </div>
        </section>
      </>
    )
  }

  function renderStudents() {
    if (!overview) return null

    return (
      <>
        {renderToolbar('students')}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 12 }}>
          <DistributionChartCard
            title="前测完成状态"
            items={[
              { label: '已完成', value: overview.summary.onboardingCompletedCount },
              { label: '待完成', value: Math.max(overview.summary.studentCount - overview.summary.onboardingCompletedCount, 0) },
            ]}
            valueSuffix=" 人"
          />
          <DistributionChartCard
            title="前测能力分层"
            subtitle="60 分为达标分界"
            items={[
              { label: '达标', value: overview.summary.passCount },
              { label: '需基础巩固', value: overview.summary.beginnerCount },
            ]}
            valueSuffix=" 人"
          />
        </section>
        <section style={{ ...PANEL, overflow: 'hidden' }}>
          <div style={TABLE_HEADER}>
            <strong style={{ color: '#183b4b' }}>学生列表</strong>
            <span style={{ color: '#6b8a98', fontSize: 12 }}>显示 {filteredStudents.length} 人</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1040 }}>
              <thead>
                <tr>
                  <th style={TH}>学生</th>
                  <th style={TH}>学校/班级</th>
                  <th style={TH}>层次/专业</th>
                  <th style={TH}>前测</th>
                  <th style={TH}>答题状态</th>
                  <th style={TH}>学习方案</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map(student => (
                  <tr key={student.userId}>
                    <td style={TD}>
                      <strong style={{ display: 'block', color: '#183b4b' }}>{student.displayName}</strong>
                      <span style={{ color: '#6b8a98' }}>{student.email}</span>
                    </td>
                    <td style={TD}>{student.school}<br /><span style={{ color: '#6b8a98' }}>{student.className}</span></td>
                    <td style={TD}>{student.educationLevel}<br /><span style={{ color: '#6b8a98' }}>{student.major}</span></td>
                    <td style={TD}>
                      {student.onboardingCompleted ? (
                        <div style={{ display: 'grid', gap: 6 }}>
                          <Pill tone={(student.diagnosticScore ?? 0) >= 60 ? 'green' : 'orange'}>{student.diagnosticScore ?? 0} 分</Pill>
                          <span>错题 {student.wrongCount} 题</span>
                        </div>
                      ) : <Pill tone="orange">未完成</Pill>}
                    </td>
                    <td style={TD}>
                      <div style={{ display: 'grid', gap: 5 }}>
                        <span>答题 {student.answerStats.total} 次</span>
                        <span>错题 {student.answerStats.wrong} 次</span>
                        <span style={{ color: '#c8812b' }}>待复盘 {student.answerStats.pendingReview} 条</span>
                      </div>
                    </td>
                    <td style={TD}>
                      {student.planPreview.length === 0 ? (
                        <span style={{ color: '#8aa0aa' }}>暂无方案</span>
                      ) : (
                        <div style={{ display: 'grid', gap: 6 }}>
                          {student.planPreview.map(item => (
                            <div key={`${student.userId}-${item.projectName}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Pill tone={item.priority === 'high' ? 'red' : item.priority === 'medium' ? 'orange' : 'green'}>{item.priority === 'high' ? '重点' : item.priority === 'medium' ? '复习' : '巩固'}</Pill>
                              <span style={{ color: '#46606f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.projectName}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </>
    )
  }

  function renderCourseUploadField(kind: CourseResourceKind) {
    const isPpt = kind === 'ppt'
    const url = isPpt ? courseForm.pptUrl : courseForm.videoUrl
    const uploading = uploadingCourseFile === kind
    const disabled = uploadingCourseFile !== null

    return (
      <div style={FORM_LABEL}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span>{isPpt ? 'PPT/PDF 文件' : '视频文件'}</span>
          {isPpt && (
            <button
              type="button"
              onClick={() => {
                const chapter = courseChapters.find(item => item.trainingId === courseForm.trainingId)
                if (chapter) setAiTopic(`${chapter.displayName} 教学PPT`)
                if (chapter) setAiTargetTrainingId(chapter.trainingId)
                setShowCoursewareModal(true)
              }}
              style={TINY_BUTTON}
            >
              <Sparkles size={12} />没有PPT？生成PPT
            </button>
          )}
        </div>
        <label style={{ ...UPLOAD_FIELD_STYLE, opacity: disabled && !uploading ? 0.56 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
          <Upload size={17} color="#1d6f78" />
          <span style={{ color: '#183b4b', fontSize: 13, fontWeight: 900 }}>
            {uploading ? '上传中...' : `选择${isPpt ? '课件' : '视频'}文件`}
          </span>
          <span style={UPLOAD_HINT_STYLE}>{COURSE_UPLOAD_HINT[kind]}</span>
          <input
            type="file"
            accept={COURSE_UPLOAD_ACCEPT[kind]}
            disabled={disabled}
            hidden
            onChange={event => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              void uploadCourseResource(kind, file)
            }}
          />
        </label>
        {url ? (
          <div style={UPLOAD_META_STYLE}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>当前文件：{getResourceFileName(url)}</span>
            <a href={url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#1d6f78', textDecoration: 'none', flexShrink: 0 }}>
              打开<ExternalLink size={12} />
            </a>
          </div>
        ) : (
          <span style={{ color: '#8aa0aa', fontSize: 12, fontWeight: 600 }}>{isPpt ? '尚未上传课件文件' : '尚未上传视频文件'}</span>
        )}
      </div>
    )
  }

  function renderCoursewareGenerator() {
    const running = job.status === 'pending' || job.status === 'running'
    const targetTrainingId = aiTargetTrainingId || courseForm.trainingId
    const targetChapter = courseChapters.find(chapter => chapter.trainingId === targetTrainingId)
    const canGenerate = Boolean(aiTopic.trim()) && !running

    return (
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <div style={{ padding: 18, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <strong style={{ color: '#183b4b', fontSize: 16 }}>OpenMAIC 课件生成</strong>
            <Pill tone={job.status === 'succeeded' ? 'green' : running ? 'orange' : job.status === 'failed' ? 'red' : 'blue'}>
              {job.status === 'succeeded' ? '已生成' : running ? '生成中' : job.status === 'failed' ? '失败' : '可生成'}
            </Pill>
          </div>
          <label style={FORM_LABEL}>
            生成后上传到章节
            <select
              value={targetTrainingId}
              disabled={running}
              onChange={event => {
                const nextTrainingId = event.target.value
                const chapter = courseChapters.find(item => item.trainingId === nextTrainingId)
                setAiTargetTrainingId(nextTrainingId)
                if (chapter) {
                  setAiTopic(`${chapter.displayName} 教学PPT`)
                  setCourseForm(form => ({
                    ...form,
                    trainingId: nextTrainingId,
                    title: form.title || chapter.displayName,
                    sortOrder: chapter.seqOrder,
                    description: form.description || `${chapter.displayName} 的章节课件与视频资源`,
                  }))
                }
              }}
              style={INPUT_STYLE}
            >
              <option value="">请选择章节</option>
              {courseChapters.map(chapter => (
                <option key={chapter.trainingId} value={chapter.trainingId}>
                  {chapter.trainingId} · {chapter.displayName}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 7, color: '#6b8a98', fontSize: 12, fontWeight: 800 }}>
            课件主题
            <textarea
              value={aiTopic}
              onChange={event => setAiTopic(event.target.value)}
              disabled={running}
              rows={3}
              placeholder="例如：GMP认知与法规基础 教学PPT"
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid rgba(30,77,88,0.12)', borderRadius: 10, background: 'rgba(255,255,255,0.92)', padding: 12, color: '#183b4b', fontSize: 14, lineHeight: 1.7, outline: 'none', resize: 'vertical' }}
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
            <label style={FORM_LABEL}>面向学生<input value={aiStudentLevel} disabled={running} onChange={event => setAiStudentLevel(event.target.value)} style={INPUT_STYLE} /></label>
            <label style={FORM_LABEL}>建议课时<input value={aiClassHours} disabled={running} onChange={event => setAiClassHours(event.target.value)} style={INPUT_STYLE} /></label>
            <label style={FORM_LABEL}>页数<input type="number" min={6} max={60} value={aiSlideCount} disabled={running} onChange={event => setAiSlideCount(clampAiSlideCount(Number(event.target.value) || 18))} style={INPUT_STYLE} /></label>
          </div>
          {inferSlideCountFromPrompt(aiTopic) && (
            <span style={{ color: '#6b8a98', fontSize: 12 }}>
              已从提示词识别页数：{effectiveAiSlideCount} 页，可修改提示词或页数字段调整。
            </span>
          )}
          <label style={FORM_LABEL}>教学目标<textarea value={aiTeachingGoals} disabled={running} onChange={event => setAiTeachingGoals(event.target.value)} rows={2} style={TEXTAREA_STYLE} /></label>
          <label style={FORM_LABEL}>重点难点 / 必须覆盖内容<textarea value={aiKeyPoints} disabled={running} onChange={event => setAiKeyPoints(event.target.value)} rows={2} style={TEXTAREA_STYLE} /></label>
          <label style={FORM_LABEL}>案例场景 / 参考素材<textarea value={aiCaseContext} disabled={running} onChange={event => setAiCaseContext(event.target.value)} rows={3} placeholder="可输入真实检查缺陷、企业场景、法规条款、想要强调的课堂案例" style={TEXTAREA_STYLE} /></label>
          {job.status === 'failed' && job.error && (
            <div style={{ padding: 12, borderRadius: 8, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.18)', color: '#b91c1c', fontSize: 13 }}>
              {job.error}
            </div>
          )}
          {running && (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: '#46606f', fontSize: 13 }}>
                <span>{STEP_LABELS[job.step] ?? job.message ?? '处理中...'}</span>
                <strong>{job.progress}%</strong>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: 'rgba(31,71,92,0.08)', overflow: 'hidden' }}>
                <div style={{ width: `${job.progress}%`, height: '100%', background: 'linear-gradient(90deg,#1d6f78,#409eff)', transition: 'width 0.3s ease' }} />
              </div>
              <span style={{ color: '#6b8a98', fontSize: 12 }}>
                {job.totalScenes !== null ? `已生成 ${job.scenesGenerated} / ${job.totalScenes} 个课堂场景` : '正在准备课堂场景'}
              </span>
            </div>
          )}
          {job.status === 'succeeded' && job.classroomUrl && (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ padding: 10, borderRadius: 8, background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.18)', color: '#15803d', fontSize: 12, lineHeight: 1.6 }}>
                PPT 已生成并回填到右侧课件文件字段。文件名：{job.pptFileName || getResourceFileName(job.pptUrl || '')}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => window.open(job.classroomUrl!, '_blank')} style={PRIMARY_BUTTON}>
                  <Play size={15} />打开生成结果
                  <ExternalLink size={13} />
                </button>
                {job.pptUrl && (
                  <button onClick={() => window.open(job.pptUrl!, '_blank')} style={SECONDARY_BUTTON}>
                    <FileText size={15} />打开PPT
                    <ExternalLink size={13} />
                  </button>
                )}
                <button
                  onClick={publishGeneratedPptToChapter}
                  disabled={savingCourse || !job.pptUrl || !targetTrainingId}
                  style={{ ...PRIMARY_BUTTON, opacity: savingCourse || !job.pptUrl || !targetTrainingId ? 0.55 : 1, cursor: savingCourse || !job.pptUrl || !targetTrainingId ? 'not-allowed' : 'pointer' }}
                >
                  <Upload size={15} />{savingCourse ? '发布中...' : '发布到所选章节'}
                </button>
                <button onClick={resetAiJob} style={SECONDARY_BUTTON}>
                  <RefreshCw size={15} />生成新课件
                </button>
              </div>
            </div>
          )}
          {(job.status === 'idle' || job.status === 'failed') && (
            <button onClick={handleGenerateClassroom} disabled={!canGenerate} style={{ ...PRIMARY_BUTTON, opacity: canGenerate ? 1 : 0.5, cursor: canGenerate ? 'pointer' : 'not-allowed' }}>
              <Sparkles size={15} />
              {job.status === 'failed' ? '重新生成课件' : `生成 ${effectiveAiSlideCount} 页课件`}
            </button>
          )}
          {running && (
            <button onClick={resetAiJob} style={SECONDARY_BUTTON}>
              取消生成
            </button>
          )}
        </div>

        <div style={{ padding: 18, display: 'grid', gap: 12, alignContent: 'start', borderLeft: '1px solid rgba(30,77,88,0.08)', background: 'rgba(246,251,251,0.5)' }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <strong style={{ color: '#183b4b', fontSize: 15 }}>生成提示</strong>
            <span style={{ color: '#6b8a98', fontSize: 12, lineHeight: 1.6 }}>
              当前将参考你提供的 GMP 培训课件结构：封面、学习目标、法规体系、缺陷数据、CAPA流程、案例研讨和总结。{targetChapter ? ` 已选择 ${targetChapter.trainingId} · ${targetChapter.displayName}。` : ''}
            </span>
          </div>
          <strong style={{ color: '#183b4b', fontSize: 15 }}>推荐主题</strong>
          {[
            'GMP确认与验证项目案例',
            '数据完整性与ALCOA+原则',
            '洁净区环境监测与偏差处理',
            '产品放行投诉与召回管理',
          ].map(topic => (
            <button key={topic} onClick={() => setAiTopic(topic)} disabled={running} style={{ padding: '9px 11px', borderRadius: 8, border: '1px solid rgba(30,77,88,0.1)', background: aiTopic === topic ? 'rgba(29,111,120,0.08)' : '#fff', color: aiTopic === topic ? '#1d6f78' : '#46606f', textAlign: 'left', cursor: running ? 'not-allowed' : 'pointer', fontSize: 13 }}>
              {topic}
            </button>
          ))}
          <div style={{ padding: 12, borderRadius: 8, background: '#fff', border: '1px solid rgba(30,77,88,0.1)', display: 'grid', gap: 6 }}>
            <strong style={{ color: '#183b4b', fontSize: 13 }}>发布规则</strong>
            <span style={{ color: '#6b8a98', fontSize: 12, lineHeight: 1.6 }}>生成完成后点击“发布到所选章节”，系统会创建或更新该章节课件，状态设为已发布，学生端课程学习即可看到。</span>
          </div>
        </div>
      </section>
    )
  }

  function renderTeacherConfigModal(title: string, desc: string, onClose: () => void, children: ReactNode, width = 'min(760px, 94vw)') {
    return (
      <div style={MODAL_BACKDROP} onClick={onClose}>
        <div style={{ ...COURSEWARE_MODAL, width }} onClick={event => event.stopPropagation()}>
          <div style={MODAL_HEADER}>
            <div>
              <strong style={{ color: '#183b4b', fontSize: 17 }}>{title}</strong>
              <p style={{ margin: '4px 0 0', color: '#6b8a98', fontSize: 12 }}>{desc}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="关闭弹窗" style={ICON_BUTTON}>
              <X size={16} />
            </button>
          </div>
          <div style={{ padding: 16, display: 'grid', gap: 12 }}>
            {children}
          </div>
        </div>
      </div>
    )
  }

  function renderCourseLessonForm() {
    return (
      <>
        <label style={FORM_LABEL}>
          对应章节
          <select
            value={courseForm.trainingId}
            onChange={event => {
              const chapter = courseChapters.find(item => item.trainingId === event.target.value)
              setCourseForm(form => ({
                ...form,
                trainingId: event.target.value,
                title: form.title || chapter?.displayName || '',
                sortOrder: chapter?.seqOrder ?? form.sortOrder,
              }))
              if (chapter) {
                setAiTopic(`${chapter.displayName} 教学PPT`)
                setAiTargetTrainingId(chapter.trainingId)
              }
            }}
            style={INPUT_STYLE}
          >
            <option value="">请选择章节</option>
            {courseChapters.map(chapter => (
              <option key={chapter.trainingId} value={chapter.trainingId}>
                {chapter.trainingId} · {chapter.displayName}
              </option>
            ))}
          </select>
        </label>
        <label style={FORM_LABEL}>课时标题<input value={courseForm.title} onChange={event => setCourseForm(form => ({ ...form, title: event.target.value }))} style={INPUT_STYLE} /></label>
        <label style={FORM_LABEL}>课时简介<textarea value={courseForm.description} onChange={event => setCourseForm(form => ({ ...form, description: event.target.value }))} rows={3} style={TEXTAREA_STYLE} /></label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label style={FORM_LABEL}>排序<input type="number" value={courseForm.sortOrder} onChange={event => setCourseForm(form => ({ ...form, sortOrder: Number(event.target.value) }))} style={INPUT_STYLE} /></label>
          <label style={FORM_LABEL}>状态<select value={courseForm.status} onChange={event => setCourseForm(form => ({ ...form, status: event.target.value as 'draft' | 'published' }))} style={INPUT_STYLE}><option value="draft">草稿</option><option value="published">已发布</option></select></label>
        </div>
        {renderCourseUploadField('ppt')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label style={FORM_LABEL}>PPT 页数<input type="number" value={courseForm.pptPageCount} onChange={event => setCourseForm(form => ({ ...form, pptPageCount: Number(event.target.value) }))} style={INPUT_STYLE} /></label>
          <label style={FORM_LABEL}>视频秒数<input type="number" value={courseForm.videoDuration} onChange={event => setCourseForm(form => ({ ...form, videoDuration: Number(event.target.value) }))} style={INPUT_STYLE} /></label>
        </div>
        {renderCourseUploadField('video')}
        <label style={FORM_LABEL}>测试及格线<input type="number" value={courseForm.passScore} onChange={event => setCourseForm(form => ({ ...form, passScore: Number(event.target.value) }))} style={INPUT_STYLE} /></label>
        <label style={FORM_LABEL}>章节测试 JSON<textarea value={courseForm.testQuestionsText} onChange={event => setCourseForm(form => ({ ...form, testQuestionsText: event.target.value }))} rows={10} style={{ ...TEXTAREA_STYLE, fontFamily: 'monospace', fontSize: 12 }} /></label>
        <button onClick={saveCourseLesson} disabled={savingCourse} style={{ ...PRIMARY_BUTTON, justifyContent: 'center' }}>{savingCourse ? '保存中...' : '保存课时'}</button>
      </>
    )
  }

  function renderAssignmentForm() {
    return (
      <>
        <label style={FORM_LABEL}>
          对应章节
          <select
            value={assignmentForm.trainingId}
            onChange={event => {
              const chapter = courseChapters.find(item => item.trainingId === event.target.value)
              setAssignmentForm(form => ({
                ...form,
                trainingId: event.target.value,
                title: form.title || (chapter ? `${chapter.displayName} 作业` : ''),
                description: form.description || (chapter ? `围绕 ${chapter.displayName} 完成案例分析、法规依据梳理或学习反思。` : ''),
              }))
            }}
            style={INPUT_STYLE}
          >
            <option value="">请选择章节</option>
            {courseChapters.map(chapter => (
              <option key={chapter.trainingId} value={chapter.trainingId}>{chapter.trainingId} · {chapter.displayName}</option>
            ))}
          </select>
        </label>
        <label style={FORM_LABEL}>作业标题<input value={assignmentForm.title} onChange={event => setAssignmentForm(form => ({ ...form, title: event.target.value }))} style={INPUT_STYLE} /></label>
        <label style={FORM_LABEL}>作业类型<input value={assignmentForm.assignmentType} onChange={event => setAssignmentForm(form => ({ ...form, assignmentType: event.target.value }))} style={INPUT_STYLE} /></label>
        <label style={FORM_LABEL}>作业说明<textarea value={assignmentForm.description} onChange={event => setAssignmentForm(form => ({ ...form, description: event.target.value }))} rows={6} style={TEXTAREA_STYLE} /></label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label style={FORM_LABEL}>满分<input type="number" min={1} max={100} value={assignmentForm.maxScore} onChange={event => setAssignmentForm(form => ({ ...form, maxScore: Number(event.target.value) }))} style={INPUT_STYLE} /></label>
          <label style={FORM_LABEL}>截止时间<input type="datetime-local" value={assignmentForm.dueDate} onChange={event => setAssignmentForm(form => ({ ...form, dueDate: event.target.value }))} style={INPUT_STYLE} /></label>
        </div>
        <button onClick={saveAssignment} disabled={savingAssignment} style={{ ...PRIMARY_BUTTON, justifyContent: 'center' }}>{savingAssignment ? '保存中...' : assignmentForm.id ? '更新作业' : '发布作业'}</button>
      </>
    )
  }

  function renderChapterQuizForm() {
    return (
      <>
        <label style={FORM_LABEL}>
          对应章节
          <select
            value={chapterQuizForm.trainingId}
            onChange={event => {
              const chapter = courseChapters.find(item => item.trainingId === event.target.value)
              const existing = chapterQuizzes.find(quiz => quiz.trainingId === event.target.value)
              setChapterQuizForm(existing
                ? {
                  trainingId: existing.trainingId,
                  title: existing.title,
                  description: existing.description || '',
                  questionCount: existing.questionCount,
                  passScore: existing.passScore,
                  durationMinutes: existing.durationMinutes,
                  status: existing.status,
                }
                : {
                  ...EMPTY_CHAPTER_QUIZ_FORM,
                  trainingId: event.target.value,
                  title: chapter ? `${chapter.displayName} 章节测验` : '',
                  description: chapter ? `${chapter.displayName} 的章节学习达成度测验` : '',
                })
            }}
            style={INPUT_STYLE}
          >
            <option value="">请选择章节</option>
            {courseChapters.map(chapter => (
              <option key={chapter.trainingId} value={chapter.trainingId}>{chapter.trainingId} · {chapter.displayName}</option>
            ))}
          </select>
        </label>
        <label style={FORM_LABEL}>测验标题<input value={chapterQuizForm.title} onChange={event => setChapterQuizForm(form => ({ ...form, title: event.target.value }))} style={INPUT_STYLE} /></label>
        <label style={FORM_LABEL}>测验说明<textarea value={chapterQuizForm.description} onChange={event => setChapterQuizForm(form => ({ ...form, description: event.target.value }))} rows={4} style={TEXTAREA_STYLE} /></label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <label style={FORM_LABEL}>题数<input type="number" min={1} max={50} value={chapterQuizForm.questionCount} onChange={event => setChapterQuizForm(form => ({ ...form, questionCount: Number(event.target.value) }))} style={INPUT_STYLE} /></label>
          <label style={FORM_LABEL}>及格线<input type="number" min={1} max={100} value={chapterQuizForm.passScore} onChange={event => setChapterQuizForm(form => ({ ...form, passScore: Number(event.target.value) }))} style={INPUT_STYLE} /></label>
          <label style={FORM_LABEL}>限时<input type="number" min={5} max={180} value={chapterQuizForm.durationMinutes} onChange={event => setChapterQuizForm(form => ({ ...form, durationMinutes: Number(event.target.value) }))} style={INPUT_STYLE} /></label>
        </div>
        <label style={FORM_LABEL}>状态<select value={chapterQuizForm.status} onChange={event => setChapterQuizForm(form => ({ ...form, status: event.target.value as 'draft' | 'published' }))} style={INPUT_STYLE}><option value="draft">草稿</option><option value="published">已发布</option></select></label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button onClick={() => saveChapterQuiz('draft')} disabled={savingChapterQuiz} style={{ ...SECONDARY_BUTTON, justifyContent: 'center' }}>保存草稿</button>
          <button onClick={() => saveChapterQuiz('published')} disabled={savingChapterQuiz} style={{ ...PRIMARY_BUTTON, justifyContent: 'center' }}>{savingChapterQuiz ? '发布中...' : '发布测验'}</button>
        </div>
      </>
    )
  }

  function renderAssignmentReview(assignment: TeacherAssignment) {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ padding: 13, borderRadius: 10, background: 'rgba(246,251,251,0.78)', border: '1px solid rgba(30,77,88,0.08)' }}>
          <span style={{ color: '#1d6f78', fontSize: 12, fontWeight: 900 }}>{assignment.trainingId} · {assignment.chapterName}</span>
          <strong style={{ display: 'block', color: '#183b4b', fontSize: 16, marginTop: 3 }}>{assignment.title}</strong>
          <p style={{ margin: '6px 0 0', color: '#6b8a98', fontSize: 12 }}>{assignment.assignmentType} · 满分 {assignment.maxScore}{assignment.dueDate ? ` · 截止 ${formatDateTimeInput(assignment.dueDate).replace('T', ' ')}` : ''}</p>
        </div>
        {assignment.submissions.length === 0 ? (
          <div style={{ padding: 22, border: '1px dashed rgba(30,77,88,0.18)', borderRadius: 10, color: '#6b8a98', fontSize: 13 }}>
            还没有学生提交。
          </div>
        ) : assignment.submissions.map(submission => {
          const draft = gradeDrafts[submission.id] ?? {
            score: submission.score === null ? '' : String(submission.score),
            feedback: submission.feedback ?? '',
          }
          return (
            <div key={submission.id} style={{ display: 'grid', gap: 10, border: '1px solid rgba(30,77,88,0.1)', borderRadius: 12, background: '#fff', padding: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div>
                  <strong style={{ color: '#183b4b', fontSize: 14 }}>{submission.studentName}</strong>
                  <span style={{ color: '#8aa0aa', fontSize: 12, marginLeft: 8 }}>{submission.className || submission.studentEmail}</span>
                </div>
                <Pill tone={submission.gradedAt ? 'green' : 'orange'}>{submission.gradedAt ? '已批改' : '待批改'}</Pill>
              </div>
              <span style={{ color: '#8aa0aa', fontSize: 11 }}>提交时间：{formatDateTimeInput(submission.submittedAt).replace('T', ' ')}</span>
              <p style={{ margin: 0, color: '#314d5b', fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap', padding: 12, borderRadius: 9, background: 'rgba(246,251,251,0.72)' }}>{submission.content}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '110px minmax(0, 1fr) auto', gap: 8, alignItems: 'center' }}>
                <input
                  type="number"
                  min={0}
                  max={assignment.maxScore}
                  value={draft.score}
                  onChange={event => setGradeDrafts(current => ({ ...current, [submission.id]: { ...draft, score: event.target.value } }))}
                  placeholder="评分"
                  style={INPUT_STYLE}
                />
                <input
                  value={draft.feedback}
                  onChange={event => setGradeDrafts(current => ({ ...current, [submission.id]: { ...draft, feedback: event.target.value } }))}
                  placeholder="反馈，可选"
                  style={INPUT_STYLE}
                />
                <button onClick={() => gradeSubmission(submission.id)} style={PRIMARY_BUTTON}>保存评分</button>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  function renderAssignmentManagement() {
    const submittedTotal = courseAssignments.reduce((sum, assignment) => sum + assignment.submissionCount, 0)
    const pendingGradeTotal = courseAssignments.reduce((sum, assignment) => sum + Math.max(assignment.submissionCount - assignment.gradedCount, 0), 0)

    return (
      <section style={{ ...PANEL, padding: 16, display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div>
            <strong style={{ color: '#183b4b', fontSize: 16 }}>作业发布与批改</strong>
            <p style={{ margin: '4px 0 0', color: '#6b8a98', fontSize: 12 }}>已发布 {courseAssignments.length} 项，收到 {submittedTotal} 份提交，待批改 {pendingGradeTotal} 份。批改在弹窗中完成，无需滚动到底部。</p>
          </div>
          <button onClick={() => { setAssignmentForm(EMPTY_ASSIGNMENT_FORM); setShowAssignmentModal(true) }} style={PRIMARY_BUTTON}>新增作业</button>
        </div>
        {courseAssignments.length === 0 ? (
          <div style={{ padding: 22, border: '1px dashed rgba(30,77,88,0.18)', borderRadius: 10, color: '#6b8a98', fontSize: 13 }}>暂无作业。点击“新增作业”选择章节后发布。</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
            {courseAssignments.map(assignment => (
              <div key={assignment.id} style={{ display: 'grid', gap: 10, padding: 14, border: '1px solid rgba(30,77,88,0.1)', borderRadius: 12, background: 'rgba(248,252,252,0.88)' }}>
                <div>
                  <span style={{ color: '#1d6f78', fontSize: 12, fontWeight: 900 }}>{assignment.trainingId} · {assignment.chapterName}</span>
                  <strong style={{ display: 'block', color: '#183b4b', fontSize: 15, marginTop: 4 }}>{assignment.title}</strong>
                  <p style={{ margin: '6px 0 0', color: '#6b8a98', fontSize: 12, lineHeight: 1.65, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{assignment.description}</p>
                </div>
                <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Pill tone={assignment.submissionCount === assignment.gradedCount && assignment.submissionCount > 0 ? 'green' : assignment.submissionCount > 0 ? 'orange' : 'neutral'}>{assignment.gradedCount}/{assignment.submissionCount} 已批</Pill>
                  <span style={{ color: '#8aa0aa', fontSize: 11 }}>满分 {assignment.maxScore}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => openAssignmentReview(assignment)} style={PRIMARY_BUTTON}>批改作业</button>
                  <button onClick={() => editAssignment(assignment)} style={SECONDARY_BUTTON}>编辑</button>
                  <button onClick={() => deleteAssignment(assignment.id)} style={{ ...SECONDARY_BUTTON, color: '#b91c1c' }}>删除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    )
  }

  function renderChapterQuizList() {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        {chapterQuizzes.map(quiz => (
          <div key={quiz.trainingId} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) 110px 150px auto', gap: 12, alignItems: 'center', padding: 13, borderRadius: 12, border: '1px solid rgba(30,77,88,0.1)', background: '#fff' }}>
            <div style={{ minWidth: 0 }}>
              <strong style={{ display: 'block', color: '#183b4b', fontSize: 14 }}>{quiz.trainingId} · {quiz.displayName}</strong>
              <span style={{ color: '#6b8a98', fontSize: 12 }}>{quiz.title}</span>
            </div>
            <Pill tone={quiz.questionPoolCount > 0 ? 'green' : 'orange'}>{quiz.questionPoolCount} 题可抽</Pill>
            <span style={{ color: '#46606f', fontSize: 12 }}>{quiz.questionCount} 题 · {quiz.passScore} 分<br />限时 {quiz.durationMinutes} 分钟</span>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Pill tone={quiz.status === 'published' ? 'green' : 'orange'}>{quiz.status === 'published' ? '已发布' : '草稿'}</Pill>
              <button onClick={() => editChapterQuiz(quiz)} style={SECONDARY_BUTTON}>配置</button>
              <button onClick={() => toggleChapterQuizStatus(quiz)} style={SECONDARY_BUTTON}>{quiz.status === 'published' ? '下架' : '发布'}</button>
            </div>
          </div>
        ))}
        {chapterQuizzes.length === 0 && <div style={{ padding: 22, border: '1px dashed rgba(30,77,88,0.18)', borderRadius: 10, color: '#6b8a98', fontSize: 13 }}>暂无章节测验配置。</div>}
      </div>
    )
  }

  function renderChapterQuizManagement() {
    const publishedCount = chapterQuizzes.filter(quiz => quiz.status === 'published').length

    return (
      <section style={{ ...PANEL, padding: 16, display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div>
            <strong style={{ color: '#183b4b', fontSize: 16 }}>章节测验发布</strong>
            <p style={{ margin: '4px 0 0', color: '#6b8a98', fontSize: 12 }}>已发布 {publishedCount}/{chapterQuizzes.length} 个章节测验；详细配置在弹窗中集中处理。</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowChapterQuizListModal(true)} style={SECONDARY_BUTTON}>查看测验</button>
            <button onClick={() => { setChapterQuizForm(EMPTY_CHAPTER_QUIZ_FORM); setShowChapterQuizModal(true) }} style={PRIMARY_BUTTON}>配置测验</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          {[
            { label: '章节测验', value: chapterQuizzes.length },
            { label: '已发布', value: publishedCount },
            { label: '草稿', value: chapterQuizzes.length - publishedCount },
          ].map(item => (
            <div key={item.label} style={{ padding: 13, borderRadius: 12, background: 'rgba(246,251,251,0.78)', border: '1px solid rgba(30,77,88,0.08)' }}>
              <span style={{ color: '#6b8a98', fontSize: 12 }}>{item.label}</span>
              <strong style={{ display: 'block', color: '#183b4b', fontSize: 24, marginTop: 4 }}>{item.value}</strong>
            </div>
          ))}
        </div>
      </section>
    )
  }

  function renderCourseLearning() {
    const courseRows = courseChapters.length > 0
      ? courseChapters.map(chapter => ({
          chapter,
          lesson: courseLessons.find(lesson => lesson.trainingId === chapter.trainingId) ?? null,
        }))
      : courseLessons.map(lesson => ({
          chapter: lesson.chapter
            ? {
                trainingId: lesson.chapter.trainingId,
                displayName: lesson.chapter.displayName,
                seqOrder: lesson.chapter.seqOrder,
                hoursCollege: null,
                hoursUg: null,
              }
            : null,
          lesson,
        }))
    const publishedCount = courseRows.filter(row => row.lesson?.status === 'published').length
    const learnerCount = courseLessons.reduce((sum, lesson) => sum + lesson.stats.learnerCount, 0)
    const completedCount = courseLessons.reduce((sum, lesson) => sum + lesson.stats.completedCount, 0)

    return (
      <>
        <section style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 12 }}>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            {[
              { label: '课程章节', value: courseRows.length },
              { label: '已发布资源', value: publishedCount },
              { label: '学习人次', value: learnerCount },
              { label: '完成次数', value: completedCount },
            ].map(item => (
              <div key={item.label} style={{ ...PANEL, padding: 14 }}>
                <span style={{ color: '#6b8a98', fontSize: 12 }}>{item.label}</span>
                <strong style={{ display: 'block', color: '#183b4b', fontSize: 24, marginTop: 4 }}>{item.value}</strong>
              </div>
            ))}
          </section>

          <section style={{ ...PANEL, overflow: 'hidden' }}>
            <div style={TABLE_HEADER}>
              <strong style={{ color: '#183b4b' }}>章节资源</strong>
              <button
                onClick={() => {
                  setCourseForm(EMPTY_COURSE_FORM)
                  setShowCourseLessonModal(true)
                }}
                style={PRIMARY_BUTTON}
              >
                新增章节资源
              </button>
            </div>
            {courseLoading ? (
              <div style={{ padding: 22, color: '#6b8a98' }}>正在加载课程课时...</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
                  <thead>
                    <tr>
                      <th style={TH}>课时</th>
                      <th style={TH}>资源</th>
                      <th style={TH}>测试</th>
                      <th style={TH}>学习统计</th>
                      <th style={TH}>状态</th>
                      <th style={TH}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courseRows.map(row => {
                      const lesson = row.lesson
                      const chapter = row.chapter
                      return (
                      <tr key={chapter?.trainingId || lesson?.lessonId}>
                        <td style={TD}>
                          <strong style={{ color: '#183b4b' }}>
                            {chapter ? `${chapter.trainingId} · ${chapter.displayName}` : `第 ${lesson?.sortOrder ?? '-'} 课 · ${lesson?.title ?? '未绑定章节'}`}
                          </strong>
                          <br />
                          <span style={{ color: '#6b8a98' }}>{lesson?.description || '尚未配置 PPT/视频资源'}</span>
                        </td>
                        <td style={TD}>
                          PPT {lesson?.pptUrl ? '已上传' : '未上传'} · {lesson?.pptPageCount ?? 0} 页
                          <br />
                          视频 {lesson?.videoUrl ? '已上传' : '未上传'} · {Math.round((lesson?.videoDuration ?? 0) / 60)} 分钟
                        </td>
                        <td style={TD}>{lesson?.testQuestions.length ?? 0} 题<br />及格线 {lesson?.passScore ?? 60} 分</td>
                        <td style={TD}>学习 {lesson?.stats.learnerCount ?? 0} 人<br />完成 {lesson?.stats.completedCount ?? 0} 人<br />均分 {lesson?.stats.averageScore ?? 0}</td>
                        <td style={TD}><Pill tone={lesson?.status === 'published' ? 'green' : lesson ? 'orange' : 'neutral'}>{lesson?.status === 'published' ? '已发布' : lesson ? '草稿' : '未配置'}</Pill></td>
                        <td style={TD}>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button onClick={() => chapter ? startChapterResource(chapter) : lesson && editCourseLesson(lesson)} style={SECONDARY_BUTTON}>
                              {lesson ? '编辑' : '配置'}
                            </button>
                            {chapter && <button onClick={() => startChapterQuiz(chapter)} style={SECONDARY_BUTTON}>测验</button>}
                            {chapter && <button onClick={() => startChapterAssignment(chapter)} style={SECONDARY_BUTTON}>作业</button>}
                            {lesson && <button onClick={() => deleteCourseLesson(lesson.lessonId)} style={{ ...SECONDARY_BUTTON, color: '#b91c1c' }}>删除</button>}
                          </div>
                        </td>
                      </tr>
                    )})}
                    {courseRows.length === 0 && (
                      <tr><td colSpan={6} style={{ ...TD, textAlign: 'center', color: '#8aa0aa' }}>暂无课程章节数据，请先检查 MySQL 中的 training_projects。</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
        </section>

        {renderChapterQuizManagement()}
        {renderAssignmentManagement()}

        {showCoursewareModal && (
          <div style={MODAL_BACKDROP} onClick={() => setShowCoursewareModal(false)}>
            <div style={COURSEWARE_MODAL} onClick={event => event.stopPropagation()}>
              <div style={MODAL_HEADER}>
                <div>
                  <strong style={{ color: '#183b4b', fontSize: 17 }}>课件生成</strong>
                  <p style={{ margin: '4px 0 0', color: '#6b8a98', fontSize: 12 }}>没有现成 PPT 时，可先生成课件内容，再回到上传区发布。</p>
                </div>
                <button type="button" onClick={() => setShowCoursewareModal(false)} aria-label="关闭课件生成" style={ICON_BUTTON}>
                  <X size={16} />
                </button>
              </div>
              {renderCoursewareGenerator()}
            </div>
          </div>
        )}
        {showCourseLessonModal && renderTeacherConfigModal(
          courseForm.lessonId ? '编辑课时资源' : '新增课时资源',
          '配置章节绑定、PPT、视频、章节测试和发布状态。',
          () => {
            setShowCourseLessonModal(false)
            setCourseForm(EMPTY_COURSE_FORM)
          },
          renderCourseLessonForm(),
          'min(760px, 94vw)',
        )}
        {showChapterQuizListModal && renderTeacherConfigModal(
          '章节测验列表',
          '集中查看、配置、发布或下架章节测验。',
          () => setShowChapterQuizListModal(false),
          renderChapterQuizList(),
          'min(980px, 96vw)',
        )}
        {showChapterQuizModal && renderTeacherConfigModal(
          '配置章节测验',
          '发布后，学生浏览完整章 PPT 后可进入章节测验。',
          () => {
            setShowChapterQuizModal(false)
            setChapterQuizForm(EMPTY_CHAPTER_QUIZ_FORM)
          },
          renderChapterQuizForm(),
          'min(680px, 94vw)',
        )}
        {showAssignmentReviewModal && reviewAssignment && renderTeacherConfigModal(
          '批改作业',
          '在弹窗内查看学生提交并保存评分反馈。',
          () => {
            setShowAssignmentReviewModal(false)
            setReviewAssignment(null)
          },
          renderAssignmentReview(reviewAssignment),
          'min(980px, 96vw)',
        )}
        {showAssignmentModal && renderTeacherConfigModal(
          assignmentForm.id ? '编辑作业' : '发布作业',
          '作业会显示在学生端对应章节的作业页面。',
          () => {
            setShowAssignmentModal(false)
            setAssignmentForm(EMPTY_ASSIGNMENT_FORM)
          },
          renderAssignmentForm(),
          'min(680px, 94vw)',
        )}
      </>
    )
  }

  function renderProjects() {
    if (!overview) return null

    return (
      <section style={{ display: 'grid', gap: 12 }}>
        <ComparisonChartCard
          title="项目内容覆盖对比"
          subtitle="按内容总量排序显示前 8 个项目"
          labels={overview.projectTasks.map(project => project.projectName)}
          series={[
            { name: '知识点', values: overview.projectTasks.map(project => project.knowledgeCount), color: '#1d6f78' },
            { name: '技能点', values: overview.projectTasks.map(project => project.skillCount), color: '#409eff' },
            { name: '题目', values: overview.projectTasks.map(project => project.questionCount), color: '#c8812b' },
          ]}
          valueSuffix=" 个"
        />
        <section style={{ ...PANEL, overflow: 'hidden' }}>
          <div style={TABLE_HEADER}>
            <strong style={{ color: '#183b4b' }}>项目任务覆盖</strong>
            <span style={{ color: '#6b8a98', fontSize: 12 }}>共 {overview.projectTasks.length} 个项目</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1120 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, width: 230 }}>项目</th>
                  <th style={{ ...TH, width: 70 }}>层次</th>
                  <th style={TH}>任务</th>
                  <th style={{ ...TH, width: 150 }}>知识/技能</th>
                  <th style={{ ...TH, width: 92, textAlign: 'right' }}>题库</th>
                </tr>
              </thead>
              <tbody>
                {overview.projectTasks.map(project => (
                  <tr key={project.projectName}>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}><strong style={{ color: '#183b4b' }}>{project.projectName}</strong></td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>{project.eduLevels.join('、') || '未设置'}</td>
                    <td style={{ ...TD, color: '#46606f', whiteSpace: 'nowrap' }}>
                      <strong style={{ marginRight: 8, color: '#183b4b' }}>{project.taskCount} 个</strong>
                      <span style={{ color: '#5d7888' }}>{project.taskNames.join('、') || '暂无任务名'}</span>
                    </td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>{project.knowledgeCount} 知识点 / {project.skillCount} 技能点</td>
                    <td style={{ ...TD, textAlign: 'right' }}><Pill tone={project.questionCount > 0 ? 'green' : 'orange'}>{project.questionCount} 题</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    )
  }

  function renderStandards() {
    if (!overview) return null

    return (
      <section style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
          {COURSE_STANDARD_GROUPS.map(group => <RuleGroupCard key={group.title} {...group} />)}
        </div>

        <section style={{ ...PANEL, overflow: 'hidden' }}>
          <div style={TABLE_HEADER}>
            <strong style={{ color: '#183b4b' }}>项目课时与解锁顺序</strong>
            <span style={{ color: '#6b8a98', fontSize: 12 }}>按当前项目任务数据生成</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={TH}>解锁顺序</th>
                  <th style={TH}>项目</th>
                  <th style={TH}>课程目标</th>
                  <th style={TH}>项目课时</th>
                  <th style={TH}>课时占比</th>
                </tr>
              </thead>
              <tbody>
                {overview.projectTasks.map((project, index) => {
                  const totalTasks = Math.max(overview.summary.taskCount, 1)
                  const hours = Math.max(project.taskCount * 2, 2)
                  const percent = Math.round((project.taskCount / totalTasks) * 100)

                  return (
                    <tr key={project.projectName}>
                      <td style={TD}><Pill tone="blue">第 {index + 1} 项</Pill></td>
                      <td style={TD}><strong style={{ color: '#183b4b' }}>{project.projectName}</strong><br /><span style={{ color: '#6b8a98' }}>{project.eduLevels.join('、') || '专科 / 本科'}</span></td>
                      <td style={TD}>完成 {project.taskCount} 个任务，覆盖 {project.knowledgeCount + project.skillCount} 个知识/技能点。</td>
                      <td style={TD}>{hours} 学时</td>
                      <td style={TD}>
                        <div style={{ display: 'grid', gap: 6 }}>
                          <strong style={{ color: '#1d6f78' }}>{percent}%</strong>
                          <div style={{ height: 6, borderRadius: 999, background: 'rgba(31,71,92,0.08)', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.max(8, percent)}%`, height: '100%', background: '#1d6f78' }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    )
  }

  function renderKnowledge() {
    return (
      <>
        {renderToolbar('knowledge')}
        <section style={{ ...PANEL, overflow: 'hidden' }}>
          <div style={TABLE_HEADER}>
            <strong style={{ color: '#183b4b' }}>知识点与技能点</strong>
            <span style={{ color: '#6b8a98', fontSize: 12 }}>显示 {filteredKnowledge.length} 条</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1160 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, width: 360 }}>编号/名称</th>
                  <th style={{ ...TH, width: 132 }}>类型</th>
                  <th style={{ ...TH, width: 70 }}>层次</th>
                  <th style={{ ...TH, width: 350 }}>项目任务</th>
                  <th style={TH}>GMP条款</th>
                </tr>
              </thead>
              <tbody>
                {filteredKnowledge.map(item => (
                  <tr key={item.kpId}>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}><strong style={{ display: 'inline-block', marginRight: 10, color: '#183b4b' }}>{item.title}</strong><span style={{ color: '#6b8a98' }}>{item.serialCode || item.kpId}</span></td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Pill tone={item.pointType === '技能点' ? 'orange' : 'blue'}>{item.pointType}</Pill><span style={{ color: '#6b8a98' }}>难度 {item.difficulty}</span></span></td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>{item.eduLevel}</td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}><strong style={{ marginRight: 10, color: '#314d5b' }}>{item.projectName}</strong><span style={{ color: '#6b8a98' }}>{item.taskName}</span></td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>{item.gmpArticles || '未关联'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </>
    )
  }

  function renderQuestions() {
    if (!overview) return null

    return (
      <>
        {renderToolbar('questions')}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 12 }}>
          <DistributionChartCard title="题型结构" subtitle="当前启用题库" items={overview.distributions.questionType} valueSuffix=" 题" />
          <DistributionChartCard title="难度结构" subtitle="当前启用题库" items={overview.distributions.questionDifficulty} variant="bar" valueSuffix=" 题" />
        </section>
        <section style={{ ...PANEL, overflow: 'hidden' }}>
          <div style={TABLE_HEADER}>
            <strong style={{ color: '#183b4b' }}>题库列表</strong>
            <span style={{ color: '#6b8a98', fontSize: 12 }}>显示 {filteredQuestions.length} 题</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1120 }}>
              <thead>
                <tr>
                  <th style={TH}>题干</th>
                  <th style={{ ...TH, width: 150 }}>题型/难度</th>
                  <th style={{ ...TH, width: 320 }}>所属项目</th>
                  <th style={{ ...TH, width: 240 }}>知识点</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuestions.map(item => (
                  <tr key={item.questionId}>
                    <td style={TD}><strong style={{ color: '#183b4b' }}>{item.stem}</strong></td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}><div style={{ display: 'inline-flex', gap: 6 }}><Pill tone="blue">{item.questionType}</Pill><Pill tone={item.difficulty === '易' ? 'green' : 'orange'}>{item.difficulty}</Pill></div></td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}><strong style={{ marginRight: 10, color: '#314d5b' }}>{item.projectName}</strong><span style={{ color: '#6b8a98' }}>{item.taskName}</span></td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>{item.knowledgeTitle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </>
    )
  }

  function renderRules() {
    if (!overview) return null

    return (
      <section style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
          {PRETEST_RULE_GROUPS.map(group => <RuleGroupCard key={group.title} {...group} />)}
        </div>
        <section style={{ ...PANEL, overflow: 'hidden' }}>
          <div style={TABLE_HEADER}>
            <strong style={{ color: '#183b4b' }}>前测题库覆盖</strong>
            <span style={{ color: '#6b8a98', fontSize: 12 }}>当前题库 {overview.summary.questionCount} 题</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={TH}>项目</th>
                  <th style={TH}>题库数量</th>
                  <th style={TH}>课时占比</th>
                  <th style={TH}>建议抽题</th>
                  <th style={TH}>应用</th>
                </tr>
              </thead>
              <tbody>
                {overview.projectTasks.map(project => {
                  const totalTasks = Math.max(overview.summary.taskCount, 1)
                  const percent = Math.round((project.taskCount / totalTasks) * 100)
                  const suggested = Math.max(1, Math.round((percent / 100) * 20))

                  return (
                    <tr key={project.projectName}>
                      <td style={TD}><strong style={{ color: '#183b4b' }}>{project.projectName}</strong></td>
                      <td style={TD}>{project.questionCount} 题</td>
                      <td style={TD}>{percent}%</td>
                      <td style={TD}><Pill tone="blue">{suggested} 道</Pill></td>
                      <td style={TD}>用于前测错点分析和个性化方案推荐。</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    )
  }

  function renderPlanRules() {
    return (
      <section style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {PLAN_RULE_GROUPS.map(group => <RuleGroupCard key={group.title} {...group} />)}
        </div>
        <div style={{ ...PANEL, padding: 18, display: 'grid', gap: 12 }}>
          <strong style={{ color: '#183b4b', fontSize: 16 }}>生成逻辑</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {[
              { title: '专业识别', desc: '优先读取学生专业，映射推荐剂型和产品案例。' },
              { title: '错点聚合', desc: '按项目、知识点、技能点统计前测错题和练习错题。' },
              { title: '路径生成', desc: '低于 60 分进入系统学习，高于 60 分按薄弱点强化。' },
              { title: '资源匹配', desc: '按项目关联案例、工艺规程、题库和 AI 助学内容。' },
            ].map(item => (
              <div key={item.title} style={{ padding: 14, borderRadius: 8, border: '1px solid rgba(30,77,88,0.08)', background: 'rgba(246,251,251,0.78)' }}>
                <strong style={{ display: 'block', color: '#183b4b', fontSize: 14, marginBottom: 7 }}>{item.title}</strong>
                <span style={{ color: '#6b7d86', fontSize: 13, lineHeight: 1.65 }}>{item.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  }

  function renderCases() {
    return (
      <section style={{ display: 'grid', gap: 12 }}>
        <section style={{ ...PANEL, overflow: 'hidden' }}>
          <div style={TABLE_HEADER}>
            <strong style={{ color: '#183b4b' }}>本科教材项目案例</strong>
            <span style={{ color: '#6b8a98', fontSize: 12 }}>一个项目一个案例</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={TH}>项目</th>
                  <th style={TH}>案例名称</th>
                  <th style={TH}>关联内容</th>
                  <th style={TH}>状态</th>
                </tr>
              </thead>
              <tbody>
                {CASE_PROJECTS.map((project, index) => (
                  <tr key={project}>
                    <td style={TD}><strong style={{ color: '#183b4b' }}>{project}</strong></td>
                    <td style={TD}>{index === 4 ? '确认与验证案例' : `${project.replace(/^项目[一二三四五六七八九十]+：/, '')}案例`}</td>
                    <td style={TD}>关联知识点、技能点、题库和课堂任务。</td>
                    <td style={TD}><Pill tone={index < 6 ? 'green' : 'orange'}>{index < 6 ? '已配置' : '待补充'}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <div style={{ ...PANEL, padding: 18, display: 'grid', gap: 10 }}>
          <strong style={{ color: '#183b4b', fontSize: 16 }}>GMP 检查案例</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {['数据完整性缺陷', '确认与验证缺陷', '物料放行偏差', '实验室 OOS 调查'].map(item => (
              <div key={item} style={{ padding: 14, borderRadius: 8, border: '1px solid rgba(30,77,88,0.08)', background: 'rgba(246,251,251,0.78)' }}>
                <strong style={{ display: 'block', color: '#183b4b', fontSize: 14, marginBottom: 7 }}>{item}</strong>
                <span style={{ color: '#6b7d86', fontSize: 13 }}>可用于课堂讨论、情境练习和综合风险管理实训。</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  }

  function renderAiAssist() {
    return (
      <section style={{ ...PANEL, minHeight: 'calc(100vh - 190px)', display: 'grid', gridTemplateRows: 'minmax(0, 1fr) auto', overflow: 'hidden' }}>
        <main style={{ overflowY: 'auto', padding: '20px 22px' }}>
          <div style={{ maxWidth: 780, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {teacherChatMessages.filter(message => !(message.role === 'assistant' && !message.content)).map((message, index) => (
              <div key={`${message.role}-${index}`} style={{ display: 'flex', gap: 10, flexDirection: message.role === 'user' ? 'row-reverse' : 'row' }}>
                <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: message.role === 'assistant' ? 'linear-gradient(135deg,#215566,#35818a)' : '#1d6f78' }}>
                  {message.role === 'assistant' ? <Bot size={15} color="#fff" /> : <User size={15} color="#fff" />}
                </div>
                <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', gap: 6, alignItems: message.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    borderRadius: 16,
                    padding: '10px 16px',
                    fontSize: 14,
                    lineHeight: 1.8,
                    whiteSpace: 'pre-wrap',
                    ...(message.role === 'assistant'
                      ? { background: 'rgba(255,255,255,0.88)', border: '1px solid rgba(31,71,92,0.12)', color: '#183b4b', backdropFilter: 'blur(12px)' }
                      : { background: 'linear-gradient(135deg,#215566,#35818a)', color: '#fff' }
                    ),
                  }}>
                    {message.content}
                  </div>
                  {message.sources && message.sources.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '0 2px' }}>
                      {message.sources.slice(0, 8).map(source => (
                        <span key={source} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'rgba(29,111,120,0.08)', color: '#1d6f78', border: '1px solid rgba(29,111,120,0.15)' }}>{source}</span>
                      ))}
                      {message.criticTriggered && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'rgba(200,129,43,0.09)', color: '#c8812b', border: '1px solid rgba(200,129,43,0.2)' }}>已校验</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {teacherChatLoading && teacherChatMessages[teacherChatMessages.length - 1]?.content === '' && (
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#215566,#35818a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Bot size={15} color="#fff" />
                </div>
                <div style={{ ...PANEL, padding: '10px 16px', display: 'inline-flex', alignItems: 'center', gap: 8, color: '#1d6f78', fontSize: 13 }}>
                  <LoaderCircle className="animate-spin" size={15} />正在组织教学建议...
                </div>
              </div>
            )}
            <div ref={teacherChatBottomRef} />
          </div>
        </main>

        <div style={{ padding: '14px 20px 16px', borderTop: '1px solid rgba(31,71,92,0.08)' }}>
          <div style={{ maxWidth: 780, margin: '0 auto', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1, borderRadius: 16, border: '1px solid rgba(31,71,92,0.15)', background: 'rgba(255,255,255,0.82)', overflow: 'hidden' }}>
              <textarea
                ref={teacherChatTextareaRef}
                value={teacherChatInput}
                onChange={handleTeacherChatInputChange}
                onKeyDown={handleTeacherChatKeyDown}
                placeholder="输入备课、讲评、案例设计或 GMP 法规问题"
                rows={1}
                disabled={teacherChatLoading}
                style={{ width: '100%', padding: '12px 16px', fontSize: 14, color: '#183b4b', resize: 'none', outline: 'none', background: 'transparent', lineHeight: 1.6, maxHeight: 140, minHeight: 44, display: 'block', boxSizing: 'border-box', border: 'none' }}
              />
            </div>
            <button
              type="button"
              onClick={() => void sendTeacherChatMessage()}
              disabled={!teacherChatInput.trim() || teacherChatLoading}
              style={{ width: 40, height: 40, borderRadius: 12, border: 'none', cursor: teacherChatInput.trim() && !teacherChatLoading ? 'pointer' : 'not-allowed', background: teacherChatInput.trim() && !teacherChatLoading ? 'linear-gradient(135deg,#1d6f78,#35818a)' : 'rgba(31,71,92,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              <Send size={16} color={teacherChatInput.trim() && !teacherChatLoading ? '#fff' : '#6b8a98'} />
            </button>
          </div>
          <p style={{ textAlign: 'center', fontSize: 11, color: '#6b8a98', margin: '8px 0 0', opacity: 0.78 }}>AI回答仅供教学参考，以 GMP 原文法规和课程标准为准</p>
        </div>
      </section>
    )
  }

  function renderExports() {
    if (!overview) return null

    return (
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
        <button onClick={() => downloadCsv('学生学习状态.csv', overview.students.map(student => ({
          姓名: student.displayName,
          邮箱: student.email,
          学校: student.school,
          班级: student.className,
          层次: student.educationLevel,
          专业: student.major,
          前测完成: student.onboardingCompleted ? '是' : '否',
          前测分数: student.diagnosticScore ?? '',
          前测错题数: student.wrongCount,
          答题次数: student.answerStats.total,
          待复盘错题: student.answerStats.pendingReview,
        })))} style={EXPORT_BUTTON}>
          <Download size={18} color="#1d6f78" />
          <strong style={{ color: '#183b4b', fontSize: 16 }}>导出学生学习状态</strong>
          <span style={{ color: '#6b8a98', fontSize: 13 }}>CSV 格式，包含学生资料、前测、错题和学习方案状态。</span>
        </button>
        <button onClick={() => downloadCsv('题库统计.csv', overview.questionItems.map(item => ({
          题目ID: item.questionId,
          题型: item.questionType,
          难度: item.difficulty,
          项目: item.projectName,
          任务: item.taskName,
          知识点: item.knowledgeTitle,
          题干: item.stem,
        })))} style={EXPORT_BUTTON}>
          <ClipboardList size={18} color="#1d6f78" />
          <strong style={{ color: '#183b4b', fontSize: 16 }}>导出题库统计</strong>
          <span style={{ color: '#6b8a98', fontSize: 13 }}>CSV 格式，包含题型、难度、项目任务和知识点。</span>
        </button>
      </section>
    )
  }

  function renderProfile() {
    return (
      <RoleProfileCenter
        profile={profile}
        displayName={displayName}
        role={profile?.role === 'admin' ? 'admin' : 'teacher'}
        form={profileForm}
        onFormChange={setProfileForm}
        saving={savingProfile}
        onSave={saveProfile}
        onAvatarUpload={saveAvatar}
        onClose={() => resetFilters('overview')}
      />
    )
  }

  function renderSection() {
    if (activeSection === 'profile') return renderProfile()
    if (!overview) return <div style={{ ...PANEL, padding: 22, color: '#6b8a98' }}>暂无教师端数据。</div>

    if (activeSection === 'overview') return renderOverview()
    if (activeSection === 'students') return renderStudents()
    if (activeSection === 'standards') return renderStandards()
    if (activeSection === 'course') return renderCourseLearning()
    if (activeSection === 'projects') return renderProjects()
    if (activeSection === 'knowledge') return renderKnowledge()
    if (activeSection === 'questions') return renderQuestions()
    if (activeSection === 'rules') return renderRules()
    if (activeSection === 'planRules') return renderPlanRules()
    if (activeSection === 'cases') return renderCases()
    if (activeSection === 'aiAssist') return renderAiAssist()
    return renderExports()
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f6fbfb' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#1d6f78', fontWeight: 700 }}>
          <LoaderCircle size={18} className="animate-spin" />
          正在进入教师端...
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: showSidebar ? `${sidebarWidth}px minmax(0, 1fr)` : 'minmax(0, 1fr)', background: shellBg, backgroundSize: consoleLayout.darkMode ? undefined : '32px 32px, 32px 32px, auto', color: bodyText }}>
      {showSidebar && (
      <aside style={{ position: 'sticky', top: 0, height: '100vh', background: sidebarBg, color: sidebarText, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${surfaceBorder}`, boxShadow: sidebarDark ? '18px 0 40px rgba(6,24,36,0.18)' : '12px 0 30px rgba(29,53,74,0.08)', transition: 'width 0.2s, background 0.2s' }}>
        {consoleLayout.toggles.showLogo && (
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', gap: 12, padding: sidebarCollapsed ? '0 12px' : '0 18px', borderBottom: `1px solid ${surfaceBorder}` }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg,${themeColor},#35818a)`, display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, boxShadow: '0 10px 22px rgba(29,111,120,0.24)' }}>T</div>
          {!sidebarCollapsed && (
            <div>
              <p style={{ margin: 0, color: sidebarDark ? '#fff' : bodyText, fontSize: 14, fontWeight: 800 }}>教师端</p>
              <p style={{ margin: 0, color: sidebarText, fontSize: 11 }}>教学管理控制台</p>
            </div>
          )}
        </div>
        )}

        <nav style={{ padding: sidebarCollapsed ? '12px 8px' : 12, display: 'grid', gap: 6 }}>
          {NAV_ITEMS.map(item => {
            const active = item.key === activeSection
            const Icon = item.icon

            return (
            <button key={item.key} title={sidebarCollapsed ? item.label : undefined} onClick={() => resetFilters(item.key)} style={{ display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', gap: sidebarCollapsed ? 0 : 10, padding: sidebarCollapsed ? '10px 0' : '10px 12px', borderRadius: 8, border: active ? `1px solid ${sidebarDark ? 'rgba(255,255,255,0.12)' : `${themeColor}2e`}` : '1px solid transparent', background: active ? (sidebarDark ? 'rgba(29,111,120,0.34)' : softThemeBg) : 'transparent', color: active ? sidebarActiveText : sidebarText, cursor: 'pointer', textAlign: 'left', fontSize: 13, fontWeight: active ? 700 : 500, boxShadow: active && sidebarDark ? 'inset 3px 0 0 rgba(255,255,255,0.8)' : undefined }}>
                <Icon size={15} />
                {!sidebarCollapsed && item.label}
              </button>
            )
          })}
        </nav>

        <div style={{ marginTop: 'auto', padding: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ padding: sidebarCollapsed ? '8px 0' : '8px 10px', display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', gap: 9 }}>
            <div style={{ position: 'relative', overflow: 'hidden', width: 30, height: 30, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', background: `linear-gradient(135deg,${themeColor},#35818a)`, color: '#fff', fontSize: 11, fontWeight: 700 }}>
              {profile?.avatarUrl ? <Image src={profile.avatarUrl} alt={`${displayName}的头像`} fill unoptimized style={{ objectFit: 'cover' }} /> : displayName[0]}
            </div>
            {!sidebarCollapsed && (
              <div style={{ display: 'grid', gap: 2 }}>
                <strong style={{ color: sidebarDark ? '#fff' : bodyText, fontSize: 13 }}>{displayName}</strong>
                <span style={{ color: sidebarText, fontSize: 12 }}>教师 / 教学管理员</span>
              </div>
            )}
          </div>
          <button onClick={logout} style={{ width: '100%', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: sidebarDark ? 'rgba(255,255,255,0.04)' : 'transparent', color: sidebarDark ? '#d8e2e8' : '#46606f', cursor: 'pointer' }}>
            <LogOut size={14} />
            {!sidebarCollapsed && '退出登录'}
          </button>
        </div>
      </aside>
      )}

      <main style={{ padding: consoleFullscreen ? 18 : 22, display: 'grid', gap: topMenuMode && !consoleFullscreen ? 14 : 16, alignContent: 'start', minWidth: 0 }}>
        <header style={topMenuMode && !consoleFullscreen
          ? { position: consoleLayout.toggles.fixedHeader ? 'sticky' : 'relative', top: 0, zIndex: 30, minHeight: 58, margin: '-22px -22px 0', padding: '0 18px', display: 'flex', alignItems: 'center', gap: 14, background: headerDark ? 'rgba(31,45,61,0.97)' : 'rgba(255,255,255,0.88)', borderBottom: `1px solid ${surfaceBorder}`, boxShadow: '0 12px 28px rgba(29,53,74,0.07)', backdropFilter: 'blur(18px)' }
          : { position: consoleLayout.toggles.fixedHeader ? 'sticky' : 'relative', top: 0, zIndex: 30, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: 16, margin: -12, marginBottom: 2, borderRadius: 12, background: headerDark ? 'rgba(31,45,61,0.96)' : 'rgba(255,255,255,0.86)', border: `1px solid ${surfaceBorder}`, boxShadow: '0 16px 38px rgba(29,53,74,0.08)', backdropFilter: 'blur(16px)' }}>
          {topMenuMode && !consoleFullscreen ? (
            <>
            {consoleLayout.toggles.showLogo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0, color: headerDark ? '#f4f4f5' : bodyText, fontSize: 13, fontWeight: 800 }}>
                <span style={{ width: 29, height: 29, borderRadius: consoleRadius, display: 'grid', placeItems: 'center', color: '#fff', background: `linear-gradient(135deg, ${themeColor}, #45a29e)` }}>T</span>
                教师端
              </div>
            )}
            <nav style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto' }}>
              {NAV_ITEMS.map(item => {
                const active = item.key === activeSection
                const Icon = item.icon
                return (
                  <button key={item.key} onClick={() => resetFilters(item.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: consoleRadius, border: 'none', background: active ? softThemeBg : 'transparent', color: active ? themeColor : (headerDark ? '#bfcbd9' : mutedText), cursor: 'pointer', fontSize: 13, fontWeight: active ? 700 : 500, whiteSpace: 'nowrap' }}>
                    <Icon size={14} />
                    {item.label}
                  </button>
                )
              })}
            </nav>
            </>
          ) : (
            <div>
              <p style={{ margin: 0, color: themeColor, fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>Teacher Console</p>
              <h1 style={{ margin: '6px 0 0', color: headerDark ? '#f4f4f5' : bodyText, fontSize: 28, lineHeight: 1.2 }}>{activeNav.title}</h1>
              <p style={{ margin: '8px 0 0', color: headerDark ? '#bfcbd9' : mutedText, lineHeight: 1.7 }}>{activeNav.desc}</p>
            </div>
          )}
          <ConsoleHeaderActions
            displayName={displayName}
            avatarUrl={profile?.avatarUrl}
            searchItems={headerSearchItems}
            notifications={headerNotifications}
            onProfile={openProfile}
            onLogout={logout}
            onHelp={() => resetFilters('rules')}
            onFullscreenChange={setConsoleFullscreen}
            onLayoutChange={setConsoleLayout}
            title={activeNav.title}
          />
        </header>

        {!consoleFullscreen && consoleLayout.toggles.showTagsView && activeSection !== 'overview' && activeSection !== 'aiAssist' && (
          topMenuMode ? (
            <div style={{ height: 36, margin: '-14px -22px 0', padding: '0 18px', display: 'flex', alignItems: 'center', background: consoleLayout.darkMode ? 'rgba(24,34,50,0.92)' : 'rgba(255,255,255,0.88)', borderBottom: `1px solid ${surfaceBorder}` }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, background: softThemeBg, border: `1px solid ${themeColor}33`, color: themeColor, fontSize: 12, fontWeight: 700 }}>
                {consoleLayout.toggles.showTabIcon && <span style={{ width: 6, height: 6, borderRadius: '50%', background: themeColor }} />}
                {activeNav.title}
              </div>
            </div>
          ) : (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, width: 'fit-content', padding: '5px 12px', borderRadius: 999, background: softThemeBg, border: `1px solid ${themeColor}33`, color: themeColor, fontSize: 12, fontWeight: 700 }}>
              {consoleLayout.toggles.showTabIcon && <span style={{ width: 6, height: 6, borderRadius: '50%', background: themeColor }} />}
              {activeNav.title}
            </div>
          )
        )}

        {topMenuMode && !consoleFullscreen && activeSection !== 'aiAssist' && (
          <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '6px 16px', padding: '4px 4px 0' }}>
            <h1 style={{ margin: 0, color: bodyText, fontSize: 25, lineHeight: 1.2 }}>{activeNav.title}</h1>
            <p style={{ margin: 0, color: mutedText, fontSize: 14 }}>{activeNav.desc}</p>
          </div>
        )}

        {error && (
          <div style={{ ...PANEL, padding: 16, display: 'flex', alignItems: 'center', gap: 10, color: '#dc2626' }}>
            <AlertTriangle size={17} />
            {error}
          </div>
        )}

        {notice && (
          <div style={{ ...PANEL, padding: 16, display: 'flex', alignItems: 'center', gap: 10, color: '#15803d' }}>
            <CheckCircle2 size={17} />
            {notice}
          </div>
        )}

        {overview && activeSection !== 'overview' && activeSection !== 'profile' && activeSection !== 'aiAssist' && (
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            {[
              { label: '学生', value: overview.summary.studentCount, icon: UsersRound },
              { label: '前测完成', value: overview.summary.onboardingCompletedCount, icon: CheckCircle2 },
              { label: '项目任务', value: `${overview.summary.projectCount}/${overview.summary.taskCount}`, icon: Layers3 },
              { label: '题库', value: overview.summary.questionCount, icon: Database },
            ].map(item => (
              <div key={item.label} style={{ ...PANEL, padding: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <span style={{ display: 'block', color: '#6b8a98', fontSize: 12 }}>{item.label}</span>
                  <strong style={{ color: '#183b4b', fontSize: 22 }}>{item.value}</strong>
                </div>
                <item.icon size={18} color="#1d6f78" />
              </div>
            ))}
          </section>
        )}

        {renderSection()}
      </main>
    </div>
  )
}

const SELECT_STYLE: CSSProperties = {
  height: 38,
  borderRadius: 10,
  border: '1px solid rgba(30,77,88,0.12)',
  background: 'rgba(255,255,255,0.92)',
  color: '#314d5b',
  padding: '0 10px',
  fontSize: 13,
  minWidth: 120,
  outline: 'none',
}

const NOTICE_STYLE: CSSProperties = {
  padding: 12,
  borderRadius: 10,
  background: 'rgba(246,251,251,0.82)',
  border: '1px solid rgba(30,77,88,0.08)',
  color: '#46606f',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
}

const TABLE_HEADER: CSSProperties = {
  padding: '16px 18px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  borderBottom: '1px solid rgba(30,77,88,0.1)',
  background: 'rgba(246,251,251,0.42)',
}

const EXPORT_BUTTON: CSSProperties = {
  ...PANEL,
  padding: 18,
  textAlign: 'left',
  cursor: 'pointer',
  display: 'grid',
  gap: 10,
  borderRadius: 12,
}

const PRIMARY_BUTTON: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  width: 'fit-content',
  minHeight: 40,
  borderRadius: 8,
  border: 'none',
  background: '#1d6f78',
  color: '#fff',
  padding: '0 16px',
  fontSize: 13,
  fontWeight: 800,
  cursor: 'pointer',
}

const SECONDARY_BUTTON: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  width: 'fit-content',
  minHeight: 40,
  borderRadius: 8,
  border: '1px solid rgba(30,77,88,0.14)',
  background: 'rgba(255,255,255,0.88)',
  color: '#46606f',
  padding: '0 16px',
  fontSize: 13,
  fontWeight: 800,
  cursor: 'pointer',
}

const TINY_BUTTON: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  minHeight: 26,
  borderRadius: 7,
  border: '1px solid rgba(29,111,120,0.2)',
  background: 'rgba(29,111,120,0.08)',
  color: '#1d6f78',
  padding: '0 8px',
  fontSize: 11,
  fontWeight: 900,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const ICON_BUTTON: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 8,
  border: '1px solid rgba(30,77,88,0.12)',
  background: 'rgba(255,255,255,0.88)',
  color: '#46606f',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  flexShrink: 0,
}

const MODAL_BACKDROP: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 80,
  background: 'rgba(15,32,45,0.42)',
  display: 'grid',
  placeItems: 'center',
  padding: 20,
}

const MODAL_HEADER: CSSProperties = {
  padding: '15px 18px',
  borderBottom: '1px solid rgba(30,77,88,0.1)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
}

const COURSEWARE_MODAL: CSSProperties = {
  width: 'min(1080px, 96vw)',
  maxHeight: '88vh',
  overflow: 'auto',
  borderRadius: 12,
  background: 'rgba(255,255,255,0.98)',
  border: '1px solid rgba(30,77,88,0.12)',
  boxShadow: '0 24px 70px rgba(12,32,45,0.24)',
}

const FORM_LABEL: CSSProperties = {
  display: 'grid',
  gap: 6,
  color: '#6b8a98',
  fontSize: 12,
  fontWeight: 800,
}

const INPUT_STYLE: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid rgba(30,77,88,0.14)',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.92)',
  padding: '9px 10px',
  color: '#183b4b',
  fontSize: 13,
  outline: 'none',
}

const UPLOAD_FIELD_STYLE: CSSProperties = {
  minHeight: 88,
  border: '1px dashed rgba(29,111,120,0.32)',
  borderRadius: 8,
  background: 'rgba(246,251,251,0.72)',
  padding: '12px 13px',
  display: 'grid',
  gridTemplateColumns: '22px minmax(0, 1fr)',
  gap: '4px 9px',
  alignItems: 'center',
  cursor: 'pointer',
}

const UPLOAD_HINT_STYLE: CSSProperties = {
  gridColumn: '2 / 3',
  color: '#8aa0aa',
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.45,
}

const UPLOAD_META_STYLE: CSSProperties = {
  minHeight: 34,
  borderRadius: 8,
  background: 'rgba(29,111,120,0.08)',
  color: '#1d6f78',
  padding: '8px 10px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  fontSize: 12,
  fontWeight: 800,
}

const TEXTAREA_STYLE: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid rgba(30,77,88,0.14)',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.92)',
  padding: 10,
  color: '#183b4b',
  fontSize: 13,
  lineHeight: 1.6,
  outline: 'none',
  resize: 'vertical',
}
