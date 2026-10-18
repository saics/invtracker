import { items, priceSnapshots, PRICE_PROVIDERS, settings, type DB, type PriceProvider } from "@inv/db";
import { and, eq, gte, like, min, ne, notInArray, sql } from "drizzle-orm";
import { usdEurRateAt } from "./fx";
import { fetchPrices, getCsfloat, steamPriceHistory } from "./providers";

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

/** Providers usable with the current config (CSFloat needs an API key). */
export function availableProviders(): PriceProvider[] {
  return PRICE_PROVIDERS.filter((p) => p === "steam" || !!process.env.CSFLOAT_API_KEY);
}

/**
 * Fetches prices for every distinct held item name and stores snapshots. Items no longer
 * held only get their sales history backfilled once (for the value-over-time chart).
 * Steam history is backfilled once per name, for held and past items alike.
 */
export async function updatePrices(db: DB, providers: PriceProvider[] = availableProviders()) {
  if (job.running) throw new Error("Price update already running");
  const names = (
    await db.selectDistinct({ name: items.marketHashName }).from(items).where(eq(items.status, "held"))
  ).map((r) => r.name);
  const backfillOnly = providers.includes("csfloat_sales")
    ? (
        await db
          .selectDistinct({ name: items.marketHashName })
          .from(items)
          .where(
            and(
              ne(items.status, "held"),
              notInArray(items.marketHashName, db.select({ n: items.marketHashName }).from(items).where(eq(items.status, "held"))),
              notInArray(
                items.marketHashName,
                db.select({ n: priceSnapshots.marketHashName }).from(priceSnapshots).where(eq(priceSnapshots.provider, "csfloat_sales")),
              ),
            ),
          )
      ).map((r) => r.name)
    : [];
  const steamPending = providers.includes("steam") ? await pendingSteamBackfill(db) : [];

  Object.assign(job, {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    done: 0,
    total: names.length + backfillOnly.length + steamPending.length,
    current: null,
    errors: [],
  });

  try {
    for (const name of [...names, ...backfillOnly]) {
      job.current = name;
      try {
        if (names.includes(name)) {
          const prices = await fetchPrices(name, providers);
          const rows = Object.entries(prices)
            .filter(([, price]) => price != null)
            .map(([provider, price]) => ({ marketHashName: name, provider: provider as PriceProvider, price: price! }));
          if (rows.length) await db.insert(priceSnapshots).values(rows);
        }
        if (providers.includes("csfloat_sales")) await storeSalesHistory(db, name);
      } catch (e) {
        job.errors.push({ name, error: e instanceof Error ? e.message : String(e) });
      }
      job.done++;
    }
    const steamDone = new Set<string>();
    const rateAt = steamPending.length
      ? await usdEurRateAt(db, new Date(Date.now() - SALES_HISTORY_DAYS * 86_400_000))
      : () => 1;
    for (const name of steamPending) {
      job.current = `${name} (Steam povijest)`;
      try {
        if (!steamDone.has(name)) {
          for (const n of await backfillSteamHistory(db, name, steamPending, rateAt)) steamDone.add(n);
        }
      } catch (e) {
        job.errors.push({ name, error: e instanceof Error ? e.message : String(e) });
      }
      job.done++;
    }
  } finally {
    job.running = false;
    job.current = null;
    job.finishedAt = new Date().toISOString();
  }
  return getPriceJob();
}

export const SALES_HISTORY_DAYS = 365;

/**
 * Replaces the stored `csfloat_sales` series of one item with CSFloat's daily averages.
 * Re-running is idempotent; today's (partial) average is simply overwritten.
 */
export async function storeSalesHistory(db: DB, name: string) {
  const since = Date.now() - SALES_HISTORY_DAYS * 86_400_000;
  const days = (await getCsfloat().salesHistory(name)).filter((d) => d.day.getTime() >= since);
  const scope = and(eq(priceSnapshots.marketHashName, name), eq(priceSnapshots.provider, "csfloat_sales"));
  await db.batch([
    db.delete(priceSnapshots).where(scope),
    ...(days.length
      ? [db.insert(priceSnapshots).values(days.map((d) => ({ marketHashName: name, provider: "csfloat_sales" as const, price: d.price, ts: d.day })))]
      : []),
  ]);
}

const STEAM_DONE_KEY = "steam_history:";

/** Item names (held or not) whose Steam history has not been backfilled yet. */
async function pendingSteamBackfill(db: DB): Promise<string[]> {
  const [all, done] = await Promise.all([
    db.selectDistinct({ name: items.marketHashName }).from(items),
    db.select({ key: settings.key }).from(settings).where(like(settings.key, `${STEAM_DONE_KEY}%`)),
  ]);
  const doneSet = new Set(done.map((d) => d.key.slice(STEAM_DONE_KEY.length)));
  return all.map((r) => r.name).filter((n) => !doneSet.has(n));
}

/**
 * Stores Steam's median sale price history (last SALES_HISTORY_DAYS) as `steam` snapshots,
 * before the first live snapshot of each name. One listing page holds every variant of the
 * skin, so all `wanted` names found on it are filled at once. Returns the names handled.
 */
export async function backfillSteamHistory(
  db: DB,
  name: string,
  wanted: string[],
  usdToEurAt: (d: Date) => number,
): Promise<string[]> {
  // null = the page has no history (not marketable, e.g. medals); it is marked done all the same.
  const hist = await steamPriceHistory(name);
  const since = Date.now() - SALES_HISTORY_DAYS * 86_400_000;
  const handled = wanted.filter((n) => n === name || hist?.series.has(n));
  for (const n of handled) {
    const [first] = await db
      .select({ ts: min(priceSnapshots.ts) })
      .from(priceSnapshots)
      .where(and(eq(priceSnapshots.marketHashName, n), eq(priceSnapshots.provider, "steam")));
    const until = first?.ts?.getTime() ?? Infinity;
    const rows = (hist?.series.get(n) ?? [])
      .filter((p) => p.ts.getTime() >= since && p.ts.getTime() < until)
      .map((p) => ({
        marketHashName: n,
        provider: "steam" as const,
        // Steam reports in the requester's currency; snapshots are USD cents.
        price: Math.round((hist?.currency === "EUR" ? p.price / usdToEurAt(p.ts) : p.price) * 100),
        ts: p.ts,
      }));
    const key = STEAM_DONE_KEY + n;
    const value = new Date().toISOString();
    await db.batch([
      db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }),
      ...chunk(rows, 500).map((c) => db.insert(priceSnapshots).values(c)),
    ]);
  }
  return handled;
}

const chunk = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Timestamp of the newest live (non-backfilled) snapshot, or null if prices were never fetched. */
export async function lastPriceUpdate(db: DB): Promise<Date | null> {
  const [row] = await db
    .select({ ts: sql<number | null>`max(${priceSnapshots.ts})` })
    .from(priceSnapshots)
    .where(ne(priceSnapshots.provider, "csfloat_sales"));
  return row?.ts ? new Date(row.ts) : null;
}

/** Starts an update in the background (for API routes); returns immediately. */
export function startPriceUpdate(db: DB, providers?: PriceProvider[]) {
  if (job.running) return getPriceJob();
  void updatePrices(db, providers).catch(() => {});
  return getPriceJob();
}

/** Latest snapshot per market_hash_name for one provider. */
export async function latestPrices(db: DB, provider: PriceProvider) {
  // SQLite returns the `price` of the row that produced max(ts).
  const rows = await db
    .select({
      name: priceSnapshots.marketHashName,
      price: priceSnapshots.price,
      ts: sql<number>`max(${priceSnapshots.ts})`,
    })
    .from(priceSnapshots)
    .where(eq(priceSnapshots.provider, provider))
    .groupBy(priceSnapshots.marketHashName);
  return new Map(rows.map((r) => [r.name, { price: r.price, ts: new Date(r.ts) }]));
}

/** Snapshots since `since` for one provider, grouped by name, oldest first. */
export async function priceSeries(db: DB, provider: PriceProvider, since: Date, name?: string) {
  const rows = await db
    .select({ name: priceSnapshots.marketHashName, price: priceSnapshots.price, ts: priceSnapshots.ts })
    .from(priceSnapshots)
    .where(
      and(
        eq(priceSnapshots.provider, provider),
        gte(priceSnapshots.ts, since),
        name ? eq(priceSnapshots.marketHashName, name) : undefined,
      ),
    )
    .orderBy(priceSnapshots.ts);
  const out = new Map<string, { price: number; ts: Date }[]>();
  for (const r of rows) {
    let list = out.get(r.name);
    if (!list) out.set(r.name, (list = []));
    list.push({ price: r.price, ts: r.ts });
  }
  return out;
}
