'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type WheelEvent } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Backpack,
  Bell,
  BookOpen,
  Bot,
  BrainCircuit,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Coins,
  FileSearch,
  FlaskConical,
  Gem,
  GraduationCap,
  HeartPulse,
  Lock,
  Medal,
  Package,
  ScrollText,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Swords,
  Target,
  Ticket,
  Trophy,
  UserRound,
  UsersRound,
  WandSparkles,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  assignedRoleLabel,
  getAuxiliaryCasePool,
  getCarrierRoute,
  getPrimaryCarrierChoices,
  normalizeEducationTrack,
  pickAuxiliaryCase,
  trackLabel,
  type CarrierCase,
  type CarrierRoute,
  type CaseCatalogProduct,
  type EducationTrack,
} from '@/lib/simulation/project7'
import {
  COURSE_CREDIT_RULES,
  GAME_PROJECT_BASE_CREDIT,
  PROJECT_MISSIONS,
  answerKeyFor,
  buildProjectBossQuestions,
  buildProjectStoryQuestions,
  creditForMedal,
  getProjectDefinition,
  medalFromScore,
  medalRank,
  type ProjectDefinition,
  type ProjectMedal,
} from '@/lib/simulation/project-missions'
import { FINAL_BOSS_COMPLETION_BASE_XP, PROJECT_COMPLETION_BASE_XP, PROJECT_MEDAL_BONUS_XP } from '@/lib/gamification'
import styles from './simulation.module.css'

type Screen = 'map' | 'levels' | 'briefing' | 'story' | 'boss' | 'result'
type ProjectStatus = 'cleared' | 'active' | 'locked'
type MedalTier = ProjectMedal
type QuestionKind = 'single' | 'multiple' | 'case'
type ItemId = 'skip' | 'boost' | 'heal'
type QuickPanel = 'mentor' | 'friends' | 'skills' | 'messages' | 'settings'

interface PlayerState {
  xp: number
  rankLevel: number
  rankTitle: string
  rankProgress: number
}

interface LeaderboardEntry {
  userId: string
  displayName: string
  avatarUrl: string | null
  school: string | null
  major: string | null
  xp: number
  points: number
  rankLevel: number
  rankTitle: string
  streakDays: number
  maxStreak: number
  leaderboardRank: number
}

interface ProjectNode extends ProjectDefinition {
  status: ProjectStatus
  medal: ProjectMedal
}

interface MapPan {
  x: number
  y: number
}

interface MapDragState {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
}

interface RouteTravel {
  fromId: number
  toId: number
  key: number
}

interface ProjectEntryConfirm {
  projectId: number
  returnScreen: 'map' | 'levels'
  fromLaunch?: boolean
}

interface ActionSignal {
  id: number
  message: string
}

interface NoticeMessage {
  tone: 'success' | 'info' | 'warning'
  title: string
  message: string
  actionLabel?: string
}

interface Role {
  id: string
  title: string
  name: string
  icon: LucideIcon
  focus: string
  opening: string
  battleSkill: string
  mentorName: string
  mentorTitle: string
  storyImage: string
  bossImage: string
  bossName: string
  bossTitle: string
}

interface Choice {
  id: string
  label: string
}

type DialogueTone = 'narrator' | 'npc' | 'player' | 'system'

interface TrainingQuestion {
  id: string
  kind: QuestionKind
  chapter: string
  stem: string
  options: Choice[]
  correct: string[]
  insight: string
  sceneNumber?: number
  context?: string
  taskLabel?: string
  evidence?: string
  deliverable?: string
  points?: number
  sceneMood?: string
  narration?: string
  choicePrompt?: string
  speaker?: {
    name: string
    title: string
    attitude: string
  }
  dialogue?: Array<{
    speaker: string
    title?: string
    line: string
    tone: DialogueTone
  }>
}

interface BattleOutcome {
  victory: boolean
  correct: number
  total: number
  hp: number
  bossHp: number
  medal: MedalTier
  projectScore: number
  timedOut?: boolean
}

interface Inventory {
  skip: number
  boost: number
  heal: number
}

interface Wallet {
  coins: number
  gems: number
  trophies: number
  inventory: Inventory
  lastDailySupplyDate?: string
}

interface WalletReward {
  coins: number
  gems: number
  trophies?: number
}

interface ProjectXpAward {
  xpGained: number
  rewardXp: number
  alreadyClaimed: boolean
  newXp: number
  rankLevel: number
  rankTitle: string
  rankProgress: number
  xpToNext: number
  leveledUp: boolean
  message: string
}

interface ProjectProgressEntry {
  medal: ProjectMedal
  bestScore: number
  storyScore: number
  bossAccuracy: number
  creditHours: number
  completedAt: string
}

type ProjectProgress = Record<string, ProjectProgressEntry>

interface TrophySummary {
  total: number
  bronze: number
  silver: number
  gold: number
}

interface StoreProduct {
  id: ItemId
  icon: LucideIcon
  name: string
  effect: string
  coinPrice: number
  gemPrice: number
}

type QuestionSeed = [
  id: string,
  kind: QuestionKind,
  chapter: string,
  stem: string,
  answers: number[],
  options: string[],
  insight: string,
]

const SIMULATION_MAX_HP = 100
const DEMO_HP = SIMULATION_MAX_HP
const STORY_PASS_SCORE = 60
const BOSS_MAX_HP = SIMULATION_MAX_HP
const PLAYER_MISS_DAMAGE = 20
const BOSS_BOOST_DAMAGE = 35
const BOSS_SKIP_DAMAGE = 30
const HEAL_AMOUNT = 25
const SIMULATION_TIME_LIMIT_SECONDS = 90 * 60
const WALLET_KEY = 'gmp-simulation-wallet-v2'
const PROJECT_PROGRESS_KEY = 'gmp-simulation-project-progress-v1'
const HP_KEY = 'gmp-simulation-hp-v2'
const CARRIER_KEY_PREFIX = 'gmp-simulation-carrier-v1'
const OPTION_KEYS = ['A', 'B', 'C', 'D']
const FALLBACK_PLAYER: PlayerState = { xp: 280, rankLevel: 3, rankTitle: 'GMP助理', rankProgress: 0.7 }
const DEFAULT_WALLET: Wallet = { coins: 12560, gems: 480, trophies: 0, inventory: { skip: 1, boost: 1, heal: 1 } }
const DAILY_SUPPLY_REWARD: WalletReward = { coins: 160, gems: 8 }
const VICTORY_REWARD: WalletReward = { coins: 360, gems: 18, trophies: 1 }
const REVIEW_REWARD: WalletReward = { coins: 80, gems: 0 }

const ROLES: Role[] = [
  {
    id: 'college-officer',
    title: 'GMP 合规员',
    name: '实训学员',
    icon: ClipboardCheck,
    focus: '按 SOP 检查、记录与报告',
    opening: '你负责准确识别并记录偏差事实，按流程保护每一项质量证据。',
    battleSkill: '合规核验：以完整记录阻断违规流转。',
    mentorName: '林严谨',
    mentorTitle: 'QA 负责人',
    storyImage: '/simulation/story-qa.webp',
    bossImage: '/simulation/boss-qa.webp',
    bossName: '流程侵蚀者',
    bossTitle: '不规范处置的聚合体',
  },
  {
    id: 'undergraduate-lead',
    title: '质量调查组长',
    name: '实训学员',
    icon: ShieldCheck,
    focus: '根因分析、风险决策与 CAPA',
    opening: '你负责组织跨部门调查，从证据中论证根因并设计有效的预防措施。',
    battleSkill: '调查答辩：以系统证据击破虚假闭环。',
    mentorName: '林严谨',
    mentorTitle: '质量负责人',
    storyImage: '/simulation/story-director.webp',
    bossImage: '/simulation/boss-record-corrupter.webp',
    bossName: '无效闭环',
    bossTitle: '表面整改的凝结体',
  },
  {
    id: 'validation-lead',
    title: '验证负责人',
    name: '周明澜',
    icon: ShieldCheck,
    focus: '总体策略与偏差批准',
    opening: '你要判断 OOS 是否有效，并在生产压力下守住调查边界。',
    battleSkill: '验证裁定：把风险证据转为致命核验伤害。',
    mentorName: '周明澜',
    mentorTitle: '验证负责人',
    storyImage: '/simulation/story-director.webp',
    bossImage: '/simulation/boss-record-corrupter.webp',
    bossName: '复测幻影',
    bossTitle: '虚假合格结果的凝结体',
  },
  {
    id: 'qa',
    title: 'QA代表',
    name: '林严谨',
    icon: ClipboardCheck,
    focus: '放行边界与扩展调查',
    opening: '你接到总混中间体 OOS 警报，任何未经调查的复测合格都不能放行。',
    battleSkill: '放行封印：集中击破无效 CAPA。',
    mentorName: '林严谨',
    mentorTitle: '质量总监',
    storyImage: '/simulation/story-qa.webp',
    bossImage: '/simulation/boss-qa.webp',
    bossName: '掩盖者',
    bossTitle: '偏差关闭指令的操纵者',
  },
  {
    id: 'it',
    title: '数据工程师',
    name: '顾航',
    icon: Wrench,
    focus: '审计追踪与原始数据',
    opening: '你从 HPLC 审计追踪与账户权限切入，寻找 OOS 背后的数据证据。',
    battleSkill: '日志穿透：定位被篡改或关闭的记录。',
    mentorName: '顾航',
    mentorTitle: '实验室数据工程师',
    storyImage: '/simulation/story-it.webp',
    bossImage: '/simulation/boss-it.webp',
    bossName: '删迹主控',
    bossTitle: '审计追踪失效实体',
  },
  {
    id: 'production',
    title: '生产用户代表',
    name: '韩工',
    icon: UserRound,
    focus: '总混工艺与现场执行',
    opening: '你回到总混现场，必须还原超时混合和新供应商物料的影响。',
    battleSkill: '工艺联锁：用现场证据阻断复发。',
    mentorName: '韩工',
    mentorTitle: '固体制剂车间主任',
    storyImage: '/simulation/story-production.webp',
    bossImage: '/simulation/boss-production.webp',
    bossName: '过混巨像',
    bossTitle: '失控总混过程的化身',
  },
  {
    id: 'specialist',
    title: '验证专员',
    name: '苏妍',
    icon: ScrollText,
    focus: '根因分析与 CAPA 闭环',
    opening: '你整理线索、扩展批次影响范围，并建立能证明有效的 CAPA 计划。',
    battleSkill: '闭环印记：让每项措施都有验证期限。',
    mentorName: '苏妍',
    mentorTitle: 'CAPA 专员',
    storyImage: '/simulation/story-specialist.webp',
    bossImage: '/simulation/boss-specialist.webp',
    bossName: '闭环吞噬者',
    bossTitle: '无效整改的聚合体',
  },
]

function createQuestion(seed: QuestionSeed): TrainingQuestion {
  const [id, kind, chapter, stem, answers, options, insight] = seed
  return {
    id,
    kind,
    chapter,
    stem,
    correct: answers.map(index => OPTION_KEYS[index]),
    options: options.map((label, index) => ({ id: OPTION_KEYS[index], label })),
    insight,
  }
}

const STORY_QUESTIONS = ([
  ['S01', 'single', '警报响起', '含量均匀度为 85.0%，检验员称复测 91.5% 已合格。你首先如何处理？', [1], ['采用复测值关闭 OOS', '拒绝直接替代，启动分阶段 OOS 调查', '先放行后补调查'], '仅以复测合格替代 OOS 调查会掩盖工艺或物料风险。'],
  ['S02', 'single', '警报响起', 'OOS 调查启动后，该批诺压平片最恰当的状态是？', [2], ['照常进入压片', '只标记样品', '隔离待判定并暂停流转'], '存在潜在质量风险的批次必须先受控。'],
  ['S03', 'single', '实验室迷雾', '调查发现 HPLC 审计追踪被关闭，最优先的动作是？', [0], ['保全数据并记录偏差，评估所有相关检测', '重启仪器后继续检测', '删除异常序列避免误读'], '原始数据及审计追踪是判断数据可靠性的证据。'],
  ['S04', 'single', '实验室迷雾', '两个检验员共用同一个登录账号，直接违反的原则是？', [1], ['提高效率原则', '数据可归属与职责分离原则', '物料先进先出原则'], '共享账号使行为无法归属到具体责任人。'],
  ['S05', 'single', '实验室迷雾', '记录中称量为 10.05 mg，计算时输入 10.50 mg，应如何定性？', [2], ['仪器波动', '生产偏差', '实验室计算差错并需影响评估'], '计算录入错误可以解释结果，但仍需调查系统性缺陷。'],
  ['S06', 'single', '深入车间', '总混实际 35 分钟，工艺规定 30+/-2 分钟。班组称是用餐耽误。下一步是？', [0], ['评估延长混合对均匀度及溶出的影响', '口头提醒后结束', '把记录改为 32 分钟'], '偏差调查必须转化为量化影响评价。'],
  ['S07', 'single', '根因追踪', '异常批次首次使用未经完整评估的新供应商微晶纤维素，调查范围应覆盖？', [1], ['仅本批', '所有使用该供应商物料的批次', '仅下一批'], '根因指向物料时必须扩展到相同暴露范围。'],
  ['S08', 'single', '制定 CAPA', '车间提出“停止该物料并再培训”即可关闭 CAPA，正确评价是？', [2], ['完整且充分', '不需要记录', '仅为纠正，缺少系统预防和有效性检查'], 'CAPA 需要避免复发并证明措施有效。'],
  ['S09', 'multiple', '实验室迷雾', '选择应被记录为实验室偏差的证据。', [0, 1, 2], ['色谱柱超规定使用次数', '天平校准已过期', '对照品计算录入错误', '检验员昨天请假'], '设备、校准和计算均会影响检测可靠性。'],
  ['S10', 'multiple', '警报响起', '启动 OOS 调查时应立即完成哪些动作？', [0, 1, 3], ['隔离批次', '保留原始数据', '只复测一次', '登记偏差并通知 QA'], '先控制风险，再以完整证据推进调查。'],
  ['S11', 'multiple', '深入车间', '评估总混超时影响，应收集哪些信息？', [0, 1, 2], ['混合设备参数记录', '含量均匀度及溶出趋势', '相同工艺历史批次', '午餐菜单'], '工艺、结果和历史对照共同支持结论。'],
  ['S12', 'multiple', '根因追踪', '针对新供应商物料，合适的扩展调查包括？', [0, 2, 3], ['供应商准入与审计记录', '只问操作工印象', '粒度或关键属性比较', '使用该物料批次趋势'], '供应链变化需要质量和批次两端的证据。'],
  ['S13', 'multiple', '制定 CAPA', '哪些措施能提升 CAPA 的预防性？', [0, 1, 3], ['新增供应商准入验证', '设置混合时间联锁', '仅张贴提醒海报', '设定三个月有效性复核'], '预防、技术控制及有效性验证构成闭环。'],
  ['S14', 'multiple', '制定 CAPA', 'CAPA 有效性检查应观察哪些结果？', [0, 1, 2], ['后续批次均匀度趋势', '供应商变更执行情况', '偏差是否复发', '培训签到字体是否美观'], '有效性必须体现产品和系统风险下降。'],
  ['S15', 'multiple', '影响评估', '若调查同时暴露数据可靠性问题，应纳入评估的是？', [0, 1, 3], ['相关分析方法记录', '受影响放行批次', '只看最终报告封面', '审计追踪与权限配置'], '数据可靠性问题不能局限于单一检验结果。'],
  ['S16', 'case', '案例研判', 'QC 希望删除最早的异常序列后重新进样。你应批准哪些处置组合？', [1, 2], ['删除序列以免干扰', '锁定原始数据并记录调查', '审核审计追踪与理由', '直接用新结果放行'], '异常数据不可被删除或选择性忽略。'],
  ['S17', 'case', '案例研判', '生产负责人要求今日出货，同时该批仍在 OOS 生产调查中。选择可执行方案。', [0, 3], ['维持隔离状态', '先发运后召回', '签字豁免调查', '升级质量负责人决策并记录风险'], '商业压力不得替代质量放行证据。'],
  ['S18', 'case', '案例研判', '根因可能同时涉及物料粒度与混合时间。如何验证假设？', [0, 1, 2], ['开展对比试验或趋势分析', '检查验证范围是否覆盖', '将证据写入根因结论', '仅对操作员再培训'], '根因需要证据支持，而非便利解释。'],
  ['S19', 'case', '案例研判', '制定供应商相关 CAPA 时，哪些交付物可以支持关闭？', [0, 2, 3], ['完成审计及批准标准', '口头承诺改善', '受影响批次评价报告', '有效性复核结果'], 'CAPA 关闭必须具备可审核证据链。'],
  ['S20', 'case', '终局汇报', '向质量负责人提交最终结论前，应同时确认哪些内容？', [0, 1, 2], ['OOS 有效性及根因', '批次处置与扩展范围', 'CAPA 与有效性时限', '只报最终合格数字'], '完成闭环后，方可进入终场 Boss 核验。'],
] as QuestionSeed[]).map(createQuestion)

const BOSS_QUESTIONS = ([
  ['B01', 'single', '证据封锁', 'OOS 结果出现后，允许批次继续流转的前提是什么？', [2], ['主管口头同意', '一次复测合格', '完成调查与质量处置结论'], '未完成调查不得放行。'],
  ['B02', 'single', '证据封锁', '审计追踪关闭时，首先要保护的是什么？', [0], ['原始电子数据', '生产排期', '打印纸数量'], '原始数据是调查根基。'],
  ['B03', 'single', '证据封锁', '共用实验室账号会造成的主要风险是？', [1], ['成本升高', '操作无法归属', '混合时间延长'], '数据应具有可归属性。'],
  ['B04', 'single', '证据封锁', '天平校准过期对 OOS 调查的影响是？', [0], ['构成潜在实验室误差线索', '完全无关', '自动证明产品合格'], '测量可靠性需被验证。'],
  ['B05', 'single', '工艺追踪', '35 分钟混合超过验证范围，应启动什么？', [2], ['补签记录', '删除时长', '工艺偏差影响评估'], '偏差需要科学评价。'],
  ['B06', 'single', '工艺追踪', '溶出 RSD 明显高于历史趋势提示？', [1], ['无需关注', '可能存在工艺或物料影响', '标签错误'], '趋势异常可提示潜在根因。'],
  ['B07', 'single', '工艺追踪', '新供应商未经批准投入使用，属于哪类控制失效？', [0], ['供应商质量管理失效', '清洁验证完成', '运输合格'], '物料准入必须受控。'],
  ['B08', 'single', '工艺追踪', '偏差调查仅写“人员原因、加强培训”，主要不足是？', [2], ['文字过少', '签名不整齐', '未找到系统根因'], '培训不能替代根因分析。'],
  ['B09', 'single', '影响扩展', '同供应商物料已用于三个批次，应如何处理？', [1], ['只处理 OOS 批', '纳入三批次影响评估', '全部忽略'], '暴露范围决定调查范围。'],
  ['B10', 'single', '影响扩展', '质量风险评估的最终对象首先是？', [0], ['患者和产品质量', '加班时长', '采购折扣'], 'GMP 决策以患者风险为核心。'],
  ['B11', 'single', '闭环进攻', '设置混合时间联锁属于何种措施？', [2], ['口头提醒', '事后纠正', '预防性技术控制'], '技术防错能降低复发概率。'],
  ['B12', 'single', '闭环进攻', 'CAPA 有效性检查最合适的时间是？', [1], ['立即签字关闭', '在预设周期验证后续趋势', '从不检查'], '闭环需验证结果。'],
  ['B13', 'single', '闭环进攻', '批次最终处置批准权限应由谁承担？', [0], ['授权质量负责人', '任何操作员', '供应商销售'], '质量决定应由授权职责完成。'],
  ['B14', 'single', '闭环进攻', '调查报告中最不能缺少的是？', [1], ['页面装饰', '证据、根因、影响与措施', '会议茶歇记录'], '可追溯证据支持结论。'],
  ['B15', 'single', '终场核验', '复测合格后原 OOS 数据应该？', [2], ['删除', '隐藏', '保留并纳入调查'], '不得选择性报告数据。'],
  ['B16', 'single', '终场核验', '结束 CAPA 前的最后一道关口是？', [0], ['验证有效性', '修改日期', '销毁样品'], '确认措施真正防止复发。'],
  ['B17', 'multiple', '证据封锁', '哪些情况需要记录为 OOS 第一阶段线索？', [0, 1, 3], ['积分错误', '校准失效', '午餐时间', '审计追踪关闭'], '实验室线索需完整记录。'],
  ['B18', 'multiple', '证据封锁', '有效的数据可靠性控制包括？', [0, 2, 3], ['个人账号', '共享密码', '审计追踪审核', '备份与访问控制'], 'ALCOA+ 依赖控制体系。'],
  ['B19', 'multiple', '证据封锁', '调查人员应保全哪些材料？', [0, 1, 2], ['原始图谱', '样品与标准品记录', '设备日志', '无关广告'], '证据应支持重建事件。'],
  ['B20', 'multiple', '工艺追踪', '总混超时的评价指标包括？', [0, 1, 3], ['均匀度', '溶出度', '制服颜色', '历史趋势'], '以关键质量属性评价影响。'],
  ['B21', 'multiple', '工艺追踪', '物料变更调查需查看？', [0, 2, 3], ['供应商审批', '停车记录', '检验属性', '使用批次清单'], '锁定物料暴露边界。'],
  ['B22', 'multiple', '工艺追踪', '根因分析中属于系统因素的是？', [0, 1, 2], ['SOP 范围不足', '联锁缺失', '供应商准入漏洞', '随机猜测'], '系统因素是 CAPA 着力点。'],
  ['B23', 'multiple', '影响扩展', '扩大调查范围的触发因素包括？', [0, 1, 3], ['同物料多批使用', '数据完整性失效', '报告纸张颜色', '历史趋势异常'], '扩展调查由共同风险驱动。'],
  ['B24', 'multiple', '影响扩展', '批次风险决定前需要哪些签署证据？', [0, 2, 3], ['调查结论', '销售预测', '影响评估', '质量批准'], '质量处置必须可审核。'],
  ['B25', 'multiple', '闭环进攻', '强有力的预防措施有哪些？', [0, 1, 2], ['供应商审计门槛', '参数联锁', '趋势监测', '仅发通知'], '预防措施应改变控制机制。'],
  ['B26', 'multiple', '闭环进攻', '有效性复核可以使用哪些指标？', [0, 1, 3], ['OOS 复发率', '后续批次趋势', '文件夹颜色', '联锁违规次数'], '指标应能反映风险下降。'],
  ['B27', 'multiple', '终场核验', '结案汇报需要覆盖？', [0, 1, 2], ['根因', '产品影响', 'CAPA 状态', '宣传文案'], '结案结论必须完整。'],
  ['B28', 'multiple', '终场核验', '满足放行决策的条件包括？', [0, 2, 3], ['调查已批准', '仅有复测合格', '产品质量证据充分', '偏差风险可接受'], '放行需综合证据。'],
  ['B29', 'multiple', '终场核验', '质量文化层面的改进可以包括？', [0, 1, 3], ['鼓励如实报告偏差', '管理层质量承诺', '隐藏异常', '及时风险升级'], '文化决定偏差能否被看见。'],
  ['B30', 'multiple', '终场核验', '针对本科层级调查报告应体现？', [0, 1, 2], ['根因方法', '风险量化', 'CAPA 有效性设计', '抄录答案'], '高阶训练侧重分析与决策。'],
  ['B31', 'case', '最终审判', '案例：主管要求先发运，再补 OOS 报告。选择合规行动。', [0, 2], ['拒绝发运并升级质量决策', '立即出货', '记录压力与隔离状态', '删除结果'], '质量状态未确定时不可发运。'],
  ['B32', 'case', '最终审判', '案例：QC 更换色谱柱后结果合格。下一步应如何处置？', [1, 2, 3], ['直接关闭', '记录柱效线索', '评估原测试有效性', '完成 OOS 结论审批'], '排除实验室误差也要完成调查。'],
  ['B33', 'case', '最终审判', '案例：新供应商三批物料均已生产。选择影响评估范围。', [0, 1, 3], ['三批产品数据', '物料关键属性', '仅当前人员', '供应商准入过程'], '从物料到成品完整追溯。'],
  ['B34', 'case', '最终审判', '案例：混合设备没有时间联锁。选择 CAPA 组合。', [0, 2, 3], ['增加联锁报警', '只口头教育', '修订参数控制', '复核后续偏差趋势'], '技术与程序控制应结合。'],
  ['B35', 'case', '最终审判', '案例：审计追踪长期关闭但产品已放行。应做什么？', [0, 1, 2], ['启动数据完整性调查', '回顾受影响批次', '恢复控制并验证', '忽略历史影响'], '数据问题需要回溯影响。'],
  ['B36', 'case', '最终审判', '案例：操作员承认延长混合时间是为赶产量。哪些结论合理？', [0, 2, 3], ['存在质量文化和流程风险', '无需数据评价', '需评估产品影响', '需评估管理监督'], '行为根因常折射体系缺口。'],
  ['B37', 'case', '最终审判', '案例：CAPA 三个月内再发同类 OOS。选择动作。', [0, 1, 3], ['判定有效性不足', '重新分析根因', '维持原关闭结论', '升级措施和范围'], '复发证明闭环未成立。'],
  ['B38', 'case', '最终审判', '案例：检测数据完整，但取样 SOP 未规定多点取样。应如何处置？', [0, 1, 2], ['评价代表性风险', '修订取样程序', '必要时追加验证', '直接宣告无风险'], '方法不足可能导致未发现偏差。'],
  ['B39', 'case', '最终审判', '案例：调查结论准备批准。选择必要附件。', [0, 2, 3], ['原始证据清单', '活动合影', '影响评价', 'CAPA 跟踪计划'], '结论需能被第三方重建。'],
  ['B40', 'case', '最终审判', '最后核验：怎样证明“诺压平”片风险已真正受控？', [0, 1, 2], ['批次处置有依据', '系统预防措施生效', '后续趋势验证无复发', '仅在屏幕显示成功'], '产品合格与体系闭环共同构成通关证据。'],
] as QuestionSeed[]).map(createQuestion)

const STORE_PRODUCTS: StoreProduct[] = [
  { id: 'skip', icon: Ticket, name: '调查直通卡', effect: '跳过当前题并对 Boss 造成 30 HP 伤害', coinPrice: 900, gemPrice: 24 },
  { id: 'boost', icon: Zap, name: '证据增幅器', effect: '下一次答对时额外造成 35 HP 伤害', coinPrice: 720, gemPrice: 18 },
  { id: 'heal', icon: HeartPulse, name: '应急补给包', effect: 'Boss 战中立即恢复 25 HP', coinPrice: 560, gemPrice: 12 },
]

const MEDAL_CONTENT: Record<MedalTier, { label: string; color: string; detail: string }> = {
  gold: { label: '金牌', color: '#f2c45d', detail: '调查严谨且攻坚精准，已完成完整质量闭环。' },
  silver: { label: '银牌', color: '#cbd9e8', detail: '成功压制偏差风险，继续提升核验效率即可冲击金牌。' },
  bronze: { label: '铜牌', color: '#d89a62', detail: '成功守住质量底线，建议再次挑战强化证据判断。' },
  none: { label: '尚未通关', color: '#f47f84', detail: 'Boss 仍有残余风险，请补齐证据链后再次挑战。' },
}

function answersMatch(answer: string[], question: TrainingQuestion) {
  return [...answer].sort().join('|') === [...question.correct].sort().join('|')
}

function questionLabel(kind: QuestionKind) {
  return kind === 'single' ? '单选题' : kind === 'multiple' ? '多选题' : '案例分析题'
}

function dialogueToneClass(tone: DialogueTone) {
  const toneClass: Record<DialogueTone, string> = {
    narrator: styles.dialogueNarrator,
    npc: styles.dialogueNpc,
    player: styles.dialoguePlayer,
    system: styles.dialogueSystem,
  }
  return toneClass[tone]
}

function projectKey(projectId: number) {
  return String(projectId)
}

function getProjectMedal(progress: ProjectProgress, projectId: number): ProjectMedal {
  return progress[projectKey(projectId)]?.medal ?? 'none'
}

function buildProjectNodes(progress: ProjectProgress): ProjectNode[] {
  return PROJECT_MISSIONS.map((project, index) => {
    const medal = getProjectMedal(progress, project.id)
    const previous = PROJECT_MISSIONS[index - 1]
    const unlocked = project.id === 1 || Boolean(previous && getProjectMedal(progress, previous.id) !== 'none')
    return {
      ...project,
      medal,
      status: medal !== 'none' ? 'cleared' : unlocked ? 'active' : 'locked',
    }
  })
}

function getCurrentUnlockedProject(projects: ProjectNode[]): ProjectNode {
  const active = projects.find(project => project.status === 'active')
  if (active) return active

  const cleared = [...projects].reverse().find(project => project.status === 'cleared')
  return cleared ?? projects[0]
}

function summarizeTrophies(progress: ProjectProgress): TrophySummary {
  return Object.values(progress).reduce<TrophySummary>((summary, entry) => {
    if (entry.medal === 'none') return summary
    return {
      total: summary.total + 1,
      bronze: summary.bronze + (entry.medal === 'bronze' ? 1 : 0),
      silver: summary.silver + (entry.medal === 'silver' ? 1 : 0),
      gold: summary.gold + (entry.medal === 'gold' ? 1 : 0),
    }
  }, { total: 0, bronze: 0, silver: 0, gold: 0 })
}

function summarizeCredit(progress: ProjectProgress) {
  const gameEarned = Object.values(progress).reduce((sum, entry) => sum + entry.creditHours, 0)
  return {
    gameEarned: Number(gameEarned.toFixed(1)),
    gameRequired: COURSE_CREDIT_RULES.gameProjectRegular,
    courseRegular: COURSE_CREDIT_RULES.courseLearningRegular,
    regularTotal: COURSE_CREDIT_RULES.regularTotal,
    finalCourseTest: COURSE_CREDIT_RULES.courseFinalTest,
    finalBoss: COURSE_CREDIT_RULES.finalBoss,
  }
}

function medalLabel(medal: ProjectMedal) {
  return medal === 'gold' ? '金牌' : medal === 'silver' ? '银牌' : medal === 'bronze' ? '铜牌' : '未通关'
}

function clampHp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function percentNumber(value: string) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 50
}

function projectPoint(project: ProjectDefinition) {
  return {
    x: percentNumber(project.position.left),
    y: percentNumber(project.position.top),
  }
}

function routePathBetween(from: ProjectDefinition, to: ProjectDefinition, index = 0) {
  const start = projectPoint(from)
  const end = projectPoint(to)
  const dx = end.x - start.x
  const dy = end.y - start.y
  const bend = index % 2 === 0 ? 1 : -1
  const curveX = dy * 0.08 * bend
  const curveY = dx * 0.08 * bend
  const c1x = start.x + dx * 0.36 - curveX
  const c1y = start.y + dy * 0.24 + curveY
  const c2x = start.x + dx * 0.66 - curveX
  const c2y = start.y + dy * 0.78 + curveY

  return [
    `M ${start.x.toFixed(2)} ${start.y.toFixed(2)}`,
    `C ${c1x.toFixed(2)} ${c1y.toFixed(2)}`,
    `${c2x.toFixed(2)} ${c2y.toFixed(2)}`,
    `${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
  ].join(' ')
}

function routeAvatarStyleBetween(from: ProjectDefinition, to: ProjectDefinition, index = 0) {
  const start = projectPoint(from)
  const end = projectPoint(to)
  const dx = end.x - start.x
  const dy = end.y - start.y
  const bend = index % 2 === 0 ? 1 : -1

  return {
    '--route-from-x': `${start.x}%`,
    '--route-from-y': `${start.y}%`,
    '--route-mid-x': `${start.x + dx * 0.52 - dy * 0.08 * bend}%`,
    '--route-mid-y': `${start.y + dy * 0.5 + dx * 0.08 * bend}%`,
    '--route-to-x': `${end.x}%`,
    '--route-to-y': `${end.y}%`,
  } as CSSProperties
}

function suggestedMapPanFor(project: ProjectDefinition): MapPan {
  const left = percentNumber(project.position.left)
  const top = percentNumber(project.position.top)
  return {
    x: left < 32 ? 120 : left > 66 ? -130 : 0,
    y: top < 34 ? 120 : top > 68 ? -150 : 0,
  }
}

function clampMapPan(next: MapPan, artboard: HTMLElement | null): MapPan {
  const world = artboard?.parentElement
  const artRect = artboard?.getBoundingClientRect()
  const worldRect = world?.getBoundingClientRect()
  const maxX = artRect && worldRect ? Math.max(96, (artRect.width - worldRect.width) / 2 + 120) : 360
  const maxY = artRect && worldRect ? Math.max(96, (artRect.height - worldRect.height) / 2 + 140) : 360
  return {
    x: clampNumber(next.x, -maxX, maxX),
    y: clampNumber(next.y, -maxY, maxY),
  }
}

function bossMaxHpFor(_project: ProjectDefinition, _questionCount: number) {
  return BOSS_MAX_HP
}

function bossHitDamageFor(questionCount: number) {
  return Math.ceil(BOSS_MAX_HP / Math.max(1, questionCount))
}

function getSimulationDateKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
}

function formatCountdown(seconds: number) {
  const safeSeconds = Math.max(0, seconds)
  const minutes = Math.floor(safeSeconds / 60)
  const remainingSeconds = safeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

export default function SimulationPage() {
  const router = useRouter()
  const [launched, setLaunched] = useState(false)
  const [screen, setScreen] = useState<Screen>('map')
  const [displayName, setDisplayName] = useState('学员')
  const [realName, setRealName] = useState('学员')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [player, setPlayer] = useState<PlayerState>(FALLBACK_PLAYER)
  const [wallet, setWallet] = useState<Wallet>(DEFAULT_WALLET)
  const [supplyOpen, setSupplyOpen] = useState(false)
  const [shopOpen, setShopOpen] = useState(false)
  const [trophyOpen, setTrophyOpen] = useState(false)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const [quickPanel, setQuickPanel] = useState<QuickPanel | null>(null)
  const [learningReportOpen, setLearningReportOpen] = useState(false)
  const [entryConfirm, setEntryConfirm] = useState<ProjectEntryConfirm | null>(null)
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false)
  const [actionSignal, setActionSignal] = useState<ActionSignal | null>(null)
  const [notice, setNotice] = useState<NoticeMessage | null>(null)
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [leaderboardError, setLeaderboardError] = useState('')
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([])
  const [currentLeaderboardEntry, setCurrentLeaderboardEntry] = useState<LeaderboardEntry | null>(null)
  const [projectProgress, setProjectProgress] = useState<ProjectProgress>({})
  const [simulationHp, setSimulationHp] = useState(DEMO_HP)
  const [selectedProjectId, setSelectedProjectId] = useState(1)
  const [educationTrack, setEducationTrack] = useState<EducationTrack>('undergraduate')
  const [major, setMajor] = useState('药学')
  const [caseCatalog, setCaseCatalog] = useState<CaseCatalogProduct[]>([])
  const [selectedCarrierId, setSelectedCarrierId] = useState<string | null>(null)
  const [auxiliaryCase, setAuxiliaryCase] = useState<CaseCatalogProduct | null>(null)
  const [briefingReturnScreen, setBriefingReturnScreen] = useState<'map' | 'levels'>('map')
  const [storyIndex, setStoryIndex] = useState(0)
  const [storyAnswers, setStoryAnswers] = useState<string[]>([])
  const [storyScore, setStoryScore] = useState(0)
  const [storyFinished, setStoryFinished] = useState(false)
  const [bossIndex, setBossIndex] = useState(0)
  const [bossAnswers, setBossAnswers] = useState<string[]>([])
  const [bossHp, setBossHp] = useState(BOSS_MAX_HP)
  const [battleHp, setBattleHp] = useState(DEMO_HP)
  const [battleCorrect, setBattleCorrect] = useState(0)
  const [damageBoost, setDamageBoost] = useState(false)
  const [outcome, setOutcome] = useState<BattleOutcome | null>(null)
  const [battleReward, setBattleReward] = useState<WalletReward | null>(null)
  const [creditAward, setCreditAward] = useState(0)
  const [projectXpAward, setProjectXpAward] = useState<ProjectXpAward | null>(null)
  const [remainingTime, setRemainingTime] = useState(SIMULATION_TIME_LIMIT_SECONDS)
  const [timedOut, setTimedOut] = useState(false)
  const [mapPan, setMapPan] = useState<MapPan>({ x: 0, y: 0 })
  const [mapPanning, setMapPanning] = useState(false)
  const [routeTravel, setRouteTravel] = useState<RouteTravel | null>(null)
  const [pendingRouteFromProjectId, setPendingRouteFromProjectId] = useState<number | null>(null)
  const mapPanRef = useRef<MapPan>(mapPan)
  const mapDragRef = useRef<MapDragState | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
      return
    }

    const storedDisplayName = localStorage.getItem('displayName') || '学员'
    setDisplayName(storedDisplayName)
    setRealName(storedDisplayName)
    setAvatarUrl(localStorage.getItem('avatarUrl'))

    const savedWallet = localStorage.getItem(WALLET_KEY)
    if (savedWallet) {
      try {
        const storedWallet = JSON.parse(savedWallet) as Partial<Wallet>
        setWallet({
          ...DEFAULT_WALLET,
          ...storedWallet,
          trophies: storedWallet.trophies ?? 0,
          inventory: { ...DEFAULT_WALLET.inventory, ...storedWallet.inventory },
        })
      } catch {
        localStorage.removeItem(WALLET_KEY)
      }
    }

    const savedProgress = localStorage.getItem(PROJECT_PROGRESS_KEY)
    if (savedProgress) {
      try {
        setProjectProgress(JSON.parse(savedProgress) as ProjectProgress)
      } catch {
        localStorage.removeItem(PROJECT_PROGRESS_KEY)
      }
    }

    const savedHpRaw = localStorage.getItem(HP_KEY)
    const savedHp = savedHpRaw === null ? Number.NaN : Number(savedHpRaw)
    const initialHp = Number.isFinite(savedHp) && savedHp >= 0 ? clampHp(savedHp) : DEMO_HP
    setSimulationHp(initialHp)
    setBattleHp(initialHp)

    Promise.all([
      fetch('/api/game/state', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/user/profile', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/onboarding/plan', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/simulation/cases', { headers: { Authorization: `Bearer ${token}` } }),
    ])
      .then(async ([gameResponse, profileResponse, planResponse, casesResponse]) => ({
        game: gameResponse.ok ? await gameResponse.json() : null,
        profile: profileResponse.ok ? await profileResponse.json() : null,
        plan: planResponse.ok ? await planResponse.json() : null,
        cases: casesResponse.ok ? await casesResponse.json() : null,
      }))
      .then(({ game, profile, plan, cases }) => {
        if (game) {
          setPlayer({
            xp: game.xp ?? FALLBACK_PLAYER.xp,
            rankLevel: game.rankLevel ?? FALLBACK_PLAYER.rankLevel,
            rankTitle: game.rankTitle ?? FALLBACK_PLAYER.rankTitle,
            rankProgress: game.rankProgress ?? FALLBACK_PLAYER.rankProgress,
          })
        }
        if (profile) {
          setDisplayName(profile.displayName || '学员')
          setRealName(profile.realName || profile.displayName || '学员')
          setAvatarUrl(profile.avatarUrl || null)
          localStorage.setItem('displayName', profile.displayName || '学员')
          if (profile.avatarUrl) localStorage.setItem('avatarUrl', profile.avatarUrl)
        }
        setMajor(plan?.major || profile?.major || '药学')
        setEducationTrack(normalizeEducationTrack(plan?.edu_level))
        if (cases?.categories) {
          setCaseCatalog(cases.categories.flatMap((category: {
            name: string
            products: Array<{ product_name: string; dosage_form: string; section_count: number }>
          }) => category.products.map(product => ({
            productName: product.product_name,
            dosageForm: product.dosage_form,
            dosageCategory: category.name,
            sectionCount: product.section_count,
          }))))
        }
      })
      .catch(() => {
        const storedName = localStorage.getItem('displayName') || '学员'
        setDisplayName(storedName)
        setRealName(storedName)
        setAvatarUrl(localStorage.getItem('avatarUrl'))
      })
  }, [router])

  useEffect(() => {
    if (!launched) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [launched])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('gmp-simulation-immersive', { detail: launched }))
    return () => {
      window.dispatchEvent(new CustomEvent('gmp-simulation-immersive', { detail: false }))
    }
  }, [launched])

  useEffect(() => {
    mapPanRef.current = mapPan
  }, [mapPan])

  useEffect(() => {
    if (!actionSignal) return
    const timerId = window.setTimeout(() => {
      setActionSignal(current => current?.id === actionSignal.id ? null : current)
    }, 1800)
    return () => window.clearTimeout(timerId)
  }, [actionSignal])

  const projects = useMemo(() => buildProjectNodes(projectProgress), [projectProgress])
  const currentUnlockedProject = useMemo(() => getCurrentUnlockedProject(projects), [projects])
  const activeProject = useMemo(() => getProjectDefinition(selectedProjectId), [selectedProjectId])
  const activeProjectNode = useMemo(
    () => projects.find(project => project.id === selectedProjectId) ?? projects[0],
    [projects, selectedProjectId],
  )
  const trophySummary = useMemo(() => summarizeTrophies(projectProgress), [projectProgress])
  const creditSummary = useMemo(() => summarizeCredit(projectProgress), [projectProgress])
  const carrierRoute = useMemo(() => getCarrierRoute(major), [major])
  const primaryCarriers = useMemo(() => getPrimaryCarrierChoices(carrierRoute, caseCatalog), [carrierRoute, caseCatalog])
  const selectedCarrier = useMemo(
    () => primaryCarriers.find(carrier => carrier.id === selectedCarrierId) ?? primaryCarriers[0],
    [primaryCarriers, selectedCarrierId],
  )
  const auxiliaryPool = useMemo(
    () => getAuxiliaryCasePool(carrierRoute, caseCatalog, selectedCarrier.productName),
    [carrierRoute, caseCatalog, selectedCarrier.productName],
  )
  const selectedRole = useMemo(
    () => ROLES.find(role => role.id === (educationTrack === 'college' ? 'college-officer' : 'undergraduate-lead')) ?? ROLES[0],
    [educationTrack],
  )
  const storyQuestions = useMemo(() => buildProjectStoryQuestions(activeProject, educationTrack, selectedCarrier), [activeProject, educationTrack, selectedCarrier])
  const bossQuestions = useMemo(() => buildProjectBossQuestions(activeProject, educationTrack, selectedCarrier), [activeProject, educationTrack, selectedCarrier])
  const bossMaxHp = useMemo(() => bossMaxHpFor(activeProject, bossQuestions.length), [activeProject, bossQuestions.length])
  const bossHitDamage = useMemo(() => bossHitDamageFor(bossQuestions.length), [bossQuestions.length])
  const currentStory = storyQuestions[storyIndex]
  const currentBoss = bossQuestions[bossIndex]
  const showHubChrome = screen === 'map' || screen === 'levels' || screen === 'briefing'
  const showMapHome = screen === 'map' || screen === 'briefing'
  const mapPanStyle = useMemo(() => ({
    '--map-pan-x': `${mapPan.x}px`,
    '--map-pan-y': `${mapPan.y}px`,
  }) as CSSProperties, [mapPan.x, mapPan.y])

  const trainingActive = screen === 'story' || screen === 'boss'

  useEffect(() => {
    if (launched) return

    setSelectedProjectId(currentId => {
      const currentNode = projects.find(project => project.id === currentId)
      return currentNode?.status === 'active' ? currentId : currentUnlockedProject.id
    })
  }, [currentUnlockedProject.id, launched, projects])

  useEffect(() => {
    if (!primaryCarriers.some(carrier => carrier.id === selectedCarrierId)) {
      const savedCarrierId = localStorage.getItem(`${CARRIER_KEY_PREFIX}:${carrierRoute.id}`)
      const nextCarrier = primaryCarriers.find(carrier => carrier.id === savedCarrierId) ?? primaryCarriers[0]
      setSelectedCarrierId(nextCarrier.id)
      setAuxiliaryCase(null)
    }
  }, [carrierRoute.id, primaryCarriers, selectedCarrierId])

  useEffect(() => {
    if (!trainingActive || timedOut || outcome) return

    const timerId = window.setInterval(() => {
      setRemainingTime(current => Math.max(0, current - 1))
    }, 1000)
    return () => window.clearInterval(timerId)
  }, [outcome, timedOut, trainingActive])

  useEffect(() => {
    if (!trainingActive || timedOut || outcome || remainingTime > 0) return
    failProjectByTimeout()
  }, [outcome, remainingTime, timedOut, trainingActive])

  function updateWallet(update: (current: Wallet) => Wallet) {
    setWallet(current => {
      const nextWallet = update(current)
      if (nextWallet !== current) {
        localStorage.setItem(WALLET_KEY, JSON.stringify(nextWallet))
      }
      return nextWallet
    })
  }

  function showActionSignal(message: string) {
    setActionSignal({ id: Date.now(), message })
  }

  function refreshMotion(message: string) {
    showActionSignal(message)
  }

  function openQuickPanel(panel: QuickPanel) {
    const labels: Record<QuickPanel, string> = {
      mentor: 'AI 导师已唤起',
      friends: '好友动态已刷新',
      skills: '技能树已打开',
      messages: '消息中心已刷新',
      settings: '设置面板已打开',
    }
    setQuickPanel(panel)
    showActionSignal(labels[panel])
  }

  function openLearningReport() {
    setLearningReportOpen(true)
    showActionSignal('学习报告已生成')
  }

  function navigateHub(nextScreen: Screen, message: string) {
    showActionSignal(message)
    if (screen === nextScreen) return
    setScreen(nextScreen)
  }

  function openSupplyPanel() {
    setShopOpen(false)
    setSupplyOpen(true)
    showActionSignal('补给面板已打开')
  }

  function openShopPanel() {
    setSupplyOpen(false)
    setShopOpen(true)
    showActionSignal('战备仓库已打开')
  }

  function openTrophyPanel() {
    setTrophyOpen(true)
    showActionSignal('奖杯统计已刷新')
  }

  function syncSimulationHp(nextValue: number) {
    const nextHp = clampHp(nextValue)
    setSimulationHp(nextHp)
    setBattleHp(nextHp)
    localStorage.setItem(HP_KEY, String(nextHp))
  }

  function applyMapPan(next: MapPan, artboard: HTMLElement | null) {
    const clamped = clampMapPan(next, artboard)
    mapPanRef.current = clamped
    setMapPan(clamped)
  }

  function beginMapPan(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    const target = event.target as Element
    if (target.closest('button, a, input, textarea, select, [role="button"]')) return

    mapDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: mapPanRef.current.x,
      originY: mapPanRef.current.y,
    }
    setMapPanning(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function moveMapPan(event: PointerEvent<HTMLDivElement>) {
    const drag = mapDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    applyMapPan({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    }, event.currentTarget)
    event.preventDefault()
  }

  function endMapPan(event: PointerEvent<HTMLDivElement>) {
    const drag = mapDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    mapDragRef.current = null
    setMapPanning(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function wheelMapPan(event: WheelEvent<HTMLDivElement>) {
    const target = event.target as Element
    if (target.closest('button, a, input, textarea, select, [role="button"]')) return

    applyMapPan({
      x: mapPanRef.current.x - event.deltaX,
      y: mapPanRef.current.y - event.deltaY,
    }, event.currentTarget)
    event.preventDefault()
  }

  function recenterMap(project: ProjectDefinition = activeProjectNode) {
    const nextPan = suggestedMapPanFor(project)
    mapPanRef.current = nextPan
    setMapPan(nextPan)
  }

  function returnToMapFromResult() {
    if (pendingRouteFromProjectId !== null) {
      const fromIndex = projects.findIndex(project => project.id === pendingRouteFromProjectId)
      const nextProject = fromIndex >= 0 ? projects[fromIndex + 1] : undefined
      if (nextProject) {
        setSelectedProjectId(nextProject.id)
        recenterMap(nextProject)
        setRouteTravel({ fromId: pendingRouteFromProjectId, toId: nextProject.id, key: Date.now() })
      }
    }

    setPendingRouteFromProjectId(null)
    showActionSignal('已返回远征地图')
    setScreen('map')
  }

  function openLeaderboard() {
    showActionSignal('排行榜刷新中')
    setLeaderboardOpen(true)
    setLeaderboardLoading(true)
    setLeaderboardError('')
    const token = localStorage.getItem('token')
    if (!token) {
      setLeaderboardLoading(false)
      setLeaderboardError('请先登录后查看排行榜')
      return
    }

    fetch('/api/game/leaderboard?limit=10', { headers: { Authorization: `Bearer ${token}` } })
      .then(async response => {
        if (!response.ok) throw new Error('leaderboard failed')
        return await response.json() as { entries: LeaderboardEntry[]; currentUser: LeaderboardEntry | null }
      })
      .then(data => {
        setLeaderboardEntries(data.entries ?? [])
        setCurrentLeaderboardEntry(data.currentUser ?? null)
      })
      .catch(() => {
        setLeaderboardError('排行榜暂时无法加载，请稍后再试')
        setLeaderboardEntries([])
        setCurrentLeaderboardEntry(null)
      })
      .finally(() => setLeaderboardLoading(false))
  }

  async function awardProjectCompletionXp(project: ProjectDefinition, medal: Exclude<ProjectMedal, 'none'>, projectScore: number) {
    const token = localStorage.getItem('token')
    if (!token) return

    try {
      const response = await fetch('/api/game/project-xp', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: project.id,
          projectTitle: project.title,
          medal,
          projectScore,
          finalBoss: Boolean(project.finalBoss),
        }),
      })
      if (!response.ok) throw new Error('project xp failed')
      const award = await response.json() as ProjectXpAward
      setProjectXpAward(award)
      setPlayer(current => ({
        ...current,
        xp: award.newXp,
        rankLevel: award.rankLevel,
        rankTitle: award.rankTitle,
        rankProgress: award.rankProgress,
      }))
    } catch {
      setProjectXpAward({
        xpGained: 0,
        rewardXp: 0,
        alreadyClaimed: false,
        newXp: player.xp,
        rankLevel: player.rankLevel,
        rankTitle: player.rankTitle,
        rankProgress: player.rankProgress,
        xpToNext: 0,
        leveledUp: false,
        message: '项目 XP 发放暂时失败，请稍后重试',
      })
    }
  }

  function requestLaunchSimulation() {
    const currentNode = projects.find(project => project.id === selectedProjectId)
    const launchProjectId = currentNode?.status === 'active' ? selectedProjectId : currentUnlockedProject.id
    setEntryConfirm({ projectId: launchProjectId, returnScreen: 'map', fromLaunch: true })
    showActionSignal('进入确认已打开')
  }

  function launchSimulation(projectId = selectedProjectId) {
    const launchProjectId = projects.find(project => project.id === projectId)?.status === 'active' ? projectId : currentUnlockedProject.id
    const launchProject = projects.find(project => project.id === launchProjectId) ?? currentUnlockedProject
    if (launchProjectId !== selectedProjectId) setSelectedProjectId(launchProjectId)
    recenterMap(launchProject)
    setSupplyOpen(false)
    setShopOpen(false)
    setScreen('map')
    setLaunched(true)
    showActionSignal('已进入全屏实训')
  }

  function requestLeaveSimulation() {
    if (screen === 'briefing' || screen === 'story' || screen === 'boss' || (screen === 'result' && !outcome?.victory)) {
      setExitConfirmOpen(true)
      showActionSignal('退出确认已打开')
      return
    }
    leaveSimulation()
  }

  function leaveSimulation() {
    setSupplyOpen(false)
    setShopOpen(false)
    setTrophyOpen(false)
    setLeaderboardOpen(false)
    setEntryConfirm(null)
    setExitConfirmOpen(false)
    setMapPanning(false)
    setPendingRouteFromProjectId(null)
    mapDragRef.current = null
    setScreen('map')
    setLaunched(false)
  }

  function requestEnterProject(projectId = selectedProjectId, returnScreen: 'map' | 'levels' = 'map') {
    const target = projects.find(project => project.id === projectId)
    if (!target) return
    if (target.status === 'locked') {
      showActionSignal('该项目尚未解锁')
      return
    }
    setEntryConfirm({ projectId, returnScreen })
    showActionSignal('项目进入确认已打开')
  }

  function confirmProjectEntry() {
    if (!entryConfirm) return
    const confirmedEntry = entryConfirm
    setEntryConfirm(null)
    if (confirmedEntry.fromLaunch) {
      launchSimulation(confirmedEntry.projectId)
      return
    }
    enterProject(confirmedEntry.projectId, confirmedEntry.returnScreen)
  }

  function enterProject(projectId = selectedProjectId, returnScreen: 'map' | 'levels' = 'map') {
    const target = projects.find(project => project.id === projectId)
    if (!target || target.status === 'locked') return
    showActionSignal('正在进入项目现场')
    setSelectedProjectId(projectId)
    setStoryIndex(0)
    setStoryAnswers([])
    setStoryScore(0)
    setStoryFinished(false)
    setOutcome(null)
    setBattleReward(null)
    setCreditAward(0)
    setProjectXpAward(null)
    setRemainingTime(SIMULATION_TIME_LIMIT_SECONDS)
    setTimedOut(false)
    setPendingRouteFromProjectId(null)
    setBriefingReturnScreen(returnScreen)
    setScreen('briefing')
  }

  function startStory() {
    showActionSignal('剧情调查已启动')
    setStoryIndex(0)
    setStoryAnswers([])
    setStoryScore(0)
    setStoryFinished(false)
    setRemainingTime(SIMULATION_TIME_LIMIT_SECONDS)
    setTimedOut(false)
    setScreen('story')
  }

  function failProjectByTimeout() {
    setTimedOut(true)
    setBattleReward(REVIEW_REWARD)
    setCreditAward(0)
    setProjectXpAward(null)
    setPendingRouteFromProjectId(null)
    setOutcome({
      victory: false,
      correct: battleCorrect,
      total: screen === 'boss' ? bossIndex + 1 : 0,
      hp: battleHp,
      bossHp,
      medal: 'none',
      projectScore: Math.round(storyScore / 2),
      timedOut: true,
    })
    setScreen('result')
  }

  function chooseAnswer(id: string, question: TrainingQuestion, section: 'story' | 'boss') {
    const update = section === 'story' ? setStoryAnswers : setBossAnswers
    update(previous => question.kind === 'single'
      ? [id]
      : previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id])
  }

  function submitStoryAnswer() {
    if (timedOut) return
    if (!storyAnswers.length) return
    const nextScore = storyScore + (answersMatch(storyAnswers, currentStory) ? currentStory.points : 0)
    setStoryScore(nextScore)
    if (storyIndex === storyQuestions.length - 1) {
      setStoryFinished(true)
      return
    }
    setStoryIndex(index => index + 1)
    setStoryAnswers([])
  }

  function startBoss() {
    if (timedOut || storyScore < STORY_PASS_SCORE) return
    showActionSignal('终场 Boss 核验已启动')
    setBossIndex(0)
    setBossAnswers([])
    setBossHp(bossMaxHp)
    syncSimulationHp(SIMULATION_MAX_HP)
    setBattleCorrect(0)
    setDamageBoost(false)
    setScreen('boss')
  }

  function resolveBossTurn(hit: boolean, itemDamage = 0) {
    if (timedOut) return
    const boostDamage = hit && damageBoost ? BOSS_BOOST_DAMAGE : 0
    const attackDamage = (hit ? bossHitDamage + boostDamage : 0) + itemDamage
    const hpPenalty = !hit && itemDamage === 0 ? PLAYER_MISS_DAMAGE : 0
    const nextCorrect = battleCorrect + (hit ? 1 : 0)
    const nextBossHp = Math.max(0, bossHp - attackDamage)
    const nextHp = Math.max(0, battleHp - hpPenalty)
    const answered = bossIndex + 1
    const bossDefeated = nextBossHp === 0
    const finished = nextHp === 0 || bossDefeated || bossIndex === bossQuestions.length - 1

    if (hit && damageBoost) setDamageBoost(false)
    setBattleCorrect(nextCorrect)
    setBossHp(nextBossHp)
    syncSimulationHp(nextHp)

    if (finished) {
      const accuracy = Math.round((nextCorrect / answered) * 100)
      const projectScore = Math.round((storyScore + accuracy) / 2)
      const victory = bossDefeated && nextHp > 0 && projectScore >= STORY_PASS_SCORE
      const medal: MedalTier = victory ? medalFromScore(projectScore) : 'none'
      const previousMedal = getProjectMedal(projectProgress, activeProject.id)
      const isNewTrophy = victory && previousMedal === 'none'
      const upgradedMedal = victory && medalRank(medal) > medalRank(previousMedal)
      const earnedCredit = victory ? creditForMedal(medal) : 0
      const earnedReward = victory ? { ...VICTORY_REWARD, trophies: isNewTrophy ? 1 : 0 } : REVIEW_REWARD
      updateWallet(current => ({
        ...current,
        coins: current.coins + earnedReward.coins,
        gems: current.gems + earnedReward.gems,
        trophies: current.trophies + (earnedReward.trophies ?? 0),
      }))
      if (upgradedMedal) {
        setProjectProgress(current => {
          const nextProgress = {
            ...current,
            [projectKey(activeProject.id)]: {
              medal,
              bestScore: Math.max(current[projectKey(activeProject.id)]?.bestScore ?? 0, projectScore),
              storyScore,
              bossAccuracy: accuracy,
              creditHours: earnedCredit,
              completedAt: new Date().toISOString(),
            },
          }
          localStorage.setItem(PROJECT_PROGRESS_KEY, JSON.stringify(nextProgress))
          const nextTrophies = summarizeTrophies(nextProgress).total
          setWallet(currentWallet => {
            const syncedWallet = { ...currentWallet, trophies: nextTrophies }
            localStorage.setItem(WALLET_KEY, JSON.stringify(syncedWallet))
            return syncedWallet
          })
          return nextProgress
        })
      }
      setBattleReward(earnedReward)
      setCreditAward(earnedCredit)
      setProjectXpAward(null)
      setPendingRouteFromProjectId(victory && isNewTrophy ? activeProject.id : null)
      setOutcome({ victory, correct: nextCorrect, total: answered, hp: nextHp, bossHp: nextBossHp, medal, projectScore })
      if (victory && medal !== 'none') {
        void awardProjectCompletionXp(activeProject, medal, projectScore)
      }
      setScreen('result')
      return
    }
    setBossIndex(index => index + 1)
    setBossAnswers([])
  }

  function submitBossAction() {
    if (!bossAnswers.length) return
    resolveBossTurn(answersMatch(bossAnswers, currentBoss))
  }

  function buyProduct(product: StoreProduct, currency: 'coins' | 'gems') {
    const cost = currency === 'coins' ? product.coinPrice : product.gemPrice
    if (wallet[currency] < cost) {
      showActionSignal('资源不足，已响应点击')
      return
    }
    updateWallet(current => current[currency] < cost ? current : ({
      ...current,
      [currency]: current[currency] - cost,
      inventory: { ...current.inventory, [product.id]: current.inventory[product.id] + 1 },
    }))
    showActionSignal(`${product.name}已加入战备仓库`)
  }

  function claimDailySupply() {
    const today = getSimulationDateKey()
    if (wallet.lastDailySupplyDate === today) {
      setNotice({
        tone: 'info',
        title: '今日补给已领取',
        message: '每日补给已经入账，明天可再次领取。',
        actionLabel: '知道了',
      })
      return
    }
    updateWallet(current => current.lastDailySupplyDate === today ? current : ({
      ...current,
      coins: current.coins + DAILY_SUPPLY_REWARD.coins,
      gems: current.gems + DAILY_SUPPLY_REWARD.gems,
      lastDailySupplyDate: today,
    }))
    setNotice({
      tone: 'success',
      title: '补给领取完成',
      message: `已到账 +${DAILY_SUPPLY_REWARD.coins} 金币、+${DAILY_SUPPLY_REWARD.gems} 钻石，资源已同步到右上角面板。`,
      actionLabel: '收下补给',
    })
    showActionSignal('补给已入账')
  }

  function chooseAuxiliaryCase() {
    setAuxiliaryCase(pickAuxiliaryCase(auxiliaryPool, auxiliaryCase?.productName))
    showActionSignal('辅助案例已刷新')
  }

  function selectPrimaryCarrier(carrierId: string) {
    localStorage.setItem(`${CARRIER_KEY_PREFIX}:${carrierRoute.id}`, carrierId)
    setSelectedCarrierId(carrierId)
    setAuxiliaryCase(null)
    showActionSignal('主案例已切换')
  }

  function useItem(item: ItemId) {
    if (wallet.inventory[item] < 1 || screen !== 'boss') {
      showActionSignal('道具暂不可用')
      return
    }
    if (item === 'boost' && damageBoost) {
      showActionSignal('增幅器已装载')
      return
    }
    if (item === 'heal' && battleHp >= SIMULATION_MAX_HP) {
      showActionSignal('HP 已满，无需补给')
      return
    }
    updateWallet(current => current.inventory[item] < 1 ? current : ({
      ...current,
      inventory: { ...current.inventory, [item]: current.inventory[item] - 1 },
    }))
    if (item === 'skip') {
      showActionSignal('跳题卡已使用')
      resolveBossTurn(false, BOSS_SKIP_DAMAGE)
      return
    }
    if (item === 'boost') {
      setDamageBoost(true)
      showActionSignal('增幅器已装载')
      return
    }
    syncSimulationHp(battleHp + HEAL_AMOUNT)
    showActionSignal('补给包已使用')
  }

  const entryProject = entryConfirm ? projects.find(project => project.id === entryConfirm.projectId) ?? activeProjectNode : null

  if (!launched) {
    return (
      <>
        <LaunchPanel
          displayName={displayName}
          player={player}
          wallet={wallet}
          trophySummary={trophySummary}
          creditSummary={creditSummary}
          educationTrack={educationTrack}
          major={major}
          project={activeProject}
          carrier={selectedCarrier}
          onLaunch={requestLaunchSimulation}
          onLeaderboard={openLeaderboard}
        />
        {actionSignal && <ActionSignalToast key={actionSignal.id} message={actionSignal.message} />}
        {entryConfirm && entryProject && (
          <ProjectEntryModal
            project={entryProject}
            carrier={selectedCarrier}
            fromLaunch={entryConfirm.fromLaunch}
            onConfirm={confirmProjectEntry}
            onCancel={() => setEntryConfirm(null)}
          />
        )}
        {notice && <NoticeModal notice={notice} onClose={() => setNotice(null)} />}
        {leaderboardOpen && (
          <LeaderboardModal
            entries={leaderboardEntries}
            currentUser={currentLeaderboardEntry}
            loading={leaderboardLoading}
            error={leaderboardError}
            onRefresh={openLeaderboard}
            onClose={() => setLeaderboardOpen(false)}
          />
        )}
      </>
    )
  }

  return (
    <div className={`${styles.root} ${styles.fullscreenRoot}`}>
      <main className={styles.world} aria-label="质量守护远征游戏地图">
        {actionSignal && <ActionSignalToast key={actionSignal.id} message={actionSignal.message} />}
        {showMapHome && (
          <div
            className={`${styles.mapArtboard} ${mapPanning ? styles.mapArtboardPanning : ''}`}
            style={mapPanStyle}
            onPointerDown={beginMapPan}
            onPointerMove={moveMapPan}
            onPointerUp={endMapPan}
            onPointerCancel={endMapPan}
            onWheel={wheelMapPan}
          >
            <Image src="/simulation/map-background.webp" alt="" fill sizes="100vw" priority className={styles.mapImage} />
            <div className={styles.mapShade} />
            <RouteLayer projects={projects} travel={routeTravel} avatarUrl={avatarUrl} displayName={displayName} />
            <ProjectMap projects={projects} onEnterProject={projectId => requestEnterProject(projectId, 'map')} interactive={screen === 'map' || screen === 'briefing'} />
          </div>
        )}
        {showHubChrome && (
          <>
            <GameRail
              onLeaderboard={openLeaderboard}
              onBackpack={openShopPanel}
              onSkills={() => openQuickPanel('skills')}
              onTools={openSupplyPanel}
            />
            <FloatingHeader
              title={screen === 'levels' ? '远征关卡档案' : '质量守护远征'}
              onExit={requestLeaveSimulation}
            />
            <HubNavTabs
              screen={screen}
              onMap={() => navigateHub('map', '已切换地图主页')}
              onLevels={() => navigateHub('levels', '已切换关卡总览')}
              onTask={() => requestEnterProject(selectedProjectId, screen === 'levels' ? 'levels' : 'map')}
            />
            <ResourceDock wallet={wallet} trophySummary={trophySummary} creditSummary={creditSummary} onSupply={openSupplyPanel} onShop={openShopPanel} onTrophies={openTrophyPanel} />
            <TopActionDock
              onMessages={() => openQuickPanel('messages')}
              onSettings={() => openQuickPanel('settings')}
            />
            <SocialDock
              onMentor={() => openQuickPanel('mentor')}
              onFriends={() => openQuickPanel('friends')}
              onReport={openLearningReport}
            />
            <div className={styles.progressBadge}>
              <Target size={17} />
              <span>远征进度</span>
              <strong>{trophySummary.total} / {PROJECT_MISSIONS.length - 1} 已完成</strong>
            </div>
          </>
        )}

        {screen === 'levels' && (
          <LevelHub
            projects={projects}
            onEnterProject={projectId => requestEnterProject(projectId, 'levels')}
            onMap={() => navigateHub('map', '已切换地图主页')}
          />
        )}

        {showMapHome && (
          <>
            <button type="button" className={styles.mapRecenterButton} onClick={() => {
              recenterMap(activeProjectNode)
              refreshMotion('地图定位已刷新')
            }} aria-label="地图复位">
              <Target size={17} />
            </button>
            <div className={styles.mapLegend}>
              <span><i className={styles.clearedDot} />已通关</span>
              <span><i className={styles.activeDot} />进行中</span>
              <span><i className={styles.lockedDot} />待解锁</span>
            </div>
            <aside className={`${styles.sidePanel} ${screen === 'briefing' ? styles.taskPanel : ''}`} aria-label="任务面板">
              {screen === 'map' && (
                <DashboardPanel
                  displayName={displayName}
                  realName={realName}
                  avatarUrl={avatarUrl}
                  player={player}
                  wallet={wallet}
                  hp={simulationHp}
                  trophySummary={trophySummary}
                  creditSummary={creditSummary}
                  educationTrack={educationTrack}
                  project={activeProject}
                  carrier={selectedCarrier}
                  onEnterProject={() => requestEnterProject(selectedProjectId, 'map')}
                  onShop={openShopPanel}
                  onTrophies={openTrophyPanel}
                  onLeaderboard={openLeaderboard}
                />
              )}
              {screen === 'briefing' && (
                <BriefingPanel
                  project={activeProject}
                  projectNode={activeProjectNode}
                  educationTrack={educationTrack}
                  major={major}
                  carrierRoute={carrierRoute}
                  carriers={primaryCarriers}
                  selectedCarrier={selectedCarrier}
                  auxiliaryCase={auxiliaryCase}
                  auxiliaryAvailable={auxiliaryPool.length > 0}
                  selectedRole={selectedRole}
                  storyAnswerKey={activeProject.id === 1 ? answerKeyFor(storyQuestions) : []}
                  bossAnswerKey={activeProject.id === 1 ? answerKeyFor(bossQuestions) : []}
                  onBack={() => navigateHub(briefingReturnScreen, briefingReturnScreen === 'levels' ? '已返回关卡总览' : '已返回地图主页')}
                  onSelectCarrier={selectPrimaryCarrier}
                  onDrawAuxiliary={chooseAuxiliaryCase}
                  onBegin={startStory}
                />
              )}
            </aside>
          </>
        )}

        {screen === 'story' && selectedRole && (
          <StoryPanel
            project={activeProject}
            role={selectedRole}
            educationTrack={educationTrack}
            carrier={selectedCarrier}
            questions={storyQuestions}
            question={currentStory}
            questionIndex={storyIndex}
            answers={storyAnswers}
            score={storyScore}
            finished={storyFinished}
            remainingTime={remainingTime}
            timedOut={timedOut}
            onBack={() => navigateHub('briefing', '已返回调查简报')}
            onExit={requestLeaveSimulation}
            onSelectAnswer={id => chooseAnswer(id, currentStory, 'story')}
            onContinue={submitStoryAnswer}
            onRetry={startStory}
            onBoss={startBoss}
          />
        )}

        {screen === 'boss' && selectedRole && (
          <BossPanel
            project={activeProject}
            role={selectedRole}
            educationTrack={educationTrack}
            carrier={selectedCarrier}
            questions={bossQuestions}
            hp={battleHp}
            bossHp={bossHp}
            bossMaxHp={bossMaxHp}
            bossHitDamage={bossHitDamage}
            playerMissDamage={PLAYER_MISS_DAMAGE}
            correct={battleCorrect}
            question={currentBoss}
            questionIndex={bossIndex}
            answers={bossAnswers}
            wallet={wallet}
            damageBoost={damageBoost}
            remainingTime={remainingTime}
            timedOut={timedOut}
            onBack={() => navigateHub('story', '已返回剧情调查')}
            onExit={requestLeaveSimulation}
            onSelectAnswer={id => chooseAnswer(id, currentBoss, 'boss')}
            onSubmit={submitBossAction}
            onUseItem={useItem}
            onShop={openShopPanel}
          />
        )}

        {screen === 'result' && selectedRole && outcome && (
          <ResultPanel project={activeProject} role={selectedRole} educationTrack={educationTrack} carrier={selectedCarrier} outcome={outcome} reward={battleReward} storyScore={storyScore} creditAward={creditAward} xpAward={projectXpAward} remainingTime={remainingTime} onMap={returnToMapFromResult} onReplay={() => requestEnterProject(activeProject.id, 'map')} onExit={requestLeaveSimulation} />
        )}

        {supplyOpen && (
          <SupplyModal
            wallet={wallet}
            onClaimDaily={claimDailySupply}
            onClose={() => setSupplyOpen(false)}
          />
        )}
        {shopOpen && (
          <ShopModal
            wallet={wallet}
            onClose={() => setShopOpen(false)}
            onBuy={buyProduct}
            onFindSupply={() => {
              setShopOpen(false)
              openSupplyPanel()
            }}
          />
        )}
        {trophyOpen && (
          <TrophyModal
            projects={projects}
            progress={projectProgress}
            trophySummary={trophySummary}
            creditSummary={creditSummary}
            onClose={() => setTrophyOpen(false)}
          />
        )}
        {leaderboardOpen && (
          <LeaderboardModal
            entries={leaderboardEntries}
            currentUser={currentLeaderboardEntry}
            loading={leaderboardLoading}
            error={leaderboardError}
            onRefresh={openLeaderboard}
            onClose={() => setLeaderboardOpen(false)}
          />
        )}
        {quickPanel && (
          <QuickPanelModal
            panel={quickPanel}
            player={player}
            wallet={wallet}
            project={activeProject}
            trophySummary={trophySummary}
            creditSummary={creditSummary}
            onClose={() => setQuickPanel(null)}
          />
        )}
        {learningReportOpen && (
          <LearningReportModal
            projects={projects}
            progress={projectProgress}
            player={player}
            wallet={wallet}
            trophySummary={trophySummary}
            creditSummary={creditSummary}
            onClose={() => setLearningReportOpen(false)}
          />
        )}
        {entryConfirm && entryProject && (
          <ProjectEntryModal
            project={entryProject}
            carrier={selectedCarrier}
            fromLaunch={entryConfirm.fromLaunch}
            onConfirm={confirmProjectEntry}
            onCancel={() => setEntryConfirm(null)}
          />
        )}
        {exitConfirmOpen && (
          <ExitConfirmModal
            project={activeProject}
            onConfirm={leaveSimulation}
            onCancel={() => setExitConfirmOpen(false)}
          />
        )}
        {notice && <NoticeModal notice={notice} onClose={() => setNotice(null)} />}
      </main>
    </div>
  )
}

function ActionSignalToast({ message }: { message: string }) {
  return (
    <div className={styles.actionSignal} role="status" aria-live="polite">
      <Sparkles size={16} />
      <span>{message}</span>
    </div>
  )
}

function ProjectEntryModal({
  project,
  carrier,
  fromLaunch,
  onConfirm,
  onCancel,
}: {
  project: ProjectNode
  carrier: CarrierCase
  fromLaunch?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className={styles.modalScrim} role="presentation" onMouseDown={onCancel}>
      <section className={styles.confirmModal} role="dialog" aria-modal="true" aria-labelledby="entry-confirm-title" onMouseDown={event => event.stopPropagation()}>
        <button type="button" className={styles.closeButton} onClick={onCancel} aria-label="关闭进入确认"><X size={19} /></button>
        <div className={styles.confirmIcon}><ShieldCheck size={31} /></div>
        <p className={styles.eyebrow}>{fromLaunch ? 'FULLSCREEN ENTRY' : 'PROJECT ENTRY'}</p>
        <h2 id="entry-confirm-title">是否进入项目？</h2>
        <p>即将进入「{project.title}」。进入后会加载项目简报、案例角色与限时训练进度。</p>
        <div className={styles.confirmSummary}>
          <span><FileSearch size={16} />{carrier.productName}</span>
          <span><Clock3 size={16} />{Math.floor(SIMULATION_TIME_LIMIT_SECONDS / 60)} 分钟</span>
          <span><Target size={16} />{project.curriculum}</span>
        </div>
        <div className={styles.confirmActions}>
          <button type="button" className={styles.secondaryButton} onClick={onCancel}>再看一下</button>
          <button type="button" className={styles.primaryButton} onClick={onConfirm}>确认进入 <ArrowRight size={18} /></button>
        </div>
      </section>
    </div>
  )
}

function ExitConfirmModal({ project, onConfirm, onCancel }: { project: ProjectDefinition; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className={styles.modalScrim} role="presentation" onMouseDown={onCancel}>
      <section className={`${styles.confirmModal} ${styles.exitConfirmModal}`} role="dialog" aria-modal="true" aria-labelledby="exit-confirm-title" onMouseDown={event => event.stopPropagation()}>
        <button type="button" className={styles.closeButton} onClick={onCancel} aria-label="关闭退出确认"><X size={19} /></button>
        <div className={styles.confirmIcon}><ShieldAlert size={31} /></div>
        <p className={styles.eyebrow}>EXIT CHECK</p>
        <h2 id="exit-confirm-title">该项目还没完成，是否退出？</h2>
        <p>「{project.title}」当前还没有形成通关结算。退出后本次剧情或战斗进度不会记入项目成绩。</p>
        <div className={styles.confirmActions}>
          <button type="button" className={styles.secondaryButton} onClick={onCancel}>继续训练</button>
          <button type="button" className={`${styles.primaryButton} ${styles.dangerButton}`} onClick={onConfirm}>确认退出 <ArrowRight size={18} /></button>
        </div>
      </section>
    </div>
  )
}

function NoticeModal({ notice, onClose }: { notice: NoticeMessage; onClose: () => void }) {
  const Icon = notice.tone === 'success' ? CheckCircle2 : notice.tone === 'warning' ? ShieldAlert : Sparkles
  return (
    <div className={styles.modalScrim} role="presentation" onMouseDown={onClose}>
      <section className={`${styles.noticeModal} ${styles[`notice${notice.tone[0].toUpperCase()}${notice.tone.slice(1)}`]}`} role="dialog" aria-modal="true" aria-labelledby="notice-title" onMouseDown={event => event.stopPropagation()}>
        <div className={styles.noticeIcon}><Icon size={32} /></div>
        <p className={styles.eyebrow}>SYSTEM FEEDBACK</p>
        <h2 id="notice-title">{notice.title}</h2>
        <p>{notice.message}</p>
        <button type="button" className={styles.primaryButton} onClick={onClose}>{notice.actionLabel ?? '知道了'}</button>
      </section>
    </div>
  )
}

function QuickPanelModal({
  panel,
  player,
  wallet,
  project,
  trophySummary,
  creditSummary,
  onClose,
}: {
  panel: QuickPanel
  player: PlayerState
  wallet: Wallet
  project: ProjectDefinition
  trophySummary: TrophySummary
  creditSummary: ReturnType<typeof summarizeCredit>
  onClose: () => void
}) {
  const supplyCount = wallet.inventory.skip + wallet.inventory.boost + wallet.inventory.heal
  const config = {
    mentor: {
      icon: Bot,
      eyebrow: 'AI MENTOR',
      title: 'AI导师',
      intro: `建议先围绕「${project.title}」整理证据链，再进入 Boss 核验。遇到不确定项时，优先排查 GMP 条款、记录完整性和人员职责。`,
      rows: [
        ['当前等级', `Lv.${player.rankLevel} ${player.rankTitle}`],
        ['本关建议', '先看任务简报，再进入五关调查'],
        ['提问方向', '法规依据 / 风险判断 / CAPA 思路'],
      ],
    },
    friends: {
      icon: UsersRound,
      eyebrow: 'FRIENDS',
      title: '好友动态',
      intro: '好友入口已放在右下角，后续可接入班级同伴、互助邀请和通关记录。当前先展示轻量动态，点击有明确反馈。',
      rows: [
        ['同伴状态', '3 人在线学习'],
        ['互助提示', '可围绕同一项目交换证据线索'],
        ['挑战建议', '通关后刷新排行榜更明显'],
      ],
    },
    skills: {
      icon: BrainCircuit,
      eyebrow: 'SKILL TREE',
      title: '技能树',
      intro: '技能树按法规理解、现场调查、偏差分析、CAPA 输出四条能力线组织，后续可根据通关项目自动点亮节点。',
      rows: [
        ['已获奖章', `${trophySummary.total} 枚`],
        ['课时分', `${creditSummary.gameEarned} / ${creditSummary.gameRequired}`],
        ['道具储备', `${supplyCount} 件`],
      ],
    },
    messages: {
      icon: Bell,
      eyebrow: 'MESSAGES',
      title: '消息',
      intro: '今日消息已汇总到顶部右侧，后续可以接任务提醒、通关奖励和老师点评。',
      rows: [
        ['任务提醒', `当前可进入「${project.title}」`],
        ['补给提醒', wallet.lastDailySupplyDate === getSimulationDateKey() ? '今日补给已领取' : '今日补给待领取'],
        ['排行榜', '通关后 XP 会计入排名'],
      ],
    },
    settings: {
      icon: Settings,
      eyebrow: 'SETTINGS',
      title: '设置',
      intro: '设置入口已移到顶部最右侧。当前保留轻量面板，避免打断实训流程，后续可接音量、动画强度和辅助提示。',
      rows: [
        ['界面模式', '沉浸式导航'],
        ['动画强度', '精简过渡'],
        ['提示反馈', '点击即显示状态'],
      ],
    },
  }[panel]
  const Icon = config.icon

  return (
    <div className={styles.modalScrim} role="presentation" onMouseDown={onClose}>
      <section className={styles.quickPanelModal} role="dialog" aria-modal="true" aria-labelledby="quick-panel-title" onMouseDown={event => event.stopPropagation()}>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="关闭面板"><X size={19} /></button>
        <header className={styles.quickPanelHeader}>
          <div className={styles.quickPanelIcon}><Icon size={28} /></div>
          <div>
            <p className={styles.eyebrow}>{config.eyebrow}</p>
            <h2 id="quick-panel-title">{config.title}</h2>
          </div>
        </header>
        <p className={styles.quickPanelIntro}>{config.intro}</p>
        <div className={styles.quickPanelStats}>
          {config.rows.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <button type="button" className={styles.primaryButton} onClick={onClose}>知道了</button>
      </section>
    </div>
  )
}

function LearningReportModal({
  projects,
  progress,
  player,
  wallet,
  trophySummary,
  creditSummary,
  onClose,
}: {
  projects: ProjectNode[]
  progress: ProjectProgress
  player: PlayerState
  wallet: Wallet
  trophySummary: TrophySummary
  creditSummary: ReturnType<typeof summarizeCredit>
  onClose: () => void
}) {
  const regularProjects = projects.filter(project => !project.finalBoss)
  const completedProjects = regularProjects.filter(project => project.status === 'cleared')
  const progressPercent = regularProjects.length ? Math.round((completedProjects.length / regularProjects.length) * 100) : 0
  const creditPercent = creditSummary.gameRequired ? Math.min(100, Math.round((creditSummary.gameEarned / creditSummary.gameRequired) * 100)) : 0
  const latestProject = [...completedProjects].reverse()[0]
  const supplyCount = wallet.inventory.skip + wallet.inventory.boost + wallet.inventory.heal

  return (
    <div className={styles.modalScrim} role="presentation" onMouseDown={onClose}>
      <section className={styles.learningReportModal} role="dialog" aria-modal="true" aria-labelledby="learning-report-title" onMouseDown={event => event.stopPropagation()}>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="关闭学习报告"><X size={19} /></button>
        <header className={styles.reportHeader}>
          <div className={styles.modalIcon}><BookOpen size={30} /></div>
          <div>
            <p className={styles.eyebrow}>LEARNING REPORT</p>
            <h2 id="learning-report-title">学习报告</h2>
            <span>按当前本地通关记录统计，展示通关进度、课时分、XP 和道具储备。</span>
          </div>
        </header>

        <section className={styles.reportHero}>
          <div>
            <span>通关进度</span>
            <strong>{completedProjects.length} / {regularProjects.length}</strong>
          </div>
          <div className={styles.reportProgress}>
            <progress value={progressPercent} max={100} aria-label="通关进度" />
            <span>{progressPercent}%</span>
          </div>
          <p>{latestProject ? `最近通关：${latestProject.title}` : '还没有通关记录，先完成当前解锁项目即可生成完整报告。'}</p>
        </section>

        <div className={styles.reportStatsGrid}>
          <div><GraduationCap size={18} /><span>获得课时分</span><strong>{creditSummary.gameEarned} / {creditSummary.gameRequired}</strong><small>{creditPercent}%</small></div>
          <div><Sparkles size={18} /><span>当前 XP</span><strong>{player.xp.toLocaleString()}</strong><small>Lv.{player.rankLevel}</small></div>
          <div><Trophy size={18} /><span>奖章</span><strong>{trophySummary.total}</strong><small>金 {trophySummary.gold} / 银 {trophySummary.silver} / 铜 {trophySummary.bronze}</small></div>
          <div><Backpack size={18} /><span>背包道具</span><strong>{supplyCount}</strong><small>跳题 {wallet.inventory.skip} · 增幅 {wallet.inventory.boost} · 补给 {wallet.inventory.heal}</small></div>
        </div>

        <div className={styles.reportTimeline}>
          {regularProjects.slice(0, 6).map(project => {
            const record = progress[projectKey(project.id)]
            const statusLabel = project.status === 'cleared' ? '已通关' : project.status === 'active' ? '进行中' : '待解锁'
            return (
              <div key={project.id}>
                <span>{String(project.id).padStart(2, '0')}</span>
                <strong>{project.title}</strong>
                <em>{record ? `${record.creditHours} 课时分 · ${medalLabel(record.medal)}` : statusLabel}</em>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function LaunchPanel({
  displayName,
  player,
  wallet,
  trophySummary,
  creditSummary,
  educationTrack,
  major,
  project,
  carrier,
  onLaunch,
  onLeaderboard,
}: {
  displayName: string
  player: PlayerState
  wallet: Wallet
  trophySummary: TrophySummary
  creditSummary: ReturnType<typeof summarizeCredit>
  educationTrack: EducationTrack
  major: string
  project: ProjectDefinition
  carrier: CarrierCase
  onLaunch: () => void
  onLeaderboard: () => void
}) {
  const supplies = wallet.inventory.skip + wallet.inventory.boost + wallet.inventory.heal
  const projectBaseXp = project.finalBoss ? FINAL_BOSS_COMPLETION_BASE_XP : PROJECT_COMPLETION_BASE_XP
  const projectMinimumXp = projectBaseXp + PROJECT_MEDAL_BONUS_XP.bronze
  const previewStyle = {
    '--preview-x': project.position.left,
    '--preview-y': project.position.top,
  } as CSSProperties

  return (
    <div className={`${styles.root} ${styles.launchRoot}`}>
      <main className={styles.launchConsole} aria-label="实训仿真启动台">
        <section className={styles.launchHero}>
          <div className={styles.launchCopy}>
            <div className={styles.launchStatus}><span />训练环境在线</div>
            <p className={styles.launchEyebrow}>GMP IMMERSIVE TRAINING / {project.missionCode}</p>
            <h1>质量守护远征</h1>
            <p className={styles.launchLead}>
              进入{project.curriculum}剧情现场，围绕{carrier.productName}完成证据判断、角色访谈与 Boss 核验。
            </p>
            <div className={styles.launchCase}>
              <div>
                <small>当前任务</small>
                <strong>{project.title}</strong>
              </div>
              <div className={styles.caseTags}>
                <span><FileSearch size={14} /> {carrier.dosageForm}案例</span>
                <span><Clock3 size={14} /> {Math.floor(SIMULATION_TIME_LIMIT_SECONDS / 60)} 分钟</span>
              </div>
            </div>
            <div className={styles.launchRewardStrip} aria-label="项目奖励与排行">
              <span>
                <Zap size={16} />
                <strong>项目通关 XP</strong>
                <small>完成后 +{projectMinimumXp} XP 起，奖牌越高加成越多</small>
              </span>
              <span>
                <Medal size={16} />
                <strong>实时排行榜</strong>
                <small>按全站 XP 排名，完成项目后自动刷新战力</small>
              </span>
            </div>
            <div className={styles.launchActionRow}>
              <button type="button" className={styles.launchButton} onClick={onLaunch}>
              启动全屏实训 <ChevronRight size={20} />
              </button>
              <button type="button" className={styles.launchLeaderboardButton} onClick={onLeaderboard}>
                <Medal size={18} /> 查看排行榜
              </button>
            </div>
            <p className={styles.launchNotice}>
              <ShieldCheck size={17} />
              进入后地图、剧情调查与终场核验均保持全屏呈现
            </p>
          </div>

          <div className={styles.launchPreview} aria-label="项目地图预览" style={previewStyle}>
            <Image
              src="/simulation/map-background.webp"
              alt="质量守护远征项目地图预览"
              fill
              sizes="(max-width: 900px) 100vw, 52vw"
              priority
              className={styles.launchImage}
            />
            <div className={styles.launchImageWash} />
            <div className={styles.previewBar}>
              <span><Building2 size={15} /> 制药质量远征地图</span>
              <strong>{String(trophySummary.total).padStart(2, '0')} / {PROJECT_MISSIONS.length - 1}</strong>
            </div>
            <div className={`${styles.previewNode} ${project.labelSide === 'left' ? styles.previewNodeLeft : ''}`}>
              <span><Target size={18} /></span>
              <div>
                <small>当前解锁项目</small>
                <strong>{project.title}</strong>
              </div>
            </div>
            <div className={styles.previewRoute}>
              <span>证据保全</span>
              <i />
              <span>角色研判</span>
              <i />
              <span>终场核验</span>
            </div>
          </div>
        </section>

        <section className={styles.launchMetrics} aria-label="训练状态">
          <article>
            <GraduationCap size={20} />
            <div><small>{major} · {trackLabel(educationTrack)}</small><strong>{displayName}</strong></div>
          </article>
          <article>
            <Sparkles size={20} />
            <div><small>当前等级</small><strong>Lv.{player.rankLevel} {player.rankTitle}</strong></div>
          </article>
          <article>
            <Package size={20} />
            <div><small>战术道具</small><strong>{supplies} 件可用</strong></div>
          </article>
          <article>
            <Shield size={20} />
            <div><small>课时进度</small><strong>{creditSummary.gameEarned} / {creditSummary.gameRequired} 游戏课时</strong></div>
          </article>
          <article>
            <Zap size={20} />
            <div><small>项目奖励</small><strong>+{projectMinimumXp} XP 起</strong></div>
          </article>
          <button type="button" className={styles.launchMetricButton} onClick={onLeaderboard}>
            <Medal size={20} />
            <div><small>排行榜</small><strong>查看 XP 排名</strong></div>
          </button>
        </section>
      </main>
    </div>
  )
}

function GameRail({
  onLeaderboard,
  onBackpack,
  onSkills,
  onTools,
}: {
  onLeaderboard: () => void
  onBackpack: () => void
  onSkills: () => void
  onTools: () => void
}) {
  const entries = [
    { label: '排行', icon: Trophy, action: onLeaderboard },
    { label: '背包', icon: Backpack, action: onBackpack },
    { label: '技能树', icon: BrainCircuit, action: onSkills },
    { label: '工具', icon: Wrench, action: onTools },
  ]

  return (
    <nav className={styles.gameRail} aria-label="实训功能导航">
      {entries.map(({ label, icon: Icon, action }) => (
        <button
          type="button"
          key={label}
          className={styles.railButton}
          onClick={action}
        >
          <Icon size={21} />
          <span>{label}</span>
        </button>
      ))}
      <div className={styles.railMission}>
        <strong>07</strong>
        <span>远征工具</span>
      </div>
    </nav>
  )
}

function SimulationTopNav({
  title,
  screen,
  wallet,
  trophySummary,
  creditSummary,
  onExit,
  onMap,
  onLevels,
  onTask,
  onSupply,
  onTrophies,
  onMessages,
  onSettings,
}: {
  title: string
  screen: Screen
  wallet: Wallet
  trophySummary: TrophySummary
  creditSummary: ReturnType<typeof summarizeCredit>
  onExit: () => void
  onMap: () => void
  onLevels: () => void
  onTask: () => void
  onSupply: () => void
  onTrophies: () => void
  onMessages: () => void
  onSettings: () => void
}) {
  const tabs = [
    { label: '地图', icon: Building2, action: onMap, current: screen === 'map' },
    { label: '关卡', icon: Swords, action: onLevels, current: screen === 'levels' },
    { label: '任务', icon: ClipboardCheck, action: onTask, current: screen === 'briefing' },
  ]

  return (
    <header className={styles.topNav}>
      <div className={styles.topBrand}>
        <button type="button" className={styles.topExit} onClick={onExit} aria-label="退出实训">
          <ArrowLeft size={19} />
        </button>
        <div className={styles.topBrandMark}><Shield size={20} /></div>
        <div className={styles.topBrandText}>
          <span>GMP 实训仿真</span>
          <strong>{title}</strong>
        </div>
      </div>

      <nav className={styles.topTabs} aria-label="实训主导航">
        {tabs.map(({ label, icon: Icon, action, current }) => (
          <button
            type="button"
            key={label}
            className={`${styles.topTab} ${current ? styles.topTabActive : ''}`}
            aria-current={current ? 'page' : undefined}
            onClick={action}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className={styles.topResources} aria-label="资源状态">
        <button type="button" className={styles.topSupply} onClick={onSupply}>
          <HeartPulse size={15} />
          <span>补给</span>
        </button>
        <span className={styles.topStat}><Coins size={15} />{wallet.coins.toLocaleString()}</span>
        <span className={styles.topStat}><Gem size={15} />{wallet.gems.toLocaleString()}</span>
        <button type="button" className={styles.topStatButton} onClick={onTrophies} aria-label="查看奖章与课时分">
          <Trophy size={15} />{trophySummary.total.toLocaleString()}
        </button>
        <span className={styles.topStat}><GraduationCap size={15} />{creditSummary.gameEarned}/{creditSummary.gameRequired}</span>
      </div>

      <div className={styles.topActions}>
        <button type="button" className={styles.topIconButton} onClick={onMessages}>
          <Bell size={17} />
          <span>消息</span>
        </button>
        <button type="button" className={styles.topIconButton} onClick={onSettings}>
          <Settings size={17} />
          <span>设置</span>
        </button>
      </div>
    </header>
  )
}

function HubNavTabs({
  screen,
  onMap,
  onLevels,
  onTask,
}: {
  screen: Screen
  onMap: () => void
  onLevels: () => void
  onTask: () => void
}) {
  const tabs = [
    { label: '地图', icon: Building2, action: onMap, current: screen === 'map' },
    { label: '关卡', icon: Swords, action: onLevels, current: screen === 'levels' },
    { label: '任务', icon: ClipboardCheck, action: onTask, current: screen === 'briefing' },
  ]

  return (
    <nav className={styles.hubTabs} aria-label="实训主导航">
      {tabs.map(({ label, icon: Icon, action, current }) => (
        <button
          type="button"
          key={label}
          className={`${styles.hubTab} ${current ? styles.hubTabActive : ''}`}
          aria-current={current ? 'page' : undefined}
          onClick={action}
        >
          <Icon size={16} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}

function TopActionDock({ onMessages, onSettings }: { onMessages: () => void; onSettings: () => void }) {
  return (
    <div className={styles.topActionDock} aria-label="消息和设置">
      <button type="button" onClick={onMessages}>
        <Bell size={17} />
        <span>消息</span>
      </button>
      <button type="button" onClick={onSettings}>
        <Settings size={17} />
        <span>设置</span>
      </button>
    </div>
  )
}

function SocialDock({ onMentor, onFriends, onReport }: { onMentor: () => void; onFriends: () => void; onReport: () => void }) {
  return (
    <aside className={styles.socialDock} aria-label="学习辅助入口">
      <button type="button" className={styles.socialDockButton} onClick={onMentor}>
        <Bot size={18} />
        <span>AI导师</span>
      </button>
      <button type="button" className={styles.socialDockButton} onClick={onFriends}>
        <UsersRound size={18} />
        <span>好友</span>
      </button>
      <button type="button" className={`${styles.socialDockButton} ${styles.socialReportButton}`} onClick={onReport}>
        <BookOpen size={18} />
        <span>学习报告</span>
      </button>
    </aside>
  )
}

function FloatingHeader({ title, onExit }: { title: string; onExit: () => void }) {
  return (
    <header className={styles.floatingBrand}>
      <button type="button" className={styles.headerExit} onClick={onExit} aria-label="退出实训">
        <ArrowLeft size={20} />
      </button>
      <div className={styles.brandMark}><Shield size={22} /></div>
      <div>
        <p className={styles.eyebrow}>GMP 实训仿真</p>
        <h1>{title}</h1>
      </div>
    </header>
  )
}

function LevelHub({ projects, onEnterProject, onMap }: { projects: ProjectNode[]; onEnterProject: (projectId: number) => void; onMap: () => void }) {
  const regularProjects = projects.filter(project => !project.finalBoss)
  const completeCount = regularProjects.filter(project => project.status === 'cleared').length
  const activeCount = projects.filter(project => project.status === 'active').length

  return (
    <section className={styles.levelHub} aria-label="关卡总览">
      <header className={styles.levelHeader}>
        <div>
          <p className={styles.eyebrow}>CHAPTER ARCHIVE / GMP QUALITY QUEST</p>
          <h2>远征关卡总览</h2>
          <p>从法规基础到体系会战，按路径完成每一次质量决策挑战。</p>
        </div>
        <button type="button" className={styles.levelMapButton} onClick={onMap}>
          <ArrowLeft size={17} />返回地图主页
        </button>
      </header>
      <div className={styles.levelProgress}>
        <div><strong>{completeCount}</strong><span>已通关</span></div>
        <div><strong>{String(activeCount).padStart(2, '0')}</strong><span>可挑战</span></div>
        <div><strong>{projects.length - completeCount - activeCount}</strong><span>待解锁</span></div>
        <progress value={completeCount} max={projects.length - 1} aria-label="关卡完成进度" />
        <small>{completeCount} / {projects.length - 1} 个常规项目完成</small>
      </div>
      <div className={styles.levelGrid}>
        {projects.map(project => {
          const statusLabel = project.status === 'active' ? '可挑战' : project.status === 'cleared' ? '已通关' : '待解锁'
          const playable = project.status !== 'locked'
          return (
            <article key={project.id} className={`${styles.levelCard} ${styles[`level${project.status[0].toUpperCase()}${project.status.slice(1)}`]}`}>
              <div className={styles.levelCardHead}>
                <span>PROJECT {String(project.id).padStart(2, '0')}</span>
                <i className={`${styles.nodeStatus} ${styles[`status${project.status[0].toUpperCase()}${project.status.slice(1)}`]}`}>{statusLabel}</i>
              </div>
              <div className={styles.levelIcon}>
                {project.status === 'locked' ? <Lock size={24} /> : <Swords size={25} />}
              </div>
              <small>{project.curriculum}</small>
              <h3>{project.title}</h3>
              <p>
                {playable && project.status === 'cleared'
                  ? `${medalLabel(project.medal)}已获得，可重复挑战刷金牌。`
                  : project.status === 'active'
                    ? '训练区域已解锁，进入现场完成证据链调查。'
                    : project.finalBoss
                      ? '完成全部常规项目后开启最终总测。'
                      : '完成前序关卡后开放此训练区域。'}
              </p>
              {playable ? (
                <button type="button" onClick={() => onEnterProject(project.id)}>{project.status === 'cleared' ? '再次挑战' : '进入关卡'} <ChevronRight size={16} /></button>
              ) : (
                <span className={styles.levelCardFoot}>尚未开放</span>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function ResourceDock({ wallet, trophySummary, creditSummary, onSupply, onShop, onTrophies }: { wallet: Wallet; trophySummary: TrophySummary; creditSummary: ReturnType<typeof summarizeCredit>; onSupply: () => void; onShop: () => void; onTrophies: () => void }) {
  return (
    <div className={styles.resourceDock} aria-label="远征资源">
      <button type="button" className={styles.mapSupply} onClick={onSupply}><HeartPulse size={17} /><span>补给训练</span></button>
      <button type="button" className={styles.shopEntry} onClick={onShop}><ShoppingBag size={16} /><span>道具商店</span></button>
      <span className={styles.resourceCoin}><Coins size={16} />{wallet.coins.toLocaleString()}</span>
      <span className={styles.resourceGem}><Gem size={16} />{wallet.gems.toLocaleString()}</span>
      <button type="button" className={`${styles.resourceKit} ${styles.trophyButton}`} onClick={onTrophies} aria-label="查看奖杯统计"><Trophy size={16} />{trophySummary.total.toLocaleString()}</button>
      <span className={styles.resourceCredit}><GraduationCap size={16} />{creditSummary.gameEarned}/{creditSummary.gameRequired}</span>
    </div>
  )
}

function RouteLayer({
  projects,
  travel,
  avatarUrl,
  displayName,
}: {
  projects: ProjectNode[]
  travel: RouteTravel | null
  avatarUrl: string | null
  displayName: string
}) {
  const segments = projects
    .slice(1)
    .map((project, index) => {
      const previous = projects[index]
      const advancing = travel?.fromId === previous.id && travel.toId === project.id
      const visible = advancing || (previous.status === 'cleared' && project.status !== 'locked')
      return {
        from: previous,
        to: project,
        path: routePathBetween(previous, project, index),
        active: previous.status === 'cleared' && project.status === 'active',
        completed: previous.status === 'cleared' && project.status === 'cleared',
        advancing,
        visible,
      }
    })
    .filter(segment => segment.visible)
  const travelSegment = travel ? segments.find(segment => segment.from.id === travel.fromId && segment.to.id === travel.toId) : null
  const travelIndex = travelSegment ? projects.findIndex(project => project.id === travelSegment.from.id) : 0
  const avatarStyle = travelSegment ? routeAvatarStyleBetween(travelSegment.from, travelSegment.to, travelIndex) : undefined
  const avatarInitial = displayName.trim().slice(0, 1) || 'G'

  if (!segments.length) return null

  return (
    <>
      <div className={styles.routeLayer} aria-hidden="true">
        <svg className={styles.routeSvg} viewBox="0 0 100 100" preserveAspectRatio="none">
          {segments.map(segment => (
            <g
              key={`${segment.from.id}-${segment.to.id}`}
              className={`${styles.routeSegment} ${segment.active ? styles.routeActive : ''} ${segment.completed ? styles.routeCompleted : ''} ${segment.advancing ? styles.routeAdvancing : ''}`}
            >
              <path className={styles.routeShadow} d={segment.path} />
              <path className={styles.routeTrack} d={segment.path} />
              <path className={styles.routeDash} d={segment.path} />
            </g>
          ))}
        </svg>
      </div>
      {travelSegment && avatarStyle && (
        <div key={travel?.key} className={styles.routeAvatarLayer} aria-hidden="true">
          <div className={styles.routeAvatarBadge} style={avatarStyle}>
            {avatarUrl
              ? <Image src={avatarUrl} alt="" fill unoptimized className={styles.routeAvatarImage} />
              : <span>{avatarInitial}</span>}
          </div>
        </div>
      )}
    </>
  )
}

function ProjectMap({ projects, onEnterProject, interactive }: { projects: ProjectNode[]; onEnterProject: (projectId: number) => void; interactive: boolean }) {
  return (
    <section className={styles.projectLayer} aria-label="课程项目地图">
      {projects.map(project => {
        const statusLabel = project.status === 'active' ? '可挑战' : project.status === 'cleared' ? '已通关' : '待解锁'
        const playable = project.status !== 'locked'
        return (
          <button
            type="button"
            key={project.id}
            className={`${styles.projectNode} ${styles[project.status]} ${project.labelSide === 'left' ? styles.labelLeft : ''}`}
            style={project.position}
            disabled={!playable || !interactive}
            onClick={() => onEnterProject(project.id)}
            aria-label={`${project.title}，${project.status === 'active' ? '点击进入' : project.status === 'cleared' ? '已通关' : '尚未解锁'}`}
            aria-current={project.status === 'active' ? 'step' : undefined}
          >
            {project.medal !== 'none' && (
              <span className={`${styles.nodeMedalBadge} ${styles[`medal${project.medal[0].toUpperCase()}${project.medal.slice(1)}`]}`}>
                <Medal size={15} />{medalLabel(project.medal)}
              </span>
            )}
            <span className={styles.nodeIcon}>
              {project.status === 'locked' ? <Lock size={18} /> : <Swords size={project.status === 'active' ? 23 : 19} />}
              <b>{project.id}</b>
            </span>
            <span className={styles.nodeLabel}>
              <span className={styles.nodeHeading}>
                <small>项目 {String(project.id).padStart(2, '0')}</small>
                <i className={`${styles.nodeStatus} ${styles[`status${project.status[0].toUpperCase()}${project.status.slice(1)}`]}`}>{statusLabel}</i>
              </span>
              <strong>{project.title}</strong>
              <span className={styles.nodeCurriculum}>{project.curriculum}</span>
              {playable && interactive && <em>{project.status === 'cleared' ? '再次挑战刷金牌' : '进入调查任务'} <ChevronRight size={13} /></em>}
            </span>
          </button>
        )
      })}
    </section>
  )
}

function DashboardPanel({
  displayName,
  realName,
  avatarUrl,
  player,
  wallet,
  hp,
  trophySummary,
  creditSummary,
  educationTrack,
  project,
  carrier,
  onEnterProject,
  onShop,
  onTrophies,
  onLeaderboard,
}: {
  displayName: string
  realName: string
  avatarUrl: string | null
  player: PlayerState
  wallet: Wallet
  hp: number
  trophySummary: TrophySummary
  creditSummary: ReturnType<typeof summarizeCredit>
  educationTrack: EducationTrack
  project: ProjectDefinition
  carrier: CarrierCase
  onEnterProject: () => void
  onShop: () => void
  onTrophies: () => void
  onLeaderboard: () => void
}) {
  return (
    <>
      <section className={styles.profileCard}>
        <div className={styles.profileTop}>
          <div className={styles.avatar}>
            {avatarUrl
              ? <Image src={avatarUrl} alt={`${displayName}的头像`} width={58} height={58} unoptimized className={styles.avatarImage} />
              : <UserRound size={29} />}
          </div>
          <div>
            <span>{realName}</span>
            <h2>{displayName}</h2>
            <p>制药质量管理方向</p>
          </div>
        </div>
        <div className={styles.vital}>
          <div><HeartPulse size={16} /><span>HP 健康值</span><strong>{hp}/{SIMULATION_MAX_HP}</strong></div>
          <progress value={hp} max={SIMULATION_MAX_HP} />
        </div>
        <div className={styles.vital}>
          <div><GraduationCap size={16} /><span>Lv.{player.rankLevel} {player.rankTitle}</span><strong>{player.xp} XP</strong></div>
          <progress value={player.rankProgress * 100} max={100} />
        </div>
      </section>

      <section className={styles.missionCard}>
        <p className={styles.eyebrow}>当前项目 · 项目{project.id}</p>
        <h2>{project.title}</h2>
        <p className={styles.muted}>{carrier.productName} · {carrier.dosageForm} · {project.caseFocus}</p>
        <div className={styles.missionMeta}>
          <span><GraduationCap size={14} /> {trackLabel(educationTrack)}线路</span>
          <span><FileSearch size={14} /> 5 关调查</span>
        </div>
        <button type="button" className={styles.primaryButton} onClick={onEnterProject}>进入调查 <ChevronRight size={18} /></button>
      </section>

      <section className={styles.medalCard} aria-label="实训资产">
        <div className={styles.medalGrid}>
          <div><Coins size={22} /><strong>{wallet.coins.toLocaleString()}</strong><span>金币</span></div>
          <div><Gem size={22} /><strong>{wallet.gems.toLocaleString()}</strong><span>钻石</span></div>
          <button type="button" className={styles.assetButton} onClick={onTrophies}><Trophy size={22} /><strong>{trophySummary.total.toLocaleString()}</strong><span>奖杯</span></button>
        </div>
        <div className={styles.creditBoard}>
          <span>课时分</span>
          <strong>{creditSummary.gameEarned} / {creditSummary.gameRequired}</strong>
          <small>游戏项目课时，课程学习固定 {creditSummary.courseRegular} 分</small>
        </div>
        <button type="button" className={styles.inventoryButton} onClick={onShop}>
          <ShoppingBag size={16} /> 战备仓库
          <span>{wallet.inventory.skip + wallet.inventory.boost + wallet.inventory.heal} 件</span>
        </button>
        <button type="button" className={styles.leaderboardButton} onClick={onLeaderboard}>
          <Medal size={16} /> 查看 XP 排行榜
          <span>Top 10</span>
        </button>
      </section>
    </>
  )
}

function PanelNav({ project, onBack }: { project: ProjectDefinition; onBack: () => void }) {
  return (
    <div className={styles.panelNav}>
      <button type="button" onClick={onBack} aria-label="返回项目概览"><ArrowLeft size={17} /></button>
      <div><small>项目{project.id} / 调查简报</small><strong>{project.title}</strong></div>
    </div>
  )
}

function BriefingPanel({
  project,
  projectNode,
  educationTrack,
  major,
  carrierRoute,
  carriers,
  selectedCarrier,
  auxiliaryCase,
  auxiliaryAvailable,
  selectedRole,
  storyAnswerKey,
  bossAnswerKey,
  onBack,
  onSelectCarrier,
  onDrawAuxiliary,
  onBegin,
}: {
  project: ProjectDefinition
  projectNode: ProjectNode
  educationTrack: EducationTrack
  major: string
  carrierRoute: CarrierRoute
  carriers: CarrierCase[]
  selectedCarrier: CarrierCase
  auxiliaryCase: CaseCatalogProduct | null
  auxiliaryAvailable: boolean
  selectedRole: Role
  storyAnswerKey: string[]
  bossAnswerKey: string[]
  onBack: () => void
  onSelectCarrier: (carrierId: string) => void
  onDrawAuxiliary: () => void
  onBegin: () => void
}) {
  return (
    <div className={styles.panelContent}>
      <PanelNav project={project} onBack={onBack} />
      <div className={styles.trackBadge}>
        <GraduationCap size={19} />
        <div>
          <small>系统匹配线路 · {major}</small>
          <strong>{trackLabel(educationTrack)} · {assignedRoleLabel(educationTrack)} · {projectNode.status === 'cleared' ? `${medalLabel(projectNode.medal)}可重刷` : '当前解锁'}</strong>
        </div>
      </div>
      <section className={styles.compactBrief}>
        <p className={styles.eyebrow}>{project.curriculum}</p>
        <h2>{project.caseFocus}</h2>
        <p className={styles.lead}>{project.riskSignal}。你需保全证据、访谈多角色，并在 Boss 核验前形成可批准结论。</p>
        <div className={styles.systemCard}>
          <div><FlaskConical size={18} /><strong>20250501 / {selectedCarrier.productName}</strong></div>
          <p>{project.scenes.map(scene => scene.defect).join(' · ')}</p>
          <dl>
            <div><dt>剂型</dt><dd>{selectedCarrier.dosageForm} / {selectedCarrier.dosageCategory}</dd></div>
            <div><dt>工艺载体</dt><dd>{selectedCarrier.process}</dd></div>
            <div><dt>课时规则</dt><dd>基础 {GAME_PROJECT_BASE_CREDIT} 分，铜牌 x1 / 银牌 x1.4 / 金牌 x1.7</dd></div>
          </dl>
        </div>
      </section>
      {project.id === 1 && (
        <section className={styles.answerHint}>
          <div>
            <p className={styles.eyebrow}>测试答案卡 · 项目一</p>
            <h2>可直接按答案测试通关链路</h2>
          </div>
          <p>剧情：{storyAnswerKey.join('； ')}</p>
          <p>Boss：{bossAnswerKey.join('； ')}</p>
        </section>
      )}
      <section className={styles.carrierPanel}>
        <div className={styles.panelHeader}>
          <div><p className={styles.eyebrow}>{carrierRoute.label}</p><h2>选择贯穿教学的主案例</h2></div>
        </div>
        <p className={styles.routeSummary}>{carrierRoute.rationale}</p>
        <div className={styles.carrierGrid}>
          {carriers.map(carrier => {
            const selected = selectedCarrier.id === carrier.id
            return (
              <button type="button" key={carrier.id} className={`${styles.carrierCard} ${selected ? styles.carrierSelected : ''}`} onClick={() => onSelectCarrier(carrier.id)} aria-pressed={selected}>
                <span>{carrier.dosageForm}</span>
                <strong>{carrier.productName}</strong>
                <small>{selected ? '当前主线案例' : '切换主线'}</small>
                {selected && <CheckCircle2 size={17} />}
              </button>
            )
          })}
        </div>
        <div className={styles.auxiliaryPicker}>
          <div>
            <small>辅助随机案例</small>
            <strong>{auxiliaryCase ? `${auxiliaryCase.productName} · ${auxiliaryCase.dosageForm}` : '按需抽取对照训练，不改变主线'}</strong>
          </div>
          <button type="button" disabled={!auxiliaryAvailable} onClick={onDrawAuxiliary}>
            <WandSparkles size={15} /> {auxiliaryCase ? '换一个' : '随机抽取'}
          </button>
        </div>
      </section>
      <section className={styles.npcRoster}>
        <div className={styles.panelHeader}>
          <p className={styles.eyebrow}>多角色调查</p>
          <h2>{selectedRole.title}将访谈的关键人物</h2>
        </div>
        <div>
          {project.npcs.slice(0, 4).map(npc => (
            <span key={npc.id} className={styles.npcChip}><strong>{npc.name}</strong>{npc.title}</span>
          ))}
        </div>
      </section>
      <section className={styles.rolePanel}>
        <p className={styles.roleAssignment}><selectedRole.icon size={17} /><strong>{selectedRole.title}</strong><span>{selectedRole.focus}</span></p>
        <button type="button" className={styles.primaryButton} onClick={onBegin}>
          以{selectedRole.title}开始五关调查 <ArrowRight size={18} />
        </button>
      </section>
    </div>
  )
}

function StoryPanel({
  project,
  role,
  educationTrack,
  carrier,
  questions,
  question,
  questionIndex,
  answers,
  score,
  finished,
  remainingTime,
  timedOut,
  onBack,
  onExit,
  onSelectAnswer,
  onContinue,
  onRetry,
  onBoss,
}: {
  project: ProjectDefinition
  role: Role
  educationTrack: EducationTrack
  carrier: CarrierCase
  questions: TrainingQuestion[]
  question: TrainingQuestion
  questionIndex: number
  answers: string[]
  score: number
  finished: boolean
  remainingTime: number
  timedOut: boolean
  onBack: () => void
  onExit: () => void
  onSelectAnswer: (id: string) => void
  onContinue: () => void
  onRetry: () => void
  onBoss: () => void
}) {
  const passed = score >= STORY_PASS_SCORE
  const currentScene = project.scenes.find(scene => scene.number === question.sceneNumber)
  const testAnswer = project.id === 1 ? question.correct.join('、') : ''
  return (
    <section className={`${styles.cinematicStage} ${styles.storyStage}`} aria-label="剧情调查场景">
      <Image src={project.storyImage || role.storyImage} alt={`${project.title}剧情场景`} fill sizes="100vw" className={styles.cinematicImage} />
      <div className={styles.storyWash} />
      <header className={styles.stageHeader}>
        <button type="button" className={styles.stageBack} onClick={onBack} aria-label="返回角色选择"><ArrowLeft size={19} /></button>
        <div className={styles.stageTitle}><small>项目{project.id} / {trackLabel(educationTrack)} · {role.title}</small><strong>{project.title}</strong></div>
        <div className={styles.stageStatusGroup}>
          <CountdownBadge remainingTime={remainingTime} timedOut={timedOut} />
          <div className={styles.longProgress}>
            <span>第 {question.sceneNumber ?? 5} 关 {currentScene?.title} · {question.sceneMood}</span>
            <progress value={finished ? questions.length : questionIndex + 1} max={questions.length} />
          </div>
        </div>
        <button type="button" className={styles.stageExit} onClick={onExit}><X size={15} />退出实训</button>
      </header>
      <div className={styles.npcBadge}><strong>{question.speaker?.name ?? role.mentorName}</strong><span>{question.speaker?.title ?? role.mentorTitle}</span></div>
      <aside className={styles.dossier}>
        <p className={styles.dossierLabel}>偏差档案</p>
        <h2>{carrier.productName} / 批号 20250501</h2>
        <dl>
          <div><dt>剂型</dt><dd>{carrier.dosageForm}</dd></div>
          <div><dt>调查环节</dt><dd>{question.chapter}</dd></div>
          <div><dt>当前角色</dt><dd><role.icon size={14} />{role.title}</dd></div>
          <div><dt>交付物</dt><dd className={styles.riskLevel}>{question.deliverable}</dd></div>
        </dl>
        <p className={styles.dossierNote}>五个关卡、{questions.length} 项任务。调查得分达到 60 分才能进入 {trackLabel(educationTrack)}终场核验。</p>
      </aside>
      {finished ? (
        <section className={styles.storyGate}>
          <p className={styles.eyebrow}>剧情调查完成</p>
          <h2>{passed ? '证据链已达到交战标准' : '调查结论不足以进入终场核验'}</h2>
          <div className={`${styles.gateScore} ${passed ? styles.gatePass : styles.gateFail}`}>
            <strong>{score}</strong><span>/ 100 分</span>
          </div>
          <p>{passed ? '你已锁定 OOS 根因与 CAPA 路径，可以向偏差实体发起核验。' : '需至少获得 60 分。请重新调查实验室、工艺与供应商线索。'}</p>
          <div className={styles.gateActions}>
            <button type="button" className={styles.secondaryButton} onClick={onRetry}>重新调查</button>
            <button type="button" className={styles.primaryButton} disabled={!passed} onClick={onBoss}>进入 Boss 战 <Swords size={17} /></button>
          </div>
        </section>
      ) : (
        <div className={styles.dialogueDeck}>
          <div className={styles.storyText}>
            <div className={styles.storySceneHeader}>
              <span>剧情片段</span>
              <strong>{question.sceneMood}</strong>
            </div>
            <p className={styles.narration}>{question.narration}</p>
            <div className={styles.dialogueScript} aria-label="角色对话">
              {(question.dialogue ?? []).map((line, index) => (
                <div key={`${line.speaker}-${index}`} className={`${styles.dialogueLine} ${dialogueToneClass(line.tone)}`}>
                  <span>{line.speaker}{line.title ? <small>{line.title}</small> : null}</span>
                  <p>{line.line}</p>
                </div>
              ))}
            </div>
            <div className={styles.storyTaskCard}>
              <div className={styles.questionTag}>{question.taskLabel} · {question.chapter} · {question.points} 分</div>
              <h2>{question.choicePrompt}</h2>
              <p>{question.stem}</p>
              {testAnswer && <p className={styles.inlineAnswerKey}><Award size={14} />测试答案：{testAnswer}</p>}
              <div className={styles.storyRisk}><ShieldAlert size={18} /><span>{question.insight}</span></div>
              <p className={styles.evidenceSlip}><FileSearch size={14} />{question.evidence}</p>
            </div>
          </div>
          <fieldset className={styles.storyChoices}>
            <legend>{question.kind === 'single' ? '选择你的剧情行动' : '选择所有剧情行动'}</legend>
            {question.options.map(choice => (
              <button type="button" key={choice.id} className={`${styles.storyChoice} ${answers.includes(choice.id) ? styles.storyChoiceSelected : ''}`} onClick={() => onSelectAnswer(choice.id)} aria-pressed={answers.includes(choice.id)}>
                <span className={styles.radio}>{answers.includes(choice.id) && <span />}</span>
                <span><strong>行动 {choice.id}</strong><small>{choice.label}</small></span>
              </button>
            ))}
            <button type="button" className={styles.stageContinue} disabled={!answers.length || timedOut} onClick={onContinue}>
              {questionIndex === questions.length - 1 ? '提交调查报告' : '执行行动并推进剧情'} <ChevronRight size={18} />
            </button>
          </fieldset>
        </div>
      )}
    </section>
  )
}

function CountdownBadge({ remainingTime, timedOut }: { remainingTime: number; timedOut: boolean }) {
  const warning = remainingTime <= 5 * 60
  return (
    <div className={`${styles.countdownBadge} ${warning || timedOut ? styles.countdownWarning : ''}`} aria-live="polite">
      <Clock3 size={16} />
      <span>{timedOut ? '已超时' : '剩余时间'}</span>
      <strong>{formatCountdown(remainingTime)}</strong>
    </div>
  )
}

function BossPanel({
  project,
  role,
  educationTrack,
  carrier,
  questions,
  hp,
  bossHp,
  bossMaxHp,
  bossHitDamage,
  playerMissDamage,
  correct,
  question,
  questionIndex,
  answers,
  wallet,
  damageBoost,
  remainingTime,
  timedOut,
  onBack,
  onExit,
  onSelectAnswer,
  onSubmit,
  onUseItem,
  onShop,
}: {
  project: ProjectDefinition
  role: Role
  educationTrack: EducationTrack
  carrier: CarrierCase
  questions: TrainingQuestion[]
  hp: number
  bossHp: number
  bossMaxHp: number
  bossHitDamage: number
  playerMissDamage: number
  correct: number
  question: TrainingQuestion
  questionIndex: number
  answers: string[]
  wallet: Wallet
  damageBoost: boolean
  remainingTime: number
  timedOut: boolean
  onBack: () => void
  onExit: () => void
  onSelectAnswer: (id: string) => void
  onSubmit: () => void
  onUseItem: (item: ItemId) => void
  onShop: () => void
}) {
  const hpPercent = Math.round((bossHp / Math.max(1, bossMaxHp)) * 100)
  const accuracy = questionIndex === 0 ? 0 : Math.round((correct / questionIndex) * 100)
  const testAnswer = project.id === 1 ? question.correct.join('、') : ''
  return (
    <section className={`${styles.cinematicStage} ${styles.battleStage}`} aria-label="Boss 战场景">
      <Image src={project.bossImage || role.bossImage} alt={`${project.bossName} Boss 模型`} fill sizes="100vw" className={styles.cinematicImage} />
      <div className={styles.battleWash} />
      <header className={styles.stageHeader}>
        <button type="button" className={styles.stageBack} onClick={onBack} aria-label="返回剧情回顾"><ArrowLeft size={19} /></button>
        <div className={styles.stageTitle}><small>项目{project.id} · {trackLabel(educationTrack)}终场核验 / {role.title}</small><strong>{project.title}</strong></div>
        <div className={styles.battleMetrics}><CountdownBadge remainingTime={remainingTime} timedOut={timedOut} /><span><Target size={16} /> 命中率 {accuracy}%</span><button type="button" onClick={onShop}><ShoppingBag size={15} /> 商店</button></div>
        <button type="button" className={styles.stageExit} onClick={onExit}><X size={15} />退出实训</button>
      </header>
      <div className={styles.bossIdentity}>
        <p>首领 / {project.bossTitle}</p>
        <h2>{project.bossName}</h2>
      </div>
      <aside className={styles.battleBrief}>
        <h3>{trackLabel(educationTrack)}{educationTrack === 'college' ? '合规审核战' : '调查答辩战'}</h3>
        <p className={styles.turnText}>核验回合 {questionIndex + 1} / {questions.length}</p>
        <div className={`${styles.bossHealth} ${styles.bossBriefHealth}`}>
          <label><span>Boss HP · {project.bossName}</span><strong>{bossHp} / {bossMaxHp}</strong></label>
          <progress value={bossHp} max={bossMaxHp} />
          <small>{hpPercent}% 剩余</small>
        </div>
        <ul>
          <li className={questionIndex >= 3 ? styles.objectiveDone : ''}><span className={styles.objectiveMark}>{questionIndex >= 3 && <Check size={13} />}</span>证据与流程核验</li>
          <li className={questionIndex >= 7 ? styles.objectiveDone : ''}><span className={styles.objectiveMark}>{questionIndex >= 7 && <Check size={13} />}</span>影响与 CAPA 核验</li>
          <li className={bossHp === 0 ? styles.objectiveDone : ''}><span className={styles.objectiveMark}>{bossHp === 0 && <Check size={13} />}</span>案例：CAPA 闭环</li>
        </ul>
        <div className={styles.playerHealth}>
          <div><role.icon size={17} /><strong>{role.title}</strong><span>{hp}/{SIMULATION_MAX_HP}</span></div>
          <progress value={hp} max={SIMULATION_MAX_HP} />
        </div>
        <div className={styles.itemBelt}>
          <p>战术道具 {damageBoost && <em>增幅已装载</em>}</p>
          <button type="button" disabled={!wallet.inventory.skip} onClick={() => onUseItem('skip')}><Ticket size={15} /> 跳题卡 <b>x{wallet.inventory.skip}</b></button>
          <button type="button" disabled={!wallet.inventory.boost || damageBoost} onClick={() => onUseItem('boost')}><Zap size={15} /> 增幅器 <b>x{wallet.inventory.boost}</b></button>
          <button type="button" disabled={!wallet.inventory.heal || hp >= SIMULATION_MAX_HP} onClick={() => onUseItem('heal')}><HeartPulse size={15} /> 补给包 <b>x{wallet.inventory.heal}</b></button>
        </div>
      </aside>
      <section className={styles.commandDeck}>
        <div className={styles.bossStoryText}>
          <div className={styles.storySceneHeader}>
            <span>终场剧情</span>
            <strong>{question.sceneMood}</strong>
          </div>
          {question.narration ? <p className={styles.narration}>{question.narration}</p> : null}
          <div className={`${styles.dialogueScript} ${styles.bossDialogueScript}`} aria-label="终场角色对话">
            {(question.dialogue ?? []).map((line, index) => (
              <div key={`${line.speaker}-${index}`} className={`${styles.dialogueLine} ${dialogueToneClass(line.tone)}`}>
                <span>{line.speaker}{line.title ? <small>{line.title}</small> : null}</span>
                <p>{line.line}</p>
              </div>
            ))}
          </div>
          <div className={styles.questionPrompt}>
            <p>{questionLabel(question.kind)} · {question.chapter} · {questionIndex + 1} / {questions.length}</p>
            <h3>{question.choicePrompt ?? question.stem}</h3>
            {question.choicePrompt ? <small>{question.stem}</small> : null}
            {testAnswer && <small className={styles.bossAnswerKey}>测试答案：{testAnswer}</small>}
            <span className={styles.commandHint}><WandSparkles size={15} />命中造成 {bossHitDamage}{damageBoost ? ` + ${BOSS_BOOST_DAMAGE}` : ''} HP 伤害，答错扣 {playerMissDamage} HP</span>
          </div>
        </div>
        <div className={styles.commandOptions}>
          {question.options.map(option => (
            <button type="button" key={option.id} className={`${styles.commandOption} ${answers.includes(option.id) ? styles.commandSelected : ''}`} onClick={() => onSelectAnswer(option.id)} aria-pressed={answers.includes(option.id)}>
              <strong>{option.id}</strong><span>{option.label}</span>
            </button>
          ))}
          <button type="button" className={styles.strikeButton} disabled={!answers.length || timedOut} onClick={onSubmit}><Swords size={17} />执行核验</button>
        </div>
      </section>
    </section>
  )
}

function ResultPanel({ project, role, educationTrack, carrier, outcome, reward, storyScore, creditAward, xpAward, remainingTime, onMap, onReplay, onExit }: { project: ProjectDefinition; role: Role; educationTrack: EducationTrack; carrier: CarrierCase; outcome: BattleOutcome; reward: WalletReward | null; storyScore: number; creditAward: number; xpAward: ProjectXpAward | null; remainingTime: number; onMap: () => void; onReplay: () => void; onExit: () => void }) {
  const medal = MEDAL_CONTENT[outcome.medal]
  const accuracy = outcome.total > 0 ? Math.round((outcome.correct / outcome.total) * 100) : 0
  const xpText = xpAward
    ? xpAward.xpGained > 0 ? `+${xpAward.xpGained} XP` : xpAward.message
    : outcome.victory ? 'XP 结算中' : '+0 XP'
  return (
    <section className={`${styles.cinematicStage} ${styles.resultStage}`} aria-label="项目结算">
      <Image src={project.bossImage || role.bossImage} alt="" fill sizes="100vw" className={styles.resultImage} />
      <div className={styles.resultWash} />
      <button type="button" className={styles.stageBack} onClick={onMap} aria-label="返回项目概览"><ArrowLeft size={19} /></button>
      <button type="button" className={styles.resultExit} onClick={onExit}><X size={15} />退出实训</button>
      <section className={styles.resultPanel}>
        <div className={styles.resultHero}>
          <span className={styles.resultSeal} style={{ color: medal.color }}>{outcome.victory ? <Trophy size={48} /> : <ShieldAlert size={48} />}</span>
          <p className={styles.eyebrow}>{outcome.victory ? `${trackLabel(educationTrack)}线路通关` : outcome.timedOut ? '训练超时' : '挑战未完成'}</p>
          <h2>{outcome.victory ? `${project.title}已形成有效闭环` : outcome.timedOut ? '未在规定时间内完成实训' : `${project.bossName}仍未被彻底击退`}</h2>
          <p>{outcome.timedOut ? '本次实训已超过前置页面标注的 90 分钟时限，不能判定通过，请重新挑战。' : medal.detail}</p>
          <div className={styles.medalAward} style={{ color: medal.color }}><Medal size={22} /><strong>{medal.label}</strong></div>
        </div>
        <div className={styles.resultGrid}>
          <section className={styles.scoreCard}>
            <h3>本次战绩</h3>
            <div className={styles.scoreStats}>
              <div><strong>{storyScore}</strong><span>剧情分数</span></div>
              <div><strong>{accuracy}%</strong><span>攻击命中</span></div>
              <div><strong>{outcome.projectScore}</strong><span>项目总分</span></div>
              <div><strong>{outcome.hp}/{SIMULATION_MAX_HP}</strong><span>玩家血量</span></div>
              <div><strong>{outcome.bossHp}/{BOSS_MAX_HP}</strong><span>Boss血量</span></div>
              <div><strong>{formatCountdown(remainingTime)}</strong><span>{outcome.timedOut ? '超时' : '剩余时间'}</span></div>
            </div>
            <p className={styles.demoNote}>{role.title} · {carrier.dosageForm}主载体案例。可返回更换本专业另一主案例复盘训练路径。</p>
          </section>
          <section className={styles.unlockCard}>
            <p className={styles.eyebrow}>{outcome.victory ? '奖励入账' : '复盘建议'}</p>
            <h3>{outcome.victory ? '风险侦探勋章' : '回到偏差现场补齐证据'}</h3>
            <p>{outcome.victory ? `已完成${assignedRoleLabel(educationTrack)}要求的交付物并获得 CAPA 报告模板。` : '剧情达到 60 分后重新迎战，使用商店道具可提升攻坚效率。'}</p>
            <div className={styles.rewardLine}>
              <span><Coins size={16} /> +{reward?.coins ?? 0} 金币</span>
              <span><Gem size={16} /> +{reward?.gems ?? 0} 钻石</span>
              <span><Trophy size={16} /> +{reward?.trophies ?? 0} 奖杯</span>
              <span><GraduationCap size={16} /> +{creditAward} 课时分</span>
              <span><Sparkles size={16} /> {xpText}</span>
            </div>
            {xpAward?.leveledUp && <p className={styles.levelUpNotice}>等级晋升至 Lv.{xpAward.rankLevel} {xpAward.rankTitle}</p>}
          </section>
        </div>
        <div className={styles.resultActions}>
          <button type="button" className={styles.secondaryButton} onClick={onMap}><ArrowLeft size={17} /> 返回地图</button>
          <button type="button" className={styles.primaryButton} onClick={onReplay}>更换主案例再次训练 <ArrowRight size={18} /></button>
        </div>
      </section>
    </section>
  )
}

function TrophyModal({ projects, progress, trophySummary, creditSummary, onClose }: { projects: ProjectNode[]; progress: ProjectProgress; trophySummary: TrophySummary; creditSummary: ReturnType<typeof summarizeCredit>; onClose: () => void }) {
  return (
    <div className={styles.modalScrim} role="presentation" onMouseDown={onClose}>
      <section className={styles.trophyModal} role="dialog" aria-modal="true" aria-labelledby="trophy-title" onMouseDown={event => event.stopPropagation()}>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="关闭奖杯统计"><X size={19} /></button>
        <header className={styles.trophyHeader}>
          <div className={styles.modalIcon}><Trophy size={30} /></div>
          <div>
            <p className={styles.eyebrow}>远征荣誉</p>
            <h2 id="trophy-title">奖杯与课时分统计</h2>
            <span>奖杯来自项目最佳奖牌，重复挑战会保留最高等级，便于刷金牌。</span>
          </div>
        </header>
        <div className={styles.trophyBreakdown}>
          <div><strong>{trophySummary.total}</strong><span>总奖杯</span></div>
          <div className={styles.goldCount}><strong>{trophySummary.gold}</strong><span>金牌</span></div>
          <div className={styles.silverCount}><strong>{trophySummary.silver}</strong><span>银牌</span></div>
          <div className={styles.bronzeCount}><strong>{trophySummary.bronze}</strong><span>铜牌</span></div>
        </div>
        <div className={styles.creditSummary}>
          <div><span>课程学习</span><strong>{creditSummary.courseRegular}</strong></div>
          <div><span>游戏项目</span><strong>{creditSummary.gameEarned} / {creditSummary.gameRequired}</strong></div>
          <div><span>最终总测</span><strong>{creditSummary.finalCourseTest}</strong></div>
          <div><span>最终 Boss</span><strong>{creditSummary.finalBoss}</strong></div>
        </div>
        <div className={styles.trophyList}>
          {projects.map(project => {
            const record = progress[projectKey(project.id)]
            return (
              <div key={project.id} className={styles.trophyRow}>
                <span>项目 {String(project.id).padStart(2, '0')}</span>
                <strong>{project.title}</strong>
                <em className={project.medal !== 'none' ? styles[`medal${project.medal[0].toUpperCase()}${project.medal.slice(1)}`] : undefined}>{medalLabel(project.medal)}</em>
                <small>{record ? `${record.bestScore} 分 · ${record.creditHours} 课时` : project.status === 'active' ? '可挑战' : '未解锁'}</small>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function LeaderboardModal({
  entries,
  currentUser,
  loading,
  error,
  onRefresh,
  onClose,
}: {
  entries: LeaderboardEntry[]
  currentUser: LeaderboardEntry | null
  loading: boolean
  error: string
  onRefresh: () => void
  onClose: () => void
}) {
  const rows: LeaderboardEntry[] = currentUser && !entries.some(entry => entry.userId === currentUser.userId)
    ? [...entries, currentUser]
    : entries

  return (
    <div className={styles.modalScrim} role="presentation" onMouseDown={onClose}>
      <section className={styles.leaderboardModal} role="dialog" aria-modal="true" aria-labelledby="leaderboard-title" onMouseDown={event => event.stopPropagation()}>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="关闭排行榜"><X size={19} /></button>
        <header className={styles.leaderboardHeader}>
          <div className={styles.modalIcon}><Medal size={30} /></div>
          <div>
            <p className={styles.eyebrow}>XP LEADERBOARD</p>
            <h2 id="leaderboard-title">实训 XP 排行榜</h2>
            <span>按 XP、积分和最长连续打卡排序，项目通关 XP 会即时计入排名。</span>
          </div>
          <button type="button" onClick={onRefresh} disabled={loading}>
            <Sparkles size={15} />刷新
          </button>
        </header>

        {currentUser && (
          <section className={styles.myRankCard} aria-label="我的当前排行">
            <div>
              <span>我的排名</span>
              <strong>#{currentUser.leaderboardRank}</strong>
            </div>
            <div>
              <span>当前 XP</span>
              <strong>{currentUser.xp.toLocaleString()}</strong>
            </div>
            <div>
              <span>等级</span>
              <strong>Lv.{currentUser.rankLevel}</strong>
            </div>
          </section>
        )}

        <div className={styles.leaderboardList}>
          {loading && <p className={styles.leaderboardState}>正在校准排行榜数据...</p>}
          {!loading && error && <p className={styles.leaderboardState}>{error}</p>}
          {!loading && !error && rows.length === 0 && <p className={styles.leaderboardState}>暂无排行数据，完成项目后会出现在这里。</p>}
          {!loading && !error && rows.map(entry => {
            const isCurrent = currentUser?.userId === entry.userId
            return (
              <article key={`${entry.userId}-${entry.leaderboardRank}`} className={`${styles.leaderboardRow} ${isCurrent ? styles.leaderboardMe : ''}`}>
                <div className={styles.rankNumber}>
                  {entry.leaderboardRank <= 3 ? <Trophy size={18} /> : <span>{entry.leaderboardRank}</span>}
                </div>
                <div className={styles.leaderAvatar}>
                  {entry.avatarUrl
                    ? <Image src={entry.avatarUrl} alt={`${entry.displayName}的头像`} width={42} height={42} unoptimized className={styles.avatarImage} />
                    : <UserRound size={21} />}
                </div>
                <div className={styles.leaderCopy}>
                  <strong>{entry.displayName}{isCurrent ? ' · 我' : ''}</strong>
                  <span>{entry.school || '未填写学校'} · {entry.major || 'GMP 学习者'}</span>
                </div>
                <div className={styles.leaderStats}>
                  <strong>{entry.xp.toLocaleString()} XP</strong>
                  <span>Lv.{entry.rankLevel} {entry.rankTitle}</span>
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function ShopModal({ wallet, onClose, onBuy, onFindSupply }: { wallet: Wallet; onClose: () => void; onBuy: (product: StoreProduct, currency: 'coins' | 'gems') => void; onFindSupply: () => void }) {
  return (
    <div className={styles.modalScrim} role="presentation" onMouseDown={onClose}>
      <section className={styles.shopModal} role="dialog" aria-modal="true" aria-labelledby="shop-title" onMouseDown={event => event.stopPropagation()}>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="关闭道具商店"><X size={19} /></button>
        <header className={styles.shopHeader}>
          <div><p className={styles.eyebrow}>远征补给</p><h2 id="shop-title">战术道具商店</h2><span>购买的道具可在 Boss 战立即使用</span></div>
          <div className={styles.shopBalance}><span><Coins size={16} />{wallet.coins.toLocaleString()}</span><span><Gem size={16} />{wallet.gems.toLocaleString()}</span></div>
        </header>
        <div className={styles.storeGrid}>
          {STORE_PRODUCTS.map(product => {
            const Icon = product.icon
            return (
              <article key={product.id} className={styles.storeItem}>
                <div className={styles.storeIcon}><Icon size={25} /></div>
                <div className={styles.storeCopy}>
                  <h3>{product.name}</h3>
                  <p>{product.effect}</p>
                  <small>库存 x{wallet.inventory[product.id]}</small>
                </div>
                <div className={styles.storeActions}>
                  <button type="button" disabled={wallet.coins < product.coinPrice} onClick={() => onBuy(product, 'coins')}><Coins size={14} />{product.coinPrice}</button>
                  <button type="button" disabled={wallet.gems < product.gemPrice} onClick={() => onBuy(product, 'gems')}><Gem size={14} />{product.gemPrice}</button>
                </div>
              </article>
            )
          })}
        </div>
        <footer className={styles.currencySource}>
          <div>
            <strong>金币 / 钻石不足？</strong>
            <span>每日补给可领取 +{DAILY_SUPPLY_REWARD.coins} 金币、+{DAILY_SUPPLY_REWARD.gems} 钻石；通关关卡再得 +{VICTORY_REWARD.coins} 金币、+{VICTORY_REWARD.gems} 钻石。</span>
          </div>
          <button type="button" onClick={onFindSupply}><HeartPulse size={16} />前往补给</button>
        </footer>
      </section>
    </div>
  )
}

function SupplyModal({ wallet, onClaimDaily, onClose }: { wallet: Wallet; onClaimDaily: () => void; onClose: () => void }) {
  const dailyClaimed = wallet.lastDailySupplyDate === getSimulationDateKey()
  return (
    <div className={styles.modalScrim} role="presentation" onMouseDown={onClose}>
      <section className={styles.supplyModal} role="dialog" aria-modal="true" aria-labelledby="supply-title" onMouseDown={event => event.stopPropagation()}>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="关闭补给训练"><X size={19} /></button>
        <div className={styles.modalIcon}><HeartPulse size={30} /></div>
        <p className={styles.eyebrow}>恢复站</p>
        <h2 id="supply-title">补给训练</h2>
        <p>每日领取战术资源，完成关卡后还可继续获得通关或复盘补给，不会因货币耗尽而中断训练。</p>
        <button type="button" className={styles.dailySupplyButton} disabled={dailyClaimed} onClick={onClaimDaily}>
          <HeartPulse size={18} />
          <strong>{dailyClaimed ? '今日补给已领取' : '领取每日补给'}</strong>
          <span><Coins size={14} /> +{DAILY_SUPPLY_REWARD.coins}</span>
          <span><Gem size={14} /> +{DAILY_SUPPLY_REWARD.gems}</span>
        </button>
        <div className={styles.supplyOptions}>
          <div><Trophy size={19} /><strong>完成项目</strong><span>+{VICTORY_REWARD.coins} 金币 · +{VICTORY_REWARD.gems} 钻石</span></div>
          <div><ClipboardCheck size={19} /><strong>挑战复盘</strong><span>+{REVIEW_REWARD.coins} 金币</span></div>
          <div><Package size={19} /><strong>战术道具</strong><span>前往商店兑换</span></div>
        </div>
        <button type="button" className={styles.primaryButton} onClick={onClose}>返回远征地图</button>
      </section>
    </div>
  )
}
