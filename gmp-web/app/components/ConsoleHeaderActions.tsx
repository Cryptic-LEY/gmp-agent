'use client'

import Image from 'next/image'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import {
  Bell,
  Check,
  Globe,
  HelpCircle,
  LogOut,
  Maximize,
  Search,
  Settings2,
  User,
  X,
} from 'lucide-react'

export interface ConsoleSearchItem {
  category: string
  label: string
  desc: string
  action: () => void
}

export interface ConsoleNotification {
  id: string | number
  icon: string
  title: string
  desc: string
  time: string
  read?: boolean
}

export type ConsoleLayoutKey = 'showTagsView' | 'showTabIcon' | 'fixedHeader' | 'showLogo' | 'dynamicTitle'
export type ConsoleMenuMode = 'side' | 'top' | 'compact'
export type ConsoleThemeStyle = 'side-dark' | 'top-dark'

export interface ConsoleLayoutConfig {
  menuMode: ConsoleMenuMode
  themeStyle: ConsoleThemeStyle
  themeColor: string
  darkMode: boolean
  pageRadius: number
  toggles: Record<ConsoleLayoutKey, boolean>
}

interface ConsoleHeaderActionsProps {
  displayName: string
  avatarUrl?: string | null
  searchItems: ConsoleSearchItem[]
  notifications: ConsoleNotification[]
  onProfile: () => void
  onLogout: () => void
  onHelp?: () => void
  onFullscreenChange?: (fullscreen: boolean) => void
  onLayoutChange?: (config: ConsoleLayoutConfig) => void
  title?: string
}

const LAYOUT_STORAGE_KEY = 'gmp.console.layout.settings'
const THEME_COLORS = ['#1d6f78', '#2563eb', '#7c3aed', '#dc2626', '#d97706']
const MENU_MODES: Array<{ value: ConsoleMenuMode; label: string; title: string }> = [
  { value: 'side', label: '侧边菜单', title: '侧边菜单' },
  { value: 'top', label: '顶部菜单', title: '顶部菜单' },
  { value: 'compact', label: '精简菜单', title: '精简菜单' },
]
const LAYOUT_TOGGLES: { label: string; key: ConsoleLayoutKey }[] = [
  { label: '开启 Tags-Views', key: 'showTagsView' },
  { label: '显示页签图标', key: 'showTabIcon' },
  { label: '固定 Header', key: 'fixedHeader' },
  { label: '显示 Logo', key: 'showLogo' },
  { label: '动态标题', key: 'dynamicTitle' },
]

export const DEFAULT_CONSOLE_LAYOUT: ConsoleLayoutConfig = {
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

function cloneLayoutConfig(config: ConsoleLayoutConfig = DEFAULT_CONSOLE_LAYOUT): ConsoleLayoutConfig {
  return {
    ...config,
    toggles: { ...config.toggles },
  }
}

function mergeLayoutConfig(value: string | null): ConsoleLayoutConfig {
  if (!value) return cloneLayoutConfig()

  try {
    const parsed = JSON.parse(value) as Partial<ConsoleLayoutConfig>
    const menuMode: ConsoleMenuMode = ['side', 'top', 'compact'].includes(parsed.menuMode as string)
      ? parsed.menuMode as ConsoleMenuMode
      : DEFAULT_CONSOLE_LAYOUT.menuMode
    const themeStyle: ConsoleThemeStyle = ['side-dark', 'top-dark'].includes(parsed.themeStyle as string)
      ? parsed.themeStyle as ConsoleThemeStyle
      : DEFAULT_CONSOLE_LAYOUT.themeStyle
    const themeColor = typeof parsed.themeColor === 'string' && THEME_COLORS.includes(parsed.themeColor)
      ? parsed.themeColor
      : DEFAULT_CONSOLE_LAYOUT.themeColor

    return {
      ...DEFAULT_CONSOLE_LAYOUT,
      ...parsed,
      menuMode,
      themeStyle,
      themeColor,
      darkMode: typeof parsed.darkMode === 'boolean' ? parsed.darkMode : DEFAULT_CONSOLE_LAYOUT.darkMode,
      pageRadius: typeof parsed.pageRadius === 'number' ? parsed.pageRadius : DEFAULT_CONSOLE_LAYOUT.pageRadius,
      toggles: {
        ...DEFAULT_CONSOLE_LAYOUT.toggles,
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

const BASE_ICON_BUTTON: CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: '#6b8a98',
  padding: '6px 7px',
  borderRadius: 6,
  display: 'flex',
  alignItems: 'center',
  gap: 3,
}

const SECTION_TITLE: CSSProperties = {
  fontWeight: 700,
  fontSize: 13,
  margin: '0 0 12px',
}

export default function ConsoleHeaderActions({
  displayName,
  avatarUrl,
  searchItems,
  notifications,
  onProfile,
  onLogout,
  onHelp,
  onFullscreenChange,
  onLayoutChange,
  title = 'GMP 助学平台',
}: ConsoleHeaderActionsProps) {
  const [lang, setLang] = useState<'zh' | 'en'>('zh')
  const [showSearch, setShowSearch] = useState(false)
  const [showNotif, setShowNotif] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showLayoutPanel, setShowLayoutPanel] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [notifs, setNotifs] = useState(() => notifications)
  const [layoutConfig, setLayoutConfig] = useState<ConsoleLayoutConfig>(() => cloneLayoutConfig())
  const bellRef = useRef<HTMLButtonElement>(null)
  const avatarRef = useRef<HTMLButtonElement>(null)
  const [notifDropPos, setNotifDropPos] = useState({ top: 58, right: 220 })
  const [userMenuPos, setUserMenuPos] = useState({ top: 58, right: 20 })

  useEffect(() => {
    const savedLang = localStorage.getItem('lang') as 'zh' | 'en' | null
    if (savedLang) setLang(savedLang)
    setLayoutConfig(mergeLayoutConfig(localStorage.getItem(LAYOUT_STORAGE_KEY)))
  }, [])

  useEffect(() => {
    setNotifs(notifications)
  }, [notifications])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowSearch(false)
        setShowNotif(false)
        setShowUserMenu(false)
        setShowLayoutPanel(false)
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setShowSearch(value => !value)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  useEffect(() => {
    onFullscreenChange?.(isFullscreen)
  }, [isFullscreen, onFullscreenChange])

  useEffect(() => {
    onLayoutChange?.(layoutConfig)
  }, [layoutConfig, onLayoutChange])

  useEffect(() => {
    if (!showLayoutPanel) return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [showLayoutPanel])

  useEffect(() => {
    if (layoutConfig.toggles.dynamicTitle) {
      document.title = `${title} - GMP 助学平台`
    }
  }, [layoutConfig.toggles.dynamicTitle, title])

  const themeColor = layoutConfig.themeColor
  const accentSoft = hexToRgba(themeColor, 0.1)
  const accentMedium = hexToRgba(themeColor, 0.22)
  const accentStrong = hexToRgba(themeColor, 0.28)
  const controlRadius = Math.max(4, Math.min(12, layoutConfig.pageRadius))
  const surfaceBg = layoutConfig.darkMode ? '#182232' : '#fff'
  const surfaceSubtleBg = layoutConfig.darkMode ? '#111827' : '#f5f8f9'
  const surfaceBorder = layoutConfig.darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(31,71,92,0.08)'
  const bodyText = layoutConfig.darkMode ? '#f4f4f5' : '#183b4b'
  const mutedText = layoutConfig.darkMode ? '#bfcbd9' : '#6b8a98'
  const headerIconButtonStyle: CSSProperties = {
    ...BASE_ICON_BUTTON,
    color: mutedText,
    borderRadius: controlRadius,
  }
  const unreadCount = notifs.filter(item => !item.read).length
  const filteredSearch = searchQuery.trim()
    ? searchItems.filter(item =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.desc.toLowerCase().includes(searchQuery.toLowerCase()))
    : searchItems
  const groupedSearch = filteredSearch.reduce<Record<string, ConsoleSearchItem[]>>((acc, item) => {
    ;(acc[item.category] ??= []).push(item)
    return acc
  }, {})

  function toggleLang() {
    const next = lang === 'zh' ? 'en' : 'zh'
    setLang(next)
    localStorage.setItem('lang', next)
  }

  function openNotif() {
    if (bellRef.current) {
      const rect = bellRef.current.getBoundingClientRect()
      setNotifDropPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right })
    }
    setShowNotif(value => !value)
    setShowUserMenu(false)
  }

  function openUserMenu() {
    if (avatarRef.current) {
      const rect = avatarRef.current.getBoundingClientRect()
      setUserMenuPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right })
    }
    setShowUserMenu(value => !value)
    setShowNotif(false)
  }

  function closeDropdowns() {
    setShowNotif(false)
    setShowUserMenu(false)
  }

  function markAllRead() {
    setNotifs(prev => prev.map(item => ({ ...item, read: true })))
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await document.documentElement.requestFullscreen()
      }
    } catch {
      setIsFullscreen(value => !value)
    }
  }

  function toggleLayout(key: ConsoleLayoutKey) {
    setLayoutConfig(prev => ({
      ...prev,
      toggles: { ...prev.toggles, [key]: !prev.toggles[key] },
    }))
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

  function selectSearchItem(item: ConsoleSearchItem) {
    item.action()
    setShowSearch(false)
    setSearchQuery('')
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <button onClick={() => setShowSearch(true)} title="搜索 (Ctrl+K)" style={headerIconButtonStyle}>
          <Search size={16} />
        </button>

        <button ref={bellRef} onClick={openNotif} title="通知" style={{ ...headerIconButtonStyle, position: 'relative' }}>
          <Bell size={16} />
          {unreadCount > 0 && (
            <span style={{ position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: '50%', background: '#ef4444', border: '1.5px solid #fff' }} />
          )}
        </button>

        <button onClick={onHelp ?? (() => setShowSearch(true))} title="帮助与支持" style={headerIconButtonStyle}>
          <HelpCircle size={16} />
        </button>

        <button onClick={toggleFullscreen} title="全屏 / 退出全屏" style={headerIconButtonStyle}>
          <Maximize size={16} />
        </button>

        <button onClick={toggleLang} title={lang === 'zh' ? 'Switch to English' : '切换为中文'} style={{ ...headerIconButtonStyle, gap: 3, fontSize: 11, fontWeight: 700, minWidth: 44 }}>
          <Globe size={14} />
          <span style={{ fontSize: 11, letterSpacing: 0 }}>{lang === 'zh' ? 'CN' : 'EN'}</span>
        </button>

        <button type="button" ref={avatarRef} onClick={openUserMenu} aria-label="打开账号菜单" style={{ position: 'relative', overflow: 'hidden', width: 28, height: 28, padding: 0, border: 'none', borderRadius: '50%', background: `linear-gradient(135deg,${themeColor},#35818a)`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 6, cursor: 'pointer', flexShrink: 0 }}>
          {avatarUrl ? (
            <Image src={avatarUrl} alt={`${displayName}的头像`} fill unoptimized style={{ objectFit: 'cover' }} />
          ) : (
            <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>{displayName[0] || 'G'}</span>
          )}
        </button>
      </div>

      {isFullscreen && (
        <button onClick={toggleFullscreen} style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, background: 'rgba(31,45,61,0.85)', color: '#fff', border: 'none', borderRadius: controlRadius, padding: '8px 14px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <X size={14} />退出全屏
        </button>
      )}

      {(showNotif || showUserMenu) && (
        <div onClick={closeDropdowns} style={{ position: 'fixed', inset: 0, zIndex: 900 }} />
      )}

      {showNotif && (
        <div style={{ position: 'fixed', top: notifDropPos.top, right: notifDropPos.right, width: 340, background: '#fff', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.14)', border: '1px solid rgba(31,71,92,0.1)', zIndex: 901 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(31,71,92,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#183b4b' }}>
              通知
              {unreadCount > 0 && <span style={{ marginLeft: 6, fontSize: 11, background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 6px' }}>{unreadCount}</span>}
            </span>
            <button onClick={markAllRead} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: themeColor, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Check size={12} />全部已读
            </button>
          </div>
          {notifs.map(item => (
            <div key={item.id} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: '1px solid rgba(31,71,92,0.05)', background: item.read ? 'transparent' : accentSoft }}>
              <span style={{ width: 24, height: 24, borderRadius: 6, background: accentSoft, color: themeColor, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{item.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontWeight: item.read ? 400 : 600, fontSize: 13, color: '#183b4b' }}>{item.title}</span>
                  <span style={{ fontSize: 11, color: '#9ba8b0', whiteSpace: 'nowrap', marginLeft: 8 }}>{item.time}</span>
                </div>
                <p style={{ fontSize: 12, color: '#6b8a98', margin: 0, lineHeight: 1.5 }}>{item.desc}</p>
              </div>
              {!item.read && <div style={{ width: 6, height: 6, borderRadius: '50%', background: themeColor, flexShrink: 0, marginTop: 6 }} />}
            </div>
          ))}
          <div style={{ padding: '10px 16px', textAlign: 'center' }}>
            <span style={{ fontSize: 12, color: themeColor, cursor: 'pointer' }}>查看全部通知</span>
          </div>
        </div>
      )}

      {showUserMenu && (
        <div style={{ position: 'fixed', top: userMenuPos.top, right: userMenuPos.right, width: 150, background: '#fff', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.14)', border: '1px solid rgba(31,71,92,0.1)', zIndex: 901, overflow: 'hidden' }}>
          {([
            { label: '个人中心', Icon: User, action: () => { onProfile(); setShowUserMenu(false) } },
            { label: '布局设置', Icon: Settings2, action: () => { setShowLayoutPanel(true); setShowUserMenu(false) } },
            { label: '退出登录', Icon: LogOut, action: onLogout },
          ] as const).map(({ label, Icon, action }) => (
            <button key={label} onClick={action} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: '#183b4b', textAlign: 'left' }}>
              <Icon size={14} color="#6b8a98" />{label}
            </button>
          ))}
        </div>
      )}

      {showSearch && (
        <div onClick={() => { setShowSearch(false); setSearchQuery('') }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '14vh' }}>
          <div onClick={event => event.stopPropagation()} style={{ width: 640, maxWidth: '92vw', background: '#fff', borderRadius: 12, boxShadow: '0 24px 64px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid rgba(31,71,92,0.1)' }}>
              <Search size={18} color="#6b8a98" />
              <input autoFocus value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="搜索页面、功能或帮助内容..." style={{ flex: 1, border: 'none', outline: 'none', fontSize: 16, color: '#183b4b', background: 'transparent' }} />
              <kbd style={{ fontSize: 11, color: '#9ba8b0', background: '#f0f4f5', padding: '2px 6px', borderRadius: 4, border: '1px solid #dde3e8' }}>ESC</kbd>
            </div>
            <div style={{ maxHeight: 380, overflowY: 'auto', padding: '8px 0' }}>
              {Object.entries(groupedSearch).map(([category, items]) => (
                <div key={category}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#9ba8b0', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '10px 20px 4px' }}>{category}</p>
                  {items.map(item => (
                    <button key={`${category}-${item.label}`} onClick={() => selectSearchItem(item)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '9px 20px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Search size={13} color={themeColor} />
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
              <span>ESC 关闭</span><span>Ctrl+K 随时唤起</span>
            </div>
          </div>
        </div>
      )}

      {showLayoutPanel && typeof document !== 'undefined' && createPortal(
        <>
          <div onClick={() => setShowLayoutPanel(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(9, 21, 31, 0.36)', backdropFilter: 'blur(2px)', zIndex: 3000 }} />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="console-layout-title"
            style={{ position: 'fixed', top: 0, right: 0, bottom: 0, height: '100dvh', width: 'min(352px, 100vw)', background: surfaceBg, color: bodyText, zIndex: 3001, boxShadow: '-18px 0 44px rgba(9, 25, 38, 0.18)', borderLeft: `1px solid ${surfaceBorder}`, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 20px 17px', borderBottom: `1px solid ${surfaceBorder}` }}>
              <div>
                <p style={{ margin: '0 0 5px', fontSize: 11, lineHeight: 1, fontWeight: 700, letterSpacing: '0.08em', color: themeColor }}>CONSOLE PREFERENCES</p>
                <h2 id="console-layout-title" style={{ margin: 0, fontWeight: 800, fontSize: 18, lineHeight: 1.3, color: bodyText }}>布局设置</h2>
              </div>
              <button type="button" aria-label="关闭布局设置" onClick={() => setShowLayoutPanel(false)} style={{ background: surfaceSubtleBg, border: `1px solid ${surfaceBorder}`, borderRadius: controlRadius, cursor: 'pointer', color: mutedText, width: 32, height: 32, display: 'grid', placeItems: 'center' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ minHeight: 0, overflowY: 'auto', padding: '20px' }}>
              <p style={{ ...SECTION_TITLE, color: bodyText }}>菜单导航设置</p>
              <div style={{ display: 'flex', gap: 10, marginBottom: 26, padding: 10, borderRadius: controlRadius + 4, background: surfaceSubtleBg, border: `1px solid ${surfaceBorder}` }}>
                {MENU_MODES.map(mode => (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => setLayoutConfig(prev => ({ ...prev, menuMode: mode.value }))}
                    title={mode.title}
                    aria-label={mode.label}
                    style={{
                      border: `2px solid ${layoutConfig.menuMode === mode.value ? themeColor : surfaceBorder}`,
                      borderRadius: controlRadius,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      width: 88,
                      height: 48,
                      display: 'flex',
                      flexShrink: 0,
                      padding: 0,
                      background: surfaceBg,
                    }}
                  >
                    {mode.value !== 'top' && (
                      <span style={{ width: mode.value === 'compact' ? 10 : 15, background: mode.value === 'compact' ? themeColor : '#1f2d3d' }} />
                    )}
                    <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      {mode.value !== 'side' && <span style={{ height: 9, background: mode.value === 'top' ? themeColor : '#1f2d3d' }} />}
                      <span style={{ flex: 1, display: 'grid', gap: 4, padding: 6, background: surfaceSubtleBg }}>
                        <span style={{ height: 5, background: accentMedium, borderRadius: 999 }} />
                        <span style={{ height: 5, background: layoutConfig.darkMode ? '#243246' : '#e0e8ec', borderRadius: 999 }} />
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              <p style={{ ...SECTION_TITLE, color: bodyText }}>主题风格设置</p>
              <div style={{ display: 'flex', gap: 10, marginBottom: 24, padding: 10, borderRadius: controlRadius + 4, background: surfaceSubtleBg, border: `1px solid ${surfaceBorder}` }}>
                {(['side-dark', 'top-dark'] as const).map(style => (
                  <button key={style} type="button" onClick={() => setLayoutConfig(prev => ({ ...prev, themeStyle: style }))} title={style === 'side-dark' ? '暗色侧栏' : '暗色顶栏'} style={{ border: `2px solid ${layoutConfig.themeStyle === style ? themeColor : surfaceBorder}`, borderRadius: controlRadius, overflow: 'hidden', cursor: 'pointer', width: 92, height: 48, display: 'flex', flexShrink: 0, padding: 0, background: surfaceBg }}>
                    <span style={{ width: 12, background: style === 'side-dark' ? '#1f2d3d' : surfaceBg, borderRight: style === 'top-dark' ? `1px solid ${surfaceBorder}` : 'none' }} />
                    <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <span style={{ height: 9, background: style === 'top-dark' ? '#1f2d3d' : layoutConfig.darkMode ? '#243246' : '#e0e8ec' }} />
                      <span style={{ flex: 1, background: surfaceSubtleBg }} />
                    </span>
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${surfaceBorder}` }}>
                <span style={{ fontSize: 13, color: bodyText }}>主题颜色</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {THEME_COLORS.map(color => (
                    <button key={color} type="button" onClick={() => setLayoutConfig(prev => ({ ...prev, themeColor: color }))} aria-label={`选择主题色 ${color}`} style={{ width: 18, height: 18, borderRadius: '50%', background: color, cursor: 'pointer', border: color === layoutConfig.themeColor ? `2px solid ${bodyText}` : '2px solid transparent', boxShadow: color === layoutConfig.themeColor ? `0 0 0 2px ${accentStrong}` : 'none', padding: 0 }} />
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${surfaceBorder}` }}>
                <span style={{ fontSize: 13, color: bodyText }}>深色模式</span>
                <button type="button" onClick={() => setLayoutConfig(prev => ({ ...prev, darkMode: !prev.darkMode }))} style={{ width: 40, height: 22, borderRadius: 11, background: layoutConfig.darkMode ? themeColor : '#dde3e8', cursor: 'pointer', position: 'relative', border: 'none', padding: 0, transition: 'background 0.2s' }}>
                  <span style={{ position: 'absolute', top: 3, left: layoutConfig.darkMode ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
                </button>
              </div>

              <div style={{ padding: '12px 0', borderBottom: `1px solid ${surfaceBorder}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: bodyText }}>页面圆角</span>
                  <span style={{ fontSize: 12, color: mutedText }}>{layoutConfig.pageRadius}px</span>
                </div>
                <input type="range" min={0} max={16} value={layoutConfig.pageRadius} onChange={event => setLayoutConfig(prev => ({ ...prev, pageRadius: Number(event.target.value) }))} style={{ width: '100%', accentColor: themeColor }} />
              </div>

              <p style={{ ...SECTION_TITLE, marginTop: 20, color: bodyText }}>系统布局配置</p>
              {LAYOUT_TOGGLES.map(({ label, key }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${surfaceBorder}` }}>
                  <span style={{ fontSize: 13, color: bodyText }}>{label}</span>
                  <button type="button" onClick={() => toggleLayout(key)} style={{ width: 40, height: 22, borderRadius: 11, cursor: 'pointer', position: 'relative', border: 'none', padding: 0, background: layoutConfig.toggles[key] ? themeColor : '#dde3e8', transition: 'background 0.2s' }}>
                    <span style={{ position: 'absolute', top: 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', left: layoutConfig.toggles[key] ? 21 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </button>
                </div>
              ))}
            </div>

            <div style={{ padding: '16px 20px 20px', borderTop: `1px solid ${surfaceBorder}`, display: 'flex', gap: 10, background: surfaceBg }}>
              <button type="button" onClick={saveLayoutConfig} style={{ flex: 1, padding: '11px 0', borderRadius: controlRadius, background: themeColor, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                保存配置
              </button>
              <button type="button" onClick={resetLayoutConfig} style={{ flex: 1, padding: '11px 0', borderRadius: controlRadius, background: surfaceSubtleBg, color: mutedText, border: `1px solid ${surfaceBorder}`, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                重置配置
              </button>
            </div>
          </aside>
        </>,
        document.body,
      )}
    </>
  )
}
