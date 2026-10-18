"use client";

import type { FxRate } from "@inv/core/currency";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { usePrefs } from "@/components/providers";
import { api } from "./api";

/**
 * Money formatting in the user's display currency. All amounts in the API are
 * USD cents; EUR is converted with the current ECB rate.
 */
export function useMoney() {
  const { currency } = usePrefs();
  const fx = useQuery({
    queryKey: ["fx"],
    queryFn: () => api<FxRate>("/fx"),
    staleTime: 3_600_000,
    enabled: currency === "EUR",
  });
  const rate = currency === "EUR" ? (fx.data?.usdToEur ?? null) : 1;

  return useMemo(() => {
    const nf = new Intl.NumberFormat(currency === "EUR" ? "hr-HR" : "en-US", { style: "currency", currency });
    const symbol = currency === "EUR" ? "€" : "$";
    /** USD cents → amount in display currency (null while the rate loads). */
    const convert = (cents: number | null | undefined) => (cents == null || rate == null ? null : (cents * rate) / 100);

    const fmt = (cents: number | null | undefined) => {
      const v = convert(cents);
      return v == null ? "—" : nf.format(v);
    };
    const fmtSigned = (cents: number | null | undefined) => {
      const v = convert(cents);
      return v == null ? "—" : (v > 0 ? "+" : "") + nf.format(v);
    };
    /** Short axis labels: €950, €1.2k */
    const compact = (cents: number) => {
      const v = convert(cents) ?? 0;
      return v >= 1000 ? `${symbol}${(v / 1000).toFixed(1)}k` : `${symbol}${Math.round(v)}`;
    };
    /** Amount typed in display currency → USD dollars for the API. */
    const toUsd = (amount: number) => (rate ? amount / rate : amount);

    return { currency, rate, fx: fx.data, convert, fmt, fmtSigned, compact, toUsd };
  }, [currency, rate, fx.data]);
}
