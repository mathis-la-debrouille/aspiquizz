CREATE TABLE `question_estimation` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`correct_value` real NOT NULL,
	`tolerance_type` text NOT NULL,
	`tolerance_value` real NOT NULL,
	`unit` text,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `question_estimation_question_id_unique` ON `question_estimation` (`question_id`);--> statement-breakpoint
CREATE INDEX `question_estimation_question_id_idx` ON `question_estimation` (`question_id`);