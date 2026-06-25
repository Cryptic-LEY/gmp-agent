'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  Gauge, BookOpen, Flame, MessageSquare, Sparkles, Network,
  Building2, BarChart3, LogOut, ShoppingBag,
  Menu, Search, Bell, HelpCircle, Maximize, Minimize2, ChevronRight, X,
  GraduationCap, Globe, User, Settings2, Check,
} from 'lucide-react'
import { clearLocalStoragePreservingAiElf } from '@/lib/ai-elf-storage'

// ── Static constants ─────────────────────────────────────────────────────────

const NAV = [
  {
    group: '学习中心',
    items: [
      { label: '主页',     icon: Gauge,         href: '/dashboard' },
      { label: '课程学习', icon: GraduationCap, href: '/course'     },
      { label: '每日练习', icon: BookOpen,       href: '/practice'  },
      { label: '连续打卡', icon: Flame,          href: '/streak'    },
      { label: '我的进度', icon: Network,        href: '/progress'  },
      { label: '个性化学习', icon: Sparkles,     href: '/plan'      },
    ],
  },
  {
    group: 'AI 助手',
    items: [
      { label: 'AI 助学', icon: MessageSquare, href: '/chat' },
    ],
  },
  {
    group: '进阶功能',
    items: [
      { label: '实训仿真', icon: Building2, href: '/simulation' },
      { label: '成绩报告', icon: BarChart3, href: '/report'     },
      { label: '积分商店', icon: ShoppingBag, href: '/shop'      },
    ],
  },
]

const PAGE_LABELS: Record<string, string> = {
  '/course':   '课程学习',
  '/practice': '每日练习',
  '/streak':   '连续打卡',
  '/progress': '我的进度',
  '/plan':     '个性化学习',
  '/chat':     'AI 助学',
  '/simulation': '实训仿真',
  '/report':     '成绩报告',
  '/shop':       '积分商店',
  '/profile':    '个人中心',
  '/help':       '帮助中心',
}

const SEARCH_ITEMS = [
  { category: '页面导航', label: '主页',       desc: '课程概述与学习进度总览',         href: '/dashboard' },
  { category: '页面导航', label: '课程学习',   desc: '完成 PPT、视频和章节测试获得课时分', href: '/course'    },
  { category: '页面导航', label: '每日练习',   desc: '完成每日 GMP 练习题',            href: '/practice'  },
  { category: '页面导航', label: '连续打卡',   desc: '查看打卡记录与连续天数',         href: '/streak'    },
  { category: '页面导航', label: '我的进度',   desc: '知识图谱个人掌握度可视化',       href: '/progress'  },
  { category: '页面导航', label: '个性化学习', desc: '生成专属学习路线',               href: '/plan'      },
  { category: '页面导航', label: 'AI 助学',    desc: '向 AI 提问 GMP 知识',           href: '/chat'      },
  { category: '页面导航', label: '实训仿真',   desc: '基于真实案例的情景测验',         href: '/simulation' },
  { category: '页面导航', label: '成绩报告',   desc: '查看答题统计与学习进度',         href: '/report'     },
  { category: '页面导航', label: '积分商店',   desc: '用打卡和答题积分兑换道具',       href: '/shop'       },
  { category: '帮助中心', label: '如何开始学习？', desc: '新手引导说明',     href: '/help'      },
  { category: '帮助中心', label: '打卡规则说明',   desc: '连续打卡奖励机制', href: '/help'      },
  { category: '帮助中心', label: 'AI 助学使用方法', desc: '如何有效提问',   href: '/help'      },
  { category: '帮助中心', label: '积分与等级系统', desc: '了解 XP 升级规则', href: '/help'      },
]

const NOTIFICATIONS = [
  { id: 1, icon: '🎉', title: '连续打卡奖励', desc: '每日打卡自动累计 XP，连续达成里程碑可获得额外奖励', time: '规则',   read: true,  href: '/streak'   },
  { id: 2, icon: '📚', title: '课程内容更新', desc: '第七章「确认与验证」已更新新内容',                   time: '1小时前', read: false, href: '/course'   },
  { id: 3, icon: '⚠️', title: '每日练习提醒', desc: '今日每日练习尚未完成，快去挑战吧！',                 time: '3小时前', read: false, href: '/practice' },
  { id: 4, icon: '🏆', title: '等级提升',     desc: '恭喜达到新等级：GMP 见习员',                         time: '昨天',   read: true,  href: '/report'   },
]

type LayoutKey = 'showTagsView' | 'showTabIcon' | 'fixedHeader' | 'showLogo' | 'dynamicTitle'
const LAYOUT_TOGGLES: { label: string; key: LayoutKey }[] = [
  { label: '开启 Tags-Views', key: 'showTagsView' },
  { label: '显示页签图标',   key: 'showTabIcon'   },
  { label: '固定 Header',    key: 'fixedHeader'   },
  { label: '显示 Logo',      key: 'showLogo'      },
  { label: '动态标题',       key: 'dynamicTitle'  },
]

type MenuMode = 'side' | 'top' | 'compact'
type ThemeStyle = 'side-dark' | 'top-dark'

interface LayoutConfig {
  menuMode: MenuMode
  themeStyle: ThemeStyle
  themeColor: string
  darkMode: boolean
  pageRadius: number
  toggles: Record<LayoutKey, boolean>
}

const LAYOUT_STORAGE_KEY = 'gmp.layout.settings'
const THEME_COLORS = ['#1d6f78', '#2563eb', '#7c3aed', '#dc2626', '#d97706']

const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  menuMode: 'side',
  themeStyle: 'side-dark',
  themeColor: '#1d6f78',
  darkMode: false,
  pageRadius: 6,
  toggles: {
    showTagsView: true,
    showTabIcon: false,
    fixedHeader: true,
    showLogo: true,
    dynamicTitle: false,
  },
}

function cloneLayoutConfig(config: LayoutConfig = DEFAULT_LAYOUT_CONFIG): LayoutConfig {
  return {
    ...config,
    toggles: { ...config.toggles },
  }
}

function mergeLayoutConfig(value: string | null): LayoutConfig {
  if (!value) return cloneLayoutConfig()

  try {
    const parsed = JSON.parse(value) as Partial<LayoutConfig>
    const menuMode: MenuMode = ['side', 'top', 'compact'].includes(parsed.menuMode as string)
      ? parsed.menuMode as MenuMode
      : DEFAULT_LAYOUT_CONFIG.menuMode
    const themeStyle: ThemeStyle = ['side-dark', 'top-dark'].includes(parsed.themeStyle as string)
      ? parsed.themeStyle as ThemeStyle
      : DEFAULT_LAYOUT_CONFIG.themeStyle
    const themeColor = typeof parsed.themeColor === 'string' && THEME_COLORS.includes(parsed.themeColor)
      ? parsed.themeColor
      : DEFAULT_LAYOUT_CONFIG.themeColor

    return {
      ...DEFAULT_LAYOUT_CONFIG,
      ...parsed,
      menuMode,
      themeStyle,
      themeColor,
      darkMode: typeof parsed.darkMode === 'boolean' ? parsed.darkMode : DEFAULT_LAYOUT_CONFIG.darkMode,
      pageRadius: typeof parsed.pageRadius === 'number' ? parsed.pageRadius : DEFAULT_LAYOUT_CONFIG.pageRadius,
      toggles: {
        ...DEFAULT_LAYOUT_CONFIG.toggles,
        ...(parsed.toggles ?? {}),
      },
    }
  } catch {
    return cloneLayoutConfig()
  }
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return `rgba(29,111,120,${alpha})`
  const value = parseInt(normalized, 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `rgba(${r},${g},${b},${alpha})`
}

// ── Component ────────────────────────────────────────────────────────────────

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()

  // Persistent
  const [displayName, setDisplayName] = useState('用户')
  const [avatarUrl, setAvatarUrl]     = useState<string | null>(null)
  const [lang, setLang]               = useState<'zh' | 'en'>('zh')
  const [streakDays, setStreakDays]   = useState(0)

  // Overlay visibility
  const [showSearch,      setShowSearch]      = useState(false)
  const [showNotif,       setShowNotif]       = useState(false)
  const [showUserMenu,    setShowUserMenu]    = useState(false)
  const [showLayoutPanel, setShowLayoutPanel] = useState(false)
  const [isFullscreen,    setIsFullscreen]    = useState(false)
  const [simulationImmersive, setSimulationImmersive] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(false)

  // Search
  const [searchQuery, setSearchQuery] = useState('')

  // Notifications
  const [notifs, setNotifs] = useState(NOTIFICATIONS)

  const [layoutConfig, setLayoutConfig] = useState<LayoutConfig>(() => cloneLayoutConfig())

  // Dropdown anchor refs
  const bellRef   = useRef<HTMLButtonElement>(null)
  const avatarRef = useRef<HTMLDivElement>(null)
  const [notifDropPos,   setNotifDropPos]   = useState({ top: 58, right: 220 })
  const [userMenuPos,    setUserMenuPos]    = useState({ top: 58, right: 20  })

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { router.push('/login'); return }
    setDisplayName(localStorage.getItem('displayName') || '用户')
    setAvatarUrl(localStorage.getItem('avatarUrl'))
    const saved = localStorage.getItem('lang') as 'zh' | 'en' | null
    if (saved) setLang(saved)
    setLayoutConfig(mergeLayoutConfig(localStorage.getItem(LAYOUT_STORAGE_KEY)))
    // 首次登录跳前测（onboarding_done 由前测完成后写入 localStorage）
    if (!localStorage.getItem('onboarding_done')) {
      router.push('/onboarding')
    }
    // 获取游戏状态（含打卡天数），同时触发每日签到
    fetch('/api/game/state', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.streakDays !== undefined) setStreakDays(data.streakDays)
        if ((data?.checkinXpAwarded ?? 0) <= 0) return

        const milestoneText = data.milestoneXpAwarded > 0
          ? `，含连续第 ${data.streakDays} 天里程碑 +${data.milestoneXpAwarded} XP`
          : ''
        setNotifs(previous => [{
          id: Date.now(),
          icon: '🎉',
          title: '今日打卡奖励已到账',
          desc: `本次获得 +${data.checkinXpAwarded} XP 与 +${data.pointsAwarded} 积分${milestoneText}`,
          time: '刚刚',
          read: false,
          href: '/streak',
        }, ...previous.filter(item => item.id !== 1)])
      })
      .catch(() => {})
    // 今日复习通知：检查遗忘曲线到期 KP 数
    fetch('/api/practice/review-queue', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || data.count === 0) return
        setNotifs(previous => {
          const filtered = previous.filter(n => n.id !== 3)
          return [...filtered, {
            id: 3,
            icon: '📖',
            title: '今日复习提醒',
            desc: `有 ${data.count} 个知识点根据遗忘曲线建议今天复习（其中 ${data.dueCount} 个已到期）`,
            time: '刚刚',
            read: false,
            href: '/practice',
          }]
        })
      })
      .catch(() => {})
    fetch('/api/user/profile', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        setDisplayName(data.displayName || '用户')
        setAvatarUrl(data.avatarUrl || null)
        localStorage.setItem('displayName', data.displayName || '用户')
        if (data.avatarUrl) localStorage.setItem('avatarUrl', data.avatarUrl)
        else localStorage.removeItem('avatarUrl')
      })
      .catch(() => {})
  }, [router])

  useEffect(() => {
    const updateViewportMode = () => setIsMobileViewport(window.innerWidth <= 820)
    updateViewportMode()
    window.addEventListener('resize', updateViewportMode)
    return () => window.removeEventListener('resize', updateViewportMode)
  }, [])

  useEffect(() => {
    function syncAvatar() {
      setAvatarUrl(localStorage.getItem('avatarUrl'))
    }
    window.addEventListener('profile-avatar-updated', syncAvatar)
    window.addEventListener('storage', syncAvatar)
    return () => {
      window.removeEventListener('profile-avatar-updated', syncAvatar)
      window.removeEventListener('storage', syncAvatar)
    }
  }, [])

  useEffect(() => {
    setShowNotif(false)
    setShowUserMenu(false)
    if (pathname !== '/simulation') setSimulationImmersive(false)
  }, [pathname])

  useEffect(() => {
    function syncSimulationImmersive(event: Event) {
      const immersive = Boolean((event as CustomEvent<boolean>).detail)
      setSimulationImmersive(immersive)
      if (immersive) {
        setShowSearch(false)
        setShowNotif(false)
        setShowUserMenu(false)
        setShowLayoutPanel(false)
      }
    }

    window.addEventListener('gmp-simulation-immersive', syncSimulationImmersive)
    return () => window.removeEventListener('gmp-simulation-immersive', syncSimulationImmersive)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSearch(false); setShowNotif(false)
        setShowUserMenu(false); setShowLayoutPanel(false)
        setIsFullscreen(false)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault(); setShowSearch(v => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (!layoutConfig.toggles.dynamicTitle) {
      document.title = 'GMP 助学平台'
      return
    }
    const label = PAGE_LABELS[pathname] || '主页'
    document.title = `${label} - GMP 助学平台`
  }, [pathname, layoutConfig.toggles.dynamicTitle])

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleLogout() { clearLocalStoragePreservingAiElf(); router.push('/login') }

  function toggleLang() {
    const next = lang === 'zh' ? 'en' : 'zh'
    setLang(next); localStorage.setItem('lang', next)
  }

  function openNotif() {
    if (bellRef.current) {
      const r = bellRef.current.getBoundingClientRect()
      setNotifDropPos({ top: r.bottom + 8, right: window.innerWidth - r.right })
    }
    setShowNotif(v => !v); setShowUserMenu(false)
  }

  function openUserMenu() {
    if (avatarRef.current) {
      const r = avatarRef.current.getBoundingClientRect()
      setUserMenuPos({ top: r.bottom + 8, right: window.innerWidth - r.right })
    }
    setShowUserMenu(v => !v); setShowNotif(false)
  }

  function closeDropdowns() { setShowNotif(false); setShowUserMenu(false) }

  function markAllRead() { setNotifs(prev => prev.map(n => ({ ...n, read: true }))) }

  function toggleLayout(key: LayoutKey) {
    setLayoutConfig(prev => ({
      ...prev,
      toggles: { ...prev.toggles, [key]: !prev.toggles[key] },
    }))
  }

  function selectMenuMode(menuMode: MenuMode) {
    setLayoutConfig(prev => ({ ...prev, menuMode }))
  }

  function selectThemeStyle(themeStyle: ThemeStyle) {
    setLayoutConfig(prev => ({ ...prev, themeStyle }))
  }

  function selectThemeColor(themeColor: string) {
    setLayoutConfig(prev => ({ ...prev, themeColor }))
  }

  function toggleDarkMode() {
    setLayoutConfig(prev => ({ ...prev, darkMode: !prev.darkMode }))
  }

  function setPageRadius(pageRadius: number) {
    setLayoutConfig(prev => ({ ...prev, pageRadius }))
  }

  function saveLayoutConfig() {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layoutConfig))
    setShowLayoutPanel(false)
  }

  function resetLayoutConfig() {
    const next = cloneLayoutConfig()
    setLayoutConfig(next)
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(next))
  }

  // ── Computed ────────────────────────────────────────────────────────────────

  const isHome       = pathname === '/dashboard'
  const currentLabel = PAGE_LABELS[pathname] || ''
  const unreadCount  = notifs.filter(n => !n.read).length
  const filteredSearch = searchQuery.trim()
    ? SEARCH_ITEMS.filter(i =>
        i.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        i.desc.toLowerCase().includes(searchQuery.toLowerCase()))
    : SEARCH_ITEMS

  // Group search results by category
  const groupedSearch = filteredSearch.reduce<Record<string, typeof SEARCH_ITEMS>>((acc, item) => {
    ;(acc[item.category] ??= []).push(item)
    return acc
  }, {})

  const themeColor = layoutConfig.themeColor
  const accentSoft = hexToRgba(themeColor, 0.1)
  const accentMedium = hexToRgba(themeColor, 0.22)
  const accentStrong = hexToRgba(themeColor, 0.28)
  const sidebarCollapsed = layoutConfig.menuMode === 'compact'
  const topMenuMode = layoutConfig.menuMode === 'top' || isMobileViewport
  const shellFullscreen = isFullscreen || simulationImmersive
  const sidebarWidth = shellFullscreen || topMenuMode ? 0 : sidebarCollapsed ? 68 : 232
  const sidebarDark = layoutConfig.themeStyle === 'side-dark' || layoutConfig.darkMode
  const headerDark = layoutConfig.themeStyle === 'top-dark' || layoutConfig.darkMode
  const shellBg = layoutConfig.darkMode
    ? 'linear-gradient(180deg,#101827 0%,#111827 46%,#172033 100%)'
    : 'linear-gradient(180deg,#f6fbfb 0%,#eef6f2 48%,#f7f4ef 100%)'
  const surfaceBg = layoutConfig.darkMode ? '#182232' : '#ffffff'
  const surfaceSubtleBg = layoutConfig.darkMode ? '#111827' : '#f5f8f9'
  const surfaceBorder = layoutConfig.darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(30,77,88,0.10)'
  const bodyText = layoutConfig.darkMode ? '#f4f4f5' : '#183b4b'
  const mutedText = layoutConfig.darkMode ? '#bfcbd9' : '#6b8a98'
  const headerBg = headerDark ? 'rgba(20,31,47,0.96)' : 'rgba(255,255,255,0.82)'
  const headerText = headerDark ? '#f4f4f5' : '#183b4b'
  const headerMuted = headerDark ? '#bfcbd9' : '#6b8a98'
  const sidebarBg = sidebarDark ? 'linear-gradient(180deg,#102234 0%,#0d1b2b 100%)' : '#ffffff'
  const sidebarText = sidebarDark ? '#bfcbd9' : '#46606f'
  const sidebarActiveText = sidebarDark ? '#f4f4f5' : themeColor
  const sidebarBorder = sidebarDark ? 'rgba(255,255,255,0.06)' : 'rgba(31,71,92,0.1)'
  const pageRadius = layoutConfig.pageRadius
  const controlRadius = Math.max(4, Math.min(12, pageRadius))
  const headerPosition = layoutConfig.toggles.fixedHeader ? 'sticky' : 'relative'
  const tagsTop = layoutConfig.toggles.fixedHeader ? 50 : 0
  const headerIconButtonStyle: React.CSSProperties = { ...ICON_BTN, color: headerMuted, borderRadius: controlRadius }
  const topNavItems = NAV.flatMap(({ items }) => items)

  // ── JSX ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', maxWidth: isMobileViewport ? '100vw' : undefined, overflowX: isMobileViewport ? 'hidden' : undefined, background: shellBg, color: headerText }}>

      {/* ── Exit fullscreen button ── */}
      {isFullscreen && !simulationImmersive && (
        <button onClick={() => setIsFullscreen(false)} style={{
          position: 'fixed', top: 16, right: 16, zIndex: 9999,
          background: 'rgba(31,45,61,0.85)', color: '#fff', border: 'none',
          borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
          fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Minimize2 size={14} />退出全屏
        </button>
      )}

      {/* ── Sidebar ── */}
      {!shellFullscreen && !topMenuMode && (
        <aside style={{
          position: 'fixed', top: 0, left: 0, height: '100%', width: sidebarWidth,
          background: sidebarBg, display: 'flex', flexDirection: 'column', zIndex: 50,
          borderRight: `1px solid ${sidebarBorder}`, boxShadow: sidebarDark ? '10px 0 30px rgba(15,23,42,0.18)' : '8px 0 24px rgba(31,71,92,0.06)', transition: 'width 0.2s, background 0.2s',
        }}>

          {/* Logo */}
          {layoutConfig.toggles.showLogo && (
            <div style={{
              height: 64, display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
              padding: sidebarCollapsed ? '0 12px' : '0 20px', gap: 12, borderBottom: `1px solid ${sidebarBorder}`, flexShrink: 0,
            }}>
              <div style={{ width: 34, height: 34, borderRadius: controlRadius, background: '#fff', boxShadow: `0 10px 22px ${hexToRgba(themeColor, 0.18)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                <img src="/gmp-logo.png" alt="GMP" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              {!sidebarCollapsed && (
                <div>
                  <p style={{ color: sidebarActiveText, fontWeight: 800, fontSize: 14, margin: 0, lineHeight: 1.3 }}>GMP 助学平台</p>
                  <p style={{ color: sidebarText, fontSize: 11, margin: 0, opacity: 0.68 }}>药品质量管理</p>
                </div>
              )}
            </div>
          )}

          {/* Nav */}
          <nav style={{ flex: 1, overflowY: 'auto', padding: sidebarCollapsed ? '14px 8px' : '14px 10px' }}>
            {NAV.map(({ group, items }) => (
              <div key={group} style={{ marginBottom: 22 }}>
                {!sidebarCollapsed && (
                  <p style={{ color: sidebarText, fontSize: 11, fontWeight: 800, letterSpacing: 0, margin: '0 0 8px 10px', opacity: 0.55 }}>
                    {group}
                  </p>
                )}
                {items.map(({ label, icon: Icon, href }) => {
                  const active = href === pathname
                  if (!href) return (
                    <div key={label} title={label} style={{ display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'space-between', padding: sidebarCollapsed ? '9px 0' : '9px 10px', borderRadius: controlRadius, opacity: 0.32, cursor: 'not-allowed' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: sidebarCollapsed ? 0 : 10, color: sidebarText, fontSize: 13 }}>
                        <Icon size={15} strokeWidth={1.7} />{!sidebarCollapsed && label}
                      </span>
                      {!sidebarCollapsed && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: sidebarDark ? 'rgba(255,255,255,0.08)' : 'rgba(31,71,92,0.06)', color: sidebarText }}>即将</span>}
                    </div>
                  )
                  return (
                    <Link key={label} href={href} style={{
                      display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                      gap: sidebarCollapsed ? 0 : 11, padding: sidebarCollapsed ? '10px 0' : '10px 12px', borderRadius: controlRadius,
                      color: active ? sidebarActiveText : sidebarText,
                      background: active ? (sidebarDark ? 'rgba(45,157,143,0.18)' : accentSoft) : 'transparent',
                      border: `1px solid ${active ? (sidebarDark ? 'rgba(255,255,255,0.10)' : accentMedium) : 'transparent'}`,
                      boxShadow: active ? (sidebarDark ? 'inset 3px 0 0 rgba(255,255,255,0.75)' : `inset 3px 0 0 ${themeColor}`) : 'none',
                      fontWeight: active ? 700 : 500,
                      fontSize: 13, textDecoration: 'none', transition: 'background 0.15s',
                    }} title={sidebarCollapsed ? label : undefined}>
                      <Icon size={15} strokeWidth={active ? 2.2 : 1.7} />{!sidebarCollapsed && label}
                    </Link>
                  )
                })}
              </div>
            ))}
          </nav>

          {/* User */}
          <div style={{ padding: '12px', borderTop: `1px solid ${sidebarBorder}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', gap: 10, padding: sidebarCollapsed ? '8px 0' : '10px 10px', borderRadius: controlRadius, background: sidebarDark ? 'rgba(255,255,255,0.04)' : 'rgba(31,71,92,0.04)' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg,${themeColor},#35818a)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>{displayName[0]}</span>
              </div>
              {!sidebarCollapsed && (
                <>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: sidebarText, fontSize: 13 }}>{displayName}</span>
                  <button onClick={handleLogout} title="退出登录" style={{ background: 'none', border: 'none', cursor: 'pointer', color: sidebarText, opacity: 0.45, padding: 4, display: 'flex', alignItems: 'center' }}>
                    <LogOut size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
        </aside>
      )}

      {/* ── Main column ── */}
      <div style={{ marginLeft: sidebarWidth, flex: 1, minWidth: 0, width: isMobileViewport ? '100%' : undefined, maxWidth: isMobileViewport ? '100vw' : undefined, display: 'flex', flexDirection: 'column', minHeight: '100vh', overflowX: isMobileViewport ? 'hidden' : undefined, color: bodyText, transition: 'margin-left 0.2s' }}>

        {/* Top Navbar */}
        {!shellFullscreen && (
          <header style={{
            position: headerPosition, top: 0, zIndex: 40,
            height: isMobileViewport ? 52 : 58, display: 'flex', alignItems: 'center', padding: isMobileViewport ? '0 8px' : '0 18px', gap: isMobileViewport ? 6 : 10, overflow: 'hidden',
            background: headerBg, borderBottom: `1px solid ${surfaceBorder}`,
            backdropFilter: 'blur(18px)', boxShadow: headerDark ? '0 10px 28px rgba(0,0,0,0.16)' : '0 12px 28px rgba(31,71,92,0.07)',
          }}>
            <button style={{ ...headerIconButtonStyle, display: isMobileViewport ? 'none' : 'flex' }}>
              <Menu size={18} />
            </button>

            {topMenuMode && layoutConfig.toggles.showLogo && (
              <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 8, color: headerText, textDecoration: 'none', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                <img src="/gmp-logo.png" alt="GMP" style={{ width: 28, height: 28, borderRadius: controlRadius, objectFit: 'cover' }} />
                GMP 助学平台
              </Link>
            )}

            {topMenuMode ? (
              <nav style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto', scrollbarWidth: 'none' }}>
                {topNavItems.map(({ label, icon: Icon, href }) => {
                  const active = href === pathname
                  if (!href) {
                    return (
                      <span key={label} title="即将开放" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 10px', borderRadius: controlRadius, color: headerMuted, opacity: 0.45, cursor: 'not-allowed', fontSize: 13, whiteSpace: 'nowrap' }}>
                        <Icon size={14} />{label}
                      </span>
                    )
                  }
                  return (
                    <Link key={label} href={href} style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '7px 10px', borderRadius: controlRadius,
                      color: active ? themeColor : headerMuted, background: active ? accentSoft : 'transparent',
                      textDecoration: 'none', fontSize: 13, fontWeight: active ? 600 : 400, whiteSpace: 'nowrap',
                    }}>
                      <Icon size={14} strokeWidth={active ? 2.2 : 1.7} />{label}
                    </Link>
                  )
                })}
              </nav>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: headerMuted }}>
                <Link href="/dashboard" style={{ color: isHome ? headerText : headerMuted, fontWeight: isHome ? 600 : 400, textDecoration: 'none' }}>主页</Link>
                {!isHome && currentLabel && (
                  <>
                    <ChevronRight size={13} style={{ opacity: 0.5 }} />
                    <span style={{ color: headerText, fontWeight: 600 }}>{currentLabel}</span>
                  </>
                )}
              </div>
            )}

            {/* Right icons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>

              {/* Search */}
              <button onClick={() => setShowSearch(true)} title="搜索 (Ctrl+K)"
                style={headerIconButtonStyle}>
                <Search size={16} />
              </button>

              {/* Notifications */}
              <button ref={bellRef} onClick={openNotif} title="通知" style={{ ...headerIconButtonStyle, position: 'relative' }}>
                <Bell size={16} />
                {unreadCount > 0 && (
                  <span style={{ position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: '50%', background: '#ef4444', border: '1.5px solid #fff' }} />
                )}
              </button>

              {!isMobileViewport && (
                <>
              {/* Help */}
              <button onClick={() => router.push('/help')} title="帮助与支持" style={headerIconButtonStyle}>
                <HelpCircle size={16} />
              </button>

              {/* Fullscreen */}
              <button onClick={() => setIsFullscreen(v => !v)} title="全屏 / 退出全屏" style={headerIconButtonStyle}>
                <Maximize size={16} />
              </button>

              {/* Streak chip */}
              <button
                onClick={() => router.push('/streak')}
                title={streakDays > 0 ? `连续打卡 ${streakDays} 天，点击查看详情` : '今日尚未打卡，点击查看'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                  background: streakDays > 0 ? 'rgba(234,88,12,0.08)' : 'rgba(107,138,152,0.06)',
                  border: `1px solid ${streakDays > 0 ? 'rgba(234,88,12,0.28)' : 'rgba(107,138,152,0.18)'}`,
                  color: streakDays > 0 ? '#ea580c' : '#9ba8b0',
                  fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                  marginLeft: 2,
                }}
              >
                <Flame size={13} strokeWidth={streakDays > 0 ? 2.2 : 1.7}
                  style={{ color: streakDays > 0 ? '#f97316' : '#9ba8b0' }} />
                <span>{streakDays}天</span>
              </button>

              {/* Language */}
              <button onClick={toggleLang} title={lang === 'zh' ? 'Switch to English' : '切换为中文'}
                style={{ ...headerIconButtonStyle, gap: 3, fontSize: 11, fontWeight: 700, minWidth: 44 }}>
                <Globe size={14} />
                <span style={{ fontSize: 11, letterSpacing: 0 }}>{lang === 'zh' ? 'CN' : 'EN'}</span>
              </button>

                </>
              )}

              {/* User avatar */}
              <div ref={avatarRef} onClick={openUserMenu}
                style={{ position: 'relative', width: 28, height: 28, overflow: 'hidden', borderRadius: '50%', background: `linear-gradient(135deg,${themeColor},#35818a)`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 6, cursor: 'pointer', flexShrink: 0 }}>
                {avatarUrl ? (
                  <Image src={avatarUrl} alt={`${displayName}的头像`} fill unoptimized style={{ objectFit: 'cover' }} />
                ) : (
                  <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>{displayName[0]}</span>
                )}
              </div>
            </div>
          </header>
        )}

        {/* TagsView — hidden on home */}
        {!shellFullscreen && layoutConfig.toggles.showTagsView && !isHome && currentLabel && (
          <div style={{
            position: headerPosition, top: tagsTop, zIndex: 39,
            height: 36, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6,
            background: layoutConfig.darkMode ? 'rgba(24,34,50,0.92)' : 'rgba(255,255,255,0.88)', borderBottom: `1px solid ${surfaceBorder}`,
            overflowX: 'auto',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px 3px 12px', borderRadius: 999, background: accentSoft, border: `1px solid ${accentMedium}`, fontSize: 12, color: themeColor, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
              {layoutConfig.toggles.showTabIcon && <span style={{ width: 6, height: 6, borderRadius: '50%', background: themeColor }} />}
              {currentLabel}
              <X size={11} onClick={() => router.push('/dashboard')} style={{ cursor: 'pointer', opacity: 0.65, marginLeft: 2 }} />
            </div>
          </div>
        )}

        {/* Page content */}
        <div style={{ flex: 1, minHeight: 0, minWidth: 0, maxWidth: isMobileViewport ? '100vw' : undefined, overflowX: isMobileViewport ? 'hidden' : undefined }}>{children}</div>
      </div>

      {/* ══════ Overlays (all fixed, above stacking contexts) ══════ */}

      {/* Backdrop for inline dropdowns */}
      {(showNotif || showUserMenu) && (
        <div onClick={closeDropdowns} style={{ position: 'fixed', inset: 0, zIndex: 900 }} />
      )}

      {/* Notification dropdown */}
      {showNotif && (
        <div style={{
          position: 'fixed', top: notifDropPos.top, right: notifDropPos.right,
          width: 340, background: '#fff', borderRadius: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.14)', border: '1px solid rgba(31,71,92,0.1)', zIndex: 901,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(31,71,92,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#183b4b' }}>
              通知
              {unreadCount > 0 && <span style={{ marginLeft: 6, fontSize: 11, background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 6px' }}>{unreadCount}</span>}
            </span>
            <button onClick={markAllRead} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#1d6f78', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Check size={12} />全部已读
            </button>
          </div>
          {notifs.map(n => (
            <div key={n.id} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: '1px solid rgba(31,71,92,0.05)', background: n.read ? 'transparent' : 'rgba(29,111,120,0.04)' }}>
              <span style={{ fontSize: 18, lineHeight: '20px', flexShrink: 0 }}>{n.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontWeight: n.read ? 400 : 600, fontSize: 13, color: '#183b4b' }}>{n.title}</span>
                  <span style={{ fontSize: 11, color: '#9ba8b0', whiteSpace: 'nowrap', marginLeft: 8 }}>{n.time}</span>
                </div>
                <p style={{ fontSize: 12, color: '#6b8a98', margin: 0, lineHeight: 1.5 }}>{n.desc}</p>
              </div>
              {!n.read && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#1d6f78', flexShrink: 0, marginTop: 6 }} />}
            </div>
          ))}
          <div style={{ padding: '10px 16px', textAlign: 'center' }}>
            <span style={{ fontSize: 12, color: '#1d6f78', cursor: 'pointer' }}>查看全部通知</span>
          </div>
        </div>
      )}

      {/* User menu dropdown */}
      {showUserMenu && (
        <div style={{
          position: 'fixed', top: userMenuPos.top, right: userMenuPos.right,
          width: 150, background: '#fff', borderRadius: 8,
          boxShadow: '0 8px 32px rgba(0,0,0,0.14)', border: '1px solid rgba(31,71,92,0.1)',
          zIndex: 901, overflow: 'hidden',
        }}>
          {([
            { label: '个人中心', Icon: User,     action: () => { router.push('/profile'); setShowUserMenu(false) } },
            { label: '布局设置', Icon: Settings2, action: () => { setShowLayoutPanel(true); setShowUserMenu(false) } },
            { label: '退出登录', Icon: LogOut,    action: handleLogout },
          ] as const).map(({ label, Icon, action }) => (
            <button key={label} onClick={action} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', border: 'none', background: 'none',
              cursor: 'pointer', fontSize: 13, color: '#183b4b', textAlign: 'left',
            }}>
              <Icon size={14} color="#6b8a98" />{label}
            </button>
          ))}
        </div>
      )}

      {/* Search modal */}
      {showSearch && (
        <div onClick={() => { setShowSearch(false); setSearchQuery('') }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '14vh' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 640, maxWidth: '92vw', background: '#fff', borderRadius: 12, boxShadow: '0 24px 64px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid rgba(31,71,92,0.1)' }}>
              <Search size={18} color="#6b8a98" />
              <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="搜索页面、功能或帮助内容…"
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 16, color: '#183b4b', background: 'transparent' }} />
              <kbd style={{ fontSize: 11, color: '#9ba8b0', background: '#f0f4f5', padding: '2px 6px', borderRadius: 4, border: '1px solid #dde3e8' }}>ESC</kbd>
            </div>
            <div style={{ maxHeight: 380, overflowY: 'auto', padding: '8px 0' }}>
              {Object.entries(groupedSearch).map(([cat, items]) => (
                <div key={cat}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#9ba8b0', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '10px 20px 4px' }}>{cat}</p>
                  {items.map(item => (
                    <button key={item.label} onClick={() => { router.push(item.href); setShowSearch(false); setSearchQuery('') }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '9px 20px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(29,111,120,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Search size={13} color="#1d6f78" />
                      </div>
                      <div>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#183b4b' }}>{item.label}</p>
                        <p style={{ margin: 0, fontSize: 12, color: '#6b8a98' }}>{item.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
              {filteredSearch.length === 0 && (
                <p style={{ textAlign: 'center', color: '#9ba8b0', padding: '32px 0', fontSize: 14 }}>未找到「{searchQuery}」相关内容</p>
              )}
            </div>
            <div style={{ padding: '8px 20px', borderTop: '1px solid rgba(31,71,92,0.08)', display: 'flex', gap: 16, fontSize: 11, color: '#9ba8b0' }}>
              <span>↑↓ 导航</span><span>↵ 打开</span><span>ESC 关闭</span><span>Ctrl+K 随时唤起</span>
            </div>
          </div>
        </div>
      )}

      {/* Layout panel (right drawer) */}
      {showLayoutPanel && (
        <>
          <div onClick={() => setShowLayoutPanel(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 3000 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, height: '100%', width: 300, background: surfaceBg, color: bodyText, zIndex: 3001, boxShadow: '-4px 0 24px rgba(0,0,0,0.18)', borderLeft: `1px solid ${surfaceBorder}`, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${surfaceBorder}` }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: bodyText }}>布局设置</span>
              <button onClick={() => setShowLayoutPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: mutedText, padding: 4, display: 'flex' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

              {/* 菜单导航设置 */}
              <p style={{ ...SECTION_TITLE, color: bodyText }}>菜单导航设置</p>
              <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
                {(['side', 'top', 'compact'] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => selectMenuMode(mode)}
                    title={mode === 'side' ? '侧边菜单' : mode === 'top' ? '顶部菜单' : '折叠菜单'}
                    style={{
                      border: `2px solid ${layoutConfig.menuMode === mode ? themeColor : surfaceBorder}`,
                      borderRadius: controlRadius,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      width: 58,
                      height: 42,
                      display: 'flex',
                      flexDirection: mode === 'top' ? 'column' : 'row',
                      flexShrink: 0,
                      padding: 0,
                      background: surfaceBg,
                    }}
                  >
                    {mode === 'top' ? (
                      <>
                        <span style={{ height: 10, background: headerDark ? '#1f2d3d' : themeColor, flexShrink: 0 }} />
                        <span style={{ flex: 1, background: surfaceSubtleBg }} />
                      </>
                    ) : (
                      <>
                        <span style={{ width: mode === 'compact' ? 8 : 14, background: sidebarDark ? '#1f2d3d' : '#e8eff2', flexShrink: 0 }} />
                        <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                          <span style={{ height: 10, background: layoutConfig.darkMode ? '#243246' : '#e8eff2' }} />
                          <span style={{ flex: 1, background: surfaceSubtleBg }} />
                        </span>
                      </>
                    )}
                  </button>
                ))}
              </div>

              {/* 主题风格设置 */}
              <p style={{ ...SECTION_TITLE, color: bodyText }}>主题风格设置</p>
              <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
                {(['side-dark', 'top-dark'] as const).map(style => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => selectThemeStyle(style)}
                    title={style === 'side-dark' ? '暗色侧栏' : '暗色顶栏'}
                    style={{
                      border: `2px solid ${layoutConfig.themeStyle === style ? themeColor : surfaceBorder}`,
                      borderRadius: controlRadius,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      width: 52,
                      height: 40,
                      display: 'flex',
                      flexShrink: 0,
                      padding: 0,
                      background: surfaceBg,
                    }}
                  >
                    <span style={{ width: 12, background: style === 'side-dark' ? '#1f2d3d' : surfaceBg, borderRight: style === 'top-dark' ? `1px solid ${surfaceBorder}` : 'none' }} />
                    <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <span style={{ height: 9, background: style === 'top-dark' ? '#1f2d3d' : layoutConfig.darkMode ? '#243246' : '#e0e8ec' }} />
                      <span style={{ flex: 1, background: surfaceSubtleBg }} />
                    </span>
                  </button>
                ))}
              </div>

              {/* 主题颜色 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${surfaceBorder}` }}>
                <span style={{ fontSize: 13, color: bodyText }}>主题颜色</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {THEME_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => selectThemeColor(c)}
                      aria-label={`选择主题色 ${c}`}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: c,
                        cursor: 'pointer',
                        border: c === layoutConfig.themeColor ? `2px solid ${bodyText}` : '2px solid transparent',
                        boxShadow: c === layoutConfig.themeColor ? `0 0 0 2px ${accentStrong}` : 'none',
                        padding: 0,
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* 深色模式 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${surfaceBorder}` }}>
                <span style={{ fontSize: 13, color: bodyText }}>深色模式</span>
                <button type="button" onClick={toggleDarkMode} style={{ width: 40, height: 22, borderRadius: 11, background: layoutConfig.darkMode ? themeColor : '#dde3e8', cursor: 'pointer', position: 'relative', border: 'none', padding: 0, transition: 'background 0.2s' }}>
                  <span style={{ position: 'absolute', top: 3, left: layoutConfig.darkMode ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
                </button>
              </div>

              {/* 页面圆角 */}
              <div style={{ padding: '12px 0', borderBottom: `1px solid ${surfaceBorder}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: bodyText }}>页面圆角</span>
                  <span style={{ fontSize: 12, color: mutedText }}>{layoutConfig.pageRadius}px</span>
                </div>
                <input type="range" min={0} max={16} value={layoutConfig.pageRadius} onChange={e => setPageRadius(Number(e.target.value))} style={{ width: '100%', accentColor: themeColor }} />
              </div>

              {/* 系统布局配置 */}
              <p style={{ ...SECTION_TITLE, marginTop: 20, color: bodyText }}>系统布局配置</p>
              {LAYOUT_TOGGLES.map(({ label, key }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${surfaceBorder}` }}>
                  <span style={{ fontSize: 13, color: bodyText }}>{label}</span>
                  <button type="button" onClick={() => toggleLayout(key)} style={{
                    width: 40, height: 22, borderRadius: 11, cursor: 'pointer', position: 'relative', border: 'none', padding: 0,
                    background: layoutConfig.toggles[key] ? themeColor : '#dde3e8', transition: 'background 0.2s',
                  }}>
                    <span style={{
                      position: 'absolute', top: 3, width: 16, height: 16, borderRadius: '50%', background: '#fff',
                      left: layoutConfig.toggles[key] ? 21 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </button>
                </div>
              ))}
            </div>

            <div style={{ padding: '16px 20px', borderTop: `1px solid ${surfaceBorder}`, display: 'flex', gap: 10 }}>
              <button onClick={saveLayoutConfig} style={{ flex: 1, padding: '9px 0', borderRadius: controlRadius, background: themeColor, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                保存配置
              </button>
              <button onClick={resetLayoutConfig} style={{ flex: 1, padding: '9px 0', borderRadius: controlRadius, background: 'transparent', color: mutedText, border: `1px solid ${surfaceBorder}`, cursor: 'pointer', fontSize: 13 }}>
                重置配置
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  )
}

// ── Shared micro-styles ───────────────────────────────────────────────────────

const ICON_BTN: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', color: '#6b8a98',
  padding: '6px 7px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 3,
}

const SECTION_TITLE: React.CSSProperties = {
  fontWeight: 700, fontSize: 13, color: '#183b4b', margin: '0 0 12px',
}
