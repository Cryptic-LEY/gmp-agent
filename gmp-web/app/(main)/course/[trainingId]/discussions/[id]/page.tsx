'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, Pin, MessageCircle, Eye, Send, Loader2,
  Sparkles,
} from 'lucide-react'

interface Topic {
  id: number
  trainingId: string
  title: string
  content: string
  tag: string
  pinned: boolean
  viewCount: number
  replyCount: number
  createdAt: string
  authorId: string
  authorName: string
  authorRole: string
}

interface Reply {
  id: number
  content: string
  isAi: boolean
  createdAt: string
  authorId: string
  authorName: string
  authorRole: string
}

const TAG_CONFIG: Record<string, { color: string; bg: string }> = {
  '提问': { color: '#2563eb', bg: '#dbeafe' },
  '心得': { color: '#16a34a', bg: '#dcfce7' },
  '讨论': { color: '#7c3aed', bg: '#ede9fe' },
  '答疑': { color: '#d97706', bg: '#fef3c7' },
}

export default function DiscussionDetailPage({ params }: { params: Promise<{ trainingId: string; id: string }> }) {
  const { trainingId, id } = use(params)
  const router = useRouter()
  const [topic, setTopic] = useState<Topic | null>(null)
  const [replies, setReplies] = useState<Reply[]>([])
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function load() {
    const token = localStorage.getItem('token')
    if (!token) { router.push('/login'); return }
    fetch(`/api/course/discussions/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) { setTopic(d.topic); setReplies(d.replies) }
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() /* eslint-disable-next-line */ }, [id])

  async function postReply() {
    if (!reply.trim()) return
    setSubmitting(true)
    const token = localStorage.getItem('token')
    try {
      const res = await fetch(`/api/course/discussions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: reply }),
      })
      if (res.ok) { setReply(''); load() }
    } finally { setSubmitting(false) }
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center' }}><Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} /></div>
  if (!topic) return <div style={{ padding: 40, color: '#9aacb6' }}>讨论不存在</div>

  const tc = TAG_CONFIG[topic.tag] ?? TAG_CONFIG['讨论']

  return (
    <div style={{ background: '#f4f6f8', minHeight: 'calc(100vh - 86px)', padding: '20px 28px 40px' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <Link href={`/course/${trainingId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#7a96a4', fontSize: 12, textDecoration: 'none', marginBottom: 14 }}>
          <ChevronLeft size={13} /> 返回章节讨论
        </Link>

        {/* 主题卡 */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eaeff2', padding: '22px 26px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            {topic.pinned && <Pin size={13} color="#d97706" />}
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: tc.bg, color: tc.color, fontWeight: 600 }}>{topic.tag}</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 11, color: '#9aacb6' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Eye size={11} />{topic.viewCount}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><MessageCircle size={11} />{topic.replyCount}</span>
            </span>
          </div>
          <h1 style={{ margin: '0 0 14px', fontSize: 20, fontWeight: 800, color: '#1c3140', letterSpacing: '-0.01em' }}>{topic.title}</h1>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid #f0f4f6' }}>
            <Avatar name={topic.authorName} role={topic.authorRole} />
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#1c3140' }}>
                {topic.authorName}
                {topic.authorRole === 'teacher' && <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 6px', borderRadius: 10, background: '#dbeafe', color: '#1e40af', fontWeight: 700 }}>老师</span>}
              </p>
              <p style={{ margin: 0, fontSize: 10, color: '#9aacb6' }}>{formatTime(topic.createdAt)}</p>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: 13.5, color: '#1c3140', lineHeight: 1.85, whiteSpace: 'pre-wrap' }}>{topic.content}</p>
        </div>

        {/* 回复列表 */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eaeff2', overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ padding: '14px 22px', borderBottom: '1px solid #f0f4f6' }}>
            <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1c3140' }}>全部回复（{replies.length}）</h2>
          </div>
          {replies.length === 0 ? (
            <p style={{ padding: '36px', textAlign: 'center', fontSize: 12, color: '#9aacb6', margin: 0 }}>暂无回复，成为第一个回复的人</p>
          ) : (
            <div>
              {replies.map((r, i) => (
                <div key={r.id} style={{
                  padding: '14px 22px',
                  borderBottom: i < replies.length - 1 ? '1px solid #f6f8fa' : 'none',
                  background: r.isAi ? 'linear-gradient(90deg, rgba(217,119,6,0.03), transparent)' : 'transparent',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <Avatar name={r.authorName} role={r.authorRole} isAi={r.isAi} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#1c3140' }}>{r.authorName}</span>
                        {r.authorRole === 'teacher' && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: '#dbeafe', color: '#1e40af', fontWeight: 700 }}>老师</span>}
                        {r.isAi && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, padding: '1px 6px', borderRadius: 10, background: '#fef3c7', color: '#92400e', fontWeight: 700 }}><Sparkles size={9} />AI</span>}
                        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9aacb6' }}>{formatTime(r.createdAt)}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: '#3d5a68', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{r.content}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 回复框 */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eaeff2', padding: 18 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#1c3140' }}>添加回复</h3>
          <textarea
            value={reply} onChange={e => setReply(e.target.value)}
            placeholder="说说你的看法…"
            rows={4}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #dde6eb', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', marginBottom: 10 }}
          />
          <button
            onClick={postReply}
            disabled={submitting || !reply.trim()}
            style={{
              padding: '8px 18px', borderRadius: 8, border: 'none',
              background: submitting || !reply.trim() ? '#cdd8df' : '#1d6f78',
              color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: submitting || !reply.trim() ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}
          ><Send size={11} />{submitting ? '发送中…' : '发送'}</button>
        </div>
      </div>
    </div>
  )
}

function Avatar({ name, role, isAi }: { name: string; role?: string; isAi?: boolean }) {
  if (isAi) {
    return (
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg, #d97706, #b45309)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 700,
      }}>
        <Sparkles size={14} />
      </div>
    )
  }
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
      background: role === 'teacher'
        ? 'linear-gradient(135deg, #2563eb, #1e40af)'
        : 'linear-gradient(135deg, #215566, #35818a)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: 12, fontWeight: 700,
    }}>
      {name[0]}
    </div>
  )
}

function formatTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d} 天前`
  return new Date(iso).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
