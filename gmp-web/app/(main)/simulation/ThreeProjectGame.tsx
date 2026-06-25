'use client'

import {
  ArrowLeft,
  Award,
  Backpack,
  Check,
  ClipboardCheck,
  Clock3,
  Coins,
  DoorOpen,
  FileSearch,
  FlaskConical,
  Gem,
  HeartPulse,
  Lock as LockIcon,
  MousePointerClick,
  PackageOpen,
  Pause,
  ScanSearch,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Swords,
  Target,
  UserRound,
  X,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'
import {
  DEFAULT_PLAYER_MODEL_ID,
  PLAYER_MODELS,
  isPlayerModelId,
  playerAnimationStyle,
  playerComboSteps,
  playerModelFitScale,
  playerModelById,
  type PlayerAnimation,
  type PlayerComboStep,
  type PlayerModel,
  type PlayerModelId,
} from './player-models'
import { io, type Socket } from 'socket.io-client'
import styles from './three-project-game.module.css'

type QuestionKind = 'single' | 'multiple' | 'case' | 'sequence'
type EnemyKind = 'defect' | 'boss'
type EliteEnemyForm = 'eliteGoblin1' | 'eliteGoblin2' | 'eliteGoblin3' | 'eliteGolem' | 'oldGolem' | 'oldGuardian'
type EnemyForm = 'virus' | 'defect' | 'glitch' | 'wraith' | 'tank' | 'flying' | 'boss' | EliteEnemyForm
type EnemyAttackStyle = 'melee' | 'ranged'
type ProjectileOwner = 'player' | 'enemy'
type ProjectileHeight = 'high' | 'low'
type ProjectileKind = 'bolt' | 'arrow' | 'fireball' | 'flyingFireball'
type GameItemId = 'skip' | 'boost' | 'heal'
type ShopOpenOptions = { itemsOnly?: boolean }
type MovementMode = 'idle' | 'walk' | 'sprint' | 'roll'
type AttackMode = 'normal' | 'heavy'
type ChapterRoomKind = 'hall' | 'corridor' | 'dungeon'
type BossSpriteId = 'boss1' | 'boss2' | 'boss3' | 'boss4' | 'boss5' | 'boss6' | 'boss7' | 'boss8' | 'boss9' | 'boss10' | 'boss11'
type AttackSignal = {
  mode: AttackMode
  phase: number
  animation: PlayerAnimation
  duration: number
  sequence: number
  triggersHeroEffect?: boolean
  frameStart?: number
  frameCount?: number
}
type WeaponShape = 'unarmed' | 'club' | 'hammer' | 'spear' | 'shield' | 'axe' | 'gun' | 'crossbow'
type EnvironmentKey = 'castle' | 'cleaning' | 'audit' | 'cold' | 'fortress' | 'lab' | 'capa' | 'aseptic' | 'hvac' | 'change' | 'final'
type FloatingTextKind = 'damage' | 'heal' | 'block' | 'miss' | 'shock' | 'radiant' | 'guard' | 'trace' | 'rupture'
type PlayerFeedback = 'hit' | 'heal' | null
type SfxName = 'start' | 'attack' | 'heavy' | 'ranged' | 'enemyRanged' | 'enemyAttack' | 'bossAttack' | 'hit' | 'enemyHit' | 'enemyDeath' | 'quiz' | 'quizSelect' | 'correct' | 'wrong' | 'playerHit' | 'pickup' | 'roll' | 'dodge' | 'item' | 'inventory' | 'projectileBreak' | 'door' | 'entry'
type ActorAnimation = 'idle' | 'run' | 'attack' | 'hurt' | 'death'
type StoryIntroActor = 'lin' | 'li' | 'wang' | 'boss'
type StoryPersonActor = Exclude<StoryIntroActor, 'boss'>
type StorySpeechProvider = 'dashscope' | 'edge' | 'openai' | 'browser'
type StoryActorSide = 'left' | 'right'
type StoryDialogueKind = 'scene' | 'boss'

interface StoryDialogueChoice {
  id: string
  label: string
  line: string
  responses: Array<{
    actor: Exclude<StoryIntroActor, 'boss'>
    line: string
  }>
}

interface StoryIntroLine {
  actor: StoryIntroActor
  speaker: string
  title: string
  line: string
  portrait: string
  portraitPosition: string
  modelId: PlayerModelId
  voice: string
  side: StoryActorSide
  choices?: StoryDialogueChoice[]
}

interface StoryDialogueRound {
  id: string
  projectId: number
  room: ChapterRoomKind
  kind: StoryDialogueKind
  title: string
  lines: StoryIntroLine[]
}

interface StorySpeechOptions {
  provider?: StorySpeechProvider
  voice?: string
  dashScopeVoice?: string
  edgeVoice?: string
  openAiVoice?: string
}

const SFX_ASSETS: Record<SfxName, readonly string[]> = {
  start: ['/simulation/audio/gs-ui-start.ogg'],
  attack: ['/simulation/audio/oga-sci-blade-1.ogg', '/simulation/audio/oga-sci-blade-2.ogg', '/simulation/audio/game-fast-hit-1.ogg'],
  heavy: ['/simulation/audio/game-hammer-1.ogg', '/simulation/audio/game-metal-slam-1.ogg', '/simulation/audio/oga-sci-heavy-core-2.ogg'],
  ranged: ['/simulation/audio/oga-sci-laser-1.ogg', '/simulation/audio/oga-sci-laser-2.ogg', '/simulation/audio/gs-ranged-laser-1.ogg'],
  enemyRanged: ['/simulation/audio/oga-sci-enemy-laser-1.ogg', '/simulation/audio/oga-sci-enemy-laser-2.ogg', '/simulation/audio/gs-enemy-laser-1.ogg'],
  enemyAttack: ['/simulation/audio/game-metal-hit-1.ogg', '/simulation/audio/game-armor-hit-1.ogg', '/simulation/audio/game-fast-hit-2.ogg'],
  bossAttack: ['/simulation/audio/game-boss-thunder-1.ogg', '/simulation/audio/game-metal-collapse-1.ogg', '/simulation/audio/oga-sci-boss-pulse-1.ogg'],
  hit: ['/simulation/audio/game-armor-hit-1.ogg', '/simulation/audio/game-metal-hit-1.ogg'],
  enemyHit: ['/simulation/audio/game-armor-hit-1.ogg', '/simulation/audio/game-metal-hit-2.ogg', '/simulation/audio/game-body-hit-1.ogg'],
  enemyDeath: ['/simulation/audio/game-break-heavy-1.ogg', '/simulation/audio/game-metal-collapse-1.ogg', '/simulation/audio/game-power-down-1.ogg'],
  quiz: ['/simulation/audio/oga-sci-alert-1.ogg', '/simulation/audio/oga-sci-alert-2.ogg', '/simulation/audio/gs-quiz.ogg'],
  quizSelect: ['/simulation/audio/oga-sci-alert-2.ogg', '/simulation/audio/gs-inventory-open.ogg'],
  correct: ['/simulation/audio/gs-correct-1.ogg', '/simulation/audio/gs-correct-2.ogg', '/simulation/audio/oga-sci-alert-1.ogg'],
  wrong: ['/simulation/audio/oga-sci-break-1.ogg', '/simulation/audio/oga-sci-break-2.ogg', '/simulation/audio/gs-wrong-2.ogg'],
  playerHit: ['/simulation/audio/game-body-hit-1.ogg', '/simulation/audio/game-body-hit-2.ogg', '/simulation/audio/gs-player-hit-1.ogg'],
  pickup: ['/simulation/audio/gs-pickup.ogg'],
  roll: ['/simulation/audio/gs-roll-1.ogg', '/simulation/audio/gs-roll-2.ogg'],
  dodge: ['/simulation/audio/gs-dodge-1.ogg', '/simulation/audio/gs-dodge-2.ogg'],
  item: ['/simulation/audio/gs-item-1.ogg', '/simulation/audio/gs-item-2.ogg'],
  inventory: ['/simulation/audio/gs-inventory-open.ogg', '/simulation/audio/gs-inventory-close.ogg'],
  projectileBreak: ['/simulation/audio/game-break-heavy-2.ogg', '/simulation/audio/oga-sci-break-1.ogg', '/simulation/audio/game-metal-ping-1.ogg'],
  door: ['/simulation/audio/gs-door-open-1.ogg', '/simulation/audio/gs-door-open-2.ogg'],
  entry: ['/simulation/audio/gs-entry-step.ogg', '/simulation/audio/gs-entry-ready.ogg'],
}
const ENEMY_ATTACK_SFX_ASSETS: Record<EnemyForm, readonly string[]> = {
  virus: ['/simulation/audio/game-fast-hit-1.ogg', '/simulation/audio/oga-sci-enemy-laser-1.ogg'],
  defect: ['/simulation/audio/game-metal-hit-1.ogg', '/simulation/audio/game-armor-hit-1.ogg'],
  glitch: ['/simulation/audio/oga-sci-enemy-laser-1.ogg', '/simulation/audio/game-metal-ping-1.ogg'],
  wraith: ['/simulation/audio/game-power-down-1.ogg', '/simulation/audio/oga-sci-boss-pulse-2.ogg'],
  tank: ['/simulation/audio/game-hammer-1.ogg', '/simulation/audio/game-metal-slam-1.ogg'],
  flying: ['/simulation/audio/oga-sci-enemy-laser-2.ogg', '/simulation/audio/game-fast-hit-2.ogg'],
  boss: ['/simulation/audio/game-boss-thunder-1.ogg', '/simulation/audio/oga-sci-boss-pulse-1.ogg'],
  eliteGoblin1: ['/simulation/audio/game-metal-hit-3.ogg', '/simulation/audio/oga-sci-blade-1.ogg'],
  eliteGoblin2: ['/simulation/audio/game-metal-ping-2.ogg', '/simulation/audio/oga-sci-enemy-laser-2.ogg'],
  eliteGoblin3: ['/simulation/audio/game-fast-hit-2.ogg', '/simulation/audio/oga-sci-alert-1.ogg'],
  eliteGolem: ['/simulation/audio/game-hammer-2.ogg', '/simulation/audio/oga-sci-heavy-core-2.ogg'],
  oldGolem: ['/simulation/audio/game-metal-slam-1.ogg', '/simulation/audio/oga-sci-boss-pulse-1.ogg'],
  oldGuardian: ['/simulation/audio/game-power-down-1.ogg', '/simulation/audio/oga-sci-boss-pulse-2.ogg'],
}
const ENEMY_DEATH_SFX_ASSETS: Record<EnemyForm, readonly string[]> = {
  virus: ['/simulation/audio/game-break-heavy-2.ogg', '/simulation/audio/oga-sci-break-1.ogg'],
  defect: ['/simulation/audio/game-armor-hit-3.ogg', '/simulation/audio/game-break-heavy-2.ogg'],
  glitch: ['/simulation/audio/game-power-down-1.ogg', '/simulation/audio/oga-sci-break-2.ogg'],
  wraith: ['/simulation/audio/game-power-down-1.ogg', '/simulation/audio/oga-sci-boss-pulse-2.ogg'],
  tank: ['/simulation/audio/game-metal-collapse-1.ogg', '/simulation/audio/game-break-heavy-1.ogg'],
  flying: ['/simulation/audio/game-metal-ping-1.ogg', '/simulation/audio/oga-sci-break-1.ogg'],
  boss: ['/simulation/audio/game-break-heavy-1.ogg', '/simulation/audio/game-metal-collapse-1.ogg'],
  eliteGoblin1: ['/simulation/audio/game-break-heavy-2.ogg', '/simulation/audio/oga-sci-break-1.ogg'],
  eliteGoblin2: ['/simulation/audio/game-power-down-1.ogg', '/simulation/audio/oga-sci-break-2.ogg'],
  eliteGoblin3: ['/simulation/audio/game-metal-ping-2.ogg', '/simulation/audio/game-break-heavy-2.ogg'],
  eliteGolem: ['/simulation/audio/game-metal-collapse-1.ogg', '/simulation/audio/game-break-heavy-1.ogg'],
  oldGolem: ['/simulation/audio/game-metal-collapse-1.ogg', '/simulation/audio/oga-sci-boss-pulse-2.ogg'],
  oldGuardian: ['/simulation/audio/game-power-down-1.ogg', '/simulation/audio/game-break-heavy-1.ogg'],
}
const BOSS_ATTACK_SFX_ASSETS: Record<BossSpriteId, readonly string[]> = {
  boss1: ['/simulation/audio/game-boss-thunder-1.ogg', '/simulation/audio/oga-sci-boss-pulse-1.ogg'],
  boss2: ['/simulation/audio/game-metal-collapse-1.ogg', '/simulation/audio/game-metal-slam-1.ogg'],
  boss3: ['/simulation/audio/game-power-down-1.ogg', '/simulation/audio/oga-sci-boss-pulse-1.ogg'],
  boss4: ['/simulation/audio/oga-sci-enemy-laser-2.ogg', '/simulation/audio/game-fast-hit-2.ogg'],
  boss5: ['/simulation/audio/game-boss-thunder-1.ogg', '/simulation/audio/game-hammer-1.ogg'],
  boss6: ['/simulation/audio/game-power-down-1.ogg', '/simulation/audio/oga-sci-boss-pulse-2.ogg'],
  boss7: ['/simulation/audio/game-metal-hit-3.ogg', '/simulation/audio/oga-sci-heavy-core-1.ogg'],
  boss8: ['/simulation/audio/oga-sci-enemy-laser-2.ogg', '/simulation/audio/game-metal-ping-1.ogg'],
  boss9: ['/simulation/audio/game-power-down-1.ogg', '/simulation/audio/oga-sci-enemy-laser-1.ogg'],
  boss10: ['/simulation/audio/game-metal-collapse-1.ogg', '/simulation/audio/oga-sci-boss-pulse-2.ogg'],
  boss11: ['/simulation/audio/game-boss-thunder-1.ogg', '/simulation/audio/game-metal-collapse-1.ogg', '/simulation/audio/oga-sci-boss-pulse-2.ogg'],
}
const BOSS_DEATH_SFX_ASSETS: Record<BossSpriteId, readonly string[]> = {
  boss1: ['/simulation/audio/game-break-heavy-1.ogg', '/simulation/audio/oga-sci-break-1.ogg'],
  boss2: ['/simulation/audio/game-metal-collapse-1.ogg', '/simulation/audio/game-break-heavy-1.ogg'],
  boss3: ['/simulation/audio/game-power-down-1.ogg', '/simulation/audio/oga-sci-break-2.ogg'],
  boss4: ['/simulation/audio/game-metal-ping-1.ogg', '/simulation/audio/game-break-heavy-2.ogg'],
  boss5: ['/simulation/audio/game-metal-collapse-1.ogg', '/simulation/audio/oga-sci-boss-pulse-1.ogg'],
  boss6: ['/simulation/audio/game-power-down-1.ogg', '/simulation/audio/game-break-heavy-1.ogg'],
  boss7: ['/simulation/audio/game-break-heavy-2.ogg', '/simulation/audio/oga-sci-break-1.ogg'],
  boss8: ['/simulation/audio/game-metal-ping-2.ogg', '/simulation/audio/oga-sci-break-2.ogg'],
  boss9: ['/simulation/audio/game-power-down-1.ogg', '/simulation/audio/oga-sci-boss-pulse-2.ogg'],
  boss10: ['/simulation/audio/game-metal-collapse-1.ogg', '/simulation/audio/oga-sci-heavy-core-2.ogg'],
  boss11: ['/simulation/audio/game-boss-thunder-1.ogg', '/simulation/audio/game-metal-collapse-1.ogg', '/simulation/audio/game-break-heavy-1.ogg'],
}
const BACKGROUND_MUSIC_ASSET = '/simulation/audio/oga-music-fast-fight-looped.ogg'
const CHAPTER_MUSIC_ASSETS: Partial<Record<number, string>> = {
  1: '/simulation/audio/gs-music-chapter-1.ogg',
  2: '/simulation/audio/gs-music-chapter-2.ogg',
  3: '/simulation/audio/gs-music-chapter-3.ogg',
  4: '/simulation/audio/gs-music-chapter-4.ogg',
  5: '/simulation/audio/gs-music-chapter-5.ogg',
  6: '/simulation/audio/gs-music-chapter-6.ogg',
  7: '/simulation/audio/oga-music-pressure.ogg',
  8: '/simulation/audio/oga-music-claimed-by-the-void.ogg',
  9: '/simulation/audio/oga-music-fast-fight-looped.ogg',
  10: '/simulation/audio/training-loop.ogg',
  11: '/simulation/audio/gs-music-default.ogg',
}

function backgroundMusicForProject(projectId: number) {
  return CHAPTER_MUSIC_ASSETS[projectId] ?? BACKGROUND_MUSIC_ASSET
}

interface Choice {
  id: string
  label: string
}

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
}

interface SceneDefect {
  id: string
  number: number
  title: string
  defect: string
  objective: string
}

interface Project2d {
  id: number
  title: string
  curriculum: string
  caseFocus: string
  riskSignal: string
  keyEvidence?: string[]
  bossImage?: string
  bossName: string
  bossTitle: string
  finalBoss?: boolean
  scenes: SceneDefect[]
}

interface Role2d {
  id?: string
  title: string
  focus: string
  battleSkill: string
}

interface Carrier2d {
  productName: string
  dosageForm: string
  process: string
}

interface Game2dCompletion {
  victory: boolean
  correct: number
  total: number
  hp: number
  bossHp: number
  storyScore: number
  projectScore: number
}

interface EndlessSurvivalStats {
  kills: number
  eliteKills: number
  levelsCleared: number
  coins: number
  gems: number
}

interface EndlessSurvivalCompletion extends Game2dCompletion, EndlessSurvivalStats {}

interface CombatLootDrop {
  coins?: number
  gems?: number
  items?: Partial<Record<GameItemId, number>>
}

type HeroHitEffectKind = 'sunder' | 'radiant' | 'guardBreak' | 'trace' | 'fireBurn' | 'storm'
type HeroEffectVisualId = 'knightWave' | 'saintLightning' | 'pixelSlash' | 'blueSpark' | 'blackFire' | 'demonBolt' | 'demonSlash'

interface EnemyHeroEffect {
  kind: HeroHitEffectKind
  visualId: HeroEffectVisualId
  sourceModelId: PlayerModelId
  stacks: number
  until: number
  nextTickAt: number
  pulseUntil?: number
  burstUntil?: number
}

interface EnemyState {
  id: string
  title: string
  defect: string
  objective?: string
  sceneNumber?: number
  chapterTitle?: string
  kind: EnemyKind
  form: EnemyForm
  attackStyle: EnemyAttackStyle
  projectileHeight: ProjectileHeight
  hp: number
  maxHp: number
  x: number
  lane: number
  facing: 1 | -1
  moving: boolean
  quizCharge: number
  quizEvery: number
  hitUntil: number
  windupUntil: number
  attackingUntil: number
  attackSequence: number
  defeated: boolean
  deathUntil: number
  heroEffect?: EnemyHeroEffect
  room?: ChapterRoomKind
  bossSpriteId?: BossSpriteId
  spriteScale?: number
}

interface Weapon {
  id: string
  name: string
  tag: string
  detail: string
  normalDamage: number
  heavyDamage: number
  rangePx: number
  critMultiplier: number
  color: string
  shape: WeaponShape
  ranged?: boolean
}

interface WeaponPickupState {
  weaponId: string
  x: number
  lane: number
  picked: boolean
}

interface FighterState {
  x: number
  lane: number
  facing: 1 | -1
  moving: boolean
  crouching: boolean
  jumpUntil: number
  rollingUntil: number
}

interface RemotePositionSample {
  x: number
  lane: number
  at: number
  seq: number
}

interface RemoteTeamPlayer {
  userId: string
  displayName: string
  modelId: PlayerModelId
  x: number
  targetX?: number
  lane: number
  targetLane?: number
  facing: 1 | -1
  moving: boolean
  attacking: boolean
  attackSequence?: number
  attackPhase?: number
  rollingUntil?: number
  rollDuration?: number
  hp: number
  status: 'playing' | 'answering' | 'downed' | 'reviving' | 'exited'
  activeQuiz?: RemoteActiveQuiz | null
  aiControlled?: boolean
  lastSeenAt?: number
  syncSeq?: number
  seq?: number
  updatedAtMs?: number
  positionSamples?: RemotePositionSample[]
  updatedAt: string
}

interface RemoteActiveQuiz {
  ownerUserId?: string | null
  enemyId: string
  prompt: string
  mode: AttackMode
  damage: number
  targetTitle: string
  question: TrainingQuestion
  x: number
  lane: number
  updatedAt: number
}

interface TeamCombatSelectionMember {
  userId: string
  displayName: string
  avatarUrl?: string | null
  combatRoleId?: string | null
  combatRoleName?: string | null
  roleId?: string | null
  roleName?: string | null
  status: string
  mine: boolean
}

interface TeamRoleCardSummary {
  roleId: string
  name: string
  department: string
  identity: string
  goal: string
  avatarTone?: string
  privateKnowledge?: string[]
  disclosureRules?: string[]
}

interface TeamCombatRoleSummary {
  roleId: PlayerModelId
  name: string
  code: string
  tagline: string
  specialty: string
  accent: string
}

interface TeamLoadoutRoomSnapshot {
  room: { roomId: string; ownerId: string; status: string; mine: boolean } | null
  roleCards: TeamRoleCardSummary[]
  combatRoles: TeamCombatRoleSummary[]
  members: TeamCombatSelectionMember[]
}

function fallbackStoryRoleCards(project: Project2d, role: Role2d): TeamRoleCardSummary[] {
  const sceneGoals = project.scenes.slice(0, 3).map(scene => scene.objective)
  return [
    {
      roleId: 'qa',
      name: '林严谨',
      department: 'QA 质量保证',
      identity: '偏差调查主持人',
      goal: role.focus,
      privateKnowledge: [project.riskSignal],
      disclosureRules: ['先确认事实，再推进判断。'],
    },
    {
      roleId: 'qc',
      name: '李敏',
      department: 'QC 实验室',
      identity: '检测数据与原始记录线索',
      goal: sceneGoals[0] ?? '核对检验记录、审计追踪和异常数据。',
      privateKnowledge: [project.scenes[0]?.defect ?? project.caseFocus],
      disclosureRules: ['只在玩家追问数据完整性时补充细节。'],
    },
    {
      roleId: 'production',
      name: '王瑶',
      department: '生产现场',
      identity: '批记录、设备与人员操作线索',
      goal: sceneGoals[1] ?? '解释现场操作、设备状态与批生产记录。',
      privateKnowledge: [project.scenes[1]?.defect ?? project.caseFocus],
      disclosureRules: ['优先说明现场事实，不直接替玩家下结论。'],
    },
    {
      roleId: 'validation',
      name: '验证负责人',
      department: '验证/工程',
      identity: '验证状态、系统控制与 CAPA 线索',
      goal: sceneGoals[2] ?? '补充验证、设备、系统控制和 CAPA 闭环信息。',
      privateKnowledge: [project.scenes[2]?.defect ?? project.riskSignal],
      disclosureRules: ['将线索导向风险控制和有效性确认。'],
    },
  ]
}

const STORY_ACTOR_PROFILES: Record<StoryPersonActor, Omit<StoryIntroLine, 'line' | 'side' | 'choices'>> = {
  lin: {
    actor: 'lin',
    speaker: '林严谨',
    title: '偏差调查主持人',
    portrait: '/simulation/cinematic/npc-rpg/aurelia-human.png',
    portraitPosition: 'center bottom',
    modelId: 'sprite-hero',
    voice: 'zh-CN-XiaoxiaoNeural',
  },
  li: {
    actor: 'li',
    speaker: '李敏',
    title: '检测数据与原始记录线索',
    portrait: '/simulation/cinematic/npc-rpg/glacia-human.png',
    portraitPosition: 'center bottom',
    modelId: 'knight-hero',
    voice: 'zh-CN-XiaoyiNeural',
  },
  wang: {
    actor: 'wang',
    speaker: '王瑶',
    title: '批记录、设备与人员操作线索',
    portrait: '/simulation/cinematic/npc-rpg/willka-human.png',
    portraitPosition: 'center bottom',
    modelId: 'black-knight',
    voice: 'zh-CN-XiaomoNeural',
  },
}

const STORY_ACTOR_ROLE_IDS: Record<StoryPersonActor, string[]> = {
  lin: ['qa', 'qa_coordinator'],
  li: ['qc', 'qc_analyst'],
  wang: ['production', 'production_lead'],
}

const STORY_TASK_NARRATOR_BY_KIND: Record<StoryTaskKind, StoryPersonActor> = {
  record: 'lin',
  evidence: 'li',
  process: 'wang',
  decision: 'lin',
}

function stripStoryNarrationPrefix(text: string) {
  return text.replace(/^AI旁白：/, '').trim()
}

function storyTaskNarratorActor(task: Pick<ChapterStoryTask, 'kind' | 'narratorActor'>): StoryPersonActor {
  return task.narratorActor ?? STORY_TASK_NARRATOR_BY_KIND[task.kind]
}

function storyTaskNarratorProfile(task: Pick<ChapterStoryTask, 'kind' | 'narratorActor'>) {
  return STORY_ACTOR_PROFILES[storyTaskNarratorActor(task)]
}

interface StorySceneScript {
  title: string
  intro: string
  lin: string
  li: string
  wang: string
  focus: string
  risk: string
}

interface StoryBossScript {
  title: string
  lin: string
  li: string
  wang: string
  boss: string
  focus: string
  risk: string
}

interface ProjectStoryScript {
  hall: StorySceneScript
  corridor: StorySceneScript
  dungeon: StorySceneScript
  boss: StoryBossScript
}

const STORY_SCENE_CONTEXTS: Record<number, Record<ChapterRoomKind, { time: string; place: string; people: string; knowledge: string }>> = {
  1: {
    hall: {
      time: '周一 08:35',
      place: '研发楼三层处方评审室',
      people: '林严谨把处方筛选记录摊在灯下，李敏守着检测趋势图，王瑶刚从中试车间带回设备参数',
      knowledge: 'CQA/CPP 关联评价、QbD 风险识别',
    },
    corridor: {
      time: '周一 10:20',
      place: '中试车间外的参数确认走廊',
      people: '三人沿着贴满批记录的玻璃墙复盘小试到中试的桥接逻辑',
      knowledge: '小试-中试桥接、设计空间和放大风险',
    },
    dungeon: {
      time: '周一 14:10',
      place: '中试放行闸门前',
      people: '林严谨按住签发页，李敏核对 CQA 清单，王瑶等待现场执行指令',
      knowledge: '质量闸门、待确认项闭环和中试放行条件',
    },
  },
  2: {
    hall: {
      time: '周二 07:50',
      place: '多产品共线清洁间',
      people: '换线铃刚响，林严谨、李敏和王瑶站在拆开的混合罐前',
      knowledge: '清洁矩阵、最差条件和目检局限',
    },
    corridor: {
      time: '周二 09:25',
      place: '设备管路取样走廊',
      people: '李敏拿着擦拭模板标点，王瑶指出阀门低点，林严谨记录每个取样理由',
      knowledge: '擦拭/淋洗取样、回收率和方法灵敏度',
    },
    dungeon: {
      time: '周二 13:40',
      place: '清洁验证限度复核台',
      people: '三人围着残留限度计算表，把共线暴露风险逐项压实',
      knowledge: '残留限度、清洁验证批次和周期性再确认',
    },
  },
  3: {
    hall: {
      time: '周三 08:10',
      place: 'MAH 远程审计指挥室',
      people: '视频会议的倒计时亮着，林严谨翻开质量协议，李敏调出偏差台账，王瑶连线受托生产线',
      knowledge: '质量协议、偏差升级义务和持有人责任',
    },
    corridor: {
      time: '周三 10:45',
      place: '远程审计证据墙前',
      people: '三人把访谈截图、批记录和 CAPA 台账贴成一条时间线',
      knowledge: '远程审计证据、CAPA 有效性和记录可追溯',
    },
    dungeon: {
      time: '周三 15:00',
      place: '批放行复核室',
      people: '放行倒计时压在屏幕角落，林严谨要求先把复发偏差讲清楚',
      knowledge: '批放行复核、影响评价和委托边界',
    },
  },
  4: {
    hall: {
      time: '周四 06:40',
      place: '冷链到货暂存区',
      people: '雨水还挂在冷链箱封签上，林严谨叫停入库，李敏读取温度记录仪，王瑶封存装箱图',
      knowledge: '温度偏差、到货隔离和稳定性支持',
    },
    corridor: {
      time: '周四 09:15',
      place: '物流监控走廊',
      people: '三人沿着路线图追踪报警点，承运商的解释被投在大屏上',
      knowledge: '温度曲线、装箱位置和承运商偏差调查',
    },
    dungeon: {
      time: '周四 16:25',
      place: '召回评估会议室',
      people: '市场清单铺满长桌，林严谨要求在天黑前定下风险边界',
      knowledge: '市场风险评估、召回判定和承运商 CAPA',
    },
  },
  5: {
    hall: {
      time: '周五 08:00',
      place: 'eBRS 上线战情室',
      people: '上线按钮已经变亮，林严谨按下暂停，李敏打开审计追踪脚本，王瑶带来现场异常流程',
      knowledge: 'URS、风险评估和上线前验证闸门',
    },
    corridor: {
      time: '周五 11:30',
      place: '权限矩阵测试区',
      people: '三人轮流切换账号，屏幕上每一次越权尝试都留下审计痕迹',
      knowledge: '权限矩阵、电子签名和审计追踪挑战测试',
    },
    dungeon: {
      time: '周五 17:20',
      place: '验证偏差复核室',
      people: '夜班交接前，林严谨要求所有失败路径都要有回归证据',
      knowledge: 'CSV 验证脚本、偏差处理和上线后监控',
    },
  },
  6: {
    hall: {
      time: '周六 08:45',
      place: 'QC 色谱实验室',
      people: 'HPLC 还在低声运转，林严谨封存工作站，李敏导出审计追踪，王瑶守住样品流转柜',
      knowledge: '数据完整性、原始电子数据和审计追踪保全',
    },
    corridor: {
      time: '周六 11:05',
      place: '实验室账号权限走廊',
      people: '三人站在权限白板前，把共用账号、系统时间和重积分记录连成一张网',
      knowledge: '账号权限、系统时间校准和重积分理由',
    },
    dungeon: {
      time: '周六 15:50',
      place: '历史批次复核室',
      people: '窗外天色压暗，林严谨把历史放行清单推到桌中央',
      knowledge: '影响范围扩展、历史批次复核和周期性数据审核',
    },
  },
  7: {
    hall: {
      time: '周日 09:05',
      place: '偏差调查战情室',
      people: '复测合格报告刚被投到墙上，林严谨按住批记录，李敏翻出 OOS 原始图谱，王瑶从总混间带回设备日志',
      knowledge: 'OOS 分阶段调查、复测条件和偏差升级',
    },
    corridor: {
      time: '周日 11:40',
      place: '总混设备日志走廊',
      people: '三人沿着设备报警时间线往前追，物料变更、总混超时和人员交接记录逐一浮出水面',
      knowledge: '根因分析、批次影响评价和同源风险追踪',
    },
    dungeon: {
      time: '周日 16:10',
      place: 'CAPA 有效性复核室',
      people: '林严谨把临时控制、根因和有效性标准排成一列，李敏准备复核数据，王瑶确认现场整改证据',
      knowledge: 'CAPA 闭环、有效性验证和复发预防',
    },
  },
  8: {
    hall: {
      time: '周一 07:30',
      place: '无菌灌装线外缓冲区',
      people: '灌装线即将开机，林严谨要求暂停放行，李敏打开环境趋势，王瑶复核人员干预记录',
      knowledge: '环境监测趋势、A级区警戒线和批次隔离',
    },
    corridor: {
      time: '周一 10:15',
      place: '压差与干预回放走廊',
      people: '三人站在监控回放前，把压差波动、门禁记录和无菌干预逐帧对齐',
      knowledge: '干预确认、压差边界和人员行为记录',
    },
    dungeon: {
      time: '周一 15:35',
      place: '无菌保障复盘室',
      people: '连续灌装批次清单铺开，林严谨要求先定暴露边界，再决定是否继续放行',
      knowledge: '无菌模拟、批次暴露评价和趋势复核',
    },
  },
  9: {
    hall: {
      time: '周二 08:20',
      place: 'HVAC 监控中控室',
      people: '压差曲线在大屏上闪烁，林严谨叫停“传感器偶发”的口头解释，李敏导出报警日志，王瑶核对门禁记录',
      knowledge: '压差趋势、报警升级和洁净级别边界',
    },
    corridor: {
      time: '周二 12:00',
      place: '空调机组检修走廊',
      people: '三人沿着过滤器压差和风量记录往下查，门禁频繁开启的痕迹被重新标出',
      knowledge: '过滤器复核、风量平衡和门禁干扰',
    },
    dungeon: {
      time: '周二 17:10',
      place: '污染控制边界室',
      people: '服务区域图被摊在桌上，林严谨把同系统批次和洁净级别边界一起纳入复核',
      knowledge: '污染控制策略、同系统影响范围和设施 CAPA',
    },
  },
  10: {
    hall: {
      time: '周三 09:10',
      place: '变更控制委员会前厅',
      people: '供应商变更和参数调整同时出现，林严谨暂停试生产，李敏查风险矩阵，王瑶封存现场执行版本',
      knowledge: '变更分级、跨部门评估和实施前批准',
    },
    corridor: {
      time: '周三 13:25',
      place: '技术转移资料走廊',
      people: '三人把物料属性、验证范围和批记录模板并排核对，发现多个文件版本没有同步',
      knowledge: '技术转移、验证范围和文件版本控制',
    },
    dungeon: {
      time: '周三 18:00',
      place: '实施后确认室',
      people: '待放行批次在系统里排队，林严谨要求先完成影响评价和实施后确认，再谈继续执行',
      knowledge: '实施后确认、批次边界和变更 CAPA',
    },
  },
  11: {
    hall: {
      time: '周五 20:30',
      place: '终局王城外门',
      people: '十个项目的卷宗在长桌上依次亮起，林严谨、李敏和王瑶把各章证据封入最终诊断箱',
      knowledge: '全项目证据迁移、质量风险综合判断和课程总测',
    },
    corridor: {
      time: '周五 21:05',
      place: '王城长廊',
      people: '前十章 Boss 的投影逐段苏醒，三人按项目顺序复核每一道曾经暴露的风险',
      knowledge: '跨章节复盘、Boss Rush 复现和综合题阵',
    },
    dungeon: {
      time: '周五 22:00',
      place: '体系终审大厅',
      people: '最终 Boss 站在总测题阵后，林严谨递出结案路径，李敏核对数据证据，王瑶确认现场控制已闭环',
      knowledge: '最终诊断、总测合格和通关徽章',
    },
  },
}

function sceneIntroWithContext(projectId: number, room: ChapterRoomKind, scene: StorySceneScript) {
  const context = STORY_SCENE_CONTEXTS[projectId]?.[room]
  if (!context) return scene.intro
  const sceneObjective = scene.intro
    .replace(/^本项目要/, '')
    .replace(/^第二场要/, '')
    .replace(/^第三场进入/, '')
    .replace(/^第三场先/, '')
    .replace(/^第一场先/, '')
    .replace(/^接下来要/, '')
    .trim()
  const chapterProgress = room === 'hall'
    ? `这一章从「${scene.focus}」开场，第一关先${sceneObjective}`
    : room === 'corridor'
      ? `第一关留下的线索已经指向「${scene.focus}」，第二关要顺着这条线继续追下去：${sceneObjective}`
      : `前两关把证据推到「${scene.focus}」这里，第三关要把影响范围和控制动作收束清楚：${sceneObjective}`
  return `${context.time}，${context.place}。${context.people}。${chapterProgress}别漏掉${context.knowledge}，证据一断，后面的判断就站不住。`
}

function sceneActionLine(room: ChapterRoomKind, scene: StorySceneScript) {
  const roomLabel = STORY_ROOM_LABELS[room]
  if (room === 'dungeon') {
    return `接下来你先清理${roomLabel}里的缺陷怪，再靠近现场线索点完成「${scene.focus}」核查；两项都结束后，最终 Boss 才会露面。`
  }
  return `接下来你先清理${roomLabel}里的缺陷怪，再靠近现场线索点完成「${scene.focus}」核查；把这条证据带稳，通往下一场景的门才会打开。`
}

function bossPreludeLine(projectId: number, focus: string) {
  const context = STORY_SCENE_CONTEXTS[projectId]?.dungeon
  if (!context) return `小怪被清退后，调查组把「${focus}」摆到 Boss 面前。接下来靠近 Boss 触发质询，用证据逐题击破。`
  return `${context.time}，${context.place}。小怪被清退后，${context.people}。现在只剩「${focus}」这道关口，接下来靠近 Boss 触发质询，用证据逐题击破。`
}

const FIRST_SIX_STORY_SCRIPTS: Record<number, ProjectStoryScript> = {
  1: {
    hall: {
      title: '处方立项：把经验判断变成风险清单',
      intro: '本项目要审查处方工艺转移包是否可以进入中试，第一场先确认处方筛选记录、CQA 与 CPP 的关联，不允许只凭研发经验放行。',
      lin: '我们先建立事实边界：哪些质量属性会影响中试，哪些工艺参数还没有设计空间。',
      li: '小试数据能支持部分趋势，但溶出曲线和粒度结果还没有和混合时间形成稳定关联。',
      wang: '中试线可以配合试制，但如果关键参数没锁住，现场只能不断返工补记录。',
      focus: '处方筛选记录',
      risk: '中试前缺少 CQA/CPP 关联评价',
    },
    corridor: {
      title: '参数迷雾：桥接小试与中试',
      intro: '第二场要追查小试和中试桥接方案，判断混合时间、粒度和溶出曲线是否足以支撑放大。',
      lin: '桥接方案必须说明风险怎么被控制，不是把小试结论复制到中试批记录。',
      li: '我会核对趋势图，重点看异常点有没有被解释，不能只挑漂亮数据进报告。',
      wang: '现场需要明确可执行参数，否则操作员只能按经验补救，批间差异会被放大。',
      focus: '小试与中试桥接方案',
      risk: '设计空间不清导致中试风险外溢',
    },
    dungeon: {
      title: '中试闸门：签发前最后复核',
      intro: '第三场进入中试闸门，先清掉阻塞证据链的小怪，再确认评审签发是否具备质量依据。',
      lin: '签发前我要看到风险矩阵、桥接方案和待确认项全部闭环。',
      li: '检测侧会把关键质量属性列成复核点，避免试制后才发现指标解释不一致。',
      wang: '我会让现场只按已批准参数执行，任何临时改动都必须进入偏差记录。',
      focus: '中试放行闸门',
      risk: '评审签发证据不足',
    },
    boss: {
      title: '盲试炼金师：未评估风险的终场质询',
      lin: '小怪已清理，处方转移包的证据链基本成形，现在把未确认参数和放行条件摆到台前。',
      li: '我已把异常趋势、关键质量属性和待补数据分组，能支撑我们追问 Boss 的漏洞。',
      wang: '中试现场已暂停经验式操作，只有通过评审的参数才允许执行。',
      boss: '你们所谓的风险清单，只要少一条关键参数，中试就会变成盲试。来证明你们真的看懂了。',
      focus: 'CQA/CPP 风险矩阵',
      risk: '盲目中试',
    },
  },
  2: {
    hall: {
      title: '换线警报：确认最差条件',
      intro: '本项目要完成共线设备清洁验证，第一场先核对清洁矩阵和最难清洁产品，不能只看目检合格。',
      lin: '先锁定最差条件：产品毒性、溶解性、批量和接触面积都要进矩阵。',
      li: 'QC 会确认限度计算和方法灵敏度，擦拭点如果选错，结果再漂亮也没有意义。',
      wang: '现场清洁记录是完整的，但死角和拆装件确实容易被目检忽略。',
      focus: '清洁矩阵',
      risk: '最难清洁点未覆盖取样',
    },
    corridor: {
      title: '死角取样：把盲区变成证据',
      intro: '第二场要追查擦拭和淋洗取样记录，确认设备死角、清洁剂残留和共线残留是否被覆盖。',
      lin: '取样点不是为了凑数量，而是覆盖最高风险表面。',
      li: '我会复核回收率和检测限，避免方法不够灵敏却宣称合格。',
      wang: '我安排拆装件复查，尤其是阀门、垫圈和管路低点。',
      focus: '擦拭/淋洗取样记录',
      risk: '死角残留未评价',
    },
    dungeon: {
      title: '限度审判：共线风险闭环',
      intro: '第三场进入限度审判，清掉残留怪后确认限度、验证批次和周期性再确认计划。',
      lin: '所有结果要回到患者暴露风险，不能用“看起来干净”替代验证。',
      li: '我会把残留限度、方法验证和样品结果逐项对应。',
      wang: '清洁 SOP 会加上拆装确认和复核签名，不再只靠班组经验。',
      focus: '残留限度计算表',
      risk: '共线高活性产品交叉污染',
    },
    boss: {
      title: '残留影武者：清洁盲点的终场质询',
      lin: '清洁证据链已经覆盖矩阵、取样点和限度，现在只剩 Boss 的盲点。',
      li: '我手里有方法灵敏度和回收率数据，可以证明哪些结果可信。',
      wang: '现场已经补做死角清洁和拆装复核，残留不再躲在记录背面。',
      boss: '目检合格多省事啊。你们非要翻开每个死角，那就看看限度能不能挡住我。',
      focus: '清洁验证闭环',
      risk: '残留盲点',
    },
  },
  3: {
    hall: {
      title: '协议裂缝：锁定委托责任',
      intro: '本项目要审计 MAH 委托生产包，第一场先确认质量协议、偏差升级和持有人复核责任。',
      lin: '受托方可以执行生产，但持有人不能把质量责任外包出去。',
      li: '我会看偏差台账，同类问题复发说明单次整改可能没有触到根因。',
      wang: '委托现场有自己的节奏，但升级时限写不清，批记录沟通会拖慢。',
      focus: '质量协议',
      risk: '同类偏差复发但升级时限不清',
    },
    corridor: {
      title: '远程镜头：审计证据不能断线',
      intro: '第二场要按远程审计清单核对记录、视频、访谈和 CAPA 台账，判断责任边界是否清晰。',
      lin: '远程审计不是看截图，要能追到原始记录和人员解释。',
      li: '偏差关闭日期和复发日期对不上，说明 CAPA 有效性需要重审。',
      wang: '我会追问受托线的换线和批放行沟通，不让问题停在邮件里。',
      focus: '远程审计清单',
      risk: '审计证据碎片化',
    },
    dungeon: {
      title: '批放行线：复核升级义务',
      intro: '第三场进入批放行线，清理阻断记录的小怪后确认关键偏差、升级路径和放行复核机制。',
      lin: '如果质量协议没有升级触发条件，持有人复核就会变成事后补签。',
      li: '我会把偏差台账按复发类型排序，找出需要扩大影响评价的批次。',
      wang: '生产端会补充现场访谈，确认问题是偶发操作还是体系缺口。',
      focus: '受托方偏差/CAPA 台账',
      risk: '持有人复核机制缺失',
    },
    boss: {
      title: '外包迷雾主：责任边界终场质询',
      lin: '我们已经把协议、审计清单和偏差台账连起来，责任边界不再模糊。',
      li: '复发偏差和 CAPA 有效性证据已经归档，Boss 不能再用受托方一句解释带过。',
      wang: '现场沟通路径会写入升级机制，不让批放行卡在灰区。',
      boss: '合同之外全是雾。你们要替持有人找回责任，那就穿过这层委托迷雾。',
      focus: '关键偏差升级机制',
      risk: '责任外包',
    },
  },
  4: {
    hall: {
      title: '到货冻结：隔离冷链批次',
      intro: '本项目要追溯冷链发运温度偏差，第一场先隔离到货批次，不能只看外包装完好。',
      lin: '温度超限已经发生，第一动作是隔离批次并启动影响评估。',
      li: '稳定性数据要和温度曲线一起看，不能凭到货外观判断质量。',
      wang: '仓库会保留到货状态、装箱位置和收货时间线，避免证据被覆盖。',
      focus: '温度记录仪数据',
      risk: '温度超限 4 小时',
    },
    corridor: {
      title: '温度曲线：还原运输暴露',
      intro: '第二场要核对温度记录、发运路线和装箱图，判断超限发生在哪一段、影响哪些箱位。',
      lin: '曲线上的空白和报警响应时间都要解释，否则风险边界说不清。',
      li: '我会比对稳定性支持资料，看这个暴露条件是否超过已验证范围。',
      wang: '承运商的交接记录必须拉出来，不能只听“途中可能短暂异常”。',
      focus: '发运路线与装箱图',
      risk: '暴露箱位不清',
    },
    dungeon: {
      title: '召回判定：市场边界复核',
      intro: '第三场进入召回判定，清理风险小怪后确认同路线批次、承运商资质和市场风险。',
      lin: '如果影响边界无法证明，就要按更保守的市场措施处理。',
      li: '质量数据会支持使用期限和暴露条件判断，但不能替代召回评估。',
      wang: '物流和仓库会补齐承运商纠正措施，后续报警升级也要落到流程里。',
      focus: '稳定性支持资料',
      risk: '市场批次暴露范围不明',
    },
    boss: {
      title: '寒链断脉者：温控失效终场质询',
      lin: '温度曲线、箱位和稳定性资料已经合并，接下来判断是否需要市场动作。',
      li: '支持资料显示哪些条件可以接受，哪些必须扩大评估。',
      wang: '承运商整改和报警升级已经纳入 CAPA，不再让冷链断点沉默。',
      boss: '外包装没坏，何必追到每一分钟？你们越谨慎，我越想让边界继续结冰。',
      focus: '召回评估流程',
      risk: '冷链断点',
    },
  },
  5: {
    hall: {
      title: '上线前夜：冻结系统闸门',
      intro: '本项目要完成 eBRS 上线前验证，第一场先冻结上线闸门，确认 URS、风险评估和验证脚本是否齐全。',
      lin: '电子批记录一旦上线，错误会被系统化放大，先把验证边界说清楚。',
      li: '我会关注审计追踪和电子签名，数据可追溯性不能等上线后再补。',
      wang: '生产端需要明确异常流程，否则操作员遇到偏差会绕开系统。',
      focus: 'URS 与风险评估',
      risk: '上线前挑战测试不足',
    },
    corridor: {
      title: '权限矩阵：挑战关键控制',
      intro: '第二场要测试权限矩阵、审计追踪和异常处理，判断电子记录是否能约束真实业务。',
      lin: '权限必须按岗位职责配置，管理员便利不能凌驾数据完整性。',
      li: '审计追踪要能看见新增、修改和删除理由，否则记录只是电子外壳。',
      wang: '现场会模拟批记录异常，确认系统不会把未完成步骤误放行。',
      focus: '权限/审计追踪测试',
      risk: '权限与异常流程未挑战',
    },
    dungeon: {
      title: '脚本挑战：上线批准前复核',
      intro: '第三场进入脚本挑战，清理系统缺陷怪后确认验证偏差、回归测试和上线后监控。',
      lin: '验证脚本不能只跑成功路径，失败路径才暴露控制是否有效。',
      li: '我会核对偏差记录是否有根因和回归测试，不接受“已重跑通过”就关闭。',
      wang: '上线培训和现场应急流程会同步完成，确保人和系统都准备好。',
      focus: '验证脚本和偏差记录',
      risk: '验证批准依据不足',
    },
    boss: {
      title: '未验证主机：电子记录终场质询',
      lin: 'URS、权限矩阵、脚本挑战和偏差回归都已连上，系统可以接受终场质询。',
      li: '审计追踪和电子签名证据已经导出，任何空白都会被看见。',
      wang: '现场不会绕系统操作，异常处理路径已经写入培训。',
      boss: '上线按钮就在眼前，谁会在意失败路径？你们要拦我，就拿验证证据说话。',
      focus: 'CSV 验证批准',
      risk: '未验证上线',
    },
  },
  6: {
    hall: {
      title: '静默序列：保全原始电子数据',
      intro: '本项目要追踪实验室数据完整性，第一场先保全 HPLC 原始序列和审计追踪，不能只打印最终合格图谱。',
      lin: '数据完整性调查先保全原始电子数据，任何导出都要可追溯。',
      li: '审计追踪有空窗期，重积分理由也不完整，我需要先锁定原始序列。',
      wang: '现场会配合封存样品和仪器状态，避免后续复核时证据被改动。',
      focus: '审计追踪导出',
      risk: 'HPLC 审计追踪存在空窗期',
    },
    corridor: {
      title: '账号裂痕：复核权限和时间线',
      intro: '第二场要核对共用账号、系统时间和重积分记录，判断数据是否可靠。',
      lin: '账号权限如果说不清，任何检测结果都要回到人员和时间线复核。',
      li: '我会逐条看重积分理由，确认每次修改是否有科学依据。',
      wang: '现场样品流转和复测记录会一起查，避免只盯着系统界面。',
      focus: '账号权限矩阵',
      risk: '共用账号与时间校准叠加',
    },
    dungeon: {
      title: '重积分室：扩展历史批次',
      intro: '第三场进入重积分室，清理数据怪后判断同仪器历史放行批次是否需要复核。',
      lin: '影响范围不能只看当前批次，同仪器、同方法、同账号都要纳入边界。',
      li: '我会把原始序列、积分参数和最终报告逐一对应，找出被改写的痕迹。',
      wang: '仓库和生产会配合隔离可能受影响批次，直到数据可靠性结论出来。',
      focus: '原始序列和重积分记录',
      risk: '历史放行批次可能受影响',
    },
    boss: {
      title: '删迹主控：数据完整性终场质询',
      lin: '原始数据、权限矩阵和历史批次边界已经保全，现在轮到 Boss 解释空窗期。',
      li: '我手里有每条重积分记录的前后差异，最终图谱不能再遮住原始事实。',
      wang: '现场批次已经按风险隔离，调查结论出来前不会继续放行。',
      boss: '最终结果合格，不就够了吗？你们非要翻审计追踪，那就看看谁能守住原始数据。',
      focus: '数据可靠性专项调查',
      risk: '删改痕迹',
    },
  },
}

function roleCardForActor(roles: TeamRoleCardSummary[], actor: Exclude<StoryIntroActor, 'boss'>) {
  const ids = STORY_ACTOR_ROLE_IDS[actor]
  return roles.find(role => ids.includes(role.roleId)) ?? null
}

function storyActorForRoleId(roleId?: string | null): Exclude<StoryIntroActor, 'boss'> | null {
  if (!roleId) return null
  const entry = (Object.entries(STORY_ACTOR_ROLE_IDS) as Array<[Exclude<StoryIntroActor, 'boss'>, string[]]>)
    .find(([, ids]) => ids.includes(roleId))
  return entry?.[0] ?? null
}

function storyActorProfile(actor: Exclude<StoryIntroActor, 'boss'>, roles: TeamRoleCardSummary[]) {
  const base = STORY_ACTOR_PROFILES[actor]
  const roleCard = roleCardForActor(roles, actor)
  return {
    ...base,
    speaker: roleCard?.name ?? base.speaker,
    title: roleCard?.identity ?? base.title,
  }
}

function storyPersonLine(
  actor: Exclude<StoryIntroActor, 'boss'>,
  line: string,
  side: StoryActorSide,
  roles: TeamRoleCardSummary[],
  choices?: StoryDialogueChoice[],
): StoryIntroLine {
  return {
    ...storyActorProfile(actor, roles),
    line,
    side,
    choices,
  }
}

function storyBossLine(project: Project2d, line: string): StoryIntroLine {
  return {
    actor: 'boss',
    speaker: project.bossName,
    title: project.bossTitle,
    portrait: project.bossImage ?? '/simulation/boss-qa.webp',
    portraitPosition: 'center bottom',
    modelId: 'demon-warrior',
    voice: 'zh-CN-YunjianNeural',
    line,
    side: 'right',
  }
}

function alternateStoryActor(actor: Exclude<StoryIntroActor, 'boss'>, index = 0): Exclude<StoryIntroActor, 'boss'> {
  const order: Array<Exclude<StoryIntroActor, 'boss'>> = actor === 'lin'
    ? ['li', 'wang']
    : actor === 'li'
      ? ['lin', 'wang']
      : ['lin', 'li']
  return order[index % order.length]
}

type StoryChoiceRoundKey = ChapterRoomKind | 'boss'

interface StoryChoiceRoundPreset {
  primary: string
  check: string
  boundary: string
  stop: string
  evidence: string
  escalation: string
}

interface StoryChoiceTemplate {
  id: string
  label: string
  line: string
  responses: string[]
}

const STORY_CHOICE_ROUND_PRESETS: Record<number, Partial<Record<StoryChoiceRoundKey, StoryChoiceRoundPreset>>> = {
  1: {
    hall: { primary: 'CQA/CPP 关联', check: '处方筛选原始记录', boundary: '设计空间空白', stop: '暂缓中试签发', evidence: '溶出曲线、粒度与混合时间趋势', escalation: '中试前风险评估' },
    corridor: { primary: '放大桥接', check: '小试-中试桥接记录', boundary: '放大参数差异', stop: '设定参数闸门', evidence: '混合时间和设备转速对照', escalation: '桥接方案复核' },
    dungeon: { primary: '质量闸门', check: '中试放行清单', boundary: '待确认项遗漏', stop: '限制中试放行', evidence: 'CQA/CPP 缺口表', escalation: '放行前质量评审' },
    boss: { primary: 'CQA 证据链', check: '风险评估报告', boundary: '处方放行边界', stop: '用设计空间反击', evidence: '中试批记录和趋势图', escalation: '盲试风险质询' },
  },
  2: {
    hall: { primary: '清洁矩阵', check: '产品共线矩阵', boundary: '最差条件漏评', stop: '冻结换线清场', evidence: '毒性、溶解度和批量对照', escalation: '清洁验证再评估' },
    corridor: { primary: '死角取样', check: '擦拭/淋洗点位图', boundary: '管路低点遗漏', stop: '增补取样点', evidence: '回收率和方法灵敏度', escalation: '取样方案复核' },
    dungeon: { primary: '残留限度', check: 'MACO/PDE 计算表', boundary: '共线暴露低估', stop: '暂停共线生产', evidence: '残留趋势和目检记录', escalation: '周期性再确认' },
    boss: { primary: '清洁验证证据', check: '残留限度依据', boundary: '清洁盲点边界', stop: '用最差条件反击', evidence: '取样回收率和残留趋势', escalation: '清洁验证终审' },
  },
  3: {
    hall: { primary: '质量协议', check: 'MAH 与受托方职责表', boundary: '偏差升级缺口', stop: '暂缓远程放行', evidence: '协议条款和偏差台账', escalation: '委托责任复核' },
    corridor: { primary: '远程审计证据', check: '访谈截图、批记录和 CAPA 台账', boundary: '证据链断点', stop: '追加访谈取证', evidence: '记录时间线和审计清单', escalation: '远程审计复核' },
    dungeon: { primary: '批放行链路', check: '放行复核记录', boundary: '复发偏差低估', stop: '暂停批放行', evidence: '受托方偏差/CAPA 台账', escalation: '放行影响评估' },
    boss: { primary: 'MAH 责任边界', check: '质量协议与批放行记录', boundary: '受托方解释空白', stop: '用 CAPA 有效性反击', evidence: '复发偏差和审计证据', escalation: '委托管理终审' },
  },
  4: {
    hall: { primary: '到货隔离', check: '温度记录仪原始曲线', boundary: '装箱位置偏差', stop: '冻结入库', evidence: '封签照片和报警时间', escalation: '冷链偏差初评' },
    corridor: { primary: '运输暴露还原', check: '物流路线和报警节点', boundary: '承运商记录缺口', stop: '扩展运输批次', evidence: '温度曲线与装箱图', escalation: '承运商调查复核' },
    dungeon: { primary: '召回边界', check: '市场流向清单', boundary: '稳定性支持不足', stop: '启动召回评估', evidence: '暴露批次和留样结果', escalation: '冷链 CAPA' },
    boss: { primary: '温度偏差证据', check: '冷链曲线和市场清单', boundary: '承运商 CAPA 漏洞', stop: '用稳定性依据反击', evidence: '召回判定记录', escalation: '冷链终审' },
  },
  5: {
    hall: { primary: '上线验证闸门', check: 'URS 和验证主计划', boundary: '未验证流程上线', stop: '冻结 eBRS 上线', evidence: '需求追踪矩阵', escalation: 'CSV 风险评估' },
    corridor: { primary: '权限矩阵挑战', check: '账号权限和电子签名脚本', boundary: '越权操作路径', stop: '关闭高危权限', evidence: '审计追踪和签名记录', escalation: '挑战测试复核' },
    dungeon: { primary: '验证偏差闭环', check: '失败脚本和回归证据', boundary: '上线批准缺口', stop: '暂缓上线批准', evidence: '偏差处理和再测试记录', escalation: '上线后监控' },
    boss: { primary: '电子记录控制', check: 'URS-脚本-结果追踪链', boundary: '验证偏差残留', stop: '用审计追踪反击', evidence: '权限矩阵和回归脚本', escalation: 'CSV 终审' },
  },
  6: {
    hall: { primary: '原始电子数据', check: 'HPLC 工作站序列', boundary: '数据删除风险', stop: '封存工作站', evidence: '审计追踪导出包', escalation: '数据完整性初评' },
    corridor: { primary: '账号与系统时间', check: '权限清单和时间校准记录', boundary: '共用账号缺口', stop: '暂停可疑账号', evidence: '重积分理由和电子签名', escalation: '实验室权限复核' },
    dungeon: { primary: '历史批次扩展', check: '放行批次清单', boundary: '影响范围不足', stop: '扩大历史复核', evidence: '审计追踪趋势和样品链', escalation: '周期性数据审核' },
    boss: { primary: 'ALCOA+ 证据链', check: '原始数据和审计追踪', boundary: '删改记录空白', stop: '用数据完整性反击', evidence: '重积分理由和历史批次', escalation: 'DI 终审' },
  },
  7: {
    hall: { primary: 'OOS 根因假设', check: '实验室调查记录', boundary: '根因证据不足', stop: '暂缓关闭偏差', evidence: '五问法和鱼骨图记录', escalation: '根因分析复核' },
    corridor: { primary: '物料变更线', check: '供应商变更和检验属性', boundary: '批次影响边界', stop: '扩展物料追踪', evidence: '供应商审批和使用批次', escalation: '影响范围评估' },
    dungeon: { primary: 'CAPA 有效性', check: 'CAPA 跟踪表', boundary: '预防措施空泛', stop: '延后关闭 CAPA', evidence: '后续批次趋势和复发记录', escalation: '有效性验证' },
    boss: { primary: '闭环证据', check: '根因-影响-CAPA 链路', boundary: '无效 CAPA 残留', stop: '用趋势复核反击', evidence: '复发记录和验证节点', escalation: 'CAPA 终审' },
  },
  8: {
    hall: { primary: '无菌屏障', check: '干预记录和环境监测', boundary: '屏障暴露风险', stop: '暂停灌装放行', evidence: '门禁、压差和监控回放', escalation: '无菌偏差初评' },
    corridor: { primary: '干预轨迹', check: '无菌操作视频和人员路线', boundary: '人员行为缺口', stop: '增补无菌复核', evidence: '培训记录和模拟灌装结果', escalation: '干预影响评估' },
    dungeon: { primary: '批次暴露评价', check: '环境趋势和培养结果', boundary: '污染控制边界', stop: '启动批次隔离', evidence: '无菌模拟和 EM 趋势', escalation: '无菌保障复盘' },
    boss: { primary: '无菌保障证据', check: '屏障记录和环境趋势', boundary: '微粒暴露盲点', stop: '用无菌模拟反击', evidence: '干预记录和批次评价', escalation: '无菌终审' },
  },
  9: {
    hall: { primary: '压差报警', check: 'HVAC 趋势曲线', boundary: '房间边界错判', stop: '冻结跨区转运', evidence: '压差、风量和过滤器记录', escalation: '设施偏差初评' },
    corridor: { primary: '气流路径', check: '门禁和压差联动记录', boundary: '相邻房间影响', stop: '扩展设施范围', evidence: '烟雾测试和监控趋势', escalation: 'HVAC 调查复核' },
    dungeon: { primary: '污染控制策略', check: '同系统房间清单', boundary: 'CAPA 范围不足', stop: '暂停高风险操作', evidence: '过滤器更换和再确认记录', escalation: '设施 CAPA' },
    boss: { primary: 'HVAC 边界证据', check: '压差趋势和房间级别', boundary: '逆压暴露盲点', stop: '用气流证据反击', evidence: '烟雾测试和趋势报告', escalation: 'HVAC 终审' },
  },
  10: {
    hall: { primary: '变更分级', check: '变更申请和风险矩阵', boundary: '未批准实施风险', stop: '暂停试生产', evidence: '供应商变更和参数调整记录', escalation: '变更委员会复核' },
    corridor: { primary: '跨部门评估', check: '技术转移和验证计划', boundary: '影响评估缺口', stop: '补齐批准节点', evidence: '质量、生产和 QC 会签记录', escalation: '实施前评审' },
    dungeon: { primary: '实施后确认', check: '首批执行记录', boundary: '变更 CAPA 缺口', stop: '暂缓变更关闭', evidence: 'PQR/趋势和偏差记录', escalation: '变更有效性检查' },
    boss: { primary: '变更控制证据', check: '申请-评估-批准链', boundary: '未控变更残留', stop: '用实施后确认反击', evidence: '首批记录和趋势复核', escalation: '变更终审' },
  },
}

function storyChoicePresetForRound(
  project: Project2d,
  roundKey: StoryChoiceRoundKey,
  focus: string,
  risk: string,
): StoryChoiceRoundPreset {
  return STORY_CHOICE_ROUND_PRESETS[project.id]?.[roundKey] ?? {
    primary: focus,
    check: `${project.caseFocus}相关记录`,
    boundary: risk,
    stop: '先执行临时控制',
    evidence: project.keyEvidence?.[0] ?? focus,
    escalation: project.riskSignal,
  }
}

function storyChoiceTemplatesForRound(
  project: Project2d,
  roundKey: StoryChoiceRoundKey,
  focus: string,
  risk: string,
): StoryChoiceTemplate[] {
  const preset = storyChoicePresetForRound(project, roundKey, focus, risk)
  const roundPrefix: Record<StoryChoiceRoundKey, string> = {
    hall: '第一场',
    corridor: '第二场',
    dungeon: '第三场',
    boss: '终场',
  }
  const prefix = roundPrefix[roundKey]
  return [
    {
      id: `${roundKey}-trace`,
      label: preset.primary,
      line: `${prefix}我先抓「${preset.primary}」：核对${preset.check}，用${preset.evidence}证明「${focus}」不是凭感觉判断。`,
      responses: [
        `我来同步${preset.evidence}，把这条线补成可追溯证据。`,
        `${preset.boundary}也要一起标出来，后面不能被 Boss 用边界问题反问。`,
      ],
    },
    {
      id: `${roundKey}-boundary`,
      label: preset.boundary,
      line: `${prefix}不要只看眼前缺陷，先按「${preset.boundary}」扩展范围，再判断${risk}会不会影响相邻批次、系统或现场。`,
      responses: [
        `我去拉相邻批次和同系统记录，先把影响范围画出来。`,
        `现场会把${preset.check}补齐，避免范围被低估。`,
      ],
    },
    {
      id: `${roundKey}-control`,
      label: preset.stop,
      line: `${prefix}在结论没站稳前，我选择「${preset.stop}」，同时把${preset.escalation}设成下一步复核条件。`,
      responses: [
        `这条最稳，我会把临时控制和${preset.escalation}写入待办。`,
        `等${preset.evidence}确认后，再决定是否升级处置或进入 CAPA。`,
      ],
    },
  ]
}

function storyChoicesForActor(
  actor: Exclude<StoryIntroActor, 'boss'>,
  project: Project2d,
  focus: string,
  risk: string,
  roundKey: StoryChoiceRoundKey,
): StoryDialogueChoice[] {
  const firstResponder = alternateStoryActor(actor, 0)
  const secondResponder = alternateStoryActor(actor, 1)
  return storyChoiceTemplatesForRound(project, roundKey, focus, risk).map(choice => ({
    id: choice.id,
    label: choice.label,
    line: choice.line,
    responses: choice.responses.map((line, responseIndex) => ({
      actor: responseIndex % 2 === 0 ? firstResponder : secondResponder,
      line,
    })),
  }))
}

function maybeInteractiveLine(
  actor: Exclude<StoryIntroActor, 'boss'>,
  defaultLine: string,
  side: StoryActorSide,
  roles: TeamRoleCardSummary[],
  claimedActor: Exclude<StoryIntroActor, 'boss'> | null,
  project: Project2d,
  focus: string,
  risk: string,
  roundKey: StoryChoiceRoundKey,
) {
  if (claimedActor !== actor) return storyPersonLine(actor, defaultLine, side, roles)
  return storyPersonLine(
    actor,
    '',
    side,
    roles,
    storyChoicesForActor(actor, project, focus, risk, roundKey),
  )
}

function genericProjectStoryScript(project: Project2d, carrier: Carrier2d): ProjectStoryScript {
  const firstScene = project.scenes[0]
  const secondScene = project.scenes[1] ?? firstScene
  const thirdScene = project.scenes[2] ?? firstScene
  const firstEvidence = project.keyEvidence?.[0] ?? firstScene?.defect ?? project.caseFocus
  return {
    hall: {
      title: `${firstScene?.title ?? '第一场景'}：项目目标确认`,
      intro: `本项目要完成${carrier.productName}的${project.caseFocus}调查，第一场先确认该做什么、保全什么证据、哪些动作不能跳过。`,
      lin: `先锁定项目目标：围绕「${firstEvidence}」建立证据链，再决定下一步处置。`,
      li: `我会核对数据和记录来源，确保异常信号不是被最终结论盖过去。`,
      wang: `现场会补齐操作、设备和人员时间线，先把事实说清楚。`,
      focus: firstEvidence,
      risk: project.riskSignal,
    },
    corridor: {
      title: `${secondScene?.title ?? '第二场景'}：关键线索复核`,
      intro: `第二场继续追查${secondScene?.objective ?? project.caseFocus}，把记录、数据和现场说明串成同一条时间线。`,
      lin: '这一场重点看证据是否互相印证，不能让单一记录替代完整调查。',
      li: '我会复核检测侧和系统侧数据，找出异常是否有合理解释。',
      wang: '现场会把批记录、设备状态和人员操作同步给你们。',
      focus: project.keyEvidence?.[1] ?? secondScene?.defect ?? project.caseFocus,
      risk: secondScene?.defect ?? project.riskSignal,
    },
    dungeon: {
      title: `${thirdScene?.title ?? '第三场景'}：终场前闭环`,
      intro: `第三场先清理现场缺陷，再确认${thirdScene?.objective ?? '终场前证据闭环'}，为 Boss 质询准备依据。`,
      lin: '终场前必须确认影响范围、临时控制和后续 CAPA 都能落地。',
      li: '我会把关键数据和原始记录准备好，避免 Boss 用结论反推事实。',
      wang: '现场控制已经启动，剩下的是把每个动作写进闭环。',
      focus: project.keyEvidence?.[2] ?? thirdScene?.defect ?? project.caseFocus,
      risk: thirdScene?.defect ?? project.riskSignal,
    },
    boss: {
      title: `${project.bossName}：终场质询`,
      lin: '小怪已清理，当前项目的证据链已经能支撑终场判断。',
      li: '关键记录和数据已经保全，接下来用事实回应 Boss 的质疑。',
      wang: '现场边界和临时控制已经确认，可以进入最终处置。',
      boss: `证据链只要断一处，${project.caseFocus}就永远说不清。来吧，用你们的质量判断击穿我。`,
      focus: project.keyEvidence?.[0] ?? project.caseFocus,
      risk: project.riskSignal,
    },
  }
}

function buildStoryDialogueRounds(
  project: Project2d,
  carrier: Carrier2d,
  roles: TeamRoleCardSummary[],
  claimedActor: Exclude<StoryIntroActor, 'boss'> | null,
) {
  const script = FIRST_SIX_STORY_SCRIPTS[project.id] ?? genericProjectStoryScript(project, carrier)
  const sceneRound = (room: ChapterRoomKind, scene: StorySceneScript): StoryDialogueRound => ({
    id: `p${project.id}-${room}-entry`,
    projectId: project.id,
    room,
    kind: 'scene',
    title: scene.title,
    lines: [
      storyPersonLine(claimedActor === 'lin' ? 'li' : 'lin', sceneIntroWithContext(project.id, room, scene), claimedActor === 'lin' ? 'right' : 'left', roles),
      maybeInteractiveLine('li', scene.li, 'right', roles, claimedActor, project, scene.focus, scene.risk, room),
      maybeInteractiveLine('wang', scene.wang, 'right', roles, claimedActor, project, scene.focus, scene.risk, room),
      maybeInteractiveLine('lin', scene.lin, 'left', roles, claimedActor, project, scene.focus, scene.risk, room),
      storyPersonLine(claimedActor === 'wang' ? 'lin' : 'wang', sceneActionLine(room, scene), claimedActor === 'wang' ? 'left' : 'right', roles),
    ],
  })
  return [
    sceneRound('hall', script.hall),
    sceneRound('corridor', script.corridor),
    sceneRound('dungeon', script.dungeon),
    {
      id: `p${project.id}-dungeon-boss`,
      projectId: project.id,
      room: 'dungeon' as const,
      kind: 'boss' as const,
      title: script.boss.title,
      lines: [
        storyPersonLine(
          claimedActor === 'lin' ? 'li' : 'lin',
          bossPreludeLine(project.id, script.boss.focus),
          'left',
          roles,
        ),
        maybeInteractiveLine('lin', script.boss.lin, 'left', roles, claimedActor, project, script.boss.focus, script.boss.risk, 'boss'),
        maybeInteractiveLine('li', script.boss.li, 'left', roles, claimedActor, project, script.boss.focus, script.boss.risk, 'boss'),
        maybeInteractiveLine('wang', script.boss.wang, 'left', roles, claimedActor, project, script.boss.focus, script.boss.risk, 'boss'),
        storyPersonLine(claimedActor === 'wang' ? 'lin' : 'wang', `接下来你靠近 ${project.bossName} 开始终场质询，答题时优先抓住「${script.boss.focus}」，用已经保全的证据把它的血量压下去。`, 'left', roles),
        storyBossLine(project, script.boss.boss),
      ],
    },
  ] satisfies StoryDialogueRound[]
}

const STORY_TASK_POSITIONS: Record<ChapterRoomKind, Array<{ x: number; lane: number }>> = {
  hall: [{ x: 760, lane: 0 }, { x: 2380, lane: 2 }],
  corridor: [{ x: 700, lane: 1 }, { x: 2420, lane: 0 }],
  dungeon: [{ x: 780, lane: 2 }, { x: 2360, lane: 1 }],
}

const STORY_ROOM_LABELS: Record<ChapterRoomKind, string> = {
  hall: '第一场景',
  corridor: '第二场景',
  dungeon: '第三场景',
}

const STORY_TASK_TEMPLATES: Record<number, Record<ChapterRoomKind, Array<Omit<ChapterStoryTask, 'id' | 'projectId' | 'room' | 'x' | 'lane'>>>> = {
  1: {
    hall: [
      {
        kind: 'record',
        title: '核对处方筛选记录',
        objective: '找出处方筛选记录中缺少的质量属性依据',
        clue: '靠近研发记录台，确认 CQA 是否被写入处方筛选依据。',
        narratorLine: 'AI旁白：先别急着进中试。请在大殿里找到处方筛选记录，确认它有没有把关键质量属性写清楚。',
        completeLine: '处方筛选记录已标注：关键质量属性缺少与工艺参数的关联说明。',
      },
      {
        kind: 'process',
        title: '标出 CQA/CPP 缺口',
        objective: '确认关键工艺参数是否形成风险矩阵',
        clue: '检查风险矩阵牌，寻找没有评价的混合时间、粒度或溶出曲线。',
        narratorLine: 'AI旁白：继续看风险矩阵。学生需要把 CQA 和 CPP 的断点找出来，才能证明不是凭经验放大。',
        completeLine: '风险矩阵已补齐线索：混合时间、粒度、溶出曲线缺少设计空间论证。',
      },
    ],
    corridor: [
      {
        kind: 'evidence',
        title: '确认中试放大参数',
        objective: '找出中试门槛缺失的参数证据',
        clue: '在走廊中寻找中试参数牌，核对放大前是否有门槛条件。',
        narratorLine: 'AI旁白：进入走廊后，重点核对中试放大参数。没有门槛，就不能把小试结论直接带到现场。',
        completeLine: '中试参数缺口已记录：放大前缺少可接受标准和桥接方案。',
      },
      {
        kind: 'decision',
        title: '核对法规评审意见',
        objective: '确认法规评审是否支持继续推进',
        clue: '找到法规评审批注，判断是否允许在证据不足时进入中试。',
        narratorLine: 'AI旁白：现在看法规评审。你要判断这不是战斗胜利后的通行证，而是质量决策的证据。',
        completeLine: '法规评审已确认：证据不足时不得直接进入中试，应先完成风险评估。',
      },
    ],
    dungeon: [
      {
        kind: 'evidence',
        title: '补齐放行门槛',
        objective: '找出进入结案前必须补齐的放行条件',
        clue: '靠近终场门前的放行清单，核对 CQA/CPP、桥接和审批记录。',
        narratorLine: 'AI旁白：Boss 前最后一步，先把放行门槛找全。缺一项，后面的结论都站不住。',
        completeLine: '放行门槛已补齐：CQA/CPP、桥接方案和质量审批记录需要同时存在。',
      },
      {
        kind: 'decision',
        title: '形成工艺风险结论',
        objective: '完成本场景工艺风险判断',
        clue: '检查结论板，把证据链、风险控制和后续 CAPA 连成闭环。',
        narratorLine: 'AI旁白：最后把线索收束成一句可审计的结论。不是“可以做”，而是“为什么可以做”。',
        completeLine: '工艺风险结论已形成：证据链闭合后才允许进入 Boss 核验。',
      },
    ],
  },
  2: {
    hall: [
      {
        kind: 'record',
        title: '检查清洁矩阵',
        objective: '找出清洁验证矩阵是否覆盖最差条件',
        clue: '查找换线记录旁的清洁矩阵，确认最难清洁产品和部位。',
        narratorLine: 'AI旁白：清洁验证不能只看“已经清洁”。先找清洁矩阵，确认最差条件有没有被选出来。',
        completeLine: '清洁矩阵已确认：最差条件和最难清洁点需要重新覆盖。',
      },
      {
        kind: 'evidence',
        title: '标记死角取样点',
        objective: '找出未覆盖的擦拭或淋洗取样位置',
        clue: '在设备死角附近寻找取样标签，核对擦拭点是否遗漏。',
        narratorLine: 'AI旁白：继续找设备死角。学生需要知道，目检合格不等于清洁验证合格。',
        completeLine: '死角取样点已标记：必须补充擦拭或淋洗取样记录。',
      },
    ],
    corridor: [
      {
        kind: 'process',
        title: '复核残留限度',
        objective: '确认残留限度计算是否可追溯',
        clue: '找到限度计算牌，查看 MACO 或健康暴露限值是否有依据。',
        narratorLine: 'AI旁白：走廊里要看残留限度。限度不是凭感觉写出来的，必须能追溯到计算依据。',
        completeLine: '残留限度已复核：限度依据和计算过程需要归档。',
      },
      {
        kind: 'record',
        title: '封存清洁记录',
        objective: '找出清洁记录与检测结果是否一致',
        clue: '检查记录柜，核对清洁时间、人员、批号和检测结果。',
        narratorLine: 'AI旁白：现在封存记录。任何缺口都会影响后续批次的污染风险判断。',
        completeLine: '清洁记录已封存：时间、人员、批号和检测结果需要一致。',
      },
    ],
    dungeon: [
      {
        kind: 'decision',
        title: '判断共线影响',
        objective: '确认后续共线产品是否受影响',
        clue: '在 Boss 区前查找共线产品列表，判断影响范围。',
        narratorLine: 'AI旁白：最后不要只盯当前批次。请找共线产品列表，判断风险会不会传递到下一批。',
        completeLine: '共线影响已判断：后续暴露批次需要纳入影响评价。',
      },
      {
        kind: 'process',
        title: '建立再确认计划',
        objective: '完成周期性再确认和 CAPA 计划',
        clue: '找到再确认计划板，确认清洁矩阵、验证批次和周期要求。',
        narratorLine: 'AI旁白：清洁验证的结论要能持续有效。请把再确认计划和 CAPA 证据找出来。',
        completeLine: '再确认计划已建立：补充验证批次并设置周期性复核。',
      },
    ],
  },
  3: {
    hall: [
      {
        kind: 'record',
        title: '审阅质量协议',
        objective: '找出 MAH 与受托方职责边界缺口',
        clue: '靠近协议档案，检查偏差升级、放行职责和通知时限。',
        narratorLine: 'AI旁白：委托生产先看协议。请找出职责边界，确认偏差升级和放行责任有没有写清楚。',
        completeLine: '质量协议已审阅：偏差升级时限和放行责任需要明确。',
      },
      {
        kind: 'evidence',
        title: '锁定偏差复发线索',
        objective: '确认同类偏差是否重复出现',
        clue: '检查偏差台账，寻找同类问题复发和 CAPA 未关闭记录。',
        narratorLine: 'AI旁白：继续查偏差台账。重复出现的问题不是偶发，是体系信号。',
        completeLine: '偏差复发线索已锁定：同类问题需要升级为体系调查。',
      },
    ],
    corridor: [
      {
        kind: 'evidence',
        title: '收集远程审计证据',
        objective: '确认远程审计材料是否完整',
        clue: '在审计终端前核对批记录、偏差、CAPA 和培训记录。',
        narratorLine: 'AI旁白：进入远程审计现场后，不要只看截图。请找到能还原现场的证据组合。',
        completeLine: '远程审计证据已收集：批记录、偏差、CAPA 和培训记录必须互相印证。',
      },
      {
        kind: 'process',
        title: '追踪批放行链路',
        objective: '确认受托方放行与持有人复核是否闭合',
        clue: '找到放行链路牌，核对受托审核、MAH 复核和最终批准。',
        narratorLine: 'AI旁白：现在追踪放行链路。委托生产不等于把质量责任也委托出去。',
        completeLine: '批放行链路已确认：MAH 复核不得被受托方审核替代。',
      },
    ],
    dungeon: [
      {
        kind: 'decision',
        title: '确认责任回声',
        objective: '判断哪些问题必须由持有人升级处理',
        clue: '检查责任边界板，把偏差、投诉、召回和变更联系起来。',
        narratorLine: 'AI旁白：Boss 前要回答责任问题。请确认哪些信号必须回到持有人质量体系。',
        completeLine: '责任边界已确认：关键质量事件必须由持有人升级和复核。',
      },
      {
        kind: 'process',
        title: '制定委托 CAPA',
        objective: '形成委托生产整改闭环',
        clue: '找到 CAPA 跟踪表，确认责任人、期限、验证方式和复盘节点。',
        narratorLine: 'AI旁白：最后把整改闭环找出来。CAPA 只有可跟踪、可验证，才算真正关闭。',
        completeLine: '委托 CAPA 已形成：责任人、期限、验证方式和复盘节点完整。',
      },
    ],
  },
  4: {
    hall: [
      {
        kind: 'record',
        title: '封存温度记录',
        objective: '确认运输途中温度超限的原始证据',
        clue: '靠近冷链记录仪，核对超限时长、最高温度和报警时间。',
        narratorLine: 'AI旁白：冷链风险不能只看外箱。先封存温度记录，把 4 小时超限的原始证据锁住。',
        completeLine: '温度记录已封存：超限时长、报警点和最高温度需要进入偏差案卷。',
      },
      {
        kind: 'evidence',
        title: '核对装箱位置图',
        objective: '判断异常是否与装箱位置或探头位置有关',
        clue: '检查发运托盘和装箱图，确认记录仪、产品箱和冰排位置。',
        narratorLine: 'AI旁白：继续核对装箱位置。温度曲线必须和实际货位连起来，才有影响评价价值。',
        completeLine: '装箱位置图已核对：记录仪位置、冰排布局和暴露箱号需要关联判断。',
      },
    ],
    corridor: [
      {
        kind: 'process',
        title: '评估稳定性支持',
        objective: '确认稳定性数据是否覆盖本次温度暴露',
        clue: '在冷库通道寻找稳定性资料，判断是否有可引用的温度偏离数据。',
        narratorLine: 'AI旁白：进入冷链通道后，重点看稳定性支持。没有数据支撑，就不能凭经验接收入库。',
        completeLine: '稳定性支持已评估：现有数据不足时应保持隔离并升级质量决策。',
      },
      {
        kind: 'decision',
        title: '划定暴露批次',
        objective: '确认同路线、同承运商发运批次是否纳入扩展调查',
        clue: '查看发运路线板，寻找同车、同路线或同承运商的暴露批次。',
        narratorLine: 'AI旁白：现在划定影响范围。一次温控失效可能不是单箱问题，而是路线和承运商系统问题。',
        completeLine: '暴露批次已划定：同路线和同承运商发运批次需要同步评估。',
      },
    ],
    dungeon: [
      {
        kind: 'decision',
        title: '触发召回评估',
        objective: '判断是否需要进入市场召回或风险沟通流程',
        clue: '靠近召回评估台，核对已上市批次、患者暴露和质量风险等级。',
        narratorLine: 'AI旁白：Boss 前必须回答市场风险。请判断是否需要召回评估，而不是只处理仓库里的到货批。',
        completeLine: '召回评估已触发：上市暴露、产品稳定性和患者风险必须同时评估。',
      },
      {
        kind: 'process',
        title: '锁定承运商 CAPA',
        objective: '形成温控报警升级与承运商整改闭环',
        clue: '检查承运商 CAPA 表，确认报警升级、资质复核和再验证要求。',
        narratorLine: 'AI旁白：最后把承运商整改闭环找出来。冷链不是交出去就结束，持有人要验证控制有效。',
        completeLine: '承运商 CAPA 已锁定：报警升级、资质复核和运输再验证需要闭环。',
      },
    ],
  },
  5: {
    hall: [
      {
        kind: 'record',
        title: '冻结上线闸门',
        objective: '确认 eBRS 上线前是否具备验证放行条件',
        clue: '靠近验证闸门，核对 URS、风险评估和上线审批是否完整。',
        narratorLine: 'AI旁白：eBRS 不是先上线再补材料。先冻结上线闸门，确认验证证据能不能支撑放行。',
        completeLine: '上线闸门已冻结：URS、风险评估和审批记录缺一不可。',
      },
      {
        kind: 'evidence',
        title: '核对权限矩阵',
        objective: '找出用户权限与电子签名控制缺口',
        clue: '查看权限矩阵牌，确认生产、QA、IT 是否存在越权或共用账号。',
        narratorLine: 'AI旁白：继续看权限矩阵。电子批记录的风险常常藏在角色边界和签名权限里。',
        completeLine: '权限矩阵已核对：越权、共用账号和电子签名边界需要补测。',
      },
    ],
    corridor: [
      {
        kind: 'process',
        title: '执行挑战脚本',
        objective: '确认验证脚本是否覆盖关键业务异常',
        clue: '在机械通道里找到挑战脚本，核对异常放行、撤销签名和审计追踪场景。',
        narratorLine: 'AI旁白：进入验证通道后，别只看正常流程。挑战脚本要证明异常也能被系统拦住。',
        completeLine: '挑战脚本已执行：异常放行、签名撤销和审计追踪场景必须覆盖。',
      },
      {
        kind: 'record',
        title: '登记验证偏差',
        objective: '判断验证过程中发现的问题是否形成偏差闭环',
        clue: '检查偏差回路面板，确认缺陷编号、影响评估和修复验证。',
        narratorLine: 'AI旁白：现在登记验证偏差。验证中发现的问题不能靠口头说明带过。',
        completeLine: '验证偏差已登记：缺陷编号、影响评估和修复验证需要成套归档。',
      },
    ],
    dungeon: [
      {
        kind: 'decision',
        title: '确认上线批准',
        objective: '判断系统是否具备可批准上线的证据链',
        clue: '靠近能量核心，核对验证总结、权限复核和上线后监控计划。',
        narratorLine: 'AI旁白：Boss 前最后一步是上线批准。结论必须来自证据链，不是来自项目排期。',
        completeLine: '上线批准条件已确认：验证总结、权限复核和监控计划需要同时满足。',
      },
      {
        kind: 'process',
        title: '建立上线后监控',
        objective: '形成 eBRS 上线后的持续监控闭环',
        clue: '查看监控计划板，确认审计追踪抽查、异常处理和周期复核。',
        narratorLine: 'AI旁白：系统上线只是开始。请把上线后监控计划找出来，证明控制能持续运行。',
        completeLine: '上线后监控已建立：审计追踪抽查、异常处理和周期复核纳入闭环。',
      },
    ],
  },
  6: {
    hall: [
      {
        kind: 'record',
        title: '保全原始序列',
        objective: '确认 HPLC 原始电子数据已被完整保全',
        clue: '靠近实验台，核对原始序列、方法文件和数据文件是否完整。',
        narratorLine: 'AI旁白：数据完整性调查从原始数据开始。先保全 HPLC 原始序列，不要只看打印图谱。',
        completeLine: '原始序列已保全：方法文件、序列文件和数据文件需要完整备份。',
      },
      {
        kind: 'evidence',
        title: '导出审计追踪',
        objective: '找出审计追踪空窗期和关键操作记录',
        clue: '检查审计追踪终端，确认空窗时间、登录账号和重积分动作。',
        narratorLine: 'AI旁白：继续导出审计追踪。空窗期不是小瑕疵，它可能改变整个结论可信度。',
        completeLine: '审计追踪已导出：空窗期、登录账号和重积分动作进入证据链。',
      },
    ],
    corridor: [
      {
        kind: 'process',
        title: '复核重积分理由',
        objective: '确认重积分是否有科学理由和审批记录',
        clue: '在数据走廊查看重积分面板，寻找手工处理、理由和审批链。',
        narratorLine: 'AI旁白：进入数据走廊后，重点看重积分。所有手工处理都必须有科学理由和审批链。',
        completeLine: '重积分理由已复核：手工处理、理由和审批记录需要一一对应。',
      },
      {
        kind: 'record',
        title: '核查账号权限',
        objective: '确认是否存在共用账号或权限过宽',
        clue: '检查账号权限矩阵，核对分析员、复核人和管理员权限边界。',
        narratorLine: 'AI旁白：现在核查账号权限。共用账号会让审计追踪失去可归属性。',
        completeLine: '账号权限已核查：共用账号和权限过宽问题需要立即纠正。',
      },
    ],
    dungeon: [
      {
        kind: 'decision',
        title: '扩展历史批次',
        objective: '判断同仪器历史放行批次是否受影响',
        clue: '靠近隔离舱，查看历史批次列表和同仪器放行记录。',
        narratorLine: 'AI旁白：Boss 前要把范围说清楚。请判断同仪器历史放行批次是否需要复核。',
        completeLine: '历史批次扩展已确认：同仪器、同方法和同账号涉及批次需要纳入评估。',
      },
      {
        kind: 'process',
        title: '建立数据审核机制',
        objective: '形成数据完整性的长期控制方案',
        clue: '检查数据审核计划，确认审计追踪周期复核、权限复核和培训要求。',
        narratorLine: 'AI旁白：最后建立长期机制。数据完整性不是一次调查，而是持续审核和权限控制。',
        completeLine: '数据审核机制已建立：审计追踪复核、权限复核和培训纳入 CAPA。',
      },
    ],
  },
}

function generatedStoryTaskTemplates(project: Project2d): Record<ChapterRoomKind, Array<Omit<ChapterStoryTask, 'id' | 'projectId' | 'room' | 'x' | 'lane'>>> | null {
  if (project.id < 7 || project.id > 11) return null
  const script = genericProjectStoryScript(project, { productName: project.title, dosageForm: project.curriculum, process: project.caseFocus })
  const evidence = project.keyEvidence?.length ? project.keyEvidence : ['关键记录', '现场证据', '闭环材料']
  const sceneFor = (index: number) => project.scenes[index] ?? project.scenes[0]
  const build = (room: ChapterRoomKind, scene: StorySceneScript, sceneIndex: number) => {
    const sceneSeed = sceneFor(sceneIndex)
    return [
      {
        kind: 'record' as const,
        title: `核查${scene.focus}`,
        objective: `确认${scene.focus}是否能支撑当前判断`,
        clue: `靠近${STORY_ROOM_LABELS[room]}的记录点，核对${evidence[sceneIndex % evidence.length]}与现场事实。`,
        narratorLine: `${scene.title}。先把${scene.focus}对应的原始记录、时间线和责任边界核清楚，不能只看最终结论。`,
        completeLine: `${scene.focus}已完成核查：证据来源、时间线和责任边界可以继续支撑后续判断。`,
      },
      {
        kind: room === 'dungeon' ? 'decision' as const : 'process' as const,
        title: sceneSeed?.title ? `${sceneSeed.title}闭环` : `${scene.focus}闭环`,
        objective: sceneSeed?.objective ?? `形成${scene.focus}的现场处置结论`,
        clue: `继续检查${evidence[(sceneIndex + 1) % evidence.length] ?? scene.risk}，判断风险是否还有遗漏。`,
        narratorLine: `继续沿着${scene.risk}往下查，把影响范围、临时控制和后续动作串成闭环。`,
        completeLine: `${scene.risk}已形成闭环线索：可以推进到${room === 'dungeon' ? '最终 Boss 质询' : '下一场景'}。`,
      },
    ]
  }
  return {
    hall: build('hall', script.hall, 0),
    corridor: build('corridor', script.corridor, 1),
    dungeon: build('dungeon', script.dungeon, 2),
  }
}

function buildChapterStoryTasks(project: Project2d): ChapterStoryTask[] {
  const templates = STORY_TASK_TEMPLATES[project.id] ?? generatedStoryTaskTemplates(project)
  if (!templates) return []
  return (['hall', 'corridor', 'dungeon'] as ChapterRoomKind[]).flatMap(room => {
    const positions = STORY_TASK_POSITIONS[room]
    return templates[room].map((task, index) => ({
      ...task,
      id: `story-p${project.id}-${room}-${index + 1}`,
      projectId: project.id,
      room,
      narratorActor: task.narratorActor ?? STORY_TASK_NARRATOR_BY_KIND[task.kind],
      x: positions[index]?.x ?? (760 + index * 860),
      lane: positions[index]?.lane ?? 1,
    }))
  })
}

const STORY_OPERATION_TOOLS: Record<StoryOperationToolId, StoryOperationTool> = {
  'risk-matrix': {
    id: 'risk-matrix',
    name: '风险矩阵',
    detail: '按严重性、发生概率和可检测性判断缺陷优先级。',
  },
  fishbone: {
    id: 'fishbone',
    name: '鱼骨图',
    detail: '从人、机、料、法、环拆解根因，适合偏差调查。',
  },
  'what-if': {
    id: 'what-if',
    name: 'What-if分析',
    detail: '逐条追问遗漏风险，适合进入 Boss 前补证。',
  },
  decision: {
    id: 'decision',
    name: '决策树',
    detail: '把隔离、放行、返工、扩大调查拆成条件分支。',
  },
  fmea: {
    id: 'fmea',
    name: 'FMEA',
    detail: '识别失效模式、后果、原因和现有控制。',
  },
  haccp: {
    id: 'haccp',
    name: 'HACCP',
    detail: '识别关键控制点，适合污染、清洁和环境控制。',
  },
  pha: {
    id: 'pha',
    name: 'PHA',
    detail: '快速建立危害清单和需要补证的记录列表。',
  },
  fta: {
    id: 'fta',
    name: 'FTA',
    detail: '从终场失败倒推证据缺失和控制失败组合原因。',
  },
}

const STORY_ROOM_INDEX: Record<ChapterRoomKind, number> = { hall: 0, corridor: 1, dungeon: 2 }
const STORY_KIND_INDEX: Record<StoryTaskKind, number> = { record: 0, evidence: 1, process: 2, decision: 3 }

interface ChapterOperationProfile {
  focus: string
  knowledge: [string, string, string]
  tools: [StoryOperationToolId, StoryOperationToolId, StoryOperationToolId, StoryOperationToolId]
}

const CHAPTER_OPERATION_PROFILES: Record<number, ChapterOperationProfile> = {
  1: {
    focus: '工艺风险评审',
    knowledge: ['CQA/CPP 风险矩阵', 'QbD 设计空间', '中试放行闸门'],
    tools: ['risk-matrix', 'pha', 'decision', 'fmea'],
  },
  2: {
    focus: '清洁验证',
    knowledge: ['清洁矩阵与最差条件', '擦拭/淋洗取样点', '残留限度与周期性再确认'],
    tools: ['haccp', 'risk-matrix', 'fishbone', 'decision'],
  },
  3: {
    focus: '委托生产管理',
    knowledge: ['质量协议职责边界', '远程审计证据链', '持有人放行复核'],
    tools: ['what-if', 'decision', 'fishbone', 'risk-matrix'],
  },
  4: {
    focus: '冷链发运与召回',
    knowledge: ['温度偏差影响评价', '稳定性数据支撑', '市场召回风险沟通'],
    tools: ['decision', 'risk-matrix', 'what-if', 'fmea'],
  },
  5: {
    focus: '确认与验证',
    knowledge: ['URS 与风险评估', '权限矩阵和电子签名', '挑战脚本与上线监控'],
    tools: ['fmea', 'risk-matrix', 'what-if', 'decision'],
  },
  6: {
    focus: '数据完整性',
    knowledge: ['ALCOA+ 原始数据', '审计追踪与重积分', '账号权限和周期复核'],
    tools: ['what-if', 'fta', 'risk-matrix', 'decision'],
  },
  7: {
    focus: '偏差调查与 CAPA',
    knowledge: ['OOS 分阶段调查', '根因分析证据链', 'CAPA 有效性验证'],
    tools: ['fishbone', 'decision', 'risk-matrix', 'fta'],
  },
  8: {
    focus: '无菌保障',
    knowledge: ['环境监测趋势', '无菌干预与屏障暴露', '污染控制关键点'],
    tools: ['haccp', 'pha', 'risk-matrix', 'decision'],
  },
  9: {
    focus: '厂房设施与 HVAC',
    knowledge: ['压差报警趋势', '风量过滤器复核', '门禁干扰与区域边界'],
    tools: ['pha', 'haccp', 'risk-matrix', 'fmea'],
  },
  10: {
    focus: '变更控制',
    knowledge: ['变更分级与批准路径', '跨部门影响评估', '实施后效果确认'],
    tools: ['what-if', 'fmea', 'decision', 'risk-matrix'],
  },
  11: {
    focus: '年度质量回顾',
    knowledge: ['PQR 趋势信号', '系统性质量风险', '最终总测证据链'],
    tools: ['fta', 'risk-matrix', 'decision', 'what-if'],
  },
}

const DEFAULT_CHAPTER_OPERATION_PROFILE: ChapterOperationProfile = {
  focus: 'GMP 现场调查',
  knowledge: ['记录完整性', '影响范围评估', 'CAPA 闭环'],
  tools: ['risk-matrix', 'fishbone', 'decision', 'what-if'],
}

const STORY_OPERATION_BY_KIND: Record<StoryTaskKind, {
  questionLead: string
  actionVerb: string
  wrongLabels: [string, string]
}> = {
  record: {
    questionLead: '记录类线索不能只看最终结论，你应该怎么处理',
    actionVerb: '先核对原始记录和时间线，再',
    wrongLabels: ['只看最终打印件，结果合格就放行。', '让现场口头说明，暂时不追溯记录来源。'],
  },
  evidence: {
    questionLead: '证据类线索需要证明“从哪里来、是否可信”，你应该怎么做',
    actionVerb: '先锁定现场证据来源，再',
    wrongLabels: ['只拍一张现场截图，后续再补解释。', '先清理现场，等风险降低后再找证据。'],
  },
  process: {
    questionLead: '流程类线索要确认控制是否持续有效，你应该怎么推进',
    actionVerb: '先比对流程要求和执行证据，再',
    wrongLabels: ['流程写过就算有效，不需要看执行证据。', '只要求现场重新培训，暂不验证效果。'],
  },
  decision: {
    questionLead: '决策类线索要把证据转成质量判断，你应该提交什么结论',
    actionVerb: '先划定影响范围和批准条件，再',
    wrongLabels: ['先按经验判定通过，后续再补充记录。', '只处理当前点位，不扩大到相关批次或系统。'],
  },
}

const STORY_KIND_TOOL_FALLBACKS: Record<StoryTaskKind, StoryOperationToolId[]> = {
  record: ['risk-matrix', 'what-if', 'fta'],
  evidence: ['pha', 'haccp', 'risk-matrix'],
  process: ['fmea', 'fishbone', 'haccp'],
  decision: ['decision', 'fta', 'risk-matrix'],
}

function uniqueOperationTools(tools: StoryOperationToolId[]) {
  return [...new Set(tools)]
}

function chapterOperationProfile(projectId: number) {
  return CHAPTER_OPERATION_PROFILES[projectId] ?? DEFAULT_CHAPTER_OPERATION_PROFILE
}

function storyOperationToolPlan(task: ChapterStoryTask) {
  const profile = chapterOperationProfile(task.projectId)
  const roomIndex = STORY_ROOM_INDEX[task.room]
  const kindIndex = STORY_KIND_INDEX[task.kind]
  const chapterTool = profile.tools[(roomIndex * 2 + kindIndex) % profile.tools.length]
  const kindTool = STORY_KIND_TOOL_FALLBACKS[task.kind].find(tool => profile.tools.includes(tool))
    ?? profile.tools[(roomIndex + kindIndex + 1) % profile.tools.length]
  const requiredTools = uniqueOperationTools([
    chapterTool,
    kindTool,
    profile.tools[(roomIndex + kindIndex + 2) % profile.tools.length],
  ]).slice(0, 2)
  const extraTools = uniqueOperationTools([
    ...profile.tools,
    ...STORY_KIND_TOOL_FALLBACKS[task.kind],
    'risk-matrix',
    'decision',
  ]).filter(toolId => !requiredTools.includes(toolId)).slice(0, 2)
  return { profile, requiredTools, extraTools }
}

function buildStoryOperationScenario(task: ChapterStoryTask): StoryOperationScenario {
  const config = STORY_OPERATION_BY_KIND[task.kind]
  const { profile, requiredTools, extraTools } = storyOperationToolPlan(task)
  const tools = [...requiredTools, ...extraTools]
    .map(toolId => STORY_OPERATION_TOOLS[toolId])
    .filter(Boolean)
  const knowledgePoint = profile.knowledge[(STORY_ROOM_INDEX[task.room] + STORY_KIND_INDEX[task.kind]) % profile.knowledge.length]
  const requiredToolNames = requiredTools.map(toolId => STORY_OPERATION_TOOLS[toolId].name)
  const primaryToolName = requiredToolNames[0] ?? '质量工具'
  const secondaryToolName = requiredToolNames[1] ?? primaryToolName
  const toolUse = `${primaryToolName} + ${secondaryToolName}`
  return {
    tools,
    requiredTools,
    chapterFocus: profile.focus,
    knowledgePoint,
    toolUse,
    toolHint: `先用${primaryToolName}定位风险，再用${secondaryToolName}把「${knowledgePoint}」转成可提交证据。`,
    question: `${config.questionLead}：${task.title}`,
    options: [
      {
        id: 'A',
        label: `${config.actionVerb}用${toolUse}核实「${knowledgePoint}」，输出可追溯的结论。`,
        correct: true,
      },
      {
        id: 'B',
        label: config.wrongLabels[0],
        correct: false,
      },
      {
        id: 'C',
        label: `跳过「${knowledgePoint}」，${config.wrongLabels[1]}`,
        correct: false,
      },
    ],
    success: task.completeLine,
  }
}

interface SyncedEnemyState {
  id: string
  hp: number
  x: number
  lane: number
  facing: 1 | -1
  moving: boolean
  quizCharge: number
  defeated: boolean
  heroEffect?: EnemyHeroEffect
}

interface TeamRoomWorldState {
  projectId: number
  roomId: string
  source: 'authority' | 'quiz' | 'assist' | 'story'
  enemies?: SyncedEnemyState[]
  endlessStats?: EndlessSurvivalStats
  finalChapterStage?: number
  chapterRoom: ChapterRoomKind
  validationSealSolved: boolean
  storyTasksCompleted?: string[]
  storyDialogueGate?: StoryDialogueGateState | null
  resolvedQuiz?: {
    ownerUserId?: string | null
    enemyId: string
    byUserId?: string | null
    correct: boolean
    damage?: number
    at: number
  } | null
  updatedAt: number
}

interface StoryDialogueGateState {
  roundId: string
  readyUserIds: string[]
  updatedAt: number
}

interface TeamRoomEvent {
  type?: 'revive' | 'quizResolved' | 'battleEnded' | 'roomDisbanded' | 'storyDialogueReady'
  targetUserId?: string
  ownerUserId?: string | null
  enemyId?: string
  byUserId?: string | null
  roundId?: string
  readyUserIds?: string[]
  hp?: number
  damage?: number
  correct?: boolean
  at?: number
}

interface TeamPlaySyncSnapshot {
  currentUserId?: string
  authorityUserId?: string
  ended?: boolean
  reason?: 'ended' | 'disbanded'
  roomState?: { state?: unknown; event?: unknown; updatedByUserId?: string | null }
  currentPlayer?: (Partial<RemoteTeamPlayer> & { activeQuiz?: unknown }) | null
  players?: Array<Partial<RemoteTeamPlayer> & { modelId?: string; status?: string; activeQuiz?: unknown; aiControlled?: boolean; rolling?: boolean; rollingUntil?: number; rollDuration?: number; seq?: number }>
}

interface MoveTarget {
  x: number
  lane: number
}

interface MoveClickMarker {
  id: number
  x: number
  lane: number
}

type StoryTaskKind = 'record' | 'process' | 'evidence' | 'decision'
type StoryOperationToolId = 'risk-matrix' | 'fishbone' | 'what-if' | 'decision' | 'fmea' | 'haccp' | 'pha' | 'fta'

interface ChapterStoryTask {
  id: string
  projectId: number
  room: ChapterRoomKind
  kind: StoryTaskKind
  title: string
  objective: string
  clue: string
  narratorLine: string
  completeLine: string
  narratorActor?: StoryPersonActor
  x: number
  lane: number
}

interface StoryOperationTool {
  id: StoryOperationToolId
  name: string
  detail: string
}

interface StoryOperationQuestionOption {
  id: string
  label: string
  correct: boolean
}

interface StoryOperationScenario {
  tools: StoryOperationTool[]
  requiredTools: StoryOperationToolId[]
  chapterFocus: string
  knowledgePoint: string
  toolUse: string
  question: string
  options: StoryOperationQuestionOption[]
  success: string
  toolHint: string
}

interface FinalChapterNarration {
  id: string
  title: string
  line: string
}

interface EnemyTargetCandidate {
  id: string
  x: number
  lane: number
  local: boolean
}

interface ActiveQuiz {
  enemyId: string
  question: TrainingQuestion
  prompt: string
  mode: AttackMode
  damage: number
  targetTitle: string
}

interface FloatingText {
  id: number
  text: string
  x: number
  lane: number
  kind: FloatingTextKind
}

interface GroundSwordWave {
  id: number
  x: number
  lane: number
  direction: 1 | -1
  duration: number
}

interface ProjectileState {
  id: number
  owner: ProjectileOwner
  weaponId: string
  kind: ProjectileKind
  sourceId?: string
  color?: string
  height?: ProjectileHeight
  x: number
  lane: number
  direction: 1 | -1
  damage: number
  heavy: boolean
  crit: boolean
  createdAt: number
  dodgedAt?: number
}

interface EnvironmentTheme {
  key: EnvironmentKey
  stageClass: string
  label: string
  signs: string[]
}

interface ThreeProjectGameProps {
  project: Project2d
  role: Role2d
  carrier: Carrier2d
  storyQuestions: TrainingQuestion[]
  bossQuestions: TrainingQuestion[]
  remainingTime: number
  timedOut: boolean
  projectCleared?: boolean
  testMode?: boolean
  playerModelId?: PlayerModelId
  unlockedPlayerModelIds?: PlayerModelId[]
  playerCombatStats?: {
    hp?: number
    attack?: number
    mobility?: number
  }
  playerCurrentHp?: number
  playerHpCap?: number
  displayName?: string
  teamRoomId?: string | null
  allyNames?: string[]
  soundEnabled?: boolean
  sfxVolume?: number
  musicVolume?: number
  mapBackgroundUrl?: string
  endlessSurvival?: boolean
  endlessMapBackgrounds?: string[]
  itemCounts?: Record<GameItemId, number>
  coins?: number
  gems?: number
  onUseItem?: (item: GameItemId) => boolean
  onCollectDrop?: (drop: CombatLootDrop) => void
  onOpenShop?: (options?: ShopOpenOptions) => void
  teamRoomOwner?: boolean
  onEndTeamBattle?: () => void
  onTeamRoomStopped?: (reason: 'ended' | 'disbanded') => void
  onPauseChange?: (paused: boolean) => void
  onHpChange?: (hp: number) => void
  onEndlessComplete?: (result: EndlessSurvivalCompletion) => void
  onBack: () => void
  onComplete: (result: Game2dCompletion) => void
}

const PLAYER_MAX_HP = 140
const WORLD_WIDTH = 6000
const FINAL_CHAPTER_STAGE_COUNT = 11
const FINAL_CHAPTER_STAGE_WIDTH = 7200
const FINAL_CHAPTER_GATE_RENDER_X = 6550
const FINAL_CHAPTER_GATE_READY_X = FINAL_CHAPTER_GATE_RENDER_X
const FINAL_CHAPTER_STAGE_BOSS_X = 5720
const MOTION_RENDER_INTERVAL_MS = 32
const PROJECTILE_RENDER_INTERVAL_MS = 32
const ENEMY_RENDER_INTERVAL_MS = 40
const ENDLESS_SURVIVAL_MINION_COUNT = 8
const CHAPTER_ROOM_WIDTH = 3200
const EXTENDED_CHAPTER_ROOM_WIDTH = 4200
const CHAPTER_ROOM_START_X = 150
const CHAPTER_ROOM_EXIT_OFFSET = 220
const CHAPTER_GATE_READY_OFFSET = 82
const CHAPTER_GATE_RENDER_OFFSET = 170
const VIEWPORT_FOCUS = 0.34
const CRIT_WINDOW_MS = 8500
const ATTACK_COOLDOWN_MS = 180
const COMBO_RESET_MS = 1500
const BLACK_KNIGHT_SHEATH_DELAY_MS = 3000
const PLAYER_ACTION_RANGE = 118
const PLAYER_ACTION_BACK_REACH = 36
const PLAYER_COMBO_REACH_BONUS = 12
const PLAYER_NORMAL_DAMAGE = 7
const PLAYER_HEAVY_DAMAGE = 16
const PLAYER_QUIZ_MULTIPLIER = 1.65
const QUESTION_REWARD_DAMAGE = 18
const WRONG_ANSWER_DAMAGE = 10
const ENEMY_COUNTER_DAMAGE = 3
const BOSS_COUNTER_DAMAGE = 6
const ENEMY_ATTACK_INTERVAL_MS = 3300
const ENEMY_ATTACK_RANGE = 124
const ENEMY_AGGRO_RANGE = 620
const ENEMY_RANGED_MIN_RANGE = 190
const ENEMY_RANGED_ATTACK_RANGE = 590
const ENEMY_PROJECTILE_SPEED = 390
const ENEMY_PROJECTILE_LIFETIME_MS = 2100
const ENEMY_WINDUP_MS = 520
const ENEMY_LUNGE_MS = 420
const ENEMY_DEATH_ANIMATION_MS = 1900
const GAME_COMPLETE_SETTLE_MS = 2050
const REVIVE_DURATION_MS = 5000
const REVIVE_RANGE = 150
const TEAM_LAUNCH_DURATION_MS = 2600
const REMOTE_SYNC_STALE_MS = 3000
const TEAM_SYNC_CONFIG_URL = (process.env.NEXT_PUBLIC_TEAM_SYNC_URL || '').trim()
const TEAM_SOCKET_MOVE_INTERVAL_MS = 50
const TEAM_HTTP_FALLBACK_PUSH_INTERVAL_MS = 120
const TEAM_HTTP_FALLBACK_PULL_INTERVAL_MS = 120
const TEAM_HTTP_FALLBACK_IDLE_HEARTBEAT_MS = 900
const AI_ALLY_REVIVE_MS = 2300
const AI_ALLY_ATTACK_INTERVAL_MS = 920
const AI_ALLY_MOVE_SPEED = 235
const REMOTE_SMOOTH_SPEED = 760
const REMOTE_SNAP_DISTANCE = 1800
const REMOTE_MOVE_KEEPALIVE_MS = 700
const REMOTE_SOCKET_INTERPOLATION_DELAY_MS = 85
const REMOTE_HTTP_INTERPOLATION_DELAY_MS = 170
const REMOTE_INTERPOLATION_SAMPLE_TTL_MS = 900
const REMOTE_INTERPOLATION_MAX_SAMPLES = 12
const PICKUP_RANGE = 78
const COMBAT_LANE_DISTANCE = 46
const DEFAULT_ROLL_DURATION_MS = 520
const ROLL_COOLDOWN_MS = 760
const ROLL_DISTANCE = 360
const PLAYER_MAX_STAMINA = 100
const ROLL_STAMINA_COST = 26
const ATTACK_STAMINA_COST = 18
const STAMINA_REGEN_PER_SECOND = 42
const STAMINA_REGEN_DELAY_MS = 260
const HERO_EFFECT_TRIGGER_EVERY = 3
const HERO_EFFECT_ACTIVE_MS = 2000
const SHIFT_DOUBLE_TAP_MS = 280
const ENEMY_HIT_KNOCKBACK = 34
const BOSS_HIT_KNOCKBACK = 18
const PLAYER_HIT_KNOCKBACK = 46
const PLAYER_PROJECTILE_KNOCKBACK = 32
const PLAYER_ENTRY_DURATION_MS = 920
const PROJECTILE_SPEED = 820
const PROJECTILE_LIFETIME_MS = 1650
const KNIGHT_GROUND_WAVE_DAMAGE = 7
const KNIGHT_GROUND_WAVE_RANGE = 300
const KNIGHT_GROUND_WAVE_DURATION_MS = 620
const LANE_BOTTOMS = [246, 158, 68]
const ALLY_ASSIST_INTERVAL_MS = 2600

function readTeamAuthToken() {
  if (typeof window === 'undefined') return null
  const token = localStorage.getItem('token')?.trim()
  if (!token || token === 'undefined' || token === 'null') return null
  return token
}
const ALLY_ASSIST_DAMAGE = 7

const PLAYER_MODEL_COMBAT_STATS: Record<PlayerModelId, { hp: number; attack: number; mobility: number }> = {
  'knight-hero': { hp: 140, attack: 10, mobility: 10 },
  knight2: { hp: 135, attack: 12, mobility: 11 },
  'pixel-knight': { hp: 150, attack: 11, mobility: 9 },
  'sprite-hero': { hp: 122, attack: 10, mobility: 13 },
  'black-knight': { hp: 165, attack: 13, mobility: 7 },
  'demon-warrior': { hp: 130, attack: 14, mobility: 12 },
}

function playerModelCombatStats(modelId: PlayerModelId) {
  return PLAYER_MODEL_COMBAT_STATS[modelId] ?? PLAYER_MODEL_COMBAT_STATS[DEFAULT_PLAYER_MODEL_ID]
}

interface HeroCombatEffectConfig {
  kind: HeroHitEffectKind
  visualId: HeroEffectVisualId
  comboVisualId?: HeroEffectVisualId
  stackLabel: string
  burstLabel: string
  floatingKind: FloatingTextKind
  durationMs: number
  tickIntervalMs: number
  tickDamage: number
  tickStackBonus: number
  burstAt: number
  burstMultiplier: number
  minBurstDamage: number
  impactBonus: number
  burstMs: number
  resetStacksOnBurst?: boolean
  stopEnemyOnBurst?: boolean
  healOnBurst?: number
}

interface HeroEffectVisualConfig {
  asset: string
  frameWidth: number
  frameHeight: number
  frames: number
  renderWidth: number
  renderHeight: number
  durationMs: number
  xOffset?: number
  yOffset?: number
  face?: boolean
  blend?: 'normal' | 'screen'
}

const HERO_EFFECT_VISUALS: Record<HeroEffectVisualId, HeroEffectVisualConfig> = {
  knightWave: {
    asset: '/simulation/effects/dark-spell-02.png',
    frameWidth: 256,
    frameHeight: 128,
    frames: 8,
    renderWidth: 178,
    renderHeight: 89,
    durationMs: 520,
    xOffset: 4,
    yOffset: 18,
    face: true,
    blend: 'screen',
  },
  saintLightning: {
    asset: '/simulation/effects/lightning.png',
    frameWidth: 64,
    frameHeight: 128,
    frames: 10,
    renderWidth: 84,
    renderHeight: 168,
    durationMs: 520,
    xOffset: 0,
    yOffset: 10,
    blend: 'screen',
  },
  pixelSlash: {
    asset: '/simulation/effects/dark-spell-01.png',
    frameWidth: 128,
    frameHeight: 128,
    frames: 9,
    renderWidth: 124,
    renderHeight: 124,
    durationMs: 410,
    xOffset: 4,
    yOffset: 8,
    face: true,
    blend: 'screen',
  },
  blueSpark: {
    asset: '/simulation/effects/spark.png',
    frameWidth: 32,
    frameHeight: 32,
    frames: 7,
    renderWidth: 78,
    renderHeight: 78,
    durationMs: 360,
    xOffset: 4,
    yOffset: 10,
    blend: 'screen',
  },
  blackFire: {
    asset: '/simulation/effects/fire-bomb.png',
    frameWidth: 64,
    frameHeight: 64,
    frames: 14,
    renderWidth: 118,
    renderHeight: 118,
    durationMs: 620,
    xOffset: 0,
    yOffset: 8,
    blend: 'screen',
  },
  demonBolt: {
    asset: '/simulation/effects/dark-bolt.png',
    frameWidth: 64,
    frameHeight: 88,
    frames: 11,
    renderWidth: 84,
    renderHeight: 116,
    durationMs: 560,
    xOffset: 0,
    yOffset: 18,
    blend: 'screen',
  },
  demonSlash: {
    asset: '/simulation/effects/slash-demon.png',
    frameWidth: 64,
    frameHeight: 64,
    frames: 8,
    renderWidth: 108,
    renderHeight: 108,
    durationMs: 430,
    xOffset: 6,
    yOffset: 10,
    face: true,
    blend: 'screen',
  },
}

const HERO_COMBAT_EFFECTS: Record<PlayerModelId, HeroCombatEffectConfig> = {
  'knight-hero': {
    kind: 'sunder',
    visualId: 'knightWave',
    stackLabel: '破甲',
    burstLabel: '破甲震荡',
    floatingKind: 'block',
    durationMs: 2600,
    tickIntervalMs: 900,
    tickDamage: 0,
    tickStackBonus: 0,
    burstAt: 3,
    burstMultiplier: 0.5,
    minBurstDamage: 7,
    impactBonus: 0,
    burstMs: 520,
    resetStacksOnBurst: true,
    stopEnemyOnBurst: true,
  },
  knight2: {
    kind: 'radiant',
    visualId: 'saintLightning',
    stackLabel: '圣辉',
    burstLabel: '圣辉爆裂',
    floatingKind: 'radiant',
    durationMs: 3200,
    tickIntervalMs: 760,
    tickDamage: 1,
    tickStackBonus: 0,
    burstAt: 3,
    burstMultiplier: 0.52,
    minBurstDamage: 7,
    impactBonus: 0,
    burstMs: 620,
    resetStacksOnBurst: true,
    healOnBurst: 3,
  },
  'pixel-knight': {
    kind: 'guardBreak',
    visualId: 'pixelSlash',
    stackLabel: '盾裂',
    burstLabel: '盾击碎裂',
    floatingKind: 'guard',
    durationMs: 2400,
    tickIntervalMs: 900,
    tickDamage: 0,
    tickStackBonus: 0,
    burstAt: 2,
    burstMultiplier: 0.42,
    minBurstDamage: 5,
    impactBonus: 0,
    burstMs: 480,
    resetStacksOnBurst: true,
    stopEnemyOnBurst: true,
  },
  'sprite-hero': {
    kind: 'trace',
    visualId: 'blueSpark',
    stackLabel: '追踪',
    burstLabel: '追迹切割',
    floatingKind: 'trace',
    durationMs: 3000,
    tickIntervalMs: 820,
    tickDamage: 0,
    tickStackBonus: 0,
    burstAt: 2,
    burstMultiplier: 0.5,
    minBurstDamage: 6,
    impactBonus: 0,
    burstMs: 460,
    resetStacksOnBurst: true,
  },
  'black-knight': {
    kind: 'fireBurn',
    visualId: 'blackFire',
    stackLabel: '灼烧',
    burstLabel: '火焰爆燃',
    floatingKind: 'rupture',
    durationMs: 3800,
    tickIntervalMs: 760,
    tickDamage: 1,
    tickStackBonus: 0,
    burstAt: 4,
    burstMultiplier: 0.58,
    minBurstDamage: 8,
    impactBonus: 0,
    burstMs: 620,
    resetStacksOnBurst: true,
    stopEnemyOnBurst: true,
  },
  'demon-warrior': {
    kind: 'storm',
    visualId: 'demonBolt',
    comboVisualId: 'demonSlash',
    stackLabel: '紫电',
    burstLabel: '紫雷暴击',
    floatingKind: 'shock',
    durationMs: 3600,
    tickIntervalMs: 650,
    tickDamage: 1,
    tickStackBonus: 0,
    burstAt: 3,
    burstMultiplier: 0.72,
    minBurstDamage: 9,
    impactBonus: 0,
    burstMs: 720,
    resetStacksOnBurst: true,
    stopEnemyOnBurst: true,
  },
}

function heroEffectVisualId(modelId: PlayerModelId, animation?: PlayerAnimation, phase = 1): HeroEffectVisualId {
  const config = HERO_COMBAT_EFFECTS[modelId]
  if (!config) return 'knightWave'
  if (modelId === 'demon-warrior' && config.comboVisualId && (animation === 'attack2' || phase === 2)) {
    return config.comboVisualId
  }
  return config.visualId
}

function heroEffectVisualStyle(effect: EnemyHeroEffect, enemy: EnemyState) {
  const visual = HERO_EFFECT_VISUALS[effect.visualId]
  const frameSteps = Math.max(1, visual.frames - 1)
  const face = visual.face ? enemy.facing : 1
  const now = typeof performance !== 'undefined' ? performance.now() : 0
  const burstScale = effect.burstUntil && effect.burstUntil > now ? 1.1 : 1
  return {
    '--hero-effect-sheet': `url("${visual.asset}")`,
    '--hero-effect-frame-width': `${visual.renderWidth}px`,
    '--hero-effect-frame-height': `${visual.renderHeight}px`,
    '--hero-effect-sheet-width': `${visual.renderWidth * visual.frames}px`,
    '--hero-effect-frame-travel': `${-(visual.renderWidth * frameSteps)}px`,
    '--hero-effect-frame-steps': frameSteps,
    '--hero-effect-duration': `${HERO_EFFECT_ACTIVE_MS}ms`,
    '--hero-effect-x-offset': `${(visual.xOffset ?? 0) * face}px`,
    '--hero-effect-y-offset': `${visual.yOffset ?? 0}px`,
    '--hero-effect-face': face,
    '--hero-effect-burst-scale': burstScale,
    '--hero-effect-blend': visual.blend ?? 'normal',
  } as CSSProperties
}
const HEAL_ITEM_AMOUNT = 38
const BOOST_ATTACKS = 3
const BOOST_DAMAGE_MULTIPLIER = 1.5
const SKIP_ITEM_DAMAGE = 24
const POISON_START_X = 1660
const POISON_END_X = 2360

const ENVIRONMENTS: Record<EnvironmentKey, EnvironmentTheme> = {
  castle: { key: 'castle', stageClass: 'themeCastle', label: '城堡工艺厅', signs: ['CASTLE', 'CQA', 'CPP', 'TRIAL', 'GATE', 'BOSS'] },
  cleaning: { key: 'cleaning', stageClass: 'themeCleaning', label: '清洁验证工坊', signs: ['LINE', 'DIRT', 'LIMIT', 'TRACE', 'CLEAN', 'BOSS'] },
  audit: { key: 'audit', stageClass: 'themeAudit', label: '远程审计街区', signs: ['MAH', 'SOP', 'BATCH', 'QA', 'AUDIT', 'BOSS'] },
  cold: { key: 'cold', stageClass: 'themeCold', label: '冷链雪路', signs: ['TEMP', 'SHIP', 'WARE', 'MARKET', 'CALL', 'BOSS'] },
  fortress: { key: 'fortress', stageClass: 'themeFortress', label: '验证堡垒', signs: ['URS', 'RISK', 'SCRIPT', 'CSV', 'SIGN', 'BOSS'] },
  lab: { key: 'lab', stageClass: 'themeLab', label: '数据实验室', signs: ['HPLC', 'AUDIT', 'RAW', 'USER', 'DATA', 'BOSS'] },
  capa: { key: 'capa', stageClass: 'themeCapa', label: 'CAPA 调查街', signs: ['OOS', 'ROOT', 'RISK', 'CAPA', 'EFFECT', 'BOSS'] },
  aseptic: { key: 'aseptic', stageClass: 'themeAseptic', label: '无菌防线', signs: ['ASEP', 'GRADE', 'MEDIA', 'FLOW', 'FILL', 'BOSS'] },
  hvac: { key: 'hvac', stageClass: 'themeHvac', label: 'HVAC 风塔', signs: ['HVAC', 'DP', 'AIR', 'FILTER', 'ROOM', 'BOSS'] },
  change: { key: 'change', stageClass: 'themeChange', label: '变更风暴线', signs: ['CHANGE', 'IMPACT', 'TECH', 'PLAN', 'APPROVE', 'BOSS'] },
  final: { key: 'final', stageClass: 'themeFinal', label: '终局王城', signs: ['QMS', 'GMP', 'RISK', 'DATA', 'CAPA', 'FINAL'] },
}

const WEAPONS: Weapon[] = [
  {
    id: 'audit-blade',
    name: '审计棍',
    tag: '连击',
    detail: '攻速快，答对后容易连续压制缺陷怪。',
    normalDamage: 10,
    heavyDamage: 20,
    rangePx: 118,
    critMultiplier: 1.75,
    color: '#70d6ff',
    shape: 'club',
  },
  {
    id: 'evidence-hammer',
    name: '证据锤',
    tag: '重击',
    detail: '重击伤害高，适合打高血量 Boss。',
    normalDamage: 9,
    heavyDamage: 30,
    rangePx: 108,
    critMultiplier: 1.65,
    color: '#f2c86b',
    shape: 'hammer',
  },
  {
    id: 'capa-spear',
    name: 'CAPA 管',
    tag: '长柄',
    detail: '攻击距离更远，换道追击容错更高。',
    normalDamage: 8,
    heavyDamage: 20,
    rangePx: 176,
    critMultiplier: 1.7,
    color: '#59d99d',
    shape: 'spear',
  },
  {
    id: 'data-shield',
    name: '数据盾',
    tag: '稳守',
    detail: '伤害较低，但答对后恢复生命。',
    normalDamage: 7,
    heavyDamage: 16,
    rangePx: 112,
    critMultiplier: 1.55,
    color: '#b78cff',
    shape: 'shield',
  },
  {
    id: 'deviation-axe',
    name: '偏差斧',
    tag: '爆发',
    detail: '拾取型武器，重击爆发高但距离较短。',
    normalDamage: 11,
    heavyDamage: 34,
    rangePx: 104,
    critMultiplier: 1.55,
    color: '#ff8d6b',
    shape: 'axe',
  },
  {
    id: 'sampling-gun',
    name: '取样枪',
    tag: '远程',
    detail: '可以发射审计弹，适合在安全距离压制病毒缺陷。',
    normalDamage: 8,
    heavyDamage: 18,
    rangePx: 640,
    critMultiplier: 1.55,
    color: '#9fe870',
    shape: 'gun',
    ranged: true,
  },
  {
    id: 'risk-crossbow',
    name: '风险弩',
    tag: '穿透',
    detail: '弹道更远，重击蓄力慢但破防积累更稳。',
    normalDamage: 9,
    heavyDamage: 26,
    rangePx: 720,
    critMultiplier: 1.6,
    color: '#f7f0a1',
    shape: 'crossbow',
    ranged: true,
  },
  { id: 'service-pistol', name: '制式手枪', tag: '轻型', detail: '稳定易用的基础远程武器。', normalDamage: 7, heavyDamage: 15, rangePx: 560, critMultiplier: 1.5, color: '#8fd3ff', shape: 'gun', ranged: true },
  { id: 'glock19', name: 'Glock 19', tag: '速射', detail: '轻便灵活，适合移动中连续压制。', normalDamage: 8, heavyDamage: 17, rangePx: 590, critMultiplier: 1.5, color: '#9fe870', shape: 'gun', ranged: true },
  { id: 'm1911', name: 'M1911', tag: '精准', detail: '单发稳定，兼顾射程和伤害。', normalDamage: 9, heavyDamage: 19, rangePx: 610, critMultiplier: 1.55, color: '#f2c86b', shape: 'gun', ranged: true },
  { id: 'desert-eagle', name: '沙漠之鹰', tag: '高威力', detail: '后坐力较大，但单发伤害突出。', normalDamage: 11, heavyDamage: 27, rangePx: 620, critMultiplier: 1.62, color: '#ff9b72', shape: 'gun', ranged: true },
  { id: 'magnum', name: '马格南', tag: '爆发', detail: '重型左轮，适合快速击破高防目标。', normalDamage: 12, heavyDamage: 30, rangePx: 640, critMultiplier: 1.65, color: '#ff7f8d', shape: 'gun', ranged: true },
  { id: 'short-gun', name: '短管手枪', tag: '近射', detail: '近距离爆发更强，射程相对较短。', normalDamage: 10, heavyDamage: 24, rangePx: 500, critMultiplier: 1.6, color: '#d7b8ff', shape: 'gun', ranged: true },
  { id: 'mini-uzi', name: 'Mini Uzi', tag: '连射', detail: '射速快，适合持续累积破防值。', normalDamage: 7, heavyDamage: 18, rangePx: 560, critMultiplier: 1.48, color: '#70d6ff', shape: 'gun', ranged: true },
  { id: 'ak47', name: 'AK-47', tag: '突击', detail: '中远距离火力稳定，适合持续推进。', normalDamage: 10, heavyDamage: 24, rangePx: 700, critMultiplier: 1.55, color: '#f1a95b', shape: 'gun', ranged: true },
  { id: 'lever-rifle', name: '杠杆步枪', tag: '猎手', detail: '射程较远，单发伤害和节奏平衡。', normalDamage: 11, heavyDamage: 28, rangePx: 760, critMultiplier: 1.62, color: '#ddb879', shape: 'gun', ranged: true },
  { id: 'shotgun', name: '战术霰弹枪', tag: '近战爆发', detail: '近距离伤害很高，但有效射程较短。', normalDamage: 13, heavyDamage: 36, rangePx: 330, critMultiplier: 1.55, color: '#ff8d6b', shape: 'gun', ranged: true },
  { id: 'sniper-rifle', name: '狙击步枪', tag: '超远程', detail: '射程最长，重击可对重点缺陷造成高额伤害。', normalDamage: 14, heavyDamage: 40, rangePx: 920, critMultiplier: 1.72, color: '#b6d8ff', shape: 'gun', ranged: true },
  { id: 'blue-laser', name: '蓝光激光枪', tag: '能量', detail: '弹道稳定，适合远距离连续命中。', normalDamage: 9, heavyDamage: 25, rangePx: 760, critMultiplier: 1.58, color: '#62c8ff', shape: 'gun', ranged: true },
  { id: 'fire-plasma', name: '烈焰等离子枪', tag: '灼烧', detail: '高能等离子弹具有较强爆发。', normalDamage: 12, heavyDamage: 34, rangePx: 690, critMultiplier: 1.64, color: '#ff705d', shape: 'gun', ranged: true },
  { id: 'plasma-rifle', name: '高能等离子步枪', tag: '高阶', detail: '射程和伤害兼备的高阶能量武器。', normalDamage: 13, heavyDamage: 36, rangePx: 800, critMultiplier: 1.68, color: '#a990ff', shape: 'gun', ranged: true },
  { id: 'ray-gun', name: '射线枪', tag: '穿透', detail: '高能射线适合快速击穿怪物防御。', normalDamage: 11, heavyDamage: 31, rangePx: 740, critMultiplier: 1.64, color: '#67f2c1', shape: 'gun', ranged: true },
]

const UNARMED_WEAPON: Weapon = {
  id: 'unarmed',
  name: '徒手',
  tag: '空手',
  detail: '首次进入实训的默认状态，靠近地图武器后可拾取并保存。',
  normalDamage: 5,
  heavyDamage: 11,
  rangePx: 82,
  critMultiplier: 1.35,
  color: '#d7e6e1',
  shape: 'unarmed',
}

const FALLBACK_QUESTION: TrainingQuestion = {
  id: 'fallback-q',
  kind: 'single',
  chapter: 'GMP 风险判断',
  stem: '发现偏差后，最优先的处理原则是什么？',
  options: [
    { id: 'A', label: '先控制风险并保全证据' },
    { id: 'B', label: '先推进生产，稍后补记录' },
    { id: 'C', label: '删除异常数据避免误判' },
  ],
  correct: ['A'],
  insight: 'GMP 偏差处理必须先控制风险、保全证据，再进入调查和 CAPA 闭环。',
  points: 10,
}

function formatCountdown(seconds: number) {
  const safeSeconds = Math.max(0, seconds)
  const minutes = Math.floor(safeSeconds / 60)
  const remainingSeconds = safeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

function answersMatch(answers: string[], question: TrainingQuestion) {
  if (question.kind === 'sequence') return answers.join('|') === question.correct.join('|')
  const normalize = (values: string[]) => [...values].sort().join('|')
  return normalize(answers) === normalize(question.correct)
}

function questionLabel(kind: QuestionKind) {
  if (kind === 'single') return '单选'
  if (kind === 'multiple') return '多选'
  if (kind === 'sequence') return '排序'
  return '案例判断'
}

function weaponById(id: string | null | undefined) {
  if (!id || id === UNARMED_WEAPON.id) return UNARMED_WEAPON
  return WEAPONS.find(weapon => weapon.id === id) ?? UNARMED_WEAPON
}

function ownedWeaponIdsFor(unlockedWeaponIds: string[], equippedWeaponId: string | null | undefined) {
  const validIds = new Set(WEAPONS.map(weapon => weapon.id))
  return [...new Set([equippedWeaponId, ...unlockedWeaponIds])]
    .filter((id): id is string => Boolean(id && validIds.has(id)))
}

function environmentForProject(project: Project2d) {
  const byId: Record<number, EnvironmentKey> = {
    1: 'castle',
    2: 'cleaning',
    3: 'audit',
    4: 'cold',
    5: 'fortress',
    6: 'lab',
    7: 'capa',
    8: 'aseptic',
    9: 'hvac',
    10: 'change',
    11: 'final',
  }
  const direct = byId[project.id]
  if (direct) return ENVIRONMENTS[direct]

  const text = `${project.title} ${project.curriculum} ${project.caseFocus}`
  if (/王城|终局/.test(text)) return ENVIRONMENTS.final
  if (/城堡|堡垒|验证/.test(text)) return ENVIRONMENTS.fortress
  if (/清洁|残留/.test(text)) return ENVIRONMENTS.cleaning
  if (/冷链|温度|发运/.test(text)) return ENVIRONMENTS.cold
  if (/数据|实验室|审计追踪/.test(text)) return ENVIRONMENTS.lab
  if (/无菌|灌装/.test(text)) return ENVIRONMENTS.aseptic
  if (/HVAC|厂房|设施|压差/.test(text)) return ENVIRONMENTS.hvac
  if (/变更|转移/.test(text)) return ENVIRONMENTS.change
  if (/委托|MAH|审计/.test(text)) return ENVIRONMENTS.audit
  return ENVIRONMENTS.capa
}

function enemyFormForScene(scene: SceneDefect, index: number): EnemyForm {
  const text = `${scene.title} ${scene.defect} ${scene.objective}`
  if (/微|菌|污染|温度|冷|残留|清洁|环境/.test(text)) return 'virus'
  if (/数据|审计|电子|记录|账号|权限|HPLC|CSV/.test(text)) return 'glitch'
  if (/CAPA|闭环|责任|协议|根因|变更/.test(text)) return 'wraith'
  if (index % 8 === 5) return 'tank'
  if (index % 8 === 6) return 'flying'
  return index % 2 === 0 ? 'defect' : 'virus'
}

function enemyFormClass(form: EnemyForm) {
  const classes: Record<EnemyForm, string> = {
    virus: styles.enemyVirus,
    defect: styles.enemyDefect,
    glitch: styles.enemyGlitch,
    wraith: styles.enemyWraith,
    tank: styles.enemyDefect,
    flying: styles.enemyWraith,
    boss: styles.enemyBossForm,
    eliteGoblin1: styles.enemyDefect,
    eliteGoblin2: styles.enemyGlitch,
    eliteGoblin3: styles.enemyWraith,
    eliteGolem: styles.enemyDefect,
    oldGolem: styles.enemyDefect,
    oldGuardian: styles.enemyWraith,
  }
  return classes[form]
}

function weaponShapeClass(shape: WeaponShape) {
  const classes: Record<WeaponShape, string> = {
    unarmed: styles.weaponUnarmed,
    club: styles.weaponClub,
    hammer: styles.weaponHammer,
    spear: styles.weaponSpear,
    shield: styles.weaponShield,
    axe: styles.weaponAxe,
    gun: styles.weaponGun,
    crossbow: styles.weaponCrossbow,
  }
  return classes[shape]
}

function rolePortraitFor(role: Role2d) {
  const id = role.id ?? ''
  if (id.includes('production')) return '/simulation/story-production.webp'
  if (id.includes('it')) return '/simulation/story-it.webp'
  if (id.includes('specialist')) return '/simulation/story-specialist.webp'
  if (id.includes('qa')) return '/simulation/story-qa.webp'
  if (id.includes('validation')) return '/simulation/story-director.webp'
  if (id.includes('college')) return '/simulation/story-specialist.webp'
  return '/simulation/story-qa.webp'
}

function playerSpriteStyle(
  model: PlayerModel,
  animation: PlayerAnimation = 'idle',
  scale = 1,
  options: { startFrame?: number; frameCount?: number; duration?: number } = {},
) {
  const sprite = playerAnimationStyle(model, animation, scale, options)
  return {
    '--player-sheet': `url("${sprite.sheet}")`,
    '--player-frame-width': `${sprite.frameWidth}px`,
    '--player-frame-height': `${sprite.frameHeight}px`,
    '--player-sheet-width': `${sprite.sheetWidth}px`,
    '--player-frame-start': `${sprite.frameStart}px`,
    '--player-frame-travel': `${sprite.frameTravel}px`,
    '--player-frame-count': sprite.frameCount,
    '--player-frame-steps': sprite.frameSteps,
    '--player-ground-adjust': `${-sprite.groundOffset}px`,
    '--player-accent': sprite.accent,
    '--player-animation-duration': `${sprite.duration}ms`,
    '--player-animation-iteration': sprite.iteration,
  } as CSSProperties
}

function playerPreviewSpriteStyle(model: PlayerModel, maxWidth: number, maxHeight: number, maxScale = 1, animation: PlayerAnimation = 'idle') {
  return playerSpriteStyle(model, animation, playerModelFitScale(model, maxWidth, maxHeight, maxScale))
}

function playerCinematicSpriteStyle(model: PlayerModel, maxWidth: number, maxHeight: number, maxScale = 1) {
  const scale = playerModelFitScale(model, maxWidth, maxHeight, maxScale)
  const renderHeight = Math.round(model.renderHeight * scale)
  const renderScale = renderHeight / Math.max(1, model.frameHeight)
  const groundShift = Math.round((model.groundOffsets?.idle ?? 0) * renderScale)
  return {
    ...playerSpriteStyle(model, 'idle', scale),
    '--story-player-ground-shift': `${groundShift}px`,
  } as CSSProperties
}

interface ActorSprite {
  id: string
  accent: string
  nativeFacing?: 1 | -1
  groundOffset?: number
  groundOffsets?: Partial<Record<ActorAnimation, number>>
  frameWidth: number
  frameHeight: number
  renderWidth: number
  renderHeight: number
  assets: Record<ActorAnimation, string>
  frames: Record<ActorAnimation, number>
  durations?: Partial<Record<ActorAnimation, number>>
  animationFrameRanges?: Partial<Record<ActorAnimation, {
    startFrame?: number
    frameCount?: number
    duration?: number
  }>>
  attackVariants?: Array<{
    asset: string
    frames: number
    duration?: number
    startFrame?: number
    frameCount?: number
    effect?: ActorEffect
  }>
  effects?: Partial<Record<ActorAnimation, ActorEffect>>
  combat?: {
    attackRange: number
    preferredRange: number
    aggroRange: number
    moveSpeed: number
    windupMs: number
    recoveryMs: number
    damage: number
    lungeDistance: number
    extraHitOffsets?: number[]
    extraHitDamageMultiplier?: number
  }
}

interface ActorEffect {
  asset: string
  frameWidth: number
  frameHeight: number
  renderWidth: number
  renderHeight: number
  frames: number
  duration?: number
  groundOffset?: number
  xOffset?: number
}

type EnemyCombatProfile = NonNullable<ActorSprite['combat']>

const ENEMY_SPRITES: Record<'cacodaemon' | 'goblinScout' | 'goblinArcher' | 'goblinTank' | 'flyingDemon' | 'eliteGoblin1' | 'eliteGoblin2' | 'eliteGoblin3' | 'eliteGolem' | 'oldGolem' | 'oldGuardian', ActorSprite> = {
  cacodaemon: {
    id: 'cacodaemon',
    accent: '#ff6f7d',
    frameWidth: 64,
    frameHeight: 64,
    renderWidth: 118,
    renderHeight: 118,
    assets: {
      idle: '/simulation/enemies/cacodaemon/idle.png',
      run: '/simulation/enemies/cacodaemon/run.png',
      attack: '/simulation/enemies/cacodaemon/attack.png',
      hurt: '/simulation/enemies/cacodaemon/hurt.png',
      death: '/simulation/enemies/cacodaemon/death.png',
    },
    frames: { idle: 6, run: 6, attack: 6, hurt: 4, death: 8 },
    durations: { idle: 680, run: 560, attack: 520, hurt: 300, death: 1300 },
  },
  goblinScout: {
    id: 'goblin-scout',
    accent: '#9fbc55',
    frameWidth: 600,
    frameHeight: 500,
    renderWidth: 148,
    renderHeight: 123,
    assets: {
      idle: '/simulation/enemies/goblin-scout/idle.png',
      run: '/simulation/enemies/goblin-scout/run.png',
      attack: '/simulation/enemies/goblin-scout/attack.png',
      hurt: '/simulation/enemies/goblin-scout/hurt.png',
      death: '/simulation/enemies/goblin-scout/death.png',
    },
    frames: { idle: 8, run: 6, attack: 6, hurt: 4, death: 9 },
    durations: { idle: 760, run: 620, attack: 680, hurt: 320, death: 1450 },
  },
  goblinArcher: {
    id: 'goblin-archer',
    accent: '#d9b56f',
    frameWidth: 600,
    frameHeight: 500,
    renderWidth: 148,
    renderHeight: 123,
    assets: {
      idle: '/simulation/enemies/goblin-archer/idle.png',
      run: '/simulation/enemies/goblin-archer/run.png',
      attack: '/simulation/enemies/goblin-archer/attack.png',
      hurt: '/simulation/enemies/goblin-archer/hurt.png',
      death: '/simulation/enemies/goblin-archer/death.png',
    },
    frames: { idle: 8, run: 6, attack: 9, hurt: 4, death: 9 },
    durations: { idle: 760, run: 620, attack: 780, hurt: 320, death: 1450 },
  },
  goblinTank: {
    id: 'goblin-tank',
    accent: '#b9cf62',
    nativeFacing: 1,
    frameWidth: 224,
    frameHeight: 180,
    renderWidth: 170,
    renderHeight: 137,
    assets: {
      idle: '/simulation/enemies/goblin-tank/idle.png',
      run: '/simulation/enemies/goblin-tank/run.png',
      attack: '/simulation/enemies/goblin-tank/attack.png',
      hurt: '/simulation/enemies/goblin-tank/hurt.png',
      death: '/simulation/enemies/goblin-tank/death.png',
    },
    frames: { idle: 8, run: 6, attack: 6, hurt: 4, death: 5 },
    durations: { idle: 760, run: 640, attack: 720, hurt: 340, death: 1400 },
    combat: { attackRange: 176, preferredRange: 128, aggroRange: 760, moveSpeed: 50, windupMs: 720, recoveryMs: 680, damage: 8, lungeDistance: 34 },
  },
  flyingDemon: {
    id: 'flying-demon',
    accent: '#e86a78',
    nativeFacing: -1,
    frameWidth: 79,
    frameHeight: 69,
    renderWidth: 140,
    renderHeight: 122,
    assets: {
      idle: '/simulation/enemies/flying-demon/idle.png',
      run: '/simulation/enemies/flying-demon/run.png',
      attack: '/simulation/enemies/flying-demon/attack.png',
      hurt: '/simulation/enemies/flying-demon/hurt.png',
      death: '/simulation/enemies/flying-demon/death.png',
    },
    frames: { idle: 4, run: 4, attack: 8, hurt: 4, death: 7 },
    durations: { idle: 620, run: 520, attack: 660, hurt: 280, death: 1100 },
    combat: { attackRange: 144, preferredRange: 360, aggroRange: 820, moveSpeed: 74, windupMs: 560, recoveryMs: 640, damage: 5, lungeDistance: 24 },
  },
  eliteGoblin1: {
    id: 'elite-goblin-1',
    accent: '#b8cf63',
    nativeFacing: 1,
    groundOffset: 41,
    frameWidth: 200,
    frameHeight: 200,
    renderWidth: 240,
    renderHeight: 240,
    assets: {
      idle: '/simulation/enemies/elite-goblin-1/idle.png',
      run: '/simulation/enemies/elite-goblin-1/run.png',
      attack: '/simulation/enemies/elite-goblin-1/attack.png',
      hurt: '/simulation/enemies/elite-goblin-1/hurt.png',
      death: '/simulation/enemies/elite-goblin-1/death.png',
    },
    frames: { idle: 15, run: 11, attack: 21, hurt: 18, death: 21 },
    durations: { idle: 900, run: 680, attack: 960, hurt: 520, death: 1500 },
    combat: { attackRange: 174, preferredRange: 126, aggroRange: 790, moveSpeed: 62, windupMs: 650, recoveryMs: 700, damage: 8, lungeDistance: 32 },
  },
  eliteGoblin2: {
    id: 'elite-goblin-2',
    accent: '#d9c36f',
    nativeFacing: 1,
    groundOffset: 19,
    frameWidth: 150,
    frameHeight: 150,
    renderWidth: 260,
    renderHeight: 260,
    assets: {
      idle: '/simulation/enemies/elite-goblin-2/idle.png',
      run: '/simulation/enemies/elite-goblin-2/run.png',
      attack: '/simulation/enemies/elite-goblin-2/attack.png',
      hurt: '/simulation/enemies/elite-goblin-2/hurt.png',
      death: '/simulation/enemies/elite-goblin-2/death.png',
    },
    frames: { idle: 11, run: 11, attack: 16, hurt: 4, death: 14 },
    durations: { idle: 820, run: 660, attack: 820, hurt: 300, death: 1380 },
    combat: { attackRange: 170, preferredRange: 122, aggroRange: 780, moveSpeed: 68, windupMs: 600, recoveryMs: 660, damage: 8, lungeDistance: 32 },
  },
  eliteGoblin3: {
    id: 'elite-goblin-3',
    accent: '#d2d779',
    nativeFacing: 1,
    groundOffset: 43,
    frameWidth: 200,
    frameHeight: 200,
    renderWidth: 310,
    renderHeight: 310,
    assets: {
      idle: '/simulation/enemies/elite-goblin-3/idle.png',
      run: '/simulation/enemies/elite-goblin-3/run.png',
      attack: '/simulation/enemies/elite-goblin-3/attack-effect.png',
      hurt: '/simulation/enemies/elite-goblin-3/hurt.png',
      death: '/simulation/enemies/elite-goblin-3/death.png',
    },
    frames: { idle: 55, run: 9, attack: 10, hurt: 4, death: 11 },
    durations: { idle: 2100, run: 620, attack: 780, hurt: 320, death: 1320 },
    attackVariants: [
      { asset: '/simulation/enemies/elite-goblin-3/attack-effect.png', frames: 10, duration: 780 },
      { asset: '/simulation/enemies/elite-goblin-3/attack-alt-effect.png', frames: 11, duration: 820 },
    ],
    combat: { attackRange: 184, preferredRange: 132, aggroRange: 820, moveSpeed: 76, windupMs: 570, recoveryMs: 640, damage: 9, lungeDistance: 36 },
  },
  eliteGolem: {
    id: 'elite-golem',
    accent: '#f0a65a',
    nativeFacing: 1,
    frameWidth: 111,
    frameHeight: 67,
    renderWidth: 285,
    renderHeight: 172,
    assets: {
      idle: '/simulation/enemies/elite-golem/idle.png',
      run: '/simulation/enemies/elite-golem/run.png',
      attack: '/simulation/enemies/elite-golem/attack.png',
      hurt: '/simulation/enemies/elite-golem/hurt.png',
      death: '/simulation/enemies/elite-golem/death.png',
    },
    frames: { idle: 8, run: 8, attack: 10, hurt: 8, death: 7 },
    durations: { idle: 760, run: 680, attack: 920, hurt: 320, death: 1350 },
    effects: {
      attack: {
        asset: '/simulation/enemies/elite-golem/attack-effect.png',
        frameWidth: 54,
        frameHeight: 77,
        renderWidth: 100,
        renderHeight: 142,
        frames: 4,
        duration: 620,
        xOffset: -22,
      },
    },
    combat: { attackRange: 202, preferredRange: 146, aggroRange: 820, moveSpeed: 46, windupMs: 780, recoveryMs: 780, damage: 12, lungeDistance: 30 },
  },
  oldGolem: {
    id: 'old-golem',
    accent: '#c9824f',
    nativeFacing: -1,
    groundOffset: 35,
    frameWidth: 160,
    frameHeight: 160,
    renderWidth: 225,
    renderHeight: 225,
    assets: {
      idle: '/simulation/enemies/old-golem/idle.png',
      run: '/simulation/enemies/old-golem/run.png',
      attack: '/simulation/enemies/old-golem/attack.png',
      hurt: '/simulation/enemies/old-golem/hurt.png',
      death: '/simulation/enemies/old-golem/death.png',
    },
    frames: { idle: 6, run: 8, attack: 8, hurt: 4, death: 10 },
    durations: { idle: 780, run: 700, attack: 860, hurt: 340, death: 1450 },
    attackVariants: [
      { asset: '/simulation/enemies/old-golem/attack.png', frames: 8, duration: 860 },
      { asset: '/simulation/enemies/old-golem/attack-alt.png', frames: 8, duration: 900 },
      {
        asset: '/simulation/enemies/old-golem/attack-spit.png',
        frames: 7,
        duration: 820,
        effect: {
          asset: '/simulation/enemies/old-golem/bullet-effect.png',
          frameWidth: 160,
          frameHeight: 160,
          renderWidth: 225,
          renderHeight: 225,
          frames: 7,
          duration: 820,
        },
      },
    ],
    combat: { attackRange: 204, preferredRange: 150, aggroRange: 820, moveSpeed: 48, windupMs: 780, recoveryMs: 790, damage: 12, lungeDistance: 30 },
  },
  oldGuardian: {
    id: 'old-guardian',
    accent: '#d46c45',
    nativeFacing: -1,
    groundOffset: 29,
    frameWidth: 120,
    frameHeight: 120,
    renderWidth: 250,
    renderHeight: 250,
    assets: {
      idle: '/simulation/enemies/old-guardian/idle.png',
      run: '/simulation/enemies/old-guardian/run.png',
      attack: '/simulation/enemies/old-guardian/attack.png',
      hurt: '/simulation/enemies/old-guardian/hurt.png',
      death: '/simulation/enemies/old-guardian/death.png',
    },
    frames: { idle: 6, run: 8, attack: 10, hurt: 4, death: 10 },
    durations: { idle: 760, run: 620, attack: 780, hurt: 300, death: 1300 },
    attackVariants: [
      { asset: '/simulation/enemies/old-guardian/attack.png', frames: 10, duration: 820 },
      {
        asset: '/simulation/enemies/old-guardian/attack-alt.png',
        frames: 8,
        duration: 780,
        effect: {
          asset: '/simulation/enemies/old-guardian/explosion-effect.png',
          frameWidth: 120,
          frameHeight: 120,
          renderWidth: 250,
          renderHeight: 250,
          frames: 7,
          duration: 780,
        },
      },
      {
        asset: '/simulation/enemies/old-guardian/attack-spit.png',
        frames: 8,
        duration: 760,
        effect: {
          asset: '/simulation/enemies/old-guardian/spit-effect.png',
          frameWidth: 120,
          frameHeight: 120,
          renderWidth: 250,
          renderHeight: 250,
          frames: 4,
          duration: 650,
        },
      },
      { asset: '/simulation/enemies/old-guardian/attack-jump.png', frames: 7, duration: 720 },
    ],
    effects: {
      death: {
        asset: '/simulation/enemies/old-guardian/smoke-effect.png',
        frameWidth: 120,
        frameHeight: 120,
        renderWidth: 250,
        renderHeight: 250,
        frames: 5,
        duration: 900,
      },
    },
    combat: { attackRange: 186, preferredRange: 134, aggroRange: 820, moveSpeed: 72, windupMs: 610, recoveryMs: 660, damage: 9, lungeDistance: 34 },
  },
}

const BOSS_SPRITES: Record<BossSpriteId, ActorSprite> = {
  boss1: {
    id: 'boss1',
    accent: '#f07b4f',
    nativeFacing: -1,
    groundOffset: 32,
    frameWidth: 288,
    frameHeight: 160,
    renderWidth: 680,
    renderHeight: 378,
    assets: {
      idle: '/simulation/bosses/boss1/idle.png',
      run: '/simulation/bosses/boss1/run.png',
      attack: '/simulation/bosses/boss1/attack.png',
      hurt: '/simulation/bosses/boss1/hurt.png',
      death: '/simulation/bosses/boss1/death.png',
    },
    frames: { idle: 6, run: 12, attack: 15, hurt: 5, death: 22 },
    durations: { idle: 760, run: 600, attack: 840, hurt: 340, death: 1750 },
    combat: { attackRange: 225, preferredRange: 170, aggroRange: 900, moveSpeed: 116, windupMs: 640, recoveryMs: 620, damage: 11, lungeDistance: 12 },
  },
  boss2: {
    id: 'boss2',
    accent: '#ded07a',
    nativeFacing: 1,
    groundOffset: 28,
    frameWidth: 120,
    frameHeight: 120,
    renderWidth: 340,
    renderHeight: 340,
    assets: {
      idle: '/simulation/bosses/boss2/idle.png',
      run: '/simulation/bosses/boss2/run.png',
      attack: '/simulation/bosses/boss2/attack.png',
      hurt: '/simulation/bosses/boss2/hurt.png',
      death: '/simulation/bosses/boss2/death.png',
    },
    frames: { idle: 6, run: 6, attack: 10, hurt: 4, death: 5 },
    durations: { idle: 760, run: 540, attack: 820, hurt: 320, death: 1700 },
    combat: { attackRange: 198, preferredRange: 150, aggroRange: 860, moveSpeed: 124, windupMs: 620, recoveryMs: 620, damage: 10, lungeDistance: 10 },
  },
  boss3: {
    id: 'boss3',
    accent: '#b878ff',
    nativeFacing: -1,
    groundOffset: 20,
    frameWidth: 64,
    frameHeight: 64,
    renderWidth: 285,
    renderHeight: 285,
    assets: {
      idle: '/simulation/bosses/boss3/idle.png',
      run: '/simulation/bosses/boss3/run.png',
      attack: '/simulation/bosses/boss3/attack.png',
      hurt: '/simulation/bosses/boss3/hurt.png',
      death: '/simulation/bosses/boss3/death.png',
    },
    frames: { idle: 4, run: 4, attack: 5, hurt: 7, death: 10 },
    durations: { idle: 680, run: 500, attack: 760, hurt: 360, death: 1700 },
    combat: { attackRange: 172, preferredRange: 128, aggroRange: 880, moveSpeed: 138, windupMs: 560, recoveryMs: 660, damage: 9, lungeDistance: 10 },
  },
  boss4: {
    id: 'boss4',
    accent: '#74d9ff',
    nativeFacing: 1,
    groundOffset: 34,
    frameWidth: 320,
    frameHeight: 260,
    renderWidth: 450,
    renderHeight: 366,
    assets: {
      idle: '/simulation/bosses/boss4/idle.png',
      run: '/simulation/bosses/boss4/run.png',
      attack: '/simulation/bosses/boss4/attack.png',
      hurt: '/simulation/bosses/boss4/hurt.png',
      death: '/simulation/bosses/boss4/death.png',
    },
    frames: { idle: 4, run: 6, attack: 8, hurt: 4, death: 25 },
    durations: { idle: 780, run: 560, attack: 760, hurt: 320, death: 1850 },
    combat: { attackRange: 214, preferredRange: 162, aggroRange: 920, moveSpeed: 126, windupMs: 620, recoveryMs: 650, damage: 11, lungeDistance: 12 },
  },
  boss5: {
    id: 'boss5',
    accent: '#f2b85e',
    nativeFacing: 1,
    groundOffset: 22,
    frameWidth: 220,
    frameHeight: 198,
    renderWidth: 430,
    renderHeight: 387,
    assets: {
      idle: '/simulation/bosses/boss5/idle.png',
      run: '/simulation/bosses/boss5/run.png',
      attack: '/simulation/bosses/boss5/attack.png',
      hurt: '/simulation/bosses/boss5/hurt.png',
      death: '/simulation/bosses/boss5/death.png',
    },
    frames: { idle: 9, run: 9, attack: 8, hurt: 7, death: 9 },
    durations: { idle: 820, run: 600, attack: 860, hurt: 520, death: 1750 },
    combat: { attackRange: 218, preferredRange: 166, aggroRange: 920, moveSpeed: 112, windupMs: 700, recoveryMs: 720, damage: 12, lungeDistance: 10 },
  },
  boss6: {
    id: 'boss6',
    accent: '#9f7bff',
    nativeFacing: 1,
    groundOffset: 10,
    frameWidth: 80,
    frameHeight: 80,
    renderWidth: 318,
    renderHeight: 318,
    assets: {
      idle: '/simulation/bosses/boss6/idle.png',
      run: '/simulation/bosses/boss6/run.png',
      attack: '/simulation/bosses/boss6/attack.png',
      hurt: '/simulation/bosses/boss6/hurt.png',
      death: '/simulation/bosses/boss6/death.png',
    },
    frames: { idle: 5, run: 4, attack: 6, hurt: 4, death: 10 },
    durations: { idle: 740, run: 500, attack: 760, hurt: 320, death: 1650 },
    combat: { attackRange: 188, preferredRange: 136, aggroRange: 900, moveSpeed: 142, windupMs: 540, recoveryMs: 620, damage: 10, lungeDistance: 10 },
  },
  boss7: {
    id: 'boss7',
    accent: '#a6e15a',
    nativeFacing: 1,
    groundOffset: 20,
    groundOffsets: { attack: 99, death: 96 },
    frameWidth: 250,
    frameHeight: 250,
    renderWidth: 380,
    renderHeight: 380,
    assets: {
      idle: '/simulation/bosses/boss7/idle.png',
      run: '/simulation/bosses/boss7/run.png',
      attack: '/simulation/bosses/boss7/attack.png',
      hurt: '/simulation/bosses/boss7/hurt-stand.png',
      death: '/simulation/bosses/boss7/death.png',
    },
    frames: { idle: 21, run: 10, attack: 23, hurt: 4, death: 11 },
    durations: { idle: 820, run: 560, attack: 940, hurt: 360, death: 1550 },
    animationFrameRanges: {
      attack: { startFrame: 11, frameCount: 8, duration: 520 },
    },
    combat: { attackRange: 206, preferredRange: 152, aggroRange: 930, moveSpeed: 148, windupMs: 600, recoveryMs: 620, damage: 12, lungeDistance: 16, extraHitOffsets: [280], extraHitDamageMultiplier: 0.75 },
  },
  boss8: {
    id: 'boss8',
    accent: '#ba7dff',
    nativeFacing: 1,
    groundOffset: 8,
    frameWidth: 64,
    frameHeight: 64,
    renderWidth: 300,
    renderHeight: 300,
    assets: {
      idle: '/simulation/bosses/boss8/idle.png',
      run: '/simulation/bosses/boss8/run.png',
      attack: '/simulation/bosses/boss8/attack.png',
      hurt: '/simulation/bosses/boss8/hurt.png',
      death: '/simulation/bosses/boss8/death.png',
    },
    frames: { idle: 2, run: 2, attack: 13, hurt: 3, death: 14 },
    durations: { idle: 760, run: 520, attack: 900, hurt: 320, death: 1680 },
    combat: { attackRange: 210, preferredRange: 164, aggroRange: 940, moveSpeed: 156, windupMs: 560, recoveryMs: 640, damage: 11, lungeDistance: 10 },
  },
  boss9: {
    id: 'boss9',
    accent: '#ff8a3d',
    nativeFacing: 1,
    groundOffset: 4,
    frameWidth: 50,
    frameHeight: 50,
    renderWidth: 330,
    renderHeight: 330,
    assets: {
      idle: '/simulation/bosses/boss9/idle.png',
      run: '/simulation/bosses/boss9/run.png',
      attack: '/simulation/bosses/boss9/attack.png',
      hurt: '/simulation/bosses/boss9/hurt.png',
      death: '/simulation/bosses/boss9/death.png',
    },
    frames: { idle: 6, run: 6, attack: 8, hurt: 4, death: 6 },
    durations: { idle: 720, run: 500, attack: 820, hurt: 300, death: 1500 },
    animationFrameRanges: {
      run: { startFrame: 0, frameCount: 2, duration: 360 },
    },
    combat: { attackRange: 198, preferredRange: 148, aggroRange: 920, moveSpeed: 164, windupMs: 520, recoveryMs: 600, damage: 12, lungeDistance: 18 },
  },
  boss10: {
    id: 'boss10',
    accent: '#73d9ff',
    nativeFacing: 1,
    groundOffset: 8,
    frameWidth: 100,
    frameHeight: 100,
    renderWidth: 360,
    renderHeight: 360,
    assets: {
      idle: '/simulation/bosses/boss10/idle.png',
      run: '/simulation/bosses/boss10/run.png',
      attack: '/simulation/bosses/boss10/attack.png',
      hurt: '/simulation/bosses/boss10/hurt.png',
      death: '/simulation/bosses/boss10/death.png',
    },
    frames: { idle: 4, run: 8, attack: 10, hurt: 7, death: 14 },
    durations: { idle: 760, run: 540, attack: 900, hurt: 340, death: 1720 },
    combat: { attackRange: 220, preferredRange: 168, aggroRange: 950, moveSpeed: 140, windupMs: 620, recoveryMs: 700, damage: 13, lungeDistance: 12 },
  },
  boss11: {
    id: 'boss11',
    accent: '#37d9ff',
    nativeFacing: -1,
    groundOffset: 4,
    frameWidth: 131,
    frameHeight: 61,
    renderWidth: 540,
    renderHeight: 252,
    assets: {
      idle: '/simulation/bosses/boss11/idle.png',
      run: '/simulation/bosses/boss11/run.png',
      attack: '/simulation/bosses/boss11/attack.png',
      hurt: '/simulation/bosses/boss11/hurt.png',
      death: '/simulation/bosses/boss11/death.png',
    },
    frames: { idle: 8, run: 8, attack: 8, hurt: 4, death: 4 },
    durations: { idle: 760, run: 520, attack: 880, hurt: 340, death: 1680 },
    combat: { attackRange: 250, preferredRange: 190, aggroRange: 980, moveSpeed: 150, windupMs: 600, recoveryMs: 690, damage: 15, lungeDistance: 14 },
  },
}

const PROJECT_BOSS_SPRITE_IDS: Record<number, keyof typeof BOSS_SPRITES> = {
  1: 'boss1',
  2: 'boss2',
  3: 'boss3',
  4: 'boss4',
  5: 'boss5',
  6: 'boss6',
  7: 'boss7',
  8: 'boss8',
  9: 'boss9',
  10: 'boss10',
  11: 'boss11',
}

const LATE_CHAPTER_START_PROJECT_ID = 6
const BASE_ELITE_ENEMY_FORMS: EliteEnemyForm[] = ['eliteGoblin1', 'eliteGoblin2', 'eliteGoblin3', 'eliteGolem']
const LATE_CHAPTER_ELITE_FORMS: EliteEnemyForm[] = ['oldGolem', 'oldGuardian']
const ELITE_ENEMY_FORMS: EliteEnemyForm[] = [...BASE_ELITE_ENEMY_FORMS, ...LATE_CHAPTER_ELITE_FORMS]
const ELITE_ENEMY_SPRITE_SCALE = 1.16

function isEliteEnemyForm(form: EnemyForm): form is EliteEnemyForm {
  return ELITE_ENEMY_FORMS.includes(form as EliteEnemyForm)
}

function isHeavyEliteEnemyForm(form: EnemyForm) {
  return form === 'eliteGolem' || form === 'oldGolem'
}

function enemyDefaultSpriteScale(form: EnemyForm) {
  return isEliteEnemyForm(form) ? ELITE_ENEMY_SPRITE_SCALE : 1
}

const ENEMY_ACTION_SPRITE_SCALE: Partial<Record<EnemyForm, Partial<Record<ActorAnimation, number>>>> = {}

function enemyActionSpriteScale(form: EnemyForm, animation: ActorAnimation) {
  return ENEMY_ACTION_SPRITE_SCALE[form]?.[animation] ?? 1
}

function isLateChapterProjectId(projectId: number) {
  return projectId >= LATE_CHAPTER_START_PROJECT_ID
}

function eliteEnemyFormForProject(projectId: number): EliteEnemyForm {
  const forms = isLateChapterProjectId(projectId) ? LATE_CHAPTER_ELITE_FORMS : BASE_ELITE_ENEMY_FORMS
  const index = isLateChapterProjectId(projectId)
    ? Math.abs(projectId - LATE_CHAPTER_START_PROJECT_ID) % forms.length
    : Math.abs(projectId - 1) % forms.length
  return forms[index]
}

function lateChapterEliteFormForSlot(slot: number): EliteEnemyForm {
  return LATE_CHAPTER_ELITE_FORMS[Math.abs(slot) % LATE_CHAPTER_ELITE_FORMS.length]
}

function enemyAttackVariant(model: ActorSprite, enemy: EnemyState) {
  if (!model.attackVariants?.length) return null
  const variantIndex = Math.floor(Math.max(0, enemy.attackSequence - 1) / 2) % model.attackVariants.length
  return model.attackVariants[variantIndex]
}

function actorAnimationStyle(sprite: ActorSprite, animation: ActorAnimation, scale = 1) {
  const totalFrameCount = Math.max(1, sprite.frames[animation] ?? sprite.frames.idle)
  const frameRange = sprite.animationFrameRanges?.[animation]
  const requestedStartFrame = Math.max(0, Math.floor(frameRange?.startFrame ?? 0))
  const frameStart = Math.min(requestedStartFrame, Math.max(0, totalFrameCount - 1))
  const maxPlayableFrames = Math.max(1, totalFrameCount - frameStart)
  const frameCount = Math.max(1, Math.min(Math.floor(frameRange?.frameCount ?? totalFrameCount), maxPlayableFrames))
  const frameSteps = Math.max(1, frameCount - 1)
  const renderWidth = Math.round(sprite.renderWidth * scale)
  const renderHeight = Math.round(sprite.renderHeight * scale)
  const frameTravel = frameCount > 1 ? -(renderWidth * (frameCount - 1)) : 0
  const frameStartOffset = -(renderWidth * frameStart)
  const duration = frameRange?.duration
    ?? sprite.durations?.[animation]
    ?? (animation === 'idle' ? 760 : animation === 'run' ? 620 : animation === 'attack' ? 560 : animation === 'hurt' ? 320 : 860)
  return {
    sheet: sprite.assets[animation],
    frameWidth: renderWidth,
    frameHeight: renderHeight,
    sheetWidth: renderWidth * totalFrameCount,
    frameStart: frameStartOffset,
    frameTravel,
    frameCount,
    frameSteps,
    accent: sprite.accent,
    duration,
    iteration: animation === 'idle' || animation === 'run' ? 'infinite' : '1',
  }
}

function actorEffectStyle(effect: ActorEffect) {
  const frameCount = Math.max(1, effect.frames)
  const frameSteps = Math.max(1, frameCount - 1)
  const frameTravel = frameCount > 1 ? -(effect.renderWidth * (frameCount - 1)) : 0
  return {
    asset: effect.asset,
    frameWidth: effect.renderWidth,
    frameHeight: effect.renderHeight,
    sheetWidth: effect.renderWidth * frameCount,
    frameTravel,
    frameCount,
    frameSteps,
    duration: effect.duration ?? 620,
    groundOffset: effect.groundOffset ?? 0,
    xOffset: effect.xOffset ?? 0,
  }
}

const CINEMATIC_BOSS_SCALES: Record<number, number> = {
  1: 0.76,
  2: 1.05,
  3: 1.2,
  4: 0.92,
  5: 0.9,
  6: 1.14,
  7: 0.9,
  8: 1.18,
  9: 1.18,
  10: 1.08,
  11: 1.32,
}

function cinematicBossSpriteStyle(projectId: number) {
  const model = BOSS_SPRITES[PROJECT_BOSS_SPRITE_IDS[projectId] ?? 'boss1']
  const scale = CINEMATIC_BOSS_SCALES[projectId] ?? 1
  const sprite = actorAnimationStyle(model, 'idle', scale)
  const spriteFace = -1 * (model.nativeFacing ?? 1)
  return {
    '--enemy-sheet': `url("${sprite.sheet}")`,
    '--enemy-frame-width': `${sprite.frameWidth}px`,
    '--enemy-frame-height': `${sprite.frameHeight}px`,
    '--enemy-sheet-width': `${sprite.sheetWidth}px`,
    '--enemy-frame-start': `${sprite.frameStart}px`,
    '--enemy-frame-travel': `${sprite.frameTravel}px`,
    '--enemy-frame-count': sprite.frameCount,
    '--enemy-frame-steps': sprite.frameSteps,
    '--enemy-accent': sprite.accent,
    '--enemy-animation-duration': `${sprite.duration}ms`,
    '--enemy-animation-iteration': sprite.iteration,
    '--enemy-sprite-face': spriteFace,
    '--enemy-ground-adjust': `${-Math.round((model.groundOffset ?? 0) * scale)}px`,
    '--story-boss-ground-shift': `${Math.round((model.groundOffset ?? 0) * scale)}px`,
    '--bot-core': sprite.accent,
  } as CSSProperties
}

function cinematicBossFrameImage(projectId: number) {
  const bossId = PROJECT_BOSS_SPRITE_IDS[projectId] ?? 'boss1'
  return `/simulation/cinematic/${bossId}-frame.png`
}

function cinematicBossFrameFace(projectId: number) {
  const bossId = PROJECT_BOSS_SPRITE_IDS[projectId] ?? 'boss1'
  const model = BOSS_SPRITES[bossId]
  return -1 * (model.nativeFacing ?? 1)
}

function enemySpriteModel(enemy: EnemyState, projectId: number) {
  if (enemy.kind === 'boss' || enemy.form === 'boss') {
    return BOSS_SPRITES[enemy.bossSpriteId ?? PROJECT_BOSS_SPRITE_IDS[projectId] ?? 'boss1']
  }
  if (enemy.form === 'eliteGoblin1') return ENEMY_SPRITES.eliteGoblin1
  if (enemy.form === 'eliteGoblin2') return ENEMY_SPRITES.eliteGoblin2
  if (enemy.form === 'eliteGoblin3') return ENEMY_SPRITES.eliteGoblin3
  if (enemy.form === 'eliteGolem') return ENEMY_SPRITES.eliteGolem
  if (enemy.form === 'oldGolem') return ENEMY_SPRITES.oldGolem
  if (enemy.form === 'oldGuardian') return ENEMY_SPRITES.oldGuardian
  if (enemy.form === 'tank') return ENEMY_SPRITES.goblinTank
  if (enemy.form === 'flying') return ENEMY_SPRITES.flyingDemon
  if (enemy.attackStyle === 'ranged') return ENEMY_SPRITES.goblinArcher
  if (enemy.form === 'virus') return ENEMY_SPRITES.cacodaemon
  return ENEMY_SPRITES.goblinScout
}

function enemySpriteAnimationModel(enemy: EnemyState, projectId: number, animation: ActorAnimation) {
  const model = enemySpriteModel(enemy, projectId)
  if (animation !== 'attack' || !model.attackVariants?.length) return model
  const variant = enemyAttackVariant(model, enemy)
  if (!variant) return model
  return {
    ...model,
    assets: {
      ...model.assets,
      attack: variant.asset,
    },
    frames: {
      ...model.frames,
      attack: variant.frames,
    },
    durations: {
      ...model.durations,
      attack: variant.duration ?? model.durations?.attack,
    },
    animationFrameRanges: {
      ...model.animationFrameRanges,
      attack: variant.startFrame || variant.frameCount
        ? {
            startFrame: variant.startFrame,
            frameCount: variant.frameCount,
            duration: variant.duration,
          }
        : model.animationFrameRanges?.attack,
    },
  } satisfies ActorSprite
}

function enemyAnimationFor(enemy: EnemyState): ActorAnimation {
  const now = performance.now()
  if (enemy.defeated) return 'death'
  if (enemy.windupUntil > now || enemy.attackingUntil > now) return 'attack'
  if (enemy.hitUntil > now) return 'hurt'
  if (enemy.moving) return 'run'
  return 'idle'
}

function enemySpriteStyle(enemy: EnemyState, projectId: number, animation: ActorAnimation) {
  const model = enemySpriteAnimationModel(enemy, projectId, animation)
  const spriteScale = (enemy.spriteScale ?? enemyDefaultSpriteScale(enemy.form)) * enemyActionSpriteScale(enemy.form, animation)
  const sprite = actorAnimationStyle(model, animation, spriteScale)
  const spriteFace = enemy.facing * (model.nativeFacing ?? 1)
  const groundScale = (isEliteEnemyForm(enemy.form) ? model.renderHeight / Math.max(1, model.frameHeight) : 1) * spriteScale
  const groundAdjust = Math.round((model.groundOffsets?.[animation] ?? model.groundOffset ?? 0) * groundScale)
  return {
    '--enemy-sheet': `url("${sprite.sheet}")`,
    '--enemy-frame-width': `${sprite.frameWidth}px`,
    '--enemy-frame-height': `${sprite.frameHeight}px`,
    '--enemy-sheet-width': `${sprite.sheetWidth}px`,
    '--enemy-frame-start': `${sprite.frameStart}px`,
    '--enemy-frame-travel': `${sprite.frameTravel}px`,
    '--enemy-frame-count': sprite.frameCount,
    '--enemy-frame-steps': sprite.frameSteps,
    '--enemy-accent': sprite.accent,
    '--enemy-animation-duration': `${sprite.duration}ms`,
    '--enemy-animation-iteration': sprite.iteration,
    '--enemy-sprite-face': spriteFace,
    '--enemy-ground-adjust': `${-groundAdjust}px`,
    '--enemy-lunge-distance': `${enemy.facing * (model.combat?.lungeDistance ?? 18)}px`,
    '--bot-core': sprite.accent,
  } as CSSProperties
}

function enemySpriteEffectStyle(enemy: EnemyState, projectId: number, animation: ActorAnimation) {
  const model = enemySpriteModel(enemy, projectId)
  const effect = animation === 'attack'
    ? enemyAttackVariant(model, enemy)?.effect ?? model.effects?.[animation]
    : model.effects?.[animation]
  if (!effect) return null
  const spriteFace = enemy.facing * (model.nativeFacing ?? 1)
  const style = actorEffectStyle(effect)
  return {
    '--enemy-effect-sheet': `url("${style.asset}")`,
    '--enemy-effect-frame-width': `${style.frameWidth}px`,
    '--enemy-effect-frame-height': `${style.frameHeight}px`,
    '--enemy-effect-sheet-width': `${style.sheetWidth}px`,
    '--enemy-effect-frame-travel': `${style.frameTravel}px`,
    '--enemy-effect-frame-count': style.frameCount,
    '--enemy-effect-frame-steps': style.frameSteps,
    '--enemy-effect-duration': `${style.duration}ms`,
    '--enemy-effect-ground-adjust': `${-style.groundOffset}px`,
    '--enemy-effect-x-offset': `${Math.round(style.xOffset * spriteFace)}px`,
    '--enemy-effect-face': spriteFace,
  } as CSSProperties
}

function enemyCombatProfile(enemy: EnemyState, projectId: number) {
  const model = enemySpriteModel(enemy, projectId)
  if (model.combat) return model.combat
  const profiles: Partial<Record<EnemyForm, NonNullable<ActorSprite['combat']>>> = {
    virus: { attackRange: 124, preferredRange: 96, aggroRange: 660, moveSpeed: 86, windupMs: 520, recoveryMs: 610, damage: 4, lungeDistance: 20 },
    defect: { attackRange: 142, preferredRange: 108, aggroRange: 700, moveSpeed: 72, windupMs: 580, recoveryMs: 650, damage: 5, lungeDistance: 24 },
    glitch: { attackRange: 124, preferredRange: 360, aggroRange: 780, moveSpeed: 74, windupMs: 560, recoveryMs: 660, damage: 5, lungeDistance: 18 },
    wraith: { attackRange: 154, preferredRange: 118, aggroRange: 740, moveSpeed: 76, windupMs: 560, recoveryMs: 650, damage: 5, lungeDistance: 28 },
  }
  return profiles[enemy.form] ?? profiles.defect!
}

function enemyAttackIntervalMs(enemy: EnemyState) {
  if (enemy.kind === 'boss') return 3000
  if (isEliteEnemyForm(enemy.form)) return isHeavyEliteEnemyForm(enemy.form) ? 3900 : enemy.form === 'oldGuardian' ? 3600 : 3400
  if (enemy.form === 'tank') return 3700
  if (enemy.attackStyle === 'ranged') return 3800
  return ENEMY_ATTACK_INTERVAL_MS
}

function weaponInventoryIcon(weaponId: string) {
  if (weaponId === UNARMED_WEAPON.id) return '/simulation/sprites/light-weapons.png'
  return `/simulation/inventory/${weaponId}.png`
}

function enemyProjectileColor(enemy: EnemyState) {
  if (enemy.kind === 'boss') return '#f2c86b'
  if (enemy.form === 'glitch') return '#70d6ff'
  if (enemy.form === 'wraith') return '#b78cff'
  if (enemy.form === 'virus') return '#9fe870'
  return '#ff8d6b'
}

function enemyProjectileKind(enemy: EnemyState): ProjectileKind {
  if (enemy.form === 'flying') return 'flyingFireball'
  if (enemy.kind === 'boss' || enemy.form === 'virus' || enemy.form === 'wraith') return 'fireball'
  return 'arrow'
}

function playerMeleeReach(model: PlayerModel, phase = 1) {
  const modelReach = Math.round(clamp(model.renderWidth * 0.14, 24, 52))
  return PLAYER_ACTION_RANGE + modelReach + Math.min(5, Math.max(0, phase - 1)) * PLAYER_COMBO_REACH_BONUS
}

function enemyMeleeContactPadding(enemy: EnemyState, projectId: number) {
  if (enemy.kind !== 'boss') return 0
  const model = enemySpriteModel(enemy, projectId)
  const spriteScale = enemy.spriteScale ?? enemyDefaultSpriteScale(enemy.form)
  const visualWidth = model.renderWidth * spriteScale
  return Math.round(clamp(visualWidth * 0.32, 54, enemy.id === 'final-boss' ? 230 : 160))
}

function playerRollDistance(model: PlayerModel) {
  if (model.id === 'black-knight') return 220
  return ROLL_DISTANCE
}

function itemMeta(item: GameItemId) {
  const meta: Record<GameItemId, { title: string; key?: string; detail: string }> = {
    heal: { title: '急救包', key: 'Q', detail: `恢复 ${HEAL_ITEM_AMOUNT} 点生命` },
    boost: { title: '增幅器', detail: `接下来 ${BOOST_ATTACKS} 次攻击伤害提升` },
    skip: { title: '跳题卡', key: 'R', detail: '质量判断中跳过并造成固定伤害' },
  }
  return meta[item]
}

function floatingTextClass(kind: FloatingTextKind) {
  const classes: Record<FloatingTextKind, string> = {
    damage: styles.floatingDamage,
    heal: styles.floatingHeal,
    block: styles.floatingBlock,
    miss: styles.floatingMiss,
    shock: styles.floatingShock,
    radiant: styles.floatingRadiant,
    guard: styles.floatingGuard,
    trace: styles.floatingTrace,
    rupture: styles.floatingRupture,
  }
  return classes[kind]
}

function enemyHeroEffectClass(kind: HeroHitEffectKind) {
  const classes: Record<HeroHitEffectKind, string> = {
    sunder: styles.heroEffectSunder,
    radiant: styles.heroEffectRadiant,
    guardBreak: styles.heroEffectGuardBreak,
    trace: styles.heroEffectTrace,
    fireBurn: styles.heroEffectFireBurn,
    storm: styles.heroEffectStorm,
  }
  return classes[kind]
}

function movementModeLabel(mode: MovementMode) {
  const labels: Record<MovementMode, string> = {
    idle: '待机',
    walk: '移动',
    sprint: '冲刺',
    roll: '翻滚',
  }
  return labels[mode]
}

function laneBottom(lane: number) {
  const clampedLane = clamp(lane, 0, LANE_BOTTOMS.length - 1)
  const lower = Math.floor(clampedLane)
  const upper = Math.ceil(clampedLane)
  if (lower === upper) return LANE_BOTTOMS[lower]
  const progress = clampedLane - lower
  return LANE_BOTTOMS[lower] + (LANE_BOTTOMS[upper] - LANE_BOTTOMS[lower]) * progress
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

function resolveTeamSyncUrl() {
  if (TEAM_SYNC_CONFIG_URL) return TEAM_SYNC_CONFIG_URL
  if (typeof window === 'undefined' || !window.location.hostname) return ''
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:'
  return `${protocol}//${window.location.hostname}:3011`
}

function remoteInterpolationDelay(samples: RemotePositionSample[] | undefined, baseDelay: number) {
  if (!samples || samples.length < 3) return baseDelay
  const recentSamples = samples.slice(-6)
  const gaps: number[] = []
  for (let index = 1; index < recentSamples.length; index += 1) {
    const gap = recentSamples[index].at - recentSamples[index - 1].at
    if (gap > 0 && gap < REMOTE_INTERPOLATION_SAMPLE_TTL_MS) gaps.push(gap)
  }
  if (!gaps.length) return baseDelay
  const averageGap = gaps.reduce((total, gap) => total + gap, 0) / gaps.length
  return clamp(Math.round(averageGap * 1.15), baseDelay, 260)
}

function laneFromBottom(bottomDistance: number) {
  if (bottomDistance >= LANE_BOTTOMS[0]) return 0
  const lastIndex = LANE_BOTTOMS.length - 1
  if (bottomDistance <= LANE_BOTTOMS[lastIndex]) return lastIndex

  for (let index = 0; index < lastIndex; index += 1) {
    const top = LANE_BOTTOMS[index]
    const bottom = LANE_BOTTOMS[index + 1]
    if (bottomDistance <= top && bottomDistance >= bottom) {
      const progress = (top - bottomDistance) / (top - bottom)
      return index + progress
    }
  }

  return 1
}

function lanePixelDistance(a: number, b: number) {
  return Math.abs(laneBottom(a) - laneBottom(b))
}

function isCloseLane(a: number, b: number) {
  return lanePixelDistance(a, b) <= COMBAT_LANE_DISTANCE
}

function chapterRoomOrder(room: ChapterRoomKind) {
  if (room === 'hall') return 0
  if (room === 'corridor') return 1
  return 2
}

function isChapterRoomProjectId(projectId: number) {
  return projectId >= 1 && projectId <= 10
}

function isExtendedChapterProjectId(projectId: number) {
  return projectId >= 1 && projectId <= 10
}

function chapterRoomWidthForProject(projectId: number) {
  return isExtendedChapterProjectId(projectId) ? EXTENDED_CHAPTER_ROOM_WIDTH : CHAPTER_ROOM_WIDTH
}

function chapterRoomExitX(projectId: number) {
  return chapterRoomWidthForProject(projectId) - CHAPTER_ROOM_EXIT_OFFSET
}

function chapterGateReadyX(projectId: number) {
  return chapterRoomExitX(projectId) - CHAPTER_GATE_READY_OFFSET - CHAPTER_GATE_RENDER_OFFSET
}

function chapterGateRenderX(projectId: number) {
  return chapterGateReadyX(projectId)
}

function chapterDefectEnemiesPerRoom(projectId: number) {
  if (projectId === 11) return 8
  if (isExtendedChapterProjectId(projectId)) return 7
  return 5
}

function isBossRushProjectId(projectId: number) {
  return projectId === 11
}

const FINAL_BOSS_RUSH_ROSTER: Array<{ projectId: number; bossSpriteId: BossSpriteId; title: string; defect: string; accentForm: EnemyForm }> = [
  { projectId: 1, bossSpriteId: 'boss1', title: '盲试炼金师', defect: '中试前风险评估缺口', accentForm: 'virus' },
  { projectId: 2, bossSpriteId: 'boss2', title: '残留审判者', defect: '清洁验证最差条件缺口', accentForm: 'tank' },
  { projectId: 3, bossSpriteId: 'boss3', title: '委托裂隙', defect: '委托责任边界缺口', accentForm: 'glitch' },
  { projectId: 4, bossSpriteId: 'boss4', title: '冷链破温者', defect: '运输温度偏差缺口', accentForm: 'flying' },
  { projectId: 5, bossSpriteId: 'boss5', title: '电子记录失控核心', defect: 'eBRS 上线验证缺口', accentForm: 'tank' },
  { projectId: 6, bossSpriteId: 'boss6', title: '删迹主控', defect: '数据完整性审计缺口', accentForm: 'glitch' },
  { projectId: 7, bossSpriteId: 'boss7', title: '无效闭环', defect: 'CAPA 有效性缺口', accentForm: 'eliteGoblin1' },
  { projectId: 8, bossSpriteId: 'boss8', title: '微粒军团长', defect: '无菌屏障暴露缺口', accentForm: 'flying' },
  { projectId: 9, bossSpriteId: 'boss9', title: '逆压风暴眼', defect: 'HVAC 压差边界缺口', accentForm: 'eliteGoblin2' },
  { projectId: 10, bossSpriteId: 'boss10', title: '未控变更王', defect: '变更评估闭环缺口', accentForm: 'eliteGolem' },
]

const ENDLESS_SURVIVAL_FORMS: EnemyForm[] = ['virus', 'defect', 'glitch', 'wraith', 'tank', 'flying', ...ELITE_ENEMY_FORMS]

function seededRatio(seed: number) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return value - Math.floor(value)
}

function shuffleBySeed<T>(items: T[], seed: number) {
  return [...items].sort((left, right) => seededRatio(seed + items.indexOf(left) * 17) - seededRatio(seed + items.indexOf(right) * 17))
}

function endlessSurvivalReward(enemy: EnemyState, stage: number) {
  if (enemy.kind === 'boss') {
    return {
      coins: 130 + stage * 24,
      gems: 4 + Math.floor(stage / 2),
    }
  }
  const elite = isEliteEnemyForm(enemy.form) || enemy.form === 'tank'
  return {
    coins: (elite ? 42 : 24) + stage * (elite ? 7 : 4),
    gems: elite ? 1 + Math.floor(stage / 6) : stage % 4 === 0 ? 1 : 0,
  }
}

function buildEndlessSurvivalEnemies(project: Project2d, stage: number): EnemyState[] {
  const stageSeed = Math.max(1, Math.round(stage))
  const scenes = project.scenes.length ? project.scenes : [
    { id: 'endless-risk', number: 1, title: '体系裂隙', defect: '无源头质量风险', objective: '清理随机异常' },
  ]
  const forms = shuffleBySeed(ENDLESS_SURVIVAL_FORMS, stageSeed * 29)
  const lanes = shuffleBySeed([0, 1, 2, 0, 1, 2, 1, 0], stageSeed * 41)
  const enemies: EnemyState[] = forms.slice(0, ENDLESS_SURVIVAL_MINION_COUNT).map((form, index) => {
    const scene = scenes[(stageSeed + index - 1) % scenes.length]
    const isElite = isEliteEnemyForm(form)
    const isTank = form === 'tank'
    const isFlying = form === 'flying'
    const baseHp = isHeavyEliteEnemyForm(form) ? 330 : isElite ? 270 : isTank ? 190 : isFlying ? 140 : 155
    const hp = Math.round(baseHp + stageSeed * (isElite ? 24 : isTank ? 20 : 15))
    const xJitter = Math.round((seededRatio(stageSeed * 101 + index * 13) - 0.5) * 120)
    return {
      id: `endless-${stageSeed}-minion-${index + 1}`,
      title: isElite ? `精英 ${scene.title}` : scene.title,
      defect: isElite ? `精英 ${scene.defect}` : scene.defect,
      objective: scene.objective,
      sceneNumber: stageSeed,
      chapterTitle: `无尽第 ${stageSeed} 层`,
      kind: 'defect' as const,
      form,
      attackStyle: isFlying || form === 'glitch' ? 'ranged' as const : 'melee' as const,
      projectileHeight: isFlying || form === 'glitch' ? 'high' as const : 'low' as const,
      hp,
      maxHp: hp,
      x: 720 + index * 520 + xJitter,
      lane: lanes[index] ?? index % 3,
      facing: -1 as const,
      moving: false,
      quizCharge: 0,
      quizEvery: isElite || isTank ? 6 : 4 + (index % 2),
      hitUntil: 0,
      windupUntil: 0,
      attackingUntil: 0,
      attackSequence: 0,
      defeated: false,
      deathUntil: 0,
    }
  })
  const bossEntry = stageSeed % 11 === 0
    ? { bossSpriteId: 'boss11' as BossSpriteId, title: project.bossName, defect: project.bossTitle }
    : FINAL_BOSS_RUSH_ROSTER[(stageSeed - 1) % FINAL_BOSS_RUSH_ROSTER.length]
  const bossHp = Math.round(620 + stageSeed * 72)
  enemies.push({
    id: `endless-${stageSeed}-boss`,
    title: `${bossEntry.title} Lv.${stageSeed}`,
    defect: bossEntry.defect,
    objective: `击破第 ${stageSeed} 层 Boss`,
    sceneNumber: stageSeed,
    chapterTitle: `无尽第 ${stageSeed} 层 Boss`,
    kind: 'boss',
    form: 'boss',
    attackStyle: stageSeed % 3 === 0 ? 'ranged' : 'melee',
    projectileHeight: 'high',
    hp: bossHp,
    maxHp: bossHp,
    x: FINAL_CHAPTER_STAGE_BOSS_X,
    lane: 1,
    facing: -1,
    moving: false,
    quizCharge: 0,
    quizEvery: 5,
    hitUntil: 0,
    windupUntil: 0,
    attackingUntil: 0,
    attackSequence: 0,
    defeated: false,
    deathUntil: 0,
    bossSpriteId: bossEntry.bossSpriteId,
    spriteScale: stageSeed % 11 === 0 ? 1.18 : 0.88,
  })
  return enemies
}

function buildInitialEnemies(project: Project2d, options: { endlessSurvival?: boolean; endlessStage?: number } = {}): EnemyState[] {
  if (options.endlessSurvival) return buildEndlessSurvivalEnemies(project, options.endlessStage ?? 1)
  return buildProjectInitialEnemies(project)
}

function buildFinalBossRushEnemies(project: Project2d): EnemyState[] {
  const enemies: EnemyState[] = []
  FINAL_BOSS_RUSH_ROSTER.forEach((entry, index) => {
    const sceneSeed = project.scenes[index % Math.max(1, project.scenes.length)]
    const firstForm = index % 2 === 0 ? 'defect' : 'virus'
    const eliteForm = eliteEnemyFormForProject(entry.projectId)
    const guards: Array<{ form: EnemyForm; x: number; lane: number }> = [
      { form: firstForm, x: 760, lane: index % 3 },
      { form: entry.accentForm, x: 1240, lane: (index + 2) % 3 },
      { form: index % 2 === 0 ? 'glitch' : 'wraith', x: 1780, lane: (index + 1) % 3 },
      { form: index % 3 === 0 ? 'flying' : 'virus', x: 2360, lane: index % 2 === 0 ? 0 : 2 },
      { form: index % 3 === 1 ? 'tank' : 'defect', x: 3060, lane: (index + 1) % 3 },
      { form: entry.accentForm === 'flying' ? 'glitch' : 'flying', x: 3720, lane: (index + 2) % 3 },
      { form: eliteForm, x: 4540, lane: 1 },
    ]
    guards.forEach(({ form, x, lane }, formIndex) => {
      const isElite = isEliteEnemyForm(form)
      const hp = isHeavyEliteEnemyForm(form) ? 360 : isElite ? 295 : form === 'tank' ? 190 : form === 'flying' ? 145 : 165
      enemies.push({
        id: `final-rush-minion-${entry.projectId}-${formIndex}`,
        title: isElite ? `${entry.title} 精英守卫` : `${entry.title} 前哨`,
        defect: formIndex === 0 ? sceneSeed?.defect ?? entry.defect : entry.defect,
        objective: formIndex === 0 ? sceneSeed?.objective ?? '补齐前置证据' : isElite ? '击破精英风险守卫' : '清理 Boss 前置风险信号',
        sceneNumber: index + 1,
        chapterTitle: `第 ${entry.projectId} 关回溯`,
        kind: 'defect',
        form,
        attackStyle: form === 'flying' ? 'ranged' : 'melee',
        projectileHeight: form === 'flying' ? 'high' : 'low',
        hp,
        maxHp: hp,
        x,
        lane,
        facing: -1,
        moving: false,
        quizCharge: 0,
        quizEvery: isElite ? 5 : 4,
        hitUntil: 0,
        windupUntil: 0,
        attackingUntil: 0,
        attackSequence: 0,
        defeated: false,
        deathUntil: 0,
      })
    })
    enemies.push({
      id: `final-rush-boss-${entry.projectId}`,
      title: entry.title,
      defect: entry.defect,
      objective: `击破第 ${entry.projectId} 关 Boss 复现体`,
      sceneNumber: index + 1,
      chapterTitle: `第 ${entry.projectId} 关 Boss`,
      kind: 'boss',
      form: 'boss',
      attackStyle: 'melee',
      projectileHeight: 'high',
      hp: 520,
      maxHp: 520,
      x: FINAL_CHAPTER_STAGE_BOSS_X,
      lane: 1,
      facing: -1,
      moving: false,
      quizCharge: 0,
      quizEvery: 5,
      hitUntil: 0,
      windupUntil: 0,
      attackingUntil: 0,
      attackSequence: 0,
      defeated: false,
      deathUntil: 0,
      bossSpriteId: entry.bossSpriteId,
      spriteScale: 0.82,
    })
  })
  const finalForms: EnemyForm[] = ['glitch', 'wraith', 'flying', 'tank', ...ELITE_ENEMY_FORMS, 'flying', 'glitch']
  finalForms.forEach((form, index) => {
    const isElite = isEliteEnemyForm(form)
    const hp = isHeavyEliteEnemyForm(form) ? 430 : isElite ? 350 : form === 'tank' ? 220 : form === 'flying' ? 170 : 190
    enemies.push({
      id: `final-rush-elite-gate-${index + 1}`,
      title: isElite ? '最终门前精英' : '终审门前守卫',
      defect: isElite ? '体系终审前置精英风险' : '终审前置风险信号',
      objective: isElite ? '清理最终 Boss 前的精英守卫' : '压制最终 Boss 前的系统风险',
      sceneNumber: 11,
      chapterTitle: '第 11 关 · 最终门',
      kind: 'defect',
      form,
      attackStyle: form === 'flying' ? 'ranged' : 'melee',
      projectileHeight: form === 'flying' ? 'high' : 'low',
      hp,
      maxHp: hp,
      x: 720 + index * 400,
      lane: [0, 2, 1, 0, 2, 1, 0, 2, 1, 0, 2, 1][index] ?? 1,
      facing: -1,
      moving: false,
      quizCharge: 0,
      quizEvery: 5,
      hitUntil: 0,
      windupUntil: 0,
      attackingUntil: 0,
      attackSequence: 0,
      defeated: false,
      deathUntil: 0,
    })
  })
  enemies.push({
    id: 'final-boss',
    title: project.bossName,
    defect: project.bossTitle,
    objective: project.riskSignal,
    chapterTitle: '第 11 关 · 体系终审',
    sceneNumber: 11,
    kind: 'boss',
    form: 'boss',
    attackStyle: 'melee',
    projectileHeight: 'high',
    hp: 1800,
    maxHp: 1800,
    x: FINAL_CHAPTER_STAGE_BOSS_X,
    lane: 1,
    facing: -1,
    moving: false,
    quizCharge: 0,
    quizEvery: 4,
    hitUntil: 0,
    windupUntil: 0,
    attackingUntil: 0,
    attackSequence: 0,
    defeated: false,
    deathUntil: 0,
    bossSpriteId: 'boss11',
    spriteScale: 1.28,
  })
  return enemies
}

function buildProjectInitialEnemies(project: Project2d): EnemyState[] {
  const isCastleChapter = isChapterRoomProjectId(project.id)
  if (isBossRushProjectId(project.id)) return buildFinalBossRushEnemies(project)
  const chapterEnemiesPerRoom = chapterDefectEnemiesPerRoom(project.id)
  const targetDefectCount = isCastleChapter ? chapterEnemiesPerRoom * 3 : 8
  const sceneSeeds = project.scenes.slice(0, targetDefectCount)
  const fallbackScenes: SceneDefect[] = [
    { id: 'scene-f1', number: 1, title: '记录缺口', defect: '记录缺失', objective: '补齐关键记录' },
    { id: 'scene-f2', number: 2, title: '数据雾区', defect: '审计追踪异常', objective: '保全电子数据' },
    { id: 'scene-f3', number: 3, title: '现场偏差', defect: '工艺参数超限', objective: '判断批次影响' },
    { id: 'scene-f4', number: 4, title: '物料追踪', defect: '供应商变更未评估', objective: '扩展调查范围' },
    { id: 'scene-f5', number: 5, title: '闭环断点', defect: 'CAPA 有效性不足', objective: '验证整改闭环' },
    { id: 'scene-f6', number: 6, title: '屏障缺口', defect: '隔离措施执行不足', objective: '补强现场屏障' },
    { id: 'scene-f7', number: 7, title: '异常回声', defect: '远程风险信号未跟进', objective: '追踪异常来源' },
    { id: 'scene-f8', number: 8, title: '终点巡检', defect: '放行前复核遗漏', objective: '完成最终复核' },
  ]
  const seedPool = sceneSeeds.length ? [...sceneSeeds, ...fallbackScenes] : fallbackScenes
  const seeds = Array.from({ length: targetDefectCount }, (_, index) => {
    const seed = seedPool[index % seedPool.length]
    return {
      ...seed,
      number: index + 1,
      id: `${seed.id}-${index + 1}`,
    }
  })
  const chapterXSlots = project.id === 11
    ? [520, 900, 1280, 1680, 2100, 2520, 2960, 3400]
    : [560, 980, 1400, 1840, 2280, 2820, 3360]
  const chapterLaneSlots = project.id === 11
    ? [1, 0, 2, 1, 0, 2, 1, 2]
    : [1, 0, 2, 1, 0, 2, 1]
  const xPositions = isCastleChapter
    ? Array.from({ length: targetDefectCount }, (_, index) => chapterXSlots[index % chapterEnemiesPerRoom])
    : [720, 1360, 2020, 2680, 3340, 4020, 4700, 5160]
  const lanes = isCastleChapter
    ? Array.from({ length: targetDefectCount }, (_, index) => chapterLaneSlots[index % chapterEnemiesPerRoom])
    : [1, 0, 2, 1, 0, 2, 1, 0]
  const rooms: ChapterRoomKind[] = isCastleChapter
    ? Array.from({ length: targetDefectCount }, (_, index) => (
      index < chapterEnemiesPerRoom ? 'hall' : index < chapterEnemiesPerRoom * 2 ? 'corridor' : 'dungeon'
    ))
    : []
  const castleForms: EnemyForm[] = project.id === 11
    ? ['defect', 'flying', 'tank', 'virus', 'glitch', 'wraith', 'flying', 'tank']
    : ['defect', 'flying', 'tank', 'virus', 'glitch', 'wraith', 'defect']
  const eliteIndexValues = isCastleChapter
    ? project.id === 11
      ? [chapterEnemiesPerRoom - 1, chapterEnemiesPerRoom * 2 - 1, targetDefectCount - 2]
      : isLateChapterProjectId(project.id)
        ? [chapterEnemiesPerRoom * 2 - 1, targetDefectCount - 2]
        : [chapterEnemiesPerRoom * 2 - 1]
    : [4]

  return [
    ...seeds.map((scene, index) => {
      const baseForm = isCastleChapter
        ? castleForms[index % castleForms.length] ?? enemyFormForScene(scene, index)
        : index === 1 || index === 6 ? 'flying' : index === 5 ? 'tank' : enemyFormForScene(scene, index)
      const eliteSlot = eliteIndexValues.indexOf(index)
      const form = eliteSlot >= 0
        ? isLateChapterProjectId(project.id)
          ? lateChapterEliteFormForSlot(eliteSlot)
          : eliteEnemyFormForProject(project.id)
        : baseForm
      const isElite = isEliteEnemyForm(form)
      const isTank = form === 'tank'
      const isFlying = form === 'flying'
      const hpBoost = project.id === 11 ? 22 : 0
      const hp = (isHeavyEliteEnemyForm(form) ? 300 : isElite ? 240 : isTank ? 160 : isFlying ? 116 : 132) + hpBoost
      const attackStyle: EnemyAttackStyle = isElite ? 'melee' : isFlying || index === 1 || index === 4 ? 'ranged' : 'melee'
      const projectileHeight: ProjectileHeight = isElite ? 'high' : isFlying || index === 4 ? 'high' : index === 1 ? 'low' : 'high'
      return {
        id: `defect-${scene.number}-${index}`,
        title: isElite ? `精英 ${scene.title}` : scene.title,
        defect: isElite ? `精英 ${scene.defect}` : scene.defect,
        objective: scene.objective,
        sceneNumber: scene.number,
        chapterTitle: scene.title,
        kind: 'defect' as const,
        form,
        attackStyle,
        projectileHeight,
        hp,
        maxHp: hp,
        x: xPositions[index],
        lane: lanes[index],
        facing: -1 as const,
        moving: false,
        quizCharge: 0,
        quizEvery: isElite ? 6 : isTank ? 6 : index % 2 === 0 ? 4 : 5,
        hitUntil: 0,
        windupUntil: 0,
        attackingUntil: 0,
        attackSequence: 0,
        defeated: false,
        deathUntil: 0,
        room: isCastleChapter ? rooms[index] : undefined,
      }
    }),
    {
      id: 'final-boss',
      title: project.bossName,
      defect: project.bossTitle,
      objective: project.riskSignal,
      chapterTitle: '终场核验',
      kind: 'boss' as const,
      form: 'boss' as const,
      attackStyle: 'melee' as const,
      projectileHeight: 'high' as const,
      hp: project.id === 11 ? 560 : 360,
      maxHp: project.id === 11 ? 560 : 360,
      x: isCastleChapter ? chapterRoomWidthForProject(project.id) - 420 : 5350,
      lane: 1,
      facing: -1 as const,
      moving: false,
      quizCharge: 0,
      quizEvery: project.id === 11 ? 4 : 6,
      hitUntil: 0,
      windupUntil: 0,
      attackingUntil: 0,
      attackSequence: 0,
      defeated: false,
      deathUntil: 0,
      room: isCastleChapter ? 'dungeon' as const : undefined,
      bossSpriteId: project.id === 11 ? 'boss11' as const : undefined,
      spriteScale: project.id === 11 ? 1.12 : undefined,
    },
  ]
}

function projectWeaponPool(projectId: number) {
  const poolSize = 7
  const startIndex = Math.max(0, (projectId - 1) * 5) % WEAPONS.length
  return Array.from({ length: poolSize }, (_, index) => WEAPONS[(startIndex + index) % WEAPONS.length])
}

function buildWeaponPickups(excludedWeaponIds: string[] = [], projectId = 1): WeaponPickupState[] {
  const positions = isChapterRoomProjectId(projectId)
    ? [
      { x: 620, lane: 2 },
      { x: 1040, lane: 0 },
      { x: 1480, lane: 1 },
      { x: 1900, lane: 2 },
      { x: 2320, lane: 0 },
      { x: 2680, lane: 1 },
      { x: 2920, lane: 2 },
    ]
    : [
      { x: 760, lane: 2 },
      { x: 1540, lane: 0 },
      { x: 2480, lane: 1 },
      { x: 3460, lane: 2 },
      { x: 4380, lane: 0 },
      { x: 4920, lane: 1 },
      { x: 5320, lane: 2 },
    ]
  const excluded = new Set(excludedWeaponIds)

  return projectWeaponPool(projectId)
    .filter(weapon => !excluded.has(weapon.id))
    .map((weapon, index) => ({
      weaponId: weapon.id,
      x: positions[index]?.x ?? 900 + index * 720,
      lane: positions[index]?.lane ?? 1,
      picked: false,
    }))
}

function useKeyboard() {
  const keysRef = useRef<Record<string, boolean>>({})

  useEffect(() => {
    const gameplayKeys = new Set([
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'KeyA',
      'KeyD',
      'KeyW',
      'KeyS',
      'ShiftLeft',
      'ShiftRight',
      'KeyJ',
      'KeyB',
      'KeyQ',
      'KeyE',
      'KeyR',
      'Backspace',
      'Escape',
      'BrowserBack',
      'Digit1',
      'Digit2',
      'Digit3',
      'Digit4',
      'Digit5',
    ])

    const down = (event: KeyboardEvent) => {
      if (gameplayKeys.has(event.code)) event.preventDefault()
      keysRef.current[event.code] = true
    }
    const up = (event: KeyboardEvent) => {
      keysRef.current[event.code] = false
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  return keysRef
}

export default function ThreeProjectGame({
  project,
  role,
  carrier,
  storyQuestions,
  bossQuestions,
  remainingTime,
  timedOut,
  testMode = false,
  playerModelId = DEFAULT_PLAYER_MODEL_ID,
  unlockedPlayerModelIds = [DEFAULT_PLAYER_MODEL_ID],
  playerCombatStats,
  playerCurrentHp,
  playerHpCap,
  displayName = '我',
  teamRoomId = null,
  allyNames = [],
  soundEnabled = true,
  sfxVolume = 78,
  musicVolume = 62,
  mapBackgroundUrl = '/simulation/map-background.webp',
  endlessSurvival = false,
  endlessMapBackgrounds = [],
  itemCounts = { skip: 0, boost: 0, heal: 0 },
  coins = 0,
  gems = 0,
  onUseItem,
  onCollectDrop,
  onOpenShop,
  teamRoomOwner = false,
  onEndTeamBattle,
  onTeamRoomStopped,
  onPauseChange,
  onHpChange,
  onEndlessComplete,
  onBack,
  onComplete,
}: ThreeProjectGameProps) {
  const keyboard = useKeyboard()
  const isEndlessSurvival = Boolean(endlessSurvival)
  const unlockedPlayerModelSet = useMemo(() => new Set<PlayerModelId>([DEFAULT_PLAYER_MODEL_ID, ...unlockedPlayerModelIds]), [unlockedPlayerModelIds])
  const defaultCombatStats = playerModelCombatStats(playerModelId)
  const rawPlayerMaxHp = Number(playerHpCap)
  const playerMaxHp = Math.round(clamp(Number.isFinite(rawPlayerMaxHp) ? rawPlayerMaxHp : Number(playerCombatStats?.hp) || defaultCombatStats.hp, 1, 180))
  const rawPlayerCurrentHp = Number(playerCurrentHp)
  const playerInitialHp = Math.round(clamp(Number.isFinite(rawPlayerCurrentHp) ? rawPlayerCurrentHp : playerMaxHp, 0, playerMaxHp))
  const playerMaxStamina = Math.round(clamp(92 + ((Number(playerCombatStats?.mobility) || defaultCombatStats.mobility) - 10) * 3, 80, 118))
  const playerAttackScale = clamp((Number(playerCombatStats?.attack) || defaultCombatStats.attack) / 10, 0.86, 1.45)
  const playerMobilityScale = clamp((Number(playerCombatStats?.mobility) || defaultCombatStats.mobility) / 10, 0.78, 1.25)
  const playerDamageTakenScale = clamp(1 - Math.max(0, playerMaxHp - PLAYER_MAX_HP) / 320, 0.86, 1)
  const stageRef = useRef<HTMLElement>(null)
  const playerRef = useRef<FighterState>({ x: 120, lane: 1, facing: 1, moving: false, crouching: false, jumpUntil: 0, rollingUntil: 0 })
  const enemiesRef = useRef<EnemyState[]>([])
  const projectilesRef = useRef<ProjectileState[]>([])
  const selectedPlayerModelRef = useRef<PlayerModel>(playerModelById(playerModelId))
  const onHpChangeRef = useRef(onHpChange)
  const onCompleteRef = useRef(onComplete)
  const onEndlessCompleteRef = useRef(onEndlessComplete)
  const onCollectDropRef = useRef(onCollectDrop)
  const bossUnlockedRef = useRef(false)
  const completedRef = useRef(false)
  const attackTargetIdRef = useRef<string | null>(null)
  const moveTargetRef = useRef<MoveTarget | null>(null)
  const activeQuizRef = useRef<ActiveQuiz | null>(null)
  const playerMaxHpRef = useRef(playerMaxHp)
  const playerMaxStaminaRef = useRef(playerMaxStamina)
  const playerHpRef = useRef(playerInitialHp)
  const endlessStatsRef = useRef<EndlessSurvivalStats>({ kills: 0, eliteKills: 0, levelsCleared: 0, coins: 0, gems: 0 })
  const correctRef = useRef(0)
  const totalRef = useRef(0)
  const lastEnemyAttackAtRef = useRef<Record<string, number>>({})
  const enemyExtraHitRef = useRef<Record<string, boolean>>({})
  const lastEnemyRenderAtRef = useRef(0)
  const lastPlayerRenderAtRef = useRef(0)
  const lastProjectileRenderAtRef = useRef(0)
  const floatingTextIdRef = useRef(0)
  const groundSwordWaveIdRef = useRef(0)
  const moveMarkerIdRef = useRef(0)
  const moveMarkerClearTimerRef = useRef<number | null>(null)
  const messageLockUntilRef = useRef(0)
  const messageRef = useRef('进入街区后自主移动，靠近缺陷并手动执行处置')
  const movementModeRef = useRef<MovementMode>('idle')
  const shiftLatchRef = useRef(false)
  const lastShiftTapAtRef = useRef(0)
  const rollCooldownUntilRef = useRef(0)
  const playerStaminaRef = useRef(playerMaxStamina)
  const lastStaminaUseAtRef = useRef(0)
  const lastStaminaRenderValueRef = useRef(playerMaxStamina)
  const playerEntryTimerRef = useRef<number | null>(null)
  const lastAttackAtRef = useRef(0)
  const normalComboPhaseRef = useRef(0)
  const lastNormalComboAtRef = useRef(0)
  const nextComboInputAtRef = useRef(0)
  const queuedAttackTimerRef = useRef<number | null>(null)
  const attackClearTimerRef = useRef<number | null>(null)
  const attackImpactTimersRef = useRef<number[]>([])
  const attackSignalRef = useRef<AttackSignal | null>(null)
  const blackKnightWeaponDrawnRef = useRef(false)
  const blackKnightSheathTimerRef = useRef<number | null>(null)
  const enemyTargetIdsRef = useRef<Record<string, string>>({})
  const chapterTransitionLockUntilRef = useRef(0)
  const remotePlayersRef = useRef<RemoteTeamPlayer[]>([])
  const teamSocketRef = useRef<Socket | null>(null)
  const teamSocketConnectedRef = useRef(false)
  const teamMemberCountRef = useRef(0)
  const teamLaunchStartedRef = useRef(false)
  const teamStoryLaunchStartedRef = useRef(false)
  const teamLocalStateHydratedRef = useRef(false)
  const aiReviveStartedAtRef = useRef<Record<string, number>>({})
  const lastAiAttackAtRef = useRef<Record<string, number>>({})
  const aiAttackUntilRef = useRef<Record<string, number>>({})
  const questionHistoryRef = useRef<string[]>([])
  const enemyQuestionHistoryRef = useRef<Record<string, string[]>>({})
  const combatDropClaimedRef = useRef<Set<string>>(new Set())
  const validationSealRef = useRef(false)
  const lastPoisonDamageAtRef = useRef(0)
  const openedGateRef = useRef({ hall: false, dungeon: false })
  const openedFinalStageGateRef = useRef(0)
  const chapterRoomRef = useRef<ChapterRoomKind>('hall')
  const finalChapterStageRef = useRef(1)
  const projectileIdRef = useRef(0)
  const lastAllyAssistAtRef = useRef(0)
  const lastRemoteHitAtRef = useRef<Record<string, number>>({})
  const lastRemoteAttackSequenceRef = useRef<Record<string, number>>({})
  const lastRemoteKnightWaveSequenceRef = useRef<Record<string, number>>({})
  const teamAuthorityRef = useRef(false)
  const teamCurrentUserIdRef = useRef<string | null>(null)
  const teamWorldUpdatedAtRef = useRef(0)
  const teamSyncSeqRef = useRef(0)
  const lastSocketMoveSentAtRef = useRef(0)
  const lastHttpTeamStateRef = useRef({ key: '', sentAt: 0 })
  const storyDialogueGateRef = useRef<StoryDialogueGateState | null>(null)
  const storyTasksCompletedRef = useRef<string[]>([])
  const completedStoryRoundIdsRef = useRef<string[]>([])
  const watchedStoryRoundIdsRef = useRef<string[]>([])
  const lastNarrationTaskIdRef = useRef('')
  const handledRoomEventRef = useRef('')
  const playerDownedRef = useRef(false)
  const testInvincibleRef = useRef(false)
  const reviveTimerRef = useRef<number | null>(null)
  const teamLoadoutAutoSubmittedRef = useRef(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const activeSfxRef = useRef<Set<HTMLAudioElement>>(new Set())
  const backgroundMusicRef = useRef<HTMLAudioElement | null>(null)
  const storySpeechAudioRef = useRef<HTMLAudioElement | null>(null)
  const storySpeechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const storySpeechTokenRef = useRef(0)
  const storySpeechCacheRef = useRef<Record<string, string>>({})
  const battleIntroActiveRef = useRef(false)
  const battleIntroTypeTimerRef = useRef<number | null>(null)
  const sfxCooldownRef = useRef<Record<string, number>>({})
  const soundEnabledRef = useRef(soundEnabled)
  const sfxVolumeRef = useRef(sfxVolume)
  const musicVolumeRef = useRef(musicVolume)

  const [viewportWidth, setViewportWidth] = useState(1280)
  const [selectedPlayerModelId, setSelectedPlayerModelId] = useState<PlayerModelId>(playerModelId)
  const [started, setStarted] = useState(false)
  const [storyIntroActive, setStoryIntroActive] = useState(false)
  const [storyIntroSeen, setStoryIntroSeen] = useState(false)
  const [battleIntroActive, setBattleIntroActive] = useState(false)
  const [activeStoryRound, setActiveStoryRound] = useState<StoryDialogueRound | null>(null)
  const [battleIntroLines, setBattleIntroLines] = useState<StoryIntroLine[]>([])
  const [storyDialogueGate, setStoryDialogueGate] = useState<StoryDialogueGateState | null>(null)
  const [completedStoryRoundIds, setCompletedStoryRoundIds] = useState<string[]>([])
  const [watchedStoryRoundIds, setWatchedStoryRoundIds] = useState<string[]>([])
  const [battleIntroLineIndex, setBattleIntroLineIndex] = useState(0)
  const [battleIntroVisibleChars, setBattleIntroVisibleChars] = useState(0)
  const [battleIntroSpeechPending, setBattleIntroSpeechPending] = useState(false)
  const [player, setPlayer] = useState<FighterState>(() => playerRef.current)
  const [movementMode, setMovementMode] = useState<MovementMode>('idle')
  const [playerHp, setPlayerHp] = useState(playerInitialHp)
  const [playerStamina, setPlayerStamina] = useState(playerMaxStamina)
  const [playerEntryActive, setPlayerEntryActive] = useState(false)
  const [enemies, setEnemies] = useState<EnemyState[]>(() => buildInitialEnemies(project, { endlessSurvival: isEndlessSurvival, endlessStage: 1 }))
  const [projectiles, setProjectiles] = useState<ProjectileState[]>([])
  const [answers, setAnswers] = useState<string[]>([])
  const [activeQuiz, setActiveQuiz] = useState<ActiveQuiz | null>(null)
  const [correct, setCorrect] = useState(0)
  const [total, setTotal] = useState(0)
  const [questionCursor, setQuestionCursor] = useState(0)
  const [bossQuestionCursor, setBossQuestionCursor] = useState(0)
  const [critReadyUntil, setCritReadyUntil] = useState(0)
  const [attackSignal, setAttackSignal] = useState<AttackSignal | null>(null)
  const attackSequenceRef = useRef(0)
  const heroEffectAttackCountRef = useRef(0)
  const [attackTargetId, setAttackTargetId] = useState<string | null>(null)
  const [playerFeedback, setPlayerFeedback] = useState<PlayerFeedback>(null)
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([])
  const [groundSwordWaves, setGroundSwordWaves] = useState<GroundSwordWave[]>([])
  const [moveClickMarker, setMoveClickMarker] = useState<MoveClickMarker | null>(null)
  const [storyTaskCompletedIds, setStoryTaskCompletedIds] = useState<string[]>([])
  const [storyNarration, setStoryNarration] = useState<ChapterStoryTask | null>(null)
  const [storyOperationTask, setStoryOperationTask] = useState<ChapterStoryTask | null>(null)
  const [storyOperationTools, setStoryOperationTools] = useState<StoryOperationToolId[]>([])
  const [storyOperationAnswer, setStoryOperationAnswer] = useState('')
  const [storyOperationFeedback, setStoryOperationFeedback] = useState('')
  const [message, setMessage] = useState('进入街区后自主移动，靠近缺陷并手动执行处置')
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const [boostAttacks, setBoostAttacks] = useState(0)
  const [validationSealSolved, setValidationSealSolved] = useState(false)
  const [chapterRoom, setChapterRoom] = useState<ChapterRoomKind>('hall')
  const [finalChapterStage, setFinalChapterStage] = useState(1)
  const [finalChapterNarration, setFinalChapterNarration] = useState<FinalChapterNarration | null>(null)
  const [remotePlayers, setRemotePlayers] = useState<RemoteTeamPlayer[]>([])
  const [teamLoadoutRoom, setTeamLoadoutRoom] = useState<TeamLoadoutRoomSnapshot | null>(null)
  const [teamLoadoutNotice, setTeamLoadoutNotice] = useState('')
  const [pendingTeamModelId, setPendingTeamModelId] = useState<PlayerModelId>(playerModelId)
  const [teamLoadoutSecondsLeft, setTeamLoadoutSecondsLeft] = useState(60)
  const [teamLaunchActive, setTeamLaunchActive] = useState(false)
  const [teamLaunchProgress, setTeamLaunchProgress] = useState(0)
  const [playerDowned, setPlayerDowned] = useState(false)
  const [assistQuiz, setAssistQuiz] = useState<RemoteActiveQuiz | null>(null)
  const [assistAnswers, setAssistAnswers] = useState<string[]>([])
  const [revivingRemoteId, setRevivingRemoteId] = useState<string | null>(null)
  const [reviveProgress, setReviveProgress] = useState(0)
  const [teamExitConfirmOpen, setTeamExitConfirmOpen] = useState(false)
  const [teamBattleHydrated, setTeamBattleHydrated] = useState(!teamRoomId)
  const [singlePlayerPaused, setSinglePlayerPaused] = useState(false)
  const [singlePlayerExitConfirmOpen, setSinglePlayerExitConfirmOpen] = useState(false)
  const [testInvincible, setTestInvincible] = useState(false)
  const [singleClaimedStoryRoleId, setSingleClaimedStoryRoleId] = useState('qa')
  const [endlessStats, setEndlessStats] = useState<EndlessSurvivalStats>(() => endlessStatsRef.current)

  const playerModel = useMemo(() => playerModelById(selectedPlayerModelId), [selectedPlayerModelId])
  const allyModel = useMemo(
    () => PLAYER_MODELS.find(model => model.id !== selectedPlayerModelId) ?? PLAYER_MODELS[0],
    [selectedPlayerModelId],
  )
  const activeAllies = useMemo(
    () => allyNames.map(name => name.trim()).filter(Boolean).slice(0, 2),
    [allyNames],
  )
  const supportAllies = useMemo(
    () => teamRoomId ? [] : activeAllies,
    [activeAllies, teamRoomId],
  )
  const singlePlayerMode = !teamRoomId
  const singlePlayerPauseEligible = singlePlayerMode && started && !battleIntroActive && !storyIntroActive
  const singlePlayerPauseActive = singlePlayerPauseEligible && singlePlayerPaused && !completedRef.current && !timedOut
  const environment = useMemo(() => environmentForProject(project), [project])
  const isCastleChapter = isChapterRoomProjectId(project.id)
  const isBossRushChapter = isBossRushProjectId(project.id)
  const currentFinalChapterStage = isEndlessSurvival ? Math.max(1, Math.round(finalChapterStage)) : clamp(finalChapterStage, 1, FINAL_CHAPTER_STAGE_COUNT)
  const currentFinalChapterScene = project.scenes.find(scene => scene.number === currentFinalChapterStage) ?? project.scenes[(currentFinalChapterStage - 1) % Math.max(1, project.scenes.length)] ?? project.scenes[0]
  const storyTasks = useMemo(() => isBossRushProjectId(project.id) || isEndlessSurvival ? [] : buildChapterStoryTasks(project), [isEndlessSurvival, project])
  const storyModeActive = storyTasks.length > 0
  const storyTaskCompletedSet = useMemo(() => new Set(storyTaskCompletedIds), [storyTaskCompletedIds])
  const backgroundMusicAsset = useMemo(() => backgroundMusicForProject(project.id), [project.id])
  const finalChapterStageEnemies = isBossRushChapter ? enemies.filter(enemy => enemy.sceneNumber === currentFinalChapterStage) : []
  const finalChapterStageCleared = isBossRushChapter && finalChapterStageEnemies.length > 0 && finalChapterStageEnemies.every(enemy => enemy.defeated)
  const finalChapterGateOpen = isBossRushChapter && (isEndlessSurvival || currentFinalChapterStage < FINAL_CHAPTER_STAGE_COUNT) && finalChapterStageCleared
  const visibleEnemies = isCastleChapter
    ? enemies.filter(enemy => enemy.room === chapterRoom)
    : isBossRushChapter
      ? finalChapterStageEnemies
      : enemies
  const renderedEnemies = battleIntroActive ? [] : teamRoomId && started && !teamBattleHydrated ? [] : visibleEnemies
  const hallCleared = enemies.filter(enemy => enemy.kind === 'defect' && enemy.room === 'hall').every(enemy => enemy.defeated)
  const corridorCleared = enemies.filter(enemy => enemy.kind === 'defect' && enemy.room === 'corridor').every(enemy => enemy.defeated)
  const dungeonCleared = enemies.filter(enemy => enemy.kind === 'defect' && enemy.room === 'dungeon').every(enemy => enemy.defeated)
  const hallStoryComplete = !storyModeActive || storyTasks.filter(task => task.room === 'hall').every(task => storyTaskCompletedSet.has(task.id))
  const corridorStoryComplete = !storyModeActive || storyTasks.filter(task => task.room === 'corridor').every(task => storyTaskCompletedSet.has(task.id))
  const dungeonStoryComplete = !storyModeActive || storyTasks.filter(task => task.room === 'dungeon').every(task => storyTaskCompletedSet.has(task.id))
  const hallGateOpen = hallCleared && hallStoryComplete
  const dungeonGateOpen = corridorCleared && corridorStoryComplete
  const bossUnlocked = isBossRushChapter
    ? true
    : isCastleChapter
      ? chapterRoom === 'dungeon' && dungeonGateOpen && dungeonCleared && dungeonStoryComplete
      : enemies.some(enemy => enemy.kind === 'defect') && enemies.filter(enemy => enemy.kind === 'defect').every(enemy => enemy.defeated)
  const boss = isBossRushChapter
    ? finalChapterStageEnemies.find(enemy => enemy.kind === 'boss' && !enemy.defeated) ?? finalChapterStageEnemies.find(enemy => enemy.kind === 'boss')
    : enemies.find(enemy => enemy.kind === 'boss')
  const activeQuestion = activeQuiz?.question
  const attackTarget = visibleEnemies.find(enemy => enemy.id === attackTargetId) ?? null
  const quizReadyTarget = attackTarget && attackTarget.quizCharge >= attackTarget.quizEvery ? attackTarget : null
  const defeatedDefects = enemies.filter(enemy => enemy.kind === 'defect' && enemy.defeated).length
  const progressValue = isBossRushChapter ? finalChapterStageEnemies.filter(enemy => enemy.defeated).length : defeatedDefects + (boss?.defeated ? 1 : 0)
  const progressMax = isBossRushChapter ? Math.max(1, finalChapterStageEnemies.length) : enemies.length
  const storyProgressValue = storyTaskCompletedIds.length
  const storyProgressMax = storyTasks.length
  const currentRoomStoryTasks = storyTasks.filter(task => task.room === chapterRoom)
  const currentRoomStoryTask = currentRoomStoryTasks.find(task => !storyTaskCompletedSet.has(task.id)) ?? null
  const currentRoomDefectsCleared = chapterRoom === 'hall' ? hallCleared : chapterRoom === 'corridor' ? corridorCleared : dungeonCleared
  const currentRoomStoryComplete = chapterRoom === 'hall' ? hallStoryComplete : chapterRoom === 'corridor' ? corridorStoryComplete : dungeonStoryComplete
  const currentRoomCleared = currentRoomDefectsCleared && currentRoomStoryComplete
  const canSkipCurrentChapterRoom = testMode && singlePlayerMode && isCastleChapter && started && !currentRoomCleared && !timedOut
  const canSkipCurrentChapterBoss = testMode && singlePlayerMode && isCastleChapter && started && chapterRoom === 'dungeon' && bossUnlocked && Boolean(boss && !boss.defeated) && !timedOut
  const canSkipCurrentFinalStage = testMode && singlePlayerMode && isBossRushChapter && started && !finalChapterStageCleared && !timedOut
  const activeStoryTask = storyModeActive && currentRoomDefectsCleared ? currentRoomStoryTask : null
  const storyOperationScenario = useMemo(
    () => storyOperationTask ? buildStoryOperationScenario(storyOperationTask) : null,
    [storyOperationTask],
  )
  const storyNarrationDone = storyNarration ? storyTaskCompletedSet.has(storyNarration.id) : false
  const storyNarrationSpeaker = storyNarration ? storyTaskNarratorProfile(storyNarration) : null
  const storyNarrationText = storyNarration
    ? stripStoryNarrationPrefix(storyNarrationDone ? storyNarration.completeLine : storyNarration.narratorLine)
    : message
  const critReady = Date.now() < critReadyUntil
  const activeChapterRoomWidth = chapterRoomWidthForProject(project.id)
  const activeChapterGateReadyX = chapterGateReadyX(project.id)
  const activeWorldWidth = isBossRushChapter ? FINAL_CHAPTER_STAGE_WIDTH : isCastleChapter ? activeChapterRoomWidth : WORLD_WIDTH
  const currentEndlessMapBackground = isEndlessSurvival
    ? endlessMapBackgrounds[(currentFinalChapterStage - 1) % Math.max(1, endlessMapBackgrounds.length)] ?? mapBackgroundUrl
    : undefined
  const cameraX = clamp(player.x - viewportWidth * VIEWPORT_FOCUS, 0, Math.max(0, activeWorldWidth - viewportWidth))
  const answeringRemotePlayer = remotePlayers.find(remote => remote.status === 'answering' && remote.activeQuiz) ?? null
  const remoteQuizEnemyKey = remotePlayers
    .filter(remote => remote.status === 'answering' && remote.activeQuiz?.enemyId)
    .map(remote => remote.activeQuiz?.enemyId)
    .sort()
    .join('|')
  const quizLockedEnemyKey = useMemo(() => {
    const ids: string[] = []
    const addLockedEnemy = (enemyId?: string) => {
      if (!enemyId) return
      if (teamRoomId && enemyId === 'final-boss') return
      ids.push(enemyId)
    }
    addLockedEnemy(activeQuiz?.enemyId)
    addLockedEnemy(assistQuiz?.enemyId)
    for (const remote of remotePlayers) {
      if (remote.status === 'answering' && remote.activeQuiz?.enemyId) addLockedEnemy(remote.activeQuiz.enemyId)
    }
    return [...new Set(ids)].sort().join('|')
  }, [activeQuiz?.enemyId, assistQuiz?.enemyId, remoteQuizEnemyKey, teamRoomId])
  const quizLockedEnemyIds = useMemo(
    () => new Set(quizLockedEnemyKey ? quizLockedEnemyKey.split('|') : []),
    [quizLockedEnemyKey],
  )
  const quizLockedEnemyIdsRef = useRef<Set<string>>(new Set())
  const teamQuizLocked = quizLockedEnemyIds.size > 0
  const teamLoadoutMe = teamLoadoutRoom?.members.find(member => member.mine) ?? null
  const teamMemberCount = teamLoadoutRoom?.members.length ?? 0
  const teamHasPlayableGroup = !teamRoomId || teamMemberCount >= 2
  const teamAllCombatSelected = Boolean(teamMemberCount >= 2 && teamLoadoutRoom?.members.every(member => member.combatRoleId))
  const teamCanBeginRun = !teamRoomId || Boolean(teamHasPlayableGroup && teamLoadoutMe?.combatRoleId && teamAllCombatSelected)
  const teamStoryClaimedCount = teamLoadoutRoom?.members.filter(member => member.roleId).length ?? 0
  const teamStoryRolesReady = !teamRoomId || Boolean(teamHasPlayableGroup && teamLoadoutRoom?.members.every(member => member.roleId))
  const storyRoleCards = useMemo(
    () => (teamLoadoutRoom?.roleCards.length ? teamLoadoutRoom.roleCards : fallbackStoryRoleCards(project, role)).slice(0, 4),
    [project, role, teamLoadoutRoom?.roleCards],
  )
  const soloClaimableStoryRoleCards = useMemo(() => storyRoleCards.filter(card => storyActorForRoleId(card.roleId)).slice(0, 3), [storyRoleCards])
  const storyRoleCardsForClaim = teamRoomId ? storyRoleCards : soloClaimableStoryRoleCards
  const claimedStoryRole = teamLoadoutMe?.roleId
    ? storyRoleCards.find(card => card.roleId === teamLoadoutMe.roleId) ?? null
    : soloClaimableStoryRoleCards.find(card => card.roleId === singleClaimedStoryRoleId) ?? soloClaimableStoryRoleCards[0] ?? null
  const claimedStoryActor = storyActorForRoleId(claimedStoryRole?.roleId)
  const storyDialogueRounds = useMemo(
    () => buildStoryDialogueRounds(project, carrier, storyRoleCards, claimedStoryActor),
    [carrier, claimedStoryActor, project, storyRoleCards],
  )
  const storyPreviewLines = storyDialogueRounds[0]?.lines ?? []
  const activeBattleIntroLine = battleIntroLines[battleIntroLineIndex] ?? battleIntroLines[0]
  const battleIntroDisplayedText = activeBattleIntroLine?.line.slice(0, battleIntroVisibleChars) ?? ''
  const battleIntroTextComplete = Boolean(activeBattleIntroLine && battleIntroVisibleChars >= activeBattleIntroLine.line.length)
  const battleIntroLineComplete = Boolean(activeBattleIntroLine && battleIntroTextComplete && !battleIntroSpeechPending)
  const activeStoryRoundId = activeStoryRound?.id ?? ''
  const activeStoryRoundWatched = Boolean(activeStoryRoundId && watchedStoryRoundIds.includes(activeStoryRoundId))
  const battleIntroAtLastLine = Boolean(battleIntroActive && activeBattleIntroLine && battleIntroLineIndex >= battleIntroLines.length - 1)
  const activeStoryReadyUserIds = storyDialogueGate?.roundId === activeStoryRoundId ? storyDialogueGate.readyUserIds : []
  const storyDialogueExpectedCount = teamRoomId
    ? Math.max(2, Math.min(3, teamMemberCount || remotePlayers.filter(player => !player.aiControlled).length + 1 || 2))
    : 1
  const storyDialogueReadyCount = teamRoomId ? activeStoryReadyUserIds.length : 1
  const localStoryUserId = teamCurrentUserIdRef.current || (typeof window !== 'undefined' ? localStorage.getItem('userId') : null) || 'local-player'
  const localStoryDialogueReady = Boolean(teamRoomId && activeStoryReadyUserIds.includes(localStoryUserId))
  const storyDialogueTeamReady = !teamRoomId || storyDialogueReadyCount >= storyDialogueExpectedCount
  const storyDialogueWaitingForTeam = Boolean(teamRoomId && battleIntroAtLastLine && localStoryDialogueReady && !storyDialogueTeamReady)
  const canManuallyAdvanceBattleIntro = Boolean(battleIntroActive)
  const battleIntroSkipAvailable = Boolean(battleIntroActive && activeStoryRoundWatched)
  const battleIntroTestSkipAvailable = Boolean(testMode && singlePlayerMode && battleIntroActive && activeBattleIntroLine && !timedOut)

  useEffect(() => {
    battleIntroActiveRef.current = battleIntroActive
  }, [battleIntroActive])

  useEffect(() => {
    remotePlayersRef.current = remotePlayers
  }, [remotePlayers])

  function resetAiCompanionsToChapterStart() {
    setRemotePlayers(current => {
      let changed = false
      const nextPlayers = current.map(remote => {
        if (!remote.aiControlled) return remote
        changed = true
        return {
          ...remote,
          x: CHAPTER_ROOM_START_X,
          targetX: CHAPTER_ROOM_START_X,
          lane: 1,
          targetLane: 1,
          facing: 1 as const,
          moving: false,
          attacking: false,
        }
      })
      if (!changed) return current
      remotePlayersRef.current = nextPlayers
      return nextPlayers
    })
  }

  useEffect(() => {
    const nextEnemies = buildInitialEnemies(project, { endlessSurvival: isEndlessSurvival, endlessStage: 1 })
    enemiesRef.current = nextEnemies
    setEnemies(nextEnemies)
    projectilesRef.current = []
    setProjectiles([])
    activeQuizRef.current = null
    setActiveQuiz(null)
    endlessStatsRef.current = { kills: 0, eliteKills: 0, levelsCleared: 0, coins: 0, gems: 0 }
    setEndlessStats(endlessStatsRef.current)
    questionHistoryRef.current = []
    enemyQuestionHistoryRef.current = {}
    combatDropClaimedRef.current = new Set()
    aiAttackUntilRef.current = {}
    finalChapterStageRef.current = 1
    openedFinalStageGateRef.current = 0
    setFinalChapterStage(1)
    setFinalChapterNarration(null)
    stopStorySpeech()
    setStoryIntroActive(false)
    setStoryIntroSeen(false)
    setBattleIntroActive(false)
    setActiveStoryRound(null)
    setBattleIntroLines([])
    setBattleIntroLineIndex(0)
    setBattleIntroVisibleChars(0)
    setBattleIntroSpeechPending(false)
    resetStoryDialogueGate()
    completedStoryRoundIdsRef.current = []
    setCompletedStoryRoundIds([])
    setTeamBattleHydrated(!teamRoomId)
  }, [isEndlessSurvival, project, teamRoomId])

  useEffect(() => {
    if (teamRoomId) return
    if (!soloClaimableStoryRoleCards.length) return
    if (soloClaimableStoryRoleCards.some(card => card.roleId === singleClaimedStoryRoleId)) return
    setSingleClaimedStoryRoleId(soloClaimableStoryRoleCards[0].roleId)
  }, [singleClaimedStoryRoleId, soloClaimableStoryRoleCards, teamRoomId])

  useEffect(() => {
    quizLockedEnemyIdsRef.current = quizLockedEnemyIds
  }, [quizLockedEnemyKey, quizLockedEnemyIds])

  useEffect(() => {
    teamMemberCountRef.current = teamMemberCount
  }, [teamMemberCount])

  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    enemiesRef.current = enemies
    bossUnlockedRef.current = bossUnlocked
  }, [bossUnlocked, enemies])

  useEffect(() => {
    projectilesRef.current = projectiles
  }, [projectiles])

  useEffect(() => {
    activeQuizRef.current = activeQuiz
  }, [activeQuiz])

  useEffect(() => {
    soundEnabledRef.current = soundEnabled
    sfxVolumeRef.current = sfxVolume
    musicVolumeRef.current = musicVolume
    const backgroundMusic = backgroundMusicRef.current
    if (!backgroundMusic) return
    backgroundMusic.volume = Math.min(0.36, Math.max(0, musicVolume / 100) * 0.32)
    if (!soundEnabled || musicVolume <= 0) {
      backgroundMusic.pause()
    } else if (started) {
      void backgroundMusic.play().catch(() => undefined)
    }
  }, [musicVolume, sfxVolume, soundEnabled, started])

  useEffect(() => () => {
    if (reviveTimerRef.current !== null) window.clearInterval(reviveTimerRef.current)
    if (queuedAttackTimerRef.current !== null) window.clearTimeout(queuedAttackTimerRef.current)
    if (attackClearTimerRef.current !== null) window.clearTimeout(attackClearTimerRef.current)
    if (blackKnightSheathTimerRef.current !== null) window.clearTimeout(blackKnightSheathTimerRef.current)
    if (moveMarkerClearTimerRef.current !== null) window.clearTimeout(moveMarkerClearTimerRef.current)
    if (battleIntroTypeTimerRef.current !== null) window.clearInterval(battleIntroTypeTimerRef.current)
    attackImpactTimersRef.current.forEach(timer => window.clearTimeout(timer))
    attackImpactTimersRef.current = []
    backgroundMusicRef.current?.pause()
    storySpeechTokenRef.current += 1
    storySpeechAudioRef.current?.pause()
    storySpeechAudioRef.current = null
    activeSfxRef.current.forEach(audio => audio.pause())
    activeSfxRef.current.clear()
    void audioContextRef.current?.close().catch(() => undefined)
  }, [])

  useEffect(() => {
    setSelectedPlayerModelId(playerModelId)
    setPendingTeamModelId(playerModelId)
  }, [playerModelId])

  useEffect(() => {
    onHpChangeRef.current = onHpChange
  }, [onHpChange])

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    onEndlessCompleteRef.current = onEndlessComplete
  }, [onEndlessComplete])

  useEffect(() => {
    onCollectDropRef.current = onCollectDrop
  }, [onCollectDrop])

  useEffect(() => {
    onPauseChange?.(singlePlayerPauseActive)
    return () => {
      if (singlePlayerPauseActive) onPauseChange?.(false)
    }
  }, [onPauseChange, singlePlayerPauseActive])

  useEffect(() => {
    if (!started || teamRoomId || timedOut) {
      setSinglePlayerPaused(false)
      setSinglePlayerExitConfirmOpen(false)
    }
  }, [started, teamRoomId, timedOut])

  useEffect(() => {
    if (!singlePlayerPauseEligible) return undefined
    const pauseForFocusLoss = () => pauseSinglePlayer()
    const handleVisibilityChange = () => {
      if (document.hidden) pauseSinglePlayer()
    }
    window.addEventListener('blur', pauseForFocusLoss)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('blur', pauseForFocusLoss)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [singlePlayerPauseEligible, timedOut])

  useEffect(() => {
    if (!singlePlayerPauseEligible || singlePlayerPauseActive) return undefined
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const stage = stageRef.current
      if (!stage || stage.contains(event.target as Node)) return
      pauseSinglePlayer()
    }
    document.addEventListener('pointerdown', handleOutsidePointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointerDown, true)
    }
  }, [singlePlayerPauseActive, singlePlayerPauseEligible])

  useEffect(() => {
    if (!started || teamRoomId) return
    if (singlePlayerPauseActive) {
      backgroundMusicRef.current?.pause()
      activeSfxRef.current.forEach(audio => audio.pause())
    } else {
      startBackgroundMusic()
    }
  }, [singlePlayerPauseActive, started, teamRoomId])

  useEffect(() => {
    selectedPlayerModelRef.current = playerModel
  }, [playerModel])

  useEffect(() => {
    playerMaxHpRef.current = playerMaxHp
    setPlayerHp(current => {
      const nextHp = started ? Math.min(current, playerMaxHp) : playerInitialHp
      playerHpRef.current = nextHp
      return nextHp
    })
  }, [playerInitialHp, playerMaxHp, started])

  useEffect(() => {
    playerMaxStaminaRef.current = playerMaxStamina
    setPlayerStamina(current => {
      const nextStamina = started ? Math.min(current, playerMaxStamina) : playerMaxStamina
      playerStaminaRef.current = nextStamina
      lastStaminaRenderValueRef.current = nextStamina
      return nextStamina
    })
  }, [playerMaxStamina, started])

  useEffect(() => {
    attackSignalRef.current = attackSignal
  }, [attackSignal])

  useEffect(() => {
    if (!quizLockedEnemyIds.size) return
    const now = performance.now()
    let changed = false
    const nextEnemies = enemiesRef.current.map(enemy => {
      if (enemy.defeated) return enemy
      if (!quizLockedEnemyIds.has(enemy.id)) return enemy
      if (!enemy.moving && enemy.windupUntil === 0 && enemy.attackingUntil <= now + 260) return enemy
      changed = true
      return {
        ...enemy,
        moving: false,
        windupUntil: 0,
        attackingUntil: Math.max(enemy.attackingUntil, now + 260),
      }
    })
    if (changed) {
      enemiesRef.current = nextEnemies
      setEnemies(nextEnemies)
    }
  }, [quizLockedEnemyKey, quizLockedEnemyIds])

  useEffect(() => {
    playerHpRef.current = playerHp
  }, [playerHp])

  useEffect(() => {
    if (!started) return
    onHpChangeRef.current?.(playerHp)
  }, [playerHp, started])

  useEffect(() => {
    if (!started || !teamRoomId) {
      setRemotePlayers([])
      return
    }

    let cancelled = false
    let pulledOnce = false
    let lastHttpFallbackPushAt = 0
    let lastWorldStatePushAt = 0
    let httpFallbackPushInFlight = false
    let httpFallbackPullInFlight = false
    teamSocketConnectedRef.current = false
    const teamSyncUrl = resolveTeamSyncUrl()

    async function syncLocalState() {
      if (cancelled || !pulledOnce) return
      const usingHttpFallback = !teamSocketConnectedRef.current
      if (usingHttpFallback) {
        const now = Date.now()
        if (httpFallbackPushInFlight || now - lastHttpFallbackPushAt < TEAM_HTTP_FALLBACK_PUSH_INTERVAL_MS) return
        lastHttpFallbackPushAt = now
      }
      if (usingHttpFallback) httpFallbackPushInFlight = true
      try {
        if (teamAuthorityRef.current) {
          const now = Date.now()
          if (now - lastWorldStatePushAt >= 900) {
            lastWorldStatePushAt = now
            await postTeamPlayState({ worldState: buildTeamWorldState('authority') })
            return
          }
        }
        await postTeamPlayState()
      } finally {
        if (usingHttpFallback) httpFallbackPushInFlight = false
      }
    }

    function handleRemoteEnded(reason: 'ended' | 'disbanded') {
      handleTeamRoomEvent({ type: reason === 'disbanded' ? 'roomDisbanded' : 'battleEnded', at: Date.now() })
      onTeamRoomStopped?.(reason)
    }

    function normalizeRemotePlayer(
      player: Partial<RemoteTeamPlayer> & { modelId?: string; status?: string; activeQuiz?: unknown; rolling?: boolean; rollingUntil?: number; rollDuration?: number; seq?: number },
      receivedAt = Date.now(),
    ): RemoteTeamPlayer | null {
      if (!player.userId || !player.displayName) return null
      const quiz = player.activeQuiz && typeof player.activeQuiz === 'object'
        ? player.activeQuiz as Partial<RemoteActiveQuiz>
        : null
      const activeQuiz = quiz?.enemyId && quiz.question?.options?.length ? quiz as RemoteActiveQuiz : null
      const updatedAtText = String(player.updatedAt ?? '')
      const parsedUpdatedAt = Date.parse(updatedAtText)
      const lastSeenAt = Number.isFinite(parsedUpdatedAt) ? parsedUpdatedAt : receivedAt
      const rawSyncSeq = Number(player.syncSeq ?? player.seq ?? 0)
      const syncSeq = Number.isFinite(rawSyncSeq) ? Math.max(0, Math.round(rawSyncSeq)) : 0
      const rawUpdatedAtMs = Number(player.updatedAtMs)
      const updatedAtMs = Number.isFinite(rawUpdatedAtMs) && rawUpdatedAtMs > 0
        ? Math.round(rawUpdatedAtMs)
        : lastSeenAt
      const targetX = clamp(Number(player.x), 0, activeWorldWidth)
      const targetLane = clamp(Number(player.lane), 0, 2)
      const status = (player.status === 'downed' || player.status === 'answering' || player.status === 'reviving' ? player.status : 'playing') as RemoteTeamPlayer['status']
      const aiControlled = Boolean(player.aiControlled) || player.status === 'exited' || receivedAt - lastSeenAt > REMOTE_SYNC_STALE_MS
      const modelId = isPlayerModelId(player.modelId) ? player.modelId : DEFAULT_PLAYER_MODEL_ID
      const model = playerModelById(modelId)
      const rollDuration = Math.round(clamp(Number(player.rollDuration) || (model.durations?.roll ?? DEFAULT_ROLL_DURATION_MS), 180, 900))
      const incomingRollingUntil = Number(player.rollingUntil)
      const rollingUntil = Number.isFinite(incomingRollingUntil) && incomingRollingUntil > receivedAt
        ? incomingRollingUntil
        : Boolean(player.rolling)
          ? receivedAt + rollDuration
          : 0
      return {
        userId: String(player.userId),
        displayName: String(player.displayName),
        modelId,
        x: targetX,
        targetX,
        lane: targetLane,
        targetLane,
        facing: Number(player.facing) === -1 ? -1 as const : 1 as const,
        moving: Boolean(player.moving),
        attacking: Boolean(player.attacking),
        attackSequence: Math.max(0, Math.round(Number(player.attackSequence) || 0)),
        attackPhase: Math.max(0, Math.round(Number(player.attackPhase) || 0)),
        rollingUntil,
        rollDuration,
        hp: clamp(Number(player.hp), 0, playerMaxHpRef.current),
        status,
        activeQuiz,
        aiControlled,
        lastSeenAt,
        syncSeq,
        seq: syncSeq,
        updatedAtMs,
        positionSamples: [{ x: targetX, lane: targetLane, at: receivedAt, seq: syncSeq }],
        updatedAt: updatedAtText,
      }
    }

    function isStaleRemotePacket(previous: RemoteTeamPlayer, nextPlayer: RemoteTeamPlayer) {
      const previousSeq = previous.syncSeq ?? 0
      const nextSeq = nextPlayer.syncSeq ?? 0
      if (previousSeq > 0 && nextSeq <= 0) return true
      if (previousSeq > 0 && nextSeq > 0) {
        if (nextSeq < previousSeq) return true
        if (nextSeq === previousSeq && (nextPlayer.updatedAtMs ?? 0) <= (previous.updatedAtMs ?? 0)) return true
        return false
      }
      const previousAt = previous.updatedAtMs ?? previous.lastSeenAt ?? 0
      const nextAt = nextPlayer.updatedAtMs ?? nextPlayer.lastSeenAt ?? 0
      return previousAt > 0 && nextAt > 0 && nextAt + 80 < previousAt
    }

    function mergeRemotePositionSamples(previous: RemoteTeamPlayer, nextPlayer: RemoteTeamPlayer, now: number) {
      const oldestAt = now - REMOTE_INTERPOLATION_SAMPLE_TTL_MS
      const previousSamples = previous.positionSamples?.length
        ? previous.positionSamples
        : [{ x: previous.x, lane: previous.lane, at: Math.max(0, now - REMOTE_SOCKET_INTERPOLATION_DELAY_MS), seq: previous.syncSeq ?? 0 }]
      const incomingSamples = nextPlayer.positionSamples?.length
        ? nextPlayer.positionSamples
        : [{ x: nextPlayer.targetX ?? nextPlayer.x, lane: nextPlayer.targetLane ?? nextPlayer.lane, at: now, seq: nextPlayer.syncSeq ?? 0 }]
      const sortedSamples = [...previousSamples, ...incomingSamples]
        .filter(sample => sample.at >= oldestAt)
        .sort((a, b) => a.at - b.at || a.seq - b.seq)
      const dedupedSamples: RemotePositionSample[] = []
      for (const sample of sortedSamples) {
        const last = dedupedSamples[dedupedSamples.length - 1]
        if (
          last
          && last.seq === sample.seq
          && Math.abs(last.x - sample.x) < 0.2
          && Math.abs(last.lane - sample.lane) < 0.01
        ) {
          continue
        }
        dedupedSamples.push(sample)
      }
      return dedupedSamples.slice(-REMOTE_INTERPOLATION_MAX_SAMPLES)
    }

    function mergeRemotePlayer(previous: RemoteTeamPlayer, nextPlayer: RemoteTeamPlayer) {
      if (isStaleRemotePacket(previous, nextPlayer)) return previous
      const distance = Math.abs((nextPlayer.targetX ?? nextPlayer.x) - previous.x) + lanePixelDistance(nextPlayer.targetLane ?? nextPlayer.lane, previous.lane)
      const preserveAiMotion = previous.aiControlled && nextPlayer.aiControlled && nextPlayer.status !== 'downed' && previous.status !== 'downed'
      const snap = !preserveAiMotion && (distance > REMOTE_SNAP_DISTANCE || nextPlayer.status === 'downed' || previous.status === 'downed')
      const incomingSeenAt = nextPlayer.lastSeenAt ?? 0
      const previousSeenAt = previous.lastSeenAt ?? 0
      const now = Date.now()
      const positionSamples = preserveAiMotion
        ? previous.positionSamples
        : snap
          ? nextPlayer.positionSamples
          : mergeRemotePositionSamples(previous, nextPlayer, now)
      const previousRolling = (previous.rollingUntil ?? 0) > now
      const nextRolling = (nextPlayer.rollingUntil ?? 0) > now
      const stableRollingUntil = previousRolling && nextRolling && Math.abs((nextPlayer.rollingUntil ?? 0) - (previous.rollingUntil ?? 0)) < 180
        ? previous.rollingUntil
        : nextPlayer.rollingUntil
      const keepPreviousVitals = incomingSeenAt < previousSeenAt
        || (nextPlayer.aiControlled && nextPlayer.hp === playerMaxHpRef.current && previous.hp < playerMaxHpRef.current)
      return {
        ...nextPlayer,
        rollingUntil: stableRollingUntil,
        hp: keepPreviousVitals ? previous.hp : nextPlayer.hp,
        status: keepPreviousVitals ? previous.status : nextPlayer.status,
        activeQuiz: keepPreviousVitals ? previous.activeQuiz : nextPlayer.activeQuiz,
        lastSeenAt: Math.max(incomingSeenAt, previousSeenAt),
        syncSeq: Math.max(previous.syncSeq ?? 0, nextPlayer.syncSeq ?? 0),
        seq: Math.max(previous.syncSeq ?? 0, nextPlayer.syncSeq ?? 0),
        updatedAtMs: Math.max(previous.updatedAtMs ?? 0, nextPlayer.updatedAtMs ?? 0),
        positionSamples,
        x: preserveAiMotion ? previous.x : snap ? nextPlayer.x : previous.x,
        targetX: preserveAiMotion ? previous.targetX : nextPlayer.targetX,
        lane: preserveAiMotion ? previous.lane : snap ? nextPlayer.lane : previous.lane,
        targetLane: preserveAiMotion ? previous.targetLane : nextPlayer.targetLane,
        facing: preserveAiMotion ? previous.facing : nextPlayer.facing,
        attacking: preserveAiMotion ? previous.attacking || nextPlayer.attacking : nextPlayer.attacking,
        attackSequence: preserveAiMotion ? Math.max(previous.attackSequence ?? 0, nextPlayer.attackSequence ?? 0) : nextPlayer.attackSequence,
        attackPhase: preserveAiMotion ? Math.max(previous.attackPhase ?? 0, nextPlayer.attackPhase ?? 0) : nextPlayer.attackPhase,
        moving: preserveAiMotion ? previous.moving : nextPlayer.moving || nextPlayer.attacking || nextRolling || (!snap && distance > 3),
      }
    }

    function replaceRemotePlayers(players: RemoteTeamPlayer[]) {
      if (cancelled) return
      setRemotePlayers(current => {
        const previousById = new Map(current.map(player => [player.userId, player]))
        const incomingIds = new Set(players.map(player => player.userId))
        const mergedPlayers = players.map(nextPlayer => {
          const previous = previousById.get(nextPlayer.userId)
          return previous ? mergeRemotePlayer(previous, nextPlayer) : nextPlayer
        })
        const preservedAiPlayers = current
          .filter(player => player.aiControlled && !incomingIds.has(player.userId) && player.hp > 0)
          .map(player => ({
            ...player,
            status: player.status === 'reviving' ? 'playing' as const : player.status,
            moving: false,
            attacking: false,
            lastSeenAt: Date.now() - REMOTE_SYNC_STALE_MS - 1,
          }))
        const nextPlayers = [...mergedPlayers, ...preservedAiPlayers].slice(0, 2)
        remotePlayersRef.current = nextPlayers
        return nextPlayers
      })
    }

    function upsertRemotePlayer(nextPlayer: RemoteTeamPlayer) {
      if (cancelled) return
      setRemotePlayers(current => {
        const index = current.findIndex(player => player.userId === nextPlayer.userId)
        let nextPlayers: RemoteTeamPlayer[]
        if (index >= 0) {
          const next = current.slice()
          next[index] = mergeRemotePlayer(current[index], nextPlayer)
          nextPlayers = next
        } else {
          nextPlayers = [nextPlayer, ...current].slice(0, 2)
        }
        remotePlayersRef.current = nextPlayers
        return nextPlayers
      })
    }

    function applyRemoteSnapshot(data: TeamPlaySyncSnapshot) {
      if (cancelled) return
      if (data.ended) {
        handleTeamRoomEvent(data.roomState?.event ?? { type: data.reason === 'disbanded' ? 'roomDisbanded' : 'battleEnded', at: Date.now() })
        onTeamRoomStopped?.(data.reason === 'disbanded' ? 'disbanded' : 'ended')
        return
      }
      teamCurrentUserIdRef.current = data.currentUserId ?? teamCurrentUserIdRef.current
      if (
        data.roomState?.state
        && (!teamLocalStateHydratedRef.current || data.roomState.updatedByUserId !== data.currentUserId)
      ) {
        applyTeamWorldState(data.roomState.state)
      }
      if (data.currentPlayer) applyLocalTeamPlayState(data.currentPlayer)
      if (data.roomState?.event) handleTeamRoomEvent(data.roomState.event)
      const receivedAt = Date.now()
      const players = (data.players ?? [])
        .filter(player => player.userId && player.displayName)
        .map(player => normalizeRemotePlayer(player, receivedAt))
        .filter((player): player is RemoteTeamPlayer => Boolean(player))
      const liveAuthorityIds = [
        data.currentUserId,
        ...players
          .filter(player => !player.aiControlled && player.status !== 'downed' && player.hp > 0)
          .map(player => player.userId),
      ].filter((id): id is string => Boolean(id)).sort()
      const ownerRemote = players.find(player => player.userId === data.authorityUserId)
      const ownerStale = Boolean(data.authorityUserId && data.currentUserId !== data.authorityUserId && (!ownerRemote || ownerRemote.aiControlled))
      teamAuthorityRef.current = Boolean(data.currentUserId && (
        data.currentUserId === data.authorityUserId
        || (ownerStale && liveAuthorityIds[0] === data.currentUserId)
      ))
      replaceRemotePlayers(players)
      setTeamBattleHydrated(true)
      pulledOnce = true
    }

    async function refreshRemotePlayers(force = false) {
      const token = readTeamAuthToken()
      if (!token || !teamRoomId || cancelled) return
      if (!force && teamSocketConnectedRef.current) return
      if (httpFallbackPullInFlight) return
      httpFallbackPullInFlight = true
      try {
        const response = await fetch(`/api/team/play-state?roomId=${encodeURIComponent(teamRoomId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null)
        if (!response || cancelled) return
        if (!response.ok) {
          if (response.status === 403 || response.status === 404) {
            handleRemoteEnded(response.status === 404 ? 'disbanded' : 'ended')
          }
          return
        }
        const data = await response.json().catch(() => ({ players: [] })) as TeamPlaySyncSnapshot
        applyRemoteSnapshot(data)
      } finally {
        httpFallbackPullInFlight = false
      }
    }

    const token = readTeamAuthToken()
    if (teamSyncUrl && token) {
      const socket = io(teamSyncUrl, {
        auth: { token, roomId: teamRoomId },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 250,
        reconnectionDelayMax: 1000,
        timeout: 1200,
      })
      teamSocketRef.current = socket
      socket.on('connect', () => {
        teamSocketConnectedRef.current = true
        void postTeamPlayState()
      })
      socket.on('disconnect', () => {
        teamSocketConnectedRef.current = false
        void refreshRemotePlayers(true)
      })
      socket.on('connect_error', () => {
        teamSocketConnectedRef.current = false
        void refreshRemotePlayers(true)
      })
      socket.on('team:snapshot', (data: TeamPlaySyncSnapshot) => applyRemoteSnapshot(data))
      socket.on('team:player', (player: Partial<RemoteTeamPlayer> & { modelId?: string; status?: string; activeQuiz?: unknown; aiControlled?: boolean; rolling?: boolean; rollingUntil?: number; rollDuration?: number; seq?: number }) => {
        const nextPlayer = normalizeRemotePlayer(player, Date.now())
        if (!nextPlayer) return
        upsertRemotePlayer(nextPlayer)
        pulledOnce = true
      })
      socket.on('team:world', (roomState: TeamPlaySyncSnapshot['roomState']) => {
        if (!roomState) return
        if (
          roomState.state
          && (!teamLocalStateHydratedRef.current || roomState.updatedByUserId !== teamCurrentUserIdRef.current)
        ) {
          applyTeamWorldState(roomState.state)
        }
        if (roomState.event) handleTeamRoomEvent(roomState.event)
        setTeamBattleHydrated(true)
      })
      socket.on('team:ended', (data: { reason?: 'ended' | 'disbanded' }) => handleRemoteEnded(data.reason === 'disbanded' ? 'disbanded' : 'ended'))
      socket.on('team:error', (data: { message?: string }) => {
        if (data?.message) setGameMessage(data.message, 900)
      })
    }

    void refreshRemotePlayers(true)
    const pushTimer = window.setInterval(() => void syncLocalState(), TEAM_SOCKET_MOVE_INTERVAL_MS)
    const pullTimer = window.setInterval(() => void refreshRemotePlayers(), TEAM_HTTP_FALLBACK_PULL_INTERVAL_MS)
    return () => {
      cancelled = true
      teamSocketConnectedRef.current = false
      teamSocketRef.current?.disconnect()
      teamSocketRef.current = null
      window.clearInterval(pushTimer)
      window.clearInterval(pullTimer)
    }
  }, [activeWorldWidth, started, teamRoomId])

  useEffect(() => {
    if (!started || !teamRoomId) return undefined
    let lastTime = performance.now()

    const tick = () => {
      const frameNow = performance.now()
      const wallNow = Date.now()
      const delta = Math.min(0.05, (frameNow - lastTime) / 1000)
      lastTime = frameNow
      setRemotePlayers(current => {
        let changedAny = false
        const nextPlayers = current.map(remote => {
          let targetX = remote.targetX ?? remote.x
          let targetLane = remote.targetLane ?? remote.lane
          let interpolating = false
          const samples = remote.positionSamples
            ?.filter(sample => wallNow - sample.at <= REMOTE_INTERPOLATION_SAMPLE_TTL_MS)
            .sort((a, b) => a.at - b.at || a.seq - b.seq)
          if (samples?.length) {
            const baseDelay = teamSocketConnectedRef.current
              ? REMOTE_SOCKET_INTERPOLATION_DELAY_MS
              : REMOTE_HTTP_INTERPOLATION_DELAY_MS
            const renderAt = wallNow - remoteInterpolationDelay(samples, baseDelay)
            let before = samples[0]
            let after: RemotePositionSample | undefined
            if (renderAt <= samples[0].at) {
              after = samples[1]
            } else {
              for (let index = 1; index < samples.length; index += 1) {
                const sample = samples[index]
                if (sample.at >= renderAt) {
                  after = sample
                  break
                }
                before = sample
              }
            }
            if (after && after.at > before.at) {
              const ratio = clamp((renderAt - before.at) / (after.at - before.at), 0, 1)
              targetX = before.x + (after.x - before.x) * ratio
              targetLane = before.lane + (after.lane - before.lane) * ratio
              interpolating = true
            } else {
              const latest = samples[samples.length - 1]
              targetX = latest.x
              targetLane = latest.lane
            }
          }
          const dx = targetX - remote.x
          const dlane = targetLane - remote.lane
          const remoteRolling = (remote.rollingUntil ?? 0) > wallNow
          const remoteRollSpeed = remoteRolling
            ? (playerRollDistance(playerModelById(remote.modelId)) / Math.max(0.18, (remote.rollDuration ?? DEFAULT_ROLL_DURATION_MS) / 1000)) * 1.18
            : REMOTE_SMOOTH_SPEED
          const catchUpSpeed = Math.min(2600, Math.max(REMOTE_SMOOTH_SPEED, Math.abs(dx) * (interpolating ? 8.5 : 5.2)))
          const maxXStep = Math.max(catchUpSpeed, remoteRollSpeed) * delta
          const maxLaneStep = Math.max(3.8, Math.abs(dlane) * 8) * delta
          const nextX = Math.abs(dx) <= maxXStep ? targetX : remote.x + Math.sign(dx) * maxXStep
          const nextLane = Math.abs(dlane) <= maxLaneStep ? targetLane : remote.lane + Math.sign(dlane) * maxLaneStep
          const moved = Math.abs(nextX - remote.x) > 0.2 || Math.abs(nextLane - remote.lane) > 0.01
          if (!moved && remote.moving && Math.abs(dx) < 1 && Math.abs(dlane) < 0.02) {
            const seenAt = remote.lastSeenAt ?? 0
            const nextMoving = Boolean(remote.aiControlled || wallNow - seenAt < REMOTE_MOVE_KEEPALIVE_MS)
            if (nextMoving === remote.moving) return remote
            changedAny = true
            return { ...remote, moving: nextMoving }
          }
          if (!moved) return remote
          changedAny = true
          return {
            ...remote,
            x: nextX,
            lane: nextLane,
            moving: true,
          }
        })
        if (!changedAny) return current
        remotePlayersRef.current = nextPlayers
        return nextPlayers
      })
    }

    const timer = window.setInterval(tick, 33)
    return () => window.clearInterval(timer)
  }, [started, teamRoomId])

  useEffect(() => {
    validationSealRef.current = validationSealSolved
  }, [validationSealSolved])

  useEffect(() => {
    chapterRoomRef.current = chapterRoom
  }, [chapterRoom])

  useEffect(() => {
    finalChapterStageRef.current = currentFinalChapterStage
  }, [currentFinalChapterStage])

  useEffect(() => {
    storyTasksCompletedRef.current = storyTaskCompletedIds
  }, [storyTaskCompletedIds])

  useEffect(() => {
    completedStoryRoundIdsRef.current = completedStoryRoundIds
  }, [completedStoryRoundIds])

  useEffect(() => {
    watchedStoryRoundIdsRef.current = watchedStoryRoundIds
  }, [watchedStoryRoundIds])

  useEffect(() => {
    const storedRoundIds = readWatchedStoryRoundIds(project.id)
    watchedStoryRoundIdsRef.current = storedRoundIds
    setWatchedStoryRoundIds(storedRoundIds)
  }, [project.id])

  useEffect(() => {
    if (!started || !isCastleChapter) return
    if (hallGateOpen && !openedGateRef.current.hall) {
      openedGateRef.current.hall = true
      playSfx('door')
      setGameMessage('第一场景调查完成，通往第二场景的门已开启', 1200)
    }
    if (dungeonGateOpen && !openedGateRef.current.dungeon) {
      openedGateRef.current.dungeon = true
      playSfx('door')
      setGameMessage('第二场景调查完成，通往第三场景的门已开启', 1400)
    }
  }, [dungeonGateOpen, hallGateOpen, isCastleChapter, started])

  useEffect(() => {
    if (!started || !isBossRushChapter || !finalChapterGateOpen) return
    if (openedFinalStageGateRef.current === currentFinalChapterStage) return
    openedFinalStageGateRef.current = currentFinalChapterStage
    playSfx('door')
    if (isEndlessSurvival) {
      setGameMessage(`第 ${currentFinalChapterStage} 层已清理，通往第 ${currentFinalChapterStage + 1} 层的门已开启`, 1400)
      return
    }
    setGameMessage(`第 ${currentFinalChapterStage} 关已清理，通往第 ${currentFinalChapterStage + 1} 关的门已开启`, 1400)
  }, [currentFinalChapterStage, finalChapterGateOpen, isBossRushChapter, isEndlessSurvival, started])

  useEffect(() => {
    if (!started || !isBossRushChapter || !currentFinalChapterScene) return
    if (isEndlessSurvival) {
      const title = `无尽第 ${currentFinalChapterStage} 层 · ${currentFinalChapterScene.title}`
      const line = finalChapterStageCleared
        ? `${currentFinalChapterScene.objective}已清理，下一层入口已经开启。`
        : '随机裂隙已展开：本层包含全怪物池随机分布与独立 Boss，清空后继续深入。'
      setFinalChapterNarration({ id: `endless-stage-${currentFinalChapterStage}-${finalChapterStageCleared ? 'clear' : 'start'}`, title, line })
      return
    }
    const stageTitle = currentFinalChapterStage === FINAL_CHAPTER_STAGE_COUNT
      ? '第 11 关 · 体系终审'
      : `第 ${currentFinalChapterStage} 关 · ${currentFinalChapterScene.title}`
    const line = finalChapterStageCleared
      ? currentFinalChapterStage < FINAL_CHAPTER_STAGE_COUNT
        ? `${currentFinalChapterScene.objective}已完成，通往第 ${currentFinalChapterStage + 1} 关的门已开启。`
        : '最终体系终审已完成，全部风险信号已经清理。'
      : currentFinalChapterStage === FINAL_CHAPTER_STAGE_COUNT
        ? `所有回溯线索已经汇入终审门前，清理精英守卫后击破${project.bossName}。`
        : `回溯${currentFinalChapterScene.title}：${currentFinalChapterScene.defect}正在扩散，先清理本关怪物，再击破关底复现体。`
    setFinalChapterNarration({ id: `final-stage-${currentFinalChapterStage}-${finalChapterStageCleared ? 'clear' : 'start'}`, title: stageTitle, line })
  }, [currentFinalChapterScene, currentFinalChapterStage, finalChapterStageCleared, isBossRushChapter, isEndlessSurvival, project.bossName, started])

  useEffect(() => {
    if (!started || !storyModeActive || !isCastleChapter || battleIntroActive || activeStoryRound || completedRef.current) return
    const round = storyRoundFor(chapterRoom, 'scene')
    if (!round || completedStoryRoundIdsRef.current.includes(round.id)) return
    startStoryDialogueRound(round)
  }, [activeStoryRound, battleIntroActive, chapterRoom, isCastleChapter, started, storyDialogueRounds, storyModeActive])

  useEffect(() => {
    if (!started || !storyModeActive || !isCastleChapter || battleIntroActive || activeStoryRound || completedRef.current) return
    if (chapterRoom !== 'dungeon' || !dungeonCleared || !dungeonStoryComplete) return
    const round = storyRoundFor('dungeon', 'boss')
    if (!round || completedStoryRoundIdsRef.current.includes(round.id)) return
    startStoryDialogueRound(round)
  }, [activeStoryRound, battleIntroActive, chapterRoom, dungeonCleared, dungeonStoryComplete, isCastleChapter, started, storyDialogueRounds, storyModeActive])

  useEffect(() => {
    if (!started || battleIntroActive || !storyModeActive || !activeStoryTask) return
    if (lastNarrationTaskIdRef.current === activeStoryTask.id) return
    lastNarrationTaskIdRef.current = activeStoryTask.id
    setStoryNarration(activeStoryTask)
    setGameMessage(activeStoryTask.objective, 1500)
    void speakStoryTaskLine(activeStoryTask, activeStoryTask.narratorLine)
  }, [activeStoryTask, battleIntroActive, started, storyModeActive])

  useEffect(() => {
    correctRef.current = correct
  }, [correct])

  useEffect(() => {
    totalRef.current = total
  }, [total])

  useEffect(() => {
    const enabled = testMode && testInvincible
    testInvincibleRef.current = enabled
    if (!testMode && testInvincible) setTestInvincible(false)
  }, [testInvincible, testMode])

  const setGameMessage = useCallback((text: string, lockMs = 0) => {
    messageLockUntilRef.current = Date.now() + lockMs
    messageRef.current = text
    setMessage(text)
  }, [])

  function toggleTestInvincible() {
    if (!testMode) return
    setTestInvincible(current => {
      const next = !current
      testInvincibleRef.current = next
      if (next) {
        playerHpRef.current = playerMaxHpRef.current
        setPlayerHp(playerMaxHpRef.current)
        pulsePlayerFeedback('heal')
      }
      setGameMessage(next ? '测试无敌已开启：敌人攻击不会扣血' : '测试无敌已关闭', 1100)
      return next
    })
  }

  function stopStorySpeech(clearPending = true) {
    storySpeechTokenRef.current += 1
    if (clearPending) setBattleIntroSpeechPending(false)
    if (storySpeechUtteranceRef.current && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      storySpeechUtteranceRef.current = null
    }
    const audio = storySpeechAudioRef.current
    if (!audio) return
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    activeSfxRef.current.delete(audio)
    storySpeechAudioRef.current = null
  }

  function estimateStorySpeechDurationMs(text: string) {
    const cleaned = stripStoryNarrationPrefix(text)
    const punctuationCount = (cleaned.match(/[，。！？、；：,.!?;:]/g) ?? []).length
    return Math.max(1800, Math.min(16000, cleaned.length * 165 + punctuationCount * 120 + 700))
  }

  function estimateBrowserStorySpeechDurationMs(text: string) {
    const cleaned = stripStoryNarrationPrefix(text)
    const cjkCount = (cleaned.match(/[\u3400-\u9fff]/g) ?? []).length
    const punctuationCount = (cleaned.match(/[，。！？、；：,.!?;:]/g) ?? []).length
    const otherCount = Math.max(0, cleaned.length - cjkCount - punctuationCount)
    return Math.max(1500, Math.min(18000, cjkCount * 190 + otherCount * 85 + punctuationCount * 150 + 360))
  }

  function waitStoryAudioDuration(audio: HTMLAudioElement) {
    if (Number.isFinite(audio.duration) && audio.duration > 0) return Promise.resolve(audio.duration * 1000)
    return new Promise<number | null>(resolve => {
      let settled = false
      let timer = 0
      const cleanup = () => {
        audio.removeEventListener('loadedmetadata', onLoaded)
        audio.removeEventListener('durationchange', onLoaded)
        audio.removeEventListener('error', onError)
        window.clearTimeout(timer)
      }
      const finish = (duration: number | null) => {
        if (settled) return
        settled = true
        cleanup()
        resolve(duration)
      }
      const onLoaded = () => {
        finish(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration * 1000 : null)
      }
      const onError = () => finish(null)
      timer = window.setTimeout(() => finish(null), 1200)
      audio.addEventListener('loadedmetadata', onLoaded)
      audio.addEventListener('durationchange', onLoaded)
      audio.addEventListener('error', onError, { once: true })
      audio.load()
    })
  }

  function normalizeBrowserVoiceKey(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '')
  }

  function browserVoiceHint(options: StorySpeechOptions) {
    const requested = options.edgeVoice ?? options.voice ?? options.dashScopeVoice ?? options.openAiVoice ?? ''
    return normalizeBrowserVoiceKey(requested)
      .replace(/^zhcn/, '')
      .replace(/neural$/, '')
  }

  function waitBrowserSpeechVoices() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return Promise.resolve<SpeechSynthesisVoice[]>([])
    const synth = window.speechSynthesis
    const voices = synth.getVoices()
    if (voices.length) return Promise.resolve(voices)
    return new Promise<SpeechSynthesisVoice[]>(resolve => {
      let settled = false
      let timer = 0
      const cleanup = () => {
        window.clearTimeout(timer)
        synth.removeEventListener('voiceschanged', onVoicesChanged)
      }
      const finish = () => {
        if (settled) return
        settled = true
        cleanup()
        resolve(synth.getVoices())
      }
      const onVoicesChanged = () => finish()
      timer = window.setTimeout(finish, 420)
      synth.addEventListener('voiceschanged', onVoicesChanged)
    })
  }

  function selectBrowserStoryVoice(voices: SpeechSynthesisVoice[], options: StorySpeechOptions) {
    const hint = browserVoiceHint(options)
    const zhCnVoices = voices.filter(voice => /^zh(-|_)cn/i.test(voice.lang) || /chinese|mandarin|中文|普通话/i.test(voice.name))
    const candidateVoices = zhCnVoices.length ? zhCnVoices : voices
    const exact = hint
      ? candidateVoices.find(voice => normalizeBrowserVoiceKey(`${voice.name} ${voice.voiceURI}`).includes(hint))
      : null
    if (exact) return exact

    const femaleHints = ['xiaomo', 'xiaoxuan', 'xiaoyi', 'xiaoxiao', 'xiaorui', 'xiaobei', 'xiaoni', 'xiaoshuang', 'xiaoyan']
    return candidateVoices.find(voice => {
      const key = normalizeBrowserVoiceKey(`${voice.name} ${voice.voiceURI}`)
      return femaleHints.some(item => key.includes(item))
    }) ?? zhCnVoices[0] ?? voices[0] ?? null
  }

  async function speakStoryLineWithBrowser(text: string, options: StorySpeechOptions, token: number, onSettled?: () => void) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
    const synth = window.speechSynthesis
    const utterance = new SpeechSynthesisUtterance(text)
    const voices = await waitBrowserSpeechVoices()
    const voice = selectBrowserStoryVoice(voices, options)
    if (voice) utterance.voice = voice
    utterance.lang = voice?.lang || 'zh-CN'
    utterance.rate = 1
    utterance.pitch = 1.05
    utterance.volume = Math.min(0.82, Math.max(0.22, sfxVolumeRef.current / 100))
    if (storySpeechTokenRef.current !== token) return null

    const durationMs = estimateBrowserStorySpeechDurationMs(text)
    return new Promise<number | null>(resolve => {
      let released = false
      let started = false
      let endTimer = 0
      let startTimer = 0
      const markStarted = () => {
        if (started) return
        started = true
        window.clearTimeout(startTimer)
        resolve(durationMs)
      }
      const release = () => {
        if (released) return
        released = true
        markStarted()
        window.clearTimeout(endTimer)
        if (storySpeechUtteranceRef.current === utterance) storySpeechUtteranceRef.current = null
        if (storySpeechTokenRef.current === token) onSettled?.()
      }
      utterance.onstart = markStarted
      utterance.onend = release
      utterance.onerror = release
      synth.cancel()
      storySpeechUtteranceRef.current = utterance
      synth.speak(utterance)
      startTimer = window.setTimeout(markStarted, 650)
      endTimer = window.setTimeout(release, durationMs + 2600)
    })
  }

  function normalizeStoryReadyUserIds(value: unknown) {
    return Array.isArray(value)
      ? [...new Set(value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map(item => item.trim()))]
      : []
  }

  function setStoryDialogueGateState(nextGate: StoryDialogueGateState | null) {
    storyDialogueGateRef.current = nextGate
    setStoryDialogueGate(nextGate)
  }

  function resetStoryDialogueGate(roundId?: string) {
    if (!roundId) {
      setStoryDialogueGateState(null)
      return
    }
    setStoryDialogueGateState({ roundId, readyUserIds: [], updatedAt: Date.now() })
  }

  function mergeStoryDialogueGate(roundId: string, readyUserIds: unknown) {
    const incomingIds = normalizeStoryReadyUserIds(readyUserIds)
    if (!roundId || !incomingIds.length) return storyDialogueGateRef.current?.readyUserIds ?? []
    const currentGate = storyDialogueGateRef.current
    const currentIds = currentGate?.roundId === roundId ? currentGate.readyUserIds : []
    const nextIds = [...new Set([...currentIds, ...incomingIds])]
    const nextGate = { roundId, readyUserIds: nextIds, updatedAt: Date.now() }
    setStoryDialogueGateState(nextGate)
    return nextIds
  }

  function storyDialogueReadyTargetCount() {
    if (!teamRoomId) return 1
    const remoteHumanCount = remotePlayersRef.current.filter(player => !player.aiControlled).length
    const expected = teamMemberCountRef.current || teamMemberCount || remoteHumanCount + 1 || 2
    return Math.max(2, Math.min(3, expected))
  }

  function storyDialogueAllReady(readyUserIds: string[]) {
    return !teamRoomId || readyUserIds.length >= storyDialogueReadyTargetCount()
  }

  function storyRoundWatchStorageKey(projectId = project.id) {
    if (typeof window === 'undefined') return ''
    const userId = teamCurrentUserIdRef.current || localStorage.getItem('userId') || 'local-player'
    return `gmp-story-round-watch:v1:${userId}:project-${projectId}`
  }

  function readWatchedStoryRoundIds(projectId = project.id) {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem(storyRoundWatchStorageKey(projectId))
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed)
        ? [...new Set(parsed.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map(item => item.trim()))]
        : []
    } catch {
      return []
    }
  }

  function writeWatchedStoryRoundIds(roundIds: string[], projectId = project.id) {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(storyRoundWatchStorageKey(projectId), JSON.stringify(roundIds))
    } catch {
      // Local storage is only an unlock convenience; gameplay should continue if it is unavailable.
    }
  }

  function markStoryRoundWatched(roundId: string) {
    if (!roundId || watchedStoryRoundIdsRef.current.includes(roundId)) return
    const nextWatched = [...watchedStoryRoundIdsRef.current, roundId]
    watchedStoryRoundIdsRef.current = nextWatched
    setWatchedStoryRoundIds(nextWatched)
    writeWatchedStoryRoundIds(nextWatched)
  }

  function markLocalStoryDialogueReady(roundId = activeStoryRound?.id ?? '') {
    if (!teamRoomId || !roundId) return []
    const userId = teamCurrentUserIdRef.current || localStorage.getItem('userId') || 'local-player'
    const nextIds = mergeStoryDialogueGate(roundId, [userId])
    const nextGate = { roundId, readyUserIds: nextIds, updatedAt: Date.now() }
    storyDialogueGateRef.current = nextGate
    void postTeamPlayState({
      worldState: {
        ...buildTeamWorldState('story'),
        storyDialogueGate: nextGate,
        updatedAt: Date.now(),
      },
      roomEvent: {
        type: 'storyDialogueReady',
        roundId,
        targetUserId: userId,
        readyUserIds: nextIds,
        at: Date.now(),
      } satisfies TeamRoomEvent,
    })
    return nextIds
  }

  function startBattleIntroTypewriter(line: StoryIntroLine, durationMs: number | null) {
    if (battleIntroTypeTimerRef.current !== null) window.clearInterval(battleIntroTypeTimerRef.current)
    const textLength = Math.max(1, line.line.length)
    const totalMs = Math.max(1400, Math.min(18000, durationMs ?? estimateStorySpeechDurationMs(line.line)))
    const stepMs = Math.max(32, Math.min(180, Math.round(totalMs / textLength)))
    battleIntroTypeTimerRef.current = window.setInterval(() => {
      setBattleIntroVisibleChars(current => {
        const next = Math.min(line.line.length, current + 1)
        if (next >= line.line.length && battleIntroTypeTimerRef.current !== null) {
          window.clearInterval(battleIntroTypeTimerRef.current)
          battleIntroTypeTimerRef.current = null
        }
        return next
      })
    }, stepMs)
  }

  async function speakStoryLine(text: string, options: StorySpeechOptions = {}, onSettled?: () => void) {
    if (typeof window === 'undefined' || !soundEnabledRef.current) return null
    const cleanedText = stripStoryNarrationPrefix(text)
    if (!cleanedText) return null
    const token = storySpeechTokenRef.current + 1
    stopStorySpeech(false)
    storySpeechTokenRef.current = token

    try {
      const useBrowserFallback = async () => {
        if (storySpeechTokenRef.current !== token) return null
        return speakStoryLineWithBrowser(cleanedText, options, token, onSettled)
      }
      if (options.provider === 'browser') return useBrowserFallback()
      const cacheKey = `${options.provider ?? 'auto'}|${options.voice ?? options.edgeVoice ?? options.dashScopeVoice ?? options.openAiVoice ?? 'default'}|${cleanedText}`
      const cached = storySpeechCacheRef.current[cacheKey]
      let audioUrl = cached
      if (!audioUrl) {
        const authToken = localStorage.getItem('token')
        if (!authToken) throw new Error('请登录后使用角色语音')
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ text: cleanedText, ...options }),
        })
        const data = await response.json().catch(() => null)
        if (!response.ok || !data?.audioUrl) {
          if (data?.fallback === 'browser') {
            const fallbackDuration = await useBrowserFallback()
            if (fallbackDuration !== null) return fallbackDuration
          }
          throw new Error(data?.error || '角色语音生成失败')
        }
        audioUrl = data.audioUrl as string
        storySpeechCacheRef.current[cacheKey] = audioUrl
      }
      if (storySpeechTokenRef.current !== token) return null
      const audio = new Audio(audioUrl)
      audio.preload = 'auto'
      audio.volume = Math.min(0.8, Math.max(0.2, sfxVolumeRef.current / 100))
      const durationMs = await waitStoryAudioDuration(audio)
      if (storySpeechTokenRef.current !== token) return null
      let released = false
      const release = () => {
        if (released) return
        released = true
        activeSfxRef.current.delete(audio)
        if (storySpeechAudioRef.current === audio) storySpeechAudioRef.current = null
        onSettled?.()
      }
      activeSfxRef.current.add(audio)
      storySpeechAudioRef.current = audio
      audio.addEventListener('ended', release, { once: true })
      audio.addEventListener('error', release, { once: true })
      await audio.play().catch(error => {
        release()
        const message = error instanceof Error ? error.message : String(error)
        if (/play\(\) failed|user didn't interact|notallowed|not allowed/i.test(message)) return
        throw error
      })
      return durationMs
    } catch (error) {
      if (storySpeechTokenRef.current !== token) return null
      const fallbackDuration = await speakStoryLineWithBrowser(cleanedText, options, token, onSettled).catch(() => null)
      if (fallbackDuration !== null) return fallbackDuration
      const audio = storySpeechAudioRef.current
      if (audio) {
        activeSfxRef.current.delete(audio)
        storySpeechAudioRef.current = null
      }
      onSettled?.()
      const message = error instanceof Error ? error.message : '角色语音生成失败'
      setGameMessage(`${message}，请检查语音配置后重试`, 1600)
      return null
    }
  }

  function speakStoryTaskLine(task: ChapterStoryTask, text: string) {
    const narrator = storyTaskNarratorProfile(task)
    return speakStoryLine(stripStoryNarrationPrefix(text), {
      provider: 'edge',
      voice: narrator.voice,
      edgeVoice: narrator.voice,
    })
  }

  useEffect(() => {
    if (!battleIntroActive || !activeBattleIntroLine) return undefined
    let cancelled = false
    const hasSpeech = soundEnabledRef.current && Boolean(stripStoryNarrationPrefix(activeBattleIntroLine.line))
    setBattleIntroVisibleChars(0)
    setBattleIntroSpeechPending(hasSpeech)
    if (battleIntroTypeTimerRef.current !== null) window.clearInterval(battleIntroTypeTimerRef.current)

    if (activeBattleIntroLine.choices?.length && !activeBattleIntroLine.line.trim()) {
      stopStorySpeech()
      setBattleIntroVisibleChars(0)
      setBattleIntroSpeechPending(false)
      return () => {
        cancelled = true
      }
    }

    void speakStoryLine(
      activeBattleIntroLine.line,
      {
        provider: activeBattleIntroLine.actor === 'wang' ? 'browser' : 'edge',
        voice: activeBattleIntroLine.voice,
        edgeVoice: activeBattleIntroLine.voice,
      },
      () => {
        if (!cancelled) setBattleIntroSpeechPending(false)
      },
    ).then(durationMs => {
      if (cancelled || !battleIntroActiveRef.current) return
      if (!hasSpeech) setBattleIntroSpeechPending(false)
      startBattleIntroTypewriter(activeBattleIntroLine, durationMs)
    })

    return () => {
      cancelled = true
      setBattleIntroSpeechPending(false)
      if (battleIntroTypeTimerRef.current !== null) {
        window.clearInterval(battleIntroTypeTimerRef.current)
        battleIntroTypeTimerRef.current = null
      }
    }
  }, [activeBattleIntroLine, battleIntroActive])

  useEffect(() => {
    if (!teamRoomId || !battleIntroActive || !activeStoryRoundId || !battleIntroAtLastLine || !battleIntroLineComplete) return
    if (!localStoryDialogueReady || !storyDialogueTeamReady) return
    finishBattleIntro()
  }, [
    activeStoryRoundId,
    battleIntroActive,
    battleIntroAtLastLine,
    battleIntroLineComplete,
    localStoryDialogueReady,
    storyDialogueTeamReady,
    storyDialogueGate,
    teamRoomId,
  ])

  function storyRoundFor(room: ChapterRoomKind, kind: StoryDialogueKind) {
    return storyDialogueRounds.find(round => round.room === room && round.kind === kind) ?? null
  }

  function markStoryRoundCompleted(roundId: string) {
    if (completedStoryRoundIdsRef.current.includes(roundId)) return
    const nextCompleted = [...completedStoryRoundIdsRef.current, roundId]
    completedStoryRoundIdsRef.current = nextCompleted
    setCompletedStoryRoundIds(nextCompleted)
  }

  function startStoryDialogueRound(round: StoryDialogueRound | null) {
    if (!round || completedStoryRoundIdsRef.current.includes(round.id)) return
    stopStorySpeech()
    setActiveStoryRound(round)
    setBattleIntroLines(round.lines)
    setBattleIntroLineIndex(0)
    setBattleIntroVisibleChars(0)
    resetStoryDialogueGate(round.id)
    battleIntroActiveRef.current = true
    setBattleIntroActive(true)
    setGameMessage(round.kind === 'boss'
      ? 'Boss 剧情触发：完成对话后进入最终质询。'
      : `${STORY_ROOM_LABELS[round.room]}剧情触发：先确认本场项目目标。`,
      1600,
    )
  }

  function chooseBattleIntroChoice(choice: StoryDialogueChoice) {
    if (!activeBattleIntroLine || !battleIntroLineComplete || !activeBattleIntroLine.choices?.length) return
    setBattleIntroLines(currentLines => {
      const currentLine = currentLines[battleIntroLineIndex]
      if (!currentLine) return currentLines
      const silentPlayerLine: StoryIntroLine = {
        ...currentLine,
        line: '',
        choices: undefined,
      }
      const responseLines = choice.responses.map(response => storyPersonLine(
        response.actor,
        response.line,
        activeStoryRound?.kind === 'boss' ? 'left' : response.actor === 'lin' ? 'left' : 'right',
        storyRoleCards,
      ))
      if (!responseLines.length) {
        return [
          ...currentLines.slice(0, battleIntroLineIndex),
          silentPlayerLine,
          ...currentLines.slice(battleIntroLineIndex + 1),
        ]
      }
      return [
        ...currentLines.slice(0, battleIntroLineIndex),
        silentPlayerLine,
        ...responseLines,
        ...currentLines.slice(battleIntroLineIndex + 1),
      ]
    })
    setBattleIntroLineIndex(index => index + 1)
    setBattleIntroVisibleChars(0)
  }

  function finishBattleIntro() {
    const finishedRound = activeStoryRound
    if (battleIntroTypeTimerRef.current !== null) {
      window.clearInterval(battleIntroTypeTimerRef.current)
      battleIntroTypeTimerRef.current = null
    }
    stopStorySpeech()
    if (finishedRound) {
      markStoryRoundCompleted(finishedRound.id)
      markStoryRoundWatched(finishedRound.id)
    }
    battleIntroActiveRef.current = false
    setBattleIntroActive(false)
    setActiveStoryRound(null)
    setBattleIntroLines([])
    resetStoryDialogueGate()
    setBattleIntroVisibleChars(0)
    if (finishedRound?.room === 'hall' && finishedRound.kind === 'scene') triggerPlayerEntry()
    setGameMessage(finishedRound?.kind === 'boss'
      ? 'Boss 剧情完成：最终质询已开放。'
      : storyModeActive
        ? '剧情完成：先清理当前场景缺陷，随后根据角色提示完成现场调查。'
      : '剧情导入完成：怪物开始出现，靠近缺陷后使用 J / 左键处置。',
      1800,
    )
  }

  function skipBattleIntro(force = false) {
    if (!force && !battleIntroSkipAvailable) {
      setGameMessage('本段剧情还没有完整播放过，看完一次后再次进入即可跳过。', 1600)
      return
    }
    if (force && teamRoomId) return
    if (teamRoomId) {
      const roundId = activeStoryRound?.id
      if (!roundId) return
      const lastIndex = Math.max(0, battleIntroLines.length - 1)
      const lastLine = battleIntroLines[lastIndex]
      if (battleIntroTypeTimerRef.current !== null) {
        window.clearInterval(battleIntroTypeTimerRef.current)
        battleIntroTypeTimerRef.current = null
      }
      stopStorySpeech()
      setBattleIntroLineIndex(lastIndex)
      setBattleIntroVisibleChars(lastLine?.line.length ?? 0)
      const readyIds = markLocalStoryDialogueReady(roundId)
      setGameMessage(
        storyDialogueAllReady(readyIds)
          ? '队伍剧情已确认，正在同步进入下一阶段。'
          : `已跳过本段剧情，等待队友确认 ${readyIds.length}/${storyDialogueReadyTargetCount()}`,
        1200,
      )
      return
    }
    finishBattleIntro()
  }

  function advanceBattleIntro() {
    if (!activeBattleIntroLine) {
      finishBattleIntro()
      return
    }
    if (!battleIntroTextComplete) {
      setBattleIntroVisibleChars(activeBattleIntroLine.line.length)
      return
    }
    if (battleIntroSpeechPending) {
      setGameMessage('旁白还在播放，请听完后继续。', 1000)
      return
    }
    if (!battleIntroLineComplete) return
    if (activeBattleIntroLine.choices?.length) return
    if (battleIntroLineIndex >= battleIntroLines.length - 1) {
      if (teamRoomId) {
        const readyIds = markLocalStoryDialogueReady(activeStoryRound?.id)
        if (!storyDialogueAllReady(readyIds)) {
          setGameMessage(`剧情已看完，等待队友确认 ${readyIds.length}/${storyDialogueReadyTargetCount()}`, 1200)
        } else {
          setGameMessage('队伍剧情已确认，正在同步进入下一阶段。', 1200)
        }
        return
      }
      finishBattleIntro()
      return
    }
    setBattleIntroLineIndex(index => Math.min(index + 1, battleIntroLines.length - 1))
  }

  function storyRoomTasksComplete(room: ChapterRoomKind, completedIds = storyTasksCompletedRef.current) {
    const completed = new Set(completedIds)
    return !storyModeActive || storyTasks.filter(task => task.room === room).every(task => completed.has(task.id))
  }

  function findNearestActiveStoryTask() {
    if (!activeStoryTask) return null
    const fighter = playerRef.current
    const near = isCloseLane(fighter.lane, activeStoryTask.lane) && Math.abs(fighter.x - activeStoryTask.x) <= 132
    return near ? activeStoryTask : null
  }

  function openStoryOperation(task: ChapterStoryTask) {
    setStoryOperationTask(task)
    setStoryOperationTools([])
    setStoryOperationAnswer('')
    setStoryOperationFeedback('')
    setStoryNarration(task)
    setGameMessage(`正在处理现场操作：${task.title}`, 900)
  }

  function closeStoryOperation() {
    setStoryOperationTask(null)
    setStoryOperationTools([])
    setStoryOperationAnswer('')
    setStoryOperationFeedback('')
  }

  function toggleStoryOperationTool(toolId: StoryOperationToolId) {
    setStoryOperationFeedback('')
    setStoryOperationTools(current => current.includes(toolId)
      ? current.filter(id => id !== toolId)
      : [...current, toolId])
  }

  function submitStoryOperation() {
    if (!storyOperationTask || !storyOperationScenario) return
    const selected = new Set(storyOperationTools)
    const toolsReady = storyOperationScenario.requiredTools.every(toolId => selected.has(toolId))
    if (!toolsReady) {
      setStoryOperationFeedback(`工具还没选对：${storyOperationScenario.toolHint}`)
      return
    }
    const answer = storyOperationScenario.options.find(option => option.id === storyOperationAnswer)
    if (!answer) {
      setStoryOperationFeedback('先选择一个现场判断，再提交结论。')
      return
    }
    if (!answer.correct) {
      setStoryOperationFeedback('这个处理顺序风险太大。先保全证据，再做影响评价和闭环判断。')
      return
    }
    closeStoryOperation()
    completeStoryTask(storyOperationTask)
  }

  function completeStoryTask(task: ChapterStoryTask) {
    if (!started || !storyModeActive || storyTasksCompletedRef.current.includes(task.id)) return
    const nextCompleted = [...storyTasksCompletedRef.current, task.id]
    storyTasksCompletedRef.current = nextCompleted
    setStoryTaskCompletedIds(nextCompleted)
    setStoryNarration(task)
    setGameMessage(task.completeLine, 1500)
    void speakStoryTaskLine(task, task.completeLine)
    spawnFloatingText('调查完成', task.x, task.lane, 'heal')
    if (teamRoomId) {
      const storyWorldState: TeamRoomWorldState = {
        projectId: project.id,
        roomId: teamRoomId,
        source: 'story',
        chapterRoom: chapterRoomRef.current,
        validationSealSolved: validationSealRef.current,
        storyTasksCompleted: nextCompleted,
        resolvedQuiz: null,
        updatedAt: Date.now(),
      }
      void postTeamPlayState({ worldState: storyWorldState })
    }
  }

  function skipCurrentChapterRoom() {
    if (!canSkipCurrentChapterRoom || teamRoomId) return

    const room = chapterRoomRef.current
    const roomLabel = STORY_ROOM_LABELS[room]
    const now = Date.now()
    let skippedEnemyCount = 0
    const nextEnemies = enemiesRef.current.map(enemy => {
      if (enemy.kind !== 'defect' || enemy.room !== room || enemy.defeated) return enemy
      skippedEnemyCount += 1
      return {
        ...enemy,
        hp: 0,
        moving: false,
        quizCharge: 0,
        windupUntil: 0,
        attackingUntil: 0,
        defeated: true,
        deathUntil: now + ENEMY_DEATH_ANIMATION_MS,
        heroEffect: undefined,
      }
    })
    enemiesRef.current = nextEnemies
    setEnemies(nextEnemies)
    if (skippedEnemyCount > 0) {
      window.setTimeout(() => setEnemies([...enemiesRef.current]), ENEMY_DEATH_ANIMATION_MS + 40)
    }

    const skippedTaskIds = storyTasks.filter(task => task.room === room).map(task => task.id)
    const nextCompletedTaskIds = Array.from(new Set([...storyTasksCompletedRef.current, ...skippedTaskIds]))
    storyTasksCompletedRef.current = nextCompletedTaskIds
    setStoryTaskCompletedIds(nextCompletedTaskIds)

    const sceneRound = storyRoundFor(room, 'scene')
    if (sceneRound) markStoryRoundCompleted(sceneRound.id)
    stopStorySpeech()
    if (battleIntroTypeTimerRef.current !== null) {
      window.clearInterval(battleIntroTypeTimerRef.current)
      battleIntroTypeTimerRef.current = null
    }
    battleIntroActiveRef.current = false
    setStoryIntroActive(false)
    setBattleIntroActive(false)
    setActiveStoryRound(null)
    setBattleIntroLines([])
    setBattleIntroLineIndex(0)
    setBattleIntroVisibleChars(0)
    resetStoryDialogueGate()
    closeStoryOperation()
    setStoryNarration(null)
    activeQuizRef.current = null
    setActiveQuiz(null)
    setAnswers([])
    setAttackTargetId(null)
    attackTargetIdRef.current = null
    projectilesRef.current = []
    setProjectiles([])
    setFloatingTexts([])
    setGroundSwordWaves([])
    moveTargetRef.current = null

    const currentPlayer = playerRef.current
    const exitX = chapterRoomExitX(project.id)
    const gateReadyX = chapterGateReadyX(project.id)
    const nextPlayer: FighterState = {
      ...currentPlayer,
      x: room === 'dungeon' ? Math.min(currentPlayer.x, exitX - 260) : gateReadyX - 28,
      lane: 1,
      facing: 1,
      moving: false,
      crouching: false,
      jumpUntil: 0,
      rollingUntil: 0,
    }
    playerRef.current = nextPlayer
    setPlayer(nextPlayer)
    setMovementMode('idle')

    spawnFloatingText('跳关完成', nextPlayer.x, nextPlayer.lane, 'heal')
    playSfx('door')
    setGameMessage(room === 'dungeon'
      ? `${roomLabel}已跳过，最终 Boss 已开放。`
      : `${roomLabel}已跳过，前往下一场景入口。`, 1400)
  }

  function skipCurrentChapterBoss() {
    if (!canSkipCurrentChapterBoss || teamRoomId) return

    const now = Date.now()
    let skippedBossCount = 0
    const nextEnemies = enemiesRef.current.map(enemy => {
      if (enemy.kind !== 'boss' || enemy.defeated) return enemy
      skippedBossCount += 1
      return {
        ...enemy,
        hp: 0,
        moving: false,
        quizCharge: 0,
        windupUntil: 0,
        attackingUntil: 0,
        defeated: true,
        deathUntil: now + ENEMY_DEATH_ANIMATION_MS,
        heroEffect: undefined,
      }
    })
    if (skippedBossCount < 1) return

    enemiesRef.current = nextEnemies
    setEnemies(nextEnemies)
    window.setTimeout(() => setEnemies([...enemiesRef.current]), ENEMY_DEATH_ANIMATION_MS + 40)

    const bossRound = activeStoryRound?.kind === 'boss'
      ? activeStoryRound
      : storyRoundFor('dungeon', 'boss')
    if (bossRound) {
      markStoryRoundCompleted(bossRound.id)
      markStoryRoundWatched(bossRound.id)
    }
    stopStorySpeech()
    if (battleIntroTypeTimerRef.current !== null) {
      window.clearInterval(battleIntroTypeTimerRef.current)
      battleIntroTypeTimerRef.current = null
    }
    battleIntroActiveRef.current = false
    setStoryIntroActive(false)
    setBattleIntroActive(false)
    setActiveStoryRound(null)
    setBattleIntroLines([])
    setBattleIntroLineIndex(0)
    setBattleIntroVisibleChars(0)
    resetStoryDialogueGate()
    closeStoryOperation()
    setStoryNarration(null)
    activeQuizRef.current = null
    setActiveQuiz(null)
    setAnswers([])
    setAttackTargetId(null)
    attackTargetIdRef.current = null
    projectilesRef.current = []
    setProjectiles([])
    setFloatingTexts([])
    setGroundSwordWaves([])
    moveTargetRef.current = null

    const currentPlayer = playerRef.current
    const nextPlayer: FighterState = {
      ...currentPlayer,
      moving: false,
      crouching: false,
      jumpUntil: 0,
      rollingUntil: 0,
    }
    playerRef.current = nextPlayer
    setPlayer(nextPlayer)
    setMovementMode('idle')

    spawnFloatingText('Boss 跳过', nextPlayer.x, nextPlayer.lane, 'heal')
    playSfx('door')
    setGameMessage('测试账号已跳过 Boss，正在结算。', 1400)
    completeGame(nextEnemies, playerHpRef.current, correctRef.current, totalRef.current)
  }

  function skipCurrentFinalChapterStage() {
    if (!canSkipCurrentFinalStage || teamRoomId) return

    const stage = finalChapterStageRef.current
    const now = Date.now()
    let skippedEnemyCount = 0
    const nextEnemies = enemiesRef.current.map(enemy => {
      if (enemy.sceneNumber !== stage || enemy.defeated) return enemy
      skippedEnemyCount += 1
      return {
        ...enemy,
        hp: 0,
        moving: false,
        quizCharge: 0,
        windupUntil: 0,
        attackingUntil: 0,
        defeated: true,
        deathUntil: now + ENEMY_DEATH_ANIMATION_MS,
        heroEffect: undefined,
      }
    })
    enemiesRef.current = nextEnemies
    setEnemies(nextEnemies)
    if (skippedEnemyCount > 0) {
      window.setTimeout(() => setEnemies([...enemiesRef.current]), ENEMY_DEATH_ANIMATION_MS + 40)
    }

    stopStorySpeech()
    activeQuizRef.current = null
    setActiveQuiz(null)
    setAnswers([])
    setAttackTargetId(null)
    attackTargetIdRef.current = null
    projectilesRef.current = []
    setProjectiles([])
    setFloatingTexts([])
    setGroundSwordWaves([])
    moveTargetRef.current = null

    const currentPlayer = playerRef.current
    const nextPlayer: FighterState = {
      ...currentPlayer,
      x: stage >= FINAL_CHAPTER_STAGE_COUNT ? Math.min(currentPlayer.x, FINAL_CHAPTER_STAGE_BOSS_X - 340) : FINAL_CHAPTER_GATE_READY_X - 28,
      lane: 1,
      facing: 1,
      moving: false,
      crouching: false,
      jumpUntil: 0,
      rollingUntil: 0,
    }
    playerRef.current = nextPlayer
    setPlayer(nextPlayer)
    setMovementMode('idle')

    spawnFloatingText('跳关完成', nextPlayer.x, nextPlayer.lane, 'heal')
    playSfx('door')
    setGameMessage(stage >= FINAL_CHAPTER_STAGE_COUNT
      ? '最终关已跳过，正在完成终章结算。'
      : `第 ${stage} 关已跳过，前往下一关入口。`, 1400)
    completeGame(nextEnemies, playerHpRef.current, correctRef.current, totalRef.current)
  }

  function buildActiveQuizPayload() {
    const quiz = activeQuizRef.current
    if (!quiz) return null
    const enemy = enemiesRef.current.find(item => item.id === quiz.enemyId)
    return {
      ownerUserId: teamCurrentUserIdRef.current,
      enemyId: quiz.enemyId,
      prompt: quiz.prompt,
      mode: quiz.mode,
      damage: quiz.damage,
      targetTitle: quiz.targetTitle,
      question: quiz.question,
      x: enemy?.x ?? playerRef.current.x,
      lane: enemy?.lane ?? playerRef.current.lane,
      updatedAt: Date.now(),
    } satisfies RemoteActiveQuiz
  }

  function buildTeamWorldState(source: TeamRoomWorldState['source'], resolvedQuiz?: TeamRoomWorldState['resolvedQuiz']) {
    return {
      projectId: project.id,
      roomId: teamRoomId ?? '',
      source,
      enemies: enemiesRef.current.map(enemy => ({
        id: enemy.id,
        hp: enemy.hp,
        x: enemy.x,
        lane: enemy.lane,
        facing: enemy.facing,
        moving: enemy.moving,
        quizCharge: enemy.quizCharge,
        defeated: enemy.defeated,
        heroEffect: enemy.heroEffect,
      })),
      ...(isEndlessSurvival ? { endlessStats: endlessStatsRef.current } : {}),
      finalChapterStage: finalChapterStageRef.current,
      chapterRoom: chapterRoomRef.current,
      validationSealSolved: validationSealRef.current,
      storyTasksCompleted: storyTasksCompletedRef.current,
      storyDialogueGate: storyDialogueGateRef.current,
      resolvedQuiz: resolvedQuiz ?? null,
      updatedAt: Date.now(),
    } satisfies TeamRoomWorldState
  }

  function mergeTeamEndlessStats(rawStats?: EndlessSurvivalStats) {
    if (!isEndlessSurvival || !rawStats) return false
    const normalized: EndlessSurvivalStats = {
      kills: Math.max(0, Math.round(Number(rawStats.kills) || 0)),
      eliteKills: Math.max(0, Math.round(Number(rawStats.eliteKills) || 0)),
      levelsCleared: Math.max(0, Math.round(Number(rawStats.levelsCleared) || 0)),
      coins: Math.max(0, Math.round(Number(rawStats.coins) || 0)),
      gems: Math.max(0, Math.round(Number(rawStats.gems) || 0)),
    }
    const current = endlessStatsRef.current
    const merged: EndlessSurvivalStats = {
      kills: Math.max(current.kills, normalized.kills),
      eliteKills: Math.max(current.eliteKills, normalized.eliteKills),
      levelsCleared: Math.max(current.levelsCleared, normalized.levelsCleared),
      coins: Math.max(current.coins, normalized.coins),
      gems: Math.max(current.gems, normalized.gems),
    }
    const changed = merged.kills !== current.kills
      || merged.eliteKills !== current.eliteKills
      || merged.levelsCleared !== current.levelsCleared
      || merged.coins !== current.coins
      || merged.gems !== current.gems
    if (changed) {
      endlessStatsRef.current = merged
      setEndlessStats(merged)
    }
    return true
  }

  function applyTeamWorldState(rawState: unknown) {
    if (!rawState || typeof rawState !== 'object') return
    const state = rawState as Partial<TeamRoomWorldState>
    if (state.projectId !== project.id || state.roomId !== teamRoomId) return
    const updatedAt = Number(state.updatedAt)
    if (!Number.isFinite(updatedAt) || updatedAt <= teamWorldUpdatedAtRef.current) return
    if (
      state.chapterRoom
      && chapterRoomOrder(state.chapterRoom) < chapterRoomOrder(chapterRoomRef.current)
    ) {
      return
    }
    teamWorldUpdatedAtRef.current = updatedAt
    const hasIncomingEndlessStats = mergeTeamEndlessStats(state.endlessStats)

    const rawFinalStage = Number(state.finalChapterStage)
    const hasIncomingFinalStage = Number.isFinite(rawFinalStage) && rawFinalStage > 0
    const incomingFinalStage = hasIncomingFinalStage ? Math.max(1, Math.round(rawFinalStage)) : 0
    if (
      isBossRushChapter
      && hasIncomingFinalStage
      && incomingFinalStage
      && incomingFinalStage !== finalChapterStageRef.current
      && (isEndlessSurvival || incomingFinalStage >= finalChapterStageRef.current)
    ) {
      const nextStage = isEndlessSurvival ? incomingFinalStage : clamp(incomingFinalStage, 1, FINAL_CHAPTER_STAGE_COUNT)
      finalChapterStageRef.current = nextStage
      setFinalChapterStage(nextStage)
      if (isEndlessSurvival) {
        const nextStageEnemies = buildInitialEnemies(project, { endlessSurvival: true, endlessStage: nextStage })
        enemiesRef.current = nextStageEnemies
        setEnemies(nextStageEnemies)
      }
      const syncedPlayer = {
        ...playerRef.current,
        x: CHAPTER_ROOM_START_X,
        lane: 1,
        facing: 1 as const,
        moving: false,
        rollingUntil: 0,
      }
      playerRef.current = syncedPlayer
      setPlayer(syncedPlayer)
      resetAiCompanionsToChapterStart()
      moveTargetRef.current = null
      attackTargetIdRef.current = null
      setAttackTargetId(null)
      projectilesRef.current = []
      setProjectiles([])
      setFloatingTexts([])
      setGroundSwordWaves([])
      chapterTransitionLockUntilRef.current = performance.now() + 900
    }

    if (state.source !== 'story' && Array.isArray(state.enemies)) {
      const byId = new Map(state.enemies.map(enemy => [enemy.id, enemy]))
      const now = performance.now()
      const nextEnemies = enemiesRef.current.map(enemy => {
        const synced = byId.get(enemy.id)
        if (!synced) return enemy
        const defeated = Boolean(synced.defeated) || Number(synced.hp) <= 0
        const justDefeated = defeated && !enemy.defeated
        return {
          ...enemy,
          hp: Math.round(clamp(Number(synced.hp), 0, enemy.maxHp)),
          x: defeated && enemy.defeated ? enemy.x : clamp(Number(synced.x), 90, activeWorldWidth - 120),
          lane: defeated && enemy.defeated ? enemy.lane : clamp(Number(synced.lane), 0, 2),
          facing: synced.facing === -1 ? -1 as const : 1 as const,
          moving: Boolean(synced.moving),
          quizCharge: clamp(Number(synced.quizCharge), 0, enemy.quizEvery),
          heroEffect: synced.heroEffect,
          defeated,
          deathUntil: defeated ? justDefeated ? now + ENEMY_DEATH_ANIMATION_MS : enemy.deathUntil : 0,
        }
      })
      if (!hasIncomingEndlessStats) recordEndlessDefeats(enemiesRef.current, nextEnemies)
      enemiesRef.current = nextEnemies
      setEnemies(nextEnemies)
    }

    if (state.chapterRoom && state.chapterRoom !== chapterRoomRef.current) {
      chapterRoomRef.current = state.chapterRoom
      setChapterRoom(state.chapterRoom)
      chapterTransitionLockUntilRef.current = performance.now() + 900
      projectilesRef.current = []
      setProjectiles([])
      const syncedPlayer = {
        ...playerRef.current,
        x: CHAPTER_ROOM_START_X,
        lane: 1,
        facing: 1 as const,
        moving: false,
        rollingUntil: 0,
      }
      playerRef.current = syncedPlayer
      setPlayer(syncedPlayer)
      resetAiCompanionsToChapterStart()
      moveTargetRef.current = null
      attackTargetIdRef.current = null
      setAttackTargetId(null)
    }

    if (typeof state.validationSealSolved === 'boolean' && state.validationSealSolved !== validationSealRef.current) {
      validationSealRef.current = state.validationSealSolved
      setValidationSealSolved(state.validationSealSolved)
    }

    if (Array.isArray(state.storyTasksCompleted)) {
      const validTaskIds = new Set(storyTasks.map(task => task.id))
      const nextCompleted = [...new Set(state.storyTasksCompleted.filter(taskId => validTaskIds.has(taskId)))]
      const currentKey = storyTasksCompletedRef.current.join('|')
      const nextKey = nextCompleted.join('|')
      if (nextKey !== currentKey) {
        storyTasksCompletedRef.current = nextCompleted
        setStoryTaskCompletedIds(nextCompleted)
      }
    }

    if (state.storyDialogueGate && typeof state.storyDialogueGate === 'object') {
      const gate = state.storyDialogueGate as Partial<StoryDialogueGateState>
      if (typeof gate.roundId === 'string') {
        mergeStoryDialogueGate(gate.roundId, gate.readyUserIds)
      }
    }

    const resolved = state.resolvedQuiz
    if (
      resolved
      && resolved.ownerUserId === teamCurrentUserIdRef.current
      && activeQuizRef.current?.enemyId === resolved.enemyId
    ) {
      activeQuizRef.current = null
      setActiveQuiz(null)
      setAnswers([])
      setGameMessage(resolved.correct ? '队友已协助完成本次质量判断' : '队友已提交协助判断，继续推进现场', 1200)
    }
  }

  function applyLocalTeamPlayState(rawPlayer: Partial<RemoteTeamPlayer> & { activeQuiz?: unknown }) {
    if (teamLocalStateHydratedRef.current) return
    teamLocalStateHydratedRef.current = true

    const rawHp = Number(rawPlayer.hp)
    const rawX = Number(rawPlayer.x)
    const rawLane = Number(rawPlayer.lane)
    const rawSyncSeq = Number(rawPlayer.syncSeq ?? rawPlayer.seq ?? 0)
    if (Number.isFinite(rawSyncSeq)) {
      teamSyncSeqRef.current = Math.max(teamSyncSeqRef.current, Math.round(rawSyncSeq))
    }
    const nextHp = Math.round(clamp(Number.isFinite(rawHp) ? rawHp : playerMaxHpRef.current, 0, playerMaxHpRef.current))
    const savedAt = Date.parse(String(rawPlayer.updatedAt ?? ''))
    const roomStateIsNewer = Number.isFinite(savedAt) && teamWorldUpdatedAtRef.current > savedAt + 500
    const savedX = clamp(Number.isFinite(rawX) ? rawX : playerRef.current.x, 90, activeWorldWidth - 130)
    const hydratedX = isCastleChapter && roomStateIsNewer && chapterRoomRef.current !== 'hall'
      ? CHAPTER_ROOM_START_X
      : savedX
    const nextPlayer = {
      ...playerRef.current,
      x: hydratedX,
      lane: clamp(Number.isFinite(rawLane) ? rawLane : playerRef.current.lane, 0, 2),
      facing: rawPlayer.facing === -1 ? -1 as const : 1 as const,
      moving: false,
      rollingUntil: 0,
    }
    playerRef.current = nextPlayer
    setPlayer(nextPlayer)
    playerHpRef.current = nextHp
    setPlayerHp(nextHp)
    const nextDowned = rawPlayer.status === 'downed' || nextHp <= 0
    playerDownedRef.current = nextDowned
    setPlayerDowned(nextDowned)
    if (isPlayerModelId(rawPlayer.modelId)) setSelectedPlayerModelId(rawPlayer.modelId)

    const quiz = rawPlayer.activeQuiz && typeof rawPlayer.activeQuiz === 'object'
      ? rawPlayer.activeQuiz as Partial<RemoteActiveQuiz>
      : null
    if (!nextDowned && rawPlayer.status === 'answering' && quiz?.enemyId && quiz.question?.options?.length) {
      const restoredQuiz: ActiveQuiz = {
        enemyId: quiz.enemyId,
        question: quiz.question,
        prompt: quiz.prompt ?? '继续处理当前质量判断',
        mode: quiz.mode === 'heavy' ? 'heavy' : 'normal',
        damage: Number.isFinite(Number(quiz.damage)) ? Number(quiz.damage) : PLAYER_NORMAL_DAMAGE,
        targetTitle: quiz.targetTitle ?? '当前缺陷',
      }
      activeQuizRef.current = restoredQuiz
      setActiveQuiz(restoredQuiz)
      setAnswers([])
      setGameMessage('已恢复离开前的答题状态，队友也可以继续协助处理', 1400)
    } else {
      activeQuizRef.current = null
      setActiveQuiz(null)
      setAnswers([])
    }
  }

  function handleTeamRoomEvent(rawEvent: unknown) {
    if (!rawEvent || typeof rawEvent !== 'object') return
    const event = rawEvent as TeamRoomEvent
    const key = `${event.type ?? 'event'}:${event.at ?? 0}:${event.targetUserId ?? event.ownerUserId ?? ''}:${event.enemyId ?? ''}`
    if (handledRoomEventRef.current === key) return
    handledRoomEventRef.current = key

    if (event.type === 'revive' && event.targetUserId === teamCurrentUserIdRef.current) {
      const hp = Math.round(clamp(Number(event.hp) || 30, 1, playerMaxHpRef.current))
      playerHpRef.current = hp
      setPlayerHp(hp)
      playerDownedRef.current = false
      setPlayerDowned(false)
      pulsePlayerFeedback('heal')
      spawnFloatingText(`+${hp}`, playerRef.current.x, playerRef.current.lane, 'heal')
      setGameMessage('队友已扶起你，生命值恢复到 30', 1500)
      playSfx('item')
    }

    if (
      event.type === 'quizResolved'
      && event.ownerUserId === teamCurrentUserIdRef.current
      && activeQuizRef.current?.enemyId === event.enemyId
    ) {
      const eventDamage = Math.max(0, Math.round(Number(event.damage) || 0))
      if (event.enemyId && eventDamage > 0) {
        const target = enemiesRef.current.find(enemy => enemy.id === event.enemyId)
        const nextEnemies = applyEnemyDamage(event.enemyId, eventDamage, 0, true, true)
        if (target) spawnFloatingText(`答题 -${eventDamage}`, target.x, target.lane, 'damage')
        if (target) playEnemyImpactSfx(target, Boolean(nextEnemies.find(enemy => enemy.id === target.id)?.defeated))
        completeGame(nextEnemies, playerHpRef.current, correctRef.current, totalRef.current)
      }
      activeQuizRef.current = null
      setActiveQuiz(null)
      setAnswers([])
      setGameMessage('队友已协助提交判断，答题已同步关闭', 1200)
    }

    if (event.type === 'storyDialogueReady' && event.roundId) {
      mergeStoryDialogueGate(event.roundId, event.readyUserIds?.length ? event.readyUserIds : [event.targetUserId, event.byUserId].filter(Boolean))
    }

    if (event.type === 'battleEnded') {
      setGameMessage('房主已结束战斗，正在返回组队页面', 1500)
      playSfx('door')
    }

    if (event.type === 'roomDisbanded') {
      setGameMessage('房间已解散，正在退出战斗', 1500)
      playSfx('door')
    }
  }

  async function postTeamPlayState(extra: Record<string, unknown> = {}) {
    const token = readTeamAuthToken()
    if (!token || !teamRoomId) return
    const fighter = playerRef.current
    const currentAttackSignal = attackSignalRef.current
    const rollRemainingMs = Math.max(0, fighter.rollingUntil - performance.now())
    const rolling = rollRemainingMs > 0 && !playerDownedRef.current
    const status = playerDownedRef.current ? 'downed' : activeQuizRef.current ? 'answering' : 'playing'
    const activeQuizPayload = buildActiveQuizPayload()
    const reliablePush = Boolean(
      extra.worldState
      || extra.roomEvent
      || extra.reviveUserId
      || extra.activeQuiz === null
      || extra.status
      || extra.hp !== undefined
    )
    const socket = teamSocketRef.current
    if (socket?.connected && socket.id && !reliablePush) {
      const now = Date.now()
      if (now - lastSocketMoveSentAtRef.current < TEAM_SOCKET_MOVE_INTERVAL_MS) return
      lastSocketMoveSentAtRef.current = now
    }
    if (!socket?.connected && !reliablePush) {
      const now = Date.now()
      const stateKey = [
        teamRoomId,
        selectedPlayerModelRef.current.id,
        Math.round(fighter.x / 4) * 4,
        Math.round(fighter.lane * 20) / 20,
        fighter.facing,
        fighter.moving && !playerDownedRef.current ? 1 : 0,
        rolling ? 1 : 0,
        currentAttackSignal ? currentAttackSignal.sequence : attackSequenceRef.current,
        currentAttackSignal ? currentAttackSignal.phase : normalComboPhaseRef.current,
        playerHpRef.current,
        status,
        activeQuizPayload?.enemyId ?? '',
      ].join('|')
      const last = lastHttpTeamStateRef.current
      if (last.key === stateKey && now - last.sentAt < TEAM_HTTP_FALLBACK_IDLE_HEARTBEAT_MS) return
      lastHttpTeamStateRef.current = { key: stateKey, sentAt: now }
    } else if (!socket?.connected) {
      lastHttpTeamStateRef.current = { key: '', sentAt: Date.now() }
    }
    const sentAtMs = Date.now()
    const syncSeq = teamSyncSeqRef.current + 1
    teamSyncSeqRef.current = syncSeq
    const payload = {
      roomId: teamRoomId,
      modelId: selectedPlayerModelRef.current.id,
      x: fighter.x,
      lane: fighter.lane,
      facing: fighter.facing,
      moving: fighter.moving && !playerDownedRef.current,
      rolling,
      rollingUntil: rolling ? sentAtMs + rollRemainingMs : 0,
      rollDuration: selectedPlayerModelRef.current.durations?.roll ?? DEFAULT_ROLL_DURATION_MS,
      attacking: Boolean(currentAttackSignal) && !playerDownedRef.current,
      attackSequence: currentAttackSignal?.sequence ?? attackSequenceRef.current,
      attackPhase: currentAttackSignal?.phase ?? normalComboPhaseRef.current,
      hp: playerHpRef.current,
      status,
      activeQuiz: activeQuizPayload,
      ...extra,
      syncSeq,
      seq: syncSeq,
      updatedAtMs: sentAtMs,
    }
    if (socket?.connected && socket.id) {
      if (reliablePush) {
        socket.emit('team:state', payload)
      } else {
        socket.volatile.emit('team:move', payload)
      }
      return
    }
    await fetch('/api/team/play-state', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    }).catch(() => undefined)
  }

  useEffect(() => {
    playerDownedRef.current = playerDowned
  }, [playerDowned])

  useEffect(() => {
    if (!teamRoomId || !started || completedRef.current) return
    if (playerHp > 0 || playerDownedRef.current) return
    playerDownedRef.current = true
    setPlayerDowned(true)
    activeQuizRef.current = null
    setActiveQuiz(null)
    setAssistQuiz(null)
    setAnswers([])
    setGameMessage('你已倒地，等待队友靠近后扶起。组队模式不会立刻结算失败。', 1800)
    void postTeamPlayState({ status: 'downed', activeQuiz: null })
  }, [playerHp, started, teamRoomId, setGameMessage])

  useEffect(() => {
    if (!teamRoomId || !started || !playerDowned || playerHp <= 0) return
    playerDownedRef.current = false
    setPlayerDowned(false)
  }, [playerDowned, playerHp, started, teamRoomId])

  useEffect(() => {
    if (!teamRoomId || !started || completedRef.current || !playerDowned || !remotePlayers.length) return
    const allRemoteDowned = remotePlayers.every(remote => remote.status === 'downed' || remote.hp <= 0)
    if (!allRemoteDowned) return
    if (isEndlessSurvival) {
      setGameMessage('全队倒地，正在按本场无尽进度结算奖励。', 1800)
      settleEndlessSurvival(enemiesRef.current, 0)
      return
    }
    completedRef.current = true
    setGameMessage('全队倒地，调查失败。需要重新从组队大厅进入。', 1800)
    window.setTimeout(() => {
      onComplete({
        victory: false,
        correct: correctRef.current,
        total: Math.max(1, totalRef.current),
        hp: 0,
        bossHp: Math.max(0, enemiesRef.current.find(enemy => enemy.kind === 'boss')?.hp ?? 0),
        storyScore: totalRef.current > 0 ? Math.round((correctRef.current / totalRef.current) * 100) : 0,
        projectScore: 0,
      })
    }, GAME_COMPLETE_SETTLE_MS)
  }, [isEndlessSurvival, onComplete, playerDowned, remotePlayers, setGameMessage, started, teamRoomId])

  useEffect(() => {
    if (!teamRoomId || started) return
    let cancelled = false
    async function refreshTeamLoadout() {
      const token = readTeamAuthToken()
      if (!token || !teamRoomId || cancelled) return
      const response = await fetch(`/api/team/rooms?roomId=${encodeURIComponent(teamRoomId)}&projectId=${project.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null)
      if (!response?.ok || cancelled) return
      const data = await response.json().catch(() => null) as TeamLoadoutRoomSnapshot | null
      if (!data || cancelled) return
      setTeamLoadoutRoom(data)
      teamAuthorityRef.current = Boolean(data.room?.mine)
      const me = data.members.find(member => member.mine)
      if (me?.combatRoleId && isPlayerModelId(me.combatRoleId)) {
        setSelectedPlayerModelId(me.combatRoleId)
        setPendingTeamModelId(me.combatRoleId)
      }
      if (
        data.room?.status === 'started'
        && me?.combatRoleId
        && isPlayerModelId(me.combatRoleId)
        && !teamLaunchStartedRef.current
      ) {
        const playStateResponse = await fetch(`/api/team/play-state?roomId=${encodeURIComponent(teamRoomId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null)
        const playState = playStateResponse?.ok
          ? await playStateResponse.json().catch(() => null) as TeamPlaySyncSnapshot | null
          : null
        const hasRunningBattleState = Boolean(playState?.roomState?.state)
        if (hasRunningBattleState && !cancelled) {
          teamLaunchStartedRef.current = true
          setStoryIntroSeen(true)
          setStoryIntroActive(false)
          setTeamLaunchActive(false)
          setTeamLaunchProgress(1)
          setTeamLoadoutNotice('正在同步已进行的战斗现场')
          launchTrainingRun()
          return
        }
      }
      if (me?.combatRoleId && data.members.length >= 2 && data.members.every(member => member.combatRoleId)) {
        setTeamLoadoutNotice('所有队员已锁定角色，正在准备进入调查')
      }
    }
    void refreshTeamLoadout()
    const timer = window.setInterval(() => void refreshTeamLoadout(), 1200)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [project.id, started, teamRoomId])

  useEffect(() => {
    if (!teamRoomId || started) return
    teamLoadoutAutoSubmittedRef.current = false
    teamLaunchStartedRef.current = false
    setTeamLoadoutSecondsLeft(60)
    setTeamLaunchActive(false)
    setTeamLaunchProgress(0)
    const deadline = Date.now() + 60000
    const timer = window.setInterval(() => {
      const secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setTeamLoadoutSecondsLeft(secondsLeft)
      if (secondsLeft > 0 || teamLoadoutAutoSubmittedRef.current) return
      teamLoadoutAutoSubmittedRef.current = true
      void autoAssignTeamCombatRoles()
    }, 250)
    return () => window.clearInterval(timer)
  }, [started, teamRoomId])

  useEffect(() => {
    if (!teamRoomId || started) {
      teamLaunchStartedRef.current = false
      setTeamLaunchActive(false)
      setTeamLaunchProgress(0)
      return undefined
    }
    if (!teamCanBeginRun) {
      teamLaunchStartedRef.current = false
      setTeamLaunchActive(false)
      setTeamLaunchProgress(0)
      return undefined
    }
    if (teamLaunchStartedRef.current) return undefined

    teamLaunchStartedRef.current = true
    setTeamLaunchActive(true)
    setTeamLaunchProgress(0)
    setTeamLoadoutNotice('队员角色已锁定，正在同步进入进度')
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / TEAM_LAUNCH_DURATION_MS)
      setTeamLaunchProgress(progress)
      if (progress < 1) return
      window.clearInterval(timer)
      beginTrainingRun()
    }, 80)

    return () => window.clearInterval(timer)
  }, [started, teamCanBeginRun, teamRoomId])

  useEffect(() => {
    if (!teamRoomId || started || !storyIntroActive) {
      teamStoryLaunchStartedRef.current = false
      return undefined
    }
    if (!teamStoryRolesReady) {
      teamStoryLaunchStartedRef.current = false
      return undefined
    }
    if (teamStoryLaunchStartedRef.current) return undefined

    teamStoryLaunchStartedRef.current = true
    setTeamLoadoutNotice('剧情角色已全员认领，正在同步进入战斗')
    const timer = window.setTimeout(() => {
      startBattleFromStoryIntro()
    }, 900)
    return () => window.clearTimeout(timer)
  }, [started, storyIntroActive, teamRoomId, teamStoryRolesReady])

  const pulsePlayerFeedback = useCallback((kind: PlayerFeedback) => {
    setPlayerFeedback(kind)
    window.setTimeout(() => setPlayerFeedback(current => current === kind ? null : current), 320)
  }, [])

  const spawnFloatingText = useCallback((text: string, x: number, lane: number, kind: FloatingTextKind) => {
    const id = ++floatingTextIdRef.current
    setFloatingTexts(current => [...current.slice(-8), { id, text, x, lane, kind }])
    window.setTimeout(() => {
      setFloatingTexts(current => current.filter(item => item.id !== id))
    }, 860)
  }, [])

  function clearPlayerEntryTimer() {
    if (playerEntryTimerRef.current !== null) {
      window.clearTimeout(playerEntryTimerRef.current)
      playerEntryTimerRef.current = null
    }
  }

  function triggerPlayerEntry() {
    clearPlayerEntryTimer()
    setPlayerEntryActive(true)
    playSfx('entry')
    playerEntryTimerRef.current = window.setTimeout(() => {
      setPlayerEntryActive(false)
      playerEntryTimerRef.current = null
    }, PLAYER_ENTRY_DURATION_MS)
  }

  function knockLocalPlayer(direction: 1 | -1, distance = PLAYER_HIT_KNOCKBACK) {
    const current = playerRef.current
    const next: FighterState = {
      ...current,
      x: clamp(current.x + direction * distance, 90, activeWorldWidth - 130),
      moving: false,
      rollingUntil: 0,
    }
    playerRef.current = next
    setPlayer(next)
    moveTargetRef.current = null
    if (movementModeRef.current !== 'idle') {
      movementModeRef.current = 'idle'
      setMovementMode('idle')
    }
  }

  function audioContext() {
    if (typeof window === 'undefined') return null
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return null
    if (!audioContextRef.current) audioContextRef.current = new AudioContextCtor()
    return audioContextRef.current
  }

  function playAudioSources(sources: readonly string[], fallbackName: SfxName, cooldownKey: string = fallbackName, volumeFactor = 0.88) {
    const volumeScale = Math.min(1, Math.max(0, sfxVolumeRef.current / 100))
    if (!soundEnabledRef.current || volumeScale <= 0) return
    const now = Date.now()
    if ((sfxCooldownRef.current[cooldownKey] ?? 0) > now) return
    sfxCooldownRef.current[cooldownKey] = now + 38

    const source = sources[Math.floor(Math.random() * sources.length)]
    const audio = new Audio(source)
    audio.preload = 'auto'
    audio.volume = Math.min(1, volumeScale * volumeFactor)
    activeSfxRef.current.add(audio)
    const release = () => activeSfxRef.current.delete(audio)
    audio.addEventListener('ended', release, { once: true })
    audio.addEventListener('error', release, { once: true })
    playGamePunchLayer(fallbackName, volumeScale * volumeFactor)
    void audio.play().catch(() => {
      release()
      playSynthSfx(fallbackName, volumeScale)
    })
  }

  function playSfx(name: SfxName) {
    playAudioSources(SFX_ASSETS[name], name)
  }

  function bossSfxId(enemy: EnemyState) {
    return enemy.bossSpriteId ?? PROJECT_BOSS_SPRITE_IDS[project.id] ?? 'boss1'
  }

  function playEnemyAttackSfx(enemy: EnemyState) {
    if (enemy.kind === 'boss') {
      const bossId = bossSfxId(enemy)
      playAudioSources(BOSS_ATTACK_SFX_ASSETS[bossId], 'bossAttack', `bossAttack:${bossId}`, 0.96)
      return
    }
    playAudioSources(ENEMY_ATTACK_SFX_ASSETS[enemy.form] ?? SFX_ASSETS.enemyAttack, 'enemyAttack', `enemyAttack:${enemy.form}`, 0.9)
  }

  function playEnemyRangedSfx(enemy: EnemyState) {
    const formSources = enemy.kind === 'boss'
      ? BOSS_ATTACK_SFX_ASSETS[bossSfxId(enemy)]
      : ENEMY_ATTACK_SFX_ASSETS[enemy.form] ?? []
    playAudioSources([...formSources, ...SFX_ASSETS.enemyRanged], 'enemyRanged', `enemyRanged:${enemy.kind === 'boss' ? bossSfxId(enemy) : enemy.form}`, 0.88)
  }

  function playEnemyImpactSfx(enemy: EnemyState, defeated: boolean) {
    if (enemy.kind === 'boss') {
      const bossId = bossSfxId(enemy)
      playAudioSources(defeated ? BOSS_DEATH_SFX_ASSETS[bossId] : SFX_ASSETS.enemyHit, defeated ? 'enemyDeath' : 'enemyHit', `bossImpact:${bossId}:${defeated ? 'death' : 'hit'}`, defeated ? 1 : 0.88)
      return
    }
    const sources = defeated ? ENEMY_DEATH_SFX_ASSETS[enemy.form] : SFX_ASSETS.enemyHit
    playAudioSources(sources ?? (defeated ? SFX_ASSETS.enemyDeath : SFX_ASSETS.enemyHit), defeated ? 'enemyDeath' : 'enemyHit', `enemyImpact:${enemy.form}:${defeated ? 'death' : 'hit'}`, defeated ? 0.96 : 0.86)
  }

  function playGamePunchLayer(name: SfxName, volumeScale: number) {
    const combatLayerNames: SfxName[] = [
      'attack',
      'heavy',
      'ranged',
      'enemyRanged',
      'enemyAttack',
      'bossAttack',
      'enemyHit',
      'enemyDeath',
      'playerHit',
      'projectileBreak',
      'correct',
      'wrong',
      'quiz',
      'quizSelect',
    ]
    if (!combatLayerNames.includes(name)) return

    const context = audioContext()
    if (!context) return
    if (context.state === 'suspended') {
      void context.resume().then(() => playGamePunchLayer(name, volumeScale)).catch(() => undefined)
      return
    }

    const startAt = context.currentTime + 0.004
    const output = context.createGain()
    const compressor = context.createDynamicsCompressor()
    compressor.threshold.setValueAtTime(-20, startAt)
    compressor.knee.setValueAtTime(8, startAt)
    compressor.ratio.setValueAtTime(8, startAt)
    compressor.attack.setValueAtTime(0.003, startAt)
    compressor.release.setValueAtTime(0.18, startAt)
    output.gain.setValueAtTime(0.0001, startAt)
    output.gain.exponentialRampToValueAtTime(Math.max(0.0001, Math.min(0.34, volumeScale * 0.28)), startAt + 0.01)
    output.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.54)
    output.connect(compressor)
    compressor.connect(context.destination)

    const tone = (
      frequency: number,
      endFrequency: number,
      duration: number,
      type: OscillatorType,
      delay = 0,
      gainValue = 0.22,
    ) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const toneStart = startAt + delay
      oscillator.type = type
      oscillator.frequency.setValueAtTime(Math.max(24, frequency), toneStart)
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(24, endFrequency), toneStart + duration)
      gain.gain.setValueAtTime(0.0001, toneStart)
      gain.gain.linearRampToValueAtTime(gainValue, toneStart + 0.006)
      gain.gain.exponentialRampToValueAtTime(0.0001, toneStart + duration)
      oscillator.connect(gain)
      gain.connect(output)
      oscillator.start(toneStart)
      oscillator.stop(toneStart + duration + 0.03)
    }

    const burst = (
      duration: number,
      delay = 0,
      frequency = 1100,
      filterType: BiquadFilterType = 'bandpass',
      q = 0.9,
      gainValue = 0.2,
    ) => {
      const frameCount = Math.max(1, Math.floor(context.sampleRate * duration))
      const buffer = context.createBuffer(1, frameCount, context.sampleRate)
      const data = buffer.getChannelData(0)
      for (let index = 0; index < frameCount; index += 1) {
        const decay = 1 - index / frameCount
        data[index] = (Math.random() * 2 - 1) * decay * decay
      }
      const source = context.createBufferSource()
      const gain = context.createGain()
      const filter = context.createBiquadFilter()
      const noiseStart = startAt + delay
      source.buffer = buffer
      filter.type = filterType
      filter.frequency.setValueAtTime(frequency, noiseStart)
      filter.Q.setValueAtTime(q, noiseStart)
      gain.gain.setValueAtTime(0.0001, noiseStart)
      gain.gain.linearRampToValueAtTime(gainValue, noiseStart + 0.004)
      gain.gain.exponentialRampToValueAtTime(0.0001, noiseStart + duration)
      source.connect(filter)
      filter.connect(gain)
      gain.connect(output)
      source.start(noiseStart)
      source.stop(noiseStart + duration + 0.03)
    }

    if (name === 'attack') {
      tone(520, 170, 0.08, 'sawtooth', 0, 0.16)
      burst(0.05, 0, 1800, 'highpass', 0.7, 0.16)
    }
    if (name === 'heavy') {
      tone(98, 38, 0.24, 'sine', 0, 0.24)
      tone(260, 72, 0.12, 'sawtooth', 0.01, 0.15)
      burst(0.16, 0.012, 620, 'lowpass', 0.8, 0.24)
      burst(0.045, 0.018, 2600, 'highpass', 0.65, 0.14)
    }
    if (name === 'ranged' || name === 'enemyRanged') {
      tone(name === 'ranged' ? 1180 : 760, name === 'ranged' ? 420 : 1280, 0.12, 'square', 0, 0.13)
      burst(0.05, 0.02, 3200, 'bandpass', 1.6, 0.1)
    }
    if (name === 'enemyAttack') {
      tone(170, 62, 0.16, 'sawtooth', 0, 0.2)
      burst(0.09, 0.01, 900, 'lowpass', 0.75, 0.2)
      burst(0.035, 0.015, 2100, 'highpass', 0.9, 0.1)
    }
    if (name === 'bossAttack') {
      tone(72, 30, 0.34, 'sine', 0, 0.28)
      tone(150, 44, 0.2, 'sawtooth', 0.02, 0.18)
      burst(0.2, 0.018, 520, 'lowpass', 0.6, 0.28)
      burst(0.065, 0.035, 2400, 'highpass', 0.75, 0.16)
    }
    if (name === 'enemyHit') {
      tone(210, 82, 0.11, 'triangle', 0, 0.16)
      tone(1800, 620, 0.035, 'square', 0, 0.09)
      burst(0.065, 0, 1300, 'highpass', 0.8, 0.18)
    }
    if (name === 'enemyDeath') {
      tone(124, 34, 0.34, 'sawtooth', 0, 0.22)
      burst(0.22, 0.015, 520, 'lowpass', 0.62, 0.26)
      burst(0.08, 0.04, 2200, 'highpass', 0.78, 0.14)
    }
    if (name === 'playerHit') {
      tone(92, 44, 0.2, 'sawtooth', 0, 0.22)
      burst(0.14, 0, 760, 'lowpass', 0.7, 0.24)
    }
    if (name === 'projectileBreak') {
      tone(1200, 420, 0.055, 'square', 0, 0.1)
      burst(0.07, 0, 2600, 'highpass', 0.75, 0.16)
    }
    if (name === 'correct') {
      tone(640, 920, 0.07, 'triangle', 0, 0.11)
      tone(920, 1280, 0.1, 'sine', 0.06, 0.09)
    }
    if (name === 'wrong') {
      tone(220, 92, 0.2, 'sawtooth', 0, 0.18)
      burst(0.08, 0.03, 700, 'lowpass', 0.75, 0.16)
    }
    if (name === 'quiz') {
      tone(420, 760, 0.08, 'triangle', 0, 0.1)
      tone(760, 1120, 0.11, 'triangle', 0.075, 0.08)
    }
    if (name === 'quizSelect') {
      tone(700, 980, 0.055, 'triangle', 0, 0.075)
      burst(0.025, 0, 1800, 'bandpass', 1.4, 0.055)
    }
  }

  function playSynthSfx(name: SfxName, volumeScale: number) {
    const context = audioContext()
    if (!context) return
    if (context.state === 'suspended') {
      void context.resume().then(() => playSynthSfx(name, volumeScale)).catch(() => undefined)
      return
    }

    const startAt = context.currentTime + 0.005
    const output = context.createGain()
    output.gain.setValueAtTime(0.16 * volumeScale, startAt)
    output.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.42)
    output.connect(context.destination)

    const tone = (frequency: number, duration: number, type: OscillatorType, delay = 0, endFrequency?: number, volume = 1) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const toneStart = startAt + delay
      oscillator.type = type
      oscillator.frequency.setValueAtTime(frequency, toneStart)
      if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(24, endFrequency), toneStart + duration)
      gain.gain.setValueAtTime(0.0001, toneStart)
      gain.gain.exponentialRampToValueAtTime(0.15 * volume, toneStart + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, toneStart + duration)
      oscillator.connect(gain)
      gain.connect(output)
      oscillator.start(toneStart)
      oscillator.stop(toneStart + duration + 0.02)
    }

    const noise = (duration: number, delay = 0, volume = 0.7) => {
      const frameCount = Math.max(1, Math.floor(context.sampleRate * duration))
      const buffer = context.createBuffer(1, frameCount, context.sampleRate)
      const data = buffer.getChannelData(0)
      for (let index = 0; index < frameCount; index += 1) {
        data[index] = (Math.random() * 2 - 1) * (1 - index / frameCount)
      }
      const source = context.createBufferSource()
      const gain = context.createGain()
      const filter = context.createBiquadFilter()
      const noiseStart = startAt + delay
      source.buffer = buffer
      filter.type = 'bandpass'
      filter.frequency.setValueAtTime(680, noiseStart)
      filter.Q.setValueAtTime(0.7, noiseStart)
      gain.gain.setValueAtTime(0.0001, noiseStart)
      gain.gain.exponentialRampToValueAtTime(0.18 * volume, noiseStart + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0001, noiseStart + duration)
      source.connect(filter)
      filter.connect(gain)
      gain.connect(output)
      source.start(noiseStart)
      source.stop(noiseStart + duration + 0.02)
    }

    if (name === 'attack') tone(220, 0.08, 'square', 0, 120, 0.75)
    if (name === 'heavy') {
      tone(120, 0.16, 'sawtooth', 0, 58, 1)
      noise(0.1, 0.03, 0.5)
    }
    if (name === 'ranged') tone(760, 0.12, 'triangle', 0, 360, 0.72)
    if (name === 'enemyRanged') {
      tone(310, 0.2, 'sawtooth', 0, 760, 0.72)
      tone(880, 0.08, 'square', 0.12, 420, 0.34)
    }
    if (name === 'enemyAttack') {
      tone(190, 0.1, 'sawtooth', 0, 85, 0.82)
      noise(0.07, 0.02, 0.42)
    }
    if (name === 'bossAttack') {
      tone(92, 0.22, 'sawtooth', 0, 42, 1)
      noise(0.18, 0.03, 0.78)
    }
    if (name === 'hit') {
      tone(320, 0.09, 'sawtooth', 0, 130, 0.85)
      noise(0.08, 0, 0.74)
    }
    if (name === 'enemyHit') {
      tone(260, 0.1, 'square', 0, 110, 0.9)
      noise(0.1, 0, 0.8)
    }
    if (name === 'enemyDeath') {
      tone(150, 0.2, 'sawtooth', 0, 52, 0.92)
      noise(0.16, 0.02, 0.74)
    }
    if (name === 'playerHit') {
      tone(90, 0.2, 'sawtooth', 0, 48, 1)
      noise(0.18, 0, 1)
    }
    if (name === 'projectileBreak') {
      tone(780, 0.08, 'triangle', 0, 1120, 0.52)
      noise(0.05, 0, 0.36)
    }
    if (name === 'roll') tone(170, 0.2, 'triangle', 0, 310, 0.62)
    if (name === 'dodge') {
      tone(680, 0.08, 'sine', 0, 980, 0.44)
      noise(0.06, 0, 0.28)
    }
    if (name === 'item') {
      tone(440, 0.08, 'triangle', 0, 620, 0.56)
      tone(760, 0.12, 'sine', 0.07, 1040, 0.5)
    }
    if (name === 'inventory') tone(280, 0.08, 'triangle', 0, 420, 0.42)
    if (name === 'pickup') {
      tone(640, 0.09, 'sine', 0, 820, 0.58)
      tone(920, 0.12, 'sine', 0.08, 1120, 0.5)
    }
    if (name === 'quiz') {
      tone(520, 0.08, 'triangle', 0, 720, 0.65)
      tone(780, 0.12, 'triangle', 0.09, 980, 0.58)
    }
    if (name === 'correct') {
      tone(540, 0.08, 'sine', 0, 680, 0.62)
      tone(720, 0.1, 'sine', 0.08, 940, 0.56)
      tone(960, 0.14, 'sine', 0.18, 1180, 0.5)
    }
    if (name === 'wrong') {
      tone(220, 0.12, 'square', 0, 140, 0.7)
      tone(150, 0.18, 'sawtooth', 0.12, 80, 0.52)
    }
    if (name === 'start') {
      tone(360, 0.1, 'triangle', 0, 540, 0.52)
      tone(620, 0.16, 'sine', 0.1, 860, 0.48)
    }
    if (name === 'entry') {
      noise(0.08, 0, 0.42)
      tone(180, 0.08, 'triangle', 0.04, 320, 0.5)
      tone(620, 0.12, 'sine', 0.12, 880, 0.42)
    }
  }

  function startBackgroundMusic() {
    if (!soundEnabledRef.current || musicVolumeRef.current <= 0) return
    if (!backgroundMusicRef.current || backgroundMusicRef.current.dataset.asset !== backgroundMusicAsset) {
      backgroundMusicRef.current?.pause()
      const backgroundMusic = new Audio(backgroundMusicAsset)
      backgroundMusic.loop = true
      backgroundMusic.preload = 'auto'
      backgroundMusic.dataset.asset = backgroundMusicAsset
      backgroundMusicRef.current = backgroundMusic
    }
    backgroundMusicRef.current.volume = Math.min(0.36, Math.max(0, musicVolumeRef.current / 100) * 0.32)
    void backgroundMusicRef.current.play().catch(() => undefined)
  }

  function enemyInActiveCombatStage(enemy: EnemyState) {
    if (isCastleChapter) return enemy.room === chapterRoomRef.current
    if (isBossRushChapter) return enemy.sceneNumber === finalChapterStageRef.current
    return true
  }

  const updateTargets = useCallback((fighter: FighterState) => {
    const nearest = enemiesRef.current
      .filter(enemy => !enemy.defeated && enemyInActiveCombatStage(enemy) && (enemy.kind === 'defect' || bossUnlockedRef.current))
      .map(enemy => ({ enemy, distance: Math.abs(enemy.x - fighter.x) + Math.abs(enemy.lane - fighter.lane) * 170 }))
      .sort((a, b) => a.distance - b.distance)[0]

    const inRange = enemiesRef.current
      .filter(enemy => !enemy.defeated && enemyInActiveCombatStage(enemy) && (enemy.kind === 'defect' || bossUnlockedRef.current))
      .find(enemy => {
        const directionDistance = (enemy.x - fighter.x) * fighter.facing
        const contactPadding = enemyMeleeContactPadding(enemy, project.id)
        return isCloseLane(enemy.lane, fighter.lane)
          && directionDistance > -(PLAYER_ACTION_BACK_REACH + Math.round(contactPadding * 0.25))
          && directionDistance <= playerMeleeReach(selectedPlayerModelRef.current) + contactPadding
      })

    const nextTargetId = inRange?.id ?? null
    if (attackTargetIdRef.current !== nextTargetId) {
      attackTargetIdRef.current = nextTargetId
      setAttackTargetId(nextTargetId)
    }

    if (nearest && Date.now() > messageLockUntilRef.current) {
      const nextMessage = nearest.enemy.kind === 'boss'
        ? `Boss 已出现：${nearest.enemy.title}`
        : `追踪缺陷：${nearest.enemy.defect}`
      if (messageRef.current !== nextMessage) {
        messageRef.current = nextMessage
        setMessage(nextMessage)
      }
    }
  }, [isCastleChapter, isBossRushChapter, project.id])

  function recordEndlessDefeats(previousEnemies: EnemyState[], nextEnemies: EnemyState[]) {
    if (!isEndlessSurvival) return
    const previousById = new Map(previousEnemies.map(enemy => [enemy.id, enemy]))
    const defeatedNow = nextEnemies.filter(enemy => enemy.defeated && !previousById.get(enemy.id)?.defeated)
    if (!defeatedNow.length) return
    const gained = defeatedNow.reduce<EndlessSurvivalStats>((sum, enemy) => {
      const stage = Math.max(1, Math.round(enemy.sceneNumber ?? finalChapterStageRef.current))
      const reward = endlessSurvivalReward(enemy, stage)
      return {
        kills: sum.kills + 1,
        eliteKills: sum.eliteKills + (enemy.kind === 'boss' || isEliteEnemyForm(enemy.form) || enemy.form === 'tank' ? 1 : 0),
        levelsCleared: sum.levelsCleared + (enemy.kind === 'boss' ? 1 : 0),
        coins: sum.coins + reward.coins,
        gems: sum.gems + reward.gems,
      }
    }, { kills: 0, eliteKills: 0, levelsCleared: 0, coins: 0, gems: 0 })
    const nextStats = {
      kills: endlessStatsRef.current.kills + gained.kills,
      eliteKills: endlessStatsRef.current.eliteKills + gained.eliteKills,
      levelsCleared: endlessStatsRef.current.levelsCleared + gained.levelsCleared,
      coins: endlessStatsRef.current.coins + gained.coins,
      gems: endlessStatsRef.current.gems + gained.gems,
    }
    endlessStatsRef.current = nextStats
    setEndlessStats(nextStats)
  }

  function settleEndlessSurvival(nextEnemies = enemiesRef.current, nextHp = playerHpRef.current) {
    if (!isEndlessSurvival || completedRef.current) return
    completedRef.current = true
    const stats = endlessStatsRef.current
    const accuracy = totalRef.current > 0 ? Math.round((correctRef.current / totalRef.current) * 100) : 0
    const activeBoss = nextEnemies.find(enemy => enemy.kind === 'boss' && enemy.sceneNumber === finalChapterStageRef.current)
      ?? nextEnemies.find(enemy => enemy.kind === 'boss')
    const result: EndlessSurvivalCompletion = {
      victory: false,
      correct: correctRef.current,
      total: Math.max(1, totalRef.current),
      hp: Math.max(0, nextHp),
      bossHp: Math.max(0, activeBoss?.hp ?? 0),
      storyScore: accuracy,
      projectScore: accuracy,
      ...stats,
    }
    window.setTimeout(() => {
      if (onEndlessCompleteRef.current) {
        onEndlessCompleteRef.current(result)
      } else {
        onCompleteRef.current(result)
      }
    }, GAME_COMPLETE_SETTLE_MS)
  }

  const completeGame = useCallback((nextEnemies: EnemyState[], nextHp: number, nextCorrect: number, nextTotal: number) => {
    if (completedRef.current) return
    if (isEndlessSurvival) {
      if (!teamRoomId && nextHp <= 0) settleEndlessSurvival(nextEnemies, nextHp)
      return
    }
    const nextBoss = nextEnemies.find(enemy => enemy.kind === 'boss')
    const allCleared = nextEnemies.length > 0 && nextEnemies.every(enemy => enemy.defeated)
    const bossDefeated = Boolean(nextBoss?.defeated || (nextBoss && nextBoss.hp <= 0))
    const accuracy = nextTotal > 0 ? Math.round((nextCorrect / nextTotal) * 100) : 0
    const shouldSettle = (!teamRoomId && nextHp <= 0) || allCleared || (!isBossRushChapter && bossDefeated)
    if (!shouldSettle) return

    completedRef.current = true
    const result = {
      victory: allCleared && (teamRoomId ? true : nextHp > 0),
      correct: nextCorrect,
      total: Math.max(1, nextTotal),
      hp: Math.max(0, nextHp),
      bossHp: allCleared ? 0 : Math.max(0, nextBoss?.hp ?? 0),
      storyScore: accuracy,
      projectScore: accuracy,
    }
    window.setTimeout(() => onCompleteRef.current(result), GAME_COMPLETE_SETTLE_MS)
  }, [isBossRushChapter, isEndlessSurvival, teamRoomId])

  useEffect(() => {
    const localQuizEnemy = activeQuizRef.current
      ? enemiesRef.current.find(enemy => enemy.id === activeQuizRef.current?.enemyId) ?? null
      : null
    if (!started || !teamRoomId || !remotePlayers.length || (activeQuizRef.current && localQuizEnemy?.kind !== 'boss') || timedOut || completedRef.current) return
    const now = performance.now()
    for (const remote of remotePlayers) {
      if (remote.aiControlled || remote.status === 'downed' || remote.status === 'answering' || remote.status === 'reviving' || remote.hp <= 0) continue
      if (!remote.attacking) continue
      const lastHit = lastRemoteHitAtRef.current[remote.userId] ?? 0
      const attackSequence = Math.round(Number(remote.attackSequence) || 0)
      if (attackSequence > 0 && lastRemoteAttackSequenceRef.current[remote.userId] === attackSequence) continue
      if (attackSequence <= 0 && now - lastHit < 520) continue
      const remoteModel = playerModelById(remote.modelId)
      const remoteHeroEffectAttack = attackSequence > 0 && attackSequence % HERO_EFFECT_TRIGGER_EVERY === 0
      if (
        remoteModel.id === 'knight-hero'
        && remoteHeroEffectAttack
        && lastRemoteKnightWaveSequenceRef.current[remote.userId] !== attackSequence
      ) {
        lastRemoteKnightWaveSequenceRef.current[remote.userId] = attackSequence
        releaseKnightGroundWaveFrom(remote, remote.displayName, false)
      }
      const target = enemiesRef.current
        .filter(enemy => !enemy.defeated && enemyInActiveCombatStage(enemy) && (enemy.kind === 'defect' || bossUnlockedRef.current))
        .filter(enemy => !quizLockedEnemyIdsRef.current.has(enemy.id))
        .filter(enemy => isCloseLane(enemy.lane, remote.lane))
        .map(enemy => ({ enemy, distance: (enemy.x - remote.x) * remote.facing }))
        .filter(item => item.distance > -54 && item.distance <= PLAYER_ACTION_RANGE + 22)
        .sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance))[0]?.enemy
      if (!target) continue
      lastRemoteHitAtRef.current[remote.userId] = now
      if (attackSequence > 0) lastRemoteAttackSequenceRef.current[remote.userId] = attackSequence
      const remoteComboSteps = playerComboSteps(remoteModel)
      const remotePhase = Math.max(1, Math.round(Number(remote.attackPhase) || 1))
      const remoteComboStep = remoteComboSteps[(remotePhase - 1) % Math.max(1, remoteComboSteps.length)] ?? remoteComboSteps[0]
      const damage = Math.max(4, Math.round((target.kind === 'boss' ? 5 : 7) * (remoteComboStep?.damageScale ?? 1)))
      let nextEnemies = applyEnemyDamage(target.id, damage, 1)
      spawnFloatingText(`${remote.displayName} -${damage}`, target.x, target.lane, 'damage')
      if (remoteHeroEffectAttack) {
        if (remoteModel.id !== 'knight-hero') {
          nextEnemies = applyHeroImpactEffect(target.id, remoteModel.id, damage, remoteComboStep?.animation, remotePhase)
        }
      }
      setGameMessage(`${remote.displayName} 正在协同处置`, 620)
      playEnemyImpactSfx(target, Boolean(nextEnemies.find(enemy => enemy.id === target.id)?.defeated))
      completeGame(nextEnemies, playerHpRef.current, correctRef.current, totalRef.current)
    }
  }, [completeGame, isCastleChapter, remotePlayers, setGameMessage, spawnFloatingText, started, teamRoomId, timedOut])

  function remoteCanBeEnemyTarget(remote: RemoteTeamPlayer) {
    return remote.status !== 'downed' && remote.status !== 'reviving' && remote.status !== 'answering' && remote.hp > 0
  }

  function buildEnemyTargetCandidates(fighter: FighterState): EnemyTargetCandidate[] {
    const candidates: EnemyTargetCandidate[] = []
    if (!playerDownedRef.current && playerHpRef.current > 0 && !activeQuizRef.current) {
      candidates.push({
        id: teamCurrentUserIdRef.current ?? 'local-player',
        x: fighter.x,
        lane: fighter.lane,
        local: true,
      })
    }
    for (const remote of remotePlayersRef.current) {
      if (!remoteCanBeEnemyTarget(remote)) continue
      candidates.push({
        id: remote.userId,
        x: remote.x,
        lane: remote.lane,
        local: false,
      })
    }
    return candidates
  }

  function selectEnemyTarget(enemy: EnemyState, candidates: EnemyTargetCandidate[]) {
    if (!candidates.length) {
      delete enemyTargetIdsRef.current[enemy.id]
      return null
    }

    const scored = candidates
      .map(candidate => ({
        candidate,
        distance: Math.abs(candidate.x - enemy.x) + lanePixelDistance(candidate.lane, enemy.lane) * 2.2,
      }))
      .sort((a, b) => a.distance - b.distance)
    const best = scored[0]
    if (!best) return null

    enemyTargetIdsRef.current[enemy.id] = best.candidate.id
    return best.candidate
  }

  function currentRoomGateOpenForAi() {
    if (!isCastleChapter) return false
    const room = chapterRoomRef.current
    if (room === 'dungeon') return false
    const roomDefectsCleared = enemiesRef.current
      .filter(enemy => enemy.kind === 'defect' && enemy.room === room)
      .every(enemy => enemy.defeated)
    return roomDefectsCleared && storyRoomTasksComplete(room)
  }

  function teamGateReady(fighter: FighterState) {
    if (!teamRoomId) return true
    const expectedCount = Math.max(2, Math.min(3, teamMemberCountRef.current || remotePlayersRef.current.length + 1))
    const localReady = !playerDownedRef.current && playerHpRef.current > 0 && fighter.x >= activeChapterGateReadyX
    const readyRemoteCount = remotePlayersRef.current.filter(remote => (
      remoteCanBeEnemyTarget(remote) && (remote.targetX ?? remote.x) >= activeChapterGateReadyX
    )).length
    const presentCount = 1 + remotePlayersRef.current.length
    return presentCount >= expectedCount && (localReady ? 1 : 0) + readyRemoteCount >= expectedCount
  }

  function incomingEnemyDamage(baseDamage: number, damageMultiplier = 1) {
    return Math.max(1, Math.round(baseDamage * damageMultiplier * playerDamageTakenScale))
  }

  function queueEnemyProjectile(enemy: EnemyState, now: number, targetX = playerRef.current.x) {
    const direction: 1 | -1 = targetX >= enemy.x ? 1 : -1
    const combat = enemyCombatProfile(enemy, project.id)
    const kind = enemyProjectileKind(enemy)
    const damage = incomingEnemyDamage(enemy.kind === 'boss' ? 10 : combat.damage)
    const projectile: ProjectileState = {
      id: ++projectileIdRef.current,
      owner: 'enemy',
      weaponId: kind === 'arrow' ? 'enemy-arrow' : kind === 'flyingFireball' ? 'enemy-flying-fireball' : 'enemy-fireball',
      kind,
      sourceId: enemy.id,
      color: enemyProjectileColor(enemy),
      height: enemy.projectileHeight,
      x: enemy.x + direction * 42,
      lane: enemy.lane,
      direction,
      damage,
      heavy: enemy.kind === 'boss',
      crit: false,
      createdAt: now,
    }
    const nextProjectiles = [...projectilesRef.current.slice(-18), projectile]
    projectilesRef.current = nextProjectiles
    setProjectiles(nextProjectiles)
    playEnemyRangedSfx(enemy)
  }

  function commitPlayerStamina(value: number, forceRender = false) {
    const maxStamina = playerMaxStaminaRef.current
    const next = clamp(value, 0, maxStamina)
    const previousRendered = lastStaminaRenderValueRef.current
    playerStaminaRef.current = next
    const rounded = Math.round(next)
    const roundedChanged = rounded !== Math.round(previousRendered)
    const boundaryChanged = (next === 0 && previousRendered !== 0) || (next === maxStamina && previousRendered !== maxStamina)
    if (
      (forceRender && roundedChanged)
      || Math.abs(next - previousRendered) >= 1
      || boundaryChanged
    ) {
      lastStaminaRenderValueRef.current = next
      setPlayerStamina(rounded)
    }
  }

  function updateEnemyAi(fighter: FighterState, now: number, delta: number) {
    let changed = false
    let actionChanged = false
    let nextHp = playerHpRef.current
    let nextMessage: string | null = null
    let nextFeedback: PlayerFeedback = null
    const floating: FloatingText[] = []
    const targetCandidates = buildEnemyTargetCandidates(fighter)
    const resolveEnemyMeleeHit = (
      enemy: EnemyState,
      target: EnemyTargetCandidate,
      combat: EnemyCombatProfile,
      damageMultiplier = 1,
      strikeLabel = '',
    ) => {
      const forwardDistance = (target.x - enemy.x) * enemy.facing
      const intersectsAttack = isCloseLane(enemy.lane, target.lane) && forwardDistance >= 0 && forwardDistance <= combat.attackRange
      const dodgedByMovement = target.local && fighter.rollingUntil > now
      const damage = target.local && intersectsAttack && !dodgedByMovement && !testInvincibleRef.current
        ? incomingEnemyDamage(combat.damage, damageMultiplier)
        : 0

      if (target.local && damage === 0 && intersectsAttack) {
        floating.push({ id: ++floatingTextIdRef.current, text: testInvincibleRef.current ? '无效' : '闪避', x: fighter.x, lane: fighter.lane, kind: 'miss' })
        nextMessage = testInvincibleRef.current
          ? `测试无敌挡下了 ${enemy.title} 的${strikeLabel || '扑击'}`
          : `翻滚闪避了 ${enemy.title} 的${strikeLabel || '扑击'}`
      } else if (damage > 0) {
        nextHp = Math.max(0, nextHp - damage)
        floating.push({ id: ++floatingTextIdRef.current, text: `-${damage}`, x: fighter.x, lane: fighter.lane, kind: 'damage' })
        nextFeedback = 'hit'
        const knockDirection: 1 | -1 = target.x >= enemy.x ? 1 : -1
        knockLocalPlayer(knockDirection, enemy.kind === 'boss' ? PLAYER_HIT_KNOCKBACK + 18 : PLAYER_HIT_KNOCKBACK)
        nextMessage = `${enemy.title}${strikeLabel ? ` ${strikeLabel}` : '追击'}命中，受到 ${damage} 点伤害`
      }

      return damage
    }

    const nextEnemies = enemiesRef.current.map(enemy => {
      if (enemy.defeated || !enemyInActiveCombatStage(enemy) || (enemy.kind === 'boss' && !bossUnlockedRef.current)) return enemy
      if (quizLockedEnemyIdsRef.current.has(enemy.id)) {
        const next = { ...enemy, moving: false, windupUntil: 0, attackingUntil: Math.max(enemy.attackingUntil, now + 180) }
        if (next.moving !== enemy.moving || next.windupUntil !== enemy.windupUntil || next.attackingUntil !== enemy.attackingUntil) changed = true
        return next
      }

      const combat = enemyCombatProfile(enemy, project.id)
      const target = selectEnemyTarget(enemy, targetCandidates)
      if (!target) {
        const next = { ...enemy, moving: false, windupUntil: 0 }
        if (next.moving !== enemy.moving || next.windupUntil !== enemy.windupUntil) changed = true
        return next
      }

      const dx = target.x - enemy.x
      const absX = Math.abs(dx)
      const sameLane = isCloseLane(enemy.lane, target.lane)
      const rangedMinRange = enemy.form === 'flying' ? 160 : enemy.form === 'glitch' ? 210 : ENEMY_RANGED_MIN_RANGE
      const rangedAttackRange = enemy.form === 'flying' ? 690 : enemy.form === 'glitch' ? 640 : ENEMY_RANGED_ATTACK_RANGE
      const direction: 1 | -1 = dx >= 0 ? 1 : -1
      const attackCommitted = enemy.windupUntil > 0 || enemy.attackingUntil > now
      const canThink = absX <= combat.aggroRange || attackTargetIdRef.current === enemy.id
      let next = { ...enemy, facing: attackCommitted ? enemy.facing : direction, moving: false }

      if (enemy.attackStyle === 'melee' && enemy.attackingUntil > now && combat.extraHitOffsets?.length) {
        const attackStart = enemy.attackingUntil - combat.recoveryMs
        const elapsed = now - attackStart
        combat.extraHitOffsets.forEach((offset, offsetIndex) => {
          const hitKey = `${enemy.id}:${enemy.attackSequence}:${offsetIndex}`
          if (elapsed >= offset && !enemyExtraHitRef.current[hitKey]) {
            enemyExtraHitRef.current[hitKey] = true
            resolveEnemyMeleeHit(enemy, target, combat, combat.extraHitDamageMultiplier ?? 1, offsetIndex === 0 ? '二段斩' : `第 ${offsetIndex + 2} 段攻击`)
            actionChanged = true
          }
        })
      }

      if (!canThink) {
        if (next.facing !== enemy.facing || next.moving !== enemy.moving) changed = true
        return next
      }

      if (enemy.windupUntil > 0 && now >= enemy.windupUntil) {
        if (enemy.attackStyle === 'ranged') {
          queueEnemyProjectile(enemy, now, target.x)
          lastEnemyAttackAtRef.current[enemy.id] = now
          next = { ...next, windupUntil: 0, attackingUntil: now + ENEMY_LUNGE_MS, attackSequence: next.attackSequence + 1 }
          nextMessage = `${enemy.title} 发射远程弹，双击 Shift 翻滚躲避，或面向来弹按 J 打消`
          changed = true
          actionChanged = true
          return next
        }
        lastEnemyAttackAtRef.current[enemy.id] = now
        next = { ...next, windupUntil: 0, attackingUntil: now + combat.recoveryMs, attackSequence: next.attackSequence + 1 }
        changed = true
        actionChanged = true
        playEnemyAttackSfx(enemy)
        resolveEnemyMeleeHit(enemy, target, combat)
        return next
      }

      if (enemy.attackStyle === 'ranged' && sameLane && absX <= rangedAttackRange && absX >= rangedMinRange) {
        const lastAttackAt = lastEnemyAttackAtRef.current[enemy.id] ?? 0
        if (enemy.windupUntil === 0 && enemy.attackingUntil < now && now - lastAttackAt >= enemyAttackIntervalMs(enemy)) {
          next = { ...next, windupUntil: now + ENEMY_WINDUP_MS + 120, attackSequence: next.attackSequence + 1 }
          changed = true
          actionChanged = true
        }
        return next
      }

      const forwardDistance = (target.x - enemy.x) * next.facing
      if (enemy.attackStyle === 'melee' && sameLane && forwardDistance >= 0 && forwardDistance <= combat.attackRange) {
        const lastAttackAt = lastEnemyAttackAtRef.current[enemy.id] ?? 0
        if (enemy.windupUntil === 0 && enemy.attackingUntil < now && now - lastAttackAt >= enemyAttackIntervalMs(enemy)) {
          next = { ...next, windupUntil: now + combat.windupMs, attackSequence: next.attackSequence + 1 }
          changed = true
          actionChanged = true
        }
        return next
      }

      if (enemy.windupUntil === 0 && enemy.attackingUntil < now) {
        const speed = combat.moveSpeed
        const preferredRange = enemy.attackStyle === 'ranged' ? combat.preferredRange : combat.preferredRange
        if (enemy.attackStyle === 'ranged' && absX < rangedMinRange) {
          next.x = clamp(enemy.x - direction * speed * 0.8 * delta, 120, activeWorldWidth - 120)
          next.moving = true
          changed = true
        } else if (absX > preferredRange) {
          next.x = clamp(enemy.x + direction * speed * delta, 120, activeWorldWidth - 120)
          next.moving = true
          changed = true
        }
        const laneGap = target.lane - enemy.lane
        if (absX < 340 && Math.abs(laneGap) > 0.03) {
          next.lane = clamp(enemy.lane + Math.sign(laneGap) * Math.min(Math.abs(laneGap), 1.7 * delta), 0, 2)
          next.moving = true
          changed = true
        }
      }

      if (next.facing !== enemy.facing || next.moving !== enemy.moving) changed = true
      return next
    })

    if (changed) {
      enemiesRef.current = nextEnemies
      if (actionChanged || now - lastEnemyRenderAtRef.current >= ENEMY_RENDER_INTERVAL_MS) {
        lastEnemyRenderAtRef.current = now
        setEnemies(nextEnemies)
      }
    }

    if (floating.length) {
      setFloatingTexts(current => [...current.slice(-8), ...floating])
      for (const item of floating) {
        window.setTimeout(() => {
          setFloatingTexts(current => current.filter(value => value.id !== item.id))
        }, 860)
      }
    }

    if (nextHp !== playerHpRef.current) {
      playerHpRef.current = nextHp
      setPlayerHp(nextHp)
      if (nextFeedback) pulsePlayerFeedback(nextFeedback)
      if (nextFeedback === 'hit') playSfx('playerHit')
      completeGame(nextEnemies, nextHp, correctRef.current, totalRef.current)
    }

    if (nextMessage) setGameMessage(nextMessage, 650)
  }

  useEffect(() => {
    if (!started) return undefined
    let animationId = 0
    let lastTime = performance.now()

    const tick = (now: number) => {
      const delta = Math.min(0.05, (now - lastTime) / 1000)
      lastTime = now
      const quizPaused = Boolean(activeQuiz || assistQuiz)
      const cinematicPaused = battleIntroActiveRef.current
      const gamePaused = singlePlayerPauseActive

      if (!cinematicPaused && !quizPaused && !gamePaused && !inventoryOpen && !timedOut && !completedRef.current && !playerDownedRef.current) {
        const current = playerRef.current
        const keyboardHorizontal = Number(Boolean(keyboard.current.KeyD || keyboard.current.ArrowRight)) - Number(Boolean(keyboard.current.KeyA || keyboard.current.ArrowLeft))
        const keyboardVertical = Number(Boolean(keyboard.current.KeyS || keyboard.current.ArrowDown)) - Number(Boolean(keyboard.current.KeyW || keyboard.current.ArrowUp))
        const shiftPressed = Boolean(keyboard.current.ShiftLeft || keyboard.current.ShiftRight)
        const next = { ...current }
        let changed = false
        let horizontal = keyboardHorizontal
        let vertical = keyboardVertical
        const wasRolling = current.rollingUntil > now

        if (!wasRolling && now - lastStaminaUseAtRef.current >= STAMINA_REGEN_DELAY_MS) {
          commitPlayerStamina(playerStaminaRef.current + STAMINA_REGEN_PER_SECOND * delta)
        }

        if (shiftPressed && !shiftLatchRef.current) {
          if (now - lastShiftTapAtRef.current <= SHIFT_DOUBLE_TAP_MS && now >= rollCooldownUntilRef.current) {
            const staminaEnough = playerStaminaRef.current >= ROLL_STAMINA_COST
            lastShiftTapAtRef.current = 0
            if (staminaEnough) {
              const rollDuration = selectedPlayerModelRef.current.durations?.roll ?? DEFAULT_ROLL_DURATION_MS
              next.rollingUntil = now + rollDuration
              rollCooldownUntilRef.current = now + Math.max(ROLL_COOLDOWN_MS, rollDuration + 180)
              lastStaminaUseAtRef.current = now
              commitPlayerStamina(playerStaminaRef.current - ROLL_STAMINA_COST, true)
              moveTargetRef.current = null
              playSfx('roll')
              changed = true
            }
          } else {
            lastShiftTapAtRef.current = now
          }
          shiftLatchRef.current = true
        }
        if (!shiftPressed) shiftLatchRef.current = false

        const rolling = next.rollingUntil > now
        const sprinting = shiftPressed && !rolling

        if (keyboardHorizontal !== 0 || keyboardVertical !== 0) moveTargetRef.current = null

        const clickTarget = moveTargetRef.current
        if (!rolling && keyboardHorizontal === 0 && keyboardVertical === 0 && clickTarget) {
          const xDistance = clickTarget.x - current.x
          const laneDistance = clickTarget.lane - current.lane
          if (Math.abs(xDistance) <= 8 && Math.abs(laneDistance) <= 0.05) {
            moveTargetRef.current = null
            horizontal = 0
            vertical = 0
          } else {
            horizontal = Math.abs(xDistance) > 8 ? xDistance > 0 ? 1 : -1 : 0
            vertical = Math.abs(laneDistance) > 0.05 ? laneDistance > 0 ? 1 : -1 : 0
          }
        }

        if (rolling) {
          horizontal = next.facing
          vertical = 0
          const rollDuration = selectedPlayerModelRef.current.durations?.roll ?? DEFAULT_ROLL_DURATION_MS
          const rollSpeed = (playerRollDistance(selectedPlayerModelRef.current) * playerMobilityScale) / (rollDuration / 1000)
          next.x = clamp(next.x + next.facing * rollSpeed * delta, 90, activeWorldWidth - 130)
          changed = true
        } else if (horizontal !== 0 || vertical !== 0) {
          if (horizontal !== 0) next.facing = horizontal > 0 ? 1 : -1
          const diagonalFactor = horizontal !== 0 && vertical !== 0 ? 0.72 : 1
          const speed = (sprinting ? 430 : 270) * playerMobilityScale
          const laneSpeed = (sprinting ? 3.5 : 2.35) * playerMobilityScale
          if (horizontal !== 0) next.x = clamp(next.x + horizontal * speed * diagonalFactor * delta, 90, activeWorldWidth - 130)
          if (vertical !== 0) next.lane = clamp(next.lane + vertical * laneSpeed * diagonalFactor * delta, 0, 2)
          changed = true
        }

        if (next.jumpUntil !== 0 || next.crouching) {
          next.jumpUntil = 0
          next.crouching = false
          changed = true
        }

        if (next.moving !== (horizontal !== 0 || vertical !== 0 || rolling)) {
          next.moving = horizontal !== 0 || vertical !== 0 || rolling
          changed = true
        }

        if (isBossRushChapter) {
          const currentStage = finalChapterStageRef.current
          const stageEnemies = enemiesRef.current.filter(enemy => enemy.sceneNumber === currentStage)
          const stageCleared = stageEnemies.length > 0 && stageEnemies.every(enemy => enemy.defeated)
          const enterNextStage = () => {
            const nextStage = isEndlessSurvival ? currentStage + 1 : clamp(currentStage + 1, 1, FINAL_CHAPTER_STAGE_COUNT)
            finalChapterStageRef.current = nextStage
            setFinalChapterStage(nextStage)
            if (isEndlessSurvival) {
              const nextEnemies = buildInitialEnemies(project, { endlessSurvival: true, endlessStage: nextStage })
              enemiesRef.current = nextEnemies
              setEnemies(nextEnemies)
            }
            next.x = CHAPTER_ROOM_START_X
            next.lane = 1
            next.facing = 1
            next.moving = false
            next.rollingUntil = 0
            moveTargetRef.current = null
            attackTargetIdRef.current = null
            setAttackTargetId(null)
            projectilesRef.current = []
            setProjectiles([])
            setFloatingTexts([])
            setGroundSwordWaves([])
            resetAiCompanionsToChapterStart()
            const scene = project.scenes.find(item => item.number === nextStage) ?? project.scenes[0]
            setGameMessage(`进入第 ${nextStage} 关：${scene?.title ?? '体系终审'}`, 1400)
            if (isEndlessSurvival) setGameMessage(`进入无尽第 ${nextStage} 层：随机裂隙已生成`, 1400)
            playSfx('door')
            chapterTransitionLockUntilRef.current = now + 900
            if (teamRoomId && teamAuthorityRef.current) {
              const worldState = buildTeamWorldState('authority')
              teamWorldUpdatedAtRef.current = worldState.updatedAt
              void postTeamPlayState({ x: next.x, lane: next.lane, moving: false, worldState })
            }
            changed = true
          }

          if (now < chapterTransitionLockUntilRef.current) {
            const lockedX = Math.min(next.x, CHAPTER_ROOM_START_X + 120)
            if (lockedX !== next.x || next.moving) changed = true
            next.x = lockedX
            next.moving = false
            moveTargetRef.current = null
          } else if ((isEndlessSurvival || currentStage < FINAL_CHAPTER_STAGE_COUNT) && next.x >= FINAL_CHAPTER_GATE_READY_X) {
            if (stageCleared && (!teamRoomId || teamAuthorityRef.current)) {
              enterNextStage()
            } else if (stageCleared) {
              next.x = FINAL_CHAPTER_GATE_READY_X
              moveTargetRef.current = null
              if (Date.now() > messageLockUntilRef.current) setGameMessage('等待房主靠近门口后切换下一关', 700)
            } else {
              next.x = FINAL_CHAPTER_GATE_READY_X
              moveTargetRef.current = null
              if (Date.now() > messageLockUntilRef.current) setGameMessage(`先清理第 ${currentStage} 关的怪物，门才会开启`, 800)
            }
          }
        } else if (isCastleChapter) {
          let currentRoom = chapterRoomRef.current
          const enterRoom = (room: ChapterRoomKind, text: string) => {
            chapterRoomRef.current = room
            currentRoom = room
            setChapterRoom(room)
            next.x = CHAPTER_ROOM_START_X
            next.lane = 1
            next.facing = 1
            next.moving = false
            next.rollingUntil = 0
            moveTargetRef.current = null
            attackTargetIdRef.current = null
            setAttackTargetId(null)
            projectilesRef.current = []
            setProjectiles([])
            setFloatingTexts([])
            setGroundSwordWaves([])
            resetAiCompanionsToChapterStart()
            setGameMessage(text, 1200)
            playSfx('door')
            chapterTransitionLockUntilRef.current = now + 900
            if (teamRoomId && teamAuthorityRef.current) {
              const worldState = buildTeamWorldState('authority')
              teamWorldUpdatedAtRef.current = worldState.updatedAt
              void postTeamPlayState({ x: next.x, lane: next.lane, moving: false, worldState })
            }
            changed = true
          }

          if (now < chapterTransitionLockUntilRef.current) {
            const lockedX = Math.min(next.x, CHAPTER_ROOM_START_X + 120)
            if (lockedX !== next.x || next.moving) changed = true
            next.x = lockedX
            next.moving = false
            moveTargetRef.current = null
          } else if (currentRoom === 'hall' && next.x >= activeChapterGateReadyX) {
            if (hallGateOpen && (!teamRoomId || teamAuthorityRef.current) && teamGateReady(next)) {
              enterRoom('corridor', '进入城堡走廊')
            } else if (hallGateOpen) {
              next.x = activeChapterGateReadyX
              moveTargetRef.current = null
              if (Date.now() > messageLockUntilRef.current) setGameMessage('需要队友全部靠近门口后再切换场景', 700)
            } else {
              next.x = activeChapterGateReadyX
              moveTargetRef.current = null
              if (Date.now() > messageLockUntilRef.current) setGameMessage('先清理城堡大殿内的敌人，解除走廊门锁', 700)
            }
          } else if (currentRoom === 'corridor' && next.x >= activeChapterGateReadyX) {
            if (dungeonGateOpen && (!teamRoomId || teamAuthorityRef.current) && teamGateReady(next)) {
              enterRoom('dungeon', '进入地下牢狱，最终 Boss 已苏醒')
            } else if (dungeonGateOpen) {
              next.x = activeChapterGateReadyX
              moveTargetRef.current = null
              if (Date.now() > messageLockUntilRef.current) setGameMessage('需要队友全部靠近门口后再切换场景', 700)
            } else {
              next.x = activeChapterGateReadyX
              moveTargetRef.current = null
              if (Date.now() > messageLockUntilRef.current) {
                setGameMessage('清理走廊敌人后才能进入地下牢狱', 700)
              }
            }
          }

          const inPoison = currentRoom === 'dungeon'
            && next.x >= POISON_START_X
            && next.x <= POISON_END_X
            && next.lane >= 1.55
            && next.rollingUntil <= now
          if (inPoison && now - lastPoisonDamageAtRef.current >= 850) {
            lastPoisonDamageAtRef.current = now
            if (testInvincibleRef.current) {
              spawnFloatingText('无敌', next.x, next.lane, 'miss')
              setGameMessage('测试无敌已开启，毒水不再扣血', 650)
            } else {
              const nextHp = Math.max(0, playerHpRef.current - 5)
              playerHpRef.current = nextHp
              setPlayerHp(nextHp)
              pulsePlayerFeedback('hit')
              spawnFloatingText('毒水 -5', next.x, next.lane, 'damage')
              setGameMessage('毒水持续腐蚀，翻滚穿过或换到上方通道通过', 650)
              playSfx('playerHit')
              completeGame(enemiesRef.current, nextHp, correctRef.current, totalRef.current)
            }
          }
        }

        const mode: MovementMode = rolling ? 'roll' : horizontal !== 0 || vertical !== 0 ? sprinting ? 'sprint' : 'walk' : 'idle'
        const rollActive = next.rollingUntil > now || current.rollingUntil > now
        const modeChanged = movementModeRef.current !== mode
        const shouldRenderPlayer = changed || rollActive || modeChanged
        playerRef.current = next
        if (
          shouldRenderPlayer
          && (modeChanged || !next.moving || now - lastPlayerRenderAtRef.current >= MOTION_RENDER_INTERVAL_MS)
        ) {
          lastPlayerRenderAtRef.current = now
          setPlayer(next)
        }
        if (modeChanged) {
          movementModeRef.current = mode
          setMovementMode(mode)
        }
        updateTargets(next)
      }

      if ((cinematicPaused || quizPaused || gamePaused || playerDownedRef.current) && playerRef.current.moving) {
        const stopped = { ...playerRef.current, moving: false }
        playerRef.current = stopped
        setPlayer(stopped)
        if (movementModeRef.current !== 'idle') {
          movementModeRef.current = 'idle'
          setMovementMode('idle')
        }
      }

      if (!cinematicPaused && !gamePaused && !inventoryOpen && !timedOut && !completedRef.current) {
        updateEnemyAi(playerRef.current, now, delta)
        updateProjectiles(now, delta)
        if (!quizPaused && !playerDownedRef.current) tickHeroCombatEffects(now)
        applyAllyAssist(now)
        updateAiCompanions(now, delta)
        if (teamQuizLocked && Date.now() > messageLockUntilRef.current && answeringRemotePlayer) {
          setGameMessage(`${answeringRemotePlayer.displayName} 正在答题，当前题目怪物已锁定`, 700)
        }
      }

      animationId = window.requestAnimationFrame(tick)
    }

    animationId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(animationId)
  }, [activeChapterGateReadyX, activeQuiz, activeWorldWidth, answeringRemotePlayer, assistQuiz, chapterRoom, completeGame, corridorCleared, dungeonGateOpen, hallCleared, hallGateOpen, inventoryOpen, isBossRushChapter, isCastleChapter, isEndlessSurvival, keyboard, project, setGameMessage, singlePlayerPauseActive, spawnFloatingText, started, supportAllies, teamQuizLocked, timedOut, updateTargets])

  useEffect(() => {
    if (bossUnlocked && !boss?.defeated) {
      setGameMessage('全部缺陷怪已清理，Boss 区域开放', 1500)
    }
  }, [boss?.defeated, bossUnlocked, setGameMessage])

  useEffect(() => {
    if (timedOut && !completedRef.current) {
      if (isEndlessSurvival) {
        settleEndlessSurvival(enemiesRef.current, playerHpRef.current)
        return
      }
      completedRef.current = true
      const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0
      onComplete({
        victory: false,
        correct,
        total: Math.max(1, total),
        hp: playerHp,
        bossHp: Math.max(0, boss?.hp ?? 0),
        storyScore: accuracy,
        projectScore: accuracy,
      })
    }
  }, [boss?.hp, correct, isEndlessSurvival, onComplete, playerHp, timedOut, total])

  useEffect(() => {
    if (!started || activeQuiz || activeQuizRef.current || timedOut || completedRef.current) return
    completeGame(enemies, playerHp, correct, total)
  }, [activeQuiz, completeGame, correct, enemies, playerHp, started, timedOut, total])

  function findNearestTeamActionRemote() {
    const fighter = playerRef.current
    return remotePlayers
      .map(remote => {
        const answering = remote.status === 'answering' && remote.activeQuiz
        const downed = remote.status === 'downed' || remote.hp <= 0
        const range = answering ? 185 : 150
        const near = (answering || downed)
          && isCloseLane(remote.lane, fighter.lane)
          && Math.abs(remote.x - fighter.x) <= range
        return {
          remote,
          answering,
          downed,
          near,
          distance: Math.abs(remote.x - fighter.x) + Math.abs(remote.lane - fighter.lane) * 80,
        }
      })
      .filter(item => item.near)
      .sort((a, b) => a.distance - b.distance)[0] ?? null
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!started || completedRef.current) return
      const returnKeyPressed = event.code === 'Backspace' || event.code === 'Escape' || event.code === 'BrowserBack'
      if (returnKeyPressed && !teamRoomId) {
        event.preventDefault()
        requestSinglePlayerExit()
        return
      }
      if (singlePlayerPauseActive) {
        event.preventDefault()
        return
      }
      if (battleIntroActiveRef.current) {
        if (event.code === 'Space' || event.code === 'Enter') {
          event.preventDefault()
          advanceBattleIntro()
        }
        return
      }
      if (playerDownedRef.current) {
        event.preventDefault()
        setGameMessage('你已倒地，等待队友靠近后扶起。', 700)
        return
      }
      if (storyOperationTask) {
        event.preventDefault()
        if (event.code === 'Escape') closeStoryOperation()
        return
      }
      if (event.code === 'KeyB') {
        event.preventDefault()
        setInventoryOpen(current => !current)
        playSfx('inventory')
        return
      }
      if (event.code === 'KeyF') {
        event.preventDefault()
        if (event.repeat || inventoryOpen || activeQuiz || assistQuiz) return
        const target = findNearestTeamActionRemote()
        if (target?.answering) {
          startAssistQuiz(target.remote)
          return
        }
        if (target?.downed) {
          void reviveRemotePlayer(target.remote)
          return
        }
        if (teamRoomId) setGameMessage('靠近正在答题或倒地的队友后，按 F 协助。', 900)
        return
      }
      if (event.code === 'KeyQ') {
        event.preventDefault()
        useGameItem('heal')
        return
      }
      if (event.code === 'KeyE') {
        event.preventDefault()
        if (event.repeat) return
        if (onOpenShop) {
          onOpenShop({ itemsOnly: true })
          return
        }
        setInventoryOpen(true)
        playSfx('inventory')
        return
      }
      if (event.code === 'KeyR') {
        event.preventDefault()
        useGameItem('skip')
        return
      }
      const assistTarget = assistQuiz
        ? enemiesRef.current.find(enemy => enemy.id === assistQuiz.enemyId) ?? null
        : null
      const assistBlocksKeyboard = Boolean(assistQuiz && !(teamRoomId && assistTarget?.kind === 'boss'))
      if (inventoryOpen || activeQuiz || storyOperationTask || assistBlocksKeyboard) return
      if (event.code === 'KeyJ') {
        event.preventDefault()
        const storyTask = findNearestActiveStoryTask()
        if (storyTask) {
          openStoryOperation(storyTask)
          return
        }
        performAttack()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function resetRunToLoadout() {
    const initialPlayer: FighterState = { x: 120, lane: 1, facing: 1, moving: false, crouching: false, jumpUntil: 0, rollingUntil: 0 }
    const nextEnemies = buildInitialEnemies(project, { endlessSurvival: isEndlessSurvival, endlessStage: 1 })

    backgroundMusicRef.current?.pause()
    stopStorySpeech()
    completedRef.current = false
    playerRef.current = initialPlayer
    moveTargetRef.current = null
    setMoveClickMarker(null)
    enemiesRef.current = nextEnemies
    projectilesRef.current = []
    activeQuizRef.current = null
    playerHpRef.current = playerInitialHp
    playerStaminaRef.current = playerMaxStaminaRef.current
    lastStaminaUseAtRef.current = 0
    lastStaminaRenderValueRef.current = playerMaxStaminaRef.current
    correctRef.current = 0
    totalRef.current = 0
    endlessStatsRef.current = { kills: 0, eliteKills: 0, levelsCleared: 0, coins: 0, gems: 0 }
    lastEnemyAttackAtRef.current = {}
    enemyExtraHitRef.current = {}
    attackSignalRef.current = null
    heroEffectAttackCountRef.current = 0
    blackKnightWeaponDrawnRef.current = false
    normalComboPhaseRef.current = 0
    lastNormalComboAtRef.current = 0
    lastAttackAtRef.current = 0
    nextComboInputAtRef.current = 0
    if (queuedAttackTimerRef.current !== null) window.clearTimeout(queuedAttackTimerRef.current)
    if (attackClearTimerRef.current !== null) window.clearTimeout(attackClearTimerRef.current)
    if (blackKnightSheathTimerRef.current !== null) window.clearTimeout(blackKnightSheathTimerRef.current)
    if (moveMarkerClearTimerRef.current !== null) window.clearTimeout(moveMarkerClearTimerRef.current)
    clearPlayerEntryTimer()
    attackImpactTimersRef.current.forEach(timer => window.clearTimeout(timer))
    attackImpactTimersRef.current = []
    queuedAttackTimerRef.current = null
    attackClearTimerRef.current = null
    blackKnightSheathTimerRef.current = null
    moveMarkerClearTimerRef.current = null
    attackTargetIdRef.current = null
    enemyTargetIdsRef.current = {}
    chapterTransitionLockUntilRef.current = 0
    validationSealRef.current = false
    openedGateRef.current = { hall: false, dungeon: false }
    openedFinalStageGateRef.current = 0
    chapterRoomRef.current = 'hall'
    finalChapterStageRef.current = 1
    lastRemoteHitAtRef.current = {}
    lastRemoteAttackSequenceRef.current = {}
    lastRemoteKnightWaveSequenceRef.current = {}
    lastAiAttackAtRef.current = {}
    aiAttackUntilRef.current = {}
    questionHistoryRef.current = []
    enemyQuestionHistoryRef.current = {}
    combatDropClaimedRef.current = new Set()
    playerDownedRef.current = false
    teamWorldUpdatedAtRef.current = 0
    storyTasksCompletedRef.current = []
    completedStoryRoundIdsRef.current = []
    storyDialogueGateRef.current = null
    lastNarrationTaskIdRef.current = ''
    handledRoomEventRef.current = ''
    teamLoadoutAutoSubmittedRef.current = false
    teamLocalStateHydratedRef.current = false
    battleIntroActiveRef.current = false
    if (battleIntroTypeTimerRef.current !== null) {
      window.clearInterval(battleIntroTypeTimerRef.current)
      battleIntroTypeTimerRef.current = null
    }

    setStarted(false)
    setPlayer(initialPlayer)
    setMovementMode('idle')
    setPlayerHp(playerInitialHp)
    setPlayerStamina(playerMaxStaminaRef.current)
    setPlayerEntryActive(false)
    setEnemies(nextEnemies)
    setProjectiles([])
    setAnswers([])
    setActiveQuiz(null)
    setCorrect(0)
    setTotal(0)
    setEndlessStats(endlessStatsRef.current)
    setQuestionCursor(0)
    setBossQuestionCursor(0)
    setCritReadyUntil(0)
    setAttackSignal(null)
    setAttackTargetId(null)
    setPlayerFeedback(null)
    setFloatingTexts([])
    setGroundSwordWaves([])
    setMoveClickMarker(null)
    setStoryTaskCompletedIds([])
    setStoryNarration(null)
    closeStoryOperation()
    setInventoryOpen(false)
    setBoostAttacks(0)
    setValidationSealSolved(false)
    setChapterRoom('hall')
    setFinalChapterStage(1)
    setFinalChapterNarration(null)
    setRemotePlayers([])
    setPlayerDowned(false)
    setAssistQuiz(null)
    setAssistAnswers([])
    setBattleIntroActive(false)
    setActiveStoryRound(null)
    setBattleIntroLines([])
    setStoryDialogueGate(null)
    setCompletedStoryRoundIds([])
    setBattleIntroLineIndex(0)
    setBattleIntroVisibleChars(0)
    setBattleIntroSpeechPending(false)
    setTeamBattleHydrated(!teamRoomId)
    setPendingTeamModelId(selectedPlayerModelRef.current.id)
    setTeamLoadoutSecondsLeft(60)
    setGameMessage('已返回角色前置页，可重新选择模型后进入实训', 900)
  }

  function chooseAnswer(id: string) {
    if (!activeQuestion) return
    playSfx('quizSelect')
    setAnswers(previous => {
      if (activeQuestion.kind === 'single') return [id]
      if (activeQuestion.kind === 'sequence') {
        return previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]
      }
      return previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]
    })
  }

  function questionMatchesEnemy(question: TrainingQuestion, enemy: EnemyState) {
    if (enemy.sceneNumber && question.sceneNumber === enemy.sceneNumber) return true
    const tokens = [enemy.defect, enemy.title, enemy.objective, enemy.chapterTitle]
      .filter((token): token is string => Boolean(token && token.trim()))
    const text = [
      question.chapter,
      question.stem,
      question.context,
      question.taskLabel,
      question.evidence,
      question.deliverable,
      question.insight,
    ].filter(Boolean).join(' ')
    return tokens.some(token => text.includes(token))
  }

  function questionIdentity(question: TrainingQuestion) {
    return question.id || `${question.sceneNumber ?? 0}:${question.stem}`
  }

  function questionSeedOffset(seed: string, poolLength: number) {
    if (poolLength <= 1) return 0
    let hash = 0
    for (let index = 0; index < seed.length; index += 1) {
      hash = (hash * 33 + seed.charCodeAt(index)) >>> 0
    }
    return hash % poolLength
  }

  function recordQuestionUse(enemy: EnemyState, question: TrainingQuestion, poolSize: number) {
    const id = questionIdentity(question)
    const enemyHistory = enemyQuestionHistoryRef.current[enemy.id] ?? []
    enemyQuestionHistoryRef.current[enemy.id] = [...enemyHistory, id].slice(-Math.max(4, poolSize))
    questionHistoryRef.current = [...questionHistoryRef.current, id].slice(-14)
  }

  function pickQuestionFromPool(pool: TrainingQuestion[], cursor: number, enemy: EnemyState) {
    if (!pool.length) return FALLBACK_QUESTION
    const offset = questionSeedOffset(`${enemy.id}:${enemy.sceneNumber ?? 0}:${enemy.title}`, pool.length)
    const ordered = Array.from({ length: pool.length }, (_, index) => pool[(cursor + offset + index) % pool.length])
    const enemyUsed = new Set(enemyQuestionHistoryRef.current[enemy.id] ?? [])
    const recentWindow = Math.min(6, Math.max(0, pool.length - 1))
    const recentUsed = new Set(questionHistoryRef.current.slice(-recentWindow))
    const question = ordered.find(item => !enemyUsed.has(questionIdentity(item)) && !recentUsed.has(questionIdentity(item)))
      ?? ordered.find(item => !enemyUsed.has(questionIdentity(item)))
      ?? ordered.find(item => !recentUsed.has(questionIdentity(item)))
      ?? ordered[0]
    recordQuestionUse(enemy, question, pool.length)
    return question
  }

  function nextQuestionFor(enemy: EnemyState) {
    if (enemy.kind === 'boss') {
      const pool = bossQuestions.length ? bossQuestions : storyQuestions
      const question = pickQuestionFromPool(pool, bossQuestionCursor, enemy)
      setBossQuestionCursor(index => index + 1)
      return question
    }

    const sourcePool = storyQuestions.length ? storyQuestions : bossQuestions
    const matchedPool = sourcePool.filter(question => questionMatchesEnemy(question, enemy))
    const minimumUsefulPool = Math.min(3, sourcePool.length)
    const pool = matchedPool.length >= minimumUsefulPool ? matchedPool : sourcePool
    const question = pickQuestionFromPool(pool, questionCursor, enemy)
    setQuestionCursor(index => index + 1)
    return question
  }

  function combatDropForEnemy(enemy: EnemyState): CombatLootDrop | null {
    const stage = Math.max(1, Math.round(enemy.sceneNumber ?? finalChapterStageRef.current))
    const seed = questionSeedOffset(`${project.id}:${stage}:${enemy.id}:${enemy.title}`, 10000)
    const elite = enemy.kind === 'boss' || isEliteEnemyForm(enemy.form) || enemy.form === 'tank'
    if (elite) {
      return {
        coins: enemy.kind === 'boss' ? 28 + stage * 4 : 12 + stage * 3,
        gems: enemy.kind === 'boss' ? 2 + Math.floor(stage / 5) : 1,
      }
    }
    if (seed % 100 >= 34) return null
    const itemIds: GameItemId[] = ['heal', 'boost', 'skip']
    const item = itemIds[seed % itemIds.length]
    return { items: { [item]: 1 } }
  }

  function describeCombatDrop(drop: CombatLootDrop) {
    const parts: string[] = []
    if (drop.coins) parts.push(`金币 +${drop.coins}`)
    if (drop.gems) parts.push(`钻石 +${drop.gems}`)
    if (drop.items) {
      Object.entries(drop.items).forEach(([item, count]) => {
        if (!count) return
        parts.push(`${itemMeta(item as GameItemId).title} +${count}`)
      })
    }
    return parts.join('  ')
  }

  function recordCombatLootDrops(previousEnemies: EnemyState[], nextEnemies: EnemyState[]) {
    const previousById = new Map(previousEnemies.map(enemy => [enemy.id, enemy]))
    for (const enemy of nextEnemies) {
      const previous = previousById.get(enemy.id)
      if (!previous || previous.defeated || !enemy.defeated || combatDropClaimedRef.current.has(enemy.id)) continue
      const drop = combatDropForEnemy(enemy)
      if (!drop) continue
      combatDropClaimedRef.current.add(enemy.id)
      onCollectDropRef.current?.(drop)
      const label = describeCombatDrop(drop)
      if (label) spawnFloatingText(label, enemy.x, enemy.lane, 'heal')
    }
  }

  function commitEnemyState(nextEnemies: EnemyState[], defeatedThisHit = false) {
    const previousEnemies = enemiesRef.current
    if (defeatedThisHit) {
      recordEndlessDefeats(previousEnemies, nextEnemies)
      recordCombatLootDrops(previousEnemies, nextEnemies)
    }
    enemiesRef.current = nextEnemies
    setEnemies(nextEnemies)
    if (defeatedThisHit) {
      window.setTimeout(() => setEnemies([...enemiesRef.current]), ENEMY_DEATH_ANIMATION_MS + 40)
    }
    return nextEnemies
  }

  function applyEnemyDamage(enemyId: string, damage: number, quizDelta = 0, resetQuiz = false, allowTeamMutation = false) {
    if (teamRoomId && !teamAuthorityRef.current && !allowTeamMutation) {
      return enemiesRef.current
    }
    const now = performance.now()
    let defeatedThisHit = false
    const nextEnemies = enemiesRef.current.map(enemy => {
      if (enemy.id !== enemyId || enemy.defeated) return enemy
      const nextHp = Math.max(0, enemy.hp - damage)
      const nextCharge = resetQuiz || nextHp === 0
        ? 0
        : clamp(enemy.quizCharge + quizDelta, 0, enemy.quizEvery)
      const defeated = nextHp === 0
      if (defeated && enemy.hp > 0) defeatedThisHit = true
      const knockDirection: 1 | -1 = enemy.x >= playerRef.current.x ? 1 : -1
      const knockDistance = enemy.kind === 'boss' ? BOSS_HIT_KNOCKBACK : ENEMY_HIT_KNOCKBACK
      const knockedX = damage > 0
        ? clamp(enemy.x + knockDirection * knockDistance, 120, activeWorldWidth - 120)
        : enemy.x
      return {
        ...enemy,
        x: knockedX,
        moving: damage > 0 ? false : enemy.moving,
        windupUntil: damage > 0 ? 0 : enemy.windupUntil,
        hp: nextHp,
        quizCharge: nextCharge,
        hitUntil: damage > 0 ? now + 520 : enemy.hitUntil,
        defeated,
        deathUntil: defeated ? now + ENEMY_DEATH_ANIMATION_MS : enemy.deathUntil,
        heroEffect: defeated ? undefined : enemy.heroEffect,
      }
    })
    return commitEnemyState(nextEnemies, defeatedThisHit)
  }

  function paintHeroImpactEffect(enemyId: string, sourceModelId: PlayerModelId, animation?: PlayerAnimation, phase = 1) {
    const config = HERO_COMBAT_EFFECTS[sourceModelId]
    if (!config) return enemiesRef.current
    const visualId = heroEffectVisualId(sourceModelId, animation, phase)
    const now = performance.now()
    let changed = false
    const nextEnemies = enemiesRef.current.map(enemy => {
      if (enemy.id !== enemyId || enemy.defeated || enemy.hp <= 0) return enemy
      const previousEffect = enemy.heroEffect
      const sameEffectActive = previousEffect?.kind === config.kind && previousEffect.until > now
      const nextStacks = sameEffectActive ? Math.max(0, previousEffect.stacks) + 1 : 1
      const burst = nextStacks >= config.burstAt
      const effectStacks = burst && config.resetStacksOnBurst ? 0 : Math.min(nextStacks, config.burstAt)
      changed = true
      return {
        ...enemy,
        hitUntil: Math.max(enemy.hitUntil, now + (burst ? 680 : 460)),
        heroEffect: {
          kind: config.kind,
          visualId,
          sourceModelId,
          stacks: effectStacks,
          until: Math.max(now + HERO_EFFECT_ACTIVE_MS, previousEffect?.until ?? 0),
          nextTickAt: sameEffectActive ? previousEffect.nextTickAt : now + config.tickIntervalMs,
          pulseUntil: now + (burst ? config.burstMs : 420),
          burstUntil: burst ? now + config.burstMs : previousEffect?.burstUntil,
        },
      }
    })
    return changed ? commitEnemyState(nextEnemies) : enemiesRef.current
  }

  function applyHeroImpactEffect(enemyId: string, sourceModelId: PlayerModelId, baseDamage: number, animation?: PlayerAnimation, phase = 1) {
    if (teamRoomId && !teamAuthorityRef.current) {
      return paintHeroImpactEffect(enemyId, sourceModelId, animation, phase)
    }
    const config = HERO_COMBAT_EFFECTS[sourceModelId]
    if (!config) return enemiesRef.current
    const visualId = heroEffectVisualId(sourceModelId, animation, phase)
    const now = performance.now()
    const targetBefore = enemiesRef.current.find(enemy => enemy.id === enemyId)
    if (!targetBefore || targetBefore.defeated || targetBefore.hp <= 0) return enemiesRef.current

    let defeatedThisHit = false
    let appliedDamage = config.impactBonus
    let nextStacks = 1
    let burst = false
    let burstDamage = 0
    let targetAfter: EnemyState | null = null

    const nextEnemies = enemiesRef.current.map(enemy => {
      if (enemy.id !== enemyId || enemy.defeated) return enemy
      const previousEffect = enemy.heroEffect
      const sameEffectActive = previousEffect?.kind === config.kind && previousEffect.until > now
      nextStacks = sameEffectActive ? Math.max(0, previousEffect.stacks) + 1 : 1
      burst = nextStacks >= config.burstAt
      if (burst) {
        burstDamage = Math.max(config.minBurstDamage, Math.round(baseDamage * config.burstMultiplier))
        appliedDamage += burstDamage
      }

      const nextHp = Math.max(0, enemy.hp - appliedDamage)
      const defeated = nextHp === 0
      if (defeated && enemy.hp > 0) defeatedThisHit = true
      const effectStacks = burst && config.resetStacksOnBurst ? 0 : Math.min(nextStacks, config.burstAt)
      const nextEffect: EnemyHeroEffect = {
        kind: config.kind,
        visualId,
        sourceModelId,
        stacks: effectStacks,
        until: Math.max(now + HERO_EFFECT_ACTIVE_MS, previousEffect?.until ?? 0),
        nextTickAt: sameEffectActive ? Math.min(previousEffect.nextTickAt, now + config.tickIntervalMs) : now + config.tickIntervalMs,
        pulseUntil: now + (burst ? config.burstMs : 420),
        burstUntil: burst ? now + config.burstMs : previousEffect?.burstUntil,
      }
      const nextEnemy: EnemyState = {
        ...enemy,
        hp: nextHp,
        moving: config.stopEnemyOnBurst && burst ? false : enemy.moving,
        windupUntil: config.stopEnemyOnBurst && burst ? 0 : enemy.windupUntil,
        attackingUntil: config.stopEnemyOnBurst && burst ? 0 : enemy.attackingUntil,
        quizCharge: burst ? clamp(enemy.quizCharge + 1, 0, enemy.quizEvery) : enemy.quizCharge,
        hitUntil: Math.max(enemy.hitUntil, now + (burst ? 680 : 460)),
        defeated,
        deathUntil: defeated ? now + ENEMY_DEATH_ANIMATION_MS : enemy.deathUntil,
        heroEffect: defeated ? undefined : nextEffect,
      }
      targetAfter = nextEnemy
      return nextEnemy
    })

    const committed = commitEnemyState(nextEnemies, defeatedThisHit)
    const target = targetAfter ?? targetBefore
    if (burst && burstDamage > 0) spawnFloatingText(`暴击 -${burstDamage}`, target.x, target.lane, 'damage')
    if (burst && config.healOnBurst && playerHpRef.current > 0) {
      const healed = Math.min(config.healOnBurst, playerMaxHpRef.current - playerHpRef.current)
      if (healed > 0) {
        const nextHp = playerHpRef.current + healed
        playerHpRef.current = nextHp
        setPlayerHp(nextHp)
        pulsePlayerFeedback('heal')
        spawnFloatingText(`+${healed}`, playerRef.current.x, playerRef.current.lane, 'heal')
      }
    }
    return committed
  }

  function tickHeroCombatEffects(now: number) {
    if (teamRoomId && !teamAuthorityRef.current) return enemiesRef.current
    let changed = false
    let defeatedThisTick = false
    const nextEnemies = enemiesRef.current.map(enemy => {
      const effect = enemy.heroEffect
      if (!effect || enemy.defeated || enemy.hp <= 0) return enemy
      const config = HERO_COMBAT_EFFECTS[effect.sourceModelId]
      if (!config || effect.until <= now) {
        changed = true
        return { ...enemy, heroEffect: undefined }
      }

      let nextEffect = effect
      let tickDamage = 0
      if (config.tickDamage > 0 && now >= effect.nextTickAt) {
        const elapsedTicks = Math.max(1, Math.floor((now - effect.nextTickAt) / config.tickIntervalMs) + 1)
        const stackPower = Math.max(1, effect.stacks)
        tickDamage = elapsedTicks * Math.max(1, config.tickDamage + Math.max(0, stackPower - 1) * config.tickStackBonus)
        nextEffect = {
          ...nextEffect,
          nextTickAt: effect.nextTickAt + elapsedTicks * config.tickIntervalMs,
        }
      }

      if (nextEffect.burstUntil && nextEffect.burstUntil <= now) {
        nextEffect = { ...nextEffect, burstUntil: undefined }
        changed = true
      }
      if (nextEffect.pulseUntil && nextEffect.pulseUntil <= now) {
        nextEffect = { ...nextEffect, pulseUntil: undefined }
        changed = true
      }

      if (tickDamage <= 0) return nextEffect === effect ? enemy : { ...enemy, heroEffect: nextEffect }

      changed = true
      const nextHp = Math.max(0, enemy.hp - tickDamage)
      const defeated = nextHp === 0
      if (defeated && enemy.hp > 0) defeatedThisTick = true
      return {
        ...enemy,
        hp: nextHp,
        hitUntil: Math.max(enemy.hitUntil, now + 260),
        defeated,
        deathUntil: defeated ? now + ENEMY_DEATH_ANIMATION_MS : enemy.deathUntil,
        heroEffect: defeated ? undefined : nextEffect,
      }
    })

    if (changed) commitEnemyState(nextEnemies, defeatedThisTick)
    if (changed) {
      completeGame(nextEnemies, playerHpRef.current, correctRef.current, totalRef.current)
    }
    return changed ? nextEnemies : enemiesRef.current
  }

  function applyAllyAssist(now: number) {
    if (!supportAllies.length || activeQuizRef.current || timedOut || completedRef.current) return
    if (now - lastAllyAssistAtRef.current < ALLY_ASSIST_INTERVAL_MS) return
    const fighter = playerRef.current
    const target = enemiesRef.current
      .filter(enemy => !enemy.defeated && enemyInActiveCombatStage(enemy) && (enemy.kind === 'defect' || bossUnlockedRef.current))
      .filter(enemy => !quizLockedEnemyIdsRef.current.has(enemy.id))
      .map(enemy => ({
        enemy,
        distance: Math.abs(enemy.x - fighter.x) + lanePixelDistance(enemy.lane, fighter.lane),
      }))
      .filter(item => item.distance <= 560)
      .sort((a, b) => a.distance - b.distance)[0]?.enemy
    if (!target) return
    lastAllyAssistAtRef.current = now
    const teamDamage = ALLY_ASSIST_DAMAGE + Math.max(0, supportAllies.length - 1) * 3
    const damage = target.kind === 'boss' ? Math.max(5, teamDamage - 2) : teamDamage
    const nextEnemies = applyEnemyDamage(target.id, damage, 1)
    const defeated = Boolean(nextEnemies.find(enemy => enemy.id === target.id)?.defeated)
    spawnFloatingText(`${supportAllies.join(' + ')} -${damage}`, target.x, target.lane, 'damage')
    setGameMessage(`${supportAllies.join('、')} 发起协同攻击`, 760)
    playEnemyImpactSfx(target, defeated)
    completeGame(nextEnemies, playerHpRef.current, correctRef.current, totalRef.current)
  }

  function reviveLocalPlayerByAi(remote: RemoteTeamPlayer) {
    if (!playerDownedRef.current || playerHpRef.current > 0) return
    const nextHp = 30
    playerHpRef.current = nextHp
    playerDownedRef.current = false
    setPlayerHp(nextHp)
    setPlayerDowned(false)
    pulsePlayerFeedback('heal')
    spawnFloatingText(`+${nextHp}`, playerRef.current.x, playerRef.current.lane, 'heal')
    setGameMessage(`${remote.displayName} 已由 AI 接管并扶起你`, 1400)
    playSfx('item')
    if (teamRoomId && teamCurrentUserIdRef.current) {
      void postTeamPlayState({ status: 'playing', activeQuiz: null, reviveUserId: teamCurrentUserIdRef.current })
    }
  }

  function updateAiCompanions(now: number, delta: number) {
    if (!teamRoomId || completedRef.current || timedOut) return
    const aiRemotes = remotePlayersRef.current.filter(remote => (
      remote.aiControlled && remote.status !== 'downed' && remote.hp > 0
    ))
    if (!aiRemotes.length) return

    let changed = false
    const localFighter = playerRef.current
    const nextRemotes = remotePlayersRef.current.map(remote => {
      if (!remote.aiControlled || remote.status === 'downed' || remote.hp <= 0) return remote
      const attackingUntil = aiAttackUntilRef.current[remote.userId] ?? 0
      let next = { ...remote, attacking: attackingUntil > now }
      if (next.attacking !== remote.attacking) changed = true

      const moveToward = (targetX: number, targetLane: number) => {
        const dx = targetX - next.x
        const dlane = targetLane - next.lane
        const maxStep = AI_ALLY_MOVE_SPEED * delta
        const maxLaneStep = 1.9 * delta
        if (Math.abs(dx) > 4) {
          next.x = clamp(next.x + Math.sign(dx) * Math.min(Math.abs(dx), maxStep), 90, activeWorldWidth - 130)
          next.targetX = next.x
          next.facing = dx >= 0 ? 1 : -1
          next.moving = true
          changed = true
        }
        if (Math.abs(dlane) > 0.03) {
          next.lane = clamp(next.lane + Math.sign(dlane) * Math.min(Math.abs(dlane), maxLaneStep), 0, 2)
          next.targetLane = next.lane
          next.moving = true
          changed = true
        }
      }

      if (playerDownedRef.current && playerHpRef.current <= 0) {
        const near = isCloseLane(next.lane, localFighter.lane) && Math.abs(next.x - localFighter.x) <= REVIVE_RANGE
        if (!near) {
          delete aiReviveStartedAtRef.current[next.userId]
          moveToward(localFighter.x, localFighter.lane)
          return next
        }
        next.status = 'reviving'
        next.moving = false
        const startedAt = aiReviveStartedAtRef.current[next.userId] ?? now
        aiReviveStartedAtRef.current[next.userId] = startedAt
        changed = true
        if (now - startedAt >= AI_ALLY_REVIVE_MS) {
          delete aiReviveStartedAtRef.current[next.userId]
          next.status = 'playing'
          reviveLocalPlayerByAi(next)
        } else if (Date.now() > messageLockUntilRef.current) {
          setGameMessage(`${next.displayName} 已由 AI 接管，正在优先扶你`, 600)
        }
        return next
      }

      delete aiReviveStartedAtRef.current[next.userId]
      if (next.status === 'reviving') next.status = 'playing'
      if (next.attacking) {
        if (next.moving) changed = true
        next.moving = false
        return next
      }
      const target = enemiesRef.current
      .filter(enemy => !enemy.defeated && !quizLockedEnemyIdsRef.current.has(enemy.id))
      .filter(enemy => enemyInActiveCombatStage(enemy))
        .filter(enemy => enemy.kind === 'defect' || bossUnlockedRef.current)
        .map(enemy => ({
          enemy,
          distance: Math.abs(enemy.x - next.x) + lanePixelDistance(enemy.lane, next.lane),
        }))
        .sort((a, b) => a.distance - b.distance)[0]?.enemy
      if (!target) {
        if (currentRoomGateOpenForAi()) {
          const gateX = activeChapterGateReadyX
          const nearGate = Math.abs(next.x - gateX) <= 10 && Math.abs(next.lane - localFighter.lane) <= 0.06
          if (!nearGate) {
            moveToward(gateX, localFighter.lane)
            return next
          }
        }
        if (next.moving) {
          next.moving = false
          changed = true
        }
        return next
      }

      const sameLane = isCloseLane(next.lane, target.lane)
      const forwardDistance = (target.x - next.x) * next.facing
      if (!sameLane || forwardDistance < -42 || Math.abs(target.x - next.x) > playerMeleeReach(playerModelById(next.modelId), 1)) {
        moveToward(target.x - Math.sign(target.x - next.x || 1) * 82, target.lane)
        return next
      }

      const lastAttackAt = lastAiAttackAtRef.current[next.userId] ?? 0
      if (now - lastAttackAt >= AI_ALLY_ATTACK_INTERVAL_MS) {
        lastAiAttackAtRef.current[next.userId] = now
        next.attacking = true
        next.moving = false
        const aiModel = playerModelById(next.modelId)
        const aiComboSteps = playerComboSteps(aiModel)
        const aiAttackSequence = Math.max(0, Math.round(Number(next.attackSequence) || 0)) + 1
        const aiPhase = (Math.max(0, Math.round(Number(next.attackPhase) || 0)) % Math.max(1, aiComboSteps.length)) + 1
        const aiComboStep = aiComboSteps[(aiPhase - 1) % Math.max(1, aiComboSteps.length)] ?? aiComboSteps[0]
        aiAttackUntilRef.current[next.userId] = now + Math.round(clamp(aiComboStep.duration ?? 430, 240, 760))
        next.attackSequence = aiAttackSequence
        next.attackPhase = aiPhase
        changed = true
        if (teamAuthorityRef.current) {
          const damage = target.kind === 'boss' ? 5 : 7
          let nextEnemies = applyEnemyDamage(target.id, damage, 1, false, true)
          spawnFloatingText(`${next.displayName} AI -${damage}`, target.x, target.lane, 'damage')
          if (aiAttackSequence % HERO_EFFECT_TRIGGER_EVERY === 0) {
            if (next.modelId === 'knight-hero') {
              nextEnemies = releaseKnightGroundWaveFrom(next, `${next.displayName} AI`, false)
            } else {
              nextEnemies = applyHeroImpactEffect(target.id, next.modelId, damage, undefined, aiPhase)
            }
          }
          playEnemyImpactSfx(target, Boolean(nextEnemies.find(enemy => enemy.id === target.id)?.defeated))
          completeGame(nextEnemies, playerHpRef.current, correctRef.current, totalRef.current)
          void postTeamPlayState({ worldState: buildTeamWorldState('authority') })
        }
      }
      return next
    })

    if (changed) {
      remotePlayersRef.current = nextRemotes
      setRemotePlayers(nextRemotes)
    }
  }

  function currentAttackTargets(phase = 1) {
    const fighter = playerRef.current
    const reach = playerMeleeReach(selectedPlayerModelRef.current, phase)
    return enemiesRef.current
      .filter(enemy => !enemy.defeated && enemyInActiveCombatStage(enemy) && (enemy.kind === 'defect' || bossUnlockedRef.current))
      .filter(enemy => !quizLockedEnemyIdsRef.current.has(enemy.id))
      .filter(enemy => isCloseLane(enemy.lane, fighter.lane))
      .map(enemy => ({
        enemy,
        distance: (enemy.x - fighter.x) * fighter.facing,
        contactPadding: enemyMeleeContactPadding(enemy, project.id),
      }))
      .filter(item => (
        item.distance > -(PLAYER_ACTION_BACK_REACH + Math.round(item.contactPadding * 0.25))
        && item.distance <= reach + item.contactPadding
      ))
      .sort((a, b) => Math.max(0, Math.abs(a.distance) - a.contactPadding) - Math.max(0, Math.abs(b.distance) - b.contactPadding))
      .map(item => item.enemy)
  }

  function currentAttackTarget(phase = 1) {
    return currentAttackTargets(phase)[0] ?? null
  }

  function spawnKnightGroundWaveVisual(fighter: Pick<FighterState, 'x' | 'lane' | 'facing'>) {
    const direction = fighter.facing === -1 ? -1 : 1
    const wave: GroundSwordWave = {
      id: ++groundSwordWaveIdRef.current,
      x: clamp(fighter.x + direction * 132, 120, activeWorldWidth - 120),
      lane: fighter.lane,
      direction,
      duration: KNIGHT_GROUND_WAVE_DURATION_MS,
    }
    setGroundSwordWaves(current => [...current.slice(-4), wave])
    window.setTimeout(() => {
      setGroundSwordWaves(current => current.filter(item => item.id !== wave.id))
    }, wave.duration + 80)
    return wave
  }

  function releaseKnightGroundWaveFrom(fighter: Pick<FighterState, 'x' | 'lane' | 'facing'>, label = '骑士', showMessage = true) {
    const direction = fighter.facing === -1 ? -1 : 1
    spawnKnightGroundWaveVisual(fighter)
    playSfx('heavy')

    if (teamRoomId && !teamAuthorityRef.current) {
      if (showMessage) setGameMessage(`${label}剑气已释放`, 720)
      return enemiesRef.current
    }

    const targets = enemiesRef.current
      .filter(enemy => !enemy.defeated && enemyInActiveCombatStage(enemy) && (enemy.kind === 'defect' || bossUnlockedRef.current))
      .filter(enemy => !quizLockedEnemyIdsRef.current.has(enemy.id))
      .filter(enemy => lanePixelDistance(enemy.lane, fighter.lane) <= COMBAT_LANE_DISTANCE * 1.35)
      .map(enemy => ({ enemy, distance: (enemy.x - fighter.x) * direction }))
      .filter(item => item.distance >= 34 && item.distance <= KNIGHT_GROUND_WAVE_RANGE)
      .sort((a, b) => a.distance - b.distance)
      .map(item => item.enemy)

    let nextEnemies = enemiesRef.current
    for (const target of targets) {
      nextEnemies = applyEnemyDamage(target.id, KNIGHT_GROUND_WAVE_DAMAGE, 1)
      spawnFloatingText(`剑气 -${KNIGHT_GROUND_WAVE_DAMAGE}`, target.x, target.lane, 'block')
    }
    if (showMessage) setGameMessage(targets.length ? `${label}剑气贯穿 ${targets.length} 个目标` : `${label}剑气掠过地面`, 720)
    const waveAudioTarget = targets.find(target => nextEnemies.find(enemy => enemy.id === target.id)?.defeated) ?? targets[0]
    if (waveAudioTarget) playEnemyImpactSfx(waveAudioTarget, Boolean(nextEnemies.find(enemy => enemy.id === waveAudioTarget.id)?.defeated))
    if (targets.length) completeGame(nextEnemies, playerHpRef.current, correctRef.current, totalRef.current)
    return nextEnemies
  }

  function releaseKnightGroundWave() {
    if (selectedPlayerModelRef.current.id !== 'knight-hero') return enemiesRef.current
    return releaseKnightGroundWaveFrom(playerRef.current, '骑士')
  }

  function openQuizForTarget(target: EnemyState, mode: AttackMode = 'normal') {
    if (!started || activeQuizRef.current || timedOut || completedRef.current || target.defeated) return false
    const question = nextQuestionFor(target)
    const nextQuiz: ActiveQuiz = {
      enemyId: target.id,
      question,
      prompt: target.kind === 'boss' ? 'Boss 自动破防质询' : '缺陷自动破防判断',
      mode,
      damage: Math.round((PLAYER_NORMAL_DAMAGE + PLAYER_HEAVY_DAMAGE) * 0.5),
      targetTitle: target.title,
    }
    activeQuizRef.current = nextQuiz
    setAnswers([])
    setActiveQuiz(nextQuiz)
    setGameMessage('破防达成，自动进入质量判断题', 900)
    playSfx('quiz')
    return true
  }

  function updateProjectiles(now: number, delta: number) {
    if (!projectilesRef.current.length) return

    const previousProjectileCount = projectilesRef.current.length
    const nextProjectiles: ProjectileState[] = []

    for (const projectile of projectilesRef.current) {
      const speed = projectile.owner === 'enemy' ? ENEMY_PROJECTILE_SPEED : PROJECTILE_SPEED
      const nextX = projectile.x + projectile.direction * speed * (projectile.heavy ? 0.78 : 1) * delta
      const minX = Math.min(projectile.x, nextX) - 38
      const maxX = Math.max(projectile.x, nextX) + 38
      const lifetime = projectile.owner === 'enemy' ? ENEMY_PROJECTILE_LIFETIME_MS : PROJECTILE_LIFETIME_MS
      const expired = now - projectile.createdAt > lifetime || nextX < 40 || nextX > activeWorldWidth - 40

      if (expired) continue

      if (projectile.owner === 'enemy') {
        const fighter = playerRef.current
        if (activeQuizRef.current || playerDownedRef.current || playerHpRef.current <= 0) {
          nextProjectiles.push({ ...projectile, x: nextX })
          continue
        }
        const minPlayerX = Math.min(projectile.x, nextX) - 34
        const maxPlayerX = Math.max(projectile.x, nextX) + 34
        const hitPlayer = isCloseLane(fighter.lane, projectile.lane) && fighter.x >= minPlayerX && fighter.x <= maxPlayerX
        if (!hitPlayer) {
          nextProjectiles.push({ ...projectile, x: nextX })
          continue
        }

        const rolling = fighter.rollingUntil > now
        if (rolling) {
          if (!projectile.dodgedAt || now - projectile.dodgedAt > 260) {
            spawnFloatingText('翻滚躲避', fighter.x, fighter.lane, 'miss')
            playSfx('dodge')
          }
          nextProjectiles.push({ ...projectile, x: nextX, dodgedAt: now })
          continue
        }

        if (testInvincibleRef.current) {
          spawnFloatingText('无敌', fighter.x, fighter.lane, 'miss')
          setGameMessage('测试无敌挡下了远程弹', 650)
          continue
        }

        const nextHp = Math.max(0, playerHpRef.current - projectile.damage)
        playerHpRef.current = nextHp
        setPlayerHp(nextHp)
        pulsePlayerFeedback('hit')
        knockLocalPlayer(projectile.direction, projectile.heavy ? PLAYER_HIT_KNOCKBACK : PLAYER_PROJECTILE_KNOCKBACK)
        spawnFloatingText(`-${projectile.damage}`, fighter.x, fighter.lane, 'damage')
        setGameMessage('被远程弹命中，面向来弹按 J 打消，或双击 Shift 翻滚躲避', 850)
        playSfx('playerHit')
        completeGame(enemiesRef.current, nextHp, correctRef.current, totalRef.current)
        continue
      }

      const hitTarget = enemiesRef.current.find(enemy => {
        if (enemy.defeated || !isCloseLane(enemy.lane, projectile.lane)) return false
        if (quizLockedEnemyIdsRef.current.has(enemy.id)) return false
        if (!enemyInActiveCombatStage(enemy)) return false
        if (enemy.kind === 'boss' && !bossUnlockedRef.current) return false
        return enemy.x >= minX && enemy.x <= maxX && (enemy.x - projectile.x) * projectile.direction > -40
      })

      if (!hitTarget) {
        nextProjectiles.push({ ...projectile, x: nextX })
        continue
      }

      const quizDelta = projectile.heavy ? 2 : 1
      const nextEnemies = applyEnemyDamage(hitTarget.id, projectile.damage, quizDelta)
      const updatedTarget = nextEnemies.find(enemy => enemy.id === hitTarget.id)
      const defeated = Boolean(updatedTarget?.defeated)
      const quizReady = Boolean(updatedTarget && updatedTarget.quizCharge >= updatedTarget.quizEvery)
      spawnFloatingText(projectile.crit ? `暴击 -${projectile.damage}` : `-${projectile.damage}`, hitTarget.x, hitTarget.lane, 'damage')
      playEnemyImpactSfx(hitTarget, defeated)

      if (defeated) {
        setGameMessage(`${hitTarget.title} 已击败，继续推进街区`, 1100)
      } else if (quizReady) {
        if (updatedTarget) openQuizForTarget(updatedTarget, projectile.heavy ? 'heavy' : 'normal')
      } else {
        setGameMessage(`处置命中，破防 ${updatedTarget?.quizCharge ?? 0}/${updatedTarget?.quizEvery ?? 0}`, 650)
      }
      completeGame(nextEnemies, playerHpRef.current, correctRef.current, totalRef.current)
    }

    projectilesRef.current = nextProjectiles
    if (
      nextProjectiles.length === 0
      || nextProjectiles.length !== previousProjectileCount
      || now - lastProjectileRenderAtRef.current >= PROJECTILE_RENDER_INTERVAL_MS
    ) {
      lastProjectileRenderAtRef.current = now
      setProjectiles(nextProjectiles)
    }
  }

  function useGameItem(item: GameItemId) {
    if (!started || timedOut || completedRef.current) return
    if (singlePlayerPauseActive) return
    if (playerDownedRef.current) {
      setGameMessage('倒地状态不能使用道具，等待队友扶起。', 700)
      return
    }
    if (itemCounts[item] < 1) {
      setGameMessage(`${itemMeta(item).title}库存不足`, 650)
      return
    }

    const consumeItem = () => {
      const consumed = onUseItem?.(item) ?? testMode
      if (!consumed) {
        setGameMessage(`${itemMeta(item).title}库存不足`, 650)
        return false
      }
      return true
    }

    if (item === 'heal') {
      if (playerHpRef.current >= playerMaxHpRef.current) {
        setGameMessage('生命值已满，无需使用急救包', 650)
        return
      }
      if (!consumeItem()) return
      const healed = Math.min(HEAL_ITEM_AMOUNT, playerMaxHpRef.current - playerHpRef.current)
      const nextHp = playerHpRef.current + healed
      playerHpRef.current = nextHp
      setPlayerHp(nextHp)
      pulsePlayerFeedback('heal')
      spawnFloatingText(`+${healed}`, playerRef.current.x, playerRef.current.lane, 'heal')
      setGameMessage(`急救包生效，恢复 ${healed} 点生命`, 900)
      playSfx('item')
      return
    }

    if (item === 'boost') {
      if (!consumeItem()) return
      setBoostAttacks(current => current + BOOST_ATTACKS)
      setGameMessage(`增幅器已加载，接下来 ${BOOST_ATTACKS} 次攻击伤害提升`, 900)
      playSfx('item')
      return
    }

    if (!activeQuizRef.current) {
      setGameMessage('跳题卡只能在质量判断题出现时使用', 700)
      return
    }

    if (!consumeItem()) return
    const skippedQuiz = activeQuizRef.current
    const target = enemiesRef.current.find(enemy => enemy.id === skippedQuiz.enemyId)
    const nextEnemies = applyEnemyDamage(skippedQuiz.enemyId, SKIP_ITEM_DAMAGE, 0, true, true)
    if (target) playEnemyImpactSfx(target, Boolean(nextEnemies.find(enemy => enemy.id === target.id)?.defeated))
    if (target) spawnFloatingText(`跳题 -${SKIP_ITEM_DAMAGE}`, target.x, target.lane, 'damage')
    activeQuizRef.current = null
    setActiveQuiz(null)
    setAnswers([])
    if (teamRoomId) {
      const resolvedAt = Date.now()
      const roomEvent: TeamRoomEvent = {
        type: 'quizResolved',
        ownerUserId: teamCurrentUserIdRef.current,
        enemyId: skippedQuiz.enemyId,
        byUserId: teamCurrentUserIdRef.current,
        correct: false,
        at: resolvedAt,
      }
      void postTeamPlayState({
        activeQuiz: null,
        worldState: buildTeamWorldState('quiz', {
          ownerUserId: teamCurrentUserIdRef.current,
          enemyId: skippedQuiz.enemyId,
          byUserId: teamCurrentUserIdRef.current,
          correct: false,
          at: resolvedAt,
        }),
        roomEvent,
      })
    }
    setGameMessage(`已跳过判断并造成 ${SKIP_ITEM_DAMAGE} 点战术伤害`, 950)
    playSfx('item')
    completeGame(nextEnemies, playerHpRef.current, correctRef.current, totalRef.current)
  }

  function breakEnemyProjectiles(phase = 1) {
    const fighter = playerRef.current
    const breakRange = playerMeleeReach(selectedPlayerModelRef.current, phase) + 46
    let broken = 0
    let hitX = fighter.x + fighter.facing * 72
    const remaining = projectilesRef.current.filter(projectile => {
      if (projectile.owner !== 'enemy' || !isCloseLane(projectile.lane, fighter.lane)) return true
      const forwardDistance = (projectile.x - fighter.x) * fighter.facing
      if (forwardDistance < -PLAYER_ACTION_BACK_REACH || forwardDistance > breakRange) return true
      hitX = projectile.x
      broken += 1
      return false
    })
    if (broken > 0) {
      projectilesRef.current = remaining
      setProjectiles(remaining)
      spawnFloatingText(`打消 x${broken}`, hitX, fighter.lane, 'miss')
      setGameMessage(`已打消 ${broken} 枚远程弹`, 620)
      playSfx('projectileBreak')
    }
    return broken
  }

  function attackImpactDelay(modelId: PlayerModelId, animation: PlayerAnimation, duration: number) {
    const ratio = modelId === 'sprite-hero' ? 0.32 : modelId === 'black-knight' ? 0.38 : modelId === 'demon-warrior' ? 0.44 : modelId === 'knight2' ? 0.4 : 0.34
    const offset = animation === 'attack2' || animation === 'heavyAttack' ? 18 : 0
    return Math.round(clamp(duration * ratio + offset, 90, 260))
  }

  function attackImpactPlan(modelId: PlayerModelId, animation: PlayerAnimation, duration: number, comboStep?: PlayerComboStep) {
    if (modelId !== 'black-knight') {
      return [{
        delay: attackImpactDelay(modelId, animation, duration),
        damageScale: comboStep?.damageScale ?? 1,
        quizDelta: 1,
        allowQuiz: true,
        consumeBoost: true,
      }]
    }

    return [{
      delay: Math.round(clamp(duration * 0.48, 90, Math.max(90, duration - 70))),
      damageScale: comboStep?.damageScale ?? 1,
      quizDelta: 1,
      allowQuiz: true,
      consumeBoost: true,
    }]
  }

  function attackDamageForPhase(phase: number, hasCrit: boolean, boosted: boolean) {
    const phaseBoost = 1 + Math.min(phase - 1, 5) * 0.08
    return Math.round(PLAYER_NORMAL_DAMAGE * playerAttackScale * phaseBoost * (hasCrit ? 1.25 : 1) * (boosted ? BOOST_DAMAGE_MULTIPLIER : 1))
  }

  function resolveAttackImpact(
    phase: number,
    hasCrit: boolean,
    boosted: boolean,
    options: { damageScale?: number; quizDelta?: number; allowQuiz?: boolean; consumeBoost?: boolean; triggerHeroEffect?: boolean; animation?: PlayerAnimation } = {},
  ) {
    if (completedRef.current || activeQuizRef.current || playerDownedRef.current) return
    if (singlePlayerPauseActive) return
    const brokenProjectiles = breakEnemyProjectiles(phase)
    const targets = currentAttackTargets(phase)
    if (!targets.length) {
      if (brokenProjectiles > 0) setCritReadyUntil(0)
      return
    }

    if (boosted && (options.consumeBoost ?? true)) setBoostAttacks(current => Math.max(0, current - 1))

    const damage = Math.max(1, Math.round(attackDamageForPhase(phase, hasCrit, boosted) * (options.damageScale ?? 1)))
    const quizDelta = options.quizDelta ?? 1
    setCritReadyUntil(0)
    let nextEnemies = enemiesRef.current
    const hitResults = targets.map(target => {
      nextEnemies = applyEnemyDamage(target.id, damage, quizDelta)
      spawnFloatingText(hasCrit ? `暴击 -${damage}` : `-${damage}`, target.x, target.lane, 'damage')
      if (options.triggerHeroEffect && selectedPlayerModelRef.current.id !== 'knight-hero') {
        nextEnemies = applyHeroImpactEffect(target.id, selectedPlayerModelRef.current.id, damage, options.animation, phase)
      }
      const updatedTarget = nextEnemies.find(enemy => enemy.id === target.id)
      return {
        target,
        updatedTarget,
        defeated: Boolean(updatedTarget?.defeated),
        quizReady: Boolean(updatedTarget && updatedTarget.quizCharge >= updatedTarget.quizEvery),
      }
    })
    const primaryHit = hitResults[0]
    const defeatedCount = hitResults.filter(result => result.defeated).length
    const audioHit = hitResults.find(result => result.defeated)?.target ?? primaryHit?.target
    if (audioHit) playEnemyImpactSfx(audioHit, defeatedCount > 0)
    const quizHit = hitResults.find(result => result.quizReady && !result.defeated && result.updatedTarget)

    if (defeatedCount > 0) {
      setGameMessage(defeatedCount > 1 ? `范围斩击击破 ${defeatedCount} 个目标，继续推进街区` : `${primaryHit.target.title} 已击败，继续推进街区`, 1100)
    } else if (quizHit && (options.allowQuiz ?? true)) {
      if (quizHit.updatedTarget) openQuizForTarget(quizHit.updatedTarget, 'normal')
    } else if (quizHit) {
      setGameMessage(`连击命中 ${quizHit.target.title}，继续完成招式`, 520)
    } else if (hitResults.length > 1) {
      const progress = hitResults
        .map(result => `${result.target.title} ${result.updatedTarget?.quizCharge ?? 0}/${result.updatedTarget?.quizEvery ?? 0}`)
        .join('、')
      setGameMessage(`范围命中 ${hitResults.length} 个目标：${progress}`, 760)
    } else {
      setGameMessage(`已处置 ${primaryHit.target.title}，核验进度 ${primaryHit.updatedTarget?.quizCharge ?? 0}/${primaryHit.updatedTarget?.quizEvery ?? 0}`, 700)
    }
    completeGame(nextEnemies, playerHpRef.current, correctRef.current, totalRef.current)
  }

  function clearBlackKnightSheathTimer() {
    if (blackKnightSheathTimerRef.current !== null) {
      window.clearTimeout(blackKnightSheathTimerRef.current)
      blackKnightSheathTimerRef.current = null
    }
  }

  function playPlayerUtilityAnimation(animation: PlayerAnimation, durationOverride?: number) {
    const model = selectedPlayerModelRef.current
    const duration = playerAnimationStyle(model, animation, 1, { duration: durationOverride }).duration
    const nextAttackSignal: AttackSignal = {
      mode: 'normal',
      phase: normalComboPhaseRef.current || 1,
      animation,
      duration,
      sequence: ++attackSequenceRef.current,
    }
    setAttackSignal(nextAttackSignal)
    attackSignalRef.current = nextAttackSignal
    nextComboInputAtRef.current = Date.now() + duration
    lastAttackAtRef.current = Date.now()
    if (attackClearTimerRef.current !== null) window.clearTimeout(attackClearTimerRef.current)
    attackClearTimerRef.current = window.setTimeout(() => {
      if (attackSignalRef.current?.sequence === nextAttackSignal.sequence) attackSignalRef.current = null
      setAttackSignal(current => current?.sequence === nextAttackSignal.sequence ? null : current)
      attackClearTimerRef.current = null
    }, duration)
    return duration
  }

  function scheduleBlackKnightSheath() {
    if (selectedPlayerModelRef.current.id !== 'black-knight') return
    clearBlackKnightSheathTimer()
    blackKnightSheathTimerRef.current = window.setTimeout(() => {
      blackKnightSheathTimerRef.current = null
      if (
        selectedPlayerModelRef.current.id !== 'black-knight'
        || !blackKnightWeaponDrawnRef.current
        || activeQuizRef.current
        || completedRef.current
        || playerDownedRef.current
      ) return
      if (Date.now() - lastNormalComboAtRef.current < COMBO_RESET_MS) {
        scheduleBlackKnightSheath()
        return
      }
      blackKnightWeaponDrawnRef.current = false
      normalComboPhaseRef.current = 0
      playPlayerUtilityAnimation('weaponOff', 420)
    }, BLACK_KNIGHT_SHEATH_DELAY_MS)
  }

  function bufferAttack(delayMs: number) {
    if (queuedAttackTimerRef.current !== null) window.clearTimeout(queuedAttackTimerRef.current)
    queuedAttackTimerRef.current = window.setTimeout(() => {
      queuedAttackTimerRef.current = null
      performAttack()
    }, Math.max(0, delayMs))
  }

  function performAttack() {
    const assistTarget = assistQuiz
      ? enemiesRef.current.find(enemy => enemy.id === assistQuiz.enemyId) ?? null
      : null
    const assistBlocksAttack = Boolean(assistQuiz && !(teamRoomId && assistTarget?.kind === 'boss'))
    if (!started || activeQuiz || activeQuizRef.current || assistBlocksAttack || timedOut || completedRef.current) return
    if (singlePlayerPauseActive) return
    if (playerDownedRef.current) {
      setGameMessage('倒地状态不能攻击，等待队友扶起。', 700)
      return
    }
    const now = Date.now()
    const comboSteps = playerComboSteps(playerModel)
    const nextAttackAt = attackSignalRef.current
      ? Math.max(lastAttackAtRef.current + ATTACK_COOLDOWN_MS, nextComboInputAtRef.current)
      : lastAttackAtRef.current + ATTACK_COOLDOWN_MS
    if (now < nextAttackAt) {
      bufferAttack(nextAttackAt - now)
      return
    }
    if (queuedAttackTimerRef.current !== null) {
      window.clearTimeout(queuedAttackTimerRef.current)
      queuedAttackTimerRef.current = null
    }

    const hasCrit = now < critReadyUntil
    const boosted = boostAttacks > 0
    const comboElapsed = now - lastNormalComboAtRef.current
    const comboRestarting = comboElapsed > COMBO_RESET_MS
    if (playerModel.id === 'black-knight' && comboRestarting && !blackKnightWeaponDrawnRef.current) {
      clearBlackKnightSheathTimer()
      blackKnightWeaponDrawnRef.current = true
      playPlayerUtilityAnimation('weaponOn', 520)
      playSfx('attack')
      scheduleBlackKnightSheath()
      return
    }
    if (playerModel.id === 'black-knight') clearBlackKnightSheathTimer()
    if (playerStaminaRef.current < ATTACK_STAMINA_COST) return
    lastStaminaUseAtRef.current = performance.now()
    commitPlayerStamina(playerStaminaRef.current - ATTACK_STAMINA_COST, true)
    const phase = comboElapsed > COMBO_RESET_MS
      ? 1
      : normalComboPhaseRef.current >= comboSteps.length ? 1 : normalComboPhaseRef.current + 1
    normalComboPhaseRef.current = phase
    lastNormalComboAtRef.current = now
    const comboStep = comboSteps[phase - 1] ?? comboSteps[0] ?? { animation: 'attack' as PlayerAnimation }
    const animation: PlayerAnimation = comboStep.animation
    const baseAnimationDuration = playerAnimationStyle(playerModel, animation, 1, {
      startFrame: comboStep.startFrame,
      frameCount: comboStep.frameCount,
      duration: comboStep.duration,
    }).duration
    const signalDuration = baseAnimationDuration
    const impactPlan = attackImpactPlan(playerModel.id, animation, signalDuration, comboStep)
    const attackSequence = ++attackSequenceRef.current
    const heroEffectAttackCount = heroEffectAttackCountRef.current + 1
    heroEffectAttackCountRef.current = heroEffectAttackCount
    const triggerHeroEffect = heroEffectAttackCount % HERO_EFFECT_TRIGGER_EVERY === 0
    const nextAttackSignal: AttackSignal = {
      mode: 'normal',
      phase,
      animation,
      duration: signalDuration,
      sequence: attackSequence,
      triggersHeroEffect: triggerHeroEffect,
      frameStart: comboStep.startFrame,
      frameCount: comboStep.frameCount,
    }
    setAttackSignal(nextAttackSignal)
    attackSignalRef.current = nextAttackSignal
    nextComboInputAtRef.current = now + signalDuration
    if (attackClearTimerRef.current !== null) window.clearTimeout(attackClearTimerRef.current)
    attackClearTimerRef.current = window.setTimeout(() => {
      if (attackSignalRef.current?.sequence === nextAttackSignal.sequence) attackSignalRef.current = null
      setAttackSignal(current => current?.sequence === nextAttackSignal.sequence ? null : current)
      attackClearTimerRef.current = null
    }, signalDuration)
    lastAttackAtRef.current = now
    playSfx(phase === 1 ? 'attack' : 'heavy')
    if (playerModel.id === 'black-knight') scheduleBlackKnightSheath()
    const impactTimers = impactPlan.map(impact => {
      const impactTimer = window.setTimeout(() => {
        attackImpactTimersRef.current = attackImpactTimersRef.current.filter(timer => timer !== impactTimer)
        if (triggerHeroEffect && selectedPlayerModelRef.current.id === 'knight-hero') {
          releaseKnightGroundWave()
        }
        resolveAttackImpact(phase, hasCrit, boosted, {
          ...impact,
          triggerHeroEffect,
          animation,
        })
      }, impact.delay)
      return impactTimer
    })
    attackImpactTimersRef.current = [...attackImpactTimersRef.current, ...impactTimers]
  }

  function submitQuiz() {
    if (!activeQuiz || !answers.length) return
    const hit = answersMatch(answers, activeQuiz.question)
    const nextCorrect = correct + (hit ? 1 : 0)
    const nextTotal = total + 1
    const quizEnemy = enemiesRef.current.find(enemy => enemy.id === activeQuiz.enemyId)
    const damage = hit
      ? Math.round(activeQuiz.damage * PLAYER_QUIZ_MULTIPLIER + QUESTION_REWARD_DAMAGE)
      : Math.max(5, Math.round(activeQuiz.damage * 0.42))
    let nextEnemies = enemiesRef.current
    let nextHp = playerHp

    if (hit) {
      playSfx('correct')
      setCritReadyUntil(Date.now() + CRIT_WINDOW_MS)
      nextEnemies = applyEnemyDamage(activeQuiz.enemyId, damage, 0, true, true)
      if (quizEnemy) spawnFloatingText(`暴击 -${damage}`, quizEnemy.x, quizEnemy.lane, 'damage')
      const defeated = nextEnemies.find(enemy => enemy.id === activeQuiz.enemyId)?.defeated
      if (quizEnemy) playEnemyImpactSfx(quizEnemy, Boolean(defeated))
      setGameMessage(defeated ? `${activeQuiz.targetTitle} 已击败，继续推进街区` : `回答正确，造成 ${damage} 点暴击伤害`, 1200)
    } else {
      playSfx('wrong')
      const penalty = quizEnemy?.kind === 'boss' ? WRONG_ANSWER_DAMAGE + BOSS_COUNTER_DAMAGE : WRONG_ANSWER_DAMAGE + ENEMY_COUNTER_DAMAGE
      if (testInvincibleRef.current) {
        nextHp = playerHp
        spawnFloatingText('无敌', playerRef.current.x, playerRef.current.lane, 'miss')
      } else {
        nextHp = Math.max(0, playerHp - penalty)
        playerHpRef.current = nextHp
        setPlayerHp(nextHp)
        pulsePlayerFeedback('hit')
        if (quizEnemy) {
          const knockDirection: 1 | -1 = playerRef.current.x >= quizEnemy.x ? 1 : -1
          knockLocalPlayer(knockDirection, quizEnemy.kind === 'boss' ? PLAYER_HIT_KNOCKBACK + 18 : PLAYER_HIT_KNOCKBACK)
        }
      }
      nextEnemies = applyEnemyDamage(activeQuiz.enemyId, damage, 0, true, true)
      if (quizEnemy) playEnemyImpactSfx(quizEnemy, Boolean(nextEnemies.find(enemy => enemy.id === activeQuiz.enemyId)?.defeated))
      if (quizEnemy) spawnFloatingText(`-${damage}`, quizEnemy.x, quizEnemy.lane, 'damage')
      if (!testInvincibleRef.current) spawnFloatingText(`-${penalty}`, playerRef.current.x, playerRef.current.lane, 'damage')
      setGameMessage(testInvincibleRef.current ? `回答错误，仅造成 ${damage} 点擦伤；测试无敌已挡下反击` : `回答错误，仅造成 ${damage} 点擦伤并受到反击`, 1200)
    }

    setCorrect(nextCorrect)
    setTotal(nextTotal)
    activeQuizRef.current = null
    setActiveQuiz(null)
    setAnswers([])
    if (teamRoomId) {
      const resolvedAt = Date.now()
      const roomEvent: TeamRoomEvent = {
        type: 'quizResolved',
        ownerUserId: teamCurrentUserIdRef.current,
        enemyId: activeQuiz.enemyId,
        byUserId: teamCurrentUserIdRef.current,
        correct: hit,
        at: resolvedAt,
      }
      void postTeamPlayState({
        activeQuiz: null,
        worldState: buildTeamWorldState('quiz', {
          ownerUserId: teamCurrentUserIdRef.current,
          enemyId: activeQuiz.enemyId,
          byUserId: teamCurrentUserIdRef.current,
          correct: hit,
          at: resolvedAt,
        }),
        roomEvent,
      })
    }
    completeGame(nextEnemies, nextHp, nextCorrect, nextTotal)
  }

  function handleStageMouseDown(event: ReactMouseEvent<HTMLElement>) {
    if (singlePlayerPauseActive) return
    const targetElement = event.target as HTMLElement
    if (targetElement.closest('button, [role="dialog"], input, textarea, select, aside, header')) return
    if (battleIntroActiveRef.current) return
    if (event.button === 0) {
      if (currentAttackTarget()) {
        performAttack()
        return
      }
      const bottomDistance = window.innerHeight - event.clientY
      const lane = laneFromBottom(bottomDistance)
      const targetX = clamp(cameraX + event.clientX, 90, activeWorldWidth - 130)
      moveTargetRef.current = { x: targetX, lane }
      const marker = { id: ++moveMarkerIdRef.current, x: targetX, lane }
      setMoveClickMarker(marker)
      if (moveMarkerClearTimerRef.current !== null) window.clearTimeout(moveMarkerClearTimerRef.current)
      moveMarkerClearTimerRef.current = window.setTimeout(() => {
        setMoveClickMarker(current => current?.id === marker.id ? null : current)
        moveMarkerClearTimerRef.current = null
      }, 950)
      setGameMessage(`前往${environment.label}坐标 ${Math.round(targetX)}`, 650)
    }
  }

  function beginTrainingRun() {
    if (teamRoomId && !teamCanBeginRun) {
      setTeamLoadoutNotice(teamMemberCount < 2 ? '至少两名真人队员选择战斗角色后才能进入调查' : '等待所有队友选择战斗角色')
      return
    }
    if (isEndlessSurvival) {
      setStoryIntroSeen(true)
      setStoryIntroActive(false)
      launchTrainingRun()
      return
    }
    if (!storyIntroSeen) {
      setStoryIntroActive(true)
      setTeamLaunchActive(false)
      setTeamLaunchProgress(1)
      setTeamLoadoutNotice('')
      return
    }
    launchTrainingRun()
  }

  function launchTrainingRun() {
    const context = audioContext()
    if (context?.state === 'suspended') {
      void context.resume().catch(() => undefined)
    }
    playSfx('start')
    startBackgroundMusic()
    stopStorySpeech()
    teamLocalStateHydratedRef.current = false
    playerStaminaRef.current = playerMaxStaminaRef.current
    lastStaminaUseAtRef.current = 0
    lastStaminaRenderValueRef.current = playerMaxStaminaRef.current
    heroEffectAttackCountRef.current = 0
    if (isBossRushChapter) {
      finalChapterStageRef.current = 1
      openedFinalStageGateRef.current = 0
      setFinalChapterStage(1)
    }
    setPlayerStamina(playerMaxStaminaRef.current)
    setTeamBattleHydrated(!teamRoomId)
    setStarted(true)
    setTeamLaunchActive(false)
    setTeamLaunchProgress(1)
    setTeamLoadoutNotice('')
    if (!isEndlessSurvival) startStoryDialogueRound(storyRoundFor('hall', 'scene') ?? storyDialogueRounds[0] ?? null)
    setGameMessage(isBossRushChapter
      ? '第 11 章开始：逐关回溯前 10 个项目，清理本关后通过门进入下一关。'
      : storyModeActive
      ? '第一场景剧情已进入，完成对白后开始现场调查。'
      : teamRoomId
        ? 'Boss 已进入战场，完成剧情对白后同步开始组队调查。'
        : 'Boss 已进入战场，完成剧情对白后怪物开始出现。',
      1800,
    )
    if (isEndlessSurvival) {
      setGameMessage('无尽试炼开始：只有生存战，清理本层全部怪物后进入下一层。', 1800)
    }
    if (teamRoomId && teamAuthorityRef.current) {
      void postTeamPlayState({ worldState: buildTeamWorldState('authority') })
    } else if (teamRoomId) {
      void postTeamPlayState()
    }
  }

  function startBattleFromStoryIntro() {
    if (teamRoomId && !teamStoryRolesReady) {
      setTeamLoadoutNotice('等待所有队友认领剧情角色后同步进入战斗')
      return
    }
    if (!teamRoomId && !claimedStoryRole) {
      setTeamLoadoutNotice('请先认领一个剧情角色')
      return
    }
    setStoryIntroSeen(true)
    setStoryIntroActive(false)
    launchTrainingRun()
  }

  function chooseTeamCombatModel(modelId: PlayerModelId) {
    if (teamRoomId && teamLoadoutMe?.combatRoleId) return
    if (!unlockedPlayerModelSet.has(modelId)) {
      setTeamLoadoutNotice('该英雄尚未解锁，请先在商店解锁')
      return
    }
    setSelectedPlayerModelId(modelId)
    setPendingTeamModelId(modelId)
    if (teamRoomId) setTeamLoadoutNotice(`已预选 ${playerModelById(modelId).name}，点击确认后锁定`)
  }

  async function autoAssignTeamCombatRoles() {
    if (!teamRoomId) return
    const token = readTeamAuthToken()
    if (!token) return
    const lockedCombatRoleId = teamLoadoutMe?.combatRoleId
    const preferredRoleId = isPlayerModelId(lockedCombatRoleId) && unlockedPlayerModelSet.has(lockedCombatRoleId)
      ? lockedCombatRoleId
      : unlockedPlayerModelSet.has(pendingTeamModelId)
        ? pendingTeamModelId
        : DEFAULT_PLAYER_MODEL_ID
    setTeamLoadoutNotice('倒计时结束，正在自动分配未确认角色...')
    const response = await fetch('/api/team/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action: 'autoAssignCombatRoles', roomId: teamRoomId, projectId: project.id, roleId: preferredRoleId }),
    }).catch(() => null)
    const data = await response?.json().catch(() => null) as TeamLoadoutRoomSnapshot | { error?: string } | null
    if (!response?.ok) {
      setTeamLoadoutNotice(data && 'error' in data && data.error ? data.error : '自动分配角色失败，请手动确认')
      return
    }
    const snapshot = data as TeamLoadoutRoomSnapshot
    const lockedMe = snapshot.members.find(member => member.mine)
    if (lockedMe?.combatRoleId && isPlayerModelId(lockedMe.combatRoleId)) {
      setSelectedPlayerModelId(lockedMe.combatRoleId)
      setPendingTeamModelId(lockedMe.combatRoleId)
    }
    setTeamLoadoutRoom(snapshot)
    setTeamLoadoutNotice('角色已自动确认，正在进入调查')
  }

  async function claimTeamCombatRole(modelId: PlayerModelId) {
    if (!unlockedPlayerModelSet.has(modelId)) {
      setTeamLoadoutNotice('该英雄尚未解锁，请先在商店解锁')
      return
    }
    setSelectedPlayerModelId(modelId)
    setPendingTeamModelId(modelId)
    if (!teamRoomId) return
    const token = readTeamAuthToken()
    if (!token) {
      setTeamLoadoutNotice('请先登录后再选择组队角色')
      return
    }
    setTeamLoadoutNotice('正在同步角色选择...')
    const response = await fetch('/api/team/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action: 'claimCombatRole', roomId: teamRoomId, projectId: project.id, roleId: modelId }),
    }).catch(() => null)
    const data = await response?.json().catch(() => null) as TeamLoadoutRoomSnapshot | { error?: string } | null
    if (!response?.ok) {
      setTeamLoadoutNotice(data && 'error' in data && data.error ? data.error : '角色选择失败，请重试')
      return
    }
    const snapshot = data as TeamLoadoutRoomSnapshot
    const lockedMe = snapshot.members.find(member => member.mine)
    if (lockedMe?.combatRoleId && isPlayerModelId(lockedMe.combatRoleId)) {
      setSelectedPlayerModelId(lockedMe.combatRoleId)
      setPendingTeamModelId(lockedMe.combatRoleId)
    }
    setTeamLoadoutRoom(snapshot)
    setTeamLoadoutNotice('角色已锁定，等待其他队友选择')
  }

  async function claimTeamStoryRole(roleId: string) {
    if (!teamRoomId) return
    const token = readTeamAuthToken()
    if (!token) {
      setTeamLoadoutNotice('请先登录后再认领剧情角色')
      return
    }
    setTeamLoadoutNotice('正在同步剧情角色...')
    const response = await fetch('/api/team/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action: 'claim', roomId: teamRoomId, projectId: project.id, roleId }),
    }).catch(() => null)
    const data = await response?.json().catch(() => null) as TeamLoadoutRoomSnapshot | { error?: string } | null
    if (!response?.ok) {
      setTeamLoadoutNotice(data && 'error' in data && data.error ? data.error : '剧情角色认领失败，请重试')
      return
    }
    setTeamLoadoutRoom(data as TeamLoadoutRoomSnapshot)
    setTeamLoadoutNotice('剧情角色已认领，AI 托管已关闭')
  }

  function chooseAssistAnswer(id: string) {
    if (!assistQuiz) return
    playSfx('quizSelect')
    setAssistAnswers(previous => {
      if (assistQuiz.question.kind === 'single') return [id]
      if (assistQuiz.question.kind === 'sequence') {
        return previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]
      }
      return previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]
    })
  }

  function submitAssistQuiz() {
    if (!assistQuiz || !assistAnswers.length) return
    const hit = answersMatch(assistAnswers, assistQuiz.question)
    const target = enemiesRef.current.find(enemy => enemy.id === assistQuiz.enemyId)
    const damage = hit
      ? Math.round(assistQuiz.damage * PLAYER_QUIZ_MULTIPLIER + QUESTION_REWARD_DAMAGE)
      : Math.max(5, Math.round(assistQuiz.damage * 0.42))
    const nextEnemies = applyEnemyDamage(assistQuiz.enemyId, damage, 0, true, true)
    if (target) playEnemyImpactSfx(target, Boolean(nextEnemies.find(enemy => enemy.id === assistQuiz.enemyId)?.defeated))
    if (target) spawnFloatingText(hit ? `协助 -${damage}` : `协助擦伤 -${damage}`, target.x, target.lane, 'damage')
    playSfx(hit ? 'correct' : 'wrong')
    setAssistQuiz(null)
    setAssistAnswers([])
    const resolvedAt = Date.now()
    const roomEvent: TeamRoomEvent = {
      type: 'quizResolved',
      ownerUserId: assistQuiz.ownerUserId ?? null,
      enemyId: assistQuiz.enemyId,
      byUserId: teamCurrentUserIdRef.current,
      correct: hit,
      damage,
      at: resolvedAt,
    }
    if (teamRoomId) {
      void postTeamPlayState({
        worldState: buildTeamWorldState('assist', {
          ownerUserId: assistQuiz.ownerUserId ?? null,
          enemyId: assistQuiz.enemyId,
          byUserId: teamCurrentUserIdRef.current,
          correct: hit,
          damage,
          at: resolvedAt,
        }),
        roomEvent,
      })
    }
    setGameMessage(hit ? '已协助队友完成质量判断' : '已提交协助判断，结果已同步给队友', 1200)
    completeGame(nextEnemies, playerHpRef.current, correctRef.current, totalRef.current)
  }

  function startAssistQuiz(remote: RemoteTeamPlayer) {
    if (!remote.activeQuiz) return
    setAssistQuiz(remote.activeQuiz)
    setAssistAnswers([])
    setGameMessage(`正在协助 ${remote.displayName} 答题`, 900)
  }

  function clearReviveAttempt(messageText?: string) {
    if (reviveTimerRef.current !== null) {
      window.clearInterval(reviveTimerRef.current)
      reviveTimerRef.current = null
    }
    setRevivingRemoteId(null)
    setReviveProgress(0)
    if (messageText) setGameMessage(messageText, 900)
  }

  function stopLocalMotion() {
    keyboard.current = {}
    moveTargetRef.current = null
    setMoveClickMarker(null)
    const current = playerRef.current
    if (current.moving || current.rollingUntil !== 0) {
      const stopped = { ...current, moving: false, rollingUntil: 0 }
      playerRef.current = stopped
      setPlayer(stopped)
    }
    if (movementModeRef.current !== 'idle') {
      movementModeRef.current = 'idle'
      setMovementMode('idle')
    }
  }

  function pauseSinglePlayer(exitConfirm = false) {
    if (teamRoomId || !started || battleIntroActiveRef.current || storyIntroActive || completedRef.current || timedOut) return
    stopLocalMotion()
    if (queuedAttackTimerRef.current !== null) window.clearTimeout(queuedAttackTimerRef.current)
    if (attackClearTimerRef.current !== null) window.clearTimeout(attackClearTimerRef.current)
    if (blackKnightSheathTimerRef.current !== null) window.clearTimeout(blackKnightSheathTimerRef.current)
    if (moveMarkerClearTimerRef.current !== null) window.clearTimeout(moveMarkerClearTimerRef.current)
    attackImpactTimersRef.current.forEach(timer => window.clearTimeout(timer))
    attackImpactTimersRef.current = []
    queuedAttackTimerRef.current = null
    attackClearTimerRef.current = null
    blackKnightSheathTimerRef.current = null
    moveMarkerClearTimerRef.current = null
    attackSignalRef.current = null
    setAttackSignal(null)
    activeSfxRef.current.forEach(audio => audio.pause())
    backgroundMusicRef.current?.pause()
    setSinglePlayerPaused(true)
    if (exitConfirm) setSinglePlayerExitConfirmOpen(true)
  }

  function resumeSinglePlayer() {
    setSinglePlayerExitConfirmOpen(false)
    setSinglePlayerPaused(false)
    if (started && !teamRoomId && !completedRef.current && !timedOut) startBackgroundMusic()
  }

  function requestSinglePlayerExit() {
    if (!singlePlayerPauseEligible) {
      onBack()
      return
    }
    pauseSinglePlayer(true)
  }

  function confirmSinglePlayerExit() {
    setSinglePlayerExitConfirmOpen(false)
    setSinglePlayerPaused(false)
    if (isEndlessSurvival && started) {
      settleEndlessSurvival(enemiesRef.current, playerHpRef.current)
      return
    }
    onBack()
  }

  async function reviveRemotePlayer(remote: RemoteTeamPlayer) {
    if (!teamRoomId) return
    if (revivingRemoteId) return
    const fighter = playerRef.current
    const near = isCloseLane(remote.lane, fighter.lane) && Math.abs(remote.x - fighter.x) <= 150
    if (!near) {
      setGameMessage('靠近倒地队友后才能扶起', 900)
      return
    }
    const startedAt = Date.now()
    setRevivingRemoteId(remote.userId)
    setReviveProgress(0)
    setGameMessage(`正在扶起 ${remote.displayName}，保持 5 秒不要离开`, 1000)
    await postTeamPlayState({ status: 'reviving' })
    reviveTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAt
      const current = playerRef.current
      const stillNear = isCloseLane(remote.lane, current.lane) && Math.abs(remote.x - current.x) <= 165
      if (playerDownedRef.current || !stillNear) {
        clearReviveAttempt(playerDownedRef.current ? '你已倒地，扶起被中断' : '离开队友太远，扶起被中断')
        return
      }
      const progress = Math.min(1, elapsed / REVIVE_DURATION_MS)
      setReviveProgress(progress)
      if (progress < 1) return
      if (reviveTimerRef.current !== null) {
        window.clearInterval(reviveTimerRef.current)
        reviveTimerRef.current = null
      }
      setRevivingRemoteId(null)
      setReviveProgress(0)
      void postTeamPlayState({ reviveUserId: remote.userId }).then(() => {
        setGameMessage(`${remote.displayName} 已被扶起，生命值恢复到 30`, 1200)
      })
    }, 100)
  }

  function requestTeamExit() {
    if (!teamRoomId) {
      if (started) requestSinglePlayerExit()
      else onBack()
      return
    }
    setTeamExitConfirmOpen(true)
  }

  async function confirmTeamExit() {
    setTeamExitConfirmOpen(false)
    clearReviveAttempt()
    setAssistQuiz(null)
    setAssistAnswers([])
    activeQuizRef.current = null
    setActiveQuiz(null)
    setAnswers([])
    const nextHp = Math.max(1, playerHpRef.current - 30)
    playerHpRef.current = nextHp
    setPlayerHp(nextHp)
    if (teamRoomId) await postTeamPlayState({ hp: nextHp, status: 'exited', activeQuiz: null })
    onBack()
  }

  function renderTeamExitConfirm() {
    if (!teamExitConfirmOpen) return null
    return (
      <section className={styles.teamExitScrim} role="dialog" aria-modal="true" aria-labelledby="team-exit-title">
        <div className={styles.teamExitPanel}>
          <span>TEAM EXIT</span>
          <h2 id="team-exit-title">退出本次组队调查？</h2>
          <p>退出后仍可从组队房间重新进入，但本次现场状态会中断，并扣除 30 点生命值作为惩罚。</p>
          <div>
            <button type="button" onClick={() => setTeamExitConfirmOpen(false)}>继续调查</button>
            <button type="button" onClick={() => void confirmTeamExit()}>确认退出</button>
          </div>
        </div>
      </section>
    )
  }

  function renderSinglePlayerPauseOverlay() {
    if (!singlePlayerPauseActive) return null
    const confirmExit = singlePlayerExitConfirmOpen
    const pauseTitle = confirmExit ? '返回地图？' : '已暂停'
    const pauseBody = confirmExit ? '返回后将结束本次单人实训。' : '倒计时与敌人行动已暂停。'
    const pauseStatus = confirmExit ? '返回确认' : '战斗暂停中'
    return (
      <section
        className={styles.singlePlayerPauseScrim}
        role="dialog"
        aria-modal="true"
        aria-labelledby="single-pause-title"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className={styles.singlePlayerPausePanel}>
          <div className={styles.singlePlayerPauseHeader}>
            <span className={styles.singlePlayerPauseIcon}><Pause size={18} /></span>
            <div className={styles.singlePlayerPauseCopy}>
              <span>{pauseStatus}</span>
              <h2 id="single-pause-title">{pauseTitle}</h2>
              <p>{pauseBody}</p>
            </div>
          </div>
          <div className={styles.singlePlayerPauseActions}>
            <button type="button" className={styles.singlePlayerPausePrimary} onClick={resumeSinglePlayer}>
              {confirmExit ? '继续实训' : '继续'}
            </button>
            <button type="button" className={styles.singlePlayerPauseExit} onClick={confirmSinglePlayerExit}>
              返回地图
            </button>
          </div>
        </div>
      </section>
    )
  }

  const hudStyle = {
    '--weapon-color': playerModel.accent,
    '--project-map-image': `url("${currentEndlessMapBackground ?? mapBackgroundUrl}")`,
  } as CSSProperties
  const localCombatLocked = Boolean(teamRoomId && teamLoadoutMe?.combatRoleId)
  const teamConfirmedCount = teamLoadoutRoom?.members.filter(member => member.combatRoleId).length ?? 0
  const pendingTeamModel = playerModelById(pendingTeamModelId)

  if (!started) {
    return (
      <section className={styles.loadout} style={hudStyle} aria-label="2D 实训角色选择">
        <div className={styles.loadoutBackdrop} />
        <header className={styles.loadoutHeader}>
          <button
            type="button"
            onClick={requestTeamExit}
            aria-label="返回项目简报"
          >
            <ArrowLeft size={19} />
          </button>
          <div>
            <small>PROJECT {String(project.id).padStart(2, '0')} / 2D 横版实训街区</small>
            <h1>{project.title}</h1>
          </div>
          {teamRoomId && (
            <div className={styles.teamLoadoutCountdown}>
              <Clock3 size={16} />
              <span>{teamLoadoutSecondsLeft}s</span>
            </div>
          )}
        </header>
        {storyIntroActive ? (
          <main className={styles.storyIntroMain}>
            <section className={styles.storyIntroPanel}>
              <div className={styles.storyIntroCopy}>
                <p className={styles.eyebrow}>STORY BRIEFING / 剧情导入</p>
                <h2>{project.title}</h2>
                <p>{project.curriculum} · {carrier.productName} · {project.caseFocus}</p>
                <div className={styles.storyIntroBackground}>
                  <span>案件背景</span>
                  <strong>{project.riskSignal}</strong>
                  <p>进入现场前先认领剧情身份，明确本场调查目标、同伴掌握的线索和即将面对的风险。</p>
                </div>
                <div className={styles.storyIntroDialogues}>
                  {storyPreviewLines.filter(line => line.line.trim()).map((line, index) => (
                    <article key={`${line.speaker}-${index}`}>
                      <b>{line.speaker}</b>
                      <p>{line.line}</p>
                    </article>
                  ))}
                </div>
              </div>

              <div className={styles.storyRoleClaimBoard}>
                <header>
                  <div>
                    <span>角色认领</span>
                    <strong>{teamRoomId ? '队友角色对接' : '单人剧情身份'}</strong>
                  </div>
                  <small>{claimedStoryRole ? `你已认领 ${claimedStoryRole.name}` : '先认领剧情角色，再进入战斗'}</small>
                </header>
                <div>
                  {storyRoleCardsForClaim.map(npc => {
                    const owner = teamLoadoutRoom?.members.find(member => member.roleId === npc.roleId)
                    const soloClaimed = !teamRoomId && singleClaimedStoryRoleId === npc.roleId
                    const revealKnowledge = !teamRoomId || owner?.mine
                    return (
                      <article key={npc.roleId} className={soloClaimed || owner?.mine ? styles.storyRoleClaimed : ''}>
                        <span>{teamRoomId ? (owner ? `${owner.displayName} 认领` : 'AI 托管') : soloClaimed ? '你已认领' : '可认领'}</span>
                        <strong>{npc.name}</strong>
                        <small>{npc.department} · {npc.identity}</small>
                        <p>{revealKnowledge ? (npc.privateKnowledge?.[0] ?? npc.goal) : '该角色线索由认领队友在剧情交流中补充。'}</p>
                        {teamRoomId ? (
                          <button
                            type="button"
                            disabled={Boolean(owner && !owner.mine)}
                            onClick={() => void claimTeamStoryRole(npc.roleId)}
                          >
                            {owner?.mine ? '已认领' : owner ? '队友已认领' : '认领角色'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={soloClaimed}
                            onClick={() => setSingleClaimedStoryRoleId(npc.roleId)}
                          >
                            {soloClaimed ? '已认领' : '认领角色'}
                          </button>
                        )}
                      </article>
                    )
                  })}
                </div>
              </div>

              <footer className={styles.storyIntroActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => setStoryIntroActive(false)}>
                  返回角色选择
                </button>
                <button type="button" className={styles.startButton} disabled={teamRoomId ? !teamStoryRolesReady : !claimedStoryRole} onClick={startBattleFromStoryIntro}>
                  <Swords size={19} />剧情已确认，进入战斗
                </button>
              </footer>
            </section>
          </main>
        ) : teamLaunchActive ? (
          <main className={styles.teamLaunchMain}>
            <section className={styles.teamLaunchPanel}>
              <span>TEAM SYNC</span>
              <h2>队员正在进入调查现场</h2>
              <p>所有战斗角色已锁定，正在同步队友、地图和怪物状态。</p>
              <div className={styles.teamLaunchRoster}>
                {teamLoadoutRoom?.members.map((member, index) => (
                  <article key={member.userId}>
                    <strong>{member.displayName}</strong>
                    <small>{member.combatRoleName ?? '战斗角色已确认'}</small>
                    <i style={{ width: `${Math.min(100, Math.round(teamLaunchProgress * 100 + index * 8))}%` }} />
                  </article>
                ))}
              </div>
              <div className={styles.teamLaunchProgress}>
                <i style={{ width: `${Math.round(teamLaunchProgress * 100)}%` }} />
              </div>
            </section>
          </main>
        ) : (
        <main className={styles.loadoutMain}>
          <section className={styles.loadoutCopy}>
            <p className={styles.eyebrow}>PROJECT {String(project.id).padStart(2, '0')} / CHAPTER BRIEFING</p>
            <h2>{project.title}</h2>
            <div className={styles.chapterBriefing}>
              <article>
                <span>章节概述</span>
                <strong>{project.curriculum}</strong>
                <p>{project.caseFocus}</p>
              </article>
              <article>
                <span>训练难点</span>
                <strong>{project.id >= 9 ? '高难度综合判断' : project.id >= 5 ? '进阶证据分析' : '基础流程核验'}</strong>
                <ul>
                  {(project.finalBoss ? project.scenes : project.scenes.slice(0, 3)).map(scene => <li key={scene.id}>{scene.objective}</li>)}
                </ul>
              </article>
              <article>
                <span>注意事项</span>
                <strong>先控制风险，再形成结论</strong>
                <p>{project.riskSignal}</p>
                <small>敌方远程弹可通过翻滚躲避，也可以用 J / 左键攻击打消。</small>
              </article>
            </div>
            <div className={styles.loadoutMeta}>
              <span><Shield size={16} />{role.title}</span>
              <span><Target size={16} />{carrier.productName}</span>
              <span><Target size={16} />{environment.label}</span>
              <span><ScanSearch size={16} />手动处置 + 质量判断</span>
            </div>
          </section>
          <section className={styles.loadoutEquipment} aria-label="实训角色模型">
            <article className={styles.loadoutModelPreview} data-model-id={playerModel.id} style={{ '--model-accent': playerModel.accent } as CSSProperties}>
              <span>{playerModel.code}</span>
              <strong>{playerModel.name}</strong>
              <div className={styles.loadoutModelStage}>
                <img
                  className={styles.modelPreviewImage}
                  src={`/simulation/players/${playerModel.id}/loadout-preview.png`}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                />
              </div>
              <em>{playerModel.specialty}</em>
            </article>
            <div className={styles.loadoutModelPicker}>
              <div>
                <strong>选择实验模型</strong>
                <span>多套角色动作资源已接入，武器拾取与切换已停用</span>
              </div>
              <div className={styles.loadoutModelGrid}>
                {PLAYER_MODELS.map(model => {
                  const lockedByMe = teamLoadoutMe?.combatRoleId === model.id
                  const active = teamRoomId ? lockedByMe || (!localCombatLocked && model.id === pendingTeamModelId) : model.id === selectedPlayerModelId
                  const lockedByStore = !unlockedPlayerModelSet.has(model.id)
                  return (
                    <button
                      type="button"
                      key={model.id}
                      data-model-id={model.id}
                      className={`${active && !lockedByMe ? styles.loadoutModelActive : ''} ${lockedByStore ? styles.loadoutModelLocked : ''} ${lockedByMe ? styles.loadoutModelConfirmed : ''}`}
                      style={{ '--model-accent': model.accent } as CSSProperties}
                      disabled={lockedByStore || localCombatLocked}
                      title={lockedByStore ? `${model.name}：商店解锁后可用` : lockedByMe ? `${model.name}：已锁定` : active ? `${model.name}：已预选` : model.name}
                      onClick={() => {
                        if (teamRoomId) {
                          chooseTeamCombatModel(model.id)
                        } else {
                          setSelectedPlayerModelId(model.id)
                        }
                      }}
                      aria-pressed={active}
                    >
                      <img
                        className={styles.modelPreviewImage}
                        src={`/simulation/players/${model.id}/loadout-preview.png`}
                        alt=""
                        aria-hidden="true"
                        draggable={false}
                      />
                      <b>{model.name}</b>
                      {lockedByStore && <LockIcon size={14} />}
                      {active && <Check size={14} />}
                    </button>
                  )
                })}
              </div>
            </div>
          </section>
          <div className={styles.teamLoadoutStoryPanel}>
            <header>
              <strong>{isEndlessSurvival ? '无剧情生存战' : teamRoomId ? '队伍确认状态' : '剧情将在开始后导入'}</strong>
              <span>{isEndlessSurvival ? '确认角色后直接进入无尽层战斗' : teamRoomId ? `${teamConfirmedCount}/${teamLoadoutRoom?.members.length ?? 0} 已确认` : '先选战斗角色，再进入 NPC 对话'}</span>
            </header>
            {teamRoomId && (
              <div className={styles.teamLoadoutMembers}>
                {teamLoadoutRoom?.members.map(member => (
                  <article key={member.userId} className={member.combatRoleId ? styles.teamLoadoutMemberReady : ''}>
                    <b>{member.displayName}</b>
                    <span>{member.combatRoleName ?? (member.mine ? '请选择一个战斗角色' : '等待选择角色')}</span>
                  </article>
                ))}
              </div>
            )}
            {teamLoadoutNotice && <p className={styles.teamLoadoutNotice}>{teamLoadoutNotice}</p>}
          </div>
          <button
            type="button"
            className={styles.startButton}
            disabled={Boolean(teamRoomId && !teamCanBeginRun && localCombatLocked)}
            onClick={() => {
              if (!teamRoomId || teamCanBeginRun) {
                beginTrainingRun()
                return
              }
              void claimTeamCombatRole(pendingTeamModelId)
            }}
          >
            <UserRound size={19} />
            {teamRoomId
              ? teamCanBeginRun ? `使用 ${playerModel.name} 进入组队调查` : localCombatLocked ? '已锁定，等待队友确认' : `确认锁定 ${pendingTeamModel.name}`
              : `使用 ${playerModel.name} 进入实训`}
          </button>
        </main>
        )}
        {renderTeamExitConfirm()}
      </section>
    )
  }

  return (
    <section
      ref={stageRef}
      className={`${styles.stage} ${styles[environment.stageClass]} ${playerFeedback === 'hit' ? styles.stageShake : ''}`}
      style={hudStyle}
      onMouseDown={handleStageMouseDown}
      onContextMenu={event => event.preventDefault()}
      aria-label="2D GMP 横版项目实训"
    >
      <header className={styles.hudTop}>
        <button
          type="button"
          onClick={requestTeamExit}
          aria-label="返回角色前置页"
        >
          <ArrowLeft size={18} />
        </button>
        <div className={styles.hudTitle}>
          <small>{project.curriculum} / {role.title}</small>
          <strong>{project.title}</strong>
        </div>
        <div className={styles.hudActions}>
          {teamRoomId && teamRoomOwner && (
            <button type="button" className={styles.teamBattleEndButton} onClick={onEndTeamBattle}>
              <DoorOpen size={15} />结束战斗
            </button>
          )}
          <div className={styles.timer}><Clock3 size={15} /><span>{formatCountdown(remainingTime)}</span></div>
        </div>
      </header>

      <div className={`${styles.brawlerViewport} ${isCastleChapter ? styles.chapterViewport : ''} ${isBossRushChapter ? styles.finalRushViewport : ''} ${isEndlessSurvival ? styles.endlessSurvivalViewport : ''}`}>
        {isEndlessSurvival && (
          <div
            className={styles.endlessFixedBackdrop}
            style={{
              '--final-rush-image': currentEndlessMapBackground ? `url("${currentEndlessMapBackground}")` : `url("${mapBackgroundUrl}")`,
            } as CSSProperties}
          />
        )}
        <div className={styles.parallaxBack} style={{ transform: `translate3d(${-cameraX * 0.18}px,0,0)` }} />
        <div className={styles.parallaxMid} style={{ transform: `translate3d(${-cameraX * 0.34}px,0,0)` }} />
        <div
          className={styles.brawlerWorld}
          style={{
            width: activeWorldWidth,
            transform: `translate3d(${-cameraX}px,0,0)`,
          }}
        >
          <StreetSet
            environment={environment}
            projectId={project.id}
            currentRoom={chapterRoom}
            hallCleared={hallGateOpen}
            dungeonGateOpen={dungeonGateOpen}
            finalChapterStage={currentFinalChapterStage}
            finalChapterScene={currentFinalChapterScene}
            finalChapterGateOpen={finalChapterGateOpen}
            endlessSurvival={isEndlessSurvival}
            endlessMapImage={currentEndlessMapBackground}
          />
          {activeStoryTask && (
            <StoryTaskMarker2d
              task={activeStoryTask}
              onOpen={() => openStoryOperation(activeStoryTask)}
            />
          )}
          {renderedEnemies.map(enemy => (
            <Enemy2d
              key={enemy.id}
              enemy={enemy}
              projectId={project.id}
              locked={enemy.kind === 'boss' && !bossUnlocked}
              targeted={attackTarget?.id === enemy.id}
            />
          ))}
          {groundSwordWaves.map(wave => (
            <GroundSwordWave2d key={wave.id} wave={wave} />
          ))}
          {projectiles.map(projectile => (
            <Projectile2d key={projectile.id} projectile={projectile} />
          ))}
          <Player2d
            player={player}
            model={playerModel}
            role={role}
            displayName={displayName}
            hp={playerHp}
            maxHp={playerMaxHp}
            stamina={playerStamina}
            maxStamina={playerMaxStamina}
            attackSignal={attackSignal}
            feedback={playerFeedback}
            entryActive={playerEntryActive}
            defeated={playerDowned || playerHp <= 0}
          />
          {remotePlayers.map(remote => (
            <RemotePlayer2d key={remote.userId} player={remote} />
          ))}
          {remotePlayers.map(remote => {
            const answering = remote.status === 'answering' && remote.activeQuiz
            const downed = remote.status === 'downed' || remote.hp <= 0
            if (!answering && !downed) return null
            const nearAnswer = answering && isCloseLane(remote.lane, player.lane) && Math.abs(remote.x - player.x) <= 185
            const nearDown = downed && isCloseLane(remote.lane, player.lane) && Math.abs(remote.x - player.x) <= 150
            const reviving = revivingRemoteId === remote.userId
            return (
              <div
                key={`team-action-${remote.userId}`}
                className={`${styles.teamActionBubble} ${answering ? styles.teamActionBubbleAnswering : styles.teamActionBubbleDowned} ${(nearAnswer || nearDown) ? styles.teamActionBubbleReady : ''}`}
                style={{
                  left: remote.x,
                  bottom: laneBottom(remote.lane) + 172,
                  zIndex: Math.round(122 + remote.lane * 20),
                }}
              >
                <strong>{remote.displayName}</strong>
                <span>{answering ? '正在答题' : reviving ? `扶起中 ${Math.round(reviveProgress * 100)}%` : '倒地'}</span>
                {reviving && <i style={{ width: `${Math.round(reviveProgress * 100)}%` }} />}
                {answering ? (
                  <button type="button" disabled={!nearAnswer || playerDowned} onClick={() => startAssistQuiz(remote)}>
                    <UserRound size={13} />F 协助
                  </button>
                ) : (
                  <button type="button" disabled={!nearDown || playerDowned || Boolean(revivingRemoteId)} onClick={() => void reviveRemotePlayer(remote)}>
                    <HeartPulse size={13} />F 扶起
                  </button>
                )}
              </div>
            )
          })}
          {supportAllies.map((allyName, index) => (
            <Ally2d key={allyName} player={player} allyName={allyName} model={allyModel} index={index} />
          ))}
          {moveClickMarker && (
            <div
              key={moveClickMarker.id}
              className={styles.moveClickMarker}
              style={{
                left: moveClickMarker.x,
                bottom: laneBottom(moveClickMarker.lane) + 4,
                zIndex: Math.round(24 + moveClickMarker.lane * 20),
              }}
            >
              <i />
            </div>
          )}
          {floatingTexts.map(item => (
            <div
              key={item.id}
              className={`${styles.floatingText} ${floatingTextClass(item.kind)}`}
              style={{
                left: item.x,
                bottom: laneBottom(item.lane) + 110,
                zIndex: Math.round(80 + item.lane * 20),
              }}
            >
              {item.text}
            </div>
          ))}
        </div>
      </div>

      <aside className={styles.leftHud}>
        <div className={`${styles.hpBlock} ${playerFeedback === 'hit' ? styles.hpBlockHit : ''} ${playerFeedback === 'heal' ? styles.hpBlockHeal : ''} ${playerHp <= 40 ? styles.hpBlockDanger : ''}`}>
          <label><HeartPulse size={15} />生命值<strong>{playerHp}/{playerMaxHp}</strong></label>
          <progress value={playerHp} max={playerMaxHp} />
        </div>
        {testMode && (
          <button
            type="button"
            className={`${styles.testInvincibleButton} ${testInvincible ? styles.testInvincibleActive : ''}`}
            onClick={toggleTestInvincible}
            aria-pressed={testInvincible}
          >
            <ShieldCheck size={16} />
            <span>{testInvincible ? '无敌已开' : '开启无敌'}</span>
          </button>
        )}
        <div className={`${styles.weaponHud} ${styles.playerModelHud}`}>
          <i className={styles.modelPreviewSprite} style={playerPreviewSpriteStyle(playerModel, 86, 76, 0.48)} />
          <span>{playerModel.code}</span>
          <strong>{playerModel.name}</strong>
          <small>J / 左键处置 · 可打消前方弹药</small>
        </div>
        {!storyModeActive && <div className={styles.comboHud}>
          <Zap size={15} />
          <span>{critReady ? '暴击窗口已开启' : '答对题目可触发暴击'}</span>
        </div>}
        {teamRoomId && (
          <div className={styles.teamStatusList}>
            <header><Shield size={15} /><strong>队伍状态</strong><span>{remotePlayers.length + 1}/3</span></header>
            <article>
              <div><b>{displayName}（你）</b><small>{playerModel.name} · {role.title}</small></div>
              <strong>{playerHp}/{playerMaxHp}</strong>
              <progress value={playerHp} max={playerMaxHp} />
            </article>
            {remotePlayers.length ? remotePlayers.map(remote => {
              const model = playerModelById(remote.modelId)
              const remoteMaxHp = playerModelCombatStats(model.id).hp
              const status = remote.status === 'downed' || remote.hp <= 0 ? '倒地' : remote.status === 'answering' ? '答题中' : '协同中'
              return (
                <article key={remote.userId}>
                  <div><b>{remote.displayName}</b><small>{model.name} · {status}</small></div>
                  <strong>{remote.hp}/{remoteMaxHp}</strong>
                  <progress value={remote.hp} max={remoteMaxHp} />
                </article>
              )
            }) : <p>等待队友进入战斗</p>}
          </div>
        )}
        {!teamRoomId && supportAllies.length > 0 && (
          <div className={styles.allyHud}>
            <Shield size={15} />
            <span>{supportAllies.join('、')} 支援中</span>
            <small>{supportAllies.length} 名队友协同作战</small>
          </div>
        )}
        <div className={styles.itemBelt} aria-label="战斗道具快捷栏">
          {(['heal', 'boost', 'skip'] as GameItemId[]).map(item => {
            const meta = itemMeta(item)
            const disabled = itemCounts[item] < 1 || (item === 'heal' && playerHp >= playerMaxHp) || (item === 'skip' && !activeQuiz)
            return (
              <button type="button" key={item} disabled={disabled} onClick={() => useGameItem(item)}>
                {item === 'heal' ? <HeartPulse size={16} /> : item === 'boost' ? <Zap size={16} /> : <PackageOpen size={16} />}
                <span>{meta.title}</span>
                <kbd>{meta.key ?? '点击'}</kbd>
                <b>x{itemCounts[item]}</b>
              </button>
            )
          })}
          {boostAttacks > 0 && <small className={styles.boostStatus}>增幅剩余 {boostAttacks} 次</small>}
        </div>
      </aside>

      <aside className={`${styles.rightHud} ${storyModeActive ? styles.storyRightHud : ''}`}>
        {storyModeActive && (
          <>
            <div className={styles.storyTaskBoard}>
              <header>
                <span>{STORY_ROOM_LABELS[chapterRoom]}任务</span>
                <strong>{storyProgressValue}/{storyProgressMax}</strong>
              </header>
              <div>
                {storyTasks.map(task => {
                  const done = storyTaskCompletedSet.has(task.id)
                  const active = activeStoryTask?.id === task.id
                  const roomLocked = chapterRoomOrder(task.room) > chapterRoomOrder(chapterRoom)
                  return (
                    <article key={task.id} className={`${done ? styles.storyTaskDone : ''} ${active ? styles.storyTaskActive : ''} ${roomLocked ? styles.storyTaskLocked : ''}`}>
                      <Check size={13} />
                      <div>
                        <b>{task.title}</b>
                        <small>{done ? '已完成' : active ? task.clue : STORY_ROOM_LABELS[task.room]}</small>
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
            <div key={storyNarration?.id ?? 'story-narration-fallback'} className={styles.storyNarrationToast}>
              {storyNarrationSpeaker ? (
                <div className={styles.storyNarrationSpeaker}>
                  <img src={storyNarrationSpeaker.portrait} alt="" draggable={false} />
                  <div>
                    <p className={styles.eyebrow}>{storyNarrationSpeaker.speaker} · 现场提示</p>
                    <h2>{storyNarration?.title ?? '等待现场线索'}</h2>
                    <span>{storyNarrationSpeaker.title}</span>
                  </div>
                </div>
              ) : (
                <>
                  <p className={styles.eyebrow}>现场提示</p>
                  <h2>等待现场线索</h2>
                </>
              )}
              <p className={styles.storyNarrationLine}>{storyNarrationText}</p>
            </div>
          </>
        )}
        {!storyModeActive && (
          <>
        {isBossRushChapter && finalChapterNarration && (
          <div className={styles.storyNarrationToast}>
            <div className={styles.finalChapterNarrationHead}>
              <p className={styles.eyebrow}>{isEndlessSurvival ? `无尽试炼 · 第 ${currentFinalChapterStage} 层` : `最终章剧情 · ${currentFinalChapterStage}/${FINAL_CHAPTER_STAGE_COUNT}`}</p>
            </div>
            <h2>{finalChapterNarration.title}</h2>
            <p className={styles.storyNarrationLine}>{finalChapterNarration.line}</p>
          </div>
        )}
        <div className={styles.objectiveCard}>
          <p className={styles.eyebrow}>当前指引</p>
          <h2>{message}</h2>
          {canSkipCurrentFinalStage && (
            <button type="button" className={styles.objectiveSkipButton} onClick={skipCurrentFinalChapterStage}>
              <DoorOpen size={14} />跳过本关
            </button>
          )}
          <progress value={progressValue} max={progressMax} />
          <span>{isEndlessSurvival ? `第 ${currentFinalChapterStage} 层 · 奖励 ${endlessStats.coins} 金币 / ${endlessStats.gems} 钻石 · ` : isBossRushChapter ? `第 ${currentFinalChapterStage}/${FINAL_CHAPTER_STAGE_COUNT} 关 · ` : ''}{progressValue}/{progressMax} 目标清理 · {movementModeLabel(movementMode)}</span>
        </div>
        <div className={styles.controlStrip}>
          <span><kbd>A</kbd><kbd>D</kbd>移动</span>
          <span><kbd>W</kbd><kbd>S</kbd>换道</span>
          <span><kbd>Shift</kbd>冲刺</span>
          <span><kbd>Shift</kbd><kbd>Shift</kbd>翻滚</span>
          <span><kbd>J</kbd>处置/打消弹药</span>
          <span><kbd>E</kbd>商店</span>
          <span><kbd>F</kbd>协助答题/扶起队友</span>
          <span>核验完成后答题</span>
          <span><MousePointerClick size={14} />左键</span>
        </div>
          </>
        )}
        <button
          type="button"
          className={styles.backpackButton}
          onClick={() => {
            setInventoryOpen(true)
            playSfx('inventory')
          }}
        >
          <Backpack size={17} />
          <span>背包</span>
          <kbd>B</kbd>
        </button>
      </aside>

      {storyModeActive && (canSkipCurrentChapterRoom || canSkipCurrentChapterBoss) && (
        <button
          type="button"
          className={`${styles.chapterSkipButton} ${styles.chapterSkipFloatingButton}`}
          onClick={canSkipCurrentChapterBoss ? skipCurrentChapterBoss : skipCurrentChapterRoom}
        >
          <DoorOpen size={14} />{canSkipCurrentChapterBoss ? '跳过 Boss' : '跳过本场'}
        </button>
      )}

      {battleIntroTestSkipAvailable && (
        <button
          type="button"
          className={`${styles.chapterSkipButton} ${styles.chapterSkipFloatingButton} ${styles.storyDialogueSkipFloatingButton}`}
          onClick={() => skipBattleIntro(true)}
          aria-label="跳过当前剧情对话"
          title="跳过当前剧情对话"
        >
          <DoorOpen size={14} />跳过剧情
        </button>
      )}

      {battleIntroActive && activeBattleIntroLine && (
        <StoryCinematicOverlay
          projectTitle={project.title}
          roundTitle={activeStoryRound?.title ?? STORY_ROOM_LABELS[chapterRoom]}
          bossName={project.bossName}
          bossTitle={project.bossTitle}
          bossPortrait={cinematicBossFrameImage(project.id)}
          bossPortraitPosition="center bottom"
          bossFace={cinematicBossFrameFace(project.id)}
          line={activeBattleIntroLine}
          lines={battleIntroLines}
          lineIndex={battleIntroLineIndex}
          totalLines={battleIntroLines.length}
          displayedText={battleIntroDisplayedText}
          textComplete={battleIntroTextComplete}
          lineComplete={battleIntroLineComplete}
          speechPending={battleIntroSpeechPending}
          onChoose={chooseBattleIntroChoice}
          onNext={advanceBattleIntro}
          onSkip={skipBattleIntro}
          canSkip={battleIntroSkipAvailable}
          canAdvanceLine={canManuallyAdvanceBattleIntro}
          waitingForTeam={storyDialogueWaitingForTeam}
          teamReadyCount={storyDialogueReadyCount}
          teamExpectedCount={storyDialogueExpectedCount}
        />
      )}

      {inventoryOpen && (
        <GameBackpack
          role={role}
          selectedPlayerModelId={selectedPlayerModelId}
          itemCounts={itemCounts}
          boostAttacks={boostAttacks}
          coins={coins}
          gems={gems}
          unlockedPlayerModelIds={Array.from(unlockedPlayerModelSet)}
          modelSelectionLocked={started}
          onSelectModel={setSelectedPlayerModelId}
          onUseItem={useGameItem}
          onClose={() => {
            setInventoryOpen(false)
            playSfx('inventory')
          }}
        />
      )}

      {attackTarget && !activeQuiz && !storyModeActive && (
        <div className={`${styles.targetHint} ${quizReadyTarget ? styles.targetHintReady : ''}`}>
          <strong>{attackTarget.title}</strong>
          <span>{quizReadyTarget ? '质量判断即将出现' : `手动处置进度 ${attackTarget.quizCharge}/${attackTarget.quizEvery}`}</span>
        </div>
      )}

      {playerDowned && (
        <div className={styles.teamDownedBanner}>
          <HeartPulse size={18} />
          <strong>你已倒地</strong>
        </div>
      )}

      {renderTeamExitConfirm()}
      {renderSinglePlayerPauseOverlay()}

      {storyOperationTask && storyOperationScenario && (
        <StoryOperationPanel
          task={storyOperationTask}
          scenario={storyOperationScenario}
          selectedTools={storyOperationTools}
          selectedAnswer={storyOperationAnswer}
          feedback={storyOperationFeedback}
          onToggleTool={toggleStoryOperationTool}
          onSelectAnswer={answerId => {
            setStoryOperationAnswer(answerId)
            setStoryOperationFeedback('')
          }}
          onSubmit={submitStoryOperation}
          onClose={closeStoryOperation}
        />
      )}

      {activeQuiz && activeQuestion && (
        <section className={styles.quizScrim} role="dialog" aria-modal="true" aria-labelledby="game2d-quiz-title">
          <div className={styles.quizPanel}>
            <div className={styles.quizHeader}>
              <span>{questionLabel(activeQuestion.kind)} / {activeQuestion.chapter}</span>
              <strong id="game2d-quiz-title">{activeQuiz.prompt}</strong>
            </div>
            <h2>{activeQuestion.choicePrompt ?? activeQuestion.stem}</h2>
            {activeQuestion.choicePrompt && <p>{activeQuestion.stem}</p>}
            <div className={styles.quizOptions}>
              {activeQuestion.options.map(option => {
                const selectedOrder = answers.indexOf(option.id)
                return (
                  <button
                    type="button"
                    key={option.id}
                    className={selectedOrder >= 0 ? styles.quizOptionSelected : ''}
                    onClick={() => chooseAnswer(option.id)}
                    aria-pressed={selectedOrder >= 0}
                  >
                    <strong>{activeQuestion.kind === 'sequence' && selectedOrder >= 0 ? selectedOrder + 1 : option.id}</strong>
                    <span>{option.label}</span>
                  </button>
                )
              })}
            </div>
            <div className={styles.quizInsight}>
              <Award size={16} />
              <span>{activeQuestion.insight}</span>
            </div>
            <button type="button" className={styles.quizSubmit} disabled={!answers.length} onClick={submitQuiz}>
              提交判断，结算本次处置 <Zap size={17} />
            </button>
            <button type="button" className={styles.quizSkipItem} disabled={itemCounts.skip < 1} onClick={() => useGameItem('skip')}>
              <PackageOpen size={16} />
              使用跳题卡
              <span>R · x{itemCounts.skip}</span>
            </button>
          </div>
        </section>
      )}

      {assistQuiz && (
        <section className={styles.quizScrim} role="dialog" aria-modal="true" aria-labelledby="team-assist-quiz-title">
          <div className={`${styles.quizPanel} ${styles.teamAssistQuizPanel}`}>
            <div className={styles.quizHeader}>
              <span>TEAM ASSIST / {questionLabel(assistQuiz.question.kind)}</span>
              <strong id="team-assist-quiz-title">协助队友完成质量判断</strong>
            </div>
            <h2>{assistQuiz.question.choicePrompt ?? assistQuiz.question.stem}</h2>
            {assistQuiz.question.choicePrompt && <p>{assistQuiz.question.stem}</p>}
            <div className={styles.quizOptions}>
              {assistQuiz.question.options.map(option => {
                const selectedOrder = assistAnswers.indexOf(option.id)
                return (
                  <button
                    type="button"
                    key={option.id}
                    className={selectedOrder >= 0 ? styles.quizOptionSelected : ''}
                    onClick={() => chooseAssistAnswer(option.id)}
                    aria-pressed={selectedOrder >= 0}
                  >
                    <strong>{assistQuiz.question.kind === 'sequence' && selectedOrder >= 0 ? selectedOrder + 1 : option.id}</strong>
                    <span>{option.label}</span>
                  </button>
                )
              })}
            </div>
            <div className={styles.quizInsight}>
              <Award size={16} />
              <span>{assistQuiz.question.insight}</span>
            </div>
            <button type="button" className={styles.quizSubmit} disabled={!assistAnswers.length} onClick={submitAssistQuiz}>
              提交协助判断 <Zap size={17} />
            </button>
            <button type="button" className={styles.quizSkipItem} onClick={() => { setAssistQuiz(null); setAssistAnswers([]) }}>
              <X size={16} />暂不协助
            </button>
          </div>
        </section>
      )}
    </section>
  )
}

function StoryCinematicOverlay({
  projectTitle,
  roundTitle,
  bossName,
  bossTitle,
  bossPortrait,
  bossPortraitPosition,
  bossFace,
  line,
  lines,
  lineIndex,
  totalLines,
  displayedText,
  textComplete,
  lineComplete,
  speechPending,
  onChoose,
  onNext,
  onSkip,
  canSkip,
  canAdvanceLine,
  waitingForTeam,
  teamReadyCount,
  teamExpectedCount,
}: {
  projectTitle: string
  roundTitle: string
  bossName: string
  bossTitle: string
  bossPortrait: string
  bossPortraitPosition: string
  bossFace: number
  line: StoryIntroLine
  lines: StoryIntroLine[]
  lineIndex: number
  totalLines: number
  displayedText: string
  textComplete: boolean
  lineComplete: boolean
  speechPending: boolean
  onChoose: (choice: StoryDialogueChoice) => void
  onNext: () => void
  onSkip: () => void
  canSkip: boolean
  canAdvanceLine: boolean
  waitingForTeam: boolean
  teamReadyCount: number
  teamExpectedCount: number
}) {
  const activeSide = line.side
  const findSideSpeaker = (side: StoryActorSide) => {
    if (line.side === side) return line
    const before = lines.slice(0, lineIndex + 1).reverse().find(item => item.side === side)
    const after = lines.slice(lineIndex + 1).find(item => item.side === side)
    return before ?? after ?? line
  }
  const leftSpeaker = findSideSpeaker('left')
  const rightSpeaker = findSideSpeaker('right')
  const rightIsBoss = rightSpeaker.actor === 'boss'
  const waitingForChoice = Boolean(lineComplete && line.choices?.length)
  const leftPortraitStyle = { '--story-portrait-position': leftSpeaker.portraitPosition } as CSSProperties
  const rightPortraitStyle = {
    '--story-portrait-position': rightIsBoss ? bossPortraitPosition : rightSpeaker.portraitPosition,
    '--story-boss-face': bossFace,
  } as CSSProperties
  const skipHint = '跳过已完整观看过的剧情'
  const skipDisabled = waitingForTeam
  const dialogInteractive = !waitingForChoice && canAdvanceLine && !waitingForTeam
  const footerHint = waitingForChoice
    ? '\u9009\u62e9\u4e00\u53e5\u56de\u5e94\u7ee7\u7eed\u5267\u60c5'
    : waitingForTeam
      ? `\u7b49\u5f85\u961f\u53cb ${teamReadyCount}/${teamExpectedCount}`
      : speechPending
        ? textComplete ? '旁白播放中，播完后点击进入下一段' : '旁白播放中，可点击显示完整台词'
      : lineComplete
        ? '点击进入下一段'
        : '点击显示完整台词'

  return (
    <section
      className={styles.storyCinematicScrim}
      role="dialog"
      aria-modal="true"
      aria-label="剧情对话"
      onMouseDown={event => event.stopPropagation()}
    >
      <div className={styles.storyCinematicTop}>
        <strong>[主线] {projectTitle}<span>{roundTitle}</span></strong>
        {canSkip && (
          <button type="button" onClick={onSkip} disabled={skipDisabled} aria-label={skipHint} title={skipHint}>
            跳过 <X size={16} />
          </button>
        )}
      </div>

      <div className={styles.storyCinematicActors} aria-hidden="true">
        <figure
          key={`left-${leftSpeaker.actor}-${lineIndex}`}
          className={`${styles.storyCinematicActor} ${activeSide === 'left' ? styles.storyCinematicActorActive : styles.storyCinematicActorMuted}`}
        >
          <div className={styles.storyCinematicPortraitStage}>
            <img
              key={`left-portrait-${leftSpeaker.actor}-${lineIndex}`}
              className={styles.storyCinematicPortraitImage}
              src={leftSpeaker.portrait}
              alt=""
              draggable={false}
              style={leftPortraitStyle}
            />
          </div>
          <figcaption>
            <b>{leftSpeaker.speaker}</b>
            <span>{leftSpeaker.title}</span>
          </figcaption>
        </figure>

        <figure
          key={`right-${rightSpeaker.actor}-${lineIndex}`}
          className={`${styles.storyCinematicBoss} ${!rightIsBoss ? styles.storyCinematicRightPerson : ''} ${activeSide === 'right' ? styles.storyCinematicBossActive : styles.storyCinematicBossMuted}`}
        >
          <div className={styles.storyCinematicBossPortraitStage}>
            <img
              className={rightIsBoss ? styles.storyCinematicBossImage : styles.storyCinematicPortraitImage}
              src={rightIsBoss ? bossPortrait : rightSpeaker.portrait}
              alt=""
              draggable={false}
              style={rightPortraitStyle}
            />
          </div>
          <figcaption>
            <b>{rightIsBoss ? bossName : rightSpeaker.speaker}</b>
            <span>{rightIsBoss ? bossTitle : rightSpeaker.title}</span>
          </figcaption>
        </figure>
      </div>

      <div
        className={`${styles.storyCinematicDialog} ${line.actor === 'boss' ? styles.storyCinematicDialogBoss : ''} ${waitingForChoice ? styles.storyCinematicDialogChoice : ''}`}
        role={dialogInteractive ? 'button' : undefined}
        tabIndex={dialogInteractive ? 0 : undefined}
        onClick={dialogInteractive ? onNext : undefined}
        onKeyDown={event => {
          if (!dialogInteractive) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onNext()
          }
        }}
      >
        <header>
          <div>
            <strong>{line.speaker}</strong>
            <span>{line.title}</span>
          </div>
          <em>{lineIndex + 1}/{totalLines}</em>
        </header>
        {(line.line.trim() || !waitingForChoice) && (
          <p>
            {displayedText}
            {!textComplete && <i className={styles.storyCinematicCursor} />}
          </p>
        )}
        {waitingForChoice && line.choices && (
          <div className={styles.storyCinematicChoices} aria-label="选择你的回应">
            {line.choices.map(choice => (
              <button type="button" key={choice.id} onClick={() => onChoose(choice)}>
                <b>{choice.label}</b>
                <span>{choice.line}</span>
              </button>
            ))}
          </div>
        )}
        <footer>
          <span>{footerHint}</span>
          <b aria-hidden="true">›</b>
        </footer>
      </div>
    </section>
  )
}

function GameBackpack({
  role,
  selectedPlayerModelId,
  itemCounts,
  boostAttacks,
  coins,
  gems,
  unlockedPlayerModelIds,
  modelSelectionLocked,
  onSelectModel,
  onUseItem,
  onClose,
}: {
  role: Role2d
  selectedPlayerModelId: PlayerModelId
  itemCounts: Record<GameItemId, number>
  boostAttacks: number
  coins: number
  gems: number
  unlockedPlayerModelIds: PlayerModelId[]
  modelSelectionLocked?: boolean
  onSelectModel: (modelId: PlayerModelId) => void
  onUseItem: (item: GameItemId) => void
  onClose: () => void
}) {
  const activeModel = playerModelById(selectedPlayerModelId)
  const supplyCount = itemCounts.heal + itemCounts.boost + itemCounts.skip
  const unlockedModels = new Set<PlayerModelId>([DEFAULT_PLAYER_MODEL_ID, ...unlockedPlayerModelIds])

  return (
    <section className={styles.backpackScrim} role="dialog" aria-modal="true" aria-label="角色与训练补给" onMouseDown={onClose}>
      <div className={`${styles.backpackPanel} ${styles.backpackModelPanel}`} onMouseDown={event => event.stopPropagation()}>
        <header className={styles.backpackHeader}>
          <div className={styles.backpackHeaderMeta}>
            <span>角色模型</span>
            <strong>{unlockedModels.size}<small>/{PLAYER_MODELS.length}</small></strong>
          </div>
          <div className={styles.backpackTitle}>
            <UserRound size={19} />
            <strong>角色与补给</strong>
          </div>
          <div className={styles.backpackResources}>
            <span><Coins size={15} />{coins.toLocaleString()}</span>
            <span><Gem size={15} />{gems.toLocaleString()}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭背包"><X size={18} /></button>
        </header>
        <div className={styles.backpackBody}>
          <aside className={`${styles.backpackLoadout} ${styles.backpackModelLoadout}`}>
            <div className={styles.backpackCharacter}>
              <span className={styles.characterClass}>{activeModel.code} · {activeModel.tagline}</span>
              <div className={styles.backpackModelStage}>
                <i className={styles.modelPreviewSprite} style={playerPreviewSpriteStyle(activeModel, 250, 190, 1.5)} />
              </div>
              <div className={styles.characterPlatform} />
              <div className={styles.characterPlate}>
                <span>当前角色</span>
                <strong>{activeModel.name}</strong>
                <small>{role.title} · {activeModel.specialty}</small>
              </div>
            </div>
            <div className={styles.backpackModelOptions}>
              {PLAYER_MODELS.map(model => {
                const active = model.id === activeModel.id
                const unlocked = unlockedModels.has(model.id)
                return (
                  <button
                    type="button"
                    key={model.id}
                    className={`${active ? styles.backpackModelActive : ''} ${!unlocked ? styles.backpackModelLocked : ''}`}
                    style={{ '--model-accent': model.accent } as CSSProperties}
                    disabled={modelSelectionLocked || !unlocked}
                    title={!unlocked ? '商店解锁后可用' : modelSelectionLocked ? '实训进行中不能切换角色' : undefined}
                    onClick={() => {
                      if (!modelSelectionLocked && unlocked) onSelectModel(model.id)
                    }}
                    aria-pressed={active}
                  >
                    <i className={styles.modelPreviewSprite} style={playerPreviewSpriteStyle(model, 86, 68, 0.52)} />
                    <span>{model.name}</span>
                    <small>{active ? '使用中' : unlocked ? '切换' : '未解锁'}</small>
                  </button>
                )
              })}
            </div>
          </aside>
          <section className={styles.backpackStorage}>
            <div className={styles.backpackStorageTitle}>
              <div><PackageOpen size={18} /><strong>训练补给</strong><span>武器系统已停用，点击道具直接使用</span></div>
              <b>{supplyCount} 件</b>
            </div>
            <div className={styles.backpackSupplyGrid}>
              {(['heal', 'boost', 'skip'] as GameItemId[]).map(item => {
                const meta = itemMeta(item)
                return (
                  <button type="button" key={item} disabled={itemCounts[item] < 1} onClick={() => onUseItem(item)}>
                    <span>{item === 'heal' ? <HeartPulse size={24} /> : item === 'boost' ? <Zap size={24} /> : <PackageOpen size={24} />}</span>
                    <div>
                      <small>{meta.key ? `${meta.key} · ` : ''}库存 x{itemCounts[item]}</small>
                      <strong>{meta.title}</strong>
                      <p>{meta.detail}</p>
                    </div>
                  </button>
                )
              })}
              <article className={styles.backpackControlNote}>
                <p className={styles.eyebrow}>MANUAL CONTROL</p>
                <strong>自动攻击已关闭</strong>
                <span>靠近缺陷后使用 J / 左键手动处置；面向来弹时可用 J / 左键打消弹药。移动和翻滚不会触发攻击。</span>
                {boostAttacks > 0 && <em>当前增幅剩余 {boostAttacks} 次</em>}
              </article>
            </div>
          </section>
        </div>
      </div>
    </section>
  )
}

function chapterRoomStyle(projectId: number, room: ChapterRoomKind): CSSProperties {
  const chapterId = clamp(projectId, 1, 11)
  const chapterDoorClosed = chapterId >= 4 ? `/simulation/doors/chapter-${chapterId}-door-closed.png` : '/simulation/doors/chapter-door-closed.png'
  const chapterDoorOpen = chapterId >= 4 ? `/simulation/doors/chapter-${chapterId}-door-open.png` : '/simulation/doors/chapter-door-open.png'
  return {
    left: 0,
    width: chapterRoomWidthForProject(projectId),
    '--chapter-room-image': `url("/simulation/chapter-scenes/chapter-${chapterId}/${room}.png")`,
    '--chapter-road-image': `url("/simulation/chapter-scenes/chapter-${chapterId}/${room}-road.png")`,
    '--chapter-door-closed': `url("${chapterDoorClosed}")`,
    '--chapter-door-open': `url("${chapterDoorOpen}")`,
  } as CSSProperties
}

function chapterRoomClass(room: ChapterRoomKind) {
  if (room === 'hall') return styles.chapterHall
  if (room === 'corridor') return styles.chapterCorridor
  return styles.chapterDungeon
}

function StreetSet({
  environment,
  projectId,
  currentRoom,
  hallCleared,
  dungeonGateOpen,
  finalChapterStage = 1,
  finalChapterScene,
  finalChapterGateOpen = false,
  endlessSurvival = false,
  endlessMapImage,
}: {
  environment: EnvironmentTheme
  projectId: number
  currentRoom: ChapterRoomKind
  hallCleared: boolean
  dungeonGateOpen: boolean
  finalChapterStage?: number
  finalChapterScene?: SceneDefect
  finalChapterGateOpen?: boolean
  endlessSurvival?: boolean
  endlessMapImage?: string
}) {
  if (isBossRushProjectId(projectId)) {
    const resolvedStageLabel = endlessSurvival
      ? `第 ${finalChapterStage} 层`
      : finalChapterStage >= FINAL_CHAPTER_STAGE_COUNT ? '第 11 关' : `第 ${finalChapterStage} 关`
    const resolvedGateLabel = endlessSurvival
      ? finalChapterGateOpen ? `进入第 ${finalChapterStage + 1} 层` : `清理${resolvedStageLabel}后开启`
      : finalChapterGateOpen ? `进入第 ${finalChapterStage + 1} 关` : `清理${resolvedStageLabel}后开启`
    const resolvedStageTitle = endlessSurvival
      ? finalChapterScene?.title ?? '随机裂隙 Boss'
      : finalChapterStage >= FINAL_CHAPTER_STAGE_COUNT ? '体系终审官' : finalChapterScene?.title ?? '项目回溯'
    const stageLabel = finalChapterStage >= FINAL_CHAPTER_STAGE_COUNT ? '第 11 关' : `第 ${finalChapterStage} 关`
    const gateLabel = finalChapterGateOpen ? `进入第 ${finalChapterStage + 1} 关` : `清理${stageLabel}后开启`
    return (
      <>
        {!endlessSurvival && (
          <div
            className={styles.finalRushBackdrop}
            style={{
              width: FINAL_CHAPTER_STAGE_WIDTH,
              '--final-rush-image': 'url("/simulation/chapter-scenes/chapter-11/dungeon.png")',
            } as CSSProperties}
          />
        )}
        <div
          className={`${styles.finalRushRoad} ${endlessSurvival ? styles.endlessRushRoad : ''}`}
          style={{
            width: FINAL_CHAPTER_STAGE_WIDTH,
            '--final-rush-road-image': 'url("/simulation/chapter-scenes/chapter-11/dungeon-road.png")',
          } as CSSProperties}
        />
        <div className={styles.streetLane} style={{ bottom: laneBottom(0) - 12 }} />
        <div className={styles.streetLane} style={{ bottom: laneBottom(1) - 12 }} />
        <div className={styles.streetLane} style={{ bottom: laneBottom(2) - 12 }} />
        <div
          className={`${styles.finalRushGate} ${!endlessSurvival && finalChapterStage >= FINAL_CHAPTER_STAGE_COUNT ? styles.finalRushLastGate : ''}`}
          style={{ left: FINAL_CHAPTER_STAGE_BOSS_X }}
        >
          <span>{resolvedStageLabel}</span>
          <strong>{resolvedStageTitle}</strong>
        </div>
        {(endlessSurvival || finalChapterStage < FINAL_CHAPTER_STAGE_COUNT) && (
          <div
            className={`${styles.chapterGate} ${finalChapterGateOpen ? styles.chapterGateOpen : styles.chapterGateLocked}`}
            style={{ left: FINAL_CHAPTER_GATE_RENDER_X }}
          >
            <span>{resolvedGateLabel}</span>
          </div>
        )}
      </>
    )
  }

  if (isChapterRoomProjectId(projectId)) {
    const exitOpen = currentRoom === 'hall' ? hallCleared : currentRoom === 'corridor' ? dungeonGateOpen : false
    const exitLabel = currentRoom === 'hall'
      ? hallCleared ? '第二场景入口已开启' : '完成第一场景调查后开启'
      : dungeonGateOpen ? '第三场景入口已开启' : '完成第二场景调查后开启'
    return (
      <>
        <div className={`${styles.chapterRoomBackdrop} ${chapterRoomClass(currentRoom)}`} style={chapterRoomStyle(projectId, currentRoom)} />
        <div className={styles.chapterAtmosphere} />
        <div className={styles.chapterRoad} style={chapterRoomStyle(projectId, currentRoom)} />
        <div className={styles.streetLane} style={{ bottom: laneBottom(0) - 12 }} />
        <div className={styles.streetLane} style={{ bottom: laneBottom(1) - 12 }} />
        <div className={styles.streetLane} style={{ bottom: laneBottom(2) - 12 }} />
        {currentRoom !== 'dungeon' && (
          <div
            className={`${styles.chapterGate} ${exitOpen ? styles.chapterGateOpen : styles.chapterGateLocked}`}
            style={{ left: chapterGateRenderX(projectId) }}
          >
            <span>{exitLabel}</span>
          </div>
        )}
        {currentRoom === 'dungeon' && (
          <>
            <div
              className={styles.poisonWater}
              style={{ left: POISON_START_X, width: POISON_END_X - POISON_START_X }}
            >
              <span>毒水区</span>
            </div>
            <div className={styles.chapterBossMarker} style={{ left: chapterRoomWidthForProject(projectId) - 760 }}>
              <span>最终挑战</span>
            </div>
          </>
        )}
      </>
    )
  }

  const landmarks = stageLandmarksFor(environment.key)
  return (
    <>
      <div className={styles.streetRoad} />
      <div className={styles.streetLane} style={{ bottom: laneBottom(0) - 12 }} />
      <div className={styles.streetLane} style={{ bottom: laneBottom(1) - 12 }} />
      <div className={styles.streetLane} style={{ bottom: laneBottom(2) - 12 }} />
      {landmarks.map(landmark => (
        <div key={`${landmark.kind}-${landmark.x}`} className={`${styles.stageLandmark} ${stageLandmarkClass(landmark.kind)}`} style={{ left: landmark.x }}>
          <i />
          <strong>{landmark.label}</strong>
        </div>
      ))}
      {[260, 720, 1240, 1780, 2360, 2920, 3560, 4200, 4860, 5360].map((x, index) => (
        <div key={x} className={styles.streetSign} style={{ left: x }}>
          <span>{environment.signs[index] ?? 'GMP'}</span>
        </div>
      ))}
      {[420, 1040, 1640, 2240, 2840, 3420, 4040, 4680, 5260].map(x => (
        <div key={x} className={styles.streetProp} style={{ left: x }}>
          <i />
          <i />
        </div>
      ))}
    </>
  )
}

function stageLandmarksFor(key: EnvironmentKey) {
  const shared = [{ x: 5100, label: 'BOSS GATE', kind: 'gate' as const }]
  const byKey: Record<EnvironmentKey, Array<{ x: number; label: string; kind: 'tower' | 'clean' | 'lab' | 'cold' | 'gate' | 'vault' }>> = {
    castle: [{ x: 920, label: 'CQA TOWER', kind: 'tower' }, { x: 3180, label: 'STONE HALL', kind: 'gate' }, ...shared],
    cleaning: [{ x: 860, label: 'CLEAN BAY', kind: 'clean' }, { x: 3020, label: 'RINSE LINE', kind: 'clean' }, ...shared],
    audit: [{ x: 900, label: 'MAH ARCHIVE', kind: 'vault' }, { x: 3180, label: 'QA GATE', kind: 'gate' }, ...shared],
    cold: [{ x: 840, label: 'TEMP HUB', kind: 'cold' }, { x: 3180, label: 'COLD ROOM', kind: 'cold' }, ...shared],
    fortress: [{ x: 900, label: 'URS KEEP', kind: 'tower' }, { x: 3180, label: 'CSV GATE', kind: 'gate' }, ...shared],
    lab: [{ x: 860, label: 'DATA LAB', kind: 'lab' }, { x: 3040, label: 'RAW VAULT', kind: 'vault' }, ...shared],
    capa: [{ x: 900, label: 'ROOT COURT', kind: 'vault' }, { x: 3180, label: 'CAPA LOOP', kind: 'gate' }, ...shared],
    aseptic: [{ x: 900, label: 'GRADE A', kind: 'clean' }, { x: 3200, label: 'MEDIA FILL', kind: 'lab' }, ...shared],
    hvac: [{ x: 900, label: 'AIR TOWER', kind: 'cold' }, { x: 3200, label: 'DP GATE', kind: 'gate' }, ...shared],
    change: [{ x: 900, label: 'IMPACT BOARD', kind: 'vault' }, { x: 3200, label: 'TECH PASS', kind: 'gate' }, ...shared],
    final: [{ x: 760, label: 'QMS CASTLE', kind: 'tower' }, { x: 3000, label: 'RISK COURT', kind: 'vault' }, ...shared],
  }
  return byKey[key]
}

function stageLandmarkClass(kind: 'tower' | 'clean' | 'lab' | 'cold' | 'gate' | 'vault') {
  const classes = {
    tower: styles.landmarkTower,
    clean: styles.landmarkClean,
    lab: styles.landmarkLab,
    cold: styles.landmarkCold,
    gate: styles.landmarkGate,
    vault: styles.landmarkVault,
  }
  return classes[kind]
}

function playerEntryClass(modelId: PlayerModelId) {
  switch (modelId) {
    case 'knight2':
      return styles.playerEntryKnight2
    case 'sprite-hero':
      return styles.playerEntrySpriteHero
    case 'black-knight':
      return styles.playerEntryBlackKnight
    case 'demon-warrior':
      return styles.playerEntryDemonWarrior
    default:
      return styles.playerEntryKnightHero
  }
}

function Player2d({
  player,
  model,
  role,
  displayName,
  hp,
  maxHp,
  stamina,
  maxStamina,
  attackSignal,
  feedback,
  entryActive,
  defeated,
}: {
  player: FighterState
  model: PlayerModel
  role: Role2d
  displayName: string
  hp: number
  maxHp: number
  stamina: number
  maxStamina: number
  attackSignal: AttackSignal | null
  feedback: PlayerFeedback
  entryActive: boolean
  defeated: boolean
}) {
  const rolling = player.rollingUntil > performance.now()
  const animation: PlayerAnimation = defeated
    ? 'death'
    : feedback === 'hit'
    ? 'hurt'
    : attackSignal
      ? attackSignal.animation
        : rolling
          ? 'roll'
          : player.moving
            ? 'run'
            : 'idle'
  const spriteStyle = {
    ...playerSpriteStyle(model, animation, 1, attackSignal ? {
      startFrame: attackSignal.frameStart,
      frameCount: attackSignal.frameCount,
      duration: attackSignal.duration,
    } : {}),
    ...(attackSignal && !defeated ? { '--player-animation-duration': `${attackSignal.duration}ms` } : {}),
  } as CSSProperties
  const animationKey = attackSignal?.sequence ?? (rolling ? Math.round(player.rollingUntil) : 0)
  const entryClass = entryActive && !defeated ? `${styles.playerEntryActive} ${playerEntryClass(model.id)}` : ''
  return (
    <div
      className={`${styles.playerEntity} ${player.moving ? styles.entityRun : ''} ${rolling ? styles.entityRoll : ''} ${attackSignal ? styles.entityAttack : ''} ${feedback === 'hit' ? styles.playerHit : ''} ${feedback === 'heal' ? styles.playerHeal : ''} ${entryClass}`}
      style={{
        left: player.x,
        bottom: laneBottom(player.lane),
        zIndex: Math.round(30 + player.lane * 20),
        '--face': player.facing,
        '--accent': model.accent,
        '--player-roll-duration': `${model.durations?.roll ?? DEFAULT_ROLL_DURATION_MS}ms`,
      } as CSSProperties}
    >
      <strong className={styles.playerNameTag}>{displayName}</strong>
      <span className={styles.playerHpTag}>
        <i style={{ width: `${Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100)))}%` }} />
        <em>{hp}/{maxHp}</em>
      </span>
      <span className={styles.playerStaminaTag} aria-hidden="true">
        <i style={{ width: `${Math.max(0, Math.min(100, Math.round((stamina / maxStamina) * 100)))}%` }} />
      </span>
      <strong className={styles.playerRoleTag}>{model.name} · {role.title}</strong>
      <div className={styles.entityShadow} />
      {feedback === 'heal' && !defeated && <i className={styles.playerHealEffect} />}
      <div key={`${model.id}-${animation}-${animationKey}`} className={styles.playerSprite} style={spriteStyle} />
    </div>
  )
}

function Ally2d({ player, allyName, model, index }: { player: FighterState; allyName: string; model: PlayerModel; index: number }) {
  const allyLane = clamp(player.lane + 0.08 + index * 0.08, 0, 2)
  const animation: PlayerAnimation = player.moving ? 'run' : 'idle'
  return (
    <div
      className={`${styles.playerEntity} ${styles.allyEntity} ${player.moving ? styles.entityRun : ''}`}
      style={{
        left: clamp(player.x - player.facing * (74 + index * 66), 80, WORLD_WIDTH - 130),
        bottom: laneBottom(allyLane) - 4,
        zIndex: Math.round(26 + allyLane * 20),
        '--face': player.facing,
        '--accent': model.accent,
      } as CSSProperties}
    >
      <strong className={styles.allyNameTag}>{allyName}</strong>
      <div className={styles.entityShadow} />
      <div className={styles.playerSprite} style={playerSpriteStyle(model, animation, 0.86)} />
    </div>
  )
}

function RemotePlayer2d({ player }: { player: RemoteTeamPlayer }) {
  const model = playerModelById(player.modelId)
  const maxHp = playerModelCombatStats(model.id).hp
  const downed = player.status === 'downed' || player.hp <= 0
  const answering = player.status === 'answering'
  const reviving = player.status === 'reviving'
  const rolling = !downed && !player.attacking && (player.rollingUntil ?? 0) > Date.now()
  const hpPercent = Math.max(0, Math.min(100, Math.round((player.hp / maxHp) * 100)))
  const comboSteps = playerComboSteps(model)
  const attackPhase = Math.max(1, player.attackPhase ?? 1)
  const comboStep = comboSteps[(attackPhase - 1) % Math.max(1, comboSteps.length)] ?? comboSteps[0]
  const animation: PlayerAnimation = downed
    ? 'death'
    : player.attacking
    ? (comboStep?.animation ?? 'attack')
    : rolling
      ? 'roll'
    : player.moving
      ? 'run'
      : 'idle'
  const spriteStyle = {
    ...playerSpriteStyle(model, animation, 1, player.attacking && comboStep ? {
      startFrame: comboStep.startFrame,
      frameCount: comboStep.frameCount,
      duration: comboStep.duration,
    } : {}),
    ...(player.attacking ? { '--player-animation-duration': `${playerAnimationStyle(model, animation, 1, comboStep ? {
      startFrame: comboStep.startFrame,
      frameCount: comboStep.frameCount,
      duration: comboStep.duration,
    } : {}).duration}ms` } : {}),
  } as CSSProperties

  return (
    <div
      className={`${styles.playerEntity} ${styles.remotePlayerEntity} ${player.moving ? styles.entityRun : ''} ${rolling ? styles.entityRoll : ''} ${player.attacking ? styles.entityAttack : ''} ${downed ? styles.remotePlayerDowned : ''} ${answering ? styles.remotePlayerAnswering : ''}`}
      style={{
        left: player.x,
        bottom: laneBottom(player.lane) - 2,
        zIndex: Math.round(32 + player.lane * 20),
        '--face': player.facing,
        '--accent': model.accent,
        '--player-roll-duration': `${player.rollDuration ?? model.durations?.roll ?? DEFAULT_ROLL_DURATION_MS}ms`,
      } as CSSProperties}
    >
      <strong className={styles.remotePlayerName}>{player.displayName}</strong>
      <span className={styles.remotePlayerHpTag}>
        <i style={{ width: `${hpPercent}%` }} />
        <em>{model.name} · {player.hp}/{maxHp}</em>
      </span>
      {(downed || answering || reviving || player.aiControlled) && (
        <span className={styles.remotePlayerStatus}>
          {downed ? '倒地' : answering ? '答题中' : reviving ? 'AI 扶人中' : 'AI 接管'}
        </span>
      )}
      <div className={styles.entityShadow} />
      <div key={`${model.id}-${animation}-${rolling ? player.rollingUntil : player.attacking ? player.attackSequence ?? player.updatedAt : ''}`} className={styles.playerSprite} style={spriteStyle} />
    </div>
  )
}

function GroundSwordWave2d({ wave }: { wave: GroundSwordWave }) {
  return (
    <div
      className={styles.groundSwordWave}
      style={{
        left: wave.x,
        bottom: laneBottom(wave.lane) - 18,
        zIndex: Math.round(52 + wave.lane * 20),
        '--face': wave.direction,
        '--wave-duration': `${wave.duration}ms`,
      } as CSSProperties}
    />
  )
}

function Projectile2d({ projectile }: { projectile: ProjectileState }) {
  const projectileColor = projectile.color ?? '#ff8d6b'
  const projectileKindClass =
    projectile.kind === 'arrow'
      ? styles.projectileArrow
      : projectile.kind === 'flyingFireball'
        ? styles.projectileFlyingFireball
        : projectile.kind === 'fireball'
          ? styles.projectileFireball
          : ''
  return (
    <div
      className={`${styles.projectileEntity} ${styles.enemyProjectile} ${projectileKindClass} ${projectile.height === 'high' ? styles.projectileHigh : styles.projectileLow} ${projectile.heavy ? styles.projectileHeavy : ''}`}
      style={{
        left: projectile.x,
        bottom: laneBottom(projectile.lane) + (projectile.height === 'high' ? 82 : 35),
        zIndex: Math.round(56 + projectile.lane * 20),
        '--face': projectile.direction,
        '--projectile-color': projectileColor,
      } as CSSProperties}
    />
  )
}

function storyOperationToolIcon(toolId: StoryOperationToolId) {
  switch (toolId) {
    case 'risk-matrix':
      return <ShieldAlert size={18} />
    case 'fishbone':
      return <FlaskConical size={18} />
    case 'what-if':
      return <Sparkles size={18} />
    case 'decision':
      return <Target size={18} />
    case 'fmea':
      return <ClipboardCheck size={18} />
    case 'haccp':
      return <ShieldCheck size={18} />
    case 'pha':
      return <FileSearch size={18} />
    case 'fta':
      return <Swords size={18} />
    default:
      return <ScanSearch size={18} />
  }
}

function StoryOperationPanel({
  task,
  scenario,
  selectedTools,
  selectedAnswer,
  feedback,
  onToggleTool,
  onSelectAnswer,
  onSubmit,
  onClose,
}: {
  task: ChapterStoryTask
  scenario: StoryOperationScenario
  selectedTools: StoryOperationToolId[]
  selectedAnswer: string
  feedback: string
  onToggleTool: (toolId: StoryOperationToolId) => void
  onSelectAnswer: (answerId: string) => void
  onSubmit: () => void
  onClose: () => void
}) {
  const requiredToolSet = new Set(scenario.requiredTools)
  return (
    <section
      className={styles.storyOperationScrim}
      role="dialog"
      aria-modal="true"
      aria-labelledby="story-operation-title"
      onMouseDown={event => event.stopPropagation()}
    >
      <div className={styles.storyOperationPanel}>
        <header className={styles.storyOperationHeader}>
          <div>
            <p className={styles.eyebrow}>现场操作</p>
            <h2 id="story-operation-title">{task.title}</h2>
            <span>{task.objective}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭现场操作">
            <X size={16} />
          </button>
        </header>

        <div className={styles.storyOperationContext}>
          <strong>{scenario.chapterFocus} · {scenario.knowledgePoint}</strong>
          <p>{task.clue}</p>
          <span>工具组合：{scenario.toolUse}</span>
        </div>

        <div className={styles.storyOperationSection}>
          <div className={styles.storyOperationSectionHeader}>
            <strong>选择工具</strong>
            <span>{selectedTools.length}/{scenario.requiredTools.length} 关键工具</span>
          </div>
          <div className={styles.storyOperationTools}>
            {scenario.tools.map(tool => {
              const selected = selectedTools.includes(tool.id)
              const required = requiredToolSet.has(tool.id)
              return (
                <button
                  type="button"
                  key={tool.id}
                  className={`${styles.storyOperationTool} ${selected ? styles.storyOperationToolSelected : ''}`}
                  onClick={() => onToggleTool(tool.id)}
                  aria-pressed={selected}
                >
                  <i>{storyOperationToolIcon(tool.id)}</i>
                  <span>
                    <strong>{tool.name}</strong>
                    <small>{tool.detail}</small>
                  </span>
                  {required && <em>关键</em>}
                </button>
              )
            })}
          </div>
        </div>

        <div className={styles.storyOperationQuestion}>
          <strong>{scenario.question}？</strong>
          <div className={styles.storyOperationOptions}>
            {scenario.options.map((option, index) => (
              <button
                type="button"
                key={option.id}
                className={selectedAnswer === option.id ? styles.storyOperationOptionSelected : ''}
                onClick={() => onSelectAnswer(option.id)}
                aria-pressed={selectedAnswer === option.id}
              >
                <b>{String.fromCharCode(65 + index)}</b>
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </div>

        <footer className={styles.storyOperationFooter}>
          <p className={styles.storyOperationFeedback}>
            {feedback || '先选现场工具，再提交本轮判断。'}
          </p>
          <button type="button" className={styles.storyOperationSubmit} onClick={onSubmit}>
            <Check size={16} />提交结论
          </button>
        </footer>
      </div>
    </section>
  )
}

function StoryTaskMarker2d({ task, onOpen }: { task: ChapterStoryTask; onOpen: () => void }) {
  return (
    <button
      type="button"
      className={styles.storyTaskMarker}
      style={{
        left: task.x,
        bottom: laneBottom(task.lane) + 18,
        zIndex: Math.round(70 + task.lane * 20),
      }}
      onClick={event => {
        event.stopPropagation()
        onOpen()
      }}
      aria-label={`打开现场操作：${task.title}`}
    >
      <ScanSearch size={18} />
      <span>{task.title}</span>
    </button>
  )
}

function Enemy2d({ enemy, projectId, locked, targeted }: { enemy: EnemyState; projectId: number; locked: boolean; targeted: boolean }) {
  const now = performance.now()
  const hpPercent = Math.round((enemy.hp / enemy.maxHp) * 100)
  const quizPercent = Math.round((enemy.quizCharge / enemy.quizEvery) * 100)
  const hit = enemy.hitUntil > now
  const winding = enemy.windupUntil > now
  const attacking = enemy.attackingUntil > now
  const animation = enemyAnimationFor(enemy)
  const spriteStyle = enemySpriteStyle(enemy, projectId, animation)
  const effectStyle = enemySpriteEffectStyle(enemy, projectId, animation)
  const heroEffect = enemy.heroEffect && enemy.heroEffect.visualId && enemy.heroEffect.until > now ? enemy.heroEffect : null
  const heroEffectBurst = Boolean(heroEffect?.burstUntil && heroEffect.burstUntil > now)
  const heroEffectPulse = Boolean(heroEffect?.pulseUntil && heroEffect.pulseUntil > now)
  const heroEffectClassName = heroEffect ? enemyHeroEffectClass(heroEffect.kind) : ''
  const heroEffectStyle = heroEffect ? heroEffectVisualStyle(heroEffect, enemy) : undefined
  const spriteAnimationKey = animation === 'attack'
    ? Math.ceil(Math.max(0, enemy.attackSequence) / 2)
    : enemy.attackSequence
  return (
    <div
      className={`${styles.enemyEntity} ${enemyFormClass(enemy.form)} ${enemy.attackStyle === 'ranged' ? styles.enemyRanged : ''} ${enemy.kind === 'boss' ? styles.bossEntity : ''} ${locked ? styles.enemyLocked : ''} ${targeted ? styles.enemyTargeted : ''} ${enemy.moving ? styles.enemyChasing : ''} ${hit ? styles.enemyHit : ''} ${winding ? styles.enemyWindup : ''} ${attacking ? styles.enemyAttacking : ''} ${enemy.defeated ? styles.enemyDefeated : ''}`}
      style={{
        left: enemy.x,
        bottom: laneBottom(enemy.lane),
        zIndex: Math.round(28 + enemy.lane * 20 + (enemy.kind === 'boss' ? 2 : 0)),
        '--face': enemy.facing,
      } as CSSProperties}
    >
      <div className={styles.entityShadow} />
      <div className={styles.enemyLabel}>
        <strong>{locked ? 'Boss 未开放' : enemy.defect}</strong>
        <span>{locked ? '先清理全部缺陷怪' : `${enemy.title} · ${enemy.objective ?? (enemy.attackStyle === 'ranged' ? '远程缺陷' : '近战缺陷')}`}</span>
        {!locked && <i style={{ width: `${hpPercent}%` }} />}
        {!locked && <em style={{ width: `${quizPercent}%` }} />}
      </div>
      <div
        key={`${enemy.id}-${animation}-${spriteAnimationKey}`}
        className={`${styles.robotSprite} ${heroEffect ? `${styles.enemyHeroEffectActive} ${heroEffectClassName}` : ''}`}
        style={spriteStyle}
      >
        {effectStyle && <i className={styles.enemySpriteEffect} style={effectStyle} />}
        {heroEffect && (
          <i
            key={`${heroEffect.kind}-${heroEffect.stacks}-${Math.round(heroEffect.burstUntil ?? 0)}`}
            className={`${styles.heroHitEffect} ${heroEffectClassName} ${heroEffectBurst ? styles.heroHitEffectBurst : ''} ${heroEffectPulse ? styles.heroHitEffectPulse : ''}`}
            style={{ ...heroEffectStyle, '--hero-effect-stacks': Math.max(1, heroEffect.stacks) } as CSSProperties}
          />
        )}
        <i className={styles.enemySpriteImage} />
      </div>
    </div>
  )
}

function WeaponPickup2d({ pickup, weapon }: { pickup: WeaponPickupState; weapon: Weapon }) {
  if (pickup.picked) return null
  return (
    <div
      className={styles.pickupEntity}
      style={{
        left: pickup.x,
        bottom: laneBottom(pickup.lane) + 12,
        zIndex: Math.round(24 + pickup.lane * 20),
        '--weapon-color': weapon.color,
        '--weapon-image': `url("${weaponInventoryIcon(weapon.id)}")`,
      } as CSSProperties}
    >
      <i className={weaponShapeClass(weapon.shape)} />
      <strong>{weapon.name}</strong>
      <span>靠近拾取</span>
    </div>
  )
}
