import { linkTransactions, toRow, transactionInput } from "@inv/core";
import { PLATFORMS, transactions } from "@inv/db";
import { desc, eq } from "drizzle-orm";
import { db, handler } from "@/lib/server";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const platform = new URL(req.url).searchParams.get("platform");
  const valid = (PLATFORMS as readonly string[]).includes(platform ?? "");
  return db()
    .select()
    .from(transactions)
    .where(valid ? eq(transactions.platform, platform as (typeof PLATFORMS)[number]) : undefined)
    .orderBy(desc(transactions.date));
});

export const POST = handler(async (req: Request) => {
  const input = transactionInput.parse(await req.json());
  const [row] = await db().insert(transactions).values(toRow(input)).returning();
  if (row!.itemId) return row;
  await linkTransactions(db());
  const [linked] = await db().select().from(transactions).where(eq(transactions.id, row!.id));
  return linked;
});
