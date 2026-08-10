CREATE TABLE `question_stats` (
	`question_id` text PRIMARY KEY NOT NULL,
	`times_asked` integer DEFAULT 0 NOT NULL,
	`times_correct` integer DEFAULT 0 NOT NULL,
	`total_ms` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action
);
