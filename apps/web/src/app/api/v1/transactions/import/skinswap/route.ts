import { importSkinswapTransactions } from "@inv/core";
import { db, handler } from "@/lib/server";

/** Body: JSON pulled from Skinswap's `api/user/transactions` (array or `{ data }` page). */
export const POST = handler(async (req: Request) => importSkinswapTransactions(db(), await req.json()));
