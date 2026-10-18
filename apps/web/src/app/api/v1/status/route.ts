import { availableProviders, getPriceJob, lastPriceUpdate, nextScheduledRun } from "@inv/core";
import { items, transactions } from "@inv/db";
import { sql } from "drizzle-orm";
import { db, handler } from "@/lib/server";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const [[i], [t], lastPriceAt] = await Promise.all([
    db().select({ n: sql<number>`count(*)` }).from(items),
    db().select({ n: sql<number>`count(*)` }).from(transactions),
    lastPriceUpdate(db()),
  ]);
  return {
    steamIdSet: /^\d{17}$/.test(process.env.STEAM_ID ?? ""),
    csfloatKeySet: !!process.env.CSFLOAT_API_KEY,
    providers: availableProviders(),
    itemCount: i?.n ?? 0,
    transactionCount: t?.n ?? 0,
    priceJob: getPriceJob(),
    lastPriceAt,
    nextPriceAt: nextScheduledRun(),
  };
});
