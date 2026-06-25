CREATE TABLE IF NOT EXISTS users (
  user_id VARCHAR(191) NOT NULL,
  org_id VARCHAR(191) NOT NULL DEFAULT 'default',
  group_id VARCHAR(191),
  role VARCHAR(32) NOT NULL DEFAULT 'student',
  persona VARCHAR(32) NOT NULL DEFAULT 'student',
  display_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  real_name VARCHAR(255),
  school VARCHAR(255),
  major VARCHAR(255),
  class_name VARCHAR(255),
  teacher_user_id VARCHAR(191),
  student_id VARCHAR(191),
  id_card VARCHAR(64),
  phone VARCHAR(64),
  avatar_url LONGTEXT,
  PRIMARY KEY (user_id),
  UNIQUE KEY users_email_unique (email),
  UNIQUE KEY users_display_name_unique (display_name),
  KEY idx_users_teacher (teacher_user_id),
  CONSTRAINT fk_users_teacher FOREIGN KEY (teacher_user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_email_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  purpose VARCHAR(32) NOT NULL,
  role VARCHAR(32),
  code_hash VARCHAR(128) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at DATETIME(3) NOT NULL,
  consumed_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_auth_email_codes_lookup (email, purpose, created_at),
  KEY idx_auth_email_codes_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_third_party_bindings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id VARCHAR(191) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  provider_user_id VARCHAR(191) NOT NULL,
  provider_display_name VARCHAR(255),
  provider_avatar_url LONGTEXT,
  bound_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_login_at DATETIME(3),
  PRIMARY KEY (id),
  UNIQUE KEY uniq_user_provider (user_id, provider),
  UNIQUE KEY uniq_provider_user (provider, provider_user_id),
  KEY idx_third_party_bindings_user (user_id),
  CONSTRAINT fk_third_party_bindings_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS third_party_bind_sessions (
  session_id VARCHAR(191) NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  state VARCHAR(191) NOT NULL,
  return_to VARCHAR(512),
  provider_user_id VARCHAR(191),
  provider_display_name VARCHAR(255),
  provider_avatar_url LONGTEXT,
  callback_error VARCHAR(500),
  expires_at DATETIME(3) NOT NULL,
  confirmed_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (session_id),
  UNIQUE KEY uniq_third_party_bind_state (state),
  KEY idx_third_party_bind_sessions_user (user_id, provider),
  CONSTRAINT fk_third_party_bind_sessions_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS third_party_login_sessions (
  session_id VARCHAR(191) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  state VARCHAR(191) NOT NULL,
  expected_role VARCHAR(32),
  return_to VARCHAR(512),
  provider_user_id VARCHAR(191),
  provider_display_name VARCHAR(255),
  provider_avatar_url LONGTEXT,
  user_id VARCHAR(191),
  callback_error VARCHAR(500),
  expires_at DATETIME(3) NOT NULL,
  completed_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (session_id),
  UNIQUE KEY uniq_third_party_login_state (state),
  KEY idx_third_party_login_sessions_user (user_id, provider),
  CONSTRAINT fk_third_party_login_sessions_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_points (
  kp_id VARCHAR(191) NOT NULL,
  concept_id VARCHAR(191),
  serial_code VARCHAR(64),
  granularity VARCHAR(64),
  edu_level VARCHAR(64),
  project_name VARCHAR(255),
  task_name VARCHAR(255),
  title VARCHAR(500) NOT NULL,
  content LONGTEXT,
  gmp_articles LONGTEXT,
  source_type VARCHAR(64) NOT NULL DEFAULT '教材',
  difficulty INT NOT NULL DEFAULT 3,
  point_type VARCHAR(64) NOT NULL DEFAULT '知识点',
  mastery_requirement TEXT,
  embedding LONGTEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (kp_id),
  KEY idx_knowledge_points_project (project_name),
  KEY idx_knowledge_points_point_type (point_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kp_dependencies (
  from_kp_id VARCHAR(191) NOT NULL,
  to_kp_id VARCHAR(191) NOT NULL,
  PRIMARY KEY (from_kp_id, to_kp_id),
  CONSTRAINT fk_kp_dependencies_from FOREIGN KEY (from_kp_id) REFERENCES knowledge_points(kp_id),
  CONSTRAINT fk_kp_dependencies_to FOREIGN KEY (to_kp_id) REFERENCES knowledge_points(kp_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kp_mastery (
  user_id VARCHAR(191) NOT NULL,
  kp_id VARCHAR(191) NOT NULL,
  confidence DOUBLE NOT NULL DEFAULT 0,
  attempt_count INT NOT NULL DEFAULT 0,
  correct_count INT NOT NULL DEFAULT 0,
  last_tested_at DATETIME(3),
  PRIMARY KEY (user_id, kp_id),
  CONSTRAINT fk_kp_mastery_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT fk_kp_mastery_kp FOREIGN KEY (kp_id) REFERENCES knowledge_points(kp_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_game_state (
  user_id VARCHAR(191) NOT NULL,
  xp INT NOT NULL DEFAULT 0,
  points INT NOT NULL DEFAULT 0,
  rank_level INT NOT NULL DEFAULT 1,
  rank_title VARCHAR(255) NOT NULL DEFAULT 'GMP新人',
  streak_days INT NOT NULL DEFAULT 0,
  max_streak INT NOT NULL DEFAULT 0,
  punish_until DATETIME(3),
  last_login_date DATE,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_user_game_state_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS checkin_log (
  user_id VARCHAR(191) NOT NULL,
  `date` DATE NOT NULL,
  PRIMARY KEY (user_id, `date`),
  CONSTRAINT fk_checkin_log_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_reward_claims (
  user_id VARCHAR(191) NOT NULL,
  reward_key VARCHAR(191) NOT NULL,
  xp INT NOT NULL DEFAULT 0,
  points INT NOT NULL DEFAULT 0,
  claimed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, reward_key),
  CONSTRAINT fk_game_reward_claims_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS simulation_project_progress (
  user_id VARCHAR(191) NOT NULL,
  project_id INT NOT NULL,
  medal VARCHAR(32) NOT NULL,
  best_score INT NOT NULL DEFAULT 0,
  story_score INT NOT NULL DEFAULT 0,
  boss_accuracy INT NOT NULL DEFAULT 0,
  credit_hours DOUBLE NOT NULL DEFAULT 0,
  completed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, project_id),
  KEY idx_simulation_project_progress_user_completed (user_id, completed_at),
  CONSTRAINT fk_simulation_project_progress_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reg_library (
  reg_id VARCHAR(191) NOT NULL,
  doc_type VARCHAR(128) NOT NULL,
  reg_doc VARCHAR(500) NOT NULL,
  appendix_name TEXT,
  chapter_name TEXT,
  section_name TEXT,
  article_num VARCHAR(64),
  content LONGTEXT,
  effective_date VARCHAR(64),
  issuing_org VARCHAR(255),
  embedding LONGTEXT,
  PRIMARY KEY (reg_id),
  FULLTEXT KEY ft_reg_library_content (content)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kp_reg_links (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  kp_id VARCHAR(191) NOT NULL,
  reg_id VARCHAR(191) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_kp_reg_links_kp (kp_id),
  KEY idx_kp_reg_links_reg (reg_id),
  CONSTRAINT fk_kp_reg_links_kp FOREIGN KEY (kp_id) REFERENCES knowledge_points(kp_id),
  CONSTRAINT fk_kp_reg_links_reg FOREIGN KEY (reg_id) REFERENCES reg_library(reg_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS case_library (
  case_id VARCHAR(191) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  dosage_form VARCHAR(128) NOT NULL,
  dosage_category VARCHAR(128) NOT NULL,
  section_type VARCHAR(128) NOT NULL,
  section_name VARCHAR(255),
  content LONGTEXT,
  source_file VARCHAR(500),
  embedding LONGTEXT,
  PRIMARY KEY (case_id),
  KEY idx_case_library_product (product_name),
  KEY idx_case_library_category (dosage_category),
  FULLTEXT KEY ft_case_library_content (content)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS case_kp_links (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  case_id VARCHAR(191) NOT NULL,
  kp_id VARCHAR(191) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_case_kp_links_case (case_id),
  KEY idx_case_kp_links_kp (kp_id),
  CONSTRAINT fk_case_kp_links_case FOREIGN KEY (case_id) REFERENCES case_library(case_id),
  CONSTRAINT fk_case_kp_links_kp FOREIGN KEY (kp_id) REFERENCES knowledge_points(kp_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_plans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id VARCHAR(191) NOT NULL,
  edu_level VARCHAR(64) NOT NULL,
  major VARCHAR(255) NOT NULL,
  score INT NOT NULL,
  wrong_count INT NOT NULL DEFAULT 0,
  plan_data LONGTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_learning_plans_user_time (user_id, created_at),
  CONSTRAINT fk_learning_plans_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS simulation_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id VARCHAR(191) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  dosage_category VARCHAR(128) NOT NULL,
  score INT NOT NULL DEFAULT 0,
  max_score INT NOT NULL DEFAULT 0,
  answers LONGTEXT NOT NULL,
  completed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_simulation_sessions_user_time (user_id, completed_at),
  CONSTRAINT fk_simulation_sessions_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS question_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id VARCHAR(191) NOT NULL,
  question_id VARCHAR(191) NOT NULL,
  user_answer LONGTEXT NOT NULL,
  is_correct TINYINT(1) NOT NULL,
  reviewed TINYINT(1) NOT NULL DEFAULT 0,
  answered_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_question_history_user_time (user_id, answered_at),
  KEY idx_question_history_question (question_id),
  CONSTRAINT fk_question_history_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS questions (
  question_id VARCHAR(191) NOT NULL,
  kp_id VARCHAR(191),
  question_type VARCHAR(64) NOT NULL,
  stem LONGTEXT NOT NULL,
  correct_answer LONGTEXT NOT NULL,
  difficulty VARCHAR(32) NOT NULL DEFAULT '中',
  option_count INT,
  option_a LONGTEXT,
  option_b LONGTEXT,
  option_c LONGTEXT,
  option_d LONGTEXT,
  option_e LONGTEXT,
  option_f LONGTEXT,
  option_g LONGTEXT,
  explanation LONGTEXT,
  project_name VARCHAR(255),
  edu_level VARCHAR(64) DEFAULT 'college',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (question_id),
  KEY idx_questions_kp (kp_id),
  KEY idx_questions_project (project_name),
  KEY idx_questions_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS skill_library (
  skill_id VARCHAR(191) NOT NULL,
  skill_name VARCHAR(255) NOT NULL,
  skill_category VARCHAR(128) NOT NULL,
  edu_level VARCHAR(64) NOT NULL DEFAULT '通用',
  difficulty INT NOT NULL DEFAULT 3,
  description LONGTEXT,
  mastery_std_college LONGTEXT,
  mastery_std_ug LONGTEXT,
  defect_source LONGTEXT,
  tool_name VARCHAR(255),
  embedding LONGTEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  PRIMARY KEY (skill_id),
  KEY idx_skill_library_category (skill_category),
  KEY idx_skill_library_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS skill_reg_links (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  skill_id VARCHAR(191) NOT NULL,
  reg_id VARCHAR(191) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_skill_reg_links_skill (skill_id),
  KEY idx_skill_reg_links_reg (reg_id),
  CONSTRAINT fk_skill_reg_links_skill FOREIGN KEY (skill_id) REFERENCES skill_library(skill_id),
  CONSTRAINT fk_skill_reg_links_reg FOREIGN KEY (reg_id) REFERENCES reg_library(reg_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS training_projects (
  training_id VARCHAR(191) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  kp_proj_ug VARCHAR(255),
  kp_proj_col VARCHAR(255),
  hours_college INT,
  hours_ug INT,
  seq_order INT NOT NULL,
  PRIMARY KEY (training_id),
  KEY idx_training_projects_order (seq_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS skill_training_links (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  skill_id VARCHAR(191) NOT NULL,
  training_id VARCHAR(191) NOT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_skill_training_links_skill (skill_id),
  KEY idx_skill_training_links_training (training_id),
  CONSTRAINT fk_skill_training_links_skill FOREIGN KEY (skill_id) REFERENCES skill_library(skill_id),
  CONSTRAINT fk_skill_training_links_training FOREIGN KEY (training_id) REFERENCES training_projects(training_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS module_scores (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id VARCHAR(191) NOT NULL,
  training_id VARCHAR(191) NOT NULL,
  edu_level VARCHAR(64) NOT NULL,
  score INT NOT NULL,
  earned_hours DOUBLE NOT NULL,
  completed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_module_scores_user_time (user_id, completed_at),
  KEY idx_module_scores_training (training_id),
  CONSTRAINT fk_module_scores_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT fk_module_scores_training FOREIGN KEY (training_id) REFERENCES training_projects(training_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS skill_kp_links (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  skill_id VARCHAR(191) NOT NULL,
  kp_id VARCHAR(191) NOT NULL,
  link_type VARCHAR(64) NOT NULL DEFAULT 'reg_shared',
  confidence DOUBLE NOT NULL DEFAULT 0.7,
  PRIMARY KEY (id),
  KEY idx_skill_kp_links_skill (skill_id),
  KEY idx_skill_kp_links_kp (kp_id),
  CONSTRAINT fk_skill_kp_links_skill FOREIGN KEY (skill_id) REFERENCES skill_library(skill_id),
  CONSTRAINT fk_skill_kp_links_kp FOREIGN KEY (kp_id) REFERENCES knowledge_points(kp_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS course_discussions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  training_id VARCHAR(191) NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content LONGTEXT NOT NULL,
  tag VARCHAR(64) NOT NULL DEFAULT '提问',
  pinned TINYINT(1) NOT NULL DEFAULT 0,
  view_count INT NOT NULL DEFAULT 0,
  reply_count INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_course_discussions_training_time (training_id, created_at),
  KEY idx_course_discussions_user (user_id),
  CONSTRAINT fk_course_discussions_training FOREIGN KEY (training_id) REFERENCES training_projects(training_id),
  CONSTRAINT fk_course_discussions_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS course_discussion_replies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  discussion_id BIGINT UNSIGNED NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  content LONGTEXT NOT NULL,
  is_ai TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_course_discussion_replies_discussion_time (discussion_id, created_at),
  KEY idx_course_discussion_replies_user (user_id),
  CONSTRAINT fk_course_discussion_replies_discussion FOREIGN KEY (discussion_id) REFERENCES course_discussions(id) ON DELETE CASCADE,
  CONSTRAINT fk_course_discussion_replies_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS course_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  training_id VARCHAR(191) NOT NULL,
  teacher_id VARCHAR(191) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description LONGTEXT NOT NULL,
  assignment_type VARCHAR(128) NOT NULL DEFAULT '案例分析',
  max_score INT NOT NULL DEFAULT 100,
  due_date DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_course_assignments_training_time (training_id, created_at),
  KEY idx_course_assignments_teacher (teacher_id),
  CONSTRAINT fk_course_assignments_training FOREIGN KEY (training_id) REFERENCES training_projects(training_id),
  CONSTRAINT fk_course_assignments_teacher FOREIGN KEY (teacher_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS course_assignment_submissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  assignment_id BIGINT UNSIGNED NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  content LONGTEXT NOT NULL,
  score INT,
  feedback LONGTEXT,
  submitted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  graded_at DATETIME(3),
  graded_by VARCHAR(32) NOT NULL DEFAULT 'ai',
  PRIMARY KEY (id),
  KEY idx_course_assignment_submissions_assignment (assignment_id),
  KEY idx_course_assignment_submissions_user (user_id),
  CONSTRAINT fk_course_assignment_submissions_assignment FOREIGN KEY (assignment_id) REFERENCES course_assignments(id) ON DELETE CASCADE,
  CONSTRAINT fk_course_assignment_submissions_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE IF NOT EXISTS course_study_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id VARCHAR(191) NOT NULL,
  training_id VARCHAR(191) NOT NULL,
  seconds INT NOT NULL,
  activity VARCHAR(64) NOT NULL DEFAULT 'reading',
  logged_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_course_study_logs_user_training (user_id, training_id),
  KEY idx_course_study_logs_training_time (training_id, logged_at),
  CONSTRAINT fk_course_study_logs_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT fk_course_study_logs_training FOREIGN KEY (training_id) REFERENCES training_projects(training_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_profiles (
  school_id VARCHAR(191) NOT NULL,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(64),
  region VARCHAR(255),
  contact_person VARCHAR(255),
  contact_phone VARCHAR(64),
  package_name VARCHAR(255) NOT NULL DEFAULT '高校实训标准版',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  opened_at DATE,
  expires_at DATE,
  notes TEXT,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (school_id),
  UNIQUE KEY school_profiles_name_unique (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_classes (
  class_id VARCHAR(191) NOT NULL,
  school_id VARCHAR(191) NOT NULL,
  class_name VARCHAR(255) NOT NULL,
  major VARCHAR(255),
  education_level VARCHAR(64) NOT NULL DEFAULT '本科',
  grade_year VARCHAR(64),
  teacher_user_id VARCHAR(191),
  student_capacity INT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (class_id),
  KEY idx_school_classes_school_id (school_id),
  KEY idx_school_classes_teacher (teacher_user_id),
  CONSTRAINT fk_school_classes_school FOREIGN KEY (school_id) REFERENCES school_profiles(school_id),
  CONSTRAINT fk_school_classes_teacher FOREIGN KEY (teacher_user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_settings (
  `key` VARCHAR(191) NOT NULL,
  `value` TEXT,
  category VARCHAR(64) NOT NULL DEFAULT 'system',
  label VARCHAR(255),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  session_id VARCHAR(191) NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  audience VARCHAR(32) NOT NULL DEFAULT 'student',
  title VARCHAR(255) NOT NULL DEFAULT '新对话',
  edu_level VARCHAR(64),
  message_count INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (session_id),
  KEY idx_ai_chat_sessions_user_audience_updated (user_id, audience, updated_at),
  CONSTRAINT fk_ai_chat_sessions_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id VARCHAR(191) NOT NULL,
  role VARCHAR(32) NOT NULL,
  content LONGTEXT NOT NULL,
  sources LONGTEXT,
  critic_triggered TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_ai_chat_messages_session_id (session_id, id),
  CONSTRAINT fk_ai_chat_messages_session FOREIGN KEY (session_id) REFERENCES ai_chat_sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS query_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  question LONGTEXT NOT NULL,
  edu_level VARCHAR(64),
  retrieved_ids LONGTEXT,
  draft_answer LONGTEXT,
  critic_triggered TINYINT(1),
  final_answer LONGTEXT,
  latency_ms INT,
  PRIMARY KEY (id),
  KEY idx_query_log_timestamp (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS course_lessons (
  lesson_id VARCHAR(191) NOT NULL,
  training_id VARCHAR(191),
  teacher_id VARCHAR(191),
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
  KEY idx_course_lessons_status_order (status, sort_order),
  KEY idx_course_lessons_training (training_id),
  KEY idx_course_lessons_teacher (teacher_id),
  CONSTRAINT fk_course_lessons_training FOREIGN KEY (training_id) REFERENCES training_projects(training_id),
  CONSTRAINT fk_course_lessons_teacher FOREIGN KEY (teacher_id) REFERENCES users(user_id)
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

CREATE TABLE IF NOT EXISTS course_final_tests (
  user_id VARCHAR(191) NOT NULL,
  score DOUBLE NOT NULL DEFAULT 0,
  class_hour_score DOUBLE NOT NULL DEFAULT 0,
  completed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  CONSTRAINT fk_course_final_tests_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
