CREATE TABLE `knowledge_points` (
	`kp_id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`title` text NOT NULL,
	`section_code` text,
	`content` text,
	`source_type` text DEFAULT 'law' NOT NULL,
	`source_ref` text,
	`difficulty` integer DEFAULT 3 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kp_dependencies` (
	`from_kp_id` text NOT NULL,
	`to_kp_id` text NOT NULL,
	FOREIGN KEY (`from_kp_id`) REFERENCES `knowledge_points`(`kp_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_kp_id`) REFERENCES `knowledge_points`(`kp_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `kp_mastery` (
	`user_id` text NOT NULL,
	`kp_id` text NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`correct_count` integer DEFAULT 0 NOT NULL,
	`last_tested_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`kp_id`) REFERENCES `knowledge_points`(`kp_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_game_state` (
	`user_id` text PRIMARY KEY NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL,
	`rank_level` integer DEFAULT 1 NOT NULL,
	`rank_title` text DEFAULT 'GMP新人' NOT NULL,
	`streak_days` integer DEFAULT 0 NOT NULL,
	`max_streak` integer DEFAULT 0 NOT NULL,
	`punish_until` text,
	`last_login_date` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`user_id` text PRIMARY KEY NOT NULL,
	`org_id` text DEFAULT 'default' NOT NULL,
	`group_id` text,
	`role` text DEFAULT 'student' NOT NULL,
	`persona` text DEFAULT 'student' NOT NULL,
	`display_name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);