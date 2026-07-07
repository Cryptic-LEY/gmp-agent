CREATE TABLE IF NOT EXISTS simulation_story_round_progress (
  user_id VARCHAR(191) NOT NULL,
  project_id INT NOT NULL,
  round_id VARCHAR(191) NOT NULL,
  watched_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, project_id, round_id),
  KEY idx_simulation_story_round_progress_user_project (user_id, project_id, watched_at),
  CONSTRAINT fk_simulation_story_round_progress_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
