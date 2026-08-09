CREATE TABLE `answers` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
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
CREATE UNIQUE INDEX `answers_room_position_user_idx` ON `answers` (`room_id`,`position`,`user_id`);--> statement-breakpoint
CREATE INDEX `answers_question_id_idx` ON `answers` (`question_id`);--> statement-breakpoint
CREATE INDEX `answers_user_id_idx` ON `answers` (`user_id`);--> statement-breakpoint
CREATE TABLE `badges` (
	`id` text PRIMARY KEY NOT NULL,
	`name_fr` text NOT NULL,
	`description_fr` text NOT NULL,
	`icon_key` text NOT NULL,
	`tier` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`color_token` text NOT NULL,
	`description` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_idx` ON `categories` (`slug`);--> statement-breakpoint
CREATE TABLE `countries` (
	`iso3` text PRIMARY KEY NOT NULL,
	`iso2` text NOT NULL,
	`un_numeric` text NOT NULL,
	`name_fr` text NOT NULL,
	`name_en` text NOT NULL,
	`official_name_fr` text NOT NULL,
	`capital_fr` text,
	`capital_iso_lat` real,
	`capital_iso_lon` real,
	`population` integer,
	`area_km2` integer,
	`region_fr` text NOT NULL,
	`subregion_fr` text NOT NULL,
	`continent_fr` text NOT NULL,
	`centroid_lon` real NOT NULL,
	`centroid_lat` real NOT NULL,
	`flag_emoji` text NOT NULL,
	`is_sovereign` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`original_name` text NOT NULL,
	`mime` text NOT NULL,
	`width` integer,
	`height` integer,
	`size_bytes` integer NOT NULL,
	`dominant_color` text,
	`uploader_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`uploader_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `media_uploader_id_idx` ON `media` (`uploader_id`);--> statement-breakpoint
CREATE TABLE `question_choices` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`label` text NOT NULL,
	`is_correct` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `question_choices_question_id_idx` ON `question_choices` (`question_id`);--> statement-breakpoint
CREATE TABLE `question_geo` (
	`question_id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`target_iso3` text NOT NULL,
	`extra_iso3` text DEFAULT '[]' NOT NULL,
	`view_bbox` text,
	`show_labels` integer DEFAULT false NOT NULL,
	`show_neighbours` integer DEFAULT true NOT NULL,
	`tolerance_km` integer,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `question_open_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`value` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `question_open_answers_question_id_idx` ON `question_open_answers` (`question_id`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`prompt` text NOT NULL,
	`hint` text,
	`explanation` text,
	`category_id` text NOT NULL,
	`author_id` text NOT NULL,
	`difficulty` integer DEFAULT 1 NOT NULL,
	`time_limit_s` integer DEFAULT 20 NOT NULL,
	`points_base` integer DEFAULT 1000 NOT NULL,
	`media_id` text,
	`answer_mode` text,
	`strict` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `questions_category_id_idx` ON `questions` (`category_id`);--> statement-breakpoint
CREATE INDEX `questions_author_id_idx` ON `questions` (`author_id`);--> statement-breakpoint
CREATE INDEX `questions_status_idx` ON `questions` (`status`);--> statement-breakpoint
CREATE INDEX `questions_type_idx` ON `questions` (`type`);--> statement-breakpoint
CREATE INDEX `questions_media_id_idx` ON `questions` (`media_id`);--> statement-breakpoint
CREATE TABLE `quiz_questions` (
	`quiz_id` text NOT NULL,
	`question_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`quiz_id`, `question_id`),
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `quiz_questions_question_id_idx` ON `quiz_questions` (`question_id`);--> statement-breakpoint
CREATE TABLE `quizzes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`cover_media_id` text,
	`author_id` text NOT NULL,
	`category_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`cover_media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `quizzes_author_id_idx` ON `quizzes` (`author_id`);--> statement-breakpoint
CREATE INDEX `quizzes_category_id_idx` ON `quizzes` (`category_id`);--> statement-breakpoint
CREATE INDEX `quizzes_status_idx` ON `quizzes` (`status`);--> statement-breakpoint
CREATE TABLE `room_players` (
	`room_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`left_at` integer,
	`is_connected` integer DEFAULT true NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`streak` integer DEFAULT 0 NOT NULL,
	`best_streak` integer DEFAULT 0 NOT NULL,
	`correct_count` integer DEFAULT 0 NOT NULL,
	`final_rank` integer,
	PRIMARY KEY(`room_id`, `user_id`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `room_players_user_id_idx` ON `room_players` (`user_id`);--> statement-breakpoint
CREATE TABLE `room_questions` (
	`room_id` text NOT NULL,
	`position` integer NOT NULL,
	`question_id` text NOT NULL,
	`time_limit_s` integer NOT NULL,
	`revealed_at` integer,
	`closed_at` integer,
	PRIMARY KEY(`room_id`, `position`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `room_questions_question_id_idx` ON `room_questions` (`question_id`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`host_id` text NOT NULL,
	`quiz_id` text,
	`source` text NOT NULL,
	`config` text NOT NULL,
	`status` text DEFAULT 'lobby' NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`current_index` integer DEFAULT -1 NOT NULL,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	FOREIGN KEY (`host_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_code_idx` ON `rooms` (`code`);--> statement-breakpoint
CREATE INDEX `rooms_host_id_idx` ON `rooms` (`host_id`);--> statement-breakpoint
CREATE INDEX `rooms_quiz_id_idx` ON `rooms` (`quiz_id`);--> statement-breakpoint
CREATE INDEX `rooms_status_idx` ON `rooms` (`status`);--> statement-breakpoint
CREATE INDEX `rooms_visibility_idx` ON `rooms` (`visibility`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`user_agent` text,
	`ip_hash` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_at_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `user_badges` (
	`user_id` text NOT NULL,
	`badge_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `badge_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`badge_id`) REFERENCES `badges`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `user_badges_badge_id_idx` ON `user_badges` (`badge_id`);--> statement-breakpoint
CREATE TABLE `user_category_stats` (
	`user_id` text NOT NULL,
	`category_id` text NOT NULL,
	`answered` integer DEFAULT 0 NOT NULL,
	`correct` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `category_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `user_category_stats_category_id_idx` ON `user_category_stats` (`category_id`);--> statement-breakpoint
CREATE TABLE `user_stats` (
	`user_id` text PRIMARY KEY NOT NULL,
	`games_played` integer DEFAULT 0 NOT NULL,
	`questions_answered` integer DEFAULT 0 NOT NULL,
	`correct_answers` integer DEFAULT 0 NOT NULL,
	`total_points` integer DEFAULT 0 NOT NULL,
	`best_streak` integer DEFAULT 0 NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'player' NOT NULL,
	`avatar_seed` text NOT NULL,
	`bio` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_login_at` integer,
	`created_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_idx` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `users_created_by_idx` ON `users` (`created_by`);