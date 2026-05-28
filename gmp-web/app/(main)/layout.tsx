'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Gauge, BookOpen, Flame, MessageSquare, Sparkles, Network,
  Building2, BarChart3, LogOut,
  Menu, Search, Bell, HelpCircle, Maximize, Minimize2, ChevronRight, X,
  GraduationCap, Globe, User, Settings2, Check,
} from 'lucide-react'

// ── Static constants ─────────────────────────────────────────────────────────

const NAV = [
  {
    group: '学习中心',
    items: [
      { label: '主页',     icon: Gauge,         href: '/dashboard' },
      { label: '课程学习', icon: GraduationCap, href: '/course'    },
      { label: '每日练习', icon: BookOpen,       href: '/practice'  },
      { label: '连续打卡', icon: Flame,          href: '/streak'    },
      { label: '我的进度', icon: Network,        href: '/progress'  },
      { label: '个性化学习', icon: Sparkles,     href: '/plan'      },
    ],
  },
  {
    group: 'AI 助手',
    items: [
      { label: 'AI 答疑', icon: MessageSquare, href: '/chat' },
    ],
  },
  {
    group: '进阶功能',
    items: [
      { label: '实训仿真', icon: Building2, href: '/simulation' },
      { label: '成绩报告', icon: BarChart3, href: '/report'     },
    ],
  },
]

const PAGE_LABELS: Record<string, string> = {
  '/course':   '课程学习',
  '/practice': '每日练习',
  '/streak':   '连续打卡',
  '/progress': '我的进度',
  '/plan':     '个性化学习',
  '/chat':     'AI 答疑',
  '/simulation': '实训仿真',
  '/report':     '成绩报告',
  '/profile':    '个人中心',
  '/help':       '帮助中心',
}

const SEARCH_ITEMS = [
  { category: '页面导航', label: '主页',       desc: '课程概述与学习进度总览',         href: '/dashboard' },
  { category: '页面导航', label: '课程学习',   desc: '11个项目章节 · 测验 · 讨论 · 作业', href: '/course'    },
  { category: '页面导航', label: '每日练习',   desc: '完成每日 GMP 练习题',            href: '/practice'  },
  { category: '页面导航', label: '连续打卡',   desc: '查看打卡记录与连续天数',         href: '/streak'    },
  { category: '页面导航', label: '我的进度',   desc: '知识图谱个人掌握度可视化',       href: '/progress'  },
  { category: '页面导航', label: '个性化学习', desc: '生成专属学习路线',               href: '/plan'      },
  { category: '页面导航', label: 'AI 答疑',    desc: '向 AI 提问 GMP 知识',           href: '/chat'      },
  { category: '页面导航', label: '实训仿真',   desc: '基于真实案例的情景测验',         href: '/simulation' },
  { category: '页面导航', label: '成绩报告',   desc: '查看答题统计与学习进度',         href: '/report'     },
  { category: '帮助中心', label: '如何开始学习？', desc: '新手引导说明',     href: '/help'      },
  { category: '帮助中心', label: '打卡规则说明',   desc: '连续打卡奖励机制', href: '/help'      },
  { category: '帮助中心', label: 'AI 答疑使用方法', desc: '如何有效提问',   href: '/help'      },
  { category: '帮助中心', label: '积分与等级系统', desc: '了解 XP 升级规则', href: '/help'      },
]

const NOTIFICATIONS = [
  { id: 1, icon: '🎉', title: '连续打卡奖励', desc: '你已完成连续打卡第 3 天！获得 +50 XP', time: '刚刚',  read: false },
  { id: 2, icon: '📚', title: '课程内容更新', desc: '第七章「确认与验证」已更新新内容',        time: '1小时前', read: false },
  { id: 3, icon: '⚠️', title: '每日练习提醒', desc: '今日每日练习尚未完成，快去挑战吧！',     time: '3小时前', read: true  },
  { id: 4, icon: '🏆', title: '等级提升',     desc: '恭喜达到新等级：GMP 见习员',             time: '昨天',  read: true  },
]

type LayoutKey = 'showTagsView' | 'showTabIcon' | 'fixedHeader' | 'showLogo' | 'dynamicTitle'
const LAYOUT_TOGGLES: { label: string; key: LayoutKey }[] = [
  { label: '开启 Tags-Views', key: 'showTagsView' },
  { label: '显示页签图标',   key: 'showTabIcon'   },
  { label: '固定 Header',    key: 'fixedHeader'   },
  { label: '显示 Logo',      key: 'showLogo'      },
  { label: '动态标题',       key: 'dynamicTitle'  },
]

// ── Component ────────────────────────────────────────────────────────────────

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()

  // Persistent
  const [displayName, setDisplayName] = useState('用户')
  const [lang, setLang]               = useState<'zh' | 'en'>('zh')
  const [streakDays, setStreakDays]   = useState(0)

  // Overlay visibility
  const [showSearch,      setShowSearch]      = useState(false)
  const [showNotif,       setShowNotif]       = useState(false)
  const [showUserMenu,    setShowUserMenu]    = useState(false)
  const [showLayoutPanel, setShowLayoutPanel] = useState(false)
  const [isFullscreen,    setIsFullscreen]    = useState(false)

  // Search
  const [searchQuery, setSearchQuery] = useState('')

  // Notifications
  const [notifs, setNotifs] = useState(NOTIFICATIONS)

  // Layout settings (visual only for now)
  const [layoutSettings, setLayoutSettings] = useState<Record<LayoutKey, boolean>>({
    showTagsView: true, showTabIcon: false, fixedHeader: true, showLogo: true, dynamicTitle: false,
  })

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
    const saved = localStorage.getItem('lang') as 'zh' | 'en' | null
    if (saved) setLang(saved)
    // 首次登录跳前测（onboarding_done 由前测完成后写入 localStorage）
    if (!localStorage.getItem('onboarding_done')) {
      router.push('/onboarding')
    }
    // 获取游戏状态（含打卡天数），同时触发每日签到
    fetch('/api/game/state', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.streakDays !== undefined) setStreakDays(data.streakDays) })
      .catch(() => {})
  }, [router])

  useEffect(() => {
    setShowNotif(false)
    setShowUserMenu(false)
  }, [pathname])

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

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleLogout() { localStorage.clear(); router.push('/login') }

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
    setLayoutSettings(prev => ({ ...prev, [key]: !prev[key] }))
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

  // ── JSX ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#eef4f3' }}>

      {/* ── Exit fullscreen button ── */}
      {isFullscreen && (
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
      {!isFullscreen && (
        <aside style={{ position: 'fixed', top: 0, left: 0, height: '100%', width: 220, background: '#1f2d3d', display: 'flex', flexDirection: 'column', zIndex: 50 }}>

          {/* Logo */}
          <div style={{ height: 50, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#215566,#35818a)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>G</span>
            </div>
            <div>
              <p style={{ color: '#f4f4f5', fontWeight: 700, fontSize: 13, margin: 0, lineHeight: 1.3 }}>GMP 助学平台</p>
              <p style={{ color: '#bfcbd9', fontSize: 10, margin: 0, opacity: 0.55 }}>药品质量管理</p>
            </div>
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, overflowY: 'auto', padding: '14px 10px' }}>
            {NAV.map(({ group, items }) => (
              <div key={group} style={{ marginBottom: 22 }}>
                <p style={{ color: '#bfcbd9', fontSize: 10, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', margin: '0 0 6px 10px', opacity: 0.45 }}>
                  {group}
                </p>
                {items.map(({ label, icon: Icon, href }) => {
                  const active = href === pathname
                  if (!href) return (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 10px', borderRadius: 8, opacity: 0.32, cursor: 'not-allowed' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#bfcbd9', fontSize: 13 }}>
                        <Icon size={15} strokeWidth={1.7} />{label}
                      </span>
                      <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', color: '#bfcbd9' }}>即将</span>
                    </div>
                  )
                  return (
                    <Link key={label} href={href} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8,
                      color: active ? '#f4f4f5' : '#bfcbd9',
                      background: active ? 'rgba(29,111,120,0.22)' : 'transparent',
                      borderLeft: active ? '2px solid #1d6f78' : '2px solid transparent',
                      fontWeight: active ? 600 : 400,
                      fontSize: 13, textDecoration: 'none', transition: 'background 0.15s',
                    }}>
                      <Icon size={15} strokeWidth={active ? 2.2 : 1.7} />{label}
                    </Link>
                  )
                })}
              </div>
            ))}
          </nav>

          {/* User */}
          <div style={{ padding: '10px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#215566,#35818a)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>{displayName[0]}</span>
              </div>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#bfcbd9', fontSize: 13 }}>{displayName}</span>
              <button onClick={handleLogout} title="退出登录" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bfcbd9', opacity: 0.45, padding: 4, display: 'flex', alignItems: 'center' }}>
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* ── Main column ── */}
      <div style={{ marginLeft: isFullscreen ? 0 : 220, flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

        {/* Top Navbar */}
        {!isFullscreen && (
          <header style={{
            position: 'sticky', top: 0, zIndex: 40,
            height: 50, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10,
            background: 'rgba(255,255,255,0.96)', borderBottom: '1px solid rgba(31,71,92,0.1)',
            backdropFilter: 'blur(12px)',
          }}>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#46606f', padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center' }}>
              <Menu size={18} />
            </button>

            {/* Breadcrumb */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6b8a98' }}>
              <Link href="/dashboard" style={{ color: isHome ? '#183b4b' : '#6b8a98', fontWeight: isHome ? 600 : 400, textDecoration: 'none' }}>主页</Link>
              {!isHome && currentLabel && (
                <>
                  <ChevronRight size={13} style={{ opacity: 0.5 }} />
                  <span style={{ color: '#183b4b', fontWeight: 600 }}>{currentLabel}</span>
                </>
              )}
            </div>

            {/* Right icons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>

              {/* Search */}
              <button onClick={() => setShowSearch(true)} title="搜索 (Ctrl+K)"
                style={ICON_BTN}>
                <Search size={16} />
              </button>

              {/* Notifications */}
              <button ref={bellRef} onClick={openNotif} title="通知" style={{ ...ICON_BTN, position: 'relative' }}>
                <Bell size={16} />
                {unreadCount > 0 && (
                  <span style={{ position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: '50%', background: '#ef4444', border: '1.5px solid #fff' }} />
                )}
              </button>

              {/* Help */}
              <button onClick={() => router.push('/help')} title="帮助与支持" style={ICON_BTN}>
                <HelpCircle size={16} />
              </button>

              {/* Fullscreen */}
              <button onClick={() => setIsFullscreen(v => !v)} title="全屏 / 退出全屏" style={ICON_BTN}>
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
                style={{ ...ICON_BTN, gap: 3, fontSize: 11, fontWeight: 700, minWidth: 44 }}>
                <Globe size={14} />
                <span style={{ fontSize: 11, letterSpacing: 0 }}>{lang === 'zh' ? 'CN' : 'EN'}</span>
              </button>

              {/* User avatar */}
              <div ref={avatarRef} onClick={openUserMenu}
                style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#215566,#35818a)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 6, cursor: 'pointer', flexShrink: 0 }}>
                <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>{displayName[0]}</span>
              </div>
            </div>
          </header>
        )}

        {/* TagsView — hidden on home */}
        {!isFullscreen && !isHome && currentLabel && (
          <div style={{
            position: 'sticky', top: 50, zIndex: 39,
            height: 36, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6,
            background: 'rgba(255,255,255,0.88)', borderBottom: '1px solid rgba(31,71,92,0.08)',
            overflowX: 'auto',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px 3px 12px', borderRadius: 999, background: 'rgba(29,111,120,0.1)', border: '1px solid rgba(29,111,120,0.22)', fontSize: 12, color: '#1d6f78', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
              {currentLabel}
              <X size={11} onClick={() => router.push('/dashboard')} style={{ cursor: 'pointer', opacity: 0.65, marginLeft: 2 }} />
            </div>
          </div>
        )}

        {/* Page content */}
        <div style={{ flex: 1 }}>{children}</div>
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
          <div style={{ position: 'fixed', top: 0, right: 0, height: '100%', width: 300, background: '#fff', zIndex: 3001, boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(31,71,92,0.08)' }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#183b4b' }}>布局设置</span>
              <button onClick={() => setShowLayoutPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b8a98', padding: 4, display: 'flex' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

              {/* 菜单导航设置 */}
              <p style={SECTION_TITLE}>菜单导航设置</p>
              <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
                {/* Sidebar left (active) */}
                <div style={{ border: '2px solid #1d6f78', borderRadius: 6, overflow: 'hidden', cursor: 'pointer', width: 58, height: 42, display: 'flex', flexShrink: 0 }}>
                  <div style={{ width: 14, background: '#1f2d3d' }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ height: 10, background: '#e8eff2' }} />
                    <div style={{ flex: 1, background: '#f5f8f9' }} />
                  </div>
                </div>
                {/* Top nav */}
                <div style={{ border: '2px solid #dde3e8', borderRadius: 6, overflow: 'hidden', cursor: 'pointer', width: 58, height: 42, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                  <div style={{ height: 10, background: '#1f2d3d' }} />
                  <div style={{ flex: 1, background: '#f5f8f9' }} />
                </div>
                {/* Collapsed */}
                <div style={{ border: '2px solid #dde3e8', borderRadius: 6, overflow: 'hidden', cursor: 'pointer', width: 58, height: 42, display: 'flex', flexShrink: 0 }}>
                  <div style={{ width: 8, background: '#1f2d3d' }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ height: 10, background: '#e8eff2' }} />
                    <div style={{ flex: 1, background: '#f5f8f9' }} />
                  </div>
                </div>
              </div>

              {/* 主题风格设置 */}
              <p style={SECTION_TITLE}>主题风格设置</p>
              <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
                <div style={{ border: '2px solid #1d6f78', borderRadius: 6, overflow: 'hidden', cursor: 'pointer', width: 52, height: 40, display: 'flex', flexShrink: 0 }}>
                  <div style={{ width: 12, background: '#1f2d3d' }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ height: 9, background: '#e0e8ec' }} />
                    <div style={{ flex: 1, background: '#f5f8f9' }} />
                  </div>
                </div>
                <div style={{ border: '2px solid #dde3e8', borderRadius: 6, overflow: 'hidden', cursor: 'pointer', width: 52, height: 40, display: 'flex', flexShrink: 0 }}>
                  <div style={{ width: 12, background: '#fff', borderRight: '1px solid #e0e8ec' }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ height: 9, background: '#1f2d3d' }} />
                    <div style={{ flex: 1, background: '#f5f8f9' }} />
                  </div>
                </div>
              </div>

              {/* 主题颜色 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(31,71,92,0.06)' }}>
                <span style={{ fontSize: 13, color: '#183b4b' }}>主题颜色</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['#1d6f78','#2563eb','#7c3aed','#dc2626','#d97706'].map(c => (
                    <div key={c} style={{ width: 18, height: 18, borderRadius: '50%', background: c, cursor: 'pointer', border: c === '#1d6f78' ? '2px solid #183b4b' : '2px solid transparent' }} />
                  ))}
                </div>
              </div>

              {/* 深色模式 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(31,71,92,0.06)' }}>
                <span style={{ fontSize: 13, color: '#183b4b' }}>深色模式</span>
                <div style={{ width: 40, height: 22, borderRadius: 11, background: '#dde3e8', cursor: 'not-allowed', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 3, left: 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </div>
              </div>

              {/* 页面圆角 */}
              <div style={{ padding: '12px 0', borderBottom: '1px solid rgba(31,71,92,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: '#183b4b' }}>页面圆角</span>
                  <span style={{ fontSize: 12, color: '#6b8a98' }}>6px</span>
                </div>
                <input type="range" min={0} max={16} defaultValue={6} style={{ width: '100%', accentColor: '#1d6f78' }} />
              </div>

              {/* 系统布局配置 */}
              <p style={{ ...SECTION_TITLE, marginTop: 20 }}>系统布局配置</p>
              {LAYOUT_TOGGLES.map(({ label, key }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(31,71,92,0.06)' }}>
                  <span style={{ fontSize: 13, color: '#183b4b' }}>{label}</span>
                  <div onClick={() => toggleLayout(key)} style={{
                    width: 40, height: 22, borderRadius: 11, cursor: 'pointer', position: 'relative',
                    background: layoutSettings[key] ? '#1d6f78' : '#dde3e8', transition: 'background 0.2s',
                  }}>
                    <div style={{
                      position: 'absolute', top: 3, width: 16, height: 16, borderRadius: '50%', background: '#fff',
                      left: layoutSettings[key] ? 21 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(31,71,92,0.08)', display: 'flex', gap: 10 }}>
              <button onClick={() => setShowLayoutPanel(false)} style={{ flex: 1, padding: '9px 0', borderRadius: 6, background: '#1d6f78', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                保存配置
              </button>
              <button style={{ flex: 1, padding: '9px 0', borderRadius: 6, background: 'transparent', color: '#6b8a98', border: '1px solid rgba(31,71,92,0.2)', cursor: 'pointer', fontSize: 13 }}>
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
