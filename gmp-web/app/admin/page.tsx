'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart3,
  Database,
  GitBranch,
  Layers,
  LoaderCircle,
  LogOut,
  Network,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  UsersRound,
  X,
} from 'lucide-react'
import ConsoleHeaderActions, { DEFAULT_CONSOLE_LAYOUT, type ConsoleLayoutConfig } from '../components/ConsoleHeaderActions'
import RoleProfileCenter from '../components/RoleProfileCenter'

type AdminSection = 'overview' | 'users' | 'mindmap' | 'dependencies' | 'system' | 'profile'
type Role = 'student' | 'teacher' | 'admin'

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

const NAV_ITEMS: Array<{ key: AdminSection; label: string; icon: typeof BarChart3 }> = [
  { key: 'overview', label: '系统总览', icon: BarChart3 },
  { key: 'users', label: '用户与权限', icon: UserCog },
  { key: 'mindmap', label: '知识图谱', icon: Network },
  { key: 'dependencies', label: '依赖关系', icon: GitBranch },
  { key: 'system', label: '系统配置', icon: ShieldCheck },
]

const SECTION_LABELS: Record<AdminSection, string> = {
  overview: '系统总览',
  users: '用户与权限',
  mindmap: '知识图谱',
  dependencies: '依赖关系',
  system: '系统配置',
  profile: '个人中心',
}

const ROLE_LABEL: Record<Role, string> = {
  student: '学生',
  teacher: '教师',
  admin: '管理员',
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

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  const data = text ? JSON.parse(text) : {}
  if (!response.ok) {
    throw new Error(data.error || `请求失败：${response.status}`)
  }
  return data as T
}

function inputClass() {
  return 'h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100'
}

function textareaClass() {
  return 'min-h-20 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100'
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number | string; icon: typeof BarChart3 }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-500">{label}</span>
        <Icon size={18} className="text-teal-700" />
      </div>
      <strong className="mt-2 block text-2xl text-slate-900">{value}</strong>
    </div>
  )
}

function DistributionList({ title, items }: { title: string; items: Array<{ label: string; value: number }> }) {
  const max = Math.max(...items.map(item => item.value), 1)

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      <div className="mt-3 grid gap-3">
        {items.length === 0 && <p className="text-sm text-slate-500">暂无数据</p>}
        {items.map(item => (
          <div key={item.label}>
            <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
              <span>{item.label}</span>
              <strong className="text-slate-700">{item.value}</strong>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-teal-600" style={{ width: `${Math.max(8, (item.value / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
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
  const [usersData, setUsersData] = useState<UsersResponse>({ items: [], total: 0 })
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | Role>('all')
  const [userSearch, setUserSearch] = useState('')
  const [userForm, setUserForm] = useState<UserForm>(EMPTY_USER_FORM)
  const [editingUserId, setEditingUserId] = useState('')
  const [savingUser, setSavingUser] = useState(false)

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

  const [dependencies, setDependencies] = useState<DependencyItem[]>([])
  const [depFrom, setDepFrom] = useState('')
  const [depTo, setDepTo] = useState('')

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
    if (section === 'users') loadUsers().catch(err => setError(err.message))
    if (section === 'mindmap') {
      loadMindmap().catch(err => setError(err.message))
      loadKnowledgeOptions().catch(err => setError(err.message))
    }
    if (section === 'dependencies') {
      loadKnowledgeOptions().catch(err => setError(err.message))
      loadDependencies().catch(err => setError(err.message))
    }
    if (section === 'profile') loadOwnProfile().catch(err => setError(err.message))
  }, [loadDependencies, loadKnowledgeOptions, loadMindmap, loadOverview, loadOwnProfile, loadUsers, section, token])

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
      <div className="grid min-h-screen place-items-center bg-slate-100">
        <div className="flex items-center gap-2 text-sm font-bold text-teal-700">
          <LoaderCircle size={18} className="animate-spin" />
          正在进入管理员端...
        </div>
      </div>
    )
  }

  const stats = overview ? [
    { label: '总用户', value: overview.summary.totalUsers, icon: UsersRound },
    { label: '教师', value: overview.summary.teacherCount, icon: ShieldCheck },
    { label: '学生', value: overview.summary.studentCount, icon: UserCog },
    { label: '题库', value: overview.summary.questionCount, icon: Database },
    { label: '知识点', value: overview.summary.knowledgeCount, icon: Network },
    { label: '技能点', value: overview.summary.skillCount, icon: Layers },
    { label: '答题记录', value: overview.summary.answerCount, icon: BarChart3 },
    { label: '待复核', value: overview.summary.pendingReviewCount, icon: GitBranch },
  ] : []

  const headerSearchItems = [
    { category: '页面导航', label: '系统总览', desc: '查看用户、题库、知识图谱和系统运行统计', action: () => setSection('overview') },
    { category: '页面导航', label: '用户与权限', desc: '管理学生、教师和管理员账号', action: () => setSection('users') },
    { category: '页面导航', label: '知识图谱', desc: '维护知识点、技能点和 GMP 条款映射', action: () => setSection('mindmap') },
    { category: '页面导航', label: '依赖关系', desc: '维护知识点之间的前后置关系', action: () => setSection('dependencies') },
    { category: '页面导航', label: '系统配置', desc: '查看系统状态和规划配置项', action: () => setSection('system') },
    { category: '账号', label: '个人中心', desc: '维护管理员个人资料和账号安全设置', action: openProfile },
  ]

  const headerNotifications = [
    { id: 'admin-users', icon: '户', title: '用户规模', desc: overview ? `系统当前共有 ${overview.summary.totalUsers} 个用户账号。` : '系统总览加载后显示用户统计。', time: '刚刚', read: false },
    { id: 'admin-teachers', icon: '师', title: '教师账号', desc: overview ? `当前教师账号 ${overview.summary.teacherCount} 个，管理员 ${overview.summary.adminCount} 个。` : '可在用户与权限中管理教师和管理员。', time: '今日', read: true },
    { id: 'admin-db', icon: '库', title: '数据库状态', desc: overview?.systemStatus.database ? `数据库状态：${overview.systemStatus.database}` : '数据库状态可在系统配置中查看。', time: '本周', read: true },
  ]

  const consoleRadius = Math.max(4, Math.min(16, consoleLayout.pageRadius))
  const topMenuMode = consoleLayout.menuMode === 'top'
  const sidebarCollapsed = consoleLayout.menuMode === 'compact'
  const showSidebar = !consoleFullscreen && !topMenuMode
  const sidebarWidth = showSidebar ? (sidebarCollapsed ? 68 : 240) : 0
  const themeColor = consoleLayout.themeColor
  const softThemeBg = `${themeColor}1f`
  const sidebarDark = consoleLayout.darkMode || consoleLayout.themeStyle === 'side-dark'
  const headerDark = consoleLayout.darkMode || consoleLayout.themeStyle === 'top-dark'
  const shellBg = consoleLayout.darkMode ? '#111827' : '#f1f5f9'
  const surfaceBg = consoleLayout.darkMode ? '#182232' : '#fff'
  const surfaceBorder = consoleLayout.darkMode ? 'rgba(255,255,255,0.1)' : 'rgb(226,232,240)'
  const bodyText = consoleLayout.darkMode ? '#f4f4f5' : '#0f172a'
  const mutedText = consoleLayout.darkMode ? '#bfcbd9' : '#64748b'
  const sidebarBg = sidebarDark ? '#0f172a' : '#fff'
  const sidebarText = sidebarDark ? '#cbd5e1' : '#475569'
  const sidebarActiveText = sidebarDark ? '#fff' : themeColor

  return (
    <div className="min-h-screen" style={{ background: shellBg, color: bodyText }}>
      <div className="grid min-h-screen" style={{ gridTemplateColumns: showSidebar ? `${sidebarWidth}px minmax(0,1fr)` : 'minmax(0,1fr)' }}>
        {showSidebar && (
        <aside className="sticky top-0 flex h-screen flex-col" style={{ background: sidebarBg, color: sidebarText, borderRight: `1px solid ${surfaceBorder}`, transition: 'width 0.2s, background 0.2s' }}>
          {consoleLayout.toggles.showLogo && (
          <div className="flex h-16 items-center gap-3 border-b px-5" style={{ justifyContent: sidebarCollapsed ? 'center' : 'flex-start', borderColor: surfaceBorder, paddingLeft: sidebarCollapsed ? 12 : 20, paddingRight: sidebarCollapsed ? 12 : 20 }}>
            <div className="grid h-9 w-9 place-items-center text-sm font-black text-white" style={{ borderRadius: consoleRadius, background: themeColor }}>A</div>
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
                  onClick={() => setSection(item.key)}
                  className="flex items-center text-left text-sm transition"
                  style={{
                    justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                    gap: sidebarCollapsed ? 0 : 12,
                    borderRadius: consoleRadius,
                    padding: sidebarCollapsed ? '10px 0' : '10px 12px',
                    background: active ? (sidebarDark ? `${themeColor}cc` : softThemeBg) : 'transparent',
                    color: active ? sidebarActiveText : sidebarText,
                    fontWeight: active ? 800 : 500,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <Icon size={16} />
                  {!sidebarCollapsed && item.label}
                </button>
              )
            })}
          </nav>

          <div className="mt-auto border-t p-3" style={{ borderColor: surfaceBorder }}>
            {!sidebarCollapsed && (
              <div className="p-3" style={{ borderRadius: consoleRadius, background: sidebarDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)' }}>
                <strong className="block text-sm" style={{ color: sidebarDark ? '#fff' : bodyText }}>{displayName}</strong>
                <span className="text-xs" style={{ color: sidebarText }}>系统管理员</span>
              </div>
            )}
            <button
              onClick={logout}
              className="mt-3 flex w-full items-center justify-center gap-2 px-3 py-2 text-sm"
              style={{ borderRadius: consoleRadius, border: `1px solid ${surfaceBorder}`, color: sidebarText, background: 'transparent', cursor: 'pointer' }}
            >
              <LogOut size={15} />
              {!sidebarCollapsed && '退出登录'}
            </button>
          </div>
        </aside>
        )}

        <main className="grid content-start gap-5 p-6" style={{ minWidth: 0 }}>
          <header className="flex items-start justify-between gap-4" style={{ position: consoleLayout.toggles.fixedHeader ? 'sticky' : 'relative', top: 0, zIndex: 30, padding: 14, margin: -14, marginBottom: 6, borderRadius: consoleRadius, background: headerDark ? 'rgba(15,23,42,0.96)' : surfaceBg, border: `1px solid ${surfaceBorder}` }}>
            <div>
              <p className="m-0 text-xs font-black uppercase tracking-widest" style={{ color: themeColor }}>Admin Console</p>
              <h1 className="mt-1 text-2xl font-black" style={{ color: headerDark ? '#f4f4f5' : bodyText }}>{SECTION_LABELS[section]}</h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (section === 'overview') loadOverview().catch(err => setError(err.message))
                  if (section === 'users') loadUsers().catch(err => setError(err.message))
                  if (section === 'mindmap') loadMindmap().catch(err => setError(err.message))
                  if (section === 'dependencies') loadDependencies().catch(err => setError(err.message))
                  if (section === 'profile') loadOwnProfile().catch(err => setError(err.message))
                }}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-bold shadow-sm"
                style={{ borderRadius: consoleRadius, border: `1px solid ${surfaceBorder}`, background: surfaceBg, color: headerDark ? '#f4f4f5' : '#334155' }}
              >
                <RefreshCw size={15} />
                刷新
              </button>

              <ConsoleHeaderActions
                displayName={displayName}
                searchItems={headerSearchItems}
                notifications={headerNotifications}
                onProfile={openProfile}
                onLogout={logout}
                onHelp={() => setSection('system')}
                onFullscreenChange={setConsoleFullscreen}
                onLayoutChange={setConsoleLayout}
                title={SECTION_LABELS[section]}
              />
            </div>
          </header>

          {topMenuMode && !consoleFullscreen && (
            <nav className="flex items-center gap-2 overflow-x-auto p-2" style={{ borderRadius: consoleRadius, background: surfaceBg, border: `1px solid ${surfaceBorder}` }}>
              {NAV_ITEMS.map(item => {
                const Icon = item.icon
                const active = item.key === section
                return (
                  <button key={item.key} onClick={() => setSection(item.key)} className="inline-flex items-center gap-2 whitespace-nowrap px-3 py-2 text-sm" style={{ borderRadius: consoleRadius, border: `1px solid ${active ? themeColor : surfaceBorder}`, background: active ? softThemeBg : 'transparent', color: active ? themeColor : mutedText, cursor: 'pointer', fontWeight: active ? 800 : 500 }}>
                    <Icon size={15} />
                    {item.label}
                  </button>
                )
              })}
            </nav>
          )}

          {consoleLayout.toggles.showTagsView && section !== 'overview' && (
            <div className="inline-flex w-fit items-center gap-2 px-3 py-1 text-xs font-bold" style={{ borderRadius: 999, background: softThemeBg, border: `1px solid ${themeColor}33`, color: themeColor }}>
              {consoleLayout.toggles.showTabIcon && <span style={{ width: 6, height: 6, borderRadius: '50%', background: themeColor }} />}
              {SECTION_LABELS[section]}
            </div>
          )}

          {error && (
            <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <span>{error}</span>
              <button onClick={() => setError('')} className="text-red-500 hover:text-red-700"><X size={16} /></button>
            </div>
          )}

          {notice && (
            <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <span>{notice}</span>
              <button onClick={() => setNotice('')} className="text-emerald-500 hover:text-emerald-700"><X size={16} /></button>
            </div>
          )}

          {section === 'overview' && (
            <section className="grid gap-4">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
                {stats.map(item => <StatCard key={item.label} {...item} />)}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <DistributionList title="角色分布" items={overview?.distributions.byRole ?? []} />
                <DistributionList title="学历分布" items={overview?.distributions.byEducation ?? []} />
                <DistributionList title="题型分布" items={overview?.distributions.byQuestionType ?? []} />
                <DistributionList title="难度分布" items={overview?.distributions.byQuestionDifficulty ?? []} />
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900">管理模块</h3>
                <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
                  {(overview?.modules ?? []).map(item => (
                    <button
                      key={item.key}
                      onClick={() => {
                        if (item.key === 'users' || item.key === 'mindmap') setSection(item.key)
                        if (item.key === 'deps') setSection('dependencies')
                      }}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-left hover:border-teal-300 hover:bg-teal-50"
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
              onClose={() => setSection('overview')}
            />
          )}

          {section === 'users' && (
            <section className="grid grid-cols-[minmax(0,1fr)_360px] gap-4">
              <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center gap-3 border-b border-slate-200 p-4">
                  <select value={userRoleFilter} onChange={event => setUserRoleFilter(event.target.value as 'all' | Role)} className={inputClass()}>
                    <option value="all">全部角色</option>
                    <option value="student">学生</option>
                    <option value="teacher">教师</option>
                    <option value="admin">管理员</option>
                  </select>
                  <div className="flex h-9 min-w-80 items-center gap-2 rounded-md border border-slate-200 px-3">
                    <Search size={15} className="text-slate-400" />
                    <input value={userSearch} onChange={event => setUserSearch(event.target.value)} placeholder="搜索姓名、邮箱、班级" className="w-full bg-transparent text-sm outline-none" />
                  </div>
                </div>
                <div className="overflow-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-xs text-slate-500">
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

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-black text-slate-900">{editingUserId ? '编辑用户' : '新增用户'}</h3>
                  {editingUserId && <button onClick={resetUserForm} className="text-xs font-bold text-slate-500 hover:text-teal-700">取消编辑</button>}
                </div>
                <div className="grid gap-3">
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
                  <input className={inputClass()} value={userForm.major} onChange={event => setUserForm({ ...userForm, major: event.target.value })} placeholder="专业" />
                  <input className={inputClass()} value={userForm.className} onChange={event => setUserForm({ ...userForm, className: event.target.value })} placeholder="班级" />
                  <input className={inputClass()} value={userForm.studentId} onChange={event => setUserForm({ ...userForm, studentId: event.target.value })} placeholder="学号/工号" />
                  <input className={inputClass()} value={userForm.phone} onChange={event => setUserForm({ ...userForm, phone: event.target.value })} placeholder="手机号" />
                  <button onClick={saveUser} disabled={savingUser} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50">
                    {savingUser ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}
                    保存用户
                  </button>
                </div>
              </div>
            </section>
          )}

          {section === 'mindmap' && (
            <section className="grid grid-cols-[minmax(0,1fr)_380px] gap-4">
              <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="grid grid-cols-[150px_150px_180px_minmax(220px,1fr)] gap-3 border-b border-slate-200 p-4">
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
                  <div className="flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3">
                    <Search size={15} className="text-slate-400" />
                    <input value={kpSearch} onChange={event => { setKpSearch(event.target.value); setKpPage(1) }} placeholder="搜索名称、编号、GMP条款" className="w-full bg-transparent text-sm outline-none" />
                  </div>
                </div>
                <div className="overflow-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-xs text-slate-500">
                        <th className="px-4 py-3">编号</th>
                        <th className="px-4 py-3">名称</th>
                        <th className="px-4 py-3">类型</th>
                        <th className="px-4 py-3">项目/任务</th>
                        <th className="px-4 py-3">难度</th>
                        <th className="px-4 py-3">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mindmapData.items.map(item => (
                        <tr key={item.kpId} className="border-t border-slate-100">
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">{item.serialCode || item.kpId.slice(0, 12)}</td>
                          <td className="px-4 py-3">
                            <strong className="block max-w-80 truncate text-slate-900">{item.title}</strong>
                            <span className="block max-w-80 truncate text-xs text-slate-500">{item.gmpArticles || item.content || '-'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2 py-1 text-xs font-bold ${item.pointType === '技能点' ? 'bg-violet-50 text-violet-700' : 'bg-teal-50 text-teal-700'}`}>{item.pointType}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <span className="block max-w-56 truncate">{item.projectName || '-'}</span>
                            <span className="block max-w-56 truncate text-xs text-slate-400">{item.taskName || '-'}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{item.difficulty}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
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
                <div className="flex items-center justify-between border-t border-slate-200 p-4 text-sm text-slate-500">
                  <span>共 {mindmapData.total} 条</span>
                  <div className="flex gap-2">
                    <button disabled={kpPage <= 1} onClick={() => setKpPage(page => Math.max(1, page - 1))} className="rounded-md border border-slate-200 px-3 py-1 disabled:opacity-40">上一页</button>
                    <button disabled={kpPage * mindmapData.pageSize >= mindmapData.total} onClick={() => setKpPage(page => page + 1)} className="rounded-md border border-slate-200 px-3 py-1 disabled:opacity-40">下一页</button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-black text-slate-900">{editingKpId ? '编辑知识点' : '新增知识点'}</h3>
                  {editingKpId && <button onClick={resetKpForm} className="text-xs font-bold text-slate-500 hover:text-teal-700">取消编辑</button>}
                </div>
                <div className="grid gap-3">
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
                </div>
              </div>
            </section>
          )}

          {section === 'dependencies' && (
            <section className="grid gap-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-black text-slate-900">新增依赖关系</h3>
                <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3">
                  <select value={depFrom} onChange={event => setDepFrom(event.target.value)} className={inputClass()}>
                    <option value="">选择前置知识点</option>
                    {allKnowledge.map(item => <option key={item.kpId} value={item.kpId}>{item.serialCode ? `${item.serialCode} - ` : ''}{item.title}</option>)}
                  </select>
                  <select value={depTo} onChange={event => setDepTo(event.target.value)} className={inputClass()}>
                    <option value="">选择后续知识点</option>
                    {allKnowledge.map(item => <option key={item.kpId} value={item.kpId}>{item.serialCode ? `${item.serialCode} - ` : ''}{item.title}</option>)}
                  </select>
                  <button onClick={createDependency} className="inline-flex h-9 items-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800">
                    <Plus size={15} />
                    新增
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 p-4">
                  <h3 className="text-sm font-black text-slate-900">依赖关系列表</h3>
                </div>
                <div className="grid gap-2 p-4">
                  {dependencies.length === 0 && <p className="text-sm text-slate-500">暂无依赖关系。</p>}
                  {dependencies.map(dep => (
                    <div key={dep.id} className="grid grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
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
            <section className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-black text-slate-900">系统状态</h3>
                <div className="mt-3 grid gap-2 text-sm text-slate-600">
                  <div className="flex justify-between rounded-md bg-slate-50 px-3 py-2"><span>数据库</span><strong>{overview?.systemStatus.database || '正常'}</strong></div>
                  <div className="flex justify-between rounded-md bg-slate-50 px-3 py-2"><span>API服务</span><strong>{overview?.systemStatus.api || '正常'}</strong></div>
                  <div className="flex justify-between rounded-md bg-slate-50 px-3 py-2"><span>版本</span><strong>{overview?.systemStatus.version || '1.0.0'}</strong></div>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-black text-slate-900">规划功能</h3>
                <div className="mt-3 grid gap-2 text-sm text-slate-600">
                  <p className="rounded-md bg-slate-50 px-3 py-2">机构与班级数据范围</p>
                  <p className="rounded-md bg-slate-50 px-3 py-2">AI模型与提示词配置</p>
                  <p className="rounded-md bg-slate-50 px-3 py-2">数据库备份恢复与操作审计</p>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}
