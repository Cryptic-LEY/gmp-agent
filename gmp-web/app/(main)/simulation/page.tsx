'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type WheelEvent } from 'react'
import dynamic from 'next/dynamic'
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
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Coins,
  Crown,
  DoorOpen,
  FileSearch,
  FlaskConical,
  Gem,
  Gift,
  GraduationCap,
  Gamepad2,
  HeartPulse,
  Infinity as InfinityIcon,
  Lock,
  Medal,
  MessageCircle,
  Package,
  Plus,
  Radio,
  ScrollText,
  Send,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Swords,
  Target,
  Ticket,
  Trophy,
  UserCheck,
  UserPlus,
  UserRound,
  UsersRound,
  Volume2,
  VolumeX,
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
  FINAL_BOSS_BASE_CREDIT,
  GAME_PROJECT_BASE_CREDIT,
  MEDAL_BONUS_CREDIT_TOTAL,
  PROJECT_MISSIONS,
  answerKeyFor,
  baseCreditForProjectMedal,
  buildProjectBossQuestions,
  buildProjectStoryQuestions,
  creditForProjectMedal,
  getProjectDefinition,
  medalBonusCreditForProject,
  medalFromScore,
  medalRank,
  type ProjectDefinition,
  type ProjectMedal,
} from '@/lib/simulation/project-missions'
import { FINAL_BOSS_COMPLETION_BASE_XP, PROJECT_COMPLETION_BASE_XP, PROJECT_MEDAL_BONUS_XP } from '@/lib/gamification'
import type { SmartMissionResponse } from '@/lib/smart-mission-types'
import { isTestAccountEmail } from '@/lib/test-accounts'
import {
  DEFAULT_PLAYER_MODEL_ID,
  PLAYER_MODELS,
  isPlayerModelId,
  playerAnimationStyle,
  playerModelFitScale,
  playerModelById,
  type PlayerModel,
  type PlayerModelId,
} from './player-models'
import styles from './simulation.module.css'
const ThreeProjectGame = dynamic(() => import('./ThreeProjectGame'), { ssr: false })

function readTeamAuthToken() {
  if (typeof window === 'undefined') return null
  const token = localStorage.getItem('token')?.trim()
  if (!token || token === 'undefined' || token === 'null') return null
  return token
}

const PROJECT_MAP_BACKGROUNDS: Record<number, string> = {
  1: '/simulation/chapter-scenes/chapter-1/hall.png',
  2: '/simulation/chapter-scenes/chapter-2/hall.png',
  3: '/simulation/chapter-scenes/chapter-3/hall.png',
  4: '/simulation/chapter-scenes/chapter-4/hall.png',
  5: '/simulation/chapter-scenes/chapter-5/hall.png',
  6: '/simulation/chapter-scenes/chapter-6/hall.png',
  7: '/simulation/backgrounds/Desert_03.png',
  8: '/simulation/backgrounds/Background_02.png',
  9: '/simulation/backgrounds/Space_Background_02.png',
  10: '/simulation/backgrounds/Space_Background_03.png',
  11: '/simulation/backgrounds/Background_03.png',
}

function projectMapBackground(projectId: number) {
  return PROJECT_MAP_BACKGROUNDS[projectId] ?? '/simulation/map-background.webp'
}

type Screen = 'map' | 'levels' | 'briefing' | 'story' | 'boss' | 'game3d' | 'result' | 'bounty'
type ProjectStatus = 'cleared' | 'active' | 'locked'
type MedalTier = ProjectMedal
type QuestionKind = 'single' | 'multiple' | 'case' | 'sequence'
type ItemId = 'skip' | 'boost' | 'heal'
type StoreProductId = ItemId | 'hpSupply'
type ShopOpenOptions = { itemsOnly?: boolean }
type SimWeaponShape = 'club' | 'hammer' | 'spear' | 'shield' | 'axe' | 'gun' | 'crossbow'
type QuickPanel = 'mentor' | 'friends' | 'skills' | 'tools' | 'messages' | 'settings'
type TeamInviteInitialView = 'room' | 'hall'
type SystemMessageTarget = 'mission' | 'supply' | 'report'

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
  onAction?: () => void
}

interface HpRecoveryState {
  hp: number
  updatedAt: number
  recoverAt: number
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

interface Game3dCompletion {
  victory: boolean
  correct: number
  total: number
  hp: number
  bossHp: number
  storyScore: number
  projectScore: number
}

interface Inventory {
  skip: number
  boost: number
  heal: number
  hpSupply: number
  playerModelId: PlayerModelId
  playerModels: PlayerModelId[]
  weapons: string[]
  equippedWeaponId: string | null
  roles: string[]
  equippedRoleId: string | null
}

interface Wallet {
  coins: number
  gems: number
  trophies: number
  inventory: Inventory
  lastDailySupplyDate?: string
  lastDailyMissionDate?: string
}

interface WalletReward {
  coins: number
  gems: number
  trophies?: number
}

interface BountyTrialResult {
  coins: number
  gems: number
  kills: number
  eliteKills: number
  wavesCleared: number
  taskCompletions: number
}

interface CombatLootDrop {
  coins?: number
  gems?: number
  items?: Partial<Record<ItemId, number>>
}

interface BountyTrialStats {
  kills: number
  eliteKills: number
  wavesCleared: number
}

interface BountyTaskDefinition {
  id: string
  title: string
  description: string
  target: number
  reward: WalletReward
  progress: (stats: BountyTrialStats) => number
}

interface BountyEnemy {
  id: number
  name: string
  tag: string
  kind: 'normal' | 'elite'
  hp: number
  maxHp: number
  damage: number
  rewardCoins: number
  rewardGems: number
}

type EndlessBountyEnemyKind = 'virus' | 'defect' | 'glitch' | 'wraith' | 'tank' | 'flying' | 'elite' | 'golem' | 'boss'

interface EndlessBountyEnemyTemplate {
  id: EndlessBountyEnemyKind
  name: string
  title: string
  hp: number
  damage: number
  rewardCoins: number
  rewardGems: number
  color: string
  flying?: boolean
  heavy?: boolean
}

interface EndlessBountyEnemy {
  id: string
  templateId: EndlessBountyEnemyKind
  name: string
  title: string
  lane: number
  x: number
  hp: number
  maxHp: number
  damage: number
  rewardCoins: number
  rewardGems: number
  color: string
  flying: boolean
  heavy: boolean
  boss: boolean
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

interface CourseCreditSummary {
  totalEarnedCredits: number
  totalMaxCredits: number
  totalEarnedHours: number
  totalMaxHours: number
}

interface MentorChatMessage {
  id: string
  role: 'student' | 'mentor'
  text: string
}

interface TrophySummary {
  total: number
  bronze: number
  silver: number
  gold: number
}

interface StoreProduct {
  id: StoreProductId
  icon: LucideIcon
  name: string
  effect: string
  coinPrice: number
  gemPrice: number
}

interface EquipmentWeapon {
  id: string
  name: string
  tag: string
  detail: string
  shape: SimWeaponShape
  color: string
  stat: string
}

interface EquipmentTool {
  id: ItemId
  icon: LucideIcon
  name: string
  effect: string
}

interface RoleLoadout {
  id: string
  track: EducationTrack
  rarity: '基础' | '进阶' | '精英' | '传说'
  coinPrice: number
  gemPrice: number
  hp: number
  attack: number
  support: number
  passive: string
  ownedByDefault?: boolean
}

interface HeroUnlock {
  id: PlayerModelId
  rarity: '初始' | '进阶' | '精英' | '传说'
  coinPrice: number
  gemPrice: number
  hp: number
  attack: number
  mobility: number
  passive: string
}

interface SimulationFriend {
  id: string
  name: string
  title: string
  track: EducationTrack
  level: number
  online: boolean
  status: string
  specialty: string
  weaponId: string
}

interface TeamFriend {
  userId: string
  displayName: string
  realName?: string | null
  school?: string | null
  className?: string | null
  major?: string | null
  avatarUrl?: string | null
  online?: boolean
  status?: string
  activeRoom?: {
    roomId: string
    projectId: number
    projectTitle: string
    missionCode: string
    roomTitle: string
    roomStatus: string
    ownerId: string
    memberCount: number
    joinable: boolean
    mineInRoom?: boolean
  } | null
  activity?: {
    status: string
    projectId?: number | null
    roomId?: string | null
  } | null
  busy?: boolean
}

interface TeamFriendRequest extends TeamFriend {
  friendshipId: number
  requesterId: string
  createdAt: string
  direction: 'incoming' | 'outgoing'
}

interface TeamPrivateMessage {
  id: number
  senderId: string
  receiverId: string
  content: string
  createdAt: string
  mine: boolean
}

interface TeamPrivateMessageNotice {
  id: number
  senderId: string
  senderName: string
  senderAvatar?: string | null
  content: string
  createdAt: string
}

interface TeamRoleCardClient {
  roleId: string
  name: string
  department: string
  identity: string
  privateKnowledge: string[]
  goal: string
  disclosureRules: string[]
  avatarTone: string
}

interface TeamCombatRoleClient {
  roleId: PlayerModelId
  name: string
  code: string
  tagline: string
  specialty: string
  accent: string
}

interface TeamRoomInfo {
  roomId: string
  roomCode?: string
  projectId: number
  ownerId: string
  title: string
  status: string
  createdAt: string
  updatedAt: string
  mine: boolean
}

interface TeamRoomMember {
  userId: string
  displayName: string
  realName?: string | null
  avatarUrl?: string | null
  roleId?: string | null
  roleName?: string | null
  combatRoleId?: string | null
  combatRoleName?: string | null
  hp?: number | null
  status: string
  mine: boolean
  online?: boolean
}

interface TeamStoryMessage {
  id: number
  senderId: string | null
  senderType: 'user' | 'ai' | 'system' | string
  roleId: string | null
  roleName: string | null
  senderName: string
  content: string
  createdAt: string
  mine: boolean
}

interface TeamRoomSnapshot {
  room: TeamRoomInfo | null
  closed?: boolean
  left?: boolean
  removed?: boolean
  roleCards: TeamRoleCardClient[]
  combatRoles: TeamCombatRoleClient[]
  members: TeamRoomMember[]
  messages: TeamStoryMessage[]
}

interface TeamInvitation {
  id: number
  roomId: string
  projectId: number
  projectTitle: string
  missionCode: string
  roomTitle: string
  roomStatus: string
  ownerId: string
  inviterId: string
  inviterName: string
  inviterAvatar?: string | null
  inviteeId: string
  inviteeName: string
  inviteeAvatar?: string | null
  requestedById: string
  requesterName: string
  status: string
  createdAt: string
  updatedAt: string
}

interface TeamInvitationFeed {
  incoming: TeamInvitation[]
  approvals: TeamInvitation[]
  sent: TeamInvitation[]
}

interface TeamPublicRoom {
  roomId: string
  roomCode: string
  projectId: number
  projectTitle: string
  missionCode: string
  roomTitle: string
  roomStatus: string
  ownerId: string
  ownerName: string
  memberCount: number
  mineInRoom?: boolean
  pendingJoin?: boolean
  unlocked?: boolean
  joinable: boolean
}

interface SimulationSettings {
  soundEnabled: boolean
  musicVolume: number
  sfxVolume: number
  allowInvites: boolean
  allowGifts: boolean
  showOnline: boolean
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
const HP_SUPPLY_AMOUNT = 60
const SIMULATION_TIME_LIMIT_SECONDS = 90 * 60
const WALLET_KEY = 'gmp-simulation-wallet-v2'
const PROJECT_PROGRESS_KEY = 'gmp-simulation-project-progress-v1'
const MENTOR_HISTORY_KEY_PREFIX = 'gmp-simulation-mentor-history-v1'
const HP_KEY = 'gmp-simulation-hp-v2'
const CARRIER_KEY_PREFIX = 'gmp-simulation-carrier-v1'
const SETTINGS_KEY = 'gmp-simulation-settings-v1'
const TEST_INFINITE_RESOURCE = Number.POSITIVE_INFINITY
const TEST_ITEM_STOCK = 99
const TEST_LEVEL_SKIP_KEY = 'gmp-simulation-test-level-skips-v1'
const TEST_LEVEL_SKIP_LIMIT = PROJECT_MISSIONS.filter(project => !project.finalBoss).length
const HP_RECOVERY_KEY = 'gmp-simulation-hp-recovery-v1'
const MIN_PROJECT_ENTRY_HP = 60
const ZERO_HP_FULL_RECOVERY_MS = 5 * 60 * 1000
const BOUNTY_TEAM_PROJECT_ID = 99
const HALL_MUSIC_ASSET = '/simulation/audio/oga-hall-factory-ambiance.ogg'
const HUB_QUIZ_SELECT_SFX = ['/simulation/audio/game-metal-ping-2.ogg', '/simulation/audio/oga-sci-alert-2.ogg']
const HUB_QUIZ_CORRECT_SFX = ['/simulation/audio/game-metal-ping-1.ogg', '/simulation/audio/gs-correct-1.ogg']
const HUB_QUIZ_WRONG_SFX = ['/simulation/audio/game-break-heavy-2.ogg', '/simulation/audio/oga-sci-break-1.ogg']

function isBountyTeamProject(projectId: number | null | undefined) {
  return Number(projectId) === BOUNTY_TEAM_PROJECT_ID
}

function scopedStorageKey(baseKey: string, userId?: string | null) {
  const resolvedUserId = userId ?? (typeof window === 'undefined' ? null : localStorage.getItem('userId'))
  return resolvedUserId ? `${baseKey}:${resolvedUserId}` : baseKey
}

function carrierStorageKey(routeId: string) {
  return scopedStorageKey(`${CARRIER_KEY_PREFIX}:${routeId}`)
}

function mentorStorageKey(projectId: number) {
  return scopedStorageKey(`${MENTOR_HISTORY_KEY_PREFIX}:${projectId}`)
}

function fishboneStorageKey(projectId: number) {
  return scopedStorageKey(`gmp-simulation-fishbone-v1:${projectId}`)
}

const OPTION_KEYS = ['A', 'B', 'C', 'D']
const FALLBACK_PLAYER: PlayerState = { xp: 280, rankLevel: 3, rankTitle: 'GMP助理', rankProgress: 0.7 }
const DEFAULT_WALLET: Wallet = {
  coins: 0,
  gems: 0,
  trophies: 0,
  inventory: {
    skip: 1,
    boost: 1,
    heal: 1,
    hpSupply: 0,
    playerModelId: DEFAULT_PLAYER_MODEL_ID,
    playerModels: [DEFAULT_PLAYER_MODEL_ID],
    weapons: ['service-pistol', 'ak47', 'shotgun', 'sniper-rifle'],
    equippedWeaponId: null,
    roles: ['college-officer', 'undergraduate-lead'],
    equippedRoleId: null,
  },
}
const DEFAULT_SIMULATION_SETTINGS: SimulationSettings = {
  soundEnabled: true,
  musicVolume: 62,
  sfxVolume: 78,
  allowInvites: true,
  allowGifts: true,
  showOnline: true,
}
const DAILY_SUPPLY_REWARD: WalletReward = { coins: 160, gems: 8 }
const VICTORY_REWARD: WalletReward = { coins: 360, gems: 18, trophies: 1 }
const REVIEW_REWARD: WalletReward = { coins: 80, gems: 0 }
const BOUNTY_TRIAL_MAX_HP = 120
const BOUNTY_KILLS_PER_WAVE = 5
const BOUNTY_TASKS: BountyTaskDefinition[] = [
  {
    id: 'defect-cleanup',
    title: '清除缺陷怪',
    description: '击败 8 个记录、偏差或数据缺陷化身',
    target: 8,
    reward: { coins: 90, gems: 1 },
    progress: stats => stats.kills,
  },
  {
    id: 'elite-audit',
    title: '追缉精英异常',
    description: '击败 2 个带精英标记的异常守卫',
    target: 2,
    reward: { coins: 130, gems: 3 },
    progress: stats => stats.eliteKills,
  },
  {
    id: 'deep-wave',
    title: '推进无源头裂隙',
    description: '撑过 3 个完整波次后继续深入',
    target: 3,
    reward: { coins: 180, gems: 4 },
    progress: stats => stats.wavesCleared,
  },
]
const BOUNTY_ENEMY_ARCHETYPES = [
  { name: '批记录残影', tag: '记录缺失' },
  { name: '偏差游击员', tag: '调查滞后' },
  { name: '数据噪声体', tag: '完整性风险' },
  { name: '清洁盲区兽', tag: '交叉污染' },
  { name: 'CAPA 断链者', tag: '措施失效' },
]
const BOUNTY_ENDLESS_STAGE_WIDTH = 2860
const BOUNTY_ENDLESS_ATTACK_RANGE = 190
const BOUNTY_ENDLESS_BOSS_X = 2600
const BOUNTY_ENDLESS_MAPS = [
  '/simulation/backgrounds/Background_01.png',
  '/simulation/backgrounds/Background_02.png',
  '/simulation/backgrounds/Background_03.png',
  '/simulation/backgrounds/Desert_03.png',
  '/simulation/backgrounds/Space_Background_02.png',
]
const BOUNTY_ENDLESS_MONSTERS: EndlessBountyEnemyTemplate[] = [
  { id: 'virus', name: '污染病毒', title: '污染风险', hp: 68, damage: 8, rewardCoins: 18, rewardGems: 0, color: '#74d66f' },
  { id: 'defect', name: '缺陷兵', title: '记录缺口', hp: 82, damage: 10, rewardCoins: 22, rewardGems: 0, color: '#f2c86b' },
  { id: 'glitch', name: '数据故障体', title: '数据完整性', hp: 74, damage: 11, rewardCoins: 24, rewardGems: 0, color: '#70d6ff' },
  { id: 'wraith', name: '审计幽影', title: '审计追踪', hp: 88, damage: 12, rewardCoins: 28, rewardGems: 1, color: '#b78cff' },
  { id: 'tank', name: '偏差重甲', title: '高血量压制', hp: 132, damage: 14, rewardCoins: 38, rewardGems: 1, color: '#ff9b72', heavy: true },
  { id: 'flying', name: '飞行异常', title: '远程骚扰', hp: 72, damage: 10, rewardCoins: 30, rewardGems: 1, color: '#8fd3ff', flying: true },
  { id: 'elite', name: '精英缺陷守卫', title: '精英异常', hp: 150, damage: 16, rewardCoins: 54, rewardGems: 2, color: '#ffe08a', heavy: true },
  { id: 'golem', name: '精英石像守卫', title: '精英重型', hp: 190, damage: 18, rewardCoins: 66, rewardGems: 3, color: '#c8d1d8', heavy: true },
]
const BOUNTY_ENDLESS_BOSSES: EndlessBountyEnemyTemplate[] = [
  { id: 'boss', name: '体系裂隙领主', title: '本层 Boss', hp: 320, damage: 22, rewardCoins: 150, rewardGems: 5, color: '#ff6f6f', heavy: true },
  { id: 'boss', name: '终端审计王', title: '本层 Boss', hp: 350, damage: 24, rewardCoins: 165, rewardGems: 6, color: '#f2c86b', heavy: true },
  { id: 'boss', name: 'CAPA 断链主宰', title: '本层 Boss', hp: 380, damage: 25, rewardCoins: 180, rewardGems: 7, color: '#b78cff', heavy: true },
]

const EQUIPMENT_WEAPONS: EquipmentWeapon[] = [
  {
    id: 'audit-blade',
    name: '审计棍',
    tag: '连击',
    detail: '攻速快，适合连续压制缺陷。',
    shape: 'club',
    color: '#70d6ff',
    stat: '普攻 10 / 重击 20',
  },
  {
    id: 'evidence-hammer',
    name: '证据锤',
    tag: '重击',
    detail: '重击伤害高，适合打高血量 Boss。',
    shape: 'hammer',
    color: '#f2c86b',
    stat: '普攻 9 / 重击 30',
  },
  {
    id: 'capa-spear',
    name: 'CAPA 枪',
    tag: '长柄',
    detail: '攻击距离更远，换道追击容错更高。',
    shape: 'spear',
    color: '#59d99d',
    stat: '普攻 8 / 重击 20',
  },
  {
    id: 'data-shield',
    name: '数据盾',
    tag: '稳守',
    detail: '伤害较低，但适合保守推进。',
    shape: 'shield',
    color: '#b78cff',
    stat: '普攻 7 / 重击 16',
  },
  {
    id: 'deviation-axe',
    name: '偏差斧',
    tag: '爆发',
    detail: '重击爆发高，贴身清怪效率高。',
    shape: 'axe',
    color: '#ff8d6b',
    stat: '普攻 11 / 重击 34',
  },
  {
    id: 'sampling-gun',
    name: '取样枪',
    tag: '远程',
    detail: '可发射审计弹，适合安全距离压制。',
    shape: 'gun',
    color: '#9fe870',
    stat: '普攻 8 / 重击 18',
  },
  {
    id: 'risk-crossbow',
    name: '风险弩',
    tag: '穿透',
    detail: '弹道更远，适合远距离破防。',
    shape: 'crossbow',
    color: '#f7f0a1',
    stat: '普攻 9 / 重击 26',
  },
  { id: 'service-pistol', name: '制式手枪', tag: '轻型', detail: '稳定易用的基础远程武器。', shape: 'gun', color: '#8fd3ff', stat: '普攻 7 / 重击 15' },
  { id: 'glock19', name: 'Glock 19', tag: '速射', detail: '轻便灵活，适合移动中连续压制。', shape: 'gun', color: '#9fe870', stat: '普攻 8 / 重击 17' },
  { id: 'm1911', name: 'M1911', tag: '精准', detail: '单发稳定，兼顾射程和伤害。', shape: 'gun', color: '#f2c86b', stat: '普攻 9 / 重击 19' },
  { id: 'desert-eagle', name: '沙漠之鹰', tag: '高威力', detail: '后坐力较大，但单发伤害突出。', shape: 'gun', color: '#ff9b72', stat: '普攻 11 / 重击 27' },
  { id: 'magnum', name: '马格南', tag: '爆发', detail: '重型左轮，适合快速击破高防目标。', shape: 'gun', color: '#ff7f8d', stat: '普攻 12 / 重击 30' },
  { id: 'short-gun', name: '短管手枪', tag: '近射', detail: '近距离爆发更强，射程相对较短。', shape: 'gun', color: '#d7b8ff', stat: '普攻 10 / 重击 24' },
  { id: 'mini-uzi', name: 'Mini Uzi', tag: '连射', detail: '射速快，适合持续累积破防值。', shape: 'gun', color: '#70d6ff', stat: '普攻 7 / 重击 18' },
  { id: 'ak47', name: 'AK-47', tag: '突击', detail: '中远距离火力稳定，适合持续推进。', shape: 'gun', color: '#f1a95b', stat: '普攻 10 / 重击 24' },
  { id: 'lever-rifle', name: '杠杆步枪', tag: '猎手', detail: '射程较远，单发伤害和节奏平衡。', shape: 'gun', color: '#ddb879', stat: '普攻 11 / 重击 28' },
  { id: 'shotgun', name: '战术霰弹枪', tag: '近战爆发', detail: '近距离伤害很高，但有效射程较短。', shape: 'gun', color: '#ff8d6b', stat: '普攻 13 / 重击 36' },
  { id: 'sniper-rifle', name: '狙击步枪', tag: '超远程', detail: '射程最长，重击可对重点缺陷造成高额伤害。', shape: 'gun', color: '#b6d8ff', stat: '普攻 14 / 重击 40' },
  { id: 'blue-laser', name: '蓝光激光枪', tag: '能量', detail: '弹道稳定，适合远距离连续命中。', shape: 'gun', color: '#62c8ff', stat: '普攻 9 / 重击 25' },
  { id: 'fire-plasma', name: '烈焰等离子枪', tag: '灼烧', detail: '高能等离子弹具有较强爆发。', shape: 'gun', color: '#ff705d', stat: '普攻 12 / 重击 34' },
  { id: 'plasma-rifle', name: '高能等离子步枪', tag: '高阶', detail: '射程和伤害兼备的高阶能量武器。', shape: 'gun', color: '#a990ff', stat: '普攻 13 / 重击 36' },
  { id: 'ray-gun', name: '射线枪', tag: '穿透', detail: '高能射线适合快速击穿怪物防御。', shape: 'gun', color: '#67f2c1', stat: '普攻 11 / 重击 31' },
]

const EQUIPMENT_TOOLS: EquipmentTool[] = [
  { id: 'skip', icon: Ticket, name: '跳题卡', effect: 'Boss 战中跳过一题并造成固定伤害。' },
  { id: 'boost', icon: Zap, name: '增幅器', effect: '下一次答对后提高 Boss 战伤害。' },
  { id: 'heal', icon: HeartPulse, name: '补给包', effect: 'Boss 战中恢复生命值。' },
]

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

const ROLE_LOADOUTS: RoleLoadout[] = [
  {
    id: 'college-officer',
    track: 'college',
    rarity: '基础',
    coinPrice: 0,
    gemPrice: 0,
    hp: 100,
    attack: 8,
    support: 7,
    passive: '记录核对更稳，适合专科线路的 SOP 检查和现场取证。',
    ownedByDefault: true,
  },
  {
    id: 'production',
    track: 'college',
    rarity: '进阶',
    coinPrice: 2200,
    gemPrice: 52,
    hp: 116,
    attack: 10,
    support: 8,
    passive: '现场执行力更强，清理工艺类缺陷时额外获得支援提示。',
  },
  {
    id: 'specialist',
    track: 'college',
    rarity: '精英',
    coinPrice: 3600,
    gemPrice: 86,
    hp: 108,
    attack: 12,
    support: 11,
    passive: 'CAPA 闭环判断更强，适合后半段纠正预防类项目。',
  },
  {
    id: 'undergraduate-lead',
    track: 'undergraduate',
    rarity: '基础',
    coinPrice: 0,
    gemPrice: 0,
    hp: 106,
    attack: 10,
    support: 9,
    passive: '根因分析均衡，适合本科线路的调查答辩和风险论证。',
    ownedByDefault: true,
  },
  {
    id: 'validation-lead',
    track: 'undergraduate',
    rarity: '进阶',
    coinPrice: 2800,
    gemPrice: 68,
    hp: 112,
    attack: 12,
    support: 9,
    passive: '验证裁定伤害更高，适合 OOS、CSV 和验证类项目。',
  },
  {
    id: 'qa',
    track: 'undergraduate',
    rarity: '精英',
    coinPrice: 4200,
    gemPrice: 108,
    hp: 118,
    attack: 13,
    support: 12,
    passive: '放行边界判断更强，Boss 核验阶段提示更集中。',
  },
  {
    id: 'it',
    track: 'undergraduate',
    rarity: '传说',
    coinPrice: 6200,
    gemPrice: 168,
    hp: 104,
    attack: 15,
    support: 13,
    passive: '数据完整性专精，远程武器和审计追踪类缺陷收益最高。',
  },
]

const SIMULATION_FRIENDS: SimulationFriend[] = [
  {
    id: 'lin-qing',
    name: '林青',
    title: '数据完整性队友',
    track: 'undergraduate',
    level: 6,
    online: true,
    status: '正在刷项目 06 数据实验室',
    specialty: '审计追踪 / 远程支援',
    weaponId: 'sampling-gun',
  },
  {
    id: 'chen-yue',
    name: '陈越',
    title: '现场调查队友',
    track: 'college',
    level: 4,
    online: true,
    status: '可加入总混偏差实训',
    specialty: '现场取证 / 生命支援',
    weaponId: 'data-shield',
  },
  {
    id: 'zhou-nan',
    name: '周南',
    title: 'CAPA 闭环队友',
    track: 'undergraduate',
    level: 8,
    online: false,
    status: '离线，最近通关项目 07',
    specialty: 'CAPA 计划 / Boss 破防',
    weaponId: 'capa-spear',
  },
  {
    id: 'su-jian',
    name: '苏简',
    title: '清洁验证队友',
    track: 'college',
    level: 5,
    online: true,
    status: '在线',
    specialty: '清洁验证 / 道具补给',
    weaponId: 'evidence-hammer',
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
  { id: 'hpSupply', icon: HeartPulse, name: '血量补给包', effect: `3D 实战外使用，恢复 ${HP_SUPPLY_AMOUNT} 点实训血量`, coinPrice: 420, gemPrice: 10 },
  { id: 'skip', icon: Ticket, name: '调查直通卡', effect: '跳过当前题并对 Boss 造成 30 HP 伤害', coinPrice: 900, gemPrice: 24 },
  { id: 'boost', icon: Zap, name: '证据增幅器', effect: '下一次答对时额外造成 35 HP 伤害', coinPrice: 720, gemPrice: 18 },
  { id: 'heal', icon: HeartPulse, name: '应急补给包', effect: 'Boss 战中立即恢复 25 HP', coinPrice: 560, gemPrice: 12 },
]

const HERO_UNLOCKS: HeroUnlock[] = [
  { id: 'knight-hero', rarity: '初始', coinPrice: 0, gemPrice: 0, hp: 140, attack: 10, mobility: 10, passive: '第三次普攻释放地面剑气，适合稳定开荒。' },
  { id: 'knight2', rarity: '进阶', coinPrice: 2600, gemPrice: 58, hp: 135, attack: 12, mobility: 11, passive: '连段节奏更快，圣辉闪电能压低高威胁目标。' },
  { id: 'pixel-knight', rarity: '进阶', coinPrice: 3400, gemPrice: 82, hp: 150, attack: 11, mobility: 9, passive: '盾剑平衡，容错更高，适合持续推进。' },
  { id: 'sprite-hero', rarity: '精英', coinPrice: 4200, gemPrice: 108, hp: 122, attack: 10, mobility: 13, passive: '移动灵活，劈砍命中后更容易保持安全距离。' },
  { id: 'black-knight', rarity: '精英', coinPrice: 5200, gemPrice: 146, hp: 165, attack: 13, mobility: 7, passive: '生命和压制力高，火焰伤害适合处理重甲目标。' },
  { id: 'demon-warrior', rarity: '传说', coinPrice: 6200, gemPrice: 168, hp: 130, attack: 14, mobility: 12, passive: '紫电持续伤害叠满后触发雷击暴击。' },
]

const MEDAL_CONTENT: Record<MedalTier, { label: string; color: string; detail: string }> = {
  gold: { label: '金牌', color: '#f2c45d', detail: '调查严谨且攻坚精准，已完成完整质量闭环。' },
  silver: { label: '银牌', color: '#cbd9e8', detail: '成功压制偏差风险，继续提升核验效率即可冲击金牌。' },
  bronze: { label: '铜牌', color: '#d89a62', detail: '成功守住质量底线，建议再次挑战强化证据判断。' },
  none: { label: '尚未通关', color: '#f47f84', detail: 'Boss 仍有残余风险，请补齐证据链后再次挑战。' },
}

function answersMatch(answer: string[], question: TrainingQuestion) {
  if (question.kind === 'sequence') {
    return answer.join('|') === question.correct.join('|')
  }
  return [...answer].sort().join('|') === [...question.correct].sort().join('|')
}

function questionLabel(kind: QuestionKind) {
  if (kind === 'single') return '单选题'
  if (kind === 'multiple') return '多选题'
  if (kind === 'sequence') return '排序题'
  return '案例分析题'
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

const REGULAR_PROJECT_KEYS = new Set(PROJECT_MISSIONS.filter(project => !project.finalBoss).map(project => projectKey(project.id)))
const FINAL_BOSS_PROJECT = PROJECT_MISSIONS.find(project => project.finalBoss)
const DEFAULT_COURSE_CREDIT_SUMMARY: CourseCreditSummary = {
  totalEarnedCredits: 0,
  totalMaxCredits: COURSE_CREDIT_RULES.courseLearningRegular,
  totalEarnedHours: 0,
  totalMaxHours: 0,
}

function normalizeCreditHours(value: unknown, medal: Exclude<ProjectMedal, 'none'>, projectId: number) {
  void value

  return creditForProjectMedal(projectId, medal)
}

function getProjectMedal(progress: ProjectProgress, projectId: number): ProjectMedal {
  return progress[projectKey(projectId)]?.medal ?? 'none'
}

function getBestProjectProgressEntry(existing: ProjectProgressEntry | undefined, next: ProjectProgressEntry) {
  if (!existing) return next

  const existingRank = medalRank(existing.medal)
  const nextRank = medalRank(next.medal)
  if (nextRank > existingRank) return next
  if (nextRank === existingRank && next.bestScore > existing.bestScore) return next
  return existing
}

function isCompletedProjectMedal(value: unknown): value is Exclude<ProjectMedal, 'none'> {
  return value === 'bronze' || value === 'silver' || value === 'gold'
}

function normalizeTestSkippedProjectIds(value: unknown) {
  if (!Array.isArray(value)) return []

  const projectIds = new Set(PROJECT_MISSIONS.filter(project => !project.finalBoss).map(project => project.id))
  return Array.from(new Set(
    value
      .map(projectId => Number(projectId))
      .filter(projectId => Number.isInteger(projectId) && projectIds.has(projectId)),
  )).slice(0, TEST_LEVEL_SKIP_LIMIT)
}

function normalizeProjectProgress(value: unknown): ProjectProgress {
  if (!value || typeof value !== 'object') return {}

  return Object.entries(value as Record<string, Record<string, unknown>>).reduce<ProjectProgress>((normalized, [key, entry]) => {
    const projectId = Number(key)
    if (!Number.isInteger(projectId) || !PROJECT_MISSIONS.some(project => project.id === projectId)) {
      return normalized
    }
    if (!entry || typeof entry !== 'object' || !isCompletedProjectMedal(entry.medal)) {
      return normalized
    }

    normalized[projectKey(projectId)] = {
      medal: entry.medal,
      bestScore: clampNumber(Math.round(Number(entry.bestScore) || 0), 0, 100),
      storyScore: clampNumber(Math.round(Number(entry.storyScore) || 0), 0, 100),
      bossAccuracy: clampNumber(Math.round(Number(entry.bossAccuracy) || 0), 0, 100),
      creditHours: normalizeCreditHours(entry.creditHours, entry.medal, projectId),
      completedAt: typeof entry.completedAt === 'string' && entry.completedAt ? entry.completedAt : new Date().toISOString(),
    }
    return normalized
  }, {})
}

function mergeProjectProgress(...maps: ProjectProgress[]) {
  return maps.reduce<ProjectProgress>((merged, map) => {
    for (const [key, entry] of Object.entries(map)) {
      merged[key] = getBestProjectProgressEntry(merged[key], entry)
    }
    return merged
  }, {})
}

function persistProjectProgress(progress: ProjectProgress) {
  if (typeof window === 'undefined') return
  localStorage.setItem(scopedStorageKey(PROJECT_PROGRESS_KEY), JSON.stringify(progress))
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

function summarizeCredit(progress: ProjectProgress, courseSummary: CourseCreditSummary = DEFAULT_COURSE_CREDIT_SUMMARY) {
  const gameEarned = Object.entries(progress).reduce((sum, [key, entry]) => {
    const projectId = Number(key)
    if (!REGULAR_PROJECT_KEYS.has(key)) return sum
    return sum + baseCreditForProjectMedal(projectId, entry.medal)
  }, 0)
  const medalBonusEarned = Object.entries(progress).reduce((sum, [key, entry]) => {
    return sum + medalBonusCreditForProject(Number(key), entry.medal)
  }, 0)
  const finalBossEarned = FINAL_BOSS_PROJECT && progress[projectKey(FINAL_BOSS_PROJECT.id)]?.medal !== undefined
    ? FINAL_BOSS_BASE_CREDIT
    : 0
  const cappedGameEarned = Math.min(gameEarned, COURSE_CREDIT_RULES.gameProjectRegular)
  const cappedMedalBonusEarned = Math.min(medalBonusEarned, MEDAL_BONUS_CREDIT_TOTAL)
  const cappedCourseEarned = Math.min(
    courseSummary.totalMaxCredits || COURSE_CREDIT_RULES.courseLearningRegular,
    Math.max(0, Number(courseSummary.totalEarnedCredits) || 0),
  )
  const simulationEarned = cappedGameEarned + finalBossEarned + cappedMedalBonusEarned
  const simulationRequired = COURSE_CREDIT_RULES.gameProjectRegular + FINAL_BOSS_BASE_CREDIT + MEDAL_BONUS_CREDIT_TOTAL
  const totalEarned = cappedCourseEarned + simulationEarned
  const totalRequired = COURSE_CREDIT_RULES.courseLearningRegular + simulationRequired + COURSE_CREDIT_RULES.courseFinalTest

  return {
    courseEarned: Number(cappedCourseEarned.toFixed(1)),
    courseRequired: courseSummary.totalMaxCredits || COURSE_CREDIT_RULES.courseLearningRegular,
    courseEarnedHours: Number((courseSummary.totalEarnedHours || 0).toFixed(2)),
    courseRequiredHours: courseSummary.totalMaxHours || 0,
    gameEarned: Number(cappedGameEarned.toFixed(1)),
    gameRequired: COURSE_CREDIT_RULES.gameProjectRegular,
    finalBossEarned,
    finalBossRequired: FINAL_BOSS_BASE_CREDIT,
    medalBonusEarned: Number(cappedMedalBonusEarned.toFixed(1)),
    medalBonusRequired: MEDAL_BONUS_CREDIT_TOTAL,
    simulationEarned: Number(simulationEarned.toFixed(1)),
    simulationRequired,
    courseRegular: COURSE_CREDIT_RULES.courseLearningRegular,
    regularTotal: COURSE_CREDIT_RULES.regularTotal,
    finalCourseTest: COURSE_CREDIT_RULES.courseFinalTest,
    finalBoss: COURSE_CREDIT_RULES.finalBoss,
    totalEarned: Number(totalEarned.toFixed(1)),
    totalRequired,
  }
}

function medalLabel(medal: ProjectMedal) {
  return medal === 'gold' ? '金牌' : medal === 'silver' ? '银牌' : medal === 'bronze' ? '铜牌' : '未通关'
}

function clampHp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function parseHpRecoveryState(raw: string | null): HpRecoveryState | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<HpRecoveryState>
    const recoverAt = Number(parsed.recoverAt)
    if (!Number.isFinite(recoverAt) || recoverAt <= 0) return null
    const parsedHp = Number(parsed.hp)
    const parsedUpdatedAt = Number(parsed.updatedAt)
    return {
      hp: Number.isFinite(parsedHp) ? clampHp(parsedHp) : 0,
      updatedAt: Number.isFinite(parsedUpdatedAt) && parsedUpdatedAt > 0
        ? parsedUpdatedAt
        : Math.max(0, recoverAt - ZERO_HP_FULL_RECOVERY_MS),
      recoverAt,
    }
  } catch {
    return null
  }
}

function buildHpRecoveryState(hp: number, updatedAt = Date.now()): HpRecoveryState | null {
  const normalizedHp = clampHp(hp)
  if (normalizedHp >= SIMULATION_MAX_HP) return null
  const remainingRatio = (SIMULATION_MAX_HP - normalizedHp) / SIMULATION_MAX_HP
  return {
    hp: normalizedHp,
    updatedAt,
    recoverAt: updatedAt + Math.ceil(ZERO_HP_FULL_RECOVERY_MS * remainingRatio),
  }
}

function hpFromRecoveryState(state: HpRecoveryState, now = Date.now()) {
  if (now >= state.recoverAt) return SIMULATION_MAX_HP
  const elapsed = Math.max(0, now - state.updatedAt)
  const recovered = state.hp + (elapsed / ZERO_HP_FULL_RECOVERY_MS) * SIMULATION_MAX_HP
  return clampHp(recovered)
}

function formatHpRecoveryWait(recoverAt: number | null) {
  if (!recoverAt) return '5 分钟'
  const remainingSeconds = Math.max(1, Math.ceil((recoverAt - Date.now()) / 1000))
  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = remainingSeconds % 60
  return minutes > 0 ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function isKnownWeaponId(weaponId: string) {
  return EQUIPMENT_WEAPONS.some(weapon => weapon.id === weaponId)
}

function roleById(roleId: string | null | undefined) {
  return ROLES.find(role => role.id === roleId) ?? null
}

function roleLoadoutById(roleId: string | null | undefined) {
  return ROLE_LOADOUTS.find(role => role.id === roleId) ?? null
}

function equipmentRolePortraitClass(roleId: string) {
  const classes: Record<string, string> = {
    'college-officer': styles.equipmentPortraitCollege,
    'undergraduate-lead': styles.equipmentPortraitUndergraduate,
    'validation-lead': styles.equipmentPortraitValidation,
    qa: styles.equipmentPortraitQa,
    it: styles.equipmentPortraitIt,
    production: styles.equipmentPortraitProduction,
    specialist: styles.equipmentPortraitSpecialist,
  }
  return classes[roleId] ?? ''
}

function isKnownRoleId(roleId: string) {
  return ROLE_LOADOUTS.some(role => role.id === roleId)
}

function defaultRoleIdForTrack(track: EducationTrack) {
  return track === 'college' ? 'college-officer' : 'undergraduate-lead'
}

function roleOptionsForTrack(track: EducationTrack) {
  return ROLE_LOADOUTS.filter(role => role.track === track)
}

function rolePriceLabel(loadout: RoleLoadout) {
  return loadout.coinPrice <= 0 ? '默认可用' : `${loadout.coinPrice.toLocaleString()} 金币 / ${loadout.gemPrice} 钻石`
}

function heroUnlockById(modelId: PlayerModelId) {
  return HERO_UNLOCKS.find(hero => hero.id === modelId) ?? HERO_UNLOCKS[0]
}

function isKnownPlayerModelUnlockId(modelId: string) {
  return HERO_UNLOCKS.some(hero => hero.id === modelId)
}

function canUnlockPlayerModel(inventory: Inventory, modelId: PlayerModelId) {
  const index = HERO_UNLOCKS.findIndex(hero => hero.id === modelId)
  if (index <= 0) return true
  return inventory.playerModels.includes(HERO_UNLOCKS[index - 1].id)
}

function playerPreviewModelShift(modelId: PlayerModelId) {
  const shifts: Record<PlayerModelId, number> = {
    'knight-hero': -7,
    knight2: 36,
    'pixel-knight': 7,
    'sprite-hero': 4,
    'black-knight': 20,
    'demon-warrior': 11,
  }
  return shifts[modelId] ?? 0
}

function playerModelSpriteStyle(model: PlayerModel, scale = 1) {
  const sprite = playerAnimationStyle(model, 'idle', scale)
  return {
    '--model-sheet': `url("${sprite.sheet}")`,
    '--model-frame-width': `${sprite.frameWidth}px`,
    '--model-frame-height': `${sprite.frameHeight}px`,
    '--model-sheet-width': `${sprite.sheetWidth}px`,
    '--model-travel': `${sprite.frameTravel}px`,
    '--model-frames': sprite.frameCount,
    '--model-steps': sprite.frameSteps,
    '--model-accent': sprite.accent,
    '--model-x-shift': `${Math.round(playerPreviewModelShift(model.id) * scale)}px`,
    '--model-ground-shift': `${sprite.groundOffset}px`,
  } as CSSProperties
}

function playerModelPreviewSpriteStyle(model: PlayerModel, maxWidth: number, maxHeight: number, maxScale = 1) {
  return playerModelSpriteStyle(model, playerModelFitScale(model, maxWidth, maxHeight, maxScale))
}

const EQUIPMENT_HERO_PREVIEW: Record<PlayerModelId, { maxWidth: number; maxHeight: number; maxScale: number; y: number }> = {
  'knight-hero': { maxWidth: 380, maxHeight: 280, maxScale: 1.35, y: -76 },
  knight2: { maxWidth: 520, maxHeight: 260, maxScale: 1.28, y: -50 },
  'pixel-knight': { maxWidth: 360, maxHeight: 320, maxScale: 1.08, y: -96 },
  'sprite-hero': { maxWidth: 470, maxHeight: 440, maxScale: 1.45, y: -165 },
  'black-knight': { maxWidth: 520, maxHeight: 260, maxScale: 1.45, y: -75 },
  'demon-warrior': { maxWidth: 420, maxHeight: 360, maxScale: 1.55, y: -125 },
}

function equipmentHeroPreviewSpriteStyle(model: PlayerModel) {
  const preview = EQUIPMENT_HERO_PREVIEW[model.id]
  return {
    ...playerModelPreviewSpriteStyle(model, preview.maxWidth, preview.maxHeight, preview.maxScale),
    '--equipment-preview-y': `${preview.y}px`,
  } as CSSProperties
}

function normalizeWallet(storedWallet?: Partial<Wallet> | null): Wallet {
  const storedInventory = storedWallet?.inventory as Partial<Inventory> | undefined
  const storedWeapons = Array.isArray(storedInventory?.weapons)
    ? storedInventory.weapons.filter((weaponId): weaponId is string => typeof weaponId === 'string' && isKnownWeaponId(weaponId))
    : []
  const weapons = Array.from(new Set([...DEFAULT_WALLET.inventory.weapons, ...storedWeapons]))
  const storedRoles = Array.isArray(storedInventory?.roles)
    ? storedInventory.roles.filter((roleId): roleId is string => typeof roleId === 'string' && isKnownRoleId(roleId))
    : []
  const defaultRoleIds = ROLE_LOADOUTS.filter(role => role.ownedByDefault).map(role => role.id)
  const roles = Array.from(new Set([...defaultRoleIds, ...storedRoles]))
  const storedPlayerModels = Array.isArray(storedInventory?.playerModels)
    ? storedInventory.playerModels.filter((modelId): modelId is PlayerModelId => typeof modelId === 'string' && isPlayerModelId(modelId) && isKnownPlayerModelUnlockId(modelId))
    : []
  const playerModels = Array.from(new Set([DEFAULT_PLAYER_MODEL_ID, ...storedPlayerModels]))
  const storedEquippedWeaponId = typeof storedInventory?.equippedWeaponId === 'string' && isKnownWeaponId(storedInventory.equippedWeaponId)
    ? storedInventory.equippedWeaponId
    : null
  const equippedWeaponId = storedEquippedWeaponId && weapons.includes(storedEquippedWeaponId)
    ? storedEquippedWeaponId
    : null
  const storedEquippedRoleId = typeof storedInventory?.equippedRoleId === 'string' && isKnownRoleId(storedInventory.equippedRoleId)
    ? storedInventory.equippedRoleId
    : null
  const equippedRoleId = storedEquippedRoleId && roles.includes(storedEquippedRoleId)
    ? storedEquippedRoleId
    : null
  const playerModelId = isPlayerModelId(storedInventory?.playerModelId) && playerModels.includes(storedInventory.playerModelId)
    ? storedInventory.playerModelId
    : DEFAULT_PLAYER_MODEL_ID

  return {
    ...DEFAULT_WALLET,
    ...storedWallet,
    trophies: storedWallet?.trophies ?? DEFAULT_WALLET.trophies,
    inventory: {
      ...DEFAULT_WALLET.inventory,
      ...storedInventory,
      weapons,
      equippedWeaponId,
      roles,
      equippedRoleId,
      playerModels,
      playerModelId,
    },
  }
}

function clampSettingPercent(value: unknown, fallback: number) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return fallback
  return Math.min(100, Math.max(0, Math.round(numberValue)))
}

function normalizeSimulationSettings(storedSettings?: Partial<SimulationSettings> | null): SimulationSettings {
  return {
    soundEnabled: typeof storedSettings?.soundEnabled === 'boolean' ? storedSettings.soundEnabled : DEFAULT_SIMULATION_SETTINGS.soundEnabled,
    musicVolume: clampSettingPercent(storedSettings?.musicVolume, DEFAULT_SIMULATION_SETTINGS.musicVolume),
    sfxVolume: clampSettingPercent(storedSettings?.sfxVolume, DEFAULT_SIMULATION_SETTINGS.sfxVolume),
    allowInvites: typeof storedSettings?.allowInvites === 'boolean' ? storedSettings.allowInvites : DEFAULT_SIMULATION_SETTINGS.allowInvites,
    allowGifts: typeof storedSettings?.allowGifts === 'boolean' ? storedSettings.allowGifts : DEFAULT_SIMULATION_SETTINGS.allowGifts,
    showOnline: typeof storedSettings?.showOnline === 'boolean' ? storedSettings.showOnline : DEFAULT_SIMULATION_SETTINGS.showOnline,
  }
}

function equipmentWeaponById(weaponId: string | null | undefined) {
  return EQUIPMENT_WEAPONS.find(weapon => weapon.id === weaponId) ?? null
}

function equipmentWeaponIcon(weaponId: string) {
  return `/simulation/inventory/${weaponId}.png`
}

function equipmentWeaponShapeClass(shape: SimWeaponShape) {
  const className = `equipmentWeapon${shape[0].toUpperCase()}${shape.slice(1)}`
  return styles[className as keyof typeof styles] ?? ''
}

function mapThemeClassForProject(projectId: number) {
  const byId: Record<number, keyof typeof styles> = {
    1: 'mapThemeCastle',
    2: 'mapThemeCleaning',
    3: 'mapThemeAudit',
    4: 'mapThemeCold',
    5: 'mapThemeFortress',
    6: 'mapThemeLab',
    7: 'mapThemeCapa',
    8: 'mapThemeAseptic',
    9: 'mapThemeHvac',
    10: 'mapThemeChange',
    11: 'mapThemeFinal',
  }
  return styles[byId[projectId] ?? 'mapThemeCastle']
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

function suggestedPreviewPanFor(project: ProjectDefinition) {
  const left = percentNumber(project.position.left)
  const top = percentNumber(project.position.top)
  return {
    '--preview-pan-x': left < 32 ? '6.6%' : left > 66 ? '-7.2%' : '0%',
    '--preview-pan-y': top < 34 ? '7.8%' : top > 68 ? '-9.8%' : '0%',
  } as CSSProperties
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

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function createBountyEnemy(wave: number, kills: number): BountyEnemy {
  const elite = (kills + 1) % BOUNTY_KILLS_PER_WAVE === 0 || wave % 4 === 0
  const archetype = BOUNTY_ENEMY_ARCHETYPES[(wave + kills) % BOUNTY_ENEMY_ARCHETYPES.length]
  const maxHp = elite ? 92 + wave * 18 : 54 + wave * 11
  return {
    id: Date.now() + kills + wave,
    name: elite ? `精英 ${archetype.name}` : archetype.name,
    tag: elite ? `${archetype.tag} / 精英` : archetype.tag,
    kind: elite ? 'elite' : 'normal',
    hp: maxHp,
    maxHp,
    damage: elite ? 15 + Math.ceil(wave * 1.5) : 8 + Math.ceil(wave * 1.1),
    rewardCoins: elite ? 46 + wave * 7 : 20 + wave * 4,
    rewardGems: elite ? 1 + Math.floor(wave / 5) : wave % 3 === 0 ? 1 : 0,
  }
}

function shuffledBountyTemplates(level: number) {
  return [...BOUNTY_ENDLESS_MONSTERS]
    .map((template, index) => ({ template, order: Math.sin((level + 3) * (index + 11)) }))
    .sort((a, b) => a.order - b.order)
    .map(item => item.template)
}

function createEndlessBountyEnemy(template: EndlessBountyEnemyTemplate, level: number, index: number, boss = false): EndlessBountyEnemy {
  const scale = boss ? 1 + level * 0.18 : 1 + level * 0.09
  const lane = boss ? 1 : (index + level + randomInt(0, 2)) % 3
  const x = boss
    ? BOUNTY_ENDLESS_BOSS_X
    : 430 + index * 245 + randomInt(-72, 88)
  const maxHp = Math.round(template.hp * scale)
  return {
    id: `${boss ? 'boss' : 'mob'}-${level}-${index}-${Date.now()}-${randomInt(10, 999)}`,
    templateId: template.id,
    name: boss ? `${template.name} Lv.${level}` : template.name,
    title: template.title,
    lane,
    x: Math.max(260, Math.min(BOUNTY_ENDLESS_STAGE_WIDTH - 120, x)),
    hp: maxHp,
    maxHp,
    damage: Math.round(template.damage * (boss ? 1 + level * 0.08 : 1 + level * 0.055)),
    rewardCoins: Math.round(template.rewardCoins * (1 + level * 0.08)),
    rewardGems: template.rewardGems + (boss ? Math.floor(level / 2) : level >= 5 && template.id !== 'virus' ? 1 : 0),
    color: template.color,
    flying: Boolean(template.flying),
    heavy: Boolean(template.heavy),
    boss,
  }
}

function createEndlessBountyLevel(level: number) {
  const basePool = shuffledBountyTemplates(level)
  const extraCount = Math.min(8, Math.max(1, level + 1))
  const extraPool = Array.from({ length: extraCount }, (_, index) => basePool[(index + level) % basePool.length])
  const mobs = [...basePool, ...extraPool]
    .map((template, index) => createEndlessBountyEnemy(template, level, index))
    .sort((a, b) => a.x - b.x)
  const bossTemplate = BOUNTY_ENDLESS_BOSSES[(level + randomInt(0, BOUNTY_ENDLESS_BOSSES.length - 1)) % BOUNTY_ENDLESS_BOSSES.length]
  return [...mobs, createEndlessBountyEnemy(bossTemplate, level, mobs.length, true)]
}

export default function SimulationPage() {
  const router = useRouter()
  const [launched, setLaunched] = useState(false)
  const [screen, setScreen] = useState<Screen>('map')
  const [displayName, setDisplayName] = useState('学员')
  const [realName, setRealName] = useState('学员')
  const [userEmail, setUserEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [player, setPlayer] = useState<PlayerState>(FALLBACK_PLAYER)
  const [wallet, setWallet] = useState<Wallet>(DEFAULT_WALLET)
  const [simulationSettings, setSimulationSettings] = useState<SimulationSettings>(DEFAULT_SIMULATION_SETTINGS)
  const [supplyOpen, setSupplyOpen] = useState(false)
  const [shopOpen, setShopOpen] = useState(false)
  const [shopItemsOnly, setShopItemsOnly] = useState(false)
  const [equipmentOpen, setEquipmentOpen] = useState(false)
  const [trophyOpen, setTrophyOpen] = useState(false)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const [quickPanel, setQuickPanel] = useState<QuickPanel | null>(null)
  const [quickPanelPeerId, setQuickPanelPeerId] = useState<string | null>(null)
  const [teamInviteOpen, setTeamInviteOpen] = useState(false)
  const [teamInviteAutoFriendId, setTeamInviteAutoFriendId] = useState<string | null>(null)
  const [teamInviteInitialRoomId, setTeamInviteInitialRoomId] = useState<string | null>(null)
  const [teamInviteInitialView, setTeamInviteInitialView] = useState<TeamInviteInitialView>('room')
  const [projectDetailOpen, setProjectDetailOpen] = useState(false)
  const [teamRoomId, setTeamRoomId] = useState<string | null>(null)
  const [activeTeamProjectId, setActiveTeamProjectId] = useState<number | null>(null)
  const [activeTeamRoomOwner, setActiveTeamRoomOwner] = useState(false)
  const [teamInvitationFeed, setTeamInvitationFeed] = useState<TeamInvitationFeed>({ incoming: [], approvals: [], sent: [] })
  const [privateMessageNoticeCount, setPrivateMessageNoticeCount] = useState(0)
  const [friendRequestNoticeCount, setFriendRequestNoticeCount] = useState(0)
  const [activeTeamInvitation, setActiveTeamInvitation] = useState<TeamInvitation | null>(null)
  const [teamInvitationBusy, setTeamInvitationBusy] = useState(false)
  const [teamInvitationError, setTeamInvitationError] = useState('')
  const [learningReportOpen, setLearningReportOpen] = useState(false)
  const [friendIds, setFriendIds] = useState<string[]>(['lin-qing', 'chen-yue'])
  const [partyFriend, setPartyFriend] = useState<SimulationFriend | null>(null)
  const [teamAllies, setTeamAllies] = useState<string[]>([])
  const [entryConfirm, setEntryConfirm] = useState<ProjectEntryConfirm | null>(null)
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false)
  const [actionSignal, setActionSignal] = useState<ActionSignal | null>(null)
  const [notice, setNotice] = useState<NoticeMessage | null>(null)
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [leaderboardError, setLeaderboardError] = useState('')
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([])
  const [currentLeaderboardEntry, setCurrentLeaderboardEntry] = useState<LeaderboardEntry | null>(null)
  const [projectProgress, setProjectProgress] = useState<ProjectProgress>({})
  const [courseCreditSummary, setCourseCreditSummary] = useState<CourseCreditSummary>(DEFAULT_COURSE_CREDIT_SUMMARY)
  const [testSkippedProjectIds, setTestSkippedProjectIds] = useState<number[]>([])
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
  const [game3dPaused, setGame3dPaused] = useState(false)
  const [gameRunKey, setGameRunKey] = useState(0)
  const [bountyRunKey, setBountyRunKey] = useState(0)
  const [hpRecoveryEndsAt, setHpRecoveryEndsAt] = useState<number | null>(null)
  const [mapPan, setMapPan] = useState<MapPan>({ x: 0, y: 0 })
  const [mapPanning, setMapPanning] = useState(false)
  const [routeTravel, setRouteTravel] = useState<RouteTravel | null>(null)
  const [pendingRouteFromProjectId, setPendingRouteFromProjectId] = useState<number | null>(null)
  const [smartMission, setSmartMission] = useState<SmartMissionResponse | null>(null)
  const mapPanRef = useRef<MapPan>(mapPan)
  const simulationHpRef = useRef(DEMO_HP)
  const battleHpRef = useRef(DEMO_HP)
  const walletRef = useRef<Wallet>(wallet)
  const hpRecoveryEndsAtRef = useRef<number | null>(null)
  const hpRecoveryStateRef = useRef<HpRecoveryState | null>(null)
  const hallMusicRef = useRef<HTMLAudioElement | null>(null)
  const mapDragRef = useRef<MapDragState | null>(null)
  const deferredInvitationIdsRef = useRef<Set<number>>(new Set())
  const activeTeamClosedNoticeRef = useRef('')
  const friendPresenceHydratedRef = useRef(false)
  const onlineFriendIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    walletRef.current = wallet
  }, [wallet])

  useEffect(() => {
    simulationHpRef.current = simulationHp
  }, [simulationHp])

  useEffect(() => {
    battleHpRef.current = battleHp
  }, [battleHp])

  function syncWalletTrophiesFromProgress(nextProgress: ProjectProgress) {
    const nextTrophies = summarizeTrophies(nextProgress).total
    setWallet(currentWallet => {
      if (currentWallet.trophies === nextTrophies) return currentWallet
      const syncedWallet = { ...currentWallet, trophies: nextTrophies }
      localStorage.setItem(scopedStorageKey(WALLET_KEY), JSON.stringify(syncedWallet))
      return syncedWallet
    })
  }

  async function syncProjectProgressEntry(projectId: number, entry: ProjectProgressEntry) {
    const token = readTeamAuthToken()
    if (!token) return

    try {
      const response = await fetch('/api/game/project-progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ projectId, ...entry }),
      })
      if (!response.ok) return

      const data = await response.json() as { progress?: unknown }
      if (!data.progress) return

      const serverProgress = normalizeProjectProgress(data.progress)
      setProjectProgress(current => {
        const merged = mergeProjectProgress(current, serverProgress)
        persistProjectProgress(merged)
        syncWalletTrophiesFromProgress(merged)
        return merged
      })
    } catch {
      // Local progress stays available; the next launch will retry by merging cached progress.
    }
  }

  function syncProjectProgressSnapshot(progress: ProjectProgress) {
    Object.entries(progress).forEach(([key, entry]) => {
      const projectId = Number(key)
      if (Number.isInteger(projectId)) {
        void syncProjectProgressEntry(projectId, entry)
      }
    })
  }

  function syncLocalProjectProgressSnapshot(localProgress: ProjectProgress, serverProgress: ProjectProgress) {
    Object.entries(localProgress).forEach(([key, entry]) => {
      const projectId = Number(key)
      if (!Number.isInteger(projectId)) return
      const serverEntry = serverProgress[key]
      const bestEntry = getBestProjectProgressEntry(serverEntry, entry)
      if (!serverEntry || bestEntry === entry) {
        void syncProjectProgressEntry(projectId, entry)
      }
    })
  }

  async function refreshServerProjectProgress(showError = false) {
    const token = readTeamAuthToken()
    if (!token) return
    try {
      const response = await fetch('/api/game/project-progress', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({})) as { progress?: unknown }
      if (!response.ok || !data.progress) return
      const serverProgress = normalizeProjectProgress(data.progress)
      setProjectProgress(current => {
        const mergedProgress = mergeProjectProgress(current, serverProgress)
        persistProjectProgress(mergedProgress)
        syncWalletTrophiesFromProgress(mergedProgress)
        return mergedProgress
      })
    } catch {
      if (showError) showActionSignal('实训进度刷新失败')
    }
  }

  function applyProjectProgressUpdate(projectId: number, nextProgressEntry: ProjectProgressEntry) {
    setProjectProgress(current => {
      const key = projectKey(projectId)
      const bestEntry = getBestProjectProgressEntry(current[key], nextProgressEntry)
      const nextProgress = {
        ...current,
        [key]: bestEntry,
      }
      persistProjectProgress(nextProgress)
      syncWalletTrophiesFromProgress(nextProgress)
      void syncProjectProgressEntry(projectId, bestEntry)
      return nextProgress
    })
  }

  useEffect(() => {
    const token = readTeamAuthToken()
    if (!token) {
      router.push('/login')
      return
    }

    const currentUserId = localStorage.getItem('userId')
    const walletKey = scopedStorageKey(WALLET_KEY, currentUserId)
    const progressKey = scopedStorageKey(PROJECT_PROGRESS_KEY, currentUserId)
    const hpKey = scopedStorageKey(HP_KEY, currentUserId)
    const hpRecoveryKey = scopedStorageKey(HP_RECOVERY_KEY, currentUserId)
    const testLevelSkipKey = scopedStorageKey(TEST_LEVEL_SKIP_KEY, currentUserId)

    const storedDisplayName = localStorage.getItem('displayName') || '学员'
    setDisplayName(storedDisplayName)
    setRealName(storedDisplayName)
    setAvatarUrl(localStorage.getItem('avatarUrl'))

    let initialProgress: ProjectProgress = {}
    const savedWallet = localStorage.getItem(walletKey)
    if (savedWallet) {
      try {
        const storedWallet = JSON.parse(savedWallet) as Partial<Wallet>
        setWallet(normalizeWallet(storedWallet))
      } catch {
        localStorage.removeItem(walletKey)
      }
    }

    const savedSettings = localStorage.getItem(SETTINGS_KEY)
    if (savedSettings) {
      try {
        setSimulationSettings(normalizeSimulationSettings(JSON.parse(savedSettings) as Partial<SimulationSettings>))
      } catch {
        localStorage.removeItem(SETTINGS_KEY)
      }
    }

    const savedProgress = localStorage.getItem(progressKey)
    if (savedProgress) {
      try {
        initialProgress = normalizeProjectProgress(JSON.parse(savedProgress))
        setProjectProgress(initialProgress)
      } catch {
        localStorage.removeItem(progressKey)
      }
    }

    const savedTestSkips = localStorage.getItem(testLevelSkipKey)
    if (savedTestSkips) {
      try {
        setTestSkippedProjectIds(normalizeTestSkippedProjectIds(JSON.parse(savedTestSkips)))
      } catch {
        localStorage.removeItem(testLevelSkipKey)
      }
    }

    const savedHpRaw = localStorage.getItem(hpKey)
    const savedHp = savedHpRaw === null ? Number.NaN : Number(savedHpRaw)
    const savedRecovery = parseHpRecoveryState(localStorage.getItem(hpRecoveryKey))
    let initialHp = Number.isFinite(savedHp) && savedHp >= 0 ? clampHp(savedHp) : DEMO_HP
    if (savedRecovery) {
      const recoveredHp = hpFromRecoveryState(savedRecovery)
      if (recoveredHp >= SIMULATION_MAX_HP || Date.now() >= savedRecovery.recoverAt) {
        initialHp = SIMULATION_MAX_HP
        localStorage.setItem(hpKey, String(SIMULATION_MAX_HP))
        localStorage.removeItem(hpRecoveryKey)
        hpRecoveryStateRef.current = null
        hpRecoveryEndsAtRef.current = null
        setHpRecoveryEndsAt(null)
        setNotice({
          tone: 'success',
          title: '血量已恢复完成',
          message: '你的实训血量已自动回满，可以继续进入章节挑战。',
          actionLabel: '继续实训',
        })
      } else {
        initialHp = recoveredHp
        localStorage.setItem(hpKey, String(recoveredHp))
        hpRecoveryStateRef.current = savedRecovery
        hpRecoveryEndsAtRef.current = savedRecovery.recoverAt
        setHpRecoveryEndsAt(savedRecovery.recoverAt)
      }
    } else {
      const recoveryState = buildHpRecoveryState(initialHp)
      hpRecoveryStateRef.current = recoveryState
      hpRecoveryEndsAtRef.current = recoveryState?.recoverAt ?? null
      setHpRecoveryEndsAt(recoveryState?.recoverAt ?? null)
      if (recoveryState) {
        localStorage.setItem(hpRecoveryKey, JSON.stringify(recoveryState))
      } else {
        localStorage.removeItem(hpRecoveryKey)
      }
    }
    simulationHpRef.current = initialHp
    battleHpRef.current = initialHp
    setSimulationHp(initialHp)
    setBattleHp(initialHp)

    Promise.all([
      fetch('/api/game/state', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }),
      fetch('/api/user/profile', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }),
      fetch('/api/simulation/cases', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }),
      fetch('/api/game/project-progress', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }),
      fetch('/api/course/overview', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }),
      fetch('/api/smart-missions', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }),
    ])
      .then(async ([gameResponse, profileResponse, casesResponse, progressResponse, courseResponse, smartMissionResponse]) => ({
        game: gameResponse.ok ? await gameResponse.json() : null,
        profile: profileResponse.ok ? await profileResponse.json() : null,
        cases: casesResponse.ok ? await casesResponse.json() : null,
        progress: progressResponse.ok ? await progressResponse.json() : null,
        course: courseResponse.ok ? await courseResponse.json() : null,
        smartMission: smartMissionResponse.ok ? await smartMissionResponse.json() : null,
      }))
      .then(({ game, profile, cases, progress, course, smartMission }) => {
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
          setUserEmail(profile.email || '')
          setAvatarUrl(profile.avatarUrl || null)
          localStorage.setItem('displayName', profile.displayName || '学员')
          if (profile.avatarUrl) localStorage.setItem('avatarUrl', profile.avatarUrl)
        }
        if (progress?.progress) {
          const serverProgress = normalizeProjectProgress(progress.progress)
          const mergedProgress = mergeProjectProgress(initialProgress, serverProgress)
          setProjectProgress(mergedProgress)
          persistProjectProgress(mergedProgress)
          syncWalletTrophiesFromProgress(mergedProgress)
          if (Object.keys(initialProgress).length) {
            window.setTimeout(() => syncLocalProjectProgressSnapshot(initialProgress, serverProgress), 500)
          }
        } else if (Object.keys(initialProgress).length) {
          window.setTimeout(() => syncProjectProgressSnapshot(initialProgress), 500)
        }
        if (course?.summary) {
          setCourseCreditSummary({
            totalEarnedCredits: Number(course.summary.totalEarnedCredits) || 0,
            totalMaxCredits: Number(course.summary.totalMaxCredits) || COURSE_CREDIT_RULES.courseLearningRegular,
            totalEarnedHours: Number(course.summary.totalEarnedHours) || 0,
            totalMaxHours: Number(course.summary.totalMaxHours) || 0,
          })
        }
        if (smartMission) setSmartMission(smartMission)
        setMajor(profile?.major || '药学')
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

    fetch('/api/onboarding/plan?lite=1', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then(async response => response.ok ? await response.json() : null)
      .then(plan => {
        if (!plan) return
        setMajor(plan.major || '药学')
        setEducationTrack(normalizeEducationTrack(plan.edu_level))
      })
      .catch(() => undefined)
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
    void refreshTeamInvitations(false)
    const timer = window.setInterval(() => {
      void refreshTeamInvitations(false)
    }, launched ? 3500 : 5000)
    return () => window.clearInterval(timer)
  }, [launched, simulationSettings.allowInvites])

  useEffect(() => {
    void refreshActiveTeamRoomStatus(false)
    const timer = window.setInterval(() => {
      void refreshActiveTeamRoomStatus(false)
    }, launched || teamRoomId || teamInviteOpen ? 2600 : 5000)
    return () => window.clearInterval(timer)
  }, [activeTeamProjectId, launched, teamInviteOpen, teamRoomId])

  useEffect(() => {
    const refreshNow = () => {
      if (document.visibilityState === 'hidden') return
      void refreshTeamInvitations(false)
      void refreshActiveTeamRoomStatus(false)
      void refreshServerProjectProgress(false)
    }
    window.addEventListener('focus', refreshNow)
    document.addEventListener('visibilitychange', refreshNow)
    return () => {
      window.removeEventListener('focus', refreshNow)
      document.removeEventListener('visibilitychange', refreshNow)
    }
  }, [teamRoomId])

  useEffect(() => {
    const token = readTeamAuthToken()
    if (!token) return undefined
    const soloActive = launched && !teamRoomId && ['briefing', 'story', 'boss', 'game3d'].includes(screen)
    const status = teamRoomId ? 'team' : soloActive ? 'solo' : 'idle'
    const projectId = activeTeamProjectId ?? selectedProjectId
    const sendActivity = (nextStatus = status) => {
      void fetch('/api/team/activity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: nextStatus,
          projectId,
          roomId: teamRoomId,
        }),
      }).catch(() => undefined)
    }
    sendActivity()
    if (status === 'idle') return undefined
    const timer = window.setInterval(() => sendActivity(), 20_000)
    return () => {
      window.clearInterval(timer)
      sendActivity('idle')
    }
  }, [activeTeamProjectId, launched, screen, selectedProjectId, teamRoomId])

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
  const visibleSmartMission = useMemo<SmartMissionResponse | null>(() => {
    if (!smartMission) return null
    const recommended = projects.find(project => project.id === smartMission.simulation.projectId)
    if (recommended?.status === 'active') return smartMission

    return {
      ...smartMission,
      simulation: {
        ...smartMission.simulation,
        projectId: currentUnlockedProject.id,
        projectTitle: currentUnlockedProject.title,
        missionCode: currentUnlockedProject.missionCode,
        caseFocus: currentUnlockedProject.caseFocus,
        riskSignal: currentUnlockedProject.riskSignal,
        reason: `基于当前已解锁进度，建议先完成：${currentUnlockedProject.riskSignal}`,
      },
    }
  }, [currentUnlockedProject, projects, smartMission])
  const activeProject = useMemo(() => getProjectDefinition(selectedProjectId), [selectedProjectId])
  const activeProjectNode = useMemo(
    () => projects.find(project => project.id === selectedProjectId) ?? projects[0],
    [projects, selectedProjectId],
  )
  const bountyTeamProjectNode = useMemo<ProjectNode>(() => {
    const finalProject = getProjectDefinition(11)
    return {
      ...finalProject,
      id: BOUNTY_TEAM_PROJECT_ID,
      missionCode: 'ENDLESS',
      title: '悬赏无尽试炼',
      curriculum: '悬赏训练',
      caseFocus: '无源头裂隙生存战',
      riskSignal: '所有章节怪物会随机出现，清理每层全部怪物后进入下一层。',
      firstAction: '组队进入无剧情生存战，尽可能推进更多层数。',
      status: 'active',
      medal: 'none',
    }
  }, [])
  const teamProjectChoices = useMemo(() => [...projects, bountyTeamProjectNode], [bountyTeamProjectNode, projects])
  const teamInviteProjectNode = activeTeamProjectId
    ? teamProjectChoices.find(project => project.id === activeTeamProjectId) ?? activeProjectNode
    : activeProjectNode
  const activeTeamProject = activeTeamProjectId
    ? teamProjectChoices.find(project => project.id === activeTeamProjectId) ?? null
    : null
  const pendingMessageCount = teamInvitationFeed.incoming.length + teamInvitationFeed.approvals.length + privateMessageNoticeCount + friendRequestNoticeCount
  const topTeamInvitation = teamInvitationFeed.incoming.find(invitation => !deferredInvitationIdsRef.current.has(invitation.id)) ?? null
  const trophySummary = useMemo(() => summarizeTrophies(projectProgress), [projectProgress])
  const creditSummary = useMemo(() => summarizeCredit(projectProgress, courseCreditSummary), [courseCreditSummary, projectProgress])
  const battleAllyNames = useMemo(
    () => teamAllies.length ? teamAllies : partyFriend ? [partyFriend.name] : [],
    [partyFriend, teamAllies],
  )
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
  const selectedRole = useMemo(() => {
    const defaultRoleId = defaultRoleIdForTrack(educationTrack)
    const equippedLoadout = roleLoadoutById(wallet.inventory.equippedRoleId)
    const equippedRoleId = equippedLoadout?.track === educationTrack && wallet.inventory.roles.includes(equippedLoadout.id)
      ? equippedLoadout.id
      : defaultRoleId
    return roleById(equippedRoleId) ?? roleById(defaultRoleId) ?? ROLES[0]
  }, [educationTrack, wallet.inventory.equippedRoleId, wallet.inventory.roles])
  const testToolsEnabled = isTestAccountEmail(userEmail)
  const walletView = useMemo<Wallet>(() => testToolsEnabled
    ? {
        ...wallet,
        coins: TEST_INFINITE_RESOURCE,
        gems: TEST_INFINITE_RESOURCE,
        inventory: {
          ...wallet.inventory,
          skip: Math.max(wallet.inventory.skip, TEST_ITEM_STOCK),
          boost: Math.max(wallet.inventory.boost, TEST_ITEM_STOCK),
          heal: Math.max(wallet.inventory.heal, TEST_ITEM_STOCK),
          hpSupply: Math.max(wallet.inventory.hpSupply, TEST_ITEM_STOCK),
        },
    }
    : wallet,
  [testToolsEnabled, wallet])
  const selectedHeroStats = useMemo(() => heroUnlockById(wallet.inventory.playerModelId), [wallet.inventory.playerModelId])
  const selectedHeroMaxHp = Math.max(1, Math.round(selectedHeroStats.hp || SIMULATION_MAX_HP))
  const selectedHeroBattleHp = Math.max(
    0,
    Math.min(selectedHeroMaxHp, Math.round((simulationHp / SIMULATION_MAX_HP) * selectedHeroMaxHp)),
  )
  const testSkipRemaining = testToolsEnabled ? Math.max(0, TEST_LEVEL_SKIP_LIMIT - testSkippedProjectIds.length) : 0
  const storyQuestions = useMemo(() => buildProjectStoryQuestions(activeProject, educationTrack, selectedCarrier), [activeProject, educationTrack, selectedCarrier])
  const bossQuestions = useMemo(() => buildProjectBossQuestions(activeProject, educationTrack, selectedCarrier), [activeProject, educationTrack, selectedCarrier])
  const bossMaxHp = useMemo(() => bossMaxHpFor(activeProject, bossQuestions.length), [activeProject, bossQuestions.length])
  const bossHitDamage = useMemo(() => bossHitDamageFor(bossQuestions.length), [bossQuestions.length])
  const currentStory = storyQuestions[storyIndex]
  const currentBoss = bossQuestions[bossIndex]
  const showHubChrome = screen === 'map' || screen === 'levels' || screen === 'briefing'
  const showMapHome = screen === 'map' || screen === 'briefing'
  const hallMusicActive = launched && showHubChrome
  const mapPanStyle = useMemo(() => ({
    '--map-pan-x': `${mapPan.x}px`,
    '--map-pan-y': `${mapPan.y}px`,
  }) as CSSProperties, [mapPan.x, mapPan.y])

  const trainingActive = screen === 'story' || screen === 'boss' || screen === 'game3d'
  const trainingTimerPaused = screen === 'game3d' && game3dPaused

  function heroBattleHpToSimulationHp(nextHeroHp: number) {
    const clampedHeroHp = Math.max(0, Math.min(selectedHeroMaxHp, Math.round(nextHeroHp)))
    return clampHp((clampedHeroHp / selectedHeroMaxHp) * SIMULATION_MAX_HP)
  }

  useEffect(() => {
    if (launched) return

    setSelectedProjectId(currentId => {
      const currentNode = projects.find(project => project.id === currentId)
      return currentNode?.status === 'active' ? currentId : currentUnlockedProject.id
    })
  }, [currentUnlockedProject.id, launched, projects])

  useEffect(() => {
    if (!primaryCarriers.some(carrier => carrier.id === selectedCarrierId)) {
      const savedCarrierId = localStorage.getItem(carrierStorageKey(carrierRoute.id))
      const nextCarrier = primaryCarriers.find(carrier => carrier.id === savedCarrierId) ?? primaryCarriers[0]
      setSelectedCarrierId(nextCarrier.id)
      setAuxiliaryCase(null)
    }
  }, [carrierRoute.id, primaryCarriers, selectedCarrierId])

  useEffect(() => {
    if (!trainingActive || trainingTimerPaused || timedOut || outcome) return

    const timerId = window.setInterval(() => {
      setRemainingTime(current => Math.max(0, current - 1))
    }, 1000)
    return () => window.clearInterval(timerId)
  }, [outcome, timedOut, trainingActive, trainingTimerPaused])

  useEffect(() => {
    if (screen !== 'game3d') setGame3dPaused(false)
  }, [screen])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    let hallMusic = hallMusicRef.current
    if (!hallMusic) {
      hallMusic = new Audio(HALL_MUSIC_ASSET)
      hallMusic.loop = true
      hallMusic.preload = 'auto'
      hallMusicRef.current = hallMusic
    }

    hallMusic.volume = Math.min(0.24, Math.max(0, simulationSettings.musicVolume / 100) * 0.2)
    if (!hallMusicActive || !simulationSettings.soundEnabled || simulationSettings.musicVolume <= 0) {
      hallMusic.pause()
      return undefined
    }

    void hallMusic.play().catch(() => undefined)
    return undefined
  }, [hallMusicActive, simulationSettings.musicVolume, simulationSettings.soundEnabled])

  useEffect(() => {
    return () => {
      const hallMusic = hallMusicRef.current
      if (!hallMusic) return
      hallMusic.pause()
      hallMusic.removeAttribute('src')
      hallMusic.load()
      hallMusicRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!hpRecoveryEndsAt) return undefined
    if (screen === 'story' || screen === 'boss' || screen === 'game3d' || screen === 'bounty') return undefined
    const delay = Math.max(0, hpRecoveryEndsAt - Date.now())
    const timerId = window.setTimeout(() => completeHpRecovery(true), delay)
    return () => window.clearTimeout(timerId)
  }, [hpRecoveryEndsAt, screen])

  useEffect(() => {
    if (!trainingActive || timedOut || outcome || remainingTime > 0) return
    failProjectByTimeout()
  }, [outcome, remainingTime, timedOut, trainingActive])

  function updateWallet(update: (current: Wallet) => Wallet) {
    setWallet(current => {
      const baseWallet = walletRef.current ?? current
      const nextWallet = update(baseWallet)
      if (nextWallet !== baseWallet) {
        walletRef.current = nextWallet
        localStorage.setItem(scopedStorageKey(WALLET_KEY), JSON.stringify(nextWallet))
      }
      return nextWallet
    })
  }

  function updateSimulationSettings(update: Partial<SimulationSettings>) {
    setSimulationSettings(current => {
      const nextSettings = normalizeSimulationSettings({ ...current, ...update })
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(nextSettings))
      return nextSettings
    })
  }

  function playSimulationUiSfx(sources: readonly string[], volumeFactor = 0.72) {
    if (typeof window === 'undefined') return
    if (!simulationSettings.soundEnabled || simulationSettings.sfxVolume <= 0) return
    const source = sources[Math.floor(Math.random() * sources.length)]
    const audio = new Audio(source)
    audio.preload = 'auto'
    audio.volume = Math.min(0.86, Math.max(0, simulationSettings.sfxVolume / 100) * volumeFactor)
    void audio.play().catch(() => undefined)
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
      tools: '工具面板已打开',
      messages: '消息中心已刷新',
      settings: '设置面板已打开',
    }
    if (panel === 'messages') void refreshTeamInvitations(false)
    setQuickPanelPeerId(null)
    setQuickPanel(panel)
    showActionSignal(labels[panel])
  }

  function handleFriendPresenceUpdate(friends: TeamFriend[]) {
    const nextOnlineIds = new Set(friends.filter(friend => friend.online).map(friend => friend.userId))
    if (!friendPresenceHydratedRef.current) {
      friendPresenceHydratedRef.current = true
      onlineFriendIdsRef.current = nextOnlineIds
      return
    }

    const newlyOnline = friends.filter(friend => friend.online && !onlineFriendIdsRef.current.has(friend.userId))
    onlineFriendIdsRef.current = nextOnlineIds
    if (!newlyOnline.length) return

    const names = newlyOnline.slice(0, 2).map(friend => friend.displayName).join('、')
    const suffix = newlyOnline.length > 2 ? ` 等 ${newlyOnline.length} 位好友` : ''
    showActionSignal(`${names}${suffix}已上线`)
  }

  async function refreshTeamInvitations(showError = true) {
    const token = readTeamAuthToken()
    if (!token) return
    try {
      const [response, messageResponse, friendResponse] = await Promise.all([
        fetch('/api/team/invitations', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }),
        fetch('/api/team/messages', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }).catch(() => null),
        fetch('/api/team/friends', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }).catch(() => null),
      ])
      const data = await response.json().catch(() => ({})) as TeamInvitationFeed & { error?: string }
      if (!response.ok) throw new Error(data.error || '邀请信息加载失败')
      if (messageResponse?.ok) {
        const messageData = await messageResponse.json().catch(() => ({})) as { notices?: TeamPrivateMessageNotice[] }
        setPrivateMessageNoticeCount(messageData.notices?.length ?? 0)
      }
      if (friendResponse?.ok) {
        const friendData = await friendResponse.json().catch(() => ({})) as { friends?: TeamFriend[]; incomingRequests?: TeamFriendRequest[] }
        handleFriendPresenceUpdate(friendData.friends ?? [])
        setFriendRequestNoticeCount(friendData.incomingRequests?.length ?? 0)
      }
      const feed: TeamInvitationFeed = {
        incoming: data.incoming ?? [],
        approvals: data.approvals ?? [],
        sent: data.sent ?? [],
      }
      setTeamInvitationFeed(feed)
      setActiveTeamInvitation(current => {
        if (current && [...feed.incoming, ...feed.approvals].some(invitation => invitation.id === current.id)) return current
        if (!simulationSettings.allowInvites) return null
        return feed.incoming.find(invitation => !deferredInvitationIdsRef.current.has(invitation.id))
          ?? feed.approvals.find(invitation => !deferredInvitationIdsRef.current.has(invitation.id))
          ?? null
      })
    } catch (error) {
      if (showError) {
        setNotice({
          tone: 'warning',
          title: '邀请信息加载失败',
          message: error instanceof Error ? error.message : '请稍后重试',
        })
      }
    }
  }

  async function refreshActiveTeamRoomStatus(showError = false) {
    const token = readTeamAuthToken()
    if (!token) return
    const query = teamRoomId
      ? `roomId=${encodeURIComponent(teamRoomId)}`
      : 'active=1'
    try {
      const response = await fetch(`/api/team/rooms?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({})) as TeamRoomSnapshot & { error?: string }
      if (!response.ok) throw new Error(data.error || '组队状态刷新失败')
      if (data.closed || data.removed) {
        const closedKey = teamRoomId || 'active-room'
        setTeamRoomId(null)
        setActiveTeamProjectId(null)
        setActiveTeamRoomOwner(false)
        setTeamAllies([])
        setTeamInviteOpen(false)
        setTeamInviteAutoFriendId(null)
        setTeamInviteInitialRoomId(null)
        if (activeTeamClosedNoticeRef.current !== closedKey) {
          activeTeamClosedNoticeRef.current = closedKey
          setNotice({
            tone: 'info',
            title: data.removed ? '已被移出队伍' : '队伍已解散',
            message: data.removed ? '房主已将你移出当前房间，正在组队状态已同步清除。' : '房主已解散当前队伍，正在组队状态已同步清除。',
          })
        }
        return
      }
      if (data.room) {
        activeTeamClosedNoticeRef.current = ''
        syncActiveTeamRoom(data)
      } else if (!teamRoomId) {
        setActiveTeamProjectId(null)
        setActiveTeamRoomOwner(false)
        setTeamAllies([])
      }
    } catch (error) {
      if (showError) {
        setNotice({
          tone: 'warning',
          title: '组队状态刷新失败',
          message: error instanceof Error ? error.message : '请稍后再试。',
        })
      }
    }
  }

  async function respondTeamInvitation(
    invitation: TeamInvitation,
    action: 'accept' | 'reject' | 'ignore' | 'later' | 'approve' | 'deny',
  ) {
    if (action === 'later') {
      deferredInvitationIdsRef.current.add(invitation.id)
      setActiveTeamInvitation(null)
      setTeamInvitationError('')
      return
    }
    const token = readTeamAuthToken()
    if (!token) return false
    setTeamInvitationBusy(true)
    setTeamInvitationError('')
    try {
      const response = await fetch('/api/team/invitations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ invitationId: invitation.id, action }),
      })
      const data = await response.json().catch(() => ({})) as {
        error?: string
        roomId?: string
        projectId?: number
      }
      if (!response.ok) throw new Error(data.error || '邀请处理失败')
      deferredInvitationIdsRef.current.delete(invitation.id)
      setActiveTeamInvitation(null)
      if (action === 'accept' && data.roomId && data.projectId) {
        if (!isBountyTeamProject(data.projectId)) setSelectedProjectId(data.projectId)
        setTeamRoomId(data.roomId)
        setTeamInviteInitialRoomId(data.roomId)
        setTeamInviteInitialView('room')
        setActiveTeamProjectId(data.projectId)
        setActiveTeamRoomOwner(false)
        setQuickPanel(null)
        setTeamInviteOpen(true)
        showActionSignal('已进入好友的组队房间')
      }
      void refreshTeamInvitations(false)
      return true
    } catch (error) {
      setTeamInvitationError(error instanceof Error ? error.message : '请稍后重试')
      return false
    } finally {
      setTeamInvitationBusy(false)
    }
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
    setEquipmentOpen(false)
    setShopOpen(false)
    setShopItemsOnly(false)
    setSupplyOpen(true)
    showActionSignal('补给面板已打开')
  }

  function openShopPanel(options: ShopOpenOptions = {}) {
    setEquipmentOpen(false)
    setSupplyOpen(false)
    setShopItemsOnly(Boolean(options.itemsOnly))
    setShopOpen(true)
    showActionSignal(options.itemsOnly ? '战斗道具商店已打开' : '战备仓库已打开')
  }

  function openEquipmentPanel() {
    setShopOpen(false)
    setShopItemsOnly(false)
    setSupplyOpen(false)
    setEquipmentOpen(true)
    showActionSignal('装备栏已打开')
  }

  function openTrophyPanel() {
    setTrophyOpen(true)
    showActionSignal('奖杯统计已刷新')
  }

  function setHpRecoveryState(recoveryState: HpRecoveryState | null) {
    if (hpRecoveryStateRef.current === recoveryState) return
    hpRecoveryStateRef.current = recoveryState
    hpRecoveryEndsAtRef.current = recoveryState?.recoverAt ?? null
    setHpRecoveryEndsAt(recoveryState?.recoverAt ?? null)
    const key = scopedStorageKey(HP_RECOVERY_KEY)
    if (recoveryState) {
      localStorage.setItem(key, JSON.stringify(recoveryState))
    } else {
      localStorage.removeItem(key)
    }
  }

  function completeHpRecovery(showNotice = true) {
    setHpRecoveryState(null)
    simulationHpRef.current = SIMULATION_MAX_HP
    battleHpRef.current = SIMULATION_MAX_HP
    setSimulationHp(current => current === SIMULATION_MAX_HP ? current : SIMULATION_MAX_HP)
    setBattleHp(current => current === SIMULATION_MAX_HP ? current : SIMULATION_MAX_HP)
    localStorage.setItem(scopedStorageKey(HP_KEY), String(SIMULATION_MAX_HP))
    const shouldShowNotice = showNotice && screen !== 'story' && screen !== 'boss' && screen !== 'game3d' && screen !== 'bounty'
    if (shouldShowNotice) {
      setNotice({
        tone: 'success',
        title: '血量已恢复完成',
        message: '你的实训血量已自动回满，可以继续进入章节挑战。',
        actionLabel: '继续实训',
      })
      showActionSignal('血量已恢复完成')
    }
  }

  function currentEffectiveHp() {
    const recoveryState = hpRecoveryStateRef.current
    if (!recoveryState) return simulationHpRef.current
    if (screen === 'story' || screen === 'boss' || screen === 'game3d' || screen === 'bounty') return simulationHpRef.current

    const now = Date.now()
    const recoveredHp = hpFromRecoveryState(recoveryState, now)
    if (recoveredHp >= SIMULATION_MAX_HP || now >= recoveryState.recoverAt) {
      completeHpRecovery(true)
      return SIMULATION_MAX_HP
    }
    if (recoveredHp !== simulationHpRef.current || recoveredHp !== battleHpRef.current) {
      simulationHpRef.current = recoveredHp
      battleHpRef.current = recoveredHp
      setSimulationHp(current => current === recoveredHp ? current : recoveredHp)
      setBattleHp(current => current === recoveredHp ? current : recoveredHp)
      localStorage.setItem(scopedStorageKey(HP_KEY), String(recoveredHp))
    }
    return recoveredHp
  }

  function ensureCanEnterProject() {
    const effectiveHp = currentEffectiveHp()
    if (effectiveHp >= MIN_PROJECT_ENTRY_HP) return true
    const recovering = effectiveHp < SIMULATION_MAX_HP && hpRecoveryEndsAtRef.current
    if (recovering) {
      setNotice({
        tone: 'warning',
        title: '血量不足，暂不能进入章节',
        message: `当前血量为 ${effectiveHp}/${SIMULATION_MAX_HP}，正在自动恢复中，约 ${formatHpRecoveryWait(hpRecoveryEndsAtRef.current)} 后回满。血量达到 ${MIN_PROJECT_ENTRY_HP} 以上才能进入章节。`,
        actionLabel: '去补给训练',
        onAction: openSupplyPanel,
      })
      showActionSignal('血量不足，无法进入章节')
      return false
    }
    setNotice({
      tone: 'warning',
      title: '血量不足，暂不能进入章节',
      message: recovering
        ? `当前血量为 0，正在自动恢复中，约 ${formatHpRecoveryWait(hpRecoveryEndsAtRef.current)} 后回满。血量达到 ${MIN_PROJECT_ENTRY_HP} 以上才能进入章节。`
        : `当前血量为 ${effectiveHp}/${SIMULATION_MAX_HP}，低于 ${MIN_PROJECT_ENTRY_HP}，请等待恢复或到补给训练使用血量补给包后再进入章节。`,
      actionLabel: '去补给训练',
      onAction: openSupplyPanel,
    })
    showActionSignal('血量不足，无法进入章节')
    return false
  }

  const syncSimulationHp = useCallback((nextValue: number) => {
    const nextHp = clampHp(nextValue)
    const currentRecoveryState = hpRecoveryStateRef.current
    const recoveryAlreadyMatches = nextHp >= SIMULATION_MAX_HP
      ? currentRecoveryState === null
      : currentRecoveryState?.hp === nextHp

    if (simulationHpRef.current === nextHp && battleHpRef.current === nextHp && recoveryAlreadyMatches) return

    simulationHpRef.current = nextHp
    battleHpRef.current = nextHp
    setSimulationHp(current => current === nextHp ? current : nextHp)
    setBattleHp(current => current === nextHp ? current : nextHp)
    localStorage.setItem(scopedStorageKey(HP_KEY), String(nextHp))
    if (nextHp >= SIMULATION_MAX_HP) {
      setHpRecoveryState(null)
      return
    }
    setHpRecoveryState(currentRecoveryState?.hp === nextHp ? currentRecoveryState : buildHpRecoveryState(nextHp))
  }, [])

  function syncHeroBattleHp(nextValue: number) {
    syncSimulationHp(heroBattleHpToSimulationHp(nextValue))
  }

  useEffect(() => {
    if (!hpRecoveryEndsAt) return undefined

    const recoveryPaused = () => screen === 'story' || screen === 'boss' || screen === 'game3d' || screen === 'bounty'
    const tickRecovery = () => {
      if (document.visibilityState === 'hidden') return
      if (recoveryPaused()) return
      currentEffectiveHp()
    }

    tickRecovery()
    const timer = window.setInterval(tickRecovery, 1000)
    const refreshAfterReturn = () => {
      if (recoveryPaused()) return
      if (document.visibilityState !== 'hidden') currentEffectiveHp()
    }
    window.addEventListener('focus', refreshAfterReturn)
    document.addEventListener('visibilitychange', refreshAfterReturn)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshAfterReturn)
      document.removeEventListener('visibilitychange', refreshAfterReturn)
    }
  }, [hpRecoveryEndsAt, screen, simulationHp])

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

  function skipProjectForTestAccount(projectId: number) {
    if (!testToolsEnabled) return

    const target = projects.find(project => project.id === projectId)
    if (!target) return
    if (target.finalBoss) {
      setNotice({
        tone: 'warning',
        title: '最终 Boss 不支持跳关',
        message: '测试跳关只作用于普通项目，最终 Boss 仍需要按完整进度开启。',
      })
      return
    }
    if (target.status === 'cleared') {
      showActionSignal('该关卡已经通关')
      return
    }
    if (testSkippedProjectIds.includes(projectId)) {
      showActionSignal('该关卡已经使用过跳关')
      return
    }
    if (testSkipRemaining <= 0) {
      setNotice({
        tone: 'warning',
        title: '跳关次数已用完',
        message: `测试账号最多只能跳过 ${TEST_LEVEL_SKIP_LIMIT} 个普通关卡。`,
      })
      return
    }

    const nextProgressEntry: ProjectProgressEntry = {
      medal: 'bronze',
      bestScore: STORY_PASS_SCORE,
      storyScore: STORY_PASS_SCORE,
      bossAccuracy: STORY_PASS_SCORE,
      creditHours: creditForProjectMedal(projectId, 'bronze'),
      completedAt: new Date().toISOString(),
    }
    applyProjectProgressUpdate(projectId, nextProgressEntry)
    setSelectedProjectId(projectId)
    recenterMap(target)
    setTestSkippedProjectIds(current => {
      const nextSkippedProjectIds = normalizeTestSkippedProjectIds([...current, projectId])
      localStorage.setItem(scopedStorageKey(TEST_LEVEL_SKIP_KEY), JSON.stringify(nextSkippedProjectIds))
      return nextSkippedProjectIds
    })
    showActionSignal(`已跳过「${target.title}」`)
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
    if (screen === 'map' || screen === 'levels') {
      closeExpeditionMap()
      return
    }
    if (screen === 'briefing' || screen === 'story' || screen === 'boss' || screen === 'game3d' || (screen === 'result' && !outcome?.victory)) {
      setExitConfirmOpen(true)
      showActionSignal('退出确认已打开')
      return
    }
    leaveSimulation()
  }

  function closeExpeditionMap() {
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
    showActionSignal('已返回实训首页')
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
    setLaunched(true)
    showActionSignal('已返回远征地图')
  }

  function requestEnterProject(projectId = selectedProjectId, returnScreen: 'map' | 'levels' = 'map') {
    const target = projects.find(project => project.id === projectId)
    if (!target) return
    if (target.status === 'locked') {
      setNotice({
        tone: 'warning',
        title: '项目尚未解锁',
        message: `「${target.title}」还不能进入调查。请先完成前置项目后再挑战。`,
      })
      return
    }
    if (teamRoomId) {
      setNotice({
        tone: 'warning',
        title: '当前已有组队房间',
        message: '房间存在时不能单人进入调查。请先进入房间继续组队，或解散、退出队伍后再单人挑战。',
      })
      return
    }
    enterProject(projectId, returnScreen)
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

  function prepareProjectRun(projectId = selectedProjectId, returnScreen: 'map' | 'levels' = 'map') {
    const target = projects.find(project => project.id === projectId)
    if (!target || target.status === 'locked') return false
    const entryHp = currentEffectiveHp()
    if (entryHp < MIN_PROJECT_ENTRY_HP) {
      ensureCanEnterProject()
      return false
    }
    setTeamRoomId(null)
    setTeamInviteInitialRoomId(null)
    setActiveTeamRoomOwner(false)
    setTeamAllies([])
    setSelectedProjectId(projectId)
    setStoryIndex(0)
    setStoryAnswers([])
    setStoryScore(0)
    setStoryFinished(false)
    setBossIndex(0)
    setBossAnswers([])
    setBossHp(BOSS_MAX_HP)
    setBattleCorrect(0)
    setDamageBoost(false)
    setBattleHp(entryHp)
    setOutcome(null)
    setBattleReward(null)
    setCreditAward(0)
    setProjectXpAward(null)
    setRemainingTime(SIMULATION_TIME_LIMIT_SECONDS)
    setTimedOut(false)
    setPendingRouteFromProjectId(null)
    setBriefingReturnScreen(returnScreen)
    setGameRunKey(key => key + 1)
    return true
  }

  function enterProject(projectId = selectedProjectId, returnScreen: 'map' | 'levels' = 'map') {
    if (teamRoomId) {
      setNotice({
        tone: 'warning',
        title: '当前已有组队房间',
        message: '房间存在时不能单人进入调查。请先进入房间继续组队，或解散、退出队伍后再单人挑战。',
      })
      return
    }
    setActiveTeamProjectId(null)
    if (!prepareProjectRun(projectId, returnScreen)) return
    setProjectDetailOpen(false)
    showActionSignal('正在进入角色选择')
    setScreen('game3d')
  }

  function selectMapProject(projectId: number) {
    const target = projects.find(project => project.id === projectId)
    if (!target) return
    setSelectedProjectId(projectId)
    recenterMap(target)
    showActionSignal(`已切换到项目 ${projectId}`)
  }

  function openTeamInviteForProject(projectId = selectedProjectId, autoFriendId: string | null = null) {
    const target = teamProjectChoices.find(project => project.id === projectId)
    if (!target) return
    const existingRoomForProject = teamRoomId && activeTeamProjectId === projectId ? teamRoomId : null
    if (!isBountyTeamProject(projectId)) setSelectedProjectId(projectId)
    if (target.status === 'locked') {
      setNotice({
        tone: 'warning',
        title: '暂不能组队',
        message: `「${target.title}」尚未解锁，暂时不能邀请好友一起调查。`,
      })
      return
    }
    setProjectDetailOpen(false)
    setActiveTeamProjectId(projectId)
    setTeamInviteInitialRoomId(existingRoomForProject)
    setTeamInviteInitialView('room')
    setTeamInviteAutoFriendId(autoFriendId)
    setTeamInviteOpen(true)
  }

  function syncActiveTeamRoom(snapshot: TeamRoomSnapshot) {
    const room = snapshot.room
    if (!room) return
    if (!isBountyTeamProject(room.projectId)) setSelectedProjectId(room.projectId)
    setTeamRoomId(room.roomId)
    setTeamInviteInitialRoomId(room.roomId)
    setActiveTeamProjectId(room.projectId)
    setActiveTeamRoomOwner(Boolean(room.mine))
    setTeamAllies(
      snapshot.members
        .filter(member => !member.mine && ['ready', 'selecting', 'selected', 'playing'].includes(member.status))
        .map(member => member.displayName),
    )
  }

  function startTeamInvestigation(snapshot: TeamRoomSnapshot) {
    const projectId = snapshot.room?.projectId ?? selectedProjectId
    if (isBountyTeamProject(projectId)) {
      const entryHp = currentEffectiveHp()
      if (entryHp < MIN_PROJECT_ENTRY_HP) {
        ensureCanEnterProject()
        return
      }
    } else if (!prepareProjectRun(projectId, 'map')) return
    setTeamAllies(
      snapshot.members
        .filter(member => !member.mine && ['ready', 'selecting', 'selected', 'playing'].includes(member.status))
        .map(member => member.displayName),
    )
    setTeamRoomId(snapshot.room?.roomId ?? null)
    setTeamInviteInitialRoomId(snapshot.room?.roomId ?? null)
    setActiveTeamProjectId(projectId)
    setActiveTeamRoomOwner(Boolean(snapshot.room?.mine))
    setTeamInviteOpen(false)
    if (isBountyTeamProject(projectId)) {
      setBountyRunKey(key => key + 1)
      showActionSignal('组队无尽试炼已开启')
      setScreen('bounty')
      return
    }
    showActionSignal('队伍已进入角色选择')
    setScreen('game3d')
  }

  async function finishTeamInvestigation(victory: boolean) {
    if (!teamRoomId) return
    const token = readTeamAuthToken()
    if (!token) return
    await fetch('/api/team/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: 'finish',
        roomId: teamRoomId,
        projectId: activeTeamProjectId ?? activeProject.id,
        result: victory ? 'victory' : 'failed',
      }),
    }).catch(() => undefined)
  }

  async function endTeamBattleFromGame() {
    if (!teamRoomId) return
    const token = readTeamAuthToken()
    if (!token) return
    await fetch('/api/team/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: 'endBattle',
        roomId: teamRoomId,
        projectId: activeTeamProjectId ?? activeProject.id,
      }),
    }).catch(() => undefined)
    handleTeamRoomStopped('ended')
  }

  function handleTeamRoomStopped(reason: 'ended' | 'disbanded') {
    if (reason === 'disbanded') {
      setNotice({
        tone: 'info',
        title: '房间已解散',
        message: '房主已解散房间，你已退出当前组队战斗。',
      })
      setTeamRoomId(null)
      setTeamInviteInitialRoomId(null)
      setActiveTeamProjectId(null)
      setActiveTeamRoomOwner(false)
      setTeamAllies([])
      setTeamInviteOpen(false)
      setScreen('map')
      setLaunched(true)
      return
    }

    setNotice({
      tone: 'info',
      title: '战斗已结束',
      message: '房主已结束当前战斗，队伍已返回组队页面。',
    })
    if (teamRoomId) setTeamInviteInitialRoomId(teamRoomId)
    setTeamInviteInitialView('room')
    setTeamInviteAutoFriendId(null)
    setTeamInviteOpen(true)
    setScreen('map')
    setLaunched(true)
  }

  function startStory() {
    const entryHp = currentEffectiveHp()
    if (entryHp < MIN_PROJECT_ENTRY_HP) {
      ensureCanEnterProject()
      return
    }
    showActionSignal('2D 横版项目现场已启动')
    setStoryIndex(0)
    setStoryAnswers([])
    setStoryScore(0)
    setStoryFinished(false)
    setBossIndex(0)
    setBossAnswers([])
    setBossHp(bossMaxHp)
    setBattleCorrect(0)
    setDamageBoost(false)
    setBattleHp(entryHp)
    setOutcome(null)
    setBattleReward(null)
    setCreditAward(0)
    setProjectXpAward(null)
    setRemainingTime(SIMULATION_TIME_LIMIT_SECONDS)
    setTimedOut(false)
    setScreen('game3d')
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
    playSimulationUiSfx(HUB_QUIZ_SELECT_SFX, 0.58)
    update(previous => {
      if (question.kind === 'single') return [id]
      if (question.kind === 'sequence') {
        return previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]
      }
      return previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]
    })
  }

  function submitStoryAnswer() {
    if (timedOut) return
    if (!storyAnswers.length) return
    const hit = answersMatch(storyAnswers, currentStory)
    playSimulationUiSfx(hit ? HUB_QUIZ_CORRECT_SFX : HUB_QUIZ_WRONG_SFX)
    const nextScore = storyScore + (hit ? currentStory.points : 0)
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
    setBattleCorrect(0)
    setDamageBoost(false)
    setScreen('boss')
  }

  function resolveBossTurn(hit: boolean, itemDamage = 0) {
    if (timedOut) return
    playSimulationUiSfx(hit || itemDamage > 0 ? HUB_QUIZ_CORRECT_SFX : HUB_QUIZ_WRONG_SFX)
    const boostDamage = hit && damageBoost ? BOSS_BOOST_DAMAGE : 0
    const attackDamage = (hit ? bossHitDamage + boostDamage : 0) + itemDamage
    const hpPenalty = !hit && itemDamage === 0 ? PLAYER_MISS_DAMAGE : 0
    const nextCorrect = battleCorrect + (hit ? 1 : 0)
    const nextBossHp = Math.max(0, bossHp - attackDamage)
    const nextHp = Math.max(0, battleHp - hpPenalty)
    const answered = bossIndex + 1
    const allBossQuestionsAnswered = bossIndex === bossQuestions.length - 1
    const bossDefeated = nextBossHp === 0
    const finished = nextHp === 0 || bossDefeated || allBossQuestionsAnswered

    if (hit && damageBoost) setDamageBoost(false)
    setBattleCorrect(nextCorrect)
    syncSimulationHp(nextHp)

    if (finished) {
      const accuracy = Math.round((nextCorrect / answered) * 100)
      const projectScore = Math.round((storyScore + accuracy) / 2)
      const victory = (bossDefeated || allBossQuestionsAnswered) && nextHp > 0 && projectScore >= STORY_PASS_SCORE
      const resolvedBossHp = victory ? 0 : nextBossHp
      const medal: MedalTier = victory ? medalFromScore(projectScore) : 'none'
      const previousMedal = getProjectMedal(projectProgress, activeProject.id)
      const isNewTrophy = victory && previousMedal === 'none'
      const earnedCredit = victory ? creditForProjectMedal(activeProject.id, medal) : 0
      const earnedReward = victory ? { ...VICTORY_REWARD, trophies: isNewTrophy ? 1 : 0 } : REVIEW_REWARD
      const completedAt = new Date().toISOString()
      const nextProgressEntry: ProjectProgressEntry | null = victory
        ? {
            medal,
            bestScore: projectScore,
            storyScore,
            bossAccuracy: accuracy,
            creditHours: earnedCredit,
            completedAt,
          }
        : null
      updateWallet(current => ({
        ...current,
        coins: current.coins + earnedReward.coins,
        gems: current.gems + earnedReward.gems,
        trophies: current.trophies + (earnedReward.trophies ?? 0),
      }))
      if (nextProgressEntry) {
        applyProjectProgressUpdate(activeProject.id, nextProgressEntry)
      }
      setBattleReward(earnedReward)
      setCreditAward(earnedCredit)
      setProjectXpAward(null)
      setPendingRouteFromProjectId(victory && isNewTrophy ? activeProject.id : null)
      setBossHp(resolvedBossHp)
      setOutcome({ victory, correct: nextCorrect, total: answered, hp: nextHp, bossHp: resolvedBossHp, medal, projectScore })
      if (victory && medal !== 'none') {
        void awardProjectCompletionXp(activeProject, medal, projectScore)
      }
      setScreen('result')
      return
    }
    setBossHp(nextBossHp)
    setBossIndex(index => index + 1)
    setBossAnswers([])
  }

  function submitBossAction() {
    if (!bossAnswers.length) return
    resolveBossTurn(answersMatch(bossAnswers, currentBoss))
  }

  function complete3dGame(result: Game3dCompletion) {
    const rawProjectScore = Math.max(0, Math.min(100, result.projectScore))
    const victory = result.victory && result.hp > 0
    const normalizedHp = heroBattleHpToSimulationHp(result.hp)
    const projectScore = victory ? Math.max(STORY_PASS_SCORE, rawProjectScore) : rawProjectScore
    const medal: MedalTier = victory ? medalFromScore(projectScore) : 'none'
    const previousMedal = getProjectMedal(projectProgress, activeProject.id)
    const isNewTrophy = victory && previousMedal === 'none'
    const earnedCredit = victory ? creditForProjectMedal(activeProject.id, medal) : 0
    const earnedReward = victory ? { ...VICTORY_REWARD, trophies: isNewTrophy ? 1 : 0 } : REVIEW_REWARD
    const completedAt = new Date().toISOString()
    const resolvedBossHp = victory ? 0 : result.bossHp
    const nextProgressEntry: ProjectProgressEntry | null = victory
      ? {
          medal,
          bestScore: projectScore,
          storyScore: result.storyScore,
          bossAccuracy: projectScore,
          creditHours: earnedCredit,
          completedAt,
        }
      : null

    setStoryScore(result.storyScore)
    setBattleCorrect(result.correct)
    syncSimulationHp(normalizedHp)
    setBossHp(resolvedBossHp)
    updateWallet(current => ({
      ...current,
      coins: current.coins + earnedReward.coins,
      gems: current.gems + earnedReward.gems,
      trophies: current.trophies + (earnedReward.trophies ?? 0),
    }))

    if (nextProgressEntry) {
      applyProjectProgressUpdate(activeProject.id, nextProgressEntry)
    }

    setBattleReward(earnedReward)
    setCreditAward(earnedCredit)
    setProjectXpAward(null)
    setPendingRouteFromProjectId(victory && isNewTrophy ? activeProject.id : null)
    setOutcome({
      victory,
      correct: result.correct,
      total: result.total,
      hp: normalizedHp,
      bossHp: resolvedBossHp,
      medal,
      projectScore,
    })
    if (victory && medal !== 'none') {
      void awardProjectCompletionXp(activeProject, medal, projectScore)
    }
    if (teamRoomId) {
      const roomIdAfterRun = teamRoomId
      void finishTeamInvestigation(victory).finally(() => {
        window.setTimeout(() => {
          setTeamRoomId(roomIdAfterRun)
          setTeamInviteInitialRoomId(roomIdAfterRun)
          setTeamInviteInitialView('room')
          setTeamInviteAutoFriendId(null)
          setScreen('map')
          setTeamInviteOpen(true)
        }, 2600)
      })
      setTeamInviteAutoFriendId(null)
      showActionSignal(victory ? '组队调查已完成，结算后返回组队大厅' : '组队调查未通过，结算后返回组队大厅')
      setScreen('result')
      return
    }
    setScreen('result')
  }

  function buyProduct(product: StoreProduct, currency: 'coins' | 'gems') {
    const cost = currency === 'coins' ? product.coinPrice : product.gemPrice
    if (!testToolsEnabled && wallet[currency] < cost) {
      showActionSignal('资源不足，已响应点击')
      return
    }
    updateWallet(current => !testToolsEnabled && current[currency] < cost ? current : ({
      ...current,
      [currency]: testToolsEnabled ? current[currency] : current[currency] - cost,
      inventory: { ...current.inventory, [product.id]: current.inventory[product.id] + 1 },
    }))
    const target = product.id === 'hpSupply' ? '补给站' : '战备仓库'
    showActionSignal(testToolsEnabled ? `${product.name}已加入${target}（测试账号不扣资源）` : `${product.name}已加入${target}`)
  }

  function buyHeroModel(modelId: PlayerModelId, currency: 'coins' | 'gems') {
    const loadout = heroUnlockById(modelId)
    const model = playerModelById(modelId)
    const cost = currency === 'coins' ? loadout.coinPrice : loadout.gemPrice
    if (wallet.inventory.playerModels.includes(modelId)) {
      equipPlayerModel(modelId)
      return
    }
    if (!canUnlockPlayerModel(wallet.inventory, modelId)) {
      showActionSignal('请先解锁上一位英雄')
      return
    }
    if (!testToolsEnabled && wallet[currency] < cost) {
      showActionSignal('资源不足，暂时无法解锁该英雄')
      return
    }
    updateWallet(current => {
      if (current.inventory.playerModels.includes(modelId) || !canUnlockPlayerModel(current.inventory, modelId) || (!testToolsEnabled && current[currency] < cost)) return current
      return {
        ...current,
        [currency]: testToolsEnabled ? current[currency] : current[currency] - cost,
        inventory: {
          ...current.inventory,
          playerModels: [...current.inventory.playerModels, modelId],
          playerModelId: modelId,
        },
      }
    })
    showActionSignal(`${model.name} 已解锁并设为实训英雄`)
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

  function openBountyTrial() {
    if (teamRoomId) {
      setNotice({
        tone: 'warning',
        title: '当前已有组队房间',
        message: '房间存在时不能单人进入无尽试炼，请先回到房间继续组队，或退出队伍后再单人挑战。',
      })
      return
    }
    if (!ensureCanEnterProject()) return
    setSupplyOpen(false)
    setShopOpen(false)
    setEquipmentOpen(false)
    setTrophyOpen(false)
    setLeaderboardOpen(false)
    setQuickPanel(null)
    setProjectDetailOpen(false)
    setTeamInviteOpen(false)
    setBountyRunKey(key => key + 1)
    setScreen('bounty')
    showActionSignal('无尽试炼已开启')
  }

  function openBountyTeamTrial() {
    if (!ensureCanEnterProject()) return
    const existingRoomForProject = teamRoomId && isBountyTeamProject(activeTeamProjectId) ? teamRoomId : null
    setSupplyOpen(false)
    setShopOpen(false)
    setEquipmentOpen(false)
    setTrophyOpen(false)
    setLeaderboardOpen(false)
    setQuickPanel(null)
    setProjectDetailOpen(false)
    setTeamInviteInitialRoomId(existingRoomForProject)
    setTeamInviteInitialView('room')
    setTeamInviteAutoFriendId(null)
    setActiveTeamProjectId(BOUNTY_TEAM_PROJECT_ID)
    setTeamInviteOpen(true)
    showActionSignal('组队无尽试炼房间已打开')
  }

  function settleBountyTrial(result: BountyTrialResult) {
    updateWallet(current => ({
      ...current,
      coins: current.coins + result.coins,
      gems: current.gems + result.gems,
    }))
    setNotice({
      tone: 'success',
      title: '悬赏试炼结算',
      message: `本次完成 ${result.taskCompletions} 个悬赏任务，击败 ${result.kills} 个异常体，其中精英 ${result.eliteKills} 个，获得 +${result.coins} 金币、+${result.gems} 钻石。`,
      actionLabel: '收下奖励',
    })
    if (teamRoomId && isBountyTeamProject(activeTeamProjectId)) {
      const roomIdAfterRun = teamRoomId
      void finishTeamInvestigation(result.kills > 0).finally(() => {
        setTeamRoomId(roomIdAfterRun)
        setTeamInviteInitialRoomId(roomIdAfterRun)
        setTeamInviteInitialView('room')
        setTeamInviteAutoFriendId(null)
        setTeamInviteOpen(true)
      })
      setScreen('map')
      showActionSignal(`组队无尽结算 +${result.coins} 金币 +${result.gems} 钻石`)
      return
    }
    setScreen('map')
    showActionSignal(`悬赏结算 +${result.coins} 金币 +${result.gems} 钻石`)
  }

  function chooseAuxiliaryCase() {
    setAuxiliaryCase(pickAuxiliaryCase(auxiliaryPool, auxiliaryCase?.productName))
    showActionSignal('辅助案例已刷新')
  }

  function selectPrimaryCarrier(carrierId: string) {
    localStorage.setItem(carrierStorageKey(carrierRoute.id), carrierId)
    setSelectedCarrierId(carrierId)
    setAuxiliaryCase(null)
    showActionSignal('主案例已切换')
  }

  function useItem(item: ItemId) {
    if ((!testToolsEnabled && wallet.inventory[item] < 1) || screen !== 'boss') {
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
    if (!consumeGameItem(item)) {
      showActionSignal('道具库存不足')
      return
    }
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

  function useHpSupply() {
    if (screen === 'story' || screen === 'boss' || screen === 'game3d' || screen === 'bounty') {
      showActionSignal('血量补给包只能在实战外使用')
      return
    }
    const effectiveHp = currentEffectiveHp()
    if (effectiveHp >= SIMULATION_MAX_HP) {
      showActionSignal('实训血量已满，无需使用血量补给包')
      return
    }
    if (!testToolsEnabled && wallet.inventory.hpSupply < 1) {
      showActionSignal('血量补给包库存不足')
      return
    }
    if (!testToolsEnabled) updateWallet(current => current.inventory.hpSupply < 1 ? current : ({
      ...current,
      inventory: { ...current.inventory, hpSupply: current.inventory.hpSupply - 1 },
    }))
    const nextHp = Math.min(SIMULATION_MAX_HP, effectiveHp + HP_SUPPLY_AMOUNT)
    syncSimulationHp(nextHp)
    setNotice({
      tone: 'success',
      title: '血量补给包已使用',
      message: `实训血量恢复到 ${nextHp}/${SIMULATION_MAX_HP}，现在可以继续进入章节挑战。`,
      actionLabel: '继续实训',
    })
    showActionSignal(`血量补给包已使用，HP +${nextHp - effectiveHp}`)
  }

  function consumeGameItem(item: ItemId) {
    if (testToolsEnabled) return true
    const current = walletRef.current
    if (current.inventory[item] < 1) return false
    const nextWallet = {
      ...current,
      inventory: {
        ...current.inventory,
        [item]: current.inventory[item] - 1,
      },
    }
    walletRef.current = nextWallet
    localStorage.setItem(scopedStorageKey(WALLET_KEY), JSON.stringify(nextWallet))
    setWallet(nextWallet)
    return true
  }

  function collectCombatDrop(drop: CombatLootDrop) {
    updateWallet(current => {
      const nextInventory = { ...current.inventory }
      let changed = false
      if (drop.items) {
        Object.entries(drop.items).forEach(([item, count]) => {
          const itemId = item as ItemId
          const amount = Math.max(0, Math.round(Number(count) || 0))
          if (!amount) return
          nextInventory[itemId] = nextInventory[itemId] + amount
          changed = true
        })
      }
      const coins = Math.max(0, Math.round(Number(drop.coins) || 0))
      const gems = Math.max(0, Math.round(Number(drop.gems) || 0))
      if (!changed && !coins && !gems) return current
      return {
        ...current,
        coins: current.coins + coins,
        gems: current.gems + gems,
        inventory: nextInventory,
      }
    })
  }

  function equipInventoryRole(roleId: string) {
    const loadout = roleLoadoutById(roleId)
    const role = roleById(roleId)
    if (!loadout || !role) return
    if (loadout.track !== educationTrack) {
      showActionSignal(`该人物属于${trackLabel(loadout.track)}线路，当前不可装备`)
      return
    }
    updateWallet(current => {
      if (!current.inventory.roles.includes(roleId) || current.inventory.equippedRoleId === roleId) return current
      return {
        ...current,
        inventory: {
          ...current.inventory,
          equippedRoleId: roleId,
        },
      }
    })
    showActionSignal(`${role.title} 已装备`)
  }

  function equipPlayerModel(modelId: PlayerModelId) {
    if (teamRoomId) {
      showActionSignal('组队中不能切换战斗角色，请先解散或退出队伍')
      return
    }
    if (!wallet.inventory.playerModels.includes(modelId)) {
      setEquipmentOpen(false)
      setShopItemsOnly(false)
      setShopOpen(true)
      showActionSignal('该英雄尚未解锁，请先前往商店解锁')
      return
    }
    const model = playerModelById(modelId)
    updateWallet(current => current.inventory.playerModelId === modelId ? current : ({
      ...current,
      inventory: {
        ...current.inventory,
        playerModelId: modelId,
      },
    }))
    showActionSignal(`${model.name} 已设为实训角色`)
  }

  function addSimulationFriend(friendId: string) {
    const friend = SIMULATION_FRIENDS.find(item => item.id === friendId)
    if (!friend) return
    setFriendIds(current => current.includes(friendId) ? current : [...current, friendId])
    showActionSignal(`${friend.name} 已添加为好友`)
  }

  function inviteSimulationFriend(friendId: string) {
    if (!simulationSettings.allowInvites) {
      showActionSignal('已关闭好友邀请')
      return
    }
    const friend = SIMULATION_FRIENDS.find(item => item.id === friendId)
    if (!friend) return
    if (!friendIds.includes(friendId)) addSimulationFriend(friendId)
    setPartyFriend(friend)
    showActionSignal(`${friend.name} 已加入本次实训小队`)
  }

  function leaveSimulationParty() {
    if (partyFriend) showActionSignal(`${partyFriend.name} 已离开实训小队`)
    setPartyFriend(null)
  }

  function giftInventoryWeapon(weaponId: string, friendId: string) {
    if (!simulationSettings.allowGifts) {
      showActionSignal('已关闭装备赠送')
      return
    }
    const weapon = equipmentWeaponById(weaponId)
    const friend = SIMULATION_FRIENDS.find(item => item.id === friendId)
    if (!weapon || !friend) return
    if (!wallet.inventory.weapons.includes(weaponId)) {
      showActionSignal('背包中没有这把武器')
      return
    }
    updateWallet(current => {
      if (!current.inventory.weapons.includes(weaponId)) return current
      const weapons = current.inventory.weapons.filter(item => item !== weaponId)
      return {
        ...current,
        inventory: {
          ...current.inventory,
          weapons,
          equippedWeaponId: current.inventory.equippedWeaponId === weaponId ? null : current.inventory.equippedWeaponId,
        },
      }
    })
    showActionSignal(`${weapon.name} 已赠送给 ${friend.name}`)
  }

  function equipInventoryWeapon(weaponId: string | null) {
    const weapon = equipmentWeaponById(weaponId)
    updateWallet(current => {
      if (weaponId && !current.inventory.weapons.includes(weaponId)) return current
      if (current.inventory.equippedWeaponId === weaponId) return current
      return {
        ...current,
        inventory: {
          ...current.inventory,
          equippedWeaponId: weaponId,
        },
      }
    })
    showActionSignal(weapon ? `${weapon.name}已装备` : '已切换为徒手进入')
  }

  function unlockInventoryWeapon(weaponId: string) {
    const weapon = equipmentWeaponById(weaponId)
    if (!weapon) return
    updateWallet(current => {
      const weaponIds = current.inventory.weapons.filter(isKnownWeaponId)
      const weapons = weaponIds.includes(weaponId) ? weaponIds : [...weaponIds, weaponId]
      const equippedWeaponId = current.inventory.equippedWeaponId ?? weaponId
      if (weaponIds.includes(weaponId) && current.inventory.equippedWeaponId === equippedWeaponId) return current
      return {
        ...current,
        inventory: {
          ...current.inventory,
          weapons,
          equippedWeaponId,
        },
      }
    })
    showActionSignal(`${weapon.name}已收入装备栏`)
  }

  const entryProject = entryConfirm ? projects.find(project => project.id === entryConfirm.projectId) ?? activeProjectNode : null

  if (!launched) {
    return (
      <>
        <LaunchPanel
          displayName={displayName}
          player={player}
          wallet={walletView}
          trophySummary={trophySummary}
          creditSummary={creditSummary}
          educationTrack={educationTrack}
          major={major}
          project={activeProjectNode}
          projects={projects}
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
        {topTeamInvitation && !activeTeamInvitation && (
          <TeamInvitationTopBanner
            invitation={topTeamInvitation}
            busy={teamInvitationBusy}
            onView={() => setActiveTeamInvitation(topTeamInvitation)}
            onLater={() => {
              deferredInvitationIdsRef.current.add(topTeamInvitation.id)
              setTeamInvitationFeed(current => ({
                ...current,
                incoming: current.incoming.filter(invitation => invitation.id !== topTeamInvitation.id),
              }))
            }}
          />
        )}
        {showMapHome && (
          <div
            className={`${styles.mapArtboard} ${mapThemeClassForProject(activeProject.id)} ${mapPanning ? styles.mapArtboardPanning : ''}`}
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
            <ProjectMap projects={projects} selectedProjectId={selectedProjectId} onSelectProject={selectMapProject} interactive={screen === 'map' || screen === 'briefing'} />
          </div>
        )}
        {showHubChrome && (
          <>
            <GameRail
              screen={screen}
              onMap={() => navigateHub('map', '已切换地图主页')}
              onLevels={() => navigateHub('levels', '已切换关卡总览')}
              onTask={() => navigateHub('briefing', '任务简报已打开')}
              onLeaderboard={openLeaderboard}
              onEquipment={openEquipmentPanel}
              onSkills={() => openQuickPanel('skills')}
              onTools={() => openQuickPanel('tools')}
              onMentor={() => openQuickPanel('mentor')}
              onReport={openLearningReport}
            />
            <FloatingHeader
              title={screen === 'levels' ? '远征关卡档案' : '质量守护远征'}
              onExit={requestLeaveSimulation}
            />
            <ResourceDock wallet={walletView} trophySummary={trophySummary} creditSummary={creditSummary} onSupply={openSupplyPanel} onMissionReward={openBountyTrial} onMissionTeam={openBountyTeamTrial} onShop={openShopPanel} onTrophies={openTrophyPanel} />
            <TopActionDock
              onFriends={() => openQuickPanel('friends')}
              onTeamLobby={() => {
                setQuickPanel(null)
                setTeamInviteAutoFriendId(null)
                setTeamInviteInitialRoomId(teamRoomId)
                setTeamInviteInitialView('hall')
                setTeamInviteOpen(true)
                showActionSignal('房间大厅已打开')
              }}
              onMessages={() => openQuickPanel('messages')}
              onSettings={() => openQuickPanel('settings')}
              pendingMessages={pendingMessageCount}
            />
            <div className={styles.progressBadge}>
              <Target size={17} />
              <span>远征进度</span>
              <strong>{trophySummary.total} / {PROJECT_MISSIONS.length} 已完成</strong>
            </div>
          </>
        )}

        {screen === 'levels' && (
          <LevelHub
            projects={projects}
            testSkipRemaining={testToolsEnabled ? testSkipRemaining : undefined}
            onEnterProject={projectId => requestEnterProject(projectId, 'levels')}
            onSkipProject={skipProjectForTestAccount}
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
                  hp={simulationHp}
                  educationTrack={educationTrack}
                  project={activeProject}
                  projectNode={activeProjectNode}
                  carrier={selectedCarrier}
                  smartMission={visibleSmartMission}
                  activeTeamProject={activeTeamProject}
                  activeTeamRoomId={teamRoomId}
                  teamAllies={teamAllies}
                  testSkipRemaining={testToolsEnabled ? testSkipRemaining : undefined}
                  onEnterProject={() => requestEnterProject(selectedProjectId, 'map')}
                  onSkipProject={() => skipProjectForTestAccount(selectedProjectId)}
                  onTeamInvite={() => openTeamInviteForProject(selectedProjectId)}
                  onProjectDetail={() => setProjectDetailOpen(true)}
                  onSmartMissionEnter={() => requestEnterProject(visibleSmartMission?.simulation.projectId ?? currentUnlockedProject.id, 'map')}
                />
              )}
              {screen === 'briefing' && (
                <BriefingPanel
                  project={activeProject}
                  projectNode={activeProjectNode}
                  projects={projects}
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
                  onTeamInvite={() => openTeamInviteForProject(selectedProjectId)}
                  onBegin={startStory}
                />
              )}
            </aside>
          </>
        )}

        {screen === 'game3d' && selectedRole && (
          <ThreeProjectGame
            key={`${activeProject.id}-${gameRunKey}`}
            project={activeProject}
            role={selectedRole}
            carrier={selectedCarrier}
            storyQuestions={storyQuestions}
            bossQuestions={bossQuestions}
            remainingTime={remainingTime}
            timedOut={timedOut}
            projectCleared={activeProjectNode.status === 'cleared'}
            playerModelId={wallet.inventory.playerModelId}
            unlockedPlayerModelIds={wallet.inventory.playerModels}
            playerCombatStats={selectedHeroStats}
            playerCurrentHp={selectedHeroBattleHp}
            playerHpCap={selectedHeroMaxHp}
            displayName={displayName}
            teamRoomId={teamRoomId}
            allyNames={battleAllyNames}
            soundEnabled={simulationSettings.soundEnabled}
            sfxVolume={simulationSettings.sfxVolume}
            musicVolume={simulationSettings.musicVolume}
            mapBackgroundUrl={projectMapBackground(activeProject.id)}
            itemCounts={{
              skip: walletView.inventory.skip,
              boost: walletView.inventory.boost,
              heal: walletView.inventory.heal,
            }}
            coins={walletView.coins}
            gems={walletView.gems}
            testMode={testToolsEnabled}
            onUseItem={consumeGameItem}
            onCollectDrop={collectCombatDrop}
            onOpenShop={openShopPanel}
            teamRoomOwner={activeTeamRoomOwner}
            onEndTeamBattle={endTeamBattleFromGame}
            onTeamRoomStopped={handleTeamRoomStopped}
            onPauseChange={setGame3dPaused}
            onHpChange={syncHeroBattleHp}
            onBack={leaveSimulation}
            onComplete={complete3dGame}
          />
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
            wallet={walletView}
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

        {screen === 'bounty' && selectedRole && (
          <BountyTrialArena
            key={bountyRunKey}
            wallet={walletView}
            displayName={displayName}
            playerModelId={wallet.inventory.playerModelId}
            role={selectedRole}
            carrier={selectedCarrier}
            educationTrack={educationTrack}
            playerCombatStats={selectedHeroStats}
            playerCurrentHp={selectedHeroBattleHp}
            playerHpCap={selectedHeroMaxHp}
            soundEnabled={simulationSettings.soundEnabled}
            sfxVolume={simulationSettings.sfxVolume}
            musicVolume={simulationSettings.musicVolume}
            teamRoomId={isBountyTeamProject(activeTeamProjectId) ? teamRoomId : null}
            teamRoomOwner={isBountyTeamProject(activeTeamProjectId) && activeTeamRoomOwner}
            teamAllies={isBountyTeamProject(activeTeamProjectId) ? battleAllyNames : []}
            onHpChange={syncHeroBattleHp}
            onUseItem={consumeGameItem}
            onCollectDrop={collectCombatDrop}
            onEndTeamBattle={endTeamBattleFromGame}
            onTeamRoomStopped={handleTeamRoomStopped}
            onBack={() => navigateHub('map', '已返回远征地图')}
            onComplete={settleBountyTrial}
          />
        )}

        {supplyOpen && (
          <SupplyModal
            wallet={walletView}
            currentHp={simulationHp}
            onClaimDaily={claimDailySupply}
            onUseHpSupply={useHpSupply}
            onClose={() => setSupplyOpen(false)}
          />
        )}
        {shopOpen && (
          <ShopModal
            wallet={walletView}
            itemsOnly={shopItemsOnly}
            onClose={() => {
              setShopOpen(false)
              setShopItemsOnly(false)
            }}
            onBuy={buyProduct}
            onBuyHero={buyHeroModel}
            onClaimMission={openBountyTrial}
            onFindSupply={() => {
              setShopOpen(false)
              setShopItemsOnly(false)
              openSupplyPanel()
            }}
          />
        )}
        {equipmentOpen && (
          <EquipmentModal
            wallet={walletView}
            role={selectedRole}
            educationTrack={educationTrack}
            onClose={() => setEquipmentOpen(false)}
            onSelectModel={equipPlayerModel}
            onShop={() => {
              setEquipmentOpen(false)
              openShopPanel()
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
          <QuickPanelModalV2
            panel={quickPanel}
            player={player}
            wallet={walletView}
            project={activeProject}
            progress={projectProgress}
            trophySummary={trophySummary}
            creditSummary={creditSummary}
            educationTrack={educationTrack}
            friends={SIMULATION_FRIENDS.filter(friend => friendIds.includes(friend.id))}
            projects={projects}
            partyFriend={partyFriend}
            settings={simulationSettings}
            invitationFeed={teamInvitationFeed}
            initialPeerId={quickPanelPeerId}
            onAddFriend={addSimulationFriend}
            onInviteFriend={inviteSimulationFriend}
            onLeaveParty={leaveSimulationParty}
            onGiftWeapon={giftInventoryWeapon}
            onSettingsChange={updateSimulationSettings}
            onInvitationAction={respondTeamInvitation}
            onOpenTeamInviteProject={openTeamInviteForProject}
            onOpenTeamRoom={(roomId, projectId) => {
              if (!isBountyTeamProject(projectId)) setSelectedProjectId(projectId)
              setActiveTeamProjectId(projectId)
              setTeamRoomId(roomId)
              setTeamInviteInitialRoomId(roomId)
              setTeamInviteInitialView('room')
              setActiveTeamRoomOwner(false)
              setQuickPanel(null)
              setTeamInviteOpen(true)
            }}
            onOpenFriendChat={(peerId, readCount = 1) => {
              setQuickPanelPeerId(peerId)
              setPrivateMessageNoticeCount(current => Math.max(0, current - readCount))
              setQuickPanel('friends')
            }}
            onOpenSystemMessage={target => {
              setQuickPanel(null)
              if (target === 'mission') {
                requestEnterProject(selectedProjectId, screen === 'levels' ? 'levels' : 'map')
              } else if (target === 'supply') {
                openSupplyPanel()
              } else {
                openLearningReport()
              }
            }}
            currentDisplayName={displayName}
            currentAvatarUrl={avatarUrl}
            onClose={() => setQuickPanel(null)}
          />
        )}
        {teamInviteOpen && (
          <TeamInviteModal
            project={teamInviteProjectNode}
            projects={teamProjectChoices}
            settings={simulationSettings}
            initialRoomId={teamInviteInitialRoomId}
            initialView={teamInviteInitialView}
            autoInviteFriendId={teamInviteAutoFriendId}
            currentHp={simulationHp}
            minEntryHp={MIN_PROJECT_ENTRY_HP}
            onStart={startTeamInvestigation}
            onNotice={setNotice}
            onRoomExit={() => {
              setTeamInviteOpen(false)
              setTeamInviteAutoFriendId(null)
              setTeamInviteInitialRoomId(null)
              setTeamInviteInitialView('room')
              setTeamRoomId(null)
              setActiveTeamProjectId(null)
              setActiveTeamRoomOwner(false)
              setTeamAllies([])
            }}
            onRoomActive={syncActiveTeamRoom}
            onProjectChange={projectId => {
              if (!isBountyTeamProject(projectId)) setSelectedProjectId(projectId)
              setTeamRoomId(null)
              setTeamInviteInitialRoomId(null)
              setTeamInviteInitialView('room')
              setActiveTeamProjectId(projectId)
              setActiveTeamRoomOwner(false)
              setTeamInviteAutoFriendId(null)
            }}
            onClose={() => {
              const activeRoomId = teamRoomId
              setTeamInviteOpen(false)
              setTeamInviteAutoFriendId(null)
              setTeamInviteInitialRoomId(activeRoomId)
              setTeamInviteInitialView('room')
              if (!activeRoomId) {
                setActiveTeamProjectId(null)
                setActiveTeamRoomOwner(false)
                setTeamAllies([])
              }
            }}
          />
        )}
        {projectDetailOpen && (
          <ProjectDetailModal
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
            teamInviteLabel={teamRoomId && activeTeamProjectId === selectedProjectId ? '进入房间' : '邀请组队'}
            onSelectCarrier={selectPrimaryCarrier}
            onDrawAuxiliary={chooseAuxiliaryCase}
            onEnterProject={() => requestEnterProject(selectedProjectId, 'map')}
            onTeamInvite={() => openTeamInviteForProject(selectedProjectId)}
            onClose={() => setProjectDetailOpen(false)}
          />
        )}
        {activeTeamInvitation && (
          <TeamInvitationModal
            invitation={activeTeamInvitation}
            busy={teamInvitationBusy}
            error={teamInvitationError}
            onAction={action => void respondTeamInvitation(activeTeamInvitation, action)}
          />
        )}
        {learningReportOpen && (
          <LearningReportModal
            projects={projects}
            progress={projectProgress}
            player={player}
            wallet={walletView}
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
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => {
            onClose()
            notice.onAction?.()
          }}
        >
          {notice.actionLabel ?? '知道了'}
        </button>
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
  const supplyCount = wallet.inventory.skip + wallet.inventory.boost + wallet.inventory.heal + wallet.inventory.hpSupply
  const config = {
    mentor: {
      icon: Bot,
      eyebrow: 'AI MENTOR',
      title: 'AI导师',
      intro: `建议先围绕「${project.title}」整理证据链，再进入 Boss 核验。遇到不确定项时，优先排查 GMP 条款、记录完整性和人员职责。`,
      rows: [
        ['当前等级', `Lv.${player.rankLevel} ${player.rankTitle}`],
        ['本关建议', '先看任务简报，再进入完整关卡调查'],
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
      intro: '技能树按法规理解、现场调查、偏差分析、CAPA 输出四条能力线组织；通关奖章越多，能力节点越完整。',
      rows: [
        ['法规理解', trophySummary.total >= 1 ? '入门节点已点亮' : '完成第一章后点亮'],
        ['现场调查', trophySummary.total >= 3 ? '追踪与取证已强化' : '继续通关解锁'],
        ['CAPA 输出', trophySummary.total >= 6 ? '闭环能力已强化' : `${trophySummary.total}/6 奖章进度`],
      ],
    },
    tools: {
      icon: Wrench,
      eyebrow: 'TOOLS',
      title: '工具',
      intro: '工具面板汇总实训中的补给道具和快捷支持；战斗道具仍在 Boss 或装备栏中查看，购买入口保留在资源栏。',
      rows: [
        ['跳题卡', `${wallet.inventory.skip} 张`],
        ['增幅器', `${wallet.inventory.boost} 个`],
        ['血量补给包', `${wallet.inventory.hpSupply} 个`],
        ['应急补给包', `${wallet.inventory.heal} 个`],
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

function QuickPanelModalV2({
  panel,
  player,
  wallet,
  project,
  progress,
  trophySummary,
  creditSummary,
  educationTrack,
  friends,
  projects,
  partyFriend,
  settings,
  invitationFeed,
  initialPeerId,
  currentDisplayName,
  currentAvatarUrl,
  onAddFriend,
  onInviteFriend,
  onLeaveParty,
  onGiftWeapon,
  onSettingsChange,
  onInvitationAction,
  onOpenTeamInviteProject,
  onOpenTeamRoom,
  onOpenFriendChat,
  onOpenSystemMessage,
  onClose,
}: {
  panel: QuickPanel
  player: PlayerState
  wallet: Wallet
  project: ProjectDefinition
  progress: ProjectProgress
  trophySummary: TrophySummary
  creditSummary: ReturnType<typeof summarizeCredit>
  educationTrack: EducationTrack
  friends: SimulationFriend[]
  projects: ProjectNode[]
  partyFriend: SimulationFriend | null
  settings: SimulationSettings
  invitationFeed: TeamInvitationFeed
  initialPeerId: string | null
  currentDisplayName: string
  currentAvatarUrl: string | null
  onAddFriend: (friendId: string) => void
  onInviteFriend: (friendId: string) => void
  onLeaveParty: () => void
  onGiftWeapon: (weaponId: string, friendId: string) => void
  onSettingsChange: (update: Partial<SimulationSettings>) => void
  onInvitationAction: (
    invitation: TeamInvitation,
    action: 'accept' | 'reject' | 'ignore' | 'later' | 'approve' | 'deny',
  ) => Promise<boolean | void>
  onOpenTeamInviteProject: (projectId: number, autoFriendId?: string | null) => void
  onOpenTeamRoom: (roomId: string, projectId: number) => void
  onOpenFriendChat: (peerId: string, readCount?: number) => void
  onOpenSystemMessage: (target: SystemMessageTarget) => void
  onClose: () => void
}) {
  const supplyCount = wallet.inventory.skip + wallet.inventory.boost + wallet.inventory.heal + wallet.inventory.hpSupply
  const ownedWeapons = wallet.inventory.weapons.map(equipmentWeaponById).filter((weapon): weapon is EquipmentWeapon => Boolean(weapon))
  const selectedFriendSeed = friends[0] ?? SIMULATION_FRIENDS[0]
  const [mentorInput, setMentorInput] = useState('')
  const [mentorMessages, setMentorMessages] = useState<MentorChatMessage[]>([])
  const [mentorThinking, setMentorThinking] = useState(false)
  const [selectedFriendId, setSelectedFriendId] = useState(selectedFriendSeed.id)
  const [chatInput, setChatInput] = useState('')
  const [chatLog, setChatLog] = useState<Array<{ from: 'me' | 'friend' | 'system'; text: string }>>([
    { from: 'friend', text: '我可以支援这次实训，先把任务简报和武器配好。' },
  ])
  const [giftWeaponId, setGiftWeaponId] = useState(ownedWeapons[0]?.id ?? '')
  const [activeFishboneGroup, setActiveFishboneGroup] = useState('人')
  const [fishboneDraft, setFishboneDraft] = useState('')
  const [fishboneEntries, setFishboneEntries] = useState<Record<string, string[]>>({
    人: ['复核职责不清', '培训记录缺失'],
    机: ['设备状态异常', '校准周期超期'],
    料: ['物料批次差异', '取样代表性不足'],
    法: ['SOP 未覆盖异常', '复测替代调查'],
    环: ['温湿度波动', '交叉污染风险'],
  })
  const [toolNotice, setToolNotice] = useState('')
  const [activeSkillTool, setActiveSkillTool] = useState('risk-matrix')
  const [teamFriends, setTeamFriends] = useState<TeamFriend[]>([])
  const [friendSuggestions, setFriendSuggestions] = useState<TeamFriend[]>([])
  const [incomingFriendRequests, setIncomingFriendRequests] = useState<TeamFriendRequest[]>([])
  const [outgoingFriendRequests, setOutgoingFriendRequests] = useState<TeamFriendRequest[]>([])
  const [friendSearch, setFriendSearch] = useState('')
  const [addingFriend, setAddingFriend] = useState(false)
  const [selectedInvitation, setSelectedInvitation] = useState<TeamInvitation | null>(null)
  const [selectedPeerId, setSelectedPeerId] = useState('')
  const [privateMessages, setPrivateMessages] = useState<TeamPrivateMessage[]>([])
  const [privateMessageNotices, setPrivateMessageNotices] = useState<TeamPrivateMessageNotice[]>([])
  const [privateInput, setPrivateInput] = useState('')
  const [friendInviteProjectId, setFriendInviteProjectId] = useState(project.id)
  const [friendProjectPickerOpen, setFriendProjectPickerOpen] = useState(false)
  const [requestedJoinRoomIds, setRequestedJoinRoomIds] = useState<Set<string>>(() => new Set())
  const [teamRoom, setTeamRoom] = useState<TeamRoomSnapshot | null>(null)
  const [teamInput, setTeamInput] = useState('')
  const [roleQuestion, setRoleQuestion] = useState('')
  const [activeRoleId, setActiveRoleId] = useState('')
  const [teamLoading, setTeamLoading] = useState(false)
  const [teamNotice, setTeamNotice] = useState('')
  const selectedFriend = SIMULATION_FRIENDS.find(friend => friend.id === selectedFriendId) ?? selectedFriendSeed
  const selectedFriendAdded = friends.some(friend => friend.id === selectedFriend.id)
  const selectedTeamFriend = teamFriends.find(friend => friend.userId === selectedPeerId) ?? teamFriends[0] ?? null
  const selectedFriendRoom = selectedTeamFriend?.activeRoom ?? null
  const selectedFriendBusyReason = selectedFriendRoom && !selectedFriendRoom.mineInRoom
    ? '组队中'
    : selectedTeamFriend?.activity?.status === 'solo'
      ? '单人实训中'
      : selectedTeamFriend?.busy
        ? '忙碌中'
        : ''
  const selectedFriendBusy = Boolean(selectedFriendBusyReason)
  const groupedPrivateMessageNotices = useMemo(() => {
    const groups = new Map<string, {
      senderId: string
      senderName: string
      latest: TeamPrivateMessageNotice
      count: number
      ids: number[]
    }>()
    for (const notice of privateMessageNotices) {
      const current = groups.get(notice.senderId)
      if (!current) {
        groups.set(notice.senderId, {
          senderId: notice.senderId,
          senderName: notice.senderName,
          latest: notice,
          count: 1,
          ids: [notice.id],
        })
        continue
      }
      current.count += 1
      current.ids.push(notice.id)
      if (new Date(notice.createdAt).getTime() >= new Date(current.latest.createdAt).getTime()) {
        current.latest = notice
        current.senderName = notice.senderName
      }
    }
    return Array.from(groups.values()).sort((a, b) => (
      new Date(b.latest.createdAt).getTime() - new Date(a.latest.createdAt).getTime()
    ))
  }, [privateMessageNotices])
  const selectedFriendRoomPending = Boolean(
    selectedFriendRoom && (
      invitationFeed.sent.some(invitation => invitation.roomId === selectedFriendRoom.roomId)
      || requestedJoinRoomIds.has(selectedFriendRoom.roomId)
    ),
  )
  const currentTeamMember = teamRoom?.members.find(member => member.mine) ?? null
  const occupiedRoleIds = new Set(teamRoom?.members.map(member => member.roleId).filter((roleId): roleId is string => Boolean(roleId)) ?? [])
  const activeTeamRole = teamRoom?.roleCards.find(role => role.roleId === activeRoleId) ?? teamRoom?.roleCards[0] ?? null
  const availableGiftWeaponId = giftWeaponId || ownedWeapons[0]?.id || ''
  const completedCount = Object.keys(progress).length
  const unlockedProjectCount = Math.min(PROJECT_MISSIONS.length, trophySummary.total + 1)
  const mentorHistoryKey = mentorStorageKey(project.id)
  const header = {
    mentor: { icon: Bot, eyebrow: 'AI MENTOR', title: 'AI导师' },
    friends: { icon: UsersRound, eyebrow: 'FRIENDS', title: '好友' },
    skills: { icon: BrainCircuit, eyebrow: 'SKILL TREE', title: '技能树' },
    tools: { icon: Wrench, eyebrow: 'TOOLS', title: '工具' },
    messages: { icon: Bell, eyebrow: 'MESSAGES', title: '消息' },
    settings: { icon: Settings, eyebrow: 'SETTINGS', title: '设置' },
  }[panel]
  const Icon = header.icon

  useEffect(() => {
    const defaultMessage: MentorChatMessage = {
      id: `mentor-${project.id}-welcome`,
      role: 'mentor',
      text: `当前关联项目是《${project.title}》。先确认风险信号“${project.riskSignal}”，再检查证据链和 Boss 核验点。`,
    }
    const saved = localStorage.getItem(mentorHistoryKey)
    if (!saved) {
      setMentorMessages([defaultMessage])
      return
    }

    try {
      const parsed = JSON.parse(saved) as MentorChatMessage[]
      const validMessages = parsed.filter(message => (
        message
        && typeof message.id === 'string'
        && (message.role === 'student' || message.role === 'mentor')
        && typeof message.text === 'string'
      ))
      setMentorMessages(validMessages.length ? validMessages : [defaultMessage])
    } catch {
      localStorage.removeItem(mentorHistoryKey)
      setMentorMessages([defaultMessage])
    }
  }, [mentorHistoryKey, project.id, project.riskSignal, project.title])

  useEffect(() => {
    if (!mentorMessages.length) return
    localStorage.setItem(mentorHistoryKey, JSON.stringify(mentorMessages.slice(-30)))
  }, [mentorHistoryKey, mentorMessages])

  useEffect(() => {
    if (panel !== 'friends') return
    void refreshTeamFriends()
  }, [panel, project.id])

  useEffect(() => {
    if (panel !== 'friends' || !initialPeerId) return
    setSelectedPeerId(initialPeerId)
  }, [initialPeerId, panel])

  useEffect(() => {
    setFriendInviteProjectId(project.id)
  }, [project.id])

  useEffect(() => {
    setFriendProjectPickerOpen(false)
  }, [selectedPeerId])

  useEffect(() => {
    if (!teamFriends.length || selectedPeerId) return
    setSelectedPeerId(teamFriends[0].userId)
  }, [selectedPeerId, teamFriends])

  useEffect(() => {
    if (panel !== 'friends' || !selectedPeerId) return
    void refreshPrivateMessages(selectedPeerId)
  }, [panel, selectedPeerId])

  useEffect(() => {
    if (panel !== 'messages') return
    void refreshPrivateMessageNotices(false)
  }, [panel])

  useEffect(() => {
    if (!teamRoom?.roleCards.length) return
    const roleExists = teamRoom.roleCards.some(role => role.roleId === activeRoleId)
    if (!activeRoleId || !roleExists) {
      setActiveRoleId(teamRoom.roleCards[0].roleId)
    }
  }, [activeRoleId, teamRoom?.room?.roomId, teamRoom?.roleCards])

  useEffect(() => {
    if (panel !== 'friends') return
    const refreshId = window.setInterval(() => {
      void refreshTeamFriends(friendSearch)
      if (selectedPeerId) void refreshPrivateMessages(selectedPeerId, false)
    }, 5000)
    return () => window.clearInterval(refreshId)
  }, [friendSearch, panel, project.id, selectedPeerId])

  useEffect(() => {
    if (panel !== 'friends' && panel !== 'messages') return undefined
    const refreshNow = () => {
      if (document.visibilityState === 'hidden') return
      if (panel === 'friends') void refreshTeamFriends(friendSearch)
      if (panel === 'messages') void refreshPrivateMessageNotices(false)
    }
    window.addEventListener('focus', refreshNow)
    document.addEventListener('visibilitychange', refreshNow)
    return () => {
      window.removeEventListener('focus', refreshNow)
      document.removeEventListener('visibilitychange', refreshNow)
    }
  }, [friendSearch, panel])

  function teamErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : '团队协作服务暂时不可用'
  }

  async function teamFetch<T>(url: string, init?: RequestInit): Promise<T> {
    const token = readTeamAuthToken()
    if (!token) throw new Error('请先登录后使用真实好友与团队协作')

    const headers = new Headers(init?.headers)
    headers.set('Content-Type', 'application/json')
    headers.set('Authorization', `Bearer ${token}`)
    const response = await fetch(url, { cache: 'no-store', ...init, headers })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = typeof data === 'object' && data && 'error' in data ? String((data as { error?: string }).error) : '请求失败'
      throw new Error(message)
    }
    return data as T
  }

  async function refreshTeamFriends(search = friendSearch) {
    try {
      const data = await teamFetch<{
        friends: TeamFriend[]
        incomingRequests: TeamFriendRequest[]
        outgoingRequests: TeamFriendRequest[]
        suggestions: TeamFriend[]
      }>(`/api/team/friends?search=${encodeURIComponent(search.trim())}`)
      setTeamFriends(data.friends)
      setIncomingFriendRequests(data.incomingRequests)
      setOutgoingFriendRequests(data.outgoingRequests)
      setFriendSuggestions(data.suggestions)
      if (!selectedPeerId && data.friends[0]) setSelectedPeerId(data.friends[0].userId)
    } catch (error) {
      setTeamNotice(teamErrorMessage(error))
    }
  }

  async function refreshPrivateMessages(peerId = selectedPeerId, showError = true) {
    if (!peerId) {
      setPrivateMessages([])
      return
    }
    try {
      const data = await teamFetch<{ messages: TeamPrivateMessage[] }>(`/api/team/messages?peerId=${encodeURIComponent(peerId)}`)
      setPrivateMessages(data.messages)
    } catch (error) {
      if (showError) setTeamNotice(teamErrorMessage(error))
    }
  }

  async function refreshPrivateMessageNotices(showError = true) {
    try {
      const data = await teamFetch<{ notices?: TeamPrivateMessageNotice[] }>('/api/team/messages')
      setPrivateMessageNotices(data.notices ?? [])
    } catch (error) {
      if (showError) setTeamNotice(teamErrorMessage(error))
    }
  }

  async function refreshTeamRoom(showError = true) {
    try {
      const data = await teamFetch<TeamRoomSnapshot>(`/api/team/rooms?projectId=${project.id}`)
      setTeamRoom(data)
      if (data.roleCards[0] && !activeRoleId) setActiveRoleId(data.roleCards[0].roleId)
    } catch (error) {
      if (showError) setTeamNotice(teamErrorMessage(error))
    }
  }

  async function addRealFriend(userId: string) {
    setTeamLoading(true)
    setTeamNotice('')
    try {
      await teamFetch('/api/team/friends', {
        method: 'POST',
        body: JSON.stringify({ action: 'request', targetUserId: userId }),
      })
      await refreshTeamFriends()
      setTeamNotice('好友申请已发送，等待对方同意后才能私聊和组队')
    } catch (error) {
      setTeamNotice(teamErrorMessage(error))
    } finally {
      setTeamLoading(false)
    }
  }

  async function respondFriendRequest(userId: string, action: 'accept' | 'reject') {
    setTeamLoading(true)
    setTeamNotice('')
    try {
      await teamFetch('/api/team/friends', {
        method: 'POST',
        body: JSON.stringify({ action, targetUserId: userId }),
      })
      await refreshTeamFriends()
      if (action === 'accept') setSelectedPeerId(userId)
      setTeamNotice(action === 'accept' ? '已同意好友申请，现在可以私聊' : '已拒绝该好友申请')
    } catch (error) {
      setTeamNotice(teamErrorMessage(error))
    } finally {
      setTeamLoading(false)
    }
  }

  async function sendPrivateTeamMessage() {
    const content = privateInput.trim()
    if (!content || !selectedTeamFriend) return
    setTeamLoading(true)
    try {
      const data = await teamFetch<{ message: TeamPrivateMessage }>('/api/team/messages', {
        method: 'POST',
        body: JSON.stringify({ peerId: selectedTeamFriend.userId, content }),
      })
      setPrivateMessages(current => [...current, data.message])
      setPrivateInput('')
    } catch (error) {
      setTeamNotice(teamErrorMessage(error))
    } finally {
      setTeamLoading(false)
    }
  }

  async function requestJoinSelectedFriendRoom() {
    if (!selectedTeamFriend?.activeRoom) return
    const room = selectedTeamFriend.activeRoom
    if (room.mineInRoom) {
      onOpenTeamRoom(room.roomId, room.projectId)
      return
    }
    setTeamLoading(true)
    setTeamNotice('')
    try {
      const data = await teamFetch<TeamRoomSnapshot | { ok?: boolean; status?: string; error?: string }>('/api/team/rooms', {
        method: 'POST',
        body: JSON.stringify({
          action: 'requestJoinRoom',
          roomId: room.roomId,
          projectId: room.projectId,
          friendId: selectedTeamFriend.userId,
        }),
      })
      if ('room' in data && data.room) {
        onOpenTeamRoom(data.room.roomId, data.room.projectId)
        return
      }
      setRequestedJoinRoomIds(current => new Set(current).add(room.roomId))
      await refreshTeamFriends()
      setTeamNotice('入队申请已发送，等待房主同意后即可进入该房间')
    } catch (error) {
      setTeamNotice(teamErrorMessage(error))
    } finally {
      setTeamLoading(false)
    }
  }

  async function updateTeamRoom(action: string, extra: Record<string, unknown> = {}) {
    setTeamLoading(true)
    setTeamNotice('')
    try {
      const data = await teamFetch<TeamRoomSnapshot>('/api/team/rooms', {
        method: 'POST',
        body: JSON.stringify({ action, projectId: project.id, roomId: teamRoom?.room?.roomId, ...extra }),
      })
      setTeamRoom(data)
      if (data.roleCards[0] && !activeRoleId) setActiveRoleId(data.roleCards[0].roleId)
      return data
    } catch (error) {
      setTeamNotice(teamErrorMessage(error))
      return null
    } finally {
      setTeamLoading(false)
    }
  }

  async function createTeamRoom() {
    const data = await updateTeamRoom('create')
    if (data?.room) setTeamNotice('剧情协作房间已创建，好友可认领岗位角色')
  }

  async function inviteFriendToTeam(friendId: string) {
    if (!teamRoom?.room) {
      setTeamNotice('请先创建剧情协作房间')
      return
    }
    const friend = teamFriends.find(item => item.userId === friendId)
    const busyReason = friend?.activeRoom && !friend.activeRoom.mineInRoom
      ? '组队中'
      : friend?.activity?.status === 'solo'
        ? '单人实训中'
        : friend?.busy
          ? '忙碌中'
          : ''
    if (friend && busyReason) {
      setTeamNotice(`${friend.displayName} 正在${busyReason}，暂时不能邀请`)
      return
    }
    const data = await updateTeamRoom('invite', { friendId })
    if (data) setTeamNotice('好友已加入剧情协作房间')
  }

  async function claimTeamRole(roleId: string) {
    if (!teamRoom?.room) {
      setTeamNotice('请先创建剧情协作房间')
      return
    }
    const data = await updateTeamRoom('claim', { roleId })
    if (data) setTeamNotice('角色已认领，后续该岗位由你提供剧情信息')
  }

  async function sendTeamStoryMessage() {
    const content = teamInput.trim()
    if (!content || !teamRoom?.room) return
    const data = await updateTeamRoom('send', { content })
    if (data) setTeamInput('')
  }

  async function askTeamRole() {
    const content = roleQuestion.trim()
    if (!content || !activeTeamRole || !teamRoom?.room) return
    const owner = teamRoom.members.find(member => member.roleId === activeTeamRole.roleId)
    if (owner && !owner.mine) {
      setTeamNotice(`${owner.displayName} 已认领 ${activeTeamRole.name}，请在剧情消息里直接追问队友`)
      return
    }
    const data = await updateTeamRoom('askRole', { roleId: activeTeamRole.roleId, content })
    if (data) setRoleQuestion('')
  }

  async function askMentor(prompt: string) {
    const text = prompt.trim()
    if (!text || mentorThinking) return
    const token = localStorage.getItem('token')
    const time = Date.now()
    const studentMessage: MentorChatMessage = { id: `student-${time}`, role: 'student', text }
    const mentorId = `mentor-${time + 1}`
    setMentorMessages(current => [
      ...current,
      studentMessage,
      { id: mentorId, role: 'mentor', text: token ? 'AI 导师正在回答...' : '未登录，无法连接 AI 导师。请登录后再提问。' },
    ])
    setMentorInput('')
    if (!token) return

    setMentorThinking(true)
    try {
      const sceneBrief = project.scenes
        .slice(0, 6)
        .map(scene => `${scene.number}. ${scene.title}：缺陷=${scene.defect}；目标=${scene.objective}`)
        .join('\n')
      const evidenceBrief = project.keyEvidence.length
        ? project.keyEvidence.map((item, index) => `${index + 1}. ${item}`).join('\n')
        : '当前项目暂无额外证据，请优先围绕风险信号和场景缺陷分析。'
      const completedProjectCount = Object.keys(progress).length
      const history = mentorMessages.slice(-8).map(message => ({
        role: message.role === 'student' ? 'user' : 'assistant',
        content: message.text,
      }))
      const resp = await fetch('/api/agent/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          question: [
            '你是“GMP 质量守护远征”的实训 AI 导师，不是法规检索机器人。',
            '必须只围绕当前 2D 实训项目回答，优先给玩家下一步怎么打、怎么判题、用哪个工具；不要泛泛背诵药品 GMP 条款。',
            '如果问题信息不足，只说明缺少哪类证据，不要编造项目外情节。',
            '',
            `当前项目：${project.missionCode} ${project.title}`,
            `学习层次：${trackLabel(educationTrack)}`,
            `案例焦点：${project.caseFocus}`,
            `风险信号：${project.riskSignal}`,
            `已通关项目数：${completedProjectCount}`,
            '当前章节缺陷：',
            sceneBrief,
            '关键证据：',
            evidenceBrief,
            '',
            `学生问题：${text}`,
            '',
            '回答要求：',
            '1. 先用一句话判断学生现在卡在哪里。',
            '2. 给出 3 条以内可执行操作，必须关联当前项目缺陷、Boss 或工具。',
            '3. 如果涉及 CAPA/证据链，指出优先看哪条证据。',
            '4. 限制在 180 字以内；除非学生明确要求，不要输出法规原文、条款编号或长篇定义。',
          ].join('\n'),
          audience: 'student',
          edu_level: educationTrack,
          history,
        }),
      }).catch(() => null)

      if (!resp?.ok || !resp.body) {
        setMentorMessages(current => current.map(message => message.id === mentorId
          ? { ...message, text: 'AI 服务暂时不可用，请确认后端 gmp-api 已启动后重试。' }
          : message))
        return
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let reply = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()
          if (!payload) continue
          try {
            const event = JSON.parse(payload) as { chunk?: string; error?: string; done?: boolean }
            if (event.error) {
              reply = event.error
              setMentorMessages(current => current.map(message => message.id === mentorId ? { ...message, text: reply } : message))
            } else if (event.chunk) {
              reply += event.chunk
              setMentorMessages(current => current.map(message => message.id === mentorId ? { ...message, text: reply } : message))
            }
          } catch {
            // Ignore malformed SSE fragments from an interrupted stream.
          }
        }
      }

      if (!reply.trim()) {
        setMentorMessages(current => current.map(message => message.id === mentorId
          ? { ...message, text: 'AI 导师没有返回有效内容，请稍后再试。' }
          : message))
      }
    } catch {
      setMentorMessages(current => current.map(message => message.id === mentorId
        ? { ...message, text: 'AI 导师连接失败，请稍后重试。' }
        : message))
    } finally {
      setMentorThinking(false)
    }
  }

  function sendChat() {
    const text = chatInput.trim()
    if (!text) return
    setChatLog(current => [
      ...current,
      { from: 'me', text },
      { from: 'friend', text: `${selectedFriend.name}：收到，我会在实训里优先支援 ${selectedFriend.specialty}。` },
    ])
    setChatInput('')
  }

  function sendGift() {
    if (!settings.allowGifts) return
    if (!availableGiftWeaponId) return
    const weapon = equipmentWeaponById(availableGiftWeaponId)
    onGiftWeapon(availableGiftWeaponId, selectedFriend.id)
    setChatLog(current => [...current, { from: 'system', text: `已向 ${selectedFriend.name} 赠送 ${weapon?.name ?? '武器'}。` }])
    setGiftWeaponId('')
  }

  function addFishboneEntry() {
    const text = fishboneDraft.trim()
    if (!text) return
    setFishboneEntries(current => ({
      ...current,
      [activeFishboneGroup]: [...(current[activeFishboneGroup] ?? []), text],
    }))
    setFishboneDraft('')
    setToolNotice(`已添加到“${activeFishboneGroup}”分类`)
  }

  function undoFishboneEntry() {
    setFishboneEntries(current => ({
      ...current,
      [activeFishboneGroup]: (current[activeFishboneGroup] ?? []).slice(0, -1),
    }))
    setToolNotice('已撤销最近一项')
  }

  function clearFishboneEntries() {
    setFishboneEntries({ 人: [], 机: [], 料: [], 法: [], 环: [] })
    setToolNotice('鱼骨图已清空')
  }

  function saveFishboneAnalysis() {
    localStorage.setItem(fishboneStorageKey(project.id), JSON.stringify(fishboneEntries))
    setToolNotice('分析已保存到当前项目')
  }

  function submitFishboneAnalysis() {
    const total = Object.values(fishboneEntries).reduce((sum, items) => sum + items.length, 0)
    setToolNotice(total >= 5 ? `已提交 ${total} 条原因，AI 导师会据此辅助 CAPA 判断` : '至少补充 5 条原因后再提交')
  }

  const mentorPrompts = ['Boss 打不过怎么办', '这关适合什么武器', 'CAPA 题怎么判断']
  const skillTools = [
    { id: 'risk-matrix', label: '风险矩阵', icon: ShieldAlert, detail: '按严重性、发生概率和可检测性判断当前缺陷优先级。', action: '用于决定先打哪个缺陷怪。' },
    { id: 'fishbone', label: '鱼骨图', icon: FlaskConical, detail: '从人、机、料、法、环拆解根因，适合偏差调查。', action: '可在工具页继续填写原因。' },
    { id: 'what-if', label: 'What-if分析', icon: Sparkles, detail: '逐条提出“如果……会怎样”，用于发现遗漏风险。', action: '适合进入 Boss 前检查证据缺口。' },
    { id: 'decision', label: '决策树', icon: Target, detail: '把放行、隔离、返工、扩大调查拆成条件分支。', action: '适合回答放行判断题。' },
    { id: 'fmea', label: 'FMEA', icon: ClipboardCheck, detail: '识别失效模式、后果、原因和控制措施。', action: '适合工艺和设备类章节。' },
    { id: 'haccp', label: 'HACCP', icon: ShieldCheck, detail: '识别关键控制点，适合污染和交叉污染控制。', action: '适合无菌、清洁、环境类项目。' },
    { id: 'pha', label: 'PHA', icon: FileSearch, detail: '初步危害分析，用于快速建立风险清单。', action: '适合新场景首次排查。' },
    { id: 'fta', label: 'FTA', icon: Swords, detail: '故障树自上而下追溯导致终场失败的组合原因。', action: '适合最终挑战前复盘。' },
  ]
  const skillNodes = [
    { id: 'risk-matrix', name: '风险矩阵', level: 'L2', icon: ShieldAlert, x: 50, y: 10, unlockProject: 1, projectName: '项目01 风险评审' },
    { id: 'fishbone', name: '鱼骨图', level: 'L2', icon: FlaskConical, x: 31, y: 34, unlockProject: 1, projectName: '项目01 根因拆解' },
    { id: 'decision', name: '决策树', level: 'L2', icon: Target, x: 69, y: 34, unlockProject: 2, projectName: '项目02 放行判断' },
    { id: 'what-if', name: 'What-if分析', level: 'L1', icon: Sparkles, x: 27, y: 59, unlockProject: 3, projectName: '项目03 委托审计' },
    { id: 'fmea', name: 'FMEA', level: 'L2', icon: ClipboardCheck, x: 62, y: 59, unlockProject: 4, projectName: '项目04 冷链追溯' },
    { id: 'haccp', name: 'HACCP', level: 'L1', icon: ShieldCheck, x: 20, y: 84, unlockProject: 6, projectName: '项目06 数据追溯' },
    { id: 'pha', name: 'PHA', level: 'L1', icon: FileSearch, x: 50, y: 84, unlockProject: 8, projectName: '项目08 设施排查' },
    { id: 'fta', name: 'FTA', level: 'L1', icon: Swords, x: 80, y: 84, unlockProject: 10, projectName: '项目10 综合审计' },
  ]
  const skillConnectors = [
    { x1: 50, y1: 18, x2: 31, y2: 34 },
    { x1: 50, y1: 18, x2: 69, y2: 34 },
    { x1: 31, y1: 42, x2: 27, y2: 59 },
    { x1: 31, y1: 42, x2: 62, y2: 59 },
    { x1: 69, y1: 42, x2: 62, y2: 59 },
    { x1: 27, y1: 67, x2: 20, y2: 84 },
    { x1: 27, y1: 67, x2: 50, y2: 84 },
    { x1: 62, y1: 67, x2: 50, y2: 84 },
    { x1: 62, y1: 67, x2: 80, y2: 84 },
  ]
  const selectedSkillTool = skillTools.find(tool => tool.id === activeSkillTool) ?? skillTools[0]
  const selectedSkillNode = skillNodes.find(node => node.id === selectedSkillTool.id)
  const selectedSkillUnlocked = selectedSkillNode ? unlockedProjectCount >= selectedSkillNode.unlockProject : true
  const SelectedSkillIcon = selectedSkillTool.icon
  const toolProfiles = skillTools.map(tool => {
    const node = skillNodes.find(item => item.id === tool.id)
    const unlocked = !node || unlockedProjectCount >= node.unlockProject
    const base = {
      ...tool,
      unlockText: unlocked ? '已解锁' : `完成 ${node?.projectName ?? '前置项目'} 后解锁`,
      unlocked,
      node,
    }
    if (tool.id === 'risk-matrix') {
      return {
        ...base,
        pageTitle: '风险矩阵工作台',
        pageSubtitle: '把当前缺陷拆成严重性、发生概率、可检测性，决定先处理谁。',
        fields: ['严重性 S：是否影响放行或患者风险', '发生概率 O：是否重复出现或系统性缺陷', '可检测性 D：是否容易被现有记录发现'],
        outputs: ['优先清理高 S + 高 O 缺陷怪', 'Boss 前先补齐可检测性最低的证据', '需要 CAPA 时先锁定高 RPN 根因'],
        score: 'S4 · O3 · D3',
        result: '当前建议：先压制与风险信号直接相关的缺陷，再进入 Boss 核验。',
      }
    }
    if (tool.id === 'fishbone') {
      return {
        ...base,
        pageTitle: '鱼骨图工作台',
        pageSubtitle: '从人、机、料、法、环拆解根因，适合偏差调查和 CAPA 前置判断。',
        fields: ['人：培训、复核、职责', '机：设备、校准、状态', '料：批次、供应商、取样', '法：SOP、记录、复测', '环：温湿度、污染、现场'],
        outputs: ['至少填 5 条原因后提交', '把可验证原因转成 CAPA 检查点', '优先处理能被证据证明的根因'],
        score: `${Object.values(fishboneEntries).reduce((sum, items) => sum + items.length, 0)} 条原因`,
        result: '当前建议：补齐每类至少一条原因，避免 CAPA 判断只凭猜测。',
      }
    }
    if (tool.id === 'what-if') {
      return {
        ...base,
        pageTitle: 'What-if 分析页',
        pageSubtitle: '用“如果发生某异常，会导致什么质量风险”快速发现遗漏。',
        fields: ['如果关键记录缺失怎么办', '如果该缺陷重复发生怎么办', '如果检测结果不能代表整批怎么办'],
        outputs: ['形成遗漏风险清单', '标记 Boss 题可能追问点', '决定是否扩大调查范围'],
        score: '3 个假设场景',
        result: '当前建议：围绕风险信号连续问 3 个“如果”，再决定是否进入 Boss。',
      }
    }
    if (tool.id === 'decision') {
      return {
        ...base,
        pageTitle: '决策树页面',
        pageSubtitle: '把放行、隔离、返工、扩大调查变成条件分支，适合答放行判断题。',
        fields: ['证据是否完整', '风险是否可控', '是否影响已放行批次', 'CAPA 是否可验证'],
        outputs: ['证据缺失：先隔离/保全证据', '风险可控：限定条件下继续调查', '风险不可控：停止放行并升级'],
        score: '4 个判断节点',
        result: '当前建议：Boss 前先回答“证据完整吗”，再判断放行或隔离。',
      }
    }
    if (tool.id === 'fmea') {
      return {
        ...base,
        pageTitle: 'FMEA 页面',
        pageSubtitle: '识别失效模式、后果、原因和现有控制，适合工艺与设备类章节。',
        fields: ['失效模式：当前缺陷如何发生', '失效后果：影响质量属性还是记录完整性', '现有控制：是否能及时发现'],
        outputs: ['列出高风险失效模式', '补充预防和检测控制', '把控制项同步到 CAPA'],
        score: '失效模式优先',
        result: '当前建议：先找“现有控制挡不住”的失效模式。',
      }
    }
    if (tool.id === 'haccp') {
      return {
        ...base,
        pageTitle: 'HACCP 页面',
        pageSubtitle: '识别关键控制点，适合污染、交叉污染、清洁和无菌场景。',
        fields: ['危害来源', '关键控制点 CCP', '关键限度', '纠偏动作'],
        outputs: ['确认是否存在 CCP 失控', '给出监测和纠偏动作', '判断是否需要扩大批次影响评估'],
        score: 'CCP 识别',
        result: '当前建议：若缺陷涉及污染或环境，优先用 HACCP 判断控制点。',
      }
    }
    if (tool.id === 'pha') {
      return {
        ...base,
        pageTitle: 'PHA 页面',
        pageSubtitle: '初步危害分析，用于进入新章节时快速建立风险清单。',
        fields: ['危害是什么', '谁会受到影响', '现有保护层是什么', '下一步需要什么证据'],
        outputs: ['初始危害清单', '需要补证的记录列表', '进入详细分析的优先级'],
        score: '快速筛查',
        result: '当前建议：刚进入新房间时先用 PHA 扫一遍风险。',
      }
    }
    return {
      ...base,
      pageTitle: 'FTA 故障树页面',
      pageSubtitle: '从 Boss 失败结果倒推组合原因，适合最终挑战前复盘。',
      fields: ['顶事件：Boss 核验失败', '一级原因：证据缺失/控制失败/判断错误', '底层事件：可验证的具体缺陷'],
      outputs: ['倒推出必须清掉的缺陷', '找到共同根因', '确认是否还有隐藏证据缺口'],
      score: '顶事件倒推',
      result: '当前建议：Boss 打不过时，用 FTA 回看哪类缺陷没有处理干净。',
    }
  })
  const activeToolProfile = toolProfiles.find(tool => tool.id === activeSkillTool) ?? toolProfiles[0]
  const ActiveToolIcon = activeToolProfile.icon
  const fishboneGroups = [
    { label: '人', items: ['复核职责不清', '培训记录缺失'] },
    { label: '机', items: ['设备状态异常', '校准周期超期'] },
    { label: '料', items: ['物料批次差异', '取样代表性不足'] },
    { label: '法', items: ['SOP 未覆盖异常', '复测替代调查'] },
    { label: '环', items: ['温湿度波动', '交叉污染风险'] },
  ]
  const messages: Array<{ icon: LucideIcon; from: string; title: string; body: string; time: string; target: SystemMessageTarget }> = [
    { icon: Bell, from: '游戏提醒', title: project.title, body: `当前推荐先完成任务简报，再进入 ${trackLabel(educationTrack)}线路 Boss 核验。`, time: '5分钟前', target: 'mission' },
    { icon: HeartPulse, from: '补给站', title: wallet.lastDailySupplyDate === getSimulationDateKey() ? '今日补给已领取' : '今日补给待领取', body: `当前道具库存 ${supplyCount} 件，金币 ${wallet.coins.toLocaleString()}。`, time: '12分钟前', target: 'supply' },
    { icon: Trophy, from: '通关报告', title: `已完成 ${completedCount} 个项目`, body: `奖章 ${trophySummary.total} 枚，实训课时 ${creditSummary.simulationEarned}/${creditSummary.simulationRequired}。`, time: '今天', target: 'report' },
  ]

  return (
    <div className={styles.modalScrim} role="presentation" onMouseDown={onClose}>
      <section className={styles.quickPanelModal} role="dialog" aria-modal="true" aria-labelledby="quick-panel-title" onMouseDown={event => event.stopPropagation()}>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="关闭面板"><X size={19} /></button>
        <header className={styles.quickPanelHeader}>
          <div className={styles.quickPanelIcon}><Icon size={28} /></div>
          <div>
            <p className={styles.eyebrow}>{header.eyebrow}</p>
            <h2 id="quick-panel-title">{header.title}</h2>
          </div>
        </header>

        {panel === 'mentor' && (
          <div className={styles.mentorPanel}>
            <div className={styles.mentorConsole}>
              <div className={styles.mentorAvatar}><Bot size={24} /></div>
              <div>
                <span>Lv.{player.rankLevel} {player.rankTitle} · 2D 实训攻略导师</span>
                <p>对话已按项目保存，当前关联 {project.missionCode} · {project.caseFocus}</p>
              </div>
            </div>
            <div className={styles.mentorChatHistory} aria-live="polite">
              {mentorMessages.map(message => (
                <div
                  key={message.id}
                  className={`${styles.mentorChatMessage} ${message.role === 'student' ? styles.mentorChatStudent : styles.mentorChatMentor}`}
                >
                  <span>{message.role === 'student' ? '我' : 'AI导师'}</span>
                  <p>{message.text}</p>
                </div>
              ))}
            </div>
            <div className={styles.mentorPromptGrid}>
              {mentorPrompts.map(prompt => <button type="button" key={prompt} disabled={mentorThinking} onClick={() => void askMentor(prompt)}>{prompt}</button>)}
            </div>
            <div className={styles.mentorInputRow}>
              <input
                value={mentorInput}
                onChange={event => setMentorInput(event.currentTarget.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') void askMentor(mentorInput)
                }}
                placeholder={mentorThinking ? 'AI 导师正在回答...' : '问我当前项目、Boss、证据链或 CAPA 判断'}
              />
              <button type="button" disabled={mentorThinking} onClick={() => void askMentor(mentorInput)}><Send size={16} />{mentorThinking ? '思考中' : '发送'}</button>
            </div>
          </div>
        )}

        {panel === 'friends' && (
          <div className={styles.friendPanelShell}>
            <div className={styles.friendPanelToolbar}>
              <div>
                <strong>好友</strong>
                <span>{teamFriends.filter(friend => friend.online).length} 人在线</span>
              </div>
              <button type="button" onClick={() => setAddingFriend(current => !current)}>
                {addingFriend ? <MessageCircle size={16} /> : <UserPlus size={16} />}
                {addingFriend ? '返回聊天' : '添加好友'}
              </button>
            </div>
            <div className={styles.friendPanel}>
              <div className={styles.friendRoster}>
              <div className={styles.teamRosterHeader}>
                <strong>好友列表</strong>
                <button type="button" disabled={teamLoading} onClick={() => void refreshTeamFriends()}><Radio size={14} />刷新</button>
              </div>
              {teamFriends.length ? teamFriends.map(friend => (
                <button
                  type="button"
                  key={friend.userId}
                  className={`${styles.friendRosterItem} ${selectedTeamFriend?.userId === friend.userId ? styles.friendActive : ''}`}
                  onClick={() => setSelectedPeerId(friend.userId)}
                >
                  <span className={styles.friendRosterAvatar}>
                    {friend.avatarUrl ? <img src={friend.avatarUrl} alt="" /> : <b>{friend.displayName.slice(0, 1)}</b>}
                    <i className={settings.showOnline && friend.online !== false ? styles.friendOnline : styles.friendOffline} />
                  </span>
                  <div>
                    <b>{friend.displayName}</b>
                    <small>{friend.major || friend.className || friend.school || 'GMP 实训成员'}</small>
                    {friend.activeRoom && (
                      <small className={styles.friendRoomMini}>
                        组队中 · 项目 {friend.activeRoom.projectId} · {friend.activeRoom.memberCount}/3
                      </small>
                    )}
                  </div>
                </button>
              )) : (
                <p className={styles.teamEmptyText}>暂无好友</p>
              )}

              {incomingFriendRequests.length > 0 && (
                <>
                  <strong>待同意申请</strong>
                  {incomingFriendRequests.map(request => (
                    <article key={request.userId} className={styles.friendRequestCard}>
                      <div>
                        <b>{request.displayName}</b>
                        <small>{request.major || request.className || request.school || '请求添加你为好友'}</small>
                      </div>
                      <span>
                        <button type="button" disabled={teamLoading} onClick={() => void respondFriendRequest(request.userId, 'accept')}><Check size={13} />同意</button>
                        <button type="button" disabled={teamLoading} onClick={() => void respondFriendRequest(request.userId, 'reject')}><X size={13} />拒绝</button>
                      </span>
                    </article>
                  ))}
                </>
              )}

              {outgoingFriendRequests.length > 0 && (
                <>
                  <strong>已发出申请</strong>
                  {outgoingFriendRequests.map(request => (
                    <article key={request.userId} className={styles.friendRequestCard}>
                      <div>
                        <b>{request.displayName}</b>
                        <small>{request.major || request.className || request.school || '等待对方同意'}</small>
                      </div>
                      <em>待通过</em>
                    </article>
                  ))}
                </>
              )}
              </div>

              <div className={styles.teamCollabDetail}>
              <section className={styles.privateChatPanel}>
                <header>
                  {!addingFriend && selectedTeamFriend && (
                    <div className={styles.privateChatAvatar}>
                      {selectedTeamFriend.avatarUrl ? <img src={selectedTeamFriend.avatarUrl} alt="" /> : <span>{selectedTeamFriend.displayName.slice(0, 1)}</span>}
                      <i className={settings.showOnline && selectedTeamFriend.online !== false ? styles.friendOnline : styles.friendOffline} />
                    </div>
                  )}
                  <div>
                    <span>{addingFriend ? 'ADD FRIEND' : 'FRIEND CHAT'}</span>
                    <h3>{addingFriend ? '查找新好友' : selectedTeamFriend?.displayName ?? '选择好友开始私聊'}</h3>
                    <p>{addingFriend ? '按学号、昵称或姓名查找。' : selectedTeamFriend ? (selectedTeamFriend.major || selectedTeamFriend.className || 'GMP 实训成员') : '添加好友后可发送私聊消息。'}</p>
                  </div>
                  {!addingFriend && selectedTeamFriend && (
                    <button
                      type="button"
                      className={styles.friendHeaderInviteButton}
                      disabled={!settings.allowInvites || teamLoading || selectedTeamFriend.online === false}
                      onClick={() => setFriendProjectPickerOpen(current => !current)}
                    >
                      <UsersRound size={15} />邀请组队
                    </button>
                  )}
                </header>
                {!addingFriend && selectedTeamFriend && (
                  <>
                    {friendProjectPickerOpen && (
                      <div className={styles.friendProjectPicker}>
                        <label>
                          <span>选择项目</span>
                          <select
                            value={friendInviteProjectId}
                            onChange={event => setFriendInviteProjectId(Number(event.currentTarget.value))}
                            aria-label="选择组队项目"
                          >
                            {projects.map(item => (
                              <option key={item.id} value={item.id} disabled={item.status === 'locked'}>
                                项目 {item.id} · {item.title}{item.status === 'locked' ? '（未解锁）' : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          disabled={teamLoading || selectedTeamFriend.online === false || selectedFriendBusy}
                          onClick={() => {
                            onOpenTeamInviteProject(friendInviteProjectId, selectedTeamFriend.userId)
                            onClose()
                          }}
                        >
                          <UsersRound size={15} />{selectedFriendBusy ? selectedFriendBusyReason : '确认邀请'}
                        </button>
                      </div>
                    )}
                    {selectedFriendRoom && (
                      <div className={styles.friendRoomStatusBar}>
                        <div>
                          <span>{selectedFriendRoom.roomStatus === 'started' ? '调查中' : '组队中'} · {selectedFriendRoom.memberCount}/3</span>
                          <strong>{selectedFriendRoom.missionCode} · {selectedFriendRoom.projectTitle}</strong>
                        </div>
                        <button
                          type="button"
                          disabled={teamLoading || (!selectedFriendRoom.mineInRoom && (!selectedFriendRoom.joinable || selectedFriendRoomPending))}
                          onClick={() => void requestJoinSelectedFriendRoom()}
                        >
                          <UsersRound size={15} />
                          {selectedFriendRoom.mineInRoom ? '进入房间' : selectedFriendRoomPending ? '已申请' : selectedFriendRoom.joinable ? '申请加入' : '不可加入'}
                        </button>
                      </div>
                    )}
                  </>
                )}
                {addingFriend ? (
                  <>
                    <div className={styles.teamSearchRow}>
                      <input
                        value={friendSearch}
                        onChange={event => setFriendSearch(event.currentTarget.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') void refreshTeamFriends(friendSearch)
                        }}
                        placeholder="输入学号、昵称或姓名"
                      />
                      <button type="button" disabled={teamLoading || !friendSearch.trim()} onClick={() => void refreshTeamFriends(friendSearch)}><FileSearch size={15} />搜索</button>
                    </div>
                    <div className={styles.friendSearchResults}>
                      {friendSearch.trim() ? (
                        friendSuggestions.length ? friendSuggestions.slice(0, 8).map(friend => (
                          <article key={friend.userId} className={styles.friendSearchCard}>
                            <div className={styles.friendAvatar}>{friend.avatarUrl ? <img src={friend.avatarUrl} alt="" /> : <span>{friend.displayName.slice(0, 1)}</span>}</div>
                            <div>
                              <strong>{friend.displayName}</strong>
                              <small>{friend.realName ? `${friend.realName} · ` : ''}{friend.major || friend.className || friend.school || 'GMP 实训成员'}</small>
                            </div>
                            <button type="button" disabled={teamLoading} onClick={() => void addRealFriend(friend.userId)}><UserPlus size={14} />发送申请</button>
                          </article>
                        )) : (
                          <p className={styles.teamEmptyText}>没有匹配用户</p>
                        )
                      ) : (
                        <p className={styles.teamEmptyText}>输入关键词搜索用户</p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className={styles.friendChat}>
                      {privateMessages.length ? privateMessages.map(message => (
                        <article key={message.id} className={`${styles.friendChatRow} ${message.mine ? styles.friendChatMine : styles.friendChatOther}`}>
                          <span className={styles.friendMessageAvatar}>
                            {message.mine
                              ? currentAvatarUrl ? <img src={currentAvatarUrl} alt="" /> : <b>{currentDisplayName.slice(0, 1)}</b>
                              : selectedTeamFriend?.avatarUrl ? <img src={selectedTeamFriend.avatarUrl} alt="" /> : <b>{selectedTeamFriend?.displayName.slice(0, 1) ?? '友'}</b>}
                          </span>
                          <p className={message.mine ? styles.chatMe : styles.chatFriend}>{message.content}</p>
                        </article>
                      )) : (
                        <p className={styles.chatSystem}>{selectedTeamFriend ? '暂无消息' : '选择好友'}</p>
                      )}
                    </div>
                    <div className={`${styles.mentorInputRow} ${styles.friendComposerRow}`}>
                      <input
                        value={privateInput}
                        onChange={event => setPrivateInput(event.currentTarget.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') void sendPrivateTeamMessage()
                        }}
                        disabled={!selectedTeamFriend || teamLoading}
                        placeholder={selectedTeamFriend ? `给 ${selectedTeamFriend.displayName} 发消息` : '选择好友后发送消息'}
                      />
                      <button type="button" disabled={!selectedTeamFriend || teamLoading} onClick={() => void sendPrivateTeamMessage()} aria-label="发送私聊消息"><Send size={16} /><span>发送</span></button>
                    </div>
                  </>
                )}
                {teamNotice && <p className={styles.teamNotice}>{teamNotice}</p>}
              </section>
              </div>
            </div>
          </div>
        )}

        {panel === 'skills' && (
          <div className={styles.skillReferenceLayout}>
            <nav className={styles.skillToolNav} aria-label="风险管理工具">
              {skillTools.map((tool, index) => {
                const ToolIcon = tool.icon
                const node = skillNodes.find(item => item.id === tool.id)
                const unlocked = !node || unlockedProjectCount >= node.unlockProject
                return (
                  <button
                    type="button"
                    key={tool.id}
                    className={activeSkillTool === tool.id ? styles.skillToolNavActive : ''}
                    onClick={() => setActiveSkillTool(tool.id)}
                  >
                    <ToolIcon size={16} />
                    <span>{tool.label}</span>
                    {!unlocked && <Lock size={13} />}
                  </button>
                )
              })}
            </nav>
            <section className={styles.skillTreeCanvas}>
              <header className={styles.skillTreeCanvasHeader}>
                <div>
                  <span>风险管理工具</span>
                  <strong>与 2D 实训项目同步解锁</strong>
                </div>
                <small>已解锁 {Math.min(skillNodes.length, unlockedProjectCount + 1)}/{skillNodes.length}</small>
              </header>
              <div className={styles.skillTreeMap}>
                <svg className={styles.skillConnectorLayer} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  {skillConnectors.map((line, index) => (
                    <line key={index} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
                  ))}
                </svg>
                {skillNodes.map(node => {
                  const NodeIcon = node.icon
                  const unlocked = unlockedProjectCount >= node.unlockProject
                  return (
                    <button
                      type="button"
                      key={node.id}
                      className={`${styles.skillReferenceNode} ${unlocked ? styles.skillReferenceNodeUnlocked : styles.skillReferenceNodeLocked} ${activeSkillTool === node.id ? styles.skillReferenceNodeActive : ''}`}
                      style={{ left: `${node.x}%`, top: `${node.y}%` }}
                      onClick={() => setActiveSkillTool(node.id)}
                    >
                      <div>{unlocked ? <NodeIcon size={20} /> : <Lock size={18} />}</div>
                      <strong>{node.name}</strong>
                      <span>{unlocked ? node.level : `项目${String(node.unlockProject).padStart(2, '0')}解锁`}</span>
                      <small>{node.projectName}</small>
                    </button>
                  )
                })}
              </div>
              <article className={styles.skillDetailCard}>
                <div>
                  <SelectedSkillIcon size={22} />
                  <span>{selectedSkillUnlocked ? '已可使用' : '待解锁'}</span>
                </div>
                <strong>{selectedSkillTool.label}</strong>
                <p>{selectedSkillTool.detail}</p>
                <small>{selectedSkillUnlocked ? selectedSkillTool.action : `完成 ${selectedSkillNode?.projectName ?? '前置项目'} 后解锁。`}</small>
                <button type="button" onClick={() => setToolNotice(`${selectedSkillTool.label} 已同步到工具页建议区`)}>同步到工具页</button>
              </article>
              <footer className={styles.skillReferenceFooter}>
                <span>工具熟练度</span>
                <div><i style={{ width: `${Math.min(100, (trophySummary.total / PROJECT_MISSIONS.length) * 100)}%` }} /></div>
                <strong>{trophySummary.total * 6}/{PROJECT_MISSIONS.length * 6}</strong>
              </footer>
            </section>
          </div>
        )}

        {panel === 'tools' && (
          <div className={styles.toolsWorkbenchSplit}>
            <nav className={styles.toolPageNav} aria-label="质量工具页面">
              {toolProfiles.map(tool => {
                const ToolIcon = tool.icon
                return (
                  <button
                    type="button"
                    key={tool.id}
                    className={activeSkillTool === tool.id ? styles.toolPageNavActive : ''}
                    onClick={() => {
                      setActiveSkillTool(tool.id)
                      setToolNotice('')
                    }}
                  >
                    <ToolIcon size={17} />
                    <span>{tool.label}</span>
                    <small>{tool.unlockText}</small>
                  </button>
                )
              })}
            </nav>
            <section className={styles.toolPageShell}>
              <header className={styles.toolPageHero}>
                <div className={styles.toolPageIcon}><ActiveToolIcon size={26} /></div>
                <div>
                  <p className={styles.eyebrow}>QUALITY TOOL</p>
                  <h3>{activeToolProfile.pageTitle}</h3>
                  <span>{activeToolProfile.pageSubtitle}</span>
                </div>
                <strong>{activeToolProfile.score}</strong>
              </header>
              <div className={styles.toolCaseStrip}>
                <div>
                  <span>当前项目</span>
                  <strong>{project.title}</strong>
                </div>
                <p>{project.riskSignal}</p>
              </div>

              {activeToolProfile.id === 'fishbone' ? (
                <section className={styles.fishboneCard}>
                  <div className={styles.fishboneTabs}>
                    {fishboneGroups.map(group => (
                      <button
                        type="button"
                        key={group.label}
                        className={activeFishboneGroup === group.label ? styles.fishboneTabActive : ''}
                        onClick={() => setActiveFishboneGroup(group.label)}
                      >
                        {group.label}
                      </button>
                    ))}
                  </div>
                  <div className={styles.fishboneDiagram}>
                    <div className={styles.fishboneSpine} />
                    <div className={styles.fishboneProblem}>
                      <ShieldAlert size={18} />
                      <strong>{project.caseFocus}</strong>
                      <span>待完成根因闭环</span>
                    </div>
                    {fishboneGroups.map((group, index) => (
                      <article
                        key={group.label}
                        className={styles.fishboneGroup}
                        style={{ '--fishbone-index': index } as CSSProperties}
                      >
                        <strong>{group.label}</strong>
                        {(fishboneEntries[group.label] ?? []).slice(-3).map(item => <span key={item}>{item}</span>)}
                      </article>
                    ))}
                  </div>
                  <div className={styles.fishboneEditor}>
                    <input
                      value={fishboneDraft}
                      onChange={event => setFishboneDraft(event.currentTarget.value)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') addFishboneEntry()
                      }}
                      placeholder={`补充“${activeFishboneGroup}”分类原因`}
                    />
                    <button type="button" onClick={addFishboneEntry}><Plus size={16} />添加</button>
                  </div>
                  <div className={styles.fishboneActions}>
                    <button type="button" onClick={undoFishboneEntry}><ArrowLeft size={15} />撤销</button>
                    <button type="button" onClick={clearFishboneEntries}><X size={15} />清空</button>
                    <button type="button" onClick={saveFishboneAnalysis}><ClipboardCheck size={15} />保存</button>
                    <button type="button" className={styles.fishboneSubmit} onClick={submitFishboneAnalysis}><Send size={15} />提交分析</button>
                  </div>
                </section>
              ) : (
                <section className={styles.toolPageContent}>
                  <div className={styles.toolChecklist}>
                    <strong>输入项</strong>
                    {activeToolProfile.fields.map(field => (
                      <label key={field}>
                        <input type="checkbox" />
                        <span>{field}</span>
                      </label>
                    ))}
                  </div>
                  <div className={styles.toolOutputPanel}>
                    <strong>输出结果</strong>
                    {activeToolProfile.outputs.map(output => <p key={output}>{output}</p>)}
                  </div>
                  <article className={styles.toolScenarioCard}>
                    <span>当前项目建议</span>
                    <p>{activeToolProfile.result}</p>
                  </article>
                  <article className={styles.toolEvidenceCard}>
                    <span>证据锚点</span>
                    <p>{project.keyEvidence[0] ?? project.caseFocus}</p>
                  </article>
                </section>
              )}

              <div className={styles.toolPageActions}>
                <button type="button" onClick={() => setToolNotice(`${activeToolProfile.label} 已应用到当前项目分析`)}>
                  <CheckCircle2 size={16} />应用到当前项目
                </button>
                <button
                  type="button"
                  disabled={mentorThinking}
                  onClick={() => {
                    setToolNotice(`已发送给 AI导师：用${activeToolProfile.label}分析当前项目`)
                    void askMentor(`请用${activeToolProfile.label}分析当前项目：${project.title}`)
                  }}
                >
                  <Bot size={16} />让 AI导师按此工具分析
                </button>
              </div>
              {toolNotice && <p className={styles.toolNotice}>{toolNotice}</p>}
            </section>
          </div>
        )}

        {panel === 'messages' && (
          <div className={styles.messageFeed}>
            {groupedPrivateMessageNotices.map(group => {
              const notice = group.latest
              return (
              <button
                type="button"
                key={`private-${group.senderId}`}
                className={`${styles.invitationMessage} ${styles.privateNoticeThread}`}
                onClick={() => {
                  const idSet = new Set(group.ids)
                  setPrivateMessageNotices(current => current.filter(item => !idSet.has(item.id)))
                  onOpenFriendChat(group.senderId, group.count)
                }}
              >
                <div><MessageCircle size={18} /></div>
                <section>
                  <span>好友私信 · {new Date(notice.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                  <strong>{notice.senderName} 给你发来消息</strong>
                  <p>{group.latest.content}</p>
                </section>
                <b className={styles.privateNoticeBadge} data-count={group.count}>
                  查看
                </b>
              </button>
            )})}
            {invitationFeed.incoming.map(invitation => (
              <article key={`invite-${invitation.id}`} className={styles.invitationMessage}>
                <div><UsersRound size={18} /></div>
                <section>
                  <span>组队邀请 · 待处理</span>
                  <strong>{invitation.inviterName} 邀请你加入调查</strong>
                  <p>{invitation.missionCode} · {invitation.projectTitle}</p>
                </section>
                <button type="button" onClick={() => setSelectedInvitation(invitation)}>查看</button>
              </article>
            ))}
            {invitationFeed.approvals.map(invitation => (
              <article key={`approval-${invitation.id}`} className={styles.invitationMessage}>
                <div><Crown size={18} /></div>
                <section>
                  <span>房主审批 · 待处理</span>
                  <strong>{invitation.requesterName} 想邀请 {invitation.inviteeName}</strong>
                  <p>{invitation.missionCode} · {invitation.projectTitle}</p>
                </section>
                <span className={styles.invitationInlineActions}>
                  <button type="button" onClick={() => void onInvitationAction(invitation, 'deny')}>拒绝</button>
                  <button type="button" onClick={() => void onInvitationAction(invitation, 'approve')}>同意</button>
                </span>
              </article>
            ))}
            {messages.map(message => {
              const MessageIcon = message.icon
              return (
                <button
                  type="button"
                  key={`${message.from}-${message.title}`}
                  className={styles.systemMessageButton}
                  onClick={() => onOpenSystemMessage(message.target)}
                >
                  <div><MessageIcon size={18} /></div>
                  <section><span>{message.from} · {message.time}</span><strong>{message.title}</strong><p>{message.body}</p></section>
                </button>
              )
            })}
            {groupedPrivateMessageNotices.length === 0 && invitationFeed.incoming.length === 0 && invitationFeed.approvals.length === 0 && messages.length === 0 && (
              <p className={styles.teamEmptyText}>暂无消息</p>
            )}
          </div>
        )}

        {panel === 'settings' && (
          <div className={styles.settingsPanel}>
            <section>
              <header><Volume2 size={18} /><strong>音效栏</strong></header>
              <label className={styles.settingSwitch}><span>{settings.soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}总音效</span><input type="checkbox" checked={settings.soundEnabled} onChange={event => onSettingsChange({ soundEnabled: event.currentTarget.checked })} /></label>
              <label><span>背景音乐 {settings.musicVolume}%</span><input type="range" min="0" max="100" value={settings.musicVolume} onChange={event => onSettingsChange({ musicVolume: Number(event.currentTarget.value) })} /></label>
              <label><span>战斗音效 {settings.sfxVolume}%</span><input type="range" min="0" max="100" value={settings.sfxVolume} onChange={event => onSettingsChange({ sfxVolume: Number(event.currentTarget.value) })} /></label>
            </section>
            <section>
              <header><SlidersHorizontal size={18} /><strong>社交功能</strong></header>
              <label className={styles.settingSwitch}><span><Radio size={16} />允许好友邀请</span><input type="checkbox" checked={settings.allowInvites} onChange={event => onSettingsChange({ allowInvites: event.currentTarget.checked })} /></label>
              <label className={styles.settingSwitch}><span><Gift size={16} />允许装备赠送</span><input type="checkbox" checked={settings.allowGifts} onChange={event => onSettingsChange({ allowGifts: event.currentTarget.checked })} /></label>
              <label className={styles.settingSwitch}><span><UsersRound size={16} />展示在线状态</span><input type="checkbox" checked={settings.showOnline} onChange={event => onSettingsChange({ showOnline: event.currentTarget.checked })} /></label>
            </section>
          </div>
        )}

        <button type="button" className={styles.primaryButton} onClick={onClose}>确认</button>
        {selectedInvitation && (
          <TeamInvitationModal
            invitation={selectedInvitation}
            source="messages"
            onAction={async action => {
              if (action === 'later') {
                setSelectedInvitation(null)
                return true
              }
              const handled = await onInvitationAction(selectedInvitation, action)
              if (handled !== false) setSelectedInvitation(null)
              return handled
            }}
          />
        )}
      </section>
    </div>
  )
}

function TeamInvitationModal({
  invitation,
  source = 'popup',
  busy = false,
  error = '',
  onAction,
}: {
  invitation: TeamInvitation
  source?: 'popup' | 'messages'
  busy?: boolean
  error?: string
  onAction: (action: 'accept' | 'reject' | 'ignore' | 'later' | 'approve' | 'deny') => boolean | void | Promise<boolean | void>
}) {
  const isApproval = invitation.status === 'owner_pending'
  const isSelfJoinRequest = invitation.requestedById === invitation.inviteeId
  return (
    <div className={styles.teamInvitationScrim} role="presentation">
      <section className={styles.teamInvitationModal} role="dialog" aria-modal="true" aria-labelledby="team-invitation-title">
        <header>
          <div className={styles.teamInvitationAvatar}>
            {isApproval && invitation.inviteeAvatar
              ? <img src={invitation.inviteeAvatar} alt="" />
              : !isApproval && invitation.inviterAvatar
                ? <img src={invitation.inviterAvatar} alt="" />
                : (isApproval ? invitation.inviteeName : invitation.inviterName).slice(0, 1)}
          </div>
          <div>
            <span>{isApproval ? 'JOIN REQUEST' : 'TEAM INVITATION'}</span>
            <h2 id="team-invitation-title">{isApproval ? '入队申请' : '组队邀请'}</h2>
          </div>
        </header>
        <div className={styles.teamInvitationBody}>
          <strong>{isApproval ? invitation.requesterName : invitation.inviterName}</strong>
          <span>{isApproval ? '等待房主同意' : '来自好友'}</span>
          <p>{isApproval ? (isSelfJoinRequest ? '申请加入你的组队房间' : `申请邀请 ${invitation.inviteeName} 加入房间`) : '邀请你参加项目调查'}</p>
          <div>
            <small>{invitation.missionCode}</small>
            <b>{invitation.projectTitle}</b>
          </div>
          {error && <p className={styles.teamInvitationError}>{error}</p>}
        </div>
        <footer>
          {isApproval ? (
            <>
              <button type="button" disabled={busy} onClick={() => onAction('deny')}>拒绝</button>
              <button type="button" disabled={busy} className={styles.teamInvitationAccept} onClick={() => onAction('approve')}>{busy ? '正在处理...' : '同意加入'}</button>
            </>
          ) : source === 'popup' ? (
            <>
              <button type="button" disabled={busy} onClick={() => onAction('reject')}>拒绝</button>
              <button type="button" disabled={busy} onClick={() => onAction('later')}>稍后处理</button>
              <button type="button" disabled={busy} className={styles.teamInvitationAccept} onClick={() => onAction('accept')}>{busy ? '正在加入...' : '接受'}</button>
            </>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={() => onAction('ignore')}>忽略</button>
              <button type="button" disabled={busy} className={styles.teamInvitationAccept} onClick={() => onAction('accept')}>{busy ? '正在加入...' : '同意并进入'}</button>
            </>
          )}
        </footer>
      </section>
    </div>
  )
}

function TeamInviteModal({
  project,
  projects,
  settings,
  initialRoomId,
  initialView = 'room',
  autoInviteFriendId,
  currentHp,
  minEntryHp,
  onStart,
  onNotice,
  onRoomExit,
  onRoomActive,
  onProjectChange,
  onClose,
}: {
  project: ProjectNode
  projects: ProjectNode[]
  settings: SimulationSettings
  initialRoomId?: string | null
  initialView?: TeamInviteInitialView
  autoInviteFriendId?: string | null
  currentHp: number
  minEntryHp: number
  onStart: (snapshot: TeamRoomSnapshot) => void
  onNotice: (notice: NoticeMessage) => void
  onRoomExit: () => void
  onRoomActive: (snapshot: TeamRoomSnapshot) => void
  onProjectChange: (projectId: number) => void
  onClose: () => void
}) {
  const [teamFriends, setTeamFriends] = useState<TeamFriend[]>([])
  const [teamRoom, setTeamRoom] = useState<TeamRoomSnapshot | null>(null)
  const [publicRooms, setPublicRooms] = useState<TeamPublicRoom[]>([])
  const [invitationFeed, setInvitationFeed] = useState<TeamInvitationFeed>({ incoming: [], approvals: [], sent: [] })
  const [selectedProfile, setSelectedProfile] = useState<TeamFriend | TeamRoomMember | null>(null)
  const [kickMenu, setKickMenu] = useState<{ member: TeamRoomMember; x: number; y: number } | null>(null)
  const [teamView, setTeamView] = useState<TeamInviteInitialView>(initialView)
  const [teamInput, setTeamInput] = useState('')
  const [roomName, setRoomName] = useState(`${project.title} 协作房`)
  const [teamLoading, setTeamLoading] = useState(false)
  const [teamNotice, setTeamNotice] = useState('')
  const previousRoomStatusRef = useRef<string | null>(null)
  const autoInviteKeyRef = useRef('')
  const refreshAllInFlightRef = useRef(false)
  const currentTeamMember = teamRoom?.members.find(member => member.mine) ?? null
  const onlineCount = teamFriends.filter(friend => friend.online).length
  const memberSlots = Array.from({ length: 3 }, (_, index) => teamRoom?.members[index] ?? null)
  const activeInvitationFriendIds = new Set(invitationFeed.sent.map(invitation => invitation.inviteeId))
  const nonOwnerMembers = teamRoom?.members.filter(member => member.userId !== teamRoom.room?.ownerId) ?? []
  const currentEntryHp = Math.max(0, Math.min(100, Math.round(Number(currentHp) || 0)))
  const lowHpMembers = teamRoom?.members.filter(member => Math.max(0, Math.min(100, Math.round(Number(member.hp ?? 100)))) < minEntryHp) ?? []
  const currentHpTooLow = currentEntryHp < minEntryHp
  const canStart = Boolean(teamRoom?.room?.mine && nonOwnerMembers.length > 0 && nonOwnerMembers.every(member => ['ready', 'playing'].includes(member.status)) && !currentHpTooLow && lowHpMembers.length === 0)
  const teamBattleRunning = teamRoom?.room?.status === 'started'
  const currentRoomProjectId = teamRoom?.room?.projectId ?? project.id
  const currentRoomProject = projects.find(item => item.id === currentRoomProjectId) ?? project
  const canChangeRoomProject = Boolean(teamRoom?.room?.mine && teamRoom.room.status === 'open')
  const unlockedProjectChoices = projects.filter(item => item.status !== 'locked')
  const roomProjectChoices = projects.filter(item => item.status !== 'locked' || item.id === currentRoomProjectId)
  const projectIndexLabel = (item: ProjectNode) => isBountyTeamProject(item.id) ? '无尽试炼' : `项目 ${item.id}`
  const renderProjectPicker = (items: ProjectNode[], disabled: boolean) => (
    <div className={`${styles.teamProjectDropdown} ${disabled ? styles.teamProjectDropdownDisabled : ''}`}>
      <button
        type="button"
        className={styles.teamProjectDropdownTrigger}
        disabled={disabled}
        aria-haspopup="listbox"
      >
        <span>{currentRoomProject.missionCode} · {projectIndexLabel(currentRoomProject)} · {currentRoomProject.title}</span>
        <ChevronDown size={16} />
      </button>
      {!disabled && (
        <div className={styles.teamProjectDropdownMenu} role="listbox" aria-label="选择调查项目">
          {items.map(item => (
            <button
              type="button"
              key={item.id}
              className={`${styles.teamProjectDropdownOption} ${item.id === currentRoomProjectId ? styles.teamProjectDropdownOptionActive : ''}`}
              role="option"
              aria-selected={item.id === currentRoomProjectId}
              onClick={() => void changeRoomProject(item.id)}
            >
              <strong>{item.missionCode} · {projectIndexLabel(item)}</strong>
              <span>{item.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )

  useEffect(() => {
    void refreshAll()
  }, [project.id, initialRoomId])

  useEffect(() => {
    setTeamView(initialView)
  }, [initialView, initialRoomId])

  useEffect(() => {
    if (!teamRoom?.room) setRoomName(`${project.title} 协作房`)
  }, [project.id, project.title, teamRoom?.room?.roomId])

  useEffect(() => {
    autoInviteKeyRef.current = ''
  }, [project.id, initialRoomId, autoInviteFriendId])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshAll(false)
    }, teamRoom?.room || teamView === 'hall' || invitationFeed.sent.length ? 2500 : 4000)
    return () => window.clearInterval(timer)
  }, [teamRoom?.room?.roomId, teamView, invitationFeed.sent.length])

  useEffect(() => {
    const refreshNow = () => {
      if (document.visibilityState === 'hidden') return
      void refreshAll(false)
    }
    window.addEventListener('focus', refreshNow)
    document.addEventListener('visibilitychange', refreshNow)
    return () => {
      window.removeEventListener('focus', refreshNow)
      document.removeEventListener('visibilitychange', refreshNow)
    }
  }, [project.id, initialRoomId, teamView])

  useEffect(() => {
    if (!teamRoom?.room) return undefined
    const roomId = teamRoom.room.roomId
    const timer = window.setTimeout(() => {
      void modalFetch<TeamRoomSnapshot>('/api/team/rooms', {
        method: 'POST',
        body: JSON.stringify({
          action: 'syncHp',
          projectId: project.id,
          roomId,
          hp: currentEntryHp,
        }),
      }).then(data => {
        setTeamRoom(data)
        if (data.room) onRoomActive(data)
      }).catch(() => undefined)
    }, 220)
    return () => window.clearTimeout(timer)
  }, [currentEntryHp, project.id, teamRoom?.room?.roomId])

  useEffect(() => {
    if (!autoInviteFriendId || !teamFriends.length) return
    const key = `${project.id}:${autoInviteFriendId}`
    if (autoInviteKeyRef.current === key) return
    const friend = teamFriends.find(item => item.userId === autoInviteFriendId)
    autoInviteKeyRef.current = key
    if (!friend) {
      setTeamNotice('未找到该好友，请刷新好友列表后重试')
      return
    }
    setTeamNotice('正在创建队伍并发送邀请...')
    void inviteFriend(friend, false).then(success => {
      if (!success) return
      const message = `已邀请 ${friend.displayName} 加入「${project.title}」，等待对方接受后进入房间。`
      setTeamNotice('')
      popupNotice('邀请成功', message, 'success')
    })
  }, [autoInviteFriendId, project.id, project.title, teamFriends])

  async function modalFetch<T>(url: string, init?: RequestInit): Promise<T> {
    const token = readTeamAuthToken()
    if (!token) throw new Error('请先登录后再组队')
    const headers = new Headers(init?.headers)
    headers.set('Content-Type', 'application/json')
    headers.set('Authorization', `Bearer ${token}`)
    const response = await fetch(url, { cache: 'no-store', ...init, headers })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = typeof data === 'object' && data && 'error' in data ? String((data as { error?: string }).error) : '请求失败'
      throw new Error(message)
    }
    return data as T
  }

  function modalErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : '组队服务暂时不可用'
  }

  function popupNotice(title: string, message: string, tone: NoticeMessage['tone'] = 'warning') {
    onNotice({ tone, title, message })
  }

  async function refreshAll(showError = true) {
    if (refreshAllInFlightRef.current) return
    refreshAllInFlightRef.current = true
    try {
      const roomQuery = initialRoomId
        ? `roomId=${encodeURIComponent(initialRoomId)}`
        : `projectId=${project.id}`
      const [friendData, roomData, inviteData] = await Promise.all([
        modalFetch<{ friends: TeamFriend[] }>('/api/team/friends'),
        modalFetch<TeamRoomSnapshot>(`/api/team/rooms?${roomQuery}`),
        modalFetch<TeamInvitationFeed>('/api/team/invitations'),
      ])
      const publicRoomData = await modalFetch<{ rooms: TeamPublicRoom[] }>('/api/team/rooms?lobby=1').catch(() => ({ rooms: [] }))
      let nextRoomData = roomData
      const joinedPublicRoom = publicRoomData.rooms.find(room => room.mineInRoom)
      if (!nextRoomData.room && joinedPublicRoom) {
        nextRoomData = await modalFetch<TeamRoomSnapshot>(`/api/team/rooms?roomId=${encodeURIComponent(joinedPublicRoom.roomId)}`)
        onProjectChange(joinedPublicRoom.projectId)
      }
      setTeamFriends([...friendData.friends].sort((left, right) => Number(Boolean(right.online)) - Number(Boolean(left.online))))
      setPublicRooms(publicRoomData.rooms)
      if (nextRoomData.closed || nextRoomData.removed) {
        setTeamRoom(null)
        popupNotice(
          nextRoomData.removed ? '已被移出队伍' : '队伍已解散',
          nextRoomData.removed ? '房主已将你移出当前房间，组队状态已同步清除。' : '该组队房间已关闭，双方都会退出当前组队大厅。',
          'info',
        )
        onRoomExit()
        return
      }
      const joinedRoomFromLobby = Boolean(!teamRoom?.room && nextRoomData.room && teamView === 'hall')
      setTeamRoom(nextRoomData)
      if (nextRoomData.room) {
        onRoomActive(nextRoomData)
        if (joinedRoomFromLobby) {
          setTeamView('room')
          setTeamNotice('')
          popupNotice('已进入房间', `房主已同意申请，已进入 ${nextRoomData.room.title}`, 'success')
        }
      }
      setInvitationFeed(inviteData)
      const previousStatus = previousRoomStatusRef.current
      const nextStatus = nextRoomData.room?.status ?? null
      previousRoomStatusRef.current = nextStatus
      if (previousStatus === 'open' && nextStatus === 'started') onStart(nextRoomData)
    } catch (error) {
      const message = modalErrorMessage(error)
      if (message.includes('无权') || message.includes('不在该') || message.includes('不在这个房间')) {
        setTeamRoom(null)
        popupNotice('已退出房间', '你已不在当前房间中，组队状态已同步清除。', 'info')
        onRoomExit()
        return
      }
      if (showError) {
        setTeamNotice(message)
        if (message.includes('解锁') || message.includes('不能') || message.includes('无权')) popupNotice('组队受限', message)
      }
    } finally {
      refreshAllInFlightRef.current = false
    }
  }

  async function updateTeamRoom(action: string, extra: Record<string, unknown> = {}, roomIdOverride?: string) {
    setTeamLoading(true)
    setTeamNotice('')
    try {
      const data = await modalFetch<TeamRoomSnapshot>('/api/team/rooms', {
        method: 'POST',
        body: JSON.stringify({
          action,
          projectId: project.id,
          roomId: action === 'create' ? undefined : roomIdOverride ?? teamRoom?.room?.roomId,
          title: action === 'create' ? roomName.trim() : undefined,
          hp: currentEntryHp,
          ...extra,
        }),
      })
      setTeamRoom(data)
      if (data.room) onRoomActive(data)
      previousRoomStatusRef.current = data.room?.status ?? null
      await refreshInvitationFeed(false)
      return data
    } catch (error) {
      const message = modalErrorMessage(error)
      setTeamNotice(message)
      if (message.includes('解锁') || message.includes('不能') || message.includes('不在线') || message.includes('已关闭')) popupNotice('组队提示', message)
      return null
    } finally {
      setTeamLoading(false)
    }
  }

  async function refreshInvitationFeed(showError = true) {
    try {
      setInvitationFeed(await modalFetch<TeamInvitationFeed>('/api/team/invitations'))
    } catch (error) {
      if (showError) setTeamNotice(modalErrorMessage(error))
    }
  }

  async function handleApproval(invitation: TeamInvitation, action: 'approve' | 'deny') {
    setTeamLoading(true)
    try {
      await modalFetch('/api/team/invitations', {
        method: 'POST',
        body: JSON.stringify({ invitationId: invitation.id, action }),
      })
      await refreshAll(false)
    } catch (error) {
      setTeamNotice(modalErrorMessage(error))
    } finally {
      setTeamLoading(false)
    }
  }

  async function inviteFriend(friend: TeamFriend, showSuccessNotice = true) {
    if (!settings.allowInvites) return false
    if (!friend.online) {
      setTeamNotice('好友当前不在线，不能发送邀请')
      popupNotice('好友不在线', '好友当前不在线，不能发送邀请。')
      return false
    }
    const busyReason = friendBusyReason(friend)
    if (busyReason) {
      setTeamNotice(`${friend.displayName} 正在${busyReason}，暂时不能邀请`)
      return false
    }
    let snapshot = teamRoom
    if (!snapshot?.room) snapshot = await updateTeamRoom('create')
    if (!snapshot?.room) return false
    const data = await updateTeamRoom('invite', { friendId: friend.userId }, snapshot.room.roomId)
    if (data) {
      setTeamNotice('')
      if (showSuccessNotice) {
        popupNotice('邀请成功', `已邀请 ${friend.displayName} 加入「${project.title}」，等待对方接受后进入房间。`, 'success')
      }
      return true
    }
    return false
  }

  async function toggleReady() {
    if (!currentTeamMember) return
    if (currentTeamMember.status !== 'ready' && currentHpTooLow) {
      const message = `当前血量 ${currentEntryHp}/100，低于 ${minEntryHp}，不能准备进入章节。`
      setTeamNotice(message)
      popupNotice('血量不足', message)
      return
    }
    await updateTeamRoom(currentTeamMember.status === 'ready' ? 'unready' : 'ready')
  }

  async function startInvestigation() {
    if (currentHpTooLow) {
      const message = `当前血量 ${currentEntryHp}/100，低于 ${minEntryHp}，不能进入章节。`
      setTeamNotice(message)
      popupNotice('血量不足', message)
      return
    }
    if (lowHpMembers.length > 0) {
      const message = `队友血量不足：${lowHpMembers.map(member => `${member.displayName} ${Math.round(Number(member.hp ?? 100))}/100`).join('、')}`
      setTeamNotice(message)
      popupNotice('队友血量不足', message)
      return
    }
    if (!teamRoom?.room) {
      const created = await updateTeamRoom('create')
      if (created) {
        setTeamView('room')
        setTeamNotice('队伍已创建，邀请好友或直接开始调查')
      }
      return
    }
    if (teamRoom.room.status === 'started') {
      onStart(teamRoom)
      return
    }
    const data = await updateTeamRoom('start')
    if (data) onStart(data)
  }

  async function createRoomAndOpen() {
    const data = await updateTeamRoom('create')
    if (data?.room) setTeamView('room')
  }

  async function requestJoinPublicRoom(room: TeamPublicRoom) {
    if (room.mineInRoom) {
      const data = await modalFetch<TeamRoomSnapshot>(`/api/team/rooms?roomId=${encodeURIComponent(room.roomId)}`)
      setTeamRoom(data)
      if (data.room) onRoomActive(data)
      setTeamView('room')
      return
    }
    setTeamLoading(true)
    setTeamNotice('')
    try {
      const data = await modalFetch<TeamRoomSnapshot | { ok?: boolean; status?: string }>('/api/team/rooms', {
        method: 'POST',
        body: JSON.stringify({ action: 'requestJoinRoom', roomId: room.roomId, projectId: room.projectId }),
      })
      if ('room' in data && data.room) {
        setTeamRoom(data)
        onRoomActive(data)
        setTeamView('room')
      } else {
        setTeamNotice('入队申请已发送，等待房主同意')
        setPublicRooms(current => current.map(item => item.roomId === room.roomId ? { ...item, pendingJoin: true, joinable: false } : item))
      }
      await refreshInvitationFeed(false)
    } catch (error) {
      const message = modalErrorMessage(error)
      setTeamNotice(message)
      popupNotice('申请加入失败', message)
    } finally {
      setTeamLoading(false)
    }
  }

  async function changeRoomProject(nextProjectId: number) {
    if (teamRoom?.room) {
      await updateTeamRoom('changeProject', { projectId: nextProjectId })
      return
    }
    onProjectChange(nextProjectId)
  }

  async function leaveRoom() {
    const action = teamRoom?.room?.mine ? 'disband' : 'leave'
    const data = await updateTeamRoom(action)
    if (data && !data.room) {
      popupNotice(
        action === 'disband' ? '队伍已解散' : '已退出队伍',
        action === 'disband' ? '房间已关闭，队友也会退出当前组队大厅。' : '你已退出当前队伍，房间仍保留给房主和其他队友。',
        'info',
      )
      onRoomExit()
    }
  }

  async function sendTeamMessage() {
    const content = teamInput.trim()
    if (!content || !teamRoom?.room) return
    const data = await updateTeamRoom('send', { content })
    if (data) setTeamInput('')
  }

  function avatarFor(profile: TeamFriend | TeamRoomMember) {
    return profile.avatarUrl
      ? <img src={profile.avatarUrl} alt="" />
      : <span>{profile.displayName.slice(0, 1)}</span>
  }

  function memberStatus(member: TeamRoomMember) {
    if (member.status === 'selecting') return '选择角色中'
    if (member.status === 'selected') return '已选角色'
    if (member.status === 'playing') return '调查中'
    if (member.status === 'ready') return '已准备'
    return '未准备'
  }

  function profileOnline(profile: TeamFriend | TeamRoomMember) {
    if ('online' in profile) return Boolean(profile.online)
    return Boolean(teamFriends.find(friend => friend.userId === profile.userId)?.online)
  }

  function friendBusyReason(friend: TeamFriend) {
    if (friend.activeRoom && !friend.activeRoom.mineInRoom) return '组队中'
    if (friend.activity?.status === 'solo') return '单人实训中'
    if (friend.busy) return '忙碌中'
    return ''
  }

  async function kickMember(member: TeamRoomMember) {
    if (!teamRoom?.room?.mine || member.userId === teamRoom.room.ownerId) return
    setKickMenu(null)
    const data = await updateTeamRoom('kick', { targetUserId: member.userId })
    if (data) {
      setTeamNotice('')
      popupNotice('已移出队员', `${member.displayName} 已被移出当前房间`, 'info')
    }
  }

  return (
    <div className={styles.modalScrim} role="presentation" onMouseDown={onClose}>
      <section className={styles.teamLobbyModal} role="dialog" aria-modal="true" aria-labelledby="team-ready-title" onMouseDown={event => event.stopPropagation()}>
        <header className={styles.teamInviteHeader}>
          <button type="button" className={styles.teamBackButton} onClick={onClose} aria-label="关闭组队准备"><ArrowLeft size={20} /></button>
          <div>
            <h2 id="team-ready-title">{teamView === 'hall' ? '房间大厅' : '组队准备'}</h2>
            {teamView === 'hall' ? (
              <span>浏览公开协作房，申请加入队伍，或创建自己的房间。</span>
            ) : teamRoom?.room ? (
              <div className={styles.teamHeaderRoomBadge}>
                <span>房间号</span>
                <strong>{teamRoom.room.roomCode ?? teamRoom.room.roomId.slice(-6).toUpperCase()}</strong>
                <em>{teamRoom.room.title}</em>
              </div>
            ) : (
              <span>输入房间名后创建房间，或从右侧房间大厅申请加入</span>
            )}
          </div>
          <div className={styles.teamHeaderStatus}>
            <span><i className={styles.friendOnline} />{onlineCount} 人在线</span>
            <button
              type="button"
              className={styles.teamLobbyHeaderButton}
              disabled={teamLoading}
              onClick={() => {
                setTeamView(teamView === 'hall' ? 'room' : 'hall')
                void refreshAll(false)
              }}
            >
              <UsersRound size={15} />{teamView === 'hall' ? '组队准备' : '大厅'}
            </button>
            <button type="button" disabled={teamLoading} onClick={() => void refreshAll()} aria-label="刷新队伍"><Radio size={16} /></button>
            <button type="button" className={styles.teamCloseButton} onClick={onClose} aria-label="关闭组队大厅"><X size={19} /></button>
          </div>
        </header>

        <div className={styles.teamLobbyLayout}>
          <aside className={styles.teamFriendList}>
            <header><strong>好友</strong><span>{onlineCount}/{teamFriends.length}</span></header>
            {teamFriends.length ? teamFriends.map(friend => {
              const joined = teamRoom?.members.some(member => member.userId === friend.userId)
              const pending = activeInvitationFriendIds.has(friend.userId)
              const busyReason = friendBusyReason(friend)
              const friendBusy = Boolean(busyReason)
              return (
                <article key={friend.userId} className={`${styles.teamFriendRow} ${friend.online ? styles.teamFriendRowOnline : ''}`}>
                  <button type="button" className={styles.teamFriendIdentity} onClick={() => setSelectedProfile(friend)}>
                    <div className={styles.teamFriendAvatar}>
                      {avatarFor(friend)}
                      <i className={friend.online ? styles.friendOnline : styles.friendOffline} />
                    </div>
                    <span><strong>{friend.displayName}</strong><small>{friendBusy ? busyReason : friend.online ? '在线' : '离线'}</small></span>
                  </button>
                  <button
                    type="button"
                    title={!friend.online ? '好友离线' : friendBusy ? `好友正在${busyReason}` : pending ? '邀请处理中' : joined ? '已在队伍中' : '邀请'}
                    disabled={teamLoading || !friend.online || friendBusy || joined || pending || !settings.allowInvites || teamRoom?.room?.status === 'started'}
                    onClick={() => void inviteFriend(friend)}
                  >
                    {friendBusy ? <Radio size={15} /> : joined || pending ? <Check size={15} /> : <UserPlus size={15} />}
                  </button>
                </article>
              )
            }) : <p className={styles.teamEmptyText}>暂无好友</p>}

            {teamRoom?.room?.mine && invitationFeed.approvals.length > 0 && (
              <section className={styles.teamApprovalList}>
                <strong>入队审批</strong>
                {invitationFeed.approvals
                  .filter(invitation => invitation.roomId === teamRoom.room?.roomId)
                  .map(invitation => (
                    <article key={invitation.id}>
                      <span>{invitation.requestedById === invitation.inviteeId ? `${invitation.requesterName} 申请加入房间` : `${invitation.requesterName} 邀请 ${invitation.inviteeName}`}</span>
                      <div>
                        <button type="button" onClick={() => void handleApproval(invitation, 'deny')}><X size={13} /></button>
                        <button type="button" onClick={() => void handleApproval(invitation, 'approve')}><Check size={13} /></button>
                      </div>
                    </article>
                  ))}
              </section>
            )}
          </aside>

          {teamView === 'hall' ? (
          <main className={styles.teamHallMain}>
            <section className={styles.teamHallToolbar}>
              <div>
                <span>协作大厅</span>
                <h3>公开房间</h3>
                <p>申请加入公开队伍，或创建自己的协作房间。</p>
              </div>
              <div className={styles.teamHallToolbarActions}>
                <button type="button" disabled={teamLoading} onClick={() => void refreshAll(false)}>
                  <Radio size={15} />刷新
                </button>
                {teamRoom?.room ? (
                  <button type="button" onClick={() => setTeamView('room')}>
                    <UsersRound size={15} />进入当前房间
                  </button>
                ) : (
                  <button type="button" disabled={teamLoading || !roomName.trim()} onClick={() => void createRoomAndOpen()}>
                    <Plus size={15} />创建房间
                  </button>
                )}
              </div>
            </section>

            {!teamRoom?.room && (
              <section className={styles.teamHallCreatePanel}>
                <label>
                  <span>房间名</span>
                  <input
                    value={roomName}
                    maxLength={32}
                    onChange={event => setRoomName(event.currentTarget.value)}
                    placeholder="例如：今晚清洁验证队"
                  />
                </label>
                <label>
                  <span>项目</span>
                  {renderProjectPicker(unlockedProjectChoices, teamLoading)}
                </label>
                <small>{currentRoomProject.caseFocus}</small>
              </section>
            )}

            {teamRoom?.room && (
              <section className={styles.teamHallCurrentRoom}>
                <div>
                  <span>当前房间</span>
                  <strong>{teamRoom.room.roomCode ?? teamRoom.room.roomId.slice(-6).toUpperCase()}</strong>
                  <p>{teamRoom.room.title} · {currentRoomProject.missionCode} · {currentRoomProject.title}</p>
                </div>
                <button type="button" onClick={() => setTeamView('room')}>继续组队</button>
              </section>
            )}

            <section className={styles.teamHallDirectory}>
              <header>
                <div><strong>可加入队伍</strong><span>{publicRooms.length} 个公开房间</span></div>
              </header>
              <div className={styles.teamHallRoomList}>
                {publicRooms.length ? publicRooms.map(room => (
                  <article key={room.roomId} className={styles.teamHallRoomCard}>
                    <div className={styles.teamHallRoomSlots} aria-hidden="true">
                      {Array.from({ length: 3 }, (_, index) => (
                        <span key={index} className={index < room.memberCount ? styles.teamHallRoomSlotFilled : ''}>
                          {index < room.memberCount ? <UsersRound size={15} /> : <Plus size={15} />}
                        </span>
                      ))}
                    </div>
                    <div className={styles.teamHallRoomInfo}>
                      <strong>{room.roomTitle}</strong>
                      <span>房间号 {room.roomCode} · {room.missionCode} · {room.projectTitle}</span>
                      <small>房主 {room.ownerName} · {room.memberCount}/3 · {room.unlocked ? '已解锁' : '未解锁'}</small>
                    </div>
                    <button
                      type="button"
                      disabled={teamLoading || (!room.mineInRoom && !room.joinable)}
                      onClick={() => void requestJoinPublicRoom(room)}
                    >
                      {room.mineInRoom ? '进入房间' : room.pendingJoin ? '已申请' : !room.unlocked ? '未解锁' : room.memberCount >= 3 ? '已满员' : '申请加入'}
                    </button>
                  </article>
                )) : (
                  <p className={styles.teamHallEmpty}>暂无公开房间，可以先创建房间并邀请好友。</p>
                )}
              </div>
            </section>

            {teamNotice && <p className={styles.teamNotice}>{teamNotice}</p>}
          </main>
          ) : (
          <main className={styles.teamLobbyMain}>
            <section className={styles.teamRosterStage}>
              <div className={styles.teamStageHeading}>
                <div><span>{currentRoomProject.missionCode}</span><h3>{currentRoomProject.title}</h3></div>
                <div className={styles.teamCapacity}><UsersRound size={16} /><strong>{teamRoom?.members.length ?? 0}</strong><span>/ 3</span></div>
              </div>

              {!teamRoom?.room && (
                <label className={styles.teamRoomNameInput}>
                  <span>房间名</span>
                  <input
                    value={roomName}
                    maxLength={32}
                    onChange={event => setRoomName(event.currentTarget.value)}
                    placeholder="例如：今晚清洁验证队"
                  />
                </label>
              )}

              <div className={styles.teamSlots}>
                {memberSlots.map((member, index) => member ? (
                  <div key={member.userId} className={styles.teamSlotWrap}>
                    <button
                      type="button"
                      className={`${styles.teamSlot} ${member.status === 'ready' || member.status === 'playing' ? styles.teamSlotReady : ''}`}
                      onClick={() => setSelectedProfile(teamFriends.find(friend => friend.userId === member.userId) ?? member)}
                      onContextMenu={event => {
                        if (!teamRoom?.room?.mine || teamRoom.room.status !== 'open' || member.userId === teamRoom.room.ownerId) return
                        event.preventDefault()
                        setKickMenu({ member, x: event.clientX, y: event.clientY })
                      }}
                    >
                      <div className={styles.teamSlotAvatar}>{avatarFor(member)}</div>
                      <strong>{member.displayName}</strong>
                      <span>{member.userId === teamRoom?.room?.ownerId ? '房主' : memberStatus(member)}</span>
                      <small>{member.roleName ? `认领 ${member.roleName}` : '未认领剧情角色'}</small>
                      <small className={(member.hp ?? 100) < minEntryHp ? styles.teamHpLow : styles.teamHpReady}>HP {Math.round(Number(member.hp ?? 100))}/100</small>
                      {(member.status === 'ready' || member.status === 'playing') && <CheckCircle2 size={18} />}
                    </button>
                    {teamRoom?.room?.mine && teamRoom.room.status === 'open' && member.userId !== teamRoom.room.ownerId && (
                      <button
                        type="button"
                        className={styles.teamKickMemberButton}
                        disabled={teamLoading}
                        onClick={event => {
                          event.stopPropagation()
                          void kickMember(member)
                        }}
                      >
                        移出
                      </button>
                    )}
                  </div>
                ) : (
                  <div key={`empty-${index}`} className={styles.teamSlotEmpty}><Plus size={25} /><span>空位</span></div>
                ))}
              </div>

              <section className={styles.teamProjectChooser}>
                <header>
                  <div>
                    <span>调查项目</span>
                    <strong>{teamRoom?.room ? '房间项目' : '选择队伍要进入的项目'}</strong>
                  </div>
                  <small>{teamRoom?.room ? (canChangeRoomProject ? '切换时会检查所有队友是否已解锁该项目' : '只有房主可在开始前切换项目') : '只显示已解锁项目'}</small>
                </header>
                <div className={styles.teamProjectSelect}>
                  {renderProjectPicker(roomProjectChoices, teamLoading || Boolean(teamRoom?.room && !canChangeRoomProject))}
                  <span>{currentRoomProject.caseFocus}</span>
                </div>
              </section>
            </section>

            {teamRoom?.room ? (
              <section className={styles.teamLobbyConversation}>
                <div className={styles.teamRoomChat}>
                  <header><MessageCircle size={16} /><strong>队伍聊天</strong></header>
                  <div>
                    {teamRoom.messages.length ? teamRoom.messages.slice(-30).map(message => (
                      <article key={message.id} className={`${message.mine ? styles.teamChatMine : ''} ${message.senderType === 'ai' ? styles.teamChatNpc : ''}`}>
                        <span>{message.senderName}</span>
                        <p>{message.content}</p>
                      </article>
                    )) : <p className={styles.teamEmptyText}>暂无消息</p>}
                  </div>
                  <footer>
                    <input
                      value={teamInput}
                      onChange={event => setTeamInput(event.currentTarget.value)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') void sendTeamMessage()
                      }}
                      placeholder="和队友讨论分工或线索"
                    />
                    <button type="button" disabled={!teamInput.trim() || teamLoading} onClick={() => void sendTeamMessage()} aria-label="发送队伍消息"><Send size={16} /></button>
                  </footer>
                </div>
              </section>
            ) : (
              <section className={styles.teamLobbyEmpty}>
                <UsersRound size={34} />
                <strong>创建队伍后开始邀请</strong>
                <span>好友接受邀请后才会出现在房间中，也可以从房间大厅申请加入别人房间。</span>
              </section>
            )}

            <footer className={styles.teamLobbyFooter}>
              <div>
                {teamRoom?.room && (
                  <button
                    type="button"
                    className={styles.teamLeaveButton}
                    disabled={teamLoading || (teamBattleRunning && !teamRoom.room.mine)}
                    title={teamBattleRunning && !teamRoom.room.mine ? '调查进行中，非房主不能退出队伍' : undefined}
                    onClick={() => void leaveRoom()}
                  >
                    <DoorOpen size={16} />{teamRoom.room.mine ? '解散队伍' : teamBattleRunning ? '调查中不可退出' : '退出队伍'}
                  </button>
                )}
                {teamNotice
                  ? <p className={styles.teamNotice}>{teamNotice}</p>
                  : teamBattleRunning ? <p className={styles.teamNotice}>{teamRoom?.room?.mine ? '房主可结束或解散当前战斗，队友会同步返回。' : '调查进行中，等待房主结束战斗或结算。'}</p> : null}
              </div>
              {!teamRoom?.room ? (
                <button type="button" className={styles.teamStartButton} disabled={teamLoading || !roomName.trim()} onClick={() => void createRoomAndOpen()}><Plus size={18} />创建房间</button>
              ) : teamRoom.room.status === 'started' ? (
                <button type="button" className={styles.teamStartButton} disabled={teamLoading} onClick={() => onStart(teamRoom)}><Swords size={18} />重进当前关卡</button>
              ) : teamRoom.room.mine ? (
                <button type="button" className={styles.teamStartButton} disabled={teamLoading || !canStart} onClick={() => void startInvestigation()}>
                  <Swords size={18} />{canStart ? '开始调查' : currentHpTooLow || lowHpMembers.length ? '血量不足' : '等待队友准备'}
                </button>
              ) : currentTeamMember?.status === 'ready' ? (
                <button type="button" className={`${styles.teamStartButton} ${styles.teamWaitingButton}`} disabled>
                  <Clock3 size={18} />等待房主开始
                </button>
              ) : (
                <button type="button" className={`${styles.teamStartButton} ${currentTeamMember?.status === 'ready' ? styles.teamReadyButtonActive : ''}`} disabled={teamLoading || currentHpTooLow} onClick={() => void toggleReady()}>
                  <UserCheck size={18} />{currentTeamMember?.status === 'ready' ? '取消准备' : '准备'}
                </button>
              )}
            </footer>
          </main>
          )}
        </div>

        {selectedProfile && (
          <div className={styles.friendProfileScrim} onMouseDown={() => setSelectedProfile(null)}>
            <section className={styles.friendProfileModal} role="dialog" aria-modal="true" aria-label="好友资料" onMouseDown={event => event.stopPropagation()}>
              <button type="button" onClick={() => setSelectedProfile(null)} aria-label="关闭好友资料"><X size={18} /></button>
              <div className={styles.friendProfileAvatar}>{avatarFor(selectedProfile)}</div>
              <div className={styles.friendProfileStatus}><i className={profileOnline(selectedProfile) ? styles.friendOnline : styles.friendOffline} />{profileOnline(selectedProfile) ? '在线' : '离线'}</div>
              <h3>{selectedProfile.displayName}</h3>
              {selectedProfile.realName && <strong>{selectedProfile.realName}</strong>}
              <dl>
                {'major' in selectedProfile && <div><dt>专业</dt><dd>{selectedProfile.major || '-'}</dd></div>}
                {'className' in selectedProfile && <div><dt>班级</dt><dd>{selectedProfile.className || '-'}</dd></div>}
                {'school' in selectedProfile && <div><dt>学校</dt><dd>{selectedProfile.school || '-'}</dd></div>}
                {'roleName' in selectedProfile && <div><dt>队伍</dt><dd>{selectedProfile.roleName || memberStatus(selectedProfile)}</dd></div>}
              </dl>
            </section>
          </div>
        )}

        {kickMenu && (
          <div className={styles.teamKickMenuBackdrop} onMouseDown={() => setKickMenu(null)}>
            <menu
              className={styles.teamKickMenu}
              style={{ left: kickMenu.x, top: kickMenu.y }}
              onMouseDown={event => event.stopPropagation()}
            >
              <li><strong>{kickMenu.member.displayName}</strong></li>
              <li>
                <button type="button" disabled={teamLoading} onClick={() => void kickMember(kickMenu.member)}>
                  移出房间
                </button>
              </li>
            </menu>
          </div>
        )}
      </section>
    </div>
  )
}

function LegacyTeamInviteModal({
  project,
  settings,
  initialRoomId,
  onStart,
  onClose,
}: {
  project: ProjectNode
  settings: SimulationSettings
  initialRoomId?: string | null
  onStart: (snapshot: TeamRoomSnapshot) => void
  onClose: () => void
}) {
  const [teamFriends, setTeamFriends] = useState<TeamFriend[]>([])
  const [teamRoom, setTeamRoom] = useState<TeamRoomSnapshot | null>(null)
  const [selectedProfile, setSelectedProfile] = useState<TeamFriend | TeamRoomMember | null>(null)
  const [teamLoading, setTeamLoading] = useState(false)
  const [teamNotice, setTeamNotice] = useState('')
  const previousRoomStatusRef = useRef<string | null>(null)
  const currentTeamMember = teamRoom?.members.find(member => member.mine) ?? null
  const onlineCount = teamFriends.filter(friend => friend.online).length
  const memberSlots = Array.from({ length: 3 }, (_, index) => teamRoom?.members[index] ?? null)
  const waitingMembers = teamRoom?.members.filter(member => !member.mine && !['ready', 'playing'].includes(member.status)) ?? []
  const canStart = Boolean(teamRoom?.room?.mine && waitingMembers.length === 0)

  useEffect(() => {
    void refreshFriends()
    void refreshTeamRoom()
  }, [project.id])

  useEffect(() => {
    if (!teamRoom?.room) return
    const timer = window.setInterval(() => {
      void refreshFriends(false)
      void refreshTeamRoom(false)
    }, 5000)
    return () => window.clearInterval(timer)
  }, [teamRoom?.room?.roomId])

  async function modalFetch<T>(url: string, init?: RequestInit): Promise<T> {
    const token = readTeamAuthToken()
    if (!token) throw new Error('请先登录后再组队')
    const headers = new Headers(init?.headers)
    headers.set('Content-Type', 'application/json')
    headers.set('Authorization', `Bearer ${token}`)
    const response = await fetch(url, { ...init, headers })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = typeof data === 'object' && data && 'error' in data ? String((data as { error?: string }).error) : '请求失败'
      throw new Error(message)
    }
    return data as T
  }

  function modalErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : '组队服务暂时不可用'
  }

  async function refreshFriends(showError = true) {
    try {
      const data = await modalFetch<{ friends: TeamFriend[] }>('/api/team/friends')
      setTeamFriends([...data.friends].sort((left, right) => Number(Boolean(right.online)) - Number(Boolean(left.online))))
    } catch (error) {
      if (showError) setTeamNotice(modalErrorMessage(error))
    }
  }

  async function refreshTeamRoom(showError = true) {
    try {
      const data = await modalFetch<TeamRoomSnapshot>(`/api/team/rooms?projectId=${project.id}`)
      setTeamRoom(data)
      const previousStatus = previousRoomStatusRef.current
      const nextStatus = data.room?.status ?? null
      previousRoomStatusRef.current = nextStatus
      if (previousStatus === 'open' && nextStatus === 'started') onStart(data)
    } catch (error) {
      if (showError) setTeamNotice(modalErrorMessage(error))
    }
  }

  async function updateTeamRoom(action: string, extra: Record<string, unknown> = {}, roomIdOverride?: string) {
    setTeamLoading(true)
    setTeamNotice('')
    try {
      const data = await modalFetch<TeamRoomSnapshot>('/api/team/rooms', {
        method: 'POST',
        body: JSON.stringify({
          action,
          projectId: project.id,
          roomId: action === 'create' ? undefined : roomIdOverride ?? teamRoom?.room?.roomId,
          ...extra,
        }),
      })
      setTeamRoom(data)
      previousRoomStatusRef.current = data.room?.status ?? null
      return data
    } catch (error) {
      setTeamNotice(modalErrorMessage(error))
      return null
    } finally {
      setTeamLoading(false)
    }
  }

  async function createTeamRoom() {
    const data = await updateTeamRoom('create')
    if (data?.room) setTeamNotice('')
  }

  async function inviteFriend(friend: TeamFriend) {
    if (!settings.allowInvites) return
    let snapshot = teamRoom
    if (!snapshot?.room) {
      snapshot = await updateTeamRoom('create')
    }
    if (!snapshot?.room) return
    const data = await updateTeamRoom('invite', { friendId: friend.userId }, snapshot.room.roomId)
    if (data) {
      setTeamNotice('')
    }
  }

  async function toggleReady() {
    if (!teamRoom?.room || !currentTeamMember) return
    await updateTeamRoom(currentTeamMember.status === 'ready' ? 'unready' : 'ready')
  }

  async function startInvestigation() {
    if (!teamRoom?.room) {
      const created = await updateTeamRoom('create')
      if (created) onStart(created)
      return
    }
    if (teamRoom.room.status === 'started') {
      onStart(teamRoom)
      return
    }
    const data = await updateTeamRoom('start')
    if (data) onStart(data)
  }

  function avatarFor(profile: TeamFriend | TeamRoomMember) {
    return profile.avatarUrl
      ? <img src={profile.avatarUrl} alt="" />
      : <span>{profile.displayName.slice(0, 1)}</span>
  }

  function memberStatus(member: TeamRoomMember) {
    if (member.status === 'playing') return '调查中'
    if (member.status === 'ready') return '已准备'
    return '未准备'
  }

  function profileOnline(profile: TeamFriend | TeamRoomMember) {
    if ('online' in profile) return Boolean(profile.online)
    if ('mine' in profile && profile.mine) return true
    return Boolean(teamFriends.find(friend => friend.userId === profile.userId)?.online)
  }

  return (
    <div className={styles.modalScrim} role="presentation" onMouseDown={onClose}>
      <section className={styles.teamReadyModal} role="dialog" aria-modal="true" aria-labelledby="team-ready-title" onMouseDown={event => event.stopPropagation()}>
        <header className={styles.teamInviteHeader}>
          <button type="button" className={styles.teamBackButton} onClick={onClose} aria-label="关闭组队准备"><ArrowLeft size={20} /></button>
          <div>
            <h2 id="team-ready-title">组队准备</h2>
            <span>{project.title}</span>
          </div>
          <div className={styles.teamHeaderStatus}>
            <span><i className={styles.friendOnline} />{onlineCount} 人在线</span>
            <button type="button" disabled={teamLoading} onClick={() => {
              void refreshFriends()
              void refreshTeamRoom()
            }} aria-label="刷新队伍"><Radio size={16} /></button>
          </div>
        </header>

        <div className={styles.teamReadyLayout}>
          <aside className={styles.teamFriendList}>
            <header>
              <strong>好友</strong>
              <span>{onlineCount}/{teamFriends.length}</span>
            </header>
            {teamFriends.length ? teamFriends.map(friend => {
              const joined = teamRoom?.members.some(member => member.userId === friend.userId)
              return (
                <article key={friend.userId} className={`${styles.teamFriendRow} ${friend.online ? styles.teamFriendRowOnline : ''}`}>
                  <button type="button" className={styles.teamFriendIdentity} onClick={() => setSelectedProfile(friend)}>
                    <div className={styles.teamFriendAvatar}>
                      {avatarFor(friend)}
                      <i className={friend.online ? styles.friendOnline : styles.friendOffline} />
                    </div>
                    <span>
                      <strong>{friend.displayName}</strong>
                      <small>{friend.online ? '在线' : '离线'}</small>
                    </span>
                  </button>
                  <button type="button" disabled={teamLoading || joined || !settings.allowInvites || (teamRoom?.members.length ?? 0) >= 3} onClick={() => void inviteFriend(friend)}>
                    {joined ? <Check size={15} /> : <UserPlus size={15} />}
                  </button>
                </article>
              )
            }) : (
              <p className={styles.teamEmptyText}>暂无好友</p>
            )}
          </aside>

          <section className={styles.teamReadyStage}>
            <div className={styles.teamStageHeading}>
              <div>
                <span>{project.missionCode}</span>
                <h3>{project.title}</h3>
              </div>
              <div className={styles.teamCapacity}>
                <UsersRound size={16} />
                <strong>{teamRoom?.members.length ?? 1}</strong>
                <span>/ 3</span>
              </div>
            </div>

            <div className={styles.teamSlots}>
              {memberSlots.map((member, index) => member ? (
                <button
                  type="button"
                  key={member.userId}
                  className={`${styles.teamSlot} ${member.status === 'ready' || member.status === 'playing' ? styles.teamSlotReady : ''}`}
                  onClick={() => setSelectedProfile(teamFriends.find((friend) => friend.userId === member.userId) ?? member)}
                >
                  <div className={styles.teamSlotAvatar}>{avatarFor(member)}</div>
                  <strong>{member.displayName}</strong>
                  <span>{member.mine ? '房主' : memberStatus(member)}</span>
                  {(member.status === 'ready' || member.status === 'playing') && <CheckCircle2 size={18} />}
                </button>
              ) : (
                <div key={`empty-${index}`} className={styles.teamSlotEmpty}>
                  <Plus size={25} />
                  <span>空位</span>
                </div>
              ))}
            </div>

            <div className={styles.teamReadyFooter}>
              {teamNotice && <p className={styles.teamNotice}>{teamNotice}</p>}
              {!teamRoom?.room ? (
                <button type="button" className={styles.teamStartButton} disabled={teamLoading} onClick={() => void createTeamRoom()}>
                  <Plus size={18} />创建队伍
                </button>
              ) : teamRoom.room.mine ? (
                <button type="button" className={styles.teamStartButton} disabled={teamLoading || !canStart} onClick={() => void startInvestigation()}>
                  <Swords size={18} />{teamRoom.room.status === 'started' ? '继续调查' : canStart ? '开始调查' : '等待队友准备'}
                </button>
              ) : teamRoom.room.status === 'started' || currentTeamMember?.status === 'playing' ? (
                <button type="button" className={styles.teamStartButton} disabled={teamLoading} onClick={() => onStart(teamRoom)}>
                  <Swords size={18} />进入调查
                </button>
              ) : (
                <button type="button" className={`${styles.teamStartButton} ${currentTeamMember?.status === 'ready' ? styles.teamReadyButtonActive : ''}`} disabled={teamLoading} onClick={() => void toggleReady()}>
                  <UserCheck size={18} />{currentTeamMember?.status === 'ready' ? '已准备' : '准备'}
                </button>
              )}
            </div>
          </section>
        </div>

        {selectedProfile && (
          <div className={styles.friendProfileScrim} onMouseDown={() => setSelectedProfile(null)}>
            <section className={styles.friendProfileModal} role="dialog" aria-modal="true" aria-label="好友资料" onMouseDown={event => event.stopPropagation()}>
              <button type="button" onClick={() => setSelectedProfile(null)} aria-label="关闭好友资料"><X size={18} /></button>
              <div className={styles.friendProfileAvatar}>{avatarFor(selectedProfile)}</div>
              <div className={styles.friendProfileStatus}>
                <i className={profileOnline(selectedProfile) ? styles.friendOnline : styles.friendOffline} />
                {profileOnline(selectedProfile) ? '在线' : '离线'}
              </div>
              <h3>{selectedProfile.displayName}</h3>
              {selectedProfile.realName && <strong>{selectedProfile.realName}</strong>}
              <dl>
                {'major' in selectedProfile && <div><dt>专业</dt><dd>{selectedProfile.major || '-'}</dd></div>}
                {'className' in selectedProfile && <div><dt>班级</dt><dd>{selectedProfile.className || '-'}</dd></div>}
                {'school' in selectedProfile && <div><dt>学校</dt><dd>{selectedProfile.school || '-'}</dd></div>}
                {'roleName' in selectedProfile && <div><dt>队伍</dt><dd>{selectedProfile.mine ? '房主' : memberStatus(selectedProfile)}</dd></div>}
              </dl>
            </section>
          </div>
        )}
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
  const regularProjects = projects
  const completedProjects = regularProjects.filter(project => project.status === 'cleared')
  const progressPercent = regularProjects.length ? Math.round((completedProjects.length / regularProjects.length) * 100) : 0
  const creditPercent = creditSummary.simulationRequired ? Math.min(100, Math.round((creditSummary.simulationEarned / creditSummary.simulationRequired) * 100)) : 0
  const latestProject = [...completedProjects].reverse()[0]
  const supplyCount = wallet.inventory.skip + wallet.inventory.boost + wallet.inventory.heal + wallet.inventory.hpSupply
  const achievements = [
    { icon: Trophy, title: '首枚奖章', unlocked: trophySummary.total >= 1, detail: trophySummary.total >= 1 ? '已获得项目通关奖章' : '完成任意项目后点亮' },
    { icon: Medal, title: '金牌调查员', unlocked: trophySummary.gold >= 1, detail: trophySummary.gold >= 1 ? `金牌 ${trophySummary.gold} 枚` : '项目总分达到金牌标准' },
    { icon: GraduationCap, title: '课时达标', unlocked: creditPercent >= 100, detail: `${creditSummary.simulationEarned}/${creditSummary.simulationRequired} 实训课时` },
    { icon: Backpack, title: '武器收藏', unlocked: wallet.inventory.weapons.length >= 3, detail: `已收集 ${wallet.inventory.weapons.length} 把武器` },
  ]

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
          <div><GraduationCap size={18} /><span>获得课时分</span><strong>{creditSummary.simulationEarned} / {creditSummary.simulationRequired}</strong><small>{creditPercent}%</small></div>
          <div><Sparkles size={18} /><span>当前 XP</span><strong>{player.xp.toLocaleString()}</strong><small>Lv.{player.rankLevel}</small></div>
          <div><Trophy size={18} /><span>奖章</span><strong>{trophySummary.total}</strong><small>金 {trophySummary.gold} / 银 {trophySummary.silver} / 铜 {trophySummary.bronze}</small></div>
          <div><Backpack size={18} /><span>背包道具</span><strong>{supplyCount}</strong><small>血量 {wallet.inventory.hpSupply} · 跳题 {wallet.inventory.skip} · 增幅 {wallet.inventory.boost} · 应急 {wallet.inventory.heal}</small></div>
        </div>

        <div className={styles.reportAchievements}>
          {achievements.map(item => {
            const AchievementIcon = item.icon
            return (
              <article key={item.title} className={item.unlocked ? styles.achievementUnlocked : styles.achievementLocked}>
                <AchievementIcon size={18} />
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </article>
            )
          })}
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
  projects,
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
  project: ProjectNode
  projects: ProjectNode[]
  carrier: CarrierCase
  onLaunch: () => void
  onLeaderboard: () => void
}) {
  const supplies = wallet.inventory.skip + wallet.inventory.boost + wallet.inventory.heal + wallet.inventory.hpSupply
  const projectBaseXp = project.finalBoss ? FINAL_BOSS_COMPLETION_BASE_XP : PROJECT_COMPLETION_BASE_XP
  const projectMinimumXp = projectBaseXp + PROJECT_MEDAL_BONUS_XP.bronze
  const previewStyle = {
    '--preview-x': project.position.left,
    '--preview-y': project.position.top,
    ...suggestedPreviewPanFor(project),
  } as CSSProperties
  const previewSegments = projects
    .slice(1)
    .map((node, index) => {
      const previous = projects[index]
      const visible = previous.status === 'cleared' || node.status === 'active'
      return {
        from: previous,
        to: node,
        path: routePathBetween(previous, node, index),
        completed: previous.status === 'cleared' && node.status === 'cleared',
        active: previous.status === 'cleared' && node.status === 'active',
        visible,
      }
    })
    .filter(segment => segment.visible)

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
          </div>

          <div className={styles.launchPreview} aria-label="项目地图预览" style={previewStyle}>
            <div className={styles.launchPreviewMap}>
              <Image
                src="/simulation/map-background.webp"
                alt="质量守护远征项目地图预览"
                fill
                sizes="(max-width: 900px) 100vw, 52vw"
                priority
                className={styles.launchImage}
              />
              <svg className={styles.previewRouteMap} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {previewSegments.map(segment => (
                  <g key={`${segment.from.id}-${segment.to.id}`} className={`${styles.previewRouteSegment} ${segment.completed ? styles.previewRouteCompleted : ''} ${segment.active ? styles.previewRouteActive : ''}`}>
                    <path className={styles.previewRouteTrack} d={segment.path} />
                    <path className={styles.previewRouteDash} d={segment.path} />
                  </g>
                ))}
              </svg>
              <div className={styles.previewProjectLayer} aria-hidden="true">
                {projects.filter(node => node.id !== project.id).map(node => (
                  <span
                    key={node.id}
                    className={`${styles.previewProjectNode} ${styles[`previewProject${node.status[0].toUpperCase()}${node.status.slice(1)}`]} ${node.id === project.id ? styles.previewProjectCurrent : ''}`}
                    style={node.position}
                  >
                    {node.status === 'locked' ? <Lock size={13} /> : <Swords size={13} />}
                    <b>{node.id}</b>
                  </span>
                ))}
              </div>
              <div className={styles.launchImageWash} />
              <div className={`${styles.previewNode} ${project.labelSide === 'left' ? styles.previewNodeLeft : ''}`}>
                <span><Target size={18} /></span>
                <div>
                  <small>当前解锁项目</small>
                  <strong>{project.title}</strong>
                </div>
              </div>
            </div>
            <div className={styles.previewBar}>
              <span><Building2 size={15} /> 制药质量远征地图</span>
              <strong>{String(trophySummary.total).padStart(2, '0')} / {PROJECT_MISSIONS.length}</strong>
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
            <div><small>实训课时</small><strong>{creditSummary.simulationEarned} / {creditSummary.simulationRequired}</strong></div>
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
  screen,
  onMap,
  onLevels,
  onTask,
  onLeaderboard,
  onEquipment,
  onSkills,
  onTools,
  onMentor,
  onReport,
}: {
  screen: Screen
  onMap: () => void
  onLevels: () => void
  onTask: () => void
  onLeaderboard: () => void
  onEquipment: () => void
  onSkills: () => void
  onTools: () => void
  onMentor: () => void
  onReport: () => void
}) {
  const entries = [
    { label: '地图', icon: Building2, action: onMap, current: screen === 'map' },
    { label: '关卡', icon: Swords, action: onLevels, current: screen === 'levels' },
    { label: '任务', icon: ClipboardCheck, action: onTask, current: screen === 'briefing' },
    { label: '装备', icon: Backpack, action: onEquipment, current: false },
    { label: '技能树', icon: BrainCircuit, action: onSkills, current: false },
    { label: '工具', icon: Wrench, action: onTools, current: false },
    { label: 'AI导师', icon: Bot, action: onMentor, current: false },
    { label: '学习报告', icon: BookOpen, action: onReport, current: false },
    { label: '排行', icon: Trophy, action: onLeaderboard, current: false },
  ]

  return (
    <nav className={styles.gameRail} aria-label="实训功能导航">
      {entries.map(({ label, icon: Icon, action, current }) => (
        <button
          type="button"
          key={label}
          className={`${styles.railButton} ${current ? styles.railButtonActive : ''}`}
          aria-current={current ? 'page' : undefined}
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
        <span className={styles.topStat}><GraduationCap size={15} />{creditSummary.simulationEarned}/{creditSummary.simulationRequired}</span>
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

function TopActionDock({
  onFriends,
  onTeamLobby,
  onMessages,
  onSettings,
  pendingMessages,
}: {
  onFriends: () => void
  onTeamLobby: () => void
  onMessages: () => void
  onSettings: () => void
  pendingMessages: number
}) {
  return (
    <div className={styles.topActionDock} aria-label="好友、消息和设置">
      <button type="button" onClick={onFriends}>
        <UsersRound size={17} />
        <span>好友</span>
      </button>
      <button type="button" onClick={onTeamLobby}>
        <Radio size={17} />
        <span>房间大厅</span>
      </button>
      <button type="button" onClick={onMessages}>
        <Bell size={17} />
        <span>消息</span>
        {pendingMessages > 0 && <b>{Math.min(9, pendingMessages)}</b>}
      </button>
      <button type="button" onClick={onSettings}>
        <Settings size={17} />
        <span>设置</span>
      </button>
    </div>
  )
}

function TeamInvitationTopBanner({
  invitation,
  busy,
  onView,
  onLater,
}: {
  invitation: TeamInvitation
  busy: boolean
  onView: () => void
  onLater: () => void
}) {
  return (
    <section className={styles.teamInviteTopBanner} aria-label="好友组队邀请">
      <div className={styles.teamInvitationAvatar}>
        {invitation.inviterAvatar
          ? <Image src={invitation.inviterAvatar} alt="" width={38} height={38} unoptimized />
          : invitation.inviterName.slice(0, 1)}
      </div>
      <div>
        <span>组队邀请 · {invitation.missionCode}</span>
        <strong>{invitation.inviterName} 邀请你参加 {invitation.projectTitle}</strong>
      </div>
      <button type="button" disabled={busy} onClick={onLater}>稍后</button>
      <button type="button" disabled={busy} onClick={onView}>查看</button>
    </section>
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

function LevelHub({
  projects,
  testSkipRemaining,
  onEnterProject,
  onSkipProject,
  onMap,
}: {
  projects: ProjectNode[]
  testSkipRemaining?: number
  onEnterProject: (projectId: number) => void
  onSkipProject?: (projectId: number) => void
  onMap: () => void
}) {
  const regularProjects = projects
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
        {testSkipRemaining !== undefined && (
          <span className={styles.testSkipBadge}>
            <Ticket size={14} />跳关 {testSkipRemaining}/{TEST_LEVEL_SKIP_LIMIT}
          </span>
        )}
      </header>
      <div className={styles.levelProgress}>
        <div><strong>{completeCount}</strong><span>已通关</span></div>
        <div><strong>{String(activeCount).padStart(2, '0')}</strong><span>可挑战</span></div>
        <div><strong>{projects.length - completeCount - activeCount}</strong><span>待解锁</span></div>
        <progress value={completeCount} max={projects.length} aria-label="关卡完成进度" />
        <small>{completeCount} / {projects.length} 个关卡完成</small>
      </div>
      <div className={styles.levelGrid}>
        {projects.map(project => {
          const statusLabel = project.status === 'active' ? '可挑战' : project.status === 'cleared' ? '已通关' : '待解锁'
          const playable = project.status !== 'locked'
          const canTestSkip = Boolean(onSkipProject && testSkipRemaining && testSkipRemaining > 0 && !project.finalBoss && project.status !== 'cleared')
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
              <div className={styles.levelCardActions}>
                {playable ? (
                <button type="button" onClick={() => onEnterProject(project.id)}>{project.status === 'cleared' ? '再次挑战' : '进入关卡'} <ChevronRight size={16} /></button>
              ) : (
                <span className={styles.levelCardFoot}>尚未开放</span>
                )}
                {canTestSkip && (
                  <button type="button" className={styles.levelSkipButton} onClick={() => onSkipProject?.(project.id)}>
                    <Ticket size={15} />跳过关卡
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function ResourceDock({ wallet, trophySummary, creditSummary, onSupply, onMissionReward, onMissionTeam, onShop, onTrophies }: { wallet: Wallet; trophySummary: TrophySummary; creditSummary: ReturnType<typeof summarizeCredit>; onSupply: () => void; onMissionReward: () => void; onMissionTeam: () => void; onShop: () => void; onTrophies: () => void }) {
  return (
    <div className={styles.resourceDock} aria-label="远征资源">
      <button type="button" className={styles.mapSupply} onClick={onSupply}><HeartPulse size={17} /><span>补给训练</span></button>
      <button type="button" className={styles.rewardEntry} onClick={onMissionReward}><InfinityIcon size={16} /><span>无尽试炼</span></button>
      <button type="button" className={styles.teamTrialEntry} onClick={onMissionTeam}><UsersRound size={16} /><span>组队试炼</span></button>
      <button type="button" className={styles.shopEntry} onClick={onShop}><ShoppingBag size={16} /><span>道具商店</span></button>
      <span className={styles.resourceCoin}><Coins size={16} />{wallet.coins.toLocaleString()}</span>
      <span className={styles.resourceGem}><Gem size={16} />{wallet.gems.toLocaleString()}</span>
      <button type="button" className={`${styles.resourceKit} ${styles.trophyButton}`} onClick={onTrophies} aria-label="查看奖杯统计"><Trophy size={16} />{trophySummary.total.toLocaleString()}</button>
      <span className={styles.resourceCredit}><GraduationCap size={16} />{creditSummary.simulationEarned}/{creditSummary.simulationRequired}</span>
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

function ProjectMap({
  projects,
  selectedProjectId,
  onSelectProject,
  interactive,
}: {
  projects: ProjectNode[]
  selectedProjectId: number
  onSelectProject: (projectId: number) => void
  interactive: boolean
}) {
  return (
    <section className={styles.projectLayer} aria-label="课程项目地图">
      {projects.map(project => {
        const statusLabel = project.status === 'active' ? '可挑战' : project.status === 'cleared' ? '已通关' : '待解锁'
        const playable = project.status !== 'locked'
        return (
          <button
            type="button"
            key={project.id}
            className={`${styles.projectNode} ${styles[project.status]} ${project.id === selectedProjectId ? styles.projectNodeSelected : ''} ${project.labelSide === 'left' ? styles.labelLeft : ''}`}
            style={project.position}
            disabled={!interactive}
            onClick={() => onSelectProject(project.id)}
            aria-label={`${project.title}，${project.status === 'active' ? '当前可挑战' : project.status === 'cleared' ? '已通关' : '尚未解锁'}，点击在右侧查看`}
            aria-current={project.id === selectedProjectId ? 'step' : undefined}
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
              {interactive && <em>{playable ? '右侧查看 / 操作' : '查看解锁条件'} <ChevronRight size={13} /></em>}
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
  hp,
  educationTrack,
  project,
  projectNode,
  carrier,
  smartMission,
  activeTeamProject,
  activeTeamRoomId,
  teamAllies,
  testSkipRemaining,
  onEnterProject,
  onSkipProject,
  onTeamInvite,
  onProjectDetail,
  onSmartMissionEnter,
}: {
  displayName: string
  realName: string
  avatarUrl: string | null
  player: PlayerState
  hp: number
  educationTrack: EducationTrack
  project: ProjectDefinition
  projectNode: ProjectNode
  carrier: CarrierCase
  smartMission: SmartMissionResponse | null
  activeTeamProject: ProjectNode | null
  activeTeamRoomId: string | null
  teamAllies: string[]
  testSkipRemaining?: number
  onEnterProject: () => void
  onSkipProject?: () => void
  onTeamInvite: () => void
  onProjectDetail: () => void
  onSmartMissionEnter: () => void
}) {
  const canTestSkip = Boolean(onSkipProject && testSkipRemaining && testSkipRemaining > 0 && !projectNode.finalBoss && projectNode.status !== 'cleared')
  const locked = projectNode.status === 'locked'
  const currentProjectHasTeamRoom = Boolean(activeTeamRoomId && activeTeamProject?.id === project.id)
  const teamActionLabel = currentProjectHasTeamRoom ? '进入房间' : '邀请组队'
  const statusText = projectNode.status === 'cleared'
    ? `${medalLabel(projectNode.medal)}已通关`
    : projectNode.status === 'active'
      ? '当前解锁'
      : '待解锁'

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
        <div className={styles.missionCardTop}>
          <div>
            <div className={styles.missionEyebrowRow}>
              <p className={styles.eyebrow}>当前项目 · 项目{project.id}</p>
              <span className={styles.projectStatusBadge}>{statusText}</span>
            </div>
            <h2>{project.title}</h2>
          </div>
          <button type="button" className={styles.detailIconButton} onClick={onProjectDetail} aria-label="查看项目详情">
            <ScrollText size={18} />
            <span>详细</span>
          </button>
        </div>
        <p className={styles.muted}>{carrier.productName} · {carrier.dosageForm} · {project.caseFocus}</p>
        <div className={styles.missionMeta}>
          <span><GraduationCap size={14} /> {trackLabel(educationTrack)}线路</span>
          <span><FileSearch size={14} /> {project.scenes.length} 关调查</span>
        </div>
        <div className={styles.missionActions}>
          <button type="button" className={styles.primaryButton} onClick={onEnterProject}>
            {locked ? '暂未解锁' : '进入调查'} <ChevronRight size={18} />
          </button>
          <button type="button" className={styles.teamButton} onClick={onTeamInvite}><UsersRound size={17} />{teamActionLabel}</button>
          {canTestSkip && (
            <button type="button" className={styles.testSkipButton} onClick={onSkipProject}>
              <Ticket size={16} />跳过本关 <small>{testSkipRemaining}/{TEST_LEVEL_SKIP_LIMIT}</small>
            </button>
          )}
        </div>
      </section>

      {activeTeamRoomId && activeTeamProject && (
        <button type="button" className={styles.teamMapStatusCard} onClick={onTeamInvite}>
          <div>
            <span><Radio size={14} />正在组队</span>
            <strong>{activeTeamProject.title}</strong>
          </div>
          <p>{activeTeamProject.missionCode} · {activeTeamProject.caseFocus}</p>
          <small>{teamAllies.length ? `队友：${teamAllies.join('、')}` : '房间已创建，等待队友进入或继续角色选择'}</small>
          <span className={styles.teamMapStatusAction}>
            <UsersRound size={15} />进入房间
          </span>
        </button>
      )}

      {smartMission && (
        <section className={styles.smartBriefCard} aria-label="AI 远征建议">
          <div className={styles.smartBriefHeader}>
            <span><Sparkles size={15} /> AI 远征建议</span>
            <strong>{smartMission.simulation.missionCode}</strong>
          </div>
          <h2>{smartMission.simulation.projectTitle}</h2>
          <p>{smartMission.simulation.reason}</p>
          <div className={styles.smartBriefEvidence}>
            <span><Target size={14} /> 主攻 {smartMission.primaryFocus}</span>
            <span><ShieldAlert size={14} /> {smartMission.simulation.riskSignal}</span>
            <span><Award size={14} /> {smartMission.simulation.reward}</span>
          </div>
          <button type="button" className={styles.smartBriefButton} onClick={onSmartMissionEnter}>
            执行推荐远征 <ChevronRight size={17} />
          </button>
        </section>
      )}

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

function ProjectDetailModal({
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
  teamInviteLabel,
  onSelectCarrier,
  onDrawAuxiliary,
  onEnterProject,
  onTeamInvite,
  onClose,
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
  teamInviteLabel: string
  onSelectCarrier: (carrierId: string) => void
  onDrawAuxiliary: () => void
  onEnterProject: () => void
  onTeamInvite: () => void
  onClose: () => void
}) {
  const RoleIcon = selectedRole.icon
  const locked = projectNode.status === 'locked'
  const statusLabel = projectNode.status === 'cleared'
    ? `${medalLabel(projectNode.medal)}已通关`
    : projectNode.status === 'active'
      ? '当前解锁'
      : '待解锁'

  return (
    <div className={styles.modalScrim} role="presentation" onMouseDown={onClose}>
      <section className={styles.projectDetailModal} role="dialog" aria-modal="true" aria-labelledby="project-detail-title" onMouseDown={event => event.stopPropagation()}>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="关闭项目详情"><X size={19} /></button>
        <header className={styles.projectDetailHeader}>
          <button type="button" onClick={onClose} aria-label="返回地图项目卡"><ArrowLeft size={18} /></button>
          <div>
            <p className={styles.eyebrow}>项目 {project.id} / 调查详情</p>
            <h2 id="project-detail-title">{project.title}</h2>
          </div>
          <span>{statusLabel}</span>
        </header>

        <div className={styles.projectDetailGrid}>
          <section className={styles.projectDetailHero}>
            <div className={styles.trackBadge}>
              <GraduationCap size={19} />
              <div>
                <small>系统匹配线路 · {major}</small>
                <strong>{trackLabel(educationTrack)} · {assignedRoleLabel(educationTrack)}</strong>
              </div>
            </div>
            <div className={styles.compactBrief}>
              <p className={styles.eyebrow}>{project.curriculum}</p>
              <h2>{project.caseFocus}</h2>
              <p className={styles.lead}>{project.riskSignal}。你需保全证据、访谈多角色，并在 Boss 核验前形成可批准结论。</p>
              <div className={styles.systemCard}>
                <div><FlaskConical size={18} /><strong>20250501 / {selectedCarrier.productName}</strong></div>
                <p>{project.scenes.map(scene => scene.defect).join(' · ')}</p>
                <dl>
                  <div><dt>剂型</dt><dd>{selectedCarrier.dosageForm} / {selectedCarrier.dosageCategory}</dd></div>
                  <div><dt>工艺载体</dt><dd>{selectedCarrier.process}</dd></div>
                  <div><dt>课时规则</dt><dd>常规项目每项 {GAME_PROJECT_BASE_CREDIT} 分；终局基础 {FINAL_BOSS_BASE_CREDIT} 分；奖牌加成上限 {MEDAL_BONUS_CREDIT_TOTAL} 分</dd></div>
                </dl>
              </div>
            </div>
          </section>

          <section className={styles.projectDetailColumn}>
            <div className={styles.carrierPanel}>
              <div className={styles.panelHeader}>
                <div><p className={styles.eyebrow}>{carrierRoute.label}</p><h2>主案例</h2></div>
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
            </div>

            <div className={styles.projectDetailSideGrid}>
              <section className={styles.npcRoster}>
                <div className={styles.panelHeader}>
                  <p className={styles.eyebrow}>多角色调查</p>
                  <h2>关键人物</h2>
                </div>
                <div>
                  {project.npcs.slice(0, 4).map(npc => (
                    <span key={npc.id} className={styles.npcChip}><strong>{npc.name}</strong>{npc.title}</span>
                  ))}
                </div>
              </section>
              <section className={styles.rolePanel}>
                <p className={styles.roleAssignment}><RoleIcon size={17} /><strong>{selectedRole.title}</strong><span>{selectedRole.focus}</span></p>
                <div className={styles.briefingActions}>
                  <button type="button" className={styles.primaryButton} onClick={onEnterProject}>
                    {locked ? '暂未解锁' : '进入调查'} <ArrowRight size={18} />
                  </button>
                  <button type="button" className={styles.teamButton} onClick={onTeamInvite}>
                    <UsersRound size={17} />{teamInviteLabel}
                  </button>
                </div>
              </section>
            </div>
          </section>
        </div>
      </section>
    </div>
  )
}

function BriefingPanel({
  project,
  projectNode,
  projects,
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
  onTeamInvite,
  onBegin,
}: {
  project: ProjectDefinition
  projectNode: ProjectNode
  projects: ProjectNode[]
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
  onTeamInvite: () => void
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
            <div><dt>课时规则</dt><dd>常规项目每项 {GAME_PROJECT_BASE_CREDIT} 分；终局基础 {FINAL_BOSS_BASE_CREDIT} 分；奖牌加成上限 {MEDAL_BONUS_CREDIT_TOTAL} 分</dd></div>
          </dl>
        </div>
      </section>
      <section className={styles.taskMissionList}>
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.eyebrow}>任务总览</p>
            <h2>当前任务与其他项目任务</h2>
          </div>
        </div>
        <div>
          {projects.map(item => (
            <article key={item.id} className={item.id === project.id ? styles.taskMissionCurrent : ''}>
              <span>{item.missionCode}</span>
              <strong>{item.id === project.id ? '当前任务' : `项目 ${item.id}`}</strong>
              <p>{item.title}</p>
              <small>{item.status === 'locked' ? '待解锁' : item.caseFocus}</small>
            </article>
          ))}
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
        <div className={styles.briefingActions}>
          <button type="button" className={styles.primaryButton} onClick={onBegin}>
            开始调查 <ArrowRight size={18} />
          </button>
          <button type="button" className={styles.teamButton} onClick={onTeamInvite}>
            <UsersRound size={17} />组队准备
          </button>
        </div>
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
        <p className={styles.dossierNote}>{project.scenes.length} 个关卡、{questions.length} 项任务。调查得分达到 60 分才能进入 {trackLabel(educationTrack)}终场核验。</p>
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
            <legend>{question.kind === 'single' ? '选择你的剧情行动' : question.kind === 'sequence' ? '按正确顺序点击行动' : '选择所有剧情行动'}</legend>
            {question.options.map(choice => {
              const selectedIndex = answers.indexOf(choice.id)
              const selected = selectedIndex >= 0
              return (
                <button type="button" key={choice.id} className={`${styles.storyChoice} ${selected ? styles.storyChoiceSelected : ''}`} onClick={() => onSelectAnswer(choice.id)} aria-pressed={selected}>
                  <span className={styles.radio}>{selected && (question.kind === 'sequence' ? selectedIndex + 1 : <span />)}</span>
                  <span><strong>{question.kind === 'sequence' ? `步骤 ${choice.id}` : `行动 ${choice.id}`}</strong><small>{choice.label}</small></span>
                </button>
              )
            })}
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
          {question.options.map(option => {
            const selectedIndex = answers.indexOf(option.id)
            const selected = selectedIndex >= 0
            return (
              <button type="button" key={option.id} className={`${styles.commandOption} ${selected ? styles.commandSelected : ''}`} onClick={() => onSelectAnswer(option.id)} aria-pressed={selected}>
                <strong>{question.kind === 'sequence' && selected ? selectedIndex + 1 : option.id}</strong><span>{option.label}</span>
              </button>
            )
          })}
          <button type="button" className={styles.strikeButton} disabled={!answers.length || timedOut} onClick={onSubmit}><Swords size={17} />执行核验</button>
        </div>
      </section>
    </section>
  )
}

function BountyTrialArena({
  wallet,
  displayName,
  playerModelId,
  role,
  carrier,
  educationTrack,
  playerCombatStats,
  playerCurrentHp,
  playerHpCap,
  soundEnabled,
  sfxVolume,
  musicVolume,
  teamRoomId,
  teamRoomOwner,
  teamAllies,
  onHpChange,
  onUseItem,
  onCollectDrop,
  onEndTeamBattle,
  onTeamRoomStopped,
  onBack,
  onComplete,
}: {
  wallet: Wallet
  displayName: string
  playerModelId: PlayerModelId
  role: Role
  carrier: CarrierCase
  educationTrack: EducationTrack
  playerCombatStats: {
    hp?: number
    attack?: number
    mobility?: number
  }
  playerCurrentHp: number
  playerHpCap: number
  soundEnabled: boolean
  sfxVolume: number
  musicVolume: number
  teamRoomId?: string | null
  teamRoomOwner?: boolean
  teamAllies?: string[]
  onHpChange: (hp: number) => void
  onUseItem: (item: ItemId) => boolean
  onCollectDrop: (drop: CombatLootDrop) => void
  onEndTeamBattle?: () => void
  onTeamRoomStopped?: (reason: 'ended' | 'disbanded') => void
  onBack: () => void
  onComplete: (result: BountyTrialResult) => void
}) {
  const finalProject = PROJECT_MISSIONS.find(project => project.id === 11) ?? PROJECT_MISSIONS[PROJECT_MISSIONS.length - 1]
  const bountyProject = useMemo<ProjectDefinition>(() => ({
    ...finalProject,
    title: '悬赏无尽试炼：终局裂隙生存战',
    curriculum: '悬赏训练',
    caseFocus: '无源头裂隙生存战',
    riskSignal: '无源头裂隙持续生成质量异常体，清理本层全部怪物后进入下一层，死亡或撤离后结算奖励。',
    firstAction: '进入无剧情生存战并尽可能推进更多层',
  }), [finalProject])
  const bountyBossQuestions = useMemo(() => buildProjectBossQuestions(finalProject, educationTrack, carrier), [carrier, educationTrack, finalProject])
  const bountyStoryQuestions = useMemo(() => buildProjectStoryQuestions(finalProject, educationTrack, carrier), [carrier, educationTrack, finalProject])
  const [briefingAccepted, setBriefingAccepted] = useState(false)

  function settleEndlessResult(result: BountyTrialResult & { levelsCleared?: number }) {
    const stats: BountyTrialStats = {
      kills: result.kills,
      eliteKills: result.eliteKills,
      wavesCleared: result.wavesCleared ?? result.levelsCleared ?? 0,
    }
    const completedTasks = BOUNTY_TASKS.filter(task => task.progress(stats) >= task.target)
    const taskCoins = completedTasks.reduce((sum, task) => sum + (task.reward.coins ?? 0), 0)
    const taskGems = completedTasks.reduce((sum, task) => sum + (task.reward.gems ?? 0), 0)
    onComplete({
      coins: result.coins + taskCoins,
      gems: result.gems + taskGems,
      kills: result.kills,
      eliteKills: result.eliteKills,
      wavesCleared: stats.wavesCleared,
      taskCompletions: completedTasks.length,
    })
  }

  if (!briefingAccepted) {
    return (
      <section className={styles.bountyBriefingArena} aria-label="悬赏无尽试炼任务明细">
        <Image src="/simulation/backgrounds/Space_Background_02.png" alt="" fill sizes="100vw" priority className={styles.bountyBriefingBackdrop} />
        <div className={styles.bountyBriefingShade} />
        <div className={styles.bountyBriefingShell}>
          <header className={styles.bountyBriefingHeader}>
            <button type="button" className={styles.bountyBack} onClick={onBack}>
              <ArrowLeft size={18} />地图
            </button>
            <div className={styles.bountyBriefingTitle}>
              <span>ENDLESS BOUNTY</span>
              <h2>悬赏任务明细</h2>
              <p>清理每层异常体会累计基础奖励，死亡或撤离后按本场进度结算；悬赏任务达标后额外叠加奖励。</p>
            </div>
            <div className={styles.bountyBriefingWallet} aria-label="当前资源">
              <span><Coins size={16} />{wallet.coins.toLocaleString()}</span>
              <span><Gem size={16} />{wallet.gems.toLocaleString()}</span>
            </div>
          </header>

          <main className={styles.bountyBriefingGrid}>
            <section className={styles.bountyBriefingIntro}>
              <div>
                <span><ShieldCheck size={17} />试炼规则</span>
                <h3>先看悬赏，再进裂隙</h3>
                <p>本场没有固定终点，清完本层全部异常体后进入下一层。普通怪、精英和 Boss 都会给基础金币/钻石，任务奖励在结算时按达成项统一发放。</p>
              </div>
              <div className={styles.bountyBriefingRuleGrid}>
                <article>
                  <Target size={18} />
                  <strong>击杀计数</strong>
                  <small>怪物血量归零并标记击败后才计入结算。</small>
                </article>
                <article>
                  <Trophy size={18} />
                  <strong>任务叠加</strong>
                  <small>满足目标后，额外奖励会加到本场奖励池。</small>
                </article>
                <article>
                  <DoorOpen size={18} />
                  <strong>撤离结算</strong>
                  <small>主动撤离或战败都会按当前累计进度发放。</small>
                </article>
              </div>
            </section>

            <section className={styles.bountyBriefingTasks} aria-label="悬赏任务列表">
              <div className={styles.bountyPanelTitle}>
                <span><ClipboardCheck size={17} />本场悬赏任务</span>
                <strong>{BOUNTY_TASKS.length} 项</strong>
              </div>
              {BOUNTY_TASKS.map(task => (
                <article key={task.id} className={styles.bountyBriefingTaskCard}>
                  <div>
                    <strong>{task.title}</strong>
                    <span>目标 {task.target}</span>
                  </div>
                  <p>{task.description}</p>
                  <small>
                    <Target size={13} />达成后
                    <Coins size={13} />+{task.reward.coins}
                    <Gem size={13} />+{task.reward.gems}
                  </small>
                </article>
              ))}
            </section>
          </main>

          <footer className={styles.bountyBriefingActions}>
            <button type="button" className={styles.bountyBriefingSecondary} onClick={onBack}>
              返回地图
            </button>
            <button type="button" className={styles.bountyBriefingPrimary} onClick={() => setBriefingAccepted(true)}>
              <Swords size={18} />{teamRoomId ? '进入组队试炼' : '开始试炼'}<ChevronRight size={18} />
            </button>
          </footer>
        </div>
      </section>
    )
  }

  return (
    <ThreeProjectGame
      key="bounty-endless-survival"
      project={bountyProject}
      role={role}
      carrier={carrier}
      storyQuestions={bountyStoryQuestions}
      bossQuestions={bountyBossQuestions}
      remainingTime={24 * 60 * 60}
      timedOut={false}
      projectCleared
      playerModelId={playerModelId}
      unlockedPlayerModelIds={wallet.inventory.playerModels}
      playerCombatStats={playerCombatStats}
      playerCurrentHp={playerCurrentHp}
      playerHpCap={playerHpCap}
      displayName={displayName}
      teamRoomId={teamRoomId}
      teamRoomOwner={teamRoomOwner}
      allyNames={teamAllies ?? []}
      soundEnabled
      sfxVolume={sfxVolume}
      musicVolume={musicVolume}
      mapBackgroundUrl="/simulation/backgrounds/Space_Background_02.png"
      endlessSurvival
      endlessMapBackgrounds={BOUNTY_ENDLESS_MAPS}
      itemCounts={{
        skip: wallet.inventory.skip,
        boost: wallet.inventory.boost,
        heal: wallet.inventory.heal,
      }}
      coins={wallet.coins}
      gems={wallet.gems}
      onUseItem={onUseItem}
      onCollectDrop={onCollectDrop}
      onHpChange={onHpChange}
      onEndTeamBattle={onEndTeamBattle}
      onTeamRoomStopped={onTeamRoomStopped}
      onBack={onBack}
      onComplete={result => {
        settleEndlessResult({
          coins: 0,
          gems: 0,
          kills: result.victory ? 1 : 0,
          eliteKills: 0,
          wavesCleared: 0,
          taskCompletions: 0,
        })
      }}
      onEndlessComplete={result => {
        settleEndlessResult({
          coins: result.coins,
          gems: result.gems,
          kills: result.kills,
          eliteKills: result.eliteKills,
          wavesCleared: result.levelsCleared,
          taskCompletions: 0,
        })
      }}
    />
  )
}

function DeprecatedPanelBountyTrialArena({
  wallet,
  displayName,
  playerModelId,
  onBack,
  onComplete,
}: {
  wallet: Wallet
  displayName: string
  playerModelId: PlayerModelId
  onBack: () => void
  onComplete: (result: BountyTrialResult) => void
}) {
  const [level, setLevel] = useState(1)
  const [hp, setHp] = useState(BOUNTY_TRIAL_MAX_HP)
  const [playerX, setPlayerX] = useState(150)
  const [playerLane, setPlayerLane] = useState(1)
  const [enemies, setEnemies] = useState<EndlessBountyEnemy[]>(() => createEndlessBountyLevel(1))
  const [kills, setKills] = useState(0)
  const [eliteKills, setEliteKills] = useState(0)
  const [levelsCleared, setLevelsCleared] = useState(0)
  const [coins, setCoins] = useState(0)
  const [gems, setGems] = useState(0)
  const [completedTasks, setCompletedTasks] = useState<string[]>([])
  const [battleLog, setBattleLog] = useState<string[]>(['无尽试炼已生成新地图：清理本层全部异常后，Boss 会解除封锁。'])
  const [defeated, setDefeated] = useState(false)
  const [settled, setSettled] = useState(false)
  const [hitFlashId, setHitFlashId] = useState('')
  const playerModel = playerModelById(playerModelId)
  const minionsAlive = enemies.filter(enemy => !enemy.boss && enemy.hp > 0)
  const bossAlive = enemies.find(enemy => enemy.boss && enemy.hp > 0) ?? null
  const bossActive = minionsAlive.length === 0
  const activeEnemies = enemies.filter(enemy => enemy.hp > 0 && (!enemy.boss || bossActive))
  const mapUrl = BOUNTY_ENDLESS_MAPS[(level - 1) % BOUNTY_ENDLESS_MAPS.length]
  const cameraX = clampNumber(playerX - 520, 0, BOUNTY_ENDLESS_STAGE_WIDTH - 980)
  const stats = useMemo<BountyTrialStats>(() => ({
    kills,
    eliteKills,
    wavesCleared: levelsCleared,
  }), [eliteKills, kills, levelsCleared])
  const taskViews = BOUNTY_TASKS.map(task => {
    const progress = Math.min(task.target, task.progress(stats))
    return { ...task, progress, done: completedTasks.includes(task.id) }
  })
  const canSettle = coins > 0 || gems > 0 || kills > 0 || levelsCleared > 0

  function pushLog(message: string) {
    setBattleLog(current => [message, ...current].slice(0, 6))
  }

  function finishRun() {
    if (settled) return
    setSettled(true)
    onComplete({
      coins,
      gems,
      kills,
      eliteKills,
      wavesCleared: levelsCleared,
      taskCompletions: completedTasks.length,
    })
  }

  function resolveTaskRewards(nextStats: BountyTrialStats, currentCompleted: string[]) {
    const newlyCompleted = BOUNTY_TASKS.filter(task => !currentCompleted.includes(task.id) && task.progress(nextStats) >= task.target)
    const taskCoins = newlyCompleted.reduce((sum, task) => sum + task.reward.coins, 0)
    const taskGems = newlyCompleted.reduce((sum, task) => sum + task.reward.gems, 0)
    return {
      newlyCompleted,
      taskCoins,
      taskGems,
      nextCompleted: newlyCompleted.length ? [...currentCompleted, ...newlyCompleted.map(task => task.id)] : currentCompleted,
    }
  }

  function applyEnemyPressure(nextEnemies = enemies, nextX = playerX, nextLane = playerLane) {
    if (defeated || settled) return
    const attackers = nextEnemies.filter(enemy => {
      if (enemy.hp <= 0 || (enemy.boss && !bossActive)) return false
      const range = enemy.boss ? 250 : enemy.flying ? 220 : enemy.heavy ? 170 : 145
      const laneMatched = enemy.lane === nextLane || enemy.flying || enemy.boss
      return laneMatched && Math.abs(enemy.x - nextX) <= range
    })
    if (!attackers.length) return
    const damage = attackers.reduce((sum, enemy) => sum + Math.max(2, Math.round(enemy.damage * 0.32)), 0)
    setHp(current => {
      const nextHp = Math.max(0, current - damage)
      if (nextHp <= 0) {
        setDefeated(true)
        pushLog(`被 ${attackers.map(enemy => enemy.name).slice(0, 2).join('、')} 压制，试炼结束。`)
      } else {
        pushLog(`附近异常体反击，损失 ${damage} 点生命。`)
      }
      return nextHp
    })
  }

  function nearestTarget() {
    return activeEnemies
      .map(enemy => ({ enemy, distance: Math.abs(enemy.x - playerX), laneGap: Math.abs(enemy.lane - playerLane) }))
      .filter(item => item.distance <= BOUNTY_ENDLESS_ATTACK_RANGE + (item.enemy.boss ? 70 : 0) && (item.laneGap === 0 || item.enemy.flying || item.enemy.boss))
      .sort((a, b) => a.distance - b.distance)[0]?.enemy ?? null
  }

  function movePlayer(direction: -1 | 1) {
    if (defeated || settled) return
    const nextX = clampNumber(playerX + direction * 180, 110, BOUNTY_ENDLESS_STAGE_WIDTH - 120)
    setPlayerX(nextX)
    applyEnemyPressure(enemies, nextX, playerLane)
  }

  function shiftLane(direction: -1 | 1) {
    if (defeated || settled) return
    const nextLane = clampNumber(playerLane + direction, 0, 2)
    setPlayerLane(nextLane)
    applyEnemyPressure(enemies, playerX, nextLane)
  }

  function attackTarget(heavy = false) {
    if (defeated || settled) return
    const target = nearestTarget()
    if (!target) {
      const nextTarget = activeEnemies.sort((a, b) => Math.abs(a.x - playerX) - Math.abs(b.x - playerX))[0]
      if (nextTarget) {
        const direction = nextTarget.x > playerX ? 1 : -1
        movePlayer(direction)
      } else if (bossAlive && !bossActive) {
        pushLog('Boss 仍被封锁，先清理本层全部小怪。')
      }
      return
    }

    const damage = Math.round((heavy ? 54 : 32) + level * (heavy ? 6 : 4) + randomInt(0, heavy ? 18 : 10))
    const defeatedEnemy: EndlessBountyEnemy | null = target.hp - damage <= 0 ? { ...target, hp: 0 } : null
    const nextEnemies = enemies.map(enemy => {
      if (enemy.id !== target.id) return enemy
      const nextHp = Math.max(0, enemy.hp - damage)
      return { ...enemy, hp: nextHp }
    })
    setEnemies(nextEnemies)
    setHitFlashId(target.id)

    if (!defeatedEnemy) {
      pushLog(`${heavy ? '重击' : '处置'}命中 ${target.name}，造成 ${damage} 点伤害。`)
      applyEnemyPressure(nextEnemies)
      return
    }

    const isElite = defeatedEnemy.boss || defeatedEnemy.templateId === 'elite' || defeatedEnemy.templateId === 'golem'
    const nextKills = kills + 1
    const nextEliteKills = eliteKills + (isElite ? 1 : 0)
    const bossDefeated = defeatedEnemy.boss
    const nextLevelsCleared = levelsCleared + (bossDefeated ? 1 : 0)
    const nextStats: BountyTrialStats = { kills: nextKills, eliteKills: nextEliteKills, wavesCleared: nextLevelsCleared }
    const taskReward = resolveTaskRewards(nextStats, completedTasks)
    const gainedCoins = defeatedEnemy.rewardCoins + taskReward.taskCoins
    const gainedGems = defeatedEnemy.rewardGems + taskReward.taskGems

    setKills(nextKills)
    setEliteKills(nextEliteKills)
    setLevelsCleared(nextLevelsCleared)
    setCoins(current => current + gainedCoins)
    setGems(current => current + gainedGems)
    setCompletedTasks(taskReward.nextCompleted)

    if (bossDefeated) {
      const nextLevel = level + 1
      setLevel(nextLevel)
      setEnemies(createEndlessBountyLevel(nextLevel))
      setPlayerX(150)
      setPlayerLane(1)
      setHp(current => Math.min(BOUNTY_TRIAL_MAX_HP, current + 22))
      pushLog(`击败本层 Boss，结算 +${gainedCoins} 金币、+${gainedGems} 钻石，进入第 ${nextLevel} 层。`)
      return
    }

    const taskText = taskReward.newlyCompleted.length ? `，完成 ${taskReward.newlyCompleted.map(task => task.title).join('、')}` : ''
    pushLog(`击败 ${defeatedEnemy.name}，奖励 +${gainedCoins} 金币、+${gainedGems} 钻石${taskText}。`)
    applyEnemyPressure(nextEnemies)
  }

  return (
    <section className={styles.bountyArena} aria-label="无尽悬赏试炼">
      <Image src={mapUrl} alt="" fill sizes="100vw" priority className={styles.bountyBackdrop} />
      <div className={styles.bountyShade} />
      <header className={styles.bountyHeader}>
        <button type="button" className={styles.bountyBack} onClick={onBack} disabled={settled}>
          <ArrowLeft size={18} />地图
        </button>
        <div className={styles.bountyTitle}>
          <p className={styles.eyebrow}>ENDLESS BOUNTY / RANDOM CHAPTER</p>
          <h2>无尽试炼·随机裂隙层</h2>
          <span>每层随机分布全怪物池，清完小怪后挑战本层 Boss，死亡后结算。</span>
        </div>
        <div className={styles.bountyHeaderStats}>
          <span><Coins size={15} />{wallet.coins.toLocaleString()}</span>
          <span><Gem size={15} />{wallet.gems.toLocaleString()}</span>
          <button type="button" onClick={finishRun} disabled={!canSettle || settled}>
            <DoorOpen size={16} />撤离结算
          </button>
        </div>
      </header>

      <div className={styles.endlessBountyLayout}>
        <aside className={styles.bountyTaskBoard}>
          <div className={styles.bountyPanelTitle}>
            <span><ClipboardCheck size={17} />悬赏任务</span>
            <strong>{completedTasks.length}/{BOUNTY_TASKS.length}</strong>
          </div>
          {taskViews.map(task => (
            <article key={task.id} className={`${styles.bountyTaskCard} ${task.done ? styles.bountyTaskComplete : ''}`}>
              <div><strong>{task.title}</strong><span>{task.progress}/{task.target}</span></div>
              <p>{task.description}</p>
              <progress value={task.progress} max={task.target} />
              <small><Coins size={12} />+{task.reward.coins}<Gem size={12} />+{task.reward.gems}</small>
            </article>
          ))}
        </aside>

        <section className={styles.endlessStageShell}>
          <div className={styles.endlessStageHud}>
            <div><span>第 {level} 层</span><strong>{bossActive ? 'Boss 已解除封锁' : `剩余小怪 ${minionsAlive.length}`}</strong></div>
            <div><b>{kills}</b><span>击败</span><b>{levelsCleared}</b><span>通关层</span></div>
            <div><Coins size={15} />{coins}<Gem size={15} />{gems}</div>
          </div>
          <div className={styles.endlessViewport}>
            <div
              className={styles.endlessWorld}
              style={{
                '--camera-x': `${cameraX}px`,
                '--stage-width': `${BOUNTY_ENDLESS_STAGE_WIDTH}px`,
              } as CSSProperties}
            >
              <div className={styles.endlessFloor} />
              {enemies.map(enemy => {
                const defeatedEnemy = enemy.hp <= 0
                const lockedBoss = enemy.boss && !bossActive && !defeatedEnemy
                const hpPercent = Math.max(0, Math.round((enemy.hp / enemy.maxHp) * 100))
                return (
                  <div
                    key={enemy.id}
                    className={`${styles.endlessEnemy} ${enemy.boss ? styles.endlessBoss : ''} ${enemy.flying ? styles.endlessFlying : ''} ${enemy.heavy ? styles.endlessHeavy : ''} ${defeatedEnemy ? styles.endlessDefeated : ''} ${lockedBoss ? styles.endlessLocked : ''} ${hitFlashId === enemy.id ? styles.endlessHit : ''}`}
                    style={{ '--enemy-x': `${enemy.x}px`, '--enemy-lane': enemy.lane, '--enemy-color': enemy.color } as CSSProperties}
                  >
                    <span>{lockedBoss ? 'LOCK' : enemy.title}</span>
                    <strong>{enemy.name}</strong>
                    <i><em style={{ width: `${hpPercent}%` }} /></i>
                  </div>
                )
              })}
              <div
                className={styles.endlessHero}
                style={{ '--hero-x': `${playerX}px`, '--hero-lane': playerLane } as CSSProperties}
              >
                <i className={styles.equipmentModelSprite} style={playerModelPreviewSpriteStyle(playerModel, 116, 126, 0.82)} />
                <span>{displayName}</span>
              </div>
            </div>
          </div>
          <div className={styles.endlessControls}>
            <button type="button" onClick={() => movePlayer(-1)} disabled={defeated || settled}><ArrowLeft size={17} />后撤</button>
            <button type="button" onClick={() => shiftLane(-1)} disabled={defeated || settled}>上移</button>
            <button type="button" onClick={() => attackTarget(false)} disabled={defeated || settled}><Swords size={17} />处置</button>
            <button type="button" onClick={() => attackTarget(true)} disabled={defeated || settled}><Zap size={17} />重击</button>
            <button type="button" onClick={() => shiftLane(1)} disabled={defeated || settled}>下移</button>
            <button type="button" onClick={() => movePlayer(1)} disabled={defeated || settled}>推进<ArrowRight size={17} /></button>
          </div>
        </section>

        <aside className={styles.bountyRewardPanel}>
          <div className={styles.bountyPanelTitle}><span><HeartPulse size={17} />战斗状态</span></div>
          <div className={styles.endlessVitals}>
            <strong>{hp}/{BOUNTY_TRIAL_MAX_HP}</strong>
            <progress value={hp} max={BOUNTY_TRIAL_MAX_HP} />
            <small>{bossAlive ? `${bossAlive.name} ${bossActive ? '已激活' : '封锁中'}` : '本层 Boss 已清除'}</small>
          </div>
          <div className={styles.bountyRewardGrid}>
            <span><Coins size={19} /><strong>{coins}</strong><small>金币</small></span>
            <span><Gem size={19} /><strong>{gems}</strong><small>钻石</small></span>
          </div>
          <div className={styles.bountyLog}>
            {battleLog.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}
          </div>
        </aside>
      </div>

      {defeated && (
        <div className={styles.bountyResultLayer} role="dialog" aria-modal="true" aria-label="试炼结算">
          <section className={styles.bountyResultCard}>
            <p className={styles.eyebrow}>ENDLESS SETTLEMENT</p>
            <h2>试炼结束，奖励可领取</h2>
            <div className={styles.bountyResultStats}>
              <span><strong>{kills}</strong><small>击败</small></span>
              <span><strong>{eliteKills}</strong><small>精英/Boss</small></span>
              <span><strong>{levelsCleared}</strong><small>通关层</small></span>
            </div>
            <p>本场获得 +{coins} 金币、+{gems} 钻石，奖励会同步到背包和资源栏。</p>
            <button type="button" className={styles.primaryButton} onClick={finishRun} disabled={settled}>
              领取结算 <ChevronRight size={18} />
            </button>
          </section>
        </div>
      )}
    </section>
  )
}

function LegacyBountyTrialArena({
  wallet,
  displayName,
  playerModelId,
  onBack,
  onComplete,
}: {
  wallet: Wallet
  displayName: string
  playerModelId: PlayerModelId
  onBack: () => void
  onComplete: (result: BountyTrialResult) => void
}) {
  const [hp, setHp] = useState(BOUNTY_TRIAL_MAX_HP)
  const [wave, setWave] = useState(1)
  const [kills, setKills] = useState(0)
  const [eliteKills, setEliteKills] = useState(0)
  const [coins, setCoins] = useState(0)
  const [gems, setGems] = useState(0)
  const [enemy, setEnemy] = useState<BountyEnemy>(() => createBountyEnemy(1, 0))
  const [completedTasks, setCompletedTasks] = useState<string[]>([])
  const [battleLog, setBattleLog] = useState<string[]>(['无源头裂隙已开启，悬赏任务开始记录。'])
  const [defeated, setDefeated] = useState(false)
  const [settled, setSettled] = useState(false)
  const playerModel = playerModelById(playerModelId)
  const wavesCleared = Math.max(0, wave - 1)
  const stats = useMemo<BountyTrialStats>(() => ({
    kills,
    eliteKills,
    wavesCleared,
  }), [eliteKills, kills, wavesCleared])
  const taskViews = BOUNTY_TASKS.map(task => {
    const progress = Math.min(task.target, task.progress(stats))
    const done = completedTasks.includes(task.id)
    return { ...task, progress, done }
  })
  const enemyHpPercent = Math.round((enemy.hp / Math.max(1, enemy.maxHp)) * 100)
  const canSettle = coins > 0 || gems > 0 || kills > 0 || completedTasks.length > 0

  function pushLog(message: string) {
    setBattleLog(current => [message, ...current].slice(0, 5))
  }

  function finishRun() {
    if (settled) return
    setSettled(true)
    onComplete({
      coins,
      gems,
      kills,
      eliteKills,
      wavesCleared,
      taskCompletions: completedTasks.length,
    })
  }

  function resolveTaskRewards(nextStats: BountyTrialStats, currentCompleted: string[]) {
    let taskCoins = 0
    let taskGems = 0
    const newlyCompleted = BOUNTY_TASKS.filter(task => !currentCompleted.includes(task.id) && task.progress(nextStats) >= task.target)
    for (const task of newlyCompleted) {
      taskCoins += task.reward.coins
      taskGems += task.reward.gems
    }
    return {
      newlyCompleted,
      taskCoins,
      taskGems,
      nextCompleted: newlyCompleted.length ? [...currentCompleted, ...newlyCompleted.map(task => task.id)] : currentCompleted,
    }
  }

  function markDefeated(message: string) {
    setDefeated(true)
    pushLog(message)
  }

  function attackEnemy() {
    if (defeated || settled) return
    const critical = Math.random() < 0.18
    const damage = randomInt(18, 30) + Math.floor(wave * 1.6) + (critical ? 16 : 0)
    const nextEnemyHp = Math.max(0, enemy.hp - damage)

    if (nextEnemyHp <= 0) {
      const nextKills = kills + 1
      const nextEliteKills = eliteKills + (enemy.kind === 'elite' ? 1 : 0)
      const nextWave = nextKills % BOUNTY_KILLS_PER_WAVE === 0 ? wave + 1 : wave
      const nextStats: BountyTrialStats = {
        kills: nextKills,
        eliteKills: nextEliteKills,
        wavesCleared: Math.max(0, nextWave - 1),
      }
      const taskReward = resolveTaskRewards(nextStats, completedTasks)
      const waveCoins = nextWave > wave ? 95 + nextWave * 14 : 0
      const waveGems = nextWave > wave ? 1 : 0
      const gainedCoins = enemy.rewardCoins + waveCoins + taskReward.taskCoins
      const gainedGems = enemy.rewardGems + waveGems + taskReward.taskGems

      setKills(nextKills)
      setEliteKills(nextEliteKills)
      setWave(nextWave)
      setCoins(current => current + gainedCoins)
      setGems(current => current + gainedGems)
      setCompletedTasks(taskReward.nextCompleted)
      setEnemy(createBountyEnemy(nextWave, nextKills))

      const taskText = taskReward.newlyCompleted.length ? `，完成 ${taskReward.newlyCompleted.map(task => task.title).join('、')}` : ''
      pushLog(`击败 ${enemy.name}，奖励 +${gainedCoins} 金币、+${gainedGems} 钻石${taskText}${nextWave > wave ? `，进入第 ${nextWave} 波` : ''}。`)
      return
    }

    const counterDamage = Math.max(4, enemy.damage + randomInt(-3, 5))
    const nextHp = Math.max(0, hp - counterDamage)
    setEnemy(current => ({ ...current, hp: nextEnemyHp }))
    setHp(nextHp)
    pushLog(`${critical ? '精准打击' : '标准打击'}造成 ${damage} 点伤害，${enemy.name} 反击 ${counterDamage} 点。`)
    if (nextHp <= 0) markDefeated('生命值归零，试炼结束，等待结算本场悬赏。')
  }

  function guardStep() {
    if (defeated || settled) return
    const guarded = Math.random() < 0.72
    const damage = guarded ? randomInt(0, 5) + Math.floor(wave / 3) : Math.max(5, Math.round(enemy.damage * 0.75))
    const nextHp = Math.max(0, hp - damage)
    setHp(nextHp)
    pushLog(guarded ? `格挡成功，仅承受 ${damage} 点伤害。` : `格挡慢了一拍，承受 ${damage} 点伤害。`)
    if (nextHp <= 0) markDefeated('防线被突破，试炼结束，奖励池将按当前进度结算。')
  }

  function recoverStep() {
    if (defeated || settled) return
    const recovery = randomInt(14, 22)
    const counterDamage = Math.max(5, Math.round(enemy.damage * 0.82) + randomInt(-2, 3))
    const nextHp = Math.max(0, Math.min(BOUNTY_TRIAL_MAX_HP, hp + recovery) - counterDamage)
    setHp(nextHp)
    pushLog(`快速整备恢复 ${recovery} 点生命，同时承受 ${counterDamage} 点追击。`)
    if (nextHp <= 0) markDefeated('整备未能撑住最后一击，试炼结束，进入奖励结算。')
  }

  return (
    <section className={styles.bountyArena} aria-label="无尽悬赏试炼">
      <Image src="/simulation/backgrounds/Background_03.png" alt="" fill sizes="100vw" priority className={styles.bountyBackdrop} />
      <div className={styles.bountyShade} />
      <header className={styles.bountyHeader}>
        <button type="button" className={styles.bountyBack} onClick={onBack} disabled={settled}>
          <ArrowLeft size={18} />地图
        </button>
        <div className={styles.bountyTitle}>
          <p className={styles.eyebrow}>BOUNTY TRIAL / SOURCELESS RIFT</p>
          <h2>无源头裂隙·无尽试炼</h2>
          <span>{displayName} 的训练悬赏，死亡后按本场进度结算。</span>
        </div>
        <div className={styles.bountyHeaderStats}>
          <span><Coins size={15} />{wallet.coins.toLocaleString()}</span>
          <span><Gem size={15} />{wallet.gems.toLocaleString()}</span>
          <button type="button" onClick={finishRun} disabled={!canSettle || settled}>
            <DoorOpen size={16} />撤离结算
          </button>
        </div>
      </header>

      <div className={styles.bountyLayout}>
        <aside className={styles.bountyTaskBoard}>
          <div className={styles.bountyPanelTitle}>
            <span><ClipboardCheck size={17} />悬赏任务</span>
            <strong>{completedTasks.length}/{BOUNTY_TASKS.length}</strong>
          </div>
          {taskViews.map(task => (
            <article key={task.id} className={`${styles.bountyTaskCard} ${task.done ? styles.bountyTaskComplete : ''}`}>
              <div>
                <strong>{task.title}</strong>
                <span>{task.progress}/{task.target}</span>
              </div>
              <p>{task.description}</p>
              <progress value={task.progress} max={task.target} />
              <small><Coins size={12} />+{task.reward.coins}<Gem size={12} />+{task.reward.gems}</small>
            </article>
          ))}
        </aside>

        <section className={styles.bountyStage}>
          <div className={styles.bountyStageTop}>
            <div>
              <span>第 {wave} 波</span>
              <strong>无尽异常体持续涌入</strong>
            </div>
            <div className={styles.bountyKillCounter}>
              <b>{kills}</b><span>击败</span>
              <b>{eliteKills}</b><span>精英</span>
            </div>
          </div>

          <div className={styles.bountyCombatRow}>
            <div className={styles.bountyHeroCard}>
              <div className={styles.bountyHeroSprite}>
                <i className={styles.equipmentModelSprite} style={playerModelPreviewSpriteStyle(playerModel, 118, 132, 0.86)} />
              </div>
              <strong>{displayName}</strong>
              <span>生命 {hp}/{BOUNTY_TRIAL_MAX_HP}</span>
              <progress value={hp} max={BOUNTY_TRIAL_MAX_HP} />
            </div>

            <div className={`${styles.bountyEnemyCard} ${enemy.kind === 'elite' ? styles.bountyEnemyElite : ''}`}>
              <div className={styles.bountyEnemyVisual} aria-hidden="true">
                <span />
                <i />
              </div>
              <div className={styles.bountyEnemyInfo}>
                <span>{enemy.kind === 'elite' ? '精英异常' : '普通异常'}</span>
                <h3>{enemy.name}</h3>
                <p>{enemy.tag}</p>
                <div>
                  <small>HP {enemy.hp}/{enemy.maxHp}</small>
                  <small>{enemyHpPercent}%</small>
                </div>
                <progress value={enemy.hp} max={enemy.maxHp} />
              </div>
            </div>
          </div>

          <div className={styles.bountyControls}>
            <button type="button" onClick={attackEnemy} disabled={defeated || settled}>
              <Swords size={18} />
              <strong>打击</strong>
              <span>造成伤害并承受反击</span>
            </button>
            <button type="button" onClick={guardStep} disabled={defeated || settled}>
              <ShieldCheck size={18} />
              <strong>格挡</strong>
              <span>降低本回合伤害</span>
            </button>
            <button type="button" onClick={recoverStep} disabled={defeated || settled}>
              <HeartPulse size={18} />
              <strong>整备</strong>
              <span>恢复生命但仍被追击</span>
            </button>
          </div>
        </section>

        <aside className={styles.bountyRewardPanel}>
          <div className={styles.bountyPanelTitle}>
            <span><Trophy size={17} />本场奖励池</span>
          </div>
          <div className={styles.bountyRewardGrid}>
            <span><Coins size={19} /><strong>{coins}</strong><small>金币</small></span>
            <span><Gem size={19} /><strong>{gems}</strong><small>钻石</small></span>
          </div>
          <div className={styles.bountyLog}>
            {battleLog.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}
          </div>
        </aside>
      </div>

      {defeated && (
        <div className={styles.bountyResultLayer} role="dialog" aria-modal="true" aria-label="试炼结算">
          <section className={styles.bountyResultCard}>
            <p className={styles.eyebrow}>TRIAL SETTLEMENT</p>
            <h2>试炼结束，奖励可领取</h2>
            <div className={styles.bountyResultStats}>
              <span><strong>{kills}</strong><small>击败</small></span>
              <span><strong>{eliteKills}</strong><small>精英</small></span>
              <span><strong>{wavesCleared}</strong><small>完成波次</small></span>
            </div>
            <p>本场获得 +{coins} 金币、+{gems} 钻石，奖励会同步到背包和资源栏。</p>
            <button type="button" className={styles.primaryButton} onClick={finishRun} disabled={settled}>
              领取结算 <ChevronRight size={18} />
            </button>
          </section>
        </div>
      )}
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
          <div><span>课程学习</span><strong>{creditSummary.courseEarned} / {creditSummary.courseRequired}</strong></div>
          <div><span>常规项目</span><strong>{creditSummary.gameEarned} / {creditSummary.gameRequired}</strong></div>
          <div><span>终局基础</span><strong>{creditSummary.finalBossEarned} / {creditSummary.finalBossRequired}</strong></div>
          <div><span>奖牌加成</span><strong>{creditSummary.medalBonusEarned} / {creditSummary.medalBonusRequired}</strong></div>
          <div><span>最终总测</span><strong>0 / {creditSummary.finalCourseTest}</strong></div>
          <div><span>合计</span><strong>{creditSummary.totalEarned} / {creditSummary.totalRequired}</strong></div>
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

function EquipmentModal({
  wallet,
  role,
  educationTrack,
  onClose,
  onSelectModel,
  onShop,
}: {
  wallet: Wallet
  role: Role
  educationTrack: EducationTrack
  onClose: () => void
  onSelectModel: (modelId: PlayerModelId) => void
  onShop: () => void
}) {
  const activeModel = playerModelById(wallet.inventory.playerModelId)
  const RoleIcon = role.icon
  const supplyCount = wallet.inventory.skip + wallet.inventory.boost + wallet.inventory.heal + wallet.inventory.hpSupply
  const activeHeroStats = heroUnlockById(activeModel.id)

  return (
    <div className={styles.modalScrim} role="presentation" onMouseDown={onClose}>
      <section className={styles.equipmentModal} role="dialog" aria-modal="true" aria-labelledby="equipment-title" onMouseDown={event => event.stopPropagation()}>
        <header className={styles.equipmentHeader}>
          <div className={styles.equipmentHeaderTitle}>
            <UserRound size={19} />
            <div>
              <h2 id="equipment-title">实训配置</h2>
              <span>{activeModel.name} · {role.title}</span>
            </div>
          </div>
          <div className={styles.equipmentHeaderBalance}>
            <span><Coins size={15} />{wallet.coins.toLocaleString()}</span>
            <span><Gem size={15} />{wallet.gems.toLocaleString()}</span>
          </div>
          <button type="button" className={styles.equipmentCloseButton} onClick={onClose} aria-label="关闭装备栏"><X size={18} /></button>
        </header>

        <div className={styles.equipmentLayout}>
          <section className={styles.equipmentHero} aria-label="当前实训角色">
            <div className={styles.equipmentCharacter}>
              <div className={styles.equipmentModelBackdrop} />
              <div className={styles.equipmentModelStage}>
                <span className={styles.equipmentModelSprite} style={equipmentHeroPreviewSpriteStyle(activeModel)} />
              </div>
              <div className={styles.equipmentIdentity}>
                <span><RoleIcon size={15} /></span>
                <div>
                  <strong>{activeModel.name}</strong>
                  <small>{activeModel.specialty}</small>
                </div>
                <div className={styles.equipmentStatStrip}>
                  <b>生命 {activeHeroStats.hp}</b>
                  <b>攻击 {activeHeroStats.attack}</b>
                  <b>机动 {activeHeroStats.mobility}</b>
                </div>
              </div>
            </div>

            <div className={styles.equipmentRoleDock}>
              <div className={styles.equipmentRoleDockTitle}>
                <span>模型选择</span>
              </div>
              <div className={styles.equipmentModelOptions}>
                {PLAYER_MODELS.map(model => {
                  const active = model.id === activeModel.id
                  const owned = wallet.inventory.playerModels.includes(model.id)
                  const stats = heroUnlockById(model.id)
                  return (
                    <button
                      type="button"
                      key={model.id}
                      className={`${styles.equipmentModelOption} ${active ? styles.equipmentModelOptionActive : ''} ${!owned ? styles.equipmentModelOptionLocked : ''}`}
                      style={{ '--model-accent': model.accent } as CSSProperties}
                      onClick={() => owned ? onSelectModel(model.id) : onShop()}
                      aria-pressed={active}
                      aria-disabled={!owned}
                    >
                      <span className={styles.equipmentModelThumb}>
                        <i className={styles.equipmentModelSprite} style={playerModelPreviewSpriteStyle(model, 46, 44, 0.38)} />
                      </span>
                      <span>{model.code}</span>
                      <strong>{model.name}</strong>
                      <small>生命 {stats.hp} · 攻击 {stats.attack}</small>
                      <b>{active ? '使用中' : owned ? '选择' : '解锁'}</b>
                    </button>
                  )
                })}
              </div>
            </div>
          </section>

          <section className={styles.equipmentInventory} aria-label="训练补给与配置说明">
            <div className={styles.equipmentSectionTitle}>
              <div><Package size={18} /><strong>训练补给</strong></div>
              <span>{supplyCount} 件</span>
            </div>
            <div className={styles.equipmentSupplyContent}>
              <div className={styles.equipmentSupplyGrid}>
                {EQUIPMENT_TOOLS.map(tool => {
                  const ToolIcon = tool.icon
                  const count = wallet.inventory[tool.id]
                  return (
                    <button
                      type="button"
                      key={tool.id}
                      className={styles.equipmentSupplyCard}
                      onClick={onShop}
                    >
                      <span><ToolIcon size={24} /></span>
                      <div>
                        <small>库存 x{count}</small>
                        <strong>{tool.name}</strong>
                        <p>{tool.effect}</p>
                      </div>
                      <ChevronRight size={16} />
                    </button>
                  )
                })}
              </div>
            </div>
          </section>
        </div>

        <footer className={styles.equipmentFooter}>
          <button type="button" className={styles.secondaryButton} onClick={onShop}><ShoppingBag size={16} />补给中心</button>
          <button type="button" className={styles.primaryButton} onClick={onClose}>确认角色 <Check size={18} /></button>
        </footer>
      </section>
    </div>
  )
}

function ShopModal({
  wallet,
  itemsOnly = false,
  onClose,
  onBuy,
  onBuyHero,
  onClaimMission,
  onFindSupply,
}: {
  wallet: Wallet
  itemsOnly?: boolean
  onClose: () => void
  onBuy: (product: StoreProduct, currency: 'coins' | 'gems') => void
  onBuyHero: (modelId: PlayerModelId, currency: 'coins' | 'gems') => void
  onClaimMission: () => void
  onFindSupply: () => void
}) {
  const hpSupplyProducts = STORE_PRODUCTS.filter(product => product.id === 'hpSupply')
  const battleProducts = STORE_PRODUCTS.filter(product => product.id !== 'hpSupply')
  const renderStoreProducts = (products: StoreProduct[]) => products.map(product => {
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
  })

  return (
    <div className={styles.modalScrim} role="presentation" onMouseDown={onClose}>
      <section className={styles.shopModal} role="dialog" aria-modal="true" aria-labelledby="shop-title" onMouseDown={event => event.stopPropagation()}>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="关闭道具商店"><X size={19} /></button>
        <header className={styles.shopHeader}>
          <div>
            <p className={styles.eyebrow}>远征补给</p>
            <h2 id="shop-title">战术商店</h2>
            <span>{itemsOnly ? '当前只开放道具补给，英雄购买请回到战备仓库。' : '道具可在 Boss 战使用，英雄解锁后可在装备栏切换'}</span>
          </div>
          <div className={styles.shopBalance}><span><Coins size={16} />{wallet.coins.toLocaleString()}</span><span><Gem size={16} />{wallet.gems.toLocaleString()}</span></div>
        </header>
        <div className={styles.shopSectionTitle}><HeartPulse size={17} /><strong>血量补给</strong><span>3D 实战外使用，与 Boss 战应急补给包分开</span></div>
        <div className={styles.storeGrid}>
          {renderStoreProducts(hpSupplyProducts)}
        </div>
        <div className={styles.shopSectionTitle}><Package size={17} /><strong>战斗道具</strong><span>仅在 Boss 战或战斗答题中使用</span></div>
        <div className={styles.storeGrid}>
          {renderStoreProducts(battleProducts)}
        </div>
        {!itemsOnly && (
          <>
            <div className={styles.shopSectionTitle}><Swords size={17} /><strong>英雄解锁</strong><span>按顺序解锁，属性越强价格越高</span></div>
            <div className={styles.roleStoreGrid}>
              {HERO_UNLOCKS.map((loadout, index) => {
                const model = playerModelById(loadout.id)
                const owned = wallet.inventory.playerModels.includes(loadout.id)
                const unlockable = owned || canUnlockPlayerModel(wallet.inventory, loadout.id)
                return (
                  <article
                    key={loadout.id}
                    className={`${styles.roleStoreItem} ${styles.heroStoreItem} ${owned ? styles.roleStoreOwned : ''} ${!unlockable ? styles.heroStoreLocked : ''}`}
                    style={{ '--model-accent': model.accent } as CSSProperties}
                  >
                    <div className={styles.roleStoreAvatar}>
                      <i className={styles.equipmentModelSprite} style={playerModelPreviewSpriteStyle(model, 82, 72, 0.58)} />
                    </div>
                    <div className={styles.roleStoreCopy}>
                      <span>{String(index + 1).padStart(2, '0')} · {loadout.rarity}英雄</span>
                      <h3>{model.name}</h3>
                      <p>{loadout.passive}</p>
                      <small>生命 {loadout.hp} · 攻击 {loadout.attack} · 机动 {loadout.mobility}</small>
                    </div>
                    <div className={styles.storeActions}>
                      {owned ? (
                        <button type="button" disabled><Check size={14} />已解锁</button>
                      ) : !unlockable ? (
                        <button type="button" disabled><Lock size={14} />上一位</button>
                      ) : (
                        <>
                          <button type="button" disabled={wallet.coins < loadout.coinPrice} onClick={() => onBuyHero(loadout.id, 'coins')}><Coins size={14} />{loadout.coinPrice}</button>
                          <button type="button" disabled={wallet.gems < loadout.gemPrice} onClick={() => onBuyHero(loadout.id, 'gems')}><Gem size={14} />{loadout.gemPrice}</button>
                        </>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </>
        )}
        <footer className={styles.currencySource}>
          <div>
            <strong>金币 / 钻石不足？</strong>
          </div>
          {!itemsOnly && <button type="button" onClick={onClaimMission}><Gift size={16} />进入试炼</button>}
          <button type="button" onClick={onFindSupply}><HeartPulse size={16} />前往补给</button>
        </footer>
      </section>
    </div>
  )
}

function SupplyModal({
  wallet,
  currentHp,
  onClaimDaily,
  onUseHpSupply,
  onClose,
}: {
  wallet: Wallet
  currentHp: number
  onClaimDaily: () => void
  onUseHpSupply: () => void
  onClose: () => void
}) {
  const dailyClaimed = wallet.lastDailySupplyDate === getSimulationDateKey()
  const hpSupplyDisabled = wallet.inventory.hpSupply < 1 || currentHp >= SIMULATION_MAX_HP
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
        <button type="button" className={styles.dailySupplyButton} disabled={hpSupplyDisabled} onClick={onUseHpSupply}>
          <HeartPulse size={18} />
          <strong>{currentHp >= SIMULATION_MAX_HP ? '当前血量已满' : '使用血量补给包'}</strong>
          <span>HP {currentHp}/{SIMULATION_MAX_HP}</span>
          <span>库存 x{wallet.inventory.hpSupply}</span>
        </button>
        <div className={styles.supplyOptions}>
          <div><Trophy size={19} /><strong>完成项目</strong><span>+{VICTORY_REWARD.coins} 金币 · +{VICTORY_REWARD.gems} 钻石</span></div>
          <div><ClipboardCheck size={19} /><strong>挑战复盘</strong><span>+{REVIEW_REWARD.coins} 金币</span></div>
          <div><Package size={19} /><strong>补给区分</strong><span>血量补给包用于实战外；应急补给包用于 Boss 战</span></div>
        </div>
        <button type="button" className={styles.primaryButton} onClick={onClose}>返回远征地图</button>
      </section>
    </div>
  )
}
