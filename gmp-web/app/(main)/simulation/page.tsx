'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2, ChevronRight, BookOpen, ClipboardList,
  CheckCircle, XCircle, ArrowLeft, Loader2, Award,
  RefreshCw, FileText, FlaskConical,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface Product { product_name: string; dosage_form: string; section_count: number }
interface Category { name: string; icon: string; desc: string; products: Product[] }
interface Section  { section_type: string; section_name: string; content: string }
interface Question {
  question_id: string; question_type: string; stem: string; difficulty: string
  project_name: string; options: { key: string; text: string }[]
}
interface AnswerRecord {
  question_id: string; user_answer: string; correct_answer: string
  is_correct: boolean; explanation: string | null; stem: string
  question_type: string; options: { key: string; text: string }[]
}
interface SubmitResult {
  score: number; max_score: number; correct: number; total: number; pct: number; grade: string
  records: AnswerRecord[]
}
interface SimHistory {
  id: number; product_name: string; dosage_category: string
  score: number; max_score: number; completed_at: string
}

type Step = 'list' | 'reading' | 'quiz' | 'result'

// ── Helpers ──────────────────────────────────────────────────────────────────

const PANEL: React.CSSProperties = {
  background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(31,71,92,0.12)',
  borderRadius: 12, boxShadow: '0 8px 24px rgba(29,53,74,0.07)',
}

const DIFF_COLOR = (d: string) => d === '易' ? '#16a34a' : d === '中' ? '#d97706' : '#dc2626'

const GRADE_CFG = {
  A: { label: '优秀', color: '#16a34a', bg: '#f0fdf4', border: '#86efac', emoji: '🏆' },
  B: { label: '良好', color: '#1d6f78', bg: '#f0f9fa', border: '#67c7d0', emoji: '🎯' },
  C: { label: '及格', color: '#d97706', bg: '#fffbeb', border: '#fcd34d', emoji: '📝' },
  D: { label: '需加强', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', emoji: '📚' },
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SimulationPage() {
  const router = useRouter()

  const [step, setStep]                     = useState<Step>('list')
  const [categories, setCategories]         = useState<Category[]>([])
  const [simHistory, setSimHistory]         = useState<SimHistory[]>([])
  const [loadingList, setLoadingList]       = useState(true)

  const [selectedProduct, setSelectedProduct]   = useState<Product | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [sections, setSections]                 = useState<Section[]>([])
  const [questions, setQuestions]               = useState<Question[]>([])
  const [activeSection, setActiveSection]       = useState(0)
  const [loadingCase, setLoadingCase]           = useState(false)

  const [answers, setAnswers]         = useState<Record<string, string>>({})
  const [submitting, setSubmitting]   = useState(false)
  const [result, setResult]           = useState<SubmitResult | null>(null)

  // ── Load case list ────────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { router.push('/login'); return }

    Promise.all([
      fetch('/api/simulation/cases', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch('/api/simulation/history', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ]).then(([casesData, histData]) => {
      setCategories(casesData.categories ?? [])
      setSimHistory(histData.sessions ?? [])
    }).finally(() => setLoadingList(false))
  }, [router])

  // ── Pick a case → load materials & questions ──────────────────────────────
  async function pickCase(product: Product, categoryName: string) {
    setSelectedProduct(product)
    setSelectedCategory(categoryName)
    setLoadingCase(true)
    setStep('reading')
    setAnswers({})
    setResult(null)
    setActiveSection(0)

    const token = localStorage.getItem('token')!
    const params = new URLSearchParams({ product_name: product.product_name, dosage_category: categoryName })
    const data = await fetch(`/api/simulation/questions?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json())

    setSections(data.sections ?? [])
    setQuestions(data.questions ?? [])
    setLoadingCase(false)
  }

  // ── Select/toggle answer ─────────────────────────────────────────────────
  function handleAnswer(qid: string, key: string, type: string) {
    setAnswers(prev => {
      if (type === '多选题') {
        const cur = prev[qid] ?? ''
        const keys = cur ? cur.split('') : []
        const idx  = keys.indexOf(key)
        if (idx >= 0) keys.splice(idx, 1)
        else keys.push(key)
        return { ...prev, [qid]: keys.sort().join('') }
      }
      if (type === '判断题') {
        return { ...prev, [qid]: key === '正确' ? '正确' : '错误' }
      }
      return { ...prev, [qid]: key }
    })
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!selectedProduct) return
    const answerList = questions.map(q => ({
      question_id: q.question_id,
      answer: answers[q.question_id] ?? '',
    }))
    setSubmitting(true)
    const token = localStorage.getItem('token')!
    try {
      const res = await fetch('/api/simulation/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          product_name:    selectedProduct.product_name,
          dosage_category: selectedCategory,
          answers:         answerList,
        }),
      })
      const data: SubmitResult = await res.json()
      setResult(data)
      setStep('result')
      // Refresh history
      fetch('/api/simulation/history', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => setSimHistory(d.sessions ?? []))
    } finally {
      setSubmitting(false)
    }
  }

  const answeredCount = Object.values(answers).filter(v => v !== '').length
  const allAnswered   = questions.length > 0 && answeredCount === questions.length

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loadingList) return (
    <div style={{ padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#6b8a98', minHeight: 400 }}>
      <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: '#1d6f78' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      加载中…
    </div>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 1: 选案例
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 'list') return (
    <div style={{ padding: 20 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ marginBottom: 24 }}>
        <p style={{ color: '#1d6f78', fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', margin: 0 }}>进阶功能</p>
        <h1 style={{ color: '#183b4b', fontSize: 26, fontWeight: 700, margin: '4px 0 6px' }}>实训仿真</h1>
        <p style={{ color: '#6b8a98', fontSize: 14, margin: 0 }}>选择真实药品案例，阅读案例材料后完成情景测验，检验 GMP 实战应用能力。</p>
      </div>

      {/* Recent records */}
      {simHistory.length > 0 && (
        <div style={{ ...PANEL, padding: '16px 20px', marginBottom: 20 }}>
          <p style={{ fontWeight: 700, fontSize: 13, color: '#183b4b', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Award size={14} color="#1d6f78" />最近仿真记录
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {simHistory.slice(0, 3).map(s => {
              const pct = s.max_score > 0 ? Math.round((s.score / s.max_score) * 100) : 0
              const color = pct >= 90 ? '#16a34a' : pct >= 75 ? '#1d6f78' : pct >= 60 ? '#d97706' : '#dc2626'
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: '#f8fafc' }}>
                  <span style={{ fontSize: 13, color: '#355564' }}>{s.product_name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 11, color: '#9ba8b0' }}>{s.completed_at.slice(0,10)}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color }}>{pct}分</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Case categories */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {categories.map(cat => (
          <div key={cat.name}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 20 }}>{cat.icon}</span>
              <div>
                <p style={{ fontWeight: 700, fontSize: 15, color: '#183b4b', margin: 0 }}>{cat.name}</p>
                <p style={{ fontSize: 12, color: '#6b8a98', margin: 0 }}>{cat.desc}</p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {cat.products.map(p => (
                <button
                  key={p.product_name}
                  onClick={() => pickCase(p, cat.name)}
                  style={{
                    ...PANEL,
                    padding: '16px 18px', border: '1px solid rgba(31,71,92,0.12)',
                    background: 'rgba(255,255,255,0.92)', cursor: 'pointer', textAlign: 'left',
                    display: 'flex', flexDirection: 'column', gap: 6, transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#1d6f78')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(31,71,92,0.12)')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#183b4b' }}>{p.product_name}</span>
                    <ChevronRight size={14} color="#9ba8b0" />
                  </div>
                  <span style={{ fontSize: 11, color: '#9ba8b0', padding: '2px 8px', borderRadius: 999, background: 'rgba(29,111,120,0.08)', width: 'fit-content' }}>
                    {p.dosage_form}
                  </span>
                  <span style={{ fontSize: 11, color: '#6b8a98' }}>
                    <FileText size={10} style={{ display: 'inline', marginRight: 4 }} />
                    {p.section_count} 个案例章节 · 6 道情景题
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 2: 阅读案例
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 'reading') return (
    <div style={{ padding: 20 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => setStep('list')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(31,71,92,0.2)', background: 'transparent', color: '#6b8a98', fontSize: 13, cursor: 'pointer' }}>
          <ArrowLeft size={14} />返回
        </button>
        <div>
          <p style={{ color: '#1d6f78', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', margin: 0 }}>实训仿真</p>
          <h2 style={{ color: '#183b4b', fontSize: 20, fontWeight: 700, margin: '2px 0 0' }}>{selectedProduct?.product_name}</h2>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9ba8b0', background: 'rgba(29,111,120,0.08)', padding: '4px 12px', borderRadius: 999 }}>
          {selectedCategory}
        </span>
      </div>

      {loadingCase ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 300, color: '#6b8a98' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: '#1d6f78' }} />
          加载案例材料中…
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16 }}>
          {/* 章节目录 */}
          <div style={{ ...PANEL, padding: '16px 0', height: 'fit-content', position: 'sticky', top: 90 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#9ba8b0', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 16px', margin: '0 0 8px' }}>案例章节</p>
            {sections.map((s, i) => (
              <button
                key={i}
                onClick={() => setActiveSection(i)}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 16px', border: 'none',
                  background: activeSection === i ? 'rgba(29,111,120,0.1)' : 'transparent',
                  borderLeft: activeSection === i ? '3px solid #1d6f78' : '3px solid transparent',
                  color: activeSection === i ? '#1d6f78' : '#355564',
                  fontSize: 13, cursor: 'pointer', fontWeight: activeSection === i ? 600 : 400,
                  lineHeight: 1.5,
                }}
              >
                <div style={{ fontSize: 10, color: '#9ba8b0', marginBottom: 2 }}>{s.section_type}</div>
                {s.section_name || s.section_type}
              </button>
            ))}
            <div style={{ borderTop: '1px solid rgba(31,71,92,0.08)', margin: '12px 0' }} />
            <button
              onClick={() => setStep('quiz')}
              style={{ margin: '0 12px', width: 'calc(100% - 24px)', padding: '10px 0', borderRadius: 8, border: 'none', background: '#1d6f78', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <ClipboardList size={14} />开始答题
            </button>
          </div>

          {/* 章节内容 */}
          <div style={{ ...PANEL, padding: '28px 32px', minHeight: 400 }}>
            {sections[activeSection] ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                  <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 999, background: 'rgba(29,111,120,0.1)', color: '#1d6f78', fontWeight: 600 }}>{sections[activeSection].section_type}</span>
                  <h3 style={{ color: '#183b4b', fontSize: 18, fontWeight: 700, margin: 0 }}>{sections[activeSection].section_name}</h3>
                </div>
                <div style={{ color: '#355564', fontSize: 14, lineHeight: 2, whiteSpace: 'pre-wrap' }}>
                  {sections[activeSection].content}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
                  {activeSection > 0 && (
                    <button onClick={() => setActiveSection(i => i - 1)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(31,71,92,0.18)', background: 'transparent', color: '#6b8a98', fontSize: 13, cursor: 'pointer' }}>
                      上一章节
                    </button>
                  )}
                  {activeSection < sections.length - 1 ? (
                    <button onClick={() => setActiveSection(i => i + 1)} style={{ marginLeft: 'auto', padding: '8px 20px', borderRadius: 8, border: 'none', background: '#1d6f78', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                      下一章节 <ChevronRight size={14} />
                    </button>
                  ) : (
                    <button onClick={() => setStep('quiz')} style={{ marginLeft: 'auto', padding: '8px 20px', borderRadius: 8, border: 'none', background: '#1d6f78', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ClipboardList size={14} />开始情景测验
                    </button>
                  )}
                </div>
              </>
            ) : (
              <p style={{ color: '#9ba8b0', textAlign: 'center', paddingTop: 80 }}>暂无内容</p>
            )}
          </div>
        </div>
      )}
    </div>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 3: 情景测验
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 'quiz') return (
    <div style={{ padding: 20 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => setStep('reading')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(31,71,92,0.2)', background: 'transparent', color: '#6b8a98', fontSize: 13, cursor: 'pointer' }}>
          <ArrowLeft size={14} />返回案例
        </button>
        <div>
          <p style={{ color: '#1d6f78', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', margin: 0 }}>情景测验</p>
          <h2 style={{ color: '#183b4b', fontSize: 20, fontWeight: 700, margin: '2px 0 0' }}>{selectedProduct?.product_name}</h2>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#6b8a98' }}>
          已作答 <strong style={{ color: '#1d6f78' }}>{answeredCount}</strong> / {questions.length} 题
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {questions.map((q, idx) => {
          const userAns  = answers[q.question_id] ?? ''
          const isJudge  = q.question_type === '判断题'
          const isMulti  = q.question_type === '多选题'
          const answered = userAns !== ''

          return (
            <div key={q.question_id} style={{ ...PANEL, padding: '22px 24px' }}>
              {/* Question header */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: answered ? '#1d6f78' : '#e8edf0', color: answered ? '#fff' : '#9ba8b0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                  {idx + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'rgba(29,111,120,0.08)', color: '#1d6f78' }}>{q.question_type}</span>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: `${DIFF_COLOR(q.difficulty)}18`, color: DIFF_COLOR(q.difficulty) }}>{q.difficulty}</span>
                    {isMulti && <span style={{ fontSize: 11, color: '#d97706', background: 'rgba(217,119,6,0.08)', padding: '2px 8px', borderRadius: 999 }}>多选</span>}
                  </div>
                  <p style={{ color: '#183b4b', fontSize: 14, lineHeight: 1.7, margin: 0 }}>{q.stem}</p>
                </div>
              </div>

              {/* Options */}
              {isJudge ? (
                <div style={{ display: 'flex', gap: 10 }}>
                  {['正确', '错误'].map(opt => (
                    <button
                      key={opt}
                      onClick={() => handleAnswer(q.question_id, opt, q.question_type)}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14,
                        border: `2px solid ${userAns === opt ? '#1d6f78' : 'rgba(31,71,92,0.15)'}`,
                        background: userAns === opt ? 'rgba(29,111,120,0.1)' : '#fff',
                        color: userAns === opt ? '#1d6f78' : '#355564',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}
                    >
                      {opt === '正确' ? <CheckCircle size={15} /> : <XCircle size={15} />}{opt}
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {q.options.map(opt => {
                    const sel = isMulti ? userAns.includes(opt.key) : userAns === opt.key
                    return (
                      <button
                        key={opt.key}
                        onClick={() => handleAnswer(q.question_id, opt.key, q.question_type)}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: 8,
                          border: `1.5px solid ${sel ? '#1d6f78' : 'rgba(31,71,92,0.12)'}`,
                          background: sel ? 'rgba(29,111,120,0.08)' : '#fff', cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        <span style={{ width: 22, height: 22, borderRadius: isMulti ? 4 : '50%', border: `2px solid ${sel ? '#1d6f78' : '#c0ccd4'}`, background: sel ? '#1d6f78' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {sel && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{isMulti ? '✓' : opt.key}</span>}
                          {!sel && <span style={{ color: '#9ba8b0', fontSize: 11, fontWeight: 600 }}>{opt.key}</span>}
                        </span>
                        <span style={{ fontSize: 14, color: '#355564', lineHeight: 1.6 }}>{opt.text}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {/* Submit */}
        <div style={{ ...PANEL, padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: '#6b8a98' }}>
            {allAnswered ? '✅ 所有题目已作答，可以提交' : `还有 ${questions.length - answeredCount} 题未作答`}
          </span>
          <button
            onClick={handleSubmit}
            disabled={!allAnswered || submitting}
            style={{
              padding: '11px 28px', borderRadius: 8, border: 'none',
              background: allAnswered ? '#1d6f78' : '#dde3e8',
              color: allAnswered ? '#fff' : '#9ba8b0',
              fontWeight: 700, fontSize: 14, cursor: allAnswered ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', gap: 8,
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={15} />}
            提交答卷
          </button>
        </div>
      </div>
    </div>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 4: 仿真报告
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 'result' && result) {
    const grade = result.grade as keyof typeof GRADE_CFG
    const gcfg  = GRADE_CFG[grade] ?? GRADE_CFG.C

    return (
      <div style={{ padding: 20 }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

        {/* Score banner */}
        <div style={{ ...PANEL, padding: '32px 36px', marginBottom: 16, background: `linear-gradient(135deg, ${gcfg.bg}, rgba(255,255,255,0.95))`, border: `1px solid ${gcfg.border}`, display: 'flex', alignItems: 'center', gap: 32 }}>
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: 48 }}>{gcfg.emoji}</div>
            <div style={{ fontSize: 44, fontWeight: 800, color: gcfg.color, lineHeight: 1 }}>{result.pct}</div>
            <div style={{ fontSize: 13, color: '#9ba8b0' }}>总分</div>
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ color: '#183b4b', fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>
              {selectedProduct?.product_name} · 仿真完成
            </h2>
            <p style={{ color: '#6b8a98', fontSize: 14, margin: '0 0 16px' }}>
              答对 <strong style={{ color: gcfg.color }}>{result.correct}</strong> 题，共 {result.total} 题 ·
              等级：<strong style={{ color: gcfg.color }}>{gcfg.label}（{grade}）</strong>
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setStep('list'); setResult(null) }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, border: 'none', background: '#1d6f78', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                <Building2 size={14} />选择新案例
              </button>
              <button
                onClick={() => setStep('reading')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, border: '1px solid rgba(31,71,92,0.2)', background: 'transparent', color: '#6b8a98', fontSize: 13, cursor: 'pointer' }}
              >
                <RefreshCw size={14} />重做本案例
              </button>
            </div>
          </div>

          {/* Stat pills */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
            {[
              { label: '正确', value: result.correct, color: '#16a34a' },
              { label: '错误', value: result.total - result.correct, color: '#dc2626' },
              { label: '得分', value: `${result.score}/${result.max_score}`, color: '#1d6f78' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center', padding: '10px 18px', borderRadius: 10, background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(31,71,92,0.1)' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: '#9ba8b0' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Detailed answer review */}
        <p style={{ fontWeight: 700, fontSize: 15, color: '#183b4b', margin: '0 0 12px' }}>答题详情</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {result.records.map((r, i) => (
            <div key={r.question_id} style={{ ...PANEL, padding: '18px 22px', borderLeft: `4px solid ${r.is_correct ? '#16a34a' : '#dc2626'}` }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
                {r.is_correct
                  ? <CheckCircle size={18} color="#16a34a" style={{ flexShrink: 0, marginTop: 2 }} />
                  : <XCircle    size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
                }
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, color: '#6b8a98', margin: '0 0 4px' }}>第 {i + 1} 题 · {r.question_type}</p>
                  <p style={{ fontSize: 14, color: '#183b4b', lineHeight: 1.7, margin: 0 }}>{r.stem}</p>
                </div>
              </div>

              {/* Options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                {r.options.map(opt => {
                  const isCorrectOpt = r.correct_answer.includes(opt.key)
                  const isUserOpt    = r.user_answer.includes(opt.key)
                  const bg = isCorrectOpt ? '#f0fdf4' : (isUserOpt && !isCorrectOpt) ? '#fef2f2' : '#f8fafc'
                  const color = isCorrectOpt ? '#16a34a' : (isUserOpt && !isCorrectOpt) ? '#dc2626' : '#6b8a98'
                  return (
                    <div key={opt.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px', borderRadius: 6, background: bg }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color, flexShrink: 0 }}>{opt.key}.</span>
                      <span style={{ fontSize: 13, color: color === '#6b8a98' ? '#355564' : color, flex: 1 }}>{opt.text}</span>
                      {isCorrectOpt && <CheckCircle size={14} color="#16a34a" style={{ flexShrink: 0, marginTop: 2 }} />}
                      {isUserOpt && !isCorrectOpt && <XCircle size={14} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />}
                    </div>
                  )
                })}
              </div>

              {/* Answer summary */}
              <div style={{ display: 'flex', gap: 16, fontSize: 12, padding: '8px 10px', borderRadius: 6, background: '#f8fafc' }}>
                <span>你的答案：<strong style={{ color: r.is_correct ? '#16a34a' : '#dc2626' }}>{r.user_answer || '（未作答）'}</strong></span>
                <span>正确答案：<strong style={{ color: '#16a34a' }}>{r.correct_answer}</strong></span>
              </div>

              {/* Explanation */}
              {r.explanation && (
                <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: 'rgba(29,111,120,0.05)', border: '1px solid rgba(29,111,120,0.12)' }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#1d6f78', margin: '0 0 4px' }}>💡 解析</p>
                  <p style={{ fontSize: 13, color: '#355564', lineHeight: 1.7, margin: 0 }}>{r.explanation}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return null
}
