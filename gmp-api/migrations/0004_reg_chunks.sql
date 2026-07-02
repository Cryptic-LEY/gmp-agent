-- Migration 0004: reg_chunks Phase-2 schema（small-to-big 分块）
--
-- 定位：这是一个「安全初始化器」，不是通用 schema 演进迁移。
--   - 表不存在 → 建表
--   - 表存在且为空 → 幂等无操作（注意：不会给旧结构空表补列，需另写 ALTER 迁移）
--   - 表存在且有任何数据 → SIGNAL 中止，绝不 DROP
-- 若日后要改 reg_chunks 结构（加列/改类型），请新增 0005_*.sql 用 ALTER TABLE，勿改本文件。
-- ═══════════════════════════════════════════════════════════════════
-- 首次部署执行后：
--   1. 生成 embedding：py -3.11 -m rag.embedder
--   2. 触发索引重建：  POST http://localhost:8001/rebuild-index
--
-- 若需在已有数据的表上重建（确认已备份），请手动 DROP TABLE reg_chunks 后再跑本文件。
-- ═══════════════════════════════════════════════════════════════════

-- 先清理可能残留的存储过程（上次 SIGNAL 中断后可能未 DROP，防重跑报 already exists）
DROP PROCEDURE IF EXISTS _migrate_0004;

DELIMITER //
CREATE PROCEDURE _migrate_0004()
BEGIN
    DECLARE tbl_exists INT DEFAULT 0;
    DECLARE row_count  INT DEFAULT 0;

    SELECT COUNT(*) INTO tbl_exists
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name   = 'reg_chunks';

    IF tbl_exists > 0 THEN
        -- 表已存在：只要有任何行就中止，绝不删除现有数据
        SELECT COUNT(*) INTO row_count FROM reg_chunks;
        IF row_count > 0 THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT =
                    'ABORT: reg_chunks 已含数据，迁移已中止。如需重建请先备份并手动 DROP TABLE reg_chunks。';
        END IF;
        -- 表存在且为空：无需重建，直接返回（幂等）
    ELSE
        -- 表不存在：建表
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
    END IF;
END //
DELIMITER ;

CALL _migrate_0004();
DROP PROCEDURE IF EXISTS _migrate_0004;
