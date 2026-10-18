"use client";

import type { PriceProvider } from "@inv/db/schema";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { PriceHistoryChart, PROVIDER_COLORS } from "@/components/charts";
import { TxForm } from "@/components/tx-form";
import { Badge, Card, CardHeader, Empty, ErrorText, Stat } from "@/components/ui";
import { useItem } from "@/lib/api";
import { fmtDate, fmtFloat, fmtPct, fmtSignedUsd, fmtUsd, PLATFORM_LABELS, PROVIDER_LABELS, toneOf } from "@/lib/format";

export default function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number(use(params).id);
  const { data, error, isLoading } = useItem(id);

  if (isLoading) return <Empty>Učitavam…</Empty>;
  if (!data) return <ErrorText error={error ?? "Item nije pronađen"} />;

  const { item, transactions, history } = data;
  const buy = transactions.find((t) => t.type === "buy");
  const sell = transactions.find((t) => t.type === "sell");
  const cost = buy ? buy.price + buy.fee : null;
  const latest = (p: PriceProvider) => history[p].at(-1)?.price ?? null;
  const providers = Object.keys(PROVIDER_LABELS) as PriceProvider[];

  return (
    <div className="space-y-6">
      <Link href="/inventory" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft size={14} /> Inventory
      </Link>

      <div className="flex flex-wrap items-center gap-5">
        <div className="h-24 w-32 rounded-xl border-b-4 bg-panel" style={{ borderColor: item.rarityColor ?? "transparent" }}>
          {item.iconUrl && <img src={item.iconUrl} alt="" className="h-full w-full object-contain p-2" />}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{item.marketHashName}</h1>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {item.rarity && <Badge>{item.rarity}</Badge>}
            <Badge>{item.status === "held" ? "u inventoryju" : item.status === "sold" ? "prodano" : "otišlo"}</Badge>
            {item.floatValue != null && <Badge>float {fmtFloat(item.floatValue)}</Badge>}
            {item.inspectLink && (
              <a href={item.inspectLink} className="text-xs text-accent hover:underline">
                Inspect u igri
              </a>
            )}
          </div>
          {!!item.stickers?.length && <div className="mt-1.5 text-xs text-muted">Stickeri: {item.stickers.join(" · ")}</div>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Kupljeno" value={fmtUsd(cost)} sub={buy ? `${PLATFORM_LABELS[buy.platform]} · ${fmtDate(buy.date)}` : "nema zapisa"} />
        {providers.map((p) => {
          const price = latest(p);
          const pnl = cost != null && price != null ? price - cost : null;
          return (
            <Stat
              key={p}
              label={PROVIDER_LABELS[p]}
              value={fmtUsd(price)}
              sub={pnl != null ? <span className={toneOf(pnl)}>{`${fmtSignedUsd(pnl)} (${fmtPct((pnl / cost!) * 100)})`}</span> : undefined}
            />
          );
        })}
      </div>
      {sell && (
        <p className={`text-sm ${toneOf(cost != null ? sell.price - sell.fee - cost : null)}`}>
          Prodano {fmtDate(sell.date)} na {PLATFORM_LABELS[sell.platform]} za {fmtUsd(sell.price)} (neto {fmtUsd(sell.price - sell.fee)})
          {cost != null && ` · P&L ${fmtSignedUsd(sell.price - sell.fee - cost)}`}
        </p>
      )}

      <Card>
        <CardHeader
          title="Povijest cijena"
          right={
            <div className="flex gap-3 text-xs text-muted">
              {providers.map((p) => (
                <span key={p} className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: PROVIDER_COLORS[p] }} />
                  {PROVIDER_LABELS[p]}
                </span>
              ))}
            </div>
          }
        />
        <div className="px-2 pb-3">
          {providers.some((p) => history[p].length) ? (
            <PriceHistoryChart history={history} labels={PROVIDER_LABELS} buyPrice={cost} />
          ) : (
            <Empty>Još nema snimaka cijena za ovaj item.</Empty>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Transakcije" />
        {transactions.length ? (
          <ul className="divide-y divide-line border-t border-line text-sm">
            {transactions.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-2.5">
                <Badge>{t.type === "buy" ? "kupnja" : "prodaja"}</Badge>
                <span className="text-muted">{fmtDate(t.date)}</span>
                <span>{PLATFORM_LABELS[t.platform]}</span>
                <span className="ml-auto tabular-nums">{fmtUsd(t.price)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="border-t border-line px-5 py-4">
            <TxForm initial={{ marketHashName: item.marketHashName, itemId: item.id, floatValue: item.floatValue }} />
          </div>
        )}
      </Card>
    </div>
  );
}
