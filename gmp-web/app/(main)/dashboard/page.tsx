'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, BookOpenCheck, Coins, Gem, HeartPulse, Trophy, List, Network, Wrench, Award, CheckCircle, Play, ArrowRight, X, ClipboardList, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react'
import dynamic from 'next/dynamic'

const GraphPanel = dynamic(() => import('./GraphPanel'), { ssr: false })

interface GameState { xp: number; points: number; rankLevel: number; rankTitle: string; rankProgress: number; xpToNext: number; streakDays: number; maxStreak: number }
interface SimulationAssets { coins: number; gems: number; trophies: number; hp: number; creditHours: number }
interface SimulationProgressEntry { creditHours?: number }

const SIMULATION_WALLET_KEY = 'gmp-simulation-wallet-v2'
const SIMULATION_PROGRESS_KEY = 'gmp-simulation-project-progress-v1'
const SIMULATION_HP_KEY = 'gmp-simulation-hp-v1'
const DEFAULT_SIMULATION_ASSETS: SimulationAssets = { coins: 12560, gems: 480, trophies: 0, hp: 92, creditHours: 0 }

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
  { tag: '实战训练', title: '543道练习题库', icon: Wrench,   desc: '分章节、分难度题库练习，配合AI助学实时解析，通过反复练习快速夯实合规知识基础，备战执业药师考试。' },
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
  background: 'rgba(255,255,255,0.94)',
  border: '1px solid rgba(218,232,236,0.84)',
  borderRadius: 18,
  boxShadow: '0 8px 22px rgba(31,56,66,0.04)',
}

function clampHp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function readSimulationAssets() {
  const storedWallet = localStorage.getItem(SIMULATION_WALLET_KEY)
  const storedProgress = localStorage.getItem(SIMULATION_PROGRESS_KEY)
  const storedHpRaw = localStorage.getItem(SIMULATION_HP_KEY)
  const storedHp = storedHpRaw === null ? Number.NaN : Number(storedHpRaw)
  let assets = { ...DEFAULT_SIMULATION_ASSETS }

  if (storedWallet) {
    try {
      const wallet = JSON.parse(storedWallet) as Partial<SimulationAssets>
      assets = {
        ...assets,
        coins: wallet.coins ?? assets.coins,
        gems: wallet.gems ?? assets.gems,
        trophies: wallet.trophies ?? assets.trophies,
      }
    } catch {
      localStorage.removeItem(SIMULATION_WALLET_KEY)
    }
  }

  if (storedProgress) {
    try {
      const progress = JSON.parse(storedProgress) as Record<string, SimulationProgressEntry>
      assets.creditHours = Number(Object.values(progress).reduce((sum, item) => sum + (item.creditHours ?? 0), 0).toFixed(1))
      assets.trophies = Object.keys(progress).length || assets.trophies
    } catch {
      localStorage.removeItem(SIMULATION_PROGRESS_KEY)
    }
  }

  if (Number.isFinite(storedHp)) assets.hp = clampHp(storedHp)
  return assets
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
  const [assets, setAssets]           = useState<SimulationAssets>(DEFAULT_SIMULATION_ASSETS)
  const [assetsReady, setAssetsReady] = useState(false)
  const [activeTab, setActiveTab]          = useState('overview')
  const [activeChIdx, setActiveChIdx]      = useState(0)
  const [activeGraphType, setActiveGraphType] = useState<'knowledge' | 'ability' | 'mastery'>('knowledge')
  const [token, setToken]                  = useState('')
  // 图片加载失败时回退到 SVG 兜底版（用户把图放进 public/dashboard 后自动生效）
  const [heroImgOk, setHeroImgOk]          = useState(true)
  const [badgeImgFail, setBadgeImgFail]    = useState<Record<string, boolean>>({})

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
    const syncAssets = () => setAssets(readSimulationAssets())
    syncAssets()
    setAssetsReady(true)
    window.addEventListener('focus', syncAssets)
    window.addEventListener('storage', syncAssets)
    fetch('/api/game/state', { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json()).then(setGs).catch(() => {})
    return () => {
      window.removeEventListener('focus', syncAssets)
      window.removeEventListener('storage', syncAssets)
    }
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

  function handleTabClick(tabId: string) {
    if (tabId === 'practice') {
      router.push('/simulation')
      return
    }
    setActiveTab(tabId)
  }

  function enterRouteItem(tabId: string) {
    setShowDialog(false)
    if (tabId === 'practice') {
      router.push('/simulation')
      return
    }
    setActiveTab(tabId)
  }

  const ch = CHAPTERS[activeChIdx]
  const stepIdx = { profile: 0, quiz: 1, route: 2 }[studyStep]

  // ── 七天打卡日历 ───────────────────────────────────────────────────────────
  const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']
  const todayDow = new Date().getDay() // 0=Sun … 6=Sat
  const todayIdx = todayDow === 0 ? 6 : todayDow - 1 // convert to Mon=0…Sun=6
  const streak = gs?.streakDays ?? 0
  const calDots = DAY_LABELS.map((_, i) => {
    const daysAgo = todayIdx - i
    if (daysAgo < 0) return 'future'
    if (daysAgo < streak) return 'done'
    if (daysAgo === 0) return 'today'
    return 'miss'
  })

  // ── 学习路径节点 ─────────────────────────────────────────────────────────────
  const PATH_NODES = [
    { label: '法规学习', done: true },
    { label: '质量体系', done: true },
    { label: '生产管理', active: true },
    { label: 'QC检验', done: false },
    { label: '数据完整性', done: false },
    { label: 'CAPA与放行', done: false },
  ]

  // ── 能力雷达数据（6 轴） ─────────────────────────────────────────────────────
  const RADAR_AXES = ['法规理解', '质量体系', '生产管理', '检验技能', '数据完整性', '问题解决']
  const radarScore = [78, 65, 55, 42, 38, 60] // placeholder
  function radarPoints(scores: number[], cx: number, cy: number, r: number) {
    return scores.map((s, i) => {
      const angle = (Math.PI * 2 * i) / scores.length - Math.PI / 2
      const ratio = s / 100
      return [cx + r * ratio * Math.cos(angle), cy + r * ratio * Math.sin(angle)]
    })
  }
  function hexPoints(cx: number, cy: number, r: number) {
    return Array.from({ length: 6 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2
      return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)]
    })
  }

  // ── 成就徽章 ─────────────────────────────────────────────────────────────────
  const BADGES = [
    { key: 'beginner', img: '/dashboard/badge-beginner.png', icon: '📖', label: '初学者',    sub: '完成10课程',  color: '#1d6f78', unlocked: true  },
    { key: 'diligent', img: '/dashboard/badge-diligent.png', icon: '💪', label: '勤奋学习',  sub: '连续学习7天', color: '#0891b2', unlocked: streak >= 7 },
    { key: 'explorer', img: '/dashboard/badge-explorer.png', icon: '🔍', label: '知识探索者', sub: '完成50课程',  color: '#7c3aed', unlocked: false },
    { key: 'expert',   img: '/dashboard/badge-expert.png',   icon: '⚔️', label: '实训达人',  sub: '完成20次实训', color: '#b87808', unlocked: false },
  ]

  // ── 快速入口 ──────────────────────────────────────────────────────────────────
  const QUICK_LINKS = [
    { icon: List,         label: '课程框架', sub: '系统学习路径',   action: () => setActiveTab('framework') },
    { icon: Network,      label: '课程图谱', sub: '知识点关系图',   action: () => setActiveTab('graph')     },
    { icon: Wrench,       label: '课程实训', sub: '模拟实演练习',   action: () => router.push('/simulation') },
    { icon: Award,        label: '课程考核', sub: '阶段测评检验',   action: () => setActiveTab('assessment') },
    { icon: ClipboardList,label: '错题本',   sub: '巩固薄弱知识',   action: () => setActiveTab('wrongbook')  },
    { icon: RotateCcw,    label: '自定义',   sub: '管理常用入口',   action: openStudyDialog                  },
  ]

  // 课程完成度 — 用等级进度和 XP 换算一个 0-100 的值展示
  const courseProgress = Math.min(99, Math.round(((gs?.rankLevel ?? 1) - 1) / 9 * 60 + (gs?.rankProgress ?? 0) * 10 + 5))

  return (
    <div style={{
      padding: '18px 26px 22px',
      minHeight: 'calc(100vh - 60px)',
      maxWidth: 'none',
      width: '100%',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      background: '#f5f9fa',
    }}>

      {/* ══ Row 1: Hero ══════════════════════════════════════════════════════════ */}
      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.65fr) minmax(410px,0.9fr)', gap: 16, alignItems: 'stretch' }}>

        {/* 左：课程 Banner（优先用 AI 生成图，缺图时回退 SVG 兜底） */}
        {heroImgOk ? (
          <div style={{ position: 'relative', minHeight: 270, borderRadius: 18, overflow: 'hidden', border: '1px solid rgba(218,232,236,0.84)', boxShadow: '0 8px 22px rgba(31,56,66,0.04)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/dashboard/hero.png" alt="GMP 实施与管理" onError={() => setHeroImgOk(false)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: 'saturate(0.88) contrast(0.94) brightness(1.04)' }} />
            {/* 白雾叠层：降低对比、增加 UI Banner 空气感 */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(105deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.08) 40%, rgba(236,246,247,0.16) 100%)' }} />
          </div>
        ) : (
        <div style={{
          position: 'relative', display: 'flex', alignItems: 'center',
          minHeight: 304, padding: '32px 36px', overflow: 'hidden',
          borderRadius: 20, border: '1px solid rgba(220,232,236,0.9)', boxShadow: '0 12px 32px rgba(31,56,66,0.06)',
          background: 'radial-gradient(circle at 78% 30%, rgba(20,184,166,0.12), transparent 45%), linear-gradient(120deg, #eef6f3 0%, #e3efe9 45%, #d6e8e2 100%)',
        }}>
          {/* 背景网格点缀 */}
          <div style={{ position: 'absolute', inset: 0, opacity: 0.4, pointerEvents: 'none', background: 'linear-gradient(90deg, rgba(29,111,120,0.06) 1px, transparent 1px), linear-gradient(180deg, rgba(29,111,120,0.05) 1px, transparent 1px)', backgroundSize: '26px 26px' }} />

          {/* 左侧文字 */}
          <div style={{ position: 'relative', zIndex: 2, flex: 1, minWidth: 0 }}>
            <span style={{ color: '#4b9a8f', fontSize: 12, fontWeight: 700, letterSpacing: '0.18em' }}>GMP SHISHI YU GUANLI</span>
            <h1 style={{ margin: '10px 0 6px', color: '#10242e', fontSize: 'clamp(34px,3.4vw,46px)', fontWeight: 900, lineHeight: 1.08, letterSpacing: '0.02em' }}>
              GMP<br />实施与管理
            </h1>
            <p style={{ margin: '0 0 6px', color: '#355564', fontSize: 14, fontWeight: 700 }}>《GMP实施与管理》课程</p>
            <p style={{ margin: '0 0 16px', color: '#6b7d86', fontSize: 13, lineHeight: 1.6, maxWidth: 380 }}>面向药品生产质量管理的法规、体系、现场与数据完整性综合课程</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['法规','生产','检验','放行','设备'].map(t => (
                <span key={t} style={{ padding: '6px 14px', color: '#1d6f78', background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(29,111,120,0.15)', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>{t}</span>
              ))}
            </div>
          </div>

          {/* 右侧玻璃盾插画 */}
          <div style={{ position: 'relative', zIndex: 2, flexShrink: 0, width: 210, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* 底部光晕 + 底座 */}
            <div style={{ position: 'absolute', bottom: 24, width: 168, height: 36, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(20,184,166,0.35), transparent 70%)', filter: 'blur(2px)' }} />
            <div style={{ position: 'absolute', bottom: 30, width: 130, height: 18, borderRadius: '50%', background: 'linear-gradient(180deg, rgba(255,255,255,0.7), rgba(180,220,212,0.4))', border: '1px solid rgba(255,255,255,0.6)' }} />
            <svg width={150} height={170} viewBox="0 0 150 170" style={{ position: 'relative', filter: 'drop-shadow(0 12px 20px rgba(15,118,110,0.28))' }}>
              <defs>
                <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#5eead4" />
                  <stop offset="45%" stopColor="#14b8a6" />
                  <stop offset="100%" stopColor="#0f766e" />
                </linearGradient>
                <linearGradient id="shieldGloss" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
                  <stop offset="50%" stopColor="rgba(255,255,255,0.05)" />
                </linearGradient>
              </defs>
              {/* 盾牌主体 */}
              <path d="M75 6 L138 30 V86 C138 128 110 152 75 164 C40 152 12 128 12 86 V30 Z" fill="url(#shieldGrad)" stroke="rgba(255,255,255,0.5)" strokeWidth={2} />
              {/* 高光 */}
              <path d="M75 6 L138 30 V86 C138 110 124 128 104 140 C100 90 96 44 75 6 Z" fill="url(#shieldGloss)" opacity={0.6} />
              {/* GMP 文字 */}
              <text x={75} y={92} textAnchor="middle" fontSize={34} fontWeight={900} fill="#fff" fontFamily="Georgia,serif" letterSpacing={1}>GMP</text>
              {/* 底部小线 */}
              <rect x={52} y={106} width={46} height={4} rx={2} fill="rgba(255,255,255,0.7)" />
            </svg>
            {/* 顶部勾选徽标 */}
            <div style={{ position: 'absolute', top: 18, right: 30, width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#fbbf24,#f59e0b)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(245,158,11,0.4)', border: '2px solid #fff' }}>
              <CheckCircle size={16} color="#fff" strokeWidth={3} />
            </div>
          </div>
        </div>
        )}

        {/* 右：学习进度卡（圆环 44% + 数据 56%，与 Hero 等高） */}
        <div style={{ ...PANEL, minHeight: 270, padding: '20px 26px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 30, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ color: '#0f2f3f', fontSize: 16, fontWeight: 700 }}>学习进度</strong>
            <button onClick={() => router.push('/course')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#0f766e', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
              查看详情 <ArrowRight size={13} />
            </button>
          </div>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '48% 52%', alignItems: 'center' }}>
            {/* 圆形进度环 */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ position: 'relative', width: 178, height: 178 }}>
                <svg width={178} height={178} viewBox="0 0 178 178">
                  <circle cx={89} cy={89} r={74} fill="none" stroke="#e8f1f3" strokeWidth={14} />
                  <circle cx={89} cy={89} r={74} fill="none" stroke="url(#progGrad)" strokeWidth={14}
                    strokeDasharray={`${2 * Math.PI * 74}`}
                    strokeDashoffset={`${2 * Math.PI * 74 * (1 - courseProgress / 100)}`}
                    strokeLinecap="round" transform="rotate(-90 89 89)" style={{ transition: 'stroke-dashoffset 1s ease' }} />
                  <defs>
                    <linearGradient id="progGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#22c7b8" />
                      <stop offset="100%" stopColor="#0f766e" />
                    </linearGradient>
                  </defs>
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 40, fontWeight: 800, color: '#0f2f3f', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{courseProgress}%</span>
                  <span style={{ fontSize: 12, color: '#6b8794', marginTop: 4 }}>课程完成度</span>
                </div>
              </div>
            </div>
            {/* 右侧三条数据 */}
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              {[
                { icon: '📚', label: '已学课程', value: `${gs?.xp ? Math.floor(gs.xp / 4) : 0}`, unit: '节' },
                { icon: '⏱', label: '已完成学习', value: `${assetsReady ? (assets.creditHours * 8 + 2.6).toFixed(1) : '0'}`, unit: '小时' },
                { icon: '🏅', label: '已获得证书', value: `${assetsReady ? assets.trophies : 0}`, unit: '个' },
              ].map((item, i) => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0', borderTop: i === 0 ? 'none' : '1px solid rgba(220,232,236,0.9)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15 }}>{item.icon}</span>
                    <span style={{ fontSize: 12, color: '#6b8794' }}>{item.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <strong style={{ fontSize: 20, color: '#0f2f3f', fontVariantNumeric: 'tabular-nums', fontWeight: 800 }}>{item.value}</strong>
                    <span style={{ fontSize: 11, color: '#9ba8b0' }}>{item.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* 励志语 */}
          <p style={{ margin: 0, fontSize: 11, color: '#9ba8b0', textAlign: 'center', fontStyle: 'italic', borderTop: '1px solid rgba(220,232,236,0.9)', paddingTop: 8 }}>
            "持续学习，精益求精，质量源于每一次认真"
          </p>
        </div>
      </section>

      {/* ══ Row 2: 统计长条 + 连续学习卡 ════════════════════════════════════════ */}
      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 16, alignItems: 'stretch' }}>

        {/* 左：统计长条（4 项等宽 + 竖线分隔） */}
        <div style={{ ...PANEL, minHeight: 92, display: 'flex', alignItems: 'stretch' }}>
          {/* Lv + XP */}
          <div style={{ flex: 1, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            {/* Lv 六边形徽章 */}
            <div style={{ width: 50, height: 50, position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 4px 10px rgba(15,118,110,0.3))' }}>
              <svg width={50} height={50} viewBox="0 0 52 52" style={{ position: 'absolute' }}>
                <defs>
                  <linearGradient id="lvHex" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#14b8a6" />
                    <stop offset="100%" stopColor="#0b4f5c" />
                  </linearGradient>
                </defs>
                <polygon points="26,3 47,15 47,37 26,49 5,37 5,15" fill="url(#lvHex)" stroke="rgba(255,255,255,0.7)" strokeWidth={1.5} />
              </svg>
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 8, fontWeight: 700, letterSpacing: '0.1em' }}>Lv</span>
                <span style={{ color: '#fff', fontSize: 17, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{gs?.rankLevel ?? '—'}</span>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span style={{ fontSize: 26, fontWeight: 800, color: '#0f2f3f', fontVariantNumeric: 'tabular-nums' }}>{gs?.xp ?? '—'}</span>
                <span style={{ fontSize: 12, color: '#6b8794' }}>XP</span>
              </div>
              <div style={{ fontSize: 12, color: '#0f766e', fontWeight: 600, marginTop: 1 }}>{gs?.rankTitle ?? '正在同步'}</div>
              <div style={{ marginTop: 6, height: 4, borderRadius: 999, background: 'rgba(15,118,110,0.1)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(gs?.rankProgress ?? 0) * 100}%`, background: 'linear-gradient(90deg,#0f766e,#2dd4bf)', borderRadius: 999, transition: 'width 0.5s ease' }} />
              </div>
              {gs && gs.xpToNext > 0 && <div style={{ fontSize: 10, color: '#9ba8b0', marginTop: 3 }}>距离升级还需 {gs.xpToNext} XP</div>}
            </div>
          </div>

          <div style={{ width: 1, background: 'rgba(218,232,236,0.75)', margin: '14px 0' }} />

          {/* HP */}
          <div style={{ flex: 1, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg,#10b981,#34d399)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 10px rgba(16,185,129,0.25)' }}>
              <HeartPulse size={19} color="#fff" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 26, fontWeight: 800, color: '#0f2f3f', fontVariantNumeric: 'tabular-nums' }}>{assetsReady ? assets.hp : '—'}</span>
                <span style={{ fontSize: 12, color: '#6b8794' }}>HP</span>
              </div>
              <div style={{ fontSize: 12, color: '#10b981', fontWeight: 600, marginTop: 1 }}>实训健康值</div>
              <div style={{ marginTop: 6, height: 4, borderRadius: 999, background: 'rgba(16,185,129,0.12)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${assets.hp}%`, background: 'linear-gradient(90deg,#10b981,#6ee7b7)', borderRadius: 999 }} />
              </div>
            </div>
          </div>

          <div style={{ width: 1, background: 'rgba(218,232,236,0.75)', margin: '14px 0' }} />

          {/* 金币 */}
          <div style={{ flex: 1, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg,#f59e0b,#fbbf24)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 10px rgba(245,158,11,0.25)' }}>
              <Coins size={19} color="#fff" />
            </div>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: '#0f2f3f', fontVariantNumeric: 'tabular-nums' }}>{assetsReady ? assets.coins.toLocaleString() : '—'}</span>
              <div style={{ fontSize: 12, color: '#d97706', fontWeight: 600, marginTop: 1 }}>金币</div>
              <div style={{ fontSize: 10, color: '#9ba8b0', marginTop: 2 }}>补给领取 / 关卡奖励</div>
            </div>
          </div>

          <div style={{ width: 1, background: 'rgba(218,232,236,0.75)', margin: '14px 0' }} />

          {/* 钻石 */}
          <div style={{ flex: 1, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg,#0ea5e9,#38bdf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 10px rgba(14,165,233,0.25)' }}>
              <Gem size={19} color="#fff" />
            </div>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: '#0f2f3f', fontVariantNumeric: 'tabular-nums' }}>{assetsReady ? assets.gems.toLocaleString() : '—'}</span>
              <div style={{ fontSize: 12, color: '#0ea5e9', fontWeight: 600, marginTop: 1 }}>钻石</div>
              <div style={{ fontSize: 10, color: '#9ba8b0', marginTop: 2 }}>每日与通关可获得</div>
            </div>
          </div>
        </div>

        {/* 右：连续学习独立卡（紧凑 streak） */}
        <div style={{ ...PANEL, minHeight: 92, padding: '14px 18px', display: 'grid', gridTemplateColumns: '72px 1fr', alignItems: 'center', gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: '#6b8794', marginBottom: 2 }}>连续学习</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span style={{ fontSize: 30, fontWeight: 800, color: '#0f2f3f', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{streak}</span>
              <span style={{ fontSize: 13, color: '#6b8794' }}>天</span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {DAY_LABELS.map((d, i) => (
              <div key={d} style={{ textAlign: 'center' }}>
                <div style={{
                  width: 19, height: 19, borderRadius: '50%', margin: '0 auto 5px',
                  background: calDots[i] === 'done' ? 'linear-gradient(180deg,#27d3c1,#0f766e)' : calDots[i] === 'today' ? 'rgba(15,118,110,0.18)' : '#dde7eb',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: calDots[i] === 'today' ? '2px solid #0f766e' : '2px solid transparent',
                  boxShadow: calDots[i] === 'done' ? 'inset 0 1px 0 rgba(255,255,255,0.45)' : 'none',
                }}>
                  {calDots[i] === 'done' && <CheckCircle size={10} color="#fff" />}
                </div>
                <span style={{ fontSize: 10, color: calDots[i] === 'done' ? '#0f766e' : '#7f97a2' }}>{d}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ Row 3: 三栏卡片 ══════════════════════════════════════════════════════ */}
      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(250px,0.7fr) minmax(380px,1fr)', gap: 16, alignItems: 'stretch' }}>

        {/* 学习路径（平滑曲线） */}
        <div style={{ ...PANEL, minHeight: 205, padding: '16px 20px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 28, display: 'flex', alignItems: 'center' }}>
            <strong style={{ color: '#0f2f3f', fontSize: 15, fontWeight: 700 }}>学习路径</strong>
          </div>
          {/* SVG 成长路线（轻盈平滑） */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <svg width="100%" viewBox="0 0 720 100" style={{ overflow: 'visible' }} preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="pathGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#22c7b8" />
                  <stop offset="100%" stopColor="#0f766e" />
                </linearGradient>
              </defs>
              {(() => {
                const PTS = [
                  { x: 52,  y: 66, label: ['法规学习'],     state: 'done'   },
                  { x: 175, y: 54, label: ['质量体系'],     state: 'done'   },
                  { x: 310, y: 30, label: ['生产管理'],     state: 'active' },
                  { x: 445, y: 58, label: ['QC 检验'],      state: 'todo'   },
                  { x: 565, y: 66, label: ['数据', '完整性'], state: 'todo'  },
                  { x: 675, y: 48, label: ['CAPA', '与放行'], state: 'todo'  },
                ] as const
                const full = 'M 52 66 C 95 66, 122 56, 175 54 C 235 52, 260 30, 310 30 C 370 30, 392 58, 445 58 C 500 58, 520 66, 565 66 C 620 66, 632 48, 675 48'
                const done = 'M 52 66 C 95 66, 122 56, 175 54 C 235 52, 260 30, 310 30'
                const act = PTS[2]
                return (
                  <>
                    <path d={full} fill="none" stroke="#dce6ea" strokeWidth={3.2} strokeLinecap="round" />
                    <path d={done} fill="none" stroke="url(#pathGradient)" strokeWidth={3.2} strokeLinecap="round" />
                    {/* 当前节点上升小箭头 */}
                    <path d={`M ${act.x - 5} ${act.y - 20} L ${act.x} ${act.y - 26} L ${act.x + 5} ${act.y - 20}`} fill="none" stroke="#0f766e" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                    {PTS.map((p, i) => {
                      const isDone = p.state === 'done', isActive = p.state === 'active'
                      const labelColor = isDone ? '#0f766e' : isActive ? '#0f2f3f' : '#7b919c'
                      return (
                        <g key={i}>
                          {isActive && <circle cx={p.x} cy={p.y} r={14} fill="rgba(15,118,110,0.14)" />}
                          <circle cx={p.x} cy={p.y} r={isActive ? 8.5 : 7.5}
                            fill={isDone ? '#0f766e' : isActive ? '#fff' : '#f4f8f9'}
                            stroke={isDone || isActive ? '#0f766e' : '#ccdbe1'} strokeWidth={isActive ? 2.6 : 1.8} />
                          {isDone && <path d={`M ${p.x - 3.8} ${p.y} l 2.4 2.8 l 5 -5.8`} fill="none" stroke="#fff" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" />}
                          {isActive && <circle cx={p.x} cy={p.y} r={3.6} fill="#0f766e" />}
                          {p.label.map((line, li) => (
                            <text key={li} x={p.x} y={87 + li * 13} textAnchor="middle" fontSize={11} fontWeight={isActive ? 700 : 500} fill={labelColor} fontFamily="system-ui">{line}</text>
                          ))}
                        </g>
                      )
                    })}
                  </>
                )
              })()}
            </svg>
          </div>
          {/* 图例 + 按钮同行 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
            <div style={{ display: 'flex', gap: 14 }}>
              {[{ c: '#0f766e', l: '已完成' }, { c: 'rgba(15,118,110,0.35)', l: '进行中' }, { c: '#d8e4e8', l: '未开始' }].map(item => (
                <div key={item.l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: item.c }} />
                  <span style={{ fontSize: 11, color: '#8da3ad' }}>{item.l}</span>
                </div>
              ))}
            </div>
            <button onClick={() => router.push('/course/T03')} style={{ height: 31, padding: '0 14px', borderRadius: 9, border: 'none', background: 'rgba(15,118,110,0.08)', color: '#0f766e', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              继续学习：生产管理 <ArrowRight size={13} />
            </button>
          </div>
        </div>

        {/* 能力成长 */}
        <div style={{ ...PANEL, minHeight: 205, padding: '16px 18px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 28, display: 'flex', alignItems: 'center' }}>
            <strong style={{ color: '#0f2f3f', fontSize: 15, fontWeight: 700 }}>能力成长</strong>
          </div>
          {/* SVG 雷达图 */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'translateY(-4px)' }}>
            <svg width={186} height={170} viewBox="0 0 220 200" style={{ overflow: 'visible' }}>
              <defs>
                <radialGradient id="radarGradient" cx="50%" cy="50%" r="55%">
                  <stop offset="0%" stopColor="rgba(20,184,166,0.34)" />
                  <stop offset="100%" stopColor="rgba(15,118,110,0.16)" />
                </radialGradient>
              </defs>
              {[1, 0.75, 0.5, 0.25].map(ratio => (
                <polygon key={ratio}
                  points={hexPoints(110, 100, 78 * ratio).map(p => p.join(',')).join(' ')}
                  fill="none" stroke="#dbe8ec" strokeWidth={1} opacity={0.75} />
              ))}
              {hexPoints(110, 100, 78).map(([x, y], i) => (
                <line key={i} x1={110} y1={100} x2={x} y2={y} stroke="#e5eef1" strokeWidth={1} opacity={0.8} />
              ))}
              <polygon
                points={radarPoints(radarScore, 110, 100, 78).map(p => p.join(',')).join(' ')}
                fill="url(#radarGradient)" stroke="#14b8a6" strokeWidth={1.8} />
              {radarPoints(radarScore, 110, 100, 78).map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={2.8} fill="#0f766e" stroke="#fff" strokeWidth={1.2} />
              ))}
              {hexPoints(110, 100, 95).map(([x, y], i) => (
                <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={12} fontWeight={500} fill="#3b6472" fontFamily="system-ui">{RADAR_AXES[i]}</text>
              ))}
            </svg>
          </div>
          <button onClick={() => router.push('/report')} style={{ minWidth: 120, maxWidth: '78%', margin: '0 auto', height: 30, padding: '0 18px', borderRadius: 999, background: '#eef9f7', color: '#0f766e', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(185,229,223,0.9)' }}>
            查看能力详情
          </button>
        </div>

        {/* 成就徽章 */}
        <div style={{ ...PANEL, minHeight: 205, padding: '16px 22px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ color: '#0f2f3f', fontSize: 15, fontWeight: 700 }}>成就徽章</strong>
            <button style={{ fontSize: 12, color: '#0f766e', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>查看全部成就 ›</button>
          </div>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, alignContent: 'center' }}>
            {BADGES.map(badge => (
              <div key={badge.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
                {/* 徽章：优先用图，缺图回退六边形（全部彩色，不灰） */}
                <div style={{
                  width: 66, height: 66, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: 1,
                  filter: `drop-shadow(0 5px 10px ${badge.color}40)`,
                }}>
                  {!badgeImgFail[badge.key] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={badge.img} alt={badge.label} onError={() => setBadgeImgFail(p => ({ ...p, [badge.key]: true }))}
                      style={{ width: 66, height: 66, objectFit: 'contain' }} />
                  ) : (
                    <>
                      <svg width={56} height={56} viewBox="0 0 60 60" style={{ position: 'absolute' }}>
                        <defs>
                          <linearGradient id={`badge-${badge.key}`} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor={badge.color} stopOpacity={0.85} />
                            <stop offset="100%" stopColor={badge.color} stopOpacity={0.45} />
                          </linearGradient>
                        </defs>
                        <polygon points="30,4 54,17 54,43 30,56 6,43 6,17" fill={badge.unlocked ? `url(#badge-${badge.key})` : 'rgba(150,150,150,0.15)'} />
                        <polygon points="30,4 54,17 54,43 30,56 6,43 6,17" fill="none" stroke={badge.unlocked ? '#fff' : 'rgba(150,150,150,0.4)'} strokeWidth={1.5} opacity={0.7} />
                      </svg>
                      <span style={{ fontSize: 22, position: 'relative', zIndex: 1 }}>{badge.icon}</span>
                    </>
                  )}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f2f3f' }}>{badge.label}</div>
                  <div style={{ fontSize: 11, color: '#6b8794', marginTop: 2, lineHeight: 1.3 }}>{badge.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ Row 4: 快速入口（高级工具栏） ════════════════════════════════════════ */}
      <section style={{ ...PANEL, minHeight: 92, padding: '14px 22px' }}>
        <strong style={{ display: 'block', color: '#0f2f3f', fontSize: 15, fontWeight: 700, marginBottom: 8 }}>快速入口</strong>
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          {QUICK_LINKS.map(({ icon: Icon, label, sub, action }, i) => (
            <button key={label} onClick={action} style={{
              flex: 1, padding: '2px 16px', display: 'flex', alignItems: 'center', gap: 10,
              borderTop: 'none', borderBottom: 'none', borderRight: 'none',
              borderLeft: i > 0 ? '1px solid rgba(220,232,236,0.5)' : 'none',
              background: 'transparent', cursor: 'pointer', textAlign: 'left',
            }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, background: 'linear-gradient(180deg,#f0fbfa,#e6f7f5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={20} color="#0f766e" strokeWidth={1.7} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f2f3f' }}>{label}</div>
                <div style={{ fontSize: 11, color: '#6b8794', marginTop: 1 }}>{sub}</div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ══ Tab 内容区（快速入口点击后展开） ════════════════════════════════════ */}
      {activeTab !== 'overview' && <div style={{ marginBottom: 14 }}>
      {/* ── Tab bar ── */}
      <div style={{ background: 'rgba(255,255,255,0.76)', border: '1px solid rgba(30,77,88,0.1)', borderRadius: '12px 12px 0 0', padding: '6px 10px 0', display: 'flex', gap: 6, overflowX: 'auto' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => handleTabClick(id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 46, padding: '0 16px', border: 'none', borderBottom: activeTab === id ? '3px solid #1d6f78' : '3px solid transparent', background: activeTab === id ? 'rgba(29,111,120,0.11)' : 'transparent', color: activeTab === id ? '#1d6f78' : '#183b4b', fontSize: 15, fontWeight: 800, cursor: 'pointer', transition: 'color 0.2s', borderRadius: '10px 10px 0 0', whiteSpace: 'nowrap', flexShrink: 0 }}>
            <Icon size={19} strokeWidth={activeTab === id ? 2.2 : 1.7} />{label}
          </button>
        ))}
        <button onClick={() => setActiveTab('overview')} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, height: 46, padding: '0 14px', border: 'none', background: 'transparent', color: '#9ba8b0', fontSize: 13, cursor: 'pointer', borderRadius: '10px 10px 0 0' }}>
          <X size={14} /> 收起
        </button>
      </div>

      {/* ── Tab: 课程概述 ── */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
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
        <div style={{ ...PANEL, display: 'grid', gridTemplateColumns: 'minmax(250px, 0.92fr) minmax(0, 1.08fr)', minHeight: 400 }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
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
      </div>}

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
                          <button onClick={() => enterRouteItem(item.tab!)} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: 'transparent', color: '#1d6f78', border: '1px solid rgba(29,111,120,0.3)', borderRadius: 6, fontSize: 13, cursor: 'pointer', marginTop: 2 }}>
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
                <button onClick={() => { setShowDialog(false); router.push('/simulation') }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', background: '#1d6f78', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  <Play size={14} />进入实训仿真
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
