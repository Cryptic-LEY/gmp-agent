CREATE TABLE IF NOT EXISTS course_quiz_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  training_id VARCHAR(191) NOT NULL,
  teacher_id VARCHAR(191) NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  edu_level VARCHAR(64) NOT NULL,
  question_ids LONGTEXT NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uniq_course_quiz_session (training_id, teacher_id, user_id, edu_level),
  KEY idx_course_quiz_sessions_user (user_id),
  KEY idx_course_quiz_sessions_teacher (teacher_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
