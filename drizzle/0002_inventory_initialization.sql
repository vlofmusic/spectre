CREATE TABLE `inventory_initializations` (
	`id` text PRIMARY KEY NOT NULL,
	`request_key` text NOT NULL,
	`initialized_at` integer NOT NULL
);
