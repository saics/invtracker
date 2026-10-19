"use client";

import { Check, X } from "lucide-react";
import { Card, CardHeader, Empty } from "@/components/ui";
import { useStatus } from "@/lib/api";

function Row({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <li className="flex items-start gap-3 px-5 py-3">
      {ok ? <Check size={16} className="mt-0.5 text-up" /> : <X size={16} className="mt-0.5 text-down" />}
      <div>
        <div className="text-sm">{label}</div>
        <div className="text-xs text-muted">{hint}</div>
      </div>
    </li>
  );
}

export default function SettingsPage() {
  const { data: s } = useStatus();
  if (!s) return <Empty>Učitavam…</Empty>;
  const job = s.priceJob;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Konfiguracija (.env u rootu projekta)" />
        <ul className="divide-y divide-line border-t border-line">
          <Row ok={s.steamIdSet} label="STEAM_ID" hint="SteamID64 (17 znamenki). Inventory mora biti javan." />
          <Row
            ok={s.csfloatKeySet}
            label="CSFLOAT_API_KEY"
            hint="csfloat.com → profil → Developers. Potreban za CSFloat cijene i uvoz trgovina."
          />
        </ul>
        <p className="px-5 py-4 text-xs text-muted">Nakon promjene .env datoteke ponovno pokreni <code>pnpm dev</code>.</p>
      </Card>

      <Card>
        <CardHeader title="Stanje" />
        <ul className="divide-y divide-line border-t border-line text-sm">
          <li className="flex justify-between px-5 py-2.5">
            <span className="text-muted">Itemi u bazi</span>
            {s.itemCount}
          </li>
          <li className="flex justify-between px-5 py-2.5">
            <span className="text-muted">Transakcije</span>
            {s.transactionCount}
          </li>
          <li className="flex justify-between px-5 py-2.5">
            <span className="text-muted">Aktivni izvori cijena</span>
            {s.sources.join(", ")}
          </li>
          <li className="flex justify-between px-5 py-2.5">
            <span className="text-muted">Zadnje osvježavanje cijena</span>
            {job.running ? `u tijeku ${job.done}/${job.total}` : job.finishedAt ? new Date(job.finishedAt).toLocaleString("hr-HR") : "—"}
          </li>
        </ul>
        {!!job.errors.length && (
          <div className="border-t border-line px-5 py-3 text-xs text-down">
            {job.errors.slice(0, 8).map((e) => (
              <div key={e.name} className="truncate">
                {e.name}: {e.error}
              </div>
            ))}
          </div>
        )}
        <p className="px-5 py-4 text-xs text-muted">
          Cijene se osvježavaju automatski dok aplikacija radi (<code>PRICE_CRON</code>, zadano svaka 2 h).
        </p>
      </Card>
    </div>
  );
}
