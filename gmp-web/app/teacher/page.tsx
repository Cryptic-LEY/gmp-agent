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
  Flag,
  Layers3,
  LoaderCircle,
  LogOut,
  MessageSquare,
  Network,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Sparkles,
  Upload,
  User,
  UsersRound,
  Trash2,
  Video,
  X,
  type LucideIcon,
} from 'lucide-react'
import ConsoleHeaderActions, { DEFAULT_CONSOLE_LAYOUT, type ConsoleLayoutConfig } from '../components/ConsoleHeaderActions'
import RoleProfileCenter from '../components/RoleProfileCenter'
import { ComparisonChartCard, DistributionChartCard } from '../components/AnalyticsChartCard'
import {
  appendAssignmentQuestions,
  extractAssignmentQuestions,
  stripAssignmentQuestionBlock,
  type CourseAssignmentQuestion,
} from '@/lib/course-assignment-questions'
import { clearLocalStoragePreservingAiElf } from '@/lib/ai-elf-storage'
import { isChoiceQuestionType, type CourseQuizQuestionType } from '@/lib/course-quiz-blueprint'

type SectionKey = 'overview' | 'students' | 'standards' | 'course' | 'projects' | 'knowledge' | 'questions' | 'rules' | 'planRules' | 'cases' | 'aiAssist' | 'exports' | 'profile'
type CourseResourceKind = 'ppt' | 'video'
type CourseLearningTab = 'resources' | 'pptProgress' | 'videoProgress' | 'quiz' | 'assignment'
type QuizEduLevel = 'college' | 'undergraduate'

interface CourseAssetProgress {
  current: number
  total: number
  trainingId: string
  message: string
}

const COURSE_ASSET_TRAINING_IDS = ['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08', 'T09', 'T10', 'T11']

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
    studentTotal?: number
    pptCompletedCount?: number
    videoCompletedCount?: number
  }
  students?: Array<TeacherCourseStudentStatus & {
    viewedPages: number[]
    viewedPageCount: number
    pptProgress: number
    pptCompleted: boolean
    videoWatchedSeconds: number
    videoMaxPosition: number
    videoProgress: number
    videoCompleted: boolean
    lessonScore: number
    updatedAt: string | null
  }>
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
  gradedBy?: 'ai' | 'teacher'
  questionReviews?: Array<CourseAssignmentQuestion & { correctAnswer?: string; explanation?: string; userAnswer?: string; comment?: string }>
}

interface TeacherCourseStudentStatus {
  userId: string
  studentName: string
  studentEmail: string
  className: string | null
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
  studentTotal: number
  submissionCount: number
  missingCount: number
  missingStudents: TeacherCourseStudentStatus[]
  gradedCount: number
  questions: Array<CourseAssignmentQuestion & { correctAnswer?: string; explanation?: string }>
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
  studentTotal?: number
  completedCount?: number
  missingCount?: number
  missingStudents?: TeacherCourseStudentStatus[]
  averageScore?: number
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

interface TeacherManagedQuizQuestion {
  questionId?: string
  eduLevel: QuizEduLevel
  questionType: CourseQuizQuestionType
  stem: string
  correctAnswer: string
  difficulty: '易' | '中' | '难'
  explanation: string
  options: Array<{ key: string; text: string }>
}

interface GradeDraft {
  score: string
  feedback: string
}

interface TeacherChatMessage {
  id?: number
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
  criticTriggered?: boolean
  createdAt?: string
}

interface TeacherChatSession {
  sessionId: string
  title: string
  audience: 'student' | 'teacher'
  eduLevel: string | null
  messageCount: number
  createdAt: string
  updatedAt: string
}

const TEACHER_INITIAL_CHAT_MESSAGE: TeacherChatMessage = {
  role: 'assistant',
  content: '你好！我是教师端 AI助手，可以帮你做 GMP 课程备课、课堂讲解设计、法规条文解释、案例讨论和学生错点讲评。',
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
  targetTrainingId: string | null
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

interface PptPreviewSource {
  url: string
  title: string
  fileName?: string | null
}

const INITIAL_JOB: JobState = {
  jobId: null,
  targetTrainingId: null,
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
  questionCount: 60,
  passScore: 60,
  durationMinutes: 90,
  status: 'draft',
}

const COURSE_QUESTION_TYPES: CourseQuizQuestionType[] = ['单选题', '多选题', '判断题', '填空题', '简答题', '综合分析题']
const COURSE_OPTION_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

const EMPTY_ASSIGNMENT_QUESTION: CourseAssignmentQuestion = {
  id: '',
  questionType: '单选题',
  stem: '',
  points: 1,
  correctAnswer: 'A',
  explanation: '',
  options: [
    { key: 'A', text: '' },
    { key: 'B', text: '' },
    { key: 'C', text: '' },
    { key: 'D', text: '' },
  ],
}

const EMPTY_MANAGED_QUIZ_QUESTION: TeacherManagedQuizQuestion = {
  eduLevel: 'college',
  questionType: '单选题',
  stem: '',
  correctAnswer: 'A',
  difficulty: '中',
  explanation: '',
  options: [
    { key: 'A', text: '' },
    { key: 'B', text: '' },
    { key: 'C', text: '' },
    { key: 'D', text: '' },
  ],
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

function makeTeacherChatSessionTitle(question: string) {
  const title = question.replace(/\s+/g, ' ').trim()
  return title.length > 32 ? `${title.slice(0, 32)}...` : title
}

function formatTeacherChatSessionTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
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

function formatLearningSeconds(seconds: number) {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  const minutes = Math.floor(total / 60)
  const remain = total % 60
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const restMinutes = minutes % 60
    return `${hours}时${restMinutes}分`
  }
  return `${minutes}:${String(remain).padStart(2, '0')}`
}

function cloneAssignmentQuestion(source: Partial<CourseAssignmentQuestion> | null = EMPTY_ASSIGNMENT_QUESTION, index = 0): CourseAssignmentQuestion {
  const base = source ?? EMPTY_ASSIGNMENT_QUESTION
  const questionType = base.questionType || '单选题'
  return {
    id: base.id || `aq_${Date.now()}_${index}`,
    questionId: base.questionId,
    questionType,
    stem: base.stem || '',
    points: Math.max(1, Math.min(10, Number(base.points ?? 1))),
    options: normalizeEditableOptions(questionType, base.options),
    correctAnswer: base.correctAnswer || (isChoiceQuestionType(questionType) ? 'A' : ''),
    explanation: base.explanation || '',
  }
}

function cloneManagedQuizQuestion(source: Partial<TeacherManagedQuizQuestion> | null = EMPTY_MANAGED_QUIZ_QUESTION): TeacherManagedQuizQuestion {
  const base = source ?? EMPTY_MANAGED_QUIZ_QUESTION
  const questionType = base.questionType || '单选题'
  return {
    questionId: base.questionId,
    eduLevel: base.eduLevel === 'undergraduate' ? 'undergraduate' : 'college',
    questionType,
    stem: base.stem || '',
    correctAnswer: base.correctAnswer || (isChoiceQuestionType(questionType) ? 'A' : ''),
    difficulty: base.difficulty === '易' || base.difficulty === '难' ? base.difficulty : '中',
    explanation: base.explanation || '',
    options: normalizeEditableOptions(questionType, base.options),
  }
}

function normalizeEditableOptions(questionType: CourseQuizQuestionType, options: Array<{ key: string; text: string }> = []) {
  if (questionType === '判断题') return [{ key: 'A', text: '对' }, { key: 'B', text: '错' }]
  if (!isChoiceQuestionType(questionType)) return []

  const normalized = COURSE_OPTION_KEYS
    .map((key, index) => ({
      key,
      text: options.find(option => option.key === key)?.text ?? options[index]?.text ?? '',
    }))
    .filter((option, index) => index < 4 || option.text.trim())

  return normalized.length >= 2 ? normalized : [
    { key: 'A', text: '' },
    { key: 'B', text: '' },
    { key: 'C', text: '' },
    { key: 'D', text: '' },
  ]
}

function isQuestionCardChoice(questionType: CourseQuizQuestionType) {
  return isChoiceQuestionType(questionType)
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

function CourseAssetLoading({ progress }: { progress: CourseAssetProgress | null }) {
  const total = progress?.total ?? COURSE_ASSET_TRAINING_IDS.length
  const current = progress?.current ?? 0
  const pct = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <div style={{ padding: 22, display: 'grid', gap: 12, color: '#6b8a98' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <LoaderCircle size={18} style={{ animation: 'spin 1s linear infinite', color: '#1d6f78' }} />
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: 'block', color: '#183b4b', fontSize: 14 }}>正在加载课程资源</strong>
          <span style={{ color: '#6b8a98', fontSize: 12 }}>{progress?.message || '正在检查课程测验和作业...'}</span>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 7 }}>
        <div style={{ height: 8, borderRadius: 999, background: 'rgba(31,71,92,0.08)', overflow: 'hidden' }}>
          <span style={{ display: 'block', width: `${Math.max(6, pct)}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#1d6f78,#409eff)', transition: 'width 0.25s ease' }} />
        </div>
        <small style={{ color: '#8aa0aa', fontSize: 12 }}>
          {progress?.trainingId ? `${progress.trainingId} · ` : ''}{current}/{total} · {pct}%
        </small>
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
  const [courseLearningTab, setCourseLearningTab] = useState<CourseLearningTab>('resources')
  const [courseLoading, setCourseLoading] = useState(false)
  const [courseAssetProgress, setCourseAssetProgress] = useState<CourseAssetProgress | null>(null)
  const [courseForm, setCourseForm] = useState<CourseLessonForm>(EMPTY_COURSE_FORM)
  const [assignmentForm, setAssignmentForm] = useState<AssignmentForm>(EMPTY_ASSIGNMENT_FORM)
  const [chapterQuizForm, setChapterQuizForm] = useState<ChapterQuizForm>(EMPTY_CHAPTER_QUIZ_FORM)
  const [assignmentQuestions, setAssignmentQuestions] = useState<CourseAssignmentQuestion[]>([])
  const [chapterQuizQuestions, setChapterQuizQuestions] = useState<TeacherManagedQuizQuestion[]>([])
  const [loadingChapterQuizQuestions, setLoadingChapterQuizQuestions] = useState(false)
  const [savingChapterQuizQuestionId, setSavingChapterQuizQuestionId] = useState<string | null>(null)
  const [gradeDrafts, setGradeDrafts] = useState<Record<number, GradeDraft>>({})
  const [savingCourse, setSavingCourse] = useState(false)
  const [savingAssignment, setSavingAssignment] = useState(false)
  const [savingChapterQuiz, setSavingChapterQuiz] = useState(false)
  const [uploadingCourseFile, setUploadingCourseFile] = useState<CourseResourceKind | null>(null)
  const [generatingCourseAutomation, setGeneratingCourseAutomation] = useState<string | null>(null)
  const [showCoursewareModal, setShowCoursewareModal] = useState(false)
  const [pptPreviewSource, setPptPreviewSource] = useState<PptPreviewSource | null>(null)
  const [pptPreviewDeck, setPptPreviewDeck] = useState<SlideDeckPreview | null>(null)
  const [pptPreviewLoading, setPptPreviewLoading] = useState(false)
  const [pptPreviewPage, setPptPreviewPage] = useState(1)
  const [showCourseLessonModal, setShowCourseLessonModal] = useState(false)
  const [showAssignmentModal, setShowAssignmentModal] = useState(false)
  const [showAssignmentReviewModal, setShowAssignmentReviewModal] = useState(false)
  const [reviewAssignment, setReviewAssignment] = useState<TeacherAssignment | null>(null)
  const [reviewSubmissionId, setReviewSubmissionId] = useState<number | null>(null)
  const [showChapterQuizModal, setShowChapterQuizModal] = useState(false)
  const [showChapterQuizListModal, setShowChapterQuizListModal] = useState(false)
  const [teacherChatMessages, setTeacherChatMessages] = useState<TeacherChatMessage[]>([TEACHER_INITIAL_CHAT_MESSAGE])
  const [teacherChatSessions, setTeacherChatSessions] = useState<TeacherChatSession[]>([])
  const [activeTeacherChatSessionId, setActiveTeacherChatSessionId] = useState<string | null>(null)
  const [teacherChatHistoryLoading, setTeacherChatHistoryLoading] = useState(false)
  const [teacherChatSessionLoading, setTeacherChatSessionLoading] = useState(false)
  const [teacherChatInput, setTeacherChatInput] = useState('')
  const [teacherChatLoading, setTeacherChatLoading] = useState(false)
  const [teacherChatFeedbackTarget, setTeacherChatFeedbackTarget] = useState<TeacherChatMessage | null>(null)
  const [teacherChatFeedbackComment, setTeacherChatFeedbackComment] = useState('')
  const [teacherChatFeedbackStatus, setTeacherChatFeedbackStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [teacherChatFeedbackNotice, setTeacherChatFeedbackNotice] = useState('')
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
  const pptPreviewScrollerRef = useRef<HTMLDivElement>(null)
  const pptPreviewPageRefs = useRef<Record<number, HTMLElement | null>>({})
  const activeJobRef = useRef<{ jobId: string | null; targetTrainingId: string | null; requestId: string | null }>({
    jobId: null,
    targetTrainingId: null,
    requestId: null,
  })
  const teacherChatBottomRef = useRef<HTMLDivElement>(null)
  const teacherChatTextareaRef = useRef<HTMLTextAreaElement>(null)
  const effectiveAiSlideCount = inferSlideCountFromPrompt(aiTopic) ?? aiSlideCount

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.replace('/login')
      return
    }
    const authToken = token

    async function loadTeacherData() {
      try {
        const headers = { Authorization: `Bearer ${authToken}` }
        const profileResponse = await fetch('/api/user/profile', { headers })

        if (profileResponse.status === 401) {
          clearLocalStoragePreservingAiElf()
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
        void loadTeacherChatSessions(authToken, true)
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
    clearLocalStoragePreservingAiElf()
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
      clearLocalStoragePreservingAiElf()
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

  async function ensureTeacherCourseAssets(headers: { Authorization: string }) {
    const tokenTail = headers.Authorization.slice(-18)
    const today = new Date().toISOString().slice(0, 10)
    const cacheKey = `teacher-course-assets-ensured:${today}:${tokenTail}`
    if (localStorage.getItem(cacheKey) === 'done') return

    const total = COURSE_ASSET_TRAINING_IDS.length
    setCourseAssetProgress({ current: 0, total, trainingId: '', message: '正在检查课程测验和作业...' })

    try {
      for (const [index, trainingId] of COURSE_ASSET_TRAINING_IDS.entries()) {
        setCourseAssetProgress({
          current: index,
          total,
          trainingId,
          message: `正在加载 ${trainingId} 的章节测验和作业...`,
        })

        const response = await fetch('/api/teacher/course/assets/ensure', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ trainingId }),
        })
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.error || `${trainingId} 课程资产初始化失败`)

        setCourseAssetProgress({
          current: index + 1,
          total,
          trainingId,
          message: `已完成 ${index + 1}/${total} 章课程资源检查`,
        })
      }
      localStorage.setItem(cacheKey, 'done')
    } finally {
      setCourseAssetProgress(null)
    }
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
      void ensureTeacherCourseAssets(headers).catch(err => {
        setError(err instanceof Error ? err.message : '课程资源后台检查失败')
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '课程学习数据读取失败')
    } finally {
      setCourseAssetProgress(null)
      setCourseLoading(false)
    }
  }

  function editCourseLesson(lesson: TeacherCourseLesson) {
    const chapter = courseChapters.find(item => item.trainingId === lesson.trainingId)
    resetAiJob()
    setAiTargetTrainingId(lesson.trainingId || '')
    setAiTopic(`${chapter?.displayName || lesson.title} 教学PPT`)
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

    resetAiJob()
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

  function closePptPreview() {
    setPptPreviewSource(null)
    setPptPreviewDeck(null)
    setPptPreviewLoading(false)
    setPptPreviewPage(1)
    pptPreviewPageRefs.current = {}
  }

  async function openPptPreview(source: PptPreviewSource) {
    const token = localStorage.getItem('token')
    if (!token) {
      router.replace('/login')
      return
    }

    setPptPreviewSource(source)
    setPptPreviewDeck(null)
    setPptPreviewPage(1)
    setPptPreviewLoading(true)
    pptPreviewPageRefs.current = {}

    try {
      const response = await fetch('/api/teacher/course/ppt-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pptUrl: source.url }),
      })
      const data = await response.json().catch(() => null) as SlideDeckPreview | { error?: string } | null
      if (!response.ok) throw new Error(data?.error || '课件预览读取失败')
      setPptPreviewDeck((data as SlideDeckPreview) ?? { previewType: 'unsupported', slides: [], error: '课件预览读取失败' })
    } catch (err) {
      setPptPreviewDeck({
        previewType: 'unsupported',
        url: source.url,
        slides: [],
        error: err instanceof Error ? err.message : '课件预览读取失败',
      })
    } finally {
      setPptPreviewLoading(false)
    }
  }

  function fallbackDownload(url: string, fileName?: string | null) {
    const link = document.createElement('a')
    link.href = url
    link.download = fileName || getResourceFileName(url)
    link.target = '_blank'
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  async function downloadPptFile(url: string, fileName?: string | null) {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`download failed: ${response.status}`)
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      fallbackDownload(objectUrl, fileName || getResourceFileName(url))
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch {
      fallbackDownload(url, fileName)
    }
  }

  function handlePptPreviewScroll() {
    const scroller = pptPreviewScrollerRef.current
    const slides = pptPreviewDeck?.slides ?? []
    if (!scroller || slides.length === 0) return
    const anchorY = scroller.scrollTop + scroller.clientHeight * 0.36
    let nearestPage = pptPreviewPage
    let nearestDistance = Number.POSITIVE_INFINITY
    for (const slide of slides) {
      const node = pptPreviewPageRefs.current[slide.page]
      if (!node) continue
      const distance = Math.abs(node.offsetTop - anchorY)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestPage = slide.page
      }
    }
    if (nearestPage !== pptPreviewPage) setPptPreviewPage(nearestPage)
  }

  function scrollPptPreviewToPage(page: number) {
    const scroller = pptPreviewScrollerRef.current
    const node = pptPreviewPageRefs.current[page]
    if (!scroller || !node) return
    setPptPreviewPage(page)
    scroller.scrollTo({ top: Math.max(0, node.offsetTop - 16), behavior: 'smooth' })
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
      description: stripAssignmentQuestionBlock(assignment.description),
      assignmentType: assignment.assignmentType,
      maxScore: assignment.maxScore,
      dueDate: formatDateTimeInput(assignment.dueDate),
    })
    setAssignmentQuestions(extractAssignmentQuestions(assignment.description).map((question, index) => cloneAssignmentQuestion(question, index)))
    setNotice('已载入作业，可在弹窗中编辑。')
    setShowAssignmentModal(true)
  }

  function openAssignmentReview(assignment: TeacherAssignment) {
    setReviewAssignment(assignment)
    setReviewSubmissionId(assignment.submissions[0]?.id ?? null)
    setShowAssignmentReviewModal(true)
  }

  function startChapterAssignment(chapter: TeacherCourseChapter) {
    setAssignmentForm({
      ...EMPTY_ASSIGNMENT_FORM,
      trainingId: chapter.trainingId,
      title: `${chapter.displayName} 作业`,
      description: `围绕 ${chapter.displayName} 完成案例分析、法规依据梳理或学习反思。`,
    })
    setAssignmentQuestions([])
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
      const description = assignmentQuestions.length > 0
        ? appendAssignmentQuestions(assignmentForm.description, assignmentQuestions.map((question, index) => cloneAssignmentQuestion(question, index)))
        : stripAssignmentQuestionBlock(assignmentForm.description)
      const response = await fetch(
        assignmentForm.id ? `/api/teacher/course/assignments/${assignmentForm.id}` : '/api/teacher/course/assignments',
        {
          method: assignmentForm.id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ...assignmentForm, description }),
        },
      )
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '作业保存失败')
      setAssignmentForm(EMPTY_ASSIGNMENT_FORM)
      setAssignmentQuestions([])
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

  async function loadChapterQuizQuestions(trainingId: string) {
    const token = localStorage.getItem('token')
    if (!token || !trainingId) return

    setLoadingChapterQuizQuestions(true)
    try {
      const response = await fetch(`/api/teacher/course/chapter-quizzes/${trainingId}/questions`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || '测验题目读取失败')
      const questions = Array.isArray(data?.questions) ? data.questions : []
      setChapterQuizQuestions(questions.map((question: TeacherManagedQuizQuestion) => cloneManagedQuizQuestion(question)))
    } catch (err) {
      setError(err instanceof Error ? err.message : '测验题目读取失败')
      setChapterQuizQuestions([])
    } finally {
      setLoadingChapterQuizQuestions(false)
    }
  }

  async function saveChapterQuizQuestion(question: TeacherManagedQuizQuestion, index: number) {
    const token = localStorage.getItem('token')
    if (!token || !chapterQuizForm.trainingId) return null
    if (!question.stem.trim()) {
      setError('题干不能为空')
      return null
    }

    const marker = question.questionId || `new-${index}`
    setSavingChapterQuizQuestionId(marker)
    setError('')
    try {
      const response = await fetch(`/api/teacher/course/chapter-quizzes/${chapterQuizForm.trainingId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(cloneManagedQuizQuestion(question)),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || '题目保存失败')
      const saved = cloneManagedQuizQuestion(data.question)
      setChapterQuizQuestions(current => current.map((item, itemIndex) => itemIndex === index ? saved : item))
      setNotice('题目已保存')
      return saved
    } catch (err) {
      setError(err instanceof Error ? err.message : '题目保存失败')
      return null
    } finally {
      setSavingChapterQuizQuestionId(null)
    }
  }

  async function saveAllChapterQuizQuestions() {
    if (!chapterQuizForm.trainingId || chapterQuizQuestions.length === 0) return
    const saved: TeacherManagedQuizQuestion[] = []
    for (const [index, question] of chapterQuizQuestions.entries()) {
      const result = await saveChapterQuizQuestion(question, index)
      if (!result) throw new Error('题目保存失败')
      saved.push(result)
    }
    setChapterQuizQuestions(saved)
  }

  async function deleteChapterQuizQuestion(question: TeacherManagedQuizQuestion, index: number) {
    if (!question.questionId) {
      setChapterQuizQuestions(current => current.filter((_, itemIndex) => itemIndex !== index))
      return
    }
    const token = localStorage.getItem('token')
    if (!token || !chapterQuizForm.trainingId) return
    if (!window.confirm('确定删除这道题？')) return

    const response = await fetch(`/api/teacher/course/chapter-quizzes/${chapterQuizForm.trainingId}/questions`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ questionId: question.questionId }),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      setError(data?.error || '题目删除失败')
      return
    }
    setChapterQuizQuestions(current => current.filter((_, itemIndex) => itemIndex !== index))
    setNotice('题目已删除')
  }

  async function deleteChapterQuiz(quiz: TeacherChapterQuiz) {
    const token = localStorage.getItem('token')
    if (!token) return
    if (!window.confirm('确定删除该章节测验配置？题库中的题目可在题目管理中单独删除。')) return

    const response = await fetch('/api/teacher/course/chapter-quizzes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ trainingId: quiz.trainingId }),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      setError(data?.error || '章节测验删除失败')
      return
    }
    setNotice('章节测验已删除')
    setChapterQuizQuestions([])
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
    void loadChapterQuizQuestions(quiz.trainingId)
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
    void loadChapterQuizQuestions(chapter.trainingId)
    setShowChapterQuizModal(true)
  }

  async function generateChapterAutomation(chapter: TeacherCourseChapter) {
    const token = localStorage.getItem('token')
    if (!token) {
      router.replace('/login')
      return
    }

    setGeneratingCourseAutomation(chapter.trainingId)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/course/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ trainingId: chapter.trainingId }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'AI 自动生成失败')
      setNotice(data?.message || `${chapter.displayName} 的章节测验和作业已生成`)
      await loadCourseLessons()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 自动生成失败')
    } finally {
      setGeneratingCourseAutomation(null)
    }
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
      await saveAllChapterQuizQuestions()
      setChapterQuizForm(EMPTY_CHAPTER_QUIZ_FORM)
      setChapterQuizQuestions([])
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
    const updateAssignment = (assignment: TeacherAssignment): TeacherAssignment => ({
      ...assignment,
      gradedCount: assignment.submissions.some(submission => submission.id === submissionId && !submission.gradedAt)
        ? assignment.gradedCount + 1
        : assignment.gradedCount,
      submissions: assignment.submissions.map(submission => submission.id === submissionId
        ? {
          ...submission,
          score: Math.round(Number(draft.score)),
          feedback: draft.feedback || null,
          gradedAt: new Date().toISOString(),
          gradedBy: 'teacher',
        }
        : submission),
    })
    setCourseAssignments(current => current.map(assignment => assignment.submissions.some(submission => submission.id === submissionId) ? updateAssignment(assignment) : assignment))
    setReviewAssignment(current => current && current.submissions.some(submission => submission.id === submissionId) ? updateAssignment(current) : current)
    setNotice('评分已保存')
    await loadCourseLessons()
  }

  async function loadTeacherChatSessions(token: string, openLatest = false) {
    setTeacherChatHistoryLoading(true)
    try {
      const response = await fetch('/api/agent/chat/sessions?audience=teacher', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) return
      const data = await response.json() as { sessions?: TeacherChatSession[] }
      const nextSessions = data.sessions ?? []
      setTeacherChatSessions(nextSessions)
      if (openLatest && nextSessions[0]) {
        await loadTeacherChatSession(nextSessions[0].sessionId, token)
      }
    } finally {
      setTeacherChatHistoryLoading(false)
    }
  }

  async function loadTeacherChatSession(sessionId: string, token = localStorage.getItem('token') ?? '') {
    if (!token || teacherChatLoading) return
    setTeacherChatSessionLoading(true)
    try {
      const response = await fetch(`/api/agent/chat/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) return
      const data = await response.json() as { session: TeacherChatSession; messages: TeacherChatMessage[] }
      setActiveTeacherChatSessionId(data.session.sessionId)
      setTeacherChatMessages(data.messages.length ? data.messages : [TEACHER_INITIAL_CHAT_MESSAGE])
      setTeacherChatFeedbackTarget(null)
      setTeacherChatSessions(current => [data.session, ...current.filter(session => session.sessionId !== data.session.sessionId)])
    } finally {
      setTeacherChatSessionLoading(false)
    }
  }

  function startTeacherNewChat() {
    if (teacherChatLoading) return
    setActiveTeacherChatSessionId(null)
    setTeacherChatMessages([TEACHER_INITIAL_CHAT_MESSAGE])
    setTeacherChatInput('')
    setTeacherChatFeedbackTarget(null)
    if (teacherChatTextareaRef.current) teacherChatTextareaRef.current.style.height = 'auto'
  }

  async function ensureTeacherChatSession(question: string, token: string) {
    if (activeTeacherChatSessionId) return activeTeacherChatSessionId

    const response = await fetch('/api/agent/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        audience: 'teacher',
        title: makeTeacherChatSessionTitle(question),
      }),
    })
    if (!response.ok) throw new Error('Failed to create teacher chat session')

    const data = await response.json() as { session: TeacherChatSession }
    setActiveTeacherChatSessionId(data.session.sessionId)
    setTeacherChatSessions(current => [data.session, ...current.filter(session => session.sessionId !== data.session.sessionId)])
    return data.session.sessionId
  }

  async function saveTeacherChatMessage(sessionId: string, message: TeacherChatMessage, token: string) {
    const response = await fetch(`/api/agent/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        role: message.role,
        content: message.content,
        sources: message.sources,
        criticTriggered: message.criticTriggered,
      }),
    })
    if (!response.ok) throw new Error('Failed to save teacher chat message')
    const data = await response.json().catch(() => ({})) as { id?: number }
    return typeof data.id === 'number' && data.id > 0 ? data.id : undefined
  }

  async function deleteTeacherChatSession(sessionId: string, event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    if (teacherChatLoading) return

    const token = localStorage.getItem('token')
    if (!token) return

    const response = await fetch(`/api/agent/chat/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) return

    setTeacherChatSessions(current => current.filter(session => session.sessionId !== sessionId))
    if (activeTeacherChatSessionId === sessionId) {
      setActiveTeacherChatSessionId(null)
      setTeacherChatMessages([TEACHER_INITIAL_CHAT_MESSAGE])
      setTeacherChatFeedbackTarget(null)
    }
  }

  function openTeacherChatFeedback(message: TeacherChatMessage) {
    setTeacherChatFeedbackTarget(message)
    setTeacherChatFeedbackComment('')
    setTeacherChatFeedbackStatus('idle')
    setTeacherChatFeedbackNotice('')
  }

  function closeTeacherChatFeedback() {
    if (teacherChatFeedbackStatus === 'sending') return
    setTeacherChatFeedbackTarget(null)
    setTeacherChatFeedbackComment('')
    setTeacherChatFeedbackStatus('idle')
    setTeacherChatFeedbackNotice('')
  }

  async function submitTeacherChatFeedback() {
    if (!teacherChatFeedbackTarget || teacherChatFeedbackStatus === 'sending') return

    const token = localStorage.getItem('token')
    if (!token) {
      router.replace('/login')
      return
    }

    setTeacherChatFeedbackStatus('sending')
    setTeacherChatFeedbackNotice('')

    try {
      const response = await fetch('/api/agent/chat/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          sessionId: activeTeacherChatSessionId,
          messageId: teacherChatFeedbackTarget.id,
          messageRole: teacherChatFeedbackTarget.role,
          messageContent: teacherChatFeedbackTarget.content,
          userComment: teacherChatFeedbackComment,
        }),
      })

      if (!response.ok) throw new Error('Feedback submit failed')
      setTeacherChatFeedbackStatus('sent')
      setTeacherChatFeedbackNotice('已收到反馈，后续会用于优化 AI 回答。')
      window.setTimeout(() => {
        setTeacherChatFeedbackTarget(null)
        setTeacherChatFeedbackComment('')
        setTeacherChatFeedbackStatus('idle')
        setTeacherChatFeedbackNotice('')
      }, 900)
    } catch {
      setTeacherChatFeedbackStatus('error')
      setTeacherChatFeedbackNotice('反馈提交失败，请稍后再试。')
    }
  }

  async function sendTeacherChatMessage() {
    const question = teacherChatInput.trim()
    if (!question || teacherChatLoading) return

    const token = localStorage.getItem('token')
    if (!token) {
      router.replace('/login')
      return
    }

    const history = teacherChatMessages.slice(-6).map(message => ({ role: message.role, content: message.content }))
    setTeacherChatMessages(prev => [...prev, { role: 'user', content: question }, { role: 'assistant', content: '' }])
    setTeacherChatInput('')
    if (teacherChatTextareaRef.current) teacherChatTextareaRef.current.style.height = 'auto'
    setTeacherChatLoading(true)

    try {
      let sessionId: string | null = null
      try {
        sessionId = await ensureTeacherChatSession(question, token)
        await saveTeacherChatMessage(sessionId, { role: 'user', content: question }, token)
      } catch (historyError) {
        console.warn('Teacher AI chat history save failed:', historyError)
      }

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
      let assistantContent = ''
      let assistantSources: string[] | undefined
      let assistantCriticTriggered = false

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
              assistantContent += event.chunk
              setTeacherChatMessages(prev => {
                const messages = [...prev]
                messages[messages.length - 1] = { ...messages[messages.length - 1], content: messages[messages.length - 1].content + event.chunk }
                return messages
              })
            } else if (event.done) {
              assistantSources = event.sources
              assistantCriticTriggered = Boolean(event.critic_triggered)
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
      if (assistantContent.trim() && sessionId) {
        try {
          const assistantMessageId = await saveTeacherChatMessage(sessionId, {
            role: 'assistant',
            content: assistantContent,
            sources: assistantSources,
            criticTriggered: assistantCriticTriggered,
          }, token)
          if (assistantMessageId) {
            setTeacherChatMessages(prev => {
              const messages = [...prev]
              messages[messages.length - 1] = { ...messages[messages.length - 1], id: assistantMessageId }
              return messages
            })
          }
          void loadTeacherChatSessions(token)
        } catch (historyError) {
          console.warn('Teacher AI chat history save failed:', historyError)
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
    if (!targetTrainingId) {
      setJob({ ...INITIAL_JOB, status: 'failed', error: '请先选择要生成并上传到的课程章节' })
      return
    }
    const requestId = `${targetTrainingId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    activeJobRef.current = { jobId: null, targetTrainingId, requestId }
    setJob({ ...INITIAL_JOB, targetTrainingId, status: 'pending', message: '正在提交课件生成任务...' })

    const token = localStorage.getItem('token')
    if (!token) {
      resetAiJob()
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
      if (activeJobRef.current.requestId !== requestId || activeJobRef.current.targetTrainingId !== targetTrainingId) return

      if (!response.ok || !data.success) {
        setJob(current => ({ ...current, status: 'failed', error: data.error ?? '提交课件生成任务失败' }))
        return
      }

      const jobId = data.jobId as string
      if (activeJobRef.current.requestId !== requestId || activeJobRef.current.targetTrainingId !== targetTrainingId) return
      activeJobRef.current = { jobId, targetTrainingId, requestId }
      setJob(current => ({
        ...current,
        jobId,
        targetTrainingId,
        status: 'running',
        step: data.step ?? 'initializing',
        message: data.message ?? '任务已创建，正在生成...',
      }))
      schedulePoll(jobId, token, targetTrainingId, requestId)
    } catch (err) {
      if (activeJobRef.current.requestId !== requestId || activeJobRef.current.targetTrainingId !== targetTrainingId) return
      const message = err instanceof Error ? err.message : 'OpenMAIC 服务连接失败'
      setJob(current => ({ ...current, status: 'failed', error: message }))
    }
  }

  function schedulePoll(jobId: string, token: string, targetTrainingId: string, requestId: string) {
    pollRef.current = setTimeout(() => pollJob(jobId, token, targetTrainingId, requestId), 5000)
  }

  async function pollJob(jobId: string, token: string, targetTrainingId: string, requestId: string) {
    try {
      const response = await fetch(`/api/openmaic/poll/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (activeJobRef.current.jobId !== jobId || activeJobRef.current.targetTrainingId !== targetTrainingId || activeJobRef.current.requestId !== requestId) return

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
          const targetChapter = courseChapters.find(chapter => chapter.trainingId === targetTrainingId)
          setCourseForm(form => ({
            ...form,
            trainingId: targetTrainingId,
            title: targetChapter?.displayName || form.title || aiTopic,
            description: form.description || `${targetChapter?.displayName || aiTopic} 的教学课件资源`,
            sortOrder: targetChapter?.seqOrder ?? form.sortOrder,
            pptUrl,
            pptPageCount: Math.max(form.pptPageCount, sceneCount),
          }))
          setJob(current => ({
            ...current,
            ...update,
            status: 'succeeded',
            targetTrainingId,
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
      schedulePoll(jobId, token, targetTrainingId, requestId)
    } catch (err) {
      if (activeJobRef.current.jobId !== jobId || activeJobRef.current.targetTrainingId !== targetTrainingId || activeJobRef.current.requestId !== requestId) return
      setJob(current => ({ ...current, status: 'failed', error: err instanceof Error ? err.message : '课件生成状态读取失败' }))
    }
  }

  function resetAiJob() {
    if (pollRef.current) clearTimeout(pollRef.current)
    pollRef.current = null
    activeJobRef.current = { jobId: null, targetTrainingId: null, requestId: null }
    setJob({ ...INITIAL_JOB })
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
    if (job.targetTrainingId && job.targetTrainingId !== targetTrainingId) {
      setError('当前生成结果不属于所选章节，请重新生成后再发布')
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
                resetAiJob()
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
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={UPLOAD_META_STYLE}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>当前文件：{getResourceFileName(url)}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {isPpt ? (
                  <>
                    <button
                      type="button"
                      onClick={() => { void openPptPreview({ url, title: courseForm.title || getResourceFileName(url), fileName: getResourceFileName(url) }) }}
                      style={INLINE_LINK_BUTTON}
                    >
                      打开
                    </button>
                    <button
                      type="button"
                      onClick={() => { void downloadPptFile(url, getResourceFileName(url)) }}
                      style={INLINE_LINK_BUTTON}
                    >
                      下载
                    </button>
                  </>
                ) : (
                  <a href={url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#1d6f78', textDecoration: 'none', flexShrink: 0 }}>
                    打开<ExternalLink size={12} />
                  </a>
                )}
              </span>
            </div>
            {!isPpt && (
              <div style={COURSE_VIDEO_PREVIEW}>
                <video src={url} controls preload="metadata" style={COURSE_VIDEO_PLAYER} />
              </div>
            )}
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
    const canPublishGeneratedPpt = Boolean(job.pptUrl && targetTrainingId && job.targetTrainingId === targetTrainingId)

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
                resetAiJob()
                setAiTargetTrainingId(nextTrainingId)
                if (chapter) {
                  setAiTopic(`${chapter.displayName} 教学PPT`)
                  setCourseForm(form => ({
                    ...form,
                    trainingId: nextTrainingId,
                    title: chapter.displayName,
                    sortOrder: chapter.seqOrder,
                    description: `${chapter.displayName} 的章节课件与视频资源`,
                    pptUrl: '',
                    pptPageCount: 1,
                  }))
                } else {
                  setCourseForm(form => ({
                    ...form,
                    trainingId: '',
                    pptUrl: '',
                    pptPageCount: 1,
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
          {job.status === 'succeeded' && canPublishGeneratedPpt && (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ padding: 10, borderRadius: 8, background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.18)', color: '#15803d', fontSize: 12, lineHeight: 1.6 }}>
                PPT 已生成并回填到右侧课件文件字段。文件名：{job.pptFileName || getResourceFileName(job.pptUrl || '')}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {job.pptUrl && (
                  <button
                    onClick={() => {
                      if (!job.pptUrl) return
                      void openPptPreview({
                        url: job.pptUrl,
                        title: aiTopic || job.pptFileName || getResourceFileName(job.pptUrl),
                        fileName: job.pptFileName || getResourceFileName(job.pptUrl),
                      })
                    }}
                    style={SECONDARY_BUTTON}
                  >
                    <FileText size={15} />打开PPT
                  </button>
                )}
                {job.pptUrl && (
                  <button
                    onClick={() => { if (job.pptUrl) void downloadPptFile(job.pptUrl, job.pptFileName || getResourceFileName(job.pptUrl)) }}
                    style={SECONDARY_BUTTON}
                  >
                    <Download size={15} />下载
                  </button>
                )}
                <button
                  onClick={publishGeneratedPptToChapter}
                  disabled={savingCourse || !canPublishGeneratedPpt}
                  style={{ ...PRIMARY_BUTTON, opacity: savingCourse || !canPublishGeneratedPpt ? 0.55 : 1, cursor: savingCourse || !canPublishGeneratedPpt ? 'not-allowed' : 'pointer' }}
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

  function renderPptPreviewModal() {
    if (!pptPreviewSource) return null
    const deck = pptPreviewDeck
    const slides = deck?.slides ?? []
    const currentSlide = slides.find(slide => slide.page === pptPreviewPage) ?? slides[0]

    return (
      <div style={PPT_PREVIEW_BACKDROP} onClick={closePptPreview}>
        <div style={PPT_PREVIEW_MODAL} onClick={event => event.stopPropagation()}>
          <div style={PPT_PREVIEW_HEADER}>
            <div style={{ minWidth: 0 }}>
              <strong style={{ display: 'block', color: '#183b4b', fontSize: 17, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pptPreviewSource.title}</strong>
              <span style={{ display: 'block', marginTop: 3, color: '#6b8a98', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {pptPreviewSource.fileName || getResourceFileName(pptPreviewSource.url)}
                {slides.length > 0 ? ` · 第 ${pptPreviewPage}/${slides.length} 页` : ''}
              </span>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button type="button" onClick={() => { void downloadPptFile(pptPreviewSource.url, pptPreviewSource.fileName || getResourceFileName(pptPreviewSource.url)) }} style={SECONDARY_BUTTON}>
                <Download size={15} />下载
              </button>
              <button type="button" onClick={closePptPreview} aria-label="关闭课件预览" style={ICON_BUTTON}>
                <X size={16} />
              </button>
            </div>
          </div>
          <div style={PPT_PREVIEW_BODY}>
            {pptPreviewLoading ? (
              <div style={PPT_PREVIEW_EMPTY}>
                <LoaderCircle size={30} style={{ animation: 'spin 1s linear infinite', color: '#1d6f78' }} />
                <strong>正在读取课件预览</strong>
                <span>稍等一下，系统正在解析 PPT 页面。</span>
              </div>
            ) : deck?.previewType === 'pdf' ? (
              <iframe src={pptPreviewSource.url} title={pptPreviewSource.title} style={PPT_PREVIEW_IFRAME} />
            ) : slides.length > 0 ? (
              <div style={PPT_PREVIEW_STAGE}>
                <div style={PPT_PREVIEW_SCROLLER} ref={pptPreviewScrollerRef} onScroll={handlePptPreviewScroll}>
                  <div style={PPT_PREVIEW_CANVAS_WRAP}>
                    {slides.map(slide => (
                      <section
                        key={slide.page}
                        ref={node => { pptPreviewPageRefs.current[slide.page] = node }}
                        style={PPT_PREVIEW_SCROLL_SECTION}
                      >
                        <div style={PPT_PREVIEW_PAGE_META}>
                          <span>{slide.page} / {slides.length}</span>
                          <strong>{slide.title}</strong>
                        </div>
                        {slide.image ? (
                          <img src={slide.image} alt={`第 ${slide.page} 页：${slide.title}`} style={PPT_PREVIEW_IMAGE_PAGE} />
                        ) : slide.svg ? (
                          <div style={PPT_PREVIEW_SVG_PAGE} dangerouslySetInnerHTML={{ __html: slide.svg }} />
                        ) : (
                          <div style={PPT_PREVIEW_TEXT_SLIDE}>
                            <p style={PPT_PREVIEW_EYEBROW}>GMP 课程课件 · 第 {slide.page} 页</p>
                            <h3 style={PPT_PREVIEW_TITLE}>{slide.title}</h3>
                            <div style={PPT_PREVIEW_LINES}>
                              {(slide.lines.length ? slide.lines : ['本页为图片或复杂版式内容，请下载原文件查看完整效果。']).slice(0, 7).map((line, index) => (
                                <p key={`${slide.page}-${index}`} style={{ margin: 0, display: 'grid', gridTemplateColumns: '36px minmax(0, 1fr)', gap: 10 }}>
                                  <span style={{ color: '#ed7d31', fontWeight: 900 }}>{String(index + 1).padStart(2, '0')}</span>
                                  <span>{line}</span>
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                      </section>
                    ))}
                  </div>
                </div>
                <aside style={PPT_PREVIEW_SIDE_NAV} aria-label="课件页码">
                  <div style={PPT_PREVIEW_SIDE_HEAD}>
                    <strong>{pptPreviewPage}/{slides.length}</strong>
                    <span title={currentSlide?.title || '课件页面'} style={PPT_PREVIEW_SIDE_TITLE}>{currentSlide?.title || '课件页面'}</span>
                  </div>
                  <div style={PPT_PREVIEW_PAGE_LIST}>
                    {slides.map(slide => (
                      <button
                        key={`preview-jump-${slide.page}`}
                        type="button"
                        onClick={() => scrollPptPreviewToPage(slide.page)}
                        style={pptPreviewPageButtonStyle(slide.page === pptPreviewPage)}
                      >
                        {slide.page}
                      </button>
                    ))}
                  </div>
                </aside>
              </div>
            ) : (
              <div style={PPT_PREVIEW_EMPTY}>
                <FileText size={30} color="#8aa0aa" />
                <strong>{deck?.error || '暂无法预览该课件'}</strong>
                <span>可点击右上角“下载”查看原文件。</span>
              </div>
            )}
          </div>
        </div>
      </div>
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
              resetAiJob()
              setCourseForm(form => ({
                ...form,
                trainingId: event.target.value,
                title: chapter?.displayName || '',
                sortOrder: chapter?.seqOrder ?? form.sortOrder,
                description: chapter ? `${chapter.displayName} 的章节课件与视频资源` : form.description,
                pptUrl: chapter ? '' : form.pptUrl,
                pptPageCount: chapter ? 1 : form.pptPageCount,
              }))
              if (chapter) {
                setAiTopic(`${chapter.displayName} 教学PPT`)
                setAiTargetTrainingId(chapter.trainingId)
              } else {
                setAiTargetTrainingId('')
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

  function renderQuestionOptions<T extends CourseAssignmentQuestion | TeacherManagedQuizQuestion>(
    question: T,
    onChange: (next: Array<{ key: string; text: string }>) => void,
  ) {
    if (!isQuestionCardChoice(question.questionType)) return null

    return (
      <div style={{ display: 'grid', gap: 8 }}>
        <span style={{ color: '#6b8a98', fontSize: 12, fontWeight: 800 }}>选项</span>
        {question.options.map((option, optionIndex) => (
          <div key={`${option.key}-${optionIndex}`} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr) auto', gap: 8, alignItems: 'center' }}>
            <strong style={{ color: '#1d6f78', fontSize: 13 }}>{option.key}</strong>
            <input
              value={option.text}
              disabled={question.questionType === '判断题'}
              onChange={event => {
                const next = question.options.map((item, index) => index === optionIndex ? { ...item, text: event.target.value } : item)
                onChange(next)
              }}
              style={INPUT_STYLE}
            />
            {question.questionType !== '判断题' && question.options.length > 2 && (
              <button
                type="button"
                onClick={() => onChange(question.options.filter((_, index) => index !== optionIndex))}
                style={{ ...SECONDARY_BUTTON, minHeight: 36, padding: '0 10px', color: '#b91c1c' }}
              >
                删除
              </button>
            )}
          </div>
        ))}
        {question.questionType !== '判断题' && question.options.length < COURSE_OPTION_KEYS.length && (
          <button
            type="button"
            onClick={() => {
              const used = new Set(question.options.map(option => option.key))
              const key = COURSE_OPTION_KEYS.find(item => !used.has(item)) ?? COURSE_OPTION_KEYS[question.options.length]
              onChange([...question.options, { key, text: '' }])
            }}
            style={SECONDARY_BUTTON}
          >
            <Plus size={14} />新增选项
          </button>
        )}
      </div>
    )
  }

  function renderAssignmentQuestionEditor() {
    return (
      <section style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ color: '#183b4b', fontSize: 14 }}>作业题目</strong>
          <button
            type="button"
            onClick={() => setAssignmentQuestions(current => [...current, cloneAssignmentQuestion(null, current.length)])}
            style={SECONDARY_BUTTON}
          >
            <Plus size={14} />新增题目
          </button>
        </div>
        {assignmentQuestions.length === 0 ? (
          <div style={{ padding: 16, border: '1px dashed rgba(30,77,88,0.18)', borderRadius: 10, color: '#6b8a98', fontSize: 13 }}>暂无结构化题目。</div>
        ) : assignmentQuestions.map((question, index) => (
          <div key={question.id || index} style={{ padding: 14, borderRadius: 12, border: '1px solid rgba(30,77,88,0.1)', background: 'rgba(248,252,252,0.78)', display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px auto', gap: 8, alignItems: 'end' }}>
              <label style={FORM_LABEL}>
                题型
                <select
                  value={question.questionType}
                  onChange={event => {
                    const questionType = event.target.value as CourseQuizQuestionType
                    setAssignmentQuestions(current => current.map((item, itemIndex) => itemIndex === index
                      ? { ...item, questionType, correctAnswer: isChoiceQuestionType(questionType) ? (item.correctAnswer || 'A') : item.correctAnswer, options: normalizeEditableOptions(questionType, item.options) }
                      : item))
                  }}
                  style={INPUT_STYLE}
                >
                  {COURSE_QUESTION_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label style={FORM_LABEL}>
                分值
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={question.points}
                  onChange={event => setAssignmentQuestions(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, points: Number(event.target.value) } : item))}
                  style={INPUT_STYLE}
                />
              </label>
              <button type="button" onClick={() => setAssignmentQuestions(current => current.filter((_, itemIndex) => itemIndex !== index))} style={{ ...SECONDARY_BUTTON, color: '#b91c1c' }}>删除</button>
            </div>
            <label style={FORM_LABEL}>
              题干
              <textarea
                value={question.stem}
                onChange={event => setAssignmentQuestions(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, stem: event.target.value } : item))}
                rows={3}
                style={TEXTAREA_STYLE}
              />
            </label>
            {renderQuestionOptions(question, options => setAssignmentQuestions(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, options } : item)))}
            <label style={FORM_LABEL}>
              正确答案 / 参考答案
              <textarea
                value={question.correctAnswer || ''}
                onChange={event => setAssignmentQuestions(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, correctAnswer: event.target.value } : item))}
                rows={isChoiceQuestionType(question.questionType) ? 1 : 3}
                style={TEXTAREA_STYLE}
              />
            </label>
            <label style={FORM_LABEL}>
              解析
              <textarea
                value={question.explanation || ''}
                onChange={event => setAssignmentQuestions(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, explanation: event.target.value } : item))}
                rows={2}
                style={TEXTAREA_STYLE}
              />
            </label>
          </div>
        ))}
      </section>
    )
  }

  function renderChapterQuizQuestionEditor() {
    return (
      <section style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ color: '#183b4b', fontSize: 14 }}>测验题目</strong>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setChapterQuizQuestions(current => [...current, cloneManagedQuizQuestion({ eduLevel: 'college' })])}
              disabled={!chapterQuizForm.trainingId}
              style={SECONDARY_BUTTON}
            >
              <Plus size={14} />专科题
            </button>
            <button
              type="button"
              onClick={() => setChapterQuizQuestions(current => [...current, cloneManagedQuizQuestion({ eduLevel: 'undergraduate' })])}
              disabled={!chapterQuizForm.trainingId}
              style={SECONDARY_BUTTON}
            >
              <Plus size={14} />本科题
            </button>
          </div>
        </div>
        {loadingChapterQuizQuestions ? (
          <div style={{ padding: 16, color: '#6b8a98', fontSize: 13 }}>题目加载中...</div>
        ) : chapterQuizQuestions.length === 0 ? (
          <div style={{ padding: 16, border: '1px dashed rgba(30,77,88,0.18)', borderRadius: 10, color: '#6b8a98', fontSize: 13 }}>暂无生成题目，可新增后保存。</div>
        ) : (
          <div style={{ display: 'grid', gap: 10, maxHeight: 'min(560px, 56vh)', overflowY: 'auto', paddingRight: 4 }}>
            {chapterQuizQuestions.map((question, index) => {
              const saving = savingChapterQuizQuestionId === (question.questionId || `new-${index}`)
              return (
                <div key={question.questionId || `new-${index}`} style={{ padding: 14, borderRadius: 12, border: '1px solid rgba(30,77,88,0.1)', background: '#fff', display: 'grid', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 130px 100px auto', gap: 8, alignItems: 'end' }}>
                    <label style={FORM_LABEL}>
                      层次
                      <select
                        value={question.eduLevel}
                        onChange={event => setChapterQuizQuestions(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, eduLevel: event.target.value as QuizEduLevel } : item))}
                        style={INPUT_STYLE}
                      >
                        <option value="college">专科</option>
                        <option value="undergraduate">本科</option>
                      </select>
                    </label>
                    <label style={FORM_LABEL}>
                      题型
                      <select
                        value={question.questionType}
                        onChange={event => {
                          const questionType = event.target.value as CourseQuizQuestionType
                          setChapterQuizQuestions(current => current.map((item, itemIndex) => itemIndex === index
                            ? { ...item, questionType, correctAnswer: isChoiceQuestionType(questionType) ? 'A' : item.correctAnswer, options: normalizeEditableOptions(questionType, item.options) }
                            : item))
                        }}
                        style={INPUT_STYLE}
                      >
                        {COURSE_QUESTION_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                      </select>
                    </label>
                    <label style={FORM_LABEL}>
                      难度
                      <select
                        value={question.difficulty}
                        onChange={event => setChapterQuizQuestions(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, difficulty: event.target.value as '易' | '中' | '难' } : item))}
                        style={INPUT_STYLE}
                      >
                        <option value="易">易</option>
                        <option value="中">中</option>
                        <option value="难">难</option>
                      </select>
                    </label>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => { void saveChapterQuizQuestion(question, index) }} disabled={saving} style={PRIMARY_BUTTON}>{saving ? '保存中...' : '保存题目'}</button>
                      <button type="button" onClick={() => { void deleteChapterQuizQuestion(question, index) }} style={{ ...SECONDARY_BUTTON, color: '#b91c1c' }}>删除</button>
                    </div>
                  </div>
                  <label style={FORM_LABEL}>
                    题干
                    <textarea
                      value={question.stem}
                      onChange={event => setChapterQuizQuestions(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, stem: event.target.value } : item))}
                      rows={3}
                      style={TEXTAREA_STYLE}
                    />
                  </label>
                  {renderQuestionOptions(question, options => setChapterQuizQuestions(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, options } : item)))}
                  <label style={FORM_LABEL}>
                    正确答案 / 参考答案
                    <textarea
                      value={question.correctAnswer}
                      onChange={event => setChapterQuizQuestions(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, correctAnswer: event.target.value } : item))}
                      rows={isChoiceQuestionType(question.questionType) ? 1 : 3}
                      style={TEXTAREA_STYLE}
                    />
                  </label>
                  <label style={FORM_LABEL}>
                    解析
                    <textarea
                      value={question.explanation}
                      onChange={event => setChapterQuizQuestions(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, explanation: event.target.value } : item))}
                      rows={2}
                      style={TEXTAREA_STYLE}
                    />
                  </label>
                </div>
              )
            })}
          </div>
        )}
      </section>
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
        {renderAssignmentQuestionEditor()}
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
              const nextTrainingId = event.target.value
              const chapter = courseChapters.find(item => item.trainingId === nextTrainingId)
              const existing = chapterQuizzes.find(quiz => quiz.trainingId === nextTrainingId)
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
                  trainingId: nextTrainingId,
                  title: chapter ? `${chapter.displayName} 章节测验` : '',
                  description: chapter ? `${chapter.displayName} 的章节学习达成度测验` : '',
                })
              if (nextTrainingId) void loadChapterQuizQuestions(nextTrainingId)
              else setChapterQuizQuestions([])
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
          <label style={FORM_LABEL}>题数<input type="number" min={60} max={60} value={chapterQuizForm.questionCount} onChange={event => setChapterQuizForm(form => ({ ...form, questionCount: Number(event.target.value) }))} style={INPUT_STYLE} /></label>
          <label style={FORM_LABEL}>及格线<input type="number" min={1} max={100} value={chapterQuizForm.passScore} onChange={event => setChapterQuizForm(form => ({ ...form, passScore: Number(event.target.value) }))} style={INPUT_STYLE} /></label>
          <label style={FORM_LABEL}>限时<input type="number" min={30} max={180} value={chapterQuizForm.durationMinutes} onChange={event => setChapterQuizForm(form => ({ ...form, durationMinutes: Number(event.target.value) }))} style={INPUT_STYLE} /></label>
        </div>
        <p style={{ margin: 0, color: '#6b8a98', fontSize: 12, lineHeight: 1.7 }}>
          固定结构：20 道单选、10 道多选、10 道判断、10 道填空、5 道简答、5 道综合分析；学生首次进入后固定同一套题，最多可重做 3 次。
        </p>
        <label style={FORM_LABEL}>状态<select value={chapterQuizForm.status} onChange={event => setChapterQuizForm(form => ({ ...form, status: event.target.value as 'draft' | 'published' }))} style={INPUT_STYLE}><option value="draft">草稿</option><option value="published">已发布</option></select></label>
        {renderChapterQuizQuestionEditor()}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button onClick={() => saveChapterQuiz('draft')} disabled={savingChapterQuiz} style={{ ...SECONDARY_BUTTON, justifyContent: 'center' }}>保存草稿</button>
          <button onClick={() => saveChapterQuiz('published')} disabled={savingChapterQuiz} style={{ ...PRIMARY_BUTTON, justifyContent: 'center' }}>{savingChapterQuiz ? '发布中...' : '发布测验'}</button>
        </div>
      </>
    )
  }

  function renderAssignmentReview(assignment: TeacherAssignment) {
    const activeSubmission = assignment.submissions.find(submission => submission.id === reviewSubmissionId) ?? assignment.submissions[0] ?? null
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ padding: 13, borderRadius: 10, background: 'rgba(246,251,251,0.78)', border: '1px solid rgba(30,77,88,0.08)' }}>
          <span style={{ color: '#1d6f78', fontSize: 12, fontWeight: 900 }}>{assignment.trainingId} · {assignment.chapterName}</span>
          <strong style={{ display: 'block', color: '#183b4b', fontSize: 16, marginTop: 3 }}>{assignment.title}</strong>
          <p style={{ margin: '6px 0 0', color: '#6b8a98', fontSize: 12 }}>
            {assignment.assignmentType} · 满分 {assignment.maxScore}{assignment.dueDate ? ` · 截止 ${formatDateTimeInput(assignment.dueDate).replace('T', ' ')}` : ''} · 提交 {assignment.submissionCount}/{assignment.studentTotal}
          </p>
        </div>
        {assignment.missingCount > 0 && (
          <div style={{ padding: 13, borderRadius: 12, background: '#fff7ed', border: '1px solid #fed7aa', display: 'grid', gap: 8 }}>
            <strong style={{ color: '#9a5a13', fontSize: 13 }}>未完成学生（{assignment.missingCount}）</strong>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {assignment.missingStudents.slice(0, 24).map(student => (
                <span key={student.userId} style={{ padding: '5px 8px', borderRadius: 999, background: '#fff', color: '#8a5a18', border: '1px solid #fed7aa', fontSize: 12, fontWeight: 700 }}>
                  {student.studentName}
                </span>
              ))}
              {assignment.missingStudents.length > 24 && <span style={{ color: '#8a5a18', fontSize: 12 }}>等 {assignment.missingStudents.length} 人</span>}
            </div>
          </div>
        )}
        {assignment.submissions.length === 0 ? (
          <div style={{ padding: 22, border: '1px dashed rgba(30,77,88,0.18)', borderRadius: 10, color: '#6b8a98', fontSize: 13 }}>
            还没有学生提交。
          </div>
        ) : activeSubmission && (() => {
          const submission = activeSubmission
          const draft = gradeDrafts[submission.id] ?? {
            score: submission.score === null ? '' : String(submission.score),
            feedback: submission.feedback ?? '',
          }
          const gradeLabel = submission.gradedAt
            ? submission.gradedBy === 'teacher' ? '教师批改完成' : 'AI 批改完成'
            : '待批改'
          const reviews = submission.questionReviews ?? []
          return (
            <>
              <div style={{ padding: 13, borderRadius: 12, background: '#fff', border: '1px solid rgba(30,77,88,0.1)', display: 'grid', gap: 9 }}>
                <strong style={{ color: '#183b4b', fontSize: 14 }}>已完成学生（{assignment.submissions.length}）</strong>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {assignment.submissions.map(item => {
                    const active = item.id === submission.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setReviewSubmissionId(item.id)}
                        style={{
                          border: `1px solid ${active ? 'rgba(29,111,120,0.35)' : 'rgba(30,77,88,0.12)'}`,
                          background: active ? 'rgba(29,111,120,0.1)' : '#fff',
                          color: active ? '#1d6f78' : '#314d5b',
                          minHeight: 34,
                          borderRadius: 999,
                          padding: '0 12px',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 900,
                        }}
                      >
                        {item.studentName}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div key={submission.id} style={{ display: 'grid', gap: 10, border: '1px solid rgba(30,77,88,0.1)', borderRadius: 12, background: '#fff', padding: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div>
                    <strong style={{ color: '#183b4b', fontSize: 14 }}>{submission.studentName}</strong>
                    <span style={{ color: '#8aa0aa', fontSize: 12, marginLeft: 8 }}>{submission.className || submission.studentEmail}</span>
                  </div>
                  <Pill tone={submission.gradedAt ? 'green' : 'orange'}>{gradeLabel}</Pill>
                </div>
                <span style={{ color: '#8aa0aa', fontSize: 11 }}>提交时间：{formatDateTimeInput(submission.submittedAt).replace('T', ' ')}</span>
                {reviews.length > 0 ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {reviews.map((question, index) => {
                      const comment = question.comment || question.explanation || ''
                      return (
                        <div key={question.id || index} style={{ padding: 11, borderRadius: 9, background: 'rgba(248,252,252,0.9)', border: '1px solid rgba(30,77,88,0.08)' }}>
                          <span style={{ color: '#1d6f78', fontSize: 12, fontWeight: 900 }}>第 {index + 1} 题 · {question.questionType}</span>
                          <p style={{ margin: '5px 0 0', color: '#314d5b', fontSize: 13, lineHeight: 1.65 }}>{question.stem}</p>
                          <p style={{ margin: '7px 0 0', color: '#304655', fontSize: 12, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>学生答案：{question.userAnswer || '未解析到答案'}</p>
                          <p style={{ margin: '4px 0 0', color: '#1d6f78', fontSize: 12, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>标准答案：{question.correctAnswer || '未设置'}</p>
                          {comment && <p style={{ margin: '4px 0 0', color: '#7a96a4', fontSize: 12, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>评语：{comment}</p>}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p style={{ margin: 0, color: '#314d5b', fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap', padding: 12, borderRadius: 9, background: 'rgba(246,251,251,0.72)' }}>{submission.content}</p>
                )}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="number"
                    min={0}
                    max={assignment.maxScore}
                    value={draft.score}
                    onChange={event => setGradeDrafts(current => ({ ...current, [submission.id]: { ...draft, score: event.target.value } }))}
                    placeholder="评分"
                    style={{ ...INPUT_STYLE, width: 120, flex: '0 0 120px' }}
                  />
                  <input
                    value={draft.feedback}
                    onChange={event => setGradeDrafts(current => ({ ...current, [submission.id]: { ...draft, feedback: event.target.value } }))}
                    placeholder="反馈，可选"
                    style={{ ...INPUT_STYLE, minWidth: 220, flex: '1 1 260px' }}
                  />
                  <button onClick={() => gradeSubmission(submission.id)} style={{ ...PRIMARY_BUTTON, minWidth: 108, justifyContent: 'center', flex: '0 0 auto' }}>保存评分</button>
                </div>
              </div>
            </>
          )
        })()}
      </div>
    )
  }

  function renderChapterQuizList() {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        {chapterQuizzes.map(quiz => {
          const studentTotal = quiz.studentTotal ?? 0
          const completedCount = quiz.completedCount ?? 0
          const completionRate = studentTotal > 0 ? Math.round((completedCount / studentTotal) * 100) : 0
          return (
            <div key={quiz.trainingId} style={{ display: 'grid', gap: 10, padding: 14, borderRadius: 12, border: '1px solid rgba(30,77,88,0.1)', background: '#fff', boxShadow: '0 10px 26px rgba(29,53,74,0.05)' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 220, flex: '1 1 280px' }}>
                  <strong style={{ display: 'block', color: '#183b4b', fontSize: 14 }}>{quiz.trainingId} · {quiz.displayName}</strong>
                  <span style={{ color: '#6b8a98', fontSize: 12 }}>{quiz.title}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <Pill tone={quiz.questionPoolCount > 0 ? 'green' : 'orange'}>{quiz.questionPoolCount} 题可抽</Pill>
                  <Pill tone={(quiz.missingCount ?? 0) > 0 ? 'orange' : 'green'}>完成 {completedCount}/{studentTotal}</Pill>
                  <span style={{ color: '#46606f', fontSize: 12, lineHeight: 1.45 }}>{quiz.questionCount} 题 · {quiz.passScore} 分<br />均分 {quiz.averageScore ?? 0} · 限时 {quiz.durationMinutes} 分钟</span>
                  <Pill tone={quiz.status === 'published' ? 'green' : 'orange'}>{quiz.status === 'published' ? '已发布' : '草稿'}</Pill>
                  <button onClick={() => editChapterQuiz(quiz)} style={SECONDARY_BUTTON}>配置</button>
                  <button onClick={() => toggleChapterQuizStatus(quiz)} style={SECONDARY_BUTTON}>{quiz.status === 'published' ? '下架' : '发布'}</button>
                  <button onClick={() => { void deleteChapterQuiz(quiz) }} style={{ ...SECONDARY_BUTTON, color: '#b91c1c' }}>删除</button>
                </div>
              </div>
              <div style={{ height: 7, borderRadius: 999, background: 'rgba(31,71,92,0.08)', overflow: 'hidden' }}>
                <span style={{ display: 'block', width: `${completionRate}%`, height: '100%', borderRadius: 999, background: (quiz.missingCount ?? 0) > 0 ? '#c8812b' : '#16a34a' }} />
              </div>
              {(quiz.missingCount ?? 0) > 0 && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', color: '#8a5a18', fontSize: 12 }}>
                  <strong>未完成：</strong>
                  {(quiz.missingStudents ?? []).slice(0, 12).map(student => <span key={student.userId}>{student.studentName}</span>)}
                  {(quiz.missingStudents?.length ?? 0) > 12 && <span>等 {quiz.missingStudents?.length} 人</span>}
                </div>
              )}
            </div>
          )
        })}
        {chapterQuizzes.length === 0 && <div style={{ padding: 22, border: '1px dashed rgba(30,77,88,0.18)', borderRadius: 10, color: '#6b8a98', fontSize: 13 }}>暂无章节测验配置。</div>}
      </div>
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
    const overviewCourseStudents = (overview?.students ?? []).map(student => ({
      userId: student.userId,
      studentName: student.displayName,
      studentEmail: student.email,
      className: student.className,
      viewedPages: [],
      viewedPageCount: 0,
      pptProgress: 0,
      pptCompleted: false,
      videoWatchedSeconds: 0,
      videoMaxPosition: 0,
      videoProgress: 0,
      videoCompleted: false,
      lessonScore: 0,
      updatedAt: null,
    }))
    const fallbackCourseStudents = courseLessons.find(lesson => (lesson.students ?? []).length > 0)?.students ?? overviewCourseStudents
    const quizPublishedCount = chapterQuizzes.filter(quiz => quiz.status === 'published').length
    const quizCompletedTotal = chapterQuizzes.reduce((sum, quiz) => sum + (quiz.completedCount ?? 0), 0)
    const quizMissingTotal = chapterQuizzes.reduce((sum, quiz) => sum + (quiz.missingCount ?? 0), 0)
    const submittedTotal = courseAssignments.reduce((sum, assignment) => sum + assignment.submissionCount, 0)
    const assignmentMissingTotal = courseAssignments.reduce((sum, assignment) => sum + (assignment.missingCount ?? 0), 0)
    const pendingGradeTotal = courseAssignments.reduce((sum, assignment) => sum + Math.max(assignment.submissionCount - assignment.gradedCount, 0), 0)
    const courseLearningTabs: Array<{ key: CourseLearningTab; label: string; count: string | number; icon: LucideIcon }> = [
      { key: 'resources', label: '章节资源', count: courseRows.length, icon: BookOpenCheck },
      { key: 'pptProgress', label: 'PPT浏览进度', count: courseRows.length, icon: BarChart3 },
      { key: 'videoProgress', label: '视频浏览进度', count: courseRows.length, icon: Video },
      { key: 'quiz', label: '章节测验', count: chapterQuizzes.length, icon: ClipboardList },
      { key: 'assignment', label: '作业', count: courseAssignments.length, icon: FileText },
    ]

    function renderCourseLearningAction() {
      if (courseLearningTab === 'quiz') {
        return (
          <>
            <button type="button" onClick={() => setShowChapterQuizListModal(true)} style={SECONDARY_BUTTON}>
              <ClipboardList size={15} />
              查看测验
            </button>
            <button type="button" onClick={() => { setChapterQuizForm(EMPTY_CHAPTER_QUIZ_FORM); setChapterQuizQuestions([]); setShowChapterQuizModal(true) }} style={PRIMARY_BUTTON}>
              <Settings2 size={15} />
              配置测验
            </button>
          </>
        )
      }

      if (courseLearningTab === 'assignment') {
        return (
          <button type="button" onClick={() => { setAssignmentForm(EMPTY_ASSIGNMENT_FORM); setAssignmentQuestions([]); setShowAssignmentModal(true) }} style={PRIMARY_BUTTON}>
            <FileText size={15} />
            新增作业
          </button>
        )
      }

      if (courseLearningTab === 'pptProgress' || courseLearningTab === 'videoProgress') {
        return null
      }

      return (
        <button
          type="button"
          onClick={() => {
            setCourseForm(EMPTY_COURSE_FORM)
            setShowCourseLessonModal(true)
          }}
          style={PRIMARY_BUTTON}
        >
          <Upload size={15} />
          新增章节资源
        </button>
      )
    }

    function renderCourseLearningContent() {
      if (courseLearningTab === 'pptProgress') {
        return (
          <div style={{ padding: 16, display: 'grid', gap: 12, background: 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(248,252,252,0.72))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong style={{ color: '#183b4b', fontSize: 15 }}>学生 PPT 浏览进度</strong>
              <span style={{ color: '#6b8a98', fontSize: 12 }}>按章节显示教师名下学生的浏览页数</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 12, alignItems: 'stretch', overflow: 'hidden' }}>
              {courseRows.map(row => {
                const lesson = row.lesson
                const chapter = row.chapter
                const trainingId = lesson?.trainingId || chapter?.trainingId || '未绑定'
                const title = lesson?.title || `${chapter?.displayName || '未生成章节'} 教学PPT`
                const pptPageCount = lesson?.pptPageCount ?? 0
                const progressStudents = lesson?.students ?? fallbackCourseStudents
                const studentTotal = lesson ? (lesson.stats.studentTotal ?? progressStudents.length) : progressStudents.length
                const completed = lesson ? (lesson.stats.pptCompletedCount ?? 0) : 0
                const completionRate = lesson && studentTotal > 0 ? Math.round((completed / studentTotal) * 100) : 0
                return (
                  <div key={`${lesson?.lessonId ?? trainingId}-ppt-progress`} style={{ minWidth: 0, padding: 13, borderRadius: 12, background: '#fff', border: '1px solid rgba(30,77,88,0.1)', display: 'grid', gap: 10, overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'start' }}>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: '-webkit-box', color: '#183b4b', fontSize: 13, lineHeight: 1.35, minHeight: 35, overflow: 'hidden', textOverflow: 'ellipsis', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2 }}>{trainingId} · {title}</strong>
                        <span style={{ display: 'block', marginTop: 4, color: '#8aa0aa', fontSize: 11 }}>{pptPageCount || 0} 页 · 完成 {completed}/{studentTotal}</span>
                      </div>
                      <Pill tone={completionRate >= 100 ? 'green' : completionRate > 0 ? 'orange' : 'neutral'}>{completionRate}%</Pill>
                    </div>
                    <div style={{ height: 7, borderRadius: 999, background: 'rgba(31,71,92,0.08)', overflow: 'hidden' }}>
                      <span style={{ display: 'block', width: `${completionRate}%`, height: '100%', borderRadius: 999, background: completionRate >= 100 ? '#16a34a' : '#c8812b' }} />
                    </div>
                    <div style={{ display: 'grid', gap: 7, maxHeight: 170, overflowY: 'auto', paddingRight: 4 }}>
                      {progressStudents.map(student => {
                        const studentProgress = lesson ? student.pptProgress : 0
                        const studentCompleted = lesson ? student.pptCompleted : false
                        const viewedPageCount = lesson ? student.viewedPageCount : 0
                        return (
                          <div key={student.userId} style={{ display: 'grid', gridTemplateColumns: 'minmax(64px, 86px) minmax(0, 1fr) 42px', gap: 8, alignItems: 'center' }}>
                            <span style={{ color: '#314d5b', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{student.studentName}</span>
                            <div style={{ height: 6, borderRadius: 999, background: 'rgba(31,71,92,0.08)', overflow: 'hidden' }}>
                              <span style={{ display: 'block', width: `${studentProgress}%`, height: '100%', borderRadius: 999, background: studentCompleted || studentProgress >= 100 ? '#16a34a' : studentProgress > 0 ? '#c8812b' : '#cbd5df' }} />
                            </div>
                            <span style={{ color: '#6b8a98', fontSize: 11, textAlign: 'right' }}>{viewedPageCount}/{pptPageCount || 0}</span>
                          </div>
                        )
                      })}
                      {progressStudents.length === 0 && <span style={{ color: '#8aa0aa', fontSize: 12 }}>暂无绑定学生。</span>}
                    </div>
                  </div>
                )
              })}
              {courseRows.length === 0 && <div style={{ padding: 18, border: '1px dashed rgba(30,77,88,0.18)', borderRadius: 10, color: '#6b8a98', fontSize: 13 }}>暂无可统计的章节资源。</div>}
            </div>
          </div>
        )
      }

      if (courseLearningTab === 'videoProgress') {
        return (
          <div style={{ padding: 16, display: 'grid', gap: 12, background: 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(248,252,252,0.72))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong style={{ color: '#183b4b', fontSize: 15 }}>学生视频浏览进度</strong>
              <span style={{ color: '#6b8a98', fontSize: 12 }}>按章节显示教师名下学生的视频观看时长</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 12, alignItems: 'stretch', overflow: 'hidden' }}>
              {courseRows.map(row => {
                const lesson = row.lesson
                const chapter = row.chapter
                const trainingId = lesson?.trainingId || chapter?.trainingId || '未绑定'
                const title = lesson?.title || `${chapter?.displayName || '未生成章节'} 视频`
                const videoDuration = lesson?.videoDuration ?? 0
                const hasVideo = Boolean(lesson?.videoUrl)
                const progressStudents = lesson?.students ?? fallbackCourseStudents
                const studentTotal = lesson ? (lesson.stats.studentTotal ?? progressStudents.length) : progressStudents.length
                const completed = lesson ? (lesson.stats.videoCompletedCount ?? 0) : 0
                const completionRate = lesson && studentTotal > 0 ? Math.round((completed / studentTotal) * 100) : 0
                return (
                  <div key={`${lesson?.lessonId ?? trainingId}-video-progress`} style={{ minWidth: 0, padding: 13, borderRadius: 12, background: '#fff', border: '1px solid rgba(30,77,88,0.1)', display: 'grid', gap: 10, overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'start' }}>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: '-webkit-box', color: '#183b4b', fontSize: 13, lineHeight: 1.35, minHeight: 35, overflow: 'hidden', textOverflow: 'ellipsis', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2 }}>{trainingId} · {title}</strong>
                        <span style={{ display: 'block', marginTop: 4, color: '#8aa0aa', fontSize: 11 }}>
                          {hasVideo ? `${formatLearningSeconds(videoDuration)} · 完成 ${completed}/${studentTotal}` : '未上传视频'}
                        </span>
                      </div>
                      <Pill tone={completionRate >= 100 ? 'green' : completionRate > 0 ? 'orange' : 'neutral'}>{completionRate}%</Pill>
                    </div>
                    <div style={{ height: 7, borderRadius: 999, background: 'rgba(31,71,92,0.08)', overflow: 'hidden' }}>
                      <span style={{ display: 'block', width: `${completionRate}%`, height: '100%', borderRadius: 999, background: completionRate >= 100 ? '#16a34a' : completionRate > 0 ? '#c8812b' : '#cbd5df' }} />
                    </div>
                    <div style={{ display: 'grid', gap: 7, maxHeight: 170, overflowY: 'auto', paddingRight: 4 }}>
                      {progressStudents.map(student => {
                        const studentProgress = lesson && hasVideo ? student.videoProgress : 0
                        const studentCompleted = lesson && hasVideo ? student.videoCompleted : false
                        const watchedSeconds = lesson && hasVideo ? student.videoWatchedSeconds : 0
                        return (
                          <div key={student.userId} style={{ display: 'grid', gridTemplateColumns: 'minmax(64px, 86px) minmax(0, 1fr) 52px', gap: 8, alignItems: 'center' }}>
                            <span style={{ color: '#314d5b', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{student.studentName}</span>
                            <div style={{ height: 6, borderRadius: 999, background: 'rgba(31,71,92,0.08)', overflow: 'hidden' }}>
                              <span style={{ display: 'block', width: `${studentProgress}%`, height: '100%', borderRadius: 999, background: studentCompleted || studentProgress >= 95 ? '#16a34a' : studentProgress > 0 ? '#c8812b' : '#cbd5df' }} />
                            </div>
                            <span style={{ color: '#6b8a98', fontSize: 11, textAlign: 'right' }}>{formatLearningSeconds(watchedSeconds)}</span>
                          </div>
                        )
                      })}
                      {progressStudents.length === 0 && <span style={{ color: '#8aa0aa', fontSize: 12 }}>暂无绑定学生。</span>}
                    </div>
                  </div>
                )
              })}
              {courseRows.length === 0 && <div style={{ padding: 18, border: '1px dashed rgba(30,77,88,0.18)', borderRadius: 10, color: '#6b8a98', fontSize: 13 }}>暂无可统计的章节资源。</div>}
            </div>
          </div>
        )
      }

      if (courseLearningTab === 'quiz') {
        return (
          <div style={{ padding: 16, display: 'grid', gap: 14, background: 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(248,252,252,0.72))' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
              {[
                { label: '章节测验', value: chapterQuizzes.length },
                { label: '已发布', value: quizPublishedCount },
                { label: '完成记录', value: quizCompletedTotal },
                { label: '未完成', value: quizMissingTotal },
                { label: '草稿', value: chapterQuizzes.length - quizPublishedCount },
              ].map(item => (
                <div key={item.label} style={{ padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(30,77,88,0.08)' }}>
                  <span style={{ color: '#6b8a98', fontSize: 12 }}>{item.label}</span>
                  <strong style={{ display: 'block', color: '#183b4b', fontSize: 24, marginTop: 4 }}>{item.value}</strong>
                </div>
              ))}
            </div>
            {renderChapterQuizList()}
          </div>
        )
      }

      if (courseLearningTab === 'assignment') {
        return (
          <div style={{ padding: 16, display: 'grid', gap: 14, background: 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(248,252,252,0.72))' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
              {[
                { label: '已发布作业', value: courseAssignments.length },
                { label: '收到提交', value: submittedTotal },
                { label: '未完成', value: assignmentMissingTotal },
                { label: '待批改', value: pendingGradeTotal },
              ].map(item => (
                <div key={item.label} style={{ padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(30,77,88,0.08)' }}>
                  <span style={{ color: '#6b8a98', fontSize: 12 }}>{item.label}</span>
                  <strong style={{ display: 'block', color: '#183b4b', fontSize: 24, marginTop: 4 }}>{item.value}</strong>
                </div>
              ))}
            </div>
            {courseAssignments.length === 0 ? (
              <div style={{ padding: 22, border: '1px dashed rgba(30,77,88,0.18)', borderRadius: 10, color: '#6b8a98', fontSize: 13, background: 'rgba(255,255,255,0.72)' }}>暂无作业。点击“新增作业”选择章节后发布。</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 12 }}>
                {courseAssignments.map(assignment => {
                  const studentTotal = assignment.studentTotal || assignment.submissionCount
                  const submitRatio = studentTotal > 0 ? Math.round((assignment.submissionCount / studentTotal) * 100) : 0
                  const gradedRatio = assignment.submissionCount > 0 ? Math.round((assignment.gradedCount / assignment.submissionCount) * 100) : 0
                  const isDone = assignment.submissionCount > 0 && assignment.submissionCount === assignment.gradedCount

                  return (
                    <div key={assignment.id} style={{ display: 'grid', gap: 12, padding: 15, minWidth: 0, alignContent: 'start', border: '1px solid rgba(30,77,88,0.1)', borderRadius: 12, background: '#fff', boxShadow: '0 12px 28px rgba(29,53,74,0.06)' }}>
                      <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
                        <span
                          title={`${assignment.trainingId} · ${assignment.chapterName}`}
                          style={{ display: 'block', minWidth: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#1d6f78', fontSize: 12, fontWeight: 900 }}
                        >
                          {assignment.trainingId} · {assignment.chapterName}
                        </span>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <Pill tone={assignment.missingCount > 0 ? 'orange' : 'green'}>提交 {assignment.submissionCount}/{studentTotal}</Pill>
                          <Pill tone={isDone ? 'green' : assignment.submissionCount > 0 ? 'orange' : 'neutral'}>{assignment.gradedCount}/{assignment.submissionCount} 已批</Pill>
                        </div>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', color: '#183b4b', fontSize: 15, lineHeight: 1.45 }}>{assignment.title}</strong>
                        <p style={{ margin: '7px 0 0', color: '#6b8a98', fontSize: 12, lineHeight: 1.65, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{assignment.description}</p>
                      </div>
                      <div style={{ display: 'grid', gap: 7 }}>
                        <div style={{ height: 7, borderRadius: 999, background: 'rgba(31,71,92,0.08)', overflow: 'hidden' }}>
                          <span style={{ display: 'block', width: `${submitRatio}%`, height: '100%', borderRadius: 999, background: assignment.missingCount > 0 ? '#c8812b' : '#16a34a' }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, color: '#8aa0aa', fontSize: 11 }}>
                          <span style={{ minWidth: 0, whiteSpace: 'nowrap' }}>满分 {assignment.maxScore}</span>
                          <span style={{ minWidth: 0, whiteSpace: 'nowrap', textAlign: 'center' }}>提交率 {submitRatio}% · 批改率 {gradedRatio}%</span>
                          {assignment.dueDate && <span style={{ minWidth: 0, whiteSpace: 'nowrap', textAlign: 'right' }}>截止 {assignment.dueDate.slice(0, 10)}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(112px, 1fr) minmax(76px, auto) minmax(76px, auto)', gap: 8, alignItems: 'center' }}>
                        <button type="button" onClick={() => openAssignmentReview(assignment)} style={{ ...PRIMARY_BUTTON, justifyContent: 'center', minWidth: 0 }}>批改作业</button>
                        <button type="button" onClick={() => editAssignment(assignment)} style={{ ...SECONDARY_BUTTON, justifyContent: 'center', minWidth: 76 }}>编辑</button>
                        <button type="button" onClick={() => deleteAssignment(assignment.id)} style={{ ...SECONDARY_BUTTON, justifyContent: 'center', minWidth: 76, color: '#b91c1c' }}>删除</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      }

      return (
        <div style={{ display: 'grid', gap: 14 }}>
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
                    <td style={TD}>
                      学习 {lesson?.stats.learnerCount ?? 0} 人<br />
                      PPT 完成 {lesson?.stats.pptCompletedCount ?? lesson?.stats.completedCount ?? 0}/{lesson?.stats.studentTotal ?? 0}<br />
                      均分 {lesson?.stats.averageScore ?? 0}
                    </td>
                    <td style={TD}><Pill tone={lesson?.status === 'published' ? 'green' : lesson ? 'orange' : 'neutral'}>{lesson?.status === 'published' ? '已发布' : lesson ? '草稿' : '未配置'}</Pill></td>
                    <td style={TD}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => chapter ? startChapterResource(chapter) : lesson && editCourseLesson(lesson)} style={SECONDARY_BUTTON}>
                          {lesson ? '编辑' : '配置'}
                        </button>
                        {chapter && <button type="button" onClick={() => startChapterQuiz(chapter)} style={SECONDARY_BUTTON}>测验</button>}
                        {chapter && <button type="button" onClick={() => startChapterAssignment(chapter)} style={SECONDARY_BUTTON}>作业</button>}
                        {chapter && (
                          <button
                            type="button"
                            onClick={() => { void generateChapterAutomation(chapter) }}
                            disabled={generatingCourseAutomation === chapter.trainingId}
                            style={{
                              ...SECONDARY_BUTTON,
                              opacity: generatingCourseAutomation === chapter.trainingId ? 0.6 : 1,
                              cursor: generatingCourseAutomation === chapter.trainingId ? 'wait' : 'pointer',
                            }}
                          >
                            {generatingCourseAutomation === chapter.trainingId ? '生成中...' : 'AI生成'}
                          </button>
                        )}
                        {lesson && <button type="button" onClick={() => deleteCourseLesson(lesson.lessonId)} style={{ ...SECONDARY_BUTTON, color: '#b91c1c' }}>删除</button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {courseRows.length === 0 && (
                <tr><td colSpan={6} style={{ ...TD, textAlign: 'center', color: '#8aa0aa' }}>暂无课程章节数据，请先检查 MySQL 中的 training_projects。</td></tr>
              )}
            </tbody>
            </table>
          </div>
        </div>
      )
    }

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
              <div style={{ ...TABLE_HEADER, alignItems: 'stretch', flexWrap: 'wrap', background: 'linear-gradient(90deg, rgba(246,251,251,0.92), rgba(255,255,255,0.72))' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
                  <strong style={{ color: '#183b4b', fontSize: 16 }}>课程学习管理</strong>
                  <div role="tablist" aria-label="课程学习管理" style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 12, background: 'rgba(29,111,120,0.08)', border: '1px solid rgba(29,111,120,0.12)', flexWrap: 'wrap' }}>
                    {courseLearningTabs.map(item => {
                      const Icon = item.icon
                      const active = courseLearningTab === item.key

                      return (
                        <button
                          key={item.key}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setCourseLearningTab(item.key)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 7,
                            minHeight: 38,
                            border: 'none',
                            borderRadius: 9,
                            padding: '0 12px',
                            background: active ? '#fff' : 'transparent',
                            color: active ? '#1d6f78' : '#46606f',
                            fontSize: 13,
                            fontWeight: 900,
                            cursor: 'pointer',
                            boxShadow: active ? '0 8px 18px rgba(29,53,74,0.08)' : 'none',
                          }}
                        >
                          <Icon size={15} />
                          <span>{item.label}</span>
                          <span style={{ padding: '2px 6px', borderRadius: 999, background: active ? 'rgba(29,111,120,0.1)' : 'rgba(255,255,255,0.72)', color: active ? '#1d6f78' : '#6b8a98', fontSize: 11 }}>{item.count}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  {renderCourseLearningAction()}
                </div>
              </div>
              {courseLoading ? (
                <CourseAssetLoading progress={courseAssetProgress} />
              ) : renderCourseLearningContent()}
            </section>
          </div>
        </section>

        {showCoursewareModal && (
          <div style={COURSEWARE_MODAL_BACKDROP} onClick={() => setShowCoursewareModal(false)}>
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
        {renderPptPreviewModal()}
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
            setChapterQuizQuestions([])
          },
          renderChapterQuizForm(),
          'min(980px, 96vw)',
        )}
        {showAssignmentReviewModal && reviewAssignment && renderTeacherConfigModal(
          '批改作业',
          '在弹窗内查看学生提交并保存评分反馈。',
          () => {
            setShowAssignmentReviewModal(false)
            setReviewAssignment(null)
            setReviewSubmissionId(null)
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
            setAssignmentQuestions([])
          },
          renderAssignmentForm(),
          'min(920px, 96vw)',
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
      <section style={{ ...PANEL, minHeight: 'calc(100vh - 190px)', display: 'grid', gridTemplateColumns: '250px minmax(0, 1fr)', overflow: 'hidden' }}>
        <aside style={{ minWidth: 0, borderRight: '1px solid rgba(31,71,92,0.09)', background: 'rgba(246,251,251,0.72)', padding: 14, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: 12 }}>
          <button
            type="button"
            onClick={startTeacherNewChat}
            disabled={teacherChatLoading}
            style={{ height: 40, borderRadius: 12, border: '1px solid rgba(29,111,120,0.18)', background: 'linear-gradient(135deg,#1d6f78,#35818a)', color: '#fff', cursor: teacherChatLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14, fontWeight: 800, boxShadow: '0 12px 26px rgba(29,111,120,0.16)' }}
          >
            <Plus size={16} />
            新对话
          </button>

          <div style={{ minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 2 }}>
            {teacherChatHistoryLoading && (
              <div style={{ padding: '14px 10px', color: '#6b8a98', fontSize: 12 }}>正在加载历史...</div>
            )}
            {!teacherChatHistoryLoading && teacherChatSessions.length === 0 && (
              <div style={{ padding: '14px 10px', color: '#6b8a98', fontSize: 12, lineHeight: 1.65 }}>暂无历史对话，发送第一条教学问题后会自动保存。</div>
            )}
            {teacherChatSessions.map(session => {
              const active = session.sessionId === activeTeacherChatSessionId
              return (
                <div
                  key={session.sessionId}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (!teacherChatSessionLoading && !teacherChatLoading) void loadTeacherChatSession(session.sessionId)
                  }}
                  onKeyDown={event => {
                    if ((event.key === 'Enter' || event.key === ' ') && !teacherChatSessionLoading && !teacherChatLoading) {
                      event.preventDefault()
                      void loadTeacherChatSession(session.sessionId)
                    }
                  }}
                  style={{ width: '100%', textAlign: 'left', border: `1px solid ${active ? 'rgba(29,111,120,0.28)' : 'rgba(31,71,92,0.1)'}`, background: active ? 'rgba(29,111,120,0.1)' : 'rgba(255,255,255,0.78)', borderRadius: 12, padding: 10, cursor: teacherChatSessionLoading || teacherChatLoading ? 'not-allowed' : 'pointer', display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr) 26px', alignItems: 'center', gap: 8 }}
                >
                  <MessageSquare size={15} color={active ? '#1d6f78' : '#6b8a98'} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', color: '#183b4b', fontSize: 13, fontWeight: active ? 800 : 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.title}</span>
                    <span style={{ display: 'block', color: '#7d929c', fontSize: 11, marginTop: 3 }}>{formatTeacherChatSessionTime(session.updatedAt)} · {session.messageCount} 条</span>
                  </span>
                  <span onClick={event => event.stopPropagation()} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={event => void deleteTeacherChatSession(session.sessionId, event)}
                      aria-label="删除历史对话"
                      style={{ width: 24, height: 24, borderRadius: 8, border: 'none', background: 'transparent', cursor: teacherChatLoading ? 'not-allowed' : 'pointer', display: 'grid', placeItems: 'center', color: '#8aa0a9' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        </aside>

        <div style={{ minWidth: 0, display: 'grid', gridTemplateRows: 'minmax(0, 1fr) auto' }}>
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
                  {message.role === 'assistant' && index > 0 && message.content.trim() && (
                    <button
                      type="button"
                      onClick={() => openTeacherChatFeedback(message)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 9px', borderRadius: 999, border: '1px solid rgba(200,129,43,0.22)', background: 'rgba(255,251,235,0.78)', color: '#9a641d', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
                    >
                      <Flag size={12} />
                      答案有误
                    </button>
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
        </div>
        {teacherChatFeedbackTarget && (
          <div
            style={{ ...MODAL_BACKDROP, zIndex: 90, background: 'rgba(15,35,45,0.22)', backdropFilter: 'blur(5px)' }}
            onClick={closeTeacherChatFeedback}
          >
            <div
              style={{ width: 'min(520px, 100%)', borderRadius: 18, border: '1px solid rgba(31,71,92,0.14)', background: 'rgba(255,255,255,0.96)', boxShadow: '0 24px 70px rgba(29,53,74,0.18)', padding: 18, display: 'grid', gap: 12 }}
              onClick={event => event.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <strong style={{ color: '#183b4b', fontSize: 16 }}>反馈 AI 答案</strong>
                  <p style={{ margin: '4px 0 0', color: '#6b8a98', fontSize: 12 }}>请描述你认为不准确、缺依据或需要修正的地方。</p>
                </div>
                <button type="button" onClick={closeTeacherChatFeedback} style={{ width: 30, height: 30, borderRadius: 10, border: '1px solid rgba(31,71,92,0.12)', background: '#fff', color: '#6b8a98', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                  <X size={15} />
                </button>
              </div>
              <div style={{ maxHeight: 120, overflowY: 'auto', borderRadius: 12, border: '1px solid rgba(31,71,92,0.1)', background: '#f7fbfb', padding: 12, color: '#46606f', fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {teacherChatFeedbackTarget.content}
              </div>
              <textarea
                value={teacherChatFeedbackComment}
                onChange={event => setTeacherChatFeedbackComment(event.target.value)}
                placeholder="可选：补充具体问题或正确依据"
                rows={4}
                style={{ width: '100%', resize: 'vertical', borderRadius: 12, border: '1px solid rgba(31,71,92,0.14)', padding: 12, outline: 'none', color: '#183b4b', fontSize: 13, lineHeight: 1.6, boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ color: teacherChatFeedbackStatus === 'error' ? '#b45309' : '#1d6f78', fontSize: 12 }}>{teacherChatFeedbackNotice}</span>
                <button
                  type="button"
                  onClick={() => void submitTeacherChatFeedback()}
                  disabled={teacherChatFeedbackStatus === 'sending'}
                  style={{ height: 36, padding: '0 16px', borderRadius: 11, border: 'none', background: teacherChatFeedbackStatus === 'sending' ? 'rgba(31,71,92,0.18)' : 'linear-gradient(135deg,#1d6f78,#35818a)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: teacherChatFeedbackStatus === 'sending' ? 'not-allowed' : 'pointer' }}
                >
                  {teacherChatFeedbackStatus === 'sending' ? '提交中...' : '提交反馈'}
                </button>
              </div>
            </div>
          </div>
        )}
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

const INLINE_LINK_BUTTON: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: '#1d6f78',
  padding: 0,
  fontSize: 12,
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

const COURSEWARE_MODAL_BACKDROP: CSSProperties = {
  ...MODAL_BACKDROP,
  zIndex: 90,
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

const PPT_PREVIEW_BACKDROP: CSSProperties = {
  ...MODAL_BACKDROP,
  zIndex: 120,
  padding: 14,
}

const PPT_PREVIEW_MODAL: CSSProperties = {
  width: 'min(1220px, 98vw)',
  height: 'min(92vh, 880px)',
  minHeight: 560,
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  borderRadius: 12,
  background: '#f7fafc',
  border: '1px solid rgba(30,77,88,0.14)',
  boxShadow: '0 26px 80px rgba(12,32,45,0.28)',
  overflow: 'hidden',
}

const PPT_PREVIEW_HEADER: CSSProperties = {
  padding: '13px 16px',
  borderBottom: '1px solid rgba(30,77,88,0.12)',
  background: 'rgba(255,255,255,0.96)',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: 12,
}

const PPT_PREVIEW_BODY: CSSProperties = {
  minHeight: 0,
  overflow: 'hidden',
}

const PPT_PREVIEW_IFRAME: CSSProperties = {
  width: '100%',
  height: '100%',
  border: 'none',
  background: '#fff',
}

const PPT_PREVIEW_STAGE: CSSProperties = {
  height: '100%',
  minHeight: 0,
  background: '#e7ebf0',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 104px',
  overflow: 'hidden',
}

const PPT_PREVIEW_SCROLLER: CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  overscrollBehavior: 'auto',
  scrollBehavior: 'auto',
}

const PPT_PREVIEW_SIDE_NAV: CSSProperties = {
  minHeight: 0,
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  gap: 10,
  padding: '12px 10px',
  background: '#f8fbfd',
  borderLeft: '1px solid #d5e0e8',
}

const PPT_PREVIEW_SIDE_HEAD: CSSProperties = {
  display: 'grid',
  gap: 4,
  color: '#31475a',
  fontSize: 12,
  fontWeight: 800,
  minWidth: 0,
}

const PPT_PREVIEW_SIDE_TITLE: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  lineHeight: 1.35,
}

const PPT_PREVIEW_PAGE_LIST: CSSProperties = {
  minHeight: 0,
  overflowY: 'auto',
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  alignContent: 'start',
  gap: 6,
  paddingRight: 2,
}

function pptPreviewPageButtonStyle(active: boolean): CSSProperties {
  return {
    minWidth: 0,
    height: 32,
    borderRadius: 7,
    border: active ? '1px solid #1d6f78' : '1px solid #d5e2ea',
    background: active ? '#1d6f78' : '#fff',
    color: active ? '#fff' : '#46606f',
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
  }
}

const PPT_PREVIEW_CANVAS_WRAP: CSSProperties = {
  position: 'relative',
  display: 'grid',
  justifyItems: 'center',
  gap: 22,
  padding: '18px 40px 30px',
}

const PPT_PREVIEW_SCROLL_SECTION: CSSProperties = {
  width: 'min(100%, 1060px)',
  display: 'grid',
  gap: 8,
  scrollMarginTop: 20,
}

const PPT_PREVIEW_PAGE_META: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  color: '#607080',
  fontSize: 12,
  fontWeight: 800,
}

const PPT_PREVIEW_SVG_PAGE: CSSProperties = {
  width: '100%',
  aspectRatio: '16 / 9',
  background: '#fff',
  boxShadow: '0 18px 42px rgba(28,49,64,0.14)',
  lineHeight: 0,
}

const PPT_PREVIEW_IMAGE_PAGE: CSSProperties = {
  width: '100%',
  aspectRatio: '16 / 9',
  display: 'block',
  objectFit: 'contain',
  background: '#fff',
  boxShadow: '0 18px 42px rgba(28,49,64,0.14)',
}

const PPT_PREVIEW_TEXT_SLIDE: CSSProperties = {
  width: '100%',
  aspectRatio: '16 / 9',
  background: '#fff',
  border: '1px solid #d7e0ea',
  boxShadow: '0 18px 42px rgba(28,49,64,0.14)',
  padding: '5.4% 6%',
  display: 'grid',
  alignContent: 'start',
  gap: 18,
}

const PPT_PREVIEW_EYEBROW: CSSProperties = {
  margin: 0,
  color: '#ed7d31',
  fontSize: 14,
  fontWeight: 900,
}

const PPT_PREVIEW_TITLE: CSSProperties = {
  margin: 0,
  color: '#26364a',
  fontSize: 32,
  lineHeight: 1.2,
}

const PPT_PREVIEW_LINES: CSSProperties = {
  display: 'grid',
  gap: 10,
  color: '#44546a',
  fontSize: 18,
  lineHeight: 1.5,
}

const PPT_PREVIEW_EMPTY: CSSProperties = {
  height: '100%',
  minHeight: 420,
  display: 'grid',
  placeItems: 'center',
  alignContent: 'center',
  gap: 10,
  color: '#6b8a98',
  textAlign: 'center',
  fontSize: 13,
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

const COURSE_VIDEO_PREVIEW: CSSProperties = {
  borderRadius: 8,
  overflow: 'hidden',
  background: '#0f172a',
  border: '1px solid rgba(30,77,88,0.14)',
}

const COURSE_VIDEO_PLAYER: CSSProperties = {
  display: 'block',
  width: '100%',
  height: 'clamp(180px, 34vh, 360px)',
  background: '#0f172a',
  objectFit: 'contain',
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
