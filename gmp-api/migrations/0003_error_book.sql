-- 错题本（04-eval-loop）
-- 存储 critic 触发 / 用户负反馈 / RAGAS 低分 的坏 case，供离线对齐和 few-shot 注入

CREATE TABLE IF NOT EXISTS error_book (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    question    TEXT        NOT NULL,
    bad_answer  TEXT,
    reason      VARCHAR(500),
    fix_hint    TEXT,
    source      VARCHAR(50) DEFAULT 'manual',   -- manual | critic | ragas | feedback
    created_at  DATETIME    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_eb_created (created_at)
);
