"use client";

import { PLATFORMS, TX_TYPES } from "@inv/db/schema";
import { useState, type FormEvent } from "react";
import { api, useAction, type TransactionJ } from "@/lib/api";
import { PLATFORM_LABELS } from "@/lib/format";
import { Button, ErrorText, Input, Label, Select } from "./ui";

type Initial = Partial<TransactionJ> & { marketHashName?: string };

const today = () => new Date().toISOString().slice(0, 10);

/** Create (no `initial.id`) or edit a transaction. Prices are entered in USD. */
export function TxForm({ initial, onDone }: { initial?: Initial; onDone?: () => void }) {
  const editing = initial?.id != null;
  const [f, setF] = useState({
    marketHashName: initial?.marketHashName ?? "",
    type: initial?.type ?? "buy",
    platform: initial?.platform ?? "skinswap",
    price: initial?.price != null ? String(initial.price / 100) : "",
    fee: initial?.fee ? String(initial.fee / 100) : "",
    floatValue: initial?.floatValue != null ? String(initial.floatValue) : "",
    date: initial?.date ? initial.date.slice(0, 10) : today(),
    note: initial?.note ?? "",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const save = useAction(() =>
    api(editing ? `/transactions/${initial!.id}` : "/transactions", {
      method: editing ? "PATCH" : "POST",
      body: JSON.stringify({
        ...f,
        price: f.price.replace(",", "."),
        fee: f.fee.replace(",", ".") || 0,
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
      <Label label="Cijena (USD)">
        <Input required inputMode="decimal" value={f.price} onChange={set("price")} placeholder="0.00" />
      </Label>
      <Label label="Fee (USD)">
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
        <Button type="submit" variant="primary" disabled={save.isPending} className="w-full justify-center">
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
