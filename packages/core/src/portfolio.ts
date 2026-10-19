import { items, transactions, type DB, type Item, type Transaction } from "@inv/db";
import { desc } from "drizzle-orm";
import { dayKey } from "./market";
import { dailySeries, latestDaily } from "./prices";

const DAY = 86_400_000;

export type ItemPnl = {
  cost: number | null;
  proceeds: number | null;
  value: number | null;
  /** Realized for sold items, unrealized (value - cost) for held items. */
  pnl: number | null;
  pnlPct: number | null;
};

/** Pure P&L math. Buy fees add to cost, sell fees reduce proceeds. All in cents. */
export function computeItemPnl(
  status: Item["status"],
  buy: Pick<Transaction, "price" | "fee"> | undefined,
  sell: Pick<Transaction, "price" | "fee"> | undefined,
  currentPrice: number | null,
): ItemPnl {
  const cost = buy ? buy.price + buy.fee : null;
  const proceeds = sell ? sell.price - sell.fee : null;
  const value = status === "held" ? currentPrice : null;
  const exit = status === "sold" ? proceeds : value;
  const pnl = cost != null && exit != null ? exit - cost : null;
  const pnlPct = pnl != null && cost ? (pnl / cost) * 100 : null;
  return { cost, proceeds, value, pnl, pnlPct };
}

export type InventoryRow = Item & {
  buy: Transaction | null;
  sell: Transaction | null;
  /** Market value (see market.ts). */
  price: number | null;
  /** Day of that value and which observation it came from. */
  priceDay: string | null;
  priceBasis: string | null;
  change7dPct: number | null;
  spark: number[];
} & ItemPnl;

export async function getInventoryView(db: DB): Promise<InventoryRow[]> {
  const [allItems, allTx, latest, series] = await Promise.all([
    db.select().from(items),
    db.select().from(transactions).orderBy(desc(transactions.date)),
    latestDaily(db, "market"),
    dailySeries(db, "market", new Date(Date.now() - 30 * DAY)),
  ]);
  const buyBy = new Map<number, Transaction>();
  const sellBy = new Map<number, Transaction>();
  for (const t of allTx) {
    if (!t.itemId) continue;
    const m = t.type === "buy" ? buyBy : sellBy;
    if (!m.has(t.itemId)) m.set(t.itemId, t);
  }

  return allItems.map((it) => {
    const buy = buyBy.get(it.id) ?? null;
    const sell = sellBy.get(it.id) ?? null;
    const lp = latest.get(it.marketHashName);
    const points = series.get(it.marketHashName) ?? [];
    const weekAgoDay = dayKey(Date.now() - 7 * DAY);
    const weekAgo = [...points].reverse().find((p) => p.day <= weekAgoDay);
    const change7dPct = lp && weekAgo && weekAgo.price ? ((lp.price - weekAgo.price) / weekAgo.price) * 100 : null;
    return {
      ...it,
      buy,
      sell,
      price: lp?.price ?? null,
      priceDay: lp?.day ?? null,
      priceBasis: lp?.basis ?? null,
      change7dPct,
      spark: points.map((p) => p.price),
      ...computeItemPnl(it.status, buy ?? undefined, sell ?? undefined, lp?.price ?? null),
    };
  });
}

export type PortfolioSummary = {
  heldCount: number;
  pricedCount: number;
  value: number;
  /** Cost basis of held items that have a recorded buy. */
  invested: number;
  unrealized: number;
  realized: number;
  untrackedCostCount: number;
  /** Daily totals; `pnl` = value of items with a known cost minus that cost. */
  history: { date: string; value: number; invested: number; pnl: number }[];
  movers: { id: number; name: string; iconUrl: string | null; change7dPct: number }[];
};

/**
 * When each item was owned, for back-dating the value history. Items already there at the
 * first inventory sync are assumed owned since before tracking started unless a buy says otherwise.
 */
export function ownershipWindow(
  r: Pick<InventoryRow, "status" | "firstSeenAt" | "lastSeenAt" | "buy" | "sell">,
  firstSyncAt: number,
): { from: number; to: number } {
  const seen = r.firstSeenAt.getTime();
  const from = r.buy ? r.buy.date.getTime() : seen - firstSyncAt < DAY ? -Infinity : seen;
  const to = r.status === "held" ? Infinity : (r.sell?.date.getTime() ?? r.lastSeenAt.getTime());
  return { from, to };
}

export async function getPortfolio(
  db: DB,
  days = 90,
  itemIds?: number[],
): Promise<PortfolioSummary> {
  const all = await getInventoryView(db);
  // Placeholder items (no asset id) are back-dated to their transaction, so only synced items count here.
  const firstSyncAt = Math.min(...all.filter((r) => r.assetId).map((r) => r.firstSeenAt.getTime()));
  const ids = itemIds && new Set(itemIds);
  const rows = ids ? all.filter((r) => ids.has(r.id)) : all;
  const held = rows.filter((r) => r.status === "held");
  const sold = rows.filter((r) => r.status === "sold");

  const value = held.reduce((s, r) => s + (r.price ?? 0), 0);
  const withCost = held.filter((r) => r.cost != null);
  const invested = withCost.reduce((s, r) => s + r.cost!, 0);
  const unrealized = withCost.reduce((s, r) => s + (r.pnl ?? 0), 0);
  const realized = sold.reduce((s, r) => s + (r.pnl ?? 0), 0);

  // Daily portfolio value: carry each item's last known price forward.
  const since = new Date(Date.now() - days * DAY);
  const series = await dailySeries(db, "market", since);
  const startDay = Math.floor(since.getTime() / DAY);
  const today = Math.floor(Date.now() / DAY);
  const daily = new Map<string, Map<number, number>>();
  for (const [name, pts] of series) {
    const m = new Map<number, number>();
    for (const p of pts) m.set(Date.parse(`${p.day}T00:00:00Z`) / DAY, p.price);
    daily.set(name, m);
  }
  // Sold/gone items count too while they were owned, so past days are not understated.
  const owned = rows.map((r) => ({ r, ...ownershipWindow(r, firstSyncAt) }));
  const history: PortfolioSummary["history"] = [];
  const last = new Map<string, number>();
  for (let d = startDay; d <= today; d++) {
    for (const [name, m] of daily) if (m.has(d)) last.set(name, m.get(d)!);
    const dayEnd = (d + 1) * DAY;
    let v = 0;
    let inv = 0;
    let pnl = 0;
    let any = false;
    for (const { r, from, to } of owned) {
      if (from >= dayEnd || to < dayEnd) continue;
      const p = last.get(r.marketHashName);
      if (p == null) continue;
      any = true;
      v += p;
      if (r.cost != null) {
        inv += r.cost;
        pnl += p - r.cost;
      }
    }
    if (any) history.push({ date: new Date(d * DAY).toISOString().slice(0, 10), value: v, invested: inv, pnl });
  }

  // One entry per item name (several copies of a case would otherwise fill the list).
  const movers = [...new Map(held.map((r) => [r.marketHashName, r])).values()]
    .filter((r) => r.change7dPct != null)
    .sort((a, b) => Math.abs(b.change7dPct!) - Math.abs(a.change7dPct!))
    .slice(0, 6)
    .map((r) => ({ id: r.id, name: r.marketHashName, iconUrl: r.iconUrl, change7dPct: r.change7dPct! }));

  return {
    heldCount: held.length,
    pricedCount: held.filter((r) => r.price != null).length,
    value,
    invested,
    unrealized,
    realized,
    untrackedCostCount: held.length - withCost.length,
    history,
    movers,
  };
}
