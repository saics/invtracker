"use client";

import { CURRENCIES, type Currency } from "@inv/core/currency";
import { PRICE_PROVIDERS, type PriceProvider } from "@inv/db/schema";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Download } from "lucide-react";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api, useAction, useStatus } from "@/lib/api";
import { PROVIDER_LABELS } from "@/lib/format";
import { usePrefs } from "./providers";
import { Button, cn, Select } from "./ui";

const NAV = [
  { href: "/", label: "Pregled" },
  { href: "/inventory", label: "Inventory" },
  { href: "/transactions", label: "Transakcije" },
  { href: "/settings", label: "Postavke" },
];

export function Header() {
  const path = usePathname();
  const { provider, setProvider, currency, setCurrency } = usePrefs();
  const status = useStatus();
  const job = status.data?.priceJob;

  // When a background price update finishes, refetch everything.
  const qc = useQueryClient();
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !job?.running) void qc.invalidateQueries();
    wasRunning.current = !!job?.running;
  }, [job?.running, qc]);

  const sync = useAction(() => api("/inventory/sync", { method: "POST" }));
  const refresh = useAction(() => api("/prices/refresh", { method: "POST" }));

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="font-semibold tracking-tight">
          InvTracker
        </Link>
        <nav className="flex gap-1 text-sm">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn("rounded-md px-2.5 py-1", active ? "bg-panel-2 text-fg" : "text-muted hover:text-fg")}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} aria-label="Valuta">
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select value={provider} onChange={(e) => setProvider(e.target.value as PriceProvider)} aria-label="Izvor cijena">
            {PRICE_PROVIDERS.map((p) => (
              <option key={p} value={p} disabled={status.data && !status.data.providers.includes(p)}>
                {PROVIDER_LABELS[p]}
              </option>
            ))}
          </Select>
          <Button onClick={() => sync.mutate()} disabled={sync.isPending} title="Povuci inventory sa Steama">
            <Download size={14} className={cn(sync.isPending && "animate-pulse")} />
            Sync
          </Button>
          <Button
            variant="primary"
            onClick={() => refresh.mutate(undefined, { onSuccess: () => status.refetch() })}
            disabled={refresh.isPending || job?.running}
            title="Osvježi cijene svih itema"
          >
            <RefreshCw size={14} className={cn(job?.running && "animate-spin")} />
            {job?.running ? `${job.done}/${job.total}` : "Cijene"}
          </Button>
        </div>
      </div>
      {(sync.error || refresh.error) && (
        <div className="mx-auto max-w-7xl px-4 pb-2 text-xs text-down sm:px-6">
          {(sync.error ?? refresh.error)?.message}
        </div>
      )}
    </header>
  );
}
