CREATE TABLE `simulation_sessions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL,
  `product_name` text NOT NULL,
  `dosage_category` text NOT NULL,
  `score` integer NOT NULL DEFAULT 0,
  `max_score` integer NOT NULL DEFAULT 0,
  `answers` text NOT NULL DEFAULT '[]',
  `completed_at` text NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE no action
);
