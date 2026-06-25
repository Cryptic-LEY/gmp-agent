'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Send, Bot, User, BookOpen, ChevronDown, Plus, MessageSquare, Trash2, Flag, X } from 'lucide-react'

interface Message {
  id?: number
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
  criticTriggered?: boolean
  createdAt?: string
}

interface ChatSession {
  sessionId: string
  title: string
  audience: 'student' | 'teacher'
  eduLevel: string | null
  messageCount: number
  createdAt: string
  updatedAt: string
}

const INITIAL_MESSAGE: Message = {
  role: 'assistant',
  content: '你好！我是GMP学习助手，可以帮你解答关于《药品生产质量管理规范》的任何问题。请问有什么需要了解的？',
}

const EDU_LEVELS = [
  { value: null,   label: '不限学历' },
  { value: '专科', label: '专科' },
  { value: '本科', label: '本科' },
]

const PANEL: React.CSSProperties = {
  background: 'rgba(255,255,255,0.88)',
  border: '1px solid rgba(31,71,92,0.12)',
  borderRadius: 20,
  boxShadow: '0 18px 44px rgba(29,53,74,0.09)',
  backdropFilter: 'blur(18px)',
}

function makeSessionTitle(question: string) {
  const title = question.replace(/\s+/g, ' ').trim()
  return title.length > 32 ? `${title.slice(0, 32)}...` : title
}

function formatSessionTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

export default function ChatPage() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE])
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [sessionLoading, setSessionLoading] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [eduLevel, setEduLevel] = useState<string | null>(null)
  const [showEduMenu, setShowEduMenu] = useState(false)
  const [feedbackTarget, setFeedbackTarget] = useState<Message | null>(null)
  const [feedbackComment, setFeedbackComment] = useState('')
  const [feedbackStatus, setFeedbackStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [feedbackNotice, setFeedbackNotice] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const tok = localStorage.getItem('token')
    if (!tok) { router.push('/login'); return }
    setToken(tok)
    void loadSessions(tok, true)
  }, [router])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function loadSessions(tok = token, openLatest = false) {
    if (!tok) return
    setHistoryLoading(true)
    try {
      const resp = await fetch('/api/agent/chat/sessions?audience=student', {
        headers: { Authorization: `Bearer ${tok}` },
      })
      if (!resp.ok) return
      const data = await resp.json() as { sessions?: ChatSession[] }
      const nextSessions = data.sessions ?? []
      setSessions(nextSessions)
      if (openLatest && nextSessions[0]) {
        await loadSession(nextSessions[0].sessionId, tok)
      }
    } finally {
      setHistoryLoading(false)
    }
  }

  async function loadSession(sessionId: string, tok = token) {
    if (!tok || loading) return
    setSessionLoading(true)
    try {
      const resp = await fetch(`/api/agent/chat/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${tok}` },
      })
      if (!resp.ok) return
      const data = await resp.json() as { session: ChatSession; messages: Message[] }
      setActiveSessionId(data.session.sessionId)
      setEduLevel(data.session.eduLevel)
      setMessages(data.messages.length ? data.messages : [INITIAL_MESSAGE])
      setFeedbackTarget(null)
      setSessions(prev => [data.session, ...prev.filter(session => session.sessionId !== data.session.sessionId)])
    } finally {
      setSessionLoading(false)
    }
  }

  function startNewChat() {
    if (loading) return
    setActiveSessionId(null)
    setMessages([INITIAL_MESSAGE])
    setInput('')
    setEduLevel(null)
    setFeedbackTarget(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  async function ensureSession(question: string) {
    if (activeSessionId) return activeSessionId

    const resp = await fetch('/api/agent/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        audience: 'student',
        title: makeSessionTitle(question),
        eduLevel,
      }),
    })
    if (!resp.ok) throw new Error('Failed to create chat session')

    const data = await resp.json() as { session: ChatSession }
    setActiveSessionId(data.session.sessionId)
    setSessions(prev => [data.session, ...prev.filter(session => session.sessionId !== data.session.sessionId)])
    return data.session.sessionId
  }

  async function saveMessage(sessionId: string, message: Message) {
    const resp = await fetch(`/api/agent/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        role: message.role,
        content: message.content,
        sources: message.sources,
        criticTriggered: message.criticTriggered,
        eduLevel,
      }),
    })
    if (!resp.ok) throw new Error('Failed to save chat message')
    const data = await resp.json().catch(() => ({})) as { id?: number }
    return typeof data.id === 'number' && data.id > 0 ? data.id : undefined
  }

  async function deleteSession(sessionId: string, event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    if (loading) return

    const resp = await fetch(`/api/agent/chat/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!resp.ok) return

    setSessions(prev => prev.filter(session => session.sessionId !== sessionId))
    if (activeSessionId === sessionId) {
      setActiveSessionId(null)
      setMessages([INITIAL_MESSAGE])
    }
  }

  function openFeedback(message: Message) {
    setFeedbackTarget(message)
    setFeedbackComment('')
    setFeedbackStatus('idle')
    setFeedbackNotice('')
  }

  function closeFeedback() {
    if (feedbackStatus === 'sending') return
    setFeedbackTarget(null)
    setFeedbackComment('')
    setFeedbackStatus('idle')
    setFeedbackNotice('')
  }

  async function submitFeedback() {
    if (!feedbackTarget || feedbackStatus === 'sending') return
    setFeedbackStatus('sending')
    setFeedbackNotice('')

    try {
      const resp = await fetch('/api/agent/chat/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          sessionId: activeSessionId,
          messageId: feedbackTarget.id,
          messageRole: feedbackTarget.role,
          messageContent: feedbackTarget.content,
          userComment: feedbackComment,
        }),
      })

      if (!resp.ok) throw new Error('submit failed')
      setFeedbackStatus('sent')
      setFeedbackNotice('已收到反馈，后续会用于优化 AI 回答。')
      window.setTimeout(() => closeFeedback(), 900)
    } catch {
      setFeedbackStatus('error')
      setFeedbackNotice('反馈提交失败，请稍后再试。')
    }
  }

  async function handleSend() {
    const q = input.trim()
    if (!q || loading) return

    const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }))
    setMessages(prev => [...prev, { role: 'user', content: q }, { role: 'assistant', content: '' }])
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setLoading(true)

    try {
      let sessionId: string | null = null
      try {
        sessionId = await ensureSession(q)
        await saveMessage(sessionId, { role: 'user', content: q })
      } catch (historyError) {
        console.warn('AI chat history save failed:', historyError)
      }

      const resp = await fetch('/api/agent/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question: q, edu_level: eduLevel, history }),
      }).catch(() => null)

      if (!resp || !resp.ok || !resp.body) {
        setMessages(prev => { const m = [...prev]; m[m.length - 1] = { role: 'assistant', content: 'AI服务暂时不可用，请检查后端是否启动。' }; return m })
        return
      }

      const reader  = resp.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let assistantContent = ''
      let assistantSources: string[] | undefined
      let assistantCriticTriggered = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()
          if (!payload) continue
          try {
            const evt = JSON.parse(payload)
            if (evt.error) {
              assistantContent = String(evt.error)
              setMessages(prev => { const m = [...prev]; m[m.length - 1] = { role: 'assistant', content: assistantContent }; return m })
              continue
            }
            if (evt.chunk) {
              assistantContent += evt.chunk
              setMessages(prev => { const m = [...prev]; m[m.length - 1] = { ...m[m.length - 1], content: m[m.length - 1].content + evt.chunk }; return m })
            } else if (evt.done) {
              assistantSources = evt.sources
              assistantCriticTriggered = Boolean(evt.critic_triggered)
              setMessages(prev => { const m = [...prev]; m[m.length - 1] = { ...m[m.length - 1], sources: evt.sources, criticTriggered: evt.critic_triggered }; return m })
            }
          } catch { /* ignore */ }
        }
      }

      if (!assistantContent.trim()) {
        setMessages(prev => { const m = [...prev]; m[m.length - 1] = { role: 'assistant', content: 'AI服务暂时不可用，请稍后重试。' }; return m })
        return
      }

      if (assistantContent.trim() && sessionId) {
        try {
          const assistantMessageId = await saveMessage(sessionId, {
            role: 'assistant',
            content: assistantContent,
            sources: assistantSources,
            criticTriggered: assistantCriticTriggered,
          })
          if (assistantMessageId) {
            setMessages(prev => {
              const next = [...prev]
              next[next.length - 1] = { ...next[next.length - 1], id: assistantMessageId }
              return next
            })
          }
          void loadSessions(token)
        } catch (historyError) {
          console.warn('AI chat history save failed:', historyError)
        }
      }
    } catch {
      setMessages(prev => { const m = [...prev]; m[m.length - 1] = { role: 'assistant', content: 'AI服务暂时不可用，请检查后端是否启动。' }; return m })
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }

  const currentEduLabel = EDU_LEVELS.find(l => l.value === eduLevel)?.label ?? '不限学历'

  return (
    <div className="student-chat-shell" style={{ height: 'calc(100dvh - 94px)', minHeight: 0, overflow: 'hidden', display: 'grid', gridTemplateColumns: '248px minmax(0, 1fr)', background: 'linear-gradient(135deg,#f6fbfb,#edf6f3)' }}>
      <aside style={{ minWidth: 0, minHeight: 0, borderRight: '1px solid rgba(31,71,92,0.1)', background: 'rgba(255,255,255,0.74)', backdropFilter: 'blur(18px)', padding: 12, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: 10 }}>
        <button
          onClick={startNewChat}
          disabled={loading}
          style={{ height: 40, borderRadius: 12, border: '1px solid rgba(29,111,120,0.18)', background: 'linear-gradient(135deg,#1d6f78,#35818a)', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14, fontWeight: 700, boxShadow: '0 12px 26px rgba(29,111,120,0.18)' }}
        >
          <Plus size={16} />
          新对话
        </button>

        <div style={{ minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 2 }}>
          {historyLoading && (
            <div style={{ padding: '14px 10px', color: '#6b8a98', fontSize: 12 }}>正在加载历史...</div>
          )}
          {!historyLoading && sessions.length === 0 && (
            <div style={{ padding: '14px 10px', color: '#6b8a98', fontSize: 12, lineHeight: 1.6 }}>暂无历史对话，发送第一条问题后会自动保存。</div>
          )}
          {sessions.map(session => {
            const active = session.sessionId === activeSessionId
            return (
              <div
                key={session.sessionId}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (!sessionLoading && !loading) void loadSession(session.sessionId)
                }}
                onKeyDown={event => {
                  if ((event.key === 'Enter' || event.key === ' ') && !sessionLoading && !loading) {
                    event.preventDefault()
                    void loadSession(session.sessionId)
                  }
                }}
                style={{ width: '100%', textAlign: 'left', border: `1px solid ${active ? 'rgba(29,111,120,0.28)' : 'rgba(31,71,92,0.1)'}`, background: active ? 'rgba(29,111,120,0.1)' : 'rgba(255,255,255,0.78)', borderRadius: 12, padding: 10, cursor: sessionLoading || loading ? 'not-allowed' : 'pointer', display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr) 26px', alignItems: 'center', gap: 8 }}
              >
                <MessageSquare size={15} color={active ? '#1d6f78' : '#6b8a98'} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', color: '#183b4b', fontSize: 13, fontWeight: active ? 800 : 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.title}</span>
                  <span style={{ display: 'block', color: '#7d929c', fontSize: 11, marginTop: 3 }}>{formatSessionTime(session.updatedAt)} · {session.messageCount} 条</span>
                </span>
                <span
                  onClick={event => event.stopPropagation()}
                  style={{ display: 'flex', justifyContent: 'flex-end' }}
                >
                  <button
                    type="button"
                    onClick={event => void deleteSession(session.sessionId, event)}
                    aria-label="删除历史对话"
                    style={{ width: 24, height: 24, borderRadius: 8, border: 'none', background: 'transparent', cursor: loading ? 'not-allowed' : 'pointer', display: 'grid', placeItems: 'center', color: '#8aa0a9' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      </aside>

      <div className="flex flex-col" style={{ height: '100%', minHeight: 0, minWidth: 0 }}>

      {/* Page header */}
      <div style={{ padding: '10px 22px 8px', flexShrink: 0, borderBottom: '1px solid rgba(31,71,92,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ color: '#1d6f78', fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', margin: 0 }}>AI 功能</p>
            <h1 style={{ color: '#183b4b', fontSize: 20, fontWeight: 700, margin: '3px 0 0', fontFamily: "'Trebuchet MS','Microsoft YaHei',sans-serif" }}>AI 助学</h1>
          </div>

          {/* Edu level picker */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowEduMenu(v => !v)}
              className="flex items-center gap-1.5 hover:bg-black/5 transition-colors rounded-lg"
              style={{ padding: '7px 12px', border: '1px solid rgba(31,71,92,0.15)', background: 'rgba(255,255,255,0.7)', fontSize: 13, color: '#46606f', cursor: 'pointer' }}
            >
              <BookOpen size={13} />
              {currentEduLabel}
              <ChevronDown size={13} />
            </button>
            {showEduMenu && (
              <div style={{ position: 'absolute', right: 0, top: 40, background: '#fff', borderRadius: 12, boxShadow: '0 8px 24px rgba(29,53,74,0.12)', border: '1px solid rgba(31,71,92,0.12)', minWidth: 110, zIndex: 20 }}>
                {EDU_LEVELS.map(l => (
                  <button key={String(l.value)}
                    onClick={() => { setEduLevel(l.value); setShowEduMenu(false) }}
                    className="w-full text-left hover:bg-gray-50 transition-colors"
                    style={{ padding: '9px 16px', fontSize: 13, color: eduLevel === l.value ? '#1d6f78' : '#46606f', fontWeight: eduLevel === l.value ? 700 : 400, border: 'none', background: 'none', cursor: 'pointer' }}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Online badge */}
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#2f7e58', display: 'inline-block' }} />
          <span style={{ fontSize: 11, color: '#6b8a98' }}>助手在线 · 基于GMP法规原文实时检索</span>
        </div>
      </div>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto" style={{ minHeight: 0, padding: '12px 22px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.filter(msg => !(msg.role === 'assistant' && !msg.content)).map((msg, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
              <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: msg.role === 'assistant' ? 'linear-gradient(135deg,#215566,#35818a)' : '#1d6f78' }}>
                {msg.role === 'assistant' ? <Bot size={15} color="#fff" /> : <User size={15} color="#fff" />}
              </div>
              <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', gap: 6, alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  borderRadius: 16, padding: '10px 16px', fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap',
                  ...(msg.role === 'assistant'
                    ? { background: 'rgba(255,255,255,0.88)', border: '1px solid rgba(31,71,92,0.12)', color: '#183b4b', backdropFilter: 'blur(12px)' }
                    : { background: 'linear-gradient(135deg,#215566,#35818a)', color: '#fff' }
                  ),
                }}>
                  {msg.content}
                </div>
                {msg.sources && msg.sources.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '0 2px' }}>
                    {msg.sources.slice(0, 8).map(s => (
                      <span key={s} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'rgba(29,111,120,0.08)', color: '#1d6f78', border: '1px solid rgba(29,111,120,0.15)' }}>{s}</span>
                    ))}
                    {msg.criticTriggered && (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'rgba(200,129,43,0.09)', color: '#c8812b', border: '1px solid rgba(200,129,43,0.2)' }}>已校验</span>
                    )}
                  </div>
                )}
                {msg.role === 'assistant' && i > 0 && msg.content.trim() && (
                  <button
                    type="button"
                    onClick={() => openFeedback(msg)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 9px', borderRadius: 999, border: '1px solid rgba(200,129,43,0.22)', background: 'rgba(255,251,235,0.78)', color: '#9a641d', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >
                    <Flag size={12} />
                    答案有误
                  </button>
                )}
              </div>
            </div>
          ))}

          {loading && messages[messages.length - 1]?.content === '' && (
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#215566,#35818a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bot size={15} color="#fff" />
              </div>
              <div style={{ ...PANEL, padding: '10px 16px' }}>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 20 }}>
                  {[0, 1, 2].map(n => (
                    <div key={n} style={{ width: 6, height: 6, borderRadius: '50%', background: '#1d6f78', opacity: 0.6, animation: `bounce 1.2s ${n * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </main>

      {/* Input */}
      <div style={{ padding: '10px 22px 12px', flexShrink: 0, borderTop: '1px solid rgba(31,71,92,0.08)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1, borderRadius: 16, border: '1px solid rgba(31,71,92,0.15)', background: 'rgba(255,255,255,0.8)', overflow: 'hidden' }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="输入GMP相关问题，按 Enter 发送（Shift+Enter 换行）"
              rows={1}
              disabled={loading}
              style={{ width: '100%', padding: '12px 16px', fontSize: 14, color: '#183b4b', resize: 'none', outline: 'none', background: 'transparent', lineHeight: 1.6, maxHeight: 140, minHeight: 44, display: 'block', boxSizing: 'border-box' }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            style={{ width: 40, height: 40, borderRadius: 12, border: 'none', cursor: input.trim() && !loading ? 'pointer' : 'not-allowed', background: input.trim() && !loading ? 'linear-gradient(135deg,#1d6f78,#35818a)' : 'rgba(31,71,92,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.2s' }}
          >
            <Send size={16} color={input.trim() && !loading ? '#fff' : '#6b8a98'} />
          </button>
        </div>
        <p style={{ textAlign: 'center', fontSize: 11, color: '#6b8a98', margin: '8px 0 0', opacity: 0.7 }}>AI回答仅供参考，以GMP原文法规为准</p>
      </div>

      {feedbackTarget && (
        <div
          onClick={closeFeedback}
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,35,45,0.22)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}
        >
          <div
            onClick={event => event.stopPropagation()}
            style={{ width: 'min(520px, 100%)', borderRadius: 18, border: '1px solid rgba(31,71,92,0.14)', background: 'rgba(255,255,255,0.96)', boxShadow: '0 24px 70px rgba(29,53,74,0.18)', padding: 18, display: 'grid', gap: 12 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div>
                <strong style={{ color: '#183b4b', fontSize: 16 }}>反馈 AI 答案</strong>
                <p style={{ margin: '4px 0 0', color: '#6b8a98', fontSize: 12 }}>请描述你认为不准确、缺依据或需要修正的地方。</p>
              </div>
              <button type="button" onClick={closeFeedback} style={{ width: 30, height: 30, borderRadius: 10, border: '1px solid rgba(31,71,92,0.12)', background: '#fff', color: '#6b8a98', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                <X size={15} />
              </button>
            </div>
            <div style={{ maxHeight: 120, overflowY: 'auto', borderRadius: 12, border: '1px solid rgba(31,71,92,0.1)', background: '#f7fbfb', padding: 12, color: '#46606f', fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {feedbackTarget.content}
            </div>
            <textarea
              value={feedbackComment}
              onChange={event => setFeedbackComment(event.target.value)}
              placeholder="可选：补充具体问题或正确依据"
              rows={4}
              style={{ width: '100%', resize: 'vertical', borderRadius: 12, border: '1px solid rgba(31,71,92,0.14)', padding: 12, outline: 'none', color: '#183b4b', fontSize: 13, lineHeight: 1.6, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: feedbackStatus === 'error' ? '#b45309' : '#1d6f78', fontSize: 12 }}>{feedbackNotice}</span>
              <button
                type="button"
                onClick={submitFeedback}
                disabled={feedbackStatus === 'sending'}
                style={{ height: 36, padding: '0 16px', borderRadius: 11, border: 'none', background: feedbackStatus === 'sending' ? 'rgba(31,71,92,0.18)' : 'linear-gradient(135deg,#1d6f78,#35818a)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: feedbackStatus === 'sending' ? 'not-allowed' : 'pointer' }}
              >
                {feedbackStatus === 'sending' ? '提交中...' : '提交反馈'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @media (max-width: 760px) {
          .student-chat-shell {
            grid-template-columns: 1fr !important;
          }
          .student-chat-shell aside {
            max-height: 176px;
            border-right: none !important;
            border-bottom: 1px solid rgba(31,71,92,0.1);
          }
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-5px); }
        }
      `}</style>
    </div>
    </div>
  )
}
