import { linkTransactions, parseTransactionsCsv, toRow } from "@inv/core";
import { transactions } from "@inv/db";
import { db, handler } from "@/lib/server";

/** Body: raw CSV text (see CSV_HEADER in @inv/core). */
export const POST = handler(async (req: Request) => {
  const { rows, errors } = parseTransactionsCsv(await req.text());
  if (rows.length) await db().insert(transactions).values(rows.map(toRow));
  const linked = rows.length ? await linkTransactions(db()) : null;
  return { inserted: rows.length, errors, ...linked };
});
