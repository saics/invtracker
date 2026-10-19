/**
 * Market value: one price per item and day used for valuation, P&L and charts.
 *
 * Sales beat listings (listings are asks, not what items actually go for), and a weighted
 * median over several days keeps single odd sales (rare float, stickers) from moving it:
 *   1. CSFloat sales, last 7 days (>= MIN_SALES sales), else last 30 days
 *   2. Skinport 7-day median sale price
 *   3. CSFloat cheapest listing
 *   4. Skinport cheapest listing
 * Observations of sources 2-4 are used for up to STALE_DAYS after they were taken.
 */

export type MarketBasis = "csfloat_sales_7d" | "csfloat_sales_30d" | "skinport_sales_7d" | "csfloat_listing" | "skinport_listing";

export type DayPoint = { day: string; price: number; volume?: number | null };

export type MarketInputs = {
  csfloatSales: DayPoint[];
  skinportSales: DayPoint[];
  csfloatListing: DayPoint[];
  skinportListing: DayPoint[];
};

export type MarketPoint = { day: string; price: number; basis: MarketBasis };

const MIN_SALES = 3;
const STALE_DAYS = 3;
const DAY = 86_400_000;

export const dayKey = (d: Date | number) => new Date(d).toISOString().slice(0, 10);
const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** Median where each value counts `weight` times. */
export function weightedMedian(points: { price: number; weight: number }[]): number | null {
  const pts = points.filter((p) => p.weight > 0).sort((a, b) => a.price - b.price);
  const total = pts.reduce((s, p) => s + p.weight, 0);
  if (!total) return null;
  let acc = 0;
  for (const p of pts) {
    acc += p.weight;
    if (acc >= total / 2) return p.price;
  }
  return pts.at(-1)!.price;
}

function salesValue(sales: Map<number, DayPoint>, day: number, days: number): number | null {
  const pts: { price: number; weight: number }[] = [];
  for (let d = day - (days - 1) * DAY; d <= day; d += DAY) {
    const p = sales.get(d);
    if (p) pts.push({ price: p.price, weight: p.volume ?? 1 });
  }
  if (pts.reduce((s, p) => s + p.weight, 0) < MIN_SALES) return null;
  return weightedMedian(pts);
}

/** Latest observation at or before `day`, if it is at most STALE_DAYS old. */
function recent(points: Map<number, DayPoint>, day: number, minVolume = 0): DayPoint | null {
  for (let d = day; d >= day - STALE_DAYS * DAY; d -= DAY) {
    const p = points.get(d);
    if (p && (p.volume ?? 1) >= minVolume) return p;
  }
  return null;
}

/** Market value for every day from the first observation up to `until` (inclusive). */
export function computeMarketSeries(inputs: MarketInputs, until: string): MarketPoint[] {
  const index = (pts: DayPoint[]) => new Map(pts.map((p) => [dayMs(p.day), p]));
  const cfSales = index(inputs.csfloatSales);
  const spSales = index(inputs.skinportSales);
  const cfList = index(inputs.csfloatListing);
  const spList = index(inputs.skinportListing);

  const all = [...cfSales.keys(), ...spSales.keys(), ...cfList.keys(), ...spList.keys()];
  if (!all.length) return [];
  const out: MarketPoint[] = [];
  for (let d = Math.min(...all); d <= dayMs(until); d += DAY) {
    const day = dayKey(d);
    let v: number | null;
    let p: DayPoint | null;
    if ((v = salesValue(cfSales, d, 7)) != null) out.push({ day, price: v, basis: "csfloat_sales_7d" });
    else if ((v = salesValue(cfSales, d, 30)) != null) out.push({ day, price: v, basis: "csfloat_sales_30d" });
    else if ((p = recent(spSales, d, 1))) out.push({ day, price: p.price, basis: "skinport_sales_7d" });
    else if ((p = recent(cfList, d))) out.push({ day, price: p.price, basis: "csfloat_listing" });
    else if ((p = recent(spList, d))) out.push({ day, price: p.price, basis: "skinport_listing" });
  }
  return out;
}
