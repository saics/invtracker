import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** All money values are stored as integer USD cents. */

export const ITEM_STATUSES = ["held", "gone", "sold"] as const;
export const TX_TYPES = ["buy", "sell"] as const;
export const PLATFORMS = ["csfloat", "skinswap", "csmoney", "dmarket", "steam", "other"] as const;
/**
 * Daily price sources. `market` is the derived market value used for valuation and P&L
 * (see core/market.ts); the rest are raw observations:
 * - `csfloat_sales`: CSFloat average sale price that day (`volume` = sales), backfilled a year
 * - `csfloat_listing` / `csfloat_buyorder`: cheapest listing / best buy order (latest of the day)
 * - `skinport_sales`: Skinport 7-day median sale price (`volume` = sales in those 7 days)
 * - `skinport_listing`: Skinport cheapest listing (`volume` = listings)
 */
export const PRICE_SOURCES = [
  "market",
  "csfloat_sales",
  "csfloat_listing",
  "csfloat_buyorder",
  "skinport_sales",
  "skinport_listing",
] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export type ItemStatus = (typeof ITEM_STATUSES)[number];
export type TxType = (typeof TX_TYPES)[number];
export type Platform = (typeof PLATFORMS)[number];

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

/** One price per item name, source and UTC day; re-fetching the same day overwrites it. */
export const dailyPrices = sqliteTable(
  "daily_prices",
  {
    marketHashName: text("market_hash_name").notNull(),
    source: text("source", { enum: PRICE_SOURCES }).notNull(),
    /** UTC day, YYYY-MM-DD. */
    day: text("day").notNull(),
    /** USD cents. */
    price: integer("price").notNull(),
    volume: integer("volume"),
    /** For `market`: which observation the value came from (e.g. "csfloat_sales_7d"). */
    basis: text("basis"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.marketHashName, t.source, t.day] }), index("daily_source_day_idx").on(t.source, t.day)],
);

/** Latest price quote for one specific item (not just its name), e.g. listings with a similar float. */
export const itemQuotes = sqliteTable("item_quotes", {
  itemId: integer("item_id")
    .primaryKey()
    .references(() => items.id, { onDelete: "cascade" }),
  /** Cheapest CSFloat listing with a float in [floatMin, floatMax]; null when there is none. */
  price: integer("price"),
  floatMin: real("float_min").notNull(),
  floatMax: real("float_max").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type DailyPrice = typeof dailyPrices.$inferSelect;
export type ItemQuote = typeof itemQuotes.$inferSelect;
