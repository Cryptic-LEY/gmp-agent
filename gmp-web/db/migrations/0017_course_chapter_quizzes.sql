CREATE TABLE IF NOT EXISTS course_chapter_quizzes (
  training_id VARCHAR(191) NOT NULL,
  teacher_id VARCHAR(191) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description LONGTEXT,
  question_count INT NOT NULL DEFAULT 10,
  pass_score INT NOT NULL DEFAULT 60,
  duration_minutes INT NOT NULL DEFAULT 30,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (training_id),
  KEY idx_course_chapter_quizzes_teacher (teacher_id),
  KEY idx_course_chapter_quizzes_status (status),
  CONSTRAINT fk_course_chapter_quizzes_training FOREIGN KEY (training_id) REFERENCES training_projects(training_id) ON DELETE CASCADE,
  CONSTRAINT fk_course_chapter_quizzes_teacher FOREIGN KEY (teacher_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
