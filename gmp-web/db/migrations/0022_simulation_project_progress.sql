CREATE TABLE IF NOT EXISTS simulation_project_progress (
  user_id VARCHAR(191) NOT NULL,
  project_id INT NOT NULL,
  medal VARCHAR(32) NOT NULL,
  best_score INT NOT NULL DEFAULT 0,
  story_score INT NOT NULL DEFAULT 0,
  boss_accuracy INT NOT NULL DEFAULT 0,
  credit_hours DOUBLE NOT NULL DEFAULT 0,
  completed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, project_id),
  KEY idx_simulation_project_progress_user_completed (user_id, completed_at),
  CONSTRAINT fk_simulation_project_progress_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
