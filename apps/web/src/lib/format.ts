const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export const fmtUsd = (cents: number | null | undefined) => (cents == null ? "—" : usd.format(cents / 100));

export const fmtSignedUsd = (cents: number | null | undefined) =>
  cents == null ? "—" : (cents > 0 ? "+" : "") + usd.format(cents / 100);

export const fmtPct = (pct: number | null | undefined) =>
  pct == null ? "—" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;

export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("hr-HR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

export const fmtFloat = (f: number | null | undefined) => (f == null ? "—" : f.toFixed(6));

export const toneOf = (n: number | null | undefined) =>
  n == null || n === 0 ? "text-muted" : n > 0 ? "text-up" : "text-down";

export const PROVIDER_LABELS = {
  csfloat_listing: "CSFloat · listing",
  csfloat_buyorder: "CSFloat · buy order",
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
