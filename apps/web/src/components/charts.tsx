"use client";

import type { PriceProvider } from "@inv/db";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtUsd } from "@/lib/format";

const axis = { stroke: "#5b5b66", fontSize: 11, tickLine: false, axisLine: false } as const;
const tooltipStyle = {
  contentStyle: { background: "#17171b", border: "1px solid #232329", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "#8b8b96" },
};
const shortDate = (d: string) => new Date(d).toLocaleDateString("hr-HR", { day: "2-digit", month: "2-digit" });
const compactUsd = (c: number) =>
  c >= 100_000 ? `$${(c / 100_000).toFixed(1)}k` : `$${Math.round(c / 100)}`;

export function PortfolioChart({ data }: { data: { date: string; value: number; invested: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c9cff" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#7c9cff" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#1d1d22" />
        <XAxis dataKey="date" tickFormatter={shortDate} {...axis} minTickGap={32} />
        <YAxis tickFormatter={compactUsd} {...axis} width={52} domain={["auto", "auto"]} />
        <Tooltip {...tooltipStyle} formatter={(v) => fmtUsd(Number(v))} labelFormatter={(l) => shortDate(String(l))} />
        <Area type="monotone" dataKey="invested" name="Uloženo" stroke="#5b5b66" strokeDasharray="4 4" fill="none" strokeWidth={1.5} dot={false} />
        <Area type="monotone" dataKey="value" name="Vrijednost" stroke="#7c9cff" fill="url(#valueFill)" strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export const PROVIDER_COLORS: Record<PriceProvider, string> = {
  csfloat_listing: "#7c9cff",
  csfloat_buyorder: "#3ecf8e",
  steam: "#c7a2ff",
};

export function PriceHistoryChart({
  history,
  labels,
  buyPrice,
}: {
  history: Record<PriceProvider, { price: number; ts: string }[]>;
  labels: Record<PriceProvider, string>;
  buyPrice?: number | null;
}) {
  // Merge provider series onto a shared time axis.
  const rows = new Map<number, Record<string, number>>();
  for (const [p, pts] of Object.entries(history)) {
    for (const pt of pts) {
      const t = new Date(pt.ts).getTime();
      const row = rows.get(t) ?? { t };
      row[p] = pt.price;
      rows.set(t, row);
    }
  }
  const data = [...rows.values()].sort((a, b) => a.t! - b.t!);
  const providers = (Object.keys(history) as PriceProvider[]).filter((p) => history[p].length);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#1d1d22" />
        <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(t) => shortDate(new Date(t).toISOString())} {...axis} minTickGap={32} />
        <YAxis tickFormatter={compactUsd} {...axis} width={52} domain={["auto", "auto"]} />
        <Tooltip {...tooltipStyle} formatter={(v) => fmtUsd(Number(v))} labelFormatter={(t) => new Date(Number(t)).toLocaleString("hr-HR")} />
        {providers.map((p) => (
          <Line key={p} type="monotone" dataKey={p} name={labels[p]} stroke={PROVIDER_COLORS[p]} strokeWidth={2} dot={false} connectNulls />
        ))}
        {buyPrice != null && (
          <Line dataKey={() => buyPrice} name="Kupljeno" stroke="#5b5b66" strokeDasharray="4 4" dot={false} strokeWidth={1} />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Tiny dependency-free SVG sparkline. */
export function Sparkline({ values, width = 80, height = 24 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <span className="text-xs text-muted">—</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * width},${height - 2 - ((v - min) / span) * (height - 4)}`)
    .join(" ");
  const up = values.at(-1)! >= values[0]!;
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={up ? "#3ecf8e" : "#f2555a"} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}
