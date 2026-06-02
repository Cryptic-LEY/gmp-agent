CREATE TABLE IF NOT EXISTS game_reward_claims (
  user_id VARCHAR(191) NOT NULL,
  reward_key VARCHAR(191) NOT NULL,
  xp INT NOT NULL DEFAULT 0,
  points INT NOT NULL DEFAULT 0,
  claimed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, reward_key),
  CONSTRAINT fk_game_reward_claims_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
