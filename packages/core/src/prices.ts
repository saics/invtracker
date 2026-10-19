import { dailyPrices, itemQuotes, items, type DB, type PriceSource } from "@inv/db";
import { and, eq, gte, inArray, isNull, max, or, sql } from "drizzle-orm";
import { computeMarketSeries, dayKey, type DayPoint } from "./market";
import { getCsfloat, skinportListings, skinportSales } from "./providers";

export type PriceJob = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  done: number;
  total: number;
  current: string | null;
  errors: { name: string; error: string }[];
};

const g = globalThis as { __invPriceJob?: PriceJob };
g.__invPriceJob ??= { running: false, startedAt: null, finishedAt: null, done: 0, total: 0, current: null, errors: [] };
const job = g.__invPriceJob;

export const getPriceJob = (): PriceJob => ({ ...job, errors: [...job.errors] });

export const csfloatEnabled = () => !!process.env.CSFLOAT_API_KEY;

/** How far back CSFloat sales are backfilled and the market value is computed. */
export const HISTORY_DAYS = 365;
/** Items whose market value is at least this (USD cents) also get a similar-float listing quote. */
export const FLOAT_QUOTE_MIN_VALUE = 2_000;
/** Float window around the item's own float for the similar-float quote. */
export const FLOAT_QUOTE_RANGE = 0.01;

type DailyRow = typeof dailyPrices.$inferInsert;

const chunk = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Inserts or overwrites (name, source, day) rows. */
export async function upsertDaily(db: DB, rows: DailyRow[]) {
  if (!rows.length) return;
  const stamped = rows.map((r) => ({ ...r, updatedAt: r.updatedAt ?? new Date() }));
  const [first, ...rest] = chunk(stamped, 500).map((c) =>
    db
      .insert(dailyPrices)
      .values(c)
      .onConflictDoUpdate({
        target: [dailyPrices.marketHashName, dailyPrices.source, dailyPrices.day],
        set: {
          price: sql`excluded.price`,
          volume: sql`excluded.volume`,
          basis: sql`excluded.basis`,
          updatedAt: sql`excluded.updated_at`,
        },
      }),
  );
  await db.batch([first!, ...rest]);
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Full price update:
 * 1. Skinport listings + sales for every item name (two bulk requests)
 * 2. CSFloat cheapest listing, best buy order and sales history per held name
 * 3. CSFloat sales history once for names no longer held (for past values)
 * 4. Market value recomputed for every name
 * 5. Similar-float CSFloat listing for held items worth FLOAT_QUOTE_MIN_VALUE or more
 */
export async function updatePrices(db: DB) {
  if (job.running) throw new Error("Price update already running");
  // Medals, badges and other non-marketable items have no price anywhere.
  const tradeable = or(isNull(items.marketable), eq(items.marketable, true));
  const allNames = (await db.selectDistinct({ name: items.marketHashName }).from(items).where(tradeable)).map((r) => r.name);
  const held = (
    await db
      .selectDistinct({ name: items.marketHashName })
      .from(items)
      .where(and(eq(items.status, "held"), tradeable))
  ).map((r) => r.name);
  const cf = csfloatEnabled();
  const withSales = new Set(
    cf
      ? (
          await db.selectDistinct({ name: dailyPrices.marketHashName }).from(dailyPrices).where(eq(dailyPrices.source, "csfloat_sales"))
        ).map((r) => r.name)
      : [],
  );
  const pastOnly = cf ? allNames.filter((n) => !held.includes(n) && !withSales.has(n)) : [];

  Object.assign(job, {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    done: 0,
    // Similar-float quotes are added once the market values they depend on are known.
    total: 1 + (cf ? held.length + pastOnly.length : 0) + 1,
    current: null,
    errors: [],
  });
  const step = async (label: string, fn: () => Promise<unknown>) => {
    job.current = label;
    try {
      await fn();
    } catch (e) {
      job.errors.push({ name: label, error: errorText(e) });
    }
    job.done++;
  };

  try {
    const today = dayKey(Date.now());
    await step("Skinport", () => updateSkinport(db, allNames, today));
    for (const name of held) {
      await step(name, async () => {
        const client = getCsfloat();
        const listing = await client.lowestListing(name);
        const buyOrder = listing ? await client.highestBuyOrder(name, listing.id) : null;
        await upsertDaily(db, [
          ...(listing ? [{ marketHashName: name, source: "csfloat_listing" as const, day: today, price: listing.price }] : []),
          ...(buyOrder != null ? [{ marketHashName: name, source: "csfloat_buyorder" as const, day: today, price: buyOrder }] : []),
        ]);
        await storeCsfloatSales(db, name);
      });
    }
    for (const name of pastOnly) await step(name, () => storeCsfloatSales(db, name));
    await step("Tržišna vrijednost", () => recomputeMarket(db, allNames));
    const floatItems = cf ? await floatQuoteCandidates(db) : [];
    job.total += floatItems.length;
    for (const it of floatItems) await step(`${it.name} (float)`, () => storeFloatQuote(db, it));
  } finally {
    job.running = false;
    job.current = null;
    job.finishedAt = new Date().toISOString();
  }
  return getPriceJob();
}

async function updateSkinport(db: DB, names: string[], day: string) {
  const [listings, sales] = await Promise.all([skinportListings(), skinportSales()]);
  const rows: DailyRow[] = [];
  for (const name of names) {
    const l = listings.get(name);
    if (l) rows.push({ marketHashName: name, source: "skinport_listing", day, price: l.minPrice, volume: l.quantity });
    const s = sales.get(name);
    if (s?.median7d != null && s.volume7d > 0) {
      rows.push({ marketHashName: name, source: "skinport_sales", day, price: s.median7d, volume: s.volume7d });
    }
  }
  await upsertDaily(db, rows);
}

/** Stores CSFloat's daily sale averages (with sale counts) for the last HISTORY_DAYS. */
export async function storeCsfloatSales(db: DB, name: string) {
  const since = Date.now() - HISTORY_DAYS * 86_400_000;
  const days = (await getCsfloat().salesHistory(name)).filter((d) => d.day.getTime() >= since);
  await upsertDaily(
    db,
    days.map((d) => ({ marketHashName: name, source: "csfloat_sales" as const, day: dayKey(d.day), price: d.price, volume: d.count })),
  );
}

type FloatCandidate = { id: number; name: string; floatValue: number };

async function floatQuoteCandidates(db: DB): Promise<FloatCandidate[]> {
  const latest = await latestDaily(db, "market");
  const rows = await db
    .select({ id: items.id, name: items.marketHashName, floatValue: items.floatValue })
    .from(items)
    .where(eq(items.status, "held"));
  return rows.filter(
    (r): r is FloatCandidate => r.floatValue != null && (latest.get(r.name)?.price ?? 0) >= FLOAT_QUOTE_MIN_VALUE,
  );
}

async function storeFloatQuote(db: DB, it: FloatCandidate) {
  const floatMin = Math.max(0, +(it.floatValue - FLOAT_QUOTE_RANGE).toFixed(4));
  const floatMax = Math.min(1, +(it.floatValue + FLOAT_QUOTE_RANGE).toFixed(4));
  const listing = await getCsfloat().lowestListing(it.name, { min: floatMin, max: floatMax });
  const row = { itemId: it.id, price: listing?.price ?? null, floatMin, floatMax, updatedAt: new Date() };
  await db.insert(itemQuotes).values(row).onConflictDoUpdate({ target: itemQuotes.itemId, set: row });
}

/** Recomputes the stored `market` series of the given names from their raw observations. */
export async function recomputeMarket(db: DB, names: string[]) {
  const since = dayKey(Date.now() - HISTORY_DAYS * 86_400_000);
  const today = dayKey(Date.now());
  for (const batch of chunk(names, 50)) {
    const rows = await db
      .select()
      .from(dailyPrices)
      .where(and(inArray(dailyPrices.marketHashName, batch), gte(dailyPrices.day, since)));
    const by = new Map<string, Record<PriceSource, DayPoint[]>>();
    for (const r of rows) {
      let m = by.get(r.marketHashName);
      if (!m) by.set(r.marketHashName, (m = emptySources()));
      m[r.source].push({ day: r.day, price: r.price, volume: r.volume });
    }
    const out: DailyRow[] = [];
    for (const [name, m] of by) {
      const series = computeMarketSeries(
        { csfloatSales: m.csfloat_sales, skinportSales: m.skinport_sales, csfloatListing: m.csfloat_listing, skinportListing: m.skinport_listing },
        today,
      );
      for (const p of series) out.push({ marketHashName: name, source: "market", day: p.day, price: p.price, basis: p.basis });
    }
    await upsertDaily(db, out);
  }
}

const emptySources = (): Record<PriceSource, DayPoint[]> => ({
  market: [],
  csfloat_sales: [],
  csfloat_listing: [],
  csfloat_buyorder: [],
  skinport_sales: [],
  skinport_listing: [],
});

/** When prices were last fetched (newest live observation), or null if never. */
export async function lastPriceUpdate(db: DB): Promise<Date | null> {
  const [row] = await db
    .select({ ts: max(dailyPrices.updatedAt) })
    .from(dailyPrices)
    .where(inArray(dailyPrices.source, ["csfloat_listing", "skinport_listing"]));
  return row?.ts ?? null;
}

/** Starts an update in the background (for API routes); returns immediately. */
export function startPriceUpdate(db: DB) {
  if (job.running) return getPriceJob();
  void updatePrices(db).catch(() => {});
  return getPriceJob();
}

export type LatestPrice = { price: number; day: string; volume: number | null; basis: string | null; updatedAt: Date };

/** Latest row per name for one source. */
export async function latestDaily(db: DB, source: PriceSource, names?: string[]): Promise<Map<string, LatestPrice>> {
  const rows = await db
    .select({
      name: dailyPrices.marketHashName,
      day: sql<string>`max(${dailyPrices.day})`,
      // SQLite returns the other columns of the row that produced max(day).
      price: dailyPrices.price,
      volume: dailyPrices.volume,
      basis: dailyPrices.basis,
      updatedAt: dailyPrices.updatedAt,
    })
    .from(dailyPrices)
    .where(and(eq(dailyPrices.source, source), names ? inArray(dailyPrices.marketHashName, names) : undefined))
    .groupBy(dailyPrices.marketHashName);
  return new Map(rows.map(({ name, ...r }) => [name, r]));
}

export type SeriesPoint = { day: string; price: number; volume: number | null; basis: string | null };

/** Daily rows since `since` for one source, grouped by name, oldest first. */
export async function dailySeries(db: DB, source: PriceSource, since: Date, names?: string[]) {
  const rows = await db
    .select({
      name: dailyPrices.marketHashName,
      day: dailyPrices.day,
      price: dailyPrices.price,
      volume: dailyPrices.volume,
      basis: dailyPrices.basis,
    })
    .from(dailyPrices)
    .where(
      and(
        eq(dailyPrices.source, source),
        gte(dailyPrices.day, dayKey(since)),
        names ? inArray(dailyPrices.marketHashName, names) : undefined,
      ),
    )
    .orderBy(dailyPrices.day);
  const out = new Map<string, SeriesPoint[]>();
  for (const { name, ...p } of rows) {
    let list = out.get(name);
    if (!list) out.set(name, (list = []));
    list.push(p);
  }
  return out;
}
