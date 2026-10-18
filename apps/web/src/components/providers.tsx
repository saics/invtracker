"use client";

import type { Currency } from "@inv/core/currency";
import type { PriceProvider } from "@inv/db/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/** A preference persisted in localStorage (falls back to the default if storage is unavailable). */
function useStoredPref<T extends string>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key) as T | null;
      if (saved) setValue(saved);
    } catch {}
  }, [key]);
  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(key, v);
    } catch {}
  };
  return [value, set];
}

type Prefs = {
  provider: PriceProvider;
  setProvider: (p: PriceProvider) => void;
  currency: Currency;
  setCurrency: (c: Currency) => void;
};

const PrefsCtx = createContext<Prefs>({
  provider: "csfloat_listing",
  setProvider: () => {},
  currency: "EUR",
  setCurrency: () => {},
});

export const usePrefs = () => useContext(PrefsCtx);
export const usePriceProvider = usePrefs;

export function AppProviders({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } }));
  const [provider, setProvider] = useStoredPref<PriceProvider>("inv.provider", "csfloat_listing");
  const [currency, setCurrency] = useStoredPref<Currency>("inv.currency", "EUR");

  return (
    <QueryClientProvider client={qc}>
      <PrefsCtx.Provider value={{ provider, setProvider, currency, setCurrency }}>{children}</PrefsCtx.Provider>
    </QueryClientProvider>
  );
}
