ALTER TABLE user_game_state ADD COLUMN simulation_coins INT NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE user_game_state ADD COLUMN simulation_gems INT NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE user_game_state ADD COLUMN simulation_trophies INT NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE user_game_state ADD COLUMN simulation_unlocked_heroes_json LONGTEXT;
--> statement-breakpoint
ALTER TABLE user_game_state ADD COLUMN simulation_wallet_synced_at DATETIME(3);
