import { db } from '@/db'

export interface CourseChapterQuizConfig {
  trainingId: string
  teacherId: string
  title: string
  description: string | null
  questionCount: number
  passScore: number
  durationMinutes: number
  status: 'draft' | 'published'
  createdAt: string
  updatedAt: string
}

interface CourseChapterQuizRow {
  training_id: string
  teacher_id: string
  title: string
  description: string | null
  question_count: number
  pass_score: number
  duration_minutes: number
  status: 'draft' | 'published'
  created_at: string
  updated_at: string
}

const CREATE_COURSE_CHAPTER_QUIZZES_TABLE = `
  CREATE TABLE IF NOT EXISTS course_chapter_quizzes (
    training_id VARCHAR(191) NOT NULL,
    teacher_id VARCHAR(191) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description LONGTEXT,
    question_count INT NOT NULL DEFAULT 60,
    pass_score INT NOT NULL DEFAULT 60,
    duration_minutes INT NOT NULL DEFAULT 90,
    status VARCHAR(32) NOT NULL DEFAULT 'draft',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (training_id, teacher_id),
    KEY idx_course_chapter_quizzes_teacher (teacher_id),
    KEY idx_course_chapter_quizzes_status (status),
    CONSTRAINT fk_course_chapter_quizzes_training FOREIGN KEY (training_id) REFERENCES training_projects(training_id) ON DELETE CASCADE,
    CONSTRAINT fk_course_chapter_quizzes_teacher FOREIGN KEY (teacher_id) REFERENCES users(user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`

function normalizeRow(row: CourseChapterQuizRow): CourseChapterQuizConfig {
  return {
    trainingId: row.training_id,
    teacherId: row.teacher_id,
    title: row.title,
    description: row.description,
    questionCount: Number(row.question_count ?? 60),
    passScore: Number(row.pass_score ?? 60),
    durationMinutes: Number(row.duration_minutes ?? 90),
    status: row.status === 'published' ? 'published' : 'draft',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function ensureCourseChapterQuizTable() {
  await db.raw.run(CREATE_COURSE_CHAPTER_QUIZZES_TABLE)
}

export async function getCourseChapterQuiz(trainingId: string, teacherId?: string | null) {
  await ensureCourseChapterQuizTable()
  const row = await db.raw.get<CourseChapterQuizRow>(
    teacherId
      ? `SELECT * FROM course_chapter_quizzes WHERE training_id = ? AND teacher_id = ?`
      : `SELECT * FROM course_chapter_quizzes WHERE training_id = ? ORDER BY updated_at DESC LIMIT 1`,
    teacherId ? [trainingId, teacherId] : [trainingId],
  )
  return row ? normalizeRow(row) : null
}

export async function getPublishedCourseChapterQuiz(trainingId: string, teacherId?: string | null) {
  const quiz = await getCourseChapterQuiz(trainingId, teacherId)
  return quiz?.status === 'published' ? quiz : null
}
