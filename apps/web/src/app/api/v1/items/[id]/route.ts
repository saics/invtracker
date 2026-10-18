import { priceSeries } from "@inv/core";
import { items, PRICE_PROVIDERS, transactions } from "@inv/db";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, handler } from "@/lib/server";

export const dynamic = "force-dynamic";

export const GET = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const id = Number((await ctx.params).id);
  const [item] = await db().select().from(items).where(eq(items.id, id));
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const since = new Date(Date.now() - 365 * 86_400_000);
  const [txs, ...series] = await Promise.all([
    db().select().from(transactions).where(eq(transactions.itemId, id)).orderBy(desc(transactions.date)),
    ...PRICE_PROVIDERS.map((p) => priceSeries(db(), p, since, item.marketHashName)),
  ]);
  const history = Object.fromEntries(
    PRICE_PROVIDERS.map((p, i) => [p, series[i]!.get(item.marketHashName) ?? []]),
  );
  return { item, transactions: txs, history };
});
