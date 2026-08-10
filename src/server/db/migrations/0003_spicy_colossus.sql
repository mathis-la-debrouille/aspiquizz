PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text,
	`question_id` text NOT NULL,
	`user_id` text NOT NULL,
	`position` integer NOT NULL,
	`payload` text NOT NULL,
	`is_correct` integer NOT NULL,
	`ms_taken` integer NOT NULL,
	`points_awarded` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_answers`("id", "room_id", "question_id", "user_id", "position", "payload", "is_correct", "ms_taken", "points_awarded", "created_at") SELECT "id", "room_id", "question_id", "user_id", "position", "payload", "is_correct", "ms_taken", "points_awarded", "created_at" FROM `answers`;--> statement-breakpoint
DROP TABLE `answers`;--> statement-breakpoint
ALTER TABLE `__new_answers` RENAME TO `answers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `answers_room_position_user_idx` ON `answers` (`room_id`,`position`,`user_id`);--> statement-breakpoint
CREATE INDEX `answers_question_id_idx` ON `answers` (`question_id`);--> statement-breakpoint
CREATE INDEX `answers_user_id_idx` ON `answers` (`user_id`);