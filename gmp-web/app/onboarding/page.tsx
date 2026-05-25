'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, ChevronLeft, CheckCircle2, AlertCircle, Loader2, Download, BookOpen } from 'lucide-react'

// ── 常量 ────────────────────────────────────────────────────────────────────

const EDU_LEVELS = [
  { value: 'college',       label: '专科', desc: '高职高专，三年制药学类专业' },
  { value: 'undergraduate', label: '本科', desc: '四年制本科，药学类专业' },
]

const MAJORS = [
  '药学', '药品生产技术', '药事管理', '中药学', '中药制药',
  '药物制剂', '食品药品监督管理', '生物制药', '制药设备',
  '化学制药', '药品质量管理', '药事管理与服务',
]

const STEPS = ['注册信息', '选择身份', '能力前测', '学习方案']

// ── Types ────────────────────────────────────────────────────────────────────

interface Question {
  question_id: string
  question_type: '单选题' | '多选题' | '判断题'
  stem: string
  difficulty: string
  options: { key: string; text: string }[]
  project_name?: string | null
}

interface PlanItem {
  project_name: string
  priority: 'high' | 'medium' | 'low'
  reason: string
}

interface RegInfo {
  realName:  string
  school:    string
  major:     string
  className: string
  studentId: string
  idCard:    string
  phone:     string
}

// ── Mock 数据 ────────────────────────────────────────────────────────────────

const MOCK_QUESTIONS: Question[] = Array.from({ length: 20 }, (_, i) => ({
  question_id: `mock-${i}`,
  question_type: (i < 14 ? '单选题' : '多选题') as '单选题' | '多选题',
  stem: `【示例题 ${i + 1}】GMP相关知识考查（连接API后替换为真实题目）`,
  difficulty: i < 12 ? '易' : '中',
  options: [
    { key: 'A', text: '选项 A' },
    { key: 'B', text: '选项 B' },
    { key: 'C', text: '选项 C' },
    { key: 'D', text: '选项 D' },
  ],
  project_name: `项目${['一','二','三','四','五','六','七','八','九','十','十一'][i % 11]}`,
}))

// ── 工具函数 ─────────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 80) return '#16a34a'
  if (score >= 60) return '#d97706'
  return '#dc2626'
}

// ── Component ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()

  // Step state
  const [step, setStep]         = useState(0)
  const [maxStep, setMaxStep]   = useState(0)   // 已到达的最远步骤，用于控制哪些步骤可点击回跳

  // Step 0 — 注册信息
  const [regInfo, setRegInfo] = useState<RegInfo>({
    realName: '', school: '', major: '', className: '', studentId: '', idCard: '', phone: '',
  })
  const [regEmail, setRegEmail]       = useState('')
  const [regDisplay, setRegDisplay]   = useState('')
  const [regSaving, setRegSaving]     = useState(false)
  const [regError, setRegError]       = useState('')

  // Step 1 — 选择身份
  const [eduLevel, setEduLevel] = useState<string>('')
  const [major, setMajor]       = useState<string>('')

  // Step 2 — 答题
  const [questions, setQuestions]     = useState<Question[]>([])
  const [answers, setAnswers]         = useState<Record<string, string[]>>({})
  const [current, setCurrent]         = useState(0)
  const [loading, setLoading]         = useState(false)
  const [submitting, setSubmitting]   = useState(false)

  // Step 3 — 结果
  const [score, setScore]           = useState<number | null>(null)
  const [plan, setPlan]             = useState<PlanItem[]>([])
  const [wrongCount, setWrongCount] = useState(0)

  // ── Auth guard & profile prefill ─────────────────────────────────────────

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { router.push('/login'); return }
    if (localStorage.getItem('onboarding_done')) { router.push('/dashboard'); return }

    // 预填邮箱/昵称（只读显示）
    fetch('/api/user/profile', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((data) => {
        setRegEmail(data.email ?? '')
        setRegDisplay(data.displayName ?? '')
        // 如果已填过注册信息则预填
        setRegInfo({
          realName:  data.realName  ?? '',
          school:    data.school    ?? '',
          major:     data.major     ?? '',
          className: data.className ?? '',
          studentId: data.studentId ?? '',
          idCard:    data.idCard    ?? '',
          phone:     data.phone     ?? '',
        })
      })
      .catch(() => {})
  }, [router])

  // ── 拉取题目 ───────────────────────────────────────────────────────────────

  const fetchQuestions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/onboarding/questions?edu_level=${eduLevel}&major=${encodeURIComponent(major)}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      )
      if (res.ok) {
        const data = await res.json()
        setQuestions(data.questions?.length >= 10 ? data.questions : MOCK_QUESTIONS)
      } else {
        setQuestions(MOCK_QUESTIONS)
      }
    } catch {
      setQuestions(MOCK_QUESTIONS)
    } finally {
      setLoading(false)
    }
  }, [eduLevel, major])

  // ── 提交答案 ───────────────────────────────────────────────────────────────

  async function submitAnswers() {
    setSubmitting(true)
    try {
      const payload = {
        edu_level: eduLevel,
        major,
        answers: questions.map(q => ({
          question_id: q.question_id,
          answer: (answers[q.question_id] ?? []).join(''),
        })),
      }
      const res = await fetch('/api/onboarding/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const data = await res.json()
        setScore(data.score ?? 0)
        setPlan(data.plan ?? buildFallbackPlan())
        setWrongCount(data.wrong_count ?? 0)
      } else {
        setScore(0)
        setPlan(buildFallbackPlan())
      }
    } catch {
      setScore(0)
      setPlan(buildFallbackPlan())
    } finally {
      setSubmitting(false)
      advanceStep(3)
    }
  }

  function buildFallbackPlan(): PlanItem[] {
    return ['项目一：GMP认知与法规基础','项目二：质量管理体系构建与运行','项目三：厂房设施与设备管理',
      '项目四：药品生产管理','项目五：确认与验证'].map((p, i) => ({
      project_name: p,
      priority: (i < 2 ? 'high' : i < 4 ? 'medium' : 'low') as 'high'|'medium'|'low',
      reason: '网络异常，此为默认方案，建议重新完成前测',
    }))
  }

  // ── 答题交互 ───────────────────────────────────────────────────────────────

  function toggleAnswer(qid: string, key: string, multi: boolean) {
    setAnswers(prev => {
      const cur = prev[qid] ?? []
      if (multi) {
        return { ...prev, [qid]: cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key] }
      }
      return { ...prev, [qid]: [key] }
    })
  }

  const q = questions[current]
  const isMulti   = q?.question_type === '多选题'
  const selected  = answers[q?.question_id ?? ''] ?? []
  const answered  = selected.length > 0
  const allAnswered = questions.every(q => (answers[q.question_id]?.length ?? 0) > 0)
  const progress    = questions.length ? Math.round(((current + 1) / questions.length) * 100) : 0

  // ── Step 0 — 保存注册信息，进入选择身份 ──────────────────────────────────

  async function handleRegNext() {
    setRegError('')
    const { realName, school, phone } = regInfo
    if (!realName.trim()) { setRegError('请填写真实姓名'); return }
    if (!school.trim())   { setRegError('请填写学校名称'); return }
    if (phone && !/^1[3-9]\d{9}$/.test(phone)) { setRegError('手机号格式不正确'); return }

    setRegSaving(true)
    try {
      await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(regInfo),
      })
    } catch {
      // 网络异常不阻断流程
    } finally {
      setRegSaving(false)
    }
    advanceStep(1)
  }

  // ── Step 1 — 选择身份，进入能力前测 ──────────────────────────────────────

  function handleStep2Next() {
    if (!eduLevel || !major) return
    localStorage.setItem('edu_level', eduLevel)
    localStorage.setItem('major', major)
    // 如果已有题目（从结果页返回时），直接复用
    if (questions.length === 0) fetchQuestions()
    advanceStep(2)
  }

  function handleFinish() {
    localStorage.setItem('onboarding_done', 'true')
    router.push('/dashboard')
  }

  // ── 步骤导航 ────────────────────────────────────────────────────────────────

  function goStep(target: number) {
    if (target < 0 || target > maxStep) return   // 只能回跳到已到达过的步骤
    setStep(target)
  }

  function advanceStep(target: number) {
    setStep(target)
    setMaxStep(m => Math.max(m, target))
  }

  // ── Input style helper ─────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    flex: 1, border: '1px solid #dde3e8', borderRadius: 6, padding: '9px 12px',
    fontSize: 13, outline: 'none', color: '#183b4b', background: '#fff',
  }
  const roInputStyle: React.CSSProperties = {
    ...inputStyle, background: '#f6f8fa', color: '#6b8a98', cursor: 'not-allowed',
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#eef4f3 0%,#e8f0f2 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 16px' }}>

      {/* Header */}
      <div style={{ width: '100%', maxWidth: 720, marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#215566,#35818a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>G</span>
          </div>
          <span style={{ fontWeight: 700, fontSize: 18, color: '#183b4b' }}>GMP 助学平台</span>
        </div>

        {/* Step bar — 已到达的步骤可点击跳转 */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {STEPS.map((label, i) => {
            const done      = i < step
            const active    = i === step
            const reachable = i <= maxStep
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
                <div
                  onClick={() => reachable && i !== step && goStep(i)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: reachable && i !== step ? 'pointer' : 'default' }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: done ? '#1d6f78' : active ? '#183b4b' : '#dde3e8',
                    color: done || active ? '#fff' : '#9ba8b0',
                    fontWeight: 700, fontSize: 13, flexShrink: 0,
                    boxShadow: reachable && i !== step ? '0 0 0 2px rgba(29,111,120,0.3)' : 'none',
                    transition: 'box-shadow 0.15s',
                  }}>
                    {done ? <CheckCircle2 size={16} /> : i + 1}
                  </div>
                  <span style={{
                    fontSize: 13, fontWeight: active ? 700 : 400,
                    color: active ? '#183b4b' : done ? '#1d6f78' : '#9ba8b0',
                    whiteSpace: 'nowrap',
                    textDecoration: reachable && i !== step ? 'underline dotted' : 'none',
                  }}>
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{ flex: 1, height: 2, background: done ? '#1d6f78' : '#dde3e8', margin: '0 12px' }} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Card */}
      <div style={{ width: '100%', maxWidth: 720, background: '#fff', borderRadius: 16, boxShadow: '0 8px 32px rgba(24,59,75,0.1)', overflow: 'hidden' }}>

        {/* 通用返回按钮（Step 0 不需要） */}
        {step > 0 && (
          <div style={{ padding: '16px 32px 0', borderBottom: '1px solid rgba(31,71,92,0.06)' }}>
            <button onClick={() => goStep(step - 1)} style={{
              display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
              cursor: 'pointer', color: '#6b8a98', fontSize: 13, padding: '6px 0',
            }}>
              <ChevronLeft size={15} /> 返回上一步
            </button>
          </div>
        )}

        {/* ── Step 0: 注册信息 ──────────────────────────────────────────── */}
        {step === 0 && (
          <div style={{ padding: '40px 48px' }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#183b4b', margin: '0 0 8px' }}>填写注册信息</h1>
            <p style={{ color: '#6b8a98', fontSize: 15, margin: '0 0 32px' }}>请完善个人学籍信息，以便平台记录和管理学习档案</p>

            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

            {/* 账号信息（只读） */}
            <p style={{ fontWeight: 700, fontSize: 13, color: '#183b4b', margin: '0 0 14px', borderBottom: '1px solid rgba(31,71,92,0.08)', paddingBottom: 8 }}>账号信息</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', marginBottom: 28 }}>
              {[
                { label: '账号（邮箱）', value: regEmail },
                { label: '显示昵称',     value: regDisplay },
              ].map(({ label, value }) => (
                <div key={label}>
                  <label style={{ display: 'block', fontSize: 12, color: '#6b8a98', marginBottom: 4 }}>{label}</label>
                  <input readOnly value={value} style={roInputStyle} />
                </div>
              ))}
            </div>

            {/* 学籍信息 */}
            <p style={{ fontWeight: 700, fontSize: 13, color: '#183b4b', margin: '0 0 14px', borderBottom: '1px solid rgba(31,71,92,0.08)', paddingBottom: 8 }}>
              学籍信息 <span style={{ fontSize: 11, color: '#6b8a98', fontWeight: 400 }}>（带 * 为必填）</span>
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', marginBottom: 28 }}>
              {[
                { label: '真实姓名', key: 'realName',  required: true,  placeholder: '请填写真实姓名' },
                { label: '学校',     key: 'school',    required: true,  placeholder: '请填写就读学校' },
                { label: '专业',     key: 'major',     required: false, placeholder: '请填写所学专业' },
                { label: '班级',     key: 'className', required: false, placeholder: '如：药学2301班' },
                { label: '学号',     key: 'studentId', required: false, placeholder: '请填写学号' },
                { label: '身份证号', key: 'idCard',    required: false, placeholder: '请填写身份证号' },
                { label: '手机号',   key: 'phone',     required: false, placeholder: '请填写手机号' },
              ].map(({ label, key, required, placeholder }) => (
                <div key={key}>
                  <label style={{ display: 'block', fontSize: 12, color: '#6b8a98', marginBottom: 4 }}>
                    {required && <span style={{ color: '#ef4444', marginRight: 2 }}>*</span>}{label}
                  </label>
                  <input
                    value={regInfo[key as keyof RegInfo]}
                    onChange={e => setRegInfo(p => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    style={inputStyle}
                  />
                </div>
              ))}
            </div>

            {regError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
                <AlertCircle size={14} />{regError}
              </div>
            )}

            <button onClick={handleRegNext} disabled={regSaving} style={{
              width: '100%', padding: '14px', borderRadius: 10, border: 'none',
              background: '#1d6f78', color: '#fff',
              fontWeight: 700, fontSize: 15, cursor: regSaving ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'background 0.15s',
            }}>
              {regSaving ? <Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} /> : null}
              {regSaving ? '保存中…' : '下一步：选择学习身份'}
              {!regSaving && <ChevronRight size={18} />}
            </button>
          </div>
        )}

        {/* ── Step 1: 选择身份 ──────────────────────────────────────────── */}
        {step === 1 && (
          <div style={{ padding: '40px 48px' }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#183b4b', margin: '0 0 8px' }}>选择学习身份</h1>
            <p style={{ color: '#6b8a98', fontSize: 15, margin: '0 0 36px' }}>告诉我们你的学历层次和专业方向，以便生成个性化学习方案</p>

            {/* 学历选择 */}
            <p style={{ fontWeight: 700, fontSize: 14, color: '#183b4b', margin: '0 0 12px' }}>你的学历层次</p>
            <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
              {EDU_LEVELS.map(({ value, label, desc }) => (
                <div key={value} onClick={() => setEduLevel(value)} style={{
                  flex: 1, padding: '16px 20px', borderRadius: 10, cursor: 'pointer',
                  border: `2px solid ${eduLevel === value ? '#1d6f78' : '#dde3e8'}`,
                  background: eduLevel === value ? 'rgba(29,111,120,0.06)' : '#fff',
                  transition: 'all 0.15s',
                }}>
                  <p style={{ fontWeight: 700, fontSize: 16, color: eduLevel === value ? '#1d6f78' : '#183b4b', margin: '0 0 4px' }}>{label}</p>
                  <p style={{ fontSize: 12, color: '#6b8a98', margin: 0 }}>{desc}</p>
                </div>
              ))}
            </div>

            {/* 专业选择 */}
            <p style={{ fontWeight: 700, fontSize: 14, color: '#183b4b', margin: '0 0 12px' }}>你的专业方向</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 36 }}>
              {MAJORS.map(m => (
                <div key={m} onClick={() => setMajor(m)} style={{
                  padding: '10px 14px', borderRadius: 8, cursor: 'pointer', textAlign: 'center',
                  border: `2px solid ${major === m ? '#1d6f78' : '#dde3e8'}`,
                  background: major === m ? 'rgba(29,111,120,0.06)' : '#fff',
                  fontSize: 13, fontWeight: major === m ? 700 : 400,
                  color: major === m ? '#1d6f78' : '#46606f',
                  transition: 'all 0.15s',
                }}>
                  {m}
                </div>
              ))}
            </div>

            <button onClick={handleStep2Next} disabled={!eduLevel || !major} style={{
              width: '100%', padding: '14px', borderRadius: 10, border: 'none',
              background: eduLevel && major ? '#1d6f78' : '#dde3e8',
              color: eduLevel && major ? '#fff' : '#9ba8b0',
              fontWeight: 700, fontSize: 15, cursor: eduLevel && major ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'background 0.15s',
            }}>
              开始能力前测 <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* ── Step 2: 答题 ──────────────────────────────────────────────── */}
        {step === 2 && (
          <div>
            {/* Progress header */}
            <div style={{ padding: '20px 32px 16px', borderBottom: '1px solid rgba(31,71,92,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: '#183b4b' }}>
                  能力前测 — 第 {current + 1} / {questions.length} 题
                </span>
                <span style={{ fontSize: 12, color: '#6b8a98' }}>
                  {eduLevel === 'college' ? '专科' : '本科'} · {major}
                </span>
              </div>
              {/* Progress bar */}
              <div style={{ height: 6, borderRadius: 3, background: '#eef4f3', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg,#1d6f78,#35818a)', borderRadius: 3, transition: 'width 0.3s' }} />
              </div>
              {/* Question dots */}
              <div style={{ display: 'flex', gap: 4, marginTop: 10, flexWrap: 'wrap' }}>
                {questions.map((qt, i) => {
                  const done = (answers[qt.question_id]?.length ?? 0) > 0
                  return (
                    <div key={i} onClick={() => setCurrent(i)} style={{
                      width: 22, height: 22, borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 600,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: i === current ? '#183b4b' : done ? '#1d6f78' : '#eef4f3',
                      color: i === current || done ? '#fff' : '#9ba8b0',
                    }}>
                      {i + 1}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Question body */}
            {loading ? (
              <div style={{ padding: '80px', textAlign: 'center', color: '#6b8a98', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: '#1d6f78' }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                <span>正在生成个性化题目…</span>
              </div>
            ) : q ? (
              <div style={{ padding: '32px' }}>
                {/* Type badge */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'rgba(29,111,120,0.1)', color: '#1d6f78', fontWeight: 600 }}>
                    {q.question_type}
                  </span>
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'rgba(31,71,92,0.06)', color: '#6b8a98' }}>
                    {q.difficulty}
                  </span>
                  {isMulti && (
                    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'rgba(220,120,40,0.1)', color: '#d97706', fontWeight: 600 }}>
                      可多选
                    </span>
                  )}
                </div>

                {/* Stem */}
                <p style={{ fontSize: 16, fontWeight: 600, color: '#183b4b', lineHeight: 1.7, margin: '0 0 24px' }}>
                  {q.stem}
                </p>

                {/* Options */}
                {q.question_type === '判断题' ? (
                  <div style={{ display: 'flex', gap: 12 }}>
                    {[
                      { key: 'A', label: '✓ 正确', selColor: '#16a34a', selBg: 'rgba(22,163,74,0.09)', selBorder: '#16a34a' },
                      { key: 'B', label: '✗ 错误', selColor: '#dc2626', selBg: 'rgba(220,38,38,0.08)', selBorder: '#dc2626' },
                    ].map(({ key, label, selColor, selBg, selBorder }) => {
                      const sel = selected.includes(key)
                      return (
                        <div key={key} onClick={() => toggleAnswer(q.question_id, key, false)} style={{
                          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          padding: '20px 16px', borderRadius: 12, cursor: 'pointer',
                          border: `2px solid ${sel ? selBorder : '#dde3e8'}`,
                          background: sel ? selBg : '#fff',
                          color: sel ? selColor : '#9ba8b0',
                          fontSize: 17, fontWeight: 700, letterSpacing: '0.02em',
                          transition: 'all 0.15s',
                          boxShadow: sel ? `0 0 0 3px ${selColor}22` : 'none',
                        }}>
                          {label}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(q.options ?? []).map(({ key, text }) => {
                      const sel = selected.includes(key)
                      return (
                        <div key={key} onClick={() => toggleAnswer(q.question_id, key, isMulti)} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 10, cursor: 'pointer',
                          border: `2px solid ${sel ? '#1d6f78' : '#dde3e8'}`,
                          background: sel ? 'rgba(29,111,120,0.06)' : '#fff',
                          transition: 'all 0.15s',
                        }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: isMulti ? 4 : '50%', border: `2px solid ${sel ? '#1d6f78' : '#bfcbd9'}`,
                            background: sel ? '#1d6f78' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, transition: 'all 0.15s',
                          }}>
                            {sel && <span style={{ color: '#fff', fontSize: 11, fontWeight: 800 }}>{key}</span>}
                            {!sel && <span style={{ color: '#bfcbd9', fontSize: 11 }}>{key}</span>}
                          </div>
                          <span style={{ fontSize: 14, color: '#183b4b', lineHeight: 1.6, paddingTop: 1 }}>{text}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : null}

            {/* Navigation footer */}
            <div style={{ padding: '16px 32px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={() => setCurrent(c => Math.max(0, c - 1))} disabled={current === 0} style={{
                padding: '10px 20px', borderRadius: 8, border: '1px solid #dde3e8', background: '#fff',
                color: current === 0 ? '#bfcbd9' : '#46606f', cursor: current === 0 ? 'not-allowed' : 'pointer',
                fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <ChevronLeft size={15} />上一题
              </button>

              {current < questions.length - 1 ? (
                <button onClick={() => setCurrent(c => c + 1)} disabled={!answered} style={{
                  padding: '10px 24px', borderRadius: 8, border: 'none',
                  background: answered ? '#1d6f78' : '#dde3e8',
                  color: answered ? '#fff' : '#9ba8b0',
                  cursor: answered ? 'pointer' : 'not-allowed',
                  fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  下一题 <ChevronRight size={15} />
                </button>
              ) : (
                <button onClick={submitAnswers} disabled={!allAnswered || submitting} style={{
                  padding: '10px 28px', borderRadius: 8, border: 'none',
                  background: allAnswered && !submitting ? '#183b4b' : '#dde3e8',
                  color: allAnswered && !submitting ? '#fff' : '#9ba8b0',
                  cursor: allAnswered && !submitting ? 'pointer' : 'not-allowed',
                  fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  {submitting ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={15} />}
                  {submitting ? '提交中…' : '提交答卷'}
                </button>
              )}
            </div>

            {!allAnswered && current === questions.length - 1 && (
              <p style={{ textAlign: 'center', fontSize: 12, color: '#d97706', paddingBottom: 16, margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <AlertCircle size={13} />还有 {questions.filter(qt => !(answers[qt.question_id]?.length)).length} 道题未作答
              </p>
            )}
          </div>
        )}

        {/* ── Step 3: 结果 + 学习方案 ──────────────────────────────────── */}
        {step === 3 && score !== null && (
          <div style={{ padding: '40px 48px' }}>
            {/* Score row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 28, marginBottom: 36, padding: '24px', borderRadius: 12, background: 'rgba(29,111,120,0.04)', border: '1px solid rgba(29,111,120,0.12)' }}>
              <div style={{ flexShrink: 0, width: 96, height: 96, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${scoreColor(score)}18`, border: `4px solid ${scoreColor(score)}` }}>
                <span style={{ fontSize: 30, fontWeight: 900, color: scoreColor(score) }}>{score}</span>
              </div>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#183b4b', margin: '0 0 6px' }}>
                  {score >= 80 ? '🎉 基础扎实，进阶学习！' : score >= 60 ? '👍 基础良好，重点强化！' : '📚 从零出发，系统学习！'}
                </h2>
                <p style={{ color: '#6b8a98', fontSize: 14, margin: '0 0 8px' }}>
                  答对 <strong style={{ color: '#183b4b' }}>{Math.round(score / 5)}</strong> / 20 题 &nbsp;·&nbsp; 答错 <strong style={{ color: '#dc2626' }}>{wrongCount}</strong> 题 &nbsp;·&nbsp; {score < 60 ? '建议全面系统学习' : '已生成强化学习方案'}
                </p>
                <p style={{ fontSize: 12, color: '#9ba8b0', margin: 0 }}>
                  详细方案已保存 · 可在「个性化学习」页面随时查看
                </p>
              </div>
            </div>

            {/* 学习方案预览 */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <p style={{ fontWeight: 700, fontSize: 15, color: '#183b4b', margin: 0 }}>个性化学习方案（优先级预览）</p>
                <span style={{ fontSize: 12, color: '#6b8a98' }}>共 {plan.length} 个项目</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                {plan
                  .sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]))
                  .map((item, i) => {
                    const C = {
                      high:   { bg: '#fef2f2', border: '#fca5a5', badge: '#dc2626', label: '重点强化' },
                      medium: { bg: '#fffbeb', border: '#fcd34d', badge: '#d97706', label: '建议复习' },
                      low:    { bg: '#f0fdf4', border: '#86efac', badge: '#16a34a', label: '已掌握'   },
                    }[item.priority]
                    return (
                      <div key={i} style={{ padding: '12px 16px', borderRadius: 8, background: C.bg, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontWeight: 600, fontSize: 13, color: '#183b4b', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.project_name}</p>
                          <p style={{ fontSize: 11, color: '#6b8a98', margin: 0, lineHeight: 1.5 }}>{item.reason}</p>
                        </div>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: C.badge, color: '#fff', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>{C.label}</span>
                      </div>
                    )
                  })}
              </div>
            </div>

            {/* 操作按钮 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={async () => {
                  const t = localStorage.getItem('token')
                  const res = await fetch('/api/onboarding/download-plan', { headers: { Authorization: `Bearer ${t}` } })
                  if (res.ok) {
                    const blob = await res.blob()
                    const url  = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = 'GMP学习方案.docx'
                    a.click()
                    URL.revokeObjectURL(url)
                  }
                }}
                style={{
                  width: '100%', padding: '13px', borderRadius: 10, border: '2px solid #1d6f78',
                  background: 'rgba(29,111,120,0.06)', color: '#1d6f78', fontWeight: 700, fontSize: 15, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <Download size={17} />下载完整学习方案（Word）
              </button>
              <button onClick={handleFinish} style={{
                width: '100%', padding: '13px', borderRadius: 10, border: 'none',
                background: '#1d6f78', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <BookOpen size={17} />进入学习 <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
