'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ClipboardList,
  FolderKanban,
  Gauge,
  ListChecks,
  LoaderCircle,
  Shuffle,
} from 'lucide-react'

interface Option {
  key: string
  text: string
}

interface Question {
  questionId: string
  kpId?: string | null
  knowledgeTitle?: string | null
  projectName?: string | null
  taskName?: string | null
  questionType: string
  stem: string
  difficulty: string
  options: Option[]
  explanation?: string | null
}

interface KnowledgeItem {
  kpId: string
  title: string
  projectName?: string | null
  taskName?: string | null
}

interface PracticeMeta {
  questionTypes: string[]
  difficulties: string[]
  projects: string[]
  knowledgeItems: KnowledgeItem[]
}

interface SubmitResult {
  correct: boolean
  pendingReview?: boolean
  aiGraded?: boolean
  aiGrade?: {
    score: number
    passed: boolean
    comment: string
    strengths: string[]
    issues: string[]
    suggestion: string
  } | null
  correctAnswer: string
  explanation?: string | null
  xpGained: number
  newXp: number
  leveledUp: boolean
  newRankTitle?: string
  knowledgePoint?: {
    kpId: string
    title: string
    projectName?: string | null
    taskName?: string | null
    pointType?: string | null
  } | null
  masteryConfidence?: number | null
  weakPointUpdated?: boolean
}

type PracticeMode = 'random' | 'type' | 'difficulty' | 'project' | 'knowledge'

const QUESTION_TYPE_ORDER = ['单选题', '多选题', '判断题', '简答题', '案例分析题']

const DIFFICULTY_STYLE: Record<string, React.CSSProperties> = {
  易: { background: 'rgba(47,126,88,0.10)', color: '#2f7e58' },
  中: { background: 'rgba(200,129,43,0.10)', color: '#c8812b' },
  难: { background: 'rgba(188,91,87,0.10)', color: '#bc5b57' },
}

const PANEL: React.CSSProperties = {
  background: 'rgba(255,255,255,0.88)',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'rgba(31,71,92,0.12)',
  borderRadius: 8,
  boxShadow: '0 14px 34px rgba(29,53,74,0.08)',
  backdropFilter: 'blur(18px)',
}

function stripHtml(text: string) {
  return text.replace(/<[^>]+>/g, '').trim()
}

function isSubjective(type: string) {
  return type.includes('简答') || type.includes('案例')
}

function sortQuestionTypes(types: string[]) {
  return [
    ...QUESTION_TYPE_ORDER.filter(type => types.includes(type)),
    ...types.filter(type => !QUESTION_TYPE_ORDER.includes(type)),
  ]
}

export default function PracticePage() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [meta, setMeta] = useState<PracticeMeta>({ questionTypes: [], difficulties: [], projects: [], knowledgeItems: [] })
  const [mode, setMode] = useState<PracticeMode>('random')
  const [questionType, setQuestionType] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [project, setProject] = useState('')
  const [kpId, setKpId] = useState('')
  const [question, setQuestion] = useState<Question | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string[]>([])
  const [textAnswer, setTextAnswer] = useState('')
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sessionXp, setSessionXp] = useState(0)
  const [sessionCorrect, setSessionCorrect] = useState(0)
  const [sessionTotal, setSessionTotal] = useState(0)
  const [wrongRecords, setWrongRecords] = useState<Question[]>([])
  const [weakPoints, setWeakPoints] = useState<string[]>([])

  const buildQuestionUrl = useCallback(() => {
    const params = new URLSearchParams()
    if (mode === 'type' && questionType) params.set('type', questionType)
    if (mode === 'difficulty' && difficulty) params.set('difficulty', difficulty)
    if (mode === 'project' && project) params.set('project', project)
    if (mode === 'knowledge' && kpId) params.set('kpId', kpId)
    const query = params.toString()
    return `/api/practice/question${query ? `?${query}` : ''}`
  }, [difficulty, kpId, mode, project, questionType])

  const fetchQuestion = useCallback(async (currentToken: string) => {
    setLoading(true)
    setSelected([])
    setTextAnswer('')
    setResult(null)

    const res = await fetch(buildQuestionUrl(), { headers: { Authorization: `Bearer ${currentToken}` } })
    const data = await res.json()

    if (data.stem) {
      data.stem = stripHtml(data.stem)
      data.options = (data.options ?? []).map((option: Option) => ({ ...option, text: stripHtml(option.text) }))
      setQuestion(data)
    } else {
      setQuestion(null)
    }

    setLoading(false)
  }, [buildQuestionUrl])

  useEffect(() => {
    const currentToken = localStorage.getItem('token')
    if (!currentToken) {
      router.push('/login')
      return
    }

    setToken(currentToken)
    fetch('/api/practice/question?meta=1', { headers: { Authorization: `Bearer ${currentToken}` } })
      .then(response => response.json())
      .then((data: PracticeMeta) => {
        setMeta(data)
        setQuestionType(data.questionTypes[0] ?? '')
        setDifficulty(data.difficulties.includes('易') ? '易' : data.difficulties[0] ?? '')
        setProject(data.projects[0] ?? '')
        setKpId(data.knowledgeItems[0]?.kpId ?? '')
      })
      .catch(() => {})
  }, [router])

  useEffect(() => {
    if (token) fetchQuestion(token)
  }, [mode, questionType, difficulty, project, kpId, token, fetchQuestion])

  const visibleQuestionTypes = useMemo(() => sortQuestionTypes(meta.questionTypes), [meta.questionTypes])
  const selectedKnowledge = meta.knowledgeItems.find(item => item.kpId === kpId)
  const accuracy = sessionTotal ? `${Math.round((sessionCorrect / sessionTotal) * 100)}%` : '-'

  const answerValue = question && isSubjective(question.questionType)
    ? textAnswer.trim()
    : question?.questionType === '多选题'
      ? [...selected].sort().join('')
      : selected[0]

  const canSubmit = Boolean(question && !result && !submitting && answerValue)

  function handleSelect(key: string) {
    if (result || !question) return

    if (question.questionType === '多选题') {
      setSelected(previous => previous.includes(key) ? previous.filter(item => item !== key) : [...previous, key])
      return
    }

    setSelected([key])
  }

  async function handleSubmit() {
    if (!question || result || submitting || !answerValue) return

    setSubmitting(true)
    let data: SubmitResult

    try {
      const res = await fetch('/api/practice/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ questionId: question.questionId, answer: answerValue }),
      })
      data = await res.json()
    } finally {
      setSubmitting(false)
    }

    setResult(data)

    if (data.pendingReview) {
      return
    }

    setSessionTotal(total => total + 1)
    if (data.correct) {
      setSessionCorrect(correct => correct + 1)
      setSessionXp(xp => xp + data.xpGained)
    } else {
      setWrongRecords(previous => [question, ...previous.filter(item => item.questionId !== question.questionId)].slice(0, 6))
    }

    if (data.weakPointUpdated && data.knowledgePoint?.title) {
      setWeakPoints(previous => [data.knowledgePoint!.title, ...previous.filter(title => title !== data.knowledgePoint!.title)].slice(0, 6))
    }
  }

  function getCorrectOptionTexts() {
    if (!question || !result) return []
    return question.options
      .filter(option => result.correctAnswer.toUpperCase().includes(option.key))
      .map(option => `${option.key}. ${option.text}`)
  }

  function optionStyle(key: string): React.CSSProperties {
    const base: React.CSSProperties = {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '13px 15px',
      borderRadius: 8,
      borderWidth: 1.5,
      borderStyle: 'solid',
      borderColor: 'rgba(31,71,92,0.12)',
      cursor: 'pointer',
      transition: 'all 0.15s',
      background: 'rgba(255,255,255,0.7)',
    }

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

  function renderResult() {
    if (!question || !result) return null

    const resultColor = result.pendingReview ? '#c8812b' : result.correct ? '#2f7e58' : '#bc5b57'
    const resultBg = result.pendingReview ? 'rgba(200,129,43,0.06)' : result.correct ? 'rgba(47,126,88,0.06)' : 'rgba(188,91,87,0.05)'

    return (
      <div style={{ ...PANEL, padding: '18px 22px', borderColor: `${resultColor}33`, background: resultBg }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          {result.correct ? <CheckCircle2 size={18} color="#2f7e58" /> : <AlertTriangle size={18} color={resultColor} />}
          <strong style={{ color: resultColor, fontSize: 15 }}>
            {result.pendingReview ? 'AI 暂不可用，已记录为待教师批改' : result.aiGraded ? `AI 已批改：${result.aiGrade?.score ?? 0} 分` : result.correct ? '回答正确' : '回答错误，已加入错题记录'}
          </strong>
          {!result.pendingReview && <span style={{ marginLeft: 'auto', color: '#2f7e58', fontSize: 13, fontWeight: 700 }}>+{result.xpGained} XP</span>}
        </div>

        {result.aiGraded && result.aiGrade && (
          <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
            <p style={TEXT_LINE}>{result.aiGrade.comment}</p>
            {result.aiGrade.strengths.length > 0 && <p style={{ ...TEXT_LINE, color: '#2f7e58' }}>优点：{result.aiGrade.strengths.join('；')}</p>}
            {result.aiGrade.issues.length > 0 && <p style={{ ...TEXT_LINE, color: '#bc5b57' }}>问题：{result.aiGrade.issues.join('；')}</p>}
            {result.aiGrade.suggestion && <p style={{ ...TEXT_LINE, color: '#1d6f78' }}>建议：{result.aiGrade.suggestion}</p>}
          </div>
        )}

        {!isSubjective(question.questionType) && getCorrectOptionTexts().length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <p style={MINI_LABEL}>正确答案</p>
            {getCorrectOptionTexts().map(text => (
              <p key={text} style={ANSWER_LINE}>{text}</p>
            ))}
          </div>
        )}

        {isSubjective(question.questionType) && (
          <div style={{ marginBottom: 10 }}>
            <p style={MINI_LABEL}>参考答案</p>
            <p style={TEXT_LINE}>{result.correctAnswer}</p>
          </div>
        )}

        {result.explanation && (
          <div>
            <p style={MINI_LABEL}>答案解析</p>
            <p style={{ ...TEXT_LINE, color: '#46606f' }}>{stripHtml(result.explanation)}</p>
          </div>
        )}

        {result.masteryConfidence !== null && result.masteryConfidence !== undefined && (
          <p style={{ color: '#1d6f78', fontSize: 12, margin: '10px 0 0' }}>
            薄弱点更新：{result.knowledgePoint?.title || '当前知识点'} 掌握度 {result.masteryConfidence}%
          </p>
        )}

        {result.leveledUp && (
          <p style={{ color: '#1d6f78', fontWeight: 700, margin: '8px 0 0', fontSize: 14 }}>
            等级提升：{result.newRankTitle}
          </p>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: 20, minHeight: '100vh' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
        <div>
          <p style={{ color: '#1d6f78', fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', margin: 0 }}>学习中心</p>
          <h1 style={{ color: '#183b4b', fontSize: 26, fontWeight: 700, margin: '4px 0 0', fontFamily: "'Trebuchet MS','Microsoft YaHei',sans-serif" }}>自我练习</h1>
          <p style={{ color: '#6b8a98', fontSize: 13, lineHeight: 1.7, margin: '6px 0 0' }}>
            支持随机、按题型、按难度、按项目和按知识点练习；提交后记录错题、显示答案解析，并更新薄弱点。
          </p>
        </div>
        <div style={{ ...PANEL, padding: '10px 18px', display: 'flex', gap: 18, flexShrink: 0 }}>
          {[
            { label: '本次 XP', value: `+${sessionXp}` },
            { label: '正确率', value: accuracy },
            { label: '已练题', value: String(sessionTotal) },
          ].map(item => (
            <div key={item.label} style={{ textAlign: 'center' }}>
              <p style={{ color: '#183b4b', fontSize: 18, fontWeight: 700, margin: 0, fontFamily: "'Trebuchet MS','Microsoft YaHei',sans-serif" }}>{item.value}</p>
              <p style={{ color: '#6b8a98', fontSize: 11, margin: '2px 0 0' }}>{item.label}</p>
            </div>
          ))}
        </div>
      </header>

      <section style={{ ...PANEL, padding: 16, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#183b4b', fontSize: 15, fontWeight: 800 }}>
            <ListChecks size={16} />
            选择练习
          </div>
          <span style={{ color: '#6b8a98', fontSize: 12 }}>题型与专项条件可随时切换</span>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <span style={CONTROL_LABEL}>题型选择</span>
            <div style={TYPE_ROW}>
              <button onClick={() => setMode('random')} style={{ ...TOP_TYPE_BTN, ...(mode === 'random' ? ACTIVE_TOP_TYPE_BTN : {}) }}>
                <Shuffle size={15} />
                随机
              </button>
              {visibleQuestionTypes.map(type => {
                const active = mode === 'type' && questionType === type
                return (
                  <button key={type} onClick={() => { setMode('type'); setQuestionType(type) }} style={{ ...TOP_TYPE_BTN, ...(active ? ACTIVE_TOP_TYPE_BTN : {}) }}>
                    {type}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <span style={CONTROL_LABEL}>专项练习</span>
            <div style={SPECIAL_GRID}>
              <div onClick={() => setMode('difficulty')} style={{ ...SPECIAL_CARD, ...(mode === 'difficulty' ? ACTIVE_SPECIAL_CARD : {}) }}>
                <span style={SPECIAL_TITLE}><Gauge size={16} />难度练习</span>
                <span style={SPECIAL_DESC}>按易、中、难快速抽题</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, marginTop: 10 }}>
                  {['易', '中', '难'].filter(item => meta.difficulties.includes(item)).map(item => (
                    <span key={item} onClick={event => { event.stopPropagation(); setMode('difficulty'); setDifficulty(item) }} style={{ ...CHIP_BTN, ...(difficulty === item && mode === 'difficulty' ? ACTIVE_CHIP : {}) }}>
                      {item}
                    </span>
                  ))}
                  {meta.difficulties.length === 0 && <span style={EMPTY_OPTION}>暂无难度</span>}
                </div>
              </div>

              <div onClick={() => setMode('project')} style={{ ...SPECIAL_CARD, ...(mode === 'project' ? ACTIVE_SPECIAL_CARD : {}) }}>
                <span style={SPECIAL_TITLE}><FolderKanban size={16} />项目练习</span>
                <span style={SPECIAL_DESC}>围绕实训项目集中练习</span>
                <select value={project} onClick={event => event.stopPropagation()} onFocus={() => setMode('project')} onChange={event => { setMode('project'); setProject(event.target.value) }} style={{ ...SELECT_STYLE, marginTop: 10 }}>
                  {meta.projects.length === 0 ? <option value="">暂无可练项目</option> : meta.projects.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>

              <div onClick={() => setMode('knowledge')} style={{ ...SPECIAL_CARD, ...(mode === 'knowledge' ? ACTIVE_SPECIAL_CARD : {}) }}>
                <span style={SPECIAL_TITLE}><Brain size={16} />知识点练习</span>
                <span style={SPECIAL_DESC}>针对薄弱知识点定点强化</span>
                <select value={kpId} onClick={event => event.stopPropagation()} onFocus={() => setMode('knowledge')} onChange={event => { setMode('knowledge'); setKpId(event.target.value) }} style={{ ...SELECT_STYLE, marginTop: 10 }}>
                  {meta.knowledgeItems.length === 0 ? <option value="">暂无可练知识点</option> : meta.knowledgeItems.map(item => <option key={item.kpId} value={item.kpId}>{item.title}</option>)}
                </select>
                {selectedKnowledge && (
                  <span style={{ color: '#8aa0aa', fontSize: 12, marginTop: 7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedKnowledge.projectName || '未标注项目'}{selectedKnowledge.taskName ? ` / ${selectedKnowledge.taskName}` : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 14, alignItems: 'start' }}>
        <main style={{ minWidth: 0 }}>
          {loading && (
            <div style={{ ...PANEL, padding: 32 }}>
              {[72, 48, 36].map((width, index) => (
                <div key={index} style={{ height: index === 0 ? 18 : 12, background: 'rgba(29,111,120,0.08)', borderRadius: 8, marginBottom: 16, width: `${width}%` }} />
              ))}
            </div>
          )}

          {!loading && !question && (
            <div style={{ ...PANEL, padding: 28, color: '#6b8a98', textAlign: 'center' }}>
              当前条件下暂无题目，请切换练习模式或筛选条件。
            </div>
          )}

          {!loading && question && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={TAG_STYLE}>{question.questionType}</span>
                <span style={{ ...TAG_STYLE, ...(DIFFICULTY_STYLE[question.difficulty] ?? {}) }}>{question.difficulty}</span>
                {question.projectName && <span style={TAG_STYLE}>{question.projectName}</span>}
                {question.knowledgeTitle && <span style={TAG_STYLE}>{question.knowledgeTitle}</span>}
                {question.questionType === '多选题' && <span style={{ ...TAG_STYLE, background: 'rgba(200,129,43,0.10)', color: '#c8812b' }}>可多选</span>}
              </div>

              <div style={{ ...PANEL, padding: '22px 26px' }}>
                <p style={{ color: '#183b4b', fontSize: 15, lineHeight: 1.9, margin: 0 }}>{question.stem}</p>
              </div>

              {isSubjective(question.questionType) ? (
                <textarea
                  value={textAnswer}
                  onChange={event => setTextAnswer(event.target.value)}
                  disabled={Boolean(result) || submitting}
                  placeholder="输入你的作答要点，提交后查看参考答案与解析"
                  style={{ minHeight: 132, borderRadius: 8, border: '1px solid rgba(31,71,92,0.14)', padding: 14, outline: 'none', color: '#183b4b', lineHeight: 1.7, resize: 'vertical', background: 'rgba(255,255,255,0.82)' }}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {question.options.map(option => (
                    <div key={option.key} style={optionStyle(option.key)} onClick={() => handleSelect(option.key)}>
                      <span style={{ fontWeight: 700, color: '#1d6f78', minWidth: 22, fontSize: 13, marginTop: 1 }}>{option.key}</span>
                      <span style={{ color: '#183b4b', fontSize: 14, lineHeight: 1.7 }}>{option.text}</span>
                    </div>
                  ))}
                </div>
              )}

              {renderResult()}

              {!result ? (
                <button onClick={handleSubmit} disabled={!canSubmit} style={{ padding: 13, borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed', background: canSubmit ? 'linear-gradient(135deg,#1d6f78,#35818a)' : 'rgba(31,71,92,0.08)', color: canSubmit ? '#fff' : '#6b8a98', transition: 'background 0.2s' }}>
                  {submitting && question && isSubjective(question.questionType) ? 'AI 批改中...' : submitting ? '提交中...' : '提交答案'}
                </button>
              ) : (
                <button onClick={() => fetchQuestion(token)} style={{ padding: 13, borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', background: 'linear-gradient(135deg,#1d6f78,#35818a)', color: '#fff' }}>
                  下一题
                </button>
              )}
            </div>
          )}
        </main>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ ...PANEL, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#183b4b', fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
              <AlertTriangle size={15} />
              本次错题
            </div>
            {wrongRecords.length === 0 ? (
              <p style={EMPTY_TEXT}>本次暂无错题。</p>
            ) : wrongRecords.map(item => (
              <button key={item.questionId} onClick={() => { setQuestion(item); setSelected([]); setTextAnswer(''); setResult(null) }} style={SIDE_ITEM}>
                <strong>{item.questionType} · {item.difficulty}</strong>
                <span>{item.stem}</span>
              </button>
            ))}
          </div>

          <div style={{ ...PANEL, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#183b4b', fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
              <ClipboardList size={15} />
              薄弱点提示
            </div>
            {weakPoints.length === 0 ? (
              <p style={EMPTY_TEXT}>错题或低掌握度知识点会显示在这里。</p>
            ) : weakPoints.map(item => (
              <div key={item} style={{ ...SIDE_ITEM, cursor: 'default' }}>
                <strong>{item}</strong>
                <span>建议切换到知识点练习继续强化。</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}

const SELECT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '9px 10px',
  borderRadius: 8,
  border: '1px solid rgba(31,71,92,0.16)',
  background: '#fff',
  color: '#183b4b',
  fontSize: 13,
  outline: 'none',
}

const CHIP_BTN: React.CSSProperties = {
  flex: 1,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'rgba(31,71,92,0.14)',
  borderRadius: 8,
  padding: '8px 0',
  background: '#fff',
  color: '#46606f',
  cursor: 'pointer',
  textAlign: 'center',
  fontSize: 13,
}

const ACTIVE_CHIP: React.CSSProperties = {
  borderColor: 'rgba(29,111,120,0.38)',
  background: 'rgba(29,111,120,0.08)',
  color: '#1d6f78',
  fontWeight: 700,
}

const TOP_TYPE_BTN: React.CSSProperties = {
  height: 42,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'rgba(31,71,92,0.14)',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.72)',
  color: '#46606f',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  fontSize: 13,
  fontWeight: 700,
}

const ACTIVE_TOP_TYPE_BTN: React.CSSProperties = {
  borderColor: 'rgba(29,111,120,0.4)',
  background: 'rgba(29,111,120,0.1)',
  color: '#1d6f78',
  boxShadow: 'inset 0 0 0 1px rgba(29,111,120,0.08)',
}

const TYPE_ROW: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(86px, 1fr))',
  gap: 8,
  alignItems: 'center',
}

const SPECIAL_GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 10,
}

const SPECIAL_CARD: React.CSSProperties = {
  minWidth: 0,
  display: 'grid',
  alignContent: 'start',
  textAlign: 'left',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'rgba(31,71,92,0.12)',
  borderRadius: 8,
  padding: 13,
  background: 'rgba(255,255,255,0.68)',
  cursor: 'pointer',
}

const ACTIVE_SPECIAL_CARD: React.CSSProperties = {
  borderColor: 'rgba(29,111,120,0.38)',
  background: 'rgba(29,111,120,0.07)',
  boxShadow: 'inset 0 0 0 1px rgba(29,111,120,0.08)',
}

const SPECIAL_TITLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  color: '#183b4b',
  fontSize: 14,
  fontWeight: 800,
}

const SPECIAL_DESC: React.CSSProperties = {
  marginTop: 5,
  color: '#6b8a98',
  fontSize: 12,
}

const EMPTY_OPTION: React.CSSProperties = {
  gridColumn: '1 / -1',
  color: '#8aa0aa',
  fontSize: 12,
  padding: '8px 0',
}

const CONTROL_LABEL: React.CSSProperties = {
  color: '#46606f',
  fontSize: 12,
  fontWeight: 800,
}

const TAG_STYLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: '3px 10px',
  borderRadius: 999,
  background: 'rgba(29,111,120,0.10)',
  color: '#1d6f78',
}

const MINI_LABEL: React.CSSProperties = {
  color: '#6b8a98',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  margin: '0 0 6px',
}

const TEXT_LINE: React.CSSProperties = {
  color: '#183b4b',
  fontSize: 13,
  lineHeight: 1.75,
  margin: 0,
}

const ANSWER_LINE: React.CSSProperties = {
  color: '#183b4b',
  fontSize: 13,
  fontWeight: 600,
  background: 'rgba(255,255,255,0.72)',
  borderRadius: 8,
  padding: '8px 12px',
  margin: '4px 0 0',
  border: '1px solid rgba(47,126,88,0.15)',
}

const EMPTY_TEXT: React.CSSProperties = {
  color: '#6b8a98',
  fontSize: 12,
  lineHeight: 1.7,
  margin: 0,
}

const SIDE_ITEM: React.CSSProperties = {
  width: '100%',
  display: 'grid',
  gap: 5,
  textAlign: 'left',
  padding: '9px 10px',
  borderRadius: 8,
  border: '1px solid rgba(31,71,92,0.12)',
  background: 'rgba(255,255,255,0.7)',
  cursor: 'pointer',
  color: '#183b4b',
  marginBottom: 7,
  fontSize: 12,
}
