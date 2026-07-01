-- Migration 0004: reg_chunks Phase-2 schema（small-to-big 分块）
--
-- ⚠️  破坏性 migration（一次性执行，非幂等）
-- ═══════════════════════════════════════════════════════════════════
-- 执行前必须确认以下三点，否则所有 embedding 向量将永久丢失：
--   1. reg_chunks 表为空，或已将现有 embedding 数据备份到其他位置
--   2. 执行后立即重新生成向量：
--          py -3.11 -m rag.embedder
--   3. 向量生成完成后触发索引重建：
--          POST http://localhost:8001/rebuild-index
-- ═══════════════════════════════════════════════════════════════════
--
-- chunk_id  BIGINT AUTO_INCREMENT（Phase-2 每条法规拆成多个小块，chunk_id 唯一标识每块）
-- seq       同一 reg_id 内的块序号（0-based）
-- small_text 约 300 字的检索锚点（供 embedding 和向量检索）
-- big_text   约 1800 字的生成窗口（供 LLM 上下文，big_text 包含 small_text）
-- embedding  JSON 数组（对应 small_text 的向量），由 embedder.py 写入
-- meta       预留扩展字段（JSON）
--
-- 此文件被 git 跟踪；gmp.sql dump 在 .gitignore 内。

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
