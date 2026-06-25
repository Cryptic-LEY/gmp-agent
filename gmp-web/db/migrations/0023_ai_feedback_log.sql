CREATE TABLE IF NOT EXISTS ai_feedback_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id VARCHAR(191) NOT NULL,
  session_id VARCHAR(191),
  message_id BIGINT UNSIGNED,
  message_role VARCHAR(32) NOT NULL DEFAULT 'assistant',
  message_content LONGTEXT NOT NULL,
  user_comment LONGTEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_ai_feedback_log_user_created (user_id, created_at),
  KEY idx_ai_feedback_log_session (session_id),
  KEY idx_ai_feedback_log_message (message_id),
  CONSTRAINT fk_ai_feedback_log_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT fk_ai_feedback_log_session FOREIGN KEY (session_id) REFERENCES ai_chat_sessions(session_id) ON DELETE SET NULL,
  CONSTRAINT fk_ai_feedback_log_message FOREIGN KEY (message_id) REFERENCES ai_chat_messages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
