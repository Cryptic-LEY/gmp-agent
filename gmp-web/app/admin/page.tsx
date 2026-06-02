'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  Building2,
  ClipboardList,
  Database,
  Download,
  GitBranch,
  HardDrive,
  Layers,
  Layers3,
  LoaderCircle,
  LogOut,
  Network,
  Plus,
  RefreshCw,
  Save,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Trash2,
  UserCog,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import ConsoleHeaderActions, { DEFAULT_CONSOLE_LAYOUT, type ConsoleLayoutConfig } from '../components/ConsoleHeaderActions'
import RoleProfileCenter from '../components/RoleProfileCenter'
import { ComparisonChartCard, DistributionChartCard } from '../components/AnalyticsChartCard'

type AdminSection = 'overview' | 'users' | 'schools' | 'projects' | 'mindmap' | 'dependencies' | 'questions' | 'rules' | 'system' | 'aiConfig' | 'exports' | 'profile'
type Role = 'student' | 'teacher' | 'admin'
type SchoolStatus = 'active' | 'paused' | 'expired'
type ClassStatus = 'active' | 'archived'

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

interface TeachingStudentItem {
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

interface AdminQuestionItem {
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

interface TeachingOverviewResponse {
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
  students: TeachingStudentItem[]
  projectTasks: ProjectTaskItem[]
  knowledgeItems: Array<{
    kpId: string
    serialCode: string
    eduLevel: string
    projectName: string
    taskName: string
    title: string
    pointType: string
    difficulty: number
    gmpArticles: string
  }>
  questionItems: AdminQuestionItem[]
}

interface OverviewData {
  summary: {
    totalUsers: number
    studentCount: number
    teacherCount: number
    adminCount: number
    classCount: number
    planCount: number
    averageDiagnosticScore: number
    knowledgeCount: number
    skillCount: number
    projectCount: number
    taskCount: number
    questionCount: number
    answerCount: number
    wrongCount: number
    pendingReviewCount: number
    orgCount: number
  }
  distributions: {
    byRole: Array<{ label: string; value: number }>
    byEducation: Array<{ label: string; value: number }>
    byMajor: Array<{ label: string; value: number }>
    byQuestionType: Array<{ label: string; value: number }>
    byQuestionDifficulty: Array<{ label: string; value: number }>
  }
  modules: Array<{ key: string; title: string; status: 'done' | 'todo'; desc: string }>
  systemStatus: {
    database: string
    api: string
    version: string
    lastBackup: string | null
  }
}

interface AdminUser {
  userId: string
  role: Role
  persona: string
  displayName: string
  email: string
  createdAt: string
  realName?: string | null
  school?: string | null
  major?: string | null
  className?: string | null
  studentId?: string | null
  phone?: string | null
}

interface UsersResponse {
  items: AdminUser[]
  total: number
}

interface SchoolItem {
  schoolId: string
  name: string
  code: string
  region: string
  contactPerson: string
  contactPhone: string
  packageName: string
  status: SchoolStatus
  openedAt: string
  expiresAt: string
  notes: string
  createdAt: string
  updatedAt: string
  studentCount: number
  teacherCount: number
  classCount: number
  majorCount: number
  onboardingCompletedCount: number
  averageDiagnosticScore: number
  pendingReviewCount: number
  classNames: string[]
  majors: string[]
}

interface SchoolClassItem {
  classId: string
  schoolId: string
  schoolName: string
  className: string
  major: string
  educationLevel: string
  gradeYear: string
  teacherUserId: string
  teacherName: string
  studentCapacity: number
  enrolledStudents: number
  status: ClassStatus
  createdAt: string
  updatedAt: string
}

interface SchoolTeacherOption {
  userId: string
  displayName: string
  email: string
  school: string
}

interface SchoolsResponse {
  summary: {
    schoolCount: number
    activeSchoolCount: number
    classCount: number
    studentCount: number
    teacherCount: number
    onboardingCompletedCount: number
    pendingReviewCount: number
    unassignedStudentCount: number
  }
  schools: SchoolItem[]
  classes: SchoolClassItem[]
  teachers: SchoolTeacherOption[]
}

interface SystemSettingsForm {
  dashScopeApiKey: string
  llmModel: string
  embeddingModel: string
  ragTopK: number
  ragScoreThreshold: number
  promptTemplate: string
  knowledgeUpdatedAt: string
}

interface SystemResponse {
  settings: SystemSettingsForm & {
    dashScopeApiKeyMasked: string
    hasDashScopeApiKey: boolean
  }
  monitoring: {
    serviceStatus: Array<{ name: string; status: 'ok' | 'warning' | 'error' | string; detail: string }>
    apiUsage: {
      total: number
      today: number
      queryLogTotal: number
      practiceSubmitTotal: number
    }
    aiUsage: {
      total: number
      today: number
      averageLatencyMs: number
      criticTriggered: number
    }
    database: {
      status: string
      path: string
      sizeMB: number
      tableCount: number
      userCount: number
      questionCount: number
      knowledgeCount: number
    }
    storage: {
      status: string
      totalMB: number
      items: Array<{ label: string; path: string; sizeMB: number }>
    }
    errorLogs: Array<{ time: string; level: string; source: string; message: string }>
  }
}

interface KnowledgeItem {
  kpId: string
  serialCode: string
  granularity: string
  eduLevel: string
  projectName: string
  taskName: string
  title: string
  content: string
  gmpArticles: string
  sourceType: string
  difficulty: number
  pointType: string
  masteryRequirement: string
  status: string
  dependsOn: string[]
  requiredFor: string[]
}

interface MindmapResponse {
  items: KnowledgeItem[]
  total: number
  page: number
  pageSize: number
  projects: string[]
}

interface DependencyItem {
  id: string
  fromKpId: string
  fromTitle: string
  fromSerialCode: string
  toKpId: string
  toTitle: string
  toSerialCode: string
}

interface DependencyResponse {
  items: DependencyItem[]
}

interface UserForm {
  email: string
  password: string
  displayName: string
  role: Role
  realName: string
  school: string
  major: string
  className: string
  studentId: string
  phone: string
}

interface SchoolForm {
  name: string
  code: string
  region: string
  contactPerson: string
  contactPhone: string
  packageName: string
  status: SchoolStatus
  openedAt: string
  expiresAt: string
  notes: string
}

interface ClassForm {
  schoolId: string
  className: string
  major: string
  educationLevel: string
  gradeYear: string
  teacherUserId: string
  studentCapacity: number
  status: ClassStatus
}

interface KpForm {
  kpId: string
  serialCode: string
  granularity: string
  eduLevel: string
  projectName: string
  taskName: string
  title: string
  content: string
  gmpArticles: string
  sourceType: string
  difficulty: number
  pointType: string
  masteryRequirement: string
  status: string
}

const NAV_ITEMS: Array<{ key: AdminSection; label: string; icon: LucideIcon }> = [
  { key: 'overview', label: '系统总览', icon: BarChart3 },
  { key: 'users', label: '用户与权限', icon: UserCog },
  { key: 'schools', label: '学校组织', icon: Building2 },
  { key: 'projects', label: '项目任务', icon: Layers3 },
  { key: 'mindmap', label: '知识图谱', icon: Network },
  { key: 'dependencies', label: '依赖关系', icon: GitBranch },
  { key: 'questions', label: '题库管理', icon: ClipboardList },
  { key: 'rules', label: '规则配置', icon: Settings2 },
  { key: 'system', label: '运行监控', icon: Activity },
  { key: 'aiConfig', label: 'AI配置', icon: Bot },
  { key: 'exports', label: '统计导出', icon: Download },
]

const SECTION_LABELS: Record<AdminSection, string> = {
  overview: '系统总览',
  users: '用户与权限',
  schools: '学校组织',
  projects: '项目任务',
  mindmap: '知识图谱',
  dependencies: '依赖关系',
  questions: '题库管理',
  rules: '规则配置',
  system: '系统运行监控',
  aiConfig: 'AI与系统配置',
  exports: '统计导出',
  profile: '个人中心',
}

const ROLE_LABEL: Record<Role, string> = {
  student: '学生',
  teacher: '教师',
  admin: '管理员',
}

const SCHOOL_STATUS_LABEL: Record<SchoolStatus, string> = {
  active: '开通中',
  paused: '暂停',
  expired: '已到期',
}

const CLASS_STATUS_LABEL: Record<ClassStatus, string> = {
  active: '在用',
  archived: '归档',
}

const EMPTY_SCHOOL_FORM: SchoolForm = {
  name: '',
  code: '',
  region: '',
  contactPerson: '',
  contactPhone: '',
  packageName: '高校实训标准版',
  status: 'active',
  openedAt: '',
  expiresAt: '',
  notes: '',
}

const EMPTY_CLASS_FORM: ClassForm = {
  schoolId: '',
  className: '',
  major: '',
  educationLevel: '本科',
  gradeYear: '',
  teacherUserId: '',
  studentCapacity: 0,
  status: 'active',
}

const EMPTY_SYSTEM_FORM: SystemSettingsForm = {
  dashScopeApiKey: '',
  llmModel: 'qwen-plus',
  embeddingModel: 'text-embedding-v4',
  ragTopK: 8,
  ragScoreThreshold: 0.35,
  promptTemplate: '你是 GMP 智能体助学平台的教学助手，请结合知识库、学生画像和当前任务给出准确、可操作的回答。',
  knowledgeUpdatedAt: '',
}

const EMPTY_USER_FORM: UserForm = {
  email: '',
  password: '',
  displayName: '',
  role: 'student',
  realName: '',
  school: '',
  major: '',
  className: '',
  studentId: '',
  phone: '',
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

const EMPTY_KP_FORM: KpForm = {
  kpId: '',
  serialCode: '',
  granularity: '点级',
  eduLevel: '本科',
  projectName: '',
  taskName: '',
  title: '',
  content: '',
  gmpArticles: '',
  sourceType: '教材',
  difficulty: 3,
  pointType: '知识点',
  masteryRequirement: '',
  status: 'active',
}

const PANEL_STYLE: CSSProperties = {
  background: 'rgba(255,255,255,0.9)',
  border: '1px solid rgba(30,77,88,0.1)',
  borderRadius: 12,
  boxShadow: '0 18px 44px rgba(29,53,74,0.08)',
  backdropFilter: 'blur(16px)',
}

const SOFT_CARD_STYLE: CSSProperties = {
  background: 'rgba(246,251,251,0.78)',
  border: '1px solid rgba(30,77,88,0.08)',
  borderRadius: 10,
}

const TABLE_HEAD_STYLE: CSSProperties = {
  background: 'rgba(246,251,251,0.78)',
  color: '#6b7d86',
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  const data = text ? JSON.parse(text) : {}
  if (!response.ok) {
    throw new Error(data.error || `请求失败：${response.status}`)
  }
  return data as T
}

function inputClass() {
  return 'h-9 w-full rounded-lg border border-teal-900/10 bg-white/90 px-3 text-sm text-slate-800 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100'
}

function textareaClass() {
  return 'min-h-20 w-full rounded-lg border border-teal-900/10 bg-white/90 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100'
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number | string; icon: LucideIcon }) {
  return (
    <div className="p-4" style={PANEL_STYLE}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-500">{label}</span>
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-teal-50 text-teal-700">
          <Icon size={18} />
        </span>
      </div>
      <strong className="mt-2 block text-2xl text-slate-900">{value}</strong>
    </div>
  )
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
}

function includesText(...values: Array<string | number | null | undefined>) {
  const haystack = values.map(value => String(value ?? '').toLowerCase()).join(' ')
  return (keyword: string) => haystack.includes(keyword.trim().toLowerCase())
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

function statusBadgeClass(status: string) {
  if (status === 'ok' || status === '正常') return 'bg-green-100 text-green-700'
  if (status === 'error' || status === '异常') return 'bg-red-100 text-red-700'
  return 'bg-amber-100 text-amber-700'
}

function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'green' | 'orange' | 'blue' | 'red' }) {
  const classes = {
    neutral: 'bg-slate-100 text-slate-600',
    green: 'bg-green-100 text-green-700',
    orange: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
    red: 'bg-red-100 text-red-700',
  }[tone]

  return <span className={`inline-flex min-h-5 w-fit items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-bold leading-none ${classes}`}>{children}</span>
}

export default function AdminPage() {
  const router = useRouter()
  const [section, setSection] = useState<AdminSection>('overview')
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [displayName, setDisplayName] = useState('管理员')
  const [consoleFullscreen, setConsoleFullscreen] = useState(false)
  const [consoleLayout, setConsoleLayout] = useState<ConsoleLayoutConfig>(DEFAULT_CONSOLE_LAYOUT)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [profile, setProfile] = useState<ProfileResponse | null>(null)
  const [profileForm, setProfileForm] = useState<ProfileForm>(EMPTY_PROFILE_FORM)
  const [savingProfile, setSavingProfile] = useState(false)

  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [schoolsData, setSchoolsData] = useState<SchoolsResponse>({
    summary: {
      schoolCount: 0,
      activeSchoolCount: 0,
      classCount: 0,
      studentCount: 0,
      teacherCount: 0,
      onboardingCompletedCount: 0,
      pendingReviewCount: 0,
      unassignedStudentCount: 0,
    },
    schools: [],
    classes: [],
    teachers: [],
  })
  const [schoolSearch, setSchoolSearch] = useState('')
  const [selectedSchoolId, setSelectedSchoolId] = useState('')
  const [schoolForm, setSchoolForm] = useState<SchoolForm>(EMPTY_SCHOOL_FORM)
  const [editingSchoolId, setEditingSchoolId] = useState('')
  const [savingSchool, setSavingSchool] = useState(false)
  const [showSchoolModal, setShowSchoolModal] = useState(false)
  const [classForm, setClassForm] = useState<ClassForm>(EMPTY_CLASS_FORM)
  const [editingClassId, setEditingClassId] = useState('')
  const [savingClass, setSavingClass] = useState(false)
  const [showClassModal, setShowClassModal] = useState(false)
  const [teachingData, setTeachingData] = useState<TeachingOverviewResponse | null>(null)
  const [adminTeachingSearch, setAdminTeachingSearch] = useState('')
  const [adminProjectFilter, setAdminProjectFilter] = useState('all')
  const [adminTypeFilter, setAdminTypeFilter] = useState('all')
  const [adminDifficultyFilter, setAdminDifficultyFilter] = useState('all')
  const [systemData, setSystemData] = useState<SystemResponse | null>(null)
  const [systemForm, setSystemForm] = useState<SystemSettingsForm>(EMPTY_SYSTEM_FORM)
  const [savingSystem, setSavingSystem] = useState(false)
  const [usersData, setUsersData] = useState<UsersResponse>({ items: [], total: 0 })
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | Role>('all')
  const [userSearch, setUserSearch] = useState('')
  const [userForm, setUserForm] = useState<UserForm>(EMPTY_USER_FORM)
  const [editingUserId, setEditingUserId] = useState('')
  const [savingUser, setSavingUser] = useState(false)
  const [showUserModal, setShowUserModal] = useState(false)

  const [mindmapData, setMindmapData] = useState<MindmapResponse>({ items: [], total: 0, page: 1, pageSize: 50, projects: [] })
  const [allKnowledge, setAllKnowledge] = useState<KnowledgeItem[]>([])
  const [kpType, setKpType] = useState<'all' | 'knowledge' | 'skill'>('all')
  const [kpEduLevel, setKpEduLevel] = useState('all')
  const [kpProject, setKpProject] = useState('all')
  const [kpSearch, setKpSearch] = useState('')
  const [kpPage, setKpPage] = useState(1)
  const [kpForm, setKpForm] = useState<KpForm>(EMPTY_KP_FORM)
  const [editingKpId, setEditingKpId] = useState('')
  const [savingKp, setSavingKp] = useState(false)
  const [showKpModal, setShowKpModal] = useState(false)

  const [dependencies, setDependencies] = useState<DependencyItem[]>([])
  const [depFrom, setDepFrom] = useState('')
  const [depTo, setDepTo] = useState('')
  const [showDependencyModal, setShowDependencyModal] = useState(false)
  const [showAiConfigModal, setShowAiConfigModal] = useState(false)

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])

  useEffect(() => {
    const currentToken = localStorage.getItem('token')
    if (!currentToken) {
      router.replace('/login')
      return
    }
    const authToken = currentToken

    async function loadProfile() {
      try {
        const response = await fetch('/api/user/profile', {
          headers: { Authorization: `Bearer ${authToken}` },
        })

        if (response.status === 401) {
          localStorage.clear()
          router.replace('/login')
          return
        }

        const profile = await readJson<ProfileResponse>(response)
        if (profile.role !== 'admin') {
          router.replace(profile.role === 'teacher' ? '/teacher' : '/dashboard')
          return
        }

        setToken(authToken)
        setDisplayName(profile.displayName || '管理员')
        setProfile(profile)
        setProfileForm(profileToForm(profile))
      } catch (err) {
        setError(err instanceof Error ? err.message : '管理员信息读取失败')
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [router])

  const loadOverview = useCallback(async () => {
    if (!token) return
    const response = await fetch('/api/admin/overview', { headers })
    setOverview(await readJson<OverviewData>(response))
  }, [headers, token])

  const loadSchools = useCallback(async () => {
    if (!token) return
    const params = new URLSearchParams({ search: schoolSearch })
    const response = await fetch(`/api/admin/schools?${params}`, { headers })
    const data = await readJson<SchoolsResponse>(response)
    setSchoolsData(data)
    setSelectedSchoolId(current => current || data.schools[0]?.schoolId || '')
    setClassForm(current => current.schoolId ? current : { ...current, schoolId: data.schools[0]?.schoolId || '' })
  }, [headers, schoolSearch, token])

  const loadTeachingOverview = useCallback(async () => {
    if (!token) return
    const response = await fetch('/api/teacher/overview', { headers })
    setTeachingData(await readJson<TeachingOverviewResponse>(response))
  }, [headers, token])

  const loadSystem = useCallback(async () => {
    if (!token) return
    const response = await fetch('/api/admin/system', { headers })
    const data = await readJson<SystemResponse>(response)
    setSystemData(data)
    setSystemForm({
      dashScopeApiKey: '',
      llmModel: data.settings.llmModel,
      embeddingModel: data.settings.embeddingModel,
      ragTopK: data.settings.ragTopK,
      ragScoreThreshold: data.settings.ragScoreThreshold,
      promptTemplate: data.settings.promptTemplate,
      knowledgeUpdatedAt: data.settings.knowledgeUpdatedAt,
    })
  }, [headers, token])

  const loadUsers = useCallback(async () => {
    if (!token) return
    const params = new URLSearchParams({ role: userRoleFilter, search: userSearch })
    const response = await fetch(`/api/admin/users?${params}`, { headers })
    setUsersData(await readJson<UsersResponse>(response))
  }, [headers, token, userRoleFilter, userSearch])

  const loadMindmap = useCallback(async () => {
    if (!token) return
    const params = new URLSearchParams({
      type: kpType,
      eduLevel: kpEduLevel,
      project: kpProject,
      search: kpSearch,
      page: String(kpPage),
      pageSize: '50',
    })
    const response = await fetch(`/api/admin/mindmap?${params}`, { headers })
    setMindmapData(await readJson<MindmapResponse>(response))
  }, [headers, kpEduLevel, kpPage, kpProject, kpSearch, kpType, token])

  const loadKnowledgeOptions = useCallback(async () => {
    if (!token) return
    const response = await fetch('/api/admin/mindmap?pageSize=1000', { headers })
    const data = await readJson<MindmapResponse>(response)
    setAllKnowledge(data.items)
  }, [headers, token])

  const loadDependencies = useCallback(async () => {
    if (!token) return
    const response = await fetch('/api/admin/mindmap/dependencies', { headers })
    const data = await readJson<DependencyResponse>(response)
    setDependencies(data.items)
  }, [headers, token])

  const loadOwnProfile = useCallback(async () => {
    if (!token) return
    const response = await fetch('/api/user/profile', { headers })
    const data = await readJson<ProfileResponse>(response)
    setProfile(data)
    setProfileForm(profileToForm(data))
    setDisplayName(data.displayName || '管理员')
  }, [headers, token])

  useEffect(() => {
    if (!token) return
    if (section === 'overview') loadOverview().catch(err => setError(err.message))
    if (section === 'schools') loadSchools().catch(err => setError(err.message))
    if (['projects', 'questions', 'rules', 'exports'].includes(section)) {
      loadTeachingOverview().catch(err => setError(err.message))
    }
    if (section === 'users') loadUsers().catch(err => setError(err.message))
    if (section === 'mindmap') {
      loadMindmap().catch(err => setError(err.message))
      loadKnowledgeOptions().catch(err => setError(err.message))
    }
    if (section === 'dependencies') {
      loadKnowledgeOptions().catch(err => setError(err.message))
      loadDependencies().catch(err => setError(err.message))
    }
    if (section === 'system' || section === 'aiConfig') loadSystem().catch(err => setError(err.message))
    if (section === 'profile') loadOwnProfile().catch(err => setError(err.message))
  }, [loadDependencies, loadKnowledgeOptions, loadMindmap, loadOverview, loadOwnProfile, loadSchools, loadSystem, loadTeachingOverview, loadUsers, section, token])

  function logout() {
    localStorage.clear()
    router.push('/login')
  }

  function openProfile() {
    setSection('profile')
    setNotice('')
    setError('')
  }

  async function saveProfile() {
    setSavingProfile(true)
    setError('')
    setNotice('')

    try {
      const response = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm),
      })

      await readJson(response)
      await loadOwnProfile()
      localStorage.setItem('displayName', profileForm.displayName)
      setNotice('个人资料已保存')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存个人资料失败')
    } finally {
      setSavingProfile(false)
    }
  }

  async function saveAvatar(avatarUrl: string) {
    const response = await fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatarUrl }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || '头像保存失败')
    await loadOwnProfile()
    localStorage.setItem('avatarUrl', avatarUrl)
    window.dispatchEvent(new Event('profile-avatar-updated'))
    setNotice('头像已更新')
  }

  function openSection(nextSection: AdminSection) {
    setSection(nextSection)
    setNotice('')
    if (['projects', 'questions', 'rules', 'exports'].includes(nextSection)) {
      setAdminTeachingSearch('')
      setAdminProjectFilter('all')
      setAdminTypeFilter('all')
      setAdminDifficultyFilter('all')
    }
  }

  async function saveSystemSettings(nextForm = systemForm, options?: { markKnowledgeUpdated?: boolean; clearKey?: boolean }) {
    setSavingSystem(true)
    setError('')
    setNotice('')

    try {
      const body = {
        ...nextForm,
        clearDashScopeApiKey: Boolean(options?.clearKey),
        knowledgeUpdatedAt: options?.markKnowledgeUpdated ? new Date().toISOString() : nextForm.knowledgeUpdatedAt,
      }
      const response = await fetch('/api/admin/system', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await readJson<SystemResponse>(response)
      setSystemData(data)
      setSystemForm({
        dashScopeApiKey: '',
        llmModel: data.settings.llmModel,
        embeddingModel: data.settings.embeddingModel,
        ragTopK: data.settings.ragTopK,
        ragScoreThreshold: data.settings.ragScoreThreshold,
        promptTemplate: data.settings.promptTemplate,
        knowledgeUpdatedAt: data.settings.knowledgeUpdatedAt,
      })
      setNotice(options?.markKnowledgeUpdated ? '知识库更新时间已记录' : options?.clearKey ? 'DashScope API Key 已清除' : 'AI与系统配置已保存')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存系统配置失败')
    } finally {
      setSavingSystem(false)
    }
  }

  function resetSchoolForm() {
    setEditingSchoolId('')
    setSchoolForm(EMPTY_SCHOOL_FORM)
  }

  function editSchool(school: SchoolItem) {
    setEditingSchoolId(school.schoolId)
    setSelectedSchoolId(school.schoolId)
    setSchoolForm({
      name: school.name,
      code: school.code,
      region: school.region,
      contactPerson: school.contactPerson,
      contactPhone: school.contactPhone,
      packageName: school.packageName,
      status: school.status,
      openedAt: school.openedAt,
      expiresAt: school.expiresAt,
      notes: school.notes,
    })
    setShowSchoolModal(true)
  }

  async function saveSchool() {
    setSavingSchool(true)
    setError('')
    setNotice('')

    try {
      const response = await fetch('/api/admin/schools', {
        method: editingSchoolId ? 'PUT' : 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'school', schoolId: editingSchoolId, ...schoolForm }),
      })
      const data = await readJson<{ schoolId?: string }>(response)
      resetSchoolForm()
      setShowSchoolModal(false)
      await loadSchools()
      await loadOverview()
      if (data.schoolId) setSelectedSchoolId(data.schoolId)
      setNotice('学校档案已保存')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存学校档案失败')
    } finally {
      setSavingSchool(false)
    }
  }

  async function deleteSchool(school: SchoolItem) {
    if (!confirm(`确定删除“${school.name}”学校档案吗？已有用户关联时不会删除。`)) return
    setError('')
    setNotice('')

    try {
      const response = await fetch(`/api/admin/schools?entity=school&id=${school.schoolId}`, {
        method: 'DELETE',
        headers,
      })
      await readJson(response)
      if (selectedSchoolId === school.schoolId) setSelectedSchoolId('')
      await loadSchools()
      await loadOverview()
      setNotice('学校档案已删除')
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除学校档案失败')
    }
  }

  function resetClassForm(nextSchoolId = selectedSchoolId) {
    setEditingClassId('')
    setClassForm({ ...EMPTY_CLASS_FORM, schoolId: nextSchoolId })
  }

  function editClass(item: SchoolClassItem) {
    setEditingClassId(item.classId)
    setSelectedSchoolId(item.schoolId)
    setClassForm({
      schoolId: item.schoolId,
      className: item.className,
      major: item.major,
      educationLevel: item.educationLevel,
      gradeYear: item.gradeYear,
      teacherUserId: item.teacherUserId,
      studentCapacity: item.studentCapacity,
      status: item.status,
    })
    setShowClassModal(true)
  }

  async function saveClass() {
    setSavingClass(true)
    setError('')
    setNotice('')

    try {
      const response = await fetch('/api/admin/schools', {
        method: editingClassId ? 'PUT' : 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'class', classId: editingClassId, ...classForm }),
      })
      await readJson(response)
      resetClassForm(classForm.schoolId)
      setShowClassModal(false)
      await loadSchools()
      await loadOverview()
      setNotice('班级信息已保存')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存班级信息失败')
    } finally {
      setSavingClass(false)
    }
  }

  async function deleteClass(item: SchoolClassItem) {
    if (!confirm(`确定删除“${item.className}”班级档案吗？已有学生关联时不会删除。`)) return
    setError('')
    setNotice('')

    try {
      const response = await fetch(`/api/admin/schools?entity=class&id=${item.classId}`, {
        method: 'DELETE',
        headers,
      })
      await readJson(response)
      await loadSchools()
      await loadOverview()
      setNotice('班级档案已删除')
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除班级档案失败')
    }
  }

  function resetUserForm() {
    setEditingUserId('')
    setUserForm(EMPTY_USER_FORM)
  }

  function editUser(user: AdminUser) {
    setEditingUserId(user.userId)
    setUserForm({
      email: user.email,
      password: '',
      displayName: user.displayName,
      role: user.role,
      realName: user.realName || '',
      school: user.school || '',
      major: user.major || '',
      className: user.className || '',
      studentId: user.studentId || '',
      phone: user.phone || '',
    })
    setShowUserModal(true)
  }

  async function saveUser() {
    setSavingUser(true)
    setError('')

    try {
      const body: Record<string, unknown> = { ...userForm }
      if (editingUserId) body.userId = editingUserId
      if (editingUserId && !userForm.password) delete body.password

      const response = await fetch('/api/admin/users', {
        method: editingUserId ? 'PUT' : 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      await readJson(response)
      resetUserForm()
      setShowUserModal(false)
      await loadUsers()
      await loadOverview()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存用户失败')
    } finally {
      setSavingUser(false)
    }
  }

  async function deleteUser(userId: string) {
    if (!confirm('确定删除该用户吗？')) return
    setError('')

    try {
      const response = await fetch(`/api/admin/users?userId=${userId}`, {
        method: 'DELETE',
        headers,
      })

      await readJson(response)
      await loadUsers()
      await loadOverview()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除用户失败')
    }
  }

  function resetKpForm() {
    setEditingKpId('')
    setKpForm(EMPTY_KP_FORM)
  }

  function editKp(item: KnowledgeItem) {
    setEditingKpId(item.kpId)
    setKpForm({
      kpId: item.kpId,
      serialCode: item.serialCode,
      granularity: item.granularity,
      eduLevel: item.eduLevel,
      projectName: item.projectName,
      taskName: item.taskName,
      title: item.title,
      content: item.content,
      gmpArticles: item.gmpArticles,
      sourceType: item.sourceType,
      difficulty: item.difficulty,
      pointType: item.pointType,
      masteryRequirement: item.masteryRequirement,
      status: item.status,
    })
    setShowKpModal(true)
  }

  async function saveKp() {
    setSavingKp(true)
    setError('')

    try {
      const response = await fetch('/api/admin/mindmap', {
        method: editingKpId ? 'PUT' : 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(kpForm),
      })

      await readJson(response)
      resetKpForm()
      setShowKpModal(false)
      await loadMindmap()
      await loadKnowledgeOptions()
      await loadOverview()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存知识点失败')
    } finally {
      setSavingKp(false)
    }
  }

  async function deleteKp(kpId: string) {
    if (!confirm('确定删除该知识点或技能点吗？')) return
    setError('')

    try {
      const response = await fetch(`/api/admin/mindmap?kpId=${kpId}`, {
        method: 'DELETE',
        headers,
      })

      await readJson(response)
      await loadMindmap()
      await loadKnowledgeOptions()
      await loadOverview()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除知识点失败')
    }
  }

  async function createDependency() {
    setError('')

    try {
      const response = await fetch('/api/admin/mindmap/dependencies', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromKpId: depFrom, toKpId: depTo }),
      })

      await readJson(response)
      setDepFrom('')
      setDepTo('')
      setShowDependencyModal(false)
      await loadDependencies()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存依赖关系失败')
    }
  }

  async function deleteDependency(dep: DependencyItem) {
    if (!confirm('确定删除该依赖关系吗？')) return
    setError('')

    try {
      const params = new URLSearchParams({ fromKpId: dep.fromKpId, toKpId: dep.toKpId })
      const response = await fetch(`/api/admin/mindmap/dependencies?${params}`, {
        method: 'DELETE',
        headers,
      })

      await readJson(response)
      await loadDependencies()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除依赖关系失败')
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f6fbfb]">
        <div className="flex items-center gap-2 text-sm font-bold text-teal-700">
          <LoaderCircle size={18} className="animate-spin" />
          正在进入管理员端...
        </div>
      </div>
    )
  }

  const selectedSchool = schoolsData.schools.find(school => school.schoolId === selectedSchoolId) ?? schoolsData.schools[0] ?? null
  const selectedSchoolClasses = selectedSchool
    ? schoolsData.classes.filter(item => item.schoolId === selectedSchool.schoolId)
    : schoolsData.classes
  const schoolStats = [
    { label: '学校', value: schoolsData.summary.schoolCount, icon: Building2 },
    { label: '开通中', value: schoolsData.summary.activeSchoolCount, icon: ShieldCheck },
    { label: '班级', value: schoolsData.summary.classCount, icon: Layers },
    { label: '学生', value: schoolsData.summary.studentCount, icon: UsersRound },
    { label: '教师', value: schoolsData.summary.teacherCount, icon: UserCog },
    { label: '待复核', value: schoolsData.summary.pendingReviewCount, icon: GitBranch },
  ]

  const teachingFilterOptions = teachingData ? {
    projects: unique(teachingData.projectTasks.map(project => project.projectName).concat(teachingData.questionItems.map(item => item.projectName))),
    questionTypes: unique(teachingData.questionItems.map(item => item.questionType)),
    difficulties: unique(teachingData.questionItems.map(item => item.difficulty)),
  } : { projects: [], questionTypes: [], difficulties: [] }

  const filteredAdminQuestions = teachingData ? teachingData.questionItems.filter(item => {
    const keyword = adminTeachingSearch.trim().toLowerCase()
    if (adminProjectFilter !== 'all' && item.projectName !== adminProjectFilter) return false
    if (adminDifficultyFilter !== 'all' && item.difficulty !== adminDifficultyFilter) return false
    if (adminTypeFilter !== 'all' && item.questionType !== adminTypeFilter) return false
    if (keyword && !includesText(item.stem, item.projectName, item.taskName, item.knowledgeTitle)(keyword)) return false
    return true
  }) : []

  const stats = overview ? [
    { label: '总用户', value: overview.summary.totalUsers, icon: UsersRound },
    { label: '学校', value: overview.summary.orgCount, icon: Building2 },
    { label: '教师', value: overview.summary.teacherCount, icon: ShieldCheck },
    { label: '学生', value: overview.summary.studentCount, icon: UserCog },
    { label: '题库', value: overview.summary.questionCount, icon: Database },
    { label: '知识点', value: overview.summary.knowledgeCount, icon: Network },
    { label: '技能点', value: overview.summary.skillCount, icon: Layers },
    { label: '答题记录', value: overview.summary.answerCount, icon: BarChart3 },
    { label: '待复核', value: overview.summary.pendingReviewCount, icon: GitBranch },
  ] : []

  const headerSearchItems = [
    { category: '页面导航', label: '系统总览', desc: '查看用户、题库、知识图谱和系统运行统计', action: () => openSection('overview') },
    { category: '页面导航', label: '用户与权限', desc: '管理学生、教师和管理员账号', action: () => openSection('users') },
    { category: '页面导航', label: '学校组织', desc: '管理学校档案、班级、专业和开通状态', action: () => openSection('schools') },
    { category: '教学管理', label: '项目任务', desc: '查看项目、任务和题库覆盖情况', action: () => openSection('projects') },
    { category: '页面导航', label: '知识图谱', desc: '维护知识点、技能点和 GMP 条款映射', action: () => openSection('mindmap') },
    { category: '页面导航', label: '依赖关系', desc: '维护知识点之间的前后置关系', action: () => openSection('dependencies') },
    { category: '教学管理', label: '题库管理', desc: '查看题型、难度、项目归属和知识点', action: () => openSection('questions') },
    { category: '教学管理', label: '规则配置', desc: '查看前测和个性化方案规则范围', action: () => openSection('rules') },
    { category: '系统', label: '运行监控', desc: '查看服务、接口、AI、数据库和存储状态', action: () => openSection('system') },
    { category: '系统', label: 'AI配置', desc: '配置 DashScope、模型、Embedding、RAG 和提示词', action: () => openSection('aiConfig') },
    { category: '教学管理', label: '统计导出', desc: '导出学生学习状态和题库统计', action: () => openSection('exports') },
    { category: '账号', label: '个人中心', desc: '维护管理员个人资料和账号安全设置', action: openProfile },
  ]

  const headerNotifications = [
    { id: 'admin-users', icon: '户', title: '用户规模', desc: overview ? `系统当前共有 ${overview.summary.totalUsers} 个用户账号。` : '系统总览加载后显示用户统计。', time: '刚刚', read: false },
    { id: 'admin-schools', icon: '校', title: '学校组织', desc: schoolsData.summary.schoolCount ? `当前已维护 ${schoolsData.summary.schoolCount} 所学校、${schoolsData.summary.classCount} 个班级。` : '学校组织页可维护高校档案和班级。', time: '今日', read: schoolsData.summary.schoolCount === 0 },
    { id: 'admin-teachers', icon: '师', title: '教师账号', desc: overview ? `当前教师账号 ${overview.summary.teacherCount} 个，管理员 ${overview.summary.adminCount} 个。` : '可在用户与权限中管理教师和管理员。', time: '今日', read: true },
    { id: 'admin-db', icon: '库', title: '数据库状态', desc: overview?.systemStatus.database ? `数据库状态：${overview.systemStatus.database}` : '数据库状态可在系统配置中查看。', time: '本周', read: true },
  ]

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

  function renderAdminModal(title: string, desc: string, onClose: () => void, children: ReactNode, width = 'min(720px, 94vw)') {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-5" onClick={onClose}>
        <div className="max-h-[88vh] overflow-auto rounded-xl border border-teal-900/10 bg-white shadow-2xl shadow-slate-950/25" style={{ width }} onClick={event => event.stopPropagation()}>
          <div className="flex items-center justify-between gap-4 border-b border-teal-900/10 px-5 py-4">
            <div>
              <h3 className="m-0 text-base font-black text-slate-900">{title}</h3>
              <p className="m-0 mt-1 text-xs leading-5 text-slate-500">{desc}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="关闭弹窗" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50">
              <X size={16} />
            </button>
          </div>
          <div className="grid gap-3 p-5">
            {children}
          </div>
        </div>
      </div>
    )
  }

  function renderSchoolForm() {
    return (
      <>
        <input className={inputClass()} value={schoolForm.name} onChange={event => setSchoolForm({ ...schoolForm, name: event.target.value })} placeholder="学校名称" />
        <div className="grid grid-cols-2 gap-2">
          <input className={inputClass()} value={schoolForm.code} onChange={event => setSchoolForm({ ...schoolForm, code: event.target.value })} placeholder="学校代码" />
          <input className={inputClass()} value={schoolForm.region} onChange={event => setSchoolForm({ ...schoolForm, region: event.target.value })} placeholder="地区" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className={inputClass()} value={schoolForm.contactPerson} onChange={event => setSchoolForm({ ...schoolForm, contactPerson: event.target.value })} placeholder="联系人" />
          <input className={inputClass()} value={schoolForm.contactPhone} onChange={event => setSchoolForm({ ...schoolForm, contactPhone: event.target.value })} placeholder="联系电话" />
        </div>
        <select className={inputClass()} value={schoolForm.status} onChange={event => setSchoolForm({ ...schoolForm, status: event.target.value as SchoolStatus })}>
          <option value="active">开通中</option>
          <option value="paused">暂停</option>
          <option value="expired">已到期</option>
        </select>
        <input className={inputClass()} value={schoolForm.packageName} onChange={event => setSchoolForm({ ...schoolForm, packageName: event.target.value })} placeholder="机构套餐" />
        <div className="grid grid-cols-2 gap-2">
          <input className={inputClass()} type="date" value={schoolForm.openedAt} onChange={event => setSchoolForm({ ...schoolForm, openedAt: event.target.value })} />
          <input className={inputClass()} type="date" value={schoolForm.expiresAt} onChange={event => setSchoolForm({ ...schoolForm, expiresAt: event.target.value })} />
        </div>
        <textarea className={textareaClass()} value={schoolForm.notes} onChange={event => setSchoolForm({ ...schoolForm, notes: event.target.value })} placeholder="备注" />
        <button onClick={saveSchool} disabled={savingSchool} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50">
          {savingSchool ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}
          保存学校
        </button>
      </>
    )
  }

  function renderClassForm() {
    return (
      <>
        <select className={inputClass()} value={classForm.schoolId} onChange={event => { setSelectedSchoolId(event.target.value); setClassForm({ ...classForm, schoolId: event.target.value }) }}>
          <option value="">选择学校</option>
          {schoolsData.schools.map(school => <option key={school.schoolId} value={school.schoolId}>{school.name}</option>)}
        </select>
        <input className={inputClass()} value={classForm.className} onChange={event => setClassForm({ ...classForm, className: event.target.value })} placeholder="班级名称" />
        <input className={inputClass()} value={classForm.major} onChange={event => setClassForm({ ...classForm, major: event.target.value })} placeholder="专业方向" />
        <div className="grid grid-cols-2 gap-2">
          <select className={inputClass()} value={classForm.educationLevel} onChange={event => setClassForm({ ...classForm, educationLevel: event.target.value })}>
            <option value="专科">专科</option>
            <option value="本科">本科</option>
          </select>
          <input className={inputClass()} value={classForm.gradeYear} onChange={event => setClassForm({ ...classForm, gradeYear: event.target.value })} placeholder="年级，如 2026" />
        </div>
        <select className={inputClass()} value={classForm.teacherUserId} onChange={event => setClassForm({ ...classForm, teacherUserId: event.target.value })}>
          <option value="">选择班主任/教师</option>
          {schoolsData.teachers.map(teacher => <option key={teacher.userId} value={teacher.userId}>{teacher.displayName} {teacher.school ? `· ${teacher.school}` : ''}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input className={inputClass()} type="number" min={0} value={classForm.studentCapacity} onChange={event => setClassForm({ ...classForm, studentCapacity: Number(event.target.value) })} placeholder="容量" />
          <select className={inputClass()} value={classForm.status} onChange={event => setClassForm({ ...classForm, status: event.target.value as ClassStatus })}>
            <option value="active">在用</option>
            <option value="archived">归档</option>
          </select>
        </div>
        <button onClick={saveClass} disabled={savingClass || schoolsData.schools.length === 0} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50">
          {savingClass ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />}
          保存班级
        </button>
      </>
    )
  }

  function renderUserForm() {
    return (
      <>
        <input className={inputClass()} value={userForm.displayName} onChange={event => setUserForm({ ...userForm, displayName: event.target.value })} placeholder="显示名称" />
        <input className={inputClass()} value={userForm.email} onChange={event => setUserForm({ ...userForm, email: event.target.value })} placeholder="邮箱" />
        <input className={inputClass()} type="password" value={userForm.password} onChange={event => setUserForm({ ...userForm, password: event.target.value })} placeholder={editingUserId ? '留空表示不改密码' : '初始密码'} />
        <select className={inputClass()} value={userForm.role} onChange={event => setUserForm({ ...userForm, role: event.target.value as Role })}>
          <option value="student">学生</option>
          <option value="teacher">教师</option>
          <option value="admin">管理员</option>
        </select>
        <input className={inputClass()} value={userForm.realName} onChange={event => setUserForm({ ...userForm, realName: event.target.value })} placeholder="真实姓名" />
        <input className={inputClass()} value={userForm.school} onChange={event => setUserForm({ ...userForm, school: event.target.value })} placeholder="学校/机构" />
        <div className="grid grid-cols-2 gap-2">
          <input className={inputClass()} value={userForm.major} onChange={event => setUserForm({ ...userForm, major: event.target.value })} placeholder="专业" />
          <input className={inputClass()} value={userForm.className} onChange={event => setUserForm({ ...userForm, className: event.target.value })} placeholder="班级" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className={inputClass()} value={userForm.studentId} onChange={event => setUserForm({ ...userForm, studentId: event.target.value })} placeholder="学号/工号" />
          <input className={inputClass()} value={userForm.phone} onChange={event => setUserForm({ ...userForm, phone: event.target.value })} placeholder="手机号" />
        </div>
        <button onClick={saveUser} disabled={savingUser} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50">
          {savingUser ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}
          保存用户
        </button>
      </>
    )
  }

  function renderKpForm() {
    return (
      <>
        <input className={inputClass()} value={kpForm.serialCode} onChange={event => setKpForm({ ...kpForm, serialCode: event.target.value })} placeholder="编号，如 K001" />
        <input className={inputClass()} value={kpForm.title} onChange={event => setKpForm({ ...kpForm, title: event.target.value })} placeholder="名称" />
        <div className="grid grid-cols-2 gap-2">
          <select className={inputClass()} value={kpForm.pointType} onChange={event => setKpForm({ ...kpForm, pointType: event.target.value })}>
            <option value="知识点">知识点</option>
            <option value="技能点">技能点</option>
          </select>
          <select className={inputClass()} value={kpForm.eduLevel} onChange={event => setKpForm({ ...kpForm, eduLevel: event.target.value })}>
            <option value="专科">专科</option>
            <option value="本科">本科</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select className={inputClass()} value={kpForm.granularity} onChange={event => setKpForm({ ...kpForm, granularity: event.target.value })}>
            <option value="项目级">项目级</option>
            <option value="任务级">任务级</option>
            <option value="点级">点级</option>
          </select>
          <input className={inputClass()} type="number" min={1} max={5} value={kpForm.difficulty} onChange={event => setKpForm({ ...kpForm, difficulty: Number(event.target.value) })} placeholder="难度" />
        </div>
        <input className={inputClass()} value={kpForm.projectName} onChange={event => setKpForm({ ...kpForm, projectName: event.target.value })} placeholder="所属项目" />
        <input className={inputClass()} value={kpForm.taskName} onChange={event => setKpForm({ ...kpForm, taskName: event.target.value })} placeholder="所属任务" />
        <input className={inputClass()} value={kpForm.gmpArticles} onChange={event => setKpForm({ ...kpForm, gmpArticles: event.target.value })} placeholder="GMP条款" />
        <textarea className={textareaClass()} value={kpForm.content} onChange={event => setKpForm({ ...kpForm, content: event.target.value })} placeholder="内容说明" />
        <input className={inputClass()} value={kpForm.masteryRequirement} onChange={event => setKpForm({ ...kpForm, masteryRequirement: event.target.value })} placeholder="掌握要求" />
        <button onClick={saveKp} disabled={savingKp} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50">
          {savingKp ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />}
          保存知识点
        </button>
      </>
    )
  }

  function renderDependencyForm() {
    return (
      <>
        <select value={depFrom} onChange={event => setDepFrom(event.target.value)} className={inputClass()}>
          <option value="">选择前置知识点</option>
          {allKnowledge.map(item => <option key={item.kpId} value={item.kpId}>{item.serialCode ? `${item.serialCode} - ` : ''}{item.title}</option>)}
        </select>
        <select value={depTo} onChange={event => setDepTo(event.target.value)} className={inputClass()}>
          <option value="">选择后续知识点</option>
          {allKnowledge.map(item => <option key={item.kpId} value={item.kpId}>{item.serialCode ? `${item.serialCode} - ` : ''}{item.title}</option>)}
        </select>
        <button onClick={createDependency} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800">
          <Plus size={15} />
          新增依赖
        </button>
      </>
    )
  }

  function renderAiConfigForm() {
    return (
      <>
        <div className="grid gap-3 rounded-lg border border-teal-900/10 bg-slate-50/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="m-0 text-sm font-black text-slate-900">DashScope API Key</h4>
            <Pill tone={systemData?.settings.hasDashScopeApiKey ? 'green' : 'orange'}>
              {systemData?.settings.hasDashScopeApiKey ? `已配置 ${systemData.settings.dashScopeApiKeyMasked}` : '未配置'}
            </Pill>
          </div>
          <input className={inputClass()} type="password" value={systemForm.dashScopeApiKey} onChange={event => setSystemForm({ ...systemForm, dashScopeApiKey: event.target.value })} placeholder="输入新的 DashScope API Key，留空则保持原值" />
          <button onClick={() => saveSystemSettings(systemForm, { clearKey: true })} disabled={savingSystem || !systemData?.settings.hasDashScopeApiKey} className="inline-flex h-10 w-fit items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 text-sm font-bold text-red-700 hover:bg-red-100 disabled:opacity-50">
            清除 Key
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-xs font-bold text-slate-500">
            大模型配置
            <input className={inputClass()} value={systemForm.llmModel} onChange={event => setSystemForm({ ...systemForm, llmModel: event.target.value })} />
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-500">
            Embedding 模型配置
            <input className={inputClass()} value={systemForm.embeddingModel} onChange={event => setSystemForm({ ...systemForm, embeddingModel: event.target.value })} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-xs font-bold text-slate-500">
            返回条数
            <input className={inputClass()} type="number" min={1} max={30} value={systemForm.ragTopK} onChange={event => setSystemForm({ ...systemForm, ragTopK: Number(event.target.value) })} />
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-500">
            相似度阈值
            <input className={inputClass()} type="number" min={0} max={1} step={0.01} value={systemForm.ragScoreThreshold} onChange={event => setSystemForm({ ...systemForm, ragScoreThreshold: Number(event.target.value) })} />
          </label>
        </div>
        <label className="grid gap-1 text-xs font-bold text-slate-500">
          提示词模板
          <textarea className={`${textareaClass()} min-h-40`} value={systemForm.promptTemplate} onChange={event => setSystemForm({ ...systemForm, promptTemplate: event.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => saveSystemSettings(systemForm, { markKnowledgeUpdated: true })} disabled={savingSystem} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-teal-200 bg-teal-50 px-4 text-sm font-bold text-teal-700 hover:bg-teal-100 disabled:opacity-50">
            {savingSystem ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            标记知识库已更新
          </button>
          <button onClick={() => saveSystemSettings()} disabled={savingSystem} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50">
            {savingSystem ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}
            保存全部配置
          </button>
        </div>
      </>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: shellBg, backgroundSize: consoleLayout.darkMode ? undefined : '32px 32px, 32px 32px, auto', color: bodyText }}>
      <div className="grid min-h-screen" style={{ gridTemplateColumns: showSidebar ? `${sidebarWidth}px minmax(0,1fr)` : 'minmax(0,1fr)' }}>
        {showSidebar && (
        <aside className="sticky top-0 flex h-screen flex-col" style={{ background: sidebarBg, color: sidebarText, borderRight: `1px solid ${surfaceBorder}`, boxShadow: sidebarDark ? '18px 0 40px rgba(6,24,36,0.18)' : '12px 0 30px rgba(29,53,74,0.08)', transition: 'width 0.2s, background 0.2s' }}>
          {consoleLayout.toggles.showLogo && (
          <div className="flex h-16 items-center gap-3 border-b px-5" style={{ justifyContent: sidebarCollapsed ? 'center' : 'flex-start', borderColor: surfaceBorder, paddingLeft: sidebarCollapsed ? 12 : 20, paddingRight: sidebarCollapsed ? 12 : 20 }}>
            <div className="grid h-9 w-9 place-items-center text-sm font-black text-white shadow-lg shadow-teal-900/20" style={{ borderRadius: 10, background: `linear-gradient(135deg,${themeColor},#35818a)` }}>A</div>
            {!sidebarCollapsed && (
              <div>
                <p className="m-0 text-sm font-extrabold" style={{ color: sidebarDark ? '#fff' : bodyText }}>管理后台</p>
                <p className="m-0 text-xs" style={{ color: sidebarText }}>GMP 助学平台</p>
              </div>
            )}
          </div>
          )}

          <nav className="grid gap-1 p-3">
            {NAV_ITEMS.map(item => {
              const Icon = item.icon
              const active = item.key === section
              return (
                <button
                  key={item.key}
                  title={sidebarCollapsed ? item.label : undefined}
                  onClick={() => openSection(item.key)}
                  className="flex items-center text-left text-sm transition"
                  style={{
                    justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                    gap: sidebarCollapsed ? 0 : 12,
                    borderRadius: 8,
                    padding: sidebarCollapsed ? '10px 0' : '10px 12px',
                    background: active ? (sidebarDark ? 'rgba(29,111,120,0.34)' : softThemeBg) : 'transparent',
                    color: active ? sidebarActiveText : sidebarText,
                    fontWeight: active ? 800 : 500,
                    border: active ? `1px solid ${sidebarDark ? 'rgba(255,255,255,0.12)' : `${themeColor}2e`}` : '1px solid transparent',
                    cursor: 'pointer',
                    boxShadow: active && sidebarDark ? 'inset 3px 0 0 rgba(255,255,255,0.8)' : undefined,
                  }}
                >
                  <Icon size={16} />
                  {!sidebarCollapsed && item.label}
                </button>
              )
            })}
          </nav>

          <div className="mt-auto border-t p-3" style={{ borderColor: surfaceBorder }}>
            <div className="p-3" style={{ borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', gap: 9, background: sidebarDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)', border: `1px solid ${sidebarDark ? 'rgba(255,255,255,0.08)' : 'rgba(30,77,88,0.08)'}` }}>
              <div style={{ position: 'relative', overflow: 'hidden', width: 30, height: 30, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', background: `linear-gradient(135deg,${themeColor},#35818a)`, color: '#fff', fontSize: 11, fontWeight: 700 }}>
                {profile?.avatarUrl ? <Image src={profile.avatarUrl} alt={`${displayName}的头像`} fill unoptimized style={{ objectFit: 'cover' }} /> : displayName[0]}
              </div>
              {!sidebarCollapsed && (
                <div>
                  <strong className="block text-sm" style={{ color: sidebarDark ? '#fff' : bodyText }}>{displayName}</strong>
                  <span className="text-xs" style={{ color: sidebarText }}>系统管理员</span>
                </div>
              )}
            </div>
            <button
              onClick={logout}
              className="mt-3 flex w-full items-center justify-center gap-2 px-3 py-2 text-sm"
              style={{ borderRadius: 8, border: `1px solid ${surfaceBorder}`, color: sidebarText, background: sidebarDark ? 'rgba(255,255,255,0.04)' : 'transparent', cursor: 'pointer' }}
            >
              <LogOut size={15} />
              {!sidebarCollapsed && '退出登录'}
            </button>
          </div>
        </aside>
        )}

        <main className="grid content-start p-5" style={{ minWidth: 0, gap: topMenuMode && !consoleFullscreen ? 14 : 16 }}>
          <header className={topMenuMode && !consoleFullscreen ? 'flex items-center' : 'flex items-start justify-between gap-4'} style={topMenuMode && !consoleFullscreen
            ? { position: consoleLayout.toggles.fixedHeader ? 'sticky' : 'relative', top: 0, zIndex: 30, minHeight: 58, gap: 14, padding: '0 18px', margin: '-20px -20px 0', background: headerDark ? 'rgba(15,23,42,0.97)' : 'rgba(255,255,255,0.88)', borderBottom: `1px solid ${surfaceBorder}`, boxShadow: '0 12px 28px rgba(29,53,74,0.07)', backdropFilter: 'blur(18px)' }
            : { position: consoleLayout.toggles.fixedHeader ? 'sticky' : 'relative', top: 0, zIndex: 30, padding: 16, margin: -12, marginBottom: 4, borderRadius: 12, background: headerDark ? 'rgba(15,23,42,0.96)' : 'rgba(255,255,255,0.86)', border: `1px solid ${surfaceBorder}`, boxShadow: '0 16px 38px rgba(29,53,74,0.08)', backdropFilter: 'blur(16px)' }}>
            {topMenuMode && !consoleFullscreen ? (
              <>
              {consoleLayout.toggles.showLogo && (
                <div className="flex shrink-0 items-center gap-2 text-sm font-black" style={{ color: headerDark ? '#f4f4f5' : bodyText }}>
                  <span className="grid h-7 w-7 place-items-center text-white" style={{ borderRadius: consoleRadius, background: `linear-gradient(135deg, ${themeColor}, #45a29e)` }}>A</span>
                  管理后台
                </div>
              )}
              <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
                {NAV_ITEMS.map(item => {
                  const Icon = item.icon
                  const active = item.key === section
                  return (
                    <button key={item.key} onClick={() => openSection(item.key)} className="inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-2 text-sm" style={{ borderRadius: consoleRadius, border: 'none', background: active ? softThemeBg : 'transparent', color: active ? themeColor : (headerDark ? '#bfcbd9' : mutedText), cursor: 'pointer', fontWeight: active ? 800 : 500 }}>
                      <Icon size={14} />
                      {item.label}
                    </button>
                  )
                })}
              </nav>
              </>
            ) : (
              <div>
                <p className="m-0 text-xs font-black uppercase" style={{ color: themeColor }}>Admin Console</p>
                <h1 className="mt-1 text-2xl font-black" style={{ color: headerDark ? '#f4f4f5' : bodyText }}>{SECTION_LABELS[section]}</h1>
              </div>
            )}
            <div className="ml-auto flex shrink-0 items-center">
              <ConsoleHeaderActions
                displayName={displayName}
                avatarUrl={profile?.avatarUrl}
                searchItems={headerSearchItems}
                notifications={headerNotifications}
                onProfile={openProfile}
                onLogout={logout}
                onHelp={() => openSection('system')}
                onFullscreenChange={setConsoleFullscreen}
                onLayoutChange={setConsoleLayout}
                title={SECTION_LABELS[section]}
              />
            </div>
          </header>

          {!consoleFullscreen && consoleLayout.toggles.showTagsView && section !== 'overview' && (
            topMenuMode ? (
              <div className="flex h-9 items-center px-5" style={{ margin: '-14px -20px 0', background: consoleLayout.darkMode ? 'rgba(24,34,50,0.92)' : 'rgba(255,255,255,0.88)', borderBottom: `1px solid ${surfaceBorder}` }}>
                <div className="inline-flex items-center gap-2 px-3 py-1 text-xs font-bold" style={{ borderRadius: 999, background: softThemeBg, border: `1px solid ${themeColor}33`, color: themeColor }}>
                  {consoleLayout.toggles.showTabIcon && <span style={{ width: 6, height: 6, borderRadius: '50%', background: themeColor }} />}
                  {SECTION_LABELS[section]}
                </div>
              </div>
            ) : (
              <div className="inline-flex w-fit items-center gap-2 px-3 py-1 text-xs font-bold" style={{ borderRadius: 999, background: softThemeBg, border: `1px solid ${themeColor}33`, color: themeColor }}>
                {consoleLayout.toggles.showTabIcon && <span style={{ width: 6, height: 6, borderRadius: '50%', background: themeColor }} />}
                {SECTION_LABELS[section]}
              </div>
            )
          )}

          {topMenuMode && !consoleFullscreen && (
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-1 pt-1">
              <p className="m-0 text-xs font-black uppercase" style={{ color: themeColor }}>Admin Console</p>
              <h1 className="m-0 text-2xl font-black" style={{ color: bodyText }}>{SECTION_LABELS[section]}</h1>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-between px-4 py-3 text-sm text-red-700" style={{ ...PANEL_STYLE, borderColor: 'rgba(220,38,38,0.18)', background: 'rgba(254,242,242,0.9)' }}>
              <span>{error}</span>
              <button onClick={() => setError('')} className="text-red-500 hover:text-red-700"><X size={16} /></button>
            </div>
          )}

          {notice && (
            <div className="flex items-center justify-between px-4 py-3 text-sm text-emerald-700" style={{ ...PANEL_STYLE, borderColor: 'rgba(16,185,129,0.18)', background: 'rgba(236,253,245,0.9)' }}>
              <span>{notice}</span>
              <button onClick={() => setNotice('')} className="text-emerald-500 hover:text-emerald-700"><X size={16} /></button>
            </div>
          )}

          {section === 'overview' && (
            <section className="grid gap-4">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
                {stats.map(item => <StatCard key={item.label} {...item} />)}
              </div>

              <div className="grid grid-cols-[repeat(auto-fit,minmax(270px,1fr))] gap-4">
                <DistributionChartCard title="角色分布" subtitle="全部平台账号" items={overview?.distributions.byRole ?? []} valueSuffix=" 人" />
                <DistributionChartCard title="学历分布" subtitle="学生培养层次" items={overview?.distributions.byEducation ?? []} valueSuffix=" 人" />
                <DistributionChartCard title="专业方向分布" subtitle="学生专业 Top 8" items={overview?.distributions.byMajor ?? []} variant="bar" valueSuffix=" 人" />
                <DistributionChartCard title="题型分布" subtitle="启用中的题库" items={overview?.distributions.byQuestionType ?? []} valueSuffix=" 题" />
                <DistributionChartCard title="难度分布" subtitle="启用中的题库" items={overview?.distributions.byQuestionDifficulty ?? []} variant="bar" valueSuffix=" 题" />
              </div>

              <div className="p-4" style={PANEL_STYLE}>
                <h3 className="text-sm font-bold text-slate-900">管理模块</h3>
                <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
                  {(overview?.modules ?? []).map(item => (
                    <button
                      key={item.key}
                      onClick={() => {
                        if (item.key === 'schools') openSection('schools')
                        if (item.key === 'projects') openSection('projects')
                        if (item.key === 'exports') openSection('exports')
                        if (item.key === 'rules') openSection('rules')
                        if (item.key === 'users' || item.key === 'mindmap') openSection(item.key)
                        if (item.key === 'questions') openSection('questions')
                        if (item.key === 'monitoring') openSection('system')
                        if (item.key === 'aiConfig') openSection('aiConfig')
                        if (item.key === 'deps') openSection('dependencies')
                      }}
                      className="p-3 text-left transition hover:border-teal-300 hover:bg-teal-50"
                      style={SOFT_CARD_STYLE}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-sm text-slate-900">{item.title}</strong>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${item.status === 'done' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                          {item.status === 'done' ? '可用' : '规划'}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-500">{item.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {section === 'profile' && (
            <RoleProfileCenter
              profile={profile}
              displayName={displayName}
              role="admin"
              form={profileForm}
              onFormChange={setProfileForm}
              saving={savingProfile}
              onSave={saveProfile}
              onAvatarUpload={saveAvatar}
              onClose={() => setSection('overview')}
            />
          )}

          {section === 'projects' && (
            <section className="grid gap-4">
              <ComparisonChartCard
                title="项目内容覆盖对比"
                subtitle="按内容总量排序显示前 8 个项目"
                labels={(teachingData?.projectTasks ?? []).map(project => project.projectName)}
                series={[
                  { name: '知识点', values: (teachingData?.projectTasks ?? []).map(project => project.knowledgeCount), color: '#1d6f78' },
                  { name: '技能点', values: (teachingData?.projectTasks ?? []).map(project => project.skillCount), color: '#409eff' },
                  { name: '题目', values: (teachingData?.projectTasks ?? []).map(project => project.questionCount), color: '#c8812b' },
                ]}
                valueSuffix=" 个"
              />
              <section style={PANEL_STYLE}>
                <div className="flex items-center justify-between border-b p-4" style={{ borderColor: 'rgba(30,77,88,0.1)' }}>
                  <h3 className="text-sm font-black text-slate-900">项目任务覆盖</h3>
                  <span className="text-xs text-slate-500">共 {teachingData?.projectTasks.length ?? 0} 个项目</span>
                </div>
                <div className="overflow-auto">
                  <table className="w-full min-w-[1120px] border-collapse text-sm">
                    <thead>
                      <tr className="text-left text-xs" style={TABLE_HEAD_STYLE}>
                        <th className="w-[230px] px-4 py-3">项目</th>
                        <th className="w-[72px] px-4 py-3">层次</th>
                        <th className="px-4 py-3">任务</th>
                        <th className="w-[150px] px-4 py-3">知识/技能</th>
                        <th className="w-[92px] px-4 py-3 text-right">题库</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(teachingData?.projectTasks ?? []).map(project => (
                        <tr key={project.projectName} className="border-t border-slate-100">
                          <td className="whitespace-nowrap px-4 py-3"><strong className="text-slate-900">{project.projectName}</strong></td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">{project.eduLevels.join('、') || '未设置'}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600"><strong className="mr-2 text-slate-800">{project.taskCount} 个</strong><span className="text-slate-500">{project.taskNames.join('、') || '暂无任务名'}</span></td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">{project.knowledgeCount} 知识点 / {project.skillCount} 技能点</td>
                          <td className="px-4 py-3 text-right"><Pill tone={project.questionCount > 0 ? 'green' : 'orange'}>{project.questionCount} 题</Pill></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </section>
          )}

          {section === 'questions' && (
            <section className="grid gap-4">
              <div className="flex flex-wrap items-center gap-3 p-4" style={PANEL_STYLE}>
                <select value={adminProjectFilter} onChange={event => setAdminProjectFilter(event.target.value)} className={inputClass()}>
                  <option value="all">全部项目</option>
                  {teachingFilterOptions.projects.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
                <select value={adminTypeFilter} onChange={event => setAdminTypeFilter(event.target.value)} className={inputClass()}>
                  <option value="all">全部题型</option>
                  {teachingFilterOptions.questionTypes.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
                <select value={adminDifficultyFilter} onChange={event => setAdminDifficultyFilter(event.target.value)} className={inputClass()}>
                  <option value="all">全部难度</option>
                  {teachingFilterOptions.difficulties.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
                <div className="flex h-9 min-w-80 items-center gap-2 rounded-lg border border-teal-900/10 bg-white/90 px-3">
                  <Search size={15} className="text-slate-400" />
                  <input value={adminTeachingSearch} onChange={event => setAdminTeachingSearch(event.target.value)} placeholder="搜索题干、项目、知识点" className="w-full bg-transparent text-sm outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-[repeat(auto-fit,minmax(270px,1fr))] gap-4">
                <DistributionChartCard title="题型结构" subtitle="全部启用题库" items={teachingData?.distributions.questionType ?? []} valueSuffix=" 题" />
                <DistributionChartCard title="难度结构" subtitle="全部启用题库" items={teachingData?.distributions.questionDifficulty ?? []} variant="bar" valueSuffix=" 题" />
              </div>

              <div style={PANEL_STYLE}>
                <div className="flex items-center justify-between border-b p-4" style={{ borderColor: 'rgba(30,77,88,0.1)' }}>
                  <h3 className="text-sm font-black text-slate-900">题库列表</h3>
                  <span className="text-xs text-slate-500">显示 {filteredAdminQuestions.length} 题</span>
                </div>
                <div className="overflow-auto">
                  <table className="w-full min-w-[1120px] border-collapse text-sm">
                    <thead>
                      <tr className="text-left text-xs" style={TABLE_HEAD_STYLE}>
                        <th className="px-4 py-3">题干</th>
                        <th className="w-[150px] px-4 py-3">题型/难度</th>
                        <th className="w-[320px] px-4 py-3">项目任务</th>
                        <th className="w-[240px] px-4 py-3">知识点</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAdminQuestions.map(item => (
                        <tr key={item.questionId} className="border-t border-slate-100">
                          <td className="px-4 py-3"><strong className="block max-w-[520px] text-slate-900">{item.stem}</strong></td>
                          <td className="whitespace-nowrap px-4 py-3"><div className="inline-flex gap-1.5"><Pill tone="blue">{item.questionType}</Pill><Pill tone={item.difficulty === '易' ? 'green' : item.difficulty === '难' ? 'red' : 'orange'}>{item.difficulty}</Pill></div></td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600"><strong className="mr-2 font-semibold text-slate-700">{item.projectName}</strong><span className="text-slate-400">{item.taskName}</span></td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">{item.knowledgeTitle}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredAdminQuestions.length === 0 && <p className="p-8 text-center text-sm text-slate-500">暂无题目数据。</p>}
                </div>
              </div>
            </section>
          )}

          {section === 'rules' && (
            <section className="grid gap-4">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
                {[
                  { title: '前测规则', desc: '20 道题，覆盖所有项目；易 12 道、中 8 道，总分 100 分。' },
                  { title: '分数判断', desc: '60 分以下进入新手路径；60 分及以上根据错点生成个性化方案。' },
                  { title: '专业映射', desc: '按专业映射剂型、产品案例和工艺规程，支持后续扩展更多院校规则。' },
                  { title: '荣誉规则', desc: '铜牌、银牌、金牌按课时分与完成质量进行分层。' },
                ].map(item => (
                  <div key={item.title} className="p-4" style={PANEL_STYLE}>
                    <strong className="text-sm text-slate-900">{item.title}</strong>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{item.desc}</p>
                  </div>
                ))}
              </div>
              <div className="p-4" style={PANEL_STYLE}>
                <h3 className="text-sm font-black text-slate-900">模块建设清单</h3>
                <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
                  {(teachingData?.managementModules ?? []).map(module => (
                    <div key={module.key} className="p-3" style={SOFT_CARD_STYLE}>
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-sm text-slate-900">{module.title}</strong>
                        <Pill tone={module.status === 'first' ? 'green' : 'neutral'}>{module.status === 'first' ? '已接入' : '后续'}</Pill>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-500">{module.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {section === 'exports' && (
            <section className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-3">
              <button onClick={() => downloadCsv('管理员-学生学习状态.csv', (teachingData?.students ?? []).map(student => ({
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
                待复核错题: student.answerStats.pendingReview,
              })))} className="p-4 text-left transition hover:border-teal-300 hover:bg-teal-50" style={PANEL_STYLE}>
                <Download size={18} className="text-teal-700" />
                <strong className="mt-3 block text-base text-slate-900">导出学生学习状态</strong>
                <span className="mt-2 block text-sm leading-6 text-slate-500">CSV 格式，包含学生资料、前测、错题和学习方案状态。</span>
              </button>
              <button onClick={() => downloadCsv('管理员-题库统计.csv', (teachingData?.questionItems ?? []).map(item => ({
                题目ID: item.questionId,
                题型: item.questionType,
                难度: item.difficulty,
                项目: item.projectName,
                任务: item.taskName,
                知识点: item.knowledgeTitle,
                题干: item.stem,
              })))} className="p-4 text-left transition hover:border-teal-300 hover:bg-teal-50" style={PANEL_STYLE}>
                <ClipboardList size={18} className="text-teal-700" />
                <strong className="mt-3 block text-base text-slate-900">导出题库统计</strong>
                <span className="mt-2 block text-sm leading-6 text-slate-500">CSV 格式，包含题型、难度、项目任务和知识点。</span>
              </button>
            </section>
          )}

          {section === 'schools' && (
            <section className="grid gap-4">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
                {schoolStats.map(item => <StatCard key={item.label} {...item} />)}
              </div>

              <div className="grid gap-4">
                <div style={PANEL_STYLE}>
                  <div className="flex items-center justify-between gap-3 border-b p-4" style={{ borderColor: 'rgba(30,77,88,0.1)' }}>
                    <div>
                      <h3 className="text-sm font-black text-slate-900">学校档案</h3>
                      <p className="mt-1 text-xs text-slate-500">当前优先维护高校场景，监管和企业机构后续扩展。</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-72 items-center gap-2 rounded-lg border border-teal-900/10 bg-white/90 px-3">
                        <Search size={15} className="text-slate-400" />
                        <input value={schoolSearch} onChange={event => setSchoolSearch(event.target.value)} placeholder="搜索学校、专业、班级" className="w-full bg-transparent text-sm outline-none" />
                      </div>
                      <button
                        onClick={() => {
                          resetSchoolForm()
                          setShowSchoolModal(true)
                        }}
                        className="inline-flex h-9 items-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800"
                      >
                        <Plus size={15} />
                        新增学校
                      </button>
                    </div>
                  </div>
                  <div className="overflow-auto">
                    <table className="w-full min-w-[880px] border-collapse text-sm">
                      <thead>
                        <tr className="text-left text-xs" style={TABLE_HEAD_STYLE}>
                          <th className="px-4 py-3">学校</th>
                          <th className="px-4 py-3">开通状态</th>
                          <th className="px-4 py-3">规模</th>
                          <th className="px-4 py-3">学习数据</th>
                          <th className="px-4 py-3">联系人</th>
                          <th className="px-4 py-3">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schoolsData.schools.map(school => (
                          <tr key={school.schoolId} className={`border-t border-slate-100 ${selectedSchool?.schoolId === school.schoolId ? 'bg-teal-50/50' : ''}`}>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => {
                                  setSelectedSchoolId(school.schoolId)
                                  if (!editingClassId) setClassForm(form => ({ ...form, schoolId: school.schoolId }))
                                }}
                                className="block text-left"
                              >
                                <strong className="block text-slate-900">{school.name}</strong>
                                <span className="text-xs text-slate-500">{school.code || '未设置代码'} · {school.region || '未设置地区'}</span>
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2 py-1 text-xs font-bold ${school.status === 'active' ? 'bg-green-100 text-green-700' : school.status === 'paused' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                {SCHOOL_STATUS_LABEL[school.status]}
                              </span>
                              <span className="mt-1 block text-xs text-slate-400">{school.packageName}</span>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              <strong className="text-slate-800">{school.studentCount}</strong> 学生 / {school.teacherCount} 教师
                              <span className="block text-xs text-slate-400">{school.classCount} 班级 · {school.majorCount} 专业</span>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              前测 {school.onboardingCompletedCount} 人
                              <span className="block text-xs text-slate-400">均分 {school.averageDiagnosticScore} · 待复核 {school.pendingReviewCount}</span>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {school.contactPerson || '-'}
                              <span className="block text-xs text-slate-400">{school.contactPhone || '-'}</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2">
                                <button onClick={() => editSchool(school)} className="rounded-md bg-teal-50 px-2 py-1 text-xs font-bold text-teal-700 hover:bg-teal-100">编辑</button>
                                <button onClick={() => deleteSchool(school)} className="rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-100">删除</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {schoolsData.schools.length === 0 && <p className="p-8 text-center text-sm text-slate-500">暂无学校档案，可点击“新增学校”创建。</p>}
                  </div>
                </div>
              </div>

              <div className="grid gap-4">
                <div style={PANEL_STYLE}>
                  <div className="flex items-center justify-between gap-3 border-b p-4" style={{ borderColor: 'rgba(30,77,88,0.1)' }}>
                    <div>
                      <h3 className="text-sm font-black text-slate-900">{selectedSchool ? `${selectedSchool.name} · 班级专业` : '班级专业'}</h3>
                      <p className="mt-1 text-xs text-slate-500">维护学校下的班级、专业方向、学历层次和班主任。</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedSchool && (
                        <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700">
                          {selectedSchoolClasses.length} 个班级
                        </span>
                      )}
                      <button
                        onClick={() => {
                          resetClassForm()
                          setShowClassModal(true)
                        }}
                        className="inline-flex h-9 items-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800"
                      >
                        <Plus size={15} />
                        新增班级
                      </button>
                    </div>
                  </div>
                  <div className="overflow-auto">
                    <table className="w-full min-w-[820px] border-collapse text-sm">
                      <thead>
                        <tr className="text-left text-xs" style={TABLE_HEAD_STYLE}>
                          <th className="px-4 py-3">班级</th>
                          <th className="px-4 py-3">专业/层次</th>
                          <th className="px-4 py-3">班主任</th>
                          <th className="px-4 py-3">容量</th>
                          <th className="px-4 py-3">状态</th>
                          <th className="px-4 py-3">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedSchoolClasses.map(item => (
                          <tr key={item.classId} className="border-t border-slate-100">
                            <td className="px-4 py-3">
                              <strong className="block text-slate-900">{item.className}</strong>
                              <span className="text-xs text-slate-500">{item.gradeYear || '未设置年级'}</span>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {item.major || '-'}
                              <span className="block text-xs text-slate-400">{item.educationLevel}</span>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{item.teacherName || '-'}</td>
                            <td className="px-4 py-3 text-slate-600">{item.enrolledStudents} / {item.studentCapacity || '-'}</td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2 py-1 text-xs font-bold ${item.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                                {CLASS_STATUS_LABEL[item.status]}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2">
                                <button onClick={() => editClass(item)} className="rounded-md bg-teal-50 px-2 py-1 text-xs font-bold text-teal-700 hover:bg-teal-100">编辑</button>
                                <button onClick={() => deleteClass(item)} className="rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-100">删除</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {selectedSchoolClasses.length === 0 && <p className="p-8 text-center text-sm text-slate-500">该学校暂无班级档案。</p>}
                  </div>
                </div>

              </div>
            </section>
          )}

          {section === 'users' && (
            <section className="grid gap-4">
              <div style={PANEL_STYLE}>
                <div className="flex items-center justify-between gap-3 border-b p-4" style={{ borderColor: 'rgba(30,77,88,0.1)' }}>
                  <div className="flex items-center gap-3">
                    <select value={userRoleFilter} onChange={event => setUserRoleFilter(event.target.value as 'all' | Role)} className={inputClass()}>
                      <option value="all">全部角色</option>
                      <option value="student">学生</option>
                      <option value="teacher">教师</option>
                      <option value="admin">管理员</option>
                    </select>
                    <div className="flex h-9 min-w-80 items-center gap-2 rounded-lg border border-teal-900/10 bg-white/90 px-3">
                      <Search size={15} className="text-slate-400" />
                      <input value={userSearch} onChange={event => setUserSearch(event.target.value)} placeholder="搜索姓名、邮箱、班级" className="w-full bg-transparent text-sm outline-none" />
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      resetUserForm()
                      setShowUserModal(true)
                    }}
                    className="inline-flex h-9 items-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800"
                  >
                    <Plus size={15} />
                    新增用户
                  </button>
                </div>
                <div className="overflow-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="text-left text-xs" style={TABLE_HEAD_STYLE}>
                        <th className="px-4 py-3">用户</th>
                        <th className="px-4 py-3">角色</th>
                        <th className="px-4 py-3">学校/班级</th>
                        <th className="px-4 py-3">联系方式</th>
                        <th className="px-4 py-3">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersData.items.map(user => (
                        <tr key={user.userId} className="border-t border-slate-100">
                          <td className="px-4 py-3">
                            <strong className="block text-slate-900">{user.realName || user.displayName}</strong>
                            <span className="text-xs text-slate-500">{user.email}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-bold text-teal-700">{ROLE_LABEL[user.role]}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <span className="block">{user.school || '-'}</span>
                            <span className="text-xs text-slate-400">{user.className || user.major || '-'}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{user.phone || '-'}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <button onClick={() => editUser(user)} className="rounded-md bg-teal-50 px-2 py-1 text-xs font-bold text-teal-700 hover:bg-teal-100">编辑</button>
                              <button onClick={() => deleteUser(user.userId)} className="rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-100">删除</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {usersData.items.length === 0 && <p className="p-8 text-center text-sm text-slate-500">暂无用户。</p>}
                </div>
              </div>

            </section>
          )}

          {section === 'mindmap' && (
            <section className="grid gap-4">
              <div style={PANEL_STYLE}>
                <div className="grid grid-cols-[150px_150px_180px_minmax(220px,1fr)_auto] gap-3 border-b p-4" style={{ borderColor: 'rgba(30,77,88,0.1)' }}>
                  <select value={kpType} onChange={event => { setKpType(event.target.value as 'all' | 'knowledge' | 'skill'); setKpPage(1) }} className={inputClass()}>
                    <option value="all">全部类型</option>
                    <option value="knowledge">知识点</option>
                    <option value="skill">技能点</option>
                  </select>
                  <select value={kpEduLevel} onChange={event => { setKpEduLevel(event.target.value); setKpPage(1) }} className={inputClass()}>
                    <option value="all">全部学历</option>
                    <option value="专科">专科</option>
                    <option value="本科">本科</option>
                  </select>
                  <select value={kpProject} onChange={event => { setKpProject(event.target.value); setKpPage(1) }} className={inputClass()}>
                    <option value="all">全部项目</option>
                    {mindmapData.projects.map(project => <option key={project} value={project}>{project}</option>)}
                  </select>
                  <div className="flex h-9 items-center gap-2 rounded-lg border border-teal-900/10 bg-white/90 px-3">
                    <Search size={15} className="text-slate-400" />
                    <input value={kpSearch} onChange={event => { setKpSearch(event.target.value); setKpPage(1) }} placeholder="搜索名称、编号、GMP条款" className="w-full bg-transparent text-sm outline-none" />
                  </div>
                  <button
                    onClick={() => {
                      resetKpForm()
                      setShowKpModal(true)
                    }}
                    className="inline-flex h-9 items-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800"
                  >
                    <Plus size={15} />
                    新增知识点
                  </button>
                </div>
                <div className="overflow-auto">
                  <table className="w-full min-w-[1120px] border-collapse text-sm">
                    <thead>
                      <tr className="text-left text-xs" style={TABLE_HEAD_STYLE}>
                        <th className="w-[170px] px-4 py-3">编号</th>
                        <th className="w-[360px] px-4 py-3">名称</th>
                        <th className="w-[90px] px-4 py-3">类型</th>
                        <th className="px-4 py-3">项目/任务</th>
                        <th className="w-[70px] px-4 py-3">难度</th>
                        <th className="w-[116px] px-4 py-3 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mindmapData.items.map(item => (
                        <tr key={item.kpId} className="border-t border-slate-100">
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500">{item.serialCode || item.kpId.slice(0, 12)}</td>
                          <td className="px-4 py-3">
                            <strong className="mr-2 whitespace-nowrap text-slate-900">{item.title}</strong>
                            <span className="whitespace-nowrap text-xs text-slate-500">{item.gmpArticles || item.content || '-'}</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className={`inline-flex min-h-5 items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-bold leading-none ${item.pointType === '技能点' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>{item.pointType}</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                            <strong className="mr-2 font-semibold text-slate-700">{item.projectName || '-'}</strong>
                            <span className="text-slate-400">{item.taskName || '-'}</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">{item.difficulty}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <button onClick={() => editKp(item)} className="rounded-md bg-teal-50 px-2 py-1 text-xs font-bold text-teal-700 hover:bg-teal-100">编辑</button>
                              <button onClick={() => deleteKp(item.kpId)} className="rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-100">删除</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {mindmapData.items.length === 0 && <p className="p-8 text-center text-sm text-slate-500">暂无知识点。</p>}
                </div>
                <div className="flex items-center justify-between border-t p-4 text-sm text-slate-500" style={{ borderColor: 'rgba(30,77,88,0.1)' }}>
                  <span>共 {mindmapData.total} 条</span>
                  <div className="flex gap-2">
                    <button disabled={kpPage <= 1} onClick={() => setKpPage(page => Math.max(1, page - 1))} className="rounded-md border border-slate-200 px-3 py-1 disabled:opacity-40">上一页</button>
                    <button disabled={kpPage * mindmapData.pageSize >= mindmapData.total} onClick={() => setKpPage(page => page + 1)} className="rounded-md border border-slate-200 px-3 py-1 disabled:opacity-40">下一页</button>
                  </div>
                </div>
              </div>

            </section>
          )}

          {section === 'dependencies' && (
            <section className="grid gap-4">
              <div className="p-4" style={PANEL_STYLE}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-slate-900">依赖关系配置</h3>
                    <p className="mt-1 text-xs text-slate-500">新增前置和后续知识点关系会通过弹窗完成。</p>
                  </div>
                  <button onClick={() => setShowDependencyModal(true)} className="inline-flex h-9 items-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800">
                    <Plus size={15} />
                    新增依赖
                  </button>
                </div>
              </div>

              <div style={PANEL_STYLE}>
                <div className="border-b p-4" style={{ borderColor: 'rgba(30,77,88,0.1)' }}>
                  <h3 className="text-sm font-black text-slate-900">依赖关系列表</h3>
                </div>
                <div className="grid gap-2 p-4">
                  {dependencies.length === 0 && <p className="text-sm text-slate-500">暂无依赖关系。</p>}
                  {dependencies.map(dep => (
                    <div key={dep.id} className="grid grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)_auto] items-center gap-3 p-3 text-sm" style={SOFT_CARD_STYLE}>
                      <div>
                        <strong className="block text-slate-900">{dep.fromTitle}</strong>
                        <span className="text-xs text-slate-500">{dep.fromSerialCode || dep.fromKpId}</span>
                      </div>
                      <span className="text-center text-slate-400">→</span>
                      <div>
                        <strong className="block text-slate-900">{dep.toTitle}</strong>
                        <span className="text-xs text-slate-500">{dep.toSerialCode || dep.toKpId}</span>
                      </div>
                      <button onClick={() => deleteDependency(dep)} className="rounded-md bg-red-50 p-2 text-red-700 hover:bg-red-100">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {section === 'system' && (
            <section className="grid gap-4">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
                {[
                  { label: '接口调用量', value: systemData?.monitoring.apiUsage.total ?? 0, icon: Server },
                  { label: '今日接口', value: systemData?.monitoring.apiUsage.today ?? 0, icon: Activity },
                  { label: 'AI调用量', value: systemData?.monitoring.aiUsage.total ?? 0, icon: Bot },
                  { label: '平均延迟', value: `${systemData?.monitoring.aiUsage.averageLatencyMs ?? 0}ms`, icon: BarChart3 },
                  { label: '数据库', value: systemData?.monitoring.database.status ?? '读取中', icon: Database },
                  { label: '存储容量', value: `${systemData?.monitoring.storage.totalMB ?? 0}MB`, icon: HardDrive },
                ].map(item => <StatCard key={item.label} {...item} />)}
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_minmax(320px,420px)] gap-4">
                <div style={PANEL_STYLE}>
                  <div className="border-b p-4" style={{ borderColor: 'rgba(30,77,88,0.1)' }}>
                    <h3 className="text-sm font-black text-slate-900">服务状态</h3>
                  </div>
                  <div className="grid gap-2 p-4">
                    {(systemData?.monitoring.serviceStatus ?? []).map(item => (
                      <div key={item.name} className="flex items-center justify-between gap-3 p-3 text-sm" style={SOFT_CARD_STYLE}>
                        <div>
                          <strong className="block text-slate-900">{item.name}</strong>
                          <span className="text-xs text-slate-500">{item.detail}</span>
                        </div>
                        <span className={`rounded-full px-2 py-1 text-xs font-bold ${statusBadgeClass(item.status)}`}>
                          {item.status === 'ok' ? '正常' : item.status === 'error' ? '异常' : '待配置'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4" style={PANEL_STYLE}>
                  <h3 className="text-sm font-black text-slate-900">数据库状态</h3>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600">
                    <div className="flex justify-between px-3 py-2" style={SOFT_CARD_STYLE}><span>表数量</span><strong>{systemData?.monitoring.database.tableCount ?? 0}</strong></div>
                    <div className="flex justify-between px-3 py-2" style={SOFT_CARD_STYLE}><span>数据库大小</span><strong>{systemData?.monitoring.database.sizeMB ?? 0} MB</strong></div>
                    <div className="flex justify-between px-3 py-2" style={SOFT_CARD_STYLE}><span>用户</span><strong>{systemData?.monitoring.database.userCount ?? 0}</strong></div>
                    <div className="flex justify-between px-3 py-2" style={SOFT_CARD_STYLE}><span>题库</span><strong>{systemData?.monitoring.database.questionCount ?? 0}</strong></div>
                    <div className="flex justify-between px-3 py-2" style={SOFT_CARD_STYLE}><span>知识点</span><strong>{systemData?.monitoring.database.knowledgeCount ?? 0}</strong></div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_minmax(320px,420px)] gap-4">
                <div style={PANEL_STYLE}>
                  <div className="border-b p-4" style={{ borderColor: 'rgba(30,77,88,0.1)' }}>
                    <h3 className="text-sm font-black text-slate-900">错误日志</h3>
                  </div>
                  <div className="grid gap-2 p-4">
                    {(systemData?.monitoring.errorLogs ?? []).length === 0 && <p className="text-sm text-slate-500">暂无错误或警告日志。</p>}
                    {(systemData?.monitoring.errorLogs ?? []).map((log, index) => (
                      <div key={`${log.time}-${index}`} className="grid gap-1 p-3 text-sm" style={SOFT_CARD_STYLE}>
                        <div className="flex items-center justify-between gap-3">
                          <strong className={log.level === 'ERROR' ? 'text-red-700' : 'text-amber-700'}>{log.level}</strong>
                          <span className="text-xs text-slate-400">{log.time || log.source}</span>
                        </div>
                        <p className="m-0 break-words text-xs leading-5 text-slate-500">{log.message}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4" style={PANEL_STYLE}>
                  <h3 className="text-sm font-black text-slate-900">存储状态</h3>
                  <div className="mt-3 grid gap-2">
                    {(systemData?.monitoring.storage.items ?? []).map(item => (
                      <div key={item.label} className="px-3 py-2 text-sm" style={SOFT_CARD_STYLE}>
                        <div className="flex justify-between gap-3 text-slate-700">
                          <span>{item.label}</span>
                          <strong>{item.sizeMB} MB</strong>
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-400">{item.path}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {section === 'aiConfig' && (
            <section className="grid gap-4">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3">
                <div className="p-4" style={PANEL_STYLE}>
                  <span className="text-xs font-bold text-slate-500">DashScope API Key</span>
                  <div className="mt-3">
                    <Pill tone={systemData?.settings.hasDashScopeApiKey ? 'green' : 'orange'}>
                      {systemData?.settings.hasDashScopeApiKey ? `已配置 ${systemData.settings.dashScopeApiKeyMasked}` : '未配置'}
                    </Pill>
                  </div>
                </div>
                <div className="p-4" style={PANEL_STYLE}>
                  <span className="text-xs font-bold text-slate-500">大模型</span>
                  <strong className="mt-2 block break-words text-base text-slate-900">{systemForm.llmModel || '-'}</strong>
                </div>
                <div className="p-4" style={PANEL_STYLE}>
                  <span className="text-xs font-bold text-slate-500">Embedding</span>
                  <strong className="mt-2 block break-words text-base text-slate-900">{systemForm.embeddingModel || '-'}</strong>
                </div>
                <div className="p-4" style={PANEL_STYLE}>
                  <span className="text-xs font-bold text-slate-500">知识库更新时间</span>
                  <strong className="mt-2 block text-base text-slate-900">{systemForm.knowledgeUpdatedAt ? new Date(systemForm.knowledgeUpdatedAt).toLocaleString() : '未记录'}</strong>
                </div>
              </div>

              <div className="p-5" style={PANEL_STYLE}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="m-0 text-sm font-black text-slate-900">AI 与 RAG 配置</h3>
                    <p className="m-0 mt-1 text-xs leading-5 text-slate-500">模型、Key、检索参数和提示词模板统一在弹窗里维护。</p>
                  </div>
                  <button onClick={() => setShowAiConfigModal(true)} className="inline-flex h-10 items-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800">
                    <Settings2 size={15} />
                    打开配置
                  </button>
                </div>
              </div>

              <div className="p-4" style={PANEL_STYLE}>
                <h3 className="text-sm font-black text-slate-900">当前 AI 调用</h3>
                <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 text-sm text-slate-600">
                  <div className="flex justify-between px-3 py-2" style={SOFT_CARD_STYLE}><span>总调用</span><strong>{systemData?.monitoring.aiUsage.total ?? 0}</strong></div>
                  <div className="flex justify-between px-3 py-2" style={SOFT_CARD_STYLE}><span>今日调用</span><strong>{systemData?.monitoring.aiUsage.today ?? 0}</strong></div>
                  <div className="flex justify-between px-3 py-2" style={SOFT_CARD_STYLE}><span>平均延迟</span><strong>{systemData?.monitoring.aiUsage.averageLatencyMs ?? 0}ms</strong></div>
                </div>
              </div>
            </section>
          )}

          {showSchoolModal && renderAdminModal(
            editingSchoolId ? '编辑学校' : '新增学校',
            '维护学校名称、开通状态、联系人、套餐和有效期。',
            () => {
              setShowSchoolModal(false)
              resetSchoolForm()
            },
            renderSchoolForm(),
          )}
          {showClassModal && renderAdminModal(
            editingClassId ? '编辑班级' : '新增班级',
            '维护班级、专业方向、学历层次、班主任和容量。',
            () => {
              setShowClassModal(false)
              resetClassForm()
            },
            renderClassForm(),
          )}
          {showUserModal && renderAdminModal(
            editingUserId ? '编辑用户' : '新增用户',
            '维护学生、教师和管理员账号及基础资料。',
            () => {
              setShowUserModal(false)
              resetUserForm()
            },
            renderUserForm(),
          )}
          {showKpModal && renderAdminModal(
            editingKpId ? '编辑知识点' : '新增知识点',
            '维护知识点、技能点、项目任务、GMP 条款和掌握要求。',
            () => {
              setShowKpModal(false)
              resetKpForm()
            },
            renderKpForm(),
            'min(780px, 94vw)',
          )}
          {showDependencyModal && renderAdminModal(
            '新增依赖关系',
            '选择前置知识点与后续知识点，保存后进入依赖关系列表。',
            () => setShowDependencyModal(false),
            renderDependencyForm(),
            'min(680px, 94vw)',
          )}
          {showAiConfigModal && renderAdminModal(
            'AI 与 RAG 配置',
            '配置 DashScope Key、大模型、Embedding、检索参数和提示词模板。',
            () => setShowAiConfigModal(false),
            renderAiConfigForm(),
            'min(860px, 94vw)',
          )}
        </main>
      </div>
    </div>
  )
}
