import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import {
  canUserEnterTeamProject,
  ensureTeamCollaborationSchema,
  getTeamProjectDefinition,
  getUserSummary,
  touchTeamPresence,
} from '@/lib/team-collaboration'

interface InvitationRow {
  id: number
  room_id: string
  project_id: number
  room_title: string
  room_status: string
  owner_id: string
  inviter_id: string
  inviter_name: string
  inviter_avatar: string | null
  invitee_id: string
  invitee_name: string
  invitee_avatar: string | null
  requested_by_id: string
  requester_name: string
  status: string
  created_at: string
  updated_at: string
}

function auth(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  return token ? verifyToken(token) : null
}

function normalizeInvitation(row: InvitationRow) {
  const project = getTeamProjectDefinition(Number(row.project_id))
  return {
    id: Number(row.id),
    roomId: row.room_id,
    projectId: Number(row.project_id),
    projectTitle: project.title,
    missionCode: project.missionCode,
    roomTitle: row.room_title,
    roomStatus: row.room_status,
    ownerId: row.owner_id,
    inviterId: row.inviter_id,
    inviterName: row.inviter_name,
    inviterAvatar: row.inviter_avatar,
    inviteeId: row.invitee_id,
    inviteeName: row.invitee_name,
    inviteeAvatar: row.invitee_avatar,
    requestedById: row.requested_by_id,
    requesterName: row.requester_name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const invitationSelect = `
  SELECT i.id, i.room_id, r.project_id, r.title AS room_title, r.status AS room_status, r.owner_id,
         i.inviter_id, inviter.display_name AS inviter_name, inviter.avatar_url AS inviter_avatar,
         i.invitee_id, invitee.display_name AS invitee_name, invitee.avatar_url AS invitee_avatar,
         i.requested_by_id, requester.display_name AS requester_name,
         i.status, i.created_at, i.updated_at
  FROM team_room_invitations i
  INNER JOIN team_story_rooms r ON r.room_id = i.room_id
  INNER JOIN users inviter ON inviter.user_id = i.inviter_id
  INNER JOIN users invitee ON invitee.user_id = i.invitee_id
  INNER JOIN users requester ON requester.user_id = i.requested_by_id
`

export async function GET(req: NextRequest) {
  const payload = auth(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureTeamCollaborationSchema()
  await touchTeamPresence(payload.userId)

  const [incomingRows, approvalRows, sentRows] = await Promise.all([
    db.raw.all<InvitationRow>(
      `${invitationSelect}
       WHERE i.invitee_id = ? AND i.status = 'pending' AND r.status = 'open'
       ORDER BY i.updated_at DESC
       LIMIT 30`,
      [payload.userId],
    ),
    db.raw.all<InvitationRow>(
      `${invitationSelect}
       WHERE r.owner_id = ? AND i.status = 'owner_pending' AND r.status = 'open'
       ORDER BY i.updated_at DESC
       LIMIT 30`,
      [payload.userId],
    ),
    db.raw.all<InvitationRow>(
      `${invitationSelect}
       WHERE i.requested_by_id = ? AND i.status IN ('pending', 'owner_pending')
       ORDER BY i.updated_at DESC
       LIMIT 30`,
      [payload.userId],
    ),
  ])

  return NextResponse.json({
    incoming: incomingRows.map(normalizeInvitation),
    approvals: approvalRows.map(normalizeInvitation),
    sent: sentRows.map(normalizeInvitation),
  })
}

export async function POST(req: NextRequest) {
  const payload = auth(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureTeamCollaborationSchema()
  await touchTeamPresence(payload.userId)
  const body = await req.json().catch(() => ({})) as {
    invitationId?: number
    action?: 'accept' | 'reject' | 'ignore' | 'approve' | 'deny'
  }
  const invitationId = Number(body.invitationId)
  if (!Number.isInteger(invitationId) || invitationId <= 0) {
    return NextResponse.json({ error: '邀请信息无效' }, { status: 400 })
  }

  const invitation = await db.raw.get<InvitationRow>(
    `${invitationSelect} WHERE i.id = ? LIMIT 1`,
    [invitationId],
  )
  if (!invitation) return NextResponse.json({ error: '邀请不存在' }, { status: 404 })
  if (
    body.action === 'accept'
    && invitation.invitee_id === payload.userId
    && invitation.status === 'accepted'
  ) {
    const member = await db.raw.get<{ user_id: string }>(
      `SELECT user_id
       FROM team_story_room_members
       WHERE room_id = ? AND user_id = ?`,
      [invitation.room_id, payload.userId],
    )
    if (member) {
      return NextResponse.json({
        ok: true,
        status: 'accepted',
        roomId: invitation.room_id,
        projectId: Number(invitation.project_id),
      })
    }
  }
  if (invitation.room_status !== 'open') {
    return NextResponse.json({ error: '该队伍已开始调查或已关闭' }, { status: 409 })
  }

  if (body.action === 'approve' || body.action === 'deny') {
    if (invitation.owner_id !== payload.userId || invitation.status !== 'owner_pending') {
      return NextResponse.json({ error: '没有权限处理该入队申请' }, { status: 403 })
    }
    const isSelfJoinRequest = invitation.requested_by_id === invitation.invitee_id
    if (body.action === 'approve' && isSelfJoinRequest) {
      if (!(await canUserEnterTeamProject(invitation.invitee_id, Number(invitation.project_id)))) {
        return NextResponse.json({ error: '申请人尚未解锁该项目，不能加入本次调查' }, { status: 409 })
      }
      const memberCount = await db.raw.get<{ total: number }>(
        `SELECT COUNT(*) AS total FROM team_story_room_members WHERE room_id = ?`,
        [invitation.room_id],
      )
      if (Number(memberCount?.total ?? 0) >= 3) {
        return NextResponse.json({ error: '队伍人数已满' }, { status: 409 })
      }
      await db.raw.run(
        `INSERT INTO team_story_room_members (room_id, user_id, member_status)
         VALUES (?, ?, 'joined')
         ON DUPLICATE KEY UPDATE member_status = 'joined', updated_at = CURRENT_TIMESTAMP(3)`,
        [invitation.room_id, invitation.invitee_id],
      )
      await db.raw.run(
        `UPDATE team_room_invitations
         SET status = 'accepted', responded_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [invitationId],
      )
      await db.raw.run(
        `INSERT INTO team_story_messages (room_id, sender_type, content)
         VALUES (?, 'system', ?)`,
        [invitation.room_id, `房主已同意 ${invitation.invitee_name} 加入队伍`],
      )
      return NextResponse.json({
        ok: true,
        status: 'accepted',
        roomId: invitation.room_id,
        projectId: Number(invitation.project_id),
      })
    }
    const nextStatus = body.action === 'approve' ? 'pending' : 'rejected'
    await db.raw.run(
      `UPDATE team_room_invitations
       SET status = ?, responded_at = ?, updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [nextStatus, body.action === 'deny' ? new Date() : null, invitationId],
    )
    await db.raw.run(
      `INSERT INTO team_story_messages (room_id, sender_type, content)
       VALUES (?, 'system', ?)`,
      [
        invitation.room_id,
        body.action === 'approve'
          ? `房主已同意邀请 ${invitation.invitee_name}`
          : `房主拒绝了 ${invitation.invitee_name} 的入队申请`,
      ],
    )
    return NextResponse.json({ ok: true, status: nextStatus })
  }

  if (invitation.invitee_id !== payload.userId || invitation.status !== 'pending') {
    return NextResponse.json({ error: '该邀请当前不可处理' }, { status: 403 })
  }

  if (body.action === 'reject' || body.action === 'ignore') {
    await db.raw.run(
      `UPDATE team_room_invitations
       SET status = 'rejected', responded_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [invitationId],
    )
    await db.raw.run(
      `INSERT INTO team_story_messages (room_id, sender_type, content)
       VALUES (?, 'system', ?)`,
      [invitation.room_id, `${invitation.invitee_name} 未接受组队邀请`],
    )
    return NextResponse.json({ ok: true, status: 'rejected' })
  }

  if (body.action !== 'accept') {
    return NextResponse.json({ error: '不支持的邀请操作' }, { status: 400 })
  }
  if (!(await canUserEnterTeamProject(payload.userId, Number(invitation.project_id)))) {
    return NextResponse.json({ error: '你尚未解锁该项目，不能加入本次调查' }, { status: 409 })
  }

  const existingRooms = await db.raw.all<{
    room_id: string
    owner_id: string
    member_total: number
  }>(
    `SELECT r.room_id, r.owner_id,
            (SELECT COUNT(*) FROM team_story_room_members members WHERE members.room_id = r.room_id) AS member_total
     FROM team_story_rooms r
     INNER JOIN team_story_room_members m ON m.room_id = r.room_id
     WHERE m.user_id = ?
       AND r.room_id <> ?
       AND r.status IN ('open', 'started')
     ORDER BY r.updated_at DESC
     LIMIT 10`,
    [payload.userId, invitation.room_id],
  )
  const occupiedRoom = existingRooms.find(existingRoom => Number(existingRoom.member_total) > 1)
  if (occupiedRoom) {
    return NextResponse.json({ error: '你正在另一个多人队伍中，请先退出后再接受邀请' }, { status: 409 })
  }
  for (const existingRoom of existingRooms) {
    if (existingRoom.owner_id === payload.userId) {
      await db.raw.run(
        `UPDATE team_story_rooms
         SET status = 'closed', updated_at = CURRENT_TIMESTAMP(3)
         WHERE room_id = ?`,
        [existingRoom.room_id],
      )
      await db.raw.run(
        `UPDATE team_room_invitations
         SET status = 'cancelled', responded_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3)
         WHERE room_id = ? AND status IN ('pending', 'owner_pending')`,
        [existingRoom.room_id],
      )
    } else {
      await db.raw.run(
        `DELETE FROM team_story_room_members WHERE room_id = ? AND user_id = ?`,
        [existingRoom.room_id, payload.userId],
      )
    }
  }

  const memberCount = await db.raw.get<{ total: number }>(
    `SELECT COUNT(*) AS total FROM team_story_room_members WHERE room_id = ?`,
    [invitation.room_id],
  )
  if (Number(memberCount?.total ?? 0) >= 3) {
    return NextResponse.json({ error: '队伍人数已满' }, { status: 409 })
  }

  await db.raw.run(
    `INSERT INTO team_story_room_members (room_id, user_id, member_status)
     VALUES (?, ?, 'joined')
     ON DUPLICATE KEY UPDATE member_status = 'joined', updated_at = CURRENT_TIMESTAMP(3)`,
    [invitation.room_id, payload.userId],
  )
  await db.raw.run(
    `UPDATE team_room_invitations
     SET status = 'accepted', responded_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3)
     WHERE id = ?`,
    [invitationId],
  )
  const user = await getUserSummary(payload.userId)
  await db.raw.run(
    `INSERT INTO team_story_messages (room_id, sender_type, content)
     VALUES (?, 'system', ?)`,
    [invitation.room_id, `${user?.displayName ?? '队员'} 已加入队伍`],
  )

  return NextResponse.json({
    ok: true,
    status: 'accepted',
    roomId: invitation.room_id,
    projectId: Number(invitation.project_id),
  })
}
