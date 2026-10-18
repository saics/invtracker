import { items, priceSnapshots, PRICE_PROVIDERS, type DB, type PriceProvider } from "@inv/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { fetchPrices } from "./providers";

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

/** Fetches prices for every distinct held item name and stores snapshots. */
export async function updatePrices(db: DB, providers: PriceProvider[] = availableProviders()) {
  if (job.running) throw new Error("Price update already running");
  const names = (
    await db.selectDistinct({ name: items.marketHashName }).from(items).where(eq(items.status, "held"))
  ).map((r) => r.name);

  Object.assign(job, {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    done: 0,
    total: names.length,
    current: null,
    errors: [],
  });

  try {
    for (const name of names) {
      job.current = name;
      try {
        const prices = await fetchPrices(name, providers);
        const rows = Object.entries(prices)
          .filter(([, price]) => price != null)
          .map(([provider, price]) => ({ marketHashName: name, provider: provider as PriceProvider, price: price! }));
        if (rows.length) await db.insert(priceSnapshots).values(rows);
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
