const http = require('http')
const jwt = require('jsonwebtoken')
const mysql = require('mysql2/promise')
const { loadEnvConfig } = require('@next/env')
const { Server } = require('socket.io')
const { createClient } = require('redis')
const { createAdapter } = require('@socket.io/redis-adapter')

loadEnvConfig(process.cwd())

const PLAYER_MODEL_IDS = new Set(['knight-hero', 'knight2', 'pixel-knight', 'sprite-hero', 'black-knight', 'demon-warrior'])
const PLAYER_MAX_HP = 180
const ROOM_TTL_SECONDS = Number(process.env.TEAM_SYNC_REDIS_TTL_SECONDS || 60 * 60 * 6)
const FLUSH_INTERVAL_MS = Number(process.env.TEAM_SYNC_FLUSH_INTERVAL_MS || 1000)
const MEMBER_CHECK_INTERVAL_MS = Number(process.env.TEAM_SYNC_MEMBER_CHECK_INTERVAL_MS || 2500)

function getJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET
  if (process.env.NODE_ENV !== 'production') return 'gmp-dev-secret-change-me'
  throw new Error('JWT_SECRET is not configured')
}

function verifyToken(token) {
  try {
    return jwt.verify(token, getJwtSecret())
  } catch {
    return null
  }
}

function mysqlUrl() {
  const url = process.env.MYSQL_URL || process.env.DATABASE_URL
  if (!url) throw new Error('Missing MYSQL_URL. Example: mysql://root:123456@127.0.0.1:3306/gmp')
  return url
}

function clamp(value, fallback, min, max) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(max, number))
}

function parseJson(value) {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function maskConnectionUrl(value) {
  try {
    const url = new URL(value)
    if (url.password) url.password = '***'
    return url.toString()
  } catch {
    return String(value || '').replace(/:\/\/([^:@]+:)?[^@]+@/, '://***@')
  }
}

function stringifyJson(value, maxLength = 90000) {
  if (!value || typeof value !== 'object') return null
  const text = JSON.stringify(value)
  return text.length > maxLength ? null : text
}

function normalizeStatus(value) {
  return value === 'downed' || value === 'answering' || value === 'reviving' || value === 'exited' ? value : 'playing'
}

function normalizeSyncSeq(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0
}

function normalizeUpdatedAtMs(value, fallback = Date.now()) {
  const number = Number(value)
  const safeFallback = Number.isFinite(Number(fallback)) ? Math.round(Number(fallback)) : Date.now()
  return Number.isFinite(number) && number > 0 ? Math.round(number) : safeFallback
}

function playerUpdatedAtMs(player) {
  if (!player) return 0
  const direct = normalizeUpdatedAtMs(player.updatedAtMs, 0)
  if (direct > 0) return direct
  const parsed = Date.parse(String(player.updatedAt || ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function isStalePlayerPacket(previous, nextPlayer) {
  if (!previous || !nextPlayer) return false
  const previousSeq = normalizeSyncSeq(previous.syncSeq ?? previous.seq)
  const nextSeq = normalizeSyncSeq(nextPlayer.syncSeq ?? nextPlayer.seq)
  if (previousSeq > 0 && nextSeq <= 0) return true
  if (previousSeq > 0 && nextSeq > 0) {
    if (nextSeq < previousSeq) return true
    if (nextSeq === previousSeq && playerUpdatedAtMs(nextPlayer) <= playerUpdatedAtMs(previous)) return true
    return false
  }
  const previousAt = playerUpdatedAtMs(previous)
  const nextAt = playerUpdatedAtMs(nextPlayer)
  return previousAt > 0 && nextAt > 0 && nextAt + 80 < previousAt
}

function roomChannel(roomId) {
  return `team:${roomId}`
}

function playersKey(roomId) {
  return `team-sync:room:${roomId}:players`
}

function worldKey(roomId) {
  return `team-sync:room:${roomId}:world`
}

function metaKey(roomId) {
  return `team-sync:room:${roomId}:meta`
}

function normalizePlayerPayload(raw, socket) {
  const state = raw && typeof raw === 'object' ? raw : {}
  const attackSequence = Math.round(clamp(state.attackSequence, 0, 0, 999999))
  const attackPhase = Math.round(clamp(state.attackPhase, 0, 0, 99))
  const rollDuration = Math.round(clamp(state.rollDuration, 520, 180, 900))
  const syncSeq = normalizeSyncSeq(state.syncSeq ?? state.seq)
  const updatedAtMs = normalizeUpdatedAtMs(state.updatedAtMs)
  const incomingRollingUntil = Number(state.rollingUntil)
  const rollingUntil = Number.isFinite(incomingRollingUntil) && incomingRollingUntil > Date.now()
    ? incomingRollingUntil
    : Boolean(state.rolling)
      ? Date.now() + rollDuration
      : 0
  return {
    roomId: socket.data.roomId,
    userId: socket.data.userId,
    displayName: socket.data.displayName,
    modelId: typeof state.modelId === 'string' && PLAYER_MODEL_IDS.has(state.modelId) ? state.modelId : (socket.data.combatRoleId || 'knight-hero'),
    x: clamp(state.x, 220, 0, 6400),
    lane: clamp(state.lane, 1, 0, 2),
    facing: Number(state.facing) === -1 ? -1 : 1,
    moving: Boolean(state.moving),
    rolling: Boolean(state.rolling),
    rollingUntil,
    rollDuration,
    attacking: Boolean(state.attacking),
    attackSequence,
    attackPhase,
    hp: Math.round(clamp(state.hp, PLAYER_MAX_HP, 0, PLAYER_MAX_HP)),
    status: normalizeStatus(state.status),
    activeQuiz: state.activeQuiz && typeof state.activeQuiz === 'object' ? state.activeQuiz : null,
    aiControlled: false,
    syncSeq,
    seq: syncSeq,
    updatedAtMs,
    updatedAt: new Date().toISOString(),
  }
}

function serializeMysqlPlayState(row) {
  return {
    roomId: row.room_id,
    userId: row.user_id,
    displayName: row.display_name,
    modelId: row.model_id || row.combat_role_id || 'knight-hero',
    x: Number(row.x ?? 220),
    lane: Number(row.lane ?? 1),
    facing: Number(row.facing) === -1 ? -1 : 1,
    moving: Boolean(row.moving),
    rolling: false,
    rollingUntil: 0,
    rollDuration: 520,
    attacking: Boolean(row.attacking),
    attackSequence: Number(row.attack_sequence ?? 0),
    attackPhase: Number(row.attack_phase ?? 0),
    hp: Number(row.hp ?? PLAYER_MAX_HP),
    status: normalizeStatus(row.player_status),
    activeQuiz: parseJson(row.quiz_json),
    aiControlled: false,
    syncSeq: normalizeSyncSeq(row.sync_seq),
    seq: normalizeSyncSeq(row.sync_seq),
    updatedAtMs: normalizeUpdatedAtMs(row.client_updated_at_ms, row.updated_at ? Date.parse(row.updated_at) : Date.now()),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  }
}

function buildSnapshotFromCache({ roomId, currentUserId, authorityUserId, playerRows, roomStateRaw }) {
  const players = Object.values(playerRows)
    .map(parseJson)
    .filter(Boolean)
  const roomState = parseJson(roomStateRaw)
  return {
    currentUserId,
    authorityUserId,
    roomState: roomState || null,
    currentPlayer: players.find(player => player.userId === currentUserId) || null,
    players: players.filter(player => player.userId !== currentUserId),
    roomId,
  }
}

async function ensurePlayStateSchema(pool) {
  await pool.execute(`
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
  await pool.execute(`ALTER TABLE team_play_states ADD COLUMN sync_seq BIGINT NOT NULL DEFAULT 0`).catch(() => undefined)
  await pool.execute(`ALTER TABLE team_play_states ADD COLUMN client_updated_at_ms BIGINT`).catch(() => undefined)
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS team_play_room_states (
      room_id VARCHAR(64) NOT NULL PRIMARY KEY,
      state_json LONGTEXT,
      event_json LONGTEXT,
      updated_by_user_id VARCHAR(191),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      KEY idx_team_play_room_states_time (updated_at)
    )
  `)
}

async function getStartedRoomMember(pool, roomId, userId) {
  const [rows] = await pool.execute(
    `SELECT u.display_name, r.owner_id, r.status, m.combat_role_id, m.member_status
     FROM team_story_room_members m
     INNER JOIN team_story_rooms r ON r.room_id = m.room_id
     INNER JOIN users u ON u.user_id = m.user_id
     WHERE m.room_id = ?
       AND m.user_id = ?
     LIMIT 1`,
    [roomId, userId],
  )
  const member = rows[0]
  if (!member || member.status !== 'started') return null
  return member
}

async function getRoomStatus(pool, roomId, userId) {
  const [rows] = await pool.execute(
    `SELECT r.room_id, r.status, r.owner_id,
            EXISTS(SELECT 1 FROM team_story_room_members m WHERE m.room_id = r.room_id AND m.user_id = ?) AS is_member
     FROM team_story_rooms r
     WHERE r.room_id = ?
     LIMIT 1`,
    [userId, roomId],
  )
  return rows[0] || null
}

async function hydrateRoomFromMysql(pool, redis, roomId, ownerId) {
  const existing = await redis.hLen(playersKey(roomId))
  if (existing > 0) {
    const [cacheGuards] = await pool.execute(
      `SELECT
         (SELECT COUNT(*) FROM team_play_states WHERE room_id = ?) AS player_count,
         (SELECT COUNT(*) FROM team_play_room_states WHERE room_id = ? AND (state_json IS NOT NULL OR event_json IS NOT NULL)) AS room_state_count`,
      [roomId, roomId],
    )
    const guard = cacheGuards[0] || {}
    if (Number(guard.player_count ?? 0) > 0 || Number(guard.room_state_count ?? 0) > 0) return
    await redis.del(playersKey(roomId), worldKey(roomId))
  }

  const [rows] = await pool.execute(
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
            COALESCE(ps.updated_at, m.updated_at) AS updated_at
     FROM team_story_room_members m
     INNER JOIN users u ON u.user_id = m.user_id
     LEFT JOIN team_play_states ps ON ps.room_id = m.room_id AND ps.user_id = m.user_id
     WHERE m.room_id = ?
       AND m.combat_role_id IS NOT NULL`,
    [roomId],
  )

  const playerEntries = {}
  for (const row of rows) {
    playerEntries[row.user_id] = JSON.stringify(serializeMysqlPlayState(row))
  }
  if (Object.keys(playerEntries).length) {
    await redis.hSet(playersKey(roomId), playerEntries)
    await redis.expire(playersKey(roomId), ROOM_TTL_SECONDS)
  }

  const [roomStates] = await pool.execute(
    `SELECT state_json, event_json, updated_by_user_id, updated_at
     FROM team_play_room_states
     WHERE room_id = ?
     LIMIT 1`,
    [roomId],
  )
  const roomState = roomStates[0]
  if (roomState) {
    await redis.set(worldKey(roomId), JSON.stringify({
      state: parseJson(roomState.state_json),
      event: parseJson(roomState.event_json),
      updatedByUserId: roomState.updated_by_user_id,
      updatedAt: roomState.updated_at ? new Date(roomState.updated_at).toISOString() : new Date().toISOString(),
    }), { EX: ROOM_TTL_SECONDS })
  }

  await redis.hSet(metaKey(roomId), {
    ownerId: ownerId || '',
    hydratedAt: new Date().toISOString(),
  })
  await redis.expire(metaKey(roomId), ROOM_TTL_SECONDS)
}

async function emitRoomSnapshot(io, redis, roomId) {
  const [playerRows, roomStateRaw, meta] = await Promise.all([
    redis.hGetAll(playersKey(roomId)),
    redis.get(worldKey(roomId)),
    redis.hGetAll(metaKey(roomId)),
  ])
  const sockets = await io.in(roomChannel(roomId)).fetchSockets()
  for (const socket of sockets) {
    socket.emit('team:snapshot', buildSnapshotFromCache({
      roomId,
      currentUserId: socket.data.userId,
      authorityUserId: meta.ownerId || socket.data.ownerId || null,
      playerRows,
      roomStateRaw,
    }))
  }
}

async function savePlayerToRedis(redis, roomId, playerState) {
  await redis.hSet(playersKey(roomId), playerState.userId, JSON.stringify(playerState))
  await redis.expire(playersKey(roomId), ROOM_TTL_SECONDS)
}

async function saveWorldToRedis(redis, roomId, payload, updatedByUserId) {
  const stateJson = stringifyJson(payload.worldState)
  const eventJson = stringifyJson(payload.roomEvent || null, 20000)
  if (!stateJson && !eventJson) return
  const previous = parseJson(await redis.get(worldKey(roomId))) || {}
  await redis.set(worldKey(roomId), JSON.stringify({
    state: stateJson ? JSON.parse(stateJson) : previous.state || null,
    event: eventJson ? JSON.parse(eventJson) : previous.event || null,
    updatedByUserId,
    updatedAt: new Date().toISOString(),
  }), { EX: ROOM_TTL_SECONDS })
}

async function clearWorldStateToRedis(redis, roomId, roomEvent, updatedByUserId) {
  await redis.set(worldKey(roomId), JSON.stringify({
    state: null,
    event: roomEvent || null,
    clearState: true,
    updatedByUserId,
    updatedAt: new Date().toISOString(),
  }), { EX: ROOM_TTL_SECONDS })
}

async function emitWorldState(io, redis, roomId) {
  const roomState = parseJson(await redis.get(worldKey(roomId)))
  if (roomState) io.to(roomChannel(roomId)).emit('team:world', roomState)
}

async function handleRevive(redis, roomId, payload, byUserId) {
  const reviveUserId = typeof payload.reviveUserId === 'string' ? payload.reviveUserId.trim() : ''
  if (!reviveUserId) return
  const targetRaw = await redis.hGet(playersKey(roomId), reviveUserId)
  const target = parseJson(targetRaw)
  if (!target) return
  target.hp = 30
  target.status = 'playing'
  target.activeQuiz = null
  target.syncSeq = normalizeSyncSeq(target.syncSeq ?? target.seq) + 1
  target.seq = target.syncSeq
  target.updatedAtMs = Date.now()
  target.updatedAt = new Date().toISOString()
  await redis.hSet(playersKey(roomId), reviveUserId, JSON.stringify(target))
  await redis.set(worldKey(roomId), JSON.stringify({
    state: null,
    event: {
      type: 'revive',
      targetUserId: reviveUserId,
      byUserId,
      hp: 30,
      at: Date.now(),
    },
    updatedByUserId: byUserId,
    updatedAt: new Date().toISOString(),
  }), { EX: ROOM_TTL_SECONDS })
}

async function endBattleIfAllPlayersExited(pool, redis, io, roomId, byUserId) {
  const [members] = await pool.execute(
    `SELECT user_id
     FROM team_story_room_members
     WHERE room_id = ?
       AND combat_role_id IS NOT NULL`,
    [roomId],
  )
  if (!members.length) return false

  const playerRows = await redis.hGetAll(playersKey(roomId))
  const allExited = members.every(member => {
    const player = parseJson(playerRows[member.user_id])
    return player?.status === 'exited'
  })
  if (!allExited) return false

  await pool.execute(
    `UPDATE team_story_rooms
     SET status = 'open', updated_at = CURRENT_TIMESTAMP(3)
     WHERE room_id = ? AND status = 'started'`,
    [roomId],
  )
  await pool.execute(
    `UPDATE team_story_room_members
     SET member_status = 'joined', combat_role_id = NULL, updated_at = CURRENT_TIMESTAMP(3)
     WHERE room_id = ?`,
    [roomId],
  )
  await pool.execute(`DELETE FROM team_play_states WHERE room_id = ?`, [roomId])
  const roomEvent = { type: 'battleEnded', byUserId, at: Date.now(), reason: 'allExited' }
  await clearWorldStateToRedis(redis, roomId, roomEvent, byUserId)
  await pool.execute(
    `INSERT INTO team_play_room_states (room_id, state_json, event_json, updated_by_user_id)
     VALUES (?, NULL, ?, ?)
     ON DUPLICATE KEY UPDATE
       state_json = NULL,
       event_json = VALUES(event_json),
       updated_by_user_id = VALUES(updated_by_user_id),
       updated_at = CURRENT_TIMESTAMP(3)`,
    [roomId, JSON.stringify(roomEvent), byUserId],
  )
  await redis.del(playersKey(roomId))
  io.to(roomChannel(roomId)).emit('team:ended', { reason: 'ended' })
  return true
}

async function flushRoomToMysql(pool, redis, roomId) {
  const [playerRows, roomStateRaw] = await Promise.all([
    redis.hGetAll(playersKey(roomId)),
    redis.get(worldKey(roomId)),
  ])
  const players = Object.values(playerRows).map(parseJson).filter(Boolean)
  for (const player of players) {
    await pool.execute(
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
      [
        roomId,
        player.userId,
        player.displayName,
        player.modelId,
        player.x,
        player.lane,
        player.facing,
        player.moving ? 1 : 0,
        player.attacking ? 1 : 0,
        player.attackSequence || 0,
        player.attackPhase || 0,
        player.hp,
        normalizeStatus(player.status),
        stringifyJson(player.activeQuiz, 12000),
        normalizeSyncSeq(player.syncSeq ?? player.seq),
        normalizeUpdatedAtMs(player.updatedAtMs, Date.now()),
      ],
    )
  }

  const roomState = parseJson(roomStateRaw)
  if (roomState && (roomState.state || roomState.event)) {
    const clearState = roomState.clearState === true
    await pool.execute(
      `INSERT INTO team_play_room_states (room_id, state_json, event_json, updated_by_user_id)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
          state_json = CASE WHEN ? = 1 THEN VALUES(state_json) ELSE COALESCE(VALUES(state_json), state_json) END,
          event_json = COALESCE(VALUES(event_json), event_json),
          updated_by_user_id = VALUES(updated_by_user_id),
          updated_at = CURRENT_TIMESTAMP(3)`,
      [
        roomId,
        stringifyJson(roomState.state),
        stringifyJson(roomState.event, 20000),
        roomState.updatedByUserId || null,
        clearState ? 1 : 0,
      ],
    )
  }
}

async function main() {
  const pool = mysql.createPool({
    uri: mysqlUrl(),
    connectionLimit: Number(process.env.TEAM_SYNC_MYSQL_CONNECTION_LIMIT || process.env.MYSQL_CONNECTION_LIMIT || 5),
    waitForConnections: true,
    queueLimit: 0,
    dateStrings: true,
  })
  await ensurePlayStateSchema(pool)

  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379'
  const redisOptions = { url: redisUrl, RESP: 2 }
  const redis = createClient(redisOptions)
  const pubClient = redis.duplicate()
  const subClient = redis.duplicate()
  await Promise.all([redis.connect(), pubClient.connect(), subClient.connect()])

  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, service: 'team-sync-server' }))
      return
    }
    res.writeHead(404)
    res.end()
  })

  const corsOrigins = (process.env.TEAM_SYNC_CORS_ORIGIN || 'http://localhost:3000,http://127.0.0.1:3000,http://192.168.1.161:3000')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)

  const io = new Server(server, {
    cors: {
      origin: corsOrigins,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  })
  io.adapter(createAdapter(pubClient, subClient))

  const dirtyRooms = new Set()

  io.use(async (socket, next) => {
    try {
      const token = String(socket.handshake.auth?.token || '').replace(/^Bearer\s+/i, '')
      const roomId = String(socket.handshake.auth?.roomId || '').trim()
      if (!token || !roomId) return next(new Error('缺少实时同步凭证'))
      const payload = verifyToken(token)
      if (!payload?.userId) return next(new Error('登录已过期'))
      const member = await getStartedRoomMember(pool, roomId, payload.userId)
      if (!member) return next(new Error('你不在该调查房间中，或房间尚未开始'))
      socket.data.userId = payload.userId
      socket.data.roomId = roomId
      socket.data.displayName = member.display_name
      socket.data.ownerId = member.owner_id
      socket.data.combatRoleId = member.combat_role_id
      return next()
    } catch (error) {
      return next(error)
    }
  })

  io.on('connection', async socket => {
    const roomId = socket.data.roomId
    socket.join(roomChannel(roomId))
    console.log(`[team-sync] connected room=${roomId} user=${socket.data.userId} socket=${socket.id}`)

    await redis.hSet(metaKey(roomId), { ownerId: socket.data.ownerId || '' })
    await redis.expire(metaKey(roomId), ROOM_TTL_SECONDS)
    await hydrateRoomFromMysql(pool, redis, roomId, socket.data.ownerId)

    const currentRaw = await redis.hGet(playersKey(roomId), socket.data.userId)
    if (!currentRaw) {
      await savePlayerToRedis(redis, roomId, normalizePlayerPayload({}, socket))
      dirtyRooms.add(roomId)
    }
    await emitRoomSnapshot(io, redis, roomId)

    const memberCheckTimer = setInterval(async () => {
      const status = await getRoomStatus(pool, roomId, socket.data.userId).catch(() => null)
      if (!status || !status.is_member || status.status === 'closed') {
        await redis.del(playersKey(roomId), worldKey(roomId))
        socket.emit('team:ended', { reason: 'disbanded' })
        socket.disconnect(true)
        return
      }
      if (status.status !== 'started') {
        await redis.del(playersKey(roomId), worldKey(roomId))
        socket.emit('team:ended', { reason: 'ended' })
        socket.disconnect(true)
      }
    }, MEMBER_CHECK_INTERVAL_MS)

    async function handleStatePacket(payload, reliable) {
      const state = normalizePlayerPayload(payload, socket)
      const previousState = parseJson(await redis.hGet(playersKey(roomId), state.userId))
      if (isStalePlayerPacket(previousState, state)) return
      await savePlayerToRedis(redis, roomId, state)
      if (reliable) {
        socket.to(roomChannel(roomId)).emit('team:player', state)
      } else {
        socket.volatile.to(roomChannel(roomId)).emit('team:player', state)
      }
      if (reliable) {
        await handleRevive(redis, roomId, payload || {}, socket.data.userId)
        await saveWorldToRedis(redis, roomId, payload || {}, socket.data.userId)
        if (payload?.worldState || payload?.roomEvent || payload?.reviveUserId) {
          await emitWorldState(io, redis, roomId)
        }
        if (state.status === 'exited') {
          await endBattleIfAllPlayersExited(pool, redis, io, roomId, socket.data.userId)
        }
      }
      dirtyRooms.add(roomId)
    }

    socket.on('team:move', payload => {
      handleStatePacket(payload, false).catch(error => socket.emit('team:error', { message: error.message || '同步失败' }))
    })
    socket.on('team:state', payload => {
      handleStatePacket(payload, true).catch(error => socket.emit('team:error', { message: error.message || '同步失败' }))
    })
    socket.on('disconnect', () => {
      clearInterval(memberCheckTimer)
      dirtyRooms.add(roomId)
      console.log(`[team-sync] disconnected room=${roomId} user=${socket.data.userId} socket=${socket.id}`)
    })
  })

  setInterval(async () => {
    const rooms = [...dirtyRooms]
    dirtyRooms.clear()
    for (const roomId of rooms) {
      await flushRoomToMysql(pool, redis, roomId).catch(error => {
        dirtyRooms.add(roomId)
        console.error(`[team-sync] flush failed for ${roomId}:`, error)
      })
    }
  }, FLUSH_INTERVAL_MS)

  const port = Number(process.env.TEAM_SYNC_PORT || process.env.PORT || 3011)
  const host = process.env.TEAM_SYNC_HOST || '0.0.0.0'
  server.listen(port, host, () => {
    console.log(`[team-sync] listening on http://${host}:${port}`)
    console.log(`[team-sync] redis ${maskConnectionUrl(redisUrl)}`)
  })

  async function shutdown() {
    console.log('[team-sync] shutting down...')
    server.close()
    await Promise.allSettled([...dirtyRooms].map(roomId => flushRoomToMysql(pool, redis, roomId)))
    await Promise.allSettled([redis.quit(), pubClient.quit(), subClient.quit(), pool.end()])
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch(error => {
  console.error('[team-sync] failed to start:', error)
  process.exit(1)
})
