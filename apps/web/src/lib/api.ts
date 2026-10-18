"use client";

import type { InventoryRow, PortfolioSummary, PriceJob } from "@inv/core";
import type { Item, PriceProvider, Transaction } from "@inv/db";
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
  providers: PriceProvider[];
  itemCount: number;
  transactionCount: number;
  priceJob: PriceJob;
};
export type ItemDetail = {
  item: ItemJ;
  transactions: TransactionJ[];
  history: Record<PriceProvider, { price: number; ts: string }[]>;
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
    refetchInterval: (q) => (q.state.data?.priceJob.running ? 1500 : false),
  });

export const usePortfolio = (provider: PriceProvider) =>
  useQuery({ queryKey: ["portfolio", provider], queryFn: () => api<Portfolio>(`/portfolio?provider=${provider}`) });

export const useInventory = (provider: PriceProvider) =>
  useQuery({ queryKey: ["inventory", provider], queryFn: () => api<InventoryRowJ[]>(`/inventory?provider=${provider}`) });

export const useItem = (id: number) =>
  useQuery({ queryKey: ["item", id], queryFn: () => api<ItemDetail>(`/items/${id}`) });

export const useTransactions = () =>
  useQuery({ queryKey: ["transactions"], queryFn: () => api<TransactionJ[]>("/transactions") });

/** Mutation that refreshes all cached data on success. */
export function useAction<TVars = void, TOut = unknown>(fn: (vars: TVars) => Promise<TOut>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries() });
}
