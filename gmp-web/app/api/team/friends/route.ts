import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import {
  ensureTeamCollaborationSchema,
  getOnlineTeamUserIds,
  normalizeTeamUser,
  sortedFriendPair,
  touchTeamPresence,
  type TeamUserRow,
} from '@/lib/team-collaboration'
import { getProjectDefinition } from '@/lib/simulation/project-missions'

interface FriendRow extends TeamUserRow {
  friendship_id: number
  status: string
  requester_id: string
  created_at: string
}

interface FriendRoomRow {
  user_id: string
  room_id: string
  project_id: number
  title: string
  status: string
  owner_id: string
  member_total: number
  mine_in_room: number
}

function auth(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  return token ? verifyToken(token) : null
}

export async function GET(req: NextRequest) {
  const payload = auth(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureTeamCollaborationSchema()
  await touchTeamPresence(payload.userId)
  const search = (new URL(req.url).searchParams.get('search') ?? '').trim()

  const friendRows = await db.raw.all<FriendRow>(
    `SELECT f.id AS friendship_id, f.status, f.requester_id, f.created_at,
            u.user_id, u.display_name, u.real_name, u.school, u.class_name, u.major, u.avatar_url
     FROM team_friendships f
     INNER JOIN users u
       ON u.user_id = CASE WHEN f.user_a_id = ? THEN f.user_b_id ELSE f.user_a_id END
     WHERE (f.user_a_id = ? OR f.user_b_id = ?) AND f.status = 'accepted'
     ORDER BY f.updated_at DESC
     LIMIT 80`,
    [payload.userId, payload.userId, payload.userId],
  )

  const requestRows = await db.raw.all<FriendRow>(
    `SELECT f.id AS friendship_id, f.status, f.requester_id, f.created_at,
            u.user_id, u.display_name, u.real_name, u.school, u.class_name, u.major, u.avatar_url
     FROM team_friendships f
     INNER JOIN users u
       ON u.user_id = CASE WHEN f.user_a_id = ? THEN f.user_b_id ELSE f.user_a_id END
     WHERE (f.user_a_id = ? OR f.user_b_id = ?) AND f.status = 'pending'
     ORDER BY f.updated_at DESC
     LIMIT 80`,
    [payload.userId, payload.userId, payload.userId],
  )

  const onlineUserIds = await getOnlineTeamUserIds()
  const friendUserIds = friendRows.map(row => row.user_id)
  const roomRows = friendUserIds.length
    ? await db.raw.all<FriendRoomRow>(
      `SELECT m.user_id, r.room_id, r.project_id, r.title, r.status, r.owner_id,
              (SELECT COUNT(*) FROM team_story_room_members members WHERE members.room_id = r.room_id) AS member_total,
              EXISTS(SELECT 1 FROM team_story_room_members mine WHERE mine.room_id = r.room_id AND mine.user_id = ?) AS mine_in_room
       FROM team_story_room_members m
       INNER JOIN team_story_rooms r ON r.room_id = m.room_id
       WHERE m.user_id IN (${friendUserIds.map(() => '?').join(',')})
         AND r.status IN ('open', 'started')
       ORDER BY r.updated_at DESC`,
      [payload.userId, ...friendUserIds],
    )
    : []
  const activeRoomByFriendId = new Map<string, FriendRoomRow>()
  for (const room of roomRows) {
    if (!activeRoomByFriendId.has(room.user_id)) activeRoomByFriendId.set(room.user_id, room)
  }

  const friends = friendRows.map(row => ({
    ...normalizeTeamUser(row),
    friendshipId: Number(row.friendship_id),
    status: row.status,
    online: onlineUserIds.has(row.user_id),
    activeRoom: (() => {
      const room = activeRoomByFriendId.get(row.user_id)
      if (!room) return null
      const project = getProjectDefinition(Number(room.project_id))
      return {
        roomId: room.room_id,
        projectId: Number(room.project_id),
        projectTitle: project.title,
        missionCode: project.missionCode,
        roomTitle: room.title,
        roomStatus: room.status,
        ownerId: room.owner_id,
        memberCount: Number(room.member_total ?? 0),
        joinable: room.status === 'open' && Number(room.member_total ?? 0) < 3,
        mineInRoom: Boolean(room.mine_in_room),
      }
    })(),
  }))

  const requests = requestRows.map(row => ({
    ...normalizeTeamUser(row),
    friendshipId: Number(row.friendship_id),
    requesterId: row.requester_id,
    status: row.status,
    createdAt: row.created_at,
    direction: row.requester_id === payload.userId ? 'outgoing' : 'incoming',
    online: onlineUserIds.has(row.user_id),
  }))

  const friendIdSet = new Set([
    ...friends.map(friend => friend.userId),
    ...requests.map(request => request.userId),
  ])
  const searchLike = `%${search}%`
  const suggestions = search
    ? await db.raw.all<TeamUserRow>(
      `SELECT user_id, display_name, real_name, school, class_name, major, avatar_url
         FROM users
         WHERE user_id <> ?
           AND (
             display_name LIKE ?
             OR real_name LIKE ?
             OR student_id LIKE ?
           )
         ORDER BY created_at DESC
         LIMIT 12`,
      [payload.userId, searchLike, searchLike, searchLike],
    )
    : []

  return NextResponse.json({
    friends,
    incomingRequests: requests.filter(request => request.direction === 'incoming'),
    outgoingRequests: requests.filter(request => request.direction === 'outgoing'),
    suggestions: suggestions
      .map(normalizeTeamUser)
      .filter(user => !friendIdSet.has(user.userId)),
  })
}

export async function POST(req: NextRequest) {
  const payload = auth(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureTeamCollaborationSchema()
  await touchTeamPresence(payload.userId)
  const body = await req.json().catch(() => ({})) as { action?: 'request' | 'accept' | 'reject' | 'cancel'; targetUserId?: string }
  const action = body.action ?? 'request'
  const targetUserId = body.targetUserId?.trim()
  if (!targetUserId || targetUserId === payload.userId) {
    return NextResponse.json({ error: '请选择有效好友' }, { status: 400 })
  }

  const target = await db.raw.get<TeamUserRow>(
    `SELECT user_id, display_name, real_name, school, class_name, major, avatar_url
     FROM users
     WHERE user_id = ?`,
    [targetUserId],
  )
  if (!target) return NextResponse.json({ error: '用户不存在' }, { status: 404 })

  const [userA, userB] = sortedFriendPair(payload.userId, targetUserId)
  const existing = await db.raw.get<{ id: number; status: string; requester_id: string }>(
    `SELECT id, status, requester_id
     FROM team_friendships
     WHERE user_a_id = ? AND user_b_id = ?`,
    [userA, userB],
  )

  if (action === 'request') {
    if (existing?.status === 'accepted') {
      return NextResponse.json({ ok: true, status: 'accepted', friend: normalizeTeamUser(target) })
    }
    if (existing?.status === 'pending') {
      if (existing.requester_id === payload.userId) {
        return NextResponse.json({ ok: true, status: 'pending', friend: normalizeTeamUser(target) })
      }
      return NextResponse.json({ error: '对方已向你发送好友申请，请在待处理申请中同意' }, { status: 409 })
    }
    if (existing) {
      await db.raw.run(
        `UPDATE team_friendships
         SET requester_id = ?, status = 'pending', updated_at = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [payload.userId, existing.id],
      )
    } else {
      await db.raw.run(
        `INSERT INTO team_friendships (user_a_id, user_b_id, requester_id, status)
         VALUES (?, ?, ?, 'pending')`,
        [userA, userB, payload.userId],
      )
    }
    return NextResponse.json({ ok: true, status: 'pending', friend: normalizeTeamUser(target) })
  }

  if (!existing || existing.status !== 'pending') {
    return NextResponse.json({ error: '没有待处理的好友申请' }, { status: 404 })
  }

  if (action === 'accept') {
    if (existing.requester_id === payload.userId) {
      return NextResponse.json({ error: '不能同意自己发出的申请' }, { status: 400 })
    }
    await db.raw.run(
      `UPDATE team_friendships
       SET status = 'accepted', updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [existing.id],
    )
    return NextResponse.json({ ok: true, status: 'accepted', friend: normalizeTeamUser(target) })
  }

  if (action === 'reject') {
    if (existing.requester_id === payload.userId) {
      return NextResponse.json({ error: '不能拒绝自己发出的申请' }, { status: 400 })
    }
    await db.raw.run(
      `UPDATE team_friendships
       SET status = 'rejected', updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [existing.id],
    )
    return NextResponse.json({ ok: true, status: 'rejected', friend: normalizeTeamUser(target) })
  }

  if (action === 'cancel') {
    if (existing.requester_id !== payload.userId) {
      return NextResponse.json({ error: '只能撤回自己发出的申请' }, { status: 400 })
    }
    await db.raw.run(
      `UPDATE team_friendships
       SET status = 'rejected', updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [existing.id],
    )
    return NextResponse.json({ ok: true, status: 'cancelled', friend: normalizeTeamUser(target) })
  }

  return NextResponse.json({ error: '不支持的操作' }, { status: 400 })
}
