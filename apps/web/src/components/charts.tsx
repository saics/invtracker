"use client";

import type { PriceProvider } from "@inv/db";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMoney } from "@/lib/money";

const axis = { stroke: "#5b5b66", fontSize: 11, tickLine: false, axisLine: false } as const;
const tooltipStyle = {
  contentStyle: { background: "#17171b", border: "1px solid #232329", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "#8b8b96" },
};
const UP = "#3ecf8e";
const DOWN = "#f2555a";
const shortDate = (d: string) => new Date(d).toLocaleDateString("hr-HR", { day: "2-digit", month: "2-digit" });

export type ChartMode = "value" | "pnl";

export const CHART_RANGES = [
  { value: 7, label: "7D" },
  { value: 30, label: "1M" },
  { value: 90, label: "3M" },
  { value: 365, label: "1G" },
] as const;

/** Fill that is green above 0 and red below, for an area whose data spans [min, max]. */
function SplitFill({ id, min, max }: { id: string; min: number; max: number }) {
  const off = max <= 0 ? 0 : min >= 0 ? 1 : max / (max - min);
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset={0} stopColor={UP} stopOpacity={0.3} />
        <stop offset={off} stopColor={UP} stopOpacity={0.05} />
        <stop offset={off} stopColor={DOWN} stopOpacity={0.05} />
        <stop offset={1} stopColor={DOWN} stopOpacity={0.3} />
      </linearGradient>
    </defs>
  );
}

export function PortfolioChart({
  data,
  mode = "value",
}: {
  data: { date: string; value: number; invested: number; pnl: number }[];
  mode?: ChartMode;
}) {
  const money = useMoney();
  const pnls = data.map((d) => d.pnl);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c9cff" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#7c9cff" stopOpacity={0} />
          </linearGradient>
        </defs>
        {mode === "pnl" && <SplitFill id="pnlFill" min={Math.min(0, ...pnls)} max={Math.max(0, ...pnls)} />}
        <CartesianGrid vertical={false} stroke="#1d1d22" />
        <XAxis dataKey="date" tickFormatter={shortDate} {...axis} minTickGap={32} />
        <YAxis tickFormatter={money.compact} {...axis} width={56} domain={["auto", "auto"]} />
        <Tooltip
          {...tooltipStyle}
          formatter={(v) => (mode === "pnl" ? money.fmtSigned(Number(v)) : money.fmt(Number(v)))}
          labelFormatter={(l) => shortDate(String(l))}
        />
        {mode === "pnl" ? (
          <>
            <ReferenceLine y={0} stroke="#5b5b66" strokeDasharray="4 4" />
            <Area type="monotone" dataKey="pnl" name="P&L (itemi s kupovnom cijenom)" stroke={(pnls.at(-1) ?? 0) >= 0 ? UP : DOWN} fill="url(#pnlFill)" baseValue={0} strokeWidth={2} dot={false} isAnimationActive={false} />
          </>
        ) : (
          <>
            <Area type="monotone" dataKey="invested" name="Uloženo" stroke="#5b5b66" strokeDasharray="4 4" fill="none" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Area type="monotone" dataKey="value" name="Vrijednost" stroke="#7c9cff" fill="url(#valueFill)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </>
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export const PROVIDER_COLORS: Record<PriceProvider, string> = {
  csfloat_listing: "#7c9cff",
  csfloat_buyorder: "#3ecf8e",
  csfloat_sales: "#f5b65b",
  steam: "#c7a2ff",
};

/**
 * Item price history per provider. In "pnl" mode every series is shown as price minus
 * cost, so the zero line is break-even. Buy/sell dates are marked when in range.
 */
export function PriceHistoryChart({
  history,
  labels,
  cost,
  buyAt,
  sellAt,
  mode = "value",
  sinceMs = 0,
}: {
  history: Record<PriceProvider, { price: number; ts: string }[]>;
  labels: Record<PriceProvider, string>;
  cost?: number | null;
  buyAt?: string | null;
  sellAt?: string | null;
  mode?: ChartMode;
  sinceMs?: number;
}) {
  const pnl = mode === "pnl" && cost != null;
  // Merge provider series onto a shared time axis.
  const rows = new Map<number, Record<string, number>>();
  for (const [p, pts] of Object.entries(history)) {
    for (const pt of pts) {
      const t = new Date(pt.ts).getTime();
      if (t < sinceMs) continue;
      const row = rows.get(t) ?? { t };
      row[p] = pnl ? pt.price - cost : pt.price;
      rows.set(t, row);
    }
  }
  const data = [...rows.values()].sort((a, b) => a.t! - b.t!);
  const providers = (Object.keys(history) as PriceProvider[]).filter((p) => data.some((r) => r[p] != null));
  const money = useMoney();
  const first = data[0]?.t ?? 0;
  const marks = [
    { at: buyAt, label: "kupljeno" },
    { at: sellAt, label: "prodano" },
  ].filter((m): m is { at: string; label: string } => !!m.at && new Date(m.at).getTime() >= Math.max(first, sinceMs));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#1d1d22" />
        <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(t) => shortDate(new Date(t).toISOString())} {...axis} minTickGap={32} />
        <YAxis tickFormatter={money.compact} {...axis} width={56} domain={["auto", "auto"]} />
        <Tooltip
          {...tooltipStyle}
          formatter={(v) => (pnl ? money.fmtSigned(Number(v)) : money.fmt(Number(v)))}
          labelFormatter={(t) => new Date(Number(t)).toLocaleString("hr-HR")}
        />
        {pnl ? (
          <ReferenceLine y={0} stroke="#5b5b66" strokeDasharray="4 4" label={{ value: "break-even", position: "insideTopLeft", fill: "#5b5b66", fontSize: 11 }} />
        ) : (
          cost != null && (
            <ReferenceLine y={cost} stroke="#5b5b66" strokeDasharray="4 4" ifOverflow="extendDomain" label={{ value: `kupljeno ${money.fmt(cost)}`, position: "insideTopLeft", fill: "#8b8b96", fontSize: 11 }} />
          )
        )}
        {marks.map((m) => (
          <ReferenceLine key={m.label} x={new Date(m.at).getTime()} stroke="#5b5b66" label={{ value: m.label, position: "top", fill: "#8b8b96", fontSize: 11 }} />
        ))}
        {providers.map((p) => (
          <Line key={p} type="monotone" dataKey={p} name={labels[p]} stroke={PROVIDER_COLORS[p]} strokeWidth={p === "csfloat_sales" ? 1.5 : 2} dot={false} connectNulls isAnimationActive={false} />
        ))}
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
      <polyline points={pts} fill="none" stroke={up ? UP : DOWN} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}
