import { fetchJson } from "../http";

const BASE = "https://api.skinport.com/v1";
// Public endpoints, no key. Limit is 8 requests / 5 min and responses are cached for 5 min,
// so one call of each per update is all we ever need. Brotli is mandatory.
const opts = { headers: { "Accept-Encoding": "br" }, minGapMs: 1_000 };

type Stats = { min: number | null; max: number | null; avg: number | null; median: number | null; volume: number };
type SkinportItem = {
  market_hash_name: string;
  version: string | null;
  min_price: number | null;
  median_price: number | null;
  quantity: number;
};
type SkinportSales = {
  market_hash_name: string;
  version: string | null;
  last_24_hours: Stats;
  last_7_days: Stats;
  last_30_days: Stats;
  last_90_days: Stats;
};

export type SkinportListing = { minPrice: number; quantity: number };
export type SkinportSalesStats = { median7d: number | null; volume7d: number; median30d: number | null; volume30d: number };

const cents = (v: number | null | undefined) => (v != null && Number.isFinite(v) && v > 0 ? Math.round(v * 100) : null);

/** Keeps the base entry per name; Doppler phases etc. come as extra rows with a `version`. */
function byName<T extends { market_hash_name: string; version: string | null }>(rows: T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const r of rows) if (!out.has(r.market_hash_name) || r.version == null) out.set(r.market_hash_name, r);
  return out;
}

export function parseSkinportItems(rows: SkinportItem[]): Map<string, SkinportListing> {
  const out = new Map<string, SkinportListing>();
  for (const [name, r] of byName(rows)) {
    const minPrice = cents(r.min_price);
    if (minPrice != null) out.set(name, { minPrice, quantity: r.quantity });
  }
  return out;
}

export function parseSkinportSales(rows: SkinportSales[]): Map<string, SkinportSalesStats> {
  const out = new Map<string, SkinportSalesStats>();
  for (const [name, r] of byName(rows)) {
    out.set(name, {
      median7d: cents(r.last_7_days?.median),
      volume7d: r.last_7_days?.volume ?? 0,
      median30d: cents(r.last_30_days?.median),
      volume30d: r.last_30_days?.volume ?? 0,
    });
  }
  return out;
}

/** Cheapest listing of every CS2 item on Skinport, in USD cents. */
export async function skinportListings(): Promise<Map<string, SkinportListing>> {
  return parseSkinportItems(await fetchJson<SkinportItem[]>(`${BASE}/items?app_id=730&currency=USD&tradable=0`, opts));
}

/** Sale statistics (7/30 days) of every CS2 item on Skinport, in USD cents. */
export async function skinportSales(): Promise<Map<string, SkinportSalesStats>> {
  return parseSkinportSales(await fetchJson<SkinportSales[]>(`${BASE}/sales/history?app_id=730&currency=USD`, opts));
}
