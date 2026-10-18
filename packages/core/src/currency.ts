/** Client-safe currency constants (no server imports). */
export const CURRENCIES = ["EUR", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export type FxRate = { usdToEur: number; date: string; stale: boolean };
