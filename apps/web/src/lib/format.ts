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

export const PROVIDER_LABELS = {
  csfloat_listing: "CSFloat · listing",
  csfloat_buyorder: "CSFloat · buy order",
  csfloat_sales: "CSFloat · prodaje (dnevno)",
  steam: "Steam Market",
} as const;

export const PLATFORM_LABELS: Record<string, string> = {
  csfloat: "CSFloat",
  skinswap: "Skinswap",
  csmoney: "CS.Money",
  dmarket: "DMarket",
  steam: "Steam",
  other: "Other",
};
