"use client";

import Link from "next/link";
import { useState } from "react";
import { CHART_RANGES, PortfolioChart, type ChartMode } from "@/components/charts";
import { usePriceProvider } from "@/components/providers";
import { Card, CardHeader, Empty, ErrorText, Segmented, Stat } from "@/components/ui";
import { usePortfolio, useStatus } from "@/lib/api";
import { fmtPct, PROVIDER_LABELS, toneOf } from "@/lib/format";
import { useMoney } from "@/lib/money";

export default function Dashboard() {
  const { provider } = usePriceProvider();
  const [days, setDays] = useState(90);
  const { data: p, error, isLoading } = usePortfolio(provider, { days });
  const status = useStatus().data;
  const money = useMoney();
  const [mode, setMode] = useState<ChartMode>("value");

  if (status && status.itemCount === 0) {
    return (
      <Card>
        <Empty>
          Još nema itema. Postavi <code>STEAM_ID</code> u <code>.env</code> i klikni <b>Sync</b>, zatim <b>Cijene</b>.{" "}
          <Link href="/settings" className="text-accent hover:underline">
            Postavke →
          </Link>
        </Empty>
      </Card>
    );
  }

  const unrealPct = p && p.invested ? (p.unrealized / p.invested) * 100 : null;

  return (
    <div className="space-y-6">
      <ErrorText error={error} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Vrijednost inventoryja"
          value={isLoading ? "…" : money.fmt(p?.value)}
          sub={p && `${p.pricedCount}/${p.heldCount} itema s cijenom · ${PROVIDER_LABELS[provider]}`}
        />
        <Stat
          label="Uloženo (držim)"
          value={isLoading ? "…" : money.fmt(p?.invested)}
          sub={p?.untrackedCostCount ? `${p.untrackedCostCount} itema bez kupovne cijene` : "svi itemi imaju kupovnu cijenu"}
        />
        <Stat label="Nerealizirani P&L" value={money.fmtSigned(p?.unrealized)} sub={fmtPct(unrealPct)} tone={toneOf(p?.unrealized)} />
        <Stat label="Realizirani P&L" value={money.fmtSigned(p?.realized)} sub="prodani itemi, neto od fee-a" tone={toneOf(p?.realized)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={mode === "pnl" ? "P&L kroz vrijeme" : "Vrijednost kroz vrijeme"}
            right={
              <div className="flex flex-wrap items-center gap-2">
                <Segmented
                  options={[
                    { value: "value", label: "Vrijednost" },
                    { value: "pnl", label: "P&L" },
                  ]}
                  value={mode}
                  onChange={setMode}
                />
                <Segmented options={CHART_RANGES} value={days} onChange={setDays} />
              </div>
            }
          />
          <div className="px-2 pb-3">
            {p?.history.length ? (
              <PortfolioChart data={p.history} mode={mode} />
            ) : (
              <Empty>Nema povijesti cijena za ovaj izvor. Pričekaj prvo automatsko osvježavanje ili odaberi „CSFloat · prodaje“ za povijest unazad.</Empty>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Najveći pomaci (7d)" />
          {p?.movers.length ? (
            <ul className="divide-y divide-line">
              {p.movers.map((m) => (
                <li key={m.id}>
                  <Link href={`/items/${m.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-panel-2">
                    {m.iconUrl && <img src={m.iconUrl} alt="" className="h-8 w-11 object-contain" />}
                    <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                    <span className={`text-sm tabular-nums ${toneOf(m.change7dPct)}`}>{fmtPct(m.change7dPct)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Treba barem dva snimka cijena.</Empty>
          )}
        </Card>
      </div>
    </div>
  );
}
