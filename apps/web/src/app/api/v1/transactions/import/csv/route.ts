import { importTransactionsCsv } from "@inv/core";
import { db, handler } from "@/lib/server";

/** Body: raw CSV text — the CSV_HEADER format from @inv/core or a DMarket trade history export. */
export const POST = handler(async (req: Request) => importTransactionsCsv(db(), await req.text()));
