import { fetchJson, fetchText } from "../http";

/** Parses Steam's localized price strings ("$1,234.56", "1.234,56€", "12,--€") into cents. */
export function parseSteamPrice(raw: string | undefined | null): number | null {
  if (!raw) return null;
  let s = raw.replace(/[^\d.,-]/g, "").replace(/-+$/, "").replace(/[.,]$/, "");
  if (!s) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  const decimalSep = lastDot > lastComma ? "." : ",";
  const decimalIdx = Math.max(lastDot, lastComma);
  // A separator followed by exactly 3 digits with no other separator is a thousands separator.
  const isDecimal = decimalIdx !== -1 && s.length - decimalIdx - 1 !== 3;
  if (isDecimal) {
    const thousands = decimalSep === "." ? "," : ".";
    s = s.split(thousands).join("").replace(decimalSep, ".");
  } else {
    s = s.replace(/[.,]/g, "");
  }
  const value = Number.parseFloat(s);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

type PriceOverview = { success: boolean; lowest_price?: string; median_price?: string; volume?: string };

/** Steam Community Market lowest listing in USD cents (falls back to median). */
export async function steamPrice(marketHashName: string): Promise<number | null> {
  const url =
    "https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=" +
    encodeURIComponent(marketHashName);
  const data = await fetchJson<PriceOverview>(url, { minGapMs: 3_500 });
  if (!data.success) return null;
  return parseSteamPrice(data.lowest_price) ?? parseSteamPrice(data.median_price);
}

/** Steam wallet currency ids we can convert (`ecurrency` in market data). */
const STEAM_CURRENCIES: Record<number, "USD" | "EUR"> = { 1: "USD", 3: "EUR" };

export type SteamHistory = {
  currency: "USD" | "EUR";
  /** market_hash_name → daily sale price (major currency units), oldest first. */
  series: Map<string, { ts: Date; price: number }[]>;
};

type SteamPricePoint = { time: number; price_median: number; purchases?: number };
type SsrQuery = { queryKey?: unknown[]; state?: { data?: { ecurrency?: number; prices?: SteamPricePoint[] } } };

/** Collapses Steam's hourly points (last month) into one purchase-weighted price per UTC day. */
export function steamDaily(points: SteamPricePoint[]): { ts: Date; price: number }[] {
  const days = new Map<number, { sum: number; weight: number }>();
  for (const p of points) {
    if (!Number.isFinite(p.price_median) || p.price_median <= 0) continue;
    const day = Math.floor(p.time / 86_400) * 86_400_000;
    const w = Math.max(p.purchases ?? 1, 1);
    const d = days.get(day) ?? { sum: 0, weight: 0 };
    d.sum += p.price_median * w;
    d.weight += w;
    days.set(day, d);
  }
  return [...days]
    .sort(([a], [b]) => a - b)
    .map(([day, d]) => ({ ts: new Date(day), price: d.sum / d.weight }));
}

/**
 * Extracts the price history embedded in a Steam market listing page. One page carries
 * the history of every variant of the skin (all wears, StatTrak, Souvenir), reduced to one
 * point per day. The currency follows the requester's IP.
 */
export function parseSteamHistoryPage(html: string): SteamHistory | null {
  const m = html.match(/<script type="application\/json" id="valve-ssr-data"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  // Nested parts of the SSR payload are sometimes JSON-encoded strings themselves.
  const obj = <T>(v: unknown) => (typeof v === "string" ? JSON.parse(v) : v) as T | undefined;
  const ctx = obj<{ queryData?: unknown }>(obj<{ renderContext?: unknown }>(m[1])?.renderContext);
  const queries = obj<{ queries?: SsrQuery[] }>(ctx?.queryData)?.queries;
  let currency: SteamHistory["currency"] | undefined;
  const series = new Map<string, { ts: Date; price: number }[]>();
  for (const q of queries ?? []) {
    const [scope, kind, , name] = q.queryKey ?? [];
    const data = q.state?.data;
    if (scope !== "market" || kind !== "pricehistory" || typeof name !== "string" || !data?.prices?.length) continue;
    const cur = STEAM_CURRENCIES[data.ecurrency ?? -1];
    if (!cur) throw new Error(`Unsupported Steam currency id ${data.ecurrency}`);
    currency = cur;
    series.set(name, steamDaily(data.prices));
  }
  return currency ? { currency, series } : null;
}

export async function steamPriceHistory(marketHashName: string): Promise<SteamHistory | null> {
  const url = "https://steamcommunity.com/market/listings/730/" + encodeURIComponent(marketHashName);
  const html = await fetchText(url, { minGapMs: 3_500, headers: { "User-Agent": "Mozilla/5.0" } });
  return parseSteamHistoryPage(html);
}
