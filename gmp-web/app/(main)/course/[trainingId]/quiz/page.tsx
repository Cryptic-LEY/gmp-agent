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
  question_type: '单选题' | '多选题' | '判断题' | '填空题' | '简答题' | '综合分析题' | '案例分析题'
  stem: string
  difficulty: string
  kp_id: string | null
  points: number
  answer_mode: 'choice' | 'text'
  options: { key: string; text: string }[]
}

interface QuizAttemptMeta {
  usedAttempts: number
  nextAttemptNumber: number
  maxAttempts: number
  retakeLimit: number
  remainingRetakes: number
  exhausted: boolean
}

interface QuizResult {
  trainingId: string
  score: number
  correctCount: number
  totalCount: number
  earnedPoints: number
  maxPoints: number
  earnedHours: number
  earnedCredits?: number
  maxHours: number
  maxCredits?: number
  passScore: number
  passed: boolean
  attempt: QuizAttemptMeta
  details: { qid: string; correct: boolean; userAnswer: string; correctAnswer: string; score: number; maxScore: number; comment?: string }[]
}

interface QuizGate {
  unlocked: boolean
  totalPptPages: number
  viewedPptPages: number
  missingPages: number
  completedLessons: number
  requiredLessons: number
}

export default function ChapterQuizPage({ params }: { params: Promise<{ trainingId: string }> }) {
  const { trainingId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const eduLevel = searchParams.get('eduLevel') || 'college'

  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [chapterName, setChapterName] = useState('')
  const [passScore, setPassScore] = useState(60)
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<QuizResult | null>(null)
  const [lockedGate, setLockedGate] = useState<QuizGate | null>(null)
  const [lockedMessage, setLockedMessage] = useState('')
  const [blockedMessage, setBlockedMessage] = useState('')
  const [attempt, setAttempt] = useState<QuizAttemptMeta | null>(null)
  const [startTime] = useState(Date.now())

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { router.push('/login'); return }
    async function loadQuiz() {
      const res = await fetch(`/api/course/quiz/${trainingId}`, { headers: { Authorization: `Bearer ${token}` } })
      const d = await res.json().catch(() => null)
      if (res.status === 403) {
        if (d?.attemptsExhausted) {
          setBlockedMessage(d?.error || '本章节测验重做机会已用完')
          setAttempt(d?.attempt ?? null)
        } else {
          setLockedGate(d?.gate ?? null)
          setLockedMessage(d?.error || '请先浏览完本章节全部 PPT 后再开始章节测验')
        }
        setChapterName(d?.displayName ?? '')
        setLoading(false)
        return
      }
      if (!res.ok) {
        setLoading(false)
        return
      }
      if (d) {
        if (!d || !d.questions?.length) {
          setLoading(false)
          return
        }
        setQuestions(d.questions)
        setChapterName(d.displayName)
        setPassScore(Number(d.quizConfig?.passScore ?? 60))
        setAttempt(d.attempt ?? null)
        setLoading(false)
      } else {
        setLoading(false)
      }
    }
    void loadQuiz()
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

  function setTextAnswer(qid: string, value: string) {
    setAnswers(prev => ({ ...prev, [qid]: [value] }))
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
      if (res.status === 403) {
        const data = await res.json().catch(() => null)
        if (data?.attemptsExhausted) {
          setBlockedMessage(data?.error || '本章节测验重做机会已用完')
          setAttempt(data?.attempt ?? null)
        } else {
          setLockedGate(data?.gate ?? null)
          setLockedMessage(data?.error || '请先浏览完本章节全部 PPT 后再提交章节测验')
        }
        setResult(null)
      } else if (res.ok) {
        const data: QuizResult = await res.json()
        setResult(data)
        setAttempt(data.attempt)

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

  const answeredCount = questions.filter(question => (answers[question.question_id]?.[0] ?? '').trim().length > 0).length
  const allAnswered = questions.every(question => (answers[question.question_id]?.[0] ?? '').trim().length > 0)

  if (loading) return <div style={{ padding: 60, textAlign: 'center' }}><Loader2 size={28} className="spin" style={{ animation: 'spin 1s linear infinite' }} /></div>

  if (blockedMessage) {
    return (
      <div style={{ background: '#f4f6f8', minHeight: 'calc(100vh - 86px)', padding: '44px 28px' }}>
        <div style={{ maxWidth: 620, margin: '0 auto', background: '#fff', borderRadius: 14, border: '1px solid #eaeff2', padding: '30px 32px', textAlign: 'center' }}>
          <div style={{ width: 66, height: 66, borderRadius: '50%', background: '#fef2f2', color: '#dc2626', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
            <AlertCircle size={30} />
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: 20, color: '#1c3140' }}>章节测验已结束</h1>
          <p style={{ margin: '0 0 18px', color: '#7a96a4', fontSize: 13, lineHeight: 1.7 }}>
            {blockedMessage}{attempt ? `；已提交 ${attempt.usedAttempts}/${attempt.maxAttempts} 次。` : ''}
          </p>
          <button onClick={() => router.push(`/course/${trainingId}`)} style={{
            padding: '11px 24px', borderRadius: 10, border: 'none',
            background: '#1d6f78', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            返回章节 <ArrowRight size={13} />
          </button>
        </div>
      </div>
    )
  }

  if (lockedGate) {
    const progressPct = lockedGate.totalPptPages > 0 ? Math.round((lockedGate.viewedPptPages / lockedGate.totalPptPages) * 100) : 0
    return (
      <div style={{ background: '#f4f6f8', minHeight: 'calc(100vh - 86px)', padding: '44px 28px' }}>
        <div style={{ maxWidth: 620, margin: '0 auto', background: '#fff', borderRadius: 14, border: '1px solid #eaeff2', padding: '30px 32px', textAlign: 'center' }}>
          <div style={{ width: 66, height: 66, borderRadius: '50%', background: '#fff7ed', color: '#f97316', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
            <AlertCircle size={30} />
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: 20, color: '#1c3140' }}>章节测验暂未解锁</h1>
      <p style={{ margin: '0 0 18px', color: '#7a96a4', fontSize: 13, lineHeight: 1.7 }}>
            {lockedMessage || '请先浏览完本章节全部 PPT 后再开始章节测验'}{chapterName ? `：${chapterName}` : ''}
          </p>
          <div style={{ textAlign: 'left', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b8a98', fontWeight: 700, marginBottom: 7 }}>
              <span>PPT 浏览进度</span>
              <strong>{lockedGate.viewedPptPages}/{lockedGate.totalPptPages} 页</strong>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: '#eef2f5', overflow: 'hidden' }}>
              <span style={{ display: 'block', width: `${Math.max(4, progressPct)}%`, height: '100%', background: 'linear-gradient(90deg, #1d6f78, #2f9e80)', borderRadius: 999 }} />
            </div>
          </div>
          <button onClick={() => router.push(`/course/${trainingId}`)} style={{
            padding: '11px 24px', borderRadius: 10, border: 'none',
            background: '#1d6f78', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            返回课程学习 <ArrowRight size={13} />
          </button>
        </div>
      </div>
    )
  }

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
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9aacb6' }}>
                {trainingId} · 共 {questions.length} 题 · {passScore} 分通过
                {attempt ? ` · 第 ${attempt.nextAttemptNumber}/${attempt.maxAttempts} 次作答 · 剩余重做 ${attempt.remainingRetakes} 次` : ''}
              </p>
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
            const isText = qt.answer_mode === 'text'
            const sel = answers[qt.question_id] ?? []
            const answerText = sel[0] ?? ''
            const isDone = answerText.trim().length > 0
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
                      <span style={{ fontSize: 10, color: '#1d6f78', background: 'rgba(29,111,120,0.08)', padding: '2px 8px', borderRadius: 20 }}>{qt.points} 分</span>
                      {isMulti && <span style={{ fontSize: 10, fontWeight: 600, color: '#b45309', background: 'rgba(180,83,9,0.07)', padding: '2px 8px', borderRadius: 20 }}>多选</span>}
                    </div>
                  </div>
                  {isDone && <CheckCircle2 size={15} color="#1d6f78" strokeWidth={2.5} />}
                </div>

                <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 500, color: '#1c3140', lineHeight: 1.8 }}>{qt.stem}</p>

                {isText ? (
                  qt.question_type === '填空题' ? (
                    <input
                      value={answerText}
                      onChange={event => setTextAnswer(qt.question_id, event.target.value)}
                      placeholder="请输入关键术语或短语"
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        border: '1.5px solid #dde6eb',
                        borderRadius: 8,
                        padding: '10px 12px',
                        fontSize: 13,
                        color: '#1c3140',
                        outline: 'none',
                        background: '#fafbfc',
                      }}
                    />
                  ) : (
                    <textarea
                      value={answerText}
                      onChange={event => setTextAnswer(qt.question_id, event.target.value)}
                      placeholder={qt.question_type === '简答题' ? '请分点写出核心要点' : '请从法规依据、风险、原因和措施等角度综合分析'}
                      rows={qt.question_type === '简答题' ? 4 : 7}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        border: '1.5px solid #dde6eb',
                        borderRadius: 8,
                        padding: '10px 12px',
                        fontSize: 13,
                        lineHeight: 1.7,
                        color: '#1c3140',
                        outline: 'none',
                        resize: 'vertical',
                        fontFamily: 'inherit',
                        background: '#fafbfc',
                      }}
                    />
                  )
                ) : qt.question_type === '判断题' ? (
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
  const earnedCredit = result.earnedCredits ?? result.earnedHours

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
                达标 {result.correctCount}/{result.totalCount} 题 · {result.earnedPoints}/{result.maxPoints} 分值 · 获得 <strong>{earnedCredit}</strong> 课时分
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.78 }}>
                已提交 {result.attempt.usedAttempts}/{result.attempt.maxAttempts} 次，剩余重做 {result.attempt.remainingRetakes} 次
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
          {result.attempt.remainingRetakes > 0 && (
            <button onClick={() => window.location.reload()} style={{
              padding: '11px 20px', borderRadius: 10,
              background: '#fff', color: '#1c3140', border: '1px solid #dde6eb',
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6,
            }}><RotateCcw size={13} />重新测验</button>
          )}
        </div>

        {/* 答题回顾 */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eaeff2', padding: '20px 22px' }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#1c3140' }}>答题回顾</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {questions.map((qt, i) => {
              const detail = correctDetails.get(qt.question_id)
              const myAns = (answers[qt.question_id] ?? []).join('')
              const textQuestion = qt.answer_mode === 'text'
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
                      <div style={{ display: textQuestion ? 'grid' : 'flex', gap: textQuestion ? 6 : 14, marginTop: 6, fontSize: 11 }}>
                        <span style={{ color: '#7a96a4', whiteSpace: textQuestion ? 'pre-wrap' : 'normal' }}>
                          你的答案：<strong style={{ color: detail?.correct ? '#16a34a' : '#dc2626', fontWeight: 700 }}>{myAns || '未作答'}</strong>
                        </span>
                        <span style={{ color: '#7a96a4', whiteSpace: textQuestion ? 'pre-wrap' : 'normal' }}>
                          {textQuestion ? '参考要点' : '正确答案'}：<strong style={{ color: '#1c3140', fontWeight: 700 }}>{detail?.correctAnswer}</strong>
                        </span>
                        <span style={{ color: '#7a96a4' }}>
                          得分：<strong style={{ color: '#1d6f78' }}>{detail?.score ?? 0}/{detail?.maxScore ?? qt.points}</strong>
                        </span>
                      </div>
                      {detail?.comment && <p style={{ margin: '6px 0 0', fontSize: 11, color: '#64748b', lineHeight: 1.6 }}>{detail.comment}</p>}
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
