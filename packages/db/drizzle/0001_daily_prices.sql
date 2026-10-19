CREATE TABLE `daily_prices` (
	`market_hash_name` text NOT NULL,
	`source` text NOT NULL,
	`day` text NOT NULL,
	`price` integer NOT NULL,
	`volume` integer,
	`basis` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`market_hash_name`, `source`, `day`)
);
--> statement-breakpoint
CREATE INDEX `daily_source_day_idx` ON `daily_prices` (`source`,`day`);--> statement-breakpoint
CREATE TABLE `item_quotes` (
	`item_id` integer PRIMARY KEY NOT NULL,
	`price` integer,
	`float_min` real NOT NULL,
	`float_max` real NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Carry over existing snapshots as one row per day (the latest snapshot of the day wins).
-- Steam prices are no longer tracked and are dropped.
INSERT OR REPLACE INTO `daily_prices` (`market_hash_name`, `source`, `day`, `price`, `updated_at`)
SELECT `market_hash_name`, `provider`, date(`ts` / 1000, 'unixepoch'), `price`, `ts`
FROM `price_snapshots`
WHERE `provider` IN ('csfloat_sales', 'csfloat_listing', 'csfloat_buyorder')
ORDER BY `ts`;--> statement-breakpoint
DELETE FROM `settings` WHERE `key` LIKE 'steam_history:%';
