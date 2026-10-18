import { toRow, transactionInput } from "@inv/core";
import { items, transactions } from "@inv/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, handler } from "@/lib/server";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const id = Number((await ctx.params).id);
  const input = transactionInput.parse(await req.json());
  const [row] = await db().update(transactions).set(toRow(input)).where(eq(transactions.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.type === "sell" && row.itemId) {
    await db().update(items).set({ status: "sold" }).where(eq(items.id, row.itemId));
  }
  return row;
});

export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const id = Number((await ctx.params).id);
  const [row] = await db().delete(transactions).where(eq(transactions.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Undo the "sold" mark so the next inventory sync decides the real status.
  if (row.type === "sell" && row.itemId) {
    await db().update(items).set({ status: "gone" }).where(eq(items.id, row.itemId));
  }
  return { ok: true };
});
