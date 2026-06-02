CREATE TABLE IF NOT EXISTS course_lessons (
  lesson_id VARCHAR(191) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description LONGTEXT,
  sort_order INT NOT NULL DEFAULT 0,
  ppt_url LONGTEXT,
  ppt_page_count INT NOT NULL DEFAULT 0,
  video_url LONGTEXT,
  video_duration INT NOT NULL DEFAULT 0,
  test_questions LONGTEXT NOT NULL,
  pass_score INT NOT NULL DEFAULT 60,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (lesson_id),
  KEY idx_course_lessons_status_order (status, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS course_lesson_progress (
  user_id VARCHAR(191) NOT NULL,
  lesson_id VARCHAR(191) NOT NULL,
  ppt_viewed_pages LONGTEXT NOT NULL,
  ppt_completed TINYINT(1) NOT NULL DEFAULT 0,
  video_watched_seconds INT NOT NULL DEFAULT 0,
  video_max_position INT NOT NULL DEFAULT 0,
  video_completed TINYINT(1) NOT NULL DEFAULT 0,
  test_score DOUBLE,
  test_passed TINYINT(1) NOT NULL DEFAULT 0,
  test_completed TINYINT(1) NOT NULL DEFAULT 0,
  note_content LONGTEXT,
  annotation_count INT NOT NULL DEFAULT 0,
  lesson_score DOUBLE NOT NULL DEFAULT 0,
  completed TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  completed_at DATETIME(3),
  PRIMARY KEY (user_id, lesson_id),
  KEY idx_course_lesson_progress_lesson (lesson_id),
  CONSTRAINT fk_course_lesson_progress_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT fk_course_lesson_progress_lesson FOREIGN KEY (lesson_id) REFERENCES course_lessons(lesson_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS course_final_tests (
  user_id VARCHAR(191) NOT NULL,
  score DOUBLE NOT NULL DEFAULT 0,
  class_hour_score DOUBLE NOT NULL DEFAULT 0,
  completed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  CONSTRAINT fk_course_final_tests_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
