"use client";

import type { ItemSticker, PriceProvider } from "@inv/db/schema";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import { CHART_RANGES, PriceHistoryChart, PROVIDER_COLORS, type ChartMode } from "@/components/charts";
import { TxForm } from "@/components/tx-form";
import { Badge, Card, CardHeader, Empty, ErrorText, Segmented, Stat } from "@/components/ui";
import { useItem } from "@/lib/api";
import { fmtDate, fmtFloat, fmtPct, PLATFORM_LABELS, PROVIDER_LABELS, toneOf } from "@/lib/format";
import { useMoney } from "@/lib/money";

const KIND_LABELS: Record<ItemSticker["kind"], string> = { sticker: "Sticker", patch: "Patch", charm: "Charm" };

function scrapeLabel(s: ItemSticker) {
  if (s.kind === "charm") return s.pattern != null ? `pattern ${s.pattern}` : null;
  if (s.wear == null) return "scrape nepoznat";
  const pct = Math.round(s.wear * 100);
  return pct === 0 ? "bez scrapea" : `scrape ${pct}%`;
}

/** One row of small sticker/charm icons; hovering an icon shows its name and scrape. */
function StickerRow({ stickers }: { stickers: (ItemSticker | string)[] }) {
  // Items synced before sticker details existed only have names.
  const list = stickers.map((s): ItemSticker => (typeof s === "string" ? { kind: "sticker", name: s } : s));
  return (
    <ul className="mt-2 flex flex-wrap items-start gap-1.5">
      {list.map((s, i) => {
        const label = scrapeLabel(s);
        const pct = s.kind !== "charm" && s.wear ? Math.round(s.wear * 100) : 0;
        return (
          <li key={i} className="group relative flex flex-col items-center">
            {s.image ? (
              <img
                src={s.image}
                alt={s.name}
                className="h-8 w-10 object-contain"
                style={{ opacity: s.wear != null ? 1 - s.wear * 0.6 : 1 }}
                loading="lazy"
              />
            ) : (
              <Badge>{s.name}</Badge>
            )}
            {pct > 0 && <span className="text-[10px] leading-none text-down tabular-nums">{pct}%</span>}
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-panel-2 px-2 py-1 text-xs shadow-lg group-hover:block">
              <div>{s.name}</div>
              <div className="text-muted">
                {KIND_LABELS[s.kind]}
                {label && ` · ${label}`}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number(use(params).id);
  const { data, error, isLoading } = useItem(id);
  const money = useMoney();
  const [mode, setMode] = useState<ChartMode>("value");
  const [days, setDays] = useState<number>(90);

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
            {item.paintSeed != null && <Badge>pattern {item.paintSeed}</Badge>}
            {item.inspectLink && (
              <a href={item.inspectLink} className="text-xs text-accent hover:underline">
                Inspect u igri
              </a>
            )}
          </div>
          {!!item.stickers?.length && <StickerRow stickers={item.stickers} />}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Kupljeno" value={money.fmt(cost)} sub={buy ? `${PLATFORM_LABELS[buy.platform]} · ${fmtDate(buy.date)}` : "nema zapisa"} />
        {providers.map((p) => {
          const price = latest(p);
          const pnl = cost != null && price != null ? price - cost : null;
          return (
            <Stat
              key={p}
              label={PROVIDER_LABELS[p]}
              value={money.fmt(price)}
              sub={pnl != null ? <span className={toneOf(pnl)}>{`${money.fmtSigned(pnl)} (${fmtPct((pnl / cost!) * 100)})`}</span> : undefined}
            />
          );
        })}
      </div>
      {sell && (
        <p className={`text-sm ${toneOf(cost != null ? sell.price - sell.fee - cost : null)}`}>
          Prodano {fmtDate(sell.date)} na {PLATFORM_LABELS[sell.platform]} za {money.fmt(sell.price)} (neto {money.fmt(sell.price - sell.fee)})
          {cost != null && ` · P&L ${money.fmtSigned(sell.price - sell.fee - cost)}`}
        </p>
      )}

      <Card>
        <CardHeader
          title="Povijest cijena"
          right={
            <div className="flex flex-wrap items-center gap-2">
              {cost != null && (
                <Segmented
                  options={[
                    { value: "value", label: "Cijena" },
                    { value: "pnl", label: "P&L" },
                  ]}
                  value={mode}
                  onChange={setMode}
                />
              )}
              <Segmented options={CHART_RANGES} value={days} onChange={setDays} />
            </div>
          }
        />
        <div className="flex flex-wrap gap-3 px-5 text-xs text-muted">
          {providers
            .filter((p) => history[p].length)
            .map((p) => (
              <span key={p} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: PROVIDER_COLORS[p] }} />
                {PROVIDER_LABELS[p]}
              </span>
            ))}
        </div>
        <div className="px-2 pb-3">
          {providers.some((p) => history[p].length) ? (
            <PriceHistoryChart
              history={history}
              labels={PROVIDER_LABELS}
              cost={cost}
              buyAt={buy?.date}
              sellAt={sell?.date}
              mode={mode}
              sinceMs={Date.now() - days * 86_400_000}
            />
          ) : (
            <Empty>Još nema snimaka cijena za ovaj item.</Empty>
          )}
          {cost == null && <p className="px-3 text-xs text-muted">Dodaj kupnju da vidiš P&L na grafu.</p>}
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
                <span className="ml-auto tabular-nums">{money.fmt(t.price)}</span>
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
