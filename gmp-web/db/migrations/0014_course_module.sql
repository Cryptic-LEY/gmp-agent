-- ── 课程学习模块 ──────────────────────────────────────────────────────────────
-- 围绕 training_projects (T01-T11) 提供：讨论区 / 作业 / 学习时长 / 资源进度

-- 讨论区主题
CREATE TABLE `course_discussions` (
  `id`          INTEGER PRIMARY KEY AUTOINCREMENT,
  `training_id` TEXT    NOT NULL,                     -- T01 ~ T11
  `user_id`     TEXT    NOT NULL REFERENCES `users`(`user_id`),
  `title`       TEXT    NOT NULL,
  `content`     TEXT    NOT NULL,
  `tag`         TEXT    DEFAULT '提问',               -- 提问 | 心得 | 讨论 | 答疑
  `pinned`      INTEGER NOT NULL DEFAULT 0,           -- 0/1
  `view_count`  INTEGER NOT NULL DEFAULT 0,
  `reply_count` INTEGER NOT NULL DEFAULT 0,
  `created_at`  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS `idx_cd_training` ON `course_discussions`(`training_id`);
CREATE INDEX IF NOT EXISTS `idx_cd_user`     ON `course_discussions`(`user_id`);

-- 讨论回复
CREATE TABLE `course_discussion_replies` (
  `id`            INTEGER PRIMARY KEY AUTOINCREMENT,
  `discussion_id` INTEGER NOT NULL REFERENCES `course_discussions`(`id`) ON DELETE CASCADE,
  `user_id`       TEXT    NOT NULL REFERENCES `users`(`user_id`),
  `content`       TEXT    NOT NULL,
  `is_ai`         INTEGER NOT NULL DEFAULT 0,         -- 0=学生/老师, 1=AI 答疑
  `created_at`    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS `idx_cdr_discussion` ON `course_discussion_replies`(`discussion_id`);

-- 教师布置的作业
CREATE TABLE `course_assignments` (
  `id`            INTEGER PRIMARY KEY AUTOINCREMENT,
  `training_id`   TEXT    NOT NULL,                   -- T01 ~ T11
  `teacher_id`    TEXT    NOT NULL REFERENCES `users`(`user_id`),
  `title`         TEXT    NOT NULL,
  `description`   TEXT    NOT NULL,
  `assignment_type` TEXT  NOT NULL DEFAULT '案例分析', -- 案例分析 | 简答 | 文件编写
  `max_score`     INTEGER NOT NULL DEFAULT 100,
  `due_date`      TEXT,                                -- ISO date string, null = 不限期
  `created_at`    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS `idx_ca_training` ON `course_assignments`(`training_id`);

-- 学生作业提交
CREATE TABLE `course_assignment_submissions` (
  `id`             INTEGER PRIMARY KEY AUTOINCREMENT,
  `assignment_id`  INTEGER NOT NULL REFERENCES `course_assignments`(`id`) ON DELETE CASCADE,
  `user_id`        TEXT    NOT NULL REFERENCES `users`(`user_id`),
  `content`        TEXT    NOT NULL,                  -- 学生提交内容
  `score`          INTEGER,                            -- 教师批改分数，null=未批改
  `feedback`       TEXT,                               -- 教师评语
  `submitted_at`   TEXT    NOT NULL DEFAULT (datetime('now')),
  `graded_at`      TEXT,
  UNIQUE(`assignment_id`, `user_id`)                  -- 每人一份提交
);

CREATE INDEX IF NOT EXISTS `idx_cas_user` ON `course_assignment_submissions`(`user_id`);

-- 学习时长日志（按章节）
CREATE TABLE `course_study_logs` (
  `id`           INTEGER PRIMARY KEY AUTOINCREMENT,
  `user_id`      TEXT    NOT NULL REFERENCES `users`(`user_id`),
  `training_id`  TEXT    NOT NULL,
  `seconds`      INTEGER NOT NULL,                    -- 本次停留秒数
  `activity`     TEXT    DEFAULT 'reading',           -- reading | quiz | video | discussion
  `logged_at`    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS `idx_csl_user`     ON `course_study_logs`(`user_id`);
CREATE INDEX IF NOT EXISTS `idx_csl_training` ON `course_study_logs`(`training_id`);
CREATE INDEX IF NOT EXISTS `idx_csl_date`     ON `course_study_logs`(`logged_at`);
