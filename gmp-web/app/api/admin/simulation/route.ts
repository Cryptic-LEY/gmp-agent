import fs from 'fs'
import path from 'path'
import type { RowDataPacket } from 'mysql2'
import { NextRequest, NextResponse } from 'next/server'
import { PLAYER_MODELS } from '@/app/(main)/simulation/player-models'
import { db } from '@/db'
import { verifyToken } from '@/lib/auth'
import { getRankByXp } from '@/lib/gamification'
import {
  COURSE_CREDIT_RULES,
  PROJECT_MISSIONS,
  buildProjectBossQuestions,
  buildProjectStoryQuestions,
  creditForProjectMedal,
  type ProjectMedal,
} from '@/lib/simulation/project-missions'
import { CARRIER_ROUTES } from '@/lib/simulation/project7'
import { ensureSimulationProjectProgressTable, isSimulationMedal } from '@/lib/simulation/project-progress-store'
import {
  TEAM_COMBAT_ROLES,
  ensureTeamCollaborationSchema,
  getOnlineTeamUserIds,
  getTeamProjectDefinition,
  roleCardsForTeamProject,
} from '@/lib/team-collaboration'

type SimulationConfigScope = 'map' | 'project' | 'character'
type SimulationEntityStatus = 'active' | 'disabled' | 'draft'

interface ProgressRow extends RowDataPacket {
  user_id: string
  display_name: string
  real_name: string | null
  email: string
  role: string
  school: string | null
  major: string | null
  class_name: string | null
  project_id: number
  medal: ProjectMedal
  best_score: number
  story_score: number
  boss_accuracy: number
  credit_hours: number
  completed_at: string
  source: 'progress'
}

interface RewardClaimRow extends RowDataPacket {
  user_id: string
  display_name: string
  real_name: string | null
  email: string
  role: string
  school: string | null
  major: string | null
  class_name: string | null
  reward_key: string
  xp: number
  claimed_at: string
}

interface UserCountRow extends RowDataPacket {
  student_count: number
}

interface XpRow extends RowDataPacket {
  xp: number
}

interface SimulationAdminConfigRow extends RowDataPacket {
  scope: SimulationConfigScope
  entity_id: string
  config_json: string
  updated_at: string
}

interface SimulationAdminConfig {
  displayName?: string
  assetPath?: string
  status?: SimulationEntityStatus
  notes?: string
  kind?: string
  linkedProjectId?: number | null
  lead?: string
  caseFocus?: string
  riskSignal?: string
  firstAction?: string
  bossName?: string
  bossTitle?: string
  hp?: number
  damage?: number
  mobility?: number
  rewardCoins?: number
  rewardGems?: number
  coinPrice?: number
  gemPrice?: number
  updatedAt?: string
}

interface TeamRoomRow extends RowDataPacket {
  room_id: string
  project_id: number
  owner_id: string
  title: string
  status: string
  created_at: string
  updated_at: string
  owner_name: string | null
  owner_real_name: string | null
  member_count: number
}

interface TeamMemberRow extends RowDataPacket {
  room_id: string
  user_id: string
  display_name: string
  real_name: string | null
  school: string | null
  class_name: string | null
  major: string | null
  role_id: string | null
  combat_role_id: string | null
  hp: number
  member_status: string
  joined_at: string
}

interface SimulationMemberRow extends RowDataPacket {
  user_id: string
  display_name: string
  real_name: string | null
  email: string
  school: string | null
  major: string | null
  class_name: string | null
  created_at: string
  xp: number | null
  points: number | null
  rank_level: number | null
  rank_title: string | null
  streak_days: number | null
  max_streak: number | null
  last_login_date: string | null
}

const DEFAULT_CARRIER = CARRIER_ROUTES[0].primaryCarriers[0]
const PUBLIC_SIMULATION_ROOT = path.resolve(process.cwd(), 'public', 'simulation')
const CONFIG_SCOPES = new Set<SimulationConfigScope>(['map', 'project', 'character'])

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

const HERO_UNLOCKS = [
  { id: 'knight-hero', rarity: '初始', coinPrice: 0, gemPrice: 0, hp: 140, attack: 10, mobility: 10, passive: '第三次普攻释放地面剑气，适合稳定开荒。' },
  { id: 'knight2', rarity: '进阶', coinPrice: 2600, gemPrice: 58, hp: 135, attack: 12, mobility: 11, passive: '连段节奏更快，圣辉闪电能压低高威胁目标。' },
  { id: 'pixel-knight', rarity: '进阶', coinPrice: 3400, gemPrice: 82, hp: 150, attack: 11, mobility: 9, passive: '盾剑平衡，容错更高，适合持续推进。' },
  { id: 'sprite-hero', rarity: '精英', coinPrice: 4200, gemPrice: 108, hp: 122, attack: 10, mobility: 13, passive: '移动灵活，劈砍命中后更容易保持安全距离。' },
  { id: 'black-knight', rarity: '精英', coinPrice: 5200, gemPrice: 146, hp: 165, attack: 13, mobility: 7, passive: '生命和压制力高，火焰伤害适合处理重甲目标。' },
  { id: 'demon-warrior', rarity: '传说', coinPrice: 6200, gemPrice: 168, hp: 130, attack: 14, mobility: 12, passive: '紫电持续伤害叠满后触发雷击暴击。' },
] as const

const BOUNTY_ENDLESS_MONSTERS = [
  { id: 'virus', name: '污染病毒', title: '污染风险', hp: 68, damage: 8, rewardCoins: 18, rewardGems: 0, color: '#74d66f', assetPath: '/simulation/enemies/cacodaemon/idle.png' },
  { id: 'defect', name: '缺陷兵', title: '记录缺口', hp: 82, damage: 10, rewardCoins: 22, rewardGems: 0, color: '#f2c86b', assetPath: '/simulation/enemies/goblin-scout/idle.png' },
  { id: 'glitch', name: '数据故障体', title: '数据完整性', hp: 74, damage: 11, rewardCoins: 24, rewardGems: 0, color: '#70d6ff', assetPath: '/simulation/enemies/goblin-archer/idle.png' },
  { id: 'wraith', name: '审计幽影', title: '审计追踪', hp: 88, damage: 12, rewardCoins: 28, rewardGems: 1, color: '#b78cff', assetPath: '/simulation/enemies/old-guardian/idle.png' },
  { id: 'tank', name: '偏差重甲', title: '高血量压制', hp: 132, damage: 14, rewardCoins: 38, rewardGems: 1, color: '#ff9b72', assetPath: '/simulation/enemies/goblin-tank/idle.png', heavy: true },
  { id: 'flying', name: '飞行异常', title: '远程骚扰', hp: 72, damage: 10, rewardCoins: 30, rewardGems: 1, color: '#8fd3ff', assetPath: '/simulation/enemies/flying-demon/idle.png', flying: true },
  { id: 'elite', name: '精英缺陷守卫', title: '精英异常', hp: 150, damage: 16, rewardCoins: 54, rewardGems: 2, color: '#ffe08a', assetPath: '/simulation/enemies/elite-goblin-1/idle.png', heavy: true },
  { id: 'golem', name: '精英石像守卫', title: '精英重型', hp: 190, damage: 18, rewardCoins: 66, rewardGems: 3, color: '#c8d1d8', assetPath: '/simulation/enemies/elite-golem/idle.png', heavy: true },
] as const

const BOUNTY_ENDLESS_BOSSES = [
  { id: 'endless-boss-1', name: '体系裂隙领主', title: '本层 Boss', hp: 320, damage: 22, rewardCoins: 150, rewardGems: 5, color: '#ff6f6f', assetPath: '/simulation/bosses/boss11/idle.png' },
  { id: 'endless-boss-2', name: '终端审计王', title: '本层 Boss', hp: 350, damage: 24, rewardCoins: 165, rewardGems: 6, color: '#f2c86b', assetPath: '/simulation/bosses/boss9/idle.png' },
  { id: 'endless-boss-3', name: 'CAPA 断链主宰', title: '本层 Boss', hp: 380, damage: 25, rewardCoins: 180, rewardGems: 7, color: '#b78cff', assetPath: '/simulation/bosses/boss7/idle.png' },
] as const

interface CharacterSpritePreviewSpec {
  assetPath: string
  frameWidth: number
  frameHeight: number
  frameCount: number
  nativeFacing?: number
  accent?: string
  groundOffset?: number
}

const ENEMY_PREVIEW_SPRITES = {
  virus: { assetPath: '/simulation/enemies/cacodaemon/idle.png', frameWidth: 64, frameHeight: 64, frameCount: 6, accent: '#ff6f7d' },
  defect: { assetPath: '/simulation/enemies/goblin-scout/idle.png', frameWidth: 600, frameHeight: 500, frameCount: 8, accent: '#9fbc55' },
  glitch: { assetPath: '/simulation/enemies/goblin-archer/idle.png', frameWidth: 600, frameHeight: 500, frameCount: 8, accent: '#d9b56f' },
  wraith: { assetPath: '/simulation/enemies/old-guardian/idle.png', frameWidth: 120, frameHeight: 120, frameCount: 6, nativeFacing: -1, accent: '#d46c45', groundOffset: 29 },
  tank: { assetPath: '/simulation/enemies/goblin-tank/idle.png', frameWidth: 224, frameHeight: 180, frameCount: 8, accent: '#b9cf62' },
  flying: { assetPath: '/simulation/enemies/flying-demon/idle.png', frameWidth: 79, frameHeight: 69, frameCount: 4, nativeFacing: -1, accent: '#e86a78' },
  elite: { assetPath: '/simulation/enemies/elite-goblin-1/idle.png', frameWidth: 200, frameHeight: 200, frameCount: 15, nativeFacing: 1, accent: '#b8cf63', groundOffset: 41 },
  golem: { assetPath: '/simulation/enemies/elite-golem/idle.png', frameWidth: 111, frameHeight: 67, frameCount: 8, nativeFacing: 1, accent: '#f0a65a' },
} as const satisfies Record<(typeof BOUNTY_ENDLESS_MONSTERS)[number]['id'], CharacterSpritePreviewSpec>

const BOSS_PREVIEW_SPRITES = {
  boss1: { assetPath: '/simulation/bosses/boss1/idle.png', frameWidth: 288, frameHeight: 160, frameCount: 6, nativeFacing: -1, accent: '#f07b4f', groundOffset: 32 },
  boss2: { assetPath: '/simulation/bosses/boss2/idle.png', frameWidth: 120, frameHeight: 120, frameCount: 6, nativeFacing: 1, accent: '#ded07a', groundOffset: 28 },
  boss3: { assetPath: '/simulation/bosses/boss3/idle.png', frameWidth: 64, frameHeight: 64, frameCount: 4, nativeFacing: -1, accent: '#b878ff', groundOffset: 20 },
  boss4: { assetPath: '/simulation/bosses/boss4/idle.png', frameWidth: 320, frameHeight: 260, frameCount: 4, nativeFacing: 1, accent: '#74d9ff', groundOffset: 34 },
  boss5: { assetPath: '/simulation/bosses/boss5/idle.png', frameWidth: 220, frameHeight: 198, frameCount: 9, nativeFacing: 1, accent: '#f2b85e', groundOffset: 22 },
  boss6: { assetPath: '/simulation/bosses/boss6/idle.png', frameWidth: 80, frameHeight: 80, frameCount: 5, nativeFacing: 1, accent: '#9f7bff', groundOffset: 10 },
  boss7: { assetPath: '/simulation/bosses/boss7/idle.png', frameWidth: 250, frameHeight: 250, frameCount: 21, nativeFacing: 1, accent: '#a6e15a', groundOffset: 20 },
  boss8: { assetPath: '/simulation/bosses/boss8/idle.png', frameWidth: 64, frameHeight: 64, frameCount: 2, nativeFacing: 1, accent: '#ba7dff', groundOffset: 8 },
  boss9: { assetPath: '/simulation/bosses/boss9/idle.png', frameWidth: 50, frameHeight: 50, frameCount: 6, nativeFacing: 1, accent: '#ff8a3d', groundOffset: 4 },
  boss10: { assetPath: '/simulation/bosses/boss10/idle.png', frameWidth: 100, frameHeight: 100, frameCount: 4, nativeFacing: 1, accent: '#73d9ff', groundOffset: 8 },
  boss11: { assetPath: '/simulation/bosses/boss11/idle.png', frameWidth: 131, frameHeight: 61, frameCount: 8, nativeFacing: -1, accent: '#37d9ff', groundOffset: 4 },
} as const satisfies Record<string, CharacterSpritePreviewSpec>

const PROJECT_BOSS_SPRITE_IDS: Record<number, keyof typeof BOSS_PREVIEW_SPRITES> = {
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

const ENDLESS_BOSS_SPRITE_IDS = ['boss11', 'boss9', 'boss7'] as const
const ADMIN_CHARACTER_PREVIEW_PREFIX = '/simulation/admin-previews'

const MEDAL_LABELS: Record<ProjectMedal, string> = {
  gold: '金牌',
  silver: '银牌',
  bronze: '铜牌',
  none: '未通过',
}

let adminConfigTableEnsured = false

function getAuthPayload(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  return token ? verifyToken(token) : null
}

function ensureAdmin(req: NextRequest) {
  const payload = getAuthPayload(req)
  return payload?.role === 'admin' ? payload : null
}

function round(value: number) {
  return Math.round(value * 10) / 10
}

function scoreAverage(values: number[]) {
  if (!values.length) return 0
  return round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function projectQuestionCounts(project: (typeof PROJECT_MISSIONS)[number]) {
  const storyQuestions = buildProjectStoryQuestions(project, 'undergraduate', DEFAULT_CARRIER)
  const bossQuestions = buildProjectBossQuestions(project, 'undergraduate', DEFAULT_CARRIER)

  return {
    storyQuestionCount: storyQuestions.length,
    bossQuestionCount: bossQuestions.length,
    questionCount: storyQuestions.length + bossQuestions.length,
  }
}

function rewardProjectId(rewardKey: string) {
  const value = Number(rewardKey.match(/^simulation:project:(\d+):completion$/)?.[1])
  return Number.isInteger(value) ? value : null
}

function medalCounts(records: Array<{ medal: ProjectMedal }>) {
  return {
    gold: records.filter(item => item.medal === 'gold').length,
    silver: records.filter(item => item.medal === 'silver').length,
    bronze: records.filter(item => item.medal === 'bronze').length,
  }
}

function configKey(scope: SimulationConfigScope, entityId: string | number) {
  return `${scope}:${entityId}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function trimString(value: unknown, maxLength = 500) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, maxLength)
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return undefined
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

function sanitizeConfig(input: unknown): SimulationAdminConfig {
  if (!isRecord(input)) return {}

  const statusValue = trimString(input.status, 32)
  const status = statusValue === 'active' || statusValue === 'disabled' || statusValue === 'draft' ? statusValue : undefined
  const linkedProjectId = optionalNumber(input.linkedProjectId)

  return {
    displayName: trimString(input.displayName, 120),
    assetPath: trimString(input.assetPath, 500),
    status,
    notes: trimString(input.notes, 1000),
    kind: trimString(input.kind, 64),
    linkedProjectId: Number.isInteger(linkedProjectId) ? linkedProjectId : undefined,
    lead: trimString(input.lead, 500),
    caseFocus: trimString(input.caseFocus, 255),
    riskSignal: trimString(input.riskSignal, 500),
    firstAction: trimString(input.firstAction, 500),
    bossName: trimString(input.bossName, 120),
    bossTitle: trimString(input.bossTitle, 180),
    hp: optionalNumber(input.hp),
    damage: optionalNumber(input.damage),
    mobility: optionalNumber(input.mobility),
    rewardCoins: optionalNumber(input.rewardCoins),
    rewardGems: optionalNumber(input.rewardGems),
    coinPrice: optionalNumber(input.coinPrice),
    gemPrice: optionalNumber(input.gemPrice),
  }
}

async function ensureSimulationAdminConfigTable() {
  if (adminConfigTableEnsured) return
  await db.raw.run(`
    CREATE TABLE IF NOT EXISTS simulation_admin_configs (
      scope VARCHAR(64) NOT NULL,
      entity_id VARCHAR(191) NOT NULL,
      config_json LONGTEXT NOT NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (scope, entity_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  adminConfigTableEnsured = true
}

async function loadSimulationAdminConfigs() {
  await ensureSimulationAdminConfigTable()
  const [rows] = await db.$client.execute<SimulationAdminConfigRow[]>(`
    SELECT scope, entity_id, config_json, updated_at
    FROM simulation_admin_configs
  `)
  const configs = new Map<string, SimulationAdminConfig>()

  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.config_json)
      if (!isRecord(parsed) || !CONFIG_SCOPES.has(row.scope)) continue
      configs.set(configKey(row.scope, row.entity_id), {
        ...sanitizeConfig(parsed),
        updatedAt: row.updated_at,
      })
    } catch {
      // Ignore malformed legacy rows instead of breaking the whole console.
    }
  }

  return configs
}

function configFor(configs: Map<string, SimulationAdminConfig>, scope: SimulationConfigScope, entityId: string | number) {
  return configs.get(configKey(scope, entityId))
}

function resolvePublicAsset(assetPath: string | null | undefined) {
  if (!assetPath || !assetPath.startsWith('/simulation/')) return null
  const normalized = assetPath.replace(/^\/+/, '').replace(/\\/g, '/')
  const fullPath = path.resolve(process.cwd(), 'public', normalized)
  if (!fullPath.startsWith(PUBLIC_SIMULATION_ROOT)) return null
  return fullPath
}

function assetInfo(assetPath: string | null | undefined) {
  const fullPath = resolvePublicAsset(assetPath)
  if (!fullPath) return { exists: false, sizeKb: 0 }
  try {
    const stat = fs.statSync(fullPath)
    return {
      exists: stat.isFile(),
      sizeKb: stat.isFile() ? round(stat.size / 1024) : 0,
    }
  } catch {
    return { exists: false, sizeKb: 0 }
  }
}

function spritePreview(sprite: Readonly<CharacterSpritePreviewSpec>) {
  return {
    previewMode: 'sprite' as const,
    previewFrameWidth: sprite.frameWidth,
    previewFrameHeight: sprite.frameHeight,
    previewFrameCount: sprite.frameCount,
    previewFace: sprite.nativeFacing ?? 1,
    previewAccent: sprite.accent ?? '#14b8a6',
    previewGroundOffset: sprite.groundOffset ?? 0,
  }
}

function adminCharacterPreviewPath(characterId: string) {
  return `${ADMIN_CHARACTER_PREVIEW_PREFIX}/${characterId}.png`
}

function listSimulationAssets(folder: string) {
  const dir = path.join(PUBLIC_SIMULATION_ROOT, folder)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(item => item.isFile() && /\.(png|webp|jpg|jpeg)$/i.test(item.name))
    .map(item => {
      const assetPath = `/simulation/${folder}/${item.name}`
      return {
        id: `${folder}-${item.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
        fileName: item.name,
        assetPath,
        ...assetInfo(assetPath),
      }
    })
}

function applyNamedConfig<T extends { id: string; name: string; assetPath?: string; status?: SimulationEntityStatus; notes?: string }>(
  scope: SimulationConfigScope,
  base: T,
  configs: Map<string, SimulationAdminConfig>,
) {
  const config = configFor(configs, scope, base.id)
  const assetPath = config?.assetPath || base.assetPath

  return {
    ...base,
    name: config?.displayName || base.name,
    assetPath,
    status: config?.status || base.status || 'active',
    notes: config?.notes || base.notes || '',
    configUpdatedAt: config?.updatedAt || null,
    ...assetInfo(assetPath),
  }
}

function buildSimulationMaps(configs: Map<string, SimulationAdminConfig>) {
  const baseMaps = [
    {
      id: 'world-map',
      name: '实训总地图',
      kind: 'world',
      kindLabel: '总览地图',
      usage: '章节选择与路线总览',
      projectId: null,
      projectTitle: '全局',
      assetPath: '/simulation/map-background.webp',
      status: 'active' as SimulationEntityStatus,
    },
    ...PROJECT_MISSIONS.map(project => ({
      id: `project-${project.id}`,
      name: `${project.missionCode} · ${project.title}`,
      kind: 'chapter',
      kindLabel: project.finalBoss ? '终局章节' : '章节地图',
      usage: project.caseFocus,
      projectId: project.id,
      projectTitle: project.title,
      assetPath: PROJECT_MAP_BACKGROUNDS[project.id] ?? '/simulation/map-background.webp',
      status: 'active' as SimulationEntityStatus,
    })),
    ...listSimulationAssets('backgrounds').map(asset => ({
      id: `bounty-${asset.id}`,
      name: asset.fileName.replace(/\.[^.]+$/, ''),
      kind: 'bounty',
      kindLabel: '悬赏地图',
      usage: '悬赏无尽试炼 / 备用场景',
      projectId: null,
      projectTitle: '悬赏试炼',
      assetPath: asset.assetPath,
      status: 'active' as SimulationEntityStatus,
    })),
  ]
  const existingIds = new Set(baseMaps.map(item => item.id))
  const customMaps = Array.from(configs.entries())
    .filter(([key]) => key.startsWith('map:'))
    .map(([key, config]) => {
      const id = key.replace(/^map:/, '')
      if (existingIds.has(id)) return null
      const linkedProject = PROJECT_MISSIONS.find(project => project.id === config.linkedProjectId)
      return {
        id,
        name: config.displayName || '自定义地图',
        kind: config.kind || 'custom',
        kindLabel: '自定义地图',
        usage: config.notes || '管理员新增',
        projectId: linkedProject?.id ?? null,
        projectTitle: linkedProject?.title || '未绑定项目',
        assetPath: config.assetPath || '/simulation/map-background.webp',
        status: config.status || 'draft' as SimulationEntityStatus,
      }
    })
    .filter(Boolean) as typeof baseMaps

  return [...baseMaps, ...customMaps].map(map => applyNamedConfig('map', map, configs))
}

function buildSimulationProjects(
  allRecords: Array<ReturnType<typeof toProgressRecord> | ReturnType<typeof toRewardFallbackRecord>>,
  configs: Map<string, SimulationAdminConfig>,
) {
  const allQuestionCounts = PROJECT_MISSIONS.map(project => ({ projectId: project.id, ...projectQuestionCounts(project) }))
  const questionCountByProject = new Map(allQuestionCounts.map(item => [item.projectId, item]))
  const recordsByProject = new Map<number, typeof allRecords>()

  for (const record of allRecords) {
    const items = recordsByProject.get(record.projectId) ?? []
    items.push(record)
    recordsByProject.set(record.projectId, items)
  }

  return PROJECT_MISSIONS.map(project => {
    const config = configFor(configs, 'project', project.id)
    const projectRecords = recordsByProject.get(project.id) ?? []
    const counts = questionCountByProject.get(project.id) ?? { storyQuestionCount: 0, bossQuestionCount: 0, questionCount: 0 }
    const count = medalCounts(projectRecords)
    const creditHours = round(projectRecords.reduce((sum, item) => sum + item.creditHours, 0))
    const assetPath = config?.assetPath || project.bossImage || project.storyImage

    return {
      id: project.id,
      missionCode: project.missionCode,
      title: config?.displayName || project.title,
      originalTitle: project.title,
      curriculum: project.curriculum,
      finalBoss: Boolean(project.finalBoss),
      status: config?.status || 'active',
      notes: config?.notes || '',
      lead: config?.lead || project.lead,
      caseFocus: config?.caseFocus || project.caseFocus,
      riskSignal: config?.riskSignal || project.riskSignal,
      wrongShortcut: project.wrongShortcut,
      firstAction: config?.firstAction || project.firstAction,
      processRisk: project.processRisk,
      scopeRisk: project.scopeRisk,
      capaMove: project.capaMove,
      keyEvidence: project.keyEvidence,
      storyImage: project.storyImage,
      bossImage: project.bossImage,
      assetPath,
      bossName: config?.bossName || project.bossName,
      bossTitle: config?.bossTitle || project.bossTitle,
      sceneCount: project.scenes.length,
      npcCount: project.npcs.length,
      scenes: project.scenes,
      configUpdatedAt: config?.updatedAt || null,
      ...assetInfo(assetPath),
      ...counts,
      completionCount: projectRecords.length,
      participantCount: new Set(projectRecords.map(item => item.userId)).size,
      averageBestScore: scoreAverage(projectRecords.map(item => item.bestScore)),
      averageBossAccuracy: scoreAverage(projectRecords.map(item => item.bossAccuracy)),
      creditHours,
      medalCounts: count,
    }
  })
}

function buildSimulationCharacters(configs: Map<string, SimulationAdminConfig>) {
  const heroStats = new Map(HERO_UNLOCKS.map(hero => [hero.id, hero]))
  const combatRoles = new Map(TEAM_COMBAT_ROLES.map(role => [role.roleId, role]))

  const heroes = PLAYER_MODELS.map(model => {
    const stats = heroStats.get(model.id) ?? HERO_UNLOCKS[0]
    const role = combatRoles.get(model.id)
    const assetPath = model.assets.idle
    return applyCharacterConfig({
      id: `hero-${model.id}`,
      sourceId: model.id,
      type: 'hero',
      typeLabel: '英雄',
      name: role?.name || model.name,
      title: role?.tagline || model.tagline,
      specialty: role?.specialty || model.specialty,
      code: model.code,
      rarity: stats.rarity,
      hp: stats.hp,
      damage: stats.attack,
      mobility: stats.mobility,
      rewardCoins: null,
      rewardGems: null,
      coinPrice: stats.coinPrice,
      gemPrice: stats.gemPrice,
      passive: stats.passive,
      usage: '玩家可解锁角色 / 组队战斗模型',
      projectId: null,
      projectTitle: '全局',
      modelPath: assetPath,
      assetPath,
      ...spritePreview({
        assetPath,
        frameWidth: model.frameWidth,
        frameHeight: model.frameHeight,
        frameCount: model.frames.idle,
        accent: model.accent,
        groundOffset: model.groundOffsets?.idle,
      }),
      previewMode: 'image' as const,
      previewImagePath: adminCharacterPreviewPath(`hero-${model.id}`),
      status: 'active' as SimulationEntityStatus,
    }, configs)
  })

  const enemies = BOUNTY_ENDLESS_MONSTERS.map(enemy => {
    const sprite = ENEMY_PREVIEW_SPRITES[enemy.id]
    const assetPath = sprite.assetPath

    return applyCharacterConfig({
      id: `enemy-${enemy.id}`,
      sourceId: enemy.id,
      type: enemy.id === 'elite' || enemy.id === 'golem' ? 'elite' : 'enemy',
      typeLabel: enemy.id === 'elite' || enemy.id === 'golem' ? '精英怪' : '小怪',
      name: enemy.name,
      title: enemy.title,
      specialty: 'flying' in enemy && enemy.flying ? '远程/飞行单位' : 'heavy' in enemy && enemy.heavy ? '高血量压制' : '基础战斗单位',
      code: enemy.id.toUpperCase(),
      rarity: enemy.id === 'elite' || enemy.id === 'golem' ? '精英' : '普通',
      hp: enemy.hp,
      damage: enemy.damage,
      mobility: 'flying' in enemy && enemy.flying ? 12 : 'heavy' in enemy && enemy.heavy ? 6 : 9,
      rewardCoins: enemy.rewardCoins,
      rewardGems: enemy.rewardGems,
      coinPrice: null,
      gemPrice: null,
      passive: enemy.title,
      usage: '悬赏无尽试炼',
      projectId: null,
      projectTitle: '悬赏试炼',
      modelPath: assetPath,
      assetPath,
      color: enemy.color,
      ...spritePreview(sprite),
      previewMode: 'image' as const,
      previewImagePath: adminCharacterPreviewPath(`enemy-${enemy.id}`),
      status: 'active' as SimulationEntityStatus,
    }, configs)
  })

  const endlessBosses = BOUNTY_ENDLESS_BOSSES.map((boss, index) => {
    const bossSpriteId = ENDLESS_BOSS_SPRITE_IDS[index] ?? 'boss11'
    const sprite = BOSS_PREVIEW_SPRITES[bossSpriteId]
    const assetPath = sprite.assetPath
    const previewImagePath = adminCharacterPreviewPath(`boss-${boss.id}`)

    return applyCharacterConfig({
      id: `boss-${boss.id}`,
      sourceId: bossSpriteId,
      type: 'boss',
      typeLabel: 'Boss',
      name: boss.name,
      title: boss.title,
      specialty: '无尽试炼层主',
      code: boss.id.toUpperCase(),
      rarity: 'Boss',
      hp: boss.hp,
      damage: boss.damage,
      mobility: 5,
      rewardCoins: boss.rewardCoins,
      rewardGems: boss.rewardGems,
      coinPrice: null,
      gemPrice: null,
      passive: boss.title,
      usage: '悬赏无尽试炼',
      projectId: null,
      projectTitle: '悬赏试炼',
      modelPath: assetPath,
      assetPath,
      color: boss.color,
      ...spritePreview(sprite),
      previewMode: 'image' as const,
      previewImagePath,
      status: 'active' as SimulationEntityStatus,
    }, configs)
  })

  const projectBosses = PROJECT_MISSIONS.map(project => {
    const bossSpriteId = PROJECT_BOSS_SPRITE_IDS[project.id] ?? 'boss1'
    const sprite = BOSS_PREVIEW_SPRITES[bossSpriteId]
    const assetPath = sprite.assetPath
    const previewImagePath = adminCharacterPreviewPath(`project-boss-${project.id}`)

    return applyCharacterConfig({
      id: `project-boss-${project.id}`,
      sourceId: bossSpriteId,
      type: 'boss',
      typeLabel: project.finalBoss ? '终局 Boss' : '章节 Boss',
      name: project.bossName,
      title: project.bossTitle,
      specialty: project.riskSignal,
      code: project.missionCode,
      rarity: project.finalBoss ? '终局' : '章节',
      hp: project.finalBoss ? 420 : 260 + project.id * 8,
      damage: project.finalBoss ? 28 : 14 + Math.ceil(project.id / 2),
      mobility: project.finalBoss ? 7 : 6,
      rewardCoins: 360,
      rewardGems: 18,
      coinPrice: null,
      gemPrice: null,
      passive: project.caseFocus,
      usage: project.title,
      projectId: project.id,
      projectTitle: project.title,
      modelPath: assetPath,
      assetPath,
      ...spritePreview(sprite),
      previewMode: 'image' as const,
      previewImagePath,
      status: 'active' as SimulationEntityStatus,
    }, configs)
  })

  return [...heroes, ...enemies, ...endlessBosses, ...projectBosses]
}

function applyCharacterConfig<T extends {
  id: string
  name: string
  assetPath: string
  modelPath: string
  status: SimulationEntityStatus
  hp: number | null
  damage: number | null
  mobility: number | null
  rewardCoins: number | null
  rewardGems: number | null
  coinPrice: number | null
  gemPrice: number | null
  previewImagePath?: string
}>(base: T, configs: Map<string, SimulationAdminConfig>) {
  const config = configFor(configs, 'character', base.id)
  const assetPath = config?.assetPath || base.assetPath
  return {
    ...base,
    name: config?.displayName || base.name,
    assetPath,
    modelPath: assetPath,
    previewImagePath: config?.assetPath || base.previewImagePath,
    status: config?.status || base.status,
    notes: config?.notes || '',
    hp: typeof config?.hp === 'number' ? config.hp : base.hp,
    damage: typeof config?.damage === 'number' ? config.damage : base.damage,
    mobility: typeof config?.mobility === 'number' ? config.mobility : base.mobility,
    rewardCoins: typeof config?.rewardCoins === 'number' ? config.rewardCoins : base.rewardCoins,
    rewardGems: typeof config?.rewardGems === 'number' ? config.rewardGems : base.rewardGems,
    coinPrice: typeof config?.coinPrice === 'number' ? config.coinPrice : base.coinPrice,
    gemPrice: typeof config?.gemPrice === 'number' ? config.gemPrice : base.gemPrice,
    configUpdatedAt: config?.updatedAt || null,
    ...assetInfo(assetPath),
  }
}

function toProgressRecord(row: ProgressRow) {
  return {
    userId: row.user_id,
    displayName: row.real_name?.trim() || row.display_name,
    accountName: row.display_name,
    email: row.email,
    role: row.role,
    school: row.school || '未填写',
    major: row.major || '未选择',
    className: row.class_name || '默认班级',
    projectId: Number(row.project_id),
    medal: row.medal,
    medalLabel: MEDAL_LABELS[row.medal],
    bestScore: Number(row.best_score) || 0,
    storyScore: Number(row.story_score) || 0,
    bossAccuracy: Number(row.boss_accuracy) || 0,
    creditHours: round(Number(row.credit_hours) || 0),
    completedAt: row.completed_at,
    source: row.source,
  }
}

function toRewardFallbackRecord(row: RewardClaimRow, projectId: number) {
  const medal: ProjectMedal = 'bronze'
  return {
    userId: row.user_id,
    displayName: row.real_name?.trim() || row.display_name,
    accountName: row.display_name,
    email: row.email,
    role: row.role,
    school: row.school || '未填写',
    major: row.major || '未选择',
    className: row.class_name || '默认班级',
    projectId,
    medal,
    medalLabel: MEDAL_LABELS[medal],
    bestScore: 60,
    storyScore: 60,
    bossAccuracy: 60,
    creditHours: creditForProjectMedal(projectId, medal),
    completedAt: row.claimed_at,
    source: 'reward' as const,
  }
}

async function getSimulationRecords() {
  await ensureSimulationProjectProgressTable()

  const [progressRows] = await db.$client.execute<ProgressRow[]>(`
    SELECT
      p.user_id,
      u.display_name,
      u.real_name,
      u.email,
      u.role,
      u.school,
      u.major,
      u.class_name,
      p.project_id,
      p.medal,
      p.best_score,
      p.story_score,
      p.boss_accuracy,
      p.credit_hours,
      p.completed_at,
      'progress' AS source
    FROM simulation_project_progress p
    JOIN users u ON u.user_id = p.user_id
    WHERE p.medal <> 'none'
    ORDER BY p.completed_at DESC
  `)

  const records: Array<ReturnType<typeof toProgressRecord> | ReturnType<typeof toRewardFallbackRecord>> = progressRows
    .filter(row => isSimulationMedal(row.medal) && row.medal !== 'none')
    .map(toProgressRecord)

  const existingKeys = new Set(records.map(row => `${row.userId}:${row.projectId}`))
  const [rewardRows] = await db.$client.execute<RewardClaimRow[]>(`
    SELECT
      c.user_id,
      u.display_name,
      u.real_name,
      u.email,
      u.role,
      u.school,
      u.major,
      u.class_name,
      c.reward_key,
      c.xp,
      c.claimed_at
    FROM game_reward_claims c
    JOIN users u ON u.user_id = c.user_id
    WHERE c.reward_key LIKE 'simulation:project:%:completion'
    ORDER BY c.claimed_at DESC
  `)

  for (const row of rewardRows) {
    const projectId = rewardProjectId(row.reward_key)
    if (!projectId || !PROJECT_MISSIONS.some(project => project.id === projectId)) continue
    const key = `${row.user_id}:${projectId}`
    if (existingKeys.has(key)) continue

    records.push(toRewardFallbackRecord(row, projectId))
    existingKeys.add(key)
  }

  return records.sort((left, right) => new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime())
}

async function getStudentCount() {
  const [rows] = await db.$client.execute<UserCountRow[]>('SELECT COUNT(*) AS student_count FROM users WHERE role = ?', ['student'])
  return Number(rows[0]?.student_count ?? 0)
}

async function getSimulationTeams() {
  await ensureTeamCollaborationSchema()
  const [roomRows] = await db.$client.execute<TeamRoomRow[]>(`
    SELECT
      r.room_id,
      r.project_id,
      r.owner_id,
      r.title,
      r.status,
      r.created_at,
      r.updated_at,
      u.display_name AS owner_name,
      u.real_name AS owner_real_name,
      COUNT(m.user_id) AS member_count
    FROM team_story_rooms r
    LEFT JOIN users u ON u.user_id = r.owner_id
    LEFT JOIN team_story_room_members m ON m.room_id = r.room_id
    WHERE r.status IN ('open', 'started', 'playing')
    GROUP BY r.room_id, r.project_id, r.owner_id, r.title, r.status, r.created_at, r.updated_at, u.display_name, u.real_name
    ORDER BY r.updated_at DESC
    LIMIT 80
  `)

  if (!roomRows.length) return []

  const roomIds = roomRows.map(row => row.room_id)
  const placeholders = roomIds.map(() => '?').join(', ')
  const [memberRows] = await db.$client.execute<TeamMemberRow[]>(`
    SELECT
      m.room_id,
      m.user_id,
      u.display_name,
      u.real_name,
      u.school,
      u.class_name,
      u.major,
      m.role_id,
      m.combat_role_id,
      m.hp,
      m.member_status,
      m.joined_at
    FROM team_story_room_members m
    JOIN users u ON u.user_id = m.user_id
    WHERE m.room_id IN (${placeholders})
    ORDER BY m.joined_at ASC
  `, roomIds)
  const onlineIds = await getOnlineTeamUserIds()
  const membersByRoom = new Map<string, TeamMemberRow[]>()

  for (const member of memberRows) {
    const items = membersByRoom.get(member.room_id) ?? []
    items.push(member)
    membersByRoom.set(member.room_id, items)
  }

  return roomRows.map(room => {
    const project = getTeamProjectDefinition(Number(room.project_id))
    const members = (membersByRoom.get(room.room_id) ?? []).map(member => {
      const role = member.role_id ? roleCardsForTeamProject(Number(room.project_id)).find(item => item.roleId === member.role_id) : null
      const combatRole = member.combat_role_id ? TEAM_COMBAT_ROLES.find(item => item.roleId === member.combat_role_id) : null
      return {
        userId: member.user_id,
        displayName: member.real_name?.trim() || member.display_name,
        accountName: member.display_name,
        school: member.school || '未填写',
        className: member.class_name || '默认班级',
        major: member.major || '未选择',
        roleId: member.role_id,
        roleName: role?.name || null,
        combatRoleId: member.combat_role_id,
        combatRoleName: combatRole?.name || null,
        hp: Number(member.hp) || 0,
        status: member.member_status,
        online: onlineIds.has(member.user_id),
        joinedAt: member.joined_at,
      }
    })

    return {
      roomId: room.room_id,
      projectId: Number(room.project_id),
      projectTitle: project.title,
      missionCode: project.missionCode,
      title: room.title,
      status: room.status,
      ownerId: room.owner_id,
      ownerName: room.owner_real_name?.trim() || room.owner_name || room.owner_id,
      memberCount: Number(room.member_count) || members.length,
      onlineCount: members.filter(member => member.online).length,
      createdAt: room.created_at,
      updatedAt: room.updated_at,
      members,
    }
  })
}

async function getSimulationMembers(allRecords: Array<ReturnType<typeof toProgressRecord> | ReturnType<typeof toRewardFallbackRecord>>) {
  const [rows] = await db.$client.execute<SimulationMemberRow[]>(`
    SELECT
      u.user_id,
      u.display_name,
      u.real_name,
      u.email,
      u.school,
      u.major,
      u.class_name,
      u.created_at,
      gs.xp,
      gs.points,
      gs.rank_level,
      gs.rank_title,
      gs.streak_days,
      gs.max_streak,
      gs.last_login_date
    FROM users u
    LEFT JOIN user_game_state gs ON gs.user_id = u.user_id
    WHERE u.role = 'student'
    ORDER BY COALESCE(gs.xp, 0) DESC, u.created_at DESC
    LIMIT 160
  `)

  await ensureTeamCollaborationSchema()
  const onlineIds = await getOnlineTeamUserIds()
  const recordsByUser = new Map<string, typeof allRecords>()
  for (const record of allRecords) {
    const items = recordsByUser.get(record.userId) ?? []
    items.push(record)
    recordsByUser.set(record.userId, items)
  }

  return rows.map(row => {
    const records = recordsByUser.get(row.user_id) ?? []
    const projectIds = Array.from(new Set(records.map(record => record.projectId)))
    const counts = medalCounts(records)
    const totalCreditHours = round(records.reduce((sum, item) => sum + item.creditHours, 0))
    const bestScores = records.map(record => record.bestScore)
    const lastCompletedAt = records
      .map(record => record.completedAt)
      .filter(Boolean)
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null

    return {
      userId: row.user_id,
      displayName: row.real_name?.trim() || row.display_name,
      accountName: row.display_name,
      email: row.email,
      school: row.school || '未填写',
      major: row.major || '未选择',
      className: row.class_name || '默认班级',
      xp: Number(row.xp) || 0,
      points: Number(row.points) || 0,
      rankLevel: Number(row.rank_level) || 1,
      rankTitle: row.rank_title || 'GMP新人',
      streakDays: Number(row.streak_days) || 0,
      maxStreak: Number(row.max_streak) || 0,
      lastLoginDate: row.last_login_date,
      online: onlineIds.has(row.user_id),
      completedProjectCount: projectIds.length,
      unlockedProjectCount: Math.min(PROJECT_MISSIONS.length, projectIds.length + 1),
      totalCreditHours,
      averageBestScore: scoreAverage(bestScores),
      medalCounts: counts,
      lastCompletedAt,
      coins: null,
      gems: null,
      trophies: null,
      unlockedHeroCount: 1,
      unlockedHeroes: ['骑士英雄'],
      walletSource: 'client-local-storage',
      walletSyncStatus: '金币、钻石和英雄解锁目前存于客户端钱包，后台暂不可读取真实余额。',
      createdAt: row.created_at,
    }
  })
}

function filterRecords<T extends { projectId: number; medal: ProjectMedal; displayName: string; email: string; school: string; className: string; major: string }>(
  records: T[],
  req: NextRequest,
) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId') || 'all'
  const medal = searchParams.get('medal') || 'all'
  const search = (searchParams.get('search') || '').trim().toLowerCase()

  return records.filter(record => {
    if (projectId !== 'all' && record.projectId !== Number(projectId)) return false
    if (medal !== 'all' && record.medal !== medal) return false
    if (!search) return true
    const haystack = [record.displayName, record.email, record.school, record.className, record.major].join(' ').toLowerCase()
    return haystack.includes(search)
  })
}

export async function GET(req: NextRequest) {
  if (!ensureAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const allRecords = await getSimulationRecords()
  const records = filterRecords(allRecords, req)
  const studentCount = await getStudentCount()
  const configs = await loadSimulationAdminConfigs()
  const maps = buildSimulationMaps(configs)
  const projects = buildSimulationProjects(allRecords, configs)
  const characters = buildSimulationCharacters(configs)
  const teams = await getSimulationTeams()
  const members = await getSimulationMembers(allRecords)
  const projectById = new Map(projects.map(project => [project.id, project]))

  const participantCount = new Set(allRecords.map(record => record.userId)).size
  const allMedalCounts = medalCounts(allRecords)
  const totalSlots = studentCount * PROJECT_MISSIONS.length
  const totalCreditHours = round(allRecords.reduce((sum, item) => sum + item.creditHours, 0))
  const filteredRecords = records.map(record => {
    const project = projectById.get(record.projectId)
    return {
      ...record,
      projectTitle: project?.title || `项目 ${record.projectId}`,
      missionCode: project?.missionCode || `MISSION ${record.projectId}`,
      finalBoss: Boolean(project?.finalBoss),
    }
  })
  const configuredEntityCount = Array.from(configs.values()).length

  return NextResponse.json({
    summary: {
      projectCount: PROJECT_MISSIONS.length,
      regularProjectCount: PROJECT_MISSIONS.filter(project => !project.finalBoss).length,
      finalBossCount: PROJECT_MISSIONS.filter(project => project.finalBoss).length,
      sceneCount: PROJECT_MISSIONS.reduce((sum, project) => sum + project.scenes.length, 0),
      npcCount: PROJECT_MISSIONS.reduce((sum, project) => sum + project.npcs.length, 0),
      questionCount: projects.reduce((sum, item) => sum + item.questionCount, 0),
      mapCount: maps.length,
      characterCount: characters.length,
      activeTeamCount: teams.length,
      memberCount: members.length,
      configuredEntityCount,
      studentCount,
      participantCount,
      completedProjectCount: allRecords.length,
      completionRate: totalSlots ? round((allRecords.length / totalSlots) * 100) : 0,
      averageBestScore: scoreAverage(allRecords.map(item => item.bestScore)),
      totalCreditHours,
      goldCount: allMedalCounts.gold,
      silverCount: allMedalCounts.silver,
      bronzeCount: allMedalCounts.bronze,
    },
    creditRules: COURSE_CREDIT_RULES,
    distributions: {
      medals: [
        { label: '金牌', value: allMedalCounts.gold },
        { label: '银牌', value: allMedalCounts.silver },
        { label: '铜牌', value: allMedalCounts.bronze },
      ],
      completionByProject: projects.map(project => ({ label: `${project.id}. ${project.title}`, value: project.completionCount })),
      creditByProject: projects.map(project => ({ label: `${project.id}. ${project.title}`, value: project.creditHours })),
      charactersByType: ['英雄', '小怪', '精英怪', 'Boss'].map(label => ({
        label,
        value: characters.filter(character => character.typeLabel === label || (label === 'Boss' && character.typeLabel.includes('Boss'))).length,
      })),
      teamsByStatus: ['open', 'started', 'playing'].map(status => ({
        label: status,
        value: teams.filter(team => team.status === status).length,
      })),
    },
    operations: {
      modules: [
        { key: 'members', title: '成员管理', desc: '查看成员等级、积分、通关、课时分和客户端钱包同步状态。', count: members.length },
        { key: 'maps', title: '地图管理', desc: '管理章节地图、悬赏地图和自定义地图资源路径。', count: maps.length },
        { key: 'projects', title: '项目管理', desc: '配置 11 个章节项目的内容、风险信号和 Boss 信息。', count: projects.length },
        { key: 'characters', title: '人物管理', desc: '管理英雄、小怪、精英怪与 Boss 的真实战斗模型和数值。', count: characters.length },
        { key: 'teams', title: '组队管理', desc: '查看当前开放或进行中的队伍、成员、角色和项目。', count: teams.length },
        { key: 'records', title: '通关记录', desc: '查询、导出或重置学生项目通关进度。', count: filteredRecords.length },
      ],
      walletSyncNote: '金币、钻石、奖杯和英雄解锁目前由前台 localStorage 钱包保存；后台展示服务器侧积分/等级，并保留钱包同步提示。',
      assetManageNote: '地图和人物的更换/新增通过后台资源路径配置完成，不会物理删除 public/simulation 下的素材文件。',
    },
    maps,
    projects,
    characters,
    teams,
    members,
    records: filteredRecords,
    total: filteredRecords.length,
  })
}

export async function PUT(req: NextRequest) {
  if (!ensureAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!isRecord(body)) {
    return NextResponse.json({ error: '请求体格式不正确' }, { status: 400 })
  }

  const scope = trimString(body.scope, 64) as SimulationConfigScope | undefined
  const entityId = trimString(body.entityId, 191)
  if (!scope || !CONFIG_SCOPES.has(scope) || !entityId) {
    return NextResponse.json({ error: '缺少有效的配置范围或实体 ID' }, { status: 400 })
  }

  const config = sanitizeConfig(body.config)
  await ensureSimulationAdminConfigTable()
  await db.$client.execute(`
    INSERT INTO simulation_admin_configs (scope, entity_id, config_json)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE
      config_json = VALUES(config_json),
      updated_at = CURRENT_TIMESTAMP(3)
  `, [scope, entityId, JSON.stringify(config)])

  return NextResponse.json({ success: true, scope, entityId, config })
}

export async function DELETE(req: NextRequest) {
  if (!ensureAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const scope = searchParams.get('scope')?.trim() as SimulationConfigScope | undefined
  const entityId = searchParams.get('entityId')?.trim()

  if (scope || entityId) {
    if (!scope || !CONFIG_SCOPES.has(scope) || !entityId) {
      return NextResponse.json({ error: '缺少有效的配置范围或实体 ID' }, { status: 400 })
    }
    await ensureSimulationAdminConfigTable()
    await db.$client.execute('DELETE FROM simulation_admin_configs WHERE scope = ? AND entity_id = ?', [scope, entityId])
    return NextResponse.json({ success: true, scope, entityId })
  }

  const userId = searchParams.get('userId')?.trim()
  const projectIdParam = searchParams.get('projectId')?.trim() || 'all'
  const projectId = projectIdParam === 'all' ? null : Number(projectIdParam)

  if (!userId) {
    return NextResponse.json({ error: '缺少用户 ID' }, { status: 400 })
  }
  if (projectId !== null && (!Number.isInteger(projectId) || !PROJECT_MISSIONS.some(project => project.id === projectId))) {
    return NextResponse.json({ error: '实训项目不存在' }, { status: 400 })
  }

  await ensureSimulationProjectProgressTable()
  const connection = await db.$client.getConnection()

  try {
    await connection.beginTransaction()

    const rewardWhere = projectId === null
      ? "user_id = ? AND reward_key LIKE 'simulation:project:%:completion'"
      : 'user_id = ? AND reward_key = ?'
    const rewardParams = projectId === null ? [userId] : [userId, `simulation:project:${projectId}:completion`]

    const [rewardRows] = await connection.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(xp), 0) AS xp FROM game_reward_claims WHERE ${rewardWhere}`,
      rewardParams,
    )
    const xpToRemove = Number((rewardRows[0] as XpRow | undefined)?.xp ?? 0)

    if (projectId === null) {
      await connection.execute('DELETE FROM simulation_project_progress WHERE user_id = ?', [userId])
    } else {
      await connection.execute('DELETE FROM simulation_project_progress WHERE user_id = ? AND project_id = ?', [userId, projectId])
    }
    await connection.execute(`DELETE FROM game_reward_claims WHERE ${rewardWhere}`, rewardParams)

    if (xpToRemove > 0) {
      const [stateRows] = await connection.execute<RowDataPacket[]>(
        'SELECT xp FROM user_game_state WHERE user_id = ? FOR UPDATE',
        [userId],
      )
      const currentXp = Number((stateRows[0] as XpRow | undefined)?.xp ?? 0)
      const nextXp = Math.max(0, currentXp - xpToRemove)
      const nextRank = getRankByXp(nextXp)
      await connection.execute(`
        UPDATE user_game_state
        SET xp = ?, rank_level = ?, rank_title = ?
        WHERE user_id = ?
      `, [nextXp, nextRank.level, nextRank.title, userId])
    }

    await connection.commit()
    return NextResponse.json({ success: true, xpRemoved: xpToRemove })
  } catch (error) {
    await connection.rollback()
    console.error('reset simulation progress failed', error)
    return NextResponse.json({ error: '重置实训进度失败' }, { status: 500 })
  } finally {
    connection.release()
  }
}
