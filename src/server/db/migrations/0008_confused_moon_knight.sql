CREATE TABLE `question_sort_items` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`label` text NOT NULL,
	`media_id` text,
	`position` integer NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `question_sort_items_question_id_idx` ON `question_sort_items` (`question_id`);--> statement-breakpoint
CREATE INDEX `question_sort_items_media_id_idx` ON `question_sort_items` (`media_id`);