CREATE TABLE `question_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`question_id` text NOT NULL,
	`user_answer` text NOT NULL,
	`is_correct` integer NOT NULL,
	`reviewed` integer DEFAULT false NOT NULL,
	`answered_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE no action
);
