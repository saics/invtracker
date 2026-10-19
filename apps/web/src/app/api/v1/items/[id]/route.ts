import { dailySeries, HISTORY_DAYS } from "@inv/core";
import { itemQuotes, items, PRICE_SOURCES, transactions } from "@inv/db";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, handler } from "@/lib/server";

export const dynamic = "force-dynamic";

export const GET = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const id = Number((await ctx.params).id);
  const [item] = await db().select().from(items).where(eq(items.id, id));
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000);
  const [txs, [quote], ...series] = await Promise.all([
    db().select().from(transactions).where(eq(transactions.itemId, id)).orderBy(desc(transactions.date)),
    db().select().from(itemQuotes).where(eq(itemQuotes.itemId, id)),
    ...PRICE_SOURCES.map((s) => dailySeries(db(), s, since, [item.marketHashName])),
  ]);
  const history = Object.fromEntries(PRICE_SOURCES.map((s, i) => [s, series[i]!.get(item.marketHashName) ?? []]));
  return { item, transactions: txs, history, quote: quote ?? null };
});
