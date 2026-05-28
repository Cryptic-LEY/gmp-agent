-- ── 实训项目主表 ────────────────────────────────────────────────────────────────
CREATE TABLE `training_projects` (
  `training_id`   TEXT    PRIMARY KEY,              -- T01 ~ T11
  `display_name`  TEXT    NOT NULL,                 -- 项目简称（不含"项目X·"）
  `kp_proj_ug`    TEXT,                             -- 本科KP表中的 project_name 精确值
  `kp_proj_col`   TEXT,                             -- 专科KP表中的 project_name 精确值
  `hours_college` INTEGER,                          -- 专科学时
  `hours_ug`      INTEGER,                          -- 本科学时
  `seq_order`     INTEGER NOT NULL                  -- 显示排序（1~11）
);

-- ── 技能 → 知识点关联（多对多） ────────────────────────────────────────────────
CREATE TABLE `skill_kp_links` (
  `id`         INTEGER PRIMARY KEY AUTOINCREMENT,
  `skill_id`   TEXT    NOT NULL REFERENCES `skill_library`(`skill_id`),
  `kp_id`      TEXT    NOT NULL REFERENCES `knowledge_points`(`kp_id`),
  -- project_reg  : 同项目 + 共享法规条款 (confidence=1.0, 最高精度)
  -- reg_shared   : 跨项目共享法规条款   (confidence=0.7, 中精度)
  -- embedding    : 向量相似度匹配       (confidence=cos_sim, 补漏)
  `link_type`  TEXT    NOT NULL DEFAULT 'reg_shared',
  `confidence` REAL    NOT NULL DEFAULT 0.7,
  UNIQUE(`skill_id`, `kp_id`)
);

-- 查询加速索引
CREATE INDEX IF NOT EXISTS `idx_skill_kp_skill`      ON `skill_kp_links`(`skill_id`);
CREATE INDEX IF NOT EXISTS `idx_skill_kp_kp`         ON `skill_kp_links`(`kp_id`);
CREATE INDEX IF NOT EXISTS `idx_skill_kp_type_conf`  ON `skill_kp_links`(`link_type`, `confidence` DESC);
CREATE INDEX IF NOT EXISTS `idx_tp_seq`              ON `training_projects`(`seq_order`);
