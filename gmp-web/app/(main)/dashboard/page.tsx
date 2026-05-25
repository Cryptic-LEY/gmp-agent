'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, List, Network, Wrench, Award, CheckCircle, Play, ArrowRight, X, ClipboardList, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react'
import dynamic from 'next/dynamic'

const GraphPanel = dynamic(() => import('./GraphPanel'), { ssr: false })

interface GameState { xp: number; points: number; rankLevel: number; rankTitle: string; rankProgress: number; xpToNext: number; streakDays: number; maxStreak: number }

type StudyStep = 'profile' | 'quiz' | 'route'
interface DiagnosticQuestion { id: string; stem: string; options: string[]; answer: number; dimension: string }
interface StudyRouteItem { tag: string; title: string; detail: string; tab?: string }

// ── Static data ──────────────────────────────────────────────────────────────

const CHAPTERS = [
  { code: 'ch01', tag: '第一章',   title: '总则',           desc: 'GMP的基本宗旨、适用范围及质量管理体系的总体要求与目标。', focus: '质量管理总原则', hours: 2 },
  { code: 'ch02', tag: '第二章',   title: '质量管理',       desc: '质量管理系统的建立，质量保证与质量控制的基本要求及职责分工。', focus: '质量体系建设', hours: 3 },
  { code: 'ch03', tag: '第三章',   title: '机构与人员',     desc: '企业组织架构设置、关键岗位人员职责及培训资质管理要求。', focus: '关键岗位职责', hours: 3 },
  { code: 'ch04', tag: '第四章',   title: '厂房与设施',     desc: '生产厂房的设计、建造及维护要求，洁净区环境与空调系统管理。', focus: '洁净区管理', hours: 3 },
  { code: 'ch05', tag: '第五章',   title: '设备',           desc: '生产设备的设计、安装、确认及日常维护保养的规范要求。', focus: '设备确认验证', hours: 3 },
  { code: 'ch06', tag: '第六章',   title: '物料与产品',     desc: '原辅料、包装材料、中间产品及成品的采购、验收、储存和发放管理。', focus: '物料追溯体系', hours: 4 },
  { code: 'ch07', tag: '第七章',   title: '确认与验证',     desc: '设备确认、工艺验证、清洁验证及分析方法验证的总体要求。', focus: '验证策略制定', hours: 4 },
  { code: 'ch08', tag: '第八章',   title: '文件管理',       desc: 'GMP文件体系建立，SOP、批生产记录及质量文件的管理要求。', focus: '文件控制系统', hours: 3 },
  { code: 'ch09', tag: '第九章',   title: '生产管理',       desc: '生产操作一般原则、防止污染与交叉污染的措施及关键工序控制。', focus: '生产操作规范', hours: 5 },
  { code: 'ch10', tag: '第十章',   title: '质量控制与保证', desc: 'QC实验室管理、持续稳定性考察、产品质量回顾与投诉处理。', focus: 'QC/QA职能分工', hours: 6 },
  { code: 'ch11', tag: '第十一章', title: '委托生产与检验', desc: '委托协议建立、委托方与受托方的职责划分及技术转移要求。', focus: '委托管理要求', hours: 2 },
  { code: 'ch12', tag: '第十二章', title: '产品发运与召回', desc: '产品发运记录要求、召回程序建立与有效性评估管理规定。', focus: '召回程序建立', hours: 2 },
  { code: 'ch13', tag: '第十三章', title: '自检',           desc: '内部GMP审计的组织方式、检查频次及CAPA跟踪整改基本要求。', focus: '审计能力培养', hours: 2 },
  { code: 'ch14', tag: '第十四章', title: '附则',           desc: '本规范的解释权归属及施行日期等附加条款与过渡说明。', focus: '法规理解', hours: 1 },
]

const OVERVIEW_CARDS = [
  { tag: '法规解读', title: 'GMP 全文精讲',   icon: BookOpen, desc: '2010年修订版GMP全文逐条解读，覆盖313条核心条款与适用场景，帮助学员建立完整的法规理解框架。' },
  { tag: '能力培养', title: '24项核心能力',   icon: Award,    desc: '通过能力点地图识别学习重点，涵盖质量管理体系建设、偏差处理、文件管理等24项关键岗位核心能力。' },
  { tag: '实战训练', title: '543道练习题库', icon: Wrench,   desc: '分章节、分难度题库练习，配合AI答疑实时解析，通过反复练习快速夯实合规知识基础，备战执业药师考试。' },
]

const PRACTICE_MODULES = [
  { index: '01', stage: '第一日·上午', title: '批生产记录异常发现', focus: '文件管理 · 物料追溯' },
  { index: '02', stage: '第一日·下午', title: 'OOS 调查与根因分析', focus: '质量控制 · 偏差管理' },
  { index: '03', stage: '第二日·上午', title: '设备确认数据核查',   focus: '确认验证 · 设备管理' },
  { index: '04', stage: '第二日·下午', title: '监管部门检查应答',   focus: '自检 · 法规合规'    },
  { index: '05', stage: '第三日·全天', title: '批放行最终决策',     focus: 'QA决策 · 产品发运'  },
]

const ASSESSMENTS = [
  { weight: 30, title: '日常练习',   desc: '每日GMP知识点测验，涵盖单选、多选和判断题型，重点考核法规条文的理解与记忆。评分标准：正确率≥80%得满分。', rubrics: ['每日完成率 ≥ 80%', '单次正确率 ≥ 70%', '累计完成题目 ≥ 200道'] },
  { weight: 40, title: '综合实训',   desc: '三日固体制剂质量危机沙盘，考核在仿真环境中处理生产异常、进行OOS调查和批放行决策的综合能力。',                   rubrics: ['完成批记录填写', '正确识别关键偏差', '提交完整调查报告', '通过批放行决策'] },
  { weight: 30, title: '知识图谱达标', desc: '通过交互式知识图谱评估对GMP各章节知识点的掌握深度和知识结构完整性，实现可视化学习诊断。',                    rubrics: ['完成率 ≥ 90%', '核心知识点全部掌握', '能力点评分 ≥ 75分'] },
]

const TABS = [
  { id: 'overview',    label: '课程概述', icon: BookOpen      },
  { id: 'framework',  label: '课程框架', icon: List          },
  { id: 'graph',      label: '课程图谱', icon: Network       },
  { id: 'practice',   label: '课程实训', icon: Wrench        },
  { id: 'assessment', label: '课程考核', icon: Award         },
  { id: 'wrongbook',  label: '错题本',   icon: ClipboardList },
]

interface WrongItem {
  historyId:     number
  questionId:    string
  answeredAt:    string
  isCorrect:     boolean
  reviewed:      boolean
  userAnswer:    string[]
  correctAnswer: string[]
  questionType:  string
  difficulty:    string
  stem:          string
  options:       { key: string; text: string }[]
  explanation:   string | null
  chapter:       string | null
  topic:         string | null
  kpTitle:       string | null
}

interface WrongStats { total: number; pending: number; reviewed: number }
interface WrongbookData { items: WrongItem[]; stats: WrongStats }

const EDUCATION_OPTIONS = ['专科', '本科', '研究生', '中职/高职', '其他']
const MAJOR_OPTIONS = ['药学', '制药工程', '药品生产技术', '生物制药', '化学', '护理/医学', '质量管理', '其他']

const PANEL: React.CSSProperties = {
  background: 'rgba(255,255,255,0.9)',
  border: '1px solid rgba(34,73,84,0.14)',
  borderRadius: 8,
  boxShadow: '0 16px 36px rgba(29,53,74,0.08)',
}

// ── Study dialog helpers ─────────────────────────────────────────────────────

function buildDiagnosticQuestions(education: string, major: string): DiagnosticQuestion[] {
  const isHigher  = /本科|研究生/.test(education)
  const isPharma  = /药|制药|生物|化学|质量/.test(major)
  const questions: DiagnosticQuestion[] = [
    {
      id: 'q1', dimension: '法规原则',
      stem: 'GMP 管理中最能体现"质量风险管理"的做法是？',
      options: ['发现问题后只记录结论', '根据风险等级决定调查深度和控制措施', '把全部偏差都交给同一个岗位处理', '只在年度审计时回顾质量问题'],
      answer: 1,
    },
    {
      id: 'q2', dimension: '数据完整性',
      stem: '批生产记录出现涂改时，最合规的处理方式是？',
      options: ['用修正液覆盖后重写', '保留原记录、单线划改、签名并注明日期和原因', '重新打印一份替换原件', '只要最终数据正确即可'],
      answer: 1,
    },
    {
      id: 'q3', dimension: 'QC/OOS',
      stem: '发生检验结果 OOS 后，第一步更适合做什么？',
      options: ['直接复检直到合格', '立即放行该批产品', '启动实验室初步调查并保护原始数据', '通知生产线继续下一批生产'],
      answer: 2,
    },
    isHigher
      ? { id: 'q4', dimension: '工艺验证', stem: '验证方案中设置关键工艺参数限度，主要依据应来自？', options: ['设备供应商口头建议', '风险评估、历史数据和工艺理解', '同学经验', '为了减少记录工作量'], answer: 1 }
      : { id: 'q4', dimension: '现场规范', stem: '进入洁净区前更衣和手消毒的核心目的是什么？', options: ['节省清洁时间', '降低人员带入污染的风险', '方便主管检查', '减少设备维护'], answer: 1 },
    isPharma
      ? { id: 'q5', dimension: '批放行', stem: 'QA 判断某批产品能否放行时，最应关注的证据组合是？', options: ['产量和交货时间', '批记录、偏差 CAPA、检验结果和变更状态', '操作人员口头说明', '仓库库存数量'], answer: 1 }
      : { id: 'q5', dimension: '跨专业基础', stem: '跨专业学习 GMP 时，最需要先补齐的基础是？', options: ['药品生产流程与质量职责分工', '企业广告文案', '财务报表格式', '办公软件快捷键'], answer: 0 },
  ]
  return questions
}

function buildStudySummary(score: number, education: string, major: string) {
  if (score <= 2) return { level: '基础入门', summary: `${education} / ${major} 背景建议先补齐 GMP 术语、法规原则和现场记录规范，再进入沙盘。` }
  if (score <= 4) return { level: '进阶应用', summary: '你已经具备基本理解，下一步适合把法规条款转成偏差调查、OOS 判断和 CAPA 设计能力。' }
  return { level: '综合提升', summary: '你的基础较稳，可以直接进入质量风险、数据完整性和批放行的综合决策训练。' }
}

function buildStudyRoute(level: string, education: string, major: string): StudyRouteItem[] {
  let hint = '把药学知识落到生产质量体系和证据链判断中'
  if (/药品生产|专科|中职|高职/.test(`${major}${education}`)) hint = '先从岗位动作、现场记录和洁净区纪律入手'
  else if (/制药工程|生物制药|化学/.test(major)) hint = '把工艺参数、验证逻辑和质量风险串起来'
  else if (!/药|制药|生物|化学|质量/.test(major)) hint = '先补药品生产流程、QA/QC 职责和常用法规词汇'

  if (level === '基础入门') return [
    { tag: '第 1 步', title: '课程概述',     detail: `${hint}，明确 GMP 不是背条款，而是用制度保证药品质量。`, tab: 'overview'    },
    { tag: '第 2 步', title: '法规与记录基础', detail: '学习质量风险管理、数据完整性、批记录填写和偏差报告的最低合规要求。', tab: 'framework'   },
    { tag: '第 3 步', title: '知识图谱梳理', detail: '用知识图谱把法规原则、生产控制、QC 检验和 QA 放行连接起来。', tab: 'graph'       },
    { tag: '第 4 步', title: '入门实训',     detail: '进入三日质量危机沙盘，从仓储和生产现场证据收集开始。', tab: 'practice'    },
    { tag: '第 5 步', title: '阶段测验',     detail: '完成基础测验和复盘报告，重点检查记录规范与问题定位。', tab: 'assessment'  },
  ]
  if (level === '进阶应用') return [
    { tag: '第 1 步', title: '课程框架精学', detail: `${hint}，重点看质量体系、生产过程控制、QC/OOS 和偏差 CAPA 四条主线。`, tab: 'framework'  },
    { tag: '第 2 步', title: '能力图谱定位', detail: '围绕风险识别、证据链、根因分析和 CAPA 有效性建立能力结构。', tab: 'graph'       },
    { tag: '第 3 步', title: '专项实训',     detail: '优先训练 QC 初查、生产偏差升级和 QA 批放行前置判断。', tab: 'practice'    },
    { tag: '第 4 步', title: '问题图谱复盘', detail: '把错题和沙盘事件映射到问题图谱，找出薄弱主题。', tab: 'graph'       },
    { tag: '第 5 步', title: '过程考核',     detail: '用过程取证、决策质量和复盘报告形成综合评价。', tab: 'assessment'  },
  ]
  return [
    { tag: '第 1 步', title: '高阶问题图谱', detail: `${hint}，直接从数据完整性、验证偏差、OOS 和批放行冲突切入。`, tab: 'graph'      },
    { tag: '第 2 步', title: '综合实训',     detail: '进入完整三日质量危机沙盘，承担 QA 主导的跨部门协调和放行建议。', tab: 'practice'   },
    { tag: '第 3 步', title: '风险决策复盘', detail: '复盘风险分级、证据完整性、CAPA 可执行性和监管沟通。', tab: 'assessment' },
    { tag: '第 4 步', title: '扩展学习',     detail: '补充变更控制、验证生命周期和年度产品质量回顾。', tab: 'framework'  },
    { tag: '第 5 步', title: '挑战任务',     detail: '尝试以检查员视角审阅全套证据链，提出缺陷分级和整改建议。', tab: 'practice'   },
  ]
}

// ── Component ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const [gs, setGs]                   = useState<GameState | null>(null)
  const [activeTab, setActiveTab]          = useState('overview')
  const [activeChIdx, setActiveChIdx]      = useState(0)
  const [activeGraphType, setActiveGraphType] = useState<'knowledge' | 'ability' | 'mastery'>('knowledge')
  const [token, setToken]                  = useState('')

  // Wrongbook state
  const [wrongData, setWrongData]             = useState<WrongbookData | null>(null)
  const [wrongLoading, setWrongLoading]       = useState(false)
  const [wrongError, setWrongError]           = useState('')
  const [expandedWrong, setExpandedWrong]     = useState<number | null>(null)
  const [wrongFilter, setWrongFilter]         = useState<'all' | 'pending' | 'reviewed'>('all')

  // Study dialog state
  const [showDialog, setShowDialog]           = useState(false)
  const [studyStep, setStudyStep]             = useState<StudyStep>('profile')
  const [studyProfile, setStudyProfile]       = useState({ education: '本科', major: '药学' })
  const [diagnosticQs, setDiagnosticQs]       = useState<DiagnosticQuestion[]>([])
  const [diagnosticAns, setDiagnosticAns]     = useState<Record<string, number>>({})
  const [studyResult, setStudyResult]         = useState({ score: 0, level: '基础入门', summary: '' })
  const [studyRoute, setStudyRoute]           = useState<StudyRouteItem[]>([])

  useEffect(() => {
    const t = localStorage.getItem('token')
    if (!t) { router.push('/login'); return }
    setToken(t)
    fetch('/api/game/state', { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json()).then(setGs).catch(() => {})
  }, [router])

  // 切到错题本时拉取数据
  useEffect(() => {
    if (activeTab !== 'wrongbook' || !token) return
    setWrongLoading(true)
    setWrongError('')
    fetch('/api/practice/history?filter=wrong&limit=200', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then((data: WrongbookData) => setWrongData(data))
      .catch(() => setWrongError('加载失败，请刷新重试'))
      .finally(() => setWrongLoading(false))
  }, [activeTab, token])

  function openStudyDialog() {
    setStudyStep('profile')
    setDiagnosticAns({})
    setShowDialog(true)
  }

  function handleGenerateDiagnostic() {
    setDiagnosticQs(buildDiagnosticQuestions(studyProfile.education, studyProfile.major))
    setDiagnosticAns({})
    setStudyStep('quiz')
  }

  function handleSubmitDiagnostic() {
    const unanswered = diagnosticQs.some(q => typeof diagnosticAns[q.id] !== 'number')
    if (unanswered) { alert('请完成 5 道诊断题'); return }
    const score = diagnosticQs.reduce((t, q) => t + (diagnosticAns[q.id] === q.answer ? 1 : 0), 0)
    const result = buildStudySummary(score, studyProfile.education, studyProfile.major)
    setStudyResult({ score, ...result })
    setStudyRoute(buildStudyRoute(result.level, studyProfile.education, studyProfile.major))
    setStudyStep('route')
  }

  function backStep() {
    setStudyStep(s => s === 'route' ? 'quiz' : 'profile')
  }

  const ch = CHAPTERS[activeChIdx]
  const stepIdx = { profile: 0, quiz: 1, route: 2 }[studyStep]

  return (
    <div style={{
      padding: 16, minHeight: 'calc(100vh - 86px)',
      background: [
        'linear-gradient(90deg, rgba(29,111,120,0.05) 1px, transparent 1px)',
        'linear-gradient(180deg, rgba(29,111,120,0.04) 1px, transparent 1px)',
        'linear-gradient(180deg, #eef4f3 0%, #f7f4ef 100%)',
      ].join(', '),
      backgroundSize: '32px 32px, 32px 32px, auto',
    }}>

      {/* ── Hero ── */}
      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 0.9fr) minmax(0, 1.3fr)', gap: 16, marginBottom: 14 }}>

        {/* Book cover */}
        <div style={{
          position: 'relative', display: 'grid',
          gridTemplateColumns: 'minmax(230px, 0.46fr) minmax(260px, 0.54fr)',
          gap: 22, alignItems: 'stretch', minHeight: 260, padding: 22, overflow: 'hidden',
          borderRadius: 8, border: '1px solid rgba(34,73,84,0.14)', boxShadow: '0 16px 36px rgba(29,53,74,0.08)',
          background: 'radial-gradient(circle at 24% 18%, rgba(87,78,165,0.2), transparent 32%), linear-gradient(135deg, #f5f7f4 0%, #dfe8e5 48%, #cfdcd8 100%)',
        }}>
          <div style={{ position: 'absolute', top: -36, left: -42, width: 280, height: 280, border: '22px solid rgba(75,67,156,0.18)', borderRadius: '50%', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', right: 28, bottom: 20, width: 310, height: 118, opacity: 0.8, pointerEvents: 'none', background: 'linear-gradient(90deg, rgba(29,111,120,0.18) 1px, transparent 1px), linear-gradient(180deg, rgba(29,111,120,0.14) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
          {/* White book panel */}
          <div style={{ position: 'relative', zIndex: 1, borderRadius: 8, display: 'grid', alignContent: 'center', minHeight: 216, padding: 22, overflow: 'hidden', background: 'linear-gradient(90deg, rgba(24,59,75,0.08) 1px, transparent 1px), linear-gradient(180deg, rgba(24,59,75,0.08) 1px, transparent 1px), rgba(255,255,255,0.82)', backgroundSize: '18px 18px, 18px 18px, auto', border: '1px solid rgba(75,67,156,0.2)', boxShadow: 'inset 0 0 0 8px rgba(255,255,255,0.34)' }}>
            <div style={{ position: 'absolute', top: -48, left: '50%', transform: 'translateX(-50%)', width: 220, height: 220, display: 'grid', placeItems: 'center', color: 'rgba(24,59,75,0.14)', border: '16px solid rgba(75,67,156,0.2)', borderRadius: '50%', fontSize: 12, fontWeight: 800, textAlign: 'center', lineHeight: 1.3 }}>MANUFACTURE QUALITY</div>
            <div style={{ position: 'relative', display: 'grid', placeItems: 'center', justifySelf: 'center', width: 'min(100%, 270px)', height: 112, marginBottom: 12, borderTop: '11px solid rgba(75,67,156,0.82)', borderRadius: '50% 50% 0 0 / 80% 80% 0 0' }}>
              <strong style={{ color: '#111b1f', fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 'clamp(56px, 7vw, 86px)', lineHeight: 1 }}>GMP</strong>
            </div>
            <div style={{ position: 'relative', margin: '0 -22px 14px', padding: '6px 18px', color: '#4b439c', textAlign: 'center', borderTop: '2px solid rgba(75,67,156,0.58)', borderBottom: '2px solid rgba(75,67,156,0.58)', fontSize: 12, fontWeight: 700 }}>GMP SHISHI YU GUANLI</div>
            <h2 style={{ margin: 0, color: '#111b1f', textAlign: 'center', fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 'clamp(34px, 4.2vw, 58px)', lineHeight: 1.08 }}>实施与管理</h2>
            <p style={{ margin: '16px 0 0', color: '#3f535c', textAlign: 'center', fontWeight: 700 }}>《GMP实施与管理》课程</p>
          </div>
          {/* Dark teal scene panel */}
          <div style={{ position: 'relative', zIndex: 1, borderRadius: 8, display: 'grid', alignContent: 'end', gap: 14, minHeight: 216, padding: 24, color: '#f5fbfd', background: 'linear-gradient(135deg, rgba(24,59,75,0.94), rgba(29,111,120,0.82)), #183b4b' }}>
            <span style={{ display: 'inline-flex', width: 'fit-content', padding: '7px 10px', color: '#e9f8f6', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>质量体系</span>
            <div style={{ display: 'grid', gap: 6 }}>
              <b style={{ color: '#f5fbfd', fontSize: 'clamp(32px, 4.6vw, 58px)', lineHeight: 1.06, fontWeight: 700 }}>GMP</b>
              <b style={{ color: '#f5fbfd', fontSize: 'clamp(24px, 3.2vw, 42px)', lineHeight: 1.06, fontWeight: 700 }}>实施与管理</b>
            </div>
            <p style={{ margin: '-4px 0 0', color: 'rgba(245,251,253,0.74)', fontSize: 15, fontWeight: 700, lineHeight: 1.35 }}>Implementation &amp; Management</p>
            <div style={{ display: 'grid', gap: 8 }}>
              {[1, 2, 3].map(i => <div key={i} style={{ height: 8, background: 'linear-gradient(90deg, rgba(255,255,255,0.42), transparent)', borderRadius: 999 }} />)}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['法规', '生产', '检验', '放行'].map(t => <span key={t} style={{ padding: '7px 10px', color: '#183b4b', background: 'rgba(255,255,255,0.84)', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>{t}</span>)}
            </div>
          </div>
        </div>

        {/* Course intro */}
        <div style={{ ...PANEL, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 16, padding: 24 }}>
          <div>
            <span style={{ color: '#1d6f78', fontSize: 12, fontWeight: 700 }}>本地课程空间</span>
            <h1 style={{ margin: '8px 0 10px', color: '#183b4b', fontSize: 34, lineHeight: 1.12 }}>GMP实施与管理</h1>
            <p style={{ margin: 0, color: '#355564', fontSize: 16, lineHeight: 1.65 }}>面向药品生产质量管理的法规、体系、现场与数据完整性综合课程</p>
          </div>
          <p style={{ margin: 0, color: '#6b7d86', lineHeight: 1.8 }}>
            本课程围绕药品生产质量管理规范，从法规原则、质量体系、机构人员、厂房设施、设备物料、生产过程、QC 检验、偏差 OOS、数据完整性、CAPA 与批放行等主题展开。
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <button onClick={openStudyDialog} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px', background: '#1d6f78', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              <Play size={14} />去学习
            </button>
            <button onClick={() => { setActiveTab('graph'); setActiveGraphType('knowledge'); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px', background: 'transparent', color: '#183b4b', border: '1px solid rgba(31,71,92,0.2)', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              查看图谱<ArrowRight size={14} />
            </button>
          </div>
        </div>
      </section>

      {/* ── 三币资产栏 ── */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
        {/* XP / 等级 */}
        <div style={{ ...PANEL, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#1d6f78,#35818a)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ color: '#fff', fontSize: 15, fontWeight: 800 }}>Lv</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#183b4b' }}>{gs?.xp ?? 0}</span>
              <span style={{ fontSize: 12, color: '#6b7d86' }}>XP</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 12, color: '#1d6f78', fontWeight: 600 }}>{gs?.rankTitle ?? 'GMP新人'}</span>
              {gs && gs.xpToNext > 0 && <span style={{ fontSize: 11, color: '#9ba8b0' }}>距下级 {gs.xpToNext} XP</span>}
            </div>
            <div style={{ marginTop: 6, height: 5, borderRadius: 999, background: 'rgba(29,111,120,0.12)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${gs?.rankProgress ?? 0}%`, background: 'linear-gradient(90deg,#1d6f78,#35818a)', borderRadius: 999, transition: 'width 0.5s ease' }} />
            </div>
          </div>
        </div>

        {/* 积分（游戏货币） */}
        <div style={{ ...PANEL, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#d97706,#f59e0b)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 22 }}>
            🪙
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#183b4b' }}>{gs?.points ?? 0}</span>
              <span style={{ fontSize: 12, color: '#6b7d86' }}>积分</span>
            </div>
            <div style={{ marginTop: 2 }}>
              <span style={{ fontSize: 12, color: '#d97706', fontWeight: 600 }}>游戏货币</span>
            </div>
            <div style={{ marginTop: 4, fontSize: 11, color: '#9ba8b0' }}>每日登录 +5，每题答对 +2</div>
          </div>
        </div>

        {/* 课时分（待模块测试解锁） */}
        <div style={{ ...PANEL, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, opacity: 0.72 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#7c3aed,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 20 }}>
            📚
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#183b4b' }}>—</span>
              <span style={{ fontSize: 12, color: '#6b7d86' }}>课时分</span>
            </div>
            <div style={{ marginTop: 2 }}>
              <span style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>学业成绩</span>
            </div>
            <div style={{ marginTop: 4, fontSize: 11, color: '#9ba8b0' }}>完成模块测试后解锁</div>
          </div>
        </div>
      </section>

      {/* ── Metric strip ── */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
        {[
          { label: '知识点',      value: '96'                               , unit: '个'      },
          { label: '能力点',      value: '24'                               , unit: '个'      },
          { label: '资源',        value: '58'                               , unit: '项'      },
          { label: '题目',        value: '120'                              , unit: '道'      },
          { label: '已开课',      value: '1'                                , unit: '第1学期' },
          { label: '已学习',      value: String(gs?.streakDays ?? 0)        , unit: '人'      },
          { label: '报名截止时间', value: '2026-07-31'                       , unit: '校内开放' },
        ].map(item => (
          <div key={item.label} style={{ ...PANEL, display: 'grid', gap: 6, minHeight: 86, padding: 12, alignContent: 'center' }}>
            <span style={{ color: '#6b7d86', fontSize: 12 }}>{item.label}</span>
            <strong style={{ color: '#183b4b', fontSize: 'clamp(18px, 1.6vw, 24px)', lineHeight: 1.1 }}>{item.value}</strong>
            <small style={{ color: '#6b7d86', fontSize: 11 }}>{item.unit}</small>
          </div>
        ))}
      </section>

      {/* ── Tab bar ── */}
      <div style={{ background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(34,73,84,0.14)', borderRadius: 8, padding: '0 12px', marginBottom: 12, display: 'flex', gap: 4, overflowX: 'auto' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 50, padding: '0 18px', border: 'none', borderBottom: activeTab === id ? '4px solid #409eff' : '4px solid transparent', background: activeTab === id ? 'rgba(64,158,255,0.12)' : 'transparent', color: activeTab === id ? '#409eff' : '#183b4b', fontSize: 17, fontWeight: 800, cursor: 'pointer', transition: 'color 0.2s, background-color 0.2s', borderRadius: '8px 8px 0 0', whiteSpace: 'nowrap', flexShrink: 0 }}>
            <Icon size={19} strokeWidth={activeTab === id ? 2.2 : 1.7} />{label}
          </button>
        ))}
      </div>

      {/* ── Tab: 课程概述 ── */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          {OVERVIEW_CARDS.map(({ tag, title, icon: Icon, desc }) => (
            <div key={tag} style={{ ...PANEL, display: 'grid', gap: 10, padding: 18 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, color: '#1d6f78', background: 'rgba(29,111,120,0.1)', borderRadius: 8 }}>
                <Icon size={22} strokeWidth={1.7} />
              </div>
              <span style={{ color: '#1d6f78', fontWeight: 700, fontSize: 13 }}>{tag}</span>
              <h3 style={{ margin: 0, color: '#183b4b', fontSize: 20, lineHeight: 1.3 }}>{title}</h3>
              <p style={{ margin: 0, color: '#6b7d86', lineHeight: 1.75 }}>{desc}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab: 课程框架 ── */}
      {activeTab === 'framework' && (
        <div style={{ ...PANEL, display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', minHeight: 400 }}>
          <div style={{ display: 'grid', gap: 6, alignContent: 'start', padding: 16, borderRight: '1px solid rgba(34,73,84,0.1)', overflowY: 'auto', maxHeight: 560 }}>
            {CHAPTERS.map((item, idx) => (
              <button key={item.code} onClick={() => setActiveChIdx(idx)} style={{ display: 'grid', gap: 4, padding: '10px 12px', textAlign: 'left', background: idx === activeChIdx ? 'rgba(29,111,120,0.1)' : 'rgba(255,255,255,0.7)', border: idx === activeChIdx ? '1px solid rgba(29,111,120,0.3)' : '1px solid rgba(34,73,84,0.12)', borderRadius: 8, cursor: 'pointer' }}>
                <span style={{ color: '#c8812b', fontSize: 11, fontWeight: 700 }}>{item.tag}</span>
                <strong style={{ color: '#183b4b', fontSize: 13, fontWeight: 600 }}>{item.title}</strong>
              </button>
            ))}
          </div>
          <div style={{ padding: 24 }}>
            <span style={{ color: '#c8812b', fontSize: 12, fontWeight: 700 }}>{ch.tag}</span>
            <h3 style={{ margin: '8px 0 12px', color: '#183b4b', fontSize: 24, lineHeight: 1.3 }}>{ch.title}</h3>
            <p style={{ color: '#6b7d86', lineHeight: 1.8, margin: '0 0 24px' }}>{ch.desc}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[{ label: '学习重点', value: ch.focus }, { label: '建议学时', value: `${ch.hours} 学时` }].map(s => (
                <div key={s.label} style={{ background: 'rgba(29,111,120,0.06)', borderRadius: 8, padding: '14px 16px' }}>
                  <small style={{ color: '#6b7d86', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</small>
                  <strong style={{ display: 'block', color: '#183b4b', marginTop: 6, fontSize: 15 }}>{s.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: 课程图谱 ── */}
      {activeTab === 'graph' && (
        <div style={{ ...PANEL, padding: 0, overflow: 'hidden' }}>
          {/* Type selector header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, borderBottom: '1px solid rgba(34,73,84,0.1)', padding: '12px 20px', background: 'rgba(255,255,255,0.6)' }}>
            <Network size={16} color="#1d6f78" style={{ marginRight: 10 }} />
            <span style={{ color: '#183b4b', fontWeight: 700, fontSize: 15, marginRight: 20 }}>课程图谱</span>
            {([
              { key: 'knowledge', label: '知识图谱' },
              { key: 'ability',   label: '能力图谱' },
              { key: 'mastery',   label: '我的进度' },
            ] as const).map(({ key, label }) => {
              const active = activeGraphType === key
              const isMasteryBtn = key === 'mastery'
              return (
                <button key={key} onClick={() => setActiveGraphType(key)} style={{
                  padding: '5px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                  border: '1.5px solid',
                  borderColor: active
                    ? (isMasteryBtn ? '#2f7e58' : '#1d6f78')
                    : 'rgba(31,71,92,0.18)',
                  background: active
                    ? (isMasteryBtn ? 'rgba(47,126,88,0.1)' : 'rgba(29,111,120,0.1)')
                    : 'transparent',
                  color: active
                    ? (isMasteryBtn ? '#2f7e58' : '#1d6f78')
                    : '#6b8a98',
                  cursor: 'pointer', marginRight: 8, transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  {isMasteryBtn && <span style={{ fontSize: 12 }}>🧭</span>}
                  {label}
                </button>
              )
            })}
            <button style={{
              padding: '5px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600,
              border: '1.5px solid rgba(31,71,92,0.1)',
              background: 'transparent', color: '#b0bec5',
              cursor: 'not-allowed', marginRight: 8,
            }}>问题图谱 <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'rgba(176,190,197,0.2)', marginLeft: 4 }}>即将</span></button>
          </div>
          {/* Graph canvas */}
          <div style={{ height: 560, padding: 16 }}>
            {token && <GraphPanel key={activeGraphType} type={activeGraphType} token={token} />}
          </div>
        </div>
      )}

      {/* ── Tab: 课程实训 ── */}
      {activeTab === 'practice' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ ...PANEL, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 260px', gap: 24, padding: 24 }}>
            <div>
              <span style={{ color: '#1d6f78', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Simulation Training</span>
              <h3 style={{ margin: '10px 0 12px', color: '#183b4b', fontSize: 22, lineHeight: 1.3 }}>三日固体制剂质量危机沙盘</h3>
              <p style={{ color: '#6b7d86', lineHeight: 1.8, margin: '0 0 16px' }}>以一批片剂生产异常为主线，在仓储、生产、QC、QA、工程和监管视角间切换，完成物料追溯、过程调查、OOS 判断和批放行决策。</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {['物料追溯', 'OOS调查', '批放行决策', 'CAPA制定'].map(t => <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#1d6f78' }}><CheckCircle size={14} />{t}</span>)}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <div style={{ display: 'flex', gap: 20 }}>
                {[{ label: '场景', value: '3天' }, { label: '角色', value: '6个' }, { label: '决策点', value: '24项' }].map(s => (
                  <div key={s.label} style={{ textAlign: 'center' }}><strong style={{ display: 'block', color: '#183b4b', fontSize: 22, fontWeight: 700 }}>{s.value}</strong><small style={{ color: '#6b7d86', fontSize: 11 }}>{s.label}</small></div>
                ))}
              </div>
              <button style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', background: 'linear-gradient(135deg,#1d6f78,#35818a)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                <Play size={16} />开始综合实训
              </button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
            {PRACTICE_MODULES.map(m => (
              <div key={m.index} style={{ ...PANEL, padding: 16, display: 'grid', gap: 8 }}>
                <span style={{ color: '#1d6f78', fontSize: 22, fontWeight: 800 }}>{m.index}</span>
                <small style={{ color: '#6b7d86', fontSize: 11 }}>{m.stage}</small>
                <strong style={{ color: '#183b4b', fontSize: 14, lineHeight: 1.4, fontWeight: 600 }}>{m.title}</strong>
                <em style={{ color: '#c8812b', fontSize: 12, fontStyle: 'normal' }}>{m.focus}</em>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab: 课程考核 ── */}
      {activeTab === 'assessment' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {ASSESSMENTS.map(a => (
            <div key={a.title} style={{ ...PANEL, display: 'grid', gridTemplateColumns: '160px minmax(0,1fr)' }}>
              <div style={{ padding: '28px 20px', borderRight: '1px solid rgba(34,73,84,0.1)', textAlign: 'center', display: 'grid', gap: 6, alignContent: 'center' }}>
                <strong style={{ color: '#1d6f78', fontSize: 38, fontWeight: 800, lineHeight: 1 }}>{a.weight}%</strong>
                <span style={{ color: '#183b4b', fontWeight: 600, fontSize: 15 }}>{a.title}</span>
              </div>
              <div style={{ padding: '20px 24px' }}>
                <p style={{ color: '#6b7d86', lineHeight: 1.8, margin: '0 0 14px' }}>{a.desc}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {a.rubrics.map(r => <span key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#2f7e58', background: 'rgba(47,126,88,0.08)', padding: '4px 12px', borderRadius: 999, border: '1px solid rgba(47,126,88,0.15)' }}><CheckCircle size={13} />{r}</span>)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab: 错题本 ── */}
      {activeTab === 'wrongbook' && (() => {
        const items  = wrongData?.items ?? []
        const stats  = wrongData?.stats ?? { total: 0, pending: 0, reviewed: 0 }
        const filtered = wrongFilter === 'all'      ? items
          : wrongFilter === 'pending'  ? items.filter(w => !w.reviewed)
          : items.filter(w => w.reviewed)

        async function markReviewed(historyId: number) {
          const t = localStorage.getItem('token')
          if (!t) return
          await fetch(`/api/practice/history/${historyId}/reviewed`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
            body: JSON.stringify({ reviewed: true }),
          })
          // 乐观更新本地数据
          setWrongData(prev => prev ? {
            ...prev,
            stats: { ...prev.stats, pending: prev.stats.pending - 1, reviewed: prev.stats.reviewed + 1 },
            items: prev.items.map(w => w.historyId === historyId ? { ...w, reviewed: true } : w),
          } : prev)
        }

        async function retryQuestion(w: WrongItem) {
          // 跳到练习模式并预设该题目 — 暂时跳到 practice tab，后续接入练习页
          setActiveTab('practice')
        }

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Stats strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10 }}>
              {[
                { label: '错题总数', value: stats.total,    unit: '道', color: '#183b4b' },
                { label: '待复习',   value: stats.pending,  unit: '道', color: '#e55c4e' },
                { label: '已掌握',   value: stats.reviewed, unit: '道', color: '#2f7e58' },
              ].map(s => (
                <div key={s.label} style={{ ...PANEL, padding: '16px 20px', display: 'grid', gap: 4, alignContent: 'center' }}>
                  <span style={{ color: '#6b7d86', fontSize: 12 }}>{s.label}</span>
                  <strong style={{ color: s.color, fontSize: 28, lineHeight: 1 }}>{s.value}</strong>
                  <small style={{ color: '#6b7d86', fontSize: 11 }}>{s.unit}</small>
                </div>
              ))}
            </div>

            {/* Filter bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(34,73,84,0.14)', borderRadius: 8, padding: '10px 16px' }}>
              <span style={{ color: '#6b7d86', fontSize: 13, marginRight: 4 }}>筛选：</span>
              {(['all', 'pending', 'reviewed'] as const).map((f) => {
                const labels = { all: '全部', pending: '待复习', reviewed: '已掌握' }
                return (
                  <button key={f} onClick={() => setWrongFilter(f)} style={{
                    padding: '5px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, border: '1.5px solid',
                    borderColor: wrongFilter === f ? '#1d6f78' : 'rgba(31,71,92,0.18)',
                    background: wrongFilter === f ? 'rgba(29,111,120,0.1)' : 'transparent',
                    color: wrongFilter === f ? '#1d6f78' : '#6b8a98',
                    cursor: 'pointer',
                  }}>{labels[f]}</button>
                )
              })}
              <button
                onClick={() => {
                  setWrongData(null)
                  setWrongLoading(true)
                  setWrongError('')
                  fetch('/api/practice/history?filter=wrong&limit=200', {
                    headers: { Authorization: `Bearer ${token}` },
                  }).then(r => r.json()).then(setWrongData).catch(() => setWrongError('加载失败')).finally(() => setWrongLoading(false))
                }}
                style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: 'transparent', color: '#6b8a98', border: '1px solid rgba(31,71,92,0.15)', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
              >
                <RotateCcw size={12} />刷新
              </button>
              <span style={{ color: '#6b7d86', fontSize: 12 }}>共 {filtered.length} 题</span>
            </div>

            {/* Loading / Error */}
            {wrongLoading && (
              <div style={{ ...PANEL, padding: 40, textAlign: 'center', color: '#6b7d86' }}>加载中…</div>
            )}
            {wrongError && (
              <div style={{ ...PANEL, padding: 24, textAlign: 'center', color: '#e55c4e' }}>{wrongError}</div>
            )}

            {/* Question list */}
            {!wrongLoading && !wrongError && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filtered.length === 0 && (
                  <div style={{ ...PANEL, padding: 48, textAlign: 'center', color: '#6b7d86' }}>
                    <CheckCircle size={36} color="rgba(47,126,88,0.4)" style={{ marginBottom: 12, display: 'block', margin: '0 auto 12px' }} />
                    {stats.total === 0 ? '还没有错题记录，去练习题目吧！' : '当前筛选下暂无题目'}
                  </div>
                )}
                {filtered.map(w => {
                  const expanded = expandedWrong === w.historyId
                  const isMulti  = w.correctAnswer.length > 1
                  const dateStr  = w.answeredAt.slice(0, 10)
                  return (
                    <div key={w.historyId} style={{ ...PANEL, overflow: 'hidden', opacity: w.reviewed ? 0.72 : 1, transition: 'opacity 0.2s' }}>
                      {/* Header row */}
                      <div
                        onClick={() => setExpandedWrong(expanded ? null : w.historyId)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer', userSelect: 'none' }}
                      >
                        <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 700, background: w.reviewed ? 'rgba(47,126,88,0.12)' : 'rgba(229,92,78,0.12)', color: w.reviewed ? '#2f7e58' : '#e55c4e' }}>
                          {w.reviewed ? '✓' : '×'}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                            {w.chapter && <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 999, background: 'rgba(29,111,120,0.08)', color: '#1d6f78', fontWeight: 700 }}>{w.chapter}</span>}
                            {w.topic   && <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 999, background: 'rgba(200,129,43,0.1)', color: '#c8812b', fontWeight: 600 }}>{w.topic}</span>}
                            <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 999, background: 'rgba(100,100,100,0.08)', color: '#6b7d86' }}>{w.questionType}</span>
                            {isMulti && <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 999, background: 'rgba(64,158,255,0.1)', color: '#409eff', fontWeight: 600 }}>多选</span>}
                            <span style={{ fontSize: 11, color: '#9db0ba', marginLeft: 'auto' }}>{dateStr}</span>
                          </div>
                          <p style={{ margin: 0, color: '#183b4b', fontSize: 14, fontWeight: 600, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: expanded ? 'normal' : 'nowrap' }}>{w.stem}</p>
                        </div>
                        {expanded ? <ChevronUp size={16} color="#6b8a98" /> : <ChevronDown size={16} color="#6b8a98" />}
                      </div>

                      {/* Expanded content */}
                      {expanded && (
                        <div style={{ padding: '0 18px 16px', borderTop: '1px solid rgba(34,73,84,0.08)' }}>
                          {/* Options */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '14px 0' }}>
                            {w.options.map(({ key, text }) => {
                              const isCorrect = w.correctAnswer.includes(key)
                              const isUser    = w.userAnswer.includes(key)
                              let bg = 'rgba(255,255,255,0.8)'
                              let border = 'rgba(31,71,92,0.12)'
                              let color  = '#183b4b'
                              if (isCorrect)            { bg = 'rgba(47,126,88,0.08)';  border = 'rgba(47,126,88,0.3)';  color = '#2f7e58' }
                              if (isUser && !isCorrect) { bg = 'rgba(229,92,78,0.07)';  border = 'rgba(229,92,78,0.3)';  color = '#e55c4e' }
                              return (
                                <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 12px', borderRadius: 6, border: `1px solid ${border}`, background: bg }}>
                                  <span style={{ flexShrink: 0, fontWeight: 700, fontSize: 13, color, minWidth: 18 }}>{key}.</span>
                                  <span style={{ fontSize: 13, color, lineHeight: 1.5, flex: 1 }}>{text}</span>
                                  <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600 }}>
                                    {isCorrect && <span style={{ color: '#2f7e58' }}>✓ 正确答案</span>}
                                    {isUser && !isCorrect && <span style={{ color: '#e55c4e' }}>✗ 你的选择</span>}
                                  </span>
                                </div>
                              )
                            })}
                          </div>

                          {/* Explanation */}
                          {w.explanation && (
                            <div style={{ padding: '10px 14px', background: 'rgba(29,111,120,0.05)', borderRadius: 6, border: '1px solid rgba(29,111,120,0.12)', marginBottom: 12 }}>
                              <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#1d6f78', marginBottom: 4 }}>解析</span>
                              <p style={{ margin: 0, fontSize: 13, color: '#355564', lineHeight: 1.65 }}>{w.explanation}</p>
                            </div>
                          )}

                          {/* Actions */}
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                            {!w.reviewed && (
                              <button onClick={() => markReviewed(w.historyId)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: 'rgba(47,126,88,0.1)', color: '#2f7e58', border: '1px solid rgba(47,126,88,0.25)', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                <CheckCircle size={13} />标记已掌握
                              </button>
                            )}
                            <button onClick={() => retryQuestion(w)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: 'rgba(29,111,120,0.08)', color: '#1d6f78', border: '1px solid rgba(29,111,120,0.2)', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                              <RotateCcw size={13} />再做一遍
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* ── 个性化导学 Dialog ── */}
      {showDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowDialog(false)}>
          <div style={{ background: '#fff', borderRadius: 12, width: 760, maxWidth: '92vw', maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}
            onClick={e => e.stopPropagation()}>

            {/* Dialog header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid rgba(34,73,84,0.1)' }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: '#183b4b' }}>个性化导学</span>
              <button onClick={() => setShowDialog(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b8a98', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 4 }}>
                <X size={18} />
              </button>
            </div>

            {/* Stepper */}
            <div style={{ padding: '14px 24px', borderBottom: '1px solid rgba(34,73,84,0.07)', display: 'flex', alignItems: 'center' }}>
              {['问卷', '诊断', '路线'].map((label, idx) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', flex: idx < 2 ? 1 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: idx <= stepIdx ? '#409eff' : 'rgba(31,71,92,0.1)', color: idx <= stepIdx ? '#fff' : '#6b8a98', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                      {idx < stepIdx ? '✓' : idx + 1}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: idx === stepIdx ? 700 : 400, color: idx <= stepIdx ? '#409eff' : '#6b8a98' }}>{label}</span>
                  </div>
                  {idx < 2 && <div style={{ flex: 1, height: 2, background: idx < stepIdx ? '#409eff' : 'rgba(31,71,92,0.1)', margin: '0 12px' }} />}
                </div>
              ))}
            </div>

            {/* Dialog content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

              {/* Step 1: Profile */}
              {studyStep === 'profile' && (
                <div>
                  <span style={{ color: '#409eff', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Learning Profile</span>
                  <h3 style={{ margin: '8px 0 8px', color: '#183b4b', fontSize: 20 }}>先了解你的学习背景</h3>
                  <p style={{ color: '#6b7d86', lineHeight: 1.7, margin: '0 0 24px' }}>系统会根据学历和专业生成一组 GMP 入门诊断题，用来判断你适合从概念、现场应用还是综合决策开始。</p>

                  <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', color: '#183b4b', fontWeight: 600, fontSize: 14, marginBottom: 10 }}>学历层次</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {EDUCATION_OPTIONS.map(edu => (
                        <button key={edu} onClick={() => setStudyProfile(p => ({ ...p, education: edu }))} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid', borderColor: studyProfile.education === edu ? '#409eff' : 'rgba(31,71,92,0.2)', background: studyProfile.education === edu ? '#409eff' : 'transparent', color: studyProfile.education === edu ? '#fff' : '#183b4b', fontWeight: studyProfile.education === edu ? 700 : 400, fontSize: 14, cursor: 'pointer', transition: 'all 0.15s' }}>
                          {edu}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', color: '#183b4b', fontWeight: 600, fontSize: 14, marginBottom: 10 }}>专业方向</label>
                    <select value={studyProfile.major} onChange={e => setStudyProfile(p => ({ ...p, major: e.target.value }))}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(31,71,92,0.2)', fontSize: 14, color: '#183b4b', background: '#fff', cursor: 'pointer', outline: 'none' }}>
                      {MAJOR_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* Step 2: Quiz */}
              {studyStep === 'quiz' && (
                <div>
                  <span style={{ color: '#409eff', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Diagnostic Quiz</span>
                  <h3 style={{ margin: '8px 0 8px', color: '#183b4b', fontSize: 20 }}>完成 5 道水平诊断题</h3>
                  <p style={{ color: '#6b7d86', margin: '0 0 20px' }}>{studyProfile.education} / {studyProfile.major} 方向，题目覆盖法规理解、现场记录、偏差处理和批放行判断。</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {diagnosticQs.map((q, idx) => (
                      <div key={q.id} style={{ padding: 16, background: '#f8fbfc', borderRadius: 8, border: '1px solid rgba(34,73,84,0.1)' }}>
                        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                          <span style={{ color: '#1d6f78', fontWeight: 700, fontSize: 15, minWidth: 22, flexShrink: 0 }}>{idx + 1}</span>
                          <strong style={{ color: '#183b4b', fontSize: 14, lineHeight: 1.65, fontWeight: 600 }}>{q.stem}</strong>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingLeft: 32 }}>
                          {q.options.map((opt, optIdx) => {
                            const selected = diagnosticAns[q.id] === optIdx
                            return (
                              <label key={optIdx} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 12px', borderRadius: 6, border: '1px solid', borderColor: selected ? '#409eff' : 'rgba(31,71,92,0.12)', background: selected ? 'rgba(64,158,255,0.07)' : '#fff', transition: 'all 0.12s' }}>
                                <input type="radio" name={q.id} checked={selected} onChange={() => setDiagnosticAns(prev => ({ ...prev, [q.id]: optIdx }))} style={{ accentColor: '#409eff', flexShrink: 0 }} />
                                <span style={{ color: '#183b4b', fontSize: 14 }}>{opt}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 3: Route */}
              {studyStep === 'route' && (
                <div>
                  <div style={{ textAlign: 'center', padding: '8px 0 24px', borderBottom: '1px solid rgba(34,73,84,0.08)', marginBottom: 20 }}>
                    <span style={{ color: '#1d6f78', fontSize: 48, fontWeight: 800, lineHeight: 1, display: 'block' }}>{studyResult.score}/5</span>
                    <h3 style={{ margin: '10px 0 8px', color: '#183b4b', fontSize: 22 }}>{studyResult.level}</h3>
                    <p style={{ color: '#6b7d86', lineHeight: 1.7, maxWidth: 480, margin: '0 auto' }}>{studyResult.summary}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {studyRoute.map(item => (
                      <div key={item.title} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '14px 16px', background: '#f8fbfc', borderRadius: 8, border: '1px solid rgba(34,73,84,0.1)' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'rgba(29,111,120,0.1)', color: '#1d6f78', fontWeight: 700 }}>{item.tag}</span>
                            <h4 style={{ margin: 0, color: '#183b4b', fontSize: 15, fontWeight: 700 }}>{item.title}</h4>
                          </div>
                          <p style={{ color: '#6b7d86', fontSize: 13, margin: 0, lineHeight: 1.6 }}>{item.detail}</p>
                        </div>
                        {item.tab && (
                          <button onClick={() => { setActiveTab(item.tab!); setShowDialog(false) }} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: 'transparent', color: '#1d6f78', border: '1px solid rgba(29,111,120,0.3)', borderRadius: 6, fontSize: 13, cursor: 'pointer', marginTop: 2 }}>
                            进入<ArrowRight size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Dialog footer */}
            <div style={{ padding: '12px 24px', borderTop: '1px solid rgba(34,73,84,0.1)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              {studyStep !== 'profile' && (
                <button onClick={backStep} style={{ padding: '8px 20px', background: 'transparent', color: '#183b4b', border: '1px solid rgba(31,71,92,0.2)', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}>上一步</button>
              )}
              {studyStep === 'profile' && (
                <button onClick={handleGenerateDiagnostic} style={{ padding: '8px 20px', background: '#409eff', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>生成诊断题</button>
              )}
              {studyStep === 'quiz' && (
                <button onClick={handleSubmitDiagnostic} style={{ padding: '8px 20px', background: '#409eff', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>生成学习路线</button>
              )}
              {studyStep === 'route' && (
                <button onClick={() => { setActiveTab('practice'); setShowDialog(false) }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', background: '#1d6f78', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  <Play size={14} />进入课程实训
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
