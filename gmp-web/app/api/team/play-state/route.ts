import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { ensureTeamPlayStateSchema, touchTeamPresence } from '@/lib/team-collaboration'

const PLAYER_MODEL_IDS = new Set(['knight-hero', 'knight2', 'pixel-knight', 'sprite-hero', 'black-knight', 'demon-warrior'])

interface TeamPlayStateRow {
  room_id: string
  user_id: string
  display_name: string
  model_id: string
  x: number
  lane: number
  facing: number
  moving: number
  attacking: number
  attack_sequence: number
  attack_phase: number
  hp: number
  player_status: string
  quiz_json: string | null
  ai_controlled: number
  sync_seq: number | string | null
  client_updated_at_ms: number | string | null
  updated_at: string
}

interface TeamPlayRoomStateRow {
  room_id: string
  state_json: string | null
  event_json: string | null
  updated_by_user_id: string | null
  updated_at: string
}

interface PlayRoomStatusRow {
  room_id: string
  status: string
  owner_id: string
  is_member: number
}

function auth(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  return token ? verifyToken(token) : null
}

function clamp(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(max, number))
}

async function requireStartedRoomMember(roomId: string, userId: string) {
  return db.raw.get<{ display_name: string; owner_id: string; combat_role_id: string | null; member_status: string }>(
    `SELECT u.display_name, r.owner_id, m.combat_role_id, m.member_status
     FROM team_story_room_members m
     INNER JOIN team_story_rooms r ON r.room_id = m.room_id
     INNER JOIN users u ON u.user_id = m.user_id
     WHERE m.room_id = ?
       AND m.user_id = ?
       AND r.status = 'started'`,
    [roomId, userId],
  )
}

function parseJson(value: string | null) {
  if (!value) return null
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function stringifyJson(value: unknown, maxLength = 90000) {
  if (!value || typeof value !== 'object') return null
  const text = JSON.stringify(value)
  return text.length > maxLength ? null : text
}

function normalizeNumeric(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function isStaleIncomingState(
  existing: { sync_seq?: number | string | null; client_updated_at_ms?: number | string | null } | null | undefined,
  syncSeq: number,
  updatedAtMs: number,
) {
  if (!existing) return false
  const previousSeq = normalizeNumeric(existing.sync_seq)
  const previousAt = normalizeNumeric(existing.client_updated_at_ms)
  if (previousSeq > 0 && syncSeq <= 0) return true
  if (previousSeq > 0 && syncSeq > 0) {
    if (syncSeq < previousSeq) return true
    if (syncSeq === previousSeq && updatedAtMs <= previousAt) return true
    return false
  }
  return previousAt > 0 && updatedAtMs > 0 && updatedAtMs + 80 < previousAt
}

function serializePlayState(row: TeamPlayStateRow) {
  const syncSeq = Math.max(0, Math.round(normalizeNumeric(row.sync_seq)))
  const clientUpdatedAtMs = normalizeNumeric(row.client_updated_at_ms)
  const fallbackUpdatedAtMs = Date.parse(String(row.updated_at ?? ''))
  const updatedAtMs = clientUpdatedAtMs > 0
    ? Math.round(clientUpdatedAtMs)
    : Number.isFinite(fallbackUpdatedAtMs)
      ? fallbackUpdatedAtMs
      : Date.now()
  return {
    roomId: row.room_id,
    userId: row.user_id,
    displayName: row.display_name,
    modelId: row.model_id,
    x: Number(row.x),
    lane: Number(row.lane),
    facing: row.facing === -1 ? -1 : 1,
    moving: Boolean(row.moving),
    attacking: Boolean(row.attacking),
    attackSequence: Number(row.attack_sequence ?? 0),
    attackPhase: Number(row.attack_phase ?? 0),
    hp: Number(row.hp),
    status: row.player_status || 'playing',
    activeQuiz: parseJson(row.quiz_json),
    aiControlled: Boolean(row.ai_controlled),
    syncSeq,
    seq: syncSeq,
    updatedAtMs,
    updatedAt: row.updated_at,
  }
}

function normalizePlayerStatus(value: unknown) {
  return value === 'downed' || value === 'answering' || value === 'reviving' || value === 'exited' ? value : 'playing'
}

async function endBattleIfAllPlayersExited(roomId: string, byUserId: string) {
  const state = await db.raw.get<{ total: number; active: number }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN COALESCE(ps.player_status, 'playing') <> 'exited' THEN 1 ELSE 0 END) AS active
     FROM team_story_room_members m
     LEFT JOIN team_play_states ps ON ps.room_id = m.room_id AND ps.user_id = m.user_id
     WHERE m.room_id = ?
       AND m.combat_role_id IS NOT NULL`,
    [roomId],
  )
  if (!state || Number(state.total ?? 0) <= 0 || Number(state.active ?? 0) > 0) return false

  await db.raw.run(
    `UPDATE team_story_rooms
     SET status = 'open', updated_at = CURRENT_TIMESTAMP(3)
     WHERE room_id = ? AND status = 'started'`,
    [roomId],
  )
  await db.raw.run(
    `UPDATE team_story_room_members
     SET member_status = 'joined', combat_role_id = NULL, updated_at = CURRENT_TIMESTAMP(3)
     WHERE room_id = ?`,
    [roomId],
  )
  await db.raw.run(`DELETE FROM team_play_states WHERE room_id = ?`, [roomId]).catch(() => undefined)
  await db.raw.run(`DELETE FROM team_play_room_states WHERE room_id = ?`, [roomId]).catch(() => undefined)
  await db.raw.run(
    `INSERT INTO team_play_room_states (room_id, state_json, event_json, updated_by_user_id)
     VALUES (?, NULL, ?, ?)
     ON DUPLICATE KEY UPDATE
       state_json = NULL,
       event_json = VALUES(event_json),
       updated_by_user_id = VALUES(updated_by_user_id),
       updated_at = CURRENT_TIMESTAMP(3)`,
    [roomId, JSON.stringify({ type: 'battleEnded', byUserId, at: Date.now(), reason: 'allExited' }), byUserId],
  ).catch(() => undefined)
  return true
}

export async function GET(req: NextRequest) {
  const payload = auth(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureTeamPlayStateSchema()
  await touchTeamPresence(payload.userId)

  const url = new URL(req.url)
  const roomId = url.searchParams.get('roomId')?.trim()
  if (!roomId) return NextResponse.json({ error: '缺少房间' }, { status: 400 })

  const roomStatus = await db.raw.get<PlayRoomStatusRow>(
    `SELECT r.room_id, r.status, r.owner_id,
            EXISTS(SELECT 1 FROM team_story_room_members m WHERE m.room_id = r.room_id AND m.user_id = ?) AS is_member
     FROM team_story_rooms r
     WHERE r.room_id = ?
     LIMIT 1`,
    [payload.userId, roomId],
  )
  if (!roomStatus) return NextResponse.json({ error: '房间不存在' }, { status: 404 })
  if (!roomStatus.is_member) return NextResponse.json({ error: '你不在该调查房间中' }, { status: 403 })
  if (roomStatus.status === 'closed') {
    return NextResponse.json({
      currentUserId: payload.userId,
      authorityUserId: roomStatus.owner_id,
      ended: true,
      reason: 'disbanded',
      roomState: {
        event: { type: 'roomDisbanded', at: Date.now() },
        updatedByUserId: roomStatus.owner_id,
      },
      players: [],
    })
  }
  if (roomStatus.status !== 'started') {
    return NextResponse.json({
      currentUserId: payload.userId,
      authorityUserId: roomStatus.owner_id,
      ended: true,
      reason: 'ended',
      roomState: {
        event: { type: 'battleEnded', at: Date.now() },
        updatedByUserId: roomStatus.owner_id,
      },
      players: [],
    })
  }

  const member = await requireStartedRoomMember(roomId, payload.userId)
  if (!member) return NextResponse.json({ error: '你不在该调查房间中' }, { status: 403 })

  const [rows, currentPlayer, roomState] = await Promise.all([
    db.raw.all<TeamPlayStateRow>(
      `SELECT m.room_id,
              m.user_id,
              u.display_name,
              COALESCE(ps.model_id, m.combat_role_id, 'knight-hero') AS model_id,
              COALESCE(ps.x, 220) AS x,
              COALESCE(ps.lane, 1) AS lane,
              COALESCE(ps.facing, 1) AS facing,
              COALESCE(ps.moving, 0) AS moving,
              COALESCE(ps.attacking, 0) AS attacking,
              COALESCE(ps.attack_sequence, 0) AS attack_sequence,
              COALESCE(ps.attack_phase, 0) AS attack_phase,
              COALESCE(ps.hp, 140) AS hp,
              COALESCE(ps.player_status, 'playing') AS player_status,
              ps.quiz_json,
              COALESCE(ps.sync_seq, 0) AS sync_seq,
              COALESCE(ps.client_updated_at_ms, UNIX_TIMESTAMP(COALESCE(ps.updated_at, m.updated_at)) * 1000) AS client_updated_at_ms,
              CASE
                WHEN ps.updated_at IS NULL THEN 1
                WHEN ps.updated_at < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 3 SECOND) THEN 1
                ELSE 0
              END AS ai_controlled,
              COALESCE(ps.updated_at, m.updated_at) AS updated_at
       FROM team_story_room_members m
       INNER JOIN users u ON u.user_id = m.user_id
       LEFT JOIN team_play_states ps ON ps.room_id = m.room_id AND ps.user_id = m.user_id
       WHERE m.room_id = ?
         AND m.user_id <> ?
         AND m.combat_role_id IS NOT NULL
       ORDER BY COALESCE(ps.updated_at, m.updated_at) DESC`,
      [roomId, payload.userId],
    ),
    db.raw.get<TeamPlayStateRow>(
      `SELECT m.room_id,
              m.user_id,
              u.display_name,
              COALESCE(ps.model_id, m.combat_role_id, 'knight-hero') AS model_id,
              COALESCE(ps.x, 220) AS x,
              COALESCE(ps.lane, 1) AS lane,
              COALESCE(ps.facing, 1) AS facing,
              COALESCE(ps.moving, 0) AS moving,
              COALESCE(ps.attacking, 0) AS attacking,
              COALESCE(ps.attack_sequence, 0) AS attack_sequence,
              COALESCE(ps.attack_phase, 0) AS attack_phase,
              COALESCE(ps.hp, 140) AS hp,
              COALESCE(ps.player_status, 'playing') AS player_status,
              ps.quiz_json,
              COALESCE(ps.sync_seq, 0) AS sync_seq,
              COALESCE(ps.client_updated_at_ms, UNIX_TIMESTAMP(COALESCE(ps.updated_at, m.updated_at)) * 1000) AS client_updated_at_ms,
              0 AS ai_controlled,
              COALESCE(ps.updated_at, m.updated_at) AS updated_at
       FROM team_story_room_members m
       INNER JOIN users u ON u.user_id = m.user_id
       LEFT JOIN team_play_states ps ON ps.room_id = m.room_id AND ps.user_id = m.user_id
       WHERE m.room_id = ?
         AND m.user_id = ?
         AND m.combat_role_id IS NOT NULL
       LIMIT 1`,
      [roomId, payload.userId],
    ),
    db.raw.get<TeamPlayRoomStateRow>(
      `SELECT room_id, state_json, event_json, updated_by_user_id, updated_at
       FROM team_play_room_states
       WHERE room_id = ?`,
      [roomId],
    ),
  ])

  return NextResponse.json({
    currentUserId: payload.userId,
    authorityUserId: member.owner_id,
    roomState: roomState ? {
      state: parseJson(roomState.state_json),
      event: parseJson(roomState.event_json),
      updatedByUserId: roomState.updated_by_user_id,
      updatedAt: roomState.updated_at,
    } : null,
    currentPlayer: currentPlayer ? serializePlayState(currentPlayer) : null,
    players: rows.map(serializePlayState),
  })
}

export async function POST(req: NextRequest) {
  const payload = auth(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureTeamPlayStateSchema()
  await touchTeamPresence(payload.userId)

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : ''
  if (!roomId) return NextResponse.json({ error: '缺少房间' }, { status: 400 })

  const member = await requireStartedRoomMember(roomId, payload.userId)
  if (!member) return NextResponse.json({ error: '你不在该调查房间中' }, { status: 403 })

  const modelId = typeof body.modelId === 'string' && PLAYER_MODEL_IDS.has(body.modelId)
    ? body.modelId
    : 'knight-hero'
  const x = clamp(body.x, 120, 0, 6400)
  const lane = clamp(body.lane, 1, 0, 2)
  const hp = Math.round(clamp(body.hp, 140, 0, 180))
  const facing = Number(body.facing) === -1 ? -1 : 1
  const moving = Boolean(body.moving)
  const attacking = Boolean(body.attacking)
  const attackSequence = Math.round(clamp(body.attackSequence, 0, 0, 999999))
  const attackPhase = Math.round(clamp(body.attackPhase, 0, 0, 99))
  const status = normalizePlayerStatus(body.status)
  const quizJson = stringifyJson(body.activeQuiz, 12000)
  const syncSeq = Math.round(clamp(body.syncSeq ?? body.seq, 0, 0, Number.MAX_SAFE_INTEGER))
  const updatedAtMs = Math.round(clamp(body.updatedAtMs, Date.now(), 0, 9999999999999))

  const existingState = await db.raw.get<{ sync_seq: number | string | null; client_updated_at_ms: number | string | null }>(
    `SELECT sync_seq, client_updated_at_ms
     FROM team_play_states
     WHERE room_id = ? AND user_id = ?
     LIMIT 1`,
    [roomId, payload.userId],
  )
  if (isStaleIncomingState(existingState, syncSeq, updatedAtMs)) {
    return NextResponse.json({ ok: true, stale: true })
  }

  await db.raw.run(
    `INSERT INTO team_play_states
       (room_id, user_id, display_name, model_id, x, lane, facing, moving, attacking, attack_sequence, attack_phase, hp, player_status, quiz_json, sync_seq, client_updated_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       display_name = VALUES(display_name),
       model_id = VALUES(model_id),
       x = VALUES(x),
       lane = VALUES(lane),
       facing = VALUES(facing),
       moving = VALUES(moving),
       attacking = VALUES(attacking),
       attack_sequence = VALUES(attack_sequence),
       attack_phase = VALUES(attack_phase),
       hp = VALUES(hp),
       player_status = VALUES(player_status),
       quiz_json = VALUES(quiz_json),
       sync_seq = VALUES(sync_seq),
       client_updated_at_ms = VALUES(client_updated_at_ms),
       updated_at = CURRENT_TIMESTAMP(3)`,
    [roomId, payload.userId, member.display_name, modelId, x, lane, facing, moving, attacking, attackSequence, attackPhase, hp, status, quizJson, syncSeq, updatedAtMs],
  )

  const worldStateJson = stringifyJson(body.worldState)
  const roomEventJson = stringifyJson(body.roomEvent, 20000)
  const reviveUserId = typeof body.reviveUserId === 'string' ? body.reviveUserId.trim() : ''
  if (reviveUserId) {
    const target = await db.raw.get<{ user_id: string }>(
      `SELECT user_id FROM team_story_room_members WHERE room_id = ? AND user_id = ?`,
      [roomId, reviveUserId],
    )
    if (!target) return NextResponse.json({ error: '队友不在该调查房间中' }, { status: 404 })
    await db.raw.run(
      `UPDATE team_play_states
       SET hp = 30,
           player_status = 'playing',
           quiz_json = NULL,
           sync_seq = sync_seq + 1,
           client_updated_at_ms = ?,
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE room_id = ? AND user_id = ?`,
      [Date.now(), roomId, reviveUserId],
    )
    const eventJson = JSON.stringify({
      type: 'revive',
      targetUserId: reviveUserId,
      byUserId: payload.userId,
      hp: 30,
      at: Date.now(),
    })
    await db.raw.run(
      `INSERT INTO team_play_room_states (room_id, event_json, updated_by_user_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         event_json = VALUES(event_json),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP(3)`,
      [roomId, eventJson, payload.userId],
    )
  }

  if (worldStateJson || roomEventJson) {
    await db.raw.run(
      `INSERT INTO team_play_room_states (room_id, state_json, event_json, updated_by_user_id)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         state_json = COALESCE(VALUES(state_json), state_json),
         event_json = COALESCE(VALUES(event_json), event_json),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP(3)`,
      [roomId, worldStateJson, roomEventJson, payload.userId],
    )
  }

  if (status === 'exited') {
    await endBattleIfAllPlayersExited(roomId, payload.userId)
  }

  return NextResponse.json({ ok: true })
}
