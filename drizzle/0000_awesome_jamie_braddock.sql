CREATE TABLE `held_items` (
	`token_hash` text NOT NULL,
	`size` text NOT NULL,
	`quantity` integer NOT NULL,
	PRIMARY KEY(`token_hash`, `size`),
	FOREIGN KEY (`token_hash`) REFERENCES `holds`(`token_hash`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`size`) REFERENCES `inventory`(`size`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "held_positive" CHECK("held_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE INDEX `held_size` ON `held_items` (`size`);--> statement-breakpoint
CREATE TABLE `holds` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `holds_expiry` ON `holds` (`expires_at`);--> statement-breakpoint
CREATE TABLE `inventory` (
	`size` text PRIMARY KEY NOT NULL,
	`quantity` integer NOT NULL,
	CONSTRAINT "stock_nonnegative" CHECK("inventory"."quantity" >= 0)
);
