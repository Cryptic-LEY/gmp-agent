CREATE TABLE `kp_reg_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kp_id` text NOT NULL,
	`reg_id` text NOT NULL,
	FOREIGN KEY (`kp_id`) REFERENCES `knowledge_points`(`kp_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reg_id`) REFERENCES `reg_library`(`reg_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reg_library` (
	`reg_id` text PRIMARY KEY NOT NULL,
	`doc_type` text NOT NULL,
	`reg_doc` text NOT NULL,
	`appendix_name` text,
	`chapter_name` text,
	`section_name` text,
	`article_num` text,
	`content` text,
	`effective_date` text,
	`issuing_org` text
);
