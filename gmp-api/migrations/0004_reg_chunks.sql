-- Migration 0004: reg_chunks Phase-2 schema（small-to-big 分块）
--
-- chunk_id  BIGINT AUTO_INCREMENT（嵌入 embedder.py DDL_REG_CHUNKS）
-- seq       同一 reg_id 内的块序号
-- small_text 约 300 字的检索锚点（供 embedding）
-- big_text   约 1800 字的生成窗口（供 LLM 上下文）
-- embedding  JSON 数组，通过 reg_id 在 VectorIndex 内聚合
--
-- 此 migration 文件被 git 跟踪；gmp.sql dump 在 .gitignore 内不可靠。
-- 幂等：先 DROP 再 CREATE，重复执行安全。

DROP TABLE IF EXISTS `reg_chunks`;
CREATE TABLE `reg_chunks` (
  `chunk_id`   BIGINT NOT NULL AUTO_INCREMENT,
  `reg_id`     VARCHAR(64) NOT NULL,
  `seq`        INT NOT NULL DEFAULT 0,
  `small_text` MEDIUMTEXT,
  `big_text`   MEDIUMTEXT,
  `embedding`  MEDIUMTEXT,
  `meta`       TEXT,
  PRIMARY KEY (`chunk_id`) USING BTREE,
  INDEX `idx_reg_chunks_reg` (`reg_id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=Dynamic;
