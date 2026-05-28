'use client'

import { useEffect, useState, use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, CheckCircle2, AlertCircle, Loader2, Award, Trophy,
  ArrowRight, RotateCcw,
} from 'lucide-react'

interface QuizQuestion {
  question_id: string
  question_type: '单选题' | '多选题' | '判断题'
  stem: string
  difficulty: string
  kp_id: string | null
  options: { key: string; text: string }[]
}

interface QuizResult {
  trainingId: string
  score: number
  correctCount: number
  totalCount: number
  earnedHours: number
  maxHours: number
  passed: boolean
  details: { qid: string; correct: boolean; userAnswer: string; correctAnswer: string }[]
}

export default function ChapterQuizPage({ params }: { params: Promise<{ trainingId: string }> }) {
  const { trainingId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const eduLevel = searchParams.get('eduLevel') || 'college'

  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [chapterName, setChapterName] = useState('')
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<QuizResult | null>(null)
  const [startTime] = useState(Date.now())

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { router.push('/login'); return }
    fetch(`/api/course/quiz/${trainingId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d || !d.questions?.length) {
          setLoading(false)
          return
        }
        setQuestions(d.questions)
        setChapterName(d.displayName)
        setLoading(false)
      })
  }, [trainingId, router])

  function toggleAnswer(qid: string, key: string, multi: boolean) {
    setAnswers(prev => {
      const cur = prev[qid] ?? []
      if (multi) {
        return { ...prev, [qid]: cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key] }
      }
      return { ...prev, [qid]: [key] }
    })
  }

  async function submitQuiz() {
    setSubmitting(true)
    const token = localStorage.getItem('token')
    const payload = {
      trainingId, eduLevel,
      answers: questions.map(q => ({
        question_id: q.question_id,
        answer: (answers[q.question_id] ?? []).join(''),
      })),
    }
    try {
      const res = await fetch('/api/course/quiz/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const data: QuizResult = await res.json()
        setResult(data)

        // 上报学习时长
        const seconds = Math.floor((Date.now() - startTime) / 1000)
        if (seconds > 5) {
          fetch('/api/course/study-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ trainingId, seconds: Math.min(seconds, 3600), activity: 'quiz' }),
          }).catch(() => {})
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  const answeredCount = Object.values(answers).filter(v => v.length > 0).length
  const allAnswered = answeredCount === questions.length

  if (loading) return <div style={{ padding: 60, textAlign: 'center' }}><Loader2 size={28} className="spin" style={{ animation: 'spin 1s linear infinite' }} /></div>

  if (questions.length === 0) {
    return (
      <div style={{ padding: '40px 28px', textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: '#6b8a98', marginBottom: 12 }}>本章暂无可用题目</p>
        <Link href={`/course/${trainingId}`} style={{ color: '#1d6f78', fontSize: 13 }}>← 返回章节</Link>
      </div>
    )
  }

  if (result) return <ResultView result={result} trainingId={trainingId} questions={questions} answers={answers} />

  return (
    <div style={{ background: '#f4f6f8', minHeight: 'calc(100vh - 86px)', padding: '20px 28px 40px' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .q-opt:hover { background: #f4f7f9 !important; }
      `}</style>

      {/* 头部 */}
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <Link href={`/course/${trainingId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#7a96a4', fontSize: 12, textDecoration: 'none', marginBottom: 14 }}>
          <ChevronLeft size={13} /> 返回章节
        </Link>

        {/* 进度卡 */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eaeff2', padding: '18px 22px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <p style={{ margin: 0, fontSize: 11, color: '#9aacb6' }}>章节测验</p>
              <h1 style={{ margin: '3px 0 0', fontSize: 18, fontWeight: 800, color: '#1c3140', letterSpacing: '-0.01em' }}>{chapterName}</h1>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9aacb6' }}>{trainingId} · 共 {questions.length} 题 · 60 分通过</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 26, fontWeight: 900, color: '#1d6f78', letterSpacing: '-0.03em' }}>{answeredCount}</span>
              <span style={{ fontSize: 14, color: '#cdd8df' }}> / {questions.length}</span>
              <p style={{ margin: '2px 0 0', fontSize: 10, color: '#9aacb6' }}>已作答</p>
            </div>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: '#eef2f5' }}>
            <div style={{ height: '100%', width: `${(answeredCount / questions.length) * 100}%`, background: 'linear-gradient(90deg, #1d6f78, #35818a)', borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 12, flexWrap: 'wrap' }}>
            {questions.map((qt, i) => {
              const done = (answers[qt.question_id]?.length ?? 0) > 0
              return (
                <button
                  key={i}
                  onClick={() => document.getElementById(`q-card-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}
                  style={{
                    width: 26, height: 26, borderRadius: '50%',
                    border: done ? 'none' : '1.5px solid #dde6eb',
                    cursor: 'pointer', fontSize: 10, fontWeight: 700, padding: 0,
                    background: done ? '#1d6f78' : '#fff',
                    color: done ? '#fff' : '#93aab7',
                  }}
                >{i + 1}</button>
              )
            })}
          </div>
        </div>

        {/* 题目卡片 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {questions.map((qt, i) => {
            const isMulti = qt.question_type === '多选题'
            const sel = answers[qt.question_id] ?? []
            const isDone = sel.length > 0
            return (
              <div
                key={qt.question_id}
                id={`q-card-${i}`}
                style={{
                  background: '#fff', borderRadius: 10,
                  border: '1px solid #eaeff2',
                  boxShadow: isDone ? 'inset 3px 0 0 #1d6f78, 0 1px 4px rgba(0,0,0,0.04)' : '0 1px 4px rgba(0,0,0,0.04)',
                  padding: '16px 18px 14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 22, fontWeight: 900, lineHeight: 1, minWidth: 30, color: isDone ? '#1d6f78' : '#cdd8df', fontVariantNumeric: 'tabular-nums' }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#5a7f8e', background: '#eef2f5', padding: '2px 8px', borderRadius: 20 }}>{qt.question_type}</span>
                      <span style={{ fontSize: 10, color: '#93aab7', background: '#eef2f5', padding: '2px 8px', borderRadius: 20 }}>{qt.difficulty}</span>
                      {isMulti && <span style={{ fontSize: 10, fontWeight: 600, color: '#b45309', background: 'rgba(180,83,9,0.07)', padding: '2px 8px', borderRadius: 20 }}>多选</span>}
                    </div>
                  </div>
                  {isDone && <CheckCircle2 size={15} color="#1d6f78" strokeWidth={2.5} />}
                </div>

                <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 500, color: '#1c3140', lineHeight: 1.8 }}>{qt.stem}</p>

                {qt.question_type === '判断题' ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[
                      { key: 'A', label: '正确', icon: '✓', ac: '#15803d', ab: '#f0fdf4', abr: '#86efac' },
                      { key: 'B', label: '错误', icon: '✗', ac: '#b91c1c', ab: '#fff1f2', abr: '#fca5a5' },
                    ].map(({ key, label, icon, ac, ab, abr }) => {
                      const active = sel.includes(key)
                      return (
                        <div key={key} onClick={() => toggleAnswer(qt.question_id, key, false)} style={{
                          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                          padding: '11px', borderRadius: 8, cursor: 'pointer',
                          border: `1.5px solid ${active ? abr : '#dde6eb'}`,
                          background: active ? ab : '#fafbfc',
                          color: active ? ac : '#7a96a4',
                          fontSize: 13, fontWeight: active ? 700 : 500,
                          userSelect: 'none',
                        }}><span style={{ fontSize: 15 }}>{icon}</span>{label}</div>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {qt.options.map(({ key, text }) => {
                      const active = sel.includes(key)
                      return (
                        <div key={key} className={active ? '' : 'q-opt'} onClick={() => toggleAnswer(qt.question_id, key, isMulti)} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 11,
                          padding: '8px 10px', borderRadius: 7, cursor: 'pointer',
                          border: `1.5px solid ${active ? '#1d6f78' : '#eaeff2'}`,
                          background: active ? 'rgba(29,111,120,0.06)' : '#fafbfc',
                          userSelect: 'none',
                        }}>
                          <div style={{
                            width: 18, height: 18, borderRadius: isMulti ? 4 : '50%', flexShrink: 0, marginTop: 2,
                            border: `2px solid ${active ? '#1d6f78' : '#c5d3da'}`,
                            background: active ? '#1d6f78' : '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {active && (isMulti
                              ? <span style={{ color: '#fff', fontSize: 8, fontWeight: 900, lineHeight: 1 }}>✓</span>
                              : <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />)}
                          </div>
                          <span style={{ fontSize: 13, lineHeight: 1.65, color: active ? '#1c3140' : '#3d5a68' }}>
                            <span style={{ fontWeight: 700, color: active ? '#1d6f78' : '#7a96a4', marginRight: 6 }}>{key}.</span>
                            <span style={{ fontWeight: active ? 600 : 400 }}>{text}</span>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* 底部提交 */}
        <div style={{ marginTop: 18, background: '#fff', borderRadius: 12, border: '1px solid #eaeff2', padding: '14px 18px' }}>
          {!allAnswered && (
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <AlertCircle size={12} />还有 {questions.length - answeredCount} 道题未作答
            </p>
          )}
          <button
            onClick={submitQuiz}
            disabled={!allAnswered || submitting}
            style={{
              width: '100%', padding: '13px', borderRadius: 10, border: 'none',
              background: allAnswered && !submitting ? 'linear-gradient(135deg, #183b4b, #1d6f78)' : '#eef2f5',
              color: allAnswered && !submitting ? '#fff' : '#9eb3be',
              fontWeight: 700, fontSize: 14,
              cursor: allAnswered && !submitting ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              letterSpacing: '0.02em',
            }}
          >
            {submitting ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />提交中…</> : <><CheckCircle2 size={14} />提交答卷</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 结果页 ─────────────────────────────────────────────────────────────────

function ResultView({ result, trainingId, questions, answers }: { result: QuizResult; trainingId: string; questions: QuizQuestion[]; answers: Record<string, string[]> }) {
  const router = useRouter()
  const correctDetails = new Map(result.details.map(d => [d.qid, d]))

  return (
    <div style={{ background: '#f4f6f8', minHeight: 'calc(100vh - 86px)', padding: '20px 28px 40px' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        {/* 结果卡 */}
        <div style={{
          background: result.passed
            ? 'linear-gradient(135deg, #16a34a, #15803d)'
            : 'linear-gradient(135deg, #dc2626, #b91c1c)',
          borderRadius: 16, padding: '28px 32px', color: '#fff',
          marginBottom: 18, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -40, right: -30, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, position: 'relative' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                {result.passed ? <Trophy size={18} /> : <Award size={18} />}
                <p style={{ margin: 0, fontSize: 12, opacity: 0.85, letterSpacing: '0.04em' }}>章节测验结果</p>
              </div>
              <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>
                {result.passed ? '🎉 恭喜通过！' : '继续加油！'}
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.85 }}>
                答对 {result.correctCount}/{result.totalCount} 题 · 获得 <strong>{result.earnedHours}</strong> 学时分
              </p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 64, fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 1 }}>{result.score}</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, opacity: 0.75 }}>/ 100 分</p>
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          <button onClick={() => router.push(`/course/${trainingId}`)} style={{
            flex: 1, padding: '11px', borderRadius: 10, border: 'none',
            background: '#1d6f78', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>返回章节 <ArrowRight size={13} /></button>
          <button onClick={() => window.location.reload()} style={{
            padding: '11px 20px', borderRadius: 10,
            background: '#fff', color: '#1c3140', border: '1px solid #dde6eb',
            cursor: 'pointer', fontSize: 13, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6,
          }}><RotateCcw size={13} />重新测验</button>
        </div>

        {/* 答题回顾 */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eaeff2', padding: '20px 22px' }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#1c3140' }}>答题回顾</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {questions.map((qt, i) => {
              const detail = correctDetails.get(qt.question_id)
              const myAns = (answers[qt.question_id] ?? []).join('')
              return (
                <div key={qt.question_id} style={{
                  padding: '12px 14px', borderRadius: 8,
                  background: detail?.correct ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${detail?.correct ? '#bbf7d0' : '#fecaca'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: detail?.correct ? '#16a34a' : '#dc2626',
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1,
                    }}>{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 12.5, color: '#1c3140', lineHeight: 1.6 }}>{qt.stem}</p>
                      <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 11 }}>
                        <span style={{ color: '#7a96a4' }}>你的答案：<strong style={{ color: detail?.correct ? '#16a34a' : '#dc2626' }}>{myAns || '未作答'}</strong></span>
                        <span style={{ color: '#7a96a4' }}>正确答案：<strong style={{ color: '#1c3140' }}>{detail?.correctAnswer}</strong></span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
