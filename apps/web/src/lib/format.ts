// Money formatting lives in ./money.ts (depends on the selected currency).

export const fmtPct = (pct: number | null | undefined) =>
  pct == null ? "—" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;

export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("hr-HR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

export function fmtAgo(d: string | Date | null | undefined) {
  if (!d) return "nikad";
  const min = Math.round((Date.now() - new Date(d).getTime()) / 60_000);
  if (min < 1) return "upravo";
  if (min < 60) return `prije ${min} min`;
  if (min < 48 * 60) return `prije ${Math.round(min / 60)} h`;
  return `prije ${Math.round(min / 1440)} dana`;
}

export const fmtTime = (d: string | Date) => new Date(d).toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" });

export const fmtFloat = (f: number | null | undefined) => (f == null ? "—" : f.toFixed(6));

export const toneOf = (n: number | null | undefined) =>
  n == null || n === 0 ? "text-muted" : n > 0 ? "text-up" : "text-down";

export const SOURCE_LABELS = {
  market: "Tržišna vrijednost",
  csfloat_sales: "CSFloat · prodaje",
  csfloat_listing: "CSFloat · listing",
  csfloat_buyorder: "CSFloat · buy order",
  skinport_sales: "Skinport · prodaje (7d)",
  skinport_listing: "Skinport · listing",
} as const;

/** Where a market value came from (see core/market.ts). */
export const BASIS_LABELS: Record<string, string> = {
  csfloat_sales_7d: "CSFloat prodaje, 7 dana",
  csfloat_sales_30d: "CSFloat prodaje, 30 dana",
  skinport_sales_7d: "Skinport prodaje, 7 dana",
  csfloat_listing: "CSFloat najniži listing",
  skinport_listing: "Skinport najniži listing",
};

export const PLATFORM_LABELS: Record<string, string> = {
  csfloat: "CSFloat",
  skinswap: "Skinswap",
  csmoney: "CS.Money",
  dmarket: "DMarket",
  steam: "Steam",
  other: "Other",
};
