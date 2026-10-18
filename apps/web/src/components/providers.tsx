"use client";

import type { PriceProvider } from "@inv/db";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const KEY = "inv.provider";
const ProviderCtx = createContext<{ provider: PriceProvider; setProvider: (p: PriceProvider) => void }>({
  provider: "csfloat_listing",
  setProvider: () => {},
});

export const usePriceProvider = () => useContext(ProviderCtx);

export function AppProviders({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } }));
  const [provider, setProviderState] = useState<PriceProvider>("csfloat_listing");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY) as PriceProvider | null;
      if (saved) setProviderState(saved);
    } catch {}
  }, []);

  const setProvider = (p: PriceProvider) => {
    setProviderState(p);
    try {
      localStorage.setItem(KEY, p);
    } catch {}
  };

  return (
    <QueryClientProvider client={qc}>
      <ProviderCtx.Provider value={{ provider, setProvider }}>{children}</ProviderCtx.Provider>
    </QueryClientProvider>
  );
}
