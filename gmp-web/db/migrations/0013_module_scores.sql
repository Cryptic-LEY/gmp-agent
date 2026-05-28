-- 模块课时分表
-- 记录每位学生完成各实训项目模块测试的成绩与换算后的课时分
-- earned_hours 按比例换算：(项目学时 / 专业总学时) × 课程标准学时(专科48/本科54) × (score/100)
CREATE TABLE `module_scores` (
  `id`           INTEGER PRIMARY KEY AUTOINCREMENT,
  `user_id`      TEXT    NOT NULL REFERENCES `users`(`user_id`),
  `training_id`  TEXT    NOT NULL,          -- T01 ~ T11
  `edu_level`    TEXT    NOT NULL,          -- college | undergraduate
  `score`        INTEGER NOT NULL,          -- 0~100
  `earned_hours` REAL    NOT NULL,          -- 换算后课时分（保留2位小数）
  `completed_at` TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 加速查询：按用户检索、按用户+模块检索
CREATE INDEX IF NOT EXISTS `idx_ms_user`          ON `module_scores`(`user_id`);
CREATE INDEX IF NOT EXISTS `idx_ms_user_training` ON `module_scores`(`user_id`, `training_id`);
