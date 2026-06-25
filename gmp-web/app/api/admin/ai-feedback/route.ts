import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { verifyToken } from '@/lib/auth'

type FeedbackStatus = 'open' | 'reviewing' | 'resolved'
type FeedbackListStatus = FeedbackStatus | 'all'

interface FeedbackRow {
  id: number | string
  userId: string
  userName: string | null
  userEmail: string | null
  sessionId: string | null
  messageId: number | string | null
  messageContent: string
  userComment: string | null
  status: FeedbackStatus | string
  createdAt: string
}

interface SummaryRow {
  status: string
  count: number | string
}

const VALID_STATUSES = new Set<FeedbackStatus>(['open', 'reviewing', 'resolved'])
const LIST_STATUSES = new Set<FeedbackListStatus>(['all', 'open', 'reviewing', 'resolved'])

function getAuthPayload(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  return token ? verifyToken(token) : null
}

function ensureAdmin(req: NextRequest) {
  const payload = getAuthPayload(req)
  return payload?.role === 'admin' ? payload : null
}

function listStatus(value: string | null): FeedbackListStatus {
  return value && LIST_STATUSES.has(value as FeedbackListStatus) ? value as FeedbackListStatus : 'all'
}

function patchStatus(value: unknown): FeedbackStatus | null {
  return typeof value === 'string' && VALID_STATUSES.has(value as FeedbackStatus) ? value as FeedbackStatus : null
}

async function ensureFeedbackSchema() {
  await db.raw.run(`
    CREATE TABLE IF NOT EXISTS ai_feedback_log (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id VARCHAR(191) NOT NULL,
      session_id VARCHAR(191),
      message_id BIGINT UNSIGNED,
      message_role VARCHAR(32) NOT NULL DEFAULT 'assistant',
      message_content LONGTEXT NOT NULL,
      user_comment LONGTEXT,
      status VARCHAR(32) NOT NULL DEFAULT 'open',
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      KEY idx_ai_feedback_log_user_created (user_id, created_at),
      KEY idx_ai_feedback_log_session (session_id),
      KEY idx_ai_feedback_log_message (message_id),
      CONSTRAINT fk_ai_feedback_log_user FOREIGN KEY (user_id) REFERENCES users(user_id),
      CONSTRAINT fk_ai_feedback_log_session FOREIGN KEY (session_id) REFERENCES ai_chat_sessions(session_id) ON DELETE SET NULL,
      CONSTRAINT fk_ai_feedback_log_message FOREIGN KEY (message_id) REFERENCES ai_chat_messages(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

async function buildFeedbackResponse(status: FeedbackListStatus) {
  await ensureFeedbackSchema()

  const whereSql = status === 'all' ? '' : 'WHERE f.status = ?'
  const params = status === 'all' ? [] : [status]
  const rows = await db.raw.all<FeedbackRow>(`
    SELECT
      f.id AS id,
      f.user_id AS userId,
      COALESCE(NULLIF(u.display_name, ''), f.user_id) AS userName,
      COALESCE(u.email, '') AS userEmail,
      f.session_id AS sessionId,
      f.message_id AS messageId,
      f.message_content AS messageContent,
      f.user_comment AS userComment,
      f.status AS status,
      f.created_at AS createdAt
    FROM ai_feedback_log f
    LEFT JOIN users u ON u.user_id = f.user_id
    ${whereSql}
    ORDER BY f.created_at DESC
    LIMIT 100
  `, params)

  const summaryRows = await db.raw.all<SummaryRow>(`
    SELECT status, COUNT(*) AS count
    FROM ai_feedback_log
    GROUP BY status
  `)

  const summary = { total: 0, open: 0, reviewing: 0, resolved: 0 }
  for (const row of summaryRows) {
    const count = Number(row.count || 0)
    summary.total += count
    if (row.status === 'open') summary.open = count
    if (row.status === 'reviewing') summary.reviewing = count
    if (row.status === 'resolved') summary.resolved = count
  }

  return {
    items: rows.map(row => ({
      id: Number(row.id),
      userId: row.userId,
      userName: row.userName || row.userId,
      userEmail: row.userEmail || '',
      sessionId: row.sessionId,
      messageId: row.messageId === null ? null : Number(row.messageId),
      messageContent: row.messageContent,
      userComment: row.userComment,
      status: row.status || 'open',
      createdAt: row.createdAt,
    })),
    summary,
  }
}

export async function GET(req: NextRequest) {
  if (!ensureAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const status = listStatus(req.nextUrl.searchParams.get('status'))
    return NextResponse.json(await buildFeedbackResponse(status))
  } catch (err) {
    console.error('load ai feedback failed', err)
    return NextResponse.json({ error: '读取AI反馈失败' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  if (!ensureAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await ensureFeedbackSchema()
    const body = await req.json() as { id?: unknown; status?: unknown }
    const id = Number(body.id)
    const status = patchStatus(body.status)

    if (!Number.isFinite(id) || id <= 0 || !status) {
      return NextResponse.json({ error: 'Invalid feedback status' }, { status: 400 })
    }

    await db.raw.run(
      'UPDATE ai_feedback_log SET status = ? WHERE id = ?',
      [status, Math.trunc(id)],
    )

    const nextListStatus = listStatus(req.nextUrl.searchParams.get('status'))
    return NextResponse.json(await buildFeedbackResponse(nextListStatus))
  } catch (err) {
    console.error('update ai feedback failed', err)
    return NextResponse.json({ error: '更新AI反馈失败' }, { status: 500 })
  }
}
