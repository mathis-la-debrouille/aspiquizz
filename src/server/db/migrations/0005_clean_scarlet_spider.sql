CREATE TABLE `country_capitals` (
	`id` text PRIMARY KEY NOT NULL,
	`country_iso3` text NOT NULL,
	`name_fr` text NOT NULL,
	`role` text,
	`branch` text,
	`contested` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`source_url` text,
	FOREIGN KEY (`country_iso3`) REFERENCES `countries`(`iso3`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `country_capitals_country_iso3_idx` ON `country_capitals` (`country_iso3`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_question_choices` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`label` text NOT NULL,
	`is_correct` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_question_choices`("id", "question_id", "label", "is_correct", "position") SELECT "id", "question_id", "label", "is_correct", "position" FROM `question_choices`;--> statement-breakpoint
DROP TABLE `question_choices`;--> statement-breakpoint
ALTER TABLE `__new_question_choices` RENAME TO `question_choices`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `question_choices_question_id_idx` ON `question_choices` (`question_id`);--> statement-breakpoint
CREATE TABLE `__new_question_geo` (
	`question_id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`target_iso3` text NOT NULL,
	`extra_iso3` text DEFAULT '[]' NOT NULL,
	`view_bbox` text,
	`show_labels` integer DEFAULT false NOT NULL,
	`show_neighbours` integer DEFAULT true NOT NULL,
	`tolerance_km` integer,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_question_geo`("question_id", "mode", "target_iso3", "extra_iso3", "view_bbox", "show_labels", "show_neighbours", "tolerance_km") SELECT "question_id", "mode", "target_iso3", "extra_iso3", "view_bbox", "show_labels", "show_neighbours", "tolerance_km" FROM `question_geo`;--> statement-breakpoint
DROP TABLE `question_geo`;--> statement-breakpoint
ALTER TABLE `__new_question_geo` RENAME TO `question_geo`;--> statement-breakpoint
CREATE TABLE `__new_question_open_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`value` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_question_open_answers`("id", "question_id", "value", "is_primary") SELECT "id", "question_id", "value", "is_primary" FROM `question_open_answers`;--> statement-breakpoint
DROP TABLE `question_open_answers`;--> statement-breakpoint
ALTER TABLE `__new_question_open_answers` RENAME TO `question_open_answers`;--> statement-breakpoint
CREATE INDEX `question_open_answers_question_id_idx` ON `question_open_answers` (`question_id`);