"use client";

import { PLATFORMS, TX_TYPES } from "@inv/db/schema";
import { useState, type FormEvent } from "react";
import { api, useAction, type TransactionJ } from "@/lib/api";
import { PLATFORM_LABELS } from "@/lib/format";
import { useMoney } from "@/lib/money";
import { Button, ErrorText, Input, Label, Select } from "./ui";

type Initial = Partial<TransactionJ> & { marketHashName?: string };

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Create (no `initial.id`) or edit a transaction. Amounts are typed in the
 * display currency and stored as USD (EUR converted at the current rate).
 */
export function TxForm({ initial, onDone }: { initial?: Initial; onDone?: () => void }) {
  const editing = initial?.id != null;
  const money = useMoney();
  const show = (cents: number | null | undefined) => {
    const v = money.convert(cents);
    return v == null ? "" : String(Math.round(v * 100) / 100);
  };
  const [shown] = useState(() => ({ price: show(initial?.price), fee: initial?.fee ? show(initial.fee) : "" }));
  const [f, setF] = useState({
    marketHashName: initial?.marketHashName ?? "",
    type: initial?.type ?? "buy",
    platform: initial?.platform ?? "skinswap",
    price: shown.price,
    fee: shown.fee,
    floatValue: initial?.floatValue != null ? String(initial.floatValue) : "",
    date: initial?.date ? initial.date.slice(0, 10) : today(),
    note: initial?.note ?? "",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  /** Untouched fields keep their exact stored USD value (no conversion rounding drift). */
  const toUsd = (field: "price" | "fee") => {
    if (editing && f[field] === shown[field]) return (initial?.[field] ?? 0) / 100;
    const n = Number.parseFloat(f[field].replace(",", "."));
    return Number.isFinite(n) ? money.toUsd(n) : 0;
  };

  const save = useAction(() =>
    api(editing ? `/transactions/${initial!.id}` : "/transactions", {
      method: editing ? "PATCH" : "POST",
      body: JSON.stringify({
        ...f,
        price: toUsd("price"),
        fee: toUsd("fee"),
        floatValue: f.floatValue.replace(",", ".") || null,
        note: f.note || null,
        itemId: initial?.itemId ?? null,
      }),
    }),
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(undefined, {
      onSuccess: () => {
        if (!editing) setF((s) => ({ ...s, price: "", fee: "", floatValue: "", note: "" }));
        onDone?.();
      },
    });
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Label label="Item (market hash name)" className="col-span-2">
        <Input required value={f.marketHashName} onChange={set("marketHashName")} placeholder="AK-47 | Redline (Field-Tested)" />
      </Label>
      <Label label="Tip">
        <Select value={f.type} onChange={set("type")}>
          {TX_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === "buy" ? "Kupnja" : "Prodaja"}
            </option>
          ))}
        </Select>
      </Label>
      <Label label="Platforma">
        <Select value={f.platform} onChange={set("platform")}>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABELS[p]}
            </option>
          ))}
        </Select>
      </Label>
      <Label label={`Cijena (${money.currency})`}>
        <Input required inputMode="decimal" value={f.price} onChange={set("price")} placeholder="0.00" />
      </Label>
      <Label label={`Fee (${money.currency})`}>
        <Input inputMode="decimal" value={f.fee} onChange={set("fee")} placeholder="0.00" />
      </Label>
      <Label label="Float">
        <Input inputMode="decimal" value={f.floatValue} onChange={set("floatValue")} placeholder="opcionalno" />
      </Label>
      <Label label="Datum">
        <Input required type="date" value={f.date} onChange={set("date")} />
      </Label>
      <Label label="Napomena" className="col-span-2 md:col-span-3">
        <Input value={f.note} onChange={set("note")} />
      </Label>
      <div className="flex items-end gap-2">
        <Button type="submit" variant="primary" disabled={save.isPending || money.rate == null} className="w-full justify-center">
          {editing ? "Spremi" : "Dodaj"}
        </Button>
        {onDone && editing && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Odustani
          </Button>
        )}
      </div>
      <div className="col-span-full">
        <ErrorText error={save.error} />
      </div>
    </form>
  );
}
