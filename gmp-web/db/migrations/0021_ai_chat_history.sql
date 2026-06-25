CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  session_id VARCHAR(191) NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  audience VARCHAR(32) NOT NULL DEFAULT 'student',
  title VARCHAR(255) NOT NULL DEFAULT '新对话',
  edu_level VARCHAR(64),
  message_count INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (session_id),
  KEY idx_ai_chat_sessions_user_audience_updated (user_id, audience, updated_at),
  CONSTRAINT fk_ai_chat_sessions_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id VARCHAR(191) NOT NULL,
  role VARCHAR(32) NOT NULL,
  content LONGTEXT NOT NULL,
  sources LONGTEXT,
  critic_triggered TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_ai_chat_messages_session_id (session_id, id),
  CONSTRAINT fk_ai_chat_messages_session FOREIGN KEY (session_id) REFERENCES ai_chat_sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
