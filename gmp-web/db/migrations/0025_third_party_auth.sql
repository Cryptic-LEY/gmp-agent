CREATE TABLE IF NOT EXISTS auth_email_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  purpose VARCHAR(32) NOT NULL,
  role VARCHAR(32),
  code_hash VARCHAR(128) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at DATETIME(3) NOT NULL,
  consumed_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_auth_email_codes_email_purpose (email, purpose)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_third_party_bindings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id VARCHAR(191) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  provider_user_id VARCHAR(191) NOT NULL,
  provider_display_name VARCHAR(255),
  provider_avatar_url TEXT,
  bound_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_login_at DATETIME(3),
  PRIMARY KEY (id),
  KEY idx_user_third_party_bindings_provider_user (provider, provider_user_id),
  KEY idx_user_third_party_bindings_user (user_id),
  CONSTRAINT fk_user_third_party_bindings_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS third_party_bind_sessions (
  session_id VARCHAR(191) NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  state VARCHAR(191) NOT NULL,
  return_to VARCHAR(512),
  provider_user_id VARCHAR(191),
  provider_display_name VARCHAR(255),
  provider_avatar_url TEXT,
  callback_error VARCHAR(500),
  expires_at DATETIME(3) NOT NULL,
  confirmed_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (session_id),
  KEY idx_third_party_bind_sessions_user (user_id),
  CONSTRAINT fk_third_party_bind_sessions_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS third_party_login_sessions (
  session_id VARCHAR(191) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  state VARCHAR(191) NOT NULL,
  expected_role VARCHAR(32),
  return_to VARCHAR(512),
  provider_user_id VARCHAR(191),
  provider_display_name VARCHAR(255),
  provider_avatar_url TEXT,
  user_id VARCHAR(191),
  callback_error VARCHAR(500),
  expires_at DATETIME(3) NOT NULL,
  completed_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (session_id),
  KEY idx_third_party_login_sessions_user (user_id),
  CONSTRAINT fk_third_party_login_sessions_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
