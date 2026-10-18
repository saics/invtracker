"use client";

import { PLATFORMS } from "@inv/db/schema";
import { Pencil, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useRef, useState } from "react";
import { TxForm } from "@/components/tx-form";
import { Badge, Button, Card, CardHeader, cn, Empty, ErrorText, Select } from "@/components/ui";
import { api, useAction, useStatus, useTransactions } from "@/lib/api";
import { fmtDate, PLATFORM_LABELS } from "@/lib/format";
import { useMoney } from "@/lib/money";

type ImportResult = Record<string, unknown> & { errors?: { line: number; error: string }[] };

function TransactionsInner() {
  const params = useSearchParams();
  const prefillName = params.get("name") ?? undefined;
  const prefillItem = params.get("itemId") ? Number(params.get("itemId")) : undefined;

  const { data, error, isLoading } = useTransactions();
  const money = useMoney();
  const status = useStatus().data;
  const [platform, setPlatform] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const importCsfloat = useAction(() => api<ImportResult>("/transactions/import/csfloat", { method: "POST" }));
  const importCsv = useAction((text: string) =>
    api<ImportResult>("/transactions/import/csv", { method: "POST", body: text, headers: { "Content-Type": "text/csv" } }),
  );
  const remove = useAction((id: number) => api(`/transactions/${id}`, { method: "DELETE" }));

  const rows = useMemo(() => (data ?? []).filter((t) => !platform || t.platform === platform), [data, platform]);
  const totals = useMemo(() => {
    let bought = 0;
    let sold = 0;
    for (const t of rows) t.type === "buy" ? (bought += t.price + t.fee) : (sold += t.price - t.fee);
    return { bought, sold };
  }, [rows]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Nova transakcija"
          right={
            <div className="flex gap-2">
              <Button
                onClick={() => importCsfloat.mutate(undefined, { onSuccess: setResult })}
                disabled={importCsfloat.isPending || !status?.csfloatKeySet}
                title={status?.csfloatKeySet ? "Uvezi kupnje i prodaje s CSFloata" : "Postavi CSFLOAT_API_KEY u .env"}
              >
                {importCsfloat.isPending ? "Uvozim…" : "Uvezi s CSFloata"}
              </Button>
              <Button onClick={() => fileRef.current?.click()} disabled={importCsv.isPending}>
                <Upload size={14} /> CSV
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) importCsv.mutate(await file.text(), { onSuccess: setResult });
                }}
              />
            </div>
          }
        />
        <div className="px-5 pb-5">
          <TxForm key={prefillName ?? "new"} initial={{ marketHashName: prefillName, itemId: prefillItem }} />
          <ErrorText error={importCsfloat.error ?? importCsv.error} />
          {result && (
            <div className="mt-3 rounded-lg bg-panel-2 px-3 py-2 text-xs text-muted">
              Uvoz:{" "}
              {Object.entries(result)
                .filter(([k]) => k !== "errors")
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ")}
              {result.errors?.map((e) => (
                <div key={e.line} className="text-down">
                  red {e.line}: {e.error}
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-muted">
            CSV format: <code className="text-fg/80">date,type,platform,market_hash_name,price,fee,float,note</code> — platforme:{" "}
            {PLATFORMS.join(", ")}; cijene u USD.
          </p>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <CardHeader
          title={`Transakcije · kupljeno ${money.fmt(totals.bought)} · prodano ${money.fmt(totals.sold)}`}
          right={
            <Select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="">Sve platforme</option>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                </option>
              ))}
            </Select>
          }
        />
        <ErrorText error={error ?? remove.error} />
        {isLoading ? (
          <Empty>Učitavam…</Empty>
        ) : !rows.length ? (
          <Empty>Nema transakcija.</Empty>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-y border-line text-left text-xs text-muted">
              <tr>
                <th className="py-2 pl-5 font-normal">Datum</th>
                <th className="px-3 font-normal">Item</th>
                <th className="px-3 font-normal">Platforma</th>
                <th className="px-3 text-right font-normal">Cijena</th>
                <th className="px-3 text-right font-normal">Fee</th>
                <th className="pr-5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((t) =>
                editing === t.id ? (
                  <tr key={t.id}>
                    <td colSpan={6} className="bg-panel-2/50 px-5 py-4">
                      <TxForm initial={t} onDone={() => setEditing(null)} />
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id} className="group hover:bg-panel-2/60">
                    <td className="py-2 pl-5 text-muted tabular-nums">{fmtDate(t.date)}</td>
                    <td className="px-3">
                      <div className="flex items-center gap-2">
                        <Badge className={cn(t.type === "buy" ? "text-accent" : "text-up")}>{t.type === "buy" ? "kupnja" : "prodaja"}</Badge>
                        {t.itemId ? (
                          <Link href={`/items/${t.itemId}`} className="truncate hover:underline">
                            {t.marketHashName}
                          </Link>
                        ) : (
                          <span className="truncate">{t.marketHashName}</span>
                        )}
                      </div>
                      {t.note && <div className="text-xs text-muted">{t.note}</div>}
                    </td>
                    <td className="px-3 text-muted">{PLATFORM_LABELS[t.platform]}</td>
                    <td className="px-3 text-right tabular-nums">{money.fmt(t.price)}</td>
                    <td className="px-3 text-right text-muted tabular-nums">{t.fee ? money.fmt(t.fee) : "—"}</td>
                    <td className="pr-5 text-right whitespace-nowrap opacity-0 group-hover:opacity-100">
                      <Button variant="ghost" onClick={() => setEditing(t.id)} aria-label="Uredi">
                        <Pencil size={13} />
                      </Button>
                      <Button
                        variant="danger"
                        aria-label="Obriši"
                        onClick={() => confirm(`Obrisati transakciju za ${t.marketHashName}?`) && remove.mutate(t.id)}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense>
      <TransactionsInner />
    </Suspense>
  );
}
