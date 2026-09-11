CREATE TABLE `orders` (
	`reference` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`request_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`hold_expires_at` integer NOT NULL,
	`name` text NOT NULL,
	`contact_method` text NOT NULL,
	`contact` text NOT NULL,
	`drawstrings` integer NOT NULL,
	`notes` text NOT NULL,
	`items` text NOT NULL,
	`unit_price` integer NOT NULL,
	`currency` text NOT NULL,
	`notification_status` text DEFAULT 'pending' NOT NULL,
	`message_id` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_attempt` ON `orders` (`token_hash`,`request_key`);--> statement-breakpoint
CREATE INDEX `orders_created` ON `orders` (`created_at`);