'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  Bot,
  ChevronRight,
  ClipboardList,
  Lightbulb,
  Loader2,
  MessageSquare,
  Minimize2,
  RotateCcw,
  Send,
  Sparkles,
  Target,
  WandSparkles,
  X,
} from 'lucide-react'
import {
  getAiElfPageContext,
  shouldHideAiElf,
  type AiElfAudience,
  type AiElfPageContext,
} from '@/lib/ai-elf-page-context'
import type { SmartMissionItem, SmartMissionModule, SmartMissionResponse } from '@/lib/smart-mission-types'

type ChatRole = 'user' | 'assistant'
type EdgeSide = 'left' | 'right'

interface AiElfPosition {
  x: number
  y: number
  edge: EdgeSide | null
}

interface ChatMessage {
  role: ChatRole
  content: string
  sources?: string[]
  criticTriggered?: boolean
}

interface ChatSession {
  sessionId: string
  title: string
  audience: AiElfAudience
  eduLevel: string | null
  messageCount: number
  createdAt: string
  updatedAt: string
}

const LAYOUT_STORAGE_KEY = 'gmp.layout.settings'
const POSITION_STORAGE_KEY = 'gmp.aiElf.position'
const LEGACY_DOCK_STORAGE_KEY = 'gmp.aiElf.dock'
const DEFAULT_THEME_COLOR = '#1d6f78'
const LAUNCH_SIZE = 64
const DOCK_GUTTER = -18
const SNAP_DISTANCE = 64
const FLOAT_MARGIN = 12

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return `rgba(29,111,120,${alpha})`
  const value = parseInt(normalized, 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `rgba(${r},${g},${b},${alpha})`
}

function readThemeSettings() {
  if (typeof window === 'undefined') {
    return { themeColor: DEFAULT_THEME_COLOR, darkMode: false }
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) || '{}') as {
      themeColor?: string
      darkMode?: boolean
    }
    const themeColor = typeof parsed.themeColor === 'string' ? parsed.themeColor : DEFAULT_THEME_COLOR
    return { themeColor, darkMode: Boolean(parsed.darkMode) }
  } catch {
    return { themeColor: DEFAULT_THEME_COLOR, darkMode: false }
  }
}

function clampValue(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

function clampPositionY(y: number, viewportHeight: number) {
  return clampValue(y, FLOAT_MARGIN, Math.max(FLOAT_MARGIN, viewportHeight - LAUNCH_SIZE - FLOAT_MARGIN))
}

function getEdgeX(edge: EdgeSide, viewportWidth: number) {
  return edge === 'left' ? DOCK_GUTTER : viewportWidth - LAUNCH_SIZE - DOCK_GUTTER
}

function normalizePosition(position: Partial<AiElfPosition>, viewportWidth: number, viewportHeight: number): AiElfPosition {
  const edge: EdgeSide | null = position.edge === 'left' || position.edge === 'right' ? position.edge : null
  const fallbackX = getEdgeX('right', viewportWidth)
  const fallbackY = Math.round(viewportHeight * 0.54)
  const y = clampPositionY(typeof position.y === 'number' ? position.y : fallbackY, viewportHeight)

  if (edge) {
    return { edge, x: getEdgeX(edge, viewportWidth), y }
  }

  const x = clampValue(
    typeof position.x === 'number' ? position.x : fallbackX,
    FLOAT_MARGIN,
    Math.max(FLOAT_MARGIN, viewportWidth - LAUNCH_SIZE - FLOAT_MARGIN),
  )
  return { edge: null, x, y }
}

function snapPosition(x: number, y: number, viewportWidth: number, viewportHeight: number): AiElfPosition {
  const nextY = clampPositionY(y, viewportHeight)
  if (x <= SNAP_DISTANCE) {
    return { edge: 'left', x: getEdgeX('left', viewportWidth), y: nextY }
  }
  if (x >= viewportWidth - LAUNCH_SIZE - SNAP_DISTANCE) {
    return { edge: 'right', x: getEdgeX('right', viewportWidth), y: nextY }
  }

  return {
    edge: null,
    x: clampValue(x, FLOAT_MARGIN, Math.max(FLOAT_MARGIN, viewportWidth - LAUNCH_SIZE - FLOAT_MARGIN)),
    y: nextY,
  }
}

function readSavedPosition(): AiElfPosition {
  if (typeof window === 'undefined') {
    return { edge: 'right', x: 0, y: 180 }
  }

  try {
    const saved = localStorage.getItem(POSITION_STORAGE_KEY)
    if (saved) {
      return normalizePosition(JSON.parse(saved) as Partial<AiElfPosition>, window.innerWidth, window.innerHeight)
    }
  } catch {
    // Fall through to legacy/fallback position.
  }

  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_DOCK_STORAGE_KEY) || '{}') as {
      side?: string
      top?: number
    }
    if (legacy.side === 'left' || legacy.side === 'right') {
      return normalizePosition(
        {
          edge: legacy.side,
          y: typeof legacy.top === 'number' ? legacy.top : Math.round(window.innerHeight * 0.54),
        },
        window.innerWidth,
        window.innerHeight,
      )
    }
  } catch {
    // Ignore malformed legacy settings.
  }

  return normalizePosition({ edge: 'right', y: Math.round(window.innerHeight * 0.54) }, window.innerWidth, window.innerHeight)
}

function savePosition(position: AiElfPosition) {
  if (typeof window === 'undefined') return
  localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position))
}

function makeInitialMessages(context: AiElfPageContext): ChatMessage[] {
  return [{ role: 'assistant', content: context.greeting }]
}

function makeSessionTitle(context: AiElfPageContext) {
  const title = `小精灵 · ${context.label}`
  return title.length > 40 ? `${title.slice(0, 40)}...` : title
}

function buildScopedQuestion(question: string, context: AiElfPageContext) {
  return [
    '你是 GMP 助学平台里的页面 AI 小精灵。请用中文回答，语气友好，内容简洁、专业、可执行。',
    `当前页面：${context.label}`,
    `页面用途：${context.intent}`,
    `回答边界：${context.scope}`,
    '如果当前页面实时数据没有提供，不要编造具体数值或记录。',
    `用户问题：${question}`,
  ].join('\n')
}

function compactQuestion(question: string) {
  const normalized = question.replace(/\s+/g, ' ').trim()
  return normalized.length > 120 ? `${normalized.slice(0, 120)}...` : normalized
}

function inferMissionModule(pathname: string): SmartMissionModule {
  if (pathname.startsWith('/course')) return 'course'
  if (pathname.startsWith('/practice')) return 'practice'
  if (pathname.startsWith('/simulation')) return 'simulation'
  if (pathname.startsWith('/progress')) return 'progress'
  if (pathname.startsWith('/report')) return 'report'
  if (pathname.startsWith('/streak')) return 'streak'
  if (pathname.startsWith('/chat')) return 'chat'
  if (pathname.startsWith('/profile')) return 'profile'
  if (pathname.startsWith('/plan')) return 'plan'
  return 'dashboard'
}

function generatedMissionLabel(value: SmartMissionResponse['generatedBy']) {
  if (value === 'ai+rules') return 'AI + 规则'
  if (value === 'starter') return '待前测'
  return '规则自适应'
}

function buildCoachQuestion(context: AiElfPageContext, data: SmartMissionResponse, mission: SmartMissionItem) {
  const evidence = mission.evidence.length ? `依据：${mission.evidence.slice(0, 3).join('；')}` : ''
  return [
    `我现在在${context.label}页面。`,
    `我的当前主攻方向是${data.primaryFocus}。`,
    `系统建议：${mission.title}。`,
    `原因：${mission.reason}。`,
    evidence,
    '请把它拆成现在可以执行的 3 个学习动作，并告诉我完成后去哪个模块验收。',
  ].filter(Boolean).join('\n')
}

function AiElfMark({
  active,
  variant = 'panel',
}: {
  active: boolean
  variant?: 'panel' | 'dock' | 'float'
}) {
  return (
    <span className={`ai-elf-mark ai-elf-mark--${variant} ${active ? 'ai-elf-mark--active' : ''}`} aria-hidden="true">
      <svg className="ai-elf-mark__svg" viewBox="0 0 64 64" focusable="false">
        <ellipse className="ai-elf-mark__shadow" cx="31.5" cy="58" rx="17" ry="4.2" />

        <g className="ai-elf-mark__dock-arms">
          <path className="ai-elf-mark__arm" d="M39.8 31.2C47.8 27.9 52.2 28.2 57.4 31.5C59 32.5 58.8 35.1 57 35.8C52.2 37.7 47.3 36.7 40.9 38.7Z" />
          <path className="ai-elf-mark__arm" d="M39.8 42.8C47.2 42.7 52.2 43.8 56.7 47.5C58.2 48.7 57.5 51.2 55.6 51.5C50.8 52.1 46.7 49.5 39.5 47.6Z" />
          <ellipse className="ai-elf-mark__hand" cx="56.1" cy="32" rx="5" ry="5.8" />
          <ellipse className="ai-elf-mark__hand" cx="55.7" cy="48.1" rx="4.9" ry="5.6" />
        </g>

        <g className="ai-elf-mark__panel-arms">
          <path className="ai-elf-mark__arm" d="M23.8 42.7C18.5 40.4 13.4 41.7 11.6 45.6C10.8 47.2 12.5 48.8 14.1 48C17.4 46.3 20.3 47.2 24.9 50.4Z" />
          <path className="ai-elf-mark__arm" d="M40.2 42.7C45.5 40.4 50.6 41.7 52.4 45.6C53.2 47.2 51.5 48.8 49.9 48C46.6 46.3 43.7 47.2 39.1 50.4Z" />
          <circle className="ai-elf-mark__hand" cx="13.8" cy="45.9" r="4" />
          <circle className="ai-elf-mark__hand" cx="50.2" cy="45.9" r="4" />
        </g>

        <path className="ai-elf-mark__body-shape" d="M17.5 44.2C21.2 38.8 26.2 36.7 32 36.7C37.8 36.7 42.8 38.8 46.5 44.2C49.2 48.2 48.4 55 45.6 57.4C37.8 60.6 24.2 60.6 16.4 57.4C13.6 55 14.8 48.2 17.5 44.2Z" />
        <path className="ai-elf-mark__body-light" d="M23.5 43.6C27.4 41.7 35.5 41.7 39.8 43.7C35.4 46.1 27.9 46.1 23.5 43.6Z" />
        <circle className="ai-elf-mark__badge" cx="32" cy="51.4" r="3.8" />

        <path className="ai-elf-mark__antenna" d="M39.4 10.6C42.7 7.8 46 7.8 49 10.7" />
        <circle className="ai-elf-mark__spark" cx="49.6" cy="11.3" r="3.2" />
        <path className="ai-elf-mark__head-shape" d="M15.5 24.6C15.5 14.2 23 8.1 32 8.1C41 8.1 48.5 14.2 48.5 24.6C48.5 34.4 41.5 40.3 32 40.3C22.5 40.3 15.5 34.4 15.5 24.6Z" />
        <path className="ai-elf-mark__head-gloss" d="M19.5 21.3C21.1 13.8 26.3 10.7 32 10.7C38 10.7 43.1 14.3 45.1 21C38.2 17.3 27.4 17.2 19.5 21.3Z" />
        <path className="ai-elf-mark__face" d="M20.6 23.6C20.6 19.9 24.6 17.7 32 17.7C39.4 17.7 43.4 19.9 43.4 23.6V26.7C43.4 32.4 39.2 35.4 32 35.4C24.8 35.4 20.6 32.4 20.6 26.7Z" />
        <circle className="ai-elf-mark__eye" cx="28.2" cy="25.8" r="1.9" />
        <circle className="ai-elf-mark__eye" cx="35.8" cy="25.8" r="1.9" />
        <path className="ai-elf-mark__smile" d="M28.5 30C30.3 32 33.7 32 35.5 30" />
      </svg>
    </span>
  )
}

export default function AiElfFloatingAssistant() {
  const router = useRouter()
  const pathname = usePathname()
  const context = useMemo(() => getAiElfPageContext(pathname), [pathname])
  const hiddenByRoute = shouldHideAiElf(pathname)

  const [mounted, setMounted] = useState(false)
  const [token, setToken] = useState('')
  const [themeColor, setThemeColor] = useState(DEFAULT_THEME_COLOR)
  const [darkMode, setDarkMode] = useState(false)
  const [open, setOpen] = useState(false)
  const [showHint, setShowHint] = useState(true)
  const [messages, setMessages] = useState<ChatMessage[]>(() => makeInitialMessages(context))
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [position, setPosition] = useState<AiElfPosition>({ edge: 'right', x: 0, y: 180 })
  const [viewport, setViewport] = useState({ width: 1280, height: 720 })
  const [dragging, setDragging] = useState(false)
  const [smartMission, setSmartMission] = useState<SmartMissionResponse | null>(null)
  const [smartMissionLoading, setSmartMissionLoading] = useState(false)
  const [simulationImmersive, setSimulationImmersive] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const ignoreNextClickRef = useRef(false)
  const dragCleanupRef = useRef<(() => void) | null>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    startPositionX: number
    startPositionY: number
    moved: boolean
  } | null>(null)

  const visible = mounted && Boolean(token) && !hiddenByRoute && !simulationImmersive

  useEffect(() => {
    setMounted(true)

    function syncClientState() {
      setToken(localStorage.getItem('token') || '')
      const theme = readThemeSettings()
      setThemeColor(theme.themeColor)
      setDarkMode(theme.darkMode)
    }

    function syncViewport() {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
      setPosition(prev => normalizePosition(prev, window.innerWidth, window.innerHeight))
    }

    syncClientState()
    setPosition(readSavedPosition())
    syncViewport()
    window.addEventListener('storage', syncClientState)
    window.addEventListener('resize', syncViewport)
    return () => {
      window.removeEventListener('storage', syncClientState)
      window.removeEventListener('resize', syncViewport)
      dragCleanupRef.current?.()
    }
  }, [])

  useEffect(() => {
    if (!mounted) return
    setToken(localStorage.getItem('token') || '')
    const theme = readThemeSettings()
    setThemeColor(theme.themeColor)
    setDarkMode(theme.darkMode)
    if (pathname !== '/simulation') setSimulationImmersive(false)
  }, [pathname, open, mounted])

  useEffect(() => {
    function syncSimulationImmersive(event: Event) {
      const immersive = Boolean((event as CustomEvent<boolean>).detail)
      setSimulationImmersive(immersive)
      if (immersive) setOpen(false)
    }

    window.addEventListener('gmp-simulation-immersive', syncSimulationImmersive)
    return () => window.removeEventListener('gmp-simulation-immersive', syncSimulationImmersive)
  }, [])

  useEffect(() => {
    setMessages(makeInitialMessages(context))
    setInput('')
    setActiveSessionId(null)
    setShowHint(true)
    abortRef.current?.abort()
    setLoading(false)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [context])

  useEffect(() => {
    if (!showHint || open) return
    const timer = window.setTimeout(() => setShowHint(false), 7000)
    return () => window.clearTimeout(timer)
  }, [showHint, open, pathname])

  useEffect(() => {
    if (!open || hiddenByRoute) return
    if (context.audience !== 'student') {
      setSmartMission(null)
      return
    }
    const activeToken = token || localStorage.getItem('token') || ''
    if (!activeToken) return

    const controller = new AbortController()
    setSmartMissionLoading(true)
    fetch('/api/smart-missions', {
      headers: { Authorization: `Bearer ${activeToken}` },
      signal: controller.signal,
    })
      .then(response => response.ok ? response.json() : null)
      .then((payload: SmartMissionResponse | null) => {
        if (payload) setSmartMission(payload)
      })
      .catch(error => {
        if (error?.name !== 'AbortError') setSmartMission(null)
      })
      .finally(() => setSmartMissionLoading(false))

    return () => controller.abort()
  }, [context.audience, hiddenByRoute, open, pathname, token])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function ensureSession(question: string, activeToken: string) {
    if (activeSessionId) return activeSessionId

    const response = await fetch('/api/agent/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` },
      body: JSON.stringify({
        audience: context.audience,
        title: makeSessionTitle(context),
        eduLevel: localStorage.getItem('edu_level') || null,
      }),
    })

    if (!response.ok) throw new Error('Failed to create AI elf session')

    const data = await response.json() as { session: ChatSession }
    setActiveSessionId(data.session.sessionId)

    if (data.session.messageCount === 0) {
      await saveMessage(data.session.sessionId, {
        role: 'assistant',
        content: context.greeting,
      }, activeToken)
    }

    return data.session.sessionId
  }

  async function saveMessage(sessionId: string, message: ChatMessage, activeToken: string) {
    await fetch(`/api/agent/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` },
      body: JSON.stringify({
        role: message.role,
        content: message.content,
        sources: message.sources,
        criticTriggered: message.criticTriggered,
        eduLevel: localStorage.getItem('edu_level') || null,
      }),
    })
  }

  function resetConversation() {
    abortRef.current?.abort()
    setLoading(false)
    setMessages(makeInitialMessages(context))
    setActiveSessionId(null)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  function stopResponse() {
    abortRef.current?.abort()
    abortRef.current = null
    setLoading(false)
  }

  function handleInputChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(event.target.value)
    const el = event.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendQuestion(input)
    }
  }

  function handleLaunchPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    dragCleanupRef.current?.()
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startPositionX: position.x,
      startPositionY: position.y,
      moved: false,
    }
    setDragging(true)

    const handleMove = (nativeEvent: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return

      const dx = nativeEvent.clientX - drag.startX
      const dy = nativeEvent.clientY - drag.startY
      if (!drag.moved && Math.hypot(dx, dy) > 5) {
        drag.moved = true
        setShowHint(false)
      }

      if (!drag.moved) return

      setPosition(snapPosition(drag.startPositionX + dx, drag.startPositionY + dy, viewport.width, viewport.height))
    }

    const handleEnd = (nativeEvent: PointerEvent) => {
      const drag = dragRef.current
      if (drag?.moved) {
        ignoreNextClickRef.current = true
        window.setTimeout(() => {
          ignoreNextClickRef.current = false
        }, 250)
        const nextPosition = snapPosition(
          drag.startPositionX + nativeEvent.clientX - drag.startX,
          drag.startPositionY + nativeEvent.clientY - drag.startY,
          viewport.width,
          viewport.height,
        )
        setPosition(nextPosition)
        savePosition(nextPosition)
      }
      dragRef.current = null
      setDragging(false)
      dragCleanupRef.current?.()
      dragCleanupRef.current = null
    }

    dragCleanupRef.current = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleEnd)
      window.removeEventListener('pointercancel', handleEnd)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleEnd)
    window.addEventListener('pointercancel', handleEnd)
  }

  function explainSelection() {
    const selection = window.getSelection()?.toString().trim()
    if (!selection) {
      setInput('请帮我解释我在当前页面看到的一段内容。')
      setOpen(true)
      window.setTimeout(() => textareaRef.current?.focus(), 0)
      return
    }
    void sendQuestion(`请解释这段内容，并说明它和 GMP 学习的关系：${selection.slice(0, 600)}`)
  }

  async function sendQuestion(rawQuestion: string) {
    const question = rawQuestion.trim()
    if (!question || loading) return

    const activeToken = token || localStorage.getItem('token') || ''
    if (!activeToken) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: '请先登录后再使用 GMP 小精灵。' },
      ])
      return
    }

    setToken(activeToken)
    setOpen(true)
    setShowHint(false)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const visibleQuestion = compactQuestion(question)
    const history = messages
      .slice(-6)
      .map(message => ({ role: message.role, content: message.content }))

    setMessages(prev => [
      ...prev,
      { role: 'user', content: visibleQuestion },
      { role: 'assistant', content: '' },
    ])
    setLoading(true)

    const controller = new AbortController()
    abortRef.current = controller
    let assistantContent = ''
    let assistantSources: string[] | undefined
    let assistantCriticTriggered = false

    try {
      const sessionId = await ensureSession(question, activeToken)
      await saveMessage(sessionId, { role: 'user', content: visibleQuestion }, activeToken)

      const response = await fetch('/api/agent/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` },
        body: JSON.stringify({
          audience: context.audience,
          question: buildScopedQuestion(question, context),
          edu_level: localStorage.getItem('edu_level') || null,
          history,
        }),
        signal: controller.signal,
      }).catch(() => null)

      if (!response || !response.ok || !response.body) {
        setMessages(prev => {
          const next = [...prev]
          next[next.length - 1] = {
            role: 'assistant',
            content: 'AI 服务暂时不可用，请确认 gmp-api 已启动后再试。',
          }
          return next
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
            const event = JSON.parse(payload) as {
              chunk?: string
              done?: boolean
              error?: string
              sources?: string[]
              critic_triggered?: boolean
            }

            if (event.error) {
              assistantContent = event.error
              setMessages(prev => {
                const next = [...prev]
                next[next.length - 1] = {
                  role: 'assistant',
                  content: event.error || 'AI 服务暂时不可用，请稍后重试。',
                }
                return next
              })
            } else if (event.chunk) {
              assistantContent += event.chunk
              setMessages(prev => {
                const next = [...prev]
                next[next.length - 1] = {
                  ...next[next.length - 1],
                  content: `${next[next.length - 1].content}${event.chunk}`,
                }
                return next
              })
            } else if (event.done) {
              assistantSources = event.sources
              assistantCriticTriggered = Boolean(event.critic_triggered)
              setMessages(prev => {
                const next = [...prev]
                next[next.length - 1] = {
                  ...next[next.length - 1],
                  sources: event.sources,
                  criticTriggered: event.critic_triggered,
                }
                return next
              })
            }
          } catch {
            // Ignore malformed stream fragments.
          }
        }
      }

      if (!assistantContent.trim()) {
        setMessages(prev => {
          const next = [...prev]
          next[next.length - 1] = {
            role: 'assistant',
            content: 'AI 服务暂时不可用，请稍后重试。',
          }
          return next
        })
        return
      }

      if (assistantContent.trim()) {
        await saveMessage(sessionId, {
          role: 'assistant',
          content: assistantContent,
          sources: assistantSources,
          criticTriggered: assistantCriticTriggered,
        }, activeToken)
      }
    } catch (error) {
      if (controller.signal.aborted) return
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = {
          role: 'assistant',
          content: 'AI 服务暂时不可用，请稍后重试。',
        }
        return next
      })
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setLoading(false)
    }
  }

  const attachedEdge = position.edge
  const panelSide: EdgeSide = attachedEdge ?? (position.x > viewport.width / 2 ? 'right' : 'left')
  const launcherMarkVariant: 'dock' | 'float' = attachedEdge ? 'dock' : 'float'
  const panelHeight = Math.min(620, Math.max(360, viewport.height - 116))
  const desiredPanelTop = -(panelHeight / 2) + (LAUNCH_SIZE / 2)
  const minPanelTop = 12 - position.y
  const maxPanelTop = viewport.height - panelHeight - 12 - position.y
  const panelTop = Math.max(minPanelTop, Math.min(desiredPanelTop, maxPanelTop))
  const activeMissionModule = useMemo(() => inferMissionModule(pathname), [pathname])
  const pageMission = useMemo(() => {
    if (!smartMission) return null
    return smartMission.modules.find(item => item.module === activeMissionModule)
      ?? smartMission.chain.find(item => item.status === 'recommended')
      ?? smartMission.chain[0]
      ?? smartMission.modules[0]
      ?? null
  }, [activeMissionModule, smartMission])
  const nextMission = smartMission?.chain.find(item => item.status === 'recommended') ?? smartMission?.chain[0] ?? pageMission

  const rootStyle: CSSProperties & {
    '--ai-elf-accent': string
    '--ai-elf-accent-soft': string
    '--ai-elf-accent-medium': string
    '--ai-elf-accent-strong': string
    '--ai-elf-panel-top': string
  } = {
    '--ai-elf-accent': themeColor,
    '--ai-elf-accent-soft': hexToRgba(themeColor, 0.1),
    '--ai-elf-accent-medium': hexToRgba(themeColor, 0.2),
    '--ai-elf-accent-strong': hexToRgba(themeColor, 0.34),
    '--ai-elf-panel-top': `${panelTop}px`,
    left: position.x,
    top: position.y,
  }

  if (!visible) return null

  return (
    <div
      className={`ai-elf ai-elf--${panelSide} ${attachedEdge ? 'ai-elf--docked' : 'ai-elf--free'} ${darkMode ? 'ai-elf--dark' : ''} ${open ? 'ai-elf--open' : ''} ${dragging ? 'ai-elf--dragging' : ''}`}
      style={rootStyle}
    >
      <style>{`
        .ai-elf {
          position: fixed;
          z-index: 3600;
          color: #183b4b;
          font-family: Inter, "PingFang SC", "Microsoft YaHei", Arial, Helvetica, sans-serif;
          pointer-events: none;
          user-select: none;
          transition: left 180ms ease, top 180ms ease;
        }

        .ai-elf--dragging {
          transition: none;
        }

        .ai-elf * {
          box-sizing: border-box;
        }

        .ai-elf button,
        .ai-elf a,
        .ai-elf textarea {
          font-family: inherit;
        }

        .ai-elf-panel {
          position: absolute;
          top: var(--ai-elf-panel-top);
          width: 382px;
          max-width: calc(100vw - 32px);
          height: min(620px, calc(100dvh - 116px));
          border-radius: 18px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.94);
          border: 1px solid rgba(31, 71, 92, 0.12);
          box-shadow: 0 24px 70px rgba(17, 37, 52, 0.18);
          backdrop-filter: blur(20px);
          display: flex;
          flex-direction: column;
          animation: aiElfPanelIn 180ms ease-out;
          pointer-events: auto;
        }

        .ai-elf--right .ai-elf-panel {
          right: 86px;
          transform-origin: right center;
        }

        .ai-elf--left .ai-elf-panel {
          left: 86px;
          transform-origin: left center;
        }

        .ai-elf--dark .ai-elf-panel {
          color: #f4f4f5;
          background: rgba(21, 31, 46, 0.94);
          border-color: rgba(255, 255, 255, 0.1);
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.36);
        }

        .ai-elf-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px;
          border-bottom: 1px solid rgba(31, 71, 92, 0.09);
          background: linear-gradient(180deg, rgba(247, 251, 250, 0.95), rgba(255, 255, 255, 0.82));
        }

        .ai-elf--dark .ai-elf-header {
          border-bottom-color: rgba(255, 255, 255, 0.08);
          background: linear-gradient(180deg, rgba(27, 43, 61, 0.98), rgba(18, 29, 43, 0.86));
        }

        .ai-elf-title {
          min-width: 0;
          flex: 1;
        }

        .ai-elf-title strong {
          display: block;
          color: inherit;
          font-size: 14px;
          line-height: 1.25;
        }

        .ai-elf-title span {
          display: block;
          color: #6b8a98;
          font-size: 12px;
          line-height: 1.35;
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .ai-elf--dark .ai-elf-title span {
          color: #bfcbd9;
        }

        .ai-elf-icon-button {
          width: 30px;
          height: 30px;
          border: 1px solid rgba(31, 71, 92, 0.1);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.7);
          color: #6b8a98;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
        }

        .ai-elf-icon-button:hover {
          color: var(--ai-elf-accent);
          border-color: var(--ai-elf-accent-medium);
          background: var(--ai-elf-accent-soft);
        }

        .ai-elf--dark .ai-elf-icon-button {
          color: #bfcbd9;
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.1);
        }

        .ai-elf-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 14px;
          background:
            linear-gradient(180deg, rgba(246, 251, 251, 0.62), rgba(255, 255, 255, 0.3)),
            repeating-linear-gradient(135deg, rgba(29, 111, 120, 0.035) 0, rgba(29, 111, 120, 0.035) 1px, transparent 1px, transparent 12px);
        }

        .ai-elf--dark .ai-elf-body {
          background:
            linear-gradient(180deg, rgba(17, 24, 39, 0.3), rgba(15, 23, 42, 0.18)),
            repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.035) 0, rgba(255, 255, 255, 0.035) 1px, transparent 1px, transparent 12px);
        }

        .ai-elf-coach-card {
          position: relative;
          display: grid;
          gap: 9px;
          margin-bottom: 14px;
          padding: 12px;
          border: 1px solid rgba(29, 111, 120, 0.16);
          border-radius: 14px;
          background:
            linear-gradient(135deg, rgba(238, 249, 246, 0.94), rgba(255, 255, 255, 0.88)),
            rgba(255, 255, 255, 0.92);
          box-shadow: 0 14px 32px rgba(23, 68, 78, 0.1);
        }

        .ai-elf--dark .ai-elf-coach-card {
          border-color: rgba(125, 211, 193, 0.22);
          background:
            linear-gradient(135deg, rgba(18, 56, 61, 0.82), rgba(33, 43, 55, 0.88)),
            rgba(20, 31, 45, 0.9);
          box-shadow: 0 16px 34px rgba(0, 0, 0, 0.28);
        }

        .ai-elf-coach-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .ai-elf-coach-head span {
          min-width: 0;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: var(--ai-elf-accent);
          font-size: 11px;
          font-weight: 800;
          line-height: 1.2;
        }

        .ai-elf-coach-head strong {
          flex-shrink: 0;
          padding: 3px 7px;
          color: #365867;
          border: 1px solid rgba(31, 71, 92, 0.1);
          border-radius: 7px;
          background: rgba(255, 255, 255, 0.68);
          font-size: 10px;
          line-height: 1.2;
        }

        .ai-elf--dark .ai-elf-coach-head strong {
          color: #d6e5eb;
          border-color: rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.06);
        }

        .ai-elf-coach-card h3 {
          margin: 0;
          color: #173d4a;
          font-size: 14px;
          line-height: 1.35;
        }

        .ai-elf--dark .ai-elf-coach-card h3 {
          color: #f5fbfc;
        }

        .ai-elf-coach-card p {
          margin: 0;
          color: #5f7884;
          font-size: 12px;
          line-height: 1.5;
        }

        .ai-elf--dark .ai-elf-coach-card p {
          color: #bfcbd9;
        }

        .ai-elf-coach-route {
          display: grid;
          grid-template-columns: 1fr;
          gap: 6px;
        }

        .ai-elf-coach-route span {
          min-height: 30px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 8px;
          color: #275363;
          border: 1px solid rgba(29, 111, 120, 0.13);
          border-radius: 9px;
          background: rgba(255, 255, 255, 0.68);
          font-size: 11px;
          line-height: 1.35;
          font-weight: 700;
        }

        .ai-elf--dark .ai-elf-coach-route span {
          color: #d6f4f0;
          border-color: rgba(125, 211, 193, 0.18);
          background: rgba(255, 255, 255, 0.055);
        }

        .ai-elf-coach-evidence {
          display: grid;
          gap: 5px;
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .ai-elf-coach-evidence li {
          position: relative;
          padding-left: 12px;
          color: #617a86;
          font-size: 11px;
          line-height: 1.38;
        }

        .ai-elf-coach-evidence li::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0.55em;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--ai-elf-accent);
        }

        .ai-elf--dark .ai-elf-coach-evidence li {
          color: #bfcbd9;
        }

        .ai-elf-coach-next {
          padding-top: 2px;
          color: #365867 !important;
          font-weight: 700;
        }

        .ai-elf--dark .ai-elf-coach-next {
          color: #d9eef2 !important;
        }

        .ai-elf-coach-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .ai-elf-coach-actions button {
          min-height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          padding: 0 10px;
          border-radius: 10px;
          border: 1px solid var(--ai-elf-accent-medium);
          background: rgba(255, 255, 255, 0.72);
          color: var(--ai-elf-accent);
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
        }

        .ai-elf-coach-actions button:first-child {
          color: #fff;
          border-color: transparent;
          background: var(--ai-elf-accent);
          box-shadow: 0 10px 22px var(--ai-elf-accent-medium);
        }

        .ai-elf-coach-actions button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          box-shadow: none;
        }

        .ai-elf--dark .ai-elf-coach-actions button {
          background: rgba(255, 255, 255, 0.06);
        }

        .ai-elf-coach-loading {
          min-height: 70px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          color: #6b8a98;
          font-size: 12px;
          font-weight: 700;
        }

        .ai-elf-coach-loading svg {
          animation: aiElfSpin 1s linear infinite;
        }

        .ai-elf-message {
          display: flex;
          gap: 9px;
          margin-bottom: 12px;
        }

        .ai-elf-message--user {
          justify-content: flex-end;
        }

        .ai-elf-message__avatar {
          width: 28px;
          height: 28px;
          border-radius: 10px;
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          background: linear-gradient(135deg, #1f5568, var(--ai-elf-accent));
          box-shadow: 0 8px 18px var(--ai-elf-accent-medium);
        }

        .ai-elf-message--user .ai-elf-message__avatar {
          display: none;
        }

        .ai-elf-bubble {
          max-width: 82%;
          border-radius: 14px;
          padding: 9px 11px;
          font-size: 13px;
          line-height: 1.65;
          white-space: pre-wrap;
          word-break: break-word;
          border: 1px solid rgba(31, 71, 92, 0.1);
          background: rgba(255, 255, 255, 0.9);
          color: #183b4b;
        }

        .ai-elf--dark .ai-elf-bubble {
          color: #f4f4f5;
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.1);
        }

        .ai-elf-message--user .ai-elf-bubble {
          color: #fff;
          background: linear-gradient(135deg, #1f5568, var(--ai-elf-accent));
          border-color: transparent;
          box-shadow: 0 10px 22px var(--ai-elf-accent-medium);
        }

        .ai-elf-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 8px 0 14px 37px;
        }

        .ai-elf-action {
          border: 1px solid rgba(31, 71, 92, 0.11);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.78);
          color: #31515f;
          font-size: 12px;
          font-weight: 650;
          padding: 7px 9px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          transition: transform 140ms ease, color 140ms ease, border-color 140ms ease, background 140ms ease;
        }

        .ai-elf-action:hover {
          transform: translateY(-1px);
          color: var(--ai-elf-accent);
          border-color: var(--ai-elf-accent-medium);
          background: var(--ai-elf-accent-soft);
        }

        .ai-elf--dark .ai-elf-action {
          color: #d7e0ea;
          border-color: rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.055);
        }

        .ai-elf-footer {
          border-top: 1px solid rgba(31, 71, 92, 0.1);
          padding: 11px;
          background: rgba(255, 255, 255, 0.92);
        }

        .ai-elf--dark .ai-elf-footer {
          border-top-color: rgba(255, 255, 255, 0.08);
          background: rgba(18, 29, 43, 0.95);
        }

        .ai-elf-input-row {
          display: flex;
          gap: 8px;
          align-items: flex-end;
          border: 1px solid rgba(31, 71, 92, 0.12);
          border-radius: 12px;
          padding: 8px;
          background: #fff;
        }

        .ai-elf--dark .ai-elf-input-row {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.1);
        }

        .ai-elf-textarea {
          flex: 1;
          min-height: 38px;
          max-height: 112px;
          resize: none;
          border: none;
          outline: none;
          background: transparent;
          color: #183b4b;
          font-size: 13px;
          line-height: 1.55;
          padding: 0;
        }

        .ai-elf-textarea::placeholder {
          color: #8da3ad;
        }

        .ai-elf--dark .ai-elf-textarea {
          color: #f4f4f5;
        }

        .ai-elf-send {
          width: 36px;
          height: 36px;
          flex-shrink: 0;
          border: none;
          border-radius: 10px;
          background: linear-gradient(135deg, #1f5568, var(--ai-elf-accent));
          color: #fff;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 10px 20px var(--ai-elf-accent-medium);
        }

        .ai-elf-send:disabled {
          cursor: not-allowed;
          opacity: 0.58;
          box-shadow: none;
        }

        .ai-elf-tools {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 8px;
          margin-top: 8px;
        }

        .ai-elf-tool-button {
          border: none;
          background: transparent;
          color: #6b8a98;
          font-size: 12px;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 2px;
          cursor: pointer;
        }

        .ai-elf-tool-button:hover {
          color: var(--ai-elf-accent);
        }

        .ai-elf--dark .ai-elf-tool-button {
          color: #bfcbd9;
        }

        .ai-elf-launch-row {
          position: relative;
          width: 64px;
          height: 64px;
          display: block;
          align-items: center;
          pointer-events: none;
        }

        .ai-elf-hint {
          position: absolute;
          top: 50%;
          max-width: 220px;
          min-width: max-content;
          padding: 8px 10px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.94);
          color: #31515f;
          border: 1px solid rgba(31, 71, 92, 0.11);
          box-shadow: 0 12px 32px rgba(17, 37, 52, 0.13);
          font-size: 12px;
          line-height: 1.45;
          pointer-events: auto;
          transform: translateY(-50%);
          animation: aiElfHintIn 220ms ease-out;
        }

        .ai-elf--right .ai-elf-hint {
          right: 74px;
        }

        .ai-elf--left .ai-elf-hint {
          left: 74px;
        }

        .ai-elf--dark .ai-elf-hint {
          color: #d7e0ea;
          background: rgba(21, 31, 46, 0.94);
          border-color: rgba(255, 255, 255, 0.1);
        }

        .ai-elf-launch {
          width: 64px;
          height: 64px;
          border: none;
          border-radius: 18px;
          color: var(--ai-elf-accent);
          background: transparent;
          box-shadow: none;
          cursor: grab;
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          pointer-events: auto;
          touch-action: none;
          transition: transform 150ms ease, filter 150ms ease;
        }

        .ai-elf-launch:hover {
          transform: translateX(-2px);
          filter: drop-shadow(0 18px 28px var(--ai-elf-accent-strong));
        }

        .ai-elf--left .ai-elf-launch:hover {
          transform: translateX(2px);
        }

        .ai-elf--dragging .ai-elf-launch {
          cursor: grabbing;
          transform: scale(1.02);
        }

        .ai-elf-mark {
          position: relative;
          width: 48px;
          height: 48px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          --ai-elf-mascot-main: #2f93cf;
          --ai-elf-mascot-deep: #1e668f;
          --ai-elf-mascot-head: #37a9d4;
          --ai-elf-mascot-face: #e9fbff;
          --ai-elf-mascot-accent: #f5bf56;
          --ai-elf-mascot-hand: #f2c76b;
          --ai-elf-mascot-ink: #123f56;
        }

        .ai-elf-mark--dock {
          width: 62px;
          height: 62px;
          transition: transform 150ms ease;
        }

        .ai-elf-mark--float {
          width: 62px;
          height: 62px;
          transition: transform 150ms ease;
        }

        .ai-elf-mark__svg {
          width: 100%;
          height: 100%;
          overflow: visible;
          filter: drop-shadow(0 12px 18px rgba(13, 62, 72, 0.2));
          transition: transform 150ms ease, filter 150ms ease;
        }

        .ai-elf-mark--panel .ai-elf-mark__svg {
          width: 48px;
          height: 48px;
        }

        .ai-elf--right .ai-elf-launch .ai-elf-mark--dock .ai-elf-mark__svg {
          transform: translateX(-9px);
        }

        .ai-elf--left .ai-elf-launch .ai-elf-mark--dock .ai-elf-mark__svg {
          transform: translateX(9px) scaleX(-1);
        }

        .ai-elf-mark__shadow {
          fill: rgba(14, 65, 76, 0.16);
        }

        .ai-elf-mark__panel-arms,
        .ai-elf-mark__dock-arms {
          transform-box: fill-box;
          transform-origin: center;
        }

        .ai-elf-mark--panel .ai-elf-mark__dock-arms,
        .ai-elf-mark--float .ai-elf-mark__dock-arms {
          display: none;
        }

        .ai-elf-mark--dock .ai-elf-mark__panel-arms {
          display: none;
        }

        .ai-elf-mark__arm {
          fill: var(--ai-elf-mascot-deep);
        }

        .ai-elf-mark__hand {
          fill: var(--ai-elf-mascot-hand);
        }

        .ai-elf-mark__body-shape {
          fill: var(--ai-elf-mascot-main);
        }

        .ai-elf-mark__body-light {
          fill: rgba(255, 255, 255, 0.22);
        }

        .ai-elf-mark__badge,
        .ai-elf-mark__spark {
          fill: var(--ai-elf-mascot-accent);
        }

        .ai-elf-mark__antenna {
          fill: none;
          stroke: var(--ai-elf-mascot-accent);
          stroke-width: 2.2;
          stroke-linecap: round;
        }

        .ai-elf-mark__head-shape {
          fill: var(--ai-elf-mascot-head);
        }

        .ai-elf-mark__head-gloss {
          fill: rgba(255, 255, 255, 0.2);
        }

        .ai-elf-mark__face {
          fill: var(--ai-elf-mascot-face);
        }

        .ai-elf-mark__eye {
          fill: var(--ai-elf-mascot-ink);
        }

        .ai-elf-mark__smile {
          fill: none;
          stroke: var(--ai-elf-mascot-ink);
          stroke-width: 1.8;
          stroke-linecap: round;
        }

        .ai-elf-mark--active .ai-elf-mark__svg {
          filter:
            drop-shadow(0 0 0 rgba(245, 184, 73, 0.1))
            drop-shadow(0 14px 22px rgba(13, 62, 72, 0.24));
        }

        .ai-elf-loading {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #6b8a98;
          font-size: 12px;
          margin-left: 37px;
          margin-bottom: 10px;
        }

        .ai-elf-loading svg {
          animation: aiElfSpin 1s linear infinite;
        }

        .ai-elf-empty-answer {
          color: #8da3ad;
        }

        @keyframes aiElfPanelIn {
          from { opacity: 0; transform: translateY(10px) scale(0.985); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes aiElfHintIn {
          from { opacity: 0; transform: translateY(-50%) translateX(8px); }
          to { opacity: 1; transform: translateY(-50%) translateX(0); }
        }

        @keyframes aiElfSpin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 640px) {
          .ai-elf-panel {
            position: fixed;
            left: 12px;
            right: 12px;
            top: auto;
            bottom: 86px;
            width: auto;
            max-width: none;
            height: min(600px, calc(100dvh - 96px));
            border-radius: 16px;
          }

          .ai-elf-actions {
            margin-left: 0;
          }

          .ai-elf-coach-actions {
            grid-template-columns: 1fr;
          }

          .ai-elf-launch {
            width: 58px;
            height: 58px;
            border-radius: 18px;
          }

          .ai-elf-hint {
            display: none;
          }
        }
      `}</style>

      {open && (
        <section className="ai-elf-panel" aria-label="GMP AI 小精灵浮窗">
          <header className="ai-elf-header">
            <AiElfMark active={loading} />
            <div className="ai-elf-title">
              <strong>GMP 小精灵</strong>
              <span>{context.label} - {context.hint}</span>
            </div>
            <button
              type="button"
              className="ai-elf-icon-button"
              title="重新开始"
              aria-label="重新开始"
              onClick={resetConversation}
            >
              <RotateCcw size={15} />
            </button>
            <button
              type="button"
              className="ai-elf-icon-button"
              title="收起"
              aria-label="收起"
              onClick={() => setOpen(false)}
            >
              <Minimize2 size={15} />
            </button>
          </header>

          <div className="ai-elf-body">
            {(smartMissionLoading || pageMission) && (
              <section className="ai-elf-coach-card" aria-label="本页学习建议">
                {pageMission ? (
                  <>
                    <div className="ai-elf-coach-head">
                      <span><Sparkles size={14} /> 本页学习建议 · {generatedMissionLabel(smartMission?.generatedBy ?? 'rules')}</span>
                      <strong>{context.label}</strong>
                    </div>
                    <h3>{pageMission.title}</h3>
                    <p>{pageMission.reason}</p>
                    <div className="ai-elf-coach-route">
                      <span><Target size={13} /> 主攻 {smartMission?.primaryFocus ?? pageMission.label}</span>
                      <span><ClipboardList size={13} /> {pageMission.reward}</span>
                    </div>
                    {pageMission.evidence.length > 0 && (
                      <ul className="ai-elf-coach-evidence">
                        {pageMission.evidence.slice(0, 2).map(item => <li key={item}>{item}</li>)}
                      </ul>
                    )}
                    {nextMission && nextMission.title !== pageMission.title && (
                      <p className="ai-elf-coach-next">完成后继续：{nextMission.title}</p>
                    )}
                    <div className="ai-elf-coach-actions">
                      <button
                        type="button"
                        onClick={() => sendQuestion(buildCoachQuestion(context, smartMission!, pageMission))}
                        disabled={loading}
                      >
                        生成学习方案
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          router.push(pageMission.href)
                          setOpen(false)
                        }}
                      >
                        进入模块 <ChevronRight size={15} />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="ai-elf-coach-loading">
                    <Loader2 size={15} />
                    正在读取你的学习画像
                  </div>
                )}
              </section>
            )}

            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`ai-elf-message ${message.role === 'user' ? 'ai-elf-message--user' : ''}`}
              >
                <span className="ai-elf-message__avatar">
                  {message.role === 'assistant' ? <Bot size={15} /> : <MessageSquare size={15} />}
                </span>
                <div className={`ai-elf-bubble ${message.content ? '' : 'ai-elf-empty-answer'}`}>
                  {message.content || '正在思考...'}
                </div>
              </div>
            ))}

            <div className="ai-elf-actions">
              {context.quickActions.map(action => (
                <button
                  key={action.label}
                  type="button"
                  className="ai-elf-action"
                  disabled={loading}
                  onClick={() => sendQuestion(action.prompt)}
                >
                  <Lightbulb size={13} />
                  {action.label}
                </button>
              ))}
              <button
                type="button"
                className="ai-elf-action"
                disabled={loading}
                onClick={explainSelection}
              >
                <WandSparkles size={13} />
                解释选中
              </button>
            </div>

            {loading && (
              <div className="ai-elf-loading">
                <Loader2 size={13} />
                正在根据本页生成回答
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <footer className="ai-elf-footer">
            <div className="ai-elf-input-row">
              <textarea
                ref={textareaRef}
                className="ai-elf-textarea"
                value={input}
                rows={1}
                placeholder={context.placeholder}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
              />
              <button
                type="button"
                className="ai-elf-send"
                title={loading ? '停止生成' : '发送'}
                aria-label={loading ? '停止生成' : '发送'}
                disabled={!loading && !input.trim()}
                onClick={() => loading ? stopResponse() : sendQuestion(input)}
              >
                {loading ? <X size={16} /> : <Send size={16} />}
              </button>
            </div>

            <div className="ai-elf-tools">
              <button
                type="button"
                className="ai-elf-tool-button"
                onClick={() => sendQuestion('请告诉我当前页面你能帮我做什么。')}
                disabled={loading}
              >
                <Sparkles size={13} />
                本页能力
              </button>
            </div>
          </footer>
        </section>
      )}

      <div className="ai-elf-launch-row">
        {!open && showHint && (
          <button
            type="button"
            className="ai-elf-hint"
            onClick={() => setOpen(true)}
          >
            {context.hint}
          </button>
        )}
        <button
          type="button"
          className="ai-elf-launch"
          title="打开 GMP 小精灵"
          aria-label="打开 GMP 小精灵"
          onPointerDown={handleLaunchPointerDown}
          onClick={() => {
            if (ignoreNextClickRef.current) {
              ignoreNextClickRef.current = false
              return
            }
            setOpen(prev => !prev)
            setShowHint(false)
          }}
        >
          <AiElfMark active={open || loading} variant={launcherMarkVariant} />
        </button>
      </div>
    </div>
  )
}
