CREATE TABLE `customer_confirmation_attempts` (
	`reference` text PRIMARY KEY NOT NULL,
	`hold_key` text NOT NULL,
	`recipient_hash` text NOT NULL,
	`ip_hash` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`reference`) REFERENCES `orders`(`reference`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `customer_attempt_hold` ON `customer_confirmation_attempts` (`hold_key`);--> statement-breakpoint
CREATE INDEX `customer_attempt_recipient` ON `customer_confirmation_attempts` (`recipient_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `customer_attempt_ip` ON `customer_confirmation_attempts` (`ip_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `customer_attempt_created` ON `customer_confirmation_attempts` (`created_at`);--> statement-breakpoint
CREATE TABLE `customer_confirmations` (
	`reference` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`link_token_hash` text,
	`link_expires_at` integer,
	`telegram_chat_id` text,
	`claimed_at` integer,
	`attempted_at` integer,
	`provider_id` text,
	FOREIGN KEY (`reference`) REFERENCES `orders`(`reference`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_link_token` ON `customer_confirmations` (`link_token_hash`);--> statement-breakpoint
CREATE TABLE `telegram_receipt_updates` (
	`update_id` integer PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `telegram_receipt_updates_created` ON `telegram_receipt_updates` (`created_at`);