import { createHash } from 'crypto'
import { db } from '@/db'
import { CHAPTER_QUIZ_MAX_ATTEMPTS, CHAPTER_QUIZ_RETAKE_LIMIT } from '@/lib/course-quiz-blueprint'

export interface CourseQuizSession {
  id: number
  trainingId: string
  teacherId: string
  userId: string
  eduLevel: string
  questionIds: string[]
  attemptCount: number
  createdAt: string
  updatedAt: string
}

interface CourseQuizSessionRow {
  id: number | string
  training_id: string
  teacher_id: string
  user_id: string
  edu_level: string
  question_ids: string
  attempt_count: number
  created_at: string
  updated_at: string
}

type InsertResult = { insertId?: number | string }

const CREATE_COURSE_QUIZ_SESSIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS course_quiz_sessions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    training_id VARCHAR(191) NOT NULL,
    teacher_id VARCHAR(191) NOT NULL,
    user_id VARCHAR(191) NOT NULL,
    edu_level VARCHAR(64) NOT NULL,
    question_ids LONGTEXT NOT NULL,
    attempt_count INT NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uniq_course_quiz_session (training_id, teacher_id, user_id, edu_level),
    KEY idx_course_quiz_sessions_user (user_id),
    KEY idx_course_quiz_sessions_teacher (teacher_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`

function parseQuestionIds(value: string) {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.map(item => String(item)).filter(Boolean)
      : []
  } catch {
    return []
  }
}

function normalizeRow(row: CourseQuizSessionRow): CourseQuizSession {
  return {
    id: Number(row.id),
    trainingId: row.training_id,
    teacherId: row.teacher_id,
    userId: row.user_id,
    eduLevel: row.edu_level,
    questionIds: parseQuestionIds(row.question_ids),
    attemptCount: Number(row.attempt_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function sessionWhere() {
  return `training_id = ? AND teacher_id = ? AND user_id = ? AND edu_level = ?`
}

export async function ensureCourseQuizSessionTable() {
  await db.raw.run(CREATE_COURSE_QUIZ_SESSIONS_TABLE)
}

export async function getCourseQuizSession({
  trainingId,
  teacherId,
  userId,
  eduLevel,
}: {
  trainingId: string
  teacherId: string
  userId: string
  eduLevel: string
}) {
  await ensureCourseQuizSessionTable()
  const row = await db.raw.get<CourseQuizSessionRow>(
    `SELECT * FROM course_quiz_sessions WHERE ${sessionWhere()} LIMIT 1`,
    [trainingId, teacherId, userId, eduLevel],
  )
  return row ? normalizeRow(row) : null
}

export async function getOrCreateCourseQuizSession({
  trainingId,
  teacherId,
  userId,
  eduLevel,
  questionIds,
}: {
  trainingId: string
  teacherId: string
  userId: string
  eduLevel: string
  questionIds: string[]
}) {
  await ensureCourseQuizSessionTable()
  const existing = await getCourseQuizSession({ trainingId, teacherId, userId, eduLevel })
  if (existing?.questionIds.length) return existing

  const serialized = JSON.stringify(questionIds)
  if (existing) {
    await db.raw.run(
      `UPDATE course_quiz_sessions SET question_ids = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
      [serialized, existing.id],
    )
    return {
      ...existing,
      questionIds,
    }
  }

  const result = await db.raw.run(
    `
      INSERT INTO course_quiz_sessions
        (training_id, teacher_id, user_id, edu_level, question_ids)
      VALUES (?, ?, ?, ?, ?)
    `,
    [trainingId, teacherId, userId, eduLevel, serialized],
  ) as InsertResult

  return {
    id: Number(result.insertId ?? 0),
    trainingId,
    teacherId,
    userId,
    eduLevel,
    questionIds,
    attemptCount: 0,
    createdAt: '',
    updatedAt: '',
  }
}

export async function incrementCourseQuizAttempt(sessionId: number) {
  await ensureCourseQuizSessionTable()
  await db.raw.run(
    `UPDATE course_quiz_sessions SET attempt_count = attempt_count + 1, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
    [sessionId],
  )
}

export function getCourseQuizAttemptMeta(attemptCount: number) {
  const usedAttempts = Math.max(0, Number(attemptCount || 0))
  const nextAttemptNumber = Math.min(CHAPTER_QUIZ_MAX_ATTEMPTS, usedAttempts + 1)
  const remainingRetakes = Math.max(0, CHAPTER_QUIZ_RETAKE_LIMIT - Math.max(0, usedAttempts - 1))

  return {
    usedAttempts,
    nextAttemptNumber,
    maxAttempts: CHAPTER_QUIZ_MAX_ATTEMPTS,
    retakeLimit: CHAPTER_QUIZ_RETAKE_LIMIT,
    remainingRetakes,
    exhausted: usedAttempts >= CHAPTER_QUIZ_MAX_ATTEMPTS,
  }
}

function seededNumber(seed: string) {
  const digest = createHash('sha1').update(seed).digest('hex').slice(0, 12)
  return Number.parseInt(digest, 16)
}

export function stableShuffle<T>(items: T[], seed: string) {
  return [...items]
    .map((item, index) => ({ item, order: seededNumber(`${seed}|${index}|${JSON.stringify(item)}`) }))
    .sort((left, right) => left.order - right.order)
    .map(entry => entry.item)
}
