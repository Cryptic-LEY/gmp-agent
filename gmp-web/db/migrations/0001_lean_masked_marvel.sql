CREATE TABLE `questions` (
	`question_id` text PRIMARY KEY NOT NULL,
	`kp_id` text,
	`question_type` text NOT NULL,
	`stem` text NOT NULL,
	`correct_answer` text NOT NULL,
	`difficulty` text DEFAULT '中' NOT NULL,
	`option_count` integer,
	`option_a` text,
	`option_b` text,
	`option_c` text,
	`option_d` text,
	`option_e` text,
	`option_f` text,
	`option_g` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
