import { randomUUID } from 'crypto'
import { db } from '@/db'
import { getProjectDefinition } from '@/lib/simulation/project-missions'
import {
  getUserSimulationProjectProgress,
  isSimulationProjectUnlocked,
} from '@/lib/simulation/project-progress-store'

export interface TeamRoleCard {
  roleId: string
  name: string
  department: string
  identity: string
  avatarTone: string
  privateKnowledge: string[]
  goal: string
  disclosureRules: string[]
}

export interface TeamCombatRole {
  roleId: 'knight-hero' | 'knight2' | 'pixel-knight' | 'sprite-hero' | 'black-knight' | 'demon-warrior'
  name: string
  code: string
  tagline: string
  specialty: string
  accent: string
}

export interface TeamUserRow {
  user_id: string
  display_name: string
  real_name: string | null
  school: string | null
  class_name: string | null
  major: string | null
  avatar_url: string | null
}

let schemaEnsured = false
let playStateSchemaEnsured = false
export const TEAM_ENDLESS_TRIAL_PROJECT_ID = 99
export const TEAM_MIN_ENTRY_HP = 60

export async function ensureTeamCollaborationSchema() {
  if (schemaEnsured) return

  await db.raw.run(`
    CREATE TABLE IF NOT EXISTS team_friendships (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_a_id VARCHAR(191) NOT NULL,
      user_b_id VARCHAR(191) NOT NULL,
      requester_id VARCHAR(191) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'accepted',
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uniq_team_friend_pair (user_a_id, user_b_id),
      KEY idx_team_friendships_user_a (user_a_id),
      KEY idx_team_friendships_user_b (user_b_id),
      KEY idx_team_friendships_requester (requester_id)
    )
  `)

  await db.raw.run(`
    CREATE TABLE IF NOT EXISTS team_private_messages (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      sender_id VARCHAR(191) NOT NULL,
      receiver_id VARCHAR(191) NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      read_at DATETIME(3),
      KEY idx_team_private_pair_time (sender_id, receiver_id, created_at),
      KEY idx_team_private_receiver_time (receiver_id, created_at),
      KEY idx_team_private_receiver_read (receiver_id, read_at, created_at)
    )
  `)
  await db.raw.run(`ALTER TABLE team_private_messages ADD COLUMN read_at DATETIME(3)`).catch(() => undefined)
  await db.raw.run(`ALTER TABLE team_private_messages ADD KEY idx_team_private_receiver_read (receiver_id, read_at, created_at)`).catch(() => undefined)

  await db.raw.run(`
    CREATE TABLE IF NOT EXISTS team_story_rooms (
      room_id VARCHAR(64) NOT NULL PRIMARY KEY,
      project_id INT NOT NULL,
      owner_id VARCHAR(191) NOT NULL,
      title VARCHAR(255) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'open',
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      KEY idx_team_story_rooms_owner (owner_id),
      KEY idx_team_story_rooms_project (project_id, status)
    )
  `)

  await db.raw.run(`
    CREATE TABLE IF NOT EXISTS team_story_room_members (
      room_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(191) NOT NULL,
      role_id VARCHAR(64),
      combat_role_id VARCHAR(64),
      hp INT NOT NULL DEFAULT 100,
      member_status VARCHAR(32) NOT NULL DEFAULT 'joined',
      joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (room_id, user_id),
      UNIQUE KEY uniq_team_room_role (room_id, role_id),
      KEY idx_team_room_members_user (user_id)
    )
  `)
  await db.raw.run(`ALTER TABLE team_story_room_members ADD COLUMN combat_role_id VARCHAR(64)`).catch(() => undefined)
  await db.raw.run(`ALTER TABLE team_story_room_members ADD COLUMN hp INT NOT NULL DEFAULT 100`).catch(() => undefined)
  await db.raw.run(`ALTER TABLE team_story_room_members DROP INDEX uniq_team_room_combat_role`).catch(() => undefined)

  await db.raw.run(`
    CREATE TABLE IF NOT EXISTS team_story_messages (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      room_id VARCHAR(64) NOT NULL,
      sender_id VARCHAR(191),
      sender_type VARCHAR(32) NOT NULL DEFAULT 'user',
      role_id VARCHAR(64),
      content TEXT NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY idx_team_story_messages_room_time (room_id, created_at)
    )
  `)

  await db.raw.run(`
    CREATE TABLE IF NOT EXISTS team_presence (
      user_id VARCHAR(191) NOT NULL PRIMARY KEY,
      last_seen DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      activity_status VARCHAR(32) NOT NULL DEFAULT 'idle',
      activity_project_id INT,
      activity_room_id VARCHAR(64),
      activity_updated_at DATETIME(3),
      KEY idx_team_presence_last_seen (last_seen)
    )
  `)
  await db.raw.run(`ALTER TABLE team_presence ADD COLUMN activity_status VARCHAR(32) NOT NULL DEFAULT 'idle'`).catch(() => undefined)
  await db.raw.run(`ALTER TABLE team_presence ADD COLUMN activity_project_id INT`).catch(() => undefined)
  await db.raw.run(`ALTER TABLE team_presence ADD COLUMN activity_room_id VARCHAR(64)`).catch(() => undefined)
  await db.raw.run(`ALTER TABLE team_presence ADD COLUMN activity_updated_at DATETIME(3)`).catch(() => undefined)

  await db.raw.run(`
    CREATE TABLE IF NOT EXISTS team_room_invitations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      room_id VARCHAR(64) NOT NULL,
      inviter_id VARCHAR(191) NOT NULL,
      invitee_id VARCHAR(191) NOT NULL,
      requested_by_id VARCHAR(191) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      responded_at DATETIME(3),
      KEY idx_team_room_invitee_status (invitee_id, status, updated_at),
      KEY idx_team_room_owner_approval (room_id, status, updated_at),
      KEY idx_team_room_inviter (inviter_id, updated_at)
    )
  `)

  await db.raw.run(`
    INSERT INTO team_room_invitations (room_id, inviter_id, invitee_id, requested_by_id, status)
    SELECT m.room_id, r.owner_id, m.user_id, r.owner_id, 'pending'
    FROM team_story_room_members m
    INNER JOIN team_story_rooms r ON r.room_id = m.room_id
    WHERE m.member_status = 'invited'
      AND m.user_id <> r.owner_id
      AND NOT EXISTS (
        SELECT 1
        FROM team_room_invitations i
        WHERE i.room_id = m.room_id
          AND i.invitee_id = m.user_id
          AND i.status IN ('pending', 'owner_pending')
      )
  `)
  await db.raw.run(`
    DELETE FROM team_story_room_members
    WHERE member_status = 'invited'
  `)

  schemaEnsured = true
}

export async function touchTeamPresence(userId: string) {
  await ensureTeamCollaborationSchema()
  await db.raw.run(
    `INSERT INTO team_presence (user_id, last_seen)
     VALUES (?, CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE last_seen = CURRENT_TIMESTAMP(3)`,
    [userId],
  )
}

export async function setTeamActivityStatus(
  userId: string,
  status: 'idle' | 'solo' | 'team',
  projectId?: number | null,
  roomId?: string | null,
) {
  await ensureTeamCollaborationSchema()
  const active = status === 'idle' ? null : status
  await db.raw.run(
    `INSERT INTO team_presence
       (user_id, last_seen, activity_status, activity_project_id, activity_room_id, activity_updated_at)
     VALUES (?, CURRENT_TIMESTAMP(3), ?, ?, ?, CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       last_seen = CURRENT_TIMESTAMP(3),
       activity_status = VALUES(activity_status),
       activity_project_id = VALUES(activity_project_id),
       activity_room_id = VALUES(activity_room_id),
       activity_updated_at = CURRENT_TIMESTAMP(3)`,
    [userId, active ?? 'idle', active ? projectId ?? null : null, active ? roomId ?? null : null],
  )
}

export async function getOnlineTeamUserIds() {
  await ensureTeamCollaborationSchema()
  const rows = await db.raw.all<{ user_id: string }>(
    `SELECT user_id
     FROM team_presence
     WHERE last_seen >= DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 90 SECOND)`,
  )
  return new Set(rows.map(row => row.user_id))
}

export async function isTeamUserOnline(userId: string) {
  await ensureTeamCollaborationSchema()
  const row = await db.raw.get<{ user_id: string }>(
    `SELECT user_id
     FROM team_presence
     WHERE user_id = ?
       AND last_seen >= DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 90 SECOND)`,
    [userId],
  )
  return Boolean(row)
}

export async function ensureTeamPlayStateSchema() {
  if (playStateSchemaEnsured) return

  await ensureTeamCollaborationSchema()
  await db.raw.run(`
    CREATE TABLE IF NOT EXISTS team_play_states (
      room_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(191) NOT NULL,
      display_name VARCHAR(191) NOT NULL,
      model_id VARCHAR(64) NOT NULL,
      x DOUBLE NOT NULL DEFAULT 120,
      lane DOUBLE NOT NULL DEFAULT 1,
      facing TINYINT NOT NULL DEFAULT 1,
      moving TINYINT(1) NOT NULL DEFAULT 0,
      attacking TINYINT(1) NOT NULL DEFAULT 0,
      attack_sequence INT NOT NULL DEFAULT 0,
      attack_phase INT NOT NULL DEFAULT 0,
      hp INT NOT NULL DEFAULT 140,
      player_status VARCHAR(32) NOT NULL DEFAULT 'playing',
      quiz_json LONGTEXT,
      sync_seq BIGINT NOT NULL DEFAULT 0,
      client_updated_at_ms BIGINT,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (room_id, user_id),
      KEY idx_team_play_states_room_time (room_id, updated_at)
    )
  `)
  await db.raw.run(`ALTER TABLE team_play_states ADD COLUMN player_status VARCHAR(32) NOT NULL DEFAULT 'playing'`).catch(() => undefined)
  await db.raw.run(`ALTER TABLE team_play_states ADD COLUMN quiz_json LONGTEXT`).catch(() => undefined)
  await db.raw.run(`ALTER TABLE team_play_states ADD COLUMN attack_sequence INT NOT NULL DEFAULT 0`).catch(() => undefined)
  await db.raw.run(`ALTER TABLE team_play_states ADD COLUMN attack_phase INT NOT NULL DEFAULT 0`).catch(() => undefined)
  await db.raw.run(`ALTER TABLE team_play_states ADD COLUMN sync_seq BIGINT NOT NULL DEFAULT 0`).catch(() => undefined)
  await db.raw.run(`ALTER TABLE team_play_states ADD COLUMN client_updated_at_ms BIGINT`).catch(() => undefined)

  await db.raw.run(`
    CREATE TABLE IF NOT EXISTS team_play_room_states (
      room_id VARCHAR(64) NOT NULL PRIMARY KEY,
      state_json LONGTEXT,
      event_json LONGTEXT,
      updated_by_user_id VARCHAR(191),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      KEY idx_team_play_room_states_time (updated_at)
    )
  `)
  playStateSchemaEnsured = true
}

export async function canUserEnterSimulationProject(userId: string, projectId: number) {
  const progress = await getUserSimulationProjectProgress(userId)
  return isSimulationProjectUnlocked(progress, projectId)
}

export function isTeamEndlessTrialProject(projectId: number) {
  return Number(projectId) === TEAM_ENDLESS_TRIAL_PROJECT_ID
}

export function getTeamProjectDefinition(projectId: number) {
  if (!isTeamEndlessTrialProject(projectId)) return getProjectDefinition(projectId)
  const base = getProjectDefinition(11)
  return {
    ...base,
    id: TEAM_ENDLESS_TRIAL_PROJECT_ID,
    missionCode: 'ENDLESS',
    title: '悬赏无尽试炼',
    curriculum: '悬赏训练',
    caseFocus: '无源头裂隙生存战',
    riskSignal: '所有章节怪物会随机出现，清理每层全部怪物后进入下一层。',
    firstAction: '组队进入无剧情生存战，尽可能推进更多层数。',
  }
}

export async function canUserEnterTeamProject(userId: string, projectId: number) {
  if (isTeamEndlessTrialProject(projectId)) return true
  return canUserEnterSimulationProject(userId, projectId)
}

export function sortedFriendPair(left: string, right: string) {
  return left < right ? [left, right] as const : [right, left] as const
}

export function teamRoomId() {
  return `team-${randomUUID()}`
}

export const TEAM_COMBAT_ROLES: TeamCombatRole[] = [
  {
    roleId: 'knight-hero',
    name: '骑士英雄',
    code: 'FIELD-01',
    tagline: '近场核验',
    specialty: '现场确认 / 快速处置',
    accent: '#efc566',
  },
  {
    roleId: 'knight2',
    name: '圣辉骑士',
    code: 'FIELD-05',
    tagline: '连段突进',
    specialty: '近战连段 / 快速突进',
    accent: '#d8f56a',
  },
  {
    roleId: 'pixel-knight',
    name: '像素骑士',
    code: 'FIELD-06',
    tagline: '盾剑突击',
    specialty: '盾牌防守 / 近战斩击',
    accent: '#f06f5a',
  },
  {
    roleId: 'sprite-hero',
    name: '蓝刃剑士',
    code: 'TRACE-02',
    tagline: '证据追踪',
    specialty: '流程追踪 / 证据保全',
    accent: '#68d7c2',
  },
  {
    roleId: 'black-knight',
    name: '黑甲骑士',
    code: 'RISK-03',
    tagline: '风险压制',
    specialty: '风险识别 / 区域观察',
    accent: '#82b9ff',
  },
  {
    roleId: 'demon-warrior',
    name: '恶魔武士',
    code: 'NIGHT-04',
    tagline: '暗影斩击',
    specialty: '暗影突袭 / 连段压制',
    accent: '#b878ff',
  },
]

export function teamCombatRoleById(roleId: string) {
  return TEAM_COMBAT_ROLES.find(role => role.roleId === roleId) ?? null
}

export function normalizeTeamUser(row: TeamUserRow) {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    realName: row.real_name,
    school: row.school,
    className: row.class_name,
    major: row.major,
    avatarUrl: row.avatar_url,
  }
}

export async function getUserSummary(userId: string) {
  const row = await db.raw.get<TeamUserRow>(
    `SELECT user_id, display_name, real_name, school, class_name, major, avatar_url
     FROM users
     WHERE user_id = ?`,
    [userId],
  )
  return row ? normalizeTeamUser(row) : null
}

export function roleCardsForProject(projectId: number): TeamRoleCard[] {
  const project = getProjectDefinition(projectId)
  const firstScene = project.scenes[0]
  const secondScene = project.scenes[1] ?? firstScene
  const thirdScene = project.scenes[2] ?? firstScene

  return [
    {
      roleId: 'qa_coordinator',
      name: '林严谨',
      department: 'QA质量部',
      identity: '偏差调查协调员',
      avatarTone: '#64cce7',
      privateKnowledge: [
        `掌握本项目风险信号：${project.riskSignal}`,
        `知道需要优先保全的证据：${project.keyEvidence[0] ?? project.caseFocus}`,
        `知道${firstScene.title}与最终 Boss 核验之间存在关联`,
      ],
      goal: '协调各岗位拼出完整风险图，提醒团队不要跳过证据链。',
      disclosureRules: [
        '可以主动提醒调查流程和证据保全。',
        '不能直接给出 Boss 答案。',
        '只有被问到“下一步怎么做”时，才给出明确处置顺序。',
      ],
    },
    {
      roleId: 'qc_analyst',
      name: '李敏',
      department: 'QC实验室',
      identity: '检验数据分析员',
      avatarTone: '#59d99d',
      privateKnowledge: [
        `${secondScene.title}的原始记录里有一个异常点：${secondScene.defect}`,
        `检验侧目标是：${secondScene.objective}`,
        `知道检测数据是否能支撑${project.caseFocus}的初步判断`,
      ],
      goal: '提供检验数据和记录完整性线索，引导团队追问数据来源。',
      disclosureRules: [
        '主动说明检验结果和数据状态。',
        '原始记录缺口只有被追问时才展开。',
        '不要替主角下最终放行结论。',
      ],
    },
    {
      roleId: 'production_lead',
      name: '王瑶',
      department: '生产车间',
      identity: '现场负责人',
      avatarTone: '#f2c86b',
      privateKnowledge: [
        `${firstScene.title}现场看到的直接问题是：${firstScene.defect}`,
        `现场动作目标是：${firstScene.objective}`,
        `知道人员、设备或记录环节里可能有未说清的前因`,
      ],
      goal: '提供现场操作和批记录线索，但需要团队持续追问才会暴露隐蔽风险。',
      disclosureRules: [
        '主动说明现场已知事实。',
        '对责任归属保持谨慎，避免一开始承认全部问题。',
        '被 QA 或 QC 连续追问时，可以补充隐藏细节。',
      ],
    },
    {
      roleId: 'validation_owner',
      name: '周明澜',
      department: '验证/工程',
      identity: '验证负责人',
      avatarTone: '#b878ff',
      privateKnowledge: [
        `${thirdScene.title}可能需要验证或再确认支撑`,
        `验证侧关注点是：${thirdScene.objective}`,
        `知道某些控制措施是否只停留在文件上`,
      ],
      goal: '补足验证、设备、系统控制证据，帮助团队判断 CAPA 是否能闭环。',
      disclosureRules: [
        '主动说明验证状态。',
        '只有被问到“是否再确认”时，才展开验证缺口。',
        '不能直接替团队写 CAPA 结论。',
      ],
    },
  ]
}

export function roleCardsForTeamProject(projectId: number): TeamRoleCard[] {
  if (isTeamEndlessTrialProject(projectId)) return []
  return roleCardsForProject(projectId)
}

export function roleCardById(projectId: number, roleId: string) {
  return roleCardsForTeamProject(projectId).find(role => role.roleId === roleId) ?? null
}

export function buildRoleAgentQuestion(params: {
  projectId: number
  roleCard: TeamRoleCard
  userQuestion: string
  recentMessages: Array<{ speaker: string; content: string }>
}) {
  const project = getProjectDefinition(params.projectId)
  const recent = params.recentMessages.slice(-8).map(message => `${message.speaker}：${message.content}`).join('\n') || '暂无历史对话。'

  return [
    `你正在扮演 GMP 团队协作剧情里的 NPC 角色：${params.roleCard.name}。`,
    `岗位身份：${params.roleCard.department} / ${params.roleCard.identity}`,
    `当前项目：${project.title}`,
    `项目风险信号：${project.riskSignal}`,
    `案例焦点：${project.caseFocus}`,
    '',
    '你的专属知识，只能基于这些内容回答：',
    ...params.roleCard.privateKnowledge.map(item => `- ${item}`),
    '',
    `你的行动目标：${params.roleCard.goal}`,
    '信息透露边界：',
    ...params.roleCard.disclosureRules.map(item => `- ${item}`),
    '',
    '最近团队对话：',
    recent,
    '',
    `主角/队友追问：${params.userQuestion}`,
    '',
    '回答要求：',
    '1. 必须以该角色第一人称回答，像剧情角色而不是老师讲课。',
    '2. 只能透露角色卡允许的信息，不能直接给最终答案。',
    '3. 回答 120 字以内，并主动引导团队下一步该问谁或查哪条证据。',
  ].join('\n')
}

export async function generateRoleAgentReply(params: {
  projectId: number
  roleCard: TeamRoleCard
  userQuestion: string
  recentMessages: Array<{ speaker: string; content: string }>
}) {
  const question = buildRoleAgentQuestion(params)
  const apiUrl = process.env.AGENT_API_URL ?? 'http://127.0.0.1:8001'

  try {
    const response = await fetch(`${apiUrl}/chat/tutor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        audience: 'student',
        history: [],
      }),
    })

    const data = await response.json().catch(() => null) as Record<string, unknown> | null
    const content = (
      typeof data?.answer === 'string' ? data.answer :
      typeof data?.reply === 'string' ? data.reply :
      typeof data?.content === 'string' ? data.content :
      typeof data?.message === 'string' ? data.message :
      typeof data?.text === 'string' ? data.text :
      ''
    ).trim()
    if (response.ok && content) return content.slice(0, 700)
  } catch {
    // Fall through to deterministic fallback below.
  }

  const firstKnowledge = params.roleCard.privateKnowledge[0] ?? '我这边掌握的信息还不完整'
  return `我是${params.roleCard.name}。我能先确认：${firstKnowledge}。你可以继续追问我证据细节，或者让其他岗位补充现场/验证侧信息。`
}
