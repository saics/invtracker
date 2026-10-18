import { fetchJson } from "../http";

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
