-- 03-memory: 用户档案卡 + 命中率监控表
-- 幂等：IF NOT EXISTS，可重复执行

CREATE TABLE IF NOT EXISTS user_profile (
    user_id     VARCHAR(64)  PRIMARY KEY,
    edu_level   VARCHAR(20),
    major       VARCHAR(100),
    weak_kp     JSON,
    goals       JSON,
    prefs       JSON,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS memory_usage (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    user_id           VARCHAR(64),
    session_id        VARCHAR(64),
    injected_entities JSON,
    answer_used       TINYINT(1) DEFAULT 0,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_mu_user_id (user_id)
);
