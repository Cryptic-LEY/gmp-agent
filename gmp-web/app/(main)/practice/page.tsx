'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Option { key: string; text: string }
interface Question { questionId: string; questionType: string; stem: string; difficulty: string; options: Option[] }
interface SubmitResult { correct: boolean; correctAnswer: string; xpGained: number; newXp: number; leveledUp: boolean; newRankTitle?: string }

const DIFFICULTY_STYLE: Record<string, React.CSSProperties> = {
  '易': { background: 'rgba(47,126,88,0.10)', color: '#2f7e58' },
  '中': { background: 'rgba(200,129,43,0.10)', color: '#c8812b' },
  '难': { background: 'rgba(188,91,87,0.10)',  color: '#bc5b57' },
}

const PANEL: React.CSSProperties = {
  background: 'rgba(255,255,255,0.88)',
  border: '1px solid rgba(31,71,92,0.12)',
  borderRadius: 20,
  boxShadow: '0 18px 44px rgba(29,53,74,0.09)',
  backdropFilter: 'blur(18px)',
}

function stripHtml(text: string) { return text.replace(/<[^>]+>/g, '').trim() }

export default function PracticePage() {
  const router = useRouter()
  const [token, setToken]               = useState('')
  const [question, setQuestion]         = useState<Question | null>(null)
  const [loading, setLoading]           = useState(true)
  const [selected, setSelected]         = useState<string[]>([])
  const [result, setResult]             = useState<SubmitResult | null>(null)
  const [sessionXp, setSessionXp]       = useState(0)
  const [sessionCorrect, setSessionCorrect] = useState(0)
  const [sessionTotal, setSessionTotal] = useState(0)

  const fetchQuestion = useCallback(async (tok: string) => {
    setLoading(true); setSelected([]); setResult(null)
    const res  = await fetch('/api/practice/question', { headers: { Authorization: `Bearer ${tok}` } })
    const data = await res.json()
    if (data.stem) {
      data.stem    = stripHtml(data.stem)
      data.options = (data.options ?? []).map((o: Option) => ({ ...o, text: stripHtml(o.text) }))
    }
    setQuestion(data); setLoading(false)
  }, [])

  useEffect(() => {
    const tok = localStorage.getItem('token')
    if (!tok) { router.push('/login'); return }
    setToken(tok); fetchQuestion(tok)
  }, [router, fetchQuestion])

  function handleSelect(key: string) {
    if (result || !question) return
    if (question.questionType === '多选题') {
      setSelected(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
    } else { setSelected([key]) }
  }

  async function handleSubmit() {
    if (!question || selected.length === 0 || result) return
    const answer = question.questionType === '多选题' ? selected.sort().join('') : selected[0]
    const res  = await fetch('/api/practice/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ questionId: question.questionId, answer }),
    })
    const data: SubmitResult = await res.json()
    setResult(data); setSessionTotal(t => t + 1)
    if (data.correct) { setSessionCorrect(c => c + 1); setSessionXp(x => x + data.xpGained) }
  }

  function getCorrectOptionTexts() {
    if (!question || !result) return []
    if (question.questionType === '判断题') {
      return result.correctAnswer.toUpperCase().includes('A') ? ['✓ 正确'] : ['✗ 错误']
    }
    return question.options.filter(o => result.correctAnswer.toUpperCase().includes(o.key)).map(o => `${o.key}. ${o.text}`)
  }

  function optionStyle(key: string): React.CSSProperties {
    const base: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 14, border: '1.5px solid rgba(31,71,92,0.12)', cursor: 'pointer', transition: 'all 0.15s', background: 'rgba(255,255,255,0.7)' }
    if (!result) {
      return selected.includes(key)
        ? { ...base, borderColor: '#1d6f78', background: 'rgba(29,111,120,0.08)' }
        : base
    }
    const isCorrect = result.correctAnswer.toUpperCase().includes(key)
    if (isCorrect) return { ...base, borderColor: '#2f7e58', background: 'rgba(47,126,88,0.08)', cursor: 'default' }
    if (selected.includes(key)) return { ...base, borderColor: '#bc5b57', background: 'rgba(188,91,87,0.07)', cursor: 'default' }
    return { ...base, opacity: 0.45, cursor: 'default' }
  }

  // 判断题专用按钮样式（含答题后反馈）
  function tfButtonStyle(key: string): React.CSSProperties {
    const aColor = '#16a34a', bColor = '#dc2626'
    const thisColor = key === 'A' ? aColor : bColor
    const thisBg    = key === 'A' ? 'rgba(22,163,74,0.09)' : 'rgba(220,38,38,0.08)'
    const base: React.CSSProperties = {
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '22px 16px', borderRadius: 14, transition: 'all 0.15s',
      fontSize: 17, fontWeight: 700, letterSpacing: '0.03em', cursor: 'pointer',
    }
    if (!result) {
      return selected.includes(key)
        ? { ...base, border: `2px solid ${thisColor}`, background: thisBg, color: thisColor, boxShadow: `0 0 0 3px ${thisColor}1a` }
        : { ...base, border: '2px solid rgba(31,71,92,0.12)', background: 'rgba(255,255,255,0.7)', color: '#9ba8b0' }
    }
    const isCorrect  = result.correctAnswer.toUpperCase().includes(key)
    const wasSelected = selected.includes(key)
    if (isCorrect) return { ...base, border: `2px solid ${thisColor}`, background: thisBg, color: thisColor, cursor: 'default', fontWeight: 800 }
    if (wasSelected) return { ...base, border: '2px solid #bc5b57', background: 'rgba(188,91,87,0.08)', color: '#bc5b57', cursor: 'default' }
    return { ...base, border: '2px solid rgba(31,71,92,0.08)', background: 'rgba(255,255,255,0.4)', color: '#bfcbd9', opacity: 0.5, cursor: 'default' }
  }

  return (
    <div style={{ padding: 20, minHeight: '100vh' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <p style={{ color: '#1d6f78', fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', margin: 0 }}>学习中心</p>
          <h1 style={{ color: '#183b4b', fontSize: 26, fontWeight: 700, margin: '4px 0 0', fontFamily: "'Trebuchet MS','Microsoft YaHei',sans-serif" }}>每日练习</h1>
        </div>
        <div style={{ ...PANEL, padding: '10px 20px', display: 'flex', gap: 20 }}>
          {[
            { label: '本次 XP', value: `+${sessionXp}` },
            { label: '正确率', value: sessionTotal ? `${sessionCorrect}/${sessionTotal}` : '—' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <p style={{ color: '#183b4b', fontSize: 18, fontWeight: 700, margin: 0, fontFamily: "'Trebuchet MS','Microsoft YaHei',sans-serif" }}>{s.value}</p>
              <p style={{ color: '#6b8a98', fontSize: 11, margin: '2px 0 0' }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {loading && (
          <div style={{ ...PANEL, padding: 32 }}>
            {[72, 48, 36].map((w, i) => (
              <div key={i} style={{ height: i === 0 ? 18 : 12, background: 'rgba(29,111,120,0.08)', borderRadius: 8, marginBottom: 16, width: `${w}%`, animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        )}

        {!loading && question && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Type + difficulty tags */}
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: 'rgba(29,111,120,0.10)', color: '#1d6f78' }}>{question.questionType}</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, ...(DIFFICULTY_STYLE[question.difficulty] ?? { background: 'rgba(31,71,92,0.08)', color: '#46606f' }) }}>{question.difficulty}</span>
              {question.questionType === '多选题' && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: 'rgba(200,129,43,0.10)', color: '#c8812b' }}>可多选</span>
              )}
            </div>

            {/* Stem */}
            <div style={{ ...PANEL, padding: '24px 28px' }}>
              <p style={{ color: '#183b4b', fontSize: 15, lineHeight: 1.9, margin: 0 }}>{question.stem}</p>
            </div>

            {/* Options */}
            {question.questionType === '判断题' ? (
              <div style={{ display: 'flex', gap: 12 }}>
                {[{ key: 'A', label: '✓ 正确' }, { key: 'B', label: '✗ 错误' }].map(({ key, label }) => (
                  <div key={key} style={tfButtonStyle(key)} onClick={() => !result && handleSelect(key)}>
                    {label}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {question.options.map(opt => (
                  <div key={opt.key} style={optionStyle(opt.key)} onClick={() => handleSelect(opt.key)}>
                    <span style={{ fontWeight: 700, color: '#1d6f78', minWidth: 22, fontSize: 13, marginTop: 1 }}>{opt.key}</span>
                    <span style={{ color: '#183b4b', fontSize: 14, lineHeight: 1.7 }}>{opt.text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Feedback */}
            {result && (
              result.correct ? (
                <div style={{ ...PANEL, padding: '20px 24px', borderColor: 'rgba(47,126,88,0.2)', background: 'rgba(47,126,88,0.06)' }}>
                  <p style={{ color: '#2f7e58', fontWeight: 700, fontSize: 16, margin: '0 0 4px' }}>✓ 回答正确！</p>
                  <p style={{ color: '#2f7e58', fontSize: 13, margin: 0 }}>+{result.xpGained} XP 已获得</p>
                  {result.leveledUp && <p style={{ color: '#1d6f78', fontWeight: 700, margin: '8px 0 0', fontSize: 14 }}>🎉 恭喜晋升：{result.newRankTitle}！</p>}
                </div>
              ) : (
                <div style={{ ...PANEL, padding: '20px 24px', borderColor: 'rgba(188,91,87,0.2)', background: 'rgba(188,91,87,0.05)' }}>
                  <p style={{ color: '#bc5b57', fontWeight: 700, fontSize: 15, margin: '0 0 10px' }}>✗ 回答错误</p>
                  <p style={{ color: '#6b8a98', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 6px' }}>正确答案</p>
                  {getCorrectOptionTexts().map(text => (
                    <p key={text} style={{ color: '#183b4b', fontSize: 13, fontWeight: 600, background: 'rgba(255,255,255,0.7)', borderRadius: 10, padding: '8px 14px', margin: '4px 0 0', border: '1px solid rgba(47,126,88,0.15)' }}>{text}</p>
                  ))}
                </div>
              )
            )}

            {/* Action button */}
            {!result ? (
              <button onClick={handleSubmit} disabled={selected.length === 0}
                style={{ padding: '13px', borderRadius: 14, border: 'none', fontSize: 14, fontWeight: 700, cursor: selected.length ? 'pointer' : 'not-allowed', background: selected.length ? 'linear-gradient(135deg,#1d6f78,#35818a)' : 'rgba(31,71,92,0.08)', color: selected.length ? '#fff' : '#6b8a98', transition: 'background 0.2s' }}
              >
                提交答案
              </button>
            ) : (
              <button onClick={() => fetchQuestion(token)}
                style={{ padding: '13px', borderRadius: 14, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', background: 'linear-gradient(135deg,#1d6f78,#35818a)', color: '#fff' }}
              >
                下一题 →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
