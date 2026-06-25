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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
