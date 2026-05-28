-- 技能库主表
CREATE TABLE `skill_library` (
  `skill_id`            TEXT    PRIMARY KEY,              -- SK-001, SK-002 …
  `skill_name`          TEXT    NOT NULL,                 -- 技能点名称（概念标签）
  `skill_category`      TEXT    NOT NULL,                 -- 工具应用/操作执行/分析判断/文件编制/沟通应对
  `edu_level`           TEXT    NOT NULL DEFAULT '通用',  -- 专科/本科/通用
  `difficulty`          INTEGER NOT NULL DEFAULT 3,       -- 1-5
  `description`         TEXT,                             -- 技能点详细说明
  `mastery_std_college` TEXT,                             -- 专科达标标准（null=不适用）
  `mastery_std_ug`      TEXT,                             -- 本科达标标准
  `defect_source`       TEXT,                             -- 触发该技能的典型缺陷场景描述
  `tool_name`           TEXT,                             -- 主要依赖工具（如 FMEA / 鱼骨图）
  `embedding`           TEXT,                             -- JSON float 数组，向量检索用
  `status`              TEXT    NOT NULL DEFAULT 'active'
);

-- 技能 → 法规条款（多对多）
CREATE TABLE `skill_reg_links` (
  `id`       INTEGER PRIMARY KEY AUTOINCREMENT,
  `skill_id` TEXT    NOT NULL REFERENCES `skill_library`(`skill_id`),
  `reg_id`   TEXT    NOT NULL REFERENCES `reg_library`(`reg_id`)
);

-- 技能 → 实训项目（多对多，一个技能可出现在多个实训中）
CREATE TABLE `skill_training_links` (
  `id`          INTEGER PRIMARY KEY AUTOINCREMENT,
  `skill_id`    TEXT    NOT NULL REFERENCES `skill_library`(`skill_id`),
  `training_id` TEXT    NOT NULL,                         -- T01 ~ T11
  `is_primary`  INTEGER NOT NULL DEFAULT 1                -- 1=主训练场合, 0=辅助出现
);

-- 加速查询的索引
CREATE INDEX IF NOT EXISTS `idx_skill_reg_skill`     ON `skill_reg_links`(`skill_id`);
CREATE INDEX IF NOT EXISTS `idx_skill_reg_reg`       ON `skill_reg_links`(`reg_id`);
CREATE INDEX IF NOT EXISTS `idx_skill_train_skill`   ON `skill_training_links`(`skill_id`);
CREATE INDEX IF NOT EXISTS `idx_skill_train_train`   ON `skill_training_links`(`training_id`);
