"use client";

import type { InventoryRow, PortfolioSummary, PriceJob } from "@inv/core";
import type { Item, ItemQuote, PriceSource, Transaction } from "@inv/db";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/** Dates arrive as ISO strings over JSON. */
type Json<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Json<U>[]
    : T extends object
      ? { [K in keyof T]: Json<T[K]> }
      : T;

export type InventoryRowJ = Json<InventoryRow>;
export type TransactionJ = Json<Transaction>;
export type ItemJ = Json<Item>;
export type Portfolio = Json<PortfolioSummary>;
export type Status = {
  steamIdSet: boolean;
  csfloatKeySet: boolean;
  /** Active price sources, e.g. ["Skinport", "CSFloat"]. */
  sources: string[];
  itemCount: number;
  transactionCount: number;
  priceJob: PriceJob;
  lastPriceAt: string | null;
  /** Next automatic refresh; null when auto-refresh is off. */
  nextPriceAt: string | null;
};
export type ItemDetail = {
  item: ItemJ;
  transactions: TransactionJ[];
  history: Record<PriceSource, { day: string; price: number; volume: number | null; basis: string | null }[]>;
  /** Cheapest CSFloat listing with a float close to this item's. */
  quote: Json<ItemQuote> | null;
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: init?.body && typeof init.body === "string" && !init.headers ? { "Content-Type": "application/json" } : init?.headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export const useStatus = () =>
  useQuery({
    queryKey: ["status"],
    queryFn: () => api<Status>("/status"),
    // Slow poll while idle so background (scheduled) refreshes show up without a reload.
    refetchInterval: (q) => (q.state.data?.priceJob.running ? 1500 : 30_000),
  });

export const usePortfolio = (opts: { days?: number; ids?: number[] } = {}) => {
  const q = new URLSearchParams({ days: String(opts.days ?? 90) });
  if (opts.ids) q.set("ids", opts.ids.join(","));
  return useQuery({
    queryKey: ["portfolio", opts.days ?? 90, opts.ids?.join(",") ?? null],
    queryFn: () => api<Portfolio>(`/portfolio?${q}`),
    enabled: !opts.ids || opts.ids.length > 0,
    placeholderData: (prev) => prev,
  });
};

export const useInventory = () => useQuery({ queryKey: ["inventory"], queryFn: () => api<InventoryRowJ[]>("/inventory") });

export const useItem = (id: number) =>
  useQuery({ queryKey: ["item", id], queryFn: () => api<ItemDetail>(`/items/${id}`) });

export const useTransactions = () =>
  useQuery({ queryKey: ["transactions"], queryFn: () => api<TransactionJ[]>("/transactions") });

/** Mutation that refreshes all cached data on success. */
export function useAction<TVars = void, TOut = unknown>(fn: (vars: TVars) => Promise<TOut>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries() });
}
