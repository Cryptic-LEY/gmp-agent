'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Send, Bot, User, BookOpen, ChevronDown } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
  criticTriggered?: boolean
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

export default function ChatPage() {
  const router = useRouter()
  const WELCOME: Message = { role: 'assistant', content: '你好！我是GMP学习助手，可以帮你解答关于《药品生产质量管理规范》的任何问题。请问有什么需要了解的？' }

  const [token, setToken] = useState('')
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [eduLevel, setEduLevel] = useState<string | null>(null)
  const [showEduMenu, setShowEduMenu] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const tok = localStorage.getItem('token')
    if (!tok) { router.push('/login'); return }
    setToken(tok)
    // 加载历史对话
    fetch('/api/agent/chat/history', { headers: { Authorization: `Bearer ${tok}` } })
      .then(r => r.ok ? r.json() : null)
      .then((data: { messages: Message[] } | null) => {
        if (data?.messages?.length) {
          setMessages([WELCOME, ...data.messages])
        }
      })
      .catch(() => {})
  }, [router]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // 仅在发送新消息后滚动到底部，初始进入页面不自动滚动
    if (messages.length > 1) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, loading])

  async function handleSend() {
    const q = input.trim()
    if (!q || loading) return

    setMessages(prev => [...prev, { role: 'user', content: q }, { role: 'assistant', content: '' }])
    setInput('')
    setLoading(true)
    let streamCompleted = false   // 只有流式正常结束才持久化

    try {
      const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }))
      const resp = await fetch('/api/agent/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question: q, edu_level: eduLevel, history }),
      })

      if (!resp.ok || !resp.body) {
        setMessages(prev => { const m = [...prev]; m[m.length - 1] = { role: 'assistant', content: 'AI服务暂时不可用，请检查后端是否启动。' }; return m })
        return
      }

      const reader  = resp.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

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
            if (evt.chunk) {
              setMessages(prev => { const m = [...prev]; m[m.length - 1] = { ...m[m.length - 1], content: m[m.length - 1].content + evt.chunk }; return m })
            } else if (evt.done) {
              setMessages(prev => { const m = [...prev]; m[m.length - 1] = { ...m[m.length - 1], sources: evt.sources, criticTriggered: evt.critic_triggered }; return m })
              streamCompleted = true
            }
          } catch { /* ignore */ }
        }
      }
    } catch {
      setMessages(prev => { const m = [...prev]; m[m.length - 1] = { role: 'assistant', content: 'AI服务暂时不可用，请检查后端是否启动。' }; return m })
    } finally {
      setLoading(false)
      // 只在流式正常完成时持久化，错误消息不存库
      if (streamCompleted) {
        setMessages(prev => {
          const last = prev[prev.length - 1]
          if (last?.role === 'assistant' && last.content) {
            const userMsg = prev[prev.length - 2]
            if (userMsg?.role === 'user') {
              const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
              fetch('/api/agent/chat/history', { method: 'POST', headers, body: JSON.stringify({ role: 'user', content: userMsg.content }) }).catch(() => {})
              fetch('/api/agent/chat/history', { method: 'POST', headers, body: JSON.stringify({ role: 'assistant', content: last.content, sources: last.sources }) }).catch(() => {})
            }
          }
          return prev
        })
      }
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
    <div className="flex flex-col" style={{ height: '100vh' }}>

      {/* Page header */}
      <div style={{ padding: '14px 24px 12px', flexShrink: 0, borderBottom: '1px solid rgba(31,71,92,0.08)' }}>
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
      <main className="flex-1 overflow-y-auto" style={{ padding: '20px 24px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                {msg.role === 'assistant' && msg.content && !loading && i > 0 && !msg.content.startsWith('AI服务暂时不可用') && (
                  <button
                    onClick={() => {
                      const comment = window.prompt('请简单描述哪里有误（可选）：')
                      if (comment === null) return  // 点取消不上报
                      fetch('/api/agent/chat/feedback', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ messageContent: msg.content, userComment: comment || undefined }),
                      }).catch(() => {})
                      window.alert('感谢反馈！我们会持续改进。')
                    }}
                    style={{ fontSize: 11, color: '#9ba8b0', background: 'none', border: '1px solid rgba(31,71,92,0.12)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', alignSelf: 'flex-start' }}
                  >
                    答案有误？
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
      <div style={{ padding: '14px 24px 16px', flexShrink: 0, borderTop: '1px solid rgba(31,71,92,0.08)' }}>
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

      <style jsx>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-5px); }
        }
      `}</style>
    </div>
  )
}
