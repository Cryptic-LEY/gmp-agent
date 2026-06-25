import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { courseLessons } from '@/db/schema'
import { verifyToken } from '@/lib/auth'
import { calculateLessonScore, getLessonBaseScore, isLessonResourceCompleted, safeJsonArray } from '@/lib/course-learning'
import { canUseTeacherResource, getCourseScopeTeacherId } from '@/lib/course-teacher-scope'

type InsertResult = { insertId?: number | string }

interface ProgressRow {
  ppt_viewed_pages: string
  ppt_completed: number
  video_watched_seconds: number
  video_max_position: number
  video_completed: number
  test_score: number | null
  test_passed: number
  test_completed: number
  note_content: string | null
  annotation_count: number
}

interface AnnotationRow {
  id: number
  resource: 'ppt' | 'video'
  page_number: number | null
  video_time: number | null
  text: string
  created_at: string
}

const CREATE_ANNOTATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS course_lesson_annotations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id VARCHAR(191) NOT NULL,
    lesson_id VARCHAR(191) NOT NULL,
    resource VARCHAR(32) NOT NULL DEFAULT 'ppt',
    page_number INT,
    video_time INT,
    text LONGTEXT NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_course_lesson_annotations_user_lesson (user_id, lesson_id, created_at),
    KEY idx_course_lesson_annotations_lesson (lesson_id),
    CONSTRAINT fk_course_lesson_annotations_user FOREIGN KEY (user_id) REFERENCES users(user_id),
    CONSTRAINT fk_course_lesson_annotations_lesson FOREIGN KEY (lesson_id) REFERENCES course_lessons(lesson_id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`

function formatAnnotation(row: AnnotationRow) {
  return {
    id: Number(row.id),
    resource: row.resource,
    pageNumber: row.page_number,
    videoTime: row.video_time,
    text: row.text,
    createdAt: row.created_at,
  }
}

async function ensureAnnotationsTable() {
  await db.raw.run(CREATE_ANNOTATIONS_TABLE)
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [lesson] = await db.select().from(courseLessons).where(eq(courseLessons.lessonId, id))
  if (!lesson || lesson.status !== 'published' || !(await canUseTeacherResource(payload, lesson.teacherId))) {
    return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  }

  await ensureAnnotationsTable()
  const rows = await db.raw.all<AnnotationRow>(
    `
      SELECT id, resource, page_number, video_time, text, created_at
      FROM course_lesson_annotations
      WHERE user_id = ? AND lesson_id = ?
      ORDER BY created_at DESC, id DESC
    `,
    [payload.userId, id],
  )

  return NextResponse.json({ annotations: rows.map(formatAnnotation) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [lesson] = await db.select().from(courseLessons).where(eq(courseLessons.lessonId, id))
  if (!lesson || lesson.status !== 'published' || !(await canUseTeacherResource(payload, lesson.teacherId))) {
    return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  }

  let body: { resource?: string; pageNumber?: number; videoTime?: number; text?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求体格式错误' }, { status: 400 })
  }

  const text = body.text?.trim()
  if (!text) return NextResponse.json({ error: '标注内容不能为空' }, { status: 400 })

  const resource: 'ppt' | 'video' = body.resource === 'video' ? 'video' : 'ppt'
  const rawPageNumber = Number(body.pageNumber)
  const pageNumber = resource === 'ppt' && Number.isFinite(rawPageNumber)
    ? Math.max(1, Math.min(Number(lesson.pptPageCount || rawPageNumber), Math.floor(rawPageNumber)))
    : null
  const rawVideoTime = Number(body.videoTime)
  const videoTime = resource === 'video' && Number.isFinite(rawVideoTime)
    ? Math.max(0, Math.floor(rawVideoTime))
    : null

  await ensureAnnotationsTable()
  const result = await db.raw.run(
    `
      INSERT INTO course_lesson_annotations
        (user_id, lesson_id, resource, page_number, video_time, text)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [payload.userId, id, resource, pageNumber, videoTime, text],
  ) as InsertResult

  const [countRow] = await db.raw.all<{ count: number }>(
    `SELECT COUNT(*) AS count FROM course_lesson_annotations WHERE user_id = ? AND lesson_id = ?`,
    [payload.userId, id],
  )
  const annotationCount = Number(countRow?.count ?? 0)

  const lessons = await db.select().from(courseLessons).where(eq(courseLessons.status, 'published'))
  const scopeTeacherId = await getCourseScopeTeacherId(payload)
  const scopedLessons = payload.role === 'admin' ? lessons : lessons.filter(item => item.teacherId === scopeTeacherId)
  const current = await db.raw.get<ProgressRow>('SELECT * FROM course_lesson_progress WHERE user_id = ? AND lesson_id = ?', [payload.userId, id])
  const progressForScore = {
    pptCompleted: current?.ppt_completed ?? 0,
    videoCompleted: current?.video_completed ?? 0,
    testPassed: current?.test_passed ?? 0,
    testScore: current?.test_score ?? null,
    noteContent: current?.note_content ?? '',
    annotationCount,
  }
  const scoreOptions = {
    hasPpt: Boolean(lesson.pptUrl) && Number(lesson.pptPageCount ?? 0) > 0,
    hasVideo: Boolean(lesson.videoUrl) && Number(lesson.videoDuration ?? 0) > 0,
    hasTest: safeJsonArray<unknown>(lesson.testQuestions).length > 0,
  }
  const lessonScore = calculateLessonScore(progressForScore, getLessonBaseScore(scopedLessons.length), scoreOptions)
  const completed = isLessonResourceCompleted(progressForScore, scoreOptions)

  await db.raw.run(`
    INSERT INTO course_lesson_progress (
      user_id, lesson_id, ppt_viewed_pages, ppt_completed, video_watched_seconds, video_max_position,
      video_completed, test_score, test_passed, test_completed, note_content, annotation_count, lesson_score, completed, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, IF(?, CURRENT_TIMESTAMP(3), NULL))
    ON DUPLICATE KEY UPDATE
      annotation_count = VALUES(annotation_count),
      lesson_score = VALUES(lesson_score),
      completed = VALUES(completed),
      completed_at = IF(VALUES(completed) = 1 AND completed_at IS NULL, CURRENT_TIMESTAMP(3), completed_at),
      updated_at = CURRENT_TIMESTAMP(3)
  `, [
    payload.userId,
    id,
    current?.ppt_viewed_pages ?? '[]',
    current?.ppt_completed ?? 0,
    current?.video_watched_seconds ?? 0,
    current?.video_max_position ?? 0,
    current?.video_completed ?? 0,
    current?.test_score ?? null,
    current?.test_passed ?? 0,
    current?.test_completed ?? 0,
    current?.note_content ?? '',
    annotationCount,
    lessonScore,
    completed,
    completed,
  ])

  const [inserted] = await db.raw.all<AnnotationRow>(
    `
      SELECT id, resource, page_number, video_time, text, created_at
      FROM course_lesson_annotations
      WHERE id = ?
    `,
    [Number(result.insertId ?? 0)],
  )

  return NextResponse.json({
    annotation: inserted ? formatAnnotation(inserted) : null,
    annotationCount,
    lessonScore,
    completed,
  })
}
