CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` text,
	`market_hash_name` text NOT NULL,
	`icon_url` text,
	`rarity` text,
	`rarity_color` text,
	`exterior` text,
	`type` text,
	`float_value` real,
	`paint_seed` integer,
	`stickers` text,
	`inspect_link` text,
	`tradable` integer,
	`marketable` integer,
	`status` text DEFAULT 'held' NOT NULL,
	`first_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_asset_id_unique` ON `items` (`asset_id`);--> statement-breakpoint
CREATE INDEX `items_name_idx` ON `items` (`market_hash_name`);--> statement-breakpoint
CREATE INDEX `items_status_idx` ON `items` (`status`);--> statement-breakpoint
CREATE TABLE `price_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`market_hash_name` text NOT NULL,
	`provider` text NOT NULL,
	`price` integer NOT NULL,
	`ts` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `snap_lookup_idx` ON `price_snapshots` (`market_hash_name`,`provider`,`ts`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer,
	`market_hash_name` text NOT NULL,
	`type` text NOT NULL,
	`platform` text NOT NULL,
	`price` integer NOT NULL,
	`fee` integer DEFAULT 0 NOT NULL,
	`float_value` real,
	`date` integer NOT NULL,
	`external_id` text,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_external_id_unique` ON `transactions` (`external_id`);--> statement-breakpoint
CREATE INDEX `tx_item_idx` ON `transactions` (`item_id`);--> statement-breakpoint
CREATE INDEX `tx_name_idx` ON `transactions` (`market_hash_name`);