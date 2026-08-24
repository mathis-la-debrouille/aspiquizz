CREATE TABLE `question_flags` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`user_id` text NOT NULL,
	`room_id` text,
	`reason` text,
	`created_at` integer NOT NULL,
	`resolution` text,
	`resolved_at` integer,
	`resolved_by` text,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `question_flags_question_id_idx` ON `question_flags` (`question_id`);--> statement-breakpoint
CREATE INDEX `question_flags_resolution_idx` ON `question_flags` (`resolution`);--> statement-breakpoint
CREATE UNIQUE INDEX `question_flags_user_question_uq` ON `question_flags` (`user_id`,`question_id`);