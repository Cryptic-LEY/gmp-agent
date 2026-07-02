-- Migration 0004: reg_chunks Phase-2 schema（small-to-big 分块）
--
-- ⚠️  一次性 migration，会删除并重建 reg_chunks 表
-- ═══════════════════════════════════════════════════════════════════
-- 执行后必须：
--   1. 重新生成 embedding：py -3.11 -m rag.embedder
--   2. 触发索引重建：    POST http://localhost:8001/rebuild-index
-- ═══════════════════════════════════════════════════════════════════
--
-- 安全机制：若 reg_chunks 已含 embedding 数据则 SIGNAL 中止，
-- 阻止意外丢失已支付向量。确认备份后删除该存储过程内的安全检查再执行。

DELIMITER //
CREATE PROCEDURE _migrate_0004()
BEGIN
    DECLARE tbl_exists  INT DEFAULT 0;
    DECLARE has_vectors INT DEFAULT 0;

    SELECT COUNT(*) INTO tbl_exists
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name   = 'reg_chunks';

    IF tbl_exists > 0 THEN
        SELECT COUNT(*) INTO has_vectors
        FROM reg_chunks
        WHERE embedding IS NOT NULL
        LIMIT 1;

        IF has_vectors > 0 THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT =
                    'ABORT: reg_chunks 已含 embedding 数据，请先备份再删除安全检查后重新执行';
        END IF;
    END IF;

    -- 表不存在或为空时执行建表
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
END //
DELIMITER ;

CALL _migrate_0004();
DROP PROCEDURE IF EXISTS _migrate_0004;
