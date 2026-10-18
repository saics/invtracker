import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** All money values are stored as integer USD cents. */

export const ITEM_STATUSES = ["held", "gone", "sold"] as const;
export const TX_TYPES = ["buy", "sell"] as const;
export const PLATFORMS = ["csfloat", "skinswap", "csmoney", "dmarket", "steam", "other"] as const;
/** `csfloat_sales` is the daily average sale price from CSFloat's history graph (one row per day, backfilled). */
export const PRICE_PROVIDERS = ["csfloat_listing", "csfloat_buyorder", "csfloat_sales", "steam"] as const;

export type ItemStatus = (typeof ITEM_STATUSES)[number];
export type TxType = (typeof TX_TYPES)[number];
export type Platform = (typeof PLATFORMS)[number];
export type PriceProvider = (typeof PRICE_PROVIDERS)[number];

/**
 * A sticker, patch or charm applied to an item. `wear` is the sticker scrape (0 = pristine,
 * 1 = fully scraped); charms have a `pattern` instead. Rows synced before this existed hold
 * plain name strings.
 */
export type ItemSticker = {
  kind: "sticker" | "patch" | "charm";
  name: string;
  image?: string | null;
  slot?: number | null;
  wear?: number | null;
  pattern?: number | null;
};

const now = sql`(unixepoch() * 1000)`;

export const items = sqliteTable(
  "items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Steam asset id. Changes whenever the item is traded, so it is not a stable identity. */
    assetId: text("asset_id").unique(),
    marketHashName: text("market_hash_name").notNull(),
    iconUrl: text("icon_url"),
    rarity: text("rarity"),
    rarityColor: text("rarity_color"),
    exterior: text("exterior"),
    type: text("type"),
    floatValue: real("float_value"),
    paintSeed: integer("paint_seed"),
    stickers: text("stickers", { mode: "json" }).$type<(ItemSticker | string)[]>(),
    inspectLink: text("inspect_link"),
    tradable: integer("tradable", { mode: "boolean" }),
    marketable: integer("marketable", { mode: "boolean" }),
    status: text("status", { enum: ITEM_STATUSES }).notNull().default("held"),
    firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" }).notNull().default(now),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("items_name_idx").on(t.marketHashName), index("items_status_idx").on(t.status)],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id").references(() => items.id, { onDelete: "set null" }),
    marketHashName: text("market_hash_name").notNull(),
    type: text("type", { enum: TX_TYPES }).notNull(),
    platform: text("platform", { enum: PLATFORMS }).notNull(),
    /** Gross price in USD cents. */
    price: integer("price").notNull(),
    /** Fee in USD cents (e.g. CSFloat seller fee). Net proceeds = price - fee. */
    fee: integer("fee").notNull().default(0),
    floatValue: real("float_value"),
    date: integer("date", { mode: "timestamp_ms" }).notNull(),
    /** Source id for imported rows (e.g. "csfloat:<trade id>") — used to dedupe re-imports. */
    externalId: text("external_id").unique(),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("tx_item_idx").on(t.itemId), index("tx_name_idx").on(t.marketHashName)],
);

export const priceSnapshots = sqliteTable(
  "price_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    marketHashName: text("market_hash_name").notNull(),
    provider: text("provider", { enum: PRICE_PROVIDERS }).notNull(),
    price: integer("price").notNull(),
    ts: integer("ts", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("snap_lookup_idx").on(t.marketHashName, t.provider, t.ts)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type PriceSnapshot = typeof priceSnapshots.$inferSelect;
