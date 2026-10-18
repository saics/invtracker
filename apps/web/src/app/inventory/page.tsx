"use client";

import { ArrowDownUp } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Sparkline } from "@/components/charts";
import { usePriceProvider } from "@/components/providers";
import { Badge, Card, cn, Empty, ErrorText, Input } from "@/components/ui";
import { useInventory, type InventoryRowJ } from "@/lib/api";
import { fmtDate, fmtPct, PLATFORM_LABELS, toneOf } from "@/lib/format";
import { useMoney } from "@/lib/money";

const TABS = [
  { key: "held", label: "U inventoryju" },
  { key: "sold", label: "Prodano" },
  { key: "gone", label: "Otišlo" },
  { key: "all", label: "Sve" },
] as const;

type SortKey = "price" | "pnl" | "pnlPct" | "change7dPct" | "name" | "bought";

const sorters: Record<SortKey, (r: InventoryRowJ) => number | string | null> = {
  price: (r) => r.price ?? r.proceeds,
  pnl: (r) => r.pnl,
  pnlPct: (r) => r.pnlPct,
  change7dPct: (r) => r.change7dPct,
  name: (r) => r.marketHashName,
  bought: (r) => r.buy?.date ?? null,
};

export default function InventoryPage() {
  const { provider } = usePriceProvider();
  const { data, error, isLoading } = useInventory(provider);
  const money = useMoney();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("held");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "price", dir: -1 });

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (data ?? []).filter(
      (r) => (tab === "all" || r.status === tab) && (!needle || r.marketHashName.toLowerCase().includes(needle)),
    );
    const get = sorters[sort.key];
    return list.sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
  }, [data, tab, q, sort]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data?.length ?? 0 };
    for (const r of data ?? []) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [data]);

  const th = (key: SortKey, label: string, className?: string) => (
    <th className={cn("px-3 py-2 font-normal", className)}>
      <button
        className={cn("inline-flex items-center gap-1 hover:text-fg", sort.key === key && "text-fg")}
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : -1 }))}
      >
        {label}
        <ArrowDownUp size={11} className="opacity-50" />
      </button>
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-line bg-panel p-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn("rounded-md px-3 py-1 text-sm", tab === t.key ? "bg-panel-2 text-fg" : "text-muted hover:text-fg")}
            >
              {t.label} <span className="text-muted">{counts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <Input placeholder="Traži…" value={q} onChange={(e) => setQ(e.target.value)} className="ml-auto w-64" />
      </div>
      <ErrorText error={error} />

      <Card className="overflow-x-auto">
        {isLoading ? (
          <Empty>Učitavam…</Empty>
        ) : !rows.length ? (
          <Empty>Nema itema.</Empty>
        ) : (
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                {th("name", "Item", "pl-5")}
                <th className="px-3 py-2 font-normal">Float</th>
                {th("bought", "Kupljeno")}
                {th("price", tab === "sold" ? "Prodano" : "Cijena", "text-right")}
                {th("pnl", "P&L", "text-right")}
                {th("change7dPct", "7d", "text-right")}
                <th className="px-3 py-2 pr-5 text-right font-normal">30d</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-panel-2/60">
                  <td className="py-2 pr-3 pl-5">
                    <Link href={`/items/${r.id}`} className="flex items-center gap-3">
                      <div className="h-9 w-12 shrink-0 rounded border-b-2 bg-panel-2" style={{ borderColor: r.rarityColor ?? "transparent" }}>
                        {r.iconUrl && <img src={r.iconUrl} alt="" className="h-full w-full object-contain" loading="lazy" />}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate hover:underline">{r.marketHashName}</div>
                        <div className="flex gap-1">
                          {r.status !== "held" && <Badge>{r.status === "sold" ? "prodano" : "otišlo"}</Badge>}
                          {r.stickers?.length ? <Badge>{r.stickers.length} stickera</Badge> : null}
                          {r.tradable === false && r.status === "held" && <Badge>trade lock</Badge>}
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-3 font-mono text-xs text-muted">{r.floatValue?.toFixed(5) ?? "—"}</td>
                  <td className="px-3">
                    {r.buy ? (
                      <div>
                        <span className="tabular-nums">{money.fmt(r.cost)}</span>
                        <div className="text-xs text-muted">
                          {PLATFORM_LABELS[r.buy.platform]} · {fmtDate(r.buy.date)}
                        </div>
                      </div>
                    ) : (
                      <Link href={`/transactions?name=${encodeURIComponent(r.marketHashName)}&itemId=${r.id}`} className="text-xs text-muted hover:text-accent">
                        + dodaj kupnju
                      </Link>
                    )}
                  </td>
                  <td className="px-3 text-right tabular-nums">{money.fmt(r.status === "sold" ? r.proceeds : r.price)}</td>
                  <td className={cn("px-3 text-right tabular-nums", toneOf(r.pnl))}>
                    {money.fmtSigned(r.pnl)}
                    <div className="text-xs">{fmtPct(r.pnlPct)}</div>
                  </td>
                  <td className={cn("px-3 text-right tabular-nums", toneOf(r.change7dPct))}>{fmtPct(r.change7dPct)}</td>
                  <td className="py-2 pr-5 pl-3 text-right">
                    <Sparkline values={r.spark} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
