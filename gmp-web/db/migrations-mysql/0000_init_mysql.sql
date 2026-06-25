CREATE TABLE `case_kp_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`case_id` varchar(64) NOT NULL,
	`kp_id` varchar(64) NOT NULL,
	CONSTRAINT `case_kp_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `case_library` (
	`case_id` varchar(64) NOT NULL,
	`product_name` varchar(128) NOT NULL,
	`dosage_form` varchar(64) NOT NULL,
	`dosage_category` varchar(64) NOT NULL,
	`section_type` varchar(64) NOT NULL,
	`section_name` varchar(255),
	`content` text,
	`source_file` varchar(255),
	`embedding` mediumtext,
	CONSTRAINT `case_library_case_id` PRIMARY KEY(`case_id`)
);
--> statement-breakpoint
CREATE TABLE `checkin_log` (
	`user_id` varchar(64) NOT NULL,
	`date` varchar(16) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `course_assignment_submissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assignment_id` int NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`content` mediumtext NOT NULL,
	`score` int,
	`feedback` text,
	`submitted_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`graded_at` datetime(3),
	CONSTRAINT `course_assignment_submissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `course_submissions_assignment_user_unique` UNIQUE(`assignment_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `course_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`training_id` varchar(8) NOT NULL,
	`teacher_id` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`assignment_type` varchar(32) NOT NULL DEFAULT '案例分析',
	`max_score` int NOT NULL DEFAULT 100,
	`due_date` varchar(32),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `course_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `course_discussion_replies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`discussion_id` int NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`content` text NOT NULL,
	`is_ai` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `course_discussion_replies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `course_discussions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`training_id` varchar(8) NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`tag` varchar(16) DEFAULT '提问',
	`pinned` boolean NOT NULL DEFAULT false,
	`view_count` int NOT NULL DEFAULT 0,
	`reply_count` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `course_discussions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `course_study_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`training_id` varchar(8) NOT NULL,
	`seconds` int NOT NULL,
	`activity` varchar(16) DEFAULT 'reading',
	`logged_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `course_study_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `knowledge_points` (
	`kp_id` varchar(64) NOT NULL,
	`concept_id` varchar(64),
	`serial_code` varchar(32),
	`granularity` varchar(32),
	`edu_level` varchar(32),
	`project_name` varchar(128),
	`task_name` varchar(128),
	`title` varchar(255) NOT NULL,
	`content` text,
	`gmp_articles` text,
	`source_type` varchar(32) NOT NULL DEFAULT '教材',
	`difficulty` int NOT NULL DEFAULT 3,
	`point_type` varchar(32) NOT NULL DEFAULT '知识点',
	`mastery_requirement` text,
	`embedding` mediumtext,
	`status` varchar(16) NOT NULL DEFAULT 'active',
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `knowledge_points_kp_id` PRIMARY KEY(`kp_id`)
);
--> statement-breakpoint
CREATE TABLE `kp_dependencies` (
	`from_kp_id` varchar(64) NOT NULL,
	`to_kp_id` varchar(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kp_mastery` (
	`user_id` varchar(64) NOT NULL,
	`kp_id` varchar(64) NOT NULL,
	`confidence` double NOT NULL DEFAULT 0,
	`attempt_count` int NOT NULL DEFAULT 0,
	`correct_count` int NOT NULL DEFAULT 0,
	`last_tested_at` datetime(3),
	CONSTRAINT `kp_mastery_user_kp_unique` UNIQUE(`user_id`,`kp_id`)
);
--> statement-breakpoint
CREATE TABLE `kp_reg_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kp_id` varchar(64) NOT NULL,
	`reg_id` varchar(64) NOT NULL,
	CONSTRAINT `kp_reg_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `learning_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`edu_level` varchar(32) NOT NULL,
	`major` varchar(64) NOT NULL,
	`score` int NOT NULL,
	`wrong_count` int NOT NULL DEFAULT 0,
	`plan_data` mediumtext NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `learning_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `module_scores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`training_id` varchar(8) NOT NULL,
	`edu_level` varchar(32) NOT NULL,
	`score` int NOT NULL,
	`earned_hours` double NOT NULL,
	`completed_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `module_scores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `question_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`question_id` varchar(64) NOT NULL,
	`user_answer` varchar(32) NOT NULL,
	`is_correct` boolean NOT NULL,
	`reviewed` boolean NOT NULL DEFAULT false,
	`answered_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `question_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `questions` (
	`question_id` varchar(64) NOT NULL,
	`kp_id` varchar(64),
	`question_type` varchar(32) NOT NULL,
	`stem` text NOT NULL,
	`correct_answer` text NOT NULL,
	`difficulty` varchar(16) NOT NULL DEFAULT '中',
	`option_count` int,
	`option_a` text,
	`option_b` text,
	`option_c` text,
	`option_d` text,
	`option_e` text,
	`option_f` text,
	`option_g` text,
	`explanation` text,
	`project_name` varchar(128),
	`edu_level` varchar(32),
	`status` varchar(16) NOT NULL DEFAULT 'active',
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `questions_question_id` PRIMARY KEY(`question_id`)
);
--> statement-breakpoint
CREATE TABLE `reg_library` (
	`reg_id` varchar(64) NOT NULL,
	`doc_type` varchar(64) NOT NULL,
	`reg_doc` varchar(255) NOT NULL,
	`appendix_name` varchar(255),
	`chapter_name` varchar(512),
	`section_name` varchar(255),
	`article_num` varchar(32),
	`content` text,
	`effective_date` varchar(32),
	`issuing_org` varchar(128),
	`embedding` mediumtext,
	CONSTRAINT `reg_library_reg_id` PRIMARY KEY(`reg_id`)
);
--> statement-breakpoint
CREATE TABLE `simulation_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`product_name` varchar(128) NOT NULL,
	`dosage_category` varchar(64) NOT NULL,
	`score` int NOT NULL DEFAULT 0,
	`max_score` int NOT NULL DEFAULT 0,
	`answers` mediumtext NOT NULL,
	`completed_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `simulation_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `skill_kp_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`skill_id` varchar(32) NOT NULL,
	`kp_id` varchar(64) NOT NULL,
	`link_type` varchar(32) NOT NULL DEFAULT 'reg_shared',
	`confidence` double NOT NULL DEFAULT 0.7,
	CONSTRAINT `skill_kp_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `skill_kp_links_skill_kp_unique` UNIQUE(`skill_id`,`kp_id`)
);
--> statement-breakpoint
CREATE TABLE `skill_library` (
	`skill_id` varchar(32) NOT NULL,
	`skill_name` varchar(255) NOT NULL,
	`skill_category` varchar(64) NOT NULL,
	`edu_level` varchar(32) NOT NULL DEFAULT '通用',
	`difficulty` int NOT NULL DEFAULT 3,
	`description` text,
	`mastery_std_college` text,
	`mastery_std_ug` text,
	`defect_source` text,
	`tool_name` varchar(128),
	`embedding` mediumtext,
	`status` varchar(16) NOT NULL DEFAULT 'active',
	CONSTRAINT `skill_library_skill_id` PRIMARY KEY(`skill_id`)
);
--> statement-breakpoint
CREATE TABLE `skill_reg_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`skill_id` varchar(32) NOT NULL,
	`reg_id` varchar(64) NOT NULL,
	CONSTRAINT `skill_reg_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `skill_training_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`skill_id` varchar(32) NOT NULL,
	`training_id` varchar(8) NOT NULL,
	`is_primary` boolean NOT NULL DEFAULT true,
	CONSTRAINT `skill_training_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `training_projects` (
	`training_id` varchar(8) NOT NULL,
	`display_name` varchar(128) NOT NULL,
	`kp_proj_ug` varchar(128),
	`kp_proj_col` varchar(128),
	`hours_college` int,
	`hours_ug` int,
	`seq_order` int NOT NULL,
	CONSTRAINT `training_projects_training_id` PRIMARY KEY(`training_id`)
);
--> statement-breakpoint
CREATE TABLE `user_game_state` (
	`user_id` varchar(64) NOT NULL,
	`xp` int NOT NULL DEFAULT 0,
	`points` int NOT NULL DEFAULT 0,
	`rank_level` int NOT NULL DEFAULT 1,
	`rank_title` varchar(64) NOT NULL DEFAULT 'GMP新人',
	`streak_days` int NOT NULL DEFAULT 0,
	`max_streak` int NOT NULL DEFAULT 0,
	`punish_until` datetime(3),
	`last_login_date` varchar(16),
	CONSTRAINT `user_game_state_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`user_id` varchar(64) NOT NULL,
	`org_id` varchar(64) NOT NULL DEFAULT 'default',
	`group_id` varchar(64),
	`role` varchar(32) NOT NULL DEFAULT 'student',
	`persona` varchar(32) NOT NULL DEFAULT 'student',
	`display_name` varchar(128) NOT NULL,
	`email` varchar(255) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`real_name` varchar(64),
	`school` varchar(128),
	`major` varchar(64),
	`class_name` varchar(64),
	`student_id` varchar(64),
	`id_card` varchar(32),
	`phone` varchar(32),
	CONSTRAINT `users_user_id` PRIMARY KEY(`user_id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `case_kp_links` ADD CONSTRAINT `case_kp_links_case_id_case_library_case_id_fk` FOREIGN KEY (`case_id`) REFERENCES `case_library`(`case_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `case_kp_links` ADD CONSTRAINT `case_kp_links_kp_id_knowledge_points_kp_id_fk` FOREIGN KEY (`kp_id`) REFERENCES `knowledge_points`(`kp_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `checkin_log` ADD CONSTRAINT `checkin_log_user_id_users_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `course_assignment_submissions` ADD CONSTRAINT `course_assignment_submissions_assignment_id_course_assignments_id_fk` FOREIGN KEY (`assignment_id`) REFERENCES `course_assignments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `course_assignment_submissions` ADD CONSTRAINT `course_assignment_submissions_user_id_users_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `course_assignments` ADD CONSTRAINT `course_assignments_teacher_id_users_user_id_fk` FOREIGN KEY (`teacher_id`) REFERENCES `users`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `course_discussion_replies` ADD CONSTRAINT `course_discussion_replies_discussion_id_course_discussions_id_fk` FOREIGN KEY (`discussion_id`) REFERENCES `course_discussions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `course_discussion_replies` ADD CONSTRAINT `course_discussion_replies_user_id_users_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `course_discussions` ADD CONSTRAINT `course_discussions_user_id_users_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `course_study_logs` ADD CONSTRAINT `course_study_logs_user_id_users_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kp_dependencies` ADD CONSTRAINT `kp_dependencies_from_kp_id_knowledge_points_kp_id_fk` FOREIGN KEY (`from_kp_id`) REFERENCES `knowledge_points`(`kp_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kp_dependencies` ADD CONSTRAINT `kp_dependencies_to_kp_id_knowledge_points_kp_id_fk` FOREIGN KEY (`to_kp_id`) REFERENCES `knowledge_points`(`kp_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kp_mastery` ADD CONSTRAINT `kp_mastery_user_id_users_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kp_mastery` ADD CONSTRAINT `kp_mastery_kp_id_knowledge_points_kp_id_fk` FOREIGN KEY (`kp_id`) REFERENCES `knowledge_points`(`kp_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kp_reg_links` ADD CONSTRAINT `kp_reg_links_kp_id_knowledge_points_kp_id_fk` FOREIGN KEY (`kp_id`) REFERENCES `knowledge_points`(`kp_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kp_reg_links` ADD CONSTRAINT `kp_reg_links_reg_id_reg_library_reg_id_fk` FOREIGN KEY (`reg_id`) REFERENCES `reg_library`(`reg_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `learning_plans` ADD CONSTRAINT `learning_plans_user_id_users_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `module_scores` ADD CONSTRAINT `module_scores_user_id_users_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `question_history` ADD CONSTRAINT `question_history_user_id_users_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `simulation_sessions` ADD CONSTRAINT `simulation_sessions_user_id_users_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `skill_kp_links` ADD CONSTRAINT `skill_kp_links_skill_id_skill_library_skill_id_fk` FOREIGN KEY (`skill_id`) REFERENCES `skill_library`(`skill_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `skill_kp_links` ADD CONSTRAINT `skill_kp_links_kp_id_knowledge_points_kp_id_fk` FOREIGN KEY (`kp_id`) REFERENCES `knowledge_points`(`kp_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `skill_reg_links` ADD CONSTRAINT `skill_reg_links_skill_id_skill_library_skill_id_fk` FOREIGN KEY (`skill_id`) REFERENCES `skill_library`(`skill_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `skill_reg_links` ADD CONSTRAINT `skill_reg_links_reg_id_reg_library_reg_id_fk` FOREIGN KEY (`reg_id`) REFERENCES `reg_library`(`reg_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `skill_training_links` ADD CONSTRAINT `skill_training_links_skill_id_skill_library_skill_id_fk` FOREIGN KEY (`skill_id`) REFERENCES `skill_library`(`skill_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_game_state` ADD CONSTRAINT `user_game_state_user_id_users_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE no action ON UPDATE no action;