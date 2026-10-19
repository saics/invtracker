import { settings, type DB } from "@inv/db";
import { eq } from "drizzle-orm";
import type { FxRate } from "./currency";
import { fetchJson } from "./http";

export * from "./currency";

const KEY = "fx.usd_eur";
const TTL_MS = 6 * 3_600_000;

const g = globalThis as { __invFx?: FxRate & { fetchedAt: number } };

/**
 * USD→EUR rate (ECB reference rate via frankfurter.dev). Cached in memory for
 * 6 h and persisted in `settings` so the app still converts when offline.
 */
export async function getUsdEurRate(db: DB): Promise<FxRate> {
  if (g.__invFx && Date.now() - g.__invFx.fetchedAt < TTL_MS) {
    const { fetchedAt: _, ...rate } = g.__invFx;
    return rate;
  }
  try {
    const res = await fetchJson<{ date: string; rates: { EUR?: number } }>(
      "https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR",
      { retries: 1 },
    );
    if (!res.rates.EUR) throw new Error("No EUR rate in response");
    const rate = { usdToEur: res.rates.EUR, date: res.date, stale: false };
    g.__invFx = { ...rate, fetchedAt: Date.now() };
    await db
      .insert(settings)
      .values({ key: KEY, value: JSON.stringify(rate) })
      .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(rate) } });
    return rate;
  } catch (e) {
    const [row] = await db.select().from(settings).where(eq(settings.key, KEY));
    if (row) return { ...(JSON.parse(row.value) as FxRate), stale: true };
    throw e;
  }
}

