import { db } from '@/db'

let initialized = false

const AUTH_STORAGE_TABLES = new Set([
  'third_party_bind_sessions',
  'third_party_login_sessions',
])

async function ensureColumn(table: string, column: string, definition: string) {
  if (!AUTH_STORAGE_TABLES.has(table)) {
    throw new Error(`Unsupported auth storage table: ${table}`)
  }
  const existing = await db.raw.get<{ COLUMN_NAME: string }>(`
    SELECT COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
    LIMIT 1
  `, [table, column])
  if (existing) return
  await db.raw.run(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`)
}

export async function ensureAuthStorage() {
  if (initialized) return

  await db.raw.run(`
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
      KEY idx_auth_email_codes_lookup (email, purpose, created_at),
      KEY idx_auth_email_codes_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await db.raw.run(`
    CREATE TABLE IF NOT EXISTS user_third_party_bindings (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id VARCHAR(191) NOT NULL,
      provider VARCHAR(32) NOT NULL,
      provider_user_id VARCHAR(191) NOT NULL,
      provider_display_name VARCHAR(255),
      provider_avatar_url LONGTEXT,
      bound_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      last_login_at DATETIME(3),
      PRIMARY KEY (id),
      UNIQUE KEY uniq_user_provider (user_id, provider),
      UNIQUE KEY uniq_provider_user (provider, provider_user_id),
      KEY idx_third_party_bindings_user (user_id),
      CONSTRAINT fk_third_party_bindings_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await db.raw.run(`
    CREATE TABLE IF NOT EXISTS third_party_bind_sessions (
      session_id VARCHAR(191) NOT NULL,
      user_id VARCHAR(191) NOT NULL,
      provider VARCHAR(32) NOT NULL,
      state VARCHAR(191) NOT NULL,
      return_to VARCHAR(512),
      provider_user_id VARCHAR(191),
      provider_display_name VARCHAR(255),
      provider_avatar_url LONGTEXT,
      callback_error VARCHAR(500),
      expires_at DATETIME(3) NOT NULL,
      confirmed_at DATETIME(3),
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (session_id),
      UNIQUE KEY uniq_third_party_bind_state (state),
      KEY idx_third_party_bind_sessions_user (user_id, provider),
      CONSTRAINT fk_third_party_bind_sessions_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await ensureColumn('third_party_bind_sessions', 'return_to', '`return_to` VARCHAR(512)')
  await ensureColumn('third_party_bind_sessions', 'provider_user_id', '`provider_user_id` VARCHAR(191)')
  await ensureColumn('third_party_bind_sessions', 'provider_display_name', '`provider_display_name` VARCHAR(255)')
  await ensureColumn('third_party_bind_sessions', 'provider_avatar_url', '`provider_avatar_url` LONGTEXT')
  await ensureColumn('third_party_bind_sessions', 'callback_error', '`callback_error` VARCHAR(500)')

  await db.raw.run(`
    CREATE TABLE IF NOT EXISTS third_party_login_sessions (
      session_id VARCHAR(191) NOT NULL,
      provider VARCHAR(32) NOT NULL,
      state VARCHAR(191) NOT NULL,
      expected_role VARCHAR(32),
      return_to VARCHAR(512),
      provider_user_id VARCHAR(191),
      provider_display_name VARCHAR(255),
      provider_avatar_url LONGTEXT,
      user_id VARCHAR(191),
      callback_error VARCHAR(500),
      expires_at DATETIME(3) NOT NULL,
      completed_at DATETIME(3),
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (session_id),
      UNIQUE KEY uniq_third_party_login_state (state),
      KEY idx_third_party_login_sessions_user (user_id, provider),
      CONSTRAINT fk_third_party_login_sessions_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  initialized = true
}
