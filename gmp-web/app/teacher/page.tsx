'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  Database,
  Download,
  Filter,
  Layers3,
  LoaderCircle,
  LogOut,
  Network,
  Search,
  Settings2,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import ConsoleHeaderActions, { DEFAULT_CONSOLE_LAYOUT, type ConsoleLayoutConfig } from '../components/ConsoleHeaderActions'
import RoleProfileCenter from '../components/RoleProfileCenter'

type SectionKey = 'overview' | 'students' | 'projects' | 'knowledge' | 'questions' | 'rules' | 'exports' | 'profile'

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

const PANEL: CSSProperties = {
  background: 'rgba(255,255,255,0.9)',
  borderRadius: 12,
  border: '1px solid rgba(34,73,84,0.14)',
  boxShadow: '0 1px 4px rgba(31,71,92,0.06)',
}

const TH: CSSProperties = {
  padding: '10px 12px',
  color: '#6b8a98',
  fontSize: 12,
  fontWeight: 800,
  textAlign: 'left',
  borderBottom: '1px solid rgba(31,71,92,0.1)',
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
  { key: 'projects', label: '项目任务', title: '项目任务', desc: '按项目查看任务、知识点、技能点和题库覆盖情况。', icon: Layers3 },
  { key: 'knowledge', label: '知识图谱', title: '知识/技能图谱', desc: '检索知识点、技能点、任务归属和 GMP 条款关联。', icon: Network },
  { key: 'questions', label: '题库管理', title: '题库管理', desc: '查看题型、难度、项目归属和知识点关联。', icon: ClipboardList },
  { key: 'rules', label: '规则配置', title: '规则配置', desc: '查看教师管理模块建设范围和诊断学习规则。', icon: Settings2 },
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
    <span style={{ display: 'inline-flex', alignItems: 'center', width: 'fit-content', padding: '3px 8px', borderRadius: 999, background: palette.bg, color: palette.fg, fontSize: 12, fontWeight: 800 }}>
      {children}
    </span>
  )
}

function ProgressBar({ items }: { items: DistributionItem[] }) {
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1

  return (
    <div style={{ display: 'grid', gap: 9 }}>
      {items.length === 0 ? (
        <span style={{ color: '#8aa0aa', fontSize: 13 }}>暂无数据</span>
      ) : items.map(item => {
        const percent = Math.round((item.value / total) * 100)

        return (
          <div key={item.label} style={{ display: 'grid', gap: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: '#183b4b', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
              <strong style={{ color: '#1d6f78', fontSize: 12 }}>{item.value} · {percent}%</strong>
            </div>
            <div style={{ height: 7, borderRadius: 999, background: 'rgba(31,71,92,0.08)', overflow: 'hidden' }}>
              <div style={{ width: `${percent}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#1d6f78,#409eff)' }} />
            </div>
          </div>
        )
      })}
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

  const headerSearchItems = useMemo(() => [
    { category: '页面导航', label: '教学总览', desc: '查看学生、前测、题库与知识图谱统计', action: () => resetFilters('overview') },
    { category: '页面导航', label: '学生管理', desc: '查看学生资料、学习方案和错题复盘', action: () => resetFilters('students') },
    { category: '页面导航', label: '项目任务', desc: '按项目查看任务、知识点和题库覆盖', action: () => resetFilters('projects') },
    { category: '页面导航', label: '知识图谱', desc: '检索知识点、技能点和 GMP 条款关联', action: () => resetFilters('knowledge') },
    { category: '页面导航', label: '题库管理', desc: '查看题型、难度、项目归属和知识点', action: () => resetFilters('questions') },
    { category: '页面导航', label: '规则配置', desc: '查看教学管理模块和诊断学习规则', action: () => resetFilters('rules') },
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
  const shellBg = consoleLayout.darkMode ? '#111827' : '#eef4f3'
  const surfaceBg = consoleLayout.darkMode ? '#182232' : 'rgba(255,255,255,0.92)'
  const surfaceBorder = consoleLayout.darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(31,71,92,0.1)'
  const bodyText = consoleLayout.darkMode ? '#f4f4f5' : '#183b4b'
  const mutedText = consoleLayout.darkMode ? '#bfcbd9' : '#6b8a98'
  const sidebarBg = sidebarDark ? '#1f2d3d' : '#fff'
  const sidebarText = sidebarDark ? '#bfcbd9' : '#46606f'
  const sidebarActiveText = sidebarDark ? '#fff' : themeColor

  function renderToolbar(kind: 'students' | 'knowledge' | 'questions') {
    return (
      <div style={{ ...PANEL, padding: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Filter size={16} color="#1d6f78" />
        <label style={{ height: 38, minWidth: 240, display: 'flex', alignItems: 'center', gap: 8, padding: '0 11px', borderRadius: 8, border: '1px solid rgba(31,71,92,0.16)', background: '#fff' }}>
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

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          <div style={{ ...PANEL, padding: 16, display: 'grid', gap: 12 }}>
            <strong style={{ color: '#183b4b' }}>学生层次分布</strong>
            <ProgressBar items={overview.distributions.education} />
          </div>
          <div style={{ ...PANEL, padding: 16, display: 'grid', gap: 12 }}>
            <strong style={{ color: '#183b4b' }}>专业方向分布</strong>
            <ProgressBar items={overview.distributions.major} />
          </div>
          <div style={{ ...PANEL, padding: 16, display: 'grid', gap: 12 }}>
            <strong style={{ color: '#183b4b' }}>题型分布</strong>
            <ProgressBar items={overview.distributions.questionType} />
          </div>
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
    return (
      <>
        {renderToolbar('students')}
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

  function renderProjects() {
    if (!overview) return null

    return (
      <section style={{ ...PANEL, overflow: 'hidden' }}>
        <div style={TABLE_HEADER}>
          <strong style={{ color: '#183b4b' }}>项目任务覆盖</strong>
          <span style={{ color: '#6b8a98', fontSize: 12 }}>共 {overview.projectTasks.length} 个项目</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr>
                <th style={TH}>项目</th>
                <th style={TH}>层次</th>
                <th style={TH}>任务</th>
                <th style={TH}>知识/技能</th>
                <th style={TH}>题库</th>
              </tr>
            </thead>
            <tbody>
              {overview.projectTasks.map(project => (
                <tr key={project.projectName}>
                  <td style={TD}><strong style={{ color: '#183b4b' }}>{project.projectName}</strong></td>
                  <td style={TD}>{project.eduLevels.join('、') || '未设置'}</td>
                  <td style={TD}>{project.taskCount} 个<br /><span style={{ color: '#6b8a98' }}>{project.taskNames.join('、') || '暂无任务名'}</span></td>
                  <td style={TD}>{project.knowledgeCount} 知识点 / {project.skillCount} 技能点</td>
                  <td style={TD}><Pill tone={project.questionCount > 0 ? 'green' : 'orange'}>{project.questionCount} 题</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={TH}>编号/名称</th>
                  <th style={TH}>类型</th>
                  <th style={TH}>层次</th>
                  <th style={TH}>项目任务</th>
                  <th style={TH}>GMP条款</th>
                </tr>
              </thead>
              <tbody>
                {filteredKnowledge.map(item => (
                  <tr key={item.kpId}>
                    <td style={TD}><strong style={{ display: 'block', color: '#183b4b' }}>{item.title}</strong><span style={{ color: '#6b8a98' }}>{item.serialCode || item.kpId}</span></td>
                    <td style={TD}><Pill tone={item.pointType === '技能点' ? 'orange' : 'blue'}>{item.pointType}</Pill><br />难度 {item.difficulty}</td>
                    <td style={TD}>{item.eduLevel}</td>
                    <td style={TD}>{item.projectName}<br /><span style={{ color: '#6b8a98' }}>{item.taskName}</span></td>
                    <td style={TD}>{item.gmpArticles || '未关联'}</td>
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
    return (
      <>
        {renderToolbar('questions')}
        <section style={{ ...PANEL, overflow: 'hidden' }}>
          <div style={TABLE_HEADER}>
            <strong style={{ color: '#183b4b' }}>题库列表</strong>
            <span style={{ color: '#6b8a98', fontSize: 12 }}>显示 {filteredQuestions.length} 题</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={TH}>题干</th>
                  <th style={TH}>题型/难度</th>
                  <th style={TH}>所属项目</th>
                  <th style={TH}>知识点</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuestions.map(item => (
                  <tr key={item.questionId}>
                    <td style={TD}><strong style={{ color: '#183b4b' }}>{item.stem}</strong></td>
                    <td style={TD}><div style={{ display: 'grid', gap: 6 }}><Pill tone="blue">{item.questionType}</Pill><Pill tone={item.difficulty === '易' ? 'green' : 'orange'}>{item.difficulty}</Pill></div></td>
                    <td style={TD}>{item.projectName}<br /><span style={{ color: '#6b8a98' }}>{item.taskName}</span></td>
                    <td style={TD}>{item.knowledgeTitle}</td>
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
      <section style={{ ...PANEL, padding: 18, display: 'grid', gap: 14 }}>
        <strong style={{ color: '#183b4b', fontSize: 16 }}>管理模块建设清单</strong>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
          {overview.managementModules.map(module => (
            <div key={module.key} style={{ padding: 14, borderRadius: 8, background: module.status === 'first' ? 'rgba(29,111,120,0.06)' : '#f8fbfc', border: module.status === 'first' ? '1px solid rgba(29,111,120,0.18)' : '1px solid rgba(34,73,84,0.08)', display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <strong style={{ color: '#183b4b', fontSize: 14 }}>{module.title}</strong>
                <Pill tone={module.status === 'first' ? 'green' : 'neutral'}>{module.status === 'first' ? '第一批' : '后续'}</Pill>
              </div>
              <p style={{ margin: 0, color: '#6b7d86', fontSize: 13, lineHeight: 1.65 }}>{module.desc}</p>
            </div>
          ))}
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
        onClose={() => resetFilters('overview')}
      />
    )
  }

  function renderSection() {
    if (activeSection === 'profile') return renderProfile()
    if (!overview) return <div style={{ ...PANEL, padding: 22, color: '#6b8a98' }}>暂无教师端数据。</div>

    if (activeSection === 'overview') return renderOverview()
    if (activeSection === 'students') return renderStudents()
    if (activeSection === 'projects') return renderProjects()
    if (activeSection === 'knowledge') return renderKnowledge()
    if (activeSection === 'questions') return renderQuestions()
    if (activeSection === 'rules') return renderRules()
    return renderExports()
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#eef4f3' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#1d6f78', fontWeight: 700 }}>
          <LoaderCircle size={18} className="animate-spin" />
          正在进入教师端...
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: showSidebar ? `${sidebarWidth}px minmax(0, 1fr)` : 'minmax(0, 1fr)', background: shellBg, color: bodyText }}>
      {showSidebar && (
      <aside style={{ position: 'sticky', top: 0, height: '100vh', background: sidebarBg, color: sidebarText, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${surfaceBorder}`, transition: 'width 0.2s, background 0.2s' }}>
        {consoleLayout.toggles.showLogo && (
        <div style={{ height: 58, display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', gap: 12, padding: sidebarCollapsed ? '0 12px' : '0 18px', borderBottom: `1px solid ${surfaceBorder}` }}>
          <div style={{ width: 32, height: 32, borderRadius: consoleRadius, background: `linear-gradient(135deg,${themeColor},#409eff)`, display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800 }}>T</div>
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
              <button key={item.key} title={sidebarCollapsed ? item.label : undefined} onClick={() => resetFilters(item.key)} style={{ display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', gap: sidebarCollapsed ? 0 : 10, padding: sidebarCollapsed ? '10px 0' : '10px 12px', borderRadius: consoleRadius, border: 'none', background: active ? (sidebarDark ? `${themeColor}42` : softThemeBg) : 'transparent', color: active ? sidebarActiveText : sidebarText, cursor: 'pointer', textAlign: 'left', fontSize: 13, fontWeight: active ? 700 : 400 }}>
                <Icon size={15} />
                {!sidebarCollapsed && item.label}
              </button>
            )
          })}
        </nav>

        <div style={{ marginTop: 'auto', padding: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {!sidebarCollapsed && (
            <div style={{ padding: '8px 10px', display: 'grid', gap: 2 }}>
              <strong style={{ color: sidebarDark ? '#fff' : bodyText, fontSize: 13 }}>{displayName}</strong>
              <span style={{ color: sidebarText, fontSize: 12 }}>教师 / 教学管理员</span>
            </div>
          )}
          <button onClick={logout} style={{ width: '100%', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#d8e2e8', cursor: 'pointer' }}>
            <LogOut size={14} />
            {!sidebarCollapsed && '退出登录'}
          </button>
        </div>
      </aside>
      )}

      <main style={{ padding: consoleFullscreen ? 18 : 22, display: 'grid', gap: 16, alignContent: 'start', minWidth: 0 }}>
        <header style={{ position: consoleLayout.toggles.fixedHeader ? 'sticky' : 'relative', top: 0, zIndex: 30, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: 14, margin: -14, marginBottom: 2, borderRadius: consoleRadius, background: headerDark ? 'rgba(31,45,61,0.96)' : surfaceBg, border: `1px solid ${surfaceBorder}` }}>
          <div>
            <p style={{ margin: 0, color: themeColor, fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>Teacher Console</p>
            <h1 style={{ margin: '6px 0 0', color: headerDark ? '#f4f4f5' : bodyText, fontSize: 28, lineHeight: 1.2 }}>{activeNav.title}</h1>
            <p style={{ margin: '8px 0 0', color: headerDark ? '#bfcbd9' : mutedText, lineHeight: 1.7 }}>{activeNav.desc}</p>
          </div>
          <ConsoleHeaderActions
            displayName={displayName}
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

        {topMenuMode && !consoleFullscreen && (
          <nav style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', padding: 10, borderRadius: consoleRadius, background: surfaceBg, border: `1px solid ${surfaceBorder}` }}>
            {NAV_ITEMS.map(item => {
              const active = item.key === activeSection
              const Icon = item.icon
              return (
                <button key={item.key} onClick={() => resetFilters(item.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: consoleRadius, border: `1px solid ${active ? themeColor : surfaceBorder}`, background: active ? softThemeBg : 'transparent', color: active ? themeColor : mutedText, cursor: 'pointer', fontSize: 13, fontWeight: active ? 700 : 500, whiteSpace: 'nowrap' }}>
                  <Icon size={14} />
                  {item.label}
                </button>
              )
            })}
          </nav>
        )}

        {consoleLayout.toggles.showTagsView && activeSection !== 'overview' && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, width: 'fit-content', padding: '5px 12px', borderRadius: 999, background: softThemeBg, border: `1px solid ${themeColor}33`, color: themeColor, fontSize: 12, fontWeight: 700 }}>
            {consoleLayout.toggles.showTabIcon && <span style={{ width: 6, height: 6, borderRadius: '50%', background: themeColor }} />}
            {activeNav.title}
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

        {overview && activeSection !== 'overview' && activeSection !== 'profile' && (
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
  borderRadius: 8,
  border: '1px solid rgba(31,71,92,0.16)',
  background: '#fff',
  color: '#314d5b',
  padding: '0 10px',
  fontSize: 13,
  minWidth: 120,
}

const NOTICE_STYLE: CSSProperties = {
  padding: 12,
  borderRadius: 8,
  background: '#f8fbfc',
  color: '#46606f',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
}

const TABLE_HEADER: CSSProperties = {
  padding: '14px 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  borderBottom: '1px solid rgba(31,71,92,0.1)',
}

const EXPORT_BUTTON: CSSProperties = {
  ...PANEL,
  padding: 18,
  textAlign: 'left',
  cursor: 'pointer',
  display: 'grid',
  gap: 10,
}
