import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import {
  canUserEnterTeamProject,
  ensureTeamCollaborationSchema,
  generateRoleAgentReply,
  getTeamProjectDefinition,
  getOnlineTeamUserIds,
  getUserSummary,
  roleCardsForTeamProject,
  roleCardById,
  TEAM_MIN_ENTRY_HP,
  TEAM_COMBAT_ROLES,
  sortedFriendPair,
  teamRoomId,
  isTeamUserOnline,
  touchTeamPresence,
} from '@/lib/team-collaboration'

interface RoomRow {
  room_id: string
  project_id: number
  owner_id: string
  title: string
  status: string
  created_at: string
  updated_at: string
}

interface MemberRow {
  room_id: string
  user_id: string
  role_id: string | null
  combat_role_id: string | null
  hp: number | null
  member_status: string
  joined_at: string
  display_name: string
  real_name: string | null
  avatar_url: string | null
}

interface StoryMessageRow {
  id: number
  room_id: string
  sender_id: string | null
  sender_type: string
  role_id: string | null
  content: string
  created_at: string
  display_name: string | null
}

interface PublicRoomRow {
  room_id: string
  project_id: number
  owner_id: string
  title: string
  status: string
  updated_at: string
  owner_name: string
  member_total: number
  mine_in_room: number
  pending_join: number
}

function auth(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  return token ? verifyToken(token) : null
}

async function requireRoom(roomId: string) {
  return db.raw.get<RoomRow>(
    `SELECT room_id, project_id, owner_id, title, status, created_at, updated_at
     FROM team_story_rooms
     WHERE room_id = ?`,
    [roomId],
  )
}

async function userCanAccessRoom(roomId: string, userId: string) {
  const row = await db.raw.get<{ room_id: string }>(
    `SELECT room_id
     FROM team_story_room_members
     WHERE room_id = ? AND user_id = ?`,
    [roomId, userId],
  )
  return Boolean(row)
}

function roomCode(roomId: string) {
  return roomId.replace(/^team-/, '').replace(/-/g, '').slice(0, 6).toUpperCase()
}

function normalizeMemberHp(value: unknown) {
  const hp = Math.round(Number(value))
  return Number.isFinite(hp) ? Math.max(0, Math.min(100, hp)) : 100
}

async function roomSnapshot(room: RoomRow, currentUserId: string) {
  const [members, messages, onlineUserIds] = await Promise.all([
    db.raw.all<MemberRow>(
      `SELECT m.room_id, m.user_id, m.role_id, m.combat_role_id, m.hp, m.member_status, m.joined_at,
              u.display_name, u.real_name, u.avatar_url
       FROM team_story_room_members m
       INNER JOIN users u ON u.user_id = m.user_id
       WHERE m.room_id = ?
       ORDER BY m.joined_at ASC`,
      [room.room_id],
    ),
    db.raw.all<StoryMessageRow>(
      `SELECT msg.id, msg.room_id, msg.sender_id, msg.sender_type, msg.role_id, msg.content, msg.created_at,
              u.display_name
       FROM team_story_messages msg
       LEFT JOIN users u ON u.user_id = msg.sender_id
       WHERE msg.room_id = ?
       ORDER BY msg.created_at ASC
       LIMIT 120`,
      [room.room_id],
    ),
    getOnlineTeamUserIds(),
  ])

  const roleCards = roleCardsForTeamProject(Number(room.project_id))
  const npcRoleById = new Map(roleCards.map(role => [role.roleId, role]))
  const combatRoleById = new Map(TEAM_COMBAT_ROLES.map(role => [role.roleId, role]))

  return {
    room: {
      roomId: room.room_id,
      roomCode: roomCode(room.room_id),
      projectId: Number(room.project_id),
      ownerId: room.owner_id,
      title: room.title,
      status: room.status,
      createdAt: room.created_at,
      updatedAt: room.updated_at,
      mine: room.owner_id === currentUserId,
    },
    roleCards,
    combatRoles: TEAM_COMBAT_ROLES,
    members: members.map(member => ({
      userId: member.user_id,
      displayName: member.display_name,
      realName: member.real_name,
      avatarUrl: member.avatar_url,
      roleId: member.role_id,
      roleName: member.role_id ? npcRoleById.get(member.role_id)?.name ?? combatRoleById.get(member.role_id as typeof TEAM_COMBAT_ROLES[number]['roleId'])?.name ?? member.role_id : null,
      combatRoleId: member.combat_role_id,
      combatRoleName: member.combat_role_id ? combatRoleById.get(member.combat_role_id as typeof TEAM_COMBAT_ROLES[number]['roleId'])?.name ?? member.combat_role_id : null,
      hp: normalizeMemberHp(member.hp),
      status: member.member_status,
      mine: member.user_id === currentUserId,
      online: member.user_id === currentUserId || onlineUserIds.has(member.user_id),
    })),
    messages: messages.map(message => ({
      id: Number(message.id),
      senderId: message.sender_id,
      senderType: message.sender_type,
      roleId: message.role_id,
      roleName: message.role_id ? npcRoleById.get(message.role_id)?.name ?? combatRoleById.get(message.role_id as typeof TEAM_COMBAT_ROLES[number]['roleId'])?.name ?? message.role_id : null,
      senderName: message.sender_type === 'ai'
        ? npcRoleById.get(message.role_id ?? '')?.name ?? 'AI角色'
        : message.sender_type === 'system'
          ? '系统'
          : message.display_name ?? '队友',
      content: message.content,
      createdAt: message.created_at,
      mine: message.sender_id === currentUserId,
    })),
  }
}

export async function GET(req: NextRequest) {
  const payload = auth(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureTeamCollaborationSchema()
  await touchTeamPresence(payload.userId)
  const url = new URL(req.url)
  const projectId = Math.max(1, Number(url.searchParams.get('projectId')) || 1)
  const requestedRoomId = url.searchParams.get('roomId')?.trim()
  const activeOnly = url.searchParams.get('active') === '1'
  const lobby = url.searchParams.get('lobby') === '1'

  if (lobby) {
    const rows = await db.raw.all<PublicRoomRow>(
      `SELECT r.room_id, r.project_id, r.owner_id, r.title, r.status, r.updated_at,
              u.display_name AS owner_name,
              (SELECT COUNT(*) FROM team_story_room_members members WHERE members.room_id = r.room_id) AS member_total,
              EXISTS(SELECT 1 FROM team_story_room_members mine WHERE mine.room_id = r.room_id AND mine.user_id = ?) AS mine_in_room,
              EXISTS(SELECT 1 FROM team_room_invitations inv WHERE inv.room_id = r.room_id AND inv.invitee_id = ? AND inv.status IN ('pending', 'owner_pending')) AS pending_join
       FROM team_story_rooms r
       INNER JOIN users u ON u.user_id = r.owner_id
       WHERE r.status = 'open'
       ORDER BY r.updated_at DESC
       LIMIT 36`,
      [payload.userId, payload.userId],
    )
    const rooms = await Promise.all(rows.map(async row => {
      const project = getTeamProjectDefinition(Number(row.project_id))
      const unlocked = await canUserEnterTeamProject(payload.userId, Number(row.project_id))
      const memberCount = Number(row.member_total ?? 0)
      const mineInRoom = Boolean(row.mine_in_room)
      const pendingJoin = Boolean(row.pending_join)
      return {
        roomId: row.room_id,
        roomCode: roomCode(row.room_id),
        projectId: Number(row.project_id),
        projectTitle: project.title,
        missionCode: project.missionCode,
        roomTitle: row.title,
        roomStatus: row.status,
        ownerId: row.owner_id,
        ownerName: row.owner_name,
        memberCount,
        mineInRoom,
        pendingJoin,
        unlocked,
        joinable: !mineInRoom && !pendingJoin && unlocked && memberCount < 3,
      }
    }))
    return NextResponse.json({ rooms })
  }

  const room = requestedRoomId
    ? await requireRoom(requestedRoomId)
    : activeOnly
    ? await db.raw.get<RoomRow>(
      `SELECT r.room_id, r.project_id, r.owner_id, r.title, r.status, r.created_at, r.updated_at
       FROM team_story_rooms r
       INNER JOIN team_story_room_members m ON m.room_id = r.room_id
       WHERE m.user_id = ? AND r.status IN ('open', 'started')
       ORDER BY r.updated_at DESC
       LIMIT 1`,
      [payload.userId],
    )
    : await db.raw.get<RoomRow>(
      `SELECT r.room_id, r.project_id, r.owner_id, r.title, r.status, r.created_at, r.updated_at
       FROM team_story_rooms r
       INNER JOIN team_story_room_members m ON m.room_id = r.room_id
       WHERE m.user_id = ? AND r.project_id = ? AND r.status IN ('open', 'started')
       ORDER BY r.updated_at DESC
       LIMIT 1`,
      [payload.userId, projectId],
    )

  if (!room) {
    return NextResponse.json({
      room: null,
      closed: false,
      roleCards: roleCardsForTeamProject(projectId),
      combatRoles: TEAM_COMBAT_ROLES,
      members: [],
      messages: [],
    })
  }

  if (room.status === 'closed') {
    return NextResponse.json({
      room: null,
      closed: true,
      roleCards: roleCardsForTeamProject(Number(room.project_id)),
      combatRoles: TEAM_COMBAT_ROLES,
      members: [],
      messages: [],
    })
  }

  if (!(await userCanAccessRoom(room.room_id, payload.userId))) {
    return NextResponse.json({
      room: null,
      closed: false,
      removed: true,
      roleCards: roleCardsForTeamProject(Number(room.project_id)),
      combatRoles: TEAM_COMBAT_ROLES,
      members: [],
      messages: [],
    })
  }

  return NextResponse.json(await roomSnapshot(room, payload.userId))
}

export async function POST(req: NextRequest) {
  const payload = auth(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureTeamCollaborationSchema()
  await touchTeamPresence(payload.userId)
  const body = await req.json().catch(() => ({})) as {
    action?: string
    projectId?: number
    roomId?: string
    roleId?: string
    friendId?: string
    targetUserId?: string
    content?: string
    result?: string
    title?: string
    hp?: number
  }
  const currentHp = normalizeMemberHp(body.hp)

  if (body.action === 'create') {
    const projectId = Math.max(1, Number(body.projectId) || 1)
    if (!(await canUserEnterTeamProject(payload.userId, projectId))) {
      return NextResponse.json({ error: '该项目尚未解锁，不能创建调查队伍' }, { status: 403 })
    }
    const existingRoom = await db.raw.get<RoomRow>(
      `SELECT r.room_id, r.project_id, r.owner_id, r.title, r.status, r.created_at, r.updated_at
       FROM team_story_rooms r
       INNER JOIN team_story_room_members m ON m.room_id = r.room_id
       WHERE m.user_id = ? AND r.project_id = ? AND r.status IN ('open', 'started')
       ORDER BY r.updated_at DESC
       LIMIT 1`,
      [payload.userId, projectId],
    )
    if (existingRoom) {
      await db.raw.run(
        `UPDATE team_story_room_members
         SET hp = ?, updated_at = CURRENT_TIMESTAMP(3)
         WHERE room_id = ? AND user_id = ?`,
        [currentHp, existingRoom.room_id, payload.userId],
      )
      return NextResponse.json(await roomSnapshot(existingRoom, payload.userId))
    }
    const project = getTeamProjectDefinition(projectId)
    const title = String(body.title ?? '').trim().slice(0, 32) || `${project.title} 协作房`
    const roomId = teamRoomId()
    await db.raw.run(
      `INSERT INTO team_story_rooms (room_id, project_id, owner_id, title)
       VALUES (?, ?, ?, ?)`,
      [roomId, projectId, payload.userId, title],
    )
    await db.raw.run(
      `INSERT INTO team_story_room_members (room_id, user_id, hp, member_status)
       VALUES (?, ?, ?, 'joined')`,
      [roomId, payload.userId, currentHp],
    )
    await db.raw.run(
      `INSERT INTO team_story_messages (room_id, sender_type, content)
       VALUES (?, 'system', ?)`,
      [roomId, '队伍已创建'],
    )

    const room = await requireRoom(roomId)
    return NextResponse.json(room ? await roomSnapshot(room, payload.userId) : { ok: true })
  }

  const roomId = body.roomId?.trim()
  if (!roomId) return NextResponse.json({ error: '缺少房间 ID' }, { status: 400 })

  const room = await requireRoom(roomId)
  if (!room) return NextResponse.json({ error: '协作房间不存在' }, { status: 404 })

  if (body.action === 'requestJoinRoom') {
    if (await userCanAccessRoom(room.room_id, payload.userId)) {
      return NextResponse.json(await roomSnapshot(room, payload.userId))
    }
    if (room.status !== 'open') {
      return NextResponse.json({ error: '该队伍已开始调查或已关闭，暂时不能申请加入' }, { status: 409 })
    }
    const friendId = body.friendId?.trim()
    if (friendId && friendId !== payload.userId) {
      const [userA, userB] = sortedFriendPair(payload.userId, friendId)
      const friendship = await db.raw.get<{ id: number }>(
        `SELECT id
         FROM team_friendships
         WHERE user_a_id = ? AND user_b_id = ? AND status = 'accepted'
         LIMIT 1`,
        [userA, userB],
      )
      if (!friendship) {
        return NextResponse.json({ error: '只有真实好友所在的房间才能通过好友卡片申请加入' }, { status: 403 })
      }
      const friendInRoom = await db.raw.get<{ user_id: string }>(
        `SELECT user_id
         FROM team_story_room_members
         WHERE room_id = ? AND user_id = ?
         LIMIT 1`,
        [room.room_id, friendId],
      )
      if (!friendInRoom) {
        return NextResponse.json({ error: '该好友已经不在这个房间中' }, { status: 409 })
      }
    }
    if (!(await canUserEnterTeamProject(payload.userId, Number(room.project_id)))) {
      return NextResponse.json({ error: '你尚未解锁该项目，不能申请加入本次调查' }, { status: 409 })
    }
    const occupiedRoom = await db.raw.get<{ room_id: string; member_total: number }>(
      `SELECT r.room_id,
              (SELECT COUNT(*) FROM team_story_room_members members WHERE members.room_id = r.room_id) AS member_total
       FROM team_story_rooms r
       INNER JOIN team_story_room_members m ON m.room_id = r.room_id
       WHERE m.user_id = ?
         AND r.room_id <> ?
         AND r.status IN ('open', 'started')
       ORDER BY r.updated_at DESC
       LIMIT 1`,
      [payload.userId, room.room_id],
    )
    if (occupiedRoom && Number(occupiedRoom.member_total ?? 0) > 1) {
      return NextResponse.json({ error: '你正在另一个多人队伍中，请先退出后再申请加入' }, { status: 409 })
    }
    const capacity = await db.raw.get<{ total: number }>(
      `SELECT
         (SELECT COUNT(*) FROM team_story_room_members WHERE room_id = ?) +
         (SELECT COUNT(*) FROM team_room_invitations WHERE room_id = ? AND status IN ('pending', 'owner_pending')) AS total`,
      [room.room_id, room.room_id],
    )
    if (Number(capacity?.total ?? 0) >= 3) {
      return NextResponse.json({ error: '队伍人数已满' }, { status: 409 })
    }
    const existingInvitation = await db.raw.get<{ id: number; status: string }>(
      `SELECT id, status
       FROM team_room_invitations
       WHERE room_id = ? AND invitee_id = ? AND status IN ('pending', 'owner_pending')
       LIMIT 1`,
      [room.room_id, payload.userId],
    )
    if (existingInvitation) {
      return NextResponse.json({ ok: true, status: existingInvitation.status, roomId: room.room_id, projectId: Number(room.project_id) })
    }
    await db.raw.run(
      `INSERT INTO team_room_invitations
         (room_id, inviter_id, invitee_id, requested_by_id, status)
       VALUES (?, ?, ?, ?, 'owner_pending')`,
      [room.room_id, friendId && friendId !== payload.userId ? friendId : room.owner_id, payload.userId, payload.userId],
    )
    const user = await getUserSummary(payload.userId)
    await db.raw.run(
      `INSERT INTO team_story_messages (room_id, sender_type, content)
       VALUES (?, 'system', ?)`,
      [room.room_id, `${user?.displayName ?? '好友'} 申请加入队伍，等待房主同意`],
    )
    return NextResponse.json({ ok: true, status: 'owner_pending', roomId: room.room_id, projectId: Number(room.project_id) })
  }

  if (!(await userCanAccessRoom(room.room_id, payload.userId))) {
    return NextResponse.json({ error: '无权访问该协作房间' }, { status: 403 })
  }

  if (body.action === 'syncHp') {
    await db.raw.run(
      `UPDATE team_story_room_members
       SET hp = ?, updated_at = CURRENT_TIMESTAMP(3)
       WHERE room_id = ? AND user_id = ?`,
      [currentHp, room.room_id, payload.userId],
    )
    return NextResponse.json(await roomSnapshot(room, payload.userId))
  }

  if (body.action === 'invite') {
    const friendId = body.friendId?.trim()
    if (!friendId) return NextResponse.json({ error: '请选择好友' }, { status: 400 })
    const friend = await getUserSummary(friendId)
    if (!friend) return NextResponse.json({ error: '好友不存在' }, { status: 404 })
    const [userA, userB] = sortedFriendPair(payload.userId, friendId)
    const friendship = await db.raw.get<{ status: string }>(
      `SELECT status
       FROM team_friendships
       WHERE user_a_id = ? AND user_b_id = ?`,
      [userA, userB],
    )
    if (friendship?.status !== 'accepted') {
      return NextResponse.json({ error: '只能邀请已同意好友进入组队房间' }, { status: 403 })
    }
    if (!(await isTeamUserOnline(friendId))) {
      return NextResponse.json({ error: '好友当前不在线，不能发送组队邀请' }, { status: 409 })
    }
    if (!(await canUserEnterTeamProject(payload.userId, Number(room.project_id)))) {
      return NextResponse.json({ error: '你尚未解锁该项目，不能发起邀请' }, { status: 403 })
    }
    if (!(await canUserEnterTeamProject(friendId, Number(room.project_id)))) {
      return NextResponse.json({ error: '好友尚未解锁该项目，暂时不能一起调查' }, { status: 409 })
    }
    const friendActiveRoom = await db.raw.get<{ room_id: string }>(
      `SELECT r.room_id
       FROM team_story_rooms r
       INNER JOIN team_story_room_members m ON m.room_id = r.room_id
       WHERE m.user_id = ?
         AND r.room_id <> ?
         AND r.status IN ('open', 'started')
       LIMIT 1`,
      [friendId, room.room_id],
    )
    if (friendActiveRoom) {
      return NextResponse.json({ error: `${friend.displayName} 正在组队中，暂时不能邀请` }, { status: 409 })
    }
    const friendActivity = await db.raw.get<{ activity_status: string | null; activity_updated_at: string | null }>(
      `SELECT activity_status, activity_updated_at
       FROM team_presence
       WHERE user_id = ?
         AND last_seen >= DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 90 SECOND)
       LIMIT 1`,
      [friendId],
    )
    if (
      friendActivity?.activity_status === 'solo'
      && friendActivity.activity_updated_at
      && Date.now() - Date.parse(friendActivity.activity_updated_at) < 90_000
    ) {
      return NextResponse.json({ error: `${friend.displayName} 正在单人实训中，暂时不能邀请` }, { status: 409 })
    }
    const existingMember = await db.raw.get<{ user_id: string }>(
      `SELECT user_id FROM team_story_room_members WHERE room_id = ? AND user_id = ?`,
      [room.room_id, friendId],
    )
    if (existingMember) {
      return NextResponse.json(await roomSnapshot(room, payload.userId))
    }
    const existingInvitation = await db.raw.get<{ id: number; status: string }>(
      `SELECT id, status
       FROM team_room_invitations
       WHERE room_id = ? AND invitee_id = ? AND status IN ('pending', 'owner_pending')
       ORDER BY updated_at DESC
       LIMIT 1`,
      [room.room_id, friendId],
    )
    if (existingInvitation) {
      return NextResponse.json(await roomSnapshot(room, payload.userId))
    }
    const capacity = await db.raw.get<{ total: number }>(
      `SELECT
         (SELECT COUNT(*) FROM team_story_room_members WHERE room_id = ?) +
         (SELECT COUNT(*) FROM team_room_invitations WHERE room_id = ? AND status IN ('pending', 'owner_pending')) AS total`,
      [room.room_id, room.room_id],
    )
    if (Number(capacity?.total ?? 0) >= 3) {
      return NextResponse.json({ error: '队伍最多 3 人' }, { status: 409 })
    }

    const invitationStatus = room.owner_id === payload.userId ? 'pending' : 'owner_pending'
    await db.raw.run(
      `INSERT INTO team_room_invitations
         (room_id, inviter_id, invitee_id, requested_by_id, status)
       VALUES (?, ?, ?, ?, ?)`,
      [room.room_id, payload.userId, friendId, payload.userId, invitationStatus],
    )
    await db.raw.run(
      `INSERT INTO team_story_messages (room_id, sender_type, content)
       VALUES (?, 'system', ?)`,
      [
        room.room_id,
        room.owner_id === payload.userId
          ? `已向 ${friend.displayName} 发送组队邀请`
          : `申请邀请 ${friend.displayName}，等待房主同意`,
      ],
    )
  }

  if (body.action === 'kick') {
    if (room.owner_id !== payload.userId) {
      return NextResponse.json({ error: '只有房主可以踢出队员' }, { status: 403 })
    }
    if (room.status !== 'open') {
      return NextResponse.json({ error: '调查开始后不能踢出队员' }, { status: 409 })
    }
    const targetUserId = body.targetUserId?.trim()
    if (!targetUserId || targetUserId === payload.userId) {
      return NextResponse.json({ error: '请选择要踢出的队员' }, { status: 400 })
    }
    const target = await getUserSummary(targetUserId)
    const targetMember = await db.raw.get<{ user_id: string }>(
      `SELECT user_id FROM team_story_room_members WHERE room_id = ? AND user_id = ?`,
      [room.room_id, targetUserId],
    )
    if (!targetMember) {
      return NextResponse.json({ error: '该队员已经不在房间中' }, { status: 404 })
    }
    await db.raw.run(
      `DELETE FROM team_story_room_members WHERE room_id = ? AND user_id = ?`,
      [room.room_id, targetUserId],
    )
    await db.raw.run(
      `UPDATE team_room_invitations
       SET status = 'cancelled', responded_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3)
       WHERE room_id = ? AND invitee_id = ? AND status IN ('pending', 'owner_pending')`,
      [room.room_id, targetUserId],
    )
    await db.raw.run(
      `INSERT INTO team_story_messages (room_id, sender_type, content)
       VALUES (?, 'system', ?)`,
      [room.room_id, `${target?.displayName ?? '队员'} 已被房主移出房间`],
    )
  }

  if (body.action === 'ready' || body.action === 'unready') {
    if (room.owner_id === payload.userId) {
      return NextResponse.json({ error: '房主无需准备，等待队友准备后可直接开始调查' }, { status: 409 })
    }
    if (body.action === 'ready' && currentHp < TEAM_MIN_ENTRY_HP) {
      return NextResponse.json({ error: `当前血量 ${currentHp}/100，低于 ${TEAM_MIN_ENTRY_HP}，不能准备进入章节` }, { status: 409 })
    }
    await db.raw.run(
      `UPDATE team_story_room_members
       SET member_status = ?, hp = ?, updated_at = CURRENT_TIMESTAMP(3)
       WHERE room_id = ? AND user_id = ?`,
      [body.action === 'ready' ? 'ready' : 'joined', currentHp, room.room_id, payload.userId],
    )
  }

  if (body.action === 'start') {
    if (room.owner_id !== payload.userId) {
      return NextResponse.json({ error: '只有房主可以开始调查' }, { status: 403 })
    }
    await db.raw.run(
      `UPDATE team_story_room_members
       SET hp = ?, updated_at = CURRENT_TIMESTAMP(3)
       WHERE room_id = ? AND user_id = ?`,
      [currentHp, room.room_id, payload.userId],
    )
    const memberCount = await db.raw.get<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM team_story_room_members
       WHERE room_id = ?`,
      [room.room_id],
    )
    if (Number(memberCount?.total ?? 0) < 2) {
      return NextResponse.json({ error: '至少需要两名队员才能开始组队调查' }, { status: 409 })
    }
    const waiting = await db.raw.get<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM team_story_room_members
       WHERE room_id = ?
         AND user_id <> ?
         AND member_status NOT IN ('ready', 'playing')`,
      [room.room_id, payload.userId],
    )
    if (Number(waiting?.total ?? 0) > 0) {
      return NextResponse.json({ error: '还有队友未准备' }, { status: 409 })
    }
    const lowHpMembers = await db.raw.all<{ display_name: string; hp: number | null }>(
      `SELECT u.display_name, m.hp
       FROM team_story_room_members m
       INNER JOIN users u ON u.user_id = m.user_id
       WHERE m.room_id = ?
         AND COALESCE(m.hp, 100) < ?`,
      [room.room_id, TEAM_MIN_ENTRY_HP],
    )
    if (lowHpMembers.length > 0) {
      const names = lowHpMembers
        .map(member => `${member.display_name}(${normalizeMemberHp(member.hp)}/100)`)
        .join('、')
      return NextResponse.json({ error: `队友血量不足，不能进入章节：${names}` }, { status: 409 })
    }
    await db.raw.run(
      `UPDATE team_story_rooms
       SET status = 'started', updated_at = CURRENT_TIMESTAMP(3)
       WHERE room_id = ?`,
      [room.room_id],
    )
    await db.raw.run(
      `UPDATE team_story_room_members
       SET member_status = 'selecting', combat_role_id = NULL, updated_at = CURRENT_TIMESTAMP(3)
       WHERE room_id = ?`,
      [room.room_id],
    )
    await db.raw.run(`DELETE FROM team_play_states WHERE room_id = ?`, [room.room_id]).catch(() => undefined)
    await db.raw.run(`DELETE FROM team_play_room_states WHERE room_id = ?`, [room.room_id]).catch(() => undefined)
    await db.raw.run(
      `INSERT INTO team_story_messages (room_id, sender_type, content)
       VALUES (?, 'system', '调查已开始')`,
      [room.room_id],
    )
  }

  if (body.action === 'changeProject') {
    const nextProjectId = Math.max(1, Number(body.projectId) || Number(room.project_id))
    const nextProject = getTeamProjectDefinition(nextProjectId)
    if (room.owner_id !== payload.userId) {
      return NextResponse.json({ error: '只有房主可以切换房间项目' }, { status: 403 })
    }
    if (room.status !== 'open') {
      return NextResponse.json({ error: '调查已开始，不能切换项目' }, { status: 409 })
    }
    const members = await db.raw.all<{ user_id: string; display_name: string }>(
      `SELECT m.user_id, u.display_name
       FROM team_story_room_members m
       INNER JOIN users u ON u.user_id = m.user_id
       WHERE m.room_id = ?`,
      [room.room_id],
    )
    for (const member of members) {
      if (!(await canUserEnterTeamProject(member.user_id, nextProjectId))) {
        return NextResponse.json({ error: `${member.display_name} 尚未解锁「${nextProject.title}」，不能切换到该项目` }, { status: 409 })
      }
    }
    await db.raw.run(
      `UPDATE team_story_rooms
       SET project_id = ?, updated_at = CURRENT_TIMESTAMP(3)
       WHERE room_id = ?`,
      [nextProjectId, room.room_id],
    )
    await db.raw.run(
      `UPDATE team_story_room_members
       SET role_id = NULL, combat_role_id = NULL, member_status = 'joined', updated_at = CURRENT_TIMESTAMP(3)
       WHERE room_id = ?`,
      [room.room_id],
    )
    await db.raw.run(`DELETE FROM team_play_states WHERE room_id = ?`, [room.room_id]).catch(() => undefined)
    await db.raw.run(`DELETE FROM team_play_room_states WHERE room_id = ?`, [room.room_id]).catch(() => undefined)
    await db.raw.run(
      `INSERT INTO team_story_messages (room_id, sender_type, content)
       VALUES (?, 'system', ?)`,
      [room.room_id, `房主已将房间项目切换为「${nextProject.title}」`],
    )
  }

  if (body.action === 'claimCombatRole') {
    const roleId = body.roleId?.trim()
    const role = TEAM_COMBAT_ROLES.find(item => item.roleId === roleId)
    if (!roleId || !role) {
      return NextResponse.json({ error: '战斗角色不存在' }, { status: 400 })
    }
    if (room.status !== 'started') {
      return NextResponse.json({ error: '房主开始调查后才能选择战斗角色' }, { status: 409 })
    }
    await db.raw.run(
      `UPDATE team_story_room_members
       SET combat_role_id = ?, member_status = 'selected', updated_at = CURRENT_TIMESTAMP(3)
       WHERE room_id = ? AND user_id = ?`,
      [roleId, room.room_id, payload.userId],
    )
    await db.raw.run(
      `UPDATE team_play_states
       SET model_id = ?, updated_at = CURRENT_TIMESTAMP(3)
       WHERE room_id = ? AND user_id = ?`,
      [roleId, room.room_id, payload.userId],
    ).catch(() => undefined)
    const selectionState = await db.raw.get<{ waiting: number; total: number }>(
      `SELECT
         SUM(CASE WHEN combat_role_id IS NULL THEN 1 ELSE 0 END) AS waiting,
         COUNT(*) AS total
       FROM team_story_room_members
       WHERE room_id = ?`,
      [room.room_id],
    )
    const user = await getUserSummary(payload.userId)
    await db.raw.run(
      `INSERT INTO team_story_messages (room_id, sender_id, sender_type, content)
       VALUES (?, ?, 'system', ?)`,
      [room.room_id, payload.userId, `${user?.displayName ?? '队友'} 已选择 ${role.name}`],
    )
    if (Number(selectionState?.total ?? 0) >= 2 && Number(selectionState?.waiting ?? 0) === 0) {
      await db.raw.run(
        `UPDATE team_story_room_members
         SET member_status = 'playing', updated_at = CURRENT_TIMESTAMP(3)
         WHERE room_id = ?`,
        [room.room_id],
      )
      await db.raw.run(
        `INSERT INTO team_story_messages (room_id, sender_type, content)
         VALUES (?, 'system', '全部真人角色已选择，调查现场已同步开启')`,
        [room.room_id],
      )
    }
  }

  if (body.action === 'autoAssignCombatRoles') {
    if (room.status !== 'started') {
      return NextResponse.json({ error: '房主开始调查后才能自动分配战斗角色' }, { status: 409 })
    }

    const preferredRoleId = typeof body.roleId === 'string' && TEAM_COMBAT_ROLES.some(role => role.roleId === body.roleId)
      ? body.roleId
      : null
    const members = await db.raw.all<{ user_id: string; combat_role_id: string | null }>(
      `SELECT user_id, combat_role_id
       FROM team_story_room_members
       WHERE room_id = ?
       ORDER BY joined_at ASC`,
      [room.room_id],
    )
    const defaultRoleId = TEAM_COMBAT_ROLES[0]?.roleId
    const nextRoles = new Map<string, string>()

    for (const member of members) {
      if (member.combat_role_id) {
        nextRoles.set(member.user_id, member.combat_role_id)
        continue
      }

      let nextRoleId: string | undefined
      if (member.user_id === payload.userId && preferredRoleId) {
        nextRoleId = preferredRoleId
      } else {
        nextRoleId = defaultRoleId
      }
      if (!nextRoleId) continue

      nextRoles.set(member.user_id, nextRoleId)
      await db.raw.run(
        `UPDATE team_story_room_members
         SET combat_role_id = ?, member_status = 'selected', updated_at = CURRENT_TIMESTAMP(3)
         WHERE room_id = ? AND user_id = ?`,
        [nextRoleId, room.room_id, member.user_id],
      )
      await db.raw.run(
        `UPDATE team_play_states
         SET model_id = ?, updated_at = CURRENT_TIMESTAMP(3)
         WHERE room_id = ? AND user_id = ?`,
        [nextRoleId, room.room_id, member.user_id],
      ).catch(() => undefined)
    }

    if (members.length >= 2 && members.every(member => nextRoles.has(member.user_id))) {
      await db.raw.run(
        `UPDATE team_story_room_members
         SET member_status = 'playing', updated_at = CURRENT_TIMESTAMP(3)
         WHERE room_id = ?`,
        [room.room_id],
      )
      await db.raw.run(
        `INSERT INTO team_story_messages (room_id, sender_type, content)
         VALUES (?, 'system', '倒计时结束，系统已为未确认队员自动分配战斗角色')`,
        [room.room_id],
      )
    }
  }

  if (body.action === 'claim') {
    const roleId = body.roleId?.trim()
    if (!roleId || !roleCardById(Number(room.project_id), roleId)) {
      return NextResponse.json({ error: '角色不存在' }, { status: 400 })
    }
    const occupied = await db.raw.get<{ user_id: string }>(
      `SELECT user_id
       FROM team_story_room_members
       WHERE room_id = ? AND role_id = ? AND user_id <> ?`,
      [room.room_id, roleId, payload.userId],
    )
    if (occupied) return NextResponse.json({ error: '该角色已被队友认领' }, { status: 409 })

    await db.raw.run(
      `UPDATE team_story_room_members
       SET role_id = ?, updated_at = CURRENT_TIMESTAMP(3)
       WHERE room_id = ? AND user_id = ?`,
      [roleId, room.room_id, payload.userId],
    )
    const role = roleCardById(Number(room.project_id), roleId)
    await db.raw.run(
      `INSERT INTO team_story_messages (room_id, sender_id, sender_type, role_id, content)
       VALUES (?, ?, 'system', ?, ?)`,
      [room.room_id, payload.userId, roleId, `${role?.name ?? roleId} 已由真人认领，AI 托管已关闭`],
    )
  }

  if (body.action === 'finish') {
    const passed = body.result === 'victory'
    await db.raw.run(
      `UPDATE team_story_rooms
       SET status = 'open', updated_at = CURRENT_TIMESTAMP(3)
       WHERE room_id = ? AND status <> 'closed'`,
      [room.room_id],
    )
    await db.raw.run(
      `UPDATE team_story_room_members
       SET member_status = 'joined', combat_role_id = NULL, role_id = NULL, updated_at = CURRENT_TIMESTAMP(3)
       WHERE room_id = ?`,
      [room.room_id],
    )
    await db.raw.run(
      `DELETE FROM team_play_states WHERE room_id = ?`,
      [room.room_id],
    ).catch(() => undefined)
    await db.raw.run(`DELETE FROM team_play_room_states WHERE room_id = ?`, [room.room_id]).catch(() => undefined)
    await db.raw.run(
      `INSERT INTO team_story_messages (room_id, sender_type, content)
       VALUES (?, 'system', ?)`,
      [room.room_id, passed ? '组队调查已完成，队伍已返回准备大厅' : '组队调查未通过，队伍已返回准备大厅'],
    )
  }

  if (body.action === 'endBattle') {
    if (room.owner_id !== payload.userId) {
      return NextResponse.json({ error: '只有房主可以结束当前战斗' }, { status: 403 })
    }
    await db.raw.run(
      `UPDATE team_story_rooms
       SET status = 'open', updated_at = CURRENT_TIMESTAMP(3)
       WHERE room_id = ? AND status <> 'closed'`,
      [room.room_id],
    )
    await db.raw.run(
      `UPDATE team_story_room_members
       SET member_status = 'joined', combat_role_id = NULL, updated_at = CURRENT_TIMESTAMP(3)
       WHERE room_id = ?`,
      [room.room_id],
    )
    await db.raw.run(`DELETE FROM team_play_states WHERE room_id = ?`, [room.room_id]).catch(() => undefined)
    await db.raw.run(`DELETE FROM team_play_room_states WHERE room_id = ?`, [room.room_id]).catch(() => undefined)
    await db.raw.run(
      `INSERT INTO team_play_room_states (room_id, state_json, event_json, updated_by_user_id)
       VALUES (?, NULL, ?, ?)
       ON DUPLICATE KEY UPDATE
         state_json = NULL,
         event_json = VALUES(event_json),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP(3)`,
      [room.room_id, JSON.stringify({ type: 'battleEnded', byUserId: payload.userId, at: Date.now() }), payload.userId],
    ).catch(() => undefined)
    await db.raw.run(
      `INSERT INTO team_story_messages (room_id, sender_type, content)
       VALUES (?, 'system', '房主已结束当前战斗，队伍返回组队大厅')`,
      [room.room_id],
    )
  }

  if (body.action === 'leave') {
    if (room.status === 'started') {
      return NextResponse.json({ error: '调查仍在进行中，不能退出队伍。可关闭大厅稍后重新进入，等结算后再退出。' }, { status: 409 })
    }
    if (room.owner_id === payload.userId) {
      return NextResponse.json({ error: '房主不能直接退出，请先解散队伍' }, { status: 409 })
    }
    const member = await getUserSummary(payload.userId)
    await db.raw.run(
      `DELETE FROM team_story_room_members WHERE room_id = ? AND user_id = ?`,
      [room.room_id, payload.userId],
    )
    await db.raw.run(
      `UPDATE team_room_invitations
       SET status = 'cancelled', responded_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3)
       WHERE room_id = ? AND requested_by_id = ? AND status = 'owner_pending'`,
      [room.room_id, payload.userId],
    )
    await db.raw.run(
      `INSERT INTO team_story_messages (room_id, sender_type, content)
       VALUES (?, 'system', ?)`,
      [room.room_id, `${member?.displayName ?? '队员'} 已退出队伍，房间仍由房主保留`],
    )
    return NextResponse.json({
      room: null,
      closed: false,
      left: true,
      roleCards: roleCardsForTeamProject(Number(room.project_id)),
      combatRoles: TEAM_COMBAT_ROLES,
      members: [],
      messages: [],
    })
  }

  if (body.action === 'disband') {
    if (room.owner_id !== payload.userId) {
      return NextResponse.json({ error: '只有房主可以解散队伍' }, { status: 403 })
    }
    await db.raw.run(
      `UPDATE team_story_rooms SET status = 'closed', updated_at = CURRENT_TIMESTAMP(3) WHERE room_id = ?`,
      [room.room_id],
    )
    await db.raw.run(`DELETE FROM team_play_states WHERE room_id = ?`, [room.room_id]).catch(() => undefined)
    await db.raw.run(
      `INSERT INTO team_play_room_states (room_id, event_json, updated_by_user_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         event_json = VALUES(event_json),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP(3)`,
      [room.room_id, JSON.stringify({ type: 'roomDisbanded', byUserId: payload.userId, at: Date.now() }), payload.userId],
    ).catch(() => undefined)
    await db.raw.run(
      `UPDATE team_room_invitations
       SET status = 'cancelled', responded_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3)
       WHERE room_id = ? AND status IN ('pending', 'owner_pending')`,
      [room.room_id],
    )
    return NextResponse.json({
      room: null,
      closed: true,
      roleCards: roleCardsForTeamProject(Number(room.project_id)),
      combatRoles: TEAM_COMBAT_ROLES,
      members: [],
      messages: [],
    })
  }

  if (body.action === 'send') {
    const content = body.content?.trim()
    if (!content) return NextResponse.json({ error: '消息不能为空' }, { status: 400 })
    const member = await db.raw.get<{ role_id: string | null }>(
      `SELECT role_id FROM team_story_room_members WHERE room_id = ? AND user_id = ?`,
      [room.room_id, payload.userId],
    )
    await db.raw.run(
      `INSERT INTO team_story_messages (room_id, sender_id, sender_type, role_id, content)
       VALUES (?, ?, 'user', ?, ?)`,
      [room.room_id, payload.userId, member?.role_id ?? null, content.slice(0, 1200)],
    )
  }

  if (body.action === 'askRole') {
    const roleId = (body.roleId ?? '').trim()
    const content = (body.content ?? '').trim()
    const role = roleId ? roleCardById(Number(room.project_id), roleId) : null
    if (!role || !content) return NextResponse.json({ error: '请选择角色并填写追问' }, { status: 400 })
    const roleOwner = await db.raw.get<{ user_id: string; display_name: string }>(
      `SELECT m.user_id, u.display_name
       FROM team_story_room_members m
       INNER JOIN users u ON u.user_id = m.user_id
       WHERE m.room_id = ? AND m.role_id = ?
       LIMIT 1`,
      [room.room_id, roleId],
    )
    if (roleOwner) {
      return NextResponse.json({ error: `${roleOwner.display_name} 已认领 ${role.name}，请在队伍聊天中沟通` }, { status: 409 })
    }

    await db.raw.run(
      `INSERT INTO team_story_messages (room_id, sender_id, sender_type, content)
       VALUES (?, ?, 'user', ?)`,
      [room.room_id, payload.userId, `追问 ${role.name}：${content.slice(0, 1000)}`],
    )

    const recentRows = await db.raw.all<StoryMessageRow>(
      `SELECT msg.id, msg.room_id, msg.sender_id, msg.sender_type, msg.role_id, msg.content, msg.created_at,
              u.display_name
       FROM team_story_messages msg
       LEFT JOIN users u ON u.user_id = msg.sender_id
       WHERE msg.room_id = ?
       ORDER BY msg.created_at DESC
       LIMIT 12`,
      [room.room_id],
    )
    const recentMessages = recentRows.reverse().map(message => ({
      speaker: message.sender_type === 'ai'
        ? roleCardById(Number(room.project_id), message.role_id ?? '')?.name ?? 'AI角色'
        : message.sender_type === 'system'
          ? '系统'
          : message.display_name ?? '队友',
      content: message.content,
    }))
    const reply = await generateRoleAgentReply({
      projectId: Number(room.project_id),
      roleCard: role,
      userQuestion: content,
      recentMessages,
    })
    await db.raw.run(
      `INSERT INTO team_story_messages (room_id, sender_type, role_id, content)
       VALUES (?, 'ai', ?, ?)`,
      [room.room_id, role.roleId, reply],
    )
  }

  await db.raw.run(`UPDATE team_story_rooms SET updated_at = CURRENT_TIMESTAMP(3) WHERE room_id = ?`, [room.room_id])
  const nextRoom = await requireRoom(room.room_id)
  return NextResponse.json(nextRoom ? await roomSnapshot(nextRoom, payload.userId) : { ok: true })
}
