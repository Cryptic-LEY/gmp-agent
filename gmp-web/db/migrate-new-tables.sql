SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS school_classes;
DROP TABLE IF EXISTS school_profiles;
DROP TABLE IF EXISTS system_settings;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE school_profiles (
  school_id      VARCHAR(191) PRIMARY KEY,
  name           VARCHAR(255) NOT NULL,
  code           VARCHAR(64),
  region         VARCHAR(255),
  contact_person VARCHAR(255),
  contact_phone  VARCHAR(64),
  package_name   VARCHAR(255) NOT NULL DEFAULT '高校实训标准版',
  status         VARCHAR(32) NOT NULL DEFAULT 'active',
  opened_at      DATE,
  expires_at     DATE,
  notes          TEXT,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE school_classes (
  class_id         VARCHAR(191) PRIMARY KEY,
  school_id        VARCHAR(191) NOT NULL,
  class_name       VARCHAR(255) NOT NULL,
  major            VARCHAR(255),
  education_level  VARCHAR(64) NOT NULL DEFAULT '本科',
  grade_year       VARCHAR(64),
  teacher_user_id  VARCHAR(64),
  student_capacity INT NOT NULL DEFAULT 0,
  status           VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (school_id) REFERENCES school_profiles(school_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE system_settings (
  `key`      VARCHAR(191) PRIMARY KEY,
  value      TEXT,
  category   VARCHAR(64) NOT NULL DEFAULT 'system',
  label      VARCHAR(255),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_reward_claims (
  user_id    VARCHAR(64) NOT NULL,
  reward_key VARCHAR(191) NOT NULL,
  xp         INT NOT NULL DEFAULT 0,
  points     INT NOT NULL DEFAULT 0,
  claimed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, reward_key),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS course_chapter_quizzes (
  training_id      VARCHAR(8) NOT NULL,
  teacher_id       VARCHAR(64) NOT NULL,
  title            VARCHAR(255) NOT NULL,
  description      TEXT,
  question_count   INT NOT NULL DEFAULT 10,
  pass_score       INT NOT NULL DEFAULT 60,
  duration_minutes INT NOT NULL DEFAULT 30,
  status           VARCHAR(32) NOT NULL DEFAULT 'draft',
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (training_id, teacher_id),
  FOREIGN KEY (training_id) REFERENCES training_projects(training_id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS course_lessons (
  lesson_id      VARCHAR(191) PRIMARY KEY,
  training_id    VARCHAR(8),
  teacher_id     VARCHAR(64),
  title          VARCHAR(255) NOT NULL,
  description    TEXT,
  sort_order     INT NOT NULL DEFAULT 0,
  ppt_url        TEXT,
  ppt_page_count INT NOT NULL DEFAULT 0,
  video_url      TEXT,
  video_duration INT NOT NULL DEFAULT 0,
  test_questions TEXT NOT NULL,
  pass_score     INT NOT NULL DEFAULT 60,
  status         VARCHAR(32) NOT NULL DEFAULT 'draft',
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (training_id) REFERENCES training_projects(training_id),
  FOREIGN KEY (teacher_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS course_lesson_progress (
  user_id               VARCHAR(64) NOT NULL,
  lesson_id             VARCHAR(191) NOT NULL,
  ppt_viewed_pages      TEXT NOT NULL,
  ppt_completed         TINYINT(1) NOT NULL DEFAULT 0,
  video_watched_seconds INT NOT NULL DEFAULT 0,
  video_max_position    INT NOT NULL DEFAULT 0,
  video_completed       TINYINT(1) NOT NULL DEFAULT 0,
  test_score            DOUBLE,
  test_passed           TINYINT(1) NOT NULL DEFAULT 0,
  test_completed        TINYINT(1) NOT NULL DEFAULT 0,
  note_content          TEXT,
  annotation_count      INT NOT NULL DEFAULT 0,
  lesson_score          DOUBLE NOT NULL DEFAULT 0,
  completed             TINYINT(1) NOT NULL DEFAULT 0,
  updated_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  completed_at          DATETIME(3),
  PRIMARY KEY (user_id, lesson_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (lesson_id) REFERENCES course_lessons(lesson_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS course_lesson_annotations (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     VARCHAR(64) NOT NULL,
  lesson_id   VARCHAR(191) NOT NULL,
  resource    VARCHAR(32) NOT NULL DEFAULT 'ppt',
  page_number INT,
  video_time  INT,
  text        TEXT NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (lesson_id) REFERENCES course_lessons(lesson_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS course_final_tests (
  user_id          VARCHAR(64) PRIMARY KEY,
  score            DOUBLE NOT NULL DEFAULT 0,
  class_hour_score DOUBLE NOT NULL DEFAULT 0,
  completed_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT CONCAT('Total tables in gmp: ', COUNT(*)) AS result
FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'gmp';
